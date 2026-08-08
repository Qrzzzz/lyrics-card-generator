const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");

const LOOPBACK_HOST = "127.0.0.1";
const ORIGIN_STATE_FILE = "desktop-server-origin.json";
const ORIGIN_STATE_VERSION = 1;
const MAX_ORIGIN_STATE_BYTES = 1024;
const STABLE_PORT_MIN = 41000;
const STABLE_PORT_SPAN = 7000;

function isValidLoopbackPort(value) {
  return Number.isSafeInteger(value) && value >= 1024 && value <= 65535;
}

function deriveStableLoopbackPort(seed) {
  if (typeof seed !== "string" || !seed) {
    throw new TypeError("A stable loopback port requires a non-empty profile seed.");
  }
  const digest = crypto.createHash("sha256").update(seed.toLowerCase()).digest();
  return STABLE_PORT_MIN + (digest.readUInt32BE(0) % STABLE_PORT_SPAN);
}

function normalizeOriginState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (Object.keys(input).some((key) => key !== "version" && key !== "port")) return null;
  if (input.version !== ORIGIN_STATE_VERSION || !isValidLoopbackPort(input.port)) return null;
  return { version: ORIGIN_STATE_VERSION, port: input.port };
}

async function readCachedLoopbackPort(filePath, { fsImpl = fs } = {}) {
  let handle;
  try {
    handle = await fsImpl.open(filePath, "r");
    const info = await handle.stat();
    if (!info.isFile() || info.size < 2 || info.size > MAX_ORIGIN_STATE_BYTES) return null;
    const parsed = JSON.parse(await handle.readFile("utf8"));
    return normalizeOriginState(parsed)?.port ?? null;
  } catch {
    // Missing, corrupt, inaccessible, or stale metadata is only a cache miss.
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeCachedLoopbackPort(filePath, port, { fsImpl = fs, pathImpl = path } = {}) {
  if (!isValidLoopbackPort(port)) {
    throw new TypeError("Only a valid non-privileged loopback port can be cached.");
  }
  const directory = pathImpl.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fsImpl.mkdir(directory, { recursive: true });
  try {
    await fsImpl.writeFile(
      temporaryPath,
      `${JSON.stringify({ version: ORIGIN_STATE_VERSION, port })}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    await fsImpl.rename(temporaryPath, filePath);
    await fsImpl.chmod(filePath, 0o600).catch(() => undefined);
  } catch (error) {
    await fsImpl.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function findAvailableLoopbackPort({
  host = LOOPBACK_HOST,
  port = 0,
  createServer = net.createServer
} = {}) {
  if (host !== LOOPBACK_HOST) {
    return Promise.reject(new Error("The desktop service port probe must stay on 127.0.0.1."));
  }
  if (port !== 0 && !isValidLoopbackPort(port)) {
    return Promise.reject(new TypeError("The requested desktop service port is invalid."));
  }

  return new Promise((resolve, reject) => {
    const server = createServer();
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address !== "object" || !isValidLoopbackPort(address.port)) {
          reject(new Error("Unable to allocate a loopback desktop service port."));
          return;
        }
        resolve(address.port);
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port, exclusive: true });
  });
}

function isPortUnavailableError(error) {
  return error?.code === "EADDRINUSE" || error?.code === "EACCES";
}

async function selectLoopbackPort({
  stateFilePath,
  profileSeed,
  readCachedPort = readCachedLoopbackPort,
  findAvailablePort = findAvailableLoopbackPort
}) {
  const cachedPort = await readCachedPort(stateFilePath);
  const derivedPort = deriveStableLoopbackPort(profileSeed);
  const candidates = [
    ...(isValidLoopbackPort(cachedPort) ? [{ port: cachedPort, source: "cached" }] : []),
    { port: derivedPort, source: "derived" }
  ].filter((candidate, index, entries) => (
    entries.findIndex((entry) => entry.port === candidate.port) === index
  ));

  for (const candidate of candidates) {
    try {
      return {
        port: await findAvailablePort({ host: LOOPBACK_HOST, port: candidate.port }),
        source: candidate.source,
        cachedPort,
        derivedPort
      };
    } catch (error) {
      if (!isPortUnavailableError(error)) throw error;
    }
  }

  return {
    port: await findAvailablePort({ host: LOOPBACK_HOST, port: 0 }),
    source: "fallback",
    cachedPort,
    derivedPort
  };
}

function getOriginStatePath(userDataPath) {
  return path.join(userDataPath, ORIGIN_STATE_FILE);
}

module.exports = {
  LOOPBACK_HOST,
  MAX_ORIGIN_STATE_BYTES,
  ORIGIN_STATE_FILE,
  ORIGIN_STATE_VERSION,
  deriveStableLoopbackPort,
  findAvailableLoopbackPort,
  getOriginStatePath,
  isPortUnavailableError,
  isValidLoopbackPort,
  normalizeOriginState,
  readCachedLoopbackPort,
  selectLoopbackPort,
  writeCachedLoopbackPort
};
