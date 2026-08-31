import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createDesktopRuntimeAuditInput } from "./desktop-runtime-dependency-policy.mjs";

const fixture = JSON.parse(await readFile("scripts/fixtures/desktop-runtime-audit/input.json", "utf8"));
const generated = createDesktopRuntimeAuditInput(fixture);
assert.deepEqual(
  generated.inventory.closure.map((entry) => `${entry.name}@${entry.version}`).sort(),
  [...fixture.expectedClosure].sort(),
  "the desktop audit input contains only the explicit Electron-rooted lock closure"
);
assert.deepEqual(
  generated.packageJson.dependencies,
  { electron: "42.9.3" },
  "the dev-declared packaged runtime becomes the only production root in the synthetic audit input"
);
assert.ok(!generated.packageLock.packages["node_modules/electron"].dev, "Electron is not omitted by npm --omit=dev");
assert.ok(!generated.packageLock.packages["node_modules/runtime-helper"].dev, "Electron transitive dependencies are not omitted");
for (const excluded of ["node_modules/next", "node_modules/test-only", "node_modules/test-helper"]) {
  assert.ok(!generated.packageLock.packages[excluded], `${excluded} stays outside the desktop-only audit closure`);
}

const ranged = structuredClone(fixture);
ranged.rootPackage.devDependencies.electron = "^42.9.3";
ranged.rootLock.packages[""].devDependencies.electron = "^42.9.3";
assert.throws(
  () => createDesktopRuntimeAuditInput(ranged),
  /must be pinned exactly/u,
  "a ranged Electron declaration fails closed"
);

const missingTransitive = structuredClone(fixture);
delete missingTransitive.rootLock.packages["node_modules/runtime-helper"];
assert.throws(
  () => createDesktopRuntimeAuditInput(missingTransitive),
  /requires runtime-helper/u,
  "a broken package-lock closure fails closed"
);

const exceptionPolicy = structuredClone(fixture);
exceptionPolicy.policy.exceptions.push({ advisory: "GHSA-2345-6789-cfgh" });
assert.throws(
  () => createDesktopRuntimeAuditInput(exceptionPolicy),
  /exceptions must remain empty/u,
  "Electron advisories cannot be hidden behind a desktop-runtime exception"
);

const auditRequest = await captureNpmAuditRequest(generated.packageJson, generated.packageLock);
assert.deepEqual(auditRequest.electron, ["42.9.3"], "npm audit receives the packaged Electron version");
assert.deepEqual(auditRequest["runtime-helper"], ["1.2.3"], "npm audit receives Electron's dependency closure");
assert.deepEqual(auditRequest["runtime-nested"], ["3.0.0"], "npm audit receives nested runtime dependencies");
assert.deepEqual(auditRequest["runtime-optional"], ["2.0.1"], "npm audit receives installed optional runtime dependencies");
for (const excluded of ["next", "test-only", "test-helper"]) {
  assert.ok(!(excluded in auditRequest), `npm audit does not receive unrelated ${excluded}`);
}

console.log("Desktop runtime dependency audit input tests passed");

async function captureNpmAuditRequest(packageJson, packageLock) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body = Buffer.concat(chunks);
    if (request.headers["content-encoding"] === "gzip") body = gunzipSync(body);
    const parsed = body.length > 0 ? JSON.parse(body.toString("utf8")) : null;
    requests.push({ method: request.method, url: request.url, body: parsed });
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    if (request.url?.includes("/audits/quick")) {
      response.end(JSON.stringify({
        auditReportVersion: 2,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
          dependencies: { prod: 4, dev: 0, optional: 1, peer: 0, peerOptional: 0, total: 4 }
        }
      }));
    } else {
      response.end("{}");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string", "local audit fixture registry must bind a TCP port");
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-runtime-audit-fixture-"));
  try {
    await writeFile(path.join(directory, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
    await writeFile(path.join(directory, "package-lock.json"), `${JSON.stringify(packageLock, null, 2)}\n`);
    const result = await runNpmAudit(directory, `http://127.0.0.1:${address.port}/`);
    assert.equal(result.code, 0, `fixture npm audit failed: ${result.stderr || result.stdout}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }

  const bulk = requests.find((entry) => entry.method === "POST" && entry.url?.includes("/advisories/bulk"));
  assert.ok(bulk?.body && typeof bulk.body === "object", "npm audit must send a bulk advisory request for the synthetic lock");
  return bulk.body;
}

function runNpmAudit(cwd, registry) {
  const npmCli = resolveNpmCli();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, "audit", "--omit=dev", "--json", `--registry=${registry}`], {
      cwd,
      env: {
        ...process.env,
        npm_config_update_notifier: "false",
        npm_config_fund: "false"
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-12_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function resolveNpmCli() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const candidate = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  assert.ok(existsSync(candidate), "npm CLI was not found; run this test through npm run dependency-audit:test");
  return candidate;
}
