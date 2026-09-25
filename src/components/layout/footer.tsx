import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Badge } from "@kumix/ui/reui/badge";
import { checkFfmpeg } from "@/lib/commands";

export function Footer() {
  const [ffmpegPath, setFfmpegPath] = useState<string | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<"loading" | "active" | "missing">("loading");
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    let cancelled = false;

    checkFfmpeg()
      .then((path) => {
        if (!cancelled) {
          setFfmpegPath(path);
          setFfmpegStatus("active");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFfmpegStatus("missing");
        }
      });

    getVersion()
      .then((ver) => {
        if (!cancelled && ver) setVersion(ver);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="mt-auto border-border border-t bg-card/60 px-6 py-2 text-muted-foreground text-xs backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        {/* Left: FFmpeg Status */}
        <div className="flex min-w-0 items-center gap-2">
          {ffmpegStatus === "loading" && (
            <div className="flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-muted-foreground/40" />
              <span>Checking FFmpeg...</span>
            </div>
          )}

          {ffmpegStatus === "active" && ffmpegPath && (
            <div className="flex min-w-0 items-center gap-1.5" title={ffmpegPath}>
              <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="shrink-0 font-medium text-foreground">FFmpeg:</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {ffmpegPath}
              </span>
            </div>
          )}

          {ffmpegStatus === "missing" && (
            <div className="flex items-center gap-2 text-destructive">
              <span className="size-2 shrink-0 rounded-full bg-destructive" />
              <span className="font-medium">FFmpeg not detected.</span>
              <span className="hidden text-muted-foreground sm:inline">
                Please install FFmpeg and add to PATH.
              </span>
              <button
                type="button"
                onClick={() => openUrl("https://ffmpeg.org/download.html")}
                className="cursor-pointer font-medium text-primary underline underline-offset-2 hover:opacity-80"
              >
                Install guide
              </button>
            </div>
          )}
        </div>

        {/* Right: App Version */}
        <Badge variant="primary-light" size="xs" className="shrink-0 font-mono">
          v{version}
        </Badge>
      </div>
    </footer>
  );
}
