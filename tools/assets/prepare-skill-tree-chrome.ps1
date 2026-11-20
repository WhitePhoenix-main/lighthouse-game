$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sourceDirectory = Join-Path $projectRoot 'sprites/chapter1-headland-v1'
$targetDirectory = Join-Path $projectRoot 'public/images/skill-tree'
New-Item -ItemType Directory -Force $targetDirectory | Out-Null

function Export-Chrome {
    param(
        [string]$Name,
        [string[]]$NorthWest,
        [string[]]$SouthEast,
        [string]$Highlight,
        [string]$Joint,
        [int]$Rim = 9,
        [switch]$Hollow
    )

    $upper = $NorthWest | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) }
    $lower = $SouthEast | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) }
    $glint = [System.Drawing.ColorTranslator]::FromHtml($Highlight)
    $seam = [System.Drawing.ColorTranslator]::FromHtml($Joint)
    $bitmap = [System.Drawing.Bitmap]::new(64, 48, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    # Distances follow the stepped outline. Keep corner pixels inside the 12px CSS slice.
    $cornerSteps = @(8, 8, 6, 6, 4, 4, 2, 2)
    try {
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
            for ($x = 0; $x -lt $bitmap.Width; $x++) {
                $right = $bitmap.Width - 1 - $x
                $bottom = $bitmap.Height - 1 - $y
                $edgeX = [Math]::Min($x, $right)
                $edgeY = [Math]::Min($y, $bottom)
                if ($edgeY -lt $cornerSteps.Count -and $edgeX -lt $cornerSteps[$edgeY]) { continue }

                $inset = [Math]::Min($edgeX, $edgeY)
                if ($edgeY -lt $cornerSteps.Count) {
                    $inset = [Math]::Min($edgeY, $edgeX - $cornerSteps[$edgeY])
                }
                if ($edgeX -lt $cornerSteps.Count) {
                    $inset = [Math]::Min($inset, $edgeY - $cornerSteps[$edgeX])
                }

                if ($Hollow -and $inset -ge $Rim) { continue }
                $layer = [Math]::Min($Rim, $inset)
                $lit = [Math]::Min($x, $y) -le [Math]::Min($right, $bottom)
                $color = $lower[$layer]
                if ($lit) { $color = $upper[$layer] }
                $along = $x
                if ($edgeX -lt $edgeY) { $along = $y }

                $chip = $along % 19
                if ($layer -in 1, 2 -and $lit -and $chip -in 2, 3, 4, 12) {
                    $color = $glint
                }
                if (($layer -eq 2 -and $chip -in 8, 9) -or ($layer -eq 3 -and $chip -in 3, 10, 11, 16)) {
                    $color = $seam
                }
                $bitmap.SetPixel($x, $y, $color)
            }
        }
        $bitmap.Save((Join-Path $targetDirectory $Name), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $bitmap.Dispose()
    }
}

Export-Chrome 'sea-chart-slate.png' `
    @('#263d53', '#9bb3c8', '#7797b2', '#4b6784', '#283f56', '#152c3f', '#0c2031', '#122a3c', '#11293a', '#102738') `
    @('#071624', '#54708e', '#7591aa', '#324c67', '#22394e', '#102438', '#0b1e2f', '#102639', '#102739', '#102738') `
    '#b2c5d4' '#385671'

Export-Chrome 'sea-chart-amber.png' `
    @('#603b1a', '#ffcf65', '#ffb92c', '#f3a31a', '#ee8f12', '#995419', '#372319', '#825537', '#5c392b', '#4b2c21') `
    @('#261616', '#e6830e', '#f69c16', '#ffac1d', '#e37e0c', '#904916', '#352217', '#6e4832', '#56362a', '#4b2c21') `
    '#ffe29a' '#c87917'

Export-Chrome 'sea-chart-frame.png' `
    @('#2a435b', '#a3bbd0', '#7898b5', '#516c8b', '#2b4662', '#1b3046', '#0d2236', '#0d2236') `
    @('#071827', '#5d7994', '#7a96b2', '#4a6481', '#28435c', '#1b324a', '#0e2438', '#0e2438') `
    '#b8cbdd' '#3a5976' -Rim 7 -Hollow

function Add-PixelSprite {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Drawing.Bitmap]$Sprite,
        [int]$X, [int]$Y, [int]$Width, [int]$Height,
        [switch]$Flip
    )
    $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $state = $Graphics.Save()
    try {
        if ($Flip) {
            $Graphics.TranslateTransform($X + $Width, $Y)
            $Graphics.ScaleTransform(-1, 1)
            $X = 0
            $Y = 0
        }
        $destination = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
        $Graphics.DrawImage($Sprite, $destination, 0, 0, $Sprite.Width, $Sprite.Height, [System.Drawing.GraphicsUnit]::Pixel)
    }
    finally {
        $Graphics.Restore($state)
    }
}

function Export-Landmarks {
    $lighthouse = [System.Drawing.Bitmap]::new((Join-Path $sourceDirectory 'lighthouse.png'))
    $rocks = [System.Drawing.Bitmap]::new((Join-Path $sourceDirectory 'shore-rocks.png'))
    $rubble = [System.Drawing.Bitmap]::new((Join-Path $sourceDirectory 'rubble.png'))
    $surf = [System.Drawing.Bitmap]::new((Join-Path $sourceDirectory 'surf.png'))
    $islet = [System.Drawing.Bitmap]::new(128, 144, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $ground = [System.Drawing.Bitmap]::new(104, 36, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $isletGraphics = [System.Drawing.Graphics]::FromImage($islet)
    $groundGraphics = [System.Drawing.Graphics]::FromImage($ground)
    try {
        Add-PixelSprite $isletGraphics $surf 0 112 63 31
        Add-PixelSprite $isletGraphics $surf 64 114 64 28 -Flip
        Add-PixelSprite $isletGraphics $rocks 1 103 76 37 -Flip
        Add-PixelSprite $isletGraphics $rocks 44 104 84 37
        Add-PixelSprite $isletGraphics $lighthouse 18 0 92 139
        Add-PixelSprite $isletGraphics $rubble 7 114 44 26
        Add-PixelSprite $isletGraphics $rubble 83 116 42 24 -Flip
        Add-PixelSprite $isletGraphics $rocks 69 117 52 26
        $islet.Save((Join-Path $targetDirectory 'sea-chart-lighthouse.png'), [System.Drawing.Imaging.ImageFormat]::Png)

        Add-PixelSprite $groundGraphics $rocks 23 1 79 28 -Flip
        Add-PixelSprite $groundGraphics $rocks 1 4 58 31
        Add-PixelSprite $groundGraphics $rocks 44 10 55 25
        Add-PixelSprite $groundGraphics $rubble 27 14 48 22 -Flip
        $ground.Save((Join-Path $targetDirectory 'sea-chart-cannon-ground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $isletGraphics.Dispose()
        $groundGraphics.Dispose()
        $islet.Dispose()
        $ground.Dispose()
        $lighthouse.Dispose()
        $rocks.Dispose()
        $rubble.Dispose()
        $surf.Dispose()
    }
}

Export-Landmarks

