import { APP_VERSION } from "@/lib/app-version";

const LATEST_RELEASE_URL = "https://api.github.com/repos/Qrzzzz/lyrics-card-generator/releases/latest";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  assets?: ReleaseAsset[];
};

type VersionParts = {
  major: number;
  minor: number;
  patch: number;
};

export type UpdateCheckResult =
  | {
      status: "latest" | "update-available";
      currentVersion: string;
      latestVersion: string;
      tagName: string;
      releaseUrl: string;
      downloadUrl: string;
    }
  | {
      status: "unknown-version";
      currentVersion: string;
      tagName: string;
      releaseUrl: string;
      downloadUrl: string;
    }
  | {
      status: "no-release";
      currentVersion: string;
    }
  | {
      status: "error";
      currentVersion: string;
    };

export async function checkGitHubUpdate(currentVersion = APP_VERSION): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: {
        accept: "application/vnd.github+json"
      }
    });

    if (response.status === 404) {
      return { status: "no-release", currentVersion };
    }

    if (!response.ok) {
      return { status: "error", currentVersion };
    }

    const release = (await response.json()) as GitHubRelease;
    const current = parseVersion(currentVersion);
    const latest = parseVersion(release.tag_name);
    const downloadUrl = findInstallerUrl(release.assets ?? []) ?? release.html_url;

    if (!current || !latest) {
      return {
        status: "unknown-version",
        currentVersion,
        tagName: release.tag_name,
        releaseUrl: release.html_url,
        downloadUrl
      };
    }

    return {
      status: compareVersions(latest, current) > 0 ? "update-available" : "latest",
      currentVersion,
      latestVersion: formatVersion(latest),
      tagName: release.tag_name,
      releaseUrl: release.html_url,
      downloadUrl
    };
  } catch {
    return { status: "error", currentVersion };
  }
}

function parseVersion(version: string): VersionParts | null {
  const normalized = version.trim().replace(/^v/i, "");
  // Pre-release/build suffixes are intentionally ignored for this lightweight check.
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareVersions(left: VersionParts, right: VersionParts) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}

function formatVersion(version: VersionParts) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function findInstallerUrl(assets: ReleaseAsset[]) {
  return assets.find((asset) => /\.(exe|msi)$/i.test(asset.name))?.browser_download_url;
}
