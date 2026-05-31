param(
    [string]$BackendDistPath = ("dist-package-" + (Get-Date -Format "yyyyMMdd-HHmmss")),
    [string]$OutputDir = ("release/electron-full-zip-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Set-Location $repoRoot

Write-Host "Building renderer..." -ForegroundColor Cyan
npm run build:renderer

Write-Host "Building electron main/preload..." -ForegroundColor Cyan
npm run build:electron

Write-Host "Building backend bundle/executable..." -ForegroundColor Cyan
pwsh backend/build_and_package.ps1 -SkipFrontendBuild -BackendDistPath $BackendDistPath

$backendDistRelative = "backend/" + $BackendDistPath + "/SlideForge"
$backendDist = Join-Path $repoRoot $backendDistRelative
if (-not (Test-Path $backendDist)) {
    throw "Backend dist path not found: $backendDist"
}

$bundleRoot = Join-Path $repoRoot "backend\model-bundle-ready"
if (-not (Test-Path (Join-Path $bundleRoot "ocr_models\bundle_manifest.json"))) {
    throw "Bundle manifest missing at $bundleRoot\ocr_models\bundle_manifest.json"
}

$env:SLIDEFORGE_BACKEND_DIST = $backendDistRelative
$env:SLIDEFORGE_MODEL_BUNDLE = "backend/model-bundle-ready"

try {
    Write-Host "Packaging desktop zip..." -ForegroundColor Cyan
    npx electron-builder --win zip --config electron-builder.full.yml --config.directories.output=$OutputDir
}
finally {
    Remove-Item Env:\SLIDEFORGE_BACKEND_DIST -ErrorAction SilentlyContinue
    Remove-Item Env:\SLIDEFORGE_MODEL_BUNDLE -ErrorAction SilentlyContinue
}

Write-Host "Desktop zip packaging complete. Output: $OutputDir" -ForegroundColor Green
