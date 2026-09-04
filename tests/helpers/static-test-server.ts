import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// Browsers refuse several otherwise valid TCP ports. Retry allocation rather
// than treating a browser policy failure as an application regression.
const unsafeBrowserPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179,
  389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601,
  636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080
]);

export async function startStaticServer(root: string, label: string, requestLog?: Set<string>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createStaticServer(root, requestLog);
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error(`${label} server did not expose a TCP port.`);
      }
      if (!unsafeBrowserPorts.has(address.port)) {
        return { server, baseUrl: `http://127.0.0.1:${address.port}` };
      }
    } catch (error) {
      await closeStaticServer(server);
      throw error;
    }
    await closeStaticServer(server);
  }
  throw new Error(`${label} server repeatedly received browser-restricted ports.`);
}

export async function closeStaticServer(server?: Server) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function createStaticServer(root: string, requestLog?: Set<string>) {
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".otf": "font/otf",
    ".png": "image/png"
  };

  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
      const filePath = path.resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }

      const body = await readFile(filePath);
      requestLog?.add(requestUrl.pathname);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": body.byteLength,
        "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream"
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}
