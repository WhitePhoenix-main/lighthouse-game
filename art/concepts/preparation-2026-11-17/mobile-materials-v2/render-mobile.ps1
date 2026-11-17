$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$layout = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'layout.json') -Raw | ConvertFrom-Json
$verification = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Raw | ConvertFrom-Json
$glyphs = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/glyphs.json') -Raw | ConvertFrom-Json
$atlasData = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.json') -Raw | ConvertFrom-Json
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
$source=$null;$icons=$null;$chrome=$null;$bitmap=$null;$graphics=$null
try {
    foreach($item in $verification.sources) {
        $actual=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $item.path) -Algorithm SHA256).Hash.ToLowerInvariant()
        if($actual -ne $item.sha256) {throw "Source changed after preparation: $($item.path)"}
    }
    $source=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $layout.source))
    $chrome=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $layout.chrome))
    $icons=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.png'))
    if($source.Width -ne 887 -or $source.Height -ne 1774 -or $chrome.Width -ne 887 -or $chrome.Height -ne 1774) {throw 'Sources must match native 887x1774 canvas'}
    $bitmap=[System.Drawing.Bitmap]::new([int]$layout.width,[int]$layout.height)
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    # Both immutable images retain native identity coordinates. The transparent hole reveals the selected map verbatim.
    $graphics.DrawImageUnscaled($source,0,0)
    $graphics.DrawImageUnscaled($chrome,0,0)
    # Generated alpha contains isolated A=1 dust inside the guaranteed hole.
    # Restore that fixed interior directly from the source at identity coordinates;
    # this is composition only, neither raster input is changed.
    $roi=$layout.mapROI
    Blit $graphics $source $roi.x $roi.y $roi.width $roi.height $roi.x $roi.y $roi.width $roi.height
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
    $graphics.Dispose();$graphics=$null
    # Byte-for-byte channel comparison in the guaranteed map interior. No edge exclusions needed here.
    $roi=$layout.mapROI
    $changed=0;$maxAlpha=0
    for($y=$roi.y;$y -lt $roi.y+$roi.height;$y++) {
        for($x=$roi.x;$x -lt $roi.x+$roi.width;$x++) {
            if($bitmap.GetPixel($x,$y).ToArgb() -ne $source.GetPixel($x,$y).ToArgb()) {$changed++}
            $maxAlpha=[Math]::Max($maxAlpha,$chrome.GetPixel($x,$y).A)
        }
    }
    if($changed -ne 0) {throw "Map interior pixel parity failed: changed=$changed, maxChromeAlpha=$maxAlpha"}
    # Also verify the full transparent interior, including the baked legend, while excluding only alpha-positive chrome edges.
    $openingChanged=0;$openingChecked=0
    for($y=385;$y -lt 1159;$y++) {
        for($x=24;$x -lt 862;$x++) {
            if($chrome.GetPixel($x,$y).A -eq 0) {
                $openingChecked++
                if($bitmap.GetPixel($x,$y).ToArgb() -ne $source.GetPixel($x,$y).ToArgb()) {$openingChanged++}
            }
        }
    }
    if($openingChanged -ne 0) {throw "Transparent map opening parity failed: $openingChanged"}
    foreach($item in $verification.sources) {
        $actual=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $item.path) -Algorithm SHA256).Hash.ToLowerInvariant()
        if($actual -ne $item.sha256) {throw "Source changed during render: $($item.path)"}
    }
    $verification.checks.renderAndPixelParity='passed'
    $verification.checks | Add-Member -NotePropertyName sourceHashesUnchanged -NotePropertyValue $true -Force
    $verification | Add-Member -NotePropertyName pixelParity -NotePropertyValue ([ordered]@{
        roi=$roi;roiPixelsChecked=($roi.width*$roi.height);roiPixelsChanged=$changed;roiChromeMaxAlpha=$maxAlpha;
        transparentOpeningPixelsChecked=$openingChecked;transparentOpeningPixelsChanged=$openingChanged;
        alphaBoundaryPolicy='Native source ROI restored after overlay to neutralize A=1 dust; entire 800x660 ROI checked without exclusions. Outside ROI skip only alpha-positive chrome edge pixels.'
    }) -Force
    $verification | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Encoding utf8
    Write-Output "Rendered $($layout.file) (887x1774); map ROI: $changed changed / $($roi.width*$roi.height) pixels; full hole: $openingChanged changed / $openingChecked pixels"
} finally {
    foreach($resource in @($graphics,$bitmap,$source,$icons,$chrome)) {if($null -ne $resource) {$resource.Dispose()}}
}
