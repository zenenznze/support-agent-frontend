# Public Release Checklist

Use this checklist before publishing the repository publicly.

## Repository hygiene
- [x] remove committed cache files and generated artifacts
- [x] confirm `.gitignore` covers local runtime data, build output, and caches
- [x] run one final scan for product names, internal domains, and machine-specific paths

## Documentation
- [x] confirm README describes the project as a generic starter/runtime
- [x] document required environment variables and the external backend contract
- [x] keep deployment examples generic and replaceable

## Release management
- [x] choose and add a LICENSE file
- [x] configure the GitHub remote repository
- [x] verify default branch and README
- [x] switch repository visibility to public after explicit owner confirmation

## Verification
- [x] verify frontend build still works
- [x] verify bridge tests pass in local mode
- [x] verify bridge starts in mock mode with local defaults
- [x] verify no production-only credentials or data are tracked

## Latest verification evidence

Last checked in this repository before the public-ready commit:

- Brand/path scan: zero hits for prior product names, internal runtime names, and machine-specific absolute paths.
- Git hygiene: no tracked `__pycache__` or `.pyc` files.
- Frontend: `npm run build` completed successfully.
- Bridge: `npm test` completed successfully.
- Bridge mock start: `npm run start` answered `/api/health` with `{ "ok": true, "mode": "mock" }`.
- Remote: `origin` points to `https://github.com/zenenznze/support-chat-runtime.git`; GitHub reports default branch `main` and current visibility `public` after owner confirmation.
- Public access: unauthenticated `https://github.com/zenenznze/support-chat-runtime` and raw README access both returned HTTP 200.
- Dependency audit: `npm audit --omit=dev` reports zero vulnerabilities in both frontend and bridge packages.
