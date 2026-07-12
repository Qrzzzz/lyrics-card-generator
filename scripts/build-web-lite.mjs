import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import autoprefixer from "autoprefixer";
import { build, transform } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDirectory, "..");

export async function buildWebLite(outputFile = path.join(projectRoot, "index.html")) {
  const [template, inputCss, packageJsonText] = await Promise.all([
    readFile(path.join(projectRoot, "web-lite", "index.template.html"), "utf8"),
    readFile(path.join(projectRoot, "app", "globals.css"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8")
  ]);
  const packageJson = JSON.parse(packageJsonText);

  const cssResult = await postcss([
    tailwindcss(path.join(projectRoot, "tailwind.config.ts")),
    autoprefixer
  ]).process(inputCss, {
    from: path.join(projectRoot, "app", "globals.css"),
    map: false
  });
  const staticCss = cssResult.css
    .replaceAll('url("/fonts/', 'url("./public/fonts/')
    .replaceAll("url('/fonts/", "url('./public/fonts/");
  const minifiedCss = await transform(staticCss, {
    loader: "css",
    minify: true,
    sourcemap: false,
    target: "es2020"
  });

  const bundle = await build({
    absWorkingDir: projectRoot,
    entryPoints: [path.join(projectRoot, "web-lite", "entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    jsx: "automatic",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    tsconfig: path.join(projectRoot, "tsconfig.json"),
    alias: {
      "@/lib/image-utils": path.join(projectRoot, "web-lite", "static-image-utils.ts"),
      "@/components/preview/PlatformBadge": path.join(projectRoot, "web-lite", "StaticPlatformBadge.tsx")
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_APP_VERSION": JSON.stringify(packageJson.version)
    }
  });
  const javascript = bundle.outputFiles[0]?.text;

  if (!javascript) {
    throw new Error("Web Lite JavaScript bundle was not produced.");
  }

  const html = template
    .replace("/* WEB_LITE_STYLES */", () => minifiedCss.code.trim())
    .replace("/* WEB_LITE_SCRIPT */", () => javascript.trim().replace(/<\/script/gi, "<\\/script"));

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, html.replace(/\r\n/g, "\n"), "utf8");

  return {
    outputFile,
    bytes: Buffer.byteLength(html, "utf8")
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outputArgument = process.argv.find((argument) => argument.startsWith("--out="));
  const outputFile = outputArgument
    ? path.resolve(projectRoot, outputArgument.slice("--out=".length))
    : path.join(projectRoot, "index.html");
  const result = await buildWebLite(outputFile);
  console.log(`Generated ${path.relative(projectRoot, result.outputFile)} (${result.bytes} bytes).`);
}
