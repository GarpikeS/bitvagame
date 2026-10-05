<#
.SYNOPSIS
Imports and optimizes the 2000s and 2010s karaoke media packs.

.DESCRIPTION
Reads the public Yandex Disk inventory, validates the expected 12 posters,
12 square videos, and 12 landscape videos per theme, then downloads and
converts one source file at a time. Existing valid outputs are skipped.

.PARAMETER Help
Prints usage without contacting Yandex Disk or invoking FFmpeg.

.PARAMETER ListOnly
Validates the remote inventory and prints the local mapping without
downloading or modifying media files.

.EXAMPLE
./scripts/import-karaoke-themes.ps1 -Help

.EXAMPLE
./scripts/import-karaoke-themes.ps1 -ListOnly

.EXAMPLE
./scripts/import-karaoke-themes.ps1
#>
[CmdletBinding()]
param(
    [Alias('h')]
    [switch]$Help,

    [switch]$ListOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Help) {
    @'
Import the two karaoke themes from the configured public Yandex Disk folder.

Usage:
  ./scripts/import-karaoke-themes.ps1 -Help
  ./scripts/import-karaoke-themes.ps1 -ListOnly
  ./scripts/import-karaoke-themes.ps1

Outputs:
  public/media/karaoke/2000-1/poster/01.webp ... 12.webp
  public/media/karaoke/2000-1/square/01.mp4 ... 12.mp4
  public/media/karaoke/2000-1/landscape/01.mp4 ... 12.mp4
  public/media/karaoke/2010-1/poster/01.webp ... 12.webp
  public/media/karaoke/2010-1/square/01.mp4 ... 12.mp4
  public/media/karaoke/2010-1/landscape/01.mp4 ... 12.mp4

The normal run requires ffmpeg and ffprobe. The script checks PATH first,
then the standard WinGet Links and package directories.
'@ | Write-Output
    return
}

$PublicKey = 'https://disk.yandex.ru/d/0D980fCRit0sDg'
$ResourcesEndpoint = 'https://cloud-api.yandex.net/v1/disk/public/resources'
$DownloadEndpoint = 'https://cloud-api.yandex.net/v1/disk/public/resources/download'
$ExpectedAssetCount = 12
$MaximumPosterSourceBytes = 64MB
$MaximumVideoSourceBytes = 512MB

# Keep the source ASCII-compatible for Windows PowerShell 5.1 while still
# constructing the exact Cyrillic remote paths at runtime.
$RemoteTheme2000 = [Uri]::UnescapeDataString('/00-%D0%B5')
$RemoteTheme2010 = [Uri]::UnescapeDataString('/10-%D0%B5')
$RemoteSquareName = [Uri]::UnescapeDataString('%D0%BA%D0%B2%D0%B0%D0%B4%D1%80%D0%B0%D1%82%D0%BD%D1%8B%D0%B5')
$RemoteLandscapeName = [Uri]::UnescapeDataString('%D0%B0%D0%BB%D1%8C%D0%B1%D0%BE%D0%BC%D0%BD%D1%8B%D0%B5')

function New-QueryUri {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [Parameter(Mandatory = $true)][hashtable]$Query
    )

    $parts = foreach ($entry in $Query.GetEnumerator()) {
        '{0}={1}' -f (
            [Uri]::EscapeDataString([string]$entry.Key),
            [Uri]::EscapeDataString([string]$entry.Value)
        )
    }
    return $Endpoint + '?' + ($parts -join '&')
}

function Join-RemotePath {
    param(
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Child
    )

    return $Parent.TrimEnd('/') + '/' + $Child
}

function Get-PublicDirectoryItems {
    param([Parameter(Mandatory = $true)][string]$RemotePath)

    $fields = @(
        '_embedded.total',
        '_embedded.items.name',
        '_embedded.items.path',
        '_embedded.items.type',
        '_embedded.items.size',
        '_embedded.items.mime_type',
        '_embedded.items.media_type',
        '_embedded.items.sha256'
    ) -join ','

    $uri = New-QueryUri -Endpoint $ResourcesEndpoint -Query @{
        public_key = $PublicKey
        path = $RemotePath
        limit = 1000
        fields = $fields
    }

    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Accept = 'application/json' } -TimeoutSec 60
    if ($null -eq $response -or $null -eq $response.PSObject.Properties['_embedded']) {
        throw "Yandex Disk returned no directory listing for '$RemotePath'."
    }

    $items = @($response._embedded.items)
    $total = [int]$response._embedded.total
    if ($total -ne $items.Count) {
        throw "Incomplete directory listing for '$RemotePath': API total=$total, received=$($items.Count)."
    }

    return $items
}

