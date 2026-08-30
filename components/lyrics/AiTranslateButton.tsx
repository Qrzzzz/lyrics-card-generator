import { Loader2, Sparkles } from "lucide-react";
import type { Ref } from "react";
import { StarBorder } from "@/components/ui/StarBorder";

export function AiTranslateButton({
  buttonRef,
  label,
  loading,
  themeColor,
  onClick
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  label: string;
  loading: boolean;
  themeColor: string;
  onClick: () => void;
}) {
  return (
    <StarBorder
      buttonRef={buttonRef}
      type="button"
      variant="ai"
      color={themeColor}
      speed="8s"
      data-testid="ai-translate-button"
      aria-busy={loading}
      onClick={onClick}
      disabled={loading}
      className="ai-translate-trigger h-11 px-4 text-sm font-semibold"
    >
      <span className="ai-translate-trigger__content">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="ai-translate-trigger__icon h-4 w-4" />}
        <span>{label}</span>
      </span>
    </StarBorder>
  );
}
