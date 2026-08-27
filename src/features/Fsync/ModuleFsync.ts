import { AbstractObsidianModule } from "@/modules/AbstractObsidianModule.ts";
import type { LiveSyncCore } from "@/main.ts";
import { LOG_LEVEL_NOTICE, LOG_LEVEL_VERBOSE } from "@vrtmrz/livesync-commonlib/compat/common/logger";
import type { ObsidianLiveSyncSettings } from "@vrtmrz/livesync-commonlib/compat/common/types";
import { createNewVaultSettings, PREFERRED_SETTING_SELF_HOSTED } from "@vrtmrz/livesync-commonlib/settings";
import { upsertRemoteConfigurationInPlace } from "@vrtmrz/livesync-commonlib/remote-configurations";
import { applySettingsWithScheduledInitialisation } from "@/serviceFeatures/setupObsidian/setupActivationLifecycle.ts";
import { FsyncClient, FsyncError } from "./FsyncClient.ts";
import { FsyncConnectModal, FsyncPassphraseModal, type FsyncConnectInput } from "./FsyncConnectModal.ts";

const PASSPHRASE_BYTES = 18;

function generatePassphrase(): string {
    const b = crypto.getRandomValues(new Uint8Array(PASSPHRASE_BYTES));
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Fsync onboarding: one dialog, zero popups. Replaces the engine's setup
 * wizard entirely. The apply path is the engine's own scheduled rebuild/
 * fetch (INIT vs JOIN chosen by data detection, never by the user), so no
 * "which situation are you in" confirmation dialogs ever appear.
 * See docs/PIPELINE.md in the plugin repo for the contract.
 */
export class ModuleFsync extends AbstractObsidianModule {
    _everyOnloadStart(): Promise<boolean> {
        this.addCommand({
            id: "connect",
            name: "Connect",
            callback: () => this.openConnect(),
        });
        return Promise.resolve(true);
    }

    /** Opens the connect dialog. Also the target of the first-run seam. */
    openConnect() {
        const modal = new FsyncConnectModal(this.app, async (input) => {
            await this.handleConnect(modal, input);
        });
        modal.open();
    }

    private async handleConnect(modal: FsyncConnectModal, input: FsyncConnectInput) {
        if (!/^[a-z][a-z0-9_-]{1,30}$/.test(input.username)) {
            throw new FsyncError("Enter your username.");
        }
        if (!input.password) throw new FsyncError("Enter your password.");

        const client = new FsyncClient(input.panelUrl);
        const vault = await client.resolveVault(input.username, input.password, input.vault);

        // JOIN needs the existing passphrase; reveal the field and stop.
        if (vault.hasData && !input.passphrase) {
            modal.requirePassphrase();
            modal.setMessage("This vault already has notes. Enter its passphrase, then Connect.");
            modal.setBusy(false);
            return;
        }
        if (vault.hasData && input.passphrase.length < 8) {
            throw new FsyncError("Wrong passphrase for this vault.");
        }

        const generated = !input.passphrase;
        const passphrase = input.passphrase || generatePassphrase();
        const next = this.buildSettings(vault, input, passphrase);

        // INIT (this device seeds the server) => rebuild; JOIN => fetch.
        const mode = vault.hasData ? "fetch" : "rebuild";
        this._log(`Fsync: ${mode} for ${vault.owner}/${vault.vault}`, LOG_LEVEL_VERBOSE);

        if (generated) {
            // Show the passphrase before the scheduled restart takes over.
            await this.revealPassphrase(passphrase);
        }

        await applySettingsWithScheduledInitialisation(this.core.rebuilder, mode, async () => {
            this.services.setting.clearUsedPassphrase();
            await this.services.setting.applyExternalSettings(next, true);
        });
        this._log("Fsync connected.", LOG_LEVEL_NOTICE);
        modal.close();
    }

    private buildSettings(
        vault: { db: string; syncUrl: string },
        input: FsyncConnectInput,
        passphrase: string
    ): ObsidianLiveSyncSettings {
        const s = createNewVaultSettings();
        Object.assign(s, PREFERRED_SETTING_SELF_HOSTED, {
            couchDB_URI: vault.syncUrl,
            couchDB_USER: input.username,
            couchDB_PASSWORD: input.password,
            couchDB_DBNAME: vault.db,
            additionalSuffixOfDatabaseName: "",
            // Real-time sync, in code — never an imported preset that the
            // wizard could downgrade to "On events" (PIPELINE.md §9).
            liveSync: true,
            syncOnStart: false,
            periodicReplication: false,
            batchSave: false,
            syncOnSave: false,
            syncOnEditorSave: false,
            syncOnFileOpen: false,
            syncAfterMerge: false,
            // E2EE always on.
            encrypt: true,
            passphrase,
            usePathObfuscation: true,
            isConfigured: true,
            // Silence the recurring "set up database size notification"
            // popup; the Fsync server enforces the quota itself. 0 skips
            // both the not-configured prompt and the exceed notice.
            notifyThresholdOfRemoteStorageSize: 0,
        });
        upsertRemoteConfigurationInPlace(s as ObsidianLiveSyncSettings, "couchdb", { activate: true });
        return s as ObsidianLiveSyncSettings;
    }

    private async revealPassphrase(passphrase: string) {
        await new FsyncPassphraseModal(this.app, passphrase).waitForAck();
    }

    override onBindFunction(core: LiveSyncCore, services: typeof core.services): void {
        super.onBindFunction(core, services);
        services.appLifecycle.onInitialise.addHandler(this._everyOnloadStart.bind(this));
    }
}
