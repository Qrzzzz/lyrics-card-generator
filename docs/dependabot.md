# Dependabot dependency updates

Starting with v6.3.5, npm and GitHub Actions updates are included in the normal version development and validation process. The monthly minor/patch groups and separate npm security group are configured in `.github/dependabot.yml`.

## Incorporate an update

1. Review the PR's manifest, lockfile or pinned Actions changes. Keep unrelated product changes separate and record the PR number and head SHA in the version notes.
2. On the integration branch, run `npm run dependencies:prepare`. This installs the exact lockfile, rebuilds `index.html`, checks that it matches the source, and runs the production dependency advisory gate.
3. Review and include the regenerated `index.html` alongside the dependency files. Run typecheck, lint, core and stability tests, Web Lite browser checks and desktop packaging/runtime checks. Electron updates require the desktop checks even when the renderer passes.
4. Use the regular PR and release validation path. Passing dependency checks alone does not authorize a release or merge.

## Stale Web Lite on a bot PR

Dependabot updates dependencies but does not regenerate `index.html`. A dependency change can alter the bundle even when no application source changes. CI keeps the stale-artifact check blocking and attaches a rebuilt HTML artifact named with the PR head SHA when that check fails on a Dependabot PR. This artifact is for inspection; regenerate locally from the reviewed head before committing it. CI does not grant the bot write access, push commits, or bypass required checks.

The main branch, Pages and Release continue to require the checked-in HTML to match the exact dependency lockfile. The generated artifact is not automatically published.

## v6.3.5 intake

- PR #181 (`8c01a6b6fd439a753dd126f137e33a691fda6f83`): the Actions compatible group (checkout and setup-node pinned updates).
- PR #182 (`c65dfda9d0517439193c79daa98062c70f90ee95`): the npm compatible group, including Next.js 15.5.25, React 19.3.0 and Electron 42.11.3; rebuild Web Lite as part of integration.

Configuration reference: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