function Assert-DirectRemoteChild {
    param(
        [Parameter(Mandatory = $true)][object]$Item,
        [Parameter(Mandatory = $true)][string]$RemoteFolder
    )

    foreach ($property in @('name', 'path', 'type')) {
        if ($null -eq $Item.PSObject.Properties[$property]) {
            throw "Remote item in '$RemoteFolder' is missing '$property'."
        }
    }

    $name = [string]$Item.name
    if ([string]::IsNullOrWhiteSpace($name) -or $name -match '[\\/\x00-\x1f]') {
        throw "Unsafe remote item name in '$RemoteFolder'."
    }

    $expectedPath = Join-RemotePath -Parent $RemoteFolder -Child $name
    if (-not [string]::Equals([string]$Item.path, $expectedPath, [StringComparison]::Ordinal)) {
        throw "Remote item is not a direct child of '$RemoteFolder': '$($Item.path)'."
    }
}

function Assert-ThemeRootLayout {
    param(
        [Parameter(Mandatory = $true)][object[]]$Items,
        [Parameter(Mandatory = $true)][string]$RemoteFolder
    )

    if ($Items.Count -ne ($ExpectedAssetCount + 2)) {
        throw "Unexpected root inventory in '$RemoteFolder': expected 14 direct children, found $($Items.Count)."
    }

    $directories = @($Items | Where-Object { $_.type -eq 'dir' })
    if ($directories.Count -ne 2) {
        throw "Expected exactly two media directories in '$RemoteFolder', found $($directories.Count)."
    }

    foreach ($directory in $directories) {
        Assert-DirectRemoteChild -Item $directory -RemoteFolder $RemoteFolder
    }

    foreach ($expectedName in @($RemoteSquareName, $RemoteLandscapeName)) {
        $match = @($directories | Where-Object {
            [string]::Equals([string]$_.name, $expectedName, [StringComparison]::Ordinal)
        })
        if ($match.Count -ne 1) {
            throw "Expected directory '$expectedName' exactly once in '$RemoteFolder'."
        }
    }
}

function Assert-OnlyFiles {
    param(
        [Parameter(Mandatory = $true)][object[]]$Items,
        [Parameter(Mandatory = $true)][string]$RemoteFolder
    )

    $nonFiles = @($Items | Where-Object { $_.type -ne 'file' })
    if ($nonFiles.Count -gt 0) {
        throw "Unexpected non-file item in '$RemoteFolder': '$($nonFiles[0].name)'."
    }
}

