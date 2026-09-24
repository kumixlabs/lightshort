import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { Download, Loader2, Monitor, Moon, RefreshCw, Sun } from "lucide-react";

import { toastError, toastInfo, toastSuccess } from "@kumix/ui/custom/toast";
import { Button } from "@kumix/ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kumix/ui/ui/dropdown-menu";
import { useTheme } from "@/hooks/use-theme";
import { useStore } from "@/stores/app-store";
import type { Theme } from "@/types";

export function Header() {
  const { theme, setTheme } = useTheme();
  const updateAvailable = useStore((s) => s.updateAvailable);
  const setUpdateAvailable = useStore((s) => s.setUpdateAvailable);

  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateHandle, setUpdateHandle] = useState<Awaited<ReturnType<typeof check>> | null>(null);

  const themeIcons: Record<Theme, typeof Sun> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };
  const ThemeIcon = themeIcons[theme] ?? Monitor;

  const handleUpdateClick = async () => {
    if (updateAvailable) {
      setInstalling(true);
      try {
        const handle = updateHandle ?? (await check());
        if (handle?.available) {
          await handle.downloadAndInstall();
          await relaunch();
        } else {
          setUpdateAvailable(null);
          toastInfo({ message: "No update available." });
        }
      } catch (err) {
        toastError({
          message: "Failed to install update",
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setInstalling(false);
      }
      return;
    }

    setChecking(true);
    try {
      const update = await check();
      if (update?.available) {
        setUpdateAvailable(update.version);
        setUpdateHandle(update);
        toastSuccess({ message: `Update v${update.version} ready to install` });
      } else {
        setUpdateAvailable(null);
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

  return (
    <header className="flex items-center justify-between border-border border-b bg-background/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/favicon.png" alt="LightShort" className="size-6 rounded" />
        <div className="flex flex-col">
          <h1 className="font-semibold text-sm leading-tight">LightShort</h1>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            A lightweight tool for creating engaging short-form videos.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={updateAvailable ? "default" : "outline"}
          size="sm"
          disabled={checking || installing}
          onClick={handleUpdateClick}
          className={`h-8 gap-1.5 text-xs ${
            updateAvailable
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={updateAvailable ? `Install v${updateAvailable}` : "Check for updates"}
        >
          {installing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Installing...</span>
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
          <DropdownMenuTrigger className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-border hover:bg-accent">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
