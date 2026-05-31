param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $rootDir
$releaseDir = Join-Path $rootDir "release\electron-lite"
$backendDir = Join-Path $rootDir "backend\dist-package\SlideForge"
$unpackedDir = Join-Path $releaseDir "win-unpacked"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        SlideForge LITE - Manual Portable Packaging             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if Electron is built
if (-not (Test-Path $unpackedDir)) {
    Write-Host "❌ Electron app not built. Run: npm run package:lite:release" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendDir)) {
    Write-Host "❌ Backend executable not built" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Found Electron app in: $unpackedDir" -ForegroundColor Green
Write-Host "✓ Found Backend in: $backendDir" -ForegroundColor Green
Write-Host ""

# Create output structure
$portableDir = Join-Path $releaseDir "portable-app"
if (Test-Path $portableDir) {
    # Try to remove with retries, fallback to rename
    for ($i = 0; $i -lt 3; $i++) {
        try {
            Remove-Item $portableDir -Recurse -Force -ErrorAction Stop
            break
        } catch {
            if ($i -lt 2) {
                Write-Host "  ⏳ Waiting for file locks to release..." -ForegroundColor Yellow
                Start-Sleep -Milliseconds 500
            } else {
                # Fallback: rename the directory and create new one
                $oldName = "$portableDir-old-$(Get-Random)"
                Write-Host "  ℹ Renaming locked directory to: $(Split-Path $oldName -Leaf)" -ForegroundColor Yellow
                Rename-Item $portableDir $oldName -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Host "Creating portable app structure..." -ForegroundColor Cyan
New-Item -Path $portableDir -ItemType Directory -Force | Out-Null

# Copy Electron files
Write-Host "  • Copying Electron files..." -ForegroundColor Gray
Copy-Item -Path (Join-Path $unpackedDir "*") -Destination $portableDir -Recurse -Force -ErrorAction SilentlyContinue

# Copy Backend
Write-Host "  • Copying Backend executable..." -ForegroundColor Gray
$backendPath = Join-Path $portableDir "backend"
New-Item -Path $backendPath -ItemType Directory -Force | Out-Null

# Copy only essential backend files
@("SlideForge.exe", "python3.dll", "python3.11.dll", "vcruntime140.dll") | ForEach-Object {
    $src = Join-Path $backendDir $_
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $backendPath -Force -ErrorAction SilentlyContinue
    }
}

# Copy _internal folder (dependencies)
$internalSrc = Join-Path $backendDir "_internal"
$internalDst = Join-Path $backendPath "_internal"
if (Test-Path $internalSrc) {
    Write-Host "    Copying dependencies..." -ForegroundColor DarkGray
    try {
        robocopy "$internalSrc" "$internalDst" /E /R:1 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    } catch {
        Write-Host "    ⚠ Some dependencies may be skipped" -ForegroundColor Yellow
    }
}

# Copy static resources if present
$staticSrc = Join-Path $backendDir "static"
$staticDst = Join-Path $backendPath "static"
if (Test-Path $staticSrc) {
    Write-Host "    Copying static resources..." -ForegroundColor DarkGray
    try {
        robocopy "$staticSrc" "$staticDst" /E /R:1 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    } catch {
        Write-Host "    ⚠ Some resources may be skipped" -ForegroundColor Yellow
    }
}

# Create launcher script
$launcherContent = @"
@echo off
REM SlideForge AI LITE - Launcher
setlocal enabledelayedexpansion

REM Get the directory of this script
set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

REM Start backend
echo Starting SlideForge Backend...
start "" "backend\SlideForge.exe"

REM Wait for backend to start
timeout /t 2 /nobreak

REM Start Electron app
echo Launching SlideForge AI...
start "" "SlideForge AI Lite.exe"

exit /b 0
"@

$launcherPath = Join-Path $portableDir "launch.bat"
$launcherContent | Out-File $launcherPath -Encoding ASCII -Force

Write-Host "  • Created launcher script" -ForegroundColor Gray

# Create README
$readmeContent = @"
# SlideForge AI LITE - Portable Edition

## Quick Start

1. Extract this folder
2. Double-click `launch.bat` to start
3. Wait for backend to start (2-3 seconds)
4. SlideForge window should open

## Files

- `SlideForge AI Lite.exe` - Electron app
- `backend/SlideForge.exe` - Python backend
- `backend/_internal/` - Python dependencies
- `resources/` - App resources

## System Requirements

- Windows 10 or newer
- 4 GB RAM minimum
- 500 MB disk space

## For text-rich PDFs

Works immediately without additional downloads

## For scanned PDFs

Download OCR models from:
[SlideForge-OCR-Models-v1.0.0.zip](https://your-site.com/downloads/SlideForge-OCR-Models-v1.0.0.zip)

Then extract to the same folder as this app.

## Support

For issues, see: https://github.com/your-repo/issues
"@

$readmePath = Join-Path $portableDir "README.txt"
$readmeContent | Out-File $readmePath -Encoding UTF8 -Force

Write-Host "  • Created README.txt" -ForegroundColor Gray

# Get sizes
$appSize = (Get-ChildItem $portableDir -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.FullName.Contains("asar.unpacked") } | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "✓ Portable app created successfully" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Package Details:" -ForegroundColor Yellow
Write-Host "  Size: $([math]::Round($appSize, 1)) MB" -ForegroundColor Gray
Write-Host "  Location: $portableDir" -ForegroundColor Gray
Write-Host "  Launcher: launch.bat" -ForegroundColor Gray
Write-Host ""

# Create ZIP archive
Write-Host "Creating ZIP archive..." -ForegroundColor Cyan
$zipName = "SlideForge-AI-Lite-Portable-v${Version}.zip"
$zipPath = Join-Path $releaseDir $zipName

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
}

# Use robocopy + zip alternative if needed
try {
    # Create a temp directory for ZIP contents (excluding locked files)
    $tempZipDir = Join-Path $releaseDir "temp-zip-$([System.Guid]::NewGuid().ToString().Substring(0,8))"
    New-Item -Path $tempZipDir -ItemType Directory -Force | Out-Null
    
    # Copy to temp (skip locked asar files)
    Get-ChildItem -Path $portableDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Name -ne "app.asar.unpacked") {
            robocopy "$($_.FullName)" "$tempZipDir\$($_.Name)" /E /R:1 /W:0 /NFL /NDL /NJH /NJS 2>&1 | Out-Null
        }
    }
    
    # Get files
    Get-ChildItem -Path $portableDir -File -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $tempZipDir -Force -ErrorAction SilentlyContinue
    }
    
    # Create ZIP from temp
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempZipDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    
    # Cleanup
    Remove-Item $tempZipDir -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "❌ Failed to create ZIP: $_" -ForegroundColor Red
    exit 1
}

$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "✓ Created: $zipName ($([math]::Round($zipSize, 1)) MB)" -ForegroundColor Green

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                 BUILD COMPLETE ✓                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""
Write-Host "📦 Deliverables:" -ForegroundColor Yellow
Write-Host "  ✓ Portable folder: $portableDir" -ForegroundColor Green
Write-Host "  ✓ ZIP archive: $zipPath" -ForegroundColor Green
Write-Host ""

Write-Host "🚀 To run:" -ForegroundColor Cyan
Write-Host "  Option 1 (Local): cd $portableDir && .\launch.bat" -ForegroundColor Gray
Write-Host "  Option 2 (ZIP): Extract ZIP and run launch.bat" -ForegroundColor Gray
Write-Host ""

Write-Host "📤 To distribute:" -ForegroundColor Cyan
Write-Host "  1. Upload $zipPath to your server" -ForegroundColor Gray
Write-Host "  2. Share download link with users" -ForegroundColor Gray
Write-Host "  3. Users extract and run launch.bat" -ForegroundColor Gray
