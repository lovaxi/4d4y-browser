# 4d4y-browser one-click installer for DSH.
# Usage:  powershell -ExecutionPolicy Bypass -File install.ps1
#   or:   ./install.ps1 -RepoUrl https://github.com/lovaxi/4d4y-browser.git
# Steps: clone the plugin into <DSH_HOME>/profiles/node_modules, register the
#        row in cordis.patch.yml (idempotent), then restart dsh.
param(
    [string]$RepoUrl = 'https://github.com/lovaxi/4d4y-browser.git',
    [string]$PluginId = '4d4y-browser'
)

$ErrorActionPreference = 'Stop'

# ---- locate DSH_HOME ----
$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $HOME '.dsh' }
if (-not (Test-Path $dshHome)) {
    Write-Host "DSH home not found: $dshHome" -ForegroundColor Red
    exit 1
}
Write-Host "DSH home: $dshHome"

$profilesNodeModules = Join-Path $dshHome 'profiles\node_modules'
New-Item -ItemType Directory -Force -Path $profilesNodeModules | Out-Null
$target = Join-Path $profilesNodeModules $PluginId

# ---- fetch / update the plugin source ----
if (Test-Path (Join-Path $target '.git')) {
    Write-Host "Plugin already present, updating via git pull..." -ForegroundColor Cyan
    Push-Location $target
    git pull
    Pop-Location
}
elseif (Test-Path $target) {
    Write-Host "Plugin directory exists without .git, removing and re-cloning..." -ForegroundColor Yellow
    Remove-Item $target -Recurse -Force
    git clone --depth 1 $RepoUrl $target
}
else {
    Write-Host "Cloning $RepoUrl ..." -ForegroundColor Cyan
    git clone --depth 1 $RepoUrl $target
}
if (-not (Test-Path (Join-Path $target 'package.json'))) {
    Write-Host "Clone failed: package.json not found in $target" -ForegroundColor Red
    exit 1
}
Write-Host "Plugin source ready: $target"

# ---- register the row in cordis.patch.yml (idempotent) ----
$patch = Join-Path $dshHome 'profiles\web\cordis.patch.yml'
if (-not (Test-Path $patch)) {
    Write-Host "cordis.patch.yml not found at $patch" -ForegroundColor Red
    exit 1
}
$content = Get-Content $patch -Raw
if ($content -match [regex]::Escape("id: $PluginId")) {
    Write-Host "Plugin row already registered in cordis.patch.yml" -ForegroundColor Green
}
else {
    Write-Host "Registering plugin row in cordis.patch.yml ..." -ForegroundColor Cyan
    # Append the row after the first "- insert:" list item (indent 4 spaces).
    $pattern = "(?m)(^[ ]{4}- id: .*$)"
    if ($content -match $pattern) {
        $content = [regex]::Replace($content, $pattern, "`$1`n    - id: $PluginId`n      name: $PluginId", 1)
    }
    else {
        # No insert block: append one
        $content = $content.TrimEnd() + "`n- insert:`n    - id: $PluginId`n      name: $PluginId`n"
    }
    Set-Content -Path $patch -Value $content -NoNewline -Encoding UTF8
    Write-Host "Registered: - id: $PluginId" -ForegroundColor Green
}

# ---- done ----
Write-Host ""
Write-Host "============================================================"
Write-Host " 4D4Y browser plugin installed."
Write-Host " Restart dsh, then click the '4D4Y' button at the sidebar"
Write-Host " bottom to open the browser panel. Log in with your own"
Write-Host " 4D4Y account."
Write-Host "============================================================"
