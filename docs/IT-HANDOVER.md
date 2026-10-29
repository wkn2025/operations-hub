# IT handover

What IT needs to set up, confirm or approve before Operations Hub can go live. The application itself is complete for the demo; the items below depend on the company's tenant, network and policies and **could not be tested by the developer**. Technical details: [DEPLOYMENT.md](DEPLOYMENT.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Summary of decisions and approvals needed

| # | Item | Needed from IT | Status |
|---|---|---|---|
| 1 | Entra ID app registration (sign-in) | create it, provide tenant ID, client ID, client secret | not started |
| 2 | Which ID-token claim identifies a user | confirm (see below) | **open question** |
| 3 | Who may sign in | assignment required + group, or whole tenant | decision |
| 4 | Admins and editors | initial admin email(s); how editors are granted | decision |
| 5 | Hosting | VM/container host, OS, Node 22 or Docker | decision |
| 6 | DNS + TLS certificate + reverse proxy | hostname, certificate, proxy config | not started |
| 7 | Backups | schedule, retention, off-server storage, restore test | decision |
| 8 | Dependency upgrades | approve/plan drizzle-orm and zod upgrades (advisories) | decision |
| 9 | Data classification | confirm the hub must not hold patient data (see below) | decision |

## 1. Entra ID (OIDC) setup

Sign-in uses OpenID Connect Authorization Code flow with PKCE, state and nonce (`openid-client`). Implemented and unit-tested against a mocked identity provider only.

1. **Entra admin center -> App registrations -> New registration.**
   - Name: `Operations Hub`.
   - Supported account types: **Accounts in this organizational directory only** (single tenant).
   - Redirect URI: platform **Web**, `https://<hub-hostname>/api/auth/callback`.
2. **Certificates & secrets -> New client secret.** Note the value and its expiry date; plan rotation before it expires (expiry = nobody can sign in).
3. **Token configuration -> Add optional claim -> ID token -> `email`.** (The app asks for scopes `openid profile email`.)
4. **API permissions:** Microsoft Graph delegated `openid`, `profile`, `email` (normally present by default). No Graph API calls are made.
5. **Enterprise applications -> Operations Hub -> Properties:** set **Assignment required = Yes** and assign the operations staff group, if only that team may sign in (recommended).
6. Give the server these settings:

```
NODE_ENV=production
AUTH_MODE=oidc
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<application (client) id>
OIDC_CLIENT_SECRET=<secret value>
OIDC_REDIRECT_URI=https://<hub-hostname>/api/auth/callback
SESSION_SECRET=<64 random hex characters>
ADMIN_BOOTSTRAP_EMAILS=<first admin's email>
```

7. **Test:** open `https://<hub-hostname>/`, choose "Sign in with Microsoft", sign in with the bootstrap admin. Expected: back on the home page as admin. Then sign in with a normal user: viewer.

Sign-out ends the Operations Hub session only; it does not sign the user out of Microsoft 365.

## 2. Open question: which claim is the user's identity

The app identifies a person by email address (roles, the editor allowlist and the bootstrap admin list are all keyed by email). From the ID token it uses, in order: `email`; else `preferred_username`; else `upn`; only if the value contains `@`. A token with `email_verified: false` is rejected.

**IT must confirm** that, in this tenant, the `email` claim (or the UPN, if `email` is empty for some users) is the authoritative, admin-controlled address and cannot be set by users. In Entra, `preferred_username` is not guaranteed to be a verified mailbox. If the UPN and the primary SMTP address differ for staff, decide which one the allowlist and admin lists should use. If a different claim (e.g. the immutable `oid`) is required, that is a code change: tell the developer.

## 3-4. Who gets which role

Roles are decided inside the app, not from Entra groups:

- **Admin:** emails listed in `ADMIN_BOOTSTRAP_EMAILS` (always admin, cannot be demoted in the UI), plus anyone an admin promotes in **Admin -> Users**.
- **Editor:** emails on **Admin -> Editor allowlist**, or anyone an admin sets to editor.
- **Viewer:** everyone else who can sign in.
- Role changes and deactivation take effect on the user's next request. Admin actions are recorded in **Admin -> Audit log**.

**SSO group -> role mapping is not implemented.** If IT prefers Entra security groups (e.g. `OpsHub-Editors`) to drive roles, it needs a small code change: emit the `groups` (or app roles) claim and map it at sign-in. Decide whether the allowlist is good enough for ~30 users or groups are required.

## 5-6. Hosting, TLS, network

- One process, one data folder; ~30 users need very little: 1 vCPU, 1-2 GB RAM, disk for uploads (each file at most 15 MB) and backups.
- Run as a non-root service account; the data folder must be writable by it and by nobody else. The Docker image does this (user `node`, volume `/data`); **the image has not been built yet**.
- HTTPS is mandatory (cookies are `Secure`). Terminate TLS at a reverse proxy and allow uploads of at least 16 MB through it. Only the proxy should reach the Node port.
- The app sends a strict Content-Security-Policy, `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: same-origin`. Add HSTS at the proxy.
- Outbound network: only to `login.microsoftonline.com` (OIDC discovery and token exchange). No other external calls; fonts and scripts are self-hosted.

## 7. Backups

- `npm run backup` (or `docker exec <container> sh -c 'cd /app && npm run backup'`) takes a consistent hot backup: `app.db` + `uploads.zip` in a timestamped folder. Restore procedure (tested): DEPLOYMENT.md -> Restore.
- **IT decides:** schedule (suggested daily), retention (suggested 30 days), off-server/encrypted storage, and who runs a restore test (suggested quarterly). The script does not rotate or ship backups.
- A content export (JSON + Markdown) is available to admins via **Admin -> Articles -> Export all content**; it is a readable copy, not a restore format.

## 8. Security items for approval

- `npm audit` reports advisories that need major-version upgrades (details and reasoning in DEPLOYMENT.md). Two affect runtime code: `drizzle-orm` (fix: 0.45.2+; recommended before go-live) and `zod` (fix: v4). The rest affect build/test tooling or the browser editor (Tiptap v2, fix only in v3).
- External image URLs inside articles are blocked by the CSP by design; staff must upload screenshots.
- Uploaded files are type-checked by content, limited to common office/image formats, and served with download-safe headers. There is **no virus scanning**; if policy requires it, scan `DATA_DIR/uploads` or add a scanner at upload time.

## 9. Data classification

The hub is meant for operational procedures, client terms and system documentation. All seeded content is fictional (`DEMO`). Before go-live, delete the demo content (start from an empty `DATA_DIR`, do **not** run `npm run seed` in production; it refuses unless forced) and confirm with the data-protection officer that no patient or claim-level personal data will be stored, or classify the system accordingly.
