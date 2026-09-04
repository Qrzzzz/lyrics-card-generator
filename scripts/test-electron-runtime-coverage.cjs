const { spawnSync } = require("node:child_process");

const tests = [
  "scripts/test-electron-clipboard-image.cjs",
  "scripts/test-electron-sandbox-preload-contract.cjs",
  "scripts/test-electron-preload-runtime.cjs",
  "scripts/test-electron-security-contract.cjs",
  "scripts/test-electron-local-server-origin.cjs",
  "scripts/test-electron-packaged-server-startup.cjs",
  "scripts/test-electron-ai-request-lifecycle.cjs",
  "scripts/test-import-history.cjs",
  "scripts/test-remote-history.cjs"
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [test], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
