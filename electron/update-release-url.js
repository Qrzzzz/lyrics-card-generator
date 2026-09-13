/**
 * Resolve only GitHub's stable-release redirect, without downloading its HTML.
 * net.fetch currently hides the final URL and rejects manual redirects; use
 * ClientRequest's documented redirect event on the Chromium network stack.
 * @param {Electron.Net} net
 * @param {string} url
 * @returns {Promise<string>}
 */
function resolveUpdateReleaseUrl(net, url) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: "HEAD", redirect: "manual", cache: "no-store" });
    let settled = false;
    const timer = setTimeout(() => finish(new Error("Release request timed out")), 30_000);
    /** @param {Error | null} error @param {string} [location] */
    function finish(error, location) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(location);
      request.abort();
    }
    request.on("redirect", (_status, _method, location) => finish(null, location));
    request.on("response", (response) => {
      response.on("error", () => undefined);
      finish(new Error(`Release HTTP ${response.statusCode}`));
    });
    request.on("error", (error) => finish(error));
    request.end();
  });
}
module.exports = { resolveUpdateReleaseUrl };