function Get-ValidatedAssetSet {
    param(
        [Parameter(Mandatory = $true)][object[]]$Items,
        [Parameter(Mandatory = $true)][string]$RemoteFolder,
        [Parameter(Mandatory = $true)][string]$NamePattern,
        [Parameter(Mandatory = $true)][string]$MimeType,
        [Parameter(Mandatory = $true)][string]$MediaType,
        [Parameter(Mandatory = $true)][long]$MaximumBytes
    )

    $files = @($Items | Where-Object { $_.type -eq 'file' })
    if ($files.Count -ne $ExpectedAssetCount) {
        throw "Expected $ExpectedAssetCount files in '$RemoteFolder', found $($files.Count)."
    }

    $seen = @{}
    $validated = foreach ($item in $files) {
        Assert-DirectRemoteChild -Item $item -RemoteFolder $RemoteFolder
        foreach ($property in @('size', 'mime_type', 'media_type', 'sha256')) {
            if ($null -eq $item.PSObject.Properties[$property]) {
                throw "Remote file '$($item.name)' is missing '$property'."
            }
        }

        $name = [string]$item.name
        $nameMatch = [regex]::Match($name, $NamePattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (-not $nameMatch.Success) {
            throw "Unexpected filename in '$RemoteFolder': '$name'."
        }

        $number = [int]$nameMatch.Groups['number'].Value
        if ($number -lt 1 -or $number -gt $ExpectedAssetCount -or $seen.ContainsKey($number)) {
            throw "Invalid or duplicate numeric prefix '$number' in '$RemoteFolder'."
        }
        $seen[$number] = $true

        if (-not [string]::Equals([string]$item.mime_type, $MimeType, [StringComparison]::OrdinalIgnoreCase) -or
            -not [string]::Equals([string]$item.media_type, $MediaType, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected media type for '$($item.path)': '$($item.mime_type)' / '$($item.media_type)'."
        }

        $size = [long]$item.size
        if ($size -le 0 -or $size -gt $MaximumBytes) {
            throw "Unsafe source size for '$($item.path)': $size bytes."
        }
        $sha256 = [string]$item.sha256
        if ($sha256 -notmatch '^[0-9a-fA-F]{64}$') {
            throw "Missing or invalid SHA-256 for '$($item.path)'."
        }

        [PSCustomObject]@{
            Number = $number
            SourceName = $name
            Label = if ($nameMatch.Groups['label'].Success) { $nameMatch.Groups['label'].Value } else { $null }
            RemotePath = Join-RemotePath -Parent $RemoteFolder -Child $name
            ExpectedBytes = $size
            Sha256 = $sha256.ToUpperInvariant()
        }
    }

    $validated = @($validated | Sort-Object Number)
    for ($index = 0; $index -lt $ExpectedAssetCount; $index++) {
        if ($validated[$index].Number -ne ($index + 1)) {
            throw "Numeric sequence in '$RemoteFolder' must be exactly 1 through $ExpectedAssetCount."
        }
    }

    return $validated
}

function Assert-MatchingVideoLabels {
    param(
        [Parameter(Mandatory = $true)][object[]]$SquareVideos,
        [Parameter(Mandatory = $true)][object[]]$LandscapeVideos,
        [Parameter(Mandatory = $true)][string]$Theme
    )

    for ($index = 0; $index -lt $ExpectedAssetCount; $index++) {
        $square = $SquareVideos[$index]
        $landscape = $LandscapeVideos[$index]
        if ($square.Number -ne $landscape.Number -or
            [string]::IsNullOrWhiteSpace([string]$square.Label) -or
            -not [string]::Equals([string]$square.Label, [string]$landscape.Label, [StringComparison]::Ordinal)) {
            throw "Square and landscape labels differ for item $($index + 1) in '$Theme'."
        }
    }
}

function Get-SafePathUnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    if ([IO.Path]::IsPathRooted($RelativePath)) {
        throw "Expected a relative local path, received '$RelativePath'."
    }

    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $RelativePath))
    $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Local path escapes the project root: '$full'."
    }

    return $full
}

function Assert-NoReparsePoint {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $cursor = [IO.Path]::GetFullPath($Path)
    $prefix = $rootFull + [IO.Path]::DirectorySeparatorChar
    if (-not [string]::Equals($cursor, $rootFull, [StringComparison]::OrdinalIgnoreCase) -and
        -not $cursor.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the project root: '$cursor'."
    }
    while ($cursor.Length -ge $rootFull.Length) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Refusing to traverse a reparse point: '$cursor'."
            }
        }
        if ([string]::Equals($cursor, $rootFull, [StringComparison]::OrdinalIgnoreCase)) {
            break
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ([string]::IsNullOrEmpty($parent) -or [string]::Equals($parent, $cursor, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Could not prove local path containment for '$Path'."
        }
        $cursor = $parent
    }
}

function New-SafeDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    Assert-NoReparsePoint -Path $Path -Root $Root
    if (-not (Test-Path -LiteralPath $Path)) {
        [void][IO.Directory]::CreateDirectory($Path)
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "Expected a directory at '$Path'."
    }
    Assert-NoReparsePoint -Path $Path -Root $Root
}

function Find-WinGetExecutable {
    param([Parameter(Mandatory = $true)][string]$ExecutableName)

    if ([string]::IsNullOrEmpty($env:LOCALAPPDATA)) {
        return $null
    }

    $link = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\$ExecutableName"
    if (Test-Path -LiteralPath $link -PathType Leaf) {
        return [IO.Path]::GetFullPath($link)
    }

    $packagesRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (-not (Test-Path -LiteralPath $packagesRoot -PathType Container)) {
        return $null
    }

    $packageDirectories = @(Get-ChildItem -LiteralPath $packagesRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like 'Gyan.FFmpeg*' -or $_.Name -like 'BtbN.FFmpeg*' } |
        Sort-Object LastWriteTimeUtc -Descending)

    foreach ($packageDirectory in $packageDirectories) {
        $candidate = Get-ChildItem -LiteralPath $packageDirectory.FullName -Filter $ExecutableName -File -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($null -ne $candidate) {
            return $candidate.FullName
        }
    }

    return $null
}

