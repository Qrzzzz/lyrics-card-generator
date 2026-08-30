const assert = require("node:assert/strict");
const { deflateSync } = require("node:zlib");
const {
  ClipboardImageValidationError,
  PNG_DATA_URL_PREFIX,
  assertRasterBudget,
  clipboardImageBudget,
  createClipboardImageWriter,
  decodeAndInspectClipboardPngDataUrl,
  getClipboardPngEncodedByteLength
} = require("../electron/clipboard-image");

const ordinaryPng = createPng(2, 2, deflateSync(Buffer.from([
  0, 255, 0, 0, 255, 0, 255, 0, 255,
  0, 0, 0, 255, 255, 255, 255, 255, 255
])));
const ordinaryDataUrl = toDataUrl(ordinaryPng);
assert.deepEqual(
  withoutBuffer(decodeAndInspectClipboardPngDataUrl(ordinaryDataUrl)),
  { width: 2, height: 2, pixels: 4, encodedBytes: ordinaryPng.length },
  "an ordinary valid PNG passes the bounded pre-decode inspection"
);

assert.deepEqual(clipboardImageBudget, {
  encodedBytes: 160 * 1024 * 1024,
  maxDimension: 16_384,
  decodedPixels: 48_000_000,
  decodedRgbaBytes: 192_000_000
});

const legalBoundary = createPng(2_880, 12_800, deflateSync(Buffer.from([0])));
assert.deepEqual(
  withoutBuffer(decodeAndInspectClipboardPngDataUrl(toDataUrl(legalBoundary))),
  { width: 2_880, height: 12_800, pixels: 36_864_000, encodedBytes: legalBoundary.length },
  "the legal 1440 x 6400 at 2x product boundary passes without allocating its decoded surface in the test"
);

assertRejected(createPng(16_385, 1, deflateSync(Buffer.from([0]))), "dimension_limit");
assertRejected(createPng(1, 16_385, deflateSync(Buffer.from([0]))), "dimension_limit");
assertRejected(createPng(8_000, 8_000, deflateSync(Buffer.from([0]))), "decoded_area_limit");
assert.throws(
  () => assertRasterBudget(0xffffffff, 0xffffffff, {
    maxDimension: 0xffffffff,
    decodedPixels: Number.MAX_SAFE_INTEGER,
    decodedRgbaBytes: Number.MAX_SAFE_INTEGER
  }),
  (error) => error instanceof ClipboardImageValidationError && error.code === "decoded_area_limit",
  "division-first checks reject hostile uint32 multiplication before it can overflow safe integers"
);

const truncated = ordinaryPng.subarray(0, ordinaryPng.length - 3);
assertRejected(truncated, "truncated_chunk");
const corruptHeader = Buffer.from(ordinaryPng);
corruptHeader[20] ^= 1;
assertRejected(corruptHeader, "invalid_chunk");
const forgedHeader = createPng(2, 2, deflateSync(Buffer.from([0])), { compression: 1 });
assertRejected(forgedHeader, "invalid_header");
const compressedMetadata = createPng(2, 2, deflateSync(Buffer.from([0])), {
  beforeIdat: [pngChunk("iCCP", Buffer.from("profile\0\0compressed"))]
});
assertRejected(compressedMetadata, "unsupported_chunk");

assert.equal(getClipboardPngEncodedByteLength(`data:image/jpeg;base64,${ordinaryPng.toString("base64")}`), null);
assert.throws(
  () => decodeAndInspectClipboardPngDataUrl(`${PNG_DATA_URL_PREFIX}${Buffer.from("not a png").toString("base64")}`),
  (error) => error instanceof ClipboardImageValidationError && error.code === "invalid_signature",
  "a PNG MIME envelope cannot disguise another format"
);
assert.equal(getClipboardPngEncodedByteLength(`${PNG_DATA_URL_PREFIX}AAAA`, 2), null, "encoded payloads over budget fail before Buffer allocation");
assert.equal(getClipboardPngEncodedByteLength(`${PNG_DATA_URL_PREFIX}A===`), null, "non-canonical base64 padding is rejected");
assert.equal(getClipboardPngEncodedByteLength(`${PNG_DATA_URL_PREFIX}AB==`), null, "non-zero unused base64 bits are rejected");

let decodedCalls = 0;
let clipboardWrites = 0;
const successfulWriter = createClipboardImageWriter({
  createFromBuffer(buffer) {
    decodedCalls += 1;
    assert.ok(buffer.equals(ordinaryPng));
    return nativeImageStub(2, 2);
  }
}, {
  writeImage() { clipboardWrites += 1; }
});
assert.equal(successfulWriter({}, ordinaryDataUrl), true);
assert.equal(decodedCalls, 1);
assert.equal(clipboardWrites, 1);

const malformedWriter = createClipboardImageWriter({
  createFromBuffer() { assert.fail("malformed PNG must not reach nativeImage"); }
}, {
  writeImage() { assert.fail("malformed PNG must not reach the clipboard"); }
});
assert.equal(malformedWriter({}, `${PNG_DATA_URL_PREFIX}AAAA`), false);

for (const image of [nativeImageStub(3, 2), nativeImageStub(0, 0, true)]) {
  const mismatchedWriter = createClipboardImageWriter({ createFromBuffer: () => image }, {
    writeImage() { assert.fail("a decode mismatch or empty image must not reach the clipboard"); }
  });
  assert.equal(mismatchedWriter({}, ordinaryDataUrl), false, "post-decode size and emptiness are rechecked");
}

const throwingWriter = createClipboardImageWriter({
  createFromBuffer() { throw new Error(`decoder leaked payload: ${ordinaryDataUrl}`); }
}, {
  writeImage() { assert.fail("a decoder failure must not reach the clipboard"); }
});
assert.equal(throwingWriter({}, ordinaryDataUrl), false, "native errors collapse to the stable IPC false result without data leakage");

console.log("Electron clipboard image budget tests passed");

function withoutBuffer(result) {
  const { buffer: _buffer, ...inspection } = result;
  return inspection;
}

function assertRejected(png, code) {
  assert.throws(
    () => decodeAndInspectClipboardPngDataUrl(toDataUrl(png)),
    (error) => error instanceof ClipboardImageValidationError && error.code === code,
    `PNG must be rejected with stable code ${code}`
  );
}

function toDataUrl(buffer) {
  return `${PNG_DATA_URL_PREFIX}${buffer.toString("base64")}`;
}

function nativeImageStub(width, height, empty = false) {
  return { isEmpty: () => empty, getSize: () => ({ width, height }) };
}

function createPng(width, height, compressedImageData, options = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = options.bitDepth ?? 8;
  header[9] = options.colorType ?? 6;
  header[10] = options.compression ?? 0;
  header[11] = options.filter ?? 0;
  header[12] = options.interlace ?? 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    ...(options.beforeIdat ?? []),
    pngChunk("IDAT", compressedImageData),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
