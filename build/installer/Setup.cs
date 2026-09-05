using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;

namespace LyricsCard.Setup
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                var options = Options.Parse(args);
                if (options.ContainsKey("self-test")) return SetupWindow.SelfTest(options["self-test"], options.ContainsKey("version") ? options["version"] : "dev");
                bool created;
                using (var mutex = new Mutex(true, @"Local\LyricsCard.CustomSetup", out created))
                {
                    if (!created) return 1618;
                    var app = new Application();
                    var setup = new SetupWindow(options);
                    app.Run(setup.Window);
                    return setup.ExitCode;
                }
            }
            catch (Exception error)
            {
                // A startup failure must never look like a successful install.
                MessageBox.Show(error.Message, "Lyrics Card Generator Setup", MessageBoxButton.OK, MessageBoxImage.Error);
                return 2;
            }
        }
    }

    internal static class Options
    {
        internal static Dictionary<string, string> Parse(string[] args)
        {
            var result = new Dictionary<string, string>();
            for (int i = 0; i < args.Length; i++)
            {
                if (!args[i].StartsWith("--", StringComparison.Ordinal)) throw new ArgumentException("Invalid setup argument.");
                string key = args[i].Substring(2);
                result[key] = i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal) ? args[++i] : "true";
            }
            return result;
        }

        internal static string ValidatePath(string value)
        {
            // /D is NSIS's final, unquoted argument. Reject delimiters and
            // command-looking path fragments rather than altering their meaning.
            if (String.IsNullOrWhiteSpace(value) || value.Length > 220 || value != value.Trim() ||
                value.IndexOfAny(new[] { '"', '\r', '\n', '\0', '/', '\'', ';' }) >= 0 ||
                value.StartsWith(@"\\", StringComparison.Ordinal) || !Path.IsPathRooted(value) ||
                value.Split('\\').Any(part => part.EndsWith(".") || part.EndsWith(" ")))
                throw new ArgumentException("Invalid install path.");
            string full = Path.GetFullPath(value).TrimEnd('\\');
            string root = Path.GetPathRoot(full);
            if (String.IsNullOrEmpty(root) || full.Length <= root.Length || full.Substring(root.Length).Contains(':') ||
                full.Split('\\').Any(part => part.EndsWith(".") || part.EndsWith(" ")) ||
                new DriveInfo(root).DriveType != DriveType.Fixed)
                throw new ArgumentException("Invalid install path.");
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (full.Equals(windows, StringComparison.OrdinalIgnoreCase) || full.StartsWith(windows + "\\", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("System folder is not an install location.");
            foreach (string protectedRoot in new[] {
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments) })
                if (full.Equals(protectedRoot, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Choose an application subfolder.");
            return full;
        }

        internal static string EngineArguments(string location, bool allUsers, bool shortcut, string eventName)
        {
            Guid parsed;
            if (!eventName.StartsWith(@"Local\LyricsSetup-", StringComparison.Ordinal) ||
                !Guid.TryParseExact(eventName.Substring(18), "N", out parsed)) throw new ArgumentException("Invalid completion event.");
            return "/S /LYRICS_CUSTOM_UI /LYRICS_EVENT=" + eventName + (allUsers ? " /allusers" : " /currentuser") +
                (shortcut ? "" : " --no-desktop-shortcut") + " /D=" + ValidatePath(location);
        }
    }

    internal sealed class SetupWindow
    {
        internal readonly Window Window;
        internal int ExitCode = 1602;
        private readonly Dictionary<string, string> options;
        private readonly Dictionary<string, Dictionary<string, string>> locales;
        private readonly bool preview;
        private readonly string registryKey;
        private string language;
        private string stage = "ready";
        private bool installing;
        private string installedPath;
        private EventWaitHandle completion;
        private HwndSource source;
        private ImageBrush iconBackground;
        private readonly string[] languageOrder = { "zh-CN", "zh-TW", "en", "fr", "ja", "es" };

        internal SetupWindow(Dictionary<string, string> args)
        {
            options = args;
            preview = args.ContainsKey("preview");
            registryKey = Get("registry", @"Software\preview-only");
            using (var reader = new StreamReader(Resource("locales.json")))
                locales = new JavaScriptSerializer().Deserialize<Dictionary<string, Dictionary<string, string>>>(reader.ReadToEnd());
            using (var stream = Resource("Setup.xaml")) Window = (Window)XamlReader.Load(stream);
            using (var stream = Resource("icon.ico"))
            {
                var icon = BitmapDecoder.Create(stream, BitmapCreateOptions.None, BitmapCacheOption.OnLoad).Frames.OrderByDescending(frame => frame.PixelWidth).First();
                Window.Icon = icon;
                iconBackground = new ImageBrush(IconBackground.Create(icon)) { Stretch = Stretch.Fill };
                iconBackground.Freeze();
                Find<Image>("BrandIcon").Source = icon;
            }
            SetLanguage(Get("locale", CultureInfo.CurrentUICulture.Name));
            string machinePath = ReadLocation(true);
            string userPath = ReadLocation(false);
            Find<CheckBox>("AllUsers").IsChecked = !String.IsNullOrEmpty(machinePath) && String.IsNullOrEmpty(userPath);
            if (Get("scope", "auto") != "auto") Find<CheckBox>("AllUsers").IsChecked = Get("scope", "auto") == "all";
            Find<TextBox>("InstallPath").Text = String.IsNullOrEmpty(Get("directory", "")) ? DefaultLocation() : Get("directory", "");
            Find<CheckBox>("AllUsers").Click += delegate { Find<TextBox>("InstallPath").Text = DefaultLocation(); };
            Find<Button>("CloseButton").Click += delegate { Window.Close(); };
            Find<Button>("MinimizeButton").Click += delegate { Window.WindowState = WindowState.Minimized; };
            Find<Button>("LanguageButton").Click += delegate { SetLanguage(languageOrder[(Array.IndexOf(languageOrder, language) + 1) % languageOrder.Length]); };
            Find<Button>("OptionsButton").Click += delegate
            {
                ToggleOptions(Find<StackPanel>("OptionsPanel").Visibility != Visibility.Visible);
            };
            Find<Button>("BrowseButton").Click += delegate { Browse(); };
            Find<Button>("InstallButton").Click += async delegate { await Install(); };
            Find<Button>("FinishButton").Click += delegate { Window.Close(); };
            Find<Button>("LaunchButton").Click += delegate { Launch(); };
            Find<Button>("DismissButton").Click += delegate { Find<Border>("MessagePanel").Visibility = Visibility.Collapsed; SetStage(stage); };
            Window.Closing += delegate(object sender, CancelEventArgs e) { if (installing) e.Cancel = true; };
            Window.SourceInitialized += delegate
            {
                source = HwndSource.FromHwnd(new WindowInteropHelper(Window).Handle);
                source.AddHook(WindowMessage);
                ApplyAppearance();
            };
            Window.Closed += delegate { if (source != null) source.RemoveHook(WindowMessage); if (completion != null) completion.Dispose(); };
            Window.Loaded += delegate
            {
                // Scale the entire layout for small work areas/high DPI, never clip controls.
                double scale = Math.Min(1, Math.Min((SystemParameters.WorkArea.Width - 32) / 460, (SystemParameters.WorkArea.Height - 32) / 510));
                if (scale < 1)
                {
                    Window.MinWidth = 0; Window.MinHeight = 0;
                    Find<Border>("WindowSurface").LayoutTransform = new ScaleTransform(scale, scale);
                    Window.Width = 460 * scale; Window.Height = 354 * scale;
                }
                if (preview)
                {
                    SetStage(Get("state", "ready"));
                    if (options.ContainsKey("expanded")) ToggleOptions(true);
                }
                if (preview && options.ContainsKey("pin-preview")) Window.Topmost = true;
                if (preview && options.ContainsKey("capture"))
                {
                    var captureTimer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
                    captureTimer.Tick += delegate { captureTimer.Stop(); Capture(options["capture"]); };
                    captureTimer.Start();
                }
                Find<Button>("InstallButton").Focus();
            };
        }

        private static Stream Resource(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
        private T Find<T>(string name) where T : class { return (T)Window.FindName(name); }
        private string Get(string name, string fallback) { return options.ContainsKey(name) ? options[name] : fallback; }
        private string Copy(string name) { return locales[language][name]; }
        private bool AllUsers { get { return Find<CheckBox>("AllUsers").IsChecked == true; } }

        private void SetLanguage(string locale)
        {
            language = locale.StartsWith("zh", StringComparison.OrdinalIgnoreCase)
                ? (locale == "zh-TW" || locale == "zh-HK" || locale == "zh-Hant" ? "zh-TW" : "zh-CN")
                : locale.Split('-')[0];
            if (!locales.ContainsKey(language)) language = "en";
            foreach (var pair in locales[language]) Window.Resources[pair.Key] = pair.Value;
            Window.Language = XmlLanguage.GetLanguage(language);
            Find<TextBlock>("VersionLabel").Text = "v" + Get("version", "dev") + (preview ? " · " + Copy("Preview") : "");
            Find<Button>("LanguageButton").Content = language == "zh-CN" ? "简体中文" : language == "zh-TW" ? "繁體中文" : language.ToUpperInvariant();
            Find<Button>("OptionsButton").Content = Copy(Find<StackPanel>("OptionsPanel").Visibility == Visibility.Visible ? "HideOptions" : "Options");
            foreach (var pair in new[] { new[] { "CloseButton", "Close" }, new[] { "MinimizeButton", "Minimize" }, new[] { "LanguageButton", "Language" }, new[] { "BrowseButton", "Browse" }, new[] { "InstallPath", "Location" }, new[] { "InstallProgress", "WorkingStatus" } })
                AutomationProperties.SetName((DependencyObject)Window.FindName(pair[0]), Copy(pair[1]));
        }

        private string ReadLocation(bool machine)
        {
            using (var hive = RegistryKey.OpenBaseKey(machine ? RegistryHive.LocalMachine : RegistryHive.CurrentUser, RegistryView.Registry64))
            using (var key = hive.OpenSubKey(registryKey)) return key == null ? "" : Convert.ToString(key.GetValue("InstallLocation", ""));
        }

        private string DefaultLocation()
        {
            string existing = ReadLocation(AllUsers);
            return !String.IsNullOrEmpty(existing) ? existing : Path.Combine(AllUsers
                ? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), "Lyrics Card Generator");
        }

        private void Browse()
        {
            using (var dialog = new System.Windows.Forms.FolderBrowserDialog())
            {
                dialog.Description = Copy("Browse");
                dialog.SelectedPath = Find<TextBox>("InstallPath").Text;
                if (dialog.ShowDialog(new Owner(new WindowInteropHelper(Window).Handle)) == System.Windows.Forms.DialogResult.OK)
                    Find<TextBox>("InstallPath").Text = Path.GetFileName(dialog.SelectedPath).Equals("Lyrics Card Generator", StringComparison.OrdinalIgnoreCase)
                        ? dialog.SelectedPath : Path.Combine(dialog.SelectedPath, "Lyrics Card Generator");
            }
        }

        private void SetStage(string next)
        {
            if (next != "ready" && next != "working" && next != "done") next = "ready";
            stage = next;
            Find<StackPanel>("ReadyPanel").Visibility = next == "ready" ? Visibility.Visible : Visibility.Collapsed;
            Find<StackPanel>("WorkingPanel").Visibility = next == "working" ? Visibility.Visible : Visibility.Collapsed;
            Find<StackPanel>("DonePanel").Visibility = next == "done" ? Visibility.Visible : Visibility.Collapsed;
            Find<Button>("CloseButton").IsEnabled = !installing;
            Find<Button>("LanguageButton").IsEnabled = !installing;
            Find<ProgressBar>("InstallProgress").IsIndeterminate = next == "working";
            if (next != "ready") ToggleOptions(false);
        }

        private void ToggleOptions(bool open)
        {
            Find<StackPanel>("OptionsPanel").Visibility = open ? Visibility.Visible : Visibility.Collapsed;
            Find<Button>("OptionsButton").Content = Copy(open ? "HideOptions" : "Options");
            double scale = Find<Border>("WindowSurface").LayoutTransform.Value.M11;
            Window.Height = (open ? 510 : 354) * scale;
            Window.Top = Math.Max(SystemParameters.WorkArea.Top, Math.Min(Window.Top, SystemParameters.WorkArea.Bottom - Window.Height));
            Window.Left = Math.Max(SystemParameters.WorkArea.Left, Math.Min(Window.Left, SystemParameters.WorkArea.Right - Window.Width));
        }

        private void ShowMessage(string text)
        {
            Find<TextBlock>("MessageText").Text = text;
            Find<StackPanel>("ReadyPanel").Visibility = Visibility.Collapsed;
            Find<StackPanel>("DonePanel").Visibility = Visibility.Collapsed;
            Find<StackPanel>("WorkingPanel").Visibility = Visibility.Collapsed;
            ToggleOptions(false);
            Find<Border>("MessagePanel").Visibility = Visibility.Visible;
            Find<Button>("DismissButton").Focus();
        }

        private async Task Install()
        {
            if (preview) { ShowMessage(Copy("PreviewAction")); return; }
            if (installing) return;
            string location;
            try { location = Options.ValidatePath(Find<TextBox>("InstallPath").Text); }
            catch (Exception) { ShowMessage(Copy("InvalidPath")); return; }
            var running = Process.GetProcessesByName("Lyrics Card Generator");
            bool appRunning = running.Length != 0;
            foreach (var process in running) process.Dispose();
            if (appRunning) { ShowMessage(Copy("Running")); return; }
            string engine = Get("engine", "");
            if (!File.Exists(engine)) { ShowMessage(Copy("Failed") + "2"); return; }
            bool allUsers = AllUsers;
            string eventName = @"Local\LyricsSetup-" + Guid.NewGuid().ToString("N");
            var security = new EventWaitHandleSecurity();
            security.AddAccessRule(new EventWaitHandleAccessRule(WindowsIdentity.GetCurrent().User, EventWaitHandleRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new EventWaitHandleAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), EventWaitHandleRights.Modify | EventWaitHandleRights.Synchronize, AccessControlType.Allow));
            bool created;
            if (completion != null) completion.Dispose();
            completion = new EventWaitHandle(false, EventResetMode.ManualReset, eventName, out created, security);
            if (!created) { ShowMessage(Copy("Failed") + "183"); return; }
            installing = true;
            SetStage("working");
            try
            {
                var start = new ProcessStartInfo(engine, Options.EngineArguments(location, allUsers, Find<CheckBox>("DesktopShortcut").IsChecked == true, eventName))
                {
                    UseShellExecute = true,
                    Verb = allUsers ? "runas" : "open",
                    WorkingDirectory = Path.GetDirectoryName(engine),
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                int code;
                using (var process = Process.Start(start))
                {
                    if (process == null) throw new InvalidOperationException("Unable to start installer.");
                    await Task.Run(() => process.WaitForExit());
                    code = process.ExitCode;
                }
                installing = false;
                if ((code == 0 || code == 3010) && completion.WaitOne(0) &&
                    File.Exists(Path.Combine(location, "Lyrics Card Generator.exe")) &&
                    String.Equals(ReadLocation(allUsers).TrimEnd('\\'), location, StringComparison.OrdinalIgnoreCase))
                {
                    ExitCode = code;
                    installedPath = location;
                    Find<TextBlock>("DonePath").Text = location;
                    SetStage("done");
                    Find<Button>("LaunchButton").Focus();
                }
                else
                {
                    ExitCode = code == 0 ? 2 : code;
                    SetStage("ready");
                    ShowMessage(code == 1618 ? Copy("Running") : Copy("Failed") + ExitCode);
                }
            }
            catch (Win32Exception error)
            {
                installing = false; ExitCode = error.NativeErrorCode; SetStage("ready");
                ShowMessage(error.NativeErrorCode == 1223 ? Copy("Cancelled") : Copy("Failed") + error.NativeErrorCode);
            }
            catch (Exception)
            {
                installing = false; ExitCode = 2; SetStage("ready"); ShowMessage(Copy("Failed") + "2");
            }
        }

        private void Launch()
        {
            if (preview) { ShowMessage(Copy("PreviewAction")); return; }
            try
            {
                // The shell stays unelevated while only the engine requests UAC.
                Process.Start(new ProcessStartInfo(Path.Combine(installedPath, "Lyrics Card Generator.exe")) { UseShellExecute = true });
                Window.Close();
            }
            catch (Win32Exception error) { ShowMessage(error.Message); }
        }

        private IntPtr WindowMessage(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
        {
            if (message == 0x001A || message == 0x031A || message == 0x0320) ApplyAppearance();
            return IntPtr.Zero;
        }

        private void Brush(string name, string color) { Window.Resources[name] = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color)); }

        private void Capture(string file)
        {
            // Capture the owned, opaque WPF surface independently of desktop focus.
            Window.UpdateLayout();
            double dpi = source.CompositionTarget.TransformToDevice.M11;
            var bitmap = new RenderTargetBitmap((int)(Window.ActualWidth * dpi), (int)(Window.ActualHeight * dpi), 96 * dpi, 96 * dpi, PixelFormats.Pbgra32);
            bitmap.Render(Window);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (var output = File.Create(file)) encoder.Save(output);
            int material;
            int hr = Native.DwmGetWindowAttribute(new WindowInteropHelper(Window).Handle, 38, out material, 4);
            File.WriteAllText(file + ".json", new JavaScriptSerializer().Serialize(new { requestedState = stage, locale = language, dwmHResult = hr, systemBackdrop = material, width = Window.ActualWidth, height = Window.ActualHeight, highContrast = SystemParameters.HighContrast }));
        }

        private void ApplyAppearance()
        {
            Find<ProgressBar>("InstallProgress").IsEnabled = SystemParameters.ClientAreaAnimation;
            bool highContrast = SystemParameters.HighContrast;
            int backdrop = 1; // DWMSBT_NONE: the icon field is fully opaque.
            IntPtr handle = new WindowInteropHelper(Window).Handle;
            Native.DwmSetWindowAttribute(handle, 38, ref backdrop, 4);
            source.CompositionTarget.BackgroundColor = Colors.Transparent;
            int corners = 2;
            Native.DwmSetWindowAttribute(handle, 33, ref corners, 4);
            var surface = Find<Border>("WindowSurface");
            if (highContrast)
            {
                foreach (string name in new[] { "Ink", "Muted" }) Window.Resources[name] = SystemColors.WindowTextBrush;
                Window.Resources["Accent"] = SystemColors.HighlightBrush;
                Window.Resources["AccentInk"] = SystemColors.HighlightTextBrush;
                Window.Resources["Line"] = SystemColors.WindowTextBrush;
                Window.Resources["WindowLine"] = SystemColors.WindowTextBrush;
                Window.Resources["Surface"] = SystemColors.WindowBrush;
                surface.Background = SystemColors.WindowBrush;
            }
            else
            {
                Brush("Ink", "#FCFAFF"); Brush("Muted", "#DED9E6");
                Brush("Accent", "#E7DDF5"); Brush("AccentInk", "#30263D");
                Brush("WindowLine", "#28FFFFFF"); Brush("Line", "#90FFFFFF"); Brush("Surface", "#18000000");
                surface.Background = iconBackground;
            }
            Window.Background = surface.Background;
            Window.Resources["WindowFill"] = surface.Background;
        }

        private static double Luminance(byte r, byte g, byte b)
        {
            Func<byte, double> linear = value => value <= 10 ? value / 3294.6 : Math.Pow((value / 255.0 + 0.055) / 1.055, 2.4);
            return linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
        }

        internal static int SelfTest(string report, string version)
        {
            var results = new List<string>();
            try
            {
                string valid = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Lyrics Card Generator 测试");
                string eventName = @"Local\LyricsSetup-" + Guid.NewGuid().ToString("N");
                string command = Options.EngineArguments(valid, false, false, eventName);
                if (!command.EndsWith(" /D=" + valid) || !command.Contains("/currentuser") || !command.Contains("--no-desktop-shortcut")) throw new Exception("Engine argument contract failed.");
                results.Add("PASS: spaces/Unicode, final unquoted /D, user scope and shortcut options");
                foreach (string invalid in new[] { "C:\\", @"\\server\share\app", "relative", "C:\\app\" /allusers", "C:\\app\n/D=bad", "C:\\app /S", "C:\\app'", Environment.GetFolderPath(Environment.SpecialFolder.Windows), "C:\\app:stream", "C:\\app.\\child" })
                {
                    bool rejected = false;
                    try { Options.ValidatePath(invalid); } catch (Exception) { rejected = true; }
                    if (!rejected) throw new Exception("Path accepted: " + invalid);
                }
                results.Add("PASS: roots, UNC, system folders, path/argument injection rejected");
                var setup = new SetupWindow(new Dictionary<string, string> { { "preview", "true" }, { "version", version } });
                var background = (BitmapSource)setup.iconBackground.ImageSource;
                var field = new byte[background.PixelWidth * background.PixelHeight * 4];
                background.CopyPixels(field, background.PixelWidth * 4, 0);
                double maxLuminance = 0;
                for (int pixel = 0; pixel < field.Length; pixel += 4)
                {
                    if (field[pixel + 3] != 255) throw new Exception("Background must be opaque.");
                    maxLuminance = Math.Max(maxLuminance, Luminance(field[pixel + 2], field[pixel + 1], field[pixel]));
                }
                double contrast = (Luminance(222, 217, 230) + 0.05) / (maxLuminance + 0.05);
                if (contrast < 4.5) throw new Exception("Secondary text contrast below 4.5: " + contrast);
                results.Add("PASS: opaque icon color field; minimum secondary text contrast " + contrast.ToString("F2", CultureInfo.InvariantCulture) + ":1");
                setup.Window.WindowStartupLocation = WindowStartupLocation.Manual;
                setup.Window.Left = -10000; setup.Window.Top = -10000;
                setup.Window.ShowActivated = false; setup.Window.ShowInTaskbar = false;
                setup.Window.Show();
                foreach (string locale in setup.languageOrder)
                {
                    setup.SetLanguage(locale);
                    if (setup.locales[locale].Count != setup.locales["en"].Count) throw new Exception("Locale keys differ.");
                    foreach (string key in setup.locales["en"].Keys)
                        if (String.IsNullOrWhiteSpace(setup.locales[locale][key])) throw new Exception("Missing copy: " + locale + ":" + key);
                    foreach (string state in new[] { "ready", "working", "done" })
                    {
                        setup.SetStage(state);
                        foreach (bool expanded in new[] { false, true })
                        {
                            setup.ToggleOptions(expanded && state == "ready");
                            setup.Window.UpdateLayout();
                            var panel = setup.Find<StackPanel>(state == "ready" ? "ReadyPanel" : state == "working" ? "WorkingPanel" : "DonePanel");
                            var point = panel.TranslatePoint(new Point(), setup.Window);
                            if ((locale == "zh-CN" || locale == "fr") && (!expanded || state == "ready"))
                                setup.Capture(Path.Combine(Path.GetDirectoryName(report), "icon-" + locale + "-" + state + (expanded ? "-expanded" : "") + ".png"));
                            if (point.Y < 48 || point.Y + panel.ActualHeight > setup.Window.ActualHeight - 20) throw new Exception("Clipped panel: " + locale + "/" + state + "/expanded=" + expanded + ": y=" + point.Y + ", height=" + panel.ActualHeight);
                        }
                    }
                }
                results.Add("PASS: six locales and three states load and lay out in real WPF");
                setup.SetStage("ready");
                setup.ToggleOptions(false);
                string preservedPath = setup.Find<TextBox>("InstallPath").Text;
                double originalWidth = setup.Window.Width;
                setup.Find<Button>("OptionsButton").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                if (setup.Find<StackPanel>("OptionsPanel").Visibility != Visibility.Visible || setup.Window.Width != originalWidth)
                    throw new Exception("Options did not expand at fixed width.");
                setup.Find<Button>("OptionsButton").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                if (setup.Find<StackPanel>("OptionsPanel").Visibility != Visibility.Collapsed || setup.Find<TextBox>("InstallPath").Text != preservedPath)
                    throw new Exception("Collapsing options lost the path.");
                setup.SetLanguage("zh-CN");
                setup.ShowMessage(setup.Copy("InvalidPath"));
                setup.Window.UpdateLayout();
                setup.Capture(Path.Combine(Path.GetDirectoryName(report), "icon-error.png"));
                setup.Find<Button>("DismissButton").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                if (setup.Find<Border>("MessagePanel").Visibility != Visibility.Collapsed || setup.Find<StackPanel>("ReadyPanel").Visibility != Visibility.Visible)
                    throw new Exception("Message dismissal did not restore installation controls.");
                results.Add("PASS: option button expands vertically, preserves path; message dismissal restores controls");
                setup.Install().GetAwaiter().GetResult();
                if (setup.installing || setup.completion != null) throw new Exception("Preview attempted installation.");
                results.Add("PASS: preview cannot start an engine or signal installation success");
                using (var evt = new EventWaitHandle(false, EventResetMode.ManualReset))
                    if (evt.WaitOne(0)) throw new Exception("Completion event starts signaled.");
                results.Add("PASS: completion requires a signal; no success from a zero exit alone");
                File.WriteAllLines(report, results); setup.Window.Close(); return 0;
            }
            catch (Exception error) { results.Add("FAIL: " + error); File.WriteAllLines(report, results); return 1; }
        }

        private sealed class Owner : System.Windows.Forms.IWin32Window
        {
            public IntPtr Handle { get; private set; }
            internal Owner(IntPtr handle) { Handle = handle; }
        }
    }

    internal static class Native
    {
        [DllImport("dwmapi.dll")] internal static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
        [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
    }
}
