import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-desktop/installer");
if (process.platform !== "win32") throw new Error("Build the Windows installer shell on Windows (.NET Framework 4.8).");
const framework = path.join(process.env.WINDIR || "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319");
const compiler = path.join(framework, "csc.exe");
if (!existsSync(compiler)) throw new Error("The Windows .NET Framework C# compiler is required.");
await mkdir(out, { recursive: true });
const references = ["System.dll", "System.Core.dll", "System.Xaml.dll", "System.Web.Extensions.dll", "System.Windows.Forms.dll",
  "WPF/WindowsBase.dll", "WPF/PresentationCore.dll", "WPF/PresentationFramework.dll"];
const integration = process.argv.includes("--integration-harness");
const args = ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/warnaserror+",
  `/out:${path.join(out, integration ? "SetupIntegration.exe" : "LyricsSetup.exe")}`, `/win32manifest:${path.join(root, "build/installer/Setup.manifest")}`,
  `/win32icon:${path.join(root, "build/icon.ico")}`,
  ...references.map(ref => `/reference:${path.join(framework, ref)}`),
  `/resource:${path.join(root, "build/installer/Setup.xaml")},Setup.xaml`,
  `/resource:${path.join(root, "build/installer/locales.json")},locales.json`,
  `/resource:${path.join(root, "build/icon.ico")},icon.ico`, path.join(root, "build/installer/Setup.cs"), path.join(root, "build/installer/IconBackground.cs"),
  ...(integration ? ["/main:LyricsCard.Setup.Integration", path.join(root, "scripts/installer-integration.cs")] : [])];
const result = spawnSync(compiler, args, { encoding: "utf8", windowsHide: true });
if (result.error || result.status !== 0) throw new Error(result.error?.message || (result.stdout + result.stderr).slice(0, 12000));
await writeFile(path.join(out, "LyricsSetup.exe.config"), `<?xml version="1.0"?>
<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.8"/></startup>
<runtime><AppContextSwitchOverrides value="Switch.System.Windows.DoNotScaleForDpiChanges=false"/></runtime></configuration>\n`);
console.log("Built custom WPF installer shell: dist-desktop/installer/LyricsSetup.exe");
