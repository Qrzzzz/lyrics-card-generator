import { ExternalLink } from "lucide-react";
import { UpdateButton } from "@/components/editor/UpdateButton";
import { recordRenderBoundary } from "@/components/editor/render-boundary-diagnostics";
import { APP_VERSION } from "@/lib/app-version";
import { APP_ICON_URL } from "@/lib/static-assets";
import type { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import type { settingsCopy } from "@/lib/settings/copy";

const LINKS = [
  ["githubProfile", "https://github.com/Qrzzzz"],
  ["repository", "https://github.com/Qrzzzz/lyrics-card-generator"],
  ["releases", "https://github.com/Qrzzzz/lyrics-card-generator/releases"]
] as const;

export function AboutSettingsSection({ copy, t }: { copy: typeof settingsCopy[Locale]; t: ReturnType<typeof createT> }) {
  recordRenderBoundary("SettingsAbout");
  return <section className="grid gap-4"><div className="flex items-center gap-3"><img src={APP_ICON_URL} alt="Lyrics Card" className="h-12 w-12 rounded-xl" /><div><div className="app-text-primary font-bold">Lyrics Card Generator</div><div className="app-text-subtle text-sm">{copy.version} {APP_VERSION}</div></div></div><p className="app-text-subtle text-sm">{copy.projectDescription}</p><UpdateButton t={t} /><div className="grid gap-2">{LINKS.map(([key, url]) => <a key={key} href={url} target="_blank" rel="noreferrer" className="app-button flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold"><span>{copy[key]}</span><ExternalLink className="h-4 w-4" /></a>)}</div></section>;
}
