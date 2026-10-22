# Repository working rules

## Standard release procedure

- For future release requests, use `scripts/release.ps1` and follow
  [the release runbook](docs/release-runbook.md). Do not reconstruct the
  publication sequence with ad hoc commands when the standard entry point works.
- A request to edit or commit does not authorize push, merge, tag creation, or
  publication. `-Publish` and `-Resume` require an explicit release instruction.
- Prepare and commit the intended release changes first. Preserve unrelated
  working-tree changes; never automatically stage them to satisfy the clean-tree gate.
- Before declaring a change ready for release, update affected behavior tests
  together with UI, message, or interaction contracts and run the relevant
  scenarios. After a failure, inspect related assertions in that behavior domain
  before submitting another candidate; do not defer known test maintenance to release.
- Run `-CheckOnly`, then `-Publish` for an authorized release. Use `-Resume`
  after interruption from the original checkout. Investigate failures before
  explicitly rerunning a failed GitHub job; do not blindly rebuild or retag.
- Let CI own full regression testing and the Release workflow own installation,
  asset downloads, checksums, SBOM, and provenance verification. Do not repeat
  successful equivalent checks for the same commit and environment without a
  new change, failure, or concrete unresolved concern.
- Wait for the running script with bounded tool waits. Do not repeatedly read
  the repository or poll GitHub while the script is already polling. Inspect
  only relevant failed-step logs, with output capped.
- Progress reports should identify the current stage, elapsed time, known blocker,
  and remaining stages. Do not repeatedly announce an unchanged wait or give an
  unsupported completion estimate; distinguish script observations from inference.
- Classify a failure before rerunning. A rerun that passes is not proof that an
  intermittent defect is fixed. Record repeated failures in an existing relevant
  Issue, or create a scoped follow-up after checking for duplicates.
- Report the commit, PR, CI/Release run, public Release URL, and any remaining
  limitation. Local/mock tests must never be described as a real publication.

## Command output

Keep exploratory output bounded. Prefer targeted searches and diff summaries;
capture large test/build logs to a file, show a bounded tail, and preserve the
exit code. Explain truncation before reading a narrower range.
