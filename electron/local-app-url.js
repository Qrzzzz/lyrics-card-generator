function normalizeLoopbackHttpUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("ELECTRON_DEV_SERVER_URL must be a loopback HTTP URL");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("ELECTRON_DEV_SERVER_URL must be a valid URL");
  }

  const hostname = url.hostname.toLowerCase();
  const isIpv4Loopback = /^127(?:\.\d{1,3}){3}$/.test(hostname);
  const isIpv6Loopback = hostname === "::1" || hostname === "[::1]";
  const isLoopback = hostname === "localhost" || isIpv4Loopback || isIpv6Loopback;

  if (url.protocol !== "http:" || !isLoopback || url.username || url.password) {
    throw new Error("ELECTRON_DEV_SERVER_URL must be a loopback HTTP URL without credentials");
  }

  return url.toString();
}

async function resolveLocalAppUrl({ isPackaged, devServerUrl, startLocalServer }) {
  // Development may reuse an explicit loopback server; every other launch owns a newly started local service.
  if (!isPackaged && devServerUrl) {
    return {
      url: normalizeLoopbackHttpUrl(devServerUrl),
      waitForReady: true
    };
  }

  return {
    url: await startLocalServer(),
    waitForReady: false
  };
}

module.exports = {
  normalizeLoopbackHttpUrl,
  resolveLocalAppUrl
};
