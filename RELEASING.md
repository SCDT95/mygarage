# MyGarage Release Process

**Audience:** Maintainers.

MyGarage uses [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).
Releases publish automatically: pushing a `vX.Y.Z` tag runs
[`publish.yml`](.github/workflows/publish.yml) (the shared-workflows publish
pipeline), which builds and publishes the Docker image to GHCR with tags
`latest`, `X.Y.Z`, `X.Y`, and `X`, and creates the GitHub release from the
changelog. There is no manual `docker build`/push step.

## Versioning

- **MAJOR** — breaking changes (incompatible API, removed features, auth or
  config format changes).
- **MINOR** — backward-compatible features.
- **PATCH** — bug fixes, security patches, dependency bumps.

Pre-releases are tagged `vX.Y.Z-rcN` (e.g. `v3.0.0-rc1`); the publish workflow
marks them as pre-releases automatically.

## Releasing

1. **Bump the version** in `backend/pyproject.toml` and `frontend/package.json`
   — both must match (the backend reads its version from `pyproject.toml` at
   runtime).
2. **Fold the changelog** — in `CHANGELOG.md`, rename `## [Unreleased]` to
   `## [X.Y.Z] - YYYY-MM-DD`, then add a fresh empty `## [Unreleased]` above it.
3. **Commit and push to `main`:**
   ```bash
   git add backend/pyproject.toml frontend/package.json CHANGELOG.md
   git commit -m "chore: release vX.Y.Z"
   git push origin main
   ```
4. **Wait for CI to pass on `main`** — tests, linting, type-checks, PostgreSQL
   migrations, and CodeQL. Do not tag until it is green.
5. **Tag and push:**
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
6. **`publish.yml` runs** (~5–10 min) — it builds and publishes the Docker image
   to GHCR and creates the GitHub release. Watch it to green.
7. **Verify** — the GitHub release exists with the correct changelog, and the
   image pulls: `docker pull ghcr.io/homelabforge/mygarage:X.Y.Z`.

## Hotfixes

For a critical bug or security fix: fix it on `main`, bump the PATCH version, and
run the release steps again. The hotfix becomes `:latest`. Avoid deleting an
already-published tag — users may have pulled it; ship a new PATCH instead.

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
