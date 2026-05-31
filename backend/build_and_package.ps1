param(
    [switch]$SkipFrontendBuild,
    [switch]$SkipModelBundle,
    [string]$BackendDistPath = "dist-package"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$backendDir = Resolve-Path $scriptDir

function Remove-DirectoryRobust {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return
    }

    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            return
        }
        catch {
            Start-Sleep -Milliseconds (250 * $attempt)
            try {
                Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue |
                    ForEach-Object {
                        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                    }
            }
            catch {
            }
        }
    }

    throw "Failed to remove directory '$Path' after multiple attempts."
}

function New-CleanDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path $Path) {
        Remove-DirectoryRobust -Path $Path
    }
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Ensure-DirectoryWritable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        return
    }

    try {
        attrib -R "$Path\*" /S /D | Out-Null
    }
    catch {
    }
}

if (-not $SkipFrontendBuild) {
    Write-Host "Building React Frontend..." -ForegroundColor Cyan
    Set-Location $repoRoot
    npm run build
} else {
    Write-Host "Skipping React frontend build (already built)." -ForegroundColor DarkYellow
}

Write-Host "Copying Frontend to Backend Static folder..." -ForegroundColor Cyan
Set-Location $backendDir
$staticBuildDir = "static_build_" + [Guid]::NewGuid().ToString("N")
New-Item -ItemType Directory -Force -Path $staticBuildDir | Out-Null
Copy-Item -Path (Join-Path $repoRoot "dist\*") -Destination $staticBuildDir -Recurse -Force

if (-not $SkipModelBundle) {
    Write-Host "Preparing bundled OCR models..." -ForegroundColor Cyan
    $bundleTempRoot = Join-Path $backendDir "model-bundle-ready"
    $bundleOutPath = Join-Path $bundleTempRoot "ocr_models"
    if (-not (Test-Path $bundleTempRoot)) {
        New-Item -ItemType Directory -Force -Path $bundleTempRoot | Out-Null
    }

    $env:SLIDEFORGE_BUNDLE_OUT = $bundleOutPath
    try {
        uv run python scripts/prepare_model_bundle.py
    }
    finally {
        Remove-Item Env:\SLIDEFORGE_BUNDLE_OUT -ErrorAction SilentlyContinue
    }

    $manifestPath = Join-Path $bundleTempRoot "ocr_models\bundle_manifest.json"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $sizeMb = [math]::Round($manifest.total_bytes / 1MB, 1)
        Write-Host "Bundle ready: $($manifest.models.Count) models, $sizeMb MB" -ForegroundColor Green
    } else {
        Write-Warning "Bundle manifest missing - bundle preparation may have failed."
    }
} else {
    Write-Host "Skipping bundled OCR models for lite build." -ForegroundColor DarkYellow
    $bundleDir = Join-Path $backendDir "model-bundle"
    if (Test-Path $bundleDir) {
        Write-Host "Removing stale bundle dir for clean lite build..." -ForegroundColor DarkYellow
        try {
            Remove-DirectoryRobust -Path $bundleDir
        }
        catch {
            Write-Warning "Could not fully clean stale bundle dir: $bundleDir"
        }
    }
    $bundleReadyDir = Join-Path $backendDir "model-bundle-ready"
    if (Test-Path $bundleReadyDir) {
        Write-Host "Removing staged bundle dir for clean lite build..." -ForegroundColor DarkYellow
        try {
            Remove-DirectoryRobust -Path $bundleReadyDir
        }
        catch {
            Write-Warning "Could not fully clean staged bundle dir: $bundleReadyDir"
        }
    }
}

Write-Host "Installing PyInstaller..." -ForegroundColor Cyan
uv pip install pyinstaller

Write-Host "Building Python Executable..." -ForegroundColor Cyan
$staticBuildFullPath = Join-Path $backendDir $staticBuildDir
$env:SLIDEFORGE_STATIC_DIR = $staticBuildFullPath
try {
    uv run pyinstaller SlideForge.spec --clean -y --distpath $BackendDistPath
}
finally {
    Remove-Item Env:\SLIDEFORGE_STATIC_DIR -ErrorAction SilentlyContinue
    if ($staticBuildFullPath -and (Test-Path $staticBuildFullPath)) {
        Write-Host "Cleaning up temporary static folder: $staticBuildFullPath" -ForegroundColor Cyan
        Remove-DirectoryRobust -Path $staticBuildFullPath
    }
}

Write-Host "Build complete! The packed folder is in backend\$BackendDistPath\SlideForge\" -ForegroundColor Green
Write-Host "Run backend\$BackendDistPath\SlideForge\SlideForge.exe to start the application." -ForegroundColor Yellow
