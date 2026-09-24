export { cn } from "@kumix/utils";

export function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function stem(path: string): string {
  return basename(path)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w-]+/g, "_");
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
