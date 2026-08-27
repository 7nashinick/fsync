# Fsync usage pipeline

The contract for the plugin. Every flow is measured against one rule:
**one dialog, zero popups, nothing to configure.** Anything the current
LiveSync + Setup URI journey asks of a user that is not listed here is a
defect Fsync exists to remove.

Reference server: an Fsync panel (accounts, vaults, quotas, sharing) plus
CouchDB. The plugin talks to both:

- Panel API (`/api/vault`): resolve or create a vault by name, follow shares.
- CouchDB: the sync protocol itself, unchanged from the engine.

---

## 1. First device (the user's notes live here)

What they were given: a username and password.

1. Install **Fsync** from Community plugins. Enable it.
2. Fsync opens its dialog on its own:
   - **Username**
   - **Password**
   - Server prefilled (editable under "advanced" for self-hosters)
3. Press **Connect**.

Plugin behind the scenes, silently:
- verifies credentials against the panel API
- resolves vault `main` (creates it server-side if new)
- generates a strong passphrase, turns E2EE on
- configures the engine: live sync on, size warnings off, optional
  features off, sane chunking defaults
- detects the remote is empty, uploads the local vault without asking
- shows ONE thing at the end: the passphrase, once, with "save this,
  every device needs it, it cannot be recovered"

Time target: under 2 minutes including plugin install.
Dialogs shown: 1 (plus the passphrase reveal).
Questions asked: 0.

## 2. Every other device

1. Install Fsync. Enable it.
2. Same dialog: username, password, **passphrase** (the field appears when
   the remote vault already has data).
3. Press **Connect**. Notes download. Live sync from then on.

The "set up new server / join this device" decision does not exist:
remote has data and local vault is empty means join, automatically.
If BOTH sides have data, one guarded question is allowed (keep server
copy / keep this device's copy), stated in exactly those words.

## 3. Joining a vault shared with you

Owner side (on the panel): share vault with a username, hand over the
passphrase personally.

Joiner side: same dialog as flow 2, with vault set to `owner/name`
(a "vault" field appears via "advanced", or is prefilled by an
`obsidian://fsync?...` link from the panel).

## 4. Steady state

- Typing syncs live. No buttons, no timers, no "replicate now".
- The plugin's settings tab shows: connected account, vault, live status,
  storage used against quota (from the panel API). Nothing else on the
  main tab.
- Quota exceeded: the server blocks writes; the plugin surfaces the
  server's message verbatim with a link to the panel. Deletions still sync.

## 5. Recovery

- Lost password: admin resets it on the panel. Plugin asks for the new
  password on next failure, nothing else changes.
- Lost passphrase: unrecoverable by design. The plugin's message says so
  and offers the only honest path: disconnect, keep local files, start a
  fresh vault.
- Server unreachable: work offline, sync resumes when it returns. No
  error popups for transient failures; a status dot is enough.

## 6. Failure modes that must stay impossible

Learned from live testing of the LiveSync journey:

| Failure | Cause in the old flow | Fsync rule |
|---|---|---|
| Typing never syncs | wizard set mode "On events" with no events | live mode is set in code, not imported settings |
| Restart required | replication only opened at startup | open replication right after connect |
| Wrong wizard branch wipes server | "set up new server" offered to joining devices | branch chosen by data detection, not the user |
| Popup fatigue | version notes, size warnings, optional features | all suppressed or answered in code |
| Passphrase lost silently | shown mid-wizard among noise | dedicated reveal step, nothing else on screen |

## 7. Build plan (after this pipeline is agreed)

1. Fork the engine (MIT) into this repo, buildable as-is.
2. Replace its onboarding entry point with the Fsync dialog
   (single seam: the unconfigured-startup hook).
3. Bake the configuration writes from flow 1 and the data-detection
   branch from flow 2.
4. Panel API client (vault resolve, quota display).
5. Strip or silence every dialog in section 6.
6. Rebrand: manifest `fsync`, settings tab, strings.
7. Community directory submission (server field editable, so it is
   useful beyond one host).

## Open decisions

- Passphrase: auto-generated (current pipeline) or user-chosen with a
  strength check?
- Vault field: hidden behind "advanced" or always visible?
- Directory submission timing: after friends dogfood it, or immediately?
