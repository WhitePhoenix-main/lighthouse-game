$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$layouts=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'layouts.json') -Raw | ConvertFrom-Json
$fields=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'fields.json') -Raw | ConvertFrom-Json
$verification=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Raw | ConvertFrom-Json
$glyphs=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/glyphs.json') -Raw | ConvertFrom-Json
$atlasData=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.json') -Raw | ConvertFrom-Json
function Brush($color) { return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($color)) }
function Snap([double]$value) { return [int][Math]::Floor($value + 0.5) }
function Fill($graphics,$x,$y,$width,$height,$color) {
    $brush=Brush $color
    try {$graphics.FillRectangle($brush,[int](Snap $x),[int](Snap $y),[int](Snap $width),[int](Snap $height))} finally {$brush.Dispose()}
}
function Blit($graphics,$image,$dx,$dy,$dw,$dh,$sx,$sy,$sw,$sh,[double]$opacity=1) {
    $destination=[System.Drawing.Rectangle]::new((Snap $dx),(Snap $dy),(Snap $dw),(Snap $dh))
    if($opacity -lt 1) {
        $attributes=[System.Drawing.Imaging.ImageAttributes]::new()
        try {
            $matrix=[System.Drawing.Imaging.ColorMatrix]::new();$matrix.Matrix33=[single]$opacity
            $attributes.SetColorMatrix($matrix)
            $graphics.DrawImage($image,$destination,[single]$sx,[single]$sy,[single]$sw,[single]$sh,[System.Drawing.GraphicsUnit]::Pixel,$attributes)
        } finally {$attributes.Dispose()}
    } else {$graphics.DrawImage($image,$destination,[single]$sx,[single]$sy,[single]$sw,[single]$sh,[System.Drawing.GraphicsUnit]::Pixel)}
}
function NineSlice($graphics,$image,$panel) {
    $s=$panel.source;$t=$panel.target;$i=$panel.insets
    $sx=@($s.x,($s.x+$i.left),($s.x+$s.width-$i.right));$sy=@($s.y,($s.y+$i.top),($s.y+$s.height-$i.bottom))
    $sw=@($i.left,($s.width-$i.left-$i.right),$i.right);$sh=@($i.top,($s.height-$i.top-$i.bottom),$i.bottom)
    $dx=@($t.x,($t.x+$i.left),($t.x+$t.width-$i.right));$dy=@($t.y,($t.y+$i.top),($t.y+$t.height-$i.bottom))
    $dw=@($i.left,($t.width-$i.left-$i.right),$i.right);$dh=@($i.top,($t.height-$i.top-$i.bottom),$i.bottom)
    # Atlas frames include opaque backdrop outside their chipped corners.
    # A destination chamfer exposes the world there without changing source art.
    $saved=$graphics.Save();$clip=[System.Drawing.Drawing2D.GraphicsPath]::new()
    try {
      $cut=[Math]::Min($i.left,$i.top);$l=$t.x;$r=$t.x+$t.width;$top=$t.y;$b=$t.y+$t.height
      $clip.AddPolygon([System.Drawing.Point[]]@(
        [System.Drawing.Point]::new(($l+$cut),$top),[System.Drawing.Point]::new(($r-$cut),$top),
        [System.Drawing.Point]::new($r,($top+$cut)),[System.Drawing.Point]::new($r,($b-$cut)),
        [System.Drawing.Point]::new(($r-$cut),$b),[System.Drawing.Point]::new(($l+$cut),$b),
        [System.Drawing.Point]::new($l,($b-$cut)),[System.Drawing.Point]::new($l,($top+$cut))
      ))
      $graphics.SetClip($clip)
      for($row=0;$row -lt 3;$row++) {for($column=0;$column -lt 3;$column++) {
        if($panel.borderOnly -and $row -eq 1 -and $column -eq 1) {continue}
        if($row -ne 1 -and $column -ne 1) {
            if($dw[$column] -ne $sw[$column] -or $dh[$row] -ne $sh[$row]) {throw "Stretched corner: $($panel.name)"}
        }
        Blit $graphics $image $dx[$column] $dy[$row] $dw[$column] $dh[$row] $sx[$column] $sy[$row] $sw[$column] $sh[$row] $panel.opacity
      }}
    } finally {$graphics.Restore($saved);$clip.Dispose()}
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
function AlphaFill($graphics,$r,$alpha,$color) {
    $brush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb([int]$alpha,[System.Drawing.ColorTranslator]::FromHtml($color)))
    try {$graphics.FillRectangle($brush,[single]$r.x,[single]$r.y,[single]$r.width,[single]$r.height)} finally {$brush.Dispose()}
}
function HashesUnchanged {
    foreach($item in $verification.sources) {
        $actual=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $item.path) -Algorithm SHA256).Hash.ToLowerInvariant()
        if($actual -ne $item.sha256) {throw "Input source changed: $($item.path)"}
    }
}
$images=@{};$chrome=$null;$icons=$null
try {
    HashesUnchanged
    foreach($name in @('terrain-coast-irregular-v1.png','lighthouse-main.png','props-atlas.png')) {$images[$name]=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot ('../world-v2/'+$name)))}
    $chrome=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../mobile-slate-v3/ui-chrome.png'))
    $icons=[System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot '../full-screen-v1/ui-icons.png'))
    foreach($layout in $layouts) {
        $field=$fields | Where-Object {$_.id -eq $layout.id}
        $bitmap=[System.Drawing.Bitmap]::new([int]$layout.width,[int]$layout.height)
        $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
            $graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
            $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::None
            $graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($layout.colors.background))
            $terrain=$field.terrain;$image=$images[$terrain.asset]
            $dst=[System.Drawing.RectangleF]::new([single]$terrain.x,[single]$terrain.y,[single]$terrain.width,[single]$terrain.height)
            $src=[System.Drawing.RectangleF]::new(0,0,$image.Width,$image.Height)
            $graphics.DrawImage($image,$dst,$src,[System.Drawing.GraphicsUnit]::Pixel)
            foreach($area in $field.areas) {
                $thickness=$layout.areaStrokeWidth
                $pen=[System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($area.color),[single]$thickness)
                try {$pen.DashPattern=[single[]]@(5,4);$graphics.DrawEllipse($pen,[single]$area.x,[single]$area.y,[single]$area.width,[single]$area.height)} finally {$pen.Dispose()}
            }
            foreach($sprite in $field.sprites) {
                $image=$images[$sprite.asset];$f=$sprite.frame
                $dst=[System.Drawing.RectangleF]::new([single]$sprite.x,[single]$sprite.y,[single]$sprite.width,[single]$sprite.height)
                $src=[System.Drawing.RectangleF]::new([single]$f.x,[single]$f.y,[single]$f.width,[single]$f.height)
                $graphics.DrawImage($image,$dst,$src,[System.Drawing.GraphicsUnit]::Pixel)
                # Only damaged objects carry a healthbar in this quiet preparation view.
                if($null -ne $sprite.health -and $sprite.health -lt $sprite.maxHealth) {
                    $barWidth=[Math]::Max(34,40*$field.camera.zoom);$barX=$sprite.x+$sprite.width/2-$barWidth/2;$barY=$sprite.y-8
                    Fill $graphics ($barX-1) ($barY-1) ($barWidth+2) 6 '#101F26'
                    Fill $graphics $barX $barY ($barWidth*$sprite.health/$sprite.maxHealth) 4 '#E4B97A'
                }
            }
            $bitmap.Save((Join-Path $PSScriptRoot $layout.field),[System.Drawing.Imaging.ImageFormat]::Png)
            foreach($band in $layout.bands) {
                AlphaFill $graphics $band $band.alpha $layout.colors.background
                # Native slate interior texture tints the common translucent dock;
                # the single world layer remains visible through it.
                for($y=$band.y;$y -lt $band.y+$band.height;$y+=70) {
                    $tileHeight=[Math]::Min(70,$band.y+$band.height-$y)
                    for($x=0;$x -lt $layout.width;$x+=350){$tileWidth=[Math]::Min(350,$layout.width-$x);Blit $graphics $chrome $x $y $tileWidth $tileHeight 60 1316 $tileWidth $tileHeight $band.textureOpacity}
                }
                # A native textured stone edge joins each complete dock, without a map-card frame.
                $edgeY=if($band.edge -eq 'bottom'){$band.y+$band.height-10}else{$band.y}
                for($x=0;$x -lt $layout.width;$x+=350){$tileWidth=[Math]::Min(350,$layout.width-$x);Blit $graphics $chrome $x $edgeY $tileWidth 10 60 1293 $tileWidth 10}
            }
            foreach($q in $layout.quiet){AlphaFill $graphics $q $q.alpha $q.color}
            foreach($panel in $layout.panels){NineSlice $graphics $chrome $panel}
            foreach($item in $layout.icons) {
                $f=$atlasData.frames.PSObject.Properties[$item.name].Value
                $scale=[Math]::Min($item.width/$f.width,$item.height/$f.height)
                $iw=Snap ($f.width*$scale);$ih=Snap ($f.height*$scale)
                Blit $graphics $icons ($item.x+($item.width-$iw)/2) ($item.y+($item.height-$ih)/2) $iw $ih $f.x $f.y $f.width $f.height
            }
            foreach($stroke in $layout.strokes){Fill $graphics $stroke.x $stroke.y $stroke.width $stroke.height $stroke.color}
            foreach($chevron in $layout.chevrons){for($step=0;$step -lt $chevron.size;$step+=2){Fill $graphics ($chevron.x+$step) ($chevron.y+$step/2) 3 2 $chevron.color;Fill $graphics ($chevron.x+2*$chevron.size-$step-3) ($chevron.y+$step/2) 3 2 $chevron.color}}
            foreach($label in $layout.texts){PixelText $graphics $label}
            $bitmap.Save((Join-Path $PSScriptRoot $layout.file),[System.Drawing.Imaging.ImageFormat]::Png)
            if($layout.id -eq 'mobile') {
                $preview=[System.Drawing.Bitmap]::new(390,844);$pg=[System.Drawing.Graphics]::FromImage($preview)
                try {$pg.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor;$pg.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half;Blit $pg $bitmap 0 0 390 844 0 0 780 1688;$preview.Save((Join-Path $PSScriptRoot 'mobile-at-390.png'),[System.Drawing.Imaging.ImageFormat]::Png)} finally {$pg.Dispose();$preview.Dispose()}
            }
            Write-Output "Rendered $($layout.file) ($($layout.width)x$($layout.height))"
        } finally {$graphics.Dispose();$bitmap.Dispose()}
    }
    HashesUnchanged
    $verification.checks.render='passed'
    $verification.checks | Add-Member -NotePropertyName sourceHashesAfterRender -NotePropertyValue $true -Force
    $verification.checks | Add-Member -NotePropertyName damagedObjectHealthbarsOnly -NotePropertyValue @('lower') -Force
    $verification.checks | Add-Member -NotePropertyName wholeSkinStretch -NotePropertyValue $false -Force
    $verification | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verification.json') -Encoding utf8
} finally {
    foreach($image in $images.Values){$image.Dispose()}
    if($null -ne $chrome){$chrome.Dispose()};if($null -ne $icons){$icons.Dispose()}
}
