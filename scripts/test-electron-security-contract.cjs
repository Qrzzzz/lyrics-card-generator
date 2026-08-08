const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { isTrustedIpcEvent } = require("../electron/ipc-security");
const { normalizeLoopbackHttpUrl, resolveLocalAppUrl } = require("../electron/local-app-url");
const { createManualSaveIpcHandlers } = require("../electron/manual-save-ipc");
const { isAllowedLocalNavigation, parseAllowedExternalUrl } = require("../electron/url-policy");

const localUrl = "http://127.0.0.1:43123";
assert.equal(isAllowedLocalNavigation(`${localUrl}/settings`, localUrl), true);
assert.equal(isAllowedLocalNavigation("http://127.0.0.1:43124/settings", localUrl), false);
assert.equal(isAllowedLocalNavigation("file:///C:/secret", localUrl), false);

assert.equal(parseAllowedExternalUrl("https://github.com/Qrzzzz/lyrics-card-generator")?.hostname, "github.com");
for (const rejected of [
  "http://github.com/Qrzzzz/lyrics-card-generator",
  "https://github.com.evil.example/phish",
  "https://user:pass@github.com/private",
  "file:///C:/Windows/System32/calc.exe",
  "javascript:alert(1)",
  "data:text/html,boom",
  "custom://github.com/path",
  "https://127.0.0.1/local",
  "https://localhost/local"
]) {
  assert.equal(parseAllowedExternalUrl(rejected), null, rejected);
}

function trustedFixture(frameUrl = `${localUrl}/`, frameIsMain = true) {
  const mainFrame = { url: frameUrl };
  const senderFrame = frameIsMain ? mainFrame : { url: frameUrl };
  const sender = { mainFrame, isDestroyed: () => false };
  const mainWindow = { isDestroyed: () => false, webContents: sender };
  return { event: { sender, senderFrame }, mainWindow };
}

{
  const { event, mainWindow } = trustedFixture();
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), true);
}
{
  const { event, mainWindow } = trustedFixture(`${localUrl}/iframe`, false);
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "subframes are rejected");
}
{
  const { event, mainWindow } = trustedFixture("https://evil.example/");
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "wrong origins are rejected");
}
{
  const { event, mainWindow } = trustedFixture();
  event.sender = { ...event.sender };
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "another webContents is rejected");
}
{
  const { event, mainWindow } = trustedFixture();
  mainWindow.isDestroyed = () => true;
  assert.equal(isTrustedIpcEvent(event, mainWindow, localUrl), false, "destroyed windows are rejected");
}