function Find-Executable {
    param([Parameter(Mandatory = $true)][string]$ExecutableName)

    $command = Get-Command $ExecutableName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $command) {
        return $command.Source
    }

    return Find-WinGetExecutable -ExecutableName $ExecutableName
}

function Get-MediaTools {
    $ffmpeg = Find-Executable -ExecutableName 'ffmpeg.exe'
    if ([string]::IsNullOrEmpty($ffmpeg)) {
        throw 'ffmpeg.exe was not found in PATH or the standard WinGet directories. Install with: winget install --id Gyan.FFmpeg --exact --source winget'
    }

    $ffprobe = Join-Path ([IO.Path]::GetDirectoryName($ffmpeg)) 'ffprobe.exe'
    if (-not (Test-Path -LiteralPath $ffprobe -PathType Leaf)) {
        $ffprobe = Find-Executable -ExecutableName 'ffprobe.exe'
    }
    if ([string]::IsNullOrEmpty($ffprobe) -or -not (Test-Path -LiteralPath $ffprobe -PathType Leaf)) {
        throw 'ffprobe.exe was not found beside ffmpeg.exe, in PATH, or in the standard WinGet directories.'
    }

    $versionOutput = @(& $ffmpeg -hide_banner -version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg failed its version check: $($versionOutput -join ' ')"
    }

    $encoderOutput = @(& $ffmpeg -hide_banner -encoders 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw 'ffmpeg failed to list its encoders.'
    }
    $encoders = $encoderOutput -join "`n"
    foreach ($encoder in @('libwebp', 'libx264', 'aac')) {
        if ($encoders -notmatch ("(?m)^\s*[VA]\S*\s+" + [regex]::Escape($encoder) + "\s")) {
            throw "The FFmpeg build does not provide the required '$encoder' encoder."
        }
    }

    $probeOutput = @(& $ffprobe -v error -version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "ffprobe failed its version check: $($probeOutput -join ' ')"
    }

    return [PSCustomObject]@{ Ffmpeg = $ffmpeg; Ffprobe = $ffprobe }
}

function Get-DownloadHref {
    param([Parameter(Mandatory = $true)][string]$RemotePath)

    $uri = New-QueryUri -Endpoint $DownloadEndpoint -Query @{
        public_key = $PublicKey
        path = $RemotePath
    }
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Accept = 'application/json' } -TimeoutSec 60
    if ($null -eq $response -or $null -eq $response.PSObject.Properties['href']) {
        throw "Yandex Disk returned no download URL for '$RemotePath'."
    }

    $href = $null
    if (-not [Uri]::TryCreate([string]$response.href, [UriKind]::Absolute, [ref]$href) -or
        $href.Scheme -ne 'https' -or
        -not [string]::Equals($href.Host, 'downloader.disk.yandex.ru', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Yandex Disk returned an unexpected download host for '$RemotePath'."
    }

    return $href.AbsoluteUri
}

