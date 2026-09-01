export type SettingsPersistenceSource = "preferences" | "ai";

export type SettingsPersistenceIssue = {
  message: string;
  retryLabel: string;
  retry: () => Promise<void>;
};

export type SettingsPersistenceIssueChange = (
  source: SettingsPersistenceSource,
  issue: SettingsPersistenceIssue | null
) => void;
