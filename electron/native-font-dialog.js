const { spawn } = require("node:child_process");

const RESULT_PREFIX = "LYRICS_CARD_FONT_SCHEME_OK:";
const CANCEL_RESULT = "LYRICS_CARD_FONT_SCHEME_CANCEL";
const MAX_OUTPUT_BYTES = 8 * 1024;

const NATIVE_FONT_SCHEME_COPY = Object.freeze({
  zh: {
    description: "分别选择中日韩文字体与西文字体，应用后会同时更新当前方案。",
    cjkLabel: "中日韩文字体",
    latinLabel: "西文字体",
    applyLabel: "应用字体方案",
    cancelLabel: "取消"
  },
  "zh-TW": {
    description: "分別選擇中日韓文字體與西文字體，套用後會同時更新目前方案。",
    cjkLabel: "中日韓文字體",
    latinLabel: "西文字體",
    applyLabel: "套用字體方案",
    cancelLabel: "取消"
  },
  en: {
    description: "Choose CJK and Latin fonts separately, then apply both to the current scheme.",
    cjkLabel: "CJK Font",
    latinLabel: "Latin Font",
    applyLabel: "Apply Font Scheme",
    cancelLabel: "Cancel"
  },
  fr: {
    description: "Choisissez séparément les polices CJK et latine, puis appliquez-les au jeu actuel.",
    cjkLabel: "Police CJK",
    latinLabel: "Police latine",
    applyLabel: "Appliquer le jeu",
    cancelLabel: "Annuler"
  },
  ja: {
    description: "CJK 用と欧文用のフォントを個別に選び、現在の構成へまとめて適用します。",
    cjkLabel: "CJK フォント",
    latinLabel: "欧文フォント",
    applyLabel: "フォント構成を適用",
    cancelLabel: "キャンセル"
  },
  es: {
    description: "Elige por separado las fuentes CJK y latina y aplica ambas a la combinación actual.",
    cjkLabel: "Fuente CJK",
    latinLabel: "Fuente latina",
    applyLabel: "Aplicar combinación",
    cancelLabel: "Cancelar"
  }
});

const NATIVE_FONT_SCHEME_DIALOG_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LyricsCardDpi
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForSystem();

    public static void EnablePerMonitorV2()
    {
        try
        {
            if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
        }
        catch (EntryPointNotFoundException) {}
        catch (DllNotFoundException) {}

        try
        {
            if (SetProcessDpiAwareness(2) == 0) return;
        }
        catch (EntryPointNotFoundException) {}
        catch (DllNotFoundException) {}

        try { SetProcessDPIAware(); }
        catch (EntryPointNotFoundException) {}
        catch (DllNotFoundException) {}
    }

    public static uint DpiForWindow(IntPtr window)
    {
        try
        {
            uint dpi = GetDpiForWindow(window);
            if (dpi > 0) return dpi;
        }
        catch (EntryPointNotFoundException) {}
        catch (DllNotFoundException) {}

        try
        {
            uint dpi = GetDpiForSystem();
            if (dpi > 0) return dpi;
        }
        catch (EntryPointNotFoundException) {}
        catch (DllNotFoundException) {}

        return 96;
    }
}
'@

[LyricsCardDpi]::EnablePerMonitorV2()
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

