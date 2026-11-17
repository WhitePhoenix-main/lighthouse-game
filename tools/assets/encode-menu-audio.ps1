param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Ffmpeg = 'ffmpeg'
)
$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../../public/audio/menu-theme.mp3'
# User-supplied original: take-2-take-2-cleaned.wav, 60 s, stereo, 44.1 kHz PCM.
# Keep only the compressed distribution asset, never the original WAV.
& $Ffmpeg -hide_banner -y -i $Source -map_metadata -1 -vn -codec:a libmp3lame -b:a 96k $destination
if ($LASTEXITCODE -ne 0) { throw 'Menu music encoding failed.' }
