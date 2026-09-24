import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@kumix/ui/reui/badge";
import { Button } from "@kumix/ui/ui/button";
import { formatDuration } from "@/lib/utils";
import { useStore } from "@/stores/app-store";
import type { Combo } from "@/types";

interface ComboNavigatorProps {
  combos: Combo[];
  currentCombo?: Combo;
}

export function ComboNavigator({ combos, currentCombo }: ComboNavigatorProps) {
  const comboIdx = useStore((s) => s.comboIdx);
  const setComboIdx = useStore((s) => s.setComboIdx);

  if (!currentCombo) return null;

  const curTotalDur = currentCombo.m.info.dur + currentCombo.c.info.dur;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous"
          disabled={comboIdx <= 0}
          onClick={() => setComboIdx((i) => i - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="truncate text-muted-foreground text-xs">
          {comboIdx + 1}/{combos.length}: {currentCombo.name}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next"
          disabled={comboIdx >= combos.length - 1}
          onClick={() => setComboIdx((i) => i + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Badge variant="outline" size="sm" className="shrink-0">
        {curTotalDur > 0 ? formatDuration(currentCombo.m.info.dur / 2) : ""} → CTA →{" "}
        {formatDuration(curTotalDur)}
      </Badge>
    </div>
  );
}
