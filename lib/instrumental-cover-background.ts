import { getInstrumentalDesign } from "@/lib/instrumental-layout";

export function getInstrumentalCoverGeometry(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const design = getInstrumentalDesign(width, height);
  const scale = width / Math.max(sourceWidth, sourceHeight);
  const artworkWidth = sourceWidth * scale;
  const artworkHeight = sourceHeight * scale;
  return {
    artworkX: (width - artworkWidth) / 2, artworkWidth, artworkHeight,
    sampleHeight: Math.min(artworkHeight, width) * design.edgeFraction,
    blurRadius: design.blurRadius,
    fadeStart: artworkHeight * design.clearFraction,
    fadeEnd: Math.min(height, artworkHeight + width * design.extensionFraction)
  };
}

const compositions = new Map<string, Promise<string>>();
export function prepareInstrumentalCoverBackground(input: { sourceUrl: string; width: number; height: number }) {
  const key = JSON.stringify(input);
  const cached = compositions.get(key);
  if (cached) return cached;
  const pending = loadCover(input.sourceUrl).then(image =>
    composeInstrumentalCoverBackground(image, input.width, input.height, 2).toDataURL("image/png"));
  compositions.set(key, pending);
  while (compositions.size > 4) compositions.delete(compositions.keys().next().value!);
  void pending.catch(() => { if (compositions.get(key) === pending) compositions.delete(key); });
  return pending;
}

/** Transparent cover overlay: the existing solid-colour resolver owns the base. */
export function composeInstrumentalCoverBackground(
  image: HTMLImageElement | HTMLCanvasElement, width: number, height: number, pixelRatio = 1
) {
  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const g = getInstrumentalCoverGeometry(sourceWidth, sourceHeight, width, height);
  const [artwork, artworkContext] = makeCanvas(width * pixelRatio, g.artworkHeight * pixelRatio);
  if (g.artworkX > 0) {
    // Preserve the complete portrait source. Fill only its side gaps softly.
    artworkContext.save(); artworkContext.beginPath();
    artworkContext.rect(0, 0, g.artworkX * pixelRatio, artwork.height);
    artworkContext.rect((g.artworkX + g.artworkWidth) * pixelRatio, 0, g.artworkX * pixelRatio, artwork.height);
    artworkContext.clip(); artworkContext.filter = `blur(${g.blurRadius * pixelRatio}px)`;
    const enlargedHeight = width * sourceHeight / sourceWidth;
    artworkContext.drawImage(image, -g.blurRadius * pixelRatio, (g.artworkHeight - enlargedHeight) / 2 * pixelRatio,
      (width + g.blurRadius * 2) * pixelRatio, enlargedHeight * pixelRatio);
    artworkContext.restore();
  }
  artworkContext.drawImage(image, g.artworkX * pixelRatio, 0, g.artworkWidth * pixelRatio, g.artworkHeight * pixelRatio);

  // Bound the expensive kernels independently of export resolution. Retain a
  // sharp high-resolution layer, and use two blur levels for gradual softening.
  const workWidth = Math.min(540, Math.ceil(width));
  const workScale = workWidth / width;
  const radius = g.blurRadius * workScale;
  const pad = Math.ceil(radius * 3 + 2);
  const workHeight = Math.ceil(height * workScale);
  const artHeight = g.artworkHeight * workScale;
  const band = Math.max(1, Math.round(g.sampleHeight * workScale));
  const [source, sourceContext] = makeCanvas(workWidth + pad * 2, workHeight + pad * 2);
  sourceContext.drawImage(artwork, pad, pad, workWidth, artHeight);
  sourceContext.save(); sourceContext.translate(pad, pad + artHeight + band); sourceContext.scale(1, -1);
  sourceContext.drawImage(artwork, 0, artwork.height - g.sampleHeight * pixelRatio,
    artwork.width, g.sampleHeight * pixelRatio, 0, 0, workWidth, band);
  sourceContext.restore();
  sourceContext.drawImage(artwork, 0, artwork.height - g.sampleHeight * pixelRatio, artwork.width, 1,
    pad, pad + artHeight + band, workWidth, Math.max(1, workHeight - artHeight - band + pad));
  sourceContext.drawImage(artwork, 0, 0, artwork.width, 1, pad, 0, workWidth, pad);
  sourceContext.drawImage(source, pad, 0, 1, source.height, 0, 0, pad, source.height);
  sourceContext.drawImage(source, pad + workWidth - 1, 0, 1, source.height, pad + workWidth, 0, pad, source.height);

  const [output, context] = makeCanvas(width * pixelRatio, height * pixelRatio);
  const transition = g.fadeEnd - g.fadeStart;
  for (const level of [{ radius, end: g.fadeEnd }, { radius: radius * 0.35, end: g.fadeStart + transition * 0.82 }]) {
    const [blurred, blurredContext] = makeCanvas(workWidth, workHeight);
    blurredContext.filter = `blur(${level.radius}px)`;
    blurredContext.drawImage(source, -pad, -pad);
    applyFade(blurred, g.fadeStart * workScale, level.end * workScale);
    context.drawImage(blurred, 0, 0, output.width, output.height);
  }
  applyFade(artwork, g.fadeStart * pixelRatio,
    Math.min(g.artworkHeight, g.fadeStart + transition * 0.58) * pixelRatio);
  context.drawImage(artwork, 0, 0);
  return output;
}

function applyFade(canvas: HTMLCanvasElement, start: number, end: number) {
  const context = canvas.getContext("2d")!;
  context.save(); context.globalCompositeOperation = "destination-in";
  const fade = context.createLinearGradient(0, start, 0, Math.max(start + 1, end));
  fade.addColorStop(0, "#000"); fade.addColorStop(0.25, "rgba(0,0,0,.84)");
  fade.addColorStop(0.5, "rgba(0,0,0,.5)"); fade.addColorStop(0.75, "rgba(0,0,0,.16)"); fade.addColorStop(1, "transparent");
  context.fillStyle = fade; context.fillRect(0, 0, canvas.width, canvas.height); context.restore();
}
function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
  const context = canvas.getContext("2d"); if (!context) throw new Error("Cover extension canvas unavailable");
  return [canvas, context];
}
function loadCover(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => finish(new Error("Cover extension timed out")), 10_000);
    const finish = (error?: Error) => { window.clearTimeout(timer); image.onload = null; image.onerror = null; if (error) reject(error); else resolve(image); };
    image.crossOrigin = "anonymous"; image.onload = () => finish(); image.onerror = () => finish(new Error("Cover extension image unavailable")); image.src = sourceUrl;
  });
}
