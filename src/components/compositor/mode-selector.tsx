import { Sparkles, Video } from "lucide-react";

import { useStore } from "@/stores/app-store";

export function ModeSelector() {
  const mode = useStore((s) => s.opts.mode);
  const updateOpts = useStore((s) => s.updateOpts);

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
      <button
        type="button"
        onClick={() => updateOpts({ mode: "reaction" })}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 font-medium text-xs transition-all ${
          mode === "reaction"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Video className="size-3.5" />
        Reaction (Green Screen PiP)
      </button>
      <button
        type="button"
        onClick={() => updateOpts({ mode: "satisfying" })}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 font-medium text-xs transition-all ${
          mode === "satisfying"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sparkles className="size-3.5" />
        Satisfying (Split Screen)
      </button>
    </div>
  );
}
