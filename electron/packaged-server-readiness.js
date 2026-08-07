const crypto = require("node:crypto");
const http = require("node:http");

const DESKTOP_READY_PATH = "/api/desktop-ready";
const DESKTOP_READY_CHALLENGE_HEADER = "x-lyrics-card-startup-challenge";
const DESKTOP_READY_SERVICE = "lyrics-card-generator-desktop";
const STARTUP_SECRET_ENV = "LYRICS_CARD_SERVER_STARTUP_SECRET";
const MAX_READY_RESPONSE_BYTES = 1024;
const HEX_256_PATTERN = /^[a-f0-9]{64}$/;

function createPackagedServerStartupSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function createPackagedServerProof(secret, challenge) {
  return crypto.createHmac("sha256", secret).update(challenge).digest("hex");
}

function isChildProcessAlive(child) {
  return Boolean(
    child
    && Number.isInteger(child.pid)
    && child.pid > 0
    && child.exitCode === null
    && child.signalCode === null
    && !child.killed
  );
}

function isChildProcessSpawnPending(child) {
  return Boolean(
    child
    && (child.pid === undefined || child.pid === null)
    && child.exitCode === null
    && child.signalCode === null
    && !child.killed
  );
}

function childExitError(child, code = child?.exitCode, signal = child?.signalCode) {
  const exitCode = code === null || code === undefined ? "none" : String(code);
  const exitSignal = signal === null || signal === undefined ? "none" : String(signal);
  return new Error(`Bundled Next service exited before readiness (code=${exitCode}, signal=${exitSignal}).`);
}

function untrustedResponseError(reason) {
  return new Error(`Bundled Next service returned an untrusted readiness response (${reason}).`);
}

function timingSafeProofMatches(actual, expected) {
  if (typeof actual !== "string" || !HEX_256_PATTERN.test(actual) || !HEX_256_PATTERN.test(expected)) {
    return false;
  }

  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
}

function validateReadyUrl(value) {
  const parsed = new URL(value);
  // Use a numeric loopback address and explicit port so readiness cannot drift through DNS or a default port.
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || !parsed.port
    || parsed.username
    || parsed.password
  ) {
    throw new Error("Bundled Next readiness requires an explicit 127.0.0.1 HTTP endpoint.");
  }
  return parsed;
}

/**
 * Waits for the spawned Next process to prove ownership of its loopback endpoint.
 * A live HTTP listener is not sufficient: every probe carries a fresh challenge whose
 * HMAC can be produced only by the child that inherited the per-launch startup secret.
 */
