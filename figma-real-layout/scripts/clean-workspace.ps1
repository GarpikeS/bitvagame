param([switch]$Apply)

# Default: preview only. Delete only the explicitly listed generated artifacts.
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
$prefix = $root + '\'
if (-not (Test-Path -LiteralPath (Join-Path $root 'figma-real-layout\src\main.jsx'))) {
    throw 'Unexpected workspace: active application is missing.'
}

function Assert-SafePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the workspace: $full"
    }
    $cursor = $full
    while ($cursor -and $cursor.Length -ge $root.Length) {
        $item = Get-Item -LiteralPath $cursor -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Refusing to traverse a link/reparse point: $cursor"
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function Get-SafeFiles([string]$Path) {
    $full = Assert-SafePath $Path
    $item = Get-Item -LiteralPath $full -Force
    if (-not $item.PSIsContainer) { return $item }
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($full)
    while ($pending.Count -gt 0) {
        foreach ($child in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to traverse a link/reparse point: $($child.FullName)"
            }
            if ($child.PSIsContainer) { $pending.Push($child.FullName) }
            else { $child }
        }
    }
}

$candidates = [Collections.Generic.List[object]]::new()
function Add-Candidate([string]$RelativePath, [string]$Reason) {
    $path = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $path)) { return }
    $full = Assert-SafePath $path
    $files = @(Get-SafeFiles $full)
    $bytes = ($files | Measure-Object -Property Length -Sum).Sum
    $candidates.Add([PSCustomObject]@{
        Path = $RelativePath; FullPath = $full; Reason = $Reason
        Files = $files.Count; Bytes = [long]$bytes
    })
}

# Reproducible output of the active application. Source files and current
# Figma comparison captures stay intact.
Add-Candidate 'figma-real-layout\dist' 'Reproducible frontend build'
Add-Candidate 'figma-real-layout\server-dist' 'Reproducible API build'
Add-Candidate 'figma-real-layout\node_modules\.vite' 'Reproducible Vite dependency cache'
Add-Candidate 'figma-real-layout\node_modules\.vite-temp' 'Reproducible Vite dependency cache'
Add-Candidate 'figma-real-layout\qa\layout6-collection-module' 'Accidental copy of public assets'
Add-Candidate 'figma-real-layout\qa\layout6-assets-montage.png' 'Temporary asset montage'
Add-Candidate 'figma-real-layout\qa\layout6-collection-harness.html' 'Retired standalone QA harness'
Add-Candidate 'figma-real-layout\qa\layout6-collection-harness.jsx' 'Retired standalone QA harness'
foreach ($directory in @(
    'layout56', 'layout56-exact', 'layout5-game', 'layout5-extra', 'layout5-purchase', 'layout5-auth-exact',
    'layout6-collection', 'layout6-collection-exact',
    'layout6-purchase', 'layout6-purchase-exact', 'layout6-screens'
)) {
    Add-Candidate "figma-real-layout\qa\$directory" 'Reproducible QA output'
}
Add-Candidate 'figma-real-layout\reference\figma\revision-game-detail-fetch.err.log' 'Failed fetch log'
Add-Candidate 'figma-real-layout\reference\figma\revision-game-detail-fetch.out.log' 'Failed fetch log'
foreach ($file in @(
    'text-stay-artist.png', 'text-stay-title.png', 'text-stay-lyrics.png',
    'text-stay-lyrics-answers.png', 'text-recognise-artist.png',
    'text-recognise-title.png', 'text-recognise-lyrics.png',
    'text-recognise-lyrics-answers.png'
)) {
    Add-Candidate "figma-real-layout\public\generated\layout5\screens\$file" 'Obsolete opaque text export'
}
Add-Candidate 'figma-real-layout\public\generated\layout5\manifest.json' 'Duplicate generated manifest'
Add-Candidate 'figma-real-layout\public\generated\layout6\manifest.json' 'Duplicate generated manifest'
Add-Candidate 'figma-real-layout\public\figma-cpj-assets' 'Unreferenced legacy Figma assets'
Add-Candidate 'figma-real-layout\public\figma-ffk9-assets' 'Unreferenced legacy Figma assets'
Add-Candidate 'figma-real-layout\public\figma-state-assets' 'Unreferenced legacy Figma assets'
Add-Candidate 'figma-real-layout\public\generated\layout4-exact' 'Retired Layout 4 Karaoke exports'
foreach ($file in @('close.png', 'purchase-category-card.png', 'purchase-success.png')) {
    Add-Candidate "figma-real-layout\public\generated\layout4-icons\$file" 'Retired Layout 4 Karaoke icon'
}
foreach ($file in @(
    'karaoke-category-placeholder-figma.png',
    'karaoke-detail-hero-layout4-clean-20260812.png',
    'mafia-logo-mark-transparent.png'
)) {
    Add-Candidate "figma-real-layout\public\generated\$file" 'Retired legacy screen asset'
}
foreach ($file in @(
    'footer-2026.png', 'footer-success.png', 'footer.png',
    'girls-category-bar.png', 'girls-controls.png', 'girls-hero.png', 'girls-tips.png',
    'insufficient-panel.png', 'success-card.png', 'success-confetti.png',
    'success-content.png', 'success-title.png'
)) {
    Add-Candidate "figma-real-layout\public\generated\layout5-purchase\$file" 'Unreferenced intermediate Layout 5 purchase asset'
}

