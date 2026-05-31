param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,
    [int]$Port = 8015,
    [int]$TimeoutSec = 45,
    [string]$HealthPath = "/api/admin/healthz"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Backend executable not found: $ExePath"
}

$dataDir = Join-Path $env:TEMP "slideforge-backend-smoke"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$stdoutLog = Join-Path $env:TEMP "slideforge-backend-smoke.out.log"
$stderrLog = Join-Path $env:TEMP "slideforge-backend-smoke.err.log"
Remove-Item -Force $stdoutLog, $stderrLog -ErrorAction SilentlyContinue

$process = Start-Process -FilePath $ExePath `
    -ArgumentList @('--host', '127.0.0.1', '--port', "$Port", '--data-dir', $dataDir) `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

try {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $healthy = $false

    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) {
            throw "Backend process exited early with code $($process.ExitCode)"
        }

        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$HealthPath" -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                $healthy = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 750
        }
    }

    if (-not $healthy) {
        throw "Backend executable did not become healthy within $TimeoutSec seconds"
    }

    Write-Host "Backend EXE smoke test passed on port $Port" -ForegroundColor Green
}
finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }

    if (Test-Path $stdoutLog) {
        Write-Host "--- backend stdout ---"
        Get-Content $stdoutLog
    }
    if (Test-Path $stderrLog) {
        Write-Host "--- backend stderr ---"
        Get-Content $stderrLog
    }
}
