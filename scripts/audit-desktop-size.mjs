import { lstat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const sizeTargets = [
  ".next",
  ".next/standalone",
  ".next/cache",
  "dist-desktop",
  "dist-desktop/app",
  "dist-desktop/server",
  "dist-desktop/server/_node_modules",
  "public",
  "public/fonts",
  "release",
  "release/win-unpacked",
  "release/win-unpacked/resources",
  "release/win-unpacked/resources/app.asar",
  "release/win-unpacked/resources/server"
];

const scanRoots = [".next", "dist-desktop", "public", "release"];
const files = [];
const directorySizes = new Map();

function relative(targetPath) {
  return path.relative(projectRoot, targetPath) || ".";
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function walk(targetPath) {
  let info;

  try {
    info = await lstat(targetPath);
  } catch {
    return 0;
  }

  if (info.isSymbolicLink()) {
    return 0;
  }

  if (info.isFile()) {
    files.push({ path: targetPath, size: info.size });
    return info.size;
  }

  if (!info.isDirectory()) {
    return 0;
  }

  let total = 0;
  let entries = [];

  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    total += await walk(path.join(targetPath, entry.name));
  }

  directorySizes.set(targetPath, total);
  return total;
}

function printTable(title, rows, renderRow) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  if (rows.length === 0) {
    console.log("(none)");
    return;
  }

  for (const row of rows) {
    console.log(renderRow(row));
  }
}

for (const root of scanRoots) {
  const absolute = path.join(projectRoot, root);
  if (existsSync(absolute)) {
    await walk(absolute);
  }
}

printTable("Tracked desktop size targets", sizeTargets, (target) => {
  const absolute = path.join(projectRoot, target);
  const size = directorySizes.get(absolute) ?? files.find((file) => file.path === absolute)?.size;
  return `${target.padEnd(48)} ${existsSync(absolute) ? formatBytes(size ?? 0) : "(missing)"}`;
});

printTable(
  "Top 30 largest files",
  [...files].sort((a, b) => b.size - a.size).slice(0, 30),
  (file) => `${formatBytes(file.size).padStart(10)}  ${relative(file.path)}`
);

printTable(
  "Top 20 largest directories",
  [...directorySizes.entries()]
    .map(([directory, size]) => ({ directory, size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20),
  (directory) => `${formatBytes(directory.size).padStart(10)}  ${relative(directory.directory)}`
);
