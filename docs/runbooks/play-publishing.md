# Google Play publishing (headless)

Set up 2026-09-15 so a release can be uploaded from this machine instead of by
hand in the Console. Until then Play was the only manual step left in the
pipeline — iOS has been fully headless since 2026-09-13
(`docs/runbooks/ios-app-store-submission.md`).

## Identity

| Thing | Value |
|-------|-------|
| Service account | `play-publisher@gen-lang-client-0895796477.iam.gserviceaccount.com` |
| GCP project | `gen-lang-client-0895796477` (`pedalgoogle1`) — already linked to Play Console |
| JSON key | `C:\dev\adminInfo\google_play_publisher\play-publisher-gen-lang-client-0895796477.json` — **OUTSIDE the repo, never committed** |
| Env override | `PLAY_SERVICE_ACCOUNT_KEY` (the script falls back to the path above) |
| Package | `com.defensivepedal.mobile` |

⚠️ **Play permissions do NOT come from GCP IAM.** The service account needs no
project roles at all; access is granted in **Play Console → Users and
permissions**. A correct key with no Console grant authenticates fine and then
returns `403 PERMISSION_DENIED` on every call — that split is the useful
diagnostic, not a broken key.

The project was already linked (`androidpublisher.googleapis.com` was enabled and
a `revenuecat-play` service account existed), so no API-access linking was needed.

## Publishing

```bash
node scripts/play-publish.mjs \
  --aab apkreleases/DefensivePedal-Production-v<version>.aab \
  --notes <dir-of-locale-txt-files> \
  [--track production] [--status draft] [--dry-run]
```

- **`--status` defaults to `draft`** — the release is created but NOT rolled out,
  so a human still decides when users get it. `completed` means ship to 100% now,
  and **a Play rollout has no undo**. Use the staged cadence in `.claude/CLAUDE.md`
  § Play Store Release (5% → 20% → 50% → 100% with the vitals gate) rather than
  jumping to `completed`.
- **`--dry-run` makes no API call at all** — it prints what would happen and
  stops before opening an edit. A guard in the script keeps every write inside
  the `proceed` gate; there is a check for that in the commit that added it.
- **Release notes are one `<locale>.txt` per file** (`en-US.txt`, `ro-RO.txt`,
  `es-ES.txt`). The script **refuses anything over 500 characters** — Play's cap
  per locale. The App Store allows 4000 and only `en-US`, so the two stores need
  different text; do not paste iOS notes into Play.
- On any failure the edit is **discarded**, so a half-finished run publishes
  nothing.
- After committing, the script **re-reads the track from a fresh edit** and
  prints what is actually live. Never trust the write's own response.

## Verifying access

```bash
node scripts/play-publish.mjs --aab <any-aab> --dry-run   # no network write
```
For an auth-only check, the two-step probe is: mint a token from the key (proves
the key), then `POST /edits` (proves the Console grant). `403` on the second with
a successful first means the grant is missing or was removed.

## If the key is ever leaked

Delete it and mint a new one — the key, not the account:
```bash
gcloud iam service-accounts keys list --iam-account play-publisher@gen-lang-client-0895796477.iam.gserviceaccount.com --project gen-lang-client-0895796477
gcloud iam service-accounts keys delete <KEY_ID> --iam-account <sa> --project <proj>
gcloud iam service-accounts keys create <path> --iam-account <sa> --project <proj>
```
A leaked key can publish to the store, so treat it like the upload keystore.

## Not covered here

Play Console-only actions with no API: the **Data Safety form**, store listing
copy, and granting/revoking the service account itself. The Data Safety hard rule
still applies — update the form only **after** the matching AAB is live.
