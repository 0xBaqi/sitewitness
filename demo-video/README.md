# SiteWitness walkthrough demo

## Deliverables

- `output/sitewitness-demo.mp4` is the 1920×1080 H.264/AAC submission video.
- `narration.txt`, `subtitles.srt`, `make_narration.ps1`, `make_subtitles.mjs`, `capture.mjs`, and `render.sh` are editable production sources.
- `source/audio/segment-*.wav` preserves the local narration timing assets used by the Playwright capture. The combined narration WAV and concat list are generated render intermediates and are ignored.
- `source/deployed-preview-walkthrough.webm` is the unedited Playwright recording of the public Preview.
- `source/sitewitness-example-report.pdf` and the screenshots are capture evidence for the report, desktop, print view, and 390 px mobile viewport.
- `source/capture-metadata.json` records the exact Preview URL, capture time, source video SHA-256, mobile width check, browser errors, existing report provenance, and an empty list of `/api/analyze` requests.
- `output/ffprobe.json` records the final MP4 streams and duration.

## Provenance and scope

The capture was made from the deployed Preview at `https://sitewitness-fhewd1vxi-0x-baqi.vercel.app/` on 2026-11-04. Its AI findings are from an already saved, genuine Meta Muse Spark 1.3 report generated 2026-11-03; the source report ID, timestamp, and photograph hash are recorded in `source/capture-metadata.json`. The walkthrough explicitly presents this as a previously generated example. Capture metadata confirms that no analysis endpoint was called, so this production did not spend another model request. The demo shows human observations and AI suggestions together, editing and review, browser save/reopen, PDF output, and the mobile layout. It does not present a new inference or SAM localization.

Narration was generated offline with the host Windows System.Speech voice; subtitles are timed from each audio segment. The render pads the last recorded frame so the full narration and closing subtitle remain audible and visible. The exported video is checked for H.264, AAC, 1920×1080, a 2–3 minute runtime, and a full decode. `output/verification.json` stores the final file hash and verification result.

The production workflow follows the authentic browser capture, source media, narration/subtitles, FFmpeg render, and playback verification method from the accessible Sableline Codex demo. No reusable Monad Doctor demo pipeline was found in the accessible project files. The rejected SiteWitness Canvas rough cut was not used.

## Reproduction

This capture was produced in the project’s WSL/Windows environment with the deployed Preview reachable, Node/Playwright and Chromium installed, FFmpeg with `libx264` and `libass`, and Windows PowerShell/System.Speech available. Capture uses only the existing saved report. It does not make an inference request.

```bash
LD_LIBRARY_PATH=/tmp/monad-doctor-browser-deps/extracted/usr/lib/x86_64-linux-gnu \
CHROMIUM_PATH=/tmp/monad-doctor-playwright/chromium-1248/chrome-linux64/chrome \
SITEWITNESS_PREVIEW_URL=https://sitewitness-fhewd1vxi-0x-baqi.vercel.app/ \
node demo-video/capture.mjs

bash demo-video/render.sh
```

The Playwright capture script resolves the Preview host before launch and supplies that address to Chromium for this environment’s DNS setup. The checked-in audio segments let it calculate narration-synced scene timing without making a model request. `DEMO_PREFLIGHT=1` runs a short selector/flow check without generating the full recording. The script fails if browser errors occur, mobile content overflows horizontally, or `/api/analyze` is requested.

## Limitations

This is a walkthrough of the current deployed UI using a clearly labeled, previously captured real report. It does not prove live inference availability at playback time and does not include a fresh paid model call. The narration voice is a local system voice; regenerating it on a machine without Windows System.Speech requires adapting `make_narration.ps1` to another offline voice while preserving the segment timing.
