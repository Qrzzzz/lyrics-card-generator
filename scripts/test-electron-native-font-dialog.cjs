const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  CANCEL_RESULT,
  NATIVE_FONT_DIALOG_SCRIPT,
  RESULT_PREFIX,
  parseFontDialogResult,
  showWindowsFontDialog
} = require("../electron/native-font-dialog");

assert.match(NATIVE_FONT_DIALOG_SCRIPT, /System\.Windows\.Forms\.FontDialog/);
assert.match(NATIVE_FONT_DIALOG_SCRIPT, /ShowDialog\(\$owner\)/);
assert.match(NATIVE_FONT_DIALOG_SCRIPT, /EnableVisualStyles/);
assert.equal(parseFontDialogResult(`${RESULT_PREFIX}${Buffer.from("Microsoft YaHei").toString("base64")}\r\n`), "Microsoft YaHei");
assert.equal(parseFontDialogResult(`${CANCEL_RESULT}\r\n`), null);
assert.equal(parseFontDialogResult(`${RESULT_PREFIX}%%%\r\n`), null);
assert.equal(parseFontDialogResult(`${RESULT_PREFIX}QQ\r\n`), null);
assert.equal(parseFontDialogResult(`${RESULT_PREFIX}${Buffer.from("Bad\nFont").toString("base64")}\r\n`), null);

async function testSuccessfulSelection() {
  let invocation;
  const spawnImpl = (command, args, options) => {
    invocation = { command, args, options };
    const child = createChild();
    process.nextTick(() => {
      child.stdout.emit("data", `${RESULT_PREFIX}${Buffer.from("Yu Gothic UI").toString("base64")}\r\n`);
      child.emit("close", 0);
    });
    return child;
  };

  assert.equal(
    await showWindowsFontDialog({ ownerHandle: "123456", selectedFamily: "Microsoft YaHei", spawnImpl }),
    "Yu Gothic UI"
  );
  assert.equal(invocation.command, "powershell.exe");
  assert.deepEqual(invocation.args.slice(0, 7), ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand"]);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.env.LYRICS_CARD_FONT_OWNER, "123456");
  assert.equal(
    Buffer.from(invocation.options.env.LYRICS_CARD_FONT_FAMILY_B64, "base64").toString("utf8"),
    "Microsoft YaHei"
  );
}

async function testCancellationAndFailure() {
  assert.equal(await showWindowsFontDialog({ ownerHandle: "", selectedFamily: "Arial", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "0", selectedFamily: "Arial", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "-1", selectedFamily: "Arial", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "not-a-hwnd", selectedFamily: "Arial", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "9223372036854775808", selectedFamily: "Arial", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "42", selectedFamily: "", spawnImpl: () => assert.fail() }), null);
  assert.equal(await showWindowsFontDialog({ ownerHandle: "42", selectedFamily: "Bad\nFont", spawnImpl: () => assert.fail() }), null);
  assert.equal(
    await showWindowsFontDialog({
      ownerHandle: "42",
      selectedFamily: "Arial",
      spawnImpl: () => {
        throw new Error("spawn threw synchronously");
      }
    }),
    null
  );

  const cancelled = createChild();
  const cancelledResult = showWindowsFontDialog({ ownerHandle: "42", selectedFamily: "Arial", spawnImpl: () => cancelled });
  cancelled.stdout.emit("data", `${CANCEL_RESULT}\r\n`);
  cancelled.emit("close", 0);
  assert.equal(await cancelledResult, null);

  const failed = createChild();
  const failedResult = showWindowsFontDialog({ ownerHandle: "42", selectedFamily: "Arial", spawnImpl: () => failed });
  failed.emit("error", new Error("spawn failed"));
  assert.equal(await failedResult, null);

  const noisy = createChild();
  const noisyResult = showWindowsFontDialog({ ownerHandle: "42", selectedFamily: "Arial", spawnImpl: () => noisy });
  noisy.stdout.emit("data", Buffer.alloc(8 * 1024 + 1));
  assert.equal(await noisyResult, null);
  assert.equal(noisy.killCalls, 1);
}

function createChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    return true;
  };
  return child;
}

Promise.all([testSuccessfulSelection(), testCancellationAndFailure()])
  .then(() => process.stdout.write("Electron native Windows font-dialog tests passed\n"));
