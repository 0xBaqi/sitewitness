param(
  [Parameter(Mandatory=$true)][string]$TextPath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Rate = 0
$speaker.Volume = 100
$lines = Get-Content -LiteralPath $TextPath | Where-Object { $_.Trim().Length -gt 0 }
for ($i = 0; $i -lt $lines.Count; $i++) {
  $path = Join-Path $OutputDirectory ('segment-{0:D2}.wav' -f ($i + 1))
  $speaker.SetOutputToWaveFile($path)
  $speaker.Speak($lines[$i])
}
$speaker.Dispose()
Write-Output ("Rendered {0} local narration segments." -f $lines.Count)
