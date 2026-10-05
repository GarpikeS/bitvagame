param(
  [string]$FigmaDir = "qa\figma-cloud-full",
  [string]$ActualDir = "qa\page-clips",
  [string]$OutDir = "qa\visual-diff-current",
  [double]$Threshold = 8
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$slugs = @(
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

function New-ResizedBitmap($source, [int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($source, 0, 0, $width, $height)
  $graphics.Dispose()
  return $bitmap
}

function Get-BitmapBytes($bitmap, $mode) {
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bitmap.Width, $bitmap.Height
  $data = $bitmap.LockBits(
    $rect,
    $mode,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $length = [Math]::Abs($data.Stride) * $bitmap.Height
  $bytes = New-Object byte[] $length
  if ($mode -eq [System.Drawing.Imaging.ImageLockMode]::ReadOnly) {
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $length)
  }
  return [ordered]@{
    data = $data
    bytes = $bytes
    stride = $data.Stride
    length = $length
  }
}

function Unlock-BitmapBytes($bitmap, $lock, [bool]$copyBack) {
  if ($copyBack) {
    [System.Runtime.InteropServices.Marshal]::Copy($lock.bytes, 0, $lock.data.Scan0, $lock.length)
  }
  $bitmap.UnlockBits($lock.data)
}

$report = [ordered]@{}

foreach ($slug in $slugs) {
  $figmaPath = Join-Path $FigmaDir "$slug.png"
  $actualPath = Join-Path $ActualDir "$slug.png"
  if (!(Test-Path -LiteralPath $figmaPath) -or !(Test-Path -LiteralPath $actualPath)) {
    continue
  }

  $figmaImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $figmaPath))
  $actualImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $actualPath))

  $scale = $actualImage.Width / $figmaImage.Width
  $expectedHeight = [Math]::Round($figmaImage.Height * $scale)
  $refImage = New-ResizedBitmap $figmaImage $actualImage.Width $expectedHeight

  $compareWidth = [Math]::Min($refImage.Width, $actualImage.Width)
  $compareHeight = [Math]::Min($refImage.Height, $actualImage.Height)
  $diffImage = New-Object System.Drawing.Bitmap $compareWidth, $compareHeight

  $refLock = Get-BitmapBytes $refImage ([System.Drawing.Imaging.ImageLockMode]::ReadOnly)
  $actualLock = Get-BitmapBytes $actualImage ([System.Drawing.Imaging.ImageLockMode]::ReadOnly)
  $diffLock = Get-BitmapBytes $diffImage ([System.Drawing.Imaging.ImageLockMode]::WriteOnly)

  $changedPixels = 0
  $totalDelta = 0.0
  $maxDelta = 0.0
  $minX = $compareWidth
  $minY = $compareHeight
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $compareHeight; $y++) {
    $refRow = $y * [Math]::Abs($refLock.stride)
    $actualRow = $y * [Math]::Abs($actualLock.stride)
    $diffRow = $y * [Math]::Abs($diffLock.stride)
    for ($x = 0; $x -lt $compareWidth; $x++) {
      $refOffset = $refRow + ($x * 4)
      $actualOffset = $actualRow + ($x * 4)
      $diffOffset = $diffRow + ($x * 4)
      $db = [Math]::Abs([int]$refLock.bytes[$refOffset] - [int]$actualLock.bytes[$actualOffset])
      $dg = [Math]::Abs([int]$refLock.bytes[$refOffset + 1] - [int]$actualLock.bytes[$actualOffset + 1])
      $dr = [Math]::Abs([int]$refLock.bytes[$refOffset + 2] - [int]$actualLock.bytes[$actualOffset + 2])
      $delta = ($dr + $dg + $db) / 3.0
      $totalDelta += $delta
      if ($delta -gt $maxDelta) { $maxDelta = $delta }
      if ($delta -gt $Threshold) {
        $changedPixels++
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
      $heat = [Math]::Min(255, [int]($delta * 4))
      $diffLock.bytes[$diffOffset] = 0
      $diffLock.bytes[$diffOffset + 1] = 0
      $diffLock.bytes[$diffOffset + 2] = [byte]$heat
      $diffLock.bytes[$diffOffset + 3] = 255
    }
  }

  Unlock-BitmapBytes $refImage $refLock $false
  Unlock-BitmapBytes $actualImage $actualLock $false
  Unlock-BitmapBytes $diffImage $diffLock $true

  $pixels = $compareWidth * $compareHeight
  $refOut = Join-Path $OutDir "$slug-ref-scaled.png"
  $diffOut = Join-Path $OutDir "$slug-diff.png"
  $refImage.Save((Join-Path (Get-Location) $refOut), [System.Drawing.Imaging.ImageFormat]::Png)
  $diffImage.Save((Join-Path (Get-Location) $diffOut), [System.Drawing.Imaging.ImageFormat]::Png)

  $bbox = $null
  if ($maxX -ge 0) {
    $bbox = @($minX, $minY, $maxX, $maxY)
  }

  $report[$slug] = [ordered]@{
    figmaSize = @($figmaImage.Width, $figmaImage.Height)
    actualSize = @($actualImage.Width, $actualImage.Height)
    expectedScaledSize = @($actualImage.Width, $expectedHeight)
    scaleByWidth = [Math]::Round($scale, 6)
    heightDelta = $actualImage.Height - $expectedHeight
    comparedSize = @($compareWidth, $compareHeight)
    changedPixels = $changedPixels
    changedPercent = [Math]::Round(($changedPixels / $pixels) * 100, 4)
    meanDelta = [Math]::Round($totalDelta / $pixels, 4)
    maxDelta = [Math]::Round($maxDelta, 4)
    bbox = $bbox
    refScaled = $refOut
    diff = $diffOut
  }

  $diffImage.Dispose()
  $refImage.Dispose()
  $actualImage.Dispose()
  $figmaImage.Dispose()
}

$json = $report | ConvertTo-Json -Depth 6
$json | Set-Content -Path (Join-Path $OutDir "report.json") -Encoding UTF8
$json
