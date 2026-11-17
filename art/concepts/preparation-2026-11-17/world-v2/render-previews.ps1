param([string]$LayoutPath = '', [string]$OutputDirectory = '', [switch]$HideLegend)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if ([string]::IsNullOrEmpty($LayoutPath)) { $LayoutPath = Join-Path $PSScriptRoot 'preview-layouts.json' }
if ([string]::IsNullOrEmpty($OutputDirectory)) { $OutputDirectory = $PSScriptRoot }
if (-not (Test-Path -LiteralPath $OutputDirectory)) { throw "Output directory does not exist: $OutputDirectory" }
$layouts = Get-Content -LiteralPath $LayoutPath -Raw | ConvertFrom-Json
$glyphs = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'preview-glyphs.json') -Raw | ConvertFrom-Json
$images = @{}
try {
    $assetNames = @($layouts | ForEach-Object { $_.terrain.asset; $_.sprites | ForEach-Object { $_.asset } }) | Select-Object -Unique
    foreach ($name in $assetNames) {
        $images[$name] = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $name))
    }
    foreach ($layout in $layouts) {
        $bitmap = [System.Drawing.Bitmap]::new([int]$layout.width, [int]$layout.height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
            $terrain = $layout.terrain
            $destination = [System.Drawing.RectangleF]::new([single]$terrain.x, [single]$terrain.y, [single]$terrain.width, [single]$terrain.height)
            $source = [System.Drawing.RectangleF]::new(0, 0, $images[$terrain.asset].Width, $images[$terrain.asset].Height)
            $graphics.DrawImage($images[$terrain.asset], $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
            foreach ($area in $layout.areas) {
                $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($area.color), [single]1.6)
                try {
                    if ($area.dashed) { $pen.DashPattern = [single[]]@(5, 4) }
                    $graphics.DrawEllipse($pen, [single]$area.x, [single]$area.y, [single]$area.width, [single]$area.height)
                } finally { $pen.Dispose() }
            }
            foreach ($sprite in $layout.sprites) {
                $destination = [System.Drawing.RectangleF]::new([single]$sprite.x, [single]$sprite.y, [single]$sprite.width, [single]$sprite.height)
                $frame = $sprite.frame
                $source = [System.Drawing.RectangleF]::new([single]$frame.x, [single]$frame.y, [single]$frame.width, [single]$frame.height)
                $graphics.DrawImage($images[$sprite.asset], $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)
                if ($null -ne $sprite.maxHealth) {
                    $barWidth = [Math]::Max(22, 34 * $layout.camera.zoom)
                    $barX = $sprite.x + $sprite.width / 2 - $barWidth / 2
                    $barY = $sprite.y - 7
                    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#101F26'))
                    $color = if ($sprite.health -lt $sprite.maxHealth) { '#E4B97A' } else { '#A8C5A0' }
                    $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color))
                    try {
                        $graphics.FillRectangle($background, [single]($barX-1), [single]($barY-1), [single]($barWidth+2), [single]5)
                        $graphics.FillRectangle($foreground, [single]$barX, [single]$barY, [single]($barWidth*$sprite.health/$sprite.maxHealth), [single]3)
                    } finally { $background.Dispose(); $foreground.Dispose() }
                }
            }
            $legendRow = 0
            foreach ($item in $(if ($HideLegend) { @() } else { $layout.legend })) {
                $scale = 2
                $color = [System.Drawing.ColorTranslator]::FromHtml($item.color)
                foreach ($pass in @(@(2, 3, [System.Drawing.ColorTranslator]::FromHtml('#071922')), @(0, 0, $color))) {
                    $brush = [System.Drawing.SolidBrush]::new($pass[2])
                    try {
                        $index = 0
                        foreach ($character in $item.label.ToCharArray()) {
                            if ($character -ne ' ') {
                                $rows = $glyphs.PSObject.Properties[[string]$character].Value
                                if ($null -eq $rows) { throw "Missing glyph $character" }
                                for ($row = 0; $row -lt 9; $row++) {
                                    for ($column = 0; $column -lt 8; $column++) {
                                        if ($rows[$row][$column] -eq '1') {
                                            $graphics.FillRectangle($brush, [single](16 + $index * 9 * $scale + $column * $scale + $pass[0]), [single](16 + $legendRow * 30 + $row * $scale + $pass[1]), [single]$scale, [single]$scale)
                                        }
                                    }
                                }
                            }
                            $index++
                        }
                    } finally { $brush.Dispose() }
                }
                $legendRow++
            }
            $bitmap.Save((Join-Path $OutputDirectory $layout.file), [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output "Rendered $($layout.file)"
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally {
    foreach ($image in $images.Values) { $image.Dispose() }
}
