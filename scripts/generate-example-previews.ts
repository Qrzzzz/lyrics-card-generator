import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getHighResolutionCoverUrl } from "../lib/cover-url";
import { EXAMPLE_SONGS } from "../lib/examples";
import { parseSong } from "../lib/song-parser";
import { validatePublicHttpUrl } from "../lib/url-safety";

type RendererInput = {
  id: string;
  title: string;
  artist: string;
  source: string;
  lyrics: string;
  coverDataUrl: string;
};

type RendererResult = {
  id: string;
  dataUrl: string;
  colors: string[];
};

const projectRoot = process.cwd();
const coversDir = resolve(projectRoot, "tmp/example-covers");
const previewTmpDir = resolve(projectRoot, "tmp/example-previews");
const outputDir = resolve(projectRoot, "public/examples/generated");
const imageLimit = 8 * 1024 * 1024;

async function main() {
  await mkdir(coversDir, { recursive: true });
  await mkdir(previewTmpDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const rendererInput = await collectRendererInput();
  const port = await findFreePort();
  const server = startNextServer(port);

  try {
    await waitForServer(`http://127.0.0.1:${port}/example-preview-generator`);
    const results = await runElectronRenderer(`http://127.0.0.1:${port}/example-preview-generator`, rendererInput);
    await writePreviewFiles(results);
    await syncExamplePreviewMetadata(results);
    console.log(JSON.stringify({ ok: true, generated: results.map((result) => result.id) }, null, 2));
  } finally {
    server.kill();
  }
}

async function collectRendererInput(): Promise<RendererInput[]> {
  const items: RendererInput[] = [];

  for (const example of EXAMPLE_SONGS) {
    const parsed = await parseSong(example.url);
    const sourceCoverUrl = parsed.coverUrl || parsed.originalCoverUrl || "";
    const coverUrl = getHighResolutionCoverUrl(sourceCoverUrl, example.source);
    const cover = await fetchCover(coverUrl);
    const extension = extensionFromContentType(cover.contentType);
    const coverPath = join(coversDir, `${example.id}${extension}`);

    await writeFile(coverPath, cover.bytes);

    items.push({
      id: example.id,
      title: example.title,
      artist: example.artist,
      source: example.source,
      lyrics: firstLyricsLines(example.lyrics),
      coverDataUrl: `data:${cover.contentType};base64,${Buffer.from(cover.bytes).toString("base64")}`
    });
  }

  return items;
}

async function fetchCover(rawUrl: string) {
  const safety = await validatePublicHttpUrl(rawUrl);
  if (!safety.ok) {
    throw new Error(`Unsafe cover URL: ${safety.error}`);
  }

  const response = await fetch(safety.url, {
    headers: {
      "user-agent": "Mozilla/5.0 LyricsCardGenerator/2.0.0"
    },
    signal: AbortSignal.timeout(8000),
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Cover returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("The cover resource is not an image.");
  }

  const bytes = await limitedBinaryRead(response, imageLimit);
  return { bytes, contentType };
}

async function limitedBinaryRead(response: Response, limit: number) {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    received += value.byteLength;
    if (received > limit) {
      reader.cancel().catch(() => undefined);
      throw new Error("The cover response is too large.");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function startNextServer(port: number) {
  const nextBin = resolve(projectRoot, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port), "--hostname", "127.0.0.1"], {
    cwd: projectRoot,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let recentOutput = "";
  const remember = (chunk: Buffer) => {
    recentOutput = `${recentOutput}${chunk.toString("utf8")}`.slice(-4000);
  };
  child.stdout?.on("data", remember);
  child.stderr?.on("data", remember);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(recentOutput);
    }
  });

  return child;
}

async function runElectronRenderer(url: string, items: RendererInput[]): Promise<RendererResult[]> {
  const inputPath = join(previewTmpDir, "renderer-input.json");
  const resultPath = join(previewTmpDir, "renderer-results.json");
  const appPath = join(previewTmpDir, "render-example-previews.cjs");

  await writeFile(inputPath, JSON.stringify({ url, items, resultPath }), "utf8");
  await rm(resultPath, { force: true });
  await writeFile(appPath, electronRendererSource(), "utf8");

  const require = createRequire(import.meta.url);
  const electronPath = require("electron") as string;

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(electronPath, [appPath, inputPath], {
      cwd: projectRoot,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.stderr?.on("data", (chunk) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-4000);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Electron preview renderer failed with exit code ${code}.\n${output}`));
      }
    });
  });

  return JSON.parse(await readFile(resultPath, "utf8")) as RendererResult[];
}

async function writePreviewFiles(results: RendererResult[]) {
  for (const result of results) {
    const match = result.dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) {
      throw new Error(`Renderer returned a non-PNG preview for ${result.id}.`);
    }

    await writeFile(join(outputDir, `${result.id}.png`), Buffer.from(match[1], "base64"));
  }
}

async function syncExamplePreviewMetadata(results: RendererResult[]) {
  const examplesPath = resolve(projectRoot, "lib/examples.ts");
  let source = await readFile(examplesPath, "utf8");

  for (const result of results) {
    const colors = result.colors.slice(0, 3).filter(isHexColor);
    if (colors.length < 2) {
      throw new Error(`Renderer returned too few palette colors for ${result.id}.`);
    }

    const image = `/examples/generated/${result.id}.png`;
    const replacement = `$1"${image}"$2[${colors.map((color) => `"${color}"`).join(", ")}]$3`;
    const pattern = new RegExp(
      `(id: "${escapeRegExp(result.id)}",[\\s\\S]*?preview: \\{[\\s\\S]*?image: )"[^"]+"([\\s\\S]*?colors: )\\[[^\\]]*\\]([\\s\\S]*?generatedFrom: "album-cover-palette"\\s*\\})`
    );
    if (!pattern.test(source)) {
      throw new Error(`Unable to sync preview metadata for ${result.id}.`);
    }

    source = source.replace(pattern, replacement);
  }

  await writeFile(examplesPath, source, "utf8");
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 30000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
      response.body?.cancel().catch(() => undefined);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for ${url}. ${lastError instanceof Error ? lastError.message : ""}`.trim());
}

function findFreePort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePromise(address.port);
        } else {
          reject(new Error("Unable to allocate a local port."));
        }
      });
    });
    server.on("error", reject);
  });
}

function electronRendererSource() {
  return String.raw`
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");

async function main() {
  const input = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  await app.whenReady();

  const window = new BrowserWindow({
    width: 1280,
    height: 1600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  await window.loadURL(input.url);
  await waitForRenderer(window);
  const results = await window.webContents.executeJavaScript(
    "window.renderExamplePreviews(" + JSON.stringify(input.items) + ")",
    true
  );
  await fs.writeFile(input.resultPath, JSON.stringify(results), "utf8");
  await window.close();
  app.quit();
}

async function waitForRenderer(window) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript("typeof window.renderExamplePreviews === 'function'", true);
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Preview generator page did not expose renderExamplePreviews.");
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
`;
}

function firstLyricsLines(lyrics: string) {
  return lyrics.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 4).join("\n");
}

function extensionFromContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  return ".jpg";
}

function isHexColor(value: string) {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
