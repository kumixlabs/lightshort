import { FolderOpen } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@kumix/ui/reui/alert";
import { Button } from "@kumix/ui/ui/button";
import { Progress, ProgressIndicator, ProgressTrack } from "@kumix/ui/ui/progress";
import { composeVideo, openFolder, pickOutputDirectory } from "@/lib/commands";
import { buildFfmpegArgs } from "@/lib/compositor";
import { useStore } from "@/stores/app-store";
import type { Combo } from "@/types";

interface BatchQueueProps {
  combos: Combo[];
}

export function BatchQueue({ combos }: BatchQueueProps) {
  const outDir = useStore((s) => s.outDir);
  const setOutDir = useStore((s) => s.setOutDir);
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
  const overall = queue ? (queue.done + Math.min(1, queue.pct / 1)) / queue.total : 0;

  const handlePickFolder = async () => {
    const dir = await pickOutputDirectory();
    if (dir) setOutDir(dir);
  };

  const handleRenderAll = async () => {
    if (!ready) return;
    setQueue({ done: 0, pct: 0, total: combos.length });
    setFailures([]);
    setDoneMsg("");
    setError("");

    const fails: string[] = [];
    for (let i = 0; i < combos.length; i++) {
      const { m, c, r, name } = combos[i];
      const output = `${outDir}/short-${String(i + 1).padStart(3, "0")}_${name}.mp4`;
      setQueue({ done: i, pct: 0, total: combos.length });

      try {
        const args = buildFfmpegArgs(
          { main: m.path, cta: c.path, reaction: r.path, output },
          m.info,
          opts,
          "9:16",
        );
        await composeVideo(args);
      } catch (e) {
        fails.push(name);
        console.error(name, e);
      }
    }

    setQueue(null);
    if (fails.length > 0) {
      setFailures(fails);
    } else {
      setDoneMsg(`Successfully rendered ${combos.length} shorts to ${outDir}`);
    }
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
        <Button variant="outline" size="sm" disabled={!!queue} onClick={handlePickFolder}>
          <FolderOpen className="mr-1.5 size-3.5" />
          Folder
        </Button>
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

      {failures.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>{failures.length} batch job(s) failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 text-xs">
              {failures.slice(0, 10).map((f) => (
                <li key={f} className="truncate">
                  {f}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {doneMsg && (
        <Alert variant="success">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{doneMsg}</span>
            <Button variant="outline" size="sm" onClick={() => openFolder(outDir)}>
              <FolderOpen className="mr-1.5 size-3.5" />
              Open folder
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Progress */}
      {queue && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>
              Rendering {queue.done + 1}/{queue.total}
            </span>
            <span>{Math.round(overall * 100)}%</span>
          </div>
          <Progress value={overall}>
            <ProgressTrack>
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        </div>
      )}

      {/* Render button */}
      <Button size="lg" disabled={!ready || !!queue} onClick={handleRenderAll} className="w-full">
        {queue
          ? `Rendering… ${queue.done + 1}/${queue.total}`
          : `Render All (${combos.length} shorts)`}
      </Button>
    </div>
  );
}
