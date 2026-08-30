# Release source authorization

The Release workflow fails closed before building or publishing unless the
requested tag satisfies all of the following conditions:

1. The remote tag exists, peels to a commit, and matches the exact SHA checked
   out by the workflow.
2. That commit is the current `main` tip or an ancestor of it.
3. GitHub associates that final main commit with exactly one merged pull
   request into `main`, and an independent reviewer approved the pull request's
   final head commit.
4. A completed `CI` workflow run for a `main` push at that exact final commit
   SHA succeeded with every check listed in
   `security/release-source-policy.json`.

The pull-request head and final main commit are deliberately separate values.
For squash and rebase merges, GitHub can create a new main SHA; authorization
uses the commit-to-pull-request association and exact `merge_commit_sha` to
connect that final commit to its review, while `review.commit_id` must match the
pull request's final head. CI results from the different PR head or a synthetic
merge commit never substitute for the final main-push SHA.

Release reruns are idempotent. A newer successful CI rerun for the same SHA is
accepted, a missing/pending/skipped/neutral/failed required check is rejected,
and an existing published Release is verified before becoming a no-op. The
remote tag, main ancestry, review, and CI evidence are checked again before any
Release mutation and immediately before a verified draft becomes public.

## Required GitHub rules

Repository rules are defense in depth for the workflow gate and should be
configured by a repository administrator:

- Protect `main`: require pull requests, at least one non-author approval on
  the latest reviewed head, and the exact checks in
  `security/release-source-policy.json`; dismiss stale approvals and restrict
  bypasses.
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
