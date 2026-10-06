# Real-time GitHub sync

Zuup Code can link a project to a GitHub repository (and branch, and optional sub-folder), push your
edits as you type and pull changes made elsewhere, with conflicts surfaced instead of overwritten.

This document covers the library in `src/lib/github/` and the serverless endpoints that make
"Sign in with GitHub" work. The React UI is built on top of the public API described below.

- Browser calls `api.github.com` directly with the user's token (GitHub's REST API allows CORS).
- Only the OAuth `code -> token` exchange needs a server secret, so that one step runs in
  `functions/api/github/*` (Cloudflare Pages) or `api/github/*` (Vercel).
- Without an OAuth App configured, users can still paste a personal access token (PAT).

## File map

| Path | Purpose |
| --- | --- |
| `src/lib/github/auth.ts` | Token storage, validation, OAuth redirect hand-off, PAT sign-in, feature detection |
| `src/lib/github/client.ts` | REST client: typed errors, ETags, rate limits, Git Data API commits |
| `src/lib/github/sync.ts` | Pure three-way sync engine (classification, plans, conflicts, commit messages) |
| `src/lib/github/controller.ts` | `SyncController`: debounced auto-push, polling, state machine, events |
| `src/lib/github/link.ts` | `GitHubLink` model and localStorage persistence |
| `src/lib/github/importRepo.ts` | Download a repo or sub-folder as local files plus base snapshot |
| `src/lib/github/paths.ts` | Path normalisation, sub-folder mapping, ignore rules, caps |
| `src/lib/github/oauthServer.ts` | Platform-neutral OAuth handlers (server only; not exported from `index.ts`) |
| `src/lib/github/nodeAdapter.ts` | Adapter so the same handlers run as Vercel (Node) functions |
| `functions/api/github/{login,callback,config}.ts` | Cloudflare Pages Functions entry points |
| `api/github/{login,callback,config}.ts` | Vercel entry points (import with `.js` extensions: they run as native Node ESM, so `oauthServer.ts` / `nodeAdapter.ts` must stay free of relative imports) |
| `public/_routes.json` | Cloudflare Pages: only `/api/*` invokes Functions; everything else is served statically |
| `src/lib/github/testing/fakeGitHub.ts` | In-memory GitHub API used by the tests (never imported by app code) |

Import from `@/lib/github` (the barrel in `index.ts`) in UI code.

## Setting up the GitHub OAuth App

