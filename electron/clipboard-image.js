const resourceBudgets = require("./resource-budgets.json");

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SAFE_ANCILLARY_CHUNK_LENGTHS = new Map([
  ["cHRM", 32],
  ["gAMA", 4],
  ["pHYs", 9],
  ["sRGB", 1]
]);
const PNG_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
const clipboardImageBudget = Object.freeze({ ...resourceBudgets.clipboardImage });

class ClipboardImageValidationError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`Clipboard image rejected: ${code}.`);
    this.name = "ClipboardImageValidationError";
    this.code = code;
  }
}

/**
 * Performs the allocation-free data URL/base64 checks shared by preload and
 * main. The clipboard contract is intentionally PNG-only: the renderer's copy
 * path always uses canvas.toDataURL("image/png"), while JPEG/WebP are download
 * formats and do not cross this IPC boundary.
 *
 * @param {unknown} value
 * @param {number} [maxEncodedBytes]
 */
function getClipboardPngEncodedByteLength(value, maxEncodedBytes = clipboardImageBudget.encodedBytes) {
  if (typeof value !== "string" || !value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const payloadStart = PNG_DATA_URL_PREFIX.length;
  const payloadLength = value.length - payloadStart;
  if (payloadLength === 0 || payloadLength % 4 !== 0) return null;

  let padding = 0;
  if (value.endsWith("==")) padding = 2;
  else if (value.endsWith("=")) padding = 1;

  const decodedBytes = (payloadLength / 4) * 3 - padding;
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes <= 0 || decodedBytes > maxEncodedBytes) return null;

  const dataEnd = value.length - padding;
  for (let index = payloadStart; index < dataEnd; index += 1) {
    if (base64Sextet(value.charCodeAt(index)) < 0) return null;
  }
  for (let index = dataEnd; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return null;
  }

  // Canonical padding prevents permissive decoders from accepting hidden or
  // ambiguous trailing bits without re-encoding the entire (potentially large)
  // payload into another string.
  if (padding === 2 && (base64Sextet(value.charCodeAt(dataEnd - 1)) & 0x0f) !== 0) return null;
  if (padding === 1 && (base64Sextet(value.charCodeAt(dataEnd - 1)) & 0x03) !== 0) return null;
  return decodedBytes;
}

/** @param {number} code */
function base64Sextet(code) {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 71;
  if (code >= 48 && code <= 57) return code + 4;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

/**
 * @param {unknown} dataUrl
 * @param {{ encodedBytes: number, maxDimension: number, decodedPixels: number, decodedRgbaBytes: number }} [budget]
 */
function decodeAndInspectClipboardPngDataUrl(dataUrl, budget = clipboardImageBudget) {
  const encodedBytes = getClipboardPngEncodedByteLength(dataUrl, budget.encodedBytes);
  if (encodedBytes === null) throw new ClipboardImageValidationError("invalid_data_url");

  const payload = /** @type {string} */ (dataUrl).slice(PNG_DATA_URL_PREFIX.length);
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length !== encodedBytes) throw new ClipboardImageValidationError("invalid_base64");
  return { buffer, ...inspectPngBuffer(buffer, budget) };
}

/**
 * Validates the bounded PNG container before it reaches Electron/Skia. In
 * addition to the pixel limits, compressed or unbounded metadata chunks are
 * rejected; Chromium canvas PNGs use the core chunks and, depending on the
 * encoder, only fixed-size color/physical metadata from the allowlist below.
 *
 * @param {Buffer} buffer
 * @param {{ encodedBytes: number, maxDimension: number, decodedPixels: number, decodedRgbaBytes: number }} [budget]
 */