function waitForPackagedServerReady({
  url,
  child,
  startupSecret,
  timeoutMs = 45000,
  retryDelayMs = 300,
  requestTimeoutMs = 3000,
  request = http.request,
  randomBytes = crypto.randomBytes
}) {
  const parsedUrl = validateReadyUrl(url);
  if (!HEX_256_PATTERN.test(startupSecret)) {
    return Promise.reject(new Error("Bundled Next startup secret is invalid."));
  }
  const spawnPending = isChildProcessSpawnPending(child);
  if (!isChildProcessAlive(child) && !spawnPending) {
    return Promise.reject(childExitError(child));
  }

  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    let activeRequest = null;
    let retryTimer = null;
    let deadlineTimer = null;
    let settled = false;

    const cleanup = () => {
      child.removeListener("error", onChildError);
      child.removeListener("exit", onChildExit);
      if (retryTimer) clearTimeout(retryTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      retryTimer = null;
      deadlineTimer = null;
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      // Settle once and detach child/timer observers before resolving or rejecting startup.
      cleanup();
      if (error) {
        activeRequest?.destroy();
        reject(error);
        return;
      }
      resolve();
    };

    const onChildError = (error) => {
      finish(new Error(`Unable to start bundled Next service: ${error instanceof Error ? error.message : String(error)}`));
    };

    const onChildExit = (code, signal) => {
      finish(childExitError(child, code, signal));
    };

    const retryOrTimeout = () => {
      if (settled || retryTimer) return;
      if (!isChildProcessAlive(child)) {
        finish(childExitError(child));
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        finish(new Error(`Timed out waiting for authenticated bundled Next service at ${parsedUrl.origin}.`));
        return;
      }
      retryTimer = setTimeout(check, retryDelayMs);
    };

    const check = () => {
      retryTimer = null;
      if (!isChildProcessAlive(child)) {
        finish(childExitError(child));
        return;
      }

      const challenge = randomBytes(32).toString("hex");
      const expectedProof = createPackagedServerProof(startupSecret, challenge);
      const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
      let responseStarted = false;
      let probeFinished = false;
      let currentRequest = null;

      const retryProbe = () => {
        if (settled || probeFinished) return;
        probeFinished = true;
        if (activeRequest === currentRequest) activeRequest = null;
        retryOrTimeout();
      };

      currentRequest = request({
        protocol: "http:",
        hostname: parsedUrl.hostname,
        port: Number(parsedUrl.port),
        path: DESKTOP_READY_PATH,
        method: "GET",
        agent: false,
        headers: {
          Accept: "application/json",
          Connection: "close",
          [DESKTOP_READY_CHALLENGE_HEADER]: challenge
        }
      }, (response) => {
        responseStarted = true;
        const statusCode = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
        // A responding service with the wrong protocol shape is untrusted, not a transient startup miss.
        if (statusCode !== 200) {
          response.resume();
          finish(untrustedResponseError(`status=${statusCode}`));
          return;
        }
        if (contentType !== "application/json") {
          response.resume();
          finish(untrustedResponseError("content-type"));
          return;
        }

        const chunks = [];
        let byteLength = 0;
        // Bound an unauthenticated response before buffering or parsing it.
        response.on("data", (chunk) => {
          if (settled) return;
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += bytes.length;
          if (byteLength > MAX_READY_RESPONSE_BYTES) {
            response.destroy();
            finish(untrustedResponseError("body-too-large"));
            return;
          }
          chunks.push(bytes);
        });
        response.once("aborted", () => {
          retryProbe();
        });
        response.once("error", () => {
          retryProbe();
        });
        response.once("end", () => {
          if (settled || probeFinished) return;
          probeFinished = true;
          if (activeRequest === currentRequest) activeRequest = null;
          let payload;
          try {
            payload = JSON.parse(Buffer.concat(chunks, byteLength).toString("utf8"));
          } catch {
            finish(untrustedResponseError("invalid-json"));
            return;
          }

          if (
            !payload
            || typeof payload !== "object"
            || Array.isArray(payload)
            || payload.service !== DESKTOP_READY_SERVICE
            || !timingSafeProofMatches(payload.proof, expectedProof)
          ) {
            finish(untrustedResponseError("identity-proof"));
            return;
          }
          if (!isChildProcessAlive(child)) {
            finish(childExitError(child));
            return;
          }
          finish();
        });
      });

      activeRequest = currentRequest;
      currentRequest.once("error", () => {
        if (activeRequest === currentRequest) activeRequest = null;
        // Connection failures before headers are expected while the owned child is still booting.
        if (!responseStarted) retryProbe();
      });
      currentRequest.setTimeout(Math.min(requestTimeoutMs, remainingMs), () => {
        currentRequest.destroy(new Error("Bundled Next readiness request timed out."));
      });
      currentRequest.end();
    };

    child.once("error", onChildError);
    child.once("exit", onChildExit);
    deadlineTimer = setTimeout(() => {
      finish(new Error(`Timed out waiting for authenticated bundled Next service at ${parsedUrl.origin}.`));
    }, timeoutMs);
    // A failed spawn has no pid before Node emits its asynchronous `error`
    // event. Keep the listener installed so that failure is reported through
    // the normal startup path instead of becoming an uncaught process error.
    if (!spawnPending) check();
  });
}

module.exports = {
  DESKTOP_READY_CHALLENGE_HEADER,
  DESKTOP_READY_PATH,
  DESKTOP_READY_SERVICE,
  STARTUP_SECRET_ENV,
  createPackagedServerProof,
  createPackagedServerStartupSecret,
  isChildProcessAlive,
  waitForPackagedServerReady
};