$obsoleteGeneratedAssets = @{
    'account-icons' = @(
        'chevron-node.png', 'divider.svg', 'edit-node.png', 'heart-node.png',
        'history-node.png', 'login-avatar-figma.svg', 'login-avatar-mask.svg',
        'purchases-node.png', 'settings-node.png', 'support-node.png'
    )
    'figma-detail' = @(
        'header-coin.png', 'how-mask.png', 'prepared-card-logo.png',
        'prepared-glasses-mask.png', 'prepared-glasses.png', 'prepared-hat.png',
        'role-card-doctor-mask.png', 'role-card-doctor.png',
        'role-card-left-symbol.png', 'role-card-mafia-symbol.png',
        'role-card-mafia.png'
    )
    'layout4-icons' = @(
        'category-free.png', 'category-price.png', 'chevron-right.png', 'coin.png',
        'collapse.png', 'heart-button.png', 'profile-edit.png',
        'question-glyph.png', 'requisite.png', 'score-crown.png',
        'score-infinity.png', 'score-laurel.png', 'score-winner-small.png',
        'score-winner.png'
    )
    '' = @(
        'auth-login-ref-432.png', 'auth-register-code-ref-432.png',
        'auth-register-ref-432.png', 'auth-register-success-ref-432.png',
        'auth-success-confetti-bg.png', 'balance-badge-coin-test.png',
        'balance-badge-coin.png', 'balance-coin.png', 'favorites-ref-500.png',
        'figma-adobe-coin-source.png', 'forms-hero-figma.png',
        'forms-icon-devichnik.png', 'forms-icon-hits.png', 'forms-ref-432.png',
        'game-detail-body-left-edge.png', 'game-detail-body-ref-540.png',
        'game-detail-body-right-edge.png', 'game-detail-hero-ref-540.png',
        'game-hero-figma-image2.png', 'game-hero-with-phone-logo.png',
        'game-photo.png', 'header-logo-figma-transparent.png',
        'header-logo-node-1547-transparent.png', 'header-logo-node-1547.png',
        'home-footer-corner.png', 'home-footer-ref-540.png', 'home-hero-bag.png',
        'home-hero-ref-540.png', 'home-left-edge.png', 'home-light-ref-540.png',
        'home-logo-panel-isolated.png', 'home-logo-panel.png',
        'home-right-edge.png', 'home-top-edge.png',
        'karaoke-detail-hero-layout4.png', 'logged-in-ref-432.png',
        'mafia-fast-icon-figma.png', 'mafia-logo-intro-figma.png',
        'mafia-logo-mark-figma.png', 'music-prep-figma-node.jpg', 'nav-logo.png',
        'phone-mafia-logo-figma.png', 'phone-screen-figma.png',
        'profile-coin-blur-left-transparent.png', 'profile-coin-left-clean.png',
        'profile-coin-top-transparent.before-clean.png',
        'profile-coin-top-transparent.png', 'profile-ref-363.png',
        'promo-coin-mcp.png', 'purchase-hero-doma-stroke.svg',
        'purchase-hero-figma.png', 'purchase-home-doma-figma.png',
        'purchases-ref-494.png', 'winner-confetti-figma.png',
        'winner-rays-figma.svg'
    )
}
foreach ($directory in $obsoleteGeneratedAssets.Keys) {
    foreach ($file in $obsoleteGeneratedAssets[$directory]) {
        $relative = if ($directory) { "$directory\$file" } else { $file }
        Add-Candidate "figma-real-layout\public\generated\$relative" 'Unreferenced intermediate asset'
    }
}

