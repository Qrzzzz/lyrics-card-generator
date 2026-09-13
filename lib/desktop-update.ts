export type DesktopUpdateState = {
  phase: "idle" | "checking" | "latest" | "available" | "downloading" | "downloaded" | "installing" | "error";
  currentVersion: string;
  latestVersion?: string;
  percent?: number;
  error?: "network" | "timeout" | "metadata" | "integrity" | "unsupported" | "save" | "installError";
};
