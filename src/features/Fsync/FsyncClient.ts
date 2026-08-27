import { requestUrl } from "@/deps.ts";

/** Resolved vault + server coordinates from the Fsync panel API. */
export interface FsyncVault {
    db: string;
    owner: string;
    vault: string;
    syncUrl: string;
    hasData: boolean;
}

export class FsyncError extends Error {}

/**
 * Thin client for an Fsync panel (accounts, vaults, quotas). The plugin
 * never needs admin powers: it authenticates as the user and asks the
 * panel to resolve a vault ref to a CouchDB database, creating the user's
 * own vault on demand and following shares.
 */
export class FsyncClient {
    constructor(private panelUrl: string) {
        this.panelUrl = panelUrl.replace(/\/+$/, "");
    }

    private basic(username: string, password: string): string {
        return "Basic " + btoa(`${username}:${password}`);
    }

    /**
     * Resolve `ref` ("main" or "owner/main") to its database and the sync
     * server URL. Throws FsyncError with a user-facing message on failure.
     */
    async resolveVault(username: string, password: string, ref: string): Promise<FsyncVault> {
        let resp;
        try {
            resp = await requestUrl({
                url: `${this.panelUrl}/api/vault?ref=${encodeURIComponent(ref)}`,
                method: "GET",
                headers: { Authorization: this.basic(username, password) },
                throw: false,
            });
        } catch (e) {
            throw new FsyncError("Can't reach the server. Check your connection and try again.");
        }
        if (resp.status === 401) throw new FsyncError("Wrong username or password.");
        if (resp.status === 404) {
            throw new FsyncError(`No vault called ${ref} is shared with you.`);
        }
        if (resp.status !== 200) {
            throw new FsyncError("Can't reach the server. Check your connection and try again.");
        }
        const j = resp.json;
        return {
            db: j.db,
            owner: j.owner,
            vault: j.vault,
            syncUrl: (j.sync_url || "").replace(/\/+$/, ""),
            hasData: !!j.has_data,
        };
    }
}
