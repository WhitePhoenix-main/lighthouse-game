param([string]$ProjectRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$reference = Join-Path $ProjectRoot 'art/chapter1-headland-reference-v1'
$spriteDir = Join-Path $ProjectRoot 'sprites/chapter1-headland-v1'
$scene = Get-Content (Join-Path $reference 'scene.json') -Raw | ConvertFrom-Json
foreach ($inputPath in @($scene.sources.props, $scene.sources.ground, $scene.sources.water)) {
    if (-not (Test-Path (Join-Path $ProjectRoot $inputPath))) { throw "Missing source: $inputPath" }
}
New-Item -ItemType Directory -Force $spriteDir | Out-Null
if (-not ('HeadlandArt' -as [type])) {
$drawingReferences = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Color].Assembly.Location, 'System.Collections')
# PowerShell 7.6/.NET10 factors GDI interfaces into these assemblies.
foreach ($assemblyName in @('System.Private.Windows.GdiPlus.dll','System.Private.Windows.Core.dll')) {
    $assemblyPath = Join-Path $PSHOME $assemblyName
    if (Test-Path $assemblyPath) { $drawingReferences += $assemblyPath }
}
Add-Type -ReferencedAssemblies $drawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.IO;

public class HeadlandProp {
    public string Id; public double X,Y,Width,Height; public bool Flip;
    public HeadlandProp(string id,double x,double y,double w,double h,bool flip=false) {
        Id=id;X=x;Y=y;Width=w;Height=h;Flip=flip;
    }
}
public static class HeadlandArt {
    public static Dictionary<string,Bitmap> Sprites = new Dictionary<string,Bitmap>();
    public static List<HeadlandProp> Props = new List<HeadlandProp>();
    public static Dictionary<string,Rectangle> Trims = new Dictionary<string,Rectangle>();
    public static double Shore(double y) { return 60-110*Math.Pow(y/400,2); }
    public static double SeaFraction() {
        int sea=0,total=0;
        for(int y=-400;y<=400;y++)for(int x=-400;x<=400;x++)if(x*x+y*y<=160000) {total++;if(x>Shore(y))sea++;}
        return (double)sea/total;
    }
    static Graphics GraphicsFor(Bitmap b) {
        Graphics g=Graphics.FromImage(b); g.InterpolationMode=InterpolationMode.NearestNeighbor;
        g.PixelOffsetMode=PixelOffsetMode.Half; g.SmoothingMode=SmoothingMode.None;
        g.CompositingMode=CompositingMode.SourceOver; return g;
    }
    public static Bitmap Normalize(Bitmap atlas,int column,int row,int width,int height,string id) {
        int cw=atlas.Width/3,ch=atlas.Height/2, startX=column*cw,startY=row*ch;
        // The generated tower overlaps the nominal row boundary. Keep its complete foot,
        // and exclude it from the grass extraction without modifying the source atlas.
        if(id=="lighthouse")ch=(int)(atlas.Height*.60);
        if(id=="grass") {startY=(int)(atlas.Height*.625);ch=atlas.Height-startY;}
        int minX=cw,minY=ch,maxX=-1,maxY=-1;
        using(Bitmap clean=new Bitmap(cw,ch,PixelFormat.Format32bppArgb)) {
        for(int y=0;y<ch;y++) for(int x=0;x<cw;x++) {
            Color pixel=atlas.GetPixel(startX+x,startY+y);
            if(pixel.A<180)continue;
            if(id=="surf")pixel=Color.FromArgb((int)(pixel.A*.58),pixel.R,pixel.G,pixel.B);
            clean.SetPixel(x,y,pixel);
            minX=Math.Min(minX,x);minY=Math.Min(minY,y);maxX=Math.Max(maxX,x);maxY=Math.Max(maxY,y);
        }
        if(maxX<minX)throw new Exception("Empty atlas cell: "+id);
        Rectangle rect=new Rectangle(minX,minY,maxX-minX+1,maxY-minY+1);
        Trims[id]=new Rectangle(startX+minX,startY+minY,rect.Width,rect.Height);
        Bitmap output=new Bitmap(width,height,PixelFormat.Format32bppArgb);
        double ratio=Math.Min((width-4.0)/rect.Width,(height-4.0)/rect.Height);
        int dw=Math.Max(1,(int)Math.Round(rect.Width*ratio)),dh=Math.Max(1,(int)Math.Round(rect.Height*ratio));
        using(Graphics g=GraphicsFor(output))g.DrawImage(clean,new Rectangle((width-dw)/2,height-dh-2,dw,dh),rect,GraphicsUnit.Pixel);
        Sprites[id]=output;return output;
        }
    }
    public static Bitmap Texture(Bitmap source,int size) {
        Bitmap output=new Bitmap(size,size,PixelFormat.Format32bppArgb);
        using(Graphics g=GraphicsFor(output))g.DrawImage(source,new Rectangle(0,0,size,size),new Rectangle(0,0,source.Width,source.Height),GraphicsUnit.Pixel);
        return output;
    }
    static int Wrap(int n,int size) {return (n%size+size)%size;}
    static Color Shade(Color c,double amount) {return Color.FromArgb(255,(int)(c.R*amount),(int)(c.G*amount),(int)(c.B*amount));}
    public static void Layout() {
        Props.Clear();
        // Fixed world layout shared by every camera. Tall ruins stay beyond radius400.
        Props.Add(new HeadlandProp("ruined-arch",-320,-380,100,125));
        Props.Add(new HeadlandProp("rubble",-266,-392,64,43));
        Props.Add(new HeadlandProp("ruined-arch",-390,340,86,108,true));
        Props.Add(new HeadlandProp("rubble",-333,359,74,49,true));
        double[,] grass={{-365,-245},{-414,-100},{-410,125},{-305,368},{-216,-455},{-175,470},{-305,-516},{-90,565},{-460,515},{-510,-320},{-480,690},{-370,-725},{-635,960},{-750,-1040}};
        for(int i=0;i<grass.GetLength(0);i++)Props.Add(new HeadlandProp("grass",grass[i,0],grass[i,1],62,46,i%2==0));
        double[] ys={-900,-862,-708,-575,-538,-382,-344,-192,-165,42,72,220,266,410,438,600,770,804,950};
        double[] widths={68,50,82,61,52,74,55,81,50,69,52,84,57,73,51,78,62,50,80};
        for(int i=0;i<ys.Length;i++) {
            double y=ys[i]; double x=Shore(y);
            string rock=i%4==1?"rubble":"shore-rocks";
            double rockHeight=widths[i]*(rock=="rubble"?.66:.70);
            Props.Add(new HeadlandProp(rock,x-7+(i%3)*4,y,widths[i],rockHeight,i%2==0));
            if(i%3!=1) {
                double foamWidth=38+(i*17%37);
                Props.Add(new HeadlandProp("surf",x+21,y+18+(i%3)*3,foamWidth,foamWidth*.36,i%2!=0));
            }
            if(i%5==1)Props.Add(new HeadlandProp("grass",x-27,y-4,36,27,i%2==0));
        }
        Props.Add(new HeadlandProp("lighthouse",0,0,100,150));
        // Keep the complete projected grass footprint on the land side, including
        // the distant portrait scenery where the coast curves farther inland.
        foreach(HeadlandProp p in Props)if(p.Id=="grass") {
            double inlandLimit=Math.Min(Shore(p.Y),Shore(p.Y-p.Height/.84))-p.Width/2-4;
            p.X=Math.Min(p.X,inlandLimit);
        }
        Props.Sort((a,b)=>a.Y.CompareTo(b.Y));
    }
    static void DrawProp(Graphics g,HeadlandProp p,double scale,double cx,double cy) {
        if(!Sprites.ContainsKey(p.Id))return;
        Bitmap image=Sprites[p.Id];
        // Normalized sprites have their foot two pixels above the canvas bottom.
        int w=(int)Math.Round(p.Width*scale),h=(int)Math.Round(p.Height*scale);
        int px=(int)Math.Round(cx+p.X*scale-w/2.0);
        int py=(int)Math.Round(cy+p.Y*.84*scale-h+2*scale);
        if(p.Flip) {
            using(Bitmap flipped=(Bitmap)image.Clone()) {
                flipped.RotateFlip(RotateFlipType.RotateNoneFlipX);
                g.DrawImage(flipped,new Rectangle(px,py,w,h),new Rectangle(0,0,image.Width,image.Height),GraphicsUnit.Pixel);
            }
        } else g.DrawImage(image,new Rectangle(px,py,w,h),new Rectangle(0,0,image.Width,image.Height),GraphicsUnit.Pixel);
    }
    public static double Render(string path,int width,int height,Bitmap ground,Bitmap sea) {
        double scale=Math.Min((width-36.0)/800,(height-52.0)/(800*.84));
        double cx=width/2.0,cy=height/2.0+24;
        using(Bitmap output=new Bitmap(width,height,PixelFormat.Format32bppArgb)) {
            // Raster masks only define material boundaries; every material pixel comes from supplied art.
            for(int sy=0;sy<height;sy++)for(int sx=0;sx<width;sx++) {
                double x=(sx-cx)/scale,y=(sy-cy)/(.84*scale),shore=Shore(y);
                int tx=Wrap((int)Math.Floor(x/2),128),ty=Wrap((int)Math.Floor(y/2),128);
                Color color=sea.GetPixel(tx,ty);
                // Low relief on the sea side only. Keep the canonical land boundary
                // exact; tiny stepped width changes break a mechanically smooth rim.
                int reliefCluster=(int)Math.Floor(y/14);
                double cliffShore=shore+2+Wrap(reliefCluster*7,3);
                if(x<=cliffShore)color=Shade(ground.GetPixel(tx,ty),.80);
                if(x<=shore) {
                    color=ground.GetPixel(tx,ty);
                    if(x>shore-5)color=Shade(color,.86);
                }
                output.SetPixel(sx,sy,color);
            }
            using(Graphics g=GraphicsFor(output))foreach(HeadlandProp p in Props)DrawProp(g,p,scale,cx,cy);
            output.Save(path,ImageFormat.Png);
        }
        return scale;
    }
    public static void Board(string path) {
        using(Bitmap output=new Bitmap(768,576))using(Graphics g=GraphicsFor(output)) {
            g.Clear(Color.FromArgb(25,37,45));
            string[] ids={"lighthouse","shore-rocks","ruined-arch","grass","surf","rubble","ground","water"};
            for(int i=0;i<ids.Length;i++) {
                Bitmap b=Sprites[ids[i]];int col=i%4,row=i/4;
                double ratio=Math.Min(160.0/b.Width,224.0/b.Height);
                int w=(int)(b.Width*ratio),h=(int)(b.Height*ratio);
                g.DrawImage(b,new Rectangle(col*192+(192-w)/2,row*288+30+(224-h)/2,w,h),new Rectangle(0,0,b.Width,b.Height),GraphicsUnit.Pixel);
                using(Font font=new Font("Consolas",10))using(SolidBrush brush=new SolidBrush(Color.FromArgb(187,202,207)))g.DrawString(ids[i],font,brush,col*192+12,row*288+258);
            }
            output.Save(path,ImageFormat.Png);
        }
    }
    public static void Dispose() { foreach(Bitmap b in Sprites.Values)b.Dispose();Sprites.Clear(); }
}
'@
}
$atlas = [System.Drawing.Bitmap]::new((Join-Path $ProjectRoot $scene.sources.props))
$ids = @($scene.propsGrid.order)
$spriteRecords = @()
try {
    for ($index = 0; $index -lt $ids.Count; $index++) {
        $id = $ids[$index]
        $size = $scene.spriteCanvases.$id
        $bitmap = [HeadlandArt]::Normalize($atlas, ($index % 3), [int][Math]::Floor($index / 3), $size[0], $size[1], $id)
        $target = Join-Path $spriteDir "$id.png"
        $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
        $rect = [HeadlandArt]::Trims[$id]
        $spriteRecords += [ordered]@{id=$id;file="sprites/chapter1-headland-v1/$id.png";canvas=@($size);sourceRect=@($rect.X,$rect.Y,$rect.Width,$rect.Height)}
    }
} finally { $atlas.Dispose() }
foreach ($id in @('ground','water')) {
    $source = [System.Drawing.Bitmap]::new((Join-Path $ProjectRoot $scene.sources.$id))
    try { $tile = [HeadlandArt]::Texture($source,128) } finally { $source.Dispose() }
    [HeadlandArt]::Sprites[$id] = $tile
    $tile.Save((Join-Path $spriteDir "$id.png"), [System.Drawing.Imaging.ImageFormat]::Png)
}
[HeadlandArt]::Layout()
$views = @()
foreach ($name in @('field','portrait')) {
    $size = $scene.views.$name
    $scale = [HeadlandArt]::Render((Join-Path $reference "$name.png"),$size[0],$size[1],[HeadlandArt]::Sprites['ground'],[HeadlandArt]::Sprites['water'])
    $cx=$size[0]/2; $cy=$size[1]/2+24
    $views += [ordered]@{id=$name;size=@($size);scale=$scale;origin=@($cx,$cy);activeDiskBounds=@(($cx-400*$scale),($cy-336*$scale),($cx+400*$scale),($cy+336*$scale));entireDiskFits=($cx-400*$scale -ge 0 -and $cy-336*$scale -ge 0 -and $cx+400*$scale -le $size[0] -and $cy+336*$scale -le $size[1])}
}
[HeadlandArt]::Board((Join-Path $reference 'sprite-board.png'))
$placements = @([HeadlandArt]::Props | ForEach-Object { [ordered]@{id=$_.Id;x=$_.X;y=$_.Y;width=$_.Width;height=$_.Height;flip=$_.Flip} })
$manifest = [ordered]@{version=1;status='art-reference-only';scene='art/chapter1-headland-reference-v1/scene.json';filter='nearest-neighbor';alphaCutoff=180;surfOpacity=.58;atlasExtractionNote='Tower extends into nominal second row; lighthouse region extends to60% height and grass starts at62.5% height.';textureTileSize=128;textureWorldSize=256;seamlessness='provisional';sprites=$spriteRecords;placements=$placements}
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $spriteDir 'manifest.json') -Encoding utf8
$verification = [ordered]@{version=1;command='pwsh -File tools/assets/prepare-headland-reference.ps1';composition='separate source-derived raster sprites over source-derived tiled materials with geometric shore and relief masks';shore=$scene.geometry.shore;projectionY=.84;worldRadius=400;seaFractionOfActiveDisk=[HeadlandArt]::SeaFraction();sharedWorldPlacements=$true;views=$views;sourceHashes=@($scene.sources.psobject.Properties | ForEach-Object { [ordered]@{id=$_.Name;sha256=(Get-FileHash (Join-Path $ProjectRoot $_.Value) -Algorithm SHA256).Hash} });limitations=@('Texture seamlessness and balance values are provisional.','This reference does not change gameplay or integrate art into Phaser.','PNG fit checks are mathematical viewport checks, not physical phone testing.')}
$verification | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $reference 'verification.json') -Encoding utf8
[HeadlandArt]::Dispose()
Write-Output 'Created normalized sprites, field.png, portrait.png, sprite-board.png and verification.json.'
