import resourceBudgets from "@/electron/resource-budgets.json";

export const EXPORT_CANVAS_DIMENSION_LIMIT = resourceBudgets.clipboardImage.maxDimension;
export const CLIPBOARD_IMAGE_PIXEL_LIMIT = resourceBudgets.clipboardImage.decodedPixels;

export type ExportRasterSize = Readonly<{
  width: number;
  height: number;
}>;

export type ExportRasterSizeIssue = Readonly<{
  expected: ExportRasterSize;
  limit: number;
}>;

export type ClipboardRasterSizeIssue = Readonly<{
  expected: ExportRasterSize;
  dimensionLimit: number;
  pixelLimit: number;
  reason: "dimension" | "area";
}>;

export function getExpectedExportRasterSize(
  width: number,
  height: number,
  pixelRatio: number
): ExportRasterSize {
  return {
    // HTMLCanvasElement converts assigned dimensions to integers.
    width: Math.floor(width * pixelRatio),
    height: Math.floor(height * pixelRatio)
  };
}

export function getExportRasterSizeIssue(
  width: number,
  height: number,
  pixelRatio: number
): ExportRasterSizeIssue | null {
  const expected = getExpectedExportRasterSize(width, height, pixelRatio);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(pixelRatio) ||
    width <= 0 ||
    height <= 0 ||
    pixelRatio <= 0 ||
    !Number.isFinite(expected.width) ||
    !Number.isFinite(expected.height) ||
    expected.width <= 0 ||
    expected.height <= 0 ||
    expected.width > EXPORT_CANVAS_DIMENSION_LIMIT ||
    expected.height > EXPORT_CANVAS_DIMENSION_LIMIT
  ) {
    return { expected, limit: EXPORT_CANVAS_DIMENSION_LIMIT };
  }
  return null;
}

export function getClipboardRasterSizeIssue(
  width: number,
  height: number,
  pixelRatio: number
): ClipboardRasterSizeIssue | null {
  const expected = getExpectedExportRasterSize(width, height, pixelRatio);
  if (getExportRasterSizeIssue(width, height, pixelRatio)) {
    return {
      expected,
      dimensionLimit: resourceBudgets.clipboardImage.maxDimension,
      pixelLimit: CLIPBOARD_IMAGE_PIXEL_LIMIT,
      reason: "dimension"
    };
  }
  if (expected.width > Math.floor(CLIPBOARD_IMAGE_PIXEL_LIMIT / expected.height)) {
    return {
      expected,
      dimensionLimit: resourceBudgets.clipboardImage.maxDimension,
      pixelLimit: CLIPBOARD_IMAGE_PIXEL_LIMIT,
      reason: "area"
    };
  }
  return null;
}

export class ExportRasterSizeLimitError extends Error {
  readonly issue: ExportRasterSizeIssue;

  constructor(issue: ExportRasterSizeIssue) {
    super(
      `The requested export size ${issue.expected.width} x ${issue.expected.height} exceeds the supported ${issue.limit}px canvas limit.`
    );
    this.name = "ExportRasterSizeLimitError";
    this.issue = issue;
  }
}

export class ExportRasterSizeMismatchError extends Error {
  readonly expected: ExportRasterSize;
  readonly actual: ExportRasterSize;

  constructor(expected: ExportRasterSize, actual: ExportRasterSize) {
    super(
      `The rendered image size ${actual.width} x ${actual.height} does not match the requested ${expected.width} x ${expected.height}.`
    );
    this.name = "ExportRasterSizeMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class ClipboardRasterSizeLimitError extends Error {
  readonly issue: ClipboardRasterSizeIssue;

  constructor(issue: ClipboardRasterSizeIssue) {
    super(
      issue.reason === "area"
        ? `The clipboard image would contain ${issue.expected.width * issue.expected.height} pixels, exceeding the supported ${issue.pixelLimit}-pixel clipboard limit.`
        : `The requested clipboard image size ${issue.expected.width} x ${issue.expected.height} exceeds the supported ${issue.dimensionLimit}px canvas limit.`
    );
    this.name = "ClipboardRasterSizeLimitError";
    this.issue = issue;
  }
}
