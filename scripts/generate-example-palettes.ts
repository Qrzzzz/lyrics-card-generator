import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getHighResolutionCoverUrl } from "../lib/cover-url";
import { EXAMPLE_SONGS } from "../lib/examples";
import { parseSong } from "../lib/song-parser";
import { validatePublicHttpUrl } from "../lib/url-safety";

type PaletteInput = {
  id: string;
  coverDataUrl: string;
};

type PaletteResult = {
  id: string;
  colors: string[];
};

const projectRoot = process.cwd();
const coversDir = resolve(projectRoot, "tmp/example-covers");
const generatorTmpDir = resolve(projectRoot, "tmp/example-palette-generator");
const imageLimit = 8 * 1024 * 1024;

async function main() {
  await mkdir(coversDir, { recursive: true });
  await mkdir(generatorTmpDir, { recursive: true });

  const paletteInput = await collectPaletteInput();
  const port = await findFreePort();
  const server = startNextServer(port);

  try {
    const generatorUrl = `http://127.0.0.1:${port}/example-palette-generator`;
    await waitForServer(generatorUrl);
    const results = await runElectronPaletteExtractor(generatorUrl, paletteInput);
    await syncExamplePaletteMetadata(results);
    console.log(JSON.stringify({
      ok: true,
      palettes: results.map((result) => ({ id: result.id, colors: result.colors.length }))
    }, null, 2));
  } finally {
    server.kill();
  }
}

async function collectPaletteInput(): Promise<PaletteInput[]> {
  const items: PaletteInput[] = [];

  for (const example of EXAMPLE_SONGS) {
    const parsed = await parseSong(example.url);
    const sourceCoverUrl = parsed.coverUrl || parsed.originalCoverUrl || "";
    const coverUrl = getHighResolutionCoverUrl(sourceCoverUrl, example.source);
    const cover = await fetchCover(coverUrl);
    const extension = extensionFromContentType(cover.contentType);

    await writeFile(join(coversDir, `${example.id}${extension}`), cover.bytes);
    items.push({
      id: example.id,
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

async function runElectronPaletteExtractor(url: string, items: PaletteInput[]): Promise<PaletteResult[]> {
  const inputPath = join(generatorTmpDir, "palette-input.json");
  const resultPath = join(generatorTmpDir, "palette-results.json");
  const appPath = join(generatorTmpDir, "extract-example-palettes.cjs");

  await writeFile(inputPath, JSON.stringify({ url, items, resultPath }), "utf8");
  await rm(resultPath, { force: true });
  await writeFile(appPath, electronPaletteExtractorSource(), "utf8");

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
        reject(new Error(`Electron palette extractor failed with exit code ${code}.\n${output}`));
      }
    });
  });

  return JSON.parse(await readFile(resultPath, "utf8")) as PaletteResult[];
}

async function syncExamplePaletteMetadata(results: PaletteResult[]) {
  validatePaletteResults(results);
  const examplesPath = resolve(projectRoot, "lib/examples.ts");
  let source = await readFile(examplesPath, "utf8");

  for (const result of results) {
    const colors = [...new Set(result.colors.map((color) => color.toUpperCase()))]
      .filter(isHexColor)
      .slice(0, 6);
    if (colors.length < 2) {
      throw new Error(`Palette extractor returned too few colors for ${result.id}.`);
    }

    const block = findExampleBlock(source, result.id);
    const pattern = /(palette:\s*\{\s*colors:\s*)\[[^\]]*\](,\s*extractedFrom:\s*"album-cover"\s*\})/;
    const replacement = `$1[${colors.map((color) => `"${color}"`).join(", ")}]$2`;
    if (!pattern.test(block.value)) {
      throw new Error(`Unable to sync palette metadata for ${result.id}.`);
    }

    const updatedBlock = block.value.replace(pattern, replacement);
    source = `${source.slice(0, block.start)}${updatedBlock}${source.slice(block.end)}`;
  }

  await writeFile(examplesPath, source, "utf8");
}

function validatePaletteResults(results: PaletteResult[]) {
  const expectedIds = new Set(EXAMPLE_SONGS.map((example) => example.id));
  const resultIds = new Set<string>();

  if (results.length !== expectedIds.size) {
    throw new Error(`Expected ${expectedIds.size} palette results, received ${results.length}.`);
  }

  for (const result of results) {
    if (!expectedIds.has(result.id as (typeof EXAMPLE_SONGS)[number]["id"])) {
      throw new Error(`Palette extractor returned an unknown example id: ${result.id}.`);
    }
    if (resultIds.has(result.id)) {
      throw new Error(`Palette extractor returned a duplicate example id: ${result.id}.`);
    }
    resultIds.add(result.id);
  }
}

function findExampleBlock(source: string, id: string) {
  const idMarker = `  id: "${id}",`;
  const start = source.indexOf(idMarker);
  if (start < 0 || source.indexOf(idMarker, start + idMarker.length) >= 0) {
    throw new Error(`Unable to locate a unique example block for ${id}.`);
  }

  const remainder = source.slice(start);
  const nextExampleMatch = /\r?\n}, \{\r?\n  id: "/.exec(remainder);
  const arrayEndMatch = /\r?\n}];/.exec(remainder);
  const nextExample = nextExampleMatch ? start + nextExampleMatch.index : -1;
  const arrayEnd = arrayEndMatch ? start + arrayEndMatch.index : -1;
  const end = nextExample >= 0 && (arrayEnd < 0 || nextExample < arrayEnd) ? nextExample : arrayEnd;
  if (end < 0) {
    throw new Error(`Unable to locate the end of the example block for ${id}.`);
  }

  return { start, end, value: source.slice(start, end) };
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

function electronPaletteExtractorSource() {
  return String.raw`
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");

async function main() {
  const input = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  await app.whenReady();

  const window = new BrowserWindow({
    width: 640,
    height: 480,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  await window.loadURL(input.url);
  await waitForExtractor(window);
  const results = await window.webContents.executeJavaScript(
    "window.extractExamplePalettes(" + JSON.stringify(input.items) + ")",
    true
  );
  await fs.writeFile(input.resultPath, JSON.stringify(results), "utf8");
  await window.close();
  app.quit();
}

async function waitForExtractor(window) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript("typeof window.extractExamplePalettes === 'function'", true);
    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Palette generator page did not expose extractExamplePalettes.");
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
`;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
