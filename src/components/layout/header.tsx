import { useState } from "react";
import { Download, Loader2, Monitor, Moon, RefreshCw, RotateCcw, Sun } from "lucide-react";

import { toastError, toastInfo, toastSuccess } from "@kumix/ui/custom/toast";
import { Button } from "@kumix/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kumix/ui/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { useStore } from "@/stores/app-store";
import type { Theme } from "@/types";

export function Header() {
  const { theme, setTheme } = useTheme();
  const autoUpdate = useStore((s) => s.settings.autoUpdate);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateAvailable = useStore((s) => s.updateAvailable);
  const updatePendingRestart = useStore((s) => s.updatePendingRestart);
  const updating = useStore((s) => s.updating);
  const rendering = useStore((s) => !!s.queue);

  const [checking, setChecking] = useState(false);

  const themeIcons: Record<Theme, typeof Sun> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };
  const ThemeIcon = themeIcons[theme] ?? Monitor;

  // Installs the known release, or looks for one first.
  const handleUpdateClick = async () => {
    if (updateAvailable) {
      await useStore.getState().installUpdate();
      return;
    }
    setChecking(true);
    try {
      const version = await useStore.getState().checkForUpdates();
      if (version) {
        toastSuccess({ message: `Update v${version} ready to install` });
      } else {
        toastInfo({ message: "You are on the latest version." });
      }
    } catch (err) {
      toastError({
        message: "Failed to check for updates",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setChecking(false);
    }
  };

  const ready = !!updateAvailable || updatePendingRestart;

  return (
    <header className="border-border bg-background/80 flex items-center justify-between border-b px-4 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/favicon.png" alt="LightShort" className="size-6 rounded" />
        <div className="flex flex-col">
          <h1 className="text-sm leading-tight font-semibold">LightShort</h1>
          <p className="text-muted-foreground hidden text-[11px] sm:block">
            A lightweight tool for creating engaging short-form videos.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={ready ? "default" : "outline"}
          size="sm"
          disabled={checking || updating || rendering}
          onClick={handleUpdateClick}
          className={`h-8 gap-1.5 text-xs ${
            ready
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={
            updating
              ? `Downloading v${updateAvailable}…`
              : updatePendingRestart
                ? `Version ${updateAvailable} downloaded — restart to update`
                : updateAvailable
                  ? `Install v${updateAvailable}`
                  : "Check for updates"
          }
        >
          {updating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Downloading...</span>
            </>
          ) : updatePendingRestart ? (
            <>
              <RotateCcw className="size-3.5" />
              <span>Restart to update</span>
            </>
          ) : updateAvailable ? (
            <>
              <Download className="size-3.5" />
              <span>Install update (v{updateAvailable})</span>
            </>
          ) : (
            <>
              <RefreshCw className={checking ? "size-3.5 animate-spin" : "size-3.5"} />
              <span>{checking ? "Checking..." : "Check updates"}</span>
            </>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="border-border hover:bg-accent flex size-8 cursor-pointer items-center justify-center rounded-md border">
            <ThemeIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 size-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 size-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 size-4" /> System
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={autoUpdate}
              onCheckedChange={(v) => updateSettings({ autoUpdate: v })}
            >
              Auto-update
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
