# Release source authorization

The Release workflow fails closed before building or publishing unless the
requested tag satisfies all of the following conditions:

1. The remote tag exists, peels to a commit, and matches the exact SHA checked
   out by the workflow.
2. That commit is the current `main` tip or an ancestor of it.
3. GitHub associates that final main commit with exactly one merged pull
   request into `main`.
4. If `requiredApprovals` is greater than zero, enough explicitly trusted,
   current repository writers have an effective approval on the pull request's
   final head commit.
5. A completed `CI` workflow run for a `main` push at that exact final commit
   SHA succeeded with every check listed in
   `security/release-source-policy.json`.

The current repository policy deliberately sets `requiredApprovals` to `0`
and `trustedReviewers` to an empty allowlist because the repository has only
one trusted collaborator. This disables only the optional approval count: the
unique merged-pull-request provenance, `main` ancestry, and exact-SHA CI gates
remain mandatory. A Codex implementation or acceptance result is not a GitHub
pull-request approval and is never presented to this gate as one.

Before increasing `requiredApprovals`, add each eligible GitHub login to
`trustedReviewers`. Each entry is an object with a `login`; a bot also requires
an explicit `"allowBot": true`. For every allowlisted login, the helper queries
GitHub's current repository-permission endpoint and accepts only the legacy
base permissions `write` or `admin`. It then counts at most one decision per
login, excludes the pull-request author, and requires that reviewer's latest
decisive state to be `APPROVED` with `review.commit_id` equal to the final pull
request head. A stale approval, a later `CHANGES_REQUESTED` or `DISMISSED`
state, an unlisted account, a bot without `allowBot`, insufficient current
permission, or any permission-query/configuration failure blocks release.

The pull-request head and final main commit are deliberately separate values.
For squash and rebase merges, GitHub can create a new main SHA; authorization
uses the commit-to-pull-request association and exact `merge_commit_sha` to
connect that final commit to its review, while `review.commit_id` must match the
pull request's final head. CI results from the different PR head or a synthetic
merge commit never substitute for the final main-push SHA.

Release reruns are idempotent. A newer successful CI rerun for the same SHA is
accepted, a missing/pending/skipped/neutral/failed required check is rejected,
and an existing published Release is verified before becoming a no-op. The
remote tag, main ancestry, merged-PR provenance, configured approval policy,
and CI evidence are checked again before any Release mutation and immediately
before a verified draft becomes public.

## Required GitHub rules

Repository rules are defense in depth for the workflow gate and should be
configured by a repository administrator:

- Protect `main`: require pull requests and the exact checks in
  `security/release-source-policy.json`; restrict bypasses. If the repository
  later has enough independent trusted writers, raise `requiredApprovals`,
  populate `trustedReviewers`, and configure matching remote approval rules
  that dismiss stale approvals.
- Protect `v*.*.*` tags: restrict creation, update, and deletion to the release
  maintainers; do not permit force-updating a published tag.
- Restrict changes to `.github/workflows/**`,
  `scripts/verify-release-source.mjs`, and
  `security/release-source-policy.json` through CODEOWNERS or an equivalent
  ruleset.

These remote rules are intentionally not created or changed by the Release
workflow. Without them, the workflow still validates every source that runs
the checked-in gate, but repository administrators remain responsible for
protecting the gate definition and tag namespace from authorized writers.