# Historical browser profiles and reproducible QA output, not design references.
$outputDirectories = @(
    'figma-dev-site\qa-site',
    'figma-dev-site\qa-devmode',
    'site\.chrome-menu-harness', 'site\.chrome-menu-qa',
    'site\edge-bgpos', 'site\edge-card-inspect', 'site\edge-cdp-390-profile',
    'site\edge-cdp-390-profile-after-cards', 'site\edge-cdp-390-profile-after-story',
    'site\edge-finalpass', 'site\edge-font-check', 'site\edge-fontpass',
    'site\edge-profile-desktop-clean', 'site\edge-profile-mobile-clean',
    'site\edge-pseudo-inspect', 'site\edge-slice-gate',
    'site\batch-diffs', 'site\batch-diffs-v2', 'site\batch-shots', 'site\batch-shots-v2',
    'site\desktop-diffs', 'site\desktop-diffs-final',
    'site\desktop-shots', 'site\desktop-shots-final',
    'site\legacy-shots', 'site\mobile-diffs-final', 'site\mobile-shots-final',
    'site\service-shots',
    'site\pixel-audit-current\tmp-birthday-pack-candidates',
    'site\pixel-audit-current\tmp-birthday-task-crops',
    'site\pixel-audit-current\tmp-birthday-task-sweep',
    'site\pixel-audit-current\tmp-birthday-task-sweep2',
    'site\pixel-audit-current\tmp-birthday-task-sweep3',
    'site\pixel-audit-current\tmp-category-payment-crops',
    'site\pixel-audit-current\tmp-karaoke-party-locked-candidates',
    'site\pixel-audit-current\tmp-karaoke-song-list-popup-candidates',
    'site\pixel-audit-current\tmp-new-category-crops',
    'site\pixel-audit-current\tuning'
)
foreach ($directory in $outputDirectories) { Add-Candidate $directory 'Generated QA output' }

# Only known screenshot filenames in the old site root; never touch assets/.
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root 'site') -File) {
    if ($file.Name -match '^(after-|baseline-|crop-|diff-|local-|menu-check-).+\.png$' -or
        $file.Name -in @('profile-dom-dump.html', 'server-4180.err.log', 'server-4180.out.log')) {
        Add-Candidate ('site\' + $file.Name) 'Historical screenshot/log'
    }
}

# Keep the latest complete frontend release AND latest API release for recovery.
$staging = Join-Path $root 'deploy-staging'
foreach ($pattern in @('partystore-deploy-*.tgz', 'partystore-api-*.tgz')) {
    $archives = @(Get-ChildItem -LiteralPath $staging -File -Filter $pattern | Sort-Object Name -Descending)
    if ($archives.Count -gt 1) {
        & tar -tf $archives[0].FullName > $null
        if ($LASTEXITCODE -ne 0) { throw 'The retained release archive failed validation.' }
        foreach ($archive in $archives | Select-Object -Skip 1) {
            Add-Candidate ('deploy-staging\' + $archive.Name) 'Superseded release archive'
        }
    }
}
Add-Candidate 'server-snapshots\partystore-before-responsive-20260723-142505Z.tgz.partial' 'Incomplete download'
Add-Candidate 'figma-dev-site\vite.log' 'Historical development log'

# Refuse cleanup while any workspace browser/server process might use its outputs.
$running = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('node.exe', 'chrome.exe', 'msedge.exe', 'python.exe') -and
    $_.CommandLine -and $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($Apply -and $running.Count -gt 0) {
    throw "Workspace processes are running; close them before cleanup. PIDs: $($running.ProcessId -join ', ')"
}

$candidates | Group-Object Reason | ForEach-Object {
    [PSCustomObject]@{
        Category = $_.Name
        Targets = $_.Count
        Files = ($_.Group | Measure-Object Files -Sum).Sum
        MiB = [math]::Round(($_.Group | Measure-Object Bytes -Sum).Sum / 1MB, 2)
    }
} | Format-Table -AutoSize
$totalBytes = [long](($candidates | Measure-Object Bytes -Sum).Sum)
$totalFiles = [long](($candidates | Measure-Object Files -Sum).Sum)
Write-Output "Targets=$($candidates.Count) Files=$totalFiles Bytes=$totalBytes Apply=$Apply"

if (-not $Apply) {
    $candidates | Select-Object Path, Reason, Files | Format-Table -AutoSize
    return
}

# Fingerprint all retained user files. Dependencies/Git are outside the cleanup scope.
$protected = @{}
$pending = [Collections.Generic.Stack[string]]::new()
$pending.Push($root)
$targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($candidate in $candidates) { [void]$targets.Add($candidate.FullPath) }
while ($pending.Count -gt 0) {
    foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
        if ($item.Name -in @('.git', 'node_modules') -or $targets.Contains($item.FullName)) { continue }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Retained path is a link/reparse point: $($item.FullName)"
        }
        if ($item.PSIsContainer) { $pending.Push($item.FullName) }
        else { $protected[$item.FullName] = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash }
    }
}

foreach ($candidate in $candidates) {
    # Revalidate immediately before each recursive delete; no computed path can escape.
    $full = Assert-SafePath $candidate.FullPath
    [void]@(Get-SafeFiles $full)
    Remove-Item -LiteralPath $full -Recurse -Force
    if (Test-Path -LiteralPath $full) { throw "Artifact still exists: $full" }
}
foreach ($path in $protected.Keys) {
    if (-not (Test-Path -LiteralPath $path) -or
        (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $protected[$path]) {
        throw "Retained file changed: $path"
    }
}
Write-Output "Cleanup complete. Removed $totalFiles files ($totalBytes bytes). Verified $($protected.Count) retained files unchanged."
