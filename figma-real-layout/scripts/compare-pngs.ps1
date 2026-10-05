param(
  [Parameter(Mandatory=$true)][string]$Expected,
  [Parameter(Mandatory=$true)][string]$Actual,
  [string]$OutDiff = ""
)

Add-Type -AssemblyName System.Drawing

$expectedPath = Resolve-Path -LiteralPath $Expected
$actualPath = Resolve-Path -LiteralPath $Actual
$expectedImage = [System.Drawing.Bitmap]::FromFile($expectedPath)
$actualImage = [System.Drawing.Bitmap]::FromFile($actualPath)

$width = [Math]::Min($expectedImage.Width, $actualImage.Width)
$height = [Math]::Min($expectedImage.Height, $actualImage.Height)
$diffPixels = 0
$totalDelta = 0.0
$maxDelta = 0.0
$diffImage = $null

if ($OutDiff) {
  $diffImage = New-Object System.Drawing.Bitmap $width, $height
}

for ($y = 0; $y -lt $height; $y++) {
  for ($x = 0; $x -lt $width; $x++) {
    $a = $expectedImage.GetPixel($x, $y)
    $b = $actualImage.GetPixel($x, $y)
    $dr = [Math]::Abs($a.R - $b.R)
    $dg = [Math]::Abs($a.G - $b.G)
    $db = [Math]::Abs($a.B - $b.B)
    $delta = ($dr + $dg + $db) / 3.0
    $totalDelta += $delta
    if ($delta -gt $maxDelta) { $maxDelta = $delta }
    if ($delta -gt 8) { $diffPixels++ }
    if ($diffImage) {
      $diffImage.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([Math]::Min(255, [int]($delta * 4)), 0, 0))
    }
  }
}

if ($diffImage) {
  $diffImage.Save((Join-Path (Get-Location) $OutDiff), [System.Drawing.Imaging.ImageFormat]::Png)
  $diffImage.Dispose()
}

$pixels = $width * $height
$result = [ordered]@{
  expected = "$expectedPath"
  actual = "$actualPath"
  comparedWidth = $width
  comparedHeight = $height
  meanDelta = [Math]::Round($totalDelta / $pixels, 4)
  maxDelta = [Math]::Round($maxDelta, 4)
  changedPixels = $diffPixels
  changedPercent = [Math]::Round(($diffPixels / $pixels) * 100, 4)
  dimensionsExact = ($expectedImage.Width -eq $actualImage.Width -and $expectedImage.Height -eq $actualImage.Height)
}

$expectedImage.Dispose()
$actualImage.Dispose()

$result | ConvertTo-Json
