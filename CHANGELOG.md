# Changelog

All notable changes to LightShort will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-26

### Added

- **Automatic updates**: checks GitHub Releases on launch and downloads and installs new versions in the background, then relaunches. While clips are loaded or a render is running, the download is staged instead and the header button turns into **Restart to update**. Toggle with **Auto-update** in the header menu (on by default); the header button also installs manually.
- **Silent clips**: videos without an audio stream (screen recordings, muted footage) now render in both `reaction` and `satisfying` modes. Missing audio is replaced by generated silence, so the output always has a valid audio track.

### Fixed

- **Robust video probing**: an unknown frame rate (`0/0`) falls back to 30 fps instead of producing an invalid filtergraph, a missing stream duration falls back to the container duration, and files without any duration fail with a clear error instead of an empty render.
- `check_ffmpeg` now also verifies that `ffprobe` is on `PATH`, since probing depends on it.
- The live preview's background dimming now matches the rendered output.

### Removed

- Unused 16:9 layout branch and `Aspect` type in the compositor; output is always 1080×1920.

## [0.1.0] - 2026-03-25

### Added

- Initial release of LightShort.
- Automated short-form video compositor locked to 9:16 vertical Shorts (1080×1920) for YouTube Shorts, TikTok, and Instagram Reels.
- **Dual Secondary Video Modes**:
  - `reaction`: Green screen chroma key PiP with live color picker, presets (#00FF00, #00B140, #0047AB), size, and margin tuning.
  - `satisfying`: Side-by-side vertical split screen (Main left | Satisfying right) with dynamic background blur.
- **Flexible Composition**: Minimum 1 Main video required; CTA and Secondary/Reaction videos are completely optional.
- **Cancellable Batch Rendering**: Instantly cancel active FFmpeg renders with automatic process tree termination and corrupt file cleanup.
- **Modal Progress Reporting**: Non-blocking render dialog with live progress bar, cancel action, error breakdown, and one-click folder opening.
- **Direct Folder Integration**: Native `open_folder` command with cross-platform OS path normalization and fallback.
- **Dual Storage Persistence**: Saves settings, mode, and output directory to both `localStorage` and OS config path (`%APPDATA%/lightshort/config.json`).
- **System Detection**: Real-time FFmpeg detection in system PATH shown in the footer with live status indicator and direct installation docs link.
- **Real-Time Live Preview**: Zero-render preview engine with seamless 3-segment clocking (Main $\rightarrow$ CTA $\rightarrow$ Main), canvas chroma keying, and auto-pause on render start.
- Auto-update capability with GitHub Releases integration and Minisign cryptographic verification.
- Modern UI built with Tauri 2, React 19, TypeScript, Tailwind CSS v4, and `@kumix/ui`.
