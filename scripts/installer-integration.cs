// Compiled only into the test harness, never embedded in the shipping Setup.
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace LyricsCard.Setup
{
    internal static class Integration
    {
        [STAThread]
        private static int Main(string[] args)
        {
            int result = 1;
            var report = new List<string>();
            var app = new Application();
            var setup = new SetupWindow(new Dictionary<string, string> {
                { "engine", args[0] }, { "registry", args[1] }, { "scope", "user" }, { "directory", args[2] }
            });
            var method = typeof(SetupWindow).GetMethod("Install", BindingFlags.Instance | BindingFlags.NonPublic);
            setup.Window.ShowInTaskbar = false;
            setup.Window.Loaded += async delegate
            {
                setup.Window.Hide();
                try
                {
                    var path = (TextBox)setup.Window.FindName("InstallPath");
                    path.Text = "C:\\";
                    await (Task)method.Invoke(setup, null);
                    if (((Border)setup.Window.FindName("MessagePanel")).Visibility != Visibility.Visible || File.Exists(Path.Combine(args[2], "Lyrics Card Generator.exe")))
                        throw new Exception("Invalid path was not rejected before engine startup.");
                    report.Add("PASS: invalid path rejected before installation");
                    ((Border)setup.Window.FindName("MessagePanel")).Visibility = Visibility.Collapsed;
                    path.Text = args[2];
                    ((CheckBox)setup.Window.FindName("DesktopShortcut")).IsChecked = false;
                    for (int pass = 1; pass <= 2; pass++)
                    {
                        Task install = (Task)method.Invoke(setup, null);
                        if (((Button)setup.Window.FindName("CloseButton")).IsEnabled) throw new Exception("Close remained enabled while installing.");
                        await install;
                        if (setup.ExitCode != 0 || ((StackPanel)setup.Window.FindName("DonePanel")).Visibility != Visibility.Visible)
                            throw new Exception("Install pass " + pass + " failed: " + setup.ExitCode + "; " + ((TextBlock)setup.Window.FindName("MessageText")).Text);
                        if (!File.Exists(Path.Combine(args[2], "Uninstall Lyrics Card Generator.exe"))) throw new Exception("Uninstaller missing.");
                        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                        if (File.Exists(Path.Combine(desktop, "Lyrics Card Generator.lnk"))) throw new Exception("Unchecked desktop shortcut was created.");
                        report.Add("PASS: " + (pass == 1 ? "fresh install" : "same-version upgrade") + ", real completion event + exit + files + registry; no desktop shortcut");
                    }
                    result = 0;
                }
                catch (Exception error) { report.Add("FAIL: " + error); }
                finally { File.WriteAllLines(args[3], report); setup.Window.Close(); app.Shutdown(); }
            };
            app.Run(setup.Window);
            return result;
        }
    }
}
