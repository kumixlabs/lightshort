#!/usr/bin/env python3
"""forge-short: compose main + CTA (middle) + reaction PiP (green screen, loop, muted).

Timeline: [main start + reaction] -> [CTA] -> [main end + reaction]
"""

import argparse
import subprocess
import sys


def probe(path: str) -> dict:
    """Extract duration, width, height, and framerate from video file."""
    raw = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate:format=duration",
            "-of",
            "csv=p=0",
            path,
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip().splitlines()
    parts = raw[0].split(",")
    w, h = int(parts[0]), int(parts[1])
    fps_raw = parts[2]
    duration = float(raw[1].split(",")[-1])
    num, _, den = fps_raw.partition("/")
    fps = float(num) / float(den) if den else float(fps_raw)
    return {"w": w, "h": h, "fps": fps, "dur": duration}


def build_filter(m: dict, cta_dur: float, args) -> str:
    t1 = m["dur"] / 2.0
    pip_w = int(m["w"] * args.pip_scale)
    fps = m["fps"]
    pos = f"main_w-overlay_w-{args.margin}:main_h-overlay_h-{args.margin}"

    f = (
        # Split main video in two
        f"[0:v]fps={fps},split=2[ma][mb];"
        f"[ma]trim=0:{t1},setpts=PTS-STARTPTS[p1];"
        f"[mb]trim={t1},setpts=PTS-STARTPTS[p2];"
        # Reaction: chroma key + scaled + looped via stream_loop, split per segment
        f"[2:v]fps={fps},chromakey={args.color}:{args.similarity}:{args.blend},"
        f"scale={pip_w}:-1,setsar=1,split=2[ra][rb];"
        f"[ra]trim=0:{t1},setpts=PTS-STARTPTS[ra2];"
        f"[rb]trim={t1}:{m['dur']},setpts=PTS-STARTPTS[rb2];"
        # Overlay reaction on both main segments
        f"[p1][ra2]overlay={pos}[v1];"
        f"[p2][rb2]overlay={pos}[v2];"
        # Scale CTA to match main dimensions
        f"[1:v]fps={fps},scale={m['w']}:{m['h']},setsar=1[cta_v];"
        f"[v1][cta_v][v2]concat=n=3:v=1:a=0[vout];"
        # Audio: split main audio in two, reaction audio discarded
        f"[0:a]asplit=2[aa][ab];"
        f"[aa]atrim=0:{t1},asetpts=PTS-STARTPTS[a1];"
        f"[ab]atrim={t1}:{m['dur']},asetpts=PTS-STARTPTS[a2];"
        f"[a1][1:a][a2]concat=n=3:v=0:a=1[aout]"
    )
    return f


def main():
    ap = argparse.ArgumentParser(description="forge-short compositor")
    ap.add_argument("main", help="Path to main video")
    ap.add_argument("cta", help="Path to CTA video")
    ap.add_argument("reaction", help="Path to reaction video")
    ap.add_argument("output", help="Path to output video")
    ap.add_argument(
        "--pip-scale",
        type=float,
        default=0.25,
        help="Reaction width relative to main video (default 0.25)",
    )
    ap.add_argument("--margin", type=int, default=20, help="PiP margin in pixels")
    ap.add_argument("--color", default="0x00FF00", help="Chroma key color hex")
    ap.add_argument("--similarity", type=float, default=0.15, help="Chroma similarity")
    ap.add_argument("--blend", type=float, default=0.1, help="Edge blend feather")
    args = ap.parse_args()

    m = probe(args.main)
    print(f"main: {m['w']}x{m['h']} @{m['fps']:.2f}fps {m['dur']:.2f}s")

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        args.main,
        "-i",
        args.cta,
        "-stream_loop",
        "-1",
        "-i",
        args.reaction,
        "-filter_complex",
        build_filter(m, 0, args),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        args.output,
    ]
    subprocess.run(cmd, check=True)
    total = probe(args.output)
    print(f"done: {args.output} ({total['dur']:.2f}s)")


if __name__ == "__main__":
    sys.exit(main())
