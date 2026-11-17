$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$layout = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'layout.json') -Raw | ConvertFrom-Json
$verification = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Raw | ConvertFrom-Json
$glyphs = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/glyphs.json') -Raw | ConvertFrom-Json
$atlasData = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.json') -Raw | ConvertFrom-Json
$skin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ui-skin-layout.json') -Raw | ConvertFrom-Json
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
function NineSlice($graphics,$image,$panel) {
    $s=$panel.source;$t=$panel.target;$i=$panel.insets
    $sx=@($s.x,($s.x+$i.left),($s.x+$s.width-$i.right));$sy=@($s.y,($s.y+$i.top),($s.y+$s.height-$i.bottom))
    $sw=@($i.left,($s.width-$i.left-$i.right),$i.right);$sh=@($i.top,($s.height-$i.top-$i.bottom),$i.bottom)
    $dx=@($t.x,($t.x+$i.left),($t.x+$t.width-$i.right));$dy=@($t.y,($t.y+$i.top),($t.y+$t.height-$i.bottom))
    $dw=@($i.left,($t.width-$i.left-$i.right),$i.right);$dh=@($i.top,($t.height-$i.top-$i.bottom),$i.bottom)
    for($row=0;$row -lt 3;$row++) {for($column=0;$column -lt 3;$column++) {
        if($panel.borderOnly -and $row -eq 1 -and $column -eq 1) {continue}
        if($row -ne 1 -and $column -ne 1) {
            if($dw[$column] -ne $sw[$column] -or $dh[$row] -ne $sh[$row]) {throw "Stretched corner: $($panel.name)"}
        }
        Blit $graphics $image $dx[$column] $dy[$row] $dw[$column] $dh[$row] $sx[$column] $sy[$row] $sw[$column] $sh[$row]
    }}
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
    if($source.Width -ne 887 -or $source.Height -ne 1774 -or $chrome.Width -ne $skin.size[0] -or $chrome.Height -ne $skin.size[1]) {throw 'Source or atlas native dimensions mismatch'}
    $bitmap=[System.Drawing.Bitmap]::new([int]$layout.width,[int]$layout.height)
    $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
    $graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
    # Opaque native background prevents any old UI from leaking outside the fixed map crop.
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($layout.colors.background))
    $crop=$layout.mapCrop
    $mapClip=[System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
        $cut=10;$l=$crop.x;$r=$crop.x+$crop.width;$t=$crop.y;$b=$crop.y+$crop.height
        $mapClip.AddPolygon([System.Drawing.Point[]]@(
            [System.Drawing.Point]::new(($l+$cut),$t),[System.Drawing.Point]::new(($r-$cut),$t),
            [System.Drawing.Point]::new($r,($t+$cut)),[System.Drawing.Point]::new($r,($b-$cut)),
            [System.Drawing.Point]::new(($r-$cut),$b),[System.Drawing.Point]::new(($l+$cut),$b),
            [System.Drawing.Point]::new($l,($b-$cut)),[System.Drawing.Point]::new($l,($t+$cut))
        ))
        $graphics.SetClip($mapClip)
        Blit $graphics $source $crop.x $crop.y $crop.width $crop.height $crop.x $crop.y $crop.width $crop.height
        $graphics.ResetClip()
    } finally {$mapClip.Dispose()}
    foreach($decoration in $skin.decorations) {
        $s=$decoration.source;$t=$decoration.target
        if($s.width -ne $t.width -or $s.height -ne $t.height) {throw 'Decoration must be a native unscaled crop'}
        Blit $graphics $chrome $t.x $t.y $t.width $t.height $s.x $s.y $s.width $s.height
    }
    foreach($panel in $skin.panels) {NineSlice $graphics $chrome $panel}
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
    $changed=0
    for($y=$roi.y;$y -lt $roi.y+$roi.height;$y++) {
        for($x=$roi.x;$x -lt $roi.x+$roi.width;$x++) {
            if($bitmap.GetPixel($x,$y).ToArgb() -ne $source.GetPixel($x,$y).ToArgb()) {$changed++}
        }
    }
    if($changed -ne 0) {throw "Map ROI pixel parity failed: changed=$changed"}
    # Nine-slice border-only interior is a known rectangle, independent of the atlas aspect.
    # Includes the selected source's baked legend. No opacity-based exclusions here.
    $openingChanged=0;$openingChecked=0
    $interior=$layout.mapInterior
    for($y=$interior.y;$y -lt $interior.y+$interior.height;$y++) {
        for($x=$interior.x;$x -lt $interior.x+$interior.width;$x++) {
            $openingChecked++
            if($bitmap.GetPixel($x,$y).ToArgb() -ne $source.GetPixel($x,$y).ToArgb()) {$openingChanged++}
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
        roi=$roi;roiPixelsChecked=($roi.width*$roi.height);roiPixelsChanged=$changed;
        mapInterior=$interior;mapInteriorPixelsChecked=$openingChecked;mapInteriorPixelsChanged=$openingChanged;
        boundaryPolicy='Entire guaranteed ROI and nine-slice frame interior checked without exclusions. New stone edges outside the interior are intentional.'
    }) -Force
    $verification.checks | Add-Member -NotePropertyName cornerBlitsValidated -NotePropertyValue ($skin.panels.Count*4) -Force
    $verification | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Encoding utf8
    Write-Output "Rendered $($layout.file) (887x1774); map ROI: $changed changed / $($roi.width*$roi.height) pixels; full hole: $openingChanged changed / $openingChecked pixels"
} finally {
    foreach($resource in @($graphics,$bitmap,$source,$icons,$chrome)) {if($null -ne $resource) {$resource.Dispose()}}
}
