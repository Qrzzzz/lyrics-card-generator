import { APP_VERSION } from "@/lib/app-version";
import { compareVersionStrings, normalizeVersion } from "@/lib/version-compare";

const LATEST_RELEASE_URL = "https://api.github.com/repos/Qrzzzz/lyrics-card-generator/releases/latest";

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubRelease = {
  tag_name: string;
  html_url: string;
  assets?: ReleaseAsset[];
};

export type UpdateResult =
  | {
      status: "latest";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
    }
  | {
      status: "update-available";
      currentVersion: string;
      latestVersion: string;
      releaseUrl: string;
      installerUrl?: string;
      portableUrl?: string;
    }
  | {
      status: "no-release" | "error";
      currentVersion: string;
      message: string;
      details?: string;
    };

export async function checkGitHubUpdate(currentVersion = APP_VERSION): Promise<UpdateResult> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": `LyricsCardGenerator/${currentVersion} (https://github.com/Qrzzzz/lyrics-card-generator)`
      },
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 404) {
      return {
        status: "no-release",
        currentVersion,
        message: "No GitHub Release was found for this project."
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        currentVersion,
        message: `GitHub Releases returned HTTP ${response.status}.`,
        details: response.statusText
      };
    }

    return buildUpdateResult((await response.json()) as GitHubRelease, currentVersion);
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      message: "Unable to check GitHub Releases.",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

export function buildUpdateResult(release: GitHubRelease, currentVersion = APP_VERSION): UpdateResult {
  const latestVersion = normalizeVersion(release.tag_name);
  const comparison = compareVersionStrings(latestVersion, currentVersion);

  if (comparison === null) {
    return {
      status: "error",
      currentVersion,
      message: "The release version could not be compared.",
      details: `current=${currentVersion}, latest=${release.tag_name}`
    };
  }

  if (comparison <= 0) {
    return {
      status: "latest",
      currentVersion,
      latestVersion,
      releaseUrl: release.html_url
    };
  }

  const assets = release.assets ?? [];

  return {
    status: "update-available",
    currentVersion,
    latestVersion,
    releaseUrl: release.html_url,
    installerUrl: findInstallerUrl(assets),
    portableUrl: findPortableUrl(assets)
  };
}

export function findInstallerUrl(assets: ReleaseAsset[]) {
  return assets.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.includes("setup") && /\.(exe|msi)$/i.test(asset.name);
  })?.browser_download_url;
}

export function findPortableUrl(assets: ReleaseAsset[]) {
  return assets.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.includes("portable") && /\.exe$/i.test(asset.name);
  })?.browser_download_url;
}
