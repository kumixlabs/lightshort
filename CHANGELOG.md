# Changelog

All notable changes to LightShort will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-25

### Added

- Initial release of LightShort.
- Automated short-form video compositor: Main video split, CTA insertion, green screen reaction overlay with chroma keying.
- Dedicated 9:16 Shorts workflow with blurred background padding for vertical formats (YouTube Shorts, TikTok, Reels).
- Real-time live multi-video preview with canvas chroma key renderer.
- Batch rendering with Cartesian combination product (Main × CTA × Reaction).
- Real-time FFmpeg progress tracking with progress bar.
- Auto-update capability with GitHub Releases integration and Minisign cryptographic verification.
- Modern UI built with Tauri 2, React 19, TypeScript, Tailwind CSS, and `@kumix/ui`.
