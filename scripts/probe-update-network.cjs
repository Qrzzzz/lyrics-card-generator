const { app, net } = require("electron");
const { createAppUpdater } = require("../electron/app-updater");
const { resolveUpdateReleaseUrl } = require("../electron/update-release-url");

app.whenReady().then(async () => {
  try {
    const location = await resolveUpdateReleaseUrl(net, "https://github.com/Qrzzzz/lyrics-card-generator/releases/latest");
    console.log(JSON.stringify({ transport: "electron.net", location }));
    const updater = createAppUpdater({
      currentVersion: require("../package.json").version, supported: true,
      resolveReleaseUrl: (url) => resolveUpdateReleaseUrl(net, url),
      createUpdater: () => { throw new Error("Probe must not download or install anything"); },
      createCancellationToken: () => { throw new Error("Probe must not download anything"); },
      confirm: async () => false, emit: () => undefined, requestClose: () => false
    });
    const state = await updater.check();
    console.log(JSON.stringify(state));
    app.exit(state.phase === "latest" ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