function Read-EncodedText([string]$name) {
    $encoded = [Environment]::GetEnvironmentVariable($name)
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

function New-PreviewFont([string]$family) {
    foreach ($style in @(
        [System.Drawing.FontStyle]::Regular,
        [System.Drawing.FontStyle]::Bold,
        [System.Drawing.FontStyle]::Italic,
        [System.Drawing.FontStyle]([int][System.Drawing.FontStyle]::Bold -bor [int][System.Drawing.FontStyle]::Italic)
    )) {
        $candidate = $null
        try {
            $candidate = [System.Drawing.Font]::new($family, 15.0, $style, [System.Drawing.GraphicsUnit]::Point)
            if ($candidate.FontFamily.Name -ieq $family) { return $candidate }
        } catch {}
        if ($null -ne $candidate) { $candidate.Dispose() }
    }

    $fallback = [System.Drawing.SystemFonts]::MessageBoxFont
    return [System.Drawing.Font]::new($fallback.FontFamily, 15.0, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Point)
}

function Initialize-FontCombo(
    [System.Windows.Forms.ComboBox]$combo,
    [string[]]$fontNames,
    [string]$currentFamily
) {
    foreach ($fontName in $fontNames) { [void]$combo.Items.Add($fontName) }
    $selectedIndex = $combo.FindStringExact($currentFamily)
    if ($selectedIndex -lt 0) {
        [void]$combo.Items.Insert(0, $currentFamily)
        $selectedIndex = 0
    }
    $combo.SelectedIndex = $selectedIndex
}

[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)
$ownerValue = [Int64]::Parse($env:LYRICS_CARD_FONT_OWNER)
$owner = [LyricsCardWindowOwner]::new([IntPtr]::new($ownerValue))
$targetDpi = [LyricsCardDpi]::DpiForWindow($owner.Handle)
$layoutScale = [Math]::Max(1.0, [double]$targetDpi / 96.0)
$script:cjkFamily = Read-EncodedText 'LYRICS_CARD_CJK_FONT_B64'
$script:latinFamily = Read-EncodedText 'LYRICS_CARD_LATIN_FONT_B64'
$title = Read-EncodedText 'LYRICS_CARD_FONT_TITLE_B64'
$descriptionText = Read-EncodedText 'LYRICS_CARD_FONT_DESCRIPTION_B64'
$cjkLabelText = Read-EncodedText 'LYRICS_CARD_FONT_CJK_LABEL_B64'
$latinLabelText = Read-EncodedText 'LYRICS_CARD_FONT_LATIN_LABEL_B64'
$applyLabel = Read-EncodedText 'LYRICS_CARD_FONT_APPLY_LABEL_B64'
$cancelLabel = Read-EncodedText 'LYRICS_CARD_FONT_CANCEL_LABEL_B64'
$script:formFont = $null
$script:cjkPreviewFont = $null
$script:latinPreviewFont = $null
$fontCollection = $null

$form = [System.Windows.Forms.Form]::new()
try {
    $form.SuspendLayout()
    $form.Text = $title
    $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterParent
    $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $false
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $form.ClientSize = [System.Drawing.Size]::new(680, 390)
    $script:formFont = [System.Drawing.Font]::new('Segoe UI', 9.0)
    $form.Font = $script:formFont

    $fontCollection = [System.Drawing.Text.InstalledFontCollection]::new()
    $fontNames = @(
        $fontCollection.Families |
            ForEach-Object { $_.Name } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and -not $_.StartsWith('@') } |
            Sort-Object -Unique
    )

    $description = [System.Windows.Forms.Label]::new()
    $description.Location = [System.Drawing.Point]::new(24, 20)
    $description.Size = [System.Drawing.Size]::new(632, 40)
    $description.Text = $descriptionText
    $form.Controls.Add($description)

    $cjkGroup = [System.Windows.Forms.GroupBox]::new()
    $cjkGroup.Location = [System.Drawing.Point]::new(24, 68)
    $cjkGroup.Size = [System.Drawing.Size]::new(632, 106)
    $cjkGroup.Text = $cjkLabelText
    $form.Controls.Add($cjkGroup)

    $cjkCombo = [System.Windows.Forms.ComboBox]::new()
    $cjkCombo.Location = [System.Drawing.Point]::new(18, 25)
    $cjkCombo.Size = [System.Drawing.Size]::new(586, 28)
    $cjkCombo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $cjkCombo.MaxDropDownItems = 18
    $cjkCombo.AccessibleName = $cjkLabelText
    $cjkCombo.TabIndex = 0
    Initialize-FontCombo $cjkCombo $fontNames $script:cjkFamily
    $cjkGroup.Controls.Add($cjkCombo)

    $cjkPreview = [System.Windows.Forms.Label]::new()
    $cjkPreview.Location = [System.Drawing.Point]::new(18, 58)
    $cjkPreview.Size = [System.Drawing.Size]::new(586, 33)
    $cjkPreview.Text = '共に歩んだ旅路を辿れば'
    $script:cjkPreviewFont = New-PreviewFont $script:cjkFamily
    $cjkPreview.Font = $script:cjkPreviewFont
    $cjkGroup.Controls.Add($cjkPreview)

    $latinGroup = [System.Windows.Forms.GroupBox]::new()
    $latinGroup.Location = [System.Drawing.Point]::new(24, 184)
    $latinGroup.Size = [System.Drawing.Size]::new(632, 106)
    $latinGroup.Text = $latinLabelText
    $form.Controls.Add($latinGroup)

    $latinCombo = [System.Windows.Forms.ComboBox]::new()
    $latinCombo.Location = [System.Drawing.Point]::new(18, 25)
    $latinCombo.Size = [System.Drawing.Size]::new(586, 28)
    $latinCombo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $latinCombo.MaxDropDownItems = 18
    $latinCombo.AccessibleName = $latinLabelText
    $latinCombo.TabIndex = 1
    Initialize-FontCombo $latinCombo $fontNames $script:latinFamily
    $latinGroup.Controls.Add($latinCombo)

    $latinPreview = [System.Windows.Forms.Label]::new()
    $latinPreview.Location = [System.Drawing.Point]::new(18, 58)
    $latinPreview.Size = [System.Drawing.Size]::new(586, 33)
    $latinPreview.Text = 'tomoni ayunda tabiji wo tadoreba'
    $script:latinPreviewFont = New-PreviewFont $script:latinFamily
    $latinPreview.Font = $script:latinPreviewFont
    $latinGroup.Controls.Add($latinPreview)

    $cancelButton = [System.Windows.Forms.Button]::new()
    $cancelButton.Location = [System.Drawing.Point]::new(410, 326)
    $cancelButton.Size = [System.Drawing.Size]::new(112, 36)
    $cancelButton.Text = $cancelLabel
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $cancelButton.TabIndex = 2
    $form.Controls.Add($cancelButton)

    $applyButton = [System.Windows.Forms.Button]::new()
    $applyButton.Location = [System.Drawing.Point]::new(532, 326)
    $applyButton.Size = [System.Drawing.Size]::new(124, 36)
    $applyButton.Text = $applyLabel
    $applyButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $applyButton.TabIndex = 3
    $form.Controls.Add($applyButton)
    $form.AcceptButton = $applyButton
    $form.CancelButton = $cancelButton

    $cjkCombo.Add_SelectedIndexChanged({
        $nextFamily = [string]$cjkCombo.SelectedItem
        if ([string]::IsNullOrWhiteSpace($nextFamily) -or $nextFamily -eq $script:cjkFamily) { return }
        $script:cjkFamily = $nextFamily
        $nextPreviewFont = New-PreviewFont $script:cjkFamily
        $cjkPreview.Font = $nextPreviewFont
        $script:cjkPreviewFont.Dispose()
        $script:cjkPreviewFont = $nextPreviewFont
    })

    $latinCombo.Add_SelectedIndexChanged({
        $nextFamily = [string]$latinCombo.SelectedItem
        if ([string]::IsNullOrWhiteSpace($nextFamily) -or $nextFamily -eq $script:latinFamily) { return }
        $script:latinFamily = $nextFamily
        $nextPreviewFont = New-PreviewFont $script:latinFamily
        $latinPreview.Font = $nextPreviewFont
        $script:latinPreviewFont.Dispose()
        $script:latinPreviewFont = $nextPreviewFont
    })

    $form.Scale([System.Drawing.SizeF]::new($layoutScale, $layoutScale))
    $form.AutoScaleDimensions = [System.Drawing.SizeF]::new([single]$targetDpi, [single]$targetDpi)
    $form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::Dpi
    $form.ResumeLayout($false)

    if ($form.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        $cjkEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:cjkFamily))
        $latinEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:latinFamily))
        [Console]::Out.WriteLine('${RESULT_PREFIX}' + $cjkEncoded + ':' + $latinEncoded)
    } else {
        [Console]::Out.WriteLine('${CANCEL_RESULT}')
    }
} finally {
    $form.Dispose()
    if ($null -ne $script:cjkPreviewFont) { $script:cjkPreviewFont.Dispose() }
    if ($null -ne $script:latinPreviewFont) { $script:latinPreviewFont.Dispose() }
    if ($null -ne $script:formFont) { $script:formFont.Dispose() }
    if ($null -ne $fontCollection) { $fontCollection.Dispose() }
}
`;

function showWindowsFontSchemeDialog({
  ownerHandle,
  cjkFontFamily,
  latinFontFamily,
  locale,
  title,
  spawnImpl = spawn
}) {
  if (
    !isValidOwnerHandle(ownerHandle) ||
    !isValidFontFamily(cjkFontFamily) ||
    !isValidFontFamily(latinFontFamily) ||
    !isSingleLineText(title, 160)
  ) {
    return Promise.resolve(null);
  }

  const copy = NATIVE_FONT_SCHEME_COPY[locale] || NATIVE_FONT_SCHEME_COPY.en;
  const encodedCommand = Buffer.from(NATIVE_FONT_SCHEME_DIALOG_SCRIPT, "utf16le").toString("base64");
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
          LYRICS_CARD_FONT_OWNER: ownerHandle,
          LYRICS_CARD_CJK_FONT_B64: encodeText(cjkFontFamily.trim()),
          LYRICS_CARD_LATIN_FONT_B64: encodeText(latinFontFamily.trim()),
          LYRICS_CARD_FONT_TITLE_B64: encodeText(title.trim()),
          LYRICS_CARD_FONT_DESCRIPTION_B64: encodeText(copy.description),
          LYRICS_CARD_FONT_CJK_LABEL_B64: encodeText(copy.cjkLabel),
          LYRICS_CARD_FONT_LATIN_LABEL_B64: encodeText(copy.latinLabel),
          LYRICS_CARD_FONT_APPLY_LABEL_B64: encodeText(copy.applyLabel),
          LYRICS_CARD_FONT_CANCEL_LABEL_B64: encodeText(copy.cancelLabel)
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
        // The helper may have exited between output and cleanup.
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
      finish(parseFontSchemeDialogResult(stdout.toString("utf8")));
    });
  });
}

function parseFontSchemeDialogResult(output) {
  const line = output.split(/\r?\n/u).map((value) => value.trim()).find((value) => value.startsWith(RESULT_PREFIX));
  if (!line) return null;
  const fields = line.slice(RESULT_PREFIX.length).split(":");
  if (fields.length !== 2) return null;
  const cjkFontFamily = decodeCanonicalBase64(fields[0]);
  const latinFontFamily = decodeCanonicalBase64(fields[1]);
  return isValidFontFamily(cjkFontFamily) && isValidFontFamily(latinFontFamily)
    ? { cjkFontFamily, latinFontFamily }
    : null;
}

function encodeText(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeCanonicalBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.toString("base64") !== value) return null;
    const text = decoded.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(decoded)) return null;
    return text.trim();
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

function isSingleLineText(value, maximumLength) {
  return isBoundedText(value, maximumLength) && !/[\r\n\0]/u.test(value);
}

function isBoundedText(value, maximumLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

module.exports = {
  CANCEL_RESULT,
  NATIVE_FONT_SCHEME_COPY,
  NATIVE_FONT_SCHEME_DIALOG_SCRIPT,
  RESULT_PREFIX,
  parseFontSchemeDialogResult,
  showWindowsFontSchemeDialog
};
