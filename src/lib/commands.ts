import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import type { VideoInfo, VideoItem } from "@/types";

export async function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>("probe", { path });
}

export async function composeVideo(args: string[]): Promise<void> {
  return invoke<void>("compose", { args });
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
  return revealItemInDir(path);
}
