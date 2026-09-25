import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, Loader2, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@kumix/ui/reui/alert";
import { Button } from "@kumix/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kumix/ui/ui/dialog";
import { Progress } from "@kumix/ui/ui/progress";
import { cancelCompose, composeVideo, openFolder, pickOutputDirectory } from "@/lib/commands";
import { buildFfmpegArgs } from "@/lib/compositor";
import { useStore } from "@/stores/app-store";
import type { Combo } from "@/types";

interface BatchQueueProps {
  combos: Combo[];
}

export function BatchQueue({ combos }: BatchQueueProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const cancelRequested = useRef(false);

  const outDir = useStore((s) => s.outDir);
  const setOutDir = useStore((s) => s.setOutDir);
  const resetOutDir = useStore((s) => s.resetOutDir);
  const queue = useStore((s) => s.queue);
  const setQueue = useStore((s) => s.setQueue);
  const failures = useStore((s) => s.failures);
  const setFailures = useStore((s) => s.setFailures);
  const doneMsg = useStore((s) => s.doneMsg);
  const setDoneMsg = useStore((s) => s.setDoneMsg);
  const error = useStore((s) => s.error);
  const setError = useStore((s) => s.setError);
  const opts = useStore((s) => s.opts);

  const ready = combos.length > 0 && !!outDir;
  const currentCombo = queue && combos[queue.done] ? combos[queue.done] : null;
  const curDur = currentCombo ? currentCombo.m.info.dur + (currentCombo.c?.info.dur ?? 0) : 1;
  const currentProgress = curDur > 0 && queue ? Math.min(1, Math.max(0, queue.pct / curDur)) : 0;
  const overall = queue ? (queue.done + currentProgress) / queue.total : 0;
  const overallPct = Math.round(overall * 100);

  const handlePickFolder = async () => {
    const dir = await pickOutputDirectory();
    if (dir) setOutDir(dir);
  };

  const handleRenderAll = async () => {
    if (!ready) return;
    cancelRequested.current = false;
    setCancelling(false);
    setDialogOpen(true);
    setQueue({ done: 0, pct: 0, total: combos.length });
    setFailures([]);
    setDoneMsg("");
    setError("");

    const fails: string[] = [];
    for (let i = 0; i < combos.length; i++) {
      if (cancelRequested.current) break;

      const { m, c, r, name } = combos[i];
      const output = `${outDir}/short-${String(i + 1).padStart(3, "0")}_${name}.mp4`;
      setQueue({ done: i, pct: 0, total: combos.length });

      try {
        const args = buildFfmpegArgs(
          { main: m.path, cta: c?.path, reaction: r?.path, output },
          m.info,
          opts,
          "9:16",
        );
        await composeVideo(args);
      } catch (e) {
        if (cancelRequested.current || String(e).toLowerCase().includes("cancelled")) {
          cancelRequested.current = true;
          break;
        }
        fails.push(name);
        console.error(name, e);
      }
    }

    const wasCancelled = cancelRequested.current;
    setQueue(null);
    setCancelling(false);

    if (wasCancelled) {
      setDialogOpen(false);
      return;
    }

    if (fails.length > 0) {
      setFailures(fails);
    } else {
      setDoneMsg(
        `Successfully rendered ${combos.length} short${combos.length > 1 ? "s" : ""} to ${outDir}`,
      );
    }
  };

  const handleCancel = async () => {
    if (!queue || cancelling) return;
    cancelRequested.current = true;
    setCancelling(true);
    await cancelCompose();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Output folder */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-semibold text-sm">Output</span>
          <span className="truncate text-muted-foreground text-sm">
            {outDir || "Select output folder…"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Reset to default Videos folder"
            disabled={!!queue}
            onClick={resetOutDir}
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="outline" size="sm" disabled={!!queue} onClick={handlePickFolder}>
            <FolderOpen className="mr-1.5 size-3.5" />
            Folder
          </Button>
        </div>
      </div>

      {/* Errors & Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="max-h-40 overflow-auto whitespace-pre-wrap">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Render button */}
      <Button size="lg" disabled={!ready || !!queue} onClick={handleRenderAll} className="w-full">
        {queue
          ? `Rendering… ${queue.done + 1}/${queue.total}`
          : `Render All (${combos.length} shorts)`}
      </Button>

      {/* Render Progress & Success Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!queue) {
            setDialogOpen(next);
            if (!next) {
              setDoneMsg("");
              setFailures([]);
            }
          }
        }}
      >
        <DialogContent
          showCloseButton={!queue}
          className="w-full max-w-md overflow-hidden sm:max-w-md"
        >
          {queue ? (
            /* RENDERING STATE */
            <div className="flex min-w-0 flex-col gap-4 py-1">
              <DialogHeader className="min-w-0">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  <DialogTitle>Rendering Shorts</DialogTitle>
                </div>
                <DialogDescription
                  className="block w-full min-w-0 truncate text-xs"
                  title={currentCombo?.name}
                >
                  {currentCombo ? `Processing: ${currentCombo.name}` : "Starting FFmpeg…"}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">
                    Video {queue.done + 1} of {queue.total}
                  </span>
                  <span className="font-mono text-foreground tabular-nums">{overallPct}%</span>
                </div>
                <Progress value={overallPct} />
              </div>

              <DialogFooter className="mt-1">
                <Button variant="outline" size="sm" disabled={cancelling} onClick={handleCancel}>
                  {cancelling ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Cancelling…
                    </>
                  ) : (
                    "Cancel"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : failures.length > 0 ? (
            /* FAILURE STATE */
            <div className="flex min-w-0 flex-col gap-4 py-1">
              <DialogHeader className="min-w-0">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="size-5 shrink-0" />
                  <DialogTitle>Render Completed with Errors</DialogTitle>
                </div>
                <DialogDescription className="min-w-0">
                  {failures.length} video(s) failed during composition.
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground text-xs">
                  {failures.map((f) => (
                    <li key={f} className="truncate" title={f}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <DialogFooter>
                {outDir && (
                  <Button variant="outline" size="sm" onClick={() => openFolder(outDir)}>
                    <FolderOpen className="mr-1.5 size-3.5" />
                    Open folder
                  </Button>
                )}
                <Button size="sm" onClick={() => setDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* SUCCESS STATE */
            <div className="flex min-w-0 flex-col gap-4 py-1">
              <DialogHeader className="min-w-0">
                <div className="flex items-center gap-2 text-emerald-500">
                  <CheckCircle2 className="size-5 shrink-0" />
                  <DialogTitle>Render Complete</DialogTitle>
                </div>
                <DialogDescription
                  className="wrap-break-word min-w-0 text-muted-foreground text-xs"
                  title={doneMsg}
                >
                  {doneMsg || `Successfully rendered ${combos.length} shorts.`}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                {outDir && (
                  <Button variant="outline" size="sm" onClick={() => openFolder(outDir)}>
                    <FolderOpen className="mr-1.5 size-3.5" />
                    Open folder
                  </Button>
                )}
                <Button size="sm" onClick={() => setDialogOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
