import { APP_VERSION } from "@/lib/app-version";
import { compareVersionStrings, normalizeVersion } from "@/lib/version-compare";
import { readResponseJsonBounded, ResponseBodyLimitExceededError } from "@/lib/bounded-response";
import {
  ClientRequestCancelledError,
  UpstreamTimeoutError,
  withUpstreamDeadline
} from "@/lib/upstream-control";
import resourceBudgets from "@/electron/resource-budgets.json";

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

export type UpdateErrorCode =
  | "no_release"
  | "http_error"
  | "network_error"
  | "invalid_release_version"
  | "cancelled"
  | "timeout"
  | "response_too_large";

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
    }
  | {
      status: "no-release";
      code: "no_release";
      currentVersion: string;
      message: string;
      details?: string;
    }
  | {
      status: "error";
      code: Exclude<UpdateErrorCode, "no_release">;
      currentVersion: string;
      message: string;
      details?: string;
    };

export async function checkGitHubUpdate(
  currentVersion = APP_VERSION,
  clientSignal?: AbortSignal
): Promise<UpdateResult> {
  try {
    return await withUpstreamDeadline(
      clientSignal,
      resourceBudgets.upstreamTimeoutMs.github,
      async (signal) => {
        const response = await fetch(LATEST_RELEASE_URL, {
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": `LyricsCardGenerator/${currentVersion} (https://github.com/Qrzzzz/lyrics-card-generator)`
          },
          signal
        });

        if (response.status === 404) {
          return {
            status: "no-release",
            code: "no_release",
            currentVersion,
            message: "No GitHub Release was found for this project."
          };
        }

        if (!response.ok) {
          return {
            status: "error",
            code: "http_error",
            currentVersion,
            message: `GitHub Releases returned HTTP ${response.status}.`,
            details: response.statusText
          };
        }

        const release = await readResponseJsonBounded<GitHubRelease>(
          response,
          resourceBudgets.upstreamResponseBytes.githubRelease,
          signal
        );
        return buildUpdateResult(release, currentVersion);
      }
    );
  } catch (error) {
    const code = error instanceof ClientRequestCancelledError
      ? "cancelled"
      : error instanceof UpstreamTimeoutError
        ? "timeout"
        : error instanceof ResponseBodyLimitExceededError
          ? "response_too_large"
          : "network_error";
    return {
      status: "error",
      code,
      currentVersion,
      message: code === "timeout"
        ? "GitHub Releases timed out."
        : code === "response_too_large"
          ? "GitHub Releases returned too much data."
          : code === "cancelled"
            ? "The update check was cancelled."
            : "Unable to check GitHub Releases.",
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
      code: "invalid_release_version",
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
    installerUrl: findInstallerUrl(assets)
  };
}

export function findInstallerUrl(assets: ReleaseAsset[]) {
  // Asset selection is intentionally name-based because GitHub Releases does
  // not expose a semantic installer role.
  return assets.find((asset) => {
    const name = asset.name.toLowerCase();
    return name.includes("setup") && /\.(exe|msi)$/i.test(asset.name);
  })?.browser_download_url;
}
