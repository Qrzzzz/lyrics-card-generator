import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

export type SettingsTab = { id: string; label: string; icon: LucideIcon };

export function SettingsTabs({ tabs, active, onChange }: { tabs: SettingsTab[]; active: string; onChange: (id: string) => void }) {
  return (
    <nav aria-label="Settings categories" className="flex gap-1 overflow-x-auto border-b border-white/10 p-2 md:w-48 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-current={active === id ? "page" : undefined} className="relative flex min-w-max items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold">
          {active === id ? <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-lg bg-white/12" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
          <Icon className="relative h-4 w-4" /><span className="relative">{label}</span>
        </button>
      ))}
    </nav>
  );
}