const mainSource = readFileSync("electron/main.js", "utf8");
const packagedServerReadinessSource = readFileSync("electron/packaged-server-readiness.js", "utf8");
const singleInstanceOwnershipSource = readFileSync("electron/single-instance-ownership.js", "utf8");
const desktopReadyRouteSource = readFileSync("app/api/desktop-ready/route.ts", "utf8");
const importHistorySource = readFileSync("electron/import-history.js", "utf8");
const manualSaveIpcSource = readFileSync("electron/manual-save-ipc.js", "utf8");
const desktopApiSource = readFileSync("lib/desktop-api.ts", "utf8");
const desktopHistoryInteractionSource = readFileSync("scripts/test-desktop-import-history-interactions.mjs", "utf8");
// Source contracts complement unit behavior checks by proving that the hardened
// helpers are actually wired into the privileged Electron entry point.
const replayPayloadSource = mainSource.slice(
  mainSource.indexOf("async function createImportHistoryReplayPayload"),
  mainSource.indexOf("function mimeTypeForHistoryFile")
);
assert.equal((mainSource.match(/ipcMain\.handle\(/g) || []).length, 1, "every privileged IPC handler uses the trusted wrapper");
assert.match(mainSource, /setPermissionRequestHandler[\s\S]*?callback\(false\)/);
assert.match(mainSource, /setPermissionCheckHandler\(\(\) => false\)/);
assert.match(mainSource, /parseAllowedExternalUrl\(url\)/);
assert.match(mainSource, /isAllowedLocalNavigation\(url, localAppUrl\)/);
assert.match(mainSource, /resolveLocalAppUrl\(\{/);
const ownershipAcquisitionIndex = mainSource.indexOf("const singleInstanceOwnership = acquireSingleInstanceOwnership");
const privilegedIpcRegistrationIndex = mainSource.indexOf("registerDesktopIpc();");
const bootRegistrationIndex = mainSource.indexOf("app.whenReady().then(boot);");
assert.ok(ownershipAcquisitionIndex >= 0, "the Electron entry acquires explicit single-instance ownership");
assert.ok(
  ownershipAcquisitionIndex < privilegedIpcRegistrationIndex && ownershipAcquisitionIndex < bootRegistrationIndex,
  "single-instance ownership is decided before privileged IPC registration and boot"
);
assert.match(
  mainSource,
  /if \(singleInstanceOwnership\.hasLock\) \{\s*initializePrimaryInstance\(\);\s*\}/,
  "only the owning process enters the primary lifecycle"
);
assert.match(singleInstanceOwnershipSource, /const hasLock = app\.requestSingleInstanceLock\(\)/);
assert.match(singleInstanceOwnershipSource, /if \(!hasLock\) \{\s*app\.quit\(\)/);
assert.match(singleInstanceOwnershipSource, /app\.on\("second-instance", requestPrimaryWindowFocus\)/);
assert.match(singleInstanceOwnershipSource, /isMinimized\(\)[\s\S]*?restore\(\)[\s\S]*?isVisible\(\)[\s\S]*?show\(\)[\s\S]*?focus\(\)/);
assert.doesNotMatch(mainSource, /function waitForHttpReady\(/, "packaged startup no longer accepts arbitrary HTTP responses");
assert.match(mainSource, /\[STARTUP_SECRET_ENV\]: startupSecret/, "the per-launch secret reaches only the child environment");
assert.match(mainSource, /waitForPackagedServerReady\(\{[\s\S]*?child: spawnedServer,[\s\S]*?startupSecret/);
assert.match(
  mainSource,
  /if \(!resolvedAppUrl\.waitForReady && !isChildProcessAlive\(nextServerProcess\)\)[\s\S]*?localAppUrl = resolvedAppUrl\.url/,
  "the intended child is rechecked immediately before publishing the trusted renderer origin"
);
assert.match(
  mainSource,
  /function handleNextServerExit[\s\S]*?localAppUrl = null;[\s\S]*?mainWindow\.destroy\(\);[\s\S]*?app\.quit\(\)/,
  "an unexpected bundled server exit revokes the renderer origin and closes the desktop shell"
);
assert.doesNotMatch(mainSource, /console\.(?:log|error)\([^\n]*startupSecret/, "the startup secret is never logged");
assert.match(packagedServerReadinessSource, /response\.statusCode \?\? 0[\s\S]*?statusCode !== 200/);
assert.match(packagedServerReadinessSource, /isChildProcessAlive\(child\)[\s\S]*?identity-proof/);
assert.match(packagedServerReadinessSource, /timingSafeEqual/);
assert.doesNotMatch(packagedServerReadinessSource, /console\./, "startup secrets and challenges are never logged");
assert.match(desktopReadyRouteSource, /createHmac\("sha256", startupSecret\)\.update\(challenge\)/);
assert.match(desktopReadyRouteSource, /"LYRICS_CARD_SERVER_STARTUP_SECRET"/);
assert.match(desktopReadyRouteSource, /"x-lyrics-card-startup-challenge"/);
assert.match(desktopReadyRouteSource, /status: 404/, "the readiness route is unavailable without the child secret and challenge");
assert.match(desktopReadyRouteSource, /"Cache-Control": "no-store"/);

const prepareElectronSource = readFileSync("scripts/prepare-electron-dist.mjs", "utf8");
assert.match(prepareElectronSource, /"electron\/local-app-url\.js"/, "packaged desktop bundles the local URL policy helper");
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "local-app-url\.js"\)[\s\S]*?path\.join\(electronOutputDir, "local-app-url\.js"\)/,
  "desktop preparation copies the local URL policy helper into the minimal app"
);
assert.match(prepareElectronSource, /"electron\/import-history\.js"/, "packaged desktop bundles the import history store");
assert.match(
  prepareElectronSource,
  /"electron\/packaged-server-readiness\.js"/,
  "packaged desktop bundles the authenticated startup helper"
);
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "packaged-server-readiness\.js"\)[\s\S]*?path\.join\(electronOutputDir, "packaged-server-readiness\.js"\)/,
  "desktop preparation copies the authenticated startup helper into the minimal app"
);
assert.match(prepareElectronSource, /"electron\/single-instance-ownership\.js"/, "packaged desktop bundles the ownership helper");
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "single-instance-ownership\.js"\)[\s\S]*?path\.join\(electronOutputDir, "single-instance-ownership\.js"\)/,
  "desktop preparation copies the single-instance ownership helper into the minimal app"
);
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "import-history\.js"\)[\s\S]*?path\.join\(electronOutputDir, "import-history\.js"\)/,
  "desktop preparation copies the import history store into the minimal app"
);
assert.match(prepareElectronSource, /"electron\/manual-save-ipc\.js"/, "packaged desktop bundles the manual-save IPC boundary");
assert.match(
  prepareElectronSource,
  /path\.join\(projectRoot, "electron", "manual-save-ipc\.js"\)[\s\S]*?path\.join\(electronOutputDir, "manual-save-ipc\.js"\)/,
  "desktop preparation copies the real manual-save IPC handlers into the minimal app"
);

