$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$sourceDir = Join-Path $projectRoot 'sprites/chapter1-headland-v1'
$targetDir = Join-Path $projectRoot 'public/images/skill-tree'
New-Item -ItemType Directory -Force $targetDir | Out-Null

$drawingReferences = @([System.Drawing.Bitmap].Assembly.Location, [System.Drawing.Color].Assembly.Location)
foreach ($assemblyName in @('System.Private.Windows.GdiPlus.dll','System.Private.Windows.Core.dll')) {
    $assemblyPath = Join-Path $PSHOME $assemblyName
    if (Test-Path $assemblyPath) { $drawingReferences += $assemblyPath }
}
if (-not ('SkillTreeChart' -as [type])) {
Add-Type -ReferencedAssemblies $drawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public sealed class SkillTreeChart : IDisposable
{
    readonly Bitmap canvas;
    readonly Bitmap rocks;
    readonly Bitmap arch;
    readonly Bitmap surf;
    readonly int dashWidth;

    SkillTreeChart(int width, int height, string sourceDir, int dashWidth)
    {
        canvas = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        rocks = new Bitmap(Path.Combine(sourceDir, "shore-rocks.png"));
        arch = new Bitmap(Path.Combine(sourceDir, "ruined-arch.png"));
        surf = new Bitmap(Path.Combine(sourceDir, "surf.png"));
        this.dashWidth = dashWidth;

        for (int y = 0; y < height; y++)
        for (int x = 0; x < width; x++)
        {
            double dx = 2.0 * x / width - 1;
            double dy = 2.0 * y / height - 1;
            double edge = (dx * dx + dy * dy) / 2;
            canvas.SetPixel(x, y, Color.FromArgb(
                10 - (int)(3 * edge), 31 - (int)(5 * edge), 49 - (int)(6 * edge)));
        }
    }

    // Draw dashed depth contours on the native pixel grid. Dashes are spaced by
    // travelled distance so the turned portions retain the same rhythm.
    void Contour(params int[] points)
    {
        double previousX = points[0], previousY = points[1], distance = 0;
        double spacing = dashWidth == 1 ? 4 : 6;
        Color ink = dashWidth == 1 ? Color.FromArgb(25, 49, 72) : Color.FromArgb(27, 50, 74);
        for (int i = 0; i < points.Length - 2; i += 2)
        {
            int before = Math.Max(0, i - 2);
            int after = Math.Min(points.Length - 2, i + 4);
            for (int step = 1; step <= 96; step++)
            {
                double t = step / 96.0;
                double x = Curve(points[before], points[i], points[i + 2], points[after], t);
                double y = Curve(points[before + 1], points[i + 1], points[i + 3], points[after + 1], t);
                double dx = x - previousX, dy = y - previousY;
                distance += Math.Sqrt(dx * dx + dy * dy);
                if (distance >= spacing)
                {
                    for (int offset = 0; offset < dashWidth; offset++)
                        Plot((int)Math.Round(x) + offset, (int)Math.Round(y), ink);
                    distance -= spacing;
                }
                previousX = x;
                previousY = y;
            }
        }
    }

    static double Curve(double p0, double p1, double p2, double p3, double t)
    {
        return p1 + 0.5 * t * (p2 - p0 + t *
            (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    }

    void Plot(int x, int y, Color color)
    {
        if (x >= 0 && x < canvas.Width && y >= 0 && y < canvas.Height)
            canvas.SetPixel(x, y, color);
    }

    // Use nearest-neighbor sampling. Blue moonlight and narrow, subdued surf
    // keep the edges legible without competing with the upgrade medallions.
    void Sprite(Bitmap sprite, int x, int y, int width, int height, bool flip, bool foam = false)
    {
        for (int dy = 0; dy < height; dy++)
        for (int dx = 0; dx < width; dx++)
        {
            int targetX = x + dx, targetY = y + dy;
            if (targetX < 0 || targetX >= canvas.Width || targetY < 0 || targetY >= canvas.Height)
                continue;
            int sx = dx * sprite.Width / width;
            Color source = sprite.GetPixel(flip ? sprite.Width - 1 - sx : sx, dy * sprite.Height / height);
            if (source.A == 0) continue;
            Color background = canvas.GetPixel(targetX, targetY);
            double alpha = source.A / 255.0 * (foam ? 0.84 : 1.0);
            double red = source.R * 0.87;
            double green = source.G * 0.89 + 4;
            double blue = source.B * 0.95 + 13;
            canvas.SetPixel(targetX, targetY, Color.FromArgb(
                (int)(background.R + (red - background.R) * alpha),
                (int)(background.G + (green - background.G) * alpha),
                Math.Clamp((int)(background.B + (blue - background.B) * alpha), 0, 255)));
        }
    }

    void Reef(int x, int y, int width, int height, bool flip)
    {
        Sprite(surf, x - width / 8, y + height - width / 5, width * 5 / 4, width / 3, flip, true);
        Sprite(rocks, x, y, width, height, flip);
    }

    public static void Build(string sourceDir, string targetDir)
    {
        using (var wide = new SkillTreeChart(640, 320, sourceDir, 2))
        {
            wide.Contour(-8, 93, 36, 84, 64, 62, 101, 47, 104, 30, 139, 20, 171, 22, 213, 10);
            wide.Contour(-6, 128, 21, 118, 48, 115, 75, 99, 104, 99);
            wide.Contour(-9, 216, 18, 206, 43, 217, 71, 209, 91, 225);
            wide.Contour(-8, 265, 41, 257, 77, 239, 121, 243, 150, 266, 191, 272, 233, 296);
            wide.Contour(101, 291, 134, 288, 179, 303, 225, 311, 269, 308);
            wide.Contour(421, -6, 458, 17, 492, 14, 519, 31, 560, 39, 589, 36, 646, 69);
            wide.Contour(545, 87, 573, 100, 608, 98, 648, 120);
            wide.Contour(645, 150, 615, 144, 586, 152, 566, 174);
            wide.Contour(646, 216, 603, 206, 574, 226, 539, 231, 518, 256, 485, 256, 455, 277, 415, 282);
            wide.Contour(651, 294, 613, 285, 575, 294, 543, 280, 513, 292, 475, 306, 438, 308, 397, 319);

            wide.Reef(-24, -26, 71, 59, true);
            wide.Reef(-37, -1, 89, 55, false);
            wide.Reef(-12, 25, 79, 48, true);
            wide.Reef(11, 41, 68, 34, false);
            wide.Sprite(wide.arch, 46, 6, 40, 55, false);
            wide.Reef(77, 45, 23, 17, true);
            wide.Reef(44, 87, 31, 21, false);

            wide.Reef(-29, 219, 72, 52, true);
            wide.Reef(-16, 247, 78, 44, false);
            wide.Reef(26, 251, 64, 36, true);
            wide.Reef(98, 244, 28, 23, true);

            wide.Reef(556, -25, 78, 43, true);
            wide.Reef(588, -13, 79, 48, false);
            wide.Reef(548, 51, 39, 26, false);
            wide.Reef(486, 211, 33, 23, true);
            wide.Reef(609, 185, 59, 40, true);
            wide.Reef(599, 212, 72, 48, false);
            wide.Reef(558, 241, 92, 43, true);
            wide.Reef(524, 252, 76, 36, true);
            wide.canvas.Save(Path.Combine(targetDir, "sea-chart-wide.png"), ImageFormat.Png);
        }

        using (var portrait = new SkillTreeChart(192, 208, sourceDir, 1))
        {
            portrait.Contour(5, 64, 27, 53, 51, 31, 69, 24, 98, 29, 123, 35, 158, 52, 180, 58, 191, 66);
            portrait.Contour(3, 133, 26, 143, 47, 147, 63, 157, 87, 154, 109, 161, 135, 153, 153, 144);
            portrait.Contour(43, 181, 62, 183, 89, 174, 117, 182, 144, 176);

            portrait.Reef(16, 9, 21, 16, true);
            portrait.Reef(2, 25, 26, 18, false);
            portrait.Reef(149, 18, 25, 18, true);
            portrait.Reef(163, 20, 29, 22, false);
            portrait.Reef(2, 167, 34, 25, true);
            portrait.Sprite(portrait.arch, 4, 145, 36, 42, false);
            portrait.Reef(23, 166, 16, 11, true);
            portrait.canvas.Save(Path.Combine(targetDir, "sea-chart-portrait.png"), ImageFormat.Png);
        }
    }

    public void Dispose()
    {
        canvas.Dispose();
        rocks.Dispose();
        arch.Dispose();
        surf.Dispose();
    }
}
'@
}
[SkillTreeChart]::Build($sourceDir, $targetDir)