function Remove-ExactLeafFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedParent
    )

    $full = [IO.Path]::GetFullPath($Path)
    $parent = [IO.Path]::GetFullPath([IO.Path]::GetDirectoryName($full)).TrimEnd('\', '/')
    $expected = [IO.Path]::GetFullPath($ExpectedParent).TrimEnd('\', '/')
    if (-not [string]::Equals($parent, $expected, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a file outside its exact expected directory: '$full'."
    }
    if (Test-Path -LiteralPath $full) {
        $item = Get-Item -LiteralPath $full -Force
        if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
            throw "Refusing to remove a directory or reparse point: '$full'."
        }
        Remove-Item -LiteralPath $full -Force
    }
}

function New-HttpClient {
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $true
    $client = [Net.Http.HttpClient]::new($handler, $true)
    $client.Timeout = [TimeSpan]::FromHours(2)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('karaoke-media-import/1.0')
    return $client
}

function Save-HttpFile {
    param(
        [Parameter(Mandatory = $true)][Net.Http.HttpClient]$Client,
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][long]$ExpectedBytes,
        [Parameter(Mandatory = $true)][long]$MaximumBytes,
        [Parameter(Mandatory = $true)][string]$Status
    )

    if (Test-Path -LiteralPath $Destination) {
        throw "Temporary destination already exists: '$Destination'."
    }

    $response = $null
    $inputStream = $null
    $outputStream = $null
    try {
        $response = $Client.GetAsync($Uri, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "Download failed with HTTP $([int]$response.StatusCode) ($($response.ReasonPhrase))."
        }

        $contentLength = $response.Content.Headers.ContentLength
        if ($null -ne $contentLength -and ([long]$contentLength -ne $ExpectedBytes -or [long]$contentLength -gt $MaximumBytes)) {
            throw "Unexpected Content-Length: $contentLength bytes; expected $ExpectedBytes."
        }

        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $buffer = New-Object byte[] (1MB)
        [long]$downloaded = 0
        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $outputStream.Write($buffer, 0, $read)
            $downloaded += $read
            if ($downloaded -gt $MaximumBytes -or $downloaded -gt $ExpectedBytes) {
                throw "Download exceeded the validated source size for '$Status'."
            }
            $percent = [math]::Min(100, [int](($downloaded * 100) / $ExpectedBytes))
            Write-Progress -Id 2 -ParentId 1 -Activity 'Downloading current source' -Status $Status -PercentComplete $percent
        }
        $outputStream.Flush()
        if ($downloaded -ne $ExpectedBytes) {
            throw "Downloaded $downloaded bytes for '$Status'; expected $ExpectedBytes."
        }
    }
    finally {
        Write-Progress -Id 2 -Activity 'Downloading current source' -Completed
        if ($null -ne $outputStream) { $outputStream.Dispose() }
        if ($null -ne $inputStream) { $inputStream.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
}

function Invoke-FFprobe {
    param(
        [Parameter(Mandatory = $true)][string]$FfprobePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    try {
        $output = @(& $FfprobePath -v error -show_entries 'format=format_name,duration:stream=codec_type,codec_name,width,height' -of json $Path 2>$null)
        if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) {
            return $null
        }
        return ($output -join "`n") | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Read-BigEndianUnsignedInteger {
    param(
        [Parameter(Mandatory = $true)][IO.BinaryReader]$Reader,
        [Parameter(Mandatory = $true)][int]$ByteCount
    )

    $bytes = $Reader.ReadBytes($ByteCount)
    if ($bytes.Count -ne $ByteCount) {
        throw 'Unexpected end of MP4 atom header.'
    }
    [uint64]$value = 0
    foreach ($byte in $bytes) {
        $value = ($value * 256) + [uint64]$byte
    }
    return $value
}

function Test-Mp4FastStart {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = $null
    $reader = $null
    try {
        $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        $reader = [IO.BinaryReader]::new($stream, [Text.Encoding]::ASCII, $true)
        $moovPosition = $null
        $mdatPosition = $null
        $atomCount = 0

        while ($stream.Position -lt $stream.Length -and $atomCount -lt 256) {
            [long]$atomStart = $stream.Position
            [uint64]$size = Read-BigEndianUnsignedInteger -Reader $reader -ByteCount 4
            $typeBytes = $reader.ReadBytes(4)
            if ($typeBytes.Count -ne 4) { return $false }
            $type = [Text.Encoding]::ASCII.GetString($typeBytes)
            [uint64]$headerSize = 8

            if ($size -eq 1) {
                $size = Read-BigEndianUnsignedInteger -Reader $reader -ByteCount 8
                $headerSize = 16
            }
            elseif ($size -eq 0) {
                $size = [uint64]($stream.Length - $atomStart)
            }

            if ($size -lt $headerSize -or $size -gt [uint64]($stream.Length - $atomStart)) {
                return $false
            }
            if ($type -eq 'moov' -and $null -eq $moovPosition) { $moovPosition = $atomStart }
            if ($type -eq 'mdat' -and $null -eq $mdatPosition) { $mdatPosition = $atomStart }
            if ($null -ne $moovPosition -and $null -ne $mdatPosition) { break }

            $stream.Position = $atomStart + [long]$size
            $atomCount++
        }

        return $null -ne $moovPosition -and $null -ne $mdatPosition -and $moovPosition -lt $mdatPosition
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $stream) { $stream.Dispose() }
    }
}

function Test-ReadyPoster {
    param(
        [Parameter(Mandatory = $true)][string]$FfprobePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    try {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -lt 128) {
            return $false
        }
        $probe = Invoke-FFprobe -FfprobePath $FfprobePath -Path $Path
        if ($null -eq $probe -or $null -eq $probe.PSObject.Properties['streams']) { return $false }
        $videoStreams = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })
        return $videoStreams.Count -eq 1 -and
            $videoStreams[0].codec_name -eq 'webp' -and
            [int]$videoStreams[0].width -gt 0 -and
            [int]$videoStreams[0].height -gt 0
    }
    catch {
        return $false
    }
}

