import { App, Modal } from "@/deps.ts";

export interface FsyncConnectInput {
    username: string;
    password: string;
    vault: string;
    panelUrl: string;
    passphrase: string; // empty = let the plugin generate one (init)
}

const DEFAULT_PANEL = "https://notes.foldoy.com";

/**
 * The single window Fsync opens on its own. Fields per docs/PIPELINE.md:
 * username + password always; passphrase only when joining a vault that
 * already has data; server URL + vault under a closed "Advanced" fold.
 * All feedback stays inline; the dialog never closes on failure.
 */
export class FsyncConnectModal extends Modal {
    private onSubmit: (v: FsyncConnectInput) => Promise<void>;
    private msgEl!: HTMLElement;
    private ppRow!: HTMLElement;
    private submitBtn!: HTMLButtonElement;

    constructor(app: App, onSubmit: (v: FsyncConnectInput) => Promise<void>) {
        super(app);
        this.onSubmit = onSubmit;
    }

    override onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText("Connect to Fsync");

        const user = this.field(contentEl, "Username", "text");
        const pass = this.field(contentEl, "Password", "password");

        this.ppRow = contentEl.createDiv();
        this.ppRow.style.display = "none";
        const pp = this.field(this.ppRow, "Passphrase", "password");
        this.ppRow.createEl("div", {
            text: "This vault already has notes. Enter its passphrase (the owner's, for a shared vault).",
            cls: "setting-item-description",
        });

        const adv = contentEl.createEl("details");
        adv.createEl("summary", { text: "Advanced" });
        const server = this.field(adv, "Server", "text");
        server.value = DEFAULT_PANEL;
        const vault = this.field(adv, "Vault", "text");
        vault.value = "main";
        adv.createEl("div", {
            text: "Vault: your own by name, or owner/name for one shared with you.",
            cls: "setting-item-description",
        });

        this.msgEl = contentEl.createEl("div", { cls: "setting-item-description" });
        this.msgEl.style.marginTop = "10px";

        const btnRow = contentEl.createDiv();
        btnRow.style.marginTop = "14px";
        this.submitBtn = btnRow.createEl("button", { text: "Connect", cls: "mod-cta" });

        // Reveal the passphrase field once we know the target vault has data.
        const refreshJoinState = async () => {
            // Purely presentational; the authoritative check happens on submit.
        };
        vault.addEventListener("change", () => void refreshJoinState());

        this.submitBtn.addEventListener("click", async () => {
            this.setBusy(true);
            this.setMessage("");
            try {
                await this.onSubmit({
                    username: user.value.trim().toLowerCase(),
                    password: pass.value,
                    vault: (vault.value || "main").trim().toLowerCase(),
                    panelUrl: (server.value || DEFAULT_PANEL).trim(),
                    passphrase: pp.value,
                });
            } catch (e) {
                this.setMessage((e as Error).message || String(e), true);
                this.setBusy(false);
            }
        });
        user.focus();
    }

    /** Called by the module when a resolve says the vault already has data. */
    requirePassphrase() {
        this.ppRow.style.display = "";
    }

    setMessage(text: string, isError = false) {
        this.msgEl.setText(text);
        this.msgEl.style.color = isError ? "var(--text-error)" : "var(--text-muted)";
    }

    setBusy(busy: boolean) {
        this.submitBtn.disabled = busy;
        this.submitBtn.setText(busy ? "Connecting" : "Connect");
    }

    private field(parent: HTMLElement, label: string, type: string): HTMLInputElement {
        const row = parent.createDiv({ cls: "setting-item" });
        row.style.display = "block";
        row.createEl("label", { text: label }).style.display = "block";
        const input = row.createEl("input", { type });
        input.style.width = "100%";
        return input;
    }

    override onClose() {
        this.contentEl.empty();
    }
}

/**
 * Shows a freshly generated passphrase once, and resolves only after the
 * user acknowledges. Blocks the connect flow so the value is seen before
 * the scheduled restart takes over.
 */
export class FsyncPassphraseModal extends Modal {
    private done: () => void = () => {};
    constructor(app: App, private passphrase: string) {
        super(app);
    }
    waitForAck(): Promise<void> {
        return new Promise((resolve) => {
            this.done = resolve;
            this.open();
        });
    }
    override onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText("Save your passphrase");
        contentEl.createEl("p", {
            text: "This is your encryption passphrase. Every device needs it, and it cannot be recovered.",
        });
        const box = contentEl.createEl("input", { type: "text" });
        box.value = this.passphrase;
        box.readOnly = true;
        box.style.width = "100%";
        box.style.fontFamily = "var(--font-monospace)";
        box.addEventListener("click", () => box.select());
        const btn = contentEl.createEl("button", { text: "I saved it", cls: "mod-cta" });
        btn.style.marginTop = "14px";
        btn.addEventListener("click", () => this.close());
    }
    override onClose() {
        this.contentEl.empty();
        this.done();
    }
}