1. GitHub -> Settings -> Developer settings -> OAuth Apps -> New OAuth App
   (for an organisation: the organisation's Settings -> Developer settings).
2. Application name: `Zuup Code`. Homepage URL: `https://code.zuup.dev`.
3. Authorization callback URL, exactly:
   - Production: `https://code.zuup.dev/api/github/callback`
   - Local development: `http://localhost:8080/api/github/callback`
   An OAuth App allows one callback URL, so create a second app (for example "Zuup Code (dev)")
   with the localhost URL and use its credentials only in local environment variables.
4. Generate a client secret. Copy the client id and secret into the environment (below).

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | yes | OAuth App client id |
| `GITHUB_CLIENT_SECRET` | yes | OAuth App client secret (server only, never sent to the browser) |
| `GITHUB_OAUTH_REDIRECT_URI` | no | Overrides the callback URL. Defaults to `<request origin>/api/github/callback`. Must match the OAuth App exactly. |

- **Cloudflare Pages**: project -> Settings -> Environment variables (add as *encrypted* secrets for
  Production and Preview), then redeploy. For local `wrangler pages dev`, put them in `.dev.vars`.
- **Vercel**: project -> Settings -> Environment Variables, then redeploy.
- Plain `vite dev` does not run the serverless functions. Use `wrangler pages dev` or `vercel dev` to
  exercise OAuth locally; otherwise the UI should fall back to the PAT form (`/api/github/config`
  reports `oauthConfigured: false`).

If the variables are missing, `/api/github/login` and `/api/github/callback` answer
`501 {"error":"github_oauth_not_configured"}` and `/api/github/config` answers
`{"oauthConfigured":false}`.

### Scopes and why

OAuth Apps cannot be limited to one repository, so the scope is the narrowest that works:

| Scope | Grants | Use when |
| --- | --- | --- |
| `public_repo` (default) | Read/write on public repositories | The user syncs public repos |
| `repo` | Read/write on public and private repositories | The user syncs private repos |

Anything else is rejected with `400 invalid_scope`. Users who want tighter control can paste a
fine-grained PAT limited to one repository with "Contents: Read and write".

## Endpoints

All three are `GET`, never cached (`Cache-Control: no-store`).

- `GET /api/github/config` -> `{ "oauthConfigured": boolean }`. Nothing else is revealed.
- `GET /api/github/login?scope=public_repo|repo&return=/editor?project=...`
  Validates the scope, creates a 24-byte random `state` (`crypto.getRandomValues`), stores it with the
  validated return path in an `HttpOnly; SameSite=Lax; Path=/api/github; Max-Age=600` cookie
  (`Secure` on https), and redirects to GitHub's authorize URL.
- `GET /api/github/callback?code=...&state=...`
  Verifies `state` against the cookie in constant time, clears the cookie, exchanges the code at
  `https://github.com/login/oauth/access_token`, then redirects to
  `<return>#gh_token=<token>&gh_scope=<scopes>`. Any failure redirects to `<return>#gh_error=<code>`
  where code is one of `state_mismatch`, `access_denied`, `invalid_code`, `redirect_uri_mismatch`,
  `not_configured`, `exchange_failed`, `oauth_failed`.

The return path must be a same-origin relative path: it must start with a single `/` and may not
contain `//` at the start, backslashes, whitespace/control characters, `#`, an encoded `//` or `\`, or
a scheme. Anything else becomes `/editor`.

## Security model

- The token is kept in `localStorage` under `zuup_github_auth_v1`
  (`{ token, scopes, login, avatar, kind, savedAt }`). Any script on the origin can read it, so the
  site must stay free of untrusted third-party scripts. Signing out removes it. The user can also
  revoke it at GitHub -> Settings -> Applications.
- It is sent only to `api.github.com` (the client refuses to follow a `Link` header to another host)
  and to this site's own `/api/github/*`. It is never logged.
- The OAuth hand-off puts the token in the URL **fragment**, which browsers do not send to servers, so
  it does not appear in server logs or `Referer` headers. The UI must call `completeOAuthRedirect()`
  (or `parseOAuthFragment()` + `scrubOAuthFragment()`) on landing, which removes it from the address bar
  and history immediately.
- The `state` cookie binds the callback to the browser that started the login (CSRF protection); it is
  single-use (cleared on callback) and expires after 10 minutes.
- The client secret exists only in server environment variables.

## Rate limits

- Every request carries the token, so the authenticated limit (5,000/hour) applies.
- Polling uses `GET /git/ref/heads/<branch>` with `If-None-Match`. A `304 Not Modified` does not count
  against the limit, so an idle project costs nothing. A changed branch costs 1 request for the ref,
  1 for the commit, 1 for the recursive tree and 1 per changed file.
- Polling runs every 20 s only while the tab is visible, immediately on window focus and when the browser
  comes back online (focus events are throttled to one check per 2 s).
- Writes are serialized and spaced at least 1 s apart. A push is 3 requests plus one per
  changed file (blobs); beyond 10 changed files, file content is sent inline in chunked tree requests so
  a large push stays a handful of requests.
- Primary limit (`x-ratelimit-remaining: 0`) and secondary limits (`Retry-After`): short waits (up to
  30 s) are slept on inside the client with exponential backoff and jitter; longer ones become a
  `GitHubRateLimitError` and the controller sets status `error` with `nextAttemptAt` and sends no
  requests until then.
- Network errors move the controller to `offline` and retry with exponential backoff (20 s doubling,
  capped at 5 min, with jitter); the `online` event retries at once. 401 -> `unauthenticated` and all
  traffic stops until `resume()`.

## How syncing works

The engine keeps a **base snapshot**: the remote tree (`path -> git blob sha`) as of the last sync. Local
blob shas are computed with a pure-JS SHA-1 identical to git's (`sha1("blob <bytes>\0" + content)`), so
local vs remote comparison needs no downloads. For each path the three shas (local, base, remote) decide:

| local vs base | remote vs base | Result |
| --- | --- | --- |
| same | same | unchanged |
| changed | same | local change: push (add / modify / delete) |
| same | changed | remote change: pull (add / modify / delete) |
| changed | changed, identical | converged: only the base is updated |
| changed | changed, different | **conflict** (modify/modify, add/add, modify/delete, delete/modify) |

A rename is a delete plus an add. Nothing is ever dropped silently: a conflicting path is left exactly
as the user has it locally, the remote is not touched, and `conflict` events carry
`{ path, kind, local, remote, base }` so the UI can show a diff. `resolveConflict(path, 'local' | 'remote' | { content })`
resolves it: keeping local turns it into a normal push, taking remote rewrites the file, merged content
is pushed. Remote changes to other files keep flowing while a conflict is open.

Pushes are single atomic commits via the Git Data API (blobs -> tree with `base_tree` -> commit ->
`PATCH ref` with `force: false`). If the branch moved meanwhile (non-fast-forward), the controller
re-reads the branch, re-plans against the new head (turning overlapping edits into conflicts) and retries
a few times. A project's first sync with an empty base compares files by content, so identical files
converge and differing ones become conflicts. Use `importRepo()` first to start from a clean base.

### Mass-delete guard

A push that would delete at least 5 synced files **and** at least half of the base snapshot, or every
file in the base snapshot, is almost always a project that failed to load (cleared browser storage, a
half-loaded cloud project, a reload after creating one file in an empty project) rather than a clean-up.
`detectMassDelete(push, base)` (in `sync.ts`) decides; the thresholds are `MASS_DELETE_MIN_FILES` and
`MASS_DELETE_MIN_RATIO`. Such a push is not sent (nothing in it, including additions, is committed):
the status becomes `held`, `state.heldDeletes` holds `{ paths, baseCount }` and a `deletes-held` event
fires once per distinct set of paths. Pulls keep working while held. The user then chooses:

- `confirmDeletes()` pushes it after all (only those paths are allowed; a later mass deletion is held again).
- `restoreDeleted()` downloads the held files from the repository into the project (a `remote-applied`
  event with `added` changes); files created locally are kept, and the next push sends them.
- Bringing the files back in the editor also releases the hold on the next cycle.

### Ignore rules and limits

Skipped on both sides (reported as `skipped` in the state): `.git/`, `node_modules/`, `__pycache__/`,
`.DS_Store`, files with binary extensions (images, archives, media, fonts, office files, executables,
`.pyc`, `.wasm`...), files over 1 MiB, files containing NUL bytes or invalid UTF-8, symlinks and
submodules. A hard cap of 500 files applies (`too_many_files` error). A skipped remote file is never
overwritten by a local file of the same name.

## Usage

```ts
import {
  SyncController,
  completeOAuthRedirect,
  createGitHubClient,
  createLink,
  detectOAuthConfigured,
  getAuth,
  getLink,
  importRepo,
  linkFromImport,
  saveLink,
  signInWithToken,
  startOAuth,
} from "@/lib/github";

// 1. Sign in. On the page the OAuth redirect lands on (e.g. in the editor's mount effect):
const completion = await completeOAuthRedirect(); // null when the URL has no OAuth result
if (completion?.type === "error") toast.error(completion.message);

if (!getAuth()) {
  if (await detectOAuthConfigured()) startOAuth({ scope: "public_repo" }); // full-page redirect
  else await signInWithToken(pastedToken); // PAT fallback; throws GitHubAuthError if invalid
}

// 2. Pick a repository and start from a clean base.
const client = createGitHubClient(); // reads the saved token on every request
const { repos } = await client.listRepos({ query: "demo" });
const imported = await importRepo(client, {
  owner: "octo", repo: "demo", branch: "main", subdir: "",
  onProgress: ({ phase, done, total }) => setProgress(done / total),
});
editor.replaceFiles(imported.files); // [{ path, content }]
saveLink(linkFromImport(projectKey, { owner: "octo", repo: "demo", branch: "main" }, imported));

// 3. Run the controller for the open project.
const link = getLink(projectKey)!;
// getFiles is read right before every plan, so edits not yet passed to setFiles are never overwritten.
const controller = new SyncController({ link, client, getFiles: currentFiles }); // [{ path, content }]
controller.on((event) => {
  switch (event.type) {
    case "remote-applied": editor.applyRemote(event.files, event.changes); break; // toast changed paths
    case "conflict": openConflictDialog(event.conflicts); break;
    case "pushed": toast.success(`Pushed ${event.paths.length} file(s)`); break;
    case "deletes-held": askUser(event.paths); break; // then confirmDeletes() or restoreDeleted()
    case "error": if (event.code !== "network") toast.error(event.message); break;
    case "state": setStatus(event.state.status); break; // idle | pending | pushing | pulling | synced | ...
  }
});
controller.start();

// 4. On every edit, and when the user clicks things:
editor.onChange(() => controller.setFiles(currentFiles()));
controller.pushNow(); controller.pullNow(); controller.syncNow();
controller.pause(); controller.resume(); // resume() also retries after sign-in
controller.resolveConflict("main.py", "local"); // or "remote" or { content }
controller.dispose(); // on unmount or when switching projects
```

`SyncController` also exposes `getState()` and `subscribe()` so it works with `useSyncExternalStore`:

```ts
const state = useSyncExternalStore(controller.subscribe.bind(controller), controller.getState.bind(controller));
```

Integration rules for the UI layer:

- Map editor tabs to `{ path, content }` (path relative to the synced root, e.g. `src/main.py`).
- Pass `getFiles` (a function returning the editor's *live* files, e.g. from a ref). The controller calls
  it right before planning each sync (and before resolving a held deletion), so a keystroke that has not
  reached `setFiles` yet is seen as a local edit and becomes a conflict instead of being overwritten by a
  pull. Still call `setFiles` on every edit: that is what schedules the debounced push.
- Apply `remote-applied` to the editor synchronously, so `getFiles` / `setFiles` return the new content
  from then on. The controller already adopted the remote content internally, so a stale `setFiles`
  call that still holds the old content would look like a local edit and push the old version back.
- Create the controller once per project and `dispose()` it when the project changes. When the scratch
  workspace is saved as a project, call `moveLink("scratch", newProjectId)` (re-key) instead of re-linking.
- Create a repository with `client.createRepo({ name, private, description })` (initialised with a README
  so the Git Data API works) and then link it; list branches with `client.listBranches`.
- Errors you will see: `GitHubAuthError` (`unauthorized`), `GitHubPermissionError` (`forbidden`: token
  cannot write to this repo), `GitHubRateLimitError` (`rate_limited`), `GitHubNotFoundError`
  (`not_found`: repo/branch missing or invisible), `GitHubConflictError`
  (`non_fast_forward`, `already_exists`, `empty_repository`), `GitHubNetworkError` (`network`), and
  `GitHubSyncError` (`too_many_files`, `tree_truncated`, `unstable_remote`, ...).

### Controller states

`idle` (not started) -> `synced` | `pending` (unpushed edits) | `pushing` | `pulling` | `conflict` (open
conflicts) | `held` (a mass deletion waits for `confirmDeletes()` / `restoreDeleted()`) | `offline` |
`error` (see `lastError`, `nextAttemptAt`; `too_many_files` needs the user to remove files or link a
sub-folder) | `paused` | `unauthenticated`.
`getState()` also returns `conflicts`, `pendingPaths`, `remoteAheadPaths` (remote changes not applied,
e.g. with auto-pull off), `skipped`, `heldDeletes`, `lastSyncAt` and `lastSyncedCommitSha`.

Timings (all injectable): push after 2.5 s idle, at most 20 s after the first unpushed edit, remote
check every 20 s while visible.

## Limitations

- Text files only; files over 1 MiB, binary files, symlinks, submodules and Git LFS content
  are not synced. At most 500 files per project.
- Repositories whose recursive tree exceeds GitHub's truncation limit (about 100,000 entries / 7 MB) are
  rejected with `tree_truncated`; link a smaller repo.
- Commits are authored by the signed-in user. Commit signing is not supported.
- Branch protection rules that require pull requests or signed commits will reject pushes
  (surfaced as an `error` with GitHub's message); sync to an unprotected branch instead.
- Folders and empty directories do not exist in git, so empty folders are not synced.
- Line endings are preserved byte-for-byte; the editor must not normalise them or every file would look
  modified.
- OAuth Apps cannot be restricted to a single repository. Use a fine-grained PAT for that.
- `GET /git/ref` polling means changes appear within about 20 s, not instantly (no webhooks in a
  browser-only app).

## Tests

`npx vitest run src/test/github` runs the suites: `githubSha` (git sha vectors, UTF-8, paths, ignore
rules), `githubSync` (classification matrix, plans, conflicts), `githubClient` (client, ETag, rate limits,
commits, import), `githubAuth` (token storage, OAuth fragment, links), `githubOAuthServer` (state,
redirect validation, handlers, Vercel adapter) and `githubController` (debounce, max-wait, one commit in
flight, polling, 304, 401, rate limit, offline, non-fast-forward, conflicts) using fake timers and an
in-memory GitHub.