function Test-ReadyVideo {
    param(
        [Parameter(Mandatory = $true)][string]$FfprobePath,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('square', 'landscape')][string]$Kind
    )

    try {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -lt 1024) {
            return $false
        }
        $probe = Invoke-FFprobe -FfprobePath $FfprobePath -Path $Path
        if ($null -eq $probe -or $null -eq $probe.PSObject.Properties['streams'] -or
            $null -eq $probe.PSObject.Properties['format']) {
            return $false
        }
        $videoStreams = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })
        $audioStreams = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' })
        if ($videoStreams.Count -ne 1 -or $audioStreams.Count -ne 1 -or
            $videoStreams[0].codec_name -ne 'h264' -or $audioStreams[0].codec_name -ne 'aac') {
            return $false
        }

        $width = [int]$videoStreams[0].width
        $height = [int]$videoStreams[0].height
        $dimensionsValid = if ($Kind -eq 'square') {
            $width -gt 0 -and $height -gt 0 -and $width -eq $height -and $width -le 720
        }
        else {
            $width -eq 1280 -and $height -eq 720
        }

        $formatNames = [string]$probe.format.format_name
        $duration = 0.0
        $durationValid = [double]::TryParse(
            [string]$probe.format.duration,
            [Globalization.NumberStyles]::Float,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$duration
        ) -and $duration -gt 0

        return $dimensionsValid -and $durationValid -and $formatNames -match '(^|,)mp4(,|$)' -and (Test-Mp4FastStart -Path $Path)
    }
    catch {
        return $false
    }
}

function Invoke-MediaConversion {
    param(
        [Parameter(Mandatory = $true)][string]$FfmpegPath,
        [Parameter(Mandatory = $true)][string]$Kind,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $common = @('-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', $Source, '-map_metadata', '-1')
    if ($Kind -eq 'poster') {
        $arguments = $common + @(
            '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
            '-c:v', 'libwebp', '-preset', 'picture', '-quality', '86',
            $Destination
        )
    }
    else {
        $videoFilter = if ($Kind -eq 'square') {
            'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1'
        }
        else {
            'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1'
        }
        $arguments = $common + @(
            '-map', '0:v:0', '-map', '0:a:0', '-sn', '-dn',
            '-vf', $videoFilter,
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.0', '-tag:v', 'avc1',
            '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
            '-map_chapters', '-1', '-movflags', '+faststart', '-max_muxing_queue_size', '2048',
            $Destination
        )
    }

    & $FfmpegPath @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg failed for '$Source' with exit code $LASTEXITCODE."
    }
}

function New-PartialOutputPath {
    param([Parameter(Mandatory = $true)][string]$Destination)

    $directory = [IO.Path]::GetDirectoryName($Destination)
    $stem = [IO.Path]::GetFileNameWithoutExtension($Destination)
    $extension = [IO.Path]::GetExtension($Destination)
    return Join-Path $directory ($stem + '.partial-' + [guid]::NewGuid().ToString('N') + $extension)
}

function Publish-ConvertedFile {
    param(
        [Parameter(Mandatory = $true)][string]$PartialPath,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $PartialPath -PathType Leaf)) {
        throw "Converted staging file is missing: '$PartialPath'."
    }
    $partialItem = Get-Item -LiteralPath $PartialPath -Force
    if (($partialItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Converted staging file is a reparse point: '$PartialPath'."
    }
    if (Test-Path -LiteralPath $Destination -PathType Container) {
        throw "Destination is a directory: '$Destination'."
    }
    if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        $destinationItem = Get-Item -LiteralPath $Destination -Force
        if (($destinationItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Destination is a reparse point: '$Destination'."
        }
    }
    if ([IO.File]::Exists($Destination)) {
        [IO.File]::Replace($PartialPath, $Destination, $null, $true)
    }
    else {
        [IO.File]::Move($PartialPath, $Destination)
    }
}

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $projectRoot 'src\main.jsx') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $projectRoot 'src\games\layout7\data.js') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $projectRoot 'public') -PathType Container)) {
    throw "Unexpected project root: '$projectRoot'."
}

$themes = @(
    [PSCustomObject]@{ Remote = $RemoteTheme2000; Local = '2000-1'; Order = 1 },
    [PSCustomObject]@{ Remote = $RemoteTheme2010; Local = '2010-1'; Order = 2 }
)
$plan = [Collections.Generic.List[object]]::new()

