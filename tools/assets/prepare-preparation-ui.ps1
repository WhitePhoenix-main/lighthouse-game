$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$project=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$output=Join-Path $project 'public/images/preparation/ui'
New-Item -ItemType Directory -Force $output | Out-Null
$skin=[System.Drawing.Bitmap]::new((Join-Path $project 'art/concepts/preparation-2026-11-17/mobile-slate-v3/ui-chrome.png'))
$icons=[System.Drawing.Bitmap]::new((Join-Path $project 'art/concepts/preparation-2026-11-17/full-screen-v1/ui-icons.png'))
function Crop($image,[string]$name,[int]$x,[int]$y,[int]$width,[int]$height,[int]$cut=0) {
  $bitmap=[System.Drawing.Bitmap]::new($width,$height);$g=[System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    if($cut -gt 0){
      $path=[System.Drawing.Drawing2D.GraphicsPath]::new()
      try {$path.AddPolygon([System.Drawing.Point[]]@([System.Drawing.Point]::new($cut,0),[System.Drawing.Point]::new(($width-$cut),0),[System.Drawing.Point]::new($width,$cut),[System.Drawing.Point]::new($width,($height-$cut)),[System.Drawing.Point]::new(($width-$cut),$height),[System.Drawing.Point]::new($cut,$height),[System.Drawing.Point]::new(0,($height-$cut)),[System.Drawing.Point]::new(0,$cut)));$g.SetClip($path)} finally {$path.Dispose()}
    }
    $g.DrawImage($image,[System.Drawing.Rectangle]::new(0,0,$width,$height),$x,$y,$width,$height,[System.Drawing.GraphicsUnit]::Pixel)
    $bitmap.Save((Join-Path $output ($name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
  } finally {$g.Dispose();$bitmap.Dispose()}
}
try {
  Crop $skin 'slate' 20 1293 450 119 20
  Crop $skin 'amber' 20 1439 914 119 32
  Crop $skin 'texture' 60 1316 350 70
  Crop $skin 'edge' 60 1293 350 10
  $data=Get-Content (Join-Path $project 'art/concepts/preparation-2026-11-17/full-screen-v1/ui-icons.json') -Raw | ConvertFrom-Json
  foreach($entry in $data.frames.PSObject.Properties){$f=$entry.Value;Crop $icons $entry.Name $f.x $f.y $f.width $f.height}
  Copy-Item -LiteralPath (Join-Path $project 'art/concepts/preparation-2026-11-17/full-screen-v1/glyphs.json') -Destination (Join-Path $output 'glyphs.json') -Force
  $sources=@('art/concepts/preparation-2026-11-17/mobile-slate-v3/ui-chrome.png','art/concepts/preparation-2026-11-17/full-screen-v1/ui-icons.png','art/concepts/preparation-2026-11-17/full-screen-v1/glyphs.json') | ForEach-Object {@{path=$_;sha256=(Get-FileHash (Join-Path $project $_) -Algorithm SHA256).Hash.ToLowerInvariant()}}
  @{sources=$sources;method='Native crops; transparent chamfer outside panel; CSS border-image corners, contained icons';license='Project generated artwork; see art concept manifests'} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $output 'manifest.json') -Encoding utf8
} finally {$skin.Dispose();$icons.Dispose()}
