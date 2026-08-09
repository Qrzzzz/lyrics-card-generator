async function prepareDesktopStartup({
  initializeHistory,
  resolveAppUrl,
  waitForDevelopmentServer,
  waitForBackgroundStart,
  createHiddenWindow
}) {
  for (const [name, value] of Object.entries({
    initializeHistory,
    resolveAppUrl,
    waitForDevelopmentServer,
    waitForBackgroundStart,
    createHiddenWindow
  })) {
    if (typeof value !== "function") throw new TypeError(`Desktop startup requires ${name}.`);
  }

  // Start independent work before synchronously constructing the hidden native window.
  const historyInitialization = Promise.resolve(initializeHistory());
  const appUrlReadiness = Promise.resolve(resolveAppUrl()).then(async (resolvedAppUrl) => {
    if (resolvedAppUrl.waitForReady) await waitForDevelopmentServer(resolvedAppUrl.url);
    return resolvedAppUrl;
  });
  const prerequisites = Promise.all([appUrlReadiness, historyInitialization]);

  // BrowserWindow construction is synchronous enough to delay loopback-port I/O.
  // Let the independent server launch leave the main process first, while still
  // allowing an early prerequisite failure to abort before a hidden window exists.
  await Promise.race([Promise.resolve(waitForBackgroundStart()), prerequisites]);
  const window = createHiddenWindow();
  const [resolvedAppUrl] = await prerequisites;
  return { resolvedAppUrl, window };
}

module.exports = { prepareDesktopStartup };
