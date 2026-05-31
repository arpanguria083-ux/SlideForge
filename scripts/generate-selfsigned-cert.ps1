<#
.SYNOPSIS
    Generates a self-signed Authenticode code signing certificate for testing Windows builds.
.DESCRIPTION
    Creates a self-signed code signing certificate using OpenSSL, exports it as a PFX file,
    and outputs the environment variables needed for electron-builder signing.
    This certificate is for TESTING only — not trusted by Windows.
.NOTES
    To use with electron-builder, set:
      $env:CSC_LINK="file://$PWD/certs/slideforge-dev.pfx"
      $env:CSC_KEY_PASSWORD="<password>"
    Then run your normal build/package command.
.EXAMPLE
    .\scripts\generate-selfsigned-cert.ps1 -Password "MyPass123" -OutputDir "certs"
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$Password = "slideforge-dev-cert",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "certs",

    [Parameter(Mandatory = $false)]
    [int]$ValidDays = 3650,

    [Parameter(Mandatory = $false)]
    [string]$Subject = "/CN=SlideForge AI Development /O=SlideForge /OU=Development"
)

$ErrorActionPreference = "Stop"

# Resolve paths
$ScriptRoot = Split-Path -Parent $PSScriptRoot
$OutputPath = Join-Path $ScriptRoot $OutputDir
$PfxPath = Join-Path $OutputPath "slideforge-dev.pfx"
$CertPemPath = Join-Path $OutputPath "slideforge-dev-cert.pem"
$KeyPemPath = Join-Path $OutputPath "slideforge-dev-key.pem"

# Check for OpenSSL
$openssl = (Get-Command "openssl" -ErrorAction SilentlyContinue).Source
if (-not $openssl) {
    Write-Error "OpenSSL is required. Install it via Git for Windows, Chocolatey, or manual install."
    exit 1
}

Write-Host "=== SlideForge Self-Signed Code Signing Certificate Generator ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This generates a self-signed Authenticode certificate for TESTING purposes only." -ForegroundColor Yellow
Write-Host "Windows will show a warning when installing software signed with this certificate." -ForegroundColor Yellow
Write-Host ""

# Create output directory
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    Write-Host "Created directory: $OutputPath" -ForegroundColor Green
}

# Create OpenSSL config for code signing EKU
$ConfigPath = Join-Path $OutputPath "openssl-codesign.cnf"
@"
[req]
distinguished_name = req_distinguished_name
prompt = no

[req_distinguished_name]
CN = SlideForge AI Development
O = SlideForge
OU = Development
"@ | Set-Content -Path $ConfigPath -Encoding ASCII

Write-Host "Generating self-signed certificate with Code Signing EKU..." -ForegroundColor Cyan

# Generate private key
& $openssl genrsa -out $KeyPemPath 2048
if ($LASTEXITCODE -ne 0) {
    Write-Error "Private key generation failed."
    exit 1
}

# Generate self-signed certificate with Code Signing EKU via -addext
& $openssl req -x509 `
    -key $KeyPemPath `
    -out $CertPemPath `
    -days $ValidDays `
    -config $ConfigPath `
    -subj $Subject `
    -addext "basicConstraints = critical, CA:FALSE" `
    -addext "keyUsage = critical, digitalSignature" `
    -addext "extendedKeyUsage = critical, 1.3.6.1.5.5.7.3.3" `
    -addext "subjectKeyIdentifier = hash"

if ($LASTEXITCODE -ne 0) {
    Write-Error "OpenSSL certificate generation failed."
    exit 1
}

Write-Host "  Certificate: $CertPemPath" -ForegroundColor Green
Write-Host "  Private key: $KeyPemPath" -ForegroundColor Green

# Export as PFX (PKCS#12) — the format electron-builder expects
Write-Host "Exporting PFX..." -ForegroundColor Cyan

& $openssl pkcs12 -export `
    -inkey $KeyPemPath `
    -in $CertPemPath `
    -out $PfxPath `
    -passout "pass:$Password" `
    -name "SlideForge Development"

if ($LASTEXITCODE -ne 0) {
    Write-Error "PFX export failed."
    exit 1
}

Write-Host "  PFX: $PfxPath" -ForegroundColor Green

# Verify the PFX
Write-Host "Verifying PFX..." -ForegroundColor Cyan
& $openssl pkcs12 -info -in $PfxPath -passin "pass:$Password" -nokeys 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  PFX verified successfully." -ForegroundColor Green
} else {
    Write-Warning "  PFX verification failed — file may be corrupted."
}

# Clean up intermediate files
Remove-Item $ConfigPath -Force -ErrorAction SilentlyContinue
Remove-Item $KeyPemPath -Force -ErrorAction SilentlyContinue
Remove-Item $CertPemPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Certificate Generated Successfully ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "PFX Location: $PfxPath" -ForegroundColor White
Write-Host "Password:     $Password" -ForegroundColor White
Write-Host "Valid for:    $ValidDays days" -ForegroundColor White
Write-Host ""
Write-Host "To use with electron-builder, set these environment variables:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  `$env:CSC_LINK = \"file://$((Get-Item $PfxPath).FullName -replace '\\', '/')\"" -ForegroundColor Cyan
Write-Host "  `$env:CSC_KEY_PASSWORD = \"$Password\"" -ForegroundColor Cyan
Write-Host ""
Write-Host "Then run:" -ForegroundColor Yellow
Write-Host "  npm run package" -ForegroundColor Cyan
Write-Host ""
Write-Host "For CI, add these as secrets:" -ForegroundColor Yellow
Write-Host "  CSC_LINK         — Base64-encoded PFX content" -ForegroundColor Cyan
Write-Host "  CSC_KEY_PASSWORD — The PFX password" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Self-signed certificates are NOT trusted by Windows." -ForegroundColor Red
Write-Host "Users will see a SmartScreen warning. For production, use a trusted CA." -ForegroundColor Red
Write-Host ""
