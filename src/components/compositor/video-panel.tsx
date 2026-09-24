import { Plus, X } from "lucide-react";

import { Badge } from "@kumix/ui/reui/badge";
import { Button } from "@kumix/ui/ui/button";
import { pickVideos } from "@/lib/commands";
import { basename, formatDuration } from "@/lib/utils";
import { useStore } from "@/stores/app-store";
import type { PanelKey } from "@/types";

const PANELS: { key: PanelKey; label: string; hint: string }[] = [
  { key: "main", label: "Main Video", hint: "1 row = 1 short (mixed)" },
  { key: "cta", label: "CTA Video", hint: "Inserted in the middle" },
  { key: "reaction", label: "Reaction Video", hint: "Green screen PiP, looped, muted" },
];

export function VideoPanels() {
  const lists = useStore((s) => s.lists);
  const queue = useStore((s) => s.queue);
  const addVideos = useStore((s) => s.addVideos);
  const removeVideo = useStore((s) => s.removeVideo);
  const setError = useStore((s) => s.setError);

  const handleAdd = async (key: PanelKey) => {
    try {
      const items = await pickVideos();
      if (items.length > 0) {
        addVideos(key, items);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {PANELS.map(({ key, label, hint }) => {
        const items = lists[key];
        return (
          <div key={key} className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{label}</span>
                <Badge variant={items.length ? "secondary" : "outline"} size="sm">
                  {items.length}
                </Badge>
                <span className="text-muted-foreground/70 text-xs">{hint}</span>
              </div>
              <Button variant="outline" size="sm" disabled={!!queue} onClick={() => handleAdd(key)}>
                <Plus className="mr-1.5 size-3.5" />
                Add
              </Button>
            </div>

            {items.length > 0 && (
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto border-border border-t px-2 py-2">
                {items.map((it, i) => (
                  <div
                    key={`${it.path}-${i}`}
                    className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                  >
                    <span className="truncate text-sm">{basename(it.path)}</span>
                    <Badge variant="secondary" size="sm" className="ml-auto shrink-0">
                      {it.info.w}×{it.info.h} · {formatDuration(it.info.dur)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      disabled={!!queue}
                      aria-label="Remove"
                      onClick={() => removeVideo(key, i)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
