$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$layouts = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'layouts.json') -Raw | ConvertFrom-Json
$glyphs = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'glyphs.json') -Raw | ConvertFrom-Json
$atlasData = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ui-icons.json') -Raw | ConvertFrom-Json
$framePath = Join-Path $PSScriptRoot '../../../../sprites/menu-buttons-v2/frame-states.png'
$frames = [System.Drawing.Bitmap]::new([IO.Path]::GetFullPath($framePath))
$icons = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $atlasData.image))
$backgroundTerrain = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../world-v2/terrain-coast-irregular-v1.png'))
function Brush($color) { return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color)) }
function Snap([double]$value) { return [int][Math]::Floor($value + 0.5) }
function Fill($graphics,$x,$y,$width,$height,$color) {
    $brush=Brush $color
    try { $graphics.FillRectangle($brush,[int](Snap $x),[int](Snap $y),[int](Snap $width),[int](Snap $height)) } finally { $brush.Dispose() }
}
function Blit($graphics,$image,$dx,$dy,$dw,$dh,$sx,$sy,$sw,$sh) {
    $destination=[System.Drawing.Rectangle]::new((Snap $dx),(Snap $dy),(Snap $dw),(Snap $dh))
    $graphics.DrawImage($image,$destination,[single]$sx,[single]$sy,[single]$sw,[single]$sh,[System.Drawing.GraphicsUnit]::Pixel)
}
function Frame($graphics,$panel,[bool]$borderOnly=$false) {
    # Native 240x48 first state, split into a real nine-slice with 8px edges.
    $dx=@($panel.x,($panel.x+8),($panel.x+$panel.width-8))
    $dy=@($panel.y,($panel.y+8),($panel.y+$panel.height-8))
    $dw=@(8,($panel.width-16),8);$dh=@(8,($panel.height-16),8)
    $sx=@(0,8,232);$sy=@(0,8,40);$sw=@(8,224,8);$sh=@(8,32,8)
    for($row=0;$row -lt 3;$row++) { for($column=0;$column -lt 3;$column++) {
        if($borderOnly -and $row -eq 1 -and $column -eq 1) { continue }
        Blit $graphics $frames $dx[$column] $dy[$row] $dw[$column] $dh[$row] $sx[$column] $sy[$row] $sw[$column] $sh[$row]
    }}
    if($panel.style -eq 'primary') {
        # A stepped gold pixel rim makes the main action stronger than copper frames.
        Fill $graphics ($panel.x+10) ($panel.y+3) ($panel.width-20) 3 '#EDCC81'
        Fill $graphics ($panel.x+10) ($panel.y+$panel.height-6) ($panel.width-20) 3 '#A88748'
        Fill $graphics ($panel.x+3) ($panel.y+10) 3 ($panel.height-20) '#D6B46D'
        Fill $graphics ($panel.x+$panel.width-6) ($panel.y+10) 3 ($panel.height-20) '#B69755'
        foreach($offset in @(6,($panel.width-9))) {
            Fill $graphics ($panel.x+$offset) ($panel.y+6) 3 3 '#EDCC81'
            Fill $graphics ($panel.x+$offset) ($panel.y+$panel.height-9) 3 3 '#B69755'
        }
    }
}
function PixelText($graphics,$label) {
    $width=($label.value.Length*9-1)*$label.scale
    $left=$label.x
    if($label.align -eq 'center') { $left-=$width/2 } elseif($label.align -eq 'right') { $left-=$width }
    $left=Snap $left
    foreach($pass in @(@(1,2,'#04101C'),@(0,0,$label.color))) {
        $brush=Brush $pass[2]
        try {
            $index=0
            foreach($character in $label.value.ToCharArray()) {
                if($character -ne ' ') {
                    $rows=$glyphs.PSObject.Properties[[string]$character].Value
                    if($null -eq $rows) { throw "Missing pixel glyph $character" }
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
try {
    foreach($layout in $layouts) {
        $field=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot $layout.field))
        $bitmap=[System.Drawing.Bitmap]::new([int]$layout.width,[int]$layout.height)
        $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
            $graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#0A1B28'))
            # The same original terrain appears faintly between panels; this is a full screen, not an artboard.
            $backgroundScale=[Math]::Max($layout.width/$backgroundTerrain.Width,$layout.height/$backgroundTerrain.Height)
            $bw=Snap ($backgroundTerrain.Width*$backgroundScale);$bh=Snap ($backgroundTerrain.Height*$backgroundScale)
            Blit $graphics $backgroundTerrain (($layout.width-$bw)/2) (($layout.height-$bh)/2) $bw $bh 0 0 $backgroundTerrain.Width $backgroundTerrain.Height
            $veil=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(210,7,20,31))
            try {$graphics.FillRectangle($veil,0,0,[int]$layout.width,[int]$layout.height)} finally {$veil.Dispose()}
            $view=$layout.viewport
            Blit $graphics $field $view.x $view.y $view.width $view.height 0 0 $field.Width $field.Height
            Frame $graphics $view $true
            foreach($panel in $layout.panels) {Frame $graphics $panel}
            foreach($item in $layout.icons) {
                $frame=$atlasData.frames.PSObject.Properties[$item.name].Value
                if($null -eq $frame) {throw "Missing icon frame $($item.name)"}
                $scale=[Math]::Min($item.width/$frame.width,$item.height/$frame.height)
                $width=Snap ($frame.width*$scale);$height=Snap ($frame.height*$scale)
                Blit $graphics $icons ($item.x+($item.width-$width)/2) ($item.y+($item.height-$height)/2) $width $height $frame.x $frame.y $frame.width $frame.height
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
        } finally {$graphics.Dispose();$bitmap.Dispose();$field.Dispose()}
    }
} finally {$frames.Dispose();$icons.Dispose();$backgroundTerrain.Dispose()}
