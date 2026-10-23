import { writeFileSync, renameSync } from 'node:fs';

const retryDelays = [25, 50, 100, 200, 400];
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Keep the previous state intact until replacement succeeds. Never replay remote actions here. */
export function saveReleaseState(path, value, {
  write = writeFileSync, rename = renameSync, sleep = pause,
  platform = process.platform, report = console.error
} = {}) {
  const temporary = `${path}.tmp`;
  // A failed write is not a sharing violation and must propagate immediately.
  write(temporary, JSON.stringify(value, null, 2) + '\n');
  for (let attempt = 0; ; attempt++) {
    try {
      rename(temporary, path);
      return;
    } catch (cause) {
      const transient = platform === 'win32' && ['EPERM', 'EBUSY'].includes(cause.code);
      if (!transient || attempt >= retryDelays.length) {
        const error = new Error(`Release state replacement failed (${cause.code ?? 'unknown'}); previous state and temporary file are preserved. Inspect filesystem access before Resume: ${path}`, { cause });
        error.code = cause.code;
        throw error;
      }
      report(`Release state replacement ${cause.code}; retry ${attempt + 1}/${retryDelays.length} in ${retryDelays[attempt]}ms`);
      sleep(retryDelays[attempt]);
    }
  }
}
