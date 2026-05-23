# Contributing

## Development

```bash
pnpm install
pnpm run watch      # rebuild on change
pnpm run check-types
pnpm run lint
```

Press `F5` in VS Code to launch an Extension Development Host.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/).
The release version and changelog are derived from commit history, so the prefix matters:

- `feat:` → minor bump, listed under **Added**
- `fix:` → patch bump, listed under **Fixed**
- `perf:` / `refactor:` → listed under **Changed**
- `chore:` / `docs:` / `ci:` / `test:` / `style:` → not released, excluded from the changelog

Gitmoji after the prefix (e.g. `fix: :bug: ...`) is fine — it is stripped from the changelog automatically.

## Releasing

Releases are cut manually via GitHub Actions — nothing is published on plain push to `main`.

1. Merge everything for the release into `main`.
2. Open **Actions → Release → Run workflow**.
3. Pick the bump:
   - **auto** — git-cliff computes the next version from commits since the last tag
     (fails if there are no `feat:`/`fix:` commits to release).
   - **patch / minor / major** — force an explicit bump.
4. Run it.

The workflow then:

- determines the version and bumps `package.json`,
- prepends the new section to `CHANGELOG.md` (existing entries are preserved),
- builds the `.vsix`,
- commits `chore: release vX.Y.Z`, tags `vX.Y.Z`, and pushes to `main`,
- creates a GitHub Release with the `.vsix` attached and generated release notes,
- publishes to the VS Code Marketplace and Open VSX **if the corresponding secret is set**.

### Publishing secrets

Marketplace and Open VSX publishing steps are skipped until these repository secrets exist
(**Settings → Secrets and variables → Actions**):

| Secret      | Used for             | How to get it                                                                 |
| ----------- | -------------------- | ----------------------------------------------------------------------------- |
| `VSCE_PAT`  | VS Code Marketplace  | Azure DevOps PAT with **Marketplace → Manage** scope for the `epodivilov` publisher. |
| `OVSX_PAT`  | Open VSX Registry    | Access token from <https://open-vsx.org> (the publisher namespace must be claimed). |

Until both are added, the workflow still bumps, tags, and creates the GitHub Release with the
`.vsix` — only the marketplace uploads are skipped.
