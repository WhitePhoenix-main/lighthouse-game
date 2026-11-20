$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$menu = Join-Path $root 'public/images/menu-buttons-v2'
$destination = Join-Path $root 'public/images/settings-stone'
New-Item -ItemType Directory -Force $destination | Out-Null
$atlas = [System.Drawing.Bitmap]::new((Join-Path $menu 'frame-states.png'))

function New-Art($width, $height) {
  [System.Drawing.Bitmap]::new($width, $height)
}

function Export-Art($art, $name) {
  $art.Save((Join-Path $destination "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $art.Dispose()
}

function Fill-Shape($art, $ink, [int[]]$coordinates) {
  $drawing = [System.Drawing.Graphics]::FromImage($art)
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($ink))
  $points = for ($i = 0; $i -lt $coordinates.Length; $i += 2) {
    [System.Drawing.Point]::new($coordinates[$i], $coordinates[$i+1])
  }
  try { $drawing.FillPolygon($brush, [System.Drawing.Point[]]$points) }
  finally { $brush.Dispose(); $drawing.Dispose() }
}

function Fill-Stone($art, $left, $top, $width, $height, $frame, $light) {
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      # Sample only the painted face of one live menu button frame.
      $p = $atlas.GetPixel(38 + $frame * 240 + $x % 156, 9 + $y % 29)
      $r = [Math]::Clamp($p.R + $light, 0, 255)
      $g = [Math]::Clamp($p.G + $light, 0, 255)
      $b = [Math]::Clamp($p.B + $light, 0, 255)
      $art.SetPixel($left + $x, $top + $y, [System.Drawing.Color]::FromArgb(255, $r, $g, $b))
    }
  }
}

function Add-Course($art, $x, $y, $width, $height, $light, $face, $shade) {
  $r = $x + $width
  $b = $y + $height
  Fill-Shape $art $shade @($x,($y+3),($x+4),$y,($r-3),$y,$r,($y+3),$r,($b-3),($r-3),$b,($x+3),$b,$x,($b-3))
  Fill-Shape $art $face @(($x+1),($y+3),($x+4),($y+1),($r-4),($y+1),($r-1),($y+3),($r-2),($b-4),($r-5),($b-2),($x+3),($b-2),($x+1),($b-5))
  Fill-Shape $art $light @(($x+1),($y+4),($x+1),($y+3),($x+4),($y+1),($r-4),($y+1),($r-2),($y+3),($r-7),($y+2),($x+4),($y+2))
}

