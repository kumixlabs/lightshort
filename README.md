# LightShort

A lightweight desktop tool for creating engaging 9:16 vertical short-form videos.

<p align="center">
  <img src="public/logo.png" alt="LightShort Logo" width="128" height="128" />
</p>

## Overview

LightShort automates the production of vertical short-form content (YouTube Shorts, TikTok, Instagram Reels) from standard desktop clips:
- **Dedicated 9:16 Output (1080×1920)** — Native vertical layout with blurred background padding and automatic aspect ratio scaling.
- **Dual Secondary Video Modes**:
  - **Reaction (Chroma Key PiP)**: Overlays a green screen reaction video in the corner with real-time chroma keying, custom hex/swatch colors, scale (10%–50%), and margin controls.
  - **Satisfying (Split Screen)**: Side-by-side vertical split screen (540px Main on the left | 540px Satisfying clip on the right) backed by a dynamically blurred background.
- **Flexible Composition** — Only a Main video is required (minimum 1). Both CTA clips and Secondary/Reaction videos are completely optional.
- **Mid-Roll CTA Insertion** — Splices optional Call-To-Action clips at the exact midpoint of your Main video while keeping audio and video perfectly synchronized.
- **Real-Time Live Preview** — Synchronized multi-video canvas preview with full scrubber controls, replay button, and seamless transitions between video segments without rendering.
- **Batch Processing with Combinations** — Automatic Cartesian product (`Main × CTA × Reaction`) to generate dozens of short variations in a single queue.
- **Cancellable Rendering** — Abort active render queues at any moment. LightShort safely terminates FFmpeg process trees and cleans up partial output files.
- **Dual Persistent Storage** — Settings and selected output folders are preserved across sessions in both `localStorage` and the operating system's configuration directory (`%APPDATA%/lightshort/config.json` on Windows).
- **System PATH Detection** — Live FFmpeg and FFprobe detection displayed in the status footer with direct links for missing binaries.

## Tech Stack

- **Framework**: [Tauri 2](https://v2.tauri.app/)
- **Core Engine**: Rust + [FFmpeg](https://ffmpeg.org) + `ffprobe`
- **Frontend**: React 19, TypeScript, Vite
- **UI Components**: `@kumix/ui`, Base UI, Lucide Icons
- **Styling**: Tailwind CSS v4 (OKLCH color space)
- **Package Manager**: [Bun](https://bun.sh/)

## Prerequisites

- [FFmpeg](https://ffmpeg.org) and `ffprobe` installed and accessible from your system `PATH`.
- [Bun](https://bun.sh/) 1.4+
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)

## Getting Started

### Development

```bash
# Install dependencies
bun install

# Run type check and lint
bun run types:check
bun run lint

# Run unit tests
bun test

# Launch full desktop app in development mode
bun tauri dev
```

### Production Build

```bash
bun tauri build
```

The compiled installer and standalone binary will be generated under `src-tauri/target/release/bundle/`.

## License

MIT © 2026 Kumix Labs
