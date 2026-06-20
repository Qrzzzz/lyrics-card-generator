import { Loader2, Sparkles } from "lucide-react";
import { StarBorder } from "@/components/ui/StarBorder";

export function AiTranslateButton({
  label,
  loading,
  themeColor,
  onClick
}: {
  label: string;
  loading: boolean;
  themeColor: string;
  onClick: () => void;
}) {
  return (
    <StarBorder
      type="button"
      variant="ai"
      color={themeColor}
      speed="8s"
      data-testid="ai-translate-button"
      aria-busy={loading}
      onClick={onClick}
      disabled={loading}
      className="ai-translate-trigger h-10 px-3 text-sm font-semibold"
    >
      <span className="ai-translate-trigger__content">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="ai-translate-trigger__icon h-4 w-4" />}
        <span>{label}</span>
        {!loading ? <span aria-hidden="true" className="ai-translate-trigger__pulse" /> : null}
      </span>
    </StarBorder>
  );
}
