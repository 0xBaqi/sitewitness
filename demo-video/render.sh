#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p output source/audio
TEXT_WIN="$(wslpath -w "$PWD/narration.txt")"
AUDIO_WIN="$(wslpath -w "$PWD/source/audio")"
SCRIPT_WIN="$(wslpath -w "$PWD/make_narration.ps1")"
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$SCRIPT_WIN" -TextPath "$TEXT_WIN" -OutputDirectory "$AUDIO_WIN"
: > source/audio/concat.txt
for f in source/audio/segment-*.wav; do printf "file '%s/%s'\n" "$PWD" "$f" >> source/audio/concat.txt; done
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i source/audio/concat.txt -ar 48000 -ac 2 source/audio/narration.wav
node make_subtitles.mjs
ffmpeg -hide_banner -y -i source/deployed-preview-walkthrough.webm -i source/audio/narration.wav \
  -vf "tpad=stop_mode=clone:stop_duration=7,subtitles=subtitles.srt:force_style='FontName=DejaVu Sans,FontSize=9,PrimaryColour=&H00F4F5EB,OutlineColour=&H00101713,BorderStyle=1,Outline=1,Shadow=1,MarginV=28'" \
  -map 0:v:0 -map 1:a:0 -c:v libx264 -preset ultrafast -crf 20 -pix_fmt yuv420p -r 25 \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart output/sitewitness-demo.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels -of json output/sitewitness-demo.mp4 > output/ffprobe.json
ffmpeg -v error -i output/sitewitness-demo.mp4 -f null -
node -e 'const x=require("./output/ffprobe.json");const v=x.streams.find(s=>s.codec_type==="video"),a=x.streams.find(s=>s.codec_type==="audio"),d=Number(x.format.duration);if(!v||v.codec_name!=="h264"||v.width!==1920||v.height!==1080||!a||a.codec_name!=="aac"||d<120||d>180)throw Error(JSON.stringify(x));console.log(JSON.stringify({durationSeconds:d,video:v,audio:a}))'
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),p="output/sitewitness-demo.mp4",f=fs.readFileSync(p),x=require("./output/ffprobe.json"),v=x.streams.find(s=>s.codec_type==="video"),a=x.streams.find(s=>s.codec_type==="audio");fs.writeFileSync("output/verification.json",JSON.stringify({file:p,sha256:crypto.createHash("sha256").update(f).digest("hex"),durationSeconds:Number(x.format.duration),video:{codec:v.codec_name,width:v.width,height:v.height,frameRate:v.r_frame_rate},audio:{codec:a.codec_name,sampleRate:a.sample_rate,channels:a.channels},fullDecode:"passed"},null,2))'
