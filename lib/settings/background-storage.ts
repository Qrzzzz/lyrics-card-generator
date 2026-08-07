import { getLyricsCardDesktopApi } from "@/lib/desktop-api";

const DB_NAME = "lyric-card-generator";
const STORE_NAME = "background-images";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Stores the image in the desktop file store or the browser's IndexedDB fallback. */
export async function storeBackgroundImage(file: File) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop?.saveBackgroundImage) return desktop.saveBackgroundImage();

  const id = crypto.randomUUID();
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return { imageId: id, imageUrl: URL.createObjectURL(file) };
}

export async function loadBackgroundImage(imageId?: string, imageUrl?: string) {
  // A missing id denotes an already-resolved URL. Desktop returns a data URL;
  // the browser fallback creates a Blob URL whose lifecycle belongs to the caller.
  if (!imageId) return imageUrl;
  const desktop = getLyricsCardDesktopApi();
  if (desktop?.readBackgroundImage) return desktop.readBackgroundImage(imageId);

  const database = await openDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(imageId);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return blob ? URL.createObjectURL(blob) : undefined;
}

export async function removeBackgroundImage(imageId?: string) {
  if (!imageId) return;
  const desktop = getLyricsCardDesktopApi();
  if (desktop?.removeBackgroundImage) {
    await desktop.removeBackgroundImage(imageId);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(imageId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function extractAverageColor(file: Blob) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "#7C3AED";
  context.drawImage(bitmap, 0, 0, 24, 24);
  const pixels = context.getImageData(0, 0, 24, 24).data;
  let red = 0, green = 0, blue = 0, count = 0;
  // Sample every fourth pixel; the 24x24 thumbnail makes denser reads unnecessary.
  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] < 128) continue;
    red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
  }
  const hex = (value: number) => Math.round(value / Math.max(1, count)).toString(16).padStart(2, "0");
  return `#${hex(red)}${hex(green)}${hex(blue)}`;
}
