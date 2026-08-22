const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { ESLint } = require("eslint");

async function run() {
  const eslint = new ESLint();
  const productionFiles = readdirSync("electron")
    .filter((name) => /\.(?:cjs|js|mjs)$/.test(name))
    .map((name) => `electron/${name}`);
  assert.ok(productionFiles.length > 0, "the Electron production surface is present");
  for (const file of productionFiles) {
    assert.equal(await eslint.isPathIgnored(file), false, `${file} remains inside the lint gate`);
    const config = await eslint.calculateConfigForFile(file);
    const expectedSourceType = file.endsWith(".mjs") ? "module" : "commonjs";
    assert.equal(config.languageOptions.sourceType, expectedSourceType, `${file} uses its Node module semantics`);
    assert.equal(config.rules["no-undef"][0], 2, `${file} has blocking recommended correctness rules`);
    assert.equal(config.plugins["@next/next"], undefined, `Next browser rules do not leak into ${file}`);
    assert.equal(config.plugins.react, undefined, `React browser rules do not leak into ${file}`);
  }

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.typecheck, /npm run electron:typecheck/, "the main typecheck includes Electron checkJs");
  assert.equal(
    packageJson.scripts["electron:typecheck"],
    "tsc --project tsconfig.electron.json",
    "Electron type-aware analysis has one deterministic command"
  );
  console.log(`Electron static-analysis contracts passed for ${productionFiles.length} production files`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
