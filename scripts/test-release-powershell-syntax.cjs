const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const lines = workflow.split(/\r?\n/);
const blocks = [];

for (let index = 0; index < lines.length; index += 1) {
  const shellMatch = lines[index].match(/^(\s*)shell:\s*pwsh\s*$/);
  if (!shellMatch) continue;
  const propertyIndent = shellMatch[1].length;
  let runLine = -1;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() && line.match(/^\s*/)[0].length < propertyIndent) break;
    if (line.match(/^\s*/)[0].length === propertyIndent && /^\s*run:\s*\|\s*$/.test(line)) {
      runLine = cursor;
      break;
    }
  }
  assert.ok(runLine >= 0, `pwsh declaration on line ${index + 1} has a literal run block`);

  const bodyIndent = propertyIndent + 2;
  const body = [];
  let cursor = runLine + 1;
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    const indentation = line.match(/^\s*/)[0].length;
    if (line.trim() && indentation <= propertyIndent) break;
    body.push(line.length >= bodyIndent ? line.slice(bodyIndent) : "");
  }
  blocks.push({ line: runLine + 1, source: body.join("\n") });
  index = cursor - 1;
}

assert.ok(blocks.length >= 10, "all release PowerShell boundaries were discovered");
const parserCommand = `
$source = [Console]::In.ReadToEnd()
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
`;

for (const block of blocks) {
  const result = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", parserCommand], {
    encoding: "utf8",
    input: block.source
  });
  assert.equal(
    result.status,
    0,
    `PowerShell run block after workflow line ${block.line} parses cleanly: ${result.stderr || result.stdout}`
  );
}

console.log(`Release workflow PowerShell syntax tests passed for ${blocks.length} run blocks`);
