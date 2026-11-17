# Dependabot dependency updates

Starting with v6.3.5, npm and GitHub Actions updates are included in the normal version development and validation process. The monthly minor/patch groups and separate npm security group are configured in `.github/dependabot.yml`.

## Incorporate an update

1. Review the PR's manifest, lockfile or pinned Actions changes. Keep unrelated product changes separate and record the PR number and head SHA in the version notes.
2. On the integration branch, run `npm run dependencies:prepare`. This installs the exact lockfile and runs the production dependency advisory gate.
4. Use the regular PR and release validation path. Passing dependency checks alone does not authorize a release or merge.

## v6.3.5 intake

- PR #181 (`8c01a6b6fd439a753dd126f137e33a691fda6f83`): the Actions compatible group (checkout and anchore/sbom-action pinned updates).

Configuration reference: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference

## Post-v6.10.2 intake: PR #269

PR #269 (`55acb7a5d13b23e58b4df1a9c53335eb181a4b2e`) updates the npm compatible
group, including Next.js 15.5.29, strtok3 10.7.0 and Playwright 1.65.0. This is
main-branch maintenance after v6.10.2, not a replacement of its published bytes.

Playwright also requires the matching Noble browser image in CI and the manual
benchmark. Both workflows and `security/ci-browser-runtime.json` use the same
MCR manifest digest. Browser versions follow the upstream v1.65.0 manifest:
Chromium 158.0.8127.18, Firefox 159.0 and WebKit 27.2.

- Image manifest: `sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe`.
- Browser manifest: https://github.com/microsoft/playwright/blob/v1.65.0/packages/playwright-core/browsers.json
  source, browser and packaged desktop checks before merging.