try {
  # A lintel, masonry jambs and a stepped sill. Keep the centre and sides tileable.
  $surround = New-Art 112 100
  Fill-Shape $surround '#081323' @(0,14,4,14,4,8,9,8,9,4,16,4,16,0,96,0,96,4,103,4,103,8,108,8,108,14,112,14,112,89,108,89,108,95,102,95,102,100,10,100,10,95,4,95,4,89,0,89)
  Fill-Stone $surround 10 10 92 80 0 -12
  Fill-Stone $surround 16 6 80 14 0 8
  Add-Course $surround 8 9 12 13 '#60758a' '#35495f' '#16293c'
  Add-Course $surround 92 9 12 13 '#62758a' '#35495f' '#16293c'
  Add-Course $surround 13 4 8 9 '#a7826d' '#536278' '#27364b'
  Add-Course $surround 91 4 8 9 '#a7826d' '#536278' '#27364b'
  Fill-Shape $surround '#a68470' @(21,4,91,4,91,5,21,5)
  Fill-Shape $surround '#4a5768' @(21,5,91,5,91,6,21,6)
  Fill-Shape $surround '#0a172a' @(17,17,95,17,95,21,17,21)
  Fill-Shape $surround '#506277' @(20,19,92,19,92,20,86,20,86,21,26,21,26,20,20,20)
  $faces = @('#344b63', '#304359', '#2a4159', '#374b62')
  for ($row = 0; $row -lt 4; $row++) {
    $y = 21 + $row * 16
    $offset = $row % 2 * 2
    Add-Course $surround (2 + $offset) $y (15 - $offset) 16 '#536981' $faces[$row] '#111e32'
    Add-Course $surround 95 $y (15 - $offset) 16 '#536981' $faces[$row] '#111e32'
    Fill-Shape $surround '#1c3048' @((5+$offset),($y+7),(9+$offset),($y+7),(9+$offset),($y+8),(13+$offset),($y+8),(13+$offset),($y+10),(9+$offset),($y+10),(9+$offset),($y+9),(5+$offset),($y+9))
    Fill-Shape $surround '#6b727b' @(98,($y+4),102,($y+4),102,($y+5),100,($y+5),100,($y+6),98,($y+6))
  }
  Add-Course $surround 5 84 102 10 '#566b7f' '#30465e' '#17283c'
  Add-Course $surround 11 91 90 8 '#405771' '#263c55' '#0b192a'
  Fill-Shape $surround '#a9846d' @(16,86,31,86,31,87,24,87,24,88,16,88)
  Fill-Shape $surround '#645c5b' @(80,86,96,86,96,88,89,88,89,87,80,87)
  Export-Art $surround 'surround'

  $well = New-Art 48 30
  Fill-Shape $well '#081423' @(0,4,3,4,3,1,45,1,45,4,48,4,48,26,45,26,45,29,3,29,3,26,0,26)
  Fill-Stone $well 3 4 42 22 2 -8
  Fill-Shape $well '#2c4057' @(1,25,4,25,4,27,44,27,44,25,47,25,47,27,44,27,44,29,4,29,4,27,1,27)
  Export-Art $well 'well'

  $keys = @(
    @{ Name='key'; Rim='#506985'; Face='#233b55'; Shadow='#0b1b2d'; Atlas=0; Light=-3; Drop=0 },
    @{ Name='key-lit'; Rim='#f2ac73'; Face='#985a3a'; Shadow='#47281f'; Atlas=1; Light=0; Drop=1 },
    @{ Name='key-down'; Rim='#ad7959'; Face='#73482f'; Shadow='#2e2020'; Atlas=2; Light=-8; Drop=2 }
  )
  foreach ($state in $keys) {
    $key = New-Art 44 26
    $y = $state.Drop
    Fill-Shape $key '#071321' @(0,5,5,0,39,0,44,5,44,21,39,26,5,26,0,21)
    Add-Course $key 1 (1+$y) 42 (24-$y) $state.Rim $state.Face $state.Shadow
    Fill-Stone $key 6 (5+$y) 32 (15-$y) $state.Atlas $state.Light
    Fill-Shape $key $state.Face @(5,21,39,21,39,22,5,22)
    Export-Art $key $state.Name
  }

  $rail = New-Art 20 7
  Fill-Shape $rail '#081424' @(0,2,2,2,2,0,18,0,18,2,20,2,20,5,18,5,18,7,2,7,2,5,0,5)
  Fill-Shape $rail '#192d45' @(2,3,18,3,18,5,2,5)
  Fill-Shape $rail '#4c6275' @(2,5,18,5,18,6,2,6)
  Export-Art $rail 'rail'

  $inlay = New-Art 10 5
  Fill-Shape $inlay '#633926' @(0,0,10,0,10,5,0,5)
  Fill-Shape $inlay '#bf7549' @(0,1,10,1,10,4,0,4)
  Fill-Shape $inlay '#ffc68b' @(0,1,6,1,6,2,10,2,10,3,0,3)
  Export-Art $inlay 'inlay'

  $knob = New-Art 15 19
  Fill-Shape $knob '#080f1b' @(0,5,4,1,11,1,15,5,15,14,10,19,5,19,0,14)
  Fill-Shape $knob '#90502b' @(1,5,5,1,10,1,14,5,14,13,10,17,5,17,1,13)
  Fill-Shape $knob '#df945c' @(2,5,6,1,9,1,13,5,13,12,9,16,6,16,2,12)
  Fill-Shape $knob '#ffcf9a' @(2,5,6,1,9,1,11,3,6,3,3,6,3,11,2,11)
  Fill-Shape $knob '#543a2d' @(4,7,7,4,8,4,11,7,11,10,8,13,7,13,4,10)
  Fill-Shape $knob '#ffd18b' @(5,7,7,5,9,7,9,10,7,12,5,10)
  Export-Art $knob 'knob'
}
finally { $atlas.Dispose() }
