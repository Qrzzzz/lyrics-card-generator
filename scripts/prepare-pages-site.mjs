import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");

export const pagesFiles = [
  "index.html",
  "public/app-icon.png",
  "public/licenses/LICENSE-Lyrics-Card-Generator.txt",
  "public/licenses/THIRD-PARTY-NOTICES.txt",
  "public/fonts/SourceHanSansSC-Heavy.otf",
  "public/fonts/LICENSE-SourceHanSans.txt",
  "public/fonts/SourceHanSerifSC-Heavy.otf",
  "public/fonts/LICENSE-SourceHanSerif.txt"
];

/** Builds the explicit GitHub Pages allowlist without adding repository-only files. */
export async function preparePagesSite(outputDirectory) {
  const resolvedOutput = path.resolve(outputDirectory);
  const relativeOutput = path.relative(projectRoot, resolvedOutput);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error(`Pages output must be a child of the project root: ${resolvedOutput}`);
  }

  await rm(resolvedOutput, { recursive: true, force: true });
  for (const relativePath of pagesFiles) {
    const source = path.join(projectRoot, ...relativePath.split("/"));
    const destination = path.join(resolvedOutput, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
  await writeFile(path.join(resolvedOutput, ".nojekyll"), "", "utf8");

  for (const relativePath of [...pagesFiles, ".nojekyll"]) {
    await access(path.join(resolvedOutput, ...relativePath.split("/")));
  }

  return { outputDirectory: resolvedOutput, files: [...pagesFiles, ".nojekyll"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out="));
  const outputDirectory = outputArgument
    ? path.resolve(projectRoot, outputArgument.slice("--out=".length))
    : path.join(projectRoot, "_site");
  const result = await preparePagesSite(outputDirectory);
  console.log(`Prepared ${path.relative(projectRoot, result.outputDirectory)} with ${result.files.length} files.`);
}
