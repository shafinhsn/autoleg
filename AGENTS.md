# AGENTS.md

## Cursor Cloud specific instructions

### Product

**LegislativeSync** — React 18 + Vite 6 SPA for NY State legislative office bill tracking. All data, auth, and serverless functions live on **Base44** (no local database or API server in this repo).

### Services

| Service | Required | Notes |
|---------|----------|--------|
| Vite dev server (`npm run dev`) | Yes | Serves the UI; default port 5173 |
| Base44 hosted backend | Yes | Configure via `.env.local` (see below) |
| NY Senate Open Legislation API | No | Used for bill sync when configured in office settings |
| Docker / local Postgres | No | Not used |

### Environment variables

Create `.env.local` in the repo root (gitignored). Use the app id from `base44/.app.jsonc` and the standard Base44 URL pattern:

```bash
VITE_BASE44_APP_ID=<id from base44/.app.jsonc>
VITE_BASE44_APP_BASE_URL=https://<same-id>.base44.app
```

Optional: `VITE_BASE44_FUNCTIONS_VERSION`.

Do **not** use the placeholder values in `README.md` (`cbef744a8545c389ef439ea6` / `my-to-do-list-81bfaad7.base44.app`) — they point at a different sample app and return 404.

After changing `.env.local`, restart `npm run dev`. On startup, Vite should log `[base44] Proxy enabled: /api -> https://...`.

### Commands

See `package.json` and `README.md`:

- `npm install` — dependencies
- `npm run dev` — local development (use `--host 0.0.0.0` in Cloud Agent VMs)
- `npm run build` / `npm run preview` — production build and static preview
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run typecheck` — `tsc` (many pre-existing JSX typing errors; build still succeeds)

### Auth and end-to-end testing

The app requires a Base44 login for full flows. Unauthenticated API calls to public settings typically return `403` with `reason: auth_required`. Use a Base44 account with access to this app, or log in via the Desktop pane and complete OAuth when redirected from `http://127.0.0.1:5173/`.

`base44` client is created with `requiresAuth: false` in `src/api/base44Client.js`, but `AuthContext` still enforces login when the backend requires it.

### Gotchas

- **Node**: No version pinned; Node 18+ recommended (Vite 6 / current ESLint).
- **Lint**: The repo currently has unused-import ESLint errors on several files; `npm run lint` exits non-zero until fixed.
- **Typecheck**: `npm run typecheck` reports many errors in `.jsx` UI files; `npm run build` does not depend on a clean typecheck.
- **Routes not in sidebar**: `/tasks`, `/chat` exist; Calendar page is not wired in `App.jsx`.
