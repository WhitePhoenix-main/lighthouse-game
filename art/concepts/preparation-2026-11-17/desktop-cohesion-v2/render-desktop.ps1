param([switch]$SkipFieldRender)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not $SkipFieldRender) {
    & (Join-Path $PSScriptRoot '../world-v2/render-previews.ps1') -LayoutPath (Join-Path $PSScriptRoot 'field-layout.json') -OutputDirectory $PSScriptRoot -HideLegend
}
$layout = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'layout.json') -Raw | ConvertFrom-Json
$glyphs = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/glyphs.json') -Raw | ConvertFrom-Json
$atlasData = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.json') -Raw | ConvertFrom-Json
$chromeData = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ui-chrome.json') -Raw | ConvertFrom-Json
function Brush($color) { return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color)) }
function Snap([double]$value) { return [int][Math]::Floor($value + 0.5) }
function Fill($graphics,$x,$y,$width,$height,$color) {
    $brush=Brush $color
    try {$graphics.FillRectangle($brush,[int](Snap $x),[int](Snap $y),[int](Snap $width),[int](Snap $height))} finally {$brush.Dispose()}
}
function Blit($graphics,$image,$dx,$dy,$dw,$dh,$sx,$sy,$sw,$sh) {
    $destination=[System.Drawing.Rectangle]::new((Snap $dx),(Snap $dy),(Snap $dw),(Snap $dh))
    $graphics.DrawImage($image,$destination,[single]$sx,[single]$sy,[single]$sw,[single]$sh,[System.Drawing.GraphicsUnit]::Pixel)
}
function PixelText($graphics,$label) {
    $width=($label.value.Length*9-1)*$label.scale
    $left=$label.x
    if($label.align -eq 'center') {$left-=$width/2} elseif($label.align -eq 'right') {$left-=$width}
    $left=Snap $left
    foreach($pass in @(@(1,2,'#04101C'),@(0,0,$label.color))) {
        $brush=Brush $pass[2]
        try {
            $index=0
            foreach($character in $label.value.ToCharArray()) {
                if($character -ne ' ') {
                    $rows=$glyphs.PSObject.Properties[[string]$character].Value
                    if($null -eq $rows) {throw "Missing pixel glyph $character"}
                    $originX=$left+$index*9*$label.scale+$pass[0]
                    $originY=$label.y+$pass[1]
                    for($row=0;$row -lt 9;$row++) {for($column=0;$column -lt 8;$column++) {
                        if($rows[$row][$column] -eq '1') {
                            $x0=Snap ($originX+$column*$label.scale);$x1=Snap ($originX+($column+1)*$label.scale)
                            $y0=Snap ($originY+$row*$label.scale);$y1=Snap ($originY+($row+1)*$label.scale)
                            $graphics.FillRectangle($brush,$x0,$y0,($x1-$x0),($y1-$y0))
                        }
                    }}
                    if($character -eq 'Й') {
                        foreach($accent in @(@(2,-3,1),@(5,-3,1),@(3,-2,2))) {
                            $x0=Snap ($originX+$accent[0]*$label.scale);$x1=Snap ($originX+($accent[0]+$accent[2])*$label.scale)
                            $y0=Snap ($originY+$accent[1]*$label.scale);$y1=Snap ($originY+($accent[1]+1)*$label.scale)
                            $graphics.FillRectangle($brush,$x0,$y0,($x1-$x0),($y1-$y0))
                        }
                    }
                }
                $index++
            }
        } finally {$brush.Dispose()}
    }
}
$field=$null;$icons=$null;$chrome=$null;$bitmap=$null;$graphics=$null
try {
    $field=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $layout.field))
    $icons=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.png'))
    $chrome=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $layout.chrome))
    if($chrome.Width -ne $chromeData.size[0] -or $chrome.Height -ne $chromeData.size[1]) {throw 'Chrome metadata size mismatch'}
    if([Math]::Abs($chrome.Width/$chrome.Height-$layout.width/$layout.height) -gt 0.003) {throw 'Chrome requires uniform full-canvas aspect'}
    if($field.Width -ne $layout.width -or $field.Height -ne $layout.height) {throw 'Field must cover canvas at native size'}
    $bitmap=[System.Drawing.Bitmap]::new([int]$layout.width,[int]$layout.height)
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    # One native full-canvas terrain scene. No repeated terrain or map-frame layer.
    Blit $graphics $field 0 0 $layout.width $layout.height 0 0 $field.Width $field.Height
    # The complete generated stone skin is composited once; no per-control stretching.
    $scale=[Math]::Min($layout.width/$chrome.Width,$layout.height/$chrome.Height)
    $cw=$chrome.Width*$scale;$ch=$chrome.Height*$scale
    Blit $graphics $chrome (($layout.width-$cw)/2) (($layout.height-$ch)/2) $cw $ch 0 0 $chrome.Width $chrome.Height
    foreach($item in $layout.icons) {
        $frame=$atlasData.frames.PSObject.Properties[$item.name].Value
        if($null -eq $frame) {throw "Missing icon $($item.name)"}
        $scale=[Math]::Min($item.width/$frame.width,$item.height/$frame.height)
        $iw=Snap ($frame.width*$scale);$ih=Snap ($frame.height*$scale)
        Blit $graphics $icons ($item.x+($item.width-$iw)/2) ($item.y+($item.height-$ih)/2) $iw $ih $frame.x $frame.y $frame.width $frame.height
    }
    foreach($stroke in $layout.strokes) {Fill $graphics $stroke.x $stroke.y $stroke.width $stroke.height $stroke.color}
    foreach($chevron in $layout.chevrons) {
        for($step=0;$step -lt $chevron.size;$step+=2) {
            Fill $graphics ($chevron.x+$step) ($chevron.y+$step/2) 3 2 $chevron.color
            Fill $graphics ($chevron.x+2*$chevron.size-$step-3) ($chevron.y+$step/2) 3 2 $chevron.color
        }
    }
    foreach($label in $layout.texts) {PixelText $graphics $label}
    $bitmap.Save((Join-Path $PSScriptRoot $layout.file),[System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Rendered $($layout.file) ($($layout.width)x$($layout.height))"
} finally {
    foreach($resource in @($graphics,$bitmap,$field,$icons,$chrome)) {if($null -ne $resource) {$resource.Dispose()}}
}