function inspectPngBuffer(buffer, budget = clipboardImageBudget) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= PNG_SIGNATURE.length || buffer.length > budget.encodedBytes) {
    throw new ClipboardImageValidationError("encoded_size");
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new ClipboardImageValidationError("invalid_signature");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let finishedImageData = false;
  let sawEnd = false;
  const ancillaryChunks = new Set();

  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw new ClipboardImageValidationError("truncated_chunk");
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    if (length > buffer.length - dataStart - 4) throw new ClipboardImageValidationError("truncated_chunk");
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;
    const type = buffer.toString("ascii", typeStart, dataStart);
    if (!isPngChunkType(type) || crc32(buffer, typeStart, dataEnd) !== buffer.readUInt32BE(dataEnd)) {
      throw new ClipboardImageValidationError("invalid_chunk");
    }

    if (!sawHeader && type !== "IHDR") throw new ClipboardImageValidationError("missing_header");
    if (sawEnd) throw new ClipboardImageValidationError("trailing_data");

    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== PNG_SIGNATURE.length) {
        throw new ClipboardImageValidationError("invalid_header");
      }
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      const bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      if (
        !isValidPngColorMode(bitDepth, colorType) ||
        buffer[dataStart + 10] !== 0 ||
        buffer[dataStart + 11] !== 0 ||
        buffer[dataStart + 12] > 1
      ) {
        throw new ClipboardImageValidationError("invalid_header");
      }
      assertRasterBudget(width, height, budget);
      sawHeader = true;
    } else if (type === "PLTE") {
      if (sawPalette || sawImageData || colorType === 0 || colorType === 4 || length === 0 || length > 768 || length % 3 !== 0) {
        throw new ClipboardImageValidationError("invalid_palette");
      }
      sawPalette = true;
    } else if (type === "IDAT") {
      if (finishedImageData || (colorType === 3 && !sawPalette)) {
        throw new ClipboardImageValidationError("invalid_image_data");
      }
      sawImageData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !sawImageData) throw new ClipboardImageValidationError("invalid_end");
      sawEnd = true;
      if (nextOffset !== buffer.length) throw new ClipboardImageValidationError("trailing_data");
    } else {
      if (sawImageData) finishedImageData = true;
      const fixedLength = SAFE_ANCILLARY_CHUNK_LENGTHS.get(type);
      if (
        PNG_CRITICAL_CHUNKS.has(type) ||
        type.charCodeAt(0) < 97 ||
        fixedLength === undefined ||
        length !== fixedLength ||
        ancillaryChunks.has(type) ||
        sawImageData
      ) {
        throw new ClipboardImageValidationError("unsupported_chunk");
      }
      ancillaryChunks.add(type);
    }
    offset = nextOffset;
  }

  if (!sawHeader || !sawImageData || !sawEnd) throw new ClipboardImageValidationError("incomplete_png");
  return { width, height, pixels: width * height, encodedBytes: buffer.length };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {{ maxDimension: number, decodedPixels: number, decodedRgbaBytes: number }} budget
 */
function assertRasterBudget(width, height, budget) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ClipboardImageValidationError("invalid_dimensions");
  }
  if (width > budget.maxDimension || height > budget.maxDimension) {
    throw new ClipboardImageValidationError("dimension_limit");
  }
  // Division-first comparisons avoid multiplying hostile uint32 dimensions
  // until both area and RGBA-byte multiplication are known to be safe.
  if (
    width > Math.floor(budget.decodedPixels / height) ||
    width > Math.floor(Math.floor(budget.decodedRgbaBytes / 4) / height)
  ) {
    throw new ClipboardImageValidationError("decoded_area_limit");
  }
}

/** @param {string} type */
function isPngChunkType(type) {
  if (type.length !== 4) return false;
  for (let index = 0; index < type.length; index += 1) {
    const code = type.charCodeAt(index);
    if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122))) return false;
  }
  // PNG reserves a lowercase third byte for future incompatible extensions.
  return type.charCodeAt(2) >= 65 && type.charCodeAt(2) <= 90;
}

/** @param {number} bitDepth @param {number} colorType */
function isValidPngColorMode(bitDepth, colorType) {
  if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth);
  if (colorType === 2 || colorType === 4 || colorType === 6) return [8, 16].includes(bitDepth);
  if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth);
  return false;
}

/** @type {Uint32Array | undefined} */
let crcTable;

/** @param {Buffer} buffer @param {number} start @param {number} end */
function crc32(buffer, start, end) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = crcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {{ createFromBuffer: (buffer: Buffer) => { isEmpty: () => boolean, getSize: () => { width: number, height: number } } }} nativeImage
 * @param {{ writeImage: (image: unknown) => void }} clipboard
 */
function createClipboardImageWriter(nativeImage, clipboard) {
  return (_event, dataUrl) => {
    try {
      const inspected = decodeAndInspectClipboardPngDataUrl(dataUrl);
      const image = nativeImage.createFromBuffer(inspected.buffer);
      const size = image.getSize();
      if (
        image.isEmpty() ||
        size.width !== inspected.width ||
        size.height !== inspected.height ||
        size.width <= 0 ||
        size.height <= 0
      ) {
        return false;
      }
      assertRasterBudget(size.width, size.height, clipboardImageBudget);
      clipboard.writeImage(image);
      return true;
    } catch {
      // Keep renderer-visible failures stable and avoid reflecting payload data
      // or native decoder diagnostics across IPC.
      return false;
    }
  };
}

module.exports = {
  ClipboardImageValidationError,
  PNG_DATA_URL_PREFIX,
  assertRasterBudget,
  clipboardImageBudget,
  createClipboardImageWriter,
  decodeAndInspectClipboardPngDataUrl,
  getClipboardPngEncodedByteLength,
  inspectPngBuffer
};
