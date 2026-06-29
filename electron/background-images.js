const path = require("node:path");

const BACKGROUND_IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const GENERATED_BACKGROUND_IMAGE_ID = /^\d{13}-[a-z0-9]{8}\.(png|jpg|jpeg|webp|gif)$/;

function getBackgroundsDirectory(userDataPath) {
  return path.resolve(userDataPath, "backgrounds");
}

function getBackgroundImageMime(imagePath) {
  return BACKGROUND_IMAGE_MIME[path.extname(imagePath).toLowerCase()];
}

function safeBackgroundPathForUserData(userDataPath, imageId) {
  if (typeof imageId !== "string" || imageId.length === 0) {
    return null;
  }

  if (path.basename(imageId) !== imageId) {
    return null;
  }

  if (!GENERATED_BACKGROUND_IMAGE_ID.test(imageId)) {
    return null;
  }

  const backgroundsDirectory = getBackgroundsDirectory(userDataPath);
  const target = path.resolve(backgroundsDirectory, imageId);
  const relative = path.relative(backgroundsDirectory, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return target;
}

module.exports = {
  BACKGROUND_IMAGE_MIME,
  getBackgroundImageMime,
  getBackgroundsDirectory,
  safeBackgroundPathForUserData
};
