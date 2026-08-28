const { spawn } = require("node:child_process");

const RESULT_PREFIX = "LYRICS_CARD_FONT_SCHEME_OK:";
const CANCEL_RESULT = "LYRICS_CARD_FONT_SCHEME_CANCEL";
const MAX_OUTPUT_BYTES = 8 * 1024;
const POWERSHELL_STDIN_BOOTSTRAP = [
  "$encoded = [Console]::In.ReadToEnd()",
  "$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))",
  "& ([ScriptBlock]::Create($source))"
].join("; ");

const NATIVE_FONT_SCHEME_COPY = Object.freeze({
  zh: {
    description: "分别选择中日韩文字体与西文字体，应用后会同时更新当前方案。",
    cjkLabel: "中日韩文字体",
    latinLabel: "西文字体",
    searchLabel: "搜索系统字体",
    searchPlaceholder: "输入字体名称",
    clearSearchLabel: "清除搜索",
    fontCountFormat: "显示 {0} / {1} 个字体",
    noResultsLabel: "没有匹配的系统字体",
    previewLabel: "组合预览",
    swapLabel: "交换字体",
    restoreLabel: "恢复打开时方案",
    applyLabel: "应用字体方案",
    cancelLabel: "取消"
  },
  "zh-TW": {
    description: "分別選擇中日韓文字體與西文字體，套用後會同時更新目前方案。",
    cjkLabel: "中日韓文字體",
    latinLabel: "西文字體",
    searchLabel: "搜尋系統字體",
    searchPlaceholder: "輸入字體名稱",
    clearSearchLabel: "清除搜尋",
    fontCountFormat: "顯示 {0} / {1} 個字體",
    noResultsLabel: "沒有相符的系統字體",
    previewLabel: "組合預覽",
    swapLabel: "交換字體",
    restoreLabel: "恢復開啟時方案",
    applyLabel: "套用字體方案",
    cancelLabel: "取消"
  },
  en: {
    description: "Choose CJK and Latin fonts separately, then apply both to the current scheme.",
    cjkLabel: "CJK Font",
    latinLabel: "Latin Font",
    searchLabel: "Search system fonts",
    searchPlaceholder: "Type a font name",
    clearSearchLabel: "Clear Search",
    fontCountFormat: "Showing {0} / {1} fonts",
    noResultsLabel: "No matching system fonts",
    previewLabel: "Pairing Preview",
    swapLabel: "Swap Fonts",
    restoreLabel: "Restore Opening Scheme",
    applyLabel: "Apply Font Scheme",
    cancelLabel: "Cancel"
  },
  fr: {
    description: "Choisissez séparément les polices CJK et latine, puis appliquez-les au jeu actuel.",
    cjkLabel: "Police CJK",
    latinLabel: "Police latine",
    searchLabel: "Rechercher dans les polices système",
    searchPlaceholder: "Saisissez un nom de police",
    clearSearchLabel: "Effacer la recherche",
    fontCountFormat: "{0} polices affichées sur {1}",
    noResultsLabel: "Aucune police système correspondante",
    previewLabel: "Aperçu de la combinaison",
    swapLabel: "Permuter les polices",
    restoreLabel: "Rétablir la combinaison initiale",
    applyLabel: "Appliquer le jeu",
    cancelLabel: "Annuler"
  },
  ja: {
    description: "CJK 用と欧文用のフォントを個別に選び、現在の構成へまとめて適用します。",
    cjkLabel: "CJK フォント",
    latinLabel: "欧文フォント",
    searchLabel: "システムフォントを検索",
    searchPlaceholder: "フォント名を入力",
    clearSearchLabel: "検索をクリア",
    fontCountFormat: "{1} 件中 {0} 件を表示",
    noResultsLabel: "一致するシステムフォントはありません",
    previewLabel: "組み合わせプレビュー",
    swapLabel: "フォントを入れ替え",
    restoreLabel: "開いた時の構成に戻す",
    applyLabel: "フォント構成を適用",
    cancelLabel: "キャンセル"
  },
  es: {
    description: "Elige por separado las fuentes CJK y latina y aplica ambas a la combinación actual.",
    cjkLabel: "Fuente CJK",
    latinLabel: "Fuente latina",
    searchLabel: "Buscar fuentes del sistema",
    searchPlaceholder: "Escribe un nombre de fuente",
    clearSearchLabel: "Borrar búsqueda",
    fontCountFormat: "Mostrando {0} de {1} fuentes",
    noResultsLabel: "No hay fuentes del sistema coincidentes",
    previewLabel: "Vista previa de la combinación",
    swapLabel: "Intercambiar fuentes",
    restoreLabel: "Restaurar combinación inicial",
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
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class LyricsCardWindowOwner : IWin32Window
{
    public LyricsCardWindowOwner(IntPtr handle) { Handle = handle; }
    public IntPtr Handle { get; private set; }
}

public static class LyricsCardNativeControls
{
    private const uint EM_SETCUEBANNER = 0x1501;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessage(IntPtr handle, uint message, IntPtr showWhenFocused, string text);

    public static void SetCueBanner(TextBox textBox, string text)
    {
        if (textBox == null || String.IsNullOrWhiteSpace(text)) return;
        SendMessage(textBox.Handle, EM_SETCUEBANNER, new IntPtr(1), text);
    }
}

public sealed class LyricsCardFontListBox : ListBox
{
    private readonly Dictionary<string, Font> previewFonts =
        new Dictionary<string, Font>(StringComparer.OrdinalIgnoreCase);
    private string previewText = String.Empty;
    private string committedFamily = String.Empty;

    public LyricsCardFontListBox()
    {
        DrawMode = DrawMode.OwnerDrawFixed;
        ItemHeight = 44;
        IntegralHeight = false;
        BorderStyle = BorderStyle.FixedSingle;
    }

    public string PreviewText
    {
        get { return previewText; }
        set
        {
            previewText = value ?? String.Empty;
            Invalidate();
        }
    }

    public string CommittedFamily
    {
        get { return committedFamily; }
        set
        {
            committedFamily = value ?? String.Empty;
            Invalidate();
        }
    }

    protected override void OnDrawItem(DrawItemEventArgs e)
    {
        if (e.Index < 0 || e.Index >= Items.Count) return;

        string family = Convert.ToString(Items[e.Index]);
        e.DrawBackground();
        bool selected = (e.State & DrawItemState.Selected) == DrawItemState.Selected;
        Color textColor = selected ? SystemColors.HighlightText : ForeColor;
        TextFormatFlags flags = TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis |
            TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
        Rectangle bounds = e.Bounds;
        int markerWidth = 28;
        int nameWidth = Math.Max(180, (bounds.Width * 42) / 100);
        Rectangle markerBounds = new Rectangle(bounds.X + 6, bounds.Y, markerWidth - 8, bounds.Height);
        Rectangle nameBounds = new Rectangle(bounds.X + markerWidth, bounds.Y, nameWidth - markerWidth, bounds.Height);
        Rectangle previewBounds = new Rectangle(
            bounds.X + nameWidth + 12,
            bounds.Y,
            Math.Max(0, bounds.Width - nameWidth - 20),
            bounds.Height
        );

        if (String.Equals(family, committedFamily, StringComparison.OrdinalIgnoreCase))
        {
            TextRenderer.DrawText(e.Graphics, "\u2713", Font, markerBounds, textColor, flags);
        }
        TextRenderer.DrawText(e.Graphics, family, Font, nameBounds, textColor, flags);
        TextRenderer.DrawText(e.Graphics, previewText, PreviewFont(family), previewBounds, textColor, flags);
        e.DrawFocusRectangle();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            foreach (Font previewFont in previewFonts.Values) previewFont.Dispose();
            previewFonts.Clear();
        }
        base.Dispose(disposing);
    }

    private Font PreviewFont(string family)
    {
        Font cached;
        if (previewFonts.TryGetValue(family, out cached)) return cached;

        Font created = CreateFont(family);
        previewFonts[family] = created;
        return created;
    }

    private Font CreateFont(string family)
    {
        FontStyle[] styles = new FontStyle[]
        {
            FontStyle.Regular,
            FontStyle.Bold,
            FontStyle.Italic,
            FontStyle.Bold | FontStyle.Italic
        };
        foreach (FontStyle style in styles)
        {
            Font candidate = null;
            try
            {
                candidate = new Font(family, 12.0f, style, GraphicsUnit.Point);
                if (String.Equals(candidate.FontFamily.Name, family, StringComparison.OrdinalIgnoreCase)) return candidate;
            }
            catch {}
            if (candidate != null) candidate.Dispose();
        }
        return new Font(Font.FontFamily, 12.0f, FontStyle.Regular, GraphicsUnit.Point);
    }
}
'@ -ReferencedAssemblies System.Windows.Forms,System.Drawing

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
$searchLabel = Read-EncodedText 'LYRICS_CARD_FONT_SEARCH_LABEL_B64'
$searchPlaceholder = Read-EncodedText 'LYRICS_CARD_FONT_SEARCH_PLACEHOLDER_B64'
$clearSearchLabel = Read-EncodedText 'LYRICS_CARD_FONT_CLEAR_SEARCH_LABEL_B64'
$fontCountFormat = Read-EncodedText 'LYRICS_CARD_FONT_COUNT_FORMAT_B64'
$noResultsLabel = Read-EncodedText 'LYRICS_CARD_FONT_NO_RESULTS_LABEL_B64'
$previewLabel = Read-EncodedText 'LYRICS_CARD_FONT_PREVIEW_LABEL_B64'
$swapLabel = Read-EncodedText 'LYRICS_CARD_FONT_SWAP_LABEL_B64'
$restoreLabel = Read-EncodedText 'LYRICS_CARD_FONT_RESTORE_LABEL_B64'
$applyLabel = Read-EncodedText 'LYRICS_CARD_FONT_APPLY_LABEL_B64'
$cancelLabel = Read-EncodedText 'LYRICS_CARD_FONT_CANCEL_LABEL_B64'
$script:initialCjkFamily = $script:cjkFamily
$script:initialLatinFamily = $script:latinFamily
$script:activeRole = 'cjk'
$script:refreshingFontList = $false
$script:cjkDisplayedFamily = ''
$script:latinDisplayedFamily = ''
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
    $form.ClientSize = [System.Drawing.Size]::new(780, 584)
    $form.KeyPreview = $true
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
    $description.Location = [System.Drawing.Point]::new(24, 18)
    $description.Size = [System.Drawing.Size]::new(732, 34)
    $description.Text = $descriptionText
    $form.Controls.Add($description)

    $cjkRoleButton = [System.Windows.Forms.RadioButton]::new()
    $cjkRoleButton.Location = [System.Drawing.Point]::new(24, 60)
    $cjkRoleButton.Size = [System.Drawing.Size]::new(292, 70)
    $cjkRoleButton.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $cjkRoleButton.Padding = [System.Windows.Forms.Padding]::new(10, 0, 10, 0)
    $cjkRoleButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $cjkRoleButton.Appearance = [System.Windows.Forms.Appearance]::Button
    $cjkRoleButton.AutoCheck = $false
    $cjkRoleButton.AutoEllipsis = $true
    $cjkRoleButton.UseMnemonic = $false
    $cjkRoleButton.AccessibleName = $cjkLabelText
    $cjkRoleButton.TabIndex = 0
    $form.Controls.Add($cjkRoleButton)

    $swapButton = [System.Windows.Forms.Button]::new()
    $swapButton.Location = [System.Drawing.Point]::new(326, 78)
    $swapButton.Size = [System.Drawing.Size]::new(128, 36)
    $swapButton.Text = $swapLabel
    $swapButton.AccessibleName = $swapLabel
    $swapButton.TabIndex = 1
    $form.Controls.Add($swapButton)

    $latinRoleButton = [System.Windows.Forms.RadioButton]::new()
    $latinRoleButton.Location = [System.Drawing.Point]::new(454, 60)
    $latinRoleButton.Size = [System.Drawing.Size]::new(292, 70)
    $latinRoleButton.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $latinRoleButton.Padding = [System.Windows.Forms.Padding]::new(10, 0, 10, 0)
    $latinRoleButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $latinRoleButton.Appearance = [System.Windows.Forms.Appearance]::Button
    $latinRoleButton.AutoCheck = $false
    $latinRoleButton.AutoEllipsis = $true
    $latinRoleButton.UseMnemonic = $false
    $latinRoleButton.AccessibleName = $latinLabelText
    $latinRoleButton.TabIndex = 2
    $form.Controls.Add($latinRoleButton)

    $searchCaption = [System.Windows.Forms.Label]::new()
    $searchCaption.Location = [System.Drawing.Point]::new(24, 146)
    $searchCaption.Size = [System.Drawing.Size]::new(360, 20)
    $searchCaption.Text = $searchLabel
    $form.Controls.Add($searchCaption)

    $searchBox = [System.Windows.Forms.TextBox]::new()
    $searchBox.Location = [System.Drawing.Point]::new(24, 169)
    $searchBox.Size = [System.Drawing.Size]::new(500, 28)
    $searchBox.AccessibleName = $searchLabel
    $searchBox.TabIndex = 3
    $form.Controls.Add($searchBox)
    [LyricsCardNativeControls]::SetCueBanner($searchBox, $searchPlaceholder)

    $clearSearchButton = [System.Windows.Forms.Button]::new()
    $clearSearchButton.Location = [System.Drawing.Point]::new(534, 168)
    $clearSearchButton.Size = [System.Drawing.Size]::new(36, 28)
    $clearSearchButton.Text = '×'
    $clearSearchButton.AccessibleName = $clearSearchLabel
    $clearSearchButton.TabIndex = 4
    $clearSearchButton.Enabled = $false
    $form.Controls.Add($clearSearchButton)

    $fontCountLabel = [System.Windows.Forms.Label]::new()
    $fontCountLabel.Location = [System.Drawing.Point]::new(580, 168)
    $fontCountLabel.Size = [System.Drawing.Size]::new(176, 28)
    $fontCountLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleRight
    $form.Controls.Add($fontCountLabel)

    $fontList = [LyricsCardFontListBox]::new()
    $fontList.Location = [System.Drawing.Point]::new(24, 205)
    $fontList.Size = [System.Drawing.Size]::new(732, 210)
    $fontList.AccessibleName = $searchLabel
    $fontList.TabIndex = 5
    $form.Controls.Add($fontList)

    $emptyResults = [System.Windows.Forms.Label]::new()
    $emptyResults.Location = $fontList.Location
    $emptyResults.Size = $fontList.Size
    $emptyResults.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $emptyResults.Text = $noResultsLabel
    $emptyResults.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    $emptyResults.Visible = $false
    $form.Controls.Add($emptyResults)

    $previewGroup = [System.Windows.Forms.GroupBox]::new()
    $previewGroup.Location = [System.Drawing.Point]::new(24, 428)
    $previewGroup.Size = [System.Drawing.Size]::new(732, 88)
    $previewGroup.Text = $previewLabel
    $form.Controls.Add($previewGroup)

    $cjkPreview = [System.Windows.Forms.Label]::new()
    $cjkPreview.Location = [System.Drawing.Point]::new(16, 20)
    $cjkPreview.Size = [System.Drawing.Size]::new(700, 29)
    $cjkPreview.Text = '共に歩んだ旅路を辿れば'
    $cjkPreview.AutoEllipsis = $true
    $previewGroup.Controls.Add($cjkPreview)

    $latinPreview = [System.Windows.Forms.Label]::new()
    $latinPreview.Location = [System.Drawing.Point]::new(16, 50)
    $latinPreview.Size = [System.Drawing.Size]::new(700, 29)
    $latinPreview.Text = 'tomoni ayunda tabiji wo tadoreba'
    $latinPreview.AutoEllipsis = $true
    $previewGroup.Controls.Add($latinPreview)

    $restoreButton = [System.Windows.Forms.Button]::new()
    $restoreButton.Location = [System.Drawing.Point]::new(24, 532)
    $restoreButton.Size = [System.Drawing.Size]::new(260, 36)
    $restoreButton.Text = $restoreLabel
    $restoreButton.AccessibleName = $restoreLabel
    $restoreButton.TabIndex = 6
    $form.Controls.Add($restoreButton)

    $cancelButton = [System.Windows.Forms.Button]::new()
    $cancelButton.Location = [System.Drawing.Point]::new(452, 532)
    $cancelButton.Size = [System.Drawing.Size]::new(130, 36)
    $cancelButton.Text = $cancelLabel
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $cancelButton.TabIndex = 7
    $form.Controls.Add($cancelButton)

    $applyButton = [System.Windows.Forms.Button]::new()
    $applyButton.Location = [System.Drawing.Point]::new(592, 532)
    $applyButton.Size = [System.Drawing.Size]::new(164, 36)
    $applyButton.Text = $applyLabel
    $applyButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $applyButton.TabIndex = 8
    $form.Controls.Add($applyButton)
    $form.AcceptButton = $applyButton
    $form.CancelButton = $cancelButton

    function Get-ActiveFamily {
        if ($script:activeRole -eq 'cjk') { return $script:cjkFamily }
        return $script:latinFamily
    }

    function Get-ActivePreviewText {
        if ($script:activeRole -eq 'cjk') { return $cjkPreview.Text }
        return $latinPreview.Text
    }

    function Update-RoleButtons {
        $cjkRoleButton.Text = $cjkLabelText + [Environment]::NewLine + $script:cjkFamily
        $latinRoleButton.Text = $latinLabelText + [Environment]::NewLine + $script:latinFamily

        foreach ($roleButton in @($cjkRoleButton, $latinRoleButton)) {
            $roleButton.Checked = $false
            $roleButton.BackColor = [System.Drawing.SystemColors]::Control
            $roleButton.ForeColor = [System.Drawing.SystemColors]::ControlText
            $roleButton.FlatAppearance.BorderColor = [System.Drawing.SystemColors]::ControlDark
            $roleButton.FlatAppearance.BorderSize = 1
            $roleButton.FlatAppearance.CheckedBackColor = [System.Drawing.SystemColors]::Highlight
        }
        $activeButton = if ($script:activeRole -eq 'cjk') { $cjkRoleButton } else { $latinRoleButton }
        $activeButton.BackColor = [System.Drawing.SystemColors]::Highlight
        $activeButton.ForeColor = [System.Drawing.SystemColors]::HighlightText
        $activeButton.FlatAppearance.BorderColor = [System.Drawing.SystemColors]::Highlight
        $activeButton.FlatAppearance.BorderSize = 2
        $activeButton.Checked = $true
    }

    function Update-PreviewFonts([string]$candidateFamily = '') {
        $nextCjkFamily = $script:cjkFamily
        $nextLatinFamily = $script:latinFamily
        if (-not [string]::IsNullOrWhiteSpace($candidateFamily)) {
            if ($script:activeRole -eq 'cjk') { $nextCjkFamily = $candidateFamily }
            else { $nextLatinFamily = $candidateFamily }
        }

        if ($nextCjkFamily -ine $script:cjkDisplayedFamily) {
            $nextPreviewFont = New-PreviewFont $nextCjkFamily
            $cjkPreview.Font = $nextPreviewFont
            if ($null -ne $script:cjkPreviewFont) { $script:cjkPreviewFont.Dispose() }
            $script:cjkPreviewFont = $nextPreviewFont
            $script:cjkDisplayedFamily = $nextCjkFamily
        }
        if ($nextLatinFamily -ine $script:latinDisplayedFamily) {
            $nextPreviewFont = New-PreviewFont $nextLatinFamily
            $latinPreview.Font = $nextPreviewFont
            if ($null -ne $script:latinPreviewFont) { $script:latinPreviewFont.Dispose() }
            $script:latinPreviewFont = $nextPreviewFont
            $script:latinDisplayedFamily = $nextLatinFamily
        }
    }

    function Update-DirtyState {
        $isDirty = $script:cjkFamily -cne $script:initialCjkFamily -or
            $script:latinFamily -cne $script:initialLatinFamily
        $applyButton.Enabled = $isDirty
        $restoreButton.Enabled = $isDirty
    }

    function Update-FontList {
        $normalizedQuery = $searchBox.Text.Trim()
        $matches = if ([string]::IsNullOrWhiteSpace($normalizedQuery)) {
            @($fontNames)
        } else {
            @($fontNames | Where-Object {
                $_.IndexOf($normalizedQuery, [StringComparison]::CurrentCultureIgnoreCase) -ge 0
            })
        }
        $currentFamily = Get-ActiveFamily
        $script:refreshingFontList = $true
        $fontList.BeginUpdate()
        try {
            $fontList.Items.Clear()
            foreach ($fontName in $matches) { [void]$fontList.Items.Add($fontName) }
            $fontList.PreviewText = Get-ActivePreviewText
            $fontList.CommittedFamily = $currentFamily
            $selectedIndex = $fontList.FindStringExact($currentFamily)
            if ($selectedIndex -lt 0 -and $fontList.Items.Count -gt 0) { $selectedIndex = 0 }
            $fontList.SelectedIndex = $selectedIndex
        } finally {
            $fontList.EndUpdate()
            $script:refreshingFontList = $false
        }
        $fontCountLabel.Text = [string]::Format($fontCountFormat, $matches.Count, $fontNames.Count)
        $emptyResults.Visible = $matches.Count -eq 0
        $fontList.Visible = $matches.Count -gt 0
        $clearSearchButton.Enabled = $searchBox.Text.Length -gt 0
        if ($fontList.SelectedIndex -ge 0) { Update-PreviewFonts ([string]$fontList.SelectedItem) }
        else { Update-PreviewFonts }
    }

    function Set-ActiveRole([string]$role) {
        if ($role -ne 'cjk' -and $role -ne 'latin') { return }
        $script:activeRole = $role
        Update-RoleButtons
        if ($searchBox.Text.Length -gt 0) { $searchBox.Clear() }
        else { Update-FontList }
        [void]$searchBox.Focus()
    }

    function Commit-SelectedFont {
        $nextFamily = [string]$fontList.SelectedItem
        if ([string]::IsNullOrWhiteSpace($nextFamily)) { return }
        if ($script:activeRole -eq 'cjk') { $script:cjkFamily = $nextFamily }
        else { $script:latinFamily = $nextFamily }
        Update-RoleButtons
        $fontList.CommittedFamily = $nextFamily
        Update-PreviewFonts $nextFamily
        Update-DirtyState
    }

    $cjkRoleButton.Add_Click({ Set-ActiveRole 'cjk' })
    $latinRoleButton.Add_Click({ Set-ActiveRole 'latin' })
    $cjkRoleButton.Add_KeyDown({
        if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Right) {
            Set-ActiveRole 'latin'
            [void]$latinRoleButton.Focus()
            $_.SuppressKeyPress = $true
        }
    })
    $latinRoleButton.Add_KeyDown({
        if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Left) {
            Set-ActiveRole 'cjk'
            [void]$cjkRoleButton.Focus()
            $_.SuppressKeyPress = $true
        }
    })
    $swapButton.Add_Click({
        $previousCjk = $script:cjkFamily
        $script:cjkFamily = $script:latinFamily
        $script:latinFamily = $previousCjk
        Update-RoleButtons
        Update-DirtyState
        if ($searchBox.Text.Length -gt 0) { $searchBox.Clear() }
        else { Update-FontList }
        Update-PreviewFonts
    })
    $restoreButton.Add_Click({
        $script:cjkFamily = $script:initialCjkFamily
        $script:latinFamily = $script:initialLatinFamily
        Update-RoleButtons
        Update-DirtyState
        if ($searchBox.Text.Length -gt 0) { $searchBox.Clear() }
        else { Update-FontList }
        Update-PreviewFonts
    })
    $clearSearchButton.Add_Click({
        $searchBox.Clear()
        [void]$searchBox.Focus()
    })
    $searchBox.Add_TextChanged({ Update-FontList })
    $searchBox.Add_KeyDown({
        if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Escape -and $searchBox.Text.Length -gt 0) {
            $searchBox.Clear()
            $_.SuppressKeyPress = $true
        } elseif (
            $_.KeyCode -eq [System.Windows.Forms.Keys]::Down -or
            $_.KeyCode -eq [System.Windows.Forms.Keys]::Enter
        ) {
            if ($fontList.Items.Count -gt 0) {
                if ($fontList.SelectedIndex -lt 0) { $fontList.SelectedIndex = 0 }
                [void]$fontList.Focus()
            }
            $_.SuppressKeyPress = $true
        }
    })
    $fontList.Add_SelectedIndexChanged({
        if (-not $script:refreshingFontList -and $fontList.SelectedIndex -ge 0) {
            Update-PreviewFonts ([string]$fontList.SelectedItem)
        }
    })
    $fontList.Add_MouseClick({
        if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Commit-SelectedFont }
    })
    $fontList.Add_KeyDown({
        if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Enter -or $_.KeyCode -eq [System.Windows.Forms.Keys]::Space) {
            Commit-SelectedFont
            $_.SuppressKeyPress = $true
        }
    })
    $form.Add_KeyDown({
        if ($_.Control -and $_.KeyCode -eq [System.Windows.Forms.Keys]::F) {
            [void]$searchBox.Focus()
            [void]$searchBox.SelectAll()
            $_.SuppressKeyPress = $true
        }
    })
    $form.Add_Shown({
        [void]$searchBox.Focus()
        [void]$searchBox.SelectAll()
    })

    Update-RoleButtons
    Update-DirtyState
    Update-PreviewFonts
    Update-FontList

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
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_STDIN_BOOTSTRAP],
      {
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          LYRICS_CARD_FONT_OWNER: ownerHandle,
          LYRICS_CARD_CJK_FONT_B64: encodeText(cjkFontFamily.trim()),
          LYRICS_CARD_LATIN_FONT_B64: encodeText(latinFontFamily.trim()),
          LYRICS_CARD_FONT_TITLE_B64: encodeText(title.trim()),
          LYRICS_CARD_FONT_DESCRIPTION_B64: encodeText(copy.description),
          LYRICS_CARD_FONT_CJK_LABEL_B64: encodeText(copy.cjkLabel),
          LYRICS_CARD_FONT_LATIN_LABEL_B64: encodeText(copy.latinLabel),
          LYRICS_CARD_FONT_SEARCH_LABEL_B64: encodeText(copy.searchLabel),
          LYRICS_CARD_FONT_SEARCH_PLACEHOLDER_B64: encodeText(copy.searchPlaceholder),
          LYRICS_CARD_FONT_CLEAR_SEARCH_LABEL_B64: encodeText(copy.clearSearchLabel),
          LYRICS_CARD_FONT_COUNT_FORMAT_B64: encodeText(copy.fontCountFormat),
          LYRICS_CARD_FONT_NO_RESULTS_LABEL_B64: encodeText(copy.noResultsLabel),
          LYRICS_CARD_FONT_PREVIEW_LABEL_B64: encodeText(copy.previewLabel),
          LYRICS_CARD_FONT_SWAP_LABEL_B64: encodeText(copy.swapLabel),
          LYRICS_CARD_FONT_RESTORE_LABEL_B64: encodeText(copy.restoreLabel),
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
    child.stdin.once("error", () => finish(null));
    child.once("error", () => finish(null));
    child.once("close", (code) => {
      if (settled || code !== 0) return finish(null);
      finish(parseFontSchemeDialogResult(stdout.toString("utf8")));
    });
    try {
      child.stdin.end(encodedCommand, "ascii");
    } catch {
      finish(null);
    }
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
  POWERSHELL_STDIN_BOOTSTRAP,
  RESULT_PREFIX,
  parseFontSchemeDialogResult,
  showWindowsFontSchemeDialog
};
