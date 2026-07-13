import type { UserSettings } from "@/lib/settings/types";
import type { Locale } from "@/lib/types";

export const APP_PREFERENCES_SCHEMA_VERSION = 2;

export type AppPreferencesRecord = {
  schemaVersion: typeof APP_PREFERENCES_SCHEMA_VERSION;
  revision: number;
  updatedAt: number;
  locale: Locale;
  userSettings: UserSettings;
};

export function compareAppPreferences(
  left: Pick<AppPreferencesRecord, "revision" | "updatedAt">,
  right: Pick<AppPreferencesRecord, "revision" | "updatedAt">
) {
  if (left.revision !== right.revision) return left.revision - right.revision;
  return left.updatedAt - right.updatedAt;
}

export function selectNewerAppPreferences(
  local: AppPreferencesRecord | null,
  desktop: AppPreferencesRecord | null
) {
  if (!local) return { source: "desktop" as const, record: desktop };
  if (!desktop) return { source: "local" as const, record: local };
  // Desktop wins a complete tie so a 5.1.0 legacy JSON record keeps the
  // historical desktop-authoritative behavior during one-time migration.
  return compareAppPreferences(local, desktop) > 0
    ? { source: "local" as const, record: local }
    : { source: "desktop" as const, record: desktop };
}

export function nextAppPreferencesRevision(current: AppPreferencesRecord | null, now = Date.now()) {
  return {
    revision: Math.max(0, current?.revision ?? 0) + 1,
    updatedAt: Math.max(now, (current?.updatedAt ?? 0) + 1)
  };
}
