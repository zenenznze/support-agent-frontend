# Public Release Checklist

Use this checklist before publishing the repository publicly.

## Repository hygiene
- [ ] remove committed cache files and generated artifacts
- [ ] confirm `.gitignore` covers local runtime data, build output, and caches
- [ ] run one final scan for product names, internal domains, and machine-specific paths

## Documentation
- [ ] confirm README describes the project as a generic starter/runtime
- [ ] document required environment variables and the external backend contract
- [ ] keep deployment examples generic and replaceable

## Release management
- [ ] choose and add a LICENSE file
- [ ] configure the public remote repository
- [ ] verify default branch, README, and repository visibility settings

## Verification
- [ ] verify frontend build still works
- [ ] verify bridge starts in mock mode with local defaults
- [ ] verify no production-only credentials or data are tracked
