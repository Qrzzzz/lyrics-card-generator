import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const selected = process.argv.find((value) => value.startsWith("--scenario="))?.slice(11);
const scenarios = ["search", "song-import", "examples", "fonts", "titlebar"];
if (selected && !scenarios.includes(selected)) throw new Error(`Unknown scenario ${selected}`);
for (const scenario of selected ? [selected] : scenarios) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("./test-desktop-settings-interactions.mjs", import.meta.url)), `--scenario=${scenario}`], { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${scenario} failed (${code})`)));
  });
}
