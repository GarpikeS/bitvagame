param(
  [string]$FigmaDir = "qa\figma-cloud-full",
  [string]$ActualDir = "qa\page-clips",
  [string]$OutDir = "qa\visual-diff-current",
  [double]$Threshold = 8,
  [string[]]$Slugs = @(
    "home",
    "logged-in-home",
    "profile",
    "favorites",
    "purchases",
    "forms",
    "login",
    "register",
    "register-code",
    "register-success",
    "game-detail"
  )
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$source = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class VisualDiffResult
{
    public int FigmaWidth;
    public int FigmaHeight;
    public int ActualWidth;
    public int ActualHeight;
    public int ExpectedWidth;
    public int ExpectedHeight;
    public double ScaleByWidth;
    public int HeightDelta;
    public int CompareWidth;
    public int CompareHeight;
    public long ChangedPixels;
    public double ChangedPercent;
    public double MeanDelta;
    public double MaxDelta;
    public int BBoxMinX;
    public int BBoxMinY;
    public int BBoxMaxX;
    public int BBoxMaxY;
    public bool HasBBox;
}

public static class VisualDiffFast
{
    static Bitmap ToArgb(Bitmap source)
    {
        Bitmap result = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(result))
        {
            g.DrawImage(source, 0, 0, source.Width, source.Height);
        }
        return result;
    }

    static Bitmap Resize(Bitmap source, int width, int height)
    {
        Bitmap result = new Bitmap(width, height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(result))
        {
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.DrawImage(source, 0, 0, width, height);
        }
        return result;
    }

    public static VisualDiffResult Compare(string figmaPath, string actualPath, string refOut, string diffOut, double threshold)
    {
        using (Bitmap figmaOriginal = new Bitmap(figmaPath))
        using (Bitmap actualOriginal = new Bitmap(actualPath))
        using (Bitmap figma = ToArgb(figmaOriginal))
        using (Bitmap actual = ToArgb(actualOriginal))
        {
            double scale = (double)actual.Width / (double)figma.Width;
            int expectedHeight = (int)Math.Round(figma.Height * scale);
            using (Bitmap reference = Resize(figma, actual.Width, expectedHeight))
            using (Bitmap diff = new Bitmap(Math.Min(reference.Width, actual.Width), Math.Min(reference.Height, actual.Height), PixelFormat.Format32bppArgb))
            {
                int width = diff.Width;
                int height = diff.Height;
                Rectangle rect = new Rectangle(0, 0, width, height);

                BitmapData refData = reference.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                BitmapData actualData = actual.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                BitmapData diffData = diff.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

                int refStride = Math.Abs(refData.Stride);
                int actualStride = Math.Abs(actualData.Stride);
                int diffStride = Math.Abs(diffData.Stride);
                byte[] refBytes = new byte[refStride * height];
                byte[] actualBytes = new byte[actualStride * height];
                byte[] diffBytes = new byte[diffStride * height];
                Marshal.Copy(refData.Scan0, refBytes, 0, refBytes.Length);
                Marshal.Copy(actualData.Scan0, actualBytes, 0, actualBytes.Length);

                long changed = 0;
                double totalDelta = 0;
                double maxDelta = 0;
                int minX = width;
                int minY = height;
                int maxX = -1;
                int maxY = -1;

                for (int y = 0; y < height; y++)
                {
                    int refRow = y * refStride;
                    int actualRow = y * actualStride;
                    int diffRow = y * diffStride;
                    for (int x = 0; x < width; x++)
                    {
                        int refOffset = refRow + x * 4;
                        int actualOffset = actualRow + x * 4;
                        int diffOffset = diffRow + x * 4;
                        int db = Math.Abs(refBytes[refOffset] - actualBytes[actualOffset]);
                        int dg = Math.Abs(refBytes[refOffset + 1] - actualBytes[actualOffset + 1]);
                        int dr = Math.Abs(refBytes[refOffset + 2] - actualBytes[actualOffset + 2]);
                        double delta = (dr + dg + db) / 3.0;
                        totalDelta += delta;
                        if (delta > maxDelta) maxDelta = delta;
                        if (delta > threshold)
                        {
                            changed++;
                            if (x < minX) minX = x;
                            if (y < minY) minY = y;
                            if (x > maxX) maxX = x;
                            if (y > maxY) maxY = y;
                        }
                        byte heat = (byte)Math.Min(255, (int)(delta * 4));
                        diffBytes[diffOffset] = 0;
                        diffBytes[diffOffset + 1] = 0;
                        diffBytes[diffOffset + 2] = heat;
                        diffBytes[diffOffset + 3] = 255;
                    }
                }

                Marshal.Copy(diffBytes, 0, diffData.Scan0, diffBytes.Length);
                reference.UnlockBits(refData);
                actual.UnlockBits(actualData);
                diff.UnlockBits(diffData);

                reference.Save(refOut, ImageFormat.Png);
                diff.Save(diffOut, ImageFormat.Png);

                long pixels = (long)width * (long)height;
                return new VisualDiffResult {
                    FigmaWidth = figma.Width,
                    FigmaHeight = figma.Height,
                    ActualWidth = actual.Width,
                    ActualHeight = actual.Height,
                    ExpectedWidth = actual.Width,
                    ExpectedHeight = expectedHeight,
                    ScaleByWidth = scale,
                    HeightDelta = actual.Height - expectedHeight,
                    CompareWidth = width,
                    CompareHeight = height,
                    ChangedPixels = changed,
                    ChangedPercent = pixels == 0 ? 0 : (double)changed / (double)pixels * 100.0,
                    MeanDelta = pixels == 0 ? 0 : totalDelta / (double)pixels,
                    MaxDelta = maxDelta,
                    BBoxMinX = minX,
                    BBoxMinY = minY,
                    BBoxMaxX = maxX,
                    BBoxMaxY = maxY,
                    HasBBox = maxX >= 0
                };
            }
        }
    }
}
"@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$report = [ordered]@{}

