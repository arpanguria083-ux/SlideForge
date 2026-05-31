param(
    [string]$Version = "0.1.0",
    [string]$CertPath = "certs/slideforge-codesign.pfx",
    [string]$CertPassword = "",
    [switch]$SkipSigning
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $rootDir
$backendDir = Join-Path $rootDir "backend"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          SlideForge AI - LITE Build with OCR Package           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Version: $Version" -ForegroundColor Yellow
Write-Host "Output: LITE installer + OCR models package (separate download)" -ForegroundColor Yellow
Write-Host ""

# Verify certificate if not skipping signing
if (-not $SkipSigning) {
    if (-not (Test-Path $CertPath)) {
        Write-Host "⚠️  Certificate not found: $CertPath" -ForegroundColor Yellow
        $SkipSigning = $true
        Write-Host "✓ Skipping code signing" -ForegroundColor Green
    }
}
if (-not $SkipSigning) {
    if (-not $CertPassword) {
        Write-Host "⚠️  Certificate password required for code signing" -ForegroundColor Yellow
        $SkipSigning = $true
        Write-Host "⚠️  Skipping code signing" -ForegroundColor Yellow
    }
}

# Step 1: Clean old builds
Write-Host ""
Write-Host "Step 1: Cleaning old builds..." -ForegroundColor Cyan
# Fix permissions first so locked dirs (e.g. from a previous failed build) can be deleted
$cleanDirs = @(
    (Join-Path $rootDir "dist"),
    (Join-Path $rootDir "dist-electron"),
    (Join-Path $rootDir "release"),
    (Join-Path $backendDir "dist-package"),
    (Join-Path $backendDir "dist-package-sanitized")
)
foreach ($d in $cleanDirs) {
    if (Test-Path $d) {
        icacls $d /grant:r "$env:USERNAME`:F" /t /c /q 2>$null | Out-Null
        Remove-Item -Path $d -Recurse -Force -ErrorAction SilentlyContinue
    }
}
Get-Item -Path (Join-Path $backendDir "model-bundle*") -ErrorAction SilentlyContinue | ForEach-Object {
    icacls $_.FullName /grant:r "$env:USERNAME`:F" /t /c /q 2>$null | Out-Null
    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "✓ Cleaned" -ForegroundColor Green

# Step 2: Set code signing environment
Write-Host ""
Write-Host "Step 2: Setting up code signing..." -ForegroundColor Cyan
if (-not $SkipSigning) {
    $env:CSC_LINK = Resolve-Path $CertPath
    $env:CSC_KEY_PASSWORD = $CertPassword
    Write-Host "✓ Code signing credentials set" -ForegroundColor Green
} else {
    # Explicitly disable auto-discovery so electron-builder won't attempt to sign
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    $env:WIN_CSC_LINK = ""
    Write-Host "⊘ Skipping code signing" -ForegroundColor Yellow
}

# Step 3: Fix permissions and remove any remaining locked dirs
Write-Host ""
Write-Host "Step 3: Fixing permission issues..." -ForegroundColor Cyan
$dirsToFix = @(
    (Join-Path $backendDir "model-bundle"),
    (Join-Path $backendDir "model-bundle-ready"),
    (Join-Path $backendDir "dist-package"),
    (Join-Path $rootDir "release\electron-lite")
)
foreach ($pattern in $dirsToFix) {
    Get-Item -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
        icacls $_.FullName /grant:r "$env:USERNAME`:F" /t /c /q 2>$null | Out-Null
        # Delete after fixing permissions so electron-builder gets a clean slate
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Fix all locked uv_cache.json files in the venv (blocks uv/PyInstaller operations)
$sitePackages = Join-Path $backendDir ".venv\Lib\site-packages"
if (Test-Path $sitePackages) {
    Get-ChildItem -Path $sitePackages -Filter "uv_cache.json" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        icacls $_.DirectoryName /grant:r "$env:USERNAME`:F" /c /q 2>$null | Out-Null
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "✓ Permissions fixed" -ForegroundColor Green

# Pre-cache winCodeSign to avoid symlink privilege error.
# The winCodeSign-2.6.0.7z archive contains macOS dylib symlinks that require
# SeCreateSymbolicLinkPrivilege to extract. Only 2 files are affected; all
# Windows tools extract fine. By pre-creating the cache dir, electron-builder
# skips the download/extract step entirely on subsequent runs.
$winCodeSignVersion = "winCodeSign-2.6.0"
$winCodeSignCache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\$winCodeSignVersion"
if (-not (Test-Path "$winCodeSignCache\windows")) {
    Write-Host "  Pre-caching electron-builder signing tools..." -ForegroundColor Gray
    $tempZip = "$env:TEMP\$winCodeSignVersion.7z"
    $7zaPath = Join-Path $rootDir "node_modules\7zip-bin\win\x64\7za.exe"
    try {
        Invoke-WebRequest "https://github.com/electron-userland/electron-builder-binaries/releases/download/$winCodeSignVersion/$winCodeSignVersion.7z" -OutFile $tempZip -UseBasicParsing
        if (Test-Path $winCodeSignCache) { Remove-Item $winCodeSignCache -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -Path $winCodeSignCache -ItemType Directory -Force | Out-Null
        # Exit code may be 1 due to macOS dylib symlinks failing - that is expected and harmless
        & $7zaPath x $tempZip "-o$winCodeSignCache" -y 2>&1 | Out-Null
        if (Test-Path "$winCodeSignCache\windows") {
            Write-Host "  ✓ Signing tools cached" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Signing tools cache incomplete (build may still succeed)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  ⚠️  Signing tools pre-cache failed: $_ (build will attempt anyway)" -ForegroundColor Yellow
    } finally {
        if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }
    }
}

# Step 4: Build LITE version
Write-Host ""
Write-Host "Step 4: Building LITE installer..." -ForegroundColor Cyan
Write-Host "  • Compiling React frontend..." -ForegroundColor Gray
Write-Host "  • Compiling Electron..." -ForegroundColor Gray
Write-Host "  • Building Python backend..." -ForegroundColor Gray
Write-Host "  • Skipping OCR model bundling..." -ForegroundColor Gray
Write-Host "  • Creating NSIS installer..." -ForegroundColor Gray
if (-not $SkipSigning) {
    Write-Host "  • Code signing executables..." -ForegroundColor Gray
}

Set-Location $rootDir
npm run package:lite

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ LITE build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ LITE installer created" -ForegroundColor Green

# Step 5: Create OCR models package
Write-Host ""
Write-Host "Step 5: Creating OCR models package..." -ForegroundColor Cyan

Set-Location $backendDir

# Check if we have models to package
$bundleDir = Join-Path $backendDir "model-bundle-ready" "ocr_models"
if (-not (Test-Path $bundleDir)) {
    Write-Host "⚠️  No pre-built OCR models found" -ForegroundColor Yellow
    Write-Host "   Hint: Run 'npm run package:full' first to build models" -ForegroundColor Yellow
    Write-Host "   Or models will be downloaded on first use (LITE mode)" -ForegroundColor Yellow
} else {
    Write-Host "  • Packaging OCR models..." -ForegroundColor Gray
    uv run python scripts/create_ocr_download_package.py
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ OCR package created" -ForegroundColor Green
    } else {
        Write-Host "⚠️  OCR package creation failed (non-critical)" -ForegroundColor Yellow
    }
}

# Step 6: Summary and verification
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                      BUILD COMPLETE ✓                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""
Write-Host "📦 LITE Installer:" -ForegroundColor Yellow
Get-ChildItem (Join-Path $rootDir "release/electron-lite") -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    $signed = if (-not $SkipSigning) { "✓ Signed" } else { "⊘ Not signed" }
    Write-Host "  • $($_.Name) ($sizeMB MB) - $signed" -ForegroundColor Green
}

Write-Host ""
Write-Host "📥 OCR Models Package (Optional):" -ForegroundColor Yellow
$ocrPackages = Get-ChildItem $backendDir -Filter "SlideForge-OCR-Models-*.zip" -ErrorAction SilentlyContinue
if ($ocrPackages) {
    $ocrPackages | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  • $($_.Name) ($sizeMB MB)" -ForegroundColor Green
        Write-Host "    Location: $($_.FullName)" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⊘ Not created (models not pre-bundled)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📊 Distribution Details:" -ForegroundColor Yellow
Write-Host "  Version: $Version" -ForegroundColor Gray
Write-Host "  Type: LITE (no bundled OCR)" -ForegroundColor Gray
Write-Host "  User gets: LITE installer + optional OCR download" -ForegroundColor Gray
Write-Host "  Installer size: ~150 MB" -ForegroundColor Gray
Write-Host "  OCR package size: ~400 MB (optional)" -ForegroundColor Gray
Write-Host "  Code signing: $(if(-not $SkipSigning) { 'Enabled' } else { 'Disabled' })" -ForegroundColor Gray

Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Upload LITE installer to your distribution server" -ForegroundColor Gray
Write-Host "  2. Upload OCR package separately (optional for users)" -ForegroundColor Gray
Write-Host "  3. Share download links with users" -ForegroundColor Gray
Write-Host "  4. Users install LITE first, download OCR models as needed" -ForegroundColor Gray

Write-Host ""
Write-Host "💡 User Experience:" -ForegroundColor Cyan
Write-Host "  • Text-rich PDFs: Work immediately (no OCR needed)" -ForegroundColor Gray
Write-Host "  • Scanned PDFs: Prompt to download OCR models" -ForegroundColor Gray
Write-Host "  • Manual download: Users can get models from CLI if preferred" -ForegroundColor Gray

Write-Host ""
