const path = require("node:path");

const serverEntry = process.argv[2];
if (typeof serverEntry !== "string" || !path.isAbsolute(serverEntry)) {
  throw new Error("The packaged Next launcher requires an absolute server entry path.");
}

// The IPC channel is a lifetime leash owned only by the Electron parent. It
// closes automatically on a crash, preventing an orphaned loopback server.
process.once("disconnect", () => process.exit(0));
process.on("message", (message) => {
  if (
    message
    && typeof message === "object"
    && "type" in message
    && message.type === "lyrics-card:shutdown-server"
  ) process.exit(0);
});

require(serverEntry);
