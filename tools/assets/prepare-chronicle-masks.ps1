$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$project = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$source = Join-Path $project 'art/concepts/arthurian-lighthouse/chapter-night-chronicle-portrait-v2.png'
$output = Join-Path $project 'public/images/chronicle'
$reference = [Drawing.Bitmap]::new($source)

function Export-PaintMask([string]$name, [Drawing.Rectangle]$crop, [int]$width, [int]$height) {
    $sample = [Drawing.Bitmap]::new($width, $height)
    $mask = [Drawing.Bitmap]::new($width, $height, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($sample)
    try {
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($reference, [Drawing.Rectangle]::new(0, 0, $width, $height), $crop, [Drawing.GraphicsUnit]::Pixel)
        for ($y = 0; $y -lt $height; $y++) {
            for ($x = 0; $x -lt $width; $x++) {
                $pixel = $sample.GetPixel($x, $y)
                # Along the painted edge, cool pigment separates from the warm page.
                # Keep the inside opaque so warm details can show through in every state.
                $pigment = [Math]::Clamp(($pixel.B - $pixel.R + 29.0) / 35.0, 0.0, 1.0)
                $edgeX = [Math]::Min($x, $width - 1 - $x)
                $edgeY = [Math]::Min($y, $height - 1 - $y)
                $inset = [Math]::Min($edgeX / $width, $edgeY / $height)
                $inside = [Math]::Clamp(($inset - 0.065) / 0.065, 0.0, 1.0)
                $fade = [Math]::Min(1.0, [Math]::Min($edgeX, $edgeY) / 4.0)
                $alpha = [int](255.0 * [Math]::Max($pigment, $inside) * $fade)
                $mask.SetPixel($x, $y, [Drawing.Color]::FromArgb($alpha, 255, 255, 255))
            }
        }
        $mask.Save((Join-Path $output $name), [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $mask.Dispose()
        $sample.Dispose()
    }
}

try {
    Export-PaintMask 'wash-chapter.png' ([Drawing.Rectangle]::new(54, 265, 915, 311)) 540 184
    Export-PaintMask 'wash-night.png' ([Drawing.Rectangle]::new(69, 912, 430, 217)) 310 156
} finally {
    $reference.Dispose()
}
