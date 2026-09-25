import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import type { VideoInfo, VideoItem } from "@/types";

export async function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("probe", { path });
}

export async function composeVideo(args: string[]): Promise<void> {
  return invoke<void>("compose", { args });
}

export async function cancelCompose(): Promise<void> {
  return invoke<void>("cancel_compose").catch(() => {});
}

export async function pickVideos(): Promise<VideoItem[]> {
  const res = await openDialog({
    multiple: true,
    filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "avi"] }],
  });
  if (!res) return [];
  const paths = Array.isArray(res) ? res : [res];
  return Promise.all(
    paths.map(async (path) => ({
      path,
      info: await probeVideo(path),
    })),
  );
}

export async function pickOutputDirectory(): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
  });
  return typeof result === "string" ? result : null;
}

export async function openFolder(path: string): Promise<void> {
  return invoke<void>("open_folder", { path }).catch(async () => {
    await openPath(path);
  });
}

export async function checkFfmpeg(): Promise<string> {
  return invoke<string>("check_ffmpeg");
}

export async function readAppConfig(): Promise<string | null> {
  return invoke<string | null>("read_app_config").catch(() => null);
}

export async function writeAppConfig(content: string): Promise<void> {
  return invoke<void>("write_app_config", { content });
}

export async function getDefaultVideoDir(): Promise<string | null> {
  return invoke<string>("get_default_video_dir").catch(() => null);
}