for ($themeIndex = 0; $themeIndex -lt $themes.Count; $themeIndex++) {
    $theme = $themes[$themeIndex]
    Write-Progress -Id 1 -Activity 'Validating Yandex Disk inventory' -Status $theme.Local -PercentComplete ([int](($themeIndex * 100) / $themes.Count))

    $rootItems = @(Get-PublicDirectoryItems -RemotePath $theme.Remote)
    Assert-ThemeRootLayout -Items $rootItems -RemoteFolder $theme.Remote
    $posters = @(Get-ValidatedAssetSet -Items $rootItems -RemoteFolder $theme.Remote `
        -NamePattern '^(?<number>[0-9]+)\.png$' -MimeType 'image/png' -MediaType 'image' `
        -MaximumBytes $MaximumPosterSourceBytes)

    $squareRemote = Join-RemotePath -Parent $theme.Remote -Child $RemoteSquareName
    $squareItems = @(Get-PublicDirectoryItems -RemotePath $squareRemote)
    Assert-OnlyFiles -Items $squareItems -RemoteFolder $squareRemote
    $squareVideos = @(Get-ValidatedAssetSet -Items $squareItems -RemoteFolder $squareRemote `
        -NamePattern '^(?<number>[0-9]+)\s+(?<label>.+)\.mp4$' -MimeType 'video/mp4' -MediaType 'video' `
        -MaximumBytes $MaximumVideoSourceBytes)

    $landscapeRemote = Join-RemotePath -Parent $theme.Remote -Child $RemoteLandscapeName
    $landscapeItems = @(Get-PublicDirectoryItems -RemotePath $landscapeRemote)
    Assert-OnlyFiles -Items $landscapeItems -RemoteFolder $landscapeRemote
    $landscapeVideos = @(Get-ValidatedAssetSet -Items $landscapeItems -RemoteFolder $landscapeRemote `
        -NamePattern '^(?<number>[0-9]+)\s+(?<label>.+)\.mp4$' -MimeType 'video/mp4' -MediaType 'video' `
        -MaximumBytes $MaximumVideoSourceBytes)
    Assert-MatchingVideoLabels -SquareVideos $squareVideos -LandscapeVideos $landscapeVideos -Theme $theme.Remote

    foreach ($definition in @(
        [PSCustomObject]@{ Kind = 'poster'; Assets = $posters; SourceExtension = '.png'; DestinationExtension = '.webp'; KindOrder = 1 },
        [PSCustomObject]@{ Kind = 'square'; Assets = $squareVideos; SourceExtension = '.mp4'; DestinationExtension = '.mp4'; KindOrder = 2 },
        [PSCustomObject]@{ Kind = 'landscape'; Assets = $landscapeVideos; SourceExtension = '.mp4'; DestinationExtension = '.mp4'; KindOrder = 3 }
    )) {
        foreach ($asset in $definition.Assets) {
            $fileName = $asset.Number.ToString('00', [Globalization.CultureInfo]::InvariantCulture) + $definition.DestinationExtension
            $relativePath = Join-Path (Join-Path (Join-Path 'public\media\karaoke' $theme.Local) $definition.Kind) $fileName
            $plan.Add([PSCustomObject]@{
                ThemeOrder = $theme.Order
                KindOrder = $definition.KindOrder
                Theme = $theme.Local
                Kind = $definition.Kind
                Number = $asset.Number
                SourceName = $asset.SourceName
                RemotePath = $asset.RemotePath
                ExpectedBytes = $asset.ExpectedBytes
                SourceSha256 = $asset.Sha256
                MaximumBytes = if ($definition.Kind -eq 'poster') { $MaximumPosterSourceBytes } else { $MaximumVideoSourceBytes }
                SourceExtension = $definition.SourceExtension
                DestinationRelative = $relativePath
            })
        }
    }
}
Write-Progress -Id 1 -Activity 'Validating Yandex Disk inventory' -Completed

$plan = @($plan | Sort-Object ThemeOrder, KindOrder, Number)
if ($plan.Count -ne 72) {
    throw "Expected an import plan of 72 files, found $($plan.Count)."
}

if ($ListOnly) {
    $plan | Select-Object Theme, Kind, Number, SourceName, @{ Name = 'Destination'; Expression = { $_.DestinationRelative -replace '\\', '/' } } |
        Format-Table -AutoSize
    Write-Output 'Inventory valid: 2 themes x (12 posters + 12 square videos + 12 landscape videos). No files changed.'
    return
}