foreach ($slug in $Slugs) {
  $figmaPath = Join-Path $FigmaDir "$slug.png"
  $actualPath = Join-Path $ActualDir "$slug.png"
  if (!(Test-Path -LiteralPath $figmaPath) -or !(Test-Path -LiteralPath $actualPath)) {
    continue
  }

  $refOut = Join-Path $OutDir "$slug-ref-scaled.png"
  $diffOut = Join-Path $OutDir "$slug-diff.png"
  $result = [VisualDiffFast]::Compare(
    (Resolve-Path -LiteralPath $figmaPath),
    (Resolve-Path -LiteralPath $actualPath),
    (Join-Path (Get-Location) $refOut),
    (Join-Path (Get-Location) $diffOut),
    $Threshold
  )

  $bbox = $null
  if ($result.HasBBox) {
    $bbox = @($result.BBoxMinX, $result.BBoxMinY, $result.BBoxMaxX, $result.BBoxMaxY)
  }

  $report[$slug] = [ordered]@{
    figmaSize = @($result.FigmaWidth, $result.FigmaHeight)
    actualSize = @($result.ActualWidth, $result.ActualHeight)
    expectedScaledSize = @($result.ExpectedWidth, $result.ExpectedHeight)
    scaleByWidth = [Math]::Round($result.ScaleByWidth, 6)
    heightDelta = $result.HeightDelta
    comparedSize = @($result.CompareWidth, $result.CompareHeight)
    changedPixels = $result.ChangedPixels
    changedPercent = [Math]::Round($result.ChangedPercent, 4)
    meanDelta = [Math]::Round($result.MeanDelta, 4)
    maxDelta = [Math]::Round($result.MaxDelta, 4)
    bbox = $bbox
    refScaled = $refOut
    diff = $diffOut
  }
}

$json = $report | ConvertTo-Json -Depth 6
$json | Set-Content -Path (Join-Path $OutDir "report.json") -Encoding UTF8
$json
