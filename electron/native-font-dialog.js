const { spawn } = require("node:child_process");

const RESULT_PREFIX = "LYRICS_CARD_FONT_OK:";
const CANCEL_RESULT = "LYRICS_CARD_FONT_CANCEL";
const MAX_OUTPUT_BYTES = 8 * 1024;

const NATIVE_FONT_DIALOG_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Windows.Forms;
public sealed class LyricsCardWindowOwner : IWin32Window
{
    public LyricsCardWindowOwner(IntPtr handle) { Handle = handle; }
    public IntPtr Handle { get; private set; }
}
'@ -ReferencedAssemblies System.Windows.Forms

[System.Windows.Forms.Application]::EnableVisualStyles()
$family = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:LYRICS_CARD_FONT_FAMILY_B64))
$ownerValue = [Int64]::Parse($env:LYRICS_CARD_FONT_OWNER)
$owner = [LyricsCardWindowOwner]::new([IntPtr]::new($ownerValue))
$dialog = [System.Windows.Forms.FontDialog]::new()
try {
    $dialog.FontMustExist = $true
    $dialog.ShowEffects = $false
    $dialog.ShowHelp = $false
    $dialog.AllowVerticalFonts = $false
    try {
        $dialog.Font = [System.Drawing.Font]::new($family, 10.0, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
    } catch {}

    if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.Font.FontFamily.Name))
        [Console]::Out.WriteLine('${RESULT_PREFIX}' + $selected)
    } else {
        [Console]::Out.WriteLine('${CANCEL_RESULT}')
    }
} finally {
    $dialog.Dispose()
}
`;

function showWindowsFontDialog({ ownerHandle, selectedFamily, spawnImpl = spawn }) {
  if (!isValidOwnerHandle(ownerHandle) || !isValidFontFamily(selectedFamily)) {
    return Promise.resolve(null);
  }

  const encodedCommand = Buffer.from(NATIVE_FONT_DIALOG_SCRIPT, "utf16le").toString("base64");
  let child;
  try {
    child = spawnImpl(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
      {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          LYRICS_CARD_FONT_FAMILY_B64: Buffer.from(selectedFamily.trim(), "utf8").toString("base64"),
          LYRICS_CARD_FONT_OWNER: ownerHandle
        }
      }
    );
  } catch {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOversizedOutput = () => {
      try {
        child.kill();
      } catch {
        // The helper may have exited between the output event and this cleanup attempt.
      }
      finish(null);
    };

    child.stdout.on("data", (chunk) => {
      if (settled) return;
      stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
      if (stdout.length > MAX_OUTPUT_BYTES) rejectOversizedOutput();
    });
    child.stderr.on("data", (chunk) => {
      if (settled) return;
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > MAX_OUTPUT_BYTES) rejectOversizedOutput();
    });
    child.once("error", () => finish(null));
    child.once("close", (code) => {
      if (settled || code !== 0) return finish(null);
      finish(parseFontDialogResult(stdout.toString("utf8")));
    });
  });
}

function parseFontDialogResult(output) {
  const line = output.split(/\r?\n/u).map((value) => value.trim()).find((value) => value.startsWith(RESULT_PREFIX));
  if (!line) return null;
  try {
    const encodedFamily = line.slice(RESULT_PREFIX.length);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encodedFamily)) return null;
    const decoded = Buffer.from(encodedFamily, "base64");
    if (decoded.toString("base64") !== encodedFamily) return null;
    const family = decoded.toString("utf8").trim();
    return isValidFontFamily(family) ? family : null;
  } catch {
    return null;
  }
}

function isValidOwnerHandle(value) {
  if (typeof value !== "string" || !/^\d{1,20}$/u.test(value)) return false;
  const handle = BigInt(value);
  return handle > 0n && handle <= 0x7fff_ffff_ffff_ffffn;
}

function isValidFontFamily(value) {
  return isBoundedText(value, 256) && !/[\r\n\0]/u.test(value);
}

function isBoundedText(value, maximumLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

module.exports = {
  CANCEL_RESULT,
  NATIVE_FONT_DIALOG_SCRIPT,
  RESULT_PREFIX,
  parseFontDialogResult,
  showWindowsFontDialog
};