$tools = Get-MediaTools
Write-Output "Using ffmpeg: $($tools.Ffmpeg)"
Write-Output "Using ffprobe: $($tools.Ffprobe)"

$outputDirectories = @($plan | ForEach-Object {
    $destination = Get-SafePathUnderRoot -Root $projectRoot -RelativePath $_.DestinationRelative
    [IO.Path]::GetDirectoryName($destination)
} | Sort-Object -Unique)
foreach ($directory in $outputDirectories) {
    New-SafeDirectory -Path $directory -Root $projectRoot
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('karaoke-import-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($tempRoot)
$httpClient = $null

try {
    $httpClient = New-HttpClient
    for ($index = 0; $index -lt $plan.Count; $index++) {
        $entry = $plan[$index]
        $ordinal = $index + 1
        $label = '{0}/{1} {2}/{3} {4}' -f $ordinal, $plan.Count, $entry.Theme, $entry.Kind, $entry.Number.ToString('00')
        Write-Progress -Id 1 -Activity 'Importing karaoke media' -Status $label -PercentComplete ([int](($index * 100) / $plan.Count))

        $destination = Get-SafePathUnderRoot -Root $projectRoot -RelativePath $entry.DestinationRelative
        Assert-NoReparsePoint -Path $destination -Root $projectRoot
        $ready = if ($entry.Kind -eq 'poster') {
            Test-ReadyPoster -FfprobePath $tools.Ffprobe -Path $destination
        }
        else {
            Test-ReadyVideo -FfprobePath $tools.Ffprobe -Path $destination -Kind $entry.Kind
        }
        if ($ready) {
            Write-Output "[$label] skip: valid output already exists."
            continue
        }

        if (Test-Path -LiteralPath $destination) {
            Write-Output "[$label] rebuild: existing output is invalid."
        }
        else {
            Write-Output "[$label] import: $($entry.SourceName)"
        }

        $tempFile = Join-Path $tempRoot ('source-' + [guid]::NewGuid().ToString('N') + $entry.SourceExtension)
        $partialFile = New-PartialOutputPath -Destination $destination
        try {
            $href = Get-DownloadHref -RemotePath $entry.RemotePath
            Save-HttpFile -Client $httpClient -Uri $href -Destination $tempFile `
                -ExpectedBytes $entry.ExpectedBytes -MaximumBytes $entry.MaximumBytes -Status $label
            $downloadHash = (Get-FileHash -LiteralPath $tempFile -Algorithm SHA256).Hash
            if (-not [string]::Equals($downloadHash, $entry.SourceSha256, [StringComparison]::OrdinalIgnoreCase)) {
                throw "SHA-256 mismatch for '$($entry.RemotePath)'."
            }

            Write-Output "[$label] converting to $($entry.DestinationRelative -replace '\\', '/')."
            Invoke-MediaConversion -FfmpegPath $tools.Ffmpeg -Kind $entry.Kind -Source $tempFile -Destination $partialFile

            $partialValid = if ($entry.Kind -eq 'poster') {
                Test-ReadyPoster -FfprobePath $tools.Ffprobe -Path $partialFile
            }
            else {
                Test-ReadyVideo -FfprobePath $tools.Ffprobe -Path $partialFile -Kind $entry.Kind
            }
            if (-not $partialValid) {
                throw "Converted output failed validation for '$($entry.DestinationRelative)'."
            }

            Assert-NoReparsePoint -Path $destination -Root $projectRoot
            Publish-ConvertedFile -PartialPath $partialFile -Destination $destination
            Write-Output "[$label] done."
        }
        finally {
            try {
                Remove-ExactLeafFile -Path $tempFile -ExpectedParent $tempRoot
            }
            finally {
                Remove-ExactLeafFile -Path $partialFile -ExpectedParent ([IO.Path]::GetDirectoryName($destination))
            }
        }
    }

    Write-Progress -Id 1 -Activity 'Importing karaoke media' -Completed
    Write-Output "Import complete: $($plan.Count) validated destinations."
}
finally {
    Write-Progress -Id 1 -Activity 'Importing karaoke media' -Completed
    if ($null -ne $httpClient) { $httpClient.Dispose() }

    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        $remaining = @(Get-ChildItem -LiteralPath $tempRoot -Force)
        if ($remaining.Count -eq 0) {
            Remove-Item -LiteralPath $tempRoot -Force
        }
        else {
            Write-Warning "Temporary directory retained because it is not empty: '$tempRoot'."
        }
    }
}
