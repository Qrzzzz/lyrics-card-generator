const { performance } = require("node:perf_hooks");

const STARTUP_TRACE_ENV = "LYRICS_CARD_STARTUP_TRACE";

function createStartupTrace({ enabled = process.env[STARTUP_TRACE_ENV] === "1" } = {}) {
  const marks = [];
  const mark = enabled
    ? (name, detail) => {
        marks.push({
          name,
          atMs: Math.round(performance.now() * 10) / 10,
          ...(detail === undefined ? {} : { detail })
        });
      }
    : () => undefined;
  const snapshot = () => ({
    enabled,
    pid: process.pid,
    processTimeOriginEpochMs: performance.timeOrigin,
    marks: marks.map((entry) => ({ ...entry }))
  });

  if (enabled) {
    // Main-process only diagnostics; no renderer bridge or IPC channel exposes this object.
    globalThis.__lyricsCardStartupTrace = { snapshot };
  }

  return { enabled, mark, snapshot };
}

module.exports = { STARTUP_TRACE_ENV, createStartupTrace };
