const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  CANCEL_RESULT,
  NATIVE_FONT_SCHEME_COPY,
  NATIVE_FONT_SCHEME_DIALOG_SCRIPT,
  RESULT_PREFIX,
  parseFontSchemeDialogResult,
  showWindowsFontSchemeDialog
} = require("../electron/native-font-dialog");

assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\[System\.Windows\.Forms\.Form\]::new\(\)/);
assert.equal(
  (NATIVE_FONT_SCHEME_DIALOG_SCRIPT.match(/\[System\.Windows\.Forms\.FontDialog\]::new\(\)/g) ?? []).length,
  0,
  "the native scheme form keeps both font choices inside one window"
);
assert.equal(
  (NATIVE_FONT_SCHEME_DIALOG_SCRIPT.match(/\[System\.Windows\.Forms\.ComboBox\]::new\(\)/g) ?? []).length,
  2,
  "the native scheme form exposes one installed-font selector for each font role"
);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /InstalledFontCollection\]::new\(\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /Initialize-FontCombo \$cjkCombo \$fontNames \$script:cjkFamily/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /Initialize-FontCombo \$latinCombo \$fontNames \$script:latinFamily/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$cjkCombo\.Add_SelectedIndexChanged/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$latinCombo\.Add_SelectedIndexChanged/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$form\.ShowDialog\(\$owner\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /DialogResult\]::Cancel/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /DialogResult\]::OK/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /LyricsCardWindowOwner/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /EnableVisualStyles/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /SetCompatibleTextRenderingDefault\(\$false\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /SetProcessDpiAwarenessContext/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\[LyricsCardDpi\]::EnablePerMonitorV2\(\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\[LyricsCardDpi\]::DpiForWindow\(\$owner\.Handle\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$form\.Scale\(\[System\.Drawing\.SizeF\]::new\(\$layoutScale, \$layoutScale\)\)/);
assert.ok(
  NATIVE_FONT_SCHEME_DIALOG_SCRIPT.indexOf("[LyricsCardDpi]::EnablePerMonitorV2()") <
    NATIVE_FONT_SCHEME_DIALOG_SCRIPT.indexOf("Add-Type -AssemblyName System.Windows.Forms"),
  "Per-Monitor V2 awareness is enabled before loading WinForms UI"
);

const encoded = (value) => Buffer.from(value, "utf8").toString("base64");
assert.deepEqual(
  parseFontSchemeDialogResult(`${RESULT_PREFIX}${encoded("Microsoft YaHei")}:${encoded("Arial")}\r\n`),
  { cjkFontFamily: "Microsoft YaHei", latinFontFamily: "Arial" }
);
assert.equal(parseFontSchemeDialogResult(`${CANCEL_RESULT}\r\n`), null);
assert.equal(parseFontSchemeDialogResult(`${RESULT_PREFIX}%%%:${encoded("Arial")}\r\n`), null);
assert.equal(parseFontSchemeDialogResult(`${RESULT_PREFIX}${encoded("Microsoft YaHei")}:QQ\r\n`), null);
assert.equal(parseFontSchemeDialogResult(`${RESULT_PREFIX}${encoded("Bad\nFont")}:${encoded("Arial")}\r\n`), null);
assert.equal(parseFontSchemeDialogResult(`${RESULT_PREFIX}${Buffer.from([0xff]).toString("base64")}:${encoded("Arial")}\r\n`), null);
assert.equal(parseFontSchemeDialogResult(`${RESULT_PREFIX}${encoded("Microsoft YaHei")}\r\n`), null);

async function testSuccessfulSelection() {
  let invocation;
  const spawnImpl = (command, args, options) => {
    invocation = { command, args, options };
    const child = createChild();
    process.nextTick(() => {
      child.stdout.emit("data", `${RESULT_PREFIX}${encoded("Yu Gothic UI")}:${encoded("Segoe UI")}\r\n`);
      child.emit("close", 0);
    });
    return child;
  };

  assert.deepEqual(
    await showWindowsFontSchemeDialog({
      ownerHandle: "123456",
      cjkFontFamily: "Microsoft YaHei",
      latinFontFamily: "Arial",
      locale: "zh",
      title: "自定义字体方案",
      spawnImpl
    }),
    { cjkFontFamily: "Yu Gothic UI", latinFontFamily: "Segoe UI" }
  );
  assert.equal(invocation.command, "powershell.exe");
  assert.deepEqual(
    invocation.args.slice(0, 7),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]
  );
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(invocation.options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(invocation.options.env.LYRICS_CARD_FONT_OWNER, "123456");
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_CJK_FONT_B64"), "Microsoft YaHei");
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_LATIN_FONT_B64"), "Arial");
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_TITLE_B64"), "自定义字体方案");
  assert.equal("LYRICS_CARD_FONT_CHOOSE_LABEL_B64" in invocation.options.env, false);
  assert.equal(
    decodeEnvironment(invocation, "LYRICS_CARD_FONT_DESCRIPTION_B64"),
    NATIVE_FONT_SCHEME_COPY.zh.description
  );
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_APPLY_LABEL_B64"), NATIVE_FONT_SCHEME_COPY.zh.applyLabel);
}

async function testCancellationAndFailure() {
  const valid = {
    ownerHandle: "42",
    cjkFontFamily: "Microsoft YaHei",
    latinFontFamily: "Arial",
    locale: "en",
    title: "Custom font scheme"
  };
  const invalidCases = [
    { ...valid, ownerHandle: "" },
    { ...valid, ownerHandle: "0" },
    { ...valid, ownerHandle: "-1" },
    { ...valid, ownerHandle: "not-a-hwnd" },
    { ...valid, ownerHandle: "9223372036854775808" },
    { ...valid, cjkFontFamily: "" },
    { ...valid, cjkFontFamily: "Bad\nFont" },
    { ...valid, latinFontFamily: "Bad\0Font" },
    { ...valid, title: "" },
    { ...valid, title: "Bad\nTitle" },
    { ...valid, title: "Bad\0Title" },
    { ...valid, title: "x".repeat(161) }
  ];
  for (const input of invalidCases) {
    assert.equal(
      await showWindowsFontSchemeDialog({ ...input, spawnImpl: () => assert.fail("invalid input must not spawn") }),
      null
    );
  }

  assert.equal(
    await showWindowsFontSchemeDialog({
      ...valid,
      spawnImpl: () => {
        throw new Error("spawn threw synchronously");
      }
    }),
    null
  );

  const cancelled = createChild();
  const cancelledResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => cancelled });
  cancelled.stdout.emit("data", `${CANCEL_RESULT}\r\n`);
  cancelled.emit("close", 0);
  assert.equal(await cancelledResult, null);

  const failed = createChild();
  const failedResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => failed });
  failed.emit("error", new Error("spawn failed"));
  assert.equal(await failedResult, null);

  const nonzero = createChild();
  const nonzeroResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => nonzero });
  nonzero.emit("close", 1);
  assert.equal(await nonzeroResult, null);

  const noisy = createChild();
  const noisyResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => noisy });
  noisy.stdout.emit("data", Buffer.alloc(8 * 1024 + 1));
  assert.equal(await noisyResult, null);
  assert.equal(noisy.killCalls, 1);

  const noisyError = createChild();
  const noisyErrorResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => noisyError });
  noisyError.stderr.emit("data", Buffer.alloc(8 * 1024 + 1));
  assert.equal(await noisyErrorResult, null);
  assert.equal(noisyError.killCalls, 1);
}

function decodeEnvironment(invocation, key) {
  return Buffer.from(invocation.options.env[key], "base64").toString("utf8");
}

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    return true;
  };
  return child;
}

Promise.all([testSuccessfulSelection(), testCancellationAndFailure()])
  .then(() => process.stdout.write("Electron native Windows font-scheme dialog tests passed\n"));
