const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const {
  CANCEL_RESULT,
  NATIVE_FONT_SCHEME_COPY,
  NATIVE_FONT_SCHEME_DIALOG_SCRIPT,
  POWERSHELL_STDIN_BOOTSTRAP,
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
  0,
  "the searchable workbench no longer duplicates the installed-font list across two combo boxes"
);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /InstalledFontCollection\]::new\(\)/);
assert.equal(
  (NATIVE_FONT_SCHEME_DIALOG_SCRIPT.match(/\[LyricsCardFontListBox\]::new\(\)/g) ?? []).length,
  1,
  "both font roles share one owner-drawn installed-font browser"
);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /public sealed class LyricsCardFontListBox : ListBox/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /DrawMode = DrawMode\.OwnerDrawFixed/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /TextRenderer\.DrawText\(e\.Graphics, previewText, PreviewFont\(family\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$searchBox\.Add_TextChanged\(\{ Update-FontList \}\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /IndexOf\(\$normalizedQuery, \[StringComparison\]::CurrentCultureIgnoreCase\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$fontCountLabel\.Text = \[string\]::Format\(\$fontCountFormat/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$cjkRoleButton\.Add_Click\(\{ Set-ActiveRole 'cjk' \}\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$latinRoleButton\.Add_Click\(\{ Set-ActiveRole 'latin' \}\)/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$swapButton\.Add_Click/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$restoreButton\.Add_Click/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$applyButton\.Enabled = \$isDirty/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$fontList\.Add_KeyDown/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$form\.Add_KeyDown/);
assert.match(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, /\$form\.Add_Shown\([\s\S]*?\$searchBox\.Focus\(\)/);
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
assert.match(POWERSHELL_STDIN_BOOTSTRAP, /\[Console\]::In\.ReadToEnd\(\)/);
assert.match(POWERSHELL_STDIN_BOOTSTRAP, /\[ScriptBlock\]::Create\(\$source\)/);

for (const [locale, copy] of Object.entries(NATIVE_FONT_SCHEME_COPY)) {
  for (const key of [
    "description",
    "cjkLabel",
    "latinLabel",
    "searchLabel",
    "searchPlaceholder",
    "clearSearchLabel",
    "fontCountFormat",
    "noResultsLabel",
    "previewLabel",
    "swapLabel",
    "restoreLabel",
    "applyLabel",
    "cancelLabel"
  ]) {
    assert.equal(typeof copy[key], "string", `${locale}.${key} is localized`);
    assert.ok(copy[key].trim().length > 0, `${locale}.${key} is not blank`);
  }
  assert.match(copy.fontCountFormat, /\{0\}/, `${locale} count copy contains the filtered count`);
  assert.match(copy.fontCountFormat, /\{1\}/, `${locale} count copy contains the total count`);
}

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

function testWindowsRuntimeSmoke() {
  if (process.platform !== "win32") return;

  const runtimeProbe = `(& {
    $form.Opacity = 0
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()
    foreach ($button in @($swapButton, $restoreButton, $cancelButton, $applyButton)) {
      $measured = [System.Windows.Forms.TextRenderer]::MeasureText(
        $button.Text,
        $button.Font,
        [System.Drawing.Size]::new($button.ClientSize.Width - 12, [Int32]::MaxValue),
        [System.Windows.Forms.TextFormatFlags]::WordBreak -bor [System.Windows.Forms.TextFormatFlags]::NoPrefix
      )
      if ($measured.Height -gt $button.ClientSize.Height - 6) { throw 'localized button copy is clipped' }
    }
    $countWidth = [System.Windows.Forms.TextRenderer]::MeasureText($fontCountLabel.Text, $fontCountLabel.Font).Width
    if ($countWidth -gt $fontCountLabel.ClientSize.Width) { throw 'localized font count is clipped' }
    if ($fontList.Items.Count -ne $fontNames.Count) { throw 'initial font list is incomplete' }
    if ($applyButton.Enabled -or $restoreButton.Enabled) { throw 'clean scheme actions must start disabled' }
    $searchBox.Text = 'Arial'
    [System.Windows.Forms.Application]::DoEvents()
    if ($fontList.Items.Count -lt 1) { throw 'search must return at least one Arial family' }
    foreach ($item in $fontList.Items) {
      if ([string]$item -notmatch 'Arial') { throw 'search returned an unrelated font' }
    }
    $fontList.SelectedIndex = 0
    Commit-SelectedFont
    if (-not $applyButton.Enabled -or -not $restoreButton.Enabled) { throw 'committing a new font must dirty the scheme' }
    $chosenCjk = $script:cjkFamily
    Set-ActiveRole 'latin'
    if ($searchBox.Text.Length -ne 0) { throw 'changing roles must clear the previous query' }
    $previousLatin = $script:latinFamily
    $swapButton.PerformClick()
    if ($script:cjkFamily -cne $previousLatin -or $script:latinFamily -cne $chosenCjk) { throw 'swap must exchange both draft roles' }
    $restoreButton.PerformClick()
    if ($script:cjkFamily -cne $script:initialCjkFamily -or $script:latinFamily -cne $script:initialLatinFamily) { throw 'restore must recover the opening scheme' }
    if ($applyButton.Enabled -or $restoreButton.Enabled) { throw 'restoring the opening scheme must clear dirty state' }
    $searchBox.Text = '__lyrics_card_no_such_font__'
    [System.Windows.Forms.Application]::DoEvents()
    if (-not $emptyResults.Visible -or $fontList.Visible) { throw 'empty search state must replace the font list' }
    $form.Hide()
    [System.Windows.Forms.DialogResult]::Cancel
  })`;
  const script = NATIVE_FONT_SCHEME_DIALOG_SCRIPT.replace("$form.ShowDialog($owner)", runtimeProbe);
  const copy = NATIVE_FONT_SCHEME_COPY.fr;
  const env = {
    ...process.env,
    LYRICS_CARD_FONT_OWNER: "1",
    LYRICS_CARD_CJK_FONT_B64: encoded("Microsoft YaHei"),
    LYRICS_CARD_LATIN_FONT_B64: encoded("Arial"),
    LYRICS_CARD_FONT_TITLE_B64: encoded("Custom font scheme"),
    LYRICS_CARD_FONT_DESCRIPTION_B64: encoded(copy.description),
    LYRICS_CARD_FONT_CJK_LABEL_B64: encoded(copy.cjkLabel),
    LYRICS_CARD_FONT_LATIN_LABEL_B64: encoded(copy.latinLabel),
    LYRICS_CARD_FONT_SEARCH_LABEL_B64: encoded(copy.searchLabel),
    LYRICS_CARD_FONT_SEARCH_PLACEHOLDER_B64: encoded(copy.searchPlaceholder),
    LYRICS_CARD_FONT_CLEAR_SEARCH_LABEL_B64: encoded(copy.clearSearchLabel),
    LYRICS_CARD_FONT_COUNT_FORMAT_B64: encoded(copy.fontCountFormat),
    LYRICS_CARD_FONT_NO_RESULTS_LABEL_B64: encoded(copy.noResultsLabel),
    LYRICS_CARD_FONT_PREVIEW_LABEL_B64: encoded(copy.previewLabel),
    LYRICS_CARD_FONT_SWAP_LABEL_B64: encoded(copy.swapLabel),
    LYRICS_CARD_FONT_RESTORE_LABEL_B64: encoded(copy.restoreLabel),
    LYRICS_CARD_FONT_APPLY_LABEL_B64: encoded(copy.applyLabel),
    LYRICS_CARD_FONT_CANCEL_LABEL_B64: encoded(copy.cancelLabel)
  };
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_STDIN_BOOTSTRAP],
    {
      env,
      encoding: "utf8",
      input: Buffer.from(script, "utf16le").toString("base64"),
      maxBuffer: 64 * 1024,
      timeout: 30_000,
      windowsHide: true
    }
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(CANCEL_RESULT));
}

testWindowsRuntimeSmoke();

async function testSuccessfulSelection() {
  let invocation;
  const spawnImpl = (command, args, options) => {
    invocation = { command, args, options };
    const child = createChild();
    invocation.child = child;
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
  assert.deepEqual(invocation.args, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    POWERSHELL_STDIN_BOOTSTRAP
  ]);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(invocation.options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(invocation.child.stdin.endCalls, 1);
  assert.equal(invocation.child.stdin.encoding, "ascii");
  assert.equal(
    Buffer.from(invocation.child.stdin.payload, "base64").toString("utf16le"),
    NATIVE_FONT_SCHEME_DIALOG_SCRIPT,
    "the complete static workbench script is delivered through stdin without the Windows command-line limit"
  );
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
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_SEARCH_LABEL_B64"), NATIVE_FONT_SCHEME_COPY.zh.searchLabel);
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_CLEAR_SEARCH_LABEL_B64"), NATIVE_FONT_SCHEME_COPY.zh.clearSearchLabel);
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_COUNT_FORMAT_B64"), NATIVE_FONT_SCHEME_COPY.zh.fontCountFormat);
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_SWAP_LABEL_B64"), NATIVE_FONT_SCHEME_COPY.zh.swapLabel);
  assert.equal(decodeEnvironment(invocation, "LYRICS_CARD_FONT_RESTORE_LABEL_B64"), NATIVE_FONT_SCHEME_COPY.zh.restoreLabel);
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

  const stdinFailed = createChild();
  const stdinFailedResult = showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => stdinFailed });
  stdinFailed.stdin.emit("error", new Error("stdin failed"));
  assert.equal(await stdinFailedResult, null);

  const stdinThrow = createChild();
  stdinThrow.stdin.end = () => {
    throw new Error("stdin end threw");
  };
  assert.equal(await showWindowsFontSchemeDialog({ ...valid, spawnImpl: () => stdinThrow }), null);

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
  child.stdin = new EventEmitter();
  child.stdin.endCalls = 0;
  child.stdin.end = (payload, encoding) => {
    child.stdin.endCalls += 1;
    child.stdin.payload = payload;
    child.stdin.encoding = encoding;
  };
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    return true;
  };
  return child;
}

Promise.all([testSuccessfulSelection(), testCancellationAndFailure()])
  .then(() => process.stdout.write("Electron native Windows font-scheme dialog tests passed\n"));
