$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$atlas = [System.Drawing.Bitmap]::new((Join-Path $root 'public/images/game-menu/back-mobile.png'))
$width = 485
$height = 140
try {
  if ($atlas.Width -lt $width -or $atlas.Height -lt $height) { throw 'Source atlas is too small' }
  $blue = [System.Drawing.Bitmap]::new($width, $height)
  $amber = [System.Drawing.Bitmap]::new($width, $height)
  try {
    $firstInRow = [int[]]::new($height)
    $lastInRow = [int[]]::new($height)
    $firstInColumn = [int[]]::new($width)
    $lastInColumn = [int[]]::new($width)
    for ($y = 0; $y -lt $height; $y++) { $firstInRow[$y] = $width }
    for ($x = 0; $x -lt $width; $x++) { $firstInColumn[$x] = $height }

    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        if ($atlas.GetPixel($x, $y).A -lt 128) { continue }
        $firstInRow[$y] = [Math]::Min($firstInRow[$y], $x)
        $firstInColumn[$x] = [Math]::Min($firstInColumn[$x], $y)
        $lastInRow[$y] = $x
        $lastInColumn[$x] = $y
      }
    }

    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        $pixel = $atlas.GetPixel($x, $y)
        $luma = .2126 * $pixel.R + .7152 * $pixel.G + .0722 * $pixel.B
        $red = [Math]::Min(255, [Math]::Round(.49 * $pixel.R + .51 * $luma * .69))
        $green = [Math]::Min(255, [Math]::Round(.49 * $pixel.G + .51 * $luma * 1.02))
        $blueChannel = [Math]::Min(255, [Math]::Round(.49 * $pixel.B + .51 * $luma * 1.42))
        $blue.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $red, $green, $blueChannel))

        # Compensate for the wider horizontal slice so that the rendered bevel reads evenly.
        $horizontal = [Math]::Min($x - $firstInRow[$y], $lastInRow[$y] - $x) * .72
        $vertical = [Math]::Min($y - $firstInColumn[$x], $lastInColumn[$x] - $y)
        $distance = [Math]::Max(0.0, [Math]::Min($horizontal, $vertical))
        $edge = [Math]::Max(0.0, [Math]::Min(1.0, (20 - $distance) / 14))
        $relief = [Math]::Max(0.0, [Math]::Min(1.0, ($luma - 29) / 105))
        $amberRed = [Math]::Round((.81 * $red + .19 * 35) * (1 - $edge) + (64 + 191 * $relief) * $edge)
        $amberGreen = [Math]::Round((.81 * $green + .19 * 71) * (1 - $edge) + (36 + 155 * $relief) * $edge)
        $amberBlue = [Math]::Round((.81 * $blueChannel + .19 * 108) * (1 - $edge) + (20 + 70 * $relief) * $edge)
        $amber.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $amberRed, $amberGreen, $amberBlue))
      }
    }
    $blue.Save((Join-Path $root 'public/images/preparation/ui/blue-stone.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $amber.Save((Join-Path $root 'public/images/preparation/ui/amber-stone.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $blue.Dispose(); $amber.Dispose() }
} finally { $atlas.Dispose() }