const preloadSource = readFileSync("electron/preload.js", "utf8");
assert.match(preloadSource, /const \{ contextBridge, ipcRenderer, webUtils \} = require\("electron"\)/);
assert.match(preloadSource, /webUtils\.getPathForFile\(file\)/, "local file paths come from Electron 42 webUtils");
assert.doesNotMatch(preloadSource, /\bfile\.path\b/, "the removed File.path API is never used");
assert.match(preloadSource, /replayImportHistory: \(recordId\)[\s\S]*?invoke\("lyrics-card:import-history-replay", recordId\)/);
assert.doesNotMatch(preloadSource, /replayImportHistory: \([^)]*path/, "history replay exposes only an opaque record id");
assert.match(
  preloadSource,
  /commitImportHistoryReplay: \(recordId, relocationToken\)[\s\S]*?"lyrics-card:import-history-replay-commit"[\s\S]*?recordId,[\s\S]*?relocationToken/,
  "relocation finalization exposes only a record id and opaque main-process token"
);
assert.match(
  preloadSource,
  /exposeInMainWorld\("lyricsCardDesktopBridge"[\s\S]*?createManualSaveEnvelope: \(envelope\)[\s\S]*?invokeManualSave\("lyrics-card:manual-save-create", undefined, envelope\)/,
  "preload exposes only the primitive canonical-envelope transport"
);
assert.match(
  preloadSource,
  /function invokeManualSave\(channel, recordId, envelope\)[\s\S]*?typeof envelope !== "string"[\s\S]*?invalidManualSaveResult/,
  "preload rejects clone-erased objects instead of forwarding them to IPC"
);
assert.match(
  desktopApiSource,
  /function isManualSaveEnvelope\(value: unknown\)[\s\S]*?typeof value === "string"[\s\S]*?createDesktopApi[\s\S]*?bridge\.createManualSaveEnvelope\(envelope\)/,
  "the renderer-local product API rejects objects before crossing contextBridge"
);
assert.doesNotMatch(
  preloadSource,
  /(?:^|\s)createManualSave: /m,
  "the contextBridge surface cannot accept an object-shaped manual-save request"
);
assert.doesNotMatch(
  preloadSource,
  /(?:createManualSaveEnvelope|updateManualSaveEnvelope): \([^)]*(?:path|createdAt|lastUsedAt)/,
  "manual saves expose no renderer-selected path or timestamp"
);

assert.match(
  mainSource,
  /path\.join\(app\.getPath\("userData"\), "app-data", "import-history\.json"\)/,
  "history is stored under the desktop userData app-data directory"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-replay", async \(_event, recordId\)[\s\S]*?importHistoryStore\.get\(recordId\)[\s\S]*?createImportHistoryReplayPayload\(record\)/,
  "history replay resolves its source only from a validated stored record"
);
assert.match(mainSource, /readValidatedImportFile\(record\.kind, record\.source\.path\)/);
assert.doesNotMatch(
  replayPayloadSource,
  /await fs\.readFile\(/,
  "history replay never validates one path object and reopens another by path"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-relocate", async \(event, recordId\)[\s\S]*?readValidatedImportFile[\s\S]*?relocationToken/,
  "relocation returns a sender-bound opaque token without persisting the path"
);
assert.doesNotMatch(
  mainSource,
  /handle\("lyrics-card:import-history-relocate"[\s\S]*?updateFileReference/,
  "relocation cannot mutate history before renderer parsing and document commit"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-replay-commit"[\s\S]*?takeImportHistoryRelocation[\s\S]*?importHistoryStore\.commitReplay/,
  "path replacement, dedupe, and touch occur only in the post-document-commit IPC"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-record", \(event, input\) => trackImportHistoryMutation\(/,
  "history writes enter the shared mutation queue before their first asynchronous step"
);
assert.match(
  mainSource,
  /createManualSaveIpcHandlers\([\s\S]*?trackMutation: trackImportHistoryMutation[\s\S]*?readLimit: readImportHistoryLimit[\s\S]*?store: importHistoryStore[\s\S]*?handle\("lyrics-card:manual-save-create", manualSaveHandlers\.create\)/,
  "manual save creation uses the independently tested early-rejection handler and ordered mutation queue"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:manual-save-update", manualSaveHandlers\.update\)/,
  "manual save updates use the same independently tested early-rejection boundary"
);
assert.match(
  manualSaveIpcSource,
  /require\("\.\/import-history"\)[\s\S]*?const create = \(_event, envelope\) => \{\s*if \(typeof envelope !== "string" \|\| !isCanonicalManualSaveEnvelope\(envelope\)\) \{\s*return \{ ok: false, code: "invalid_snapshot" \};\s*\}\s*return trackMutation/,
  "create uses the Store's pure canonical validator before queue, preferences, or Store access"
);
assert.match(
  manualSaveIpcSource,
  /const update = \(_event, recordId, envelope\) => \{\s*if \(typeof envelope !== "string" \|\| !isCanonicalManualSaveEnvelope\(envelope\)\) \{\s*return \{ ok: false, code: "invalid_snapshot" \};\s*\}\s*return trackMutation/,
  "update uses the same pure canonical validator before queue, preferences, or Store access"
);
assert.match(
  mainSource,
  /handle\("lyrics-card:import-history-clear", \(\) => trackImportHistoryMutation\(/,
  "clear shares the same dispatch-order mutation boundary as create and update"
);
assert.match(
  mainSource,
  /function importHistoryErrorCode\(error\)[\s\S]*?IMPORT_HISTORY_DOMAIN_ERROR_CODES\.has\(error\?\.code\)[\s\S]*?: "history_write_failed"/,
  "filesystem error codes are reduced to a stable history domain error"
);
assert.doesNotMatch(
  mainSource,
  /unable to (?:create|update) manual save[\s\S]{0,260}typeof error\?\.code/,
  "manual save IPC never forwards EACCES, EPERM, or another raw platform code"
);
const manualSnapshotValidationSource = importHistorySource.slice(
  importHistorySource.indexOf("function manualSaveSnapshotFieldsFit"),
  importHistorySource.indexOf("function isMeaningfulManualSaveSnapshot")
);
assert.doesNotMatch(
  manualSnapshotValidationSource,
  /JSON\.stringify/,
  "pre-projection snapshot limits never estimate opaque structured-clone objects through JSON.stringify"
);
assert.match(
  manualSnapshotValidationSource,
  /jsonLikeTreeFitsWithinByteLimit[\s\S]*?maximumDepth[\s\S]*?utilTypes\.isProxy[\s\S]*?seen\.has[\s\S]*?Object\.getPrototypeOf/,
  "manual snapshots require a bounded-depth, acyclic, non-proxy, plain JSON-like tree"
);
const envelopeParserSource = importHistorySource.slice(
  importHistorySource.indexOf("function parseManualSaveEnvelope"),
  importHistorySource.indexOf("function manualSaveSnapshotFieldsFit")
);
assert.match(
  envelopeParserSource,
  /typeof value !== "string"[\s\S]*?JSON\.parse\(value\)[\s\S]*?manualSaveSnapshotFieldsFit[\s\S]*?JSON\.stringify\(envelope\) === value/,
  "the Store independently parses and validates an exact canonical string envelope before mutation"
);
assert.match(
  manualSnapshotValidationSource,
  /keys\.length !== MANUAL_SAVE_SNAPSHOT_FIELDS\.length[\s\S]*?key !== MANUAL_SAVE_SNAPSHOT_FIELDS\[index\][\s\S]*?SONG_SOURCES\.has\(source\.value\)/,
  "canonical snapshots require the complete exact ordered field sequence and a supported source enum"
);
for (const valueType of [
  "accessor/getter",
  "Proxy",
  "symbol",
  "non-enumerable property",
  "extended array",
  "sparse array",
  "shared object",
  "ArrayBuffer",
  "Uint8Array",
  "DataView",
  "Map",
  "Set",
  "Date",
  "RegExp",
  "Error",
  "cycle"
]) {
  assert.ok(
    desktopHistoryInteractionSource.includes(`["${valueType}"`),
    `desktop IPC regression covers ${valueType}`
  );
}
assert.match(
  desktopHistoryInteractionSource,
  /snapshot one byte over the limit has a stable IPC error[\s\S]*?excessively deep canonical envelope has a stable IPC error/,
  "desktop IPC rejects oversized and excessively deep canonical envelopes"
);
assert.match(
  desktopHistoryInteractionSource,
  /boundaryBytes[\s\S]*?512 \* 1024[\s\S]*?exact-limit complete legal snapshot crosses IPC successfully/,
  "desktop IPC preserves an exact-limit snapshot made only from the canonical legal fields"
);
assert.match(
  importHistorySource,
  /NETEASE_MANUAL_IDENTITY_HOSTS = new Set\(\["music\.163\.com", "y\.music\.163\.com"\]\)[\s\S]*?APPLE_MANUAL_IDENTITY_HOSTS = new Set\(\["music\.apple\.com"\]\)[\s\S]*?QQ_MANUAL_IDENTITY_HOSTS = new Set\(\["y\.qq\.com"\]\)[\s\S]*?function manualUrlIdentity[\s\S]*?foldedNames[\s\S]*?searchParameters\.entries\(\)[\s\S]*?asciiLowercase\(name\)[\s\S]*?canonicalNames\.has\(name\)[\s\S]*?identityParameters\.length === 1[\s\S]*?identityParameters\[0\]\.canonical/,
  "manual URL identity uses exact hosts/paths and audits percent-decoded names under explicit ASCII case folding"
);
assert.match(
  importHistorySource,
  /function normalizeManualSongUrls\(original, final\)[\s\S]*?identityState === "ambiguous"[\s\S]*?return null[\s\S]*?const absentIdentity = \{ state: "absent"[\s\S]*?const ambiguousIdentity = \{ state: "ambiguous"[\s\S]*?identityParameters\.length > 1[\s\S]*?return ambiguousIdentity/,
  "manual URL provenance preserves absent/unique/ambiguous state and rejects ambiguity before mutation"
);
assert.match(
  desktopHistoryInteractionSource,
  /NetEase song identity while removing credentials[\s\S]*?manual replay retains its exact sanitized song identity[\s\S]*?routeCountsBeforeManualReplayRemount/,
  "packaged replay preserves the song ID while retaining local-only remount behavior"
);
const manualReplayStart = replayPayloadSource.indexOf('record.kind === "manual-save"');
const manualReplayEnd = replayPayloadSource.indexOf("try {", manualReplayStart);
assert.ok(manualReplayStart >= 0 && manualReplayEnd > manualReplayStart);
assert.doesNotMatch(
  replayPayloadSource.slice(manualReplayStart, manualReplayEnd),
  /readValidatedImportFile|fetch\(|source\.path/,
  "manual save replay returns only the validated stored snapshot without file or network access"
);
assert.match(
  mainSource,
  /while \(importHistoryOperations\.size > 0\)[\s\S]*?Promise\.allSettled[\s\S]*?await importHistoryMutationQueue[\s\S]*?await importHistoryStore\.flush\(\)/,
  "desktop close waits for in-flight history operations and then the serialized store queue"
);
assert.match(
  mainSource,
  /await appPreferencesWriteQueue;\s*await flushImportHistoryOperations\(\);\s*allowWindowClose = true/,
  "window close is allowed only after preferences and import history are durable"
);

const nextConfig = readFileSync("next.config.mjs", "utf8");
for (const directive of ["default-src 'self'", "script-src", "style-src", "img-src", "font-src", "connect-src", "object-src 'none'", "frame-ancestors 'none'"]) {
  assert.ok(nextConfig.includes(directive), directive);
}
assert.match(nextConfig, /Permissions-Policy/);

async function testManualSaveIpcEarlyRejection() {
  // Rejected events must fail before queued persistence, file reads, or store writes.
  const calls = { queue: 0, preferences: 0, create: 0, update: 0, historyFilesystem: 0, logs: 0 };
  const handlers = createManualSaveIpcHandlers({
    trackMutation: async (operation) => {
      calls.queue += 1;
      return operation();
    },
    readLimit: async () => {
      calls.preferences += 1;
      return 10;
    },
    store: {
      createManualSave: async (envelope, limit) => {
        calls.create += 1;
        calls.historyFilesystem += 1;
        return { id: "created", envelope, limit };
      },
      updateManualSave: async (recordId, envelope, limit) => {
        calls.update += 1;
        calls.historyFilesystem += 1;
        return { id: recordId, envelope, limit };
      }
    },
    errorCode: () => "history_write_failed",
    logger: { error: () => { calls.logs += 1; } }
  });

  const rejected = [
    ["plain object", {}],
    ["array", []],
    ["String object", new String("canonical")],
    ["ArrayBuffer", new ArrayBuffer(16)]
  ];
  for (const [label, value] of rejected) {
    assert.deepEqual(
      await handlers.create(null, value),
      { ok: false, code: "invalid_snapshot" },
      `${label} is rejected by the real create handler`
    );
    assert.deepEqual(
      await handlers.update(null, "record-id", value),
      { ok: false, code: "invalid_snapshot" },
      `${label} is rejected by the real update handler`
    );
  }
  assert.deepEqual(
    calls,
    { queue: 0, preferences: 0, create: 0, update: 0, historyFilesystem: 0, logs: 0 },
    "non-primitive envelopes perform zero queue, preference I/O, Store, and logging work"
  );

  const snapshot = {
    source: "unknown",
    title: "Canonical handler contract",
    artist: "Security regression",
    album: "",
    explicit: false,
    originalCoverUrl: "",
    coverUrl: "",
    originalUrl: "",
    finalUrl: "",
    parseMethod: "manual-save-security-test",
    lyrics: "Safe lyrics",
    translationText: "",
    translationEnabled: false
  };
  const canonicalEnvelope = JSON.stringify({ version: 1, snapshot });
  const snapshotWithoutArtist = { ...snapshot };
  delete snapshotWithoutArtist.artist;
  const reversedSnapshot = Object.fromEntries(Object.entries(snapshot).reverse());
  const swappedSnapshotEntries = Object.entries(snapshot);
  [swappedSnapshotEntries[1], swappedSnapshotEntries[2]] = [
    swappedSnapshotEntries[2],
    swappedSnapshotEntries[1]
  ];
  const swappedSnapshot = Object.fromEntries(swappedSnapshotEntries);
  const deepValue = `${'{"next":'.repeat(25_000)}null${"}".repeat(25_000)}`;
  const envelopeWithUrls = (originalUrl, finalUrl = originalUrl) => JSON.stringify({
    version: 1,
    snapshot: { ...snapshot, originalUrl, finalUrl }
  });
  const invalidPrimitiveStrings = [
    ["malformed JSON", '{"version":1,"snapshot":'],
    ["non-canonical whitespace", ` ${canonicalEnvelope}`],
    ["unknown envelope field", JSON.stringify({ version: 1, snapshot, extra: true })],
    ["reordered envelope fields", JSON.stringify({ snapshot, version: 1 })],
    ["missing required artist", JSON.stringify({ version: 1, snapshot: snapshotWithoutArtist })],
    ["unsupported source", JSON.stringify({ version: 1, snapshot: { ...snapshot, source: "attacker-source" } })],
    ["reversed snapshot fields", JSON.stringify({ version: 1, snapshot: reversedSnapshot })],
    ["one swapped snapshot field pair", JSON.stringify({ version: 1, snapshot: swappedSnapshot })],
    ["oversized legal field", JSON.stringify({ version: 1, snapshot: { ...snapshot, lyrics: "x".repeat(600_000) } })],
    ["25,000-level input", `{"version":1,"snapshot":${deepValue}}`],
    [
      "ambiguous original identity with canonical final identity",
      envelopeWithUrls(
        "https://music.163.com/song?id=70001&ID=70002",
        "https://music.163.com/song?id=70002"
      )
    ],
    [
      "canonical original identity with ambiguous final identity",
      envelopeWithUrls(
        "https://music.163.com/song?id=70001",
        "https://music.163.com/song?id=70001&%69d=70002"
      )
    ],
    [
      "QQ path/query identity conflict",
      envelopeWithUrls("https://y.qq.com/n/ryqq/songDetail/003OUlho2HcRHC?songmid=OTHERID")
    ],
    [
      "Apple path/query identity conflict",
      envelopeWithUrls("https://music.apple.com/us/song/example/654322?i=654323")
    ]
  ];
  for (const [label, envelope] of invalidPrimitiveStrings) {
    assert.deepEqual(
      await handlers.create(null, envelope),
      { ok: false, code: "invalid_snapshot" },
      `${label} is rejected before the create mutation queue`
    );
    assert.deepEqual(
      await handlers.update(null, "record-id", envelope),
      { ok: false, code: "invalid_snapshot" },
      `${label} is rejected before the update mutation queue`
    );
  }
  assert.deepEqual(
    calls,
    { queue: 0, preferences: 0, create: 0, update: 0, historyFilesystem: 0, logs: 0 },
    "invalid primitive strings perform zero queue, preference, Store, history filesystem, and logging work"
  );

  assert.deepEqual(
    await handlers.create(null, canonicalEnvelope),
    { ok: true, record: { id: "created", envelope: canonicalEnvelope, limit: 10 } }
  );
  assert.deepEqual(
    await handlers.update(null, "record-id", canonicalEnvelope),
    { ok: true, record: { id: "record-id", envelope: canonicalEnvelope, limit: 10 } }
  );
  assert.deepEqual(
    calls,
    { queue: 2, preferences: 2, create: 1, update: 1, historyFilesystem: 2, logs: 0 },
    "only a complete canonical string enters the real queue, preference, Store, and filesystem path exactly once"
  );
}

async function testLocalAppUrlSelection() {
  assert.equal(normalizeLoopbackHttpUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizeLoopbackHttpUrl("http://127.0.0.42:3000/app"), "http://127.0.0.42:3000/app");
  assert.equal(normalizeLoopbackHttpUrl("http://[::1]:3000"), "http://[::1]:3000/");

  for (const rejected of [
    "https://localhost:3000",
    "http://localhost.evil.example:3000",
    "http://example.com:3000",
    "http://user:password@localhost:3000",
    "file:///C:/app/index.html",
    "not a URL"
  ]) {
    assert.throws(() => normalizeLoopbackHttpUrl(rejected), /ELECTRON_DEV_SERVER_URL/, rejected);
  }

  let localServerStarts = 0;
  const startLocalServer = async () => {
    localServerStarts += 1;
    return "http://127.0.0.1:43123";
  };

  const packaged = await resolveLocalAppUrl({
    isPackaged: true,
    devServerUrl: "http://attacker.example:3000",
    startLocalServer
  });
  assert.deepEqual(packaged, { url: "http://127.0.0.1:43123", waitForReady: false });
  assert.equal(localServerStarts, 1, "packaged builds ignore the configured development server");

  const development = await resolveLocalAppUrl({
    isPackaged: false,
    devServerUrl: "http://localhost:3000",
    startLocalServer
  });
  assert.deepEqual(development, { url: "http://localhost:3000/", waitForReady: true });
  assert.equal(localServerStarts, 1, "valid development URLs do not start the embedded server");

  await assert.rejects(
    resolveLocalAppUrl({
      isPackaged: false,
      devServerUrl: "http://attacker.example:3000",
      startLocalServer
    }),
    /loopback HTTP URL/
  );
  assert.equal(localServerStarts, 1, "invalid development URLs fail closed");

  const developmentFallback = await resolveLocalAppUrl({
    isPackaged: false,
    devServerUrl: undefined,
    startLocalServer
  });
  assert.deepEqual(developmentFallback, { url: "http://127.0.0.1:43123", waitForReady: false });
  assert.equal(localServerStarts, 2, "development without an override starts the embedded server");
}

Promise.all([testManualSaveIpcEarlyRejection(), testLocalAppUrlSelection()])
  .then(() => console.log("Electron security contract tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
