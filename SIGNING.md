# Code Signing for Windows Builds

## Overview

Electron-builder uses two environment variables to sign Windows executables (EXE installers, NSIS installers, and portable builds):

- `CSC_LINK` — Path to a PFX certificate file (`file:///C:/path/to/cert.pfx`) or Base64-encoded PFX data (for CI secrets)
- `CSC_KEY_PASSWORD` — Password protecting the PFX file

When these variables are set, electron-builder will **automatically** sign all Windows executables during packaging. When they are not set, builds proceed unsigned — this is the default for local development.

## Quick Start (Testing)

First, generate a self-signed developer certificate:

```pwsh
.\scripts\generate-selfsigned-cert.ps1 -Password "slideforge-dev-cert" -OutputDir "certs"
```

Then set the environment variables and build:

```pwsh
$env:CSC_LINK = "file://F:/code project/SlideForge/certs/slideforge-dev.pfx"
$env:CSC_KEY_PASSWORD = "slideforge-dev-cert"

# Now package normally — your executables will be signed
npm run package
```

**Important:** Self-signed certificates are not trusted by Windows. Users will see a SmartScreen warning. This certificate is for **testing the signing pipeline only**.

## Generating a New Self-Signed Certificate

If you need to regenerate the certificate:

```pwsh
.\scripts\generate-selfsigned-cert.ps1 -Password "your-password" -OutputDir "certs"
```

The script:
1. Generates a 2048-bit RSA key pair with the **Code Signing** extended key usage
2. Creates a self-signed X.509 certificate valid for 10 years (configurable with `-ValidDays`)
3. Exports as a PKCS#12 (PFX) file ready for electron-builder

## Production Code Signing

For releases that users trust without warnings, purchase a code signing certificate from a trusted Certificate Authority (CA):

| Provider | Typical Cost | Notes |
|----------|-------------|-------|
| **DigiCert** | ~$300–500/yr | Most widely used, EV certificates available |
| **Sectigo** | ~$200–300/yr | Good alternative |
| **Certum** | ~$150–250/yr | Budget option |
| **Let's Encrypt** | Free | Does **not** offer code signing certificates |

> **⚠️ Important for 2024+:** Many CAs now require a **hardware token** (USB dongle) or **cloud HSM** for code signing. Cloud-based signing services (e.g., Azure Key Vault, DigiCert KeyLocker) are recommended over file-based PFX certificates.

### Switching from Self-Signed to Production

1. Obtain your production PFX from the CA
2. Copy it to `certs/production.pfx` (already in `.gitignore`)
3. Set the environment variables:

```pwsh
$env:CSC_LINK = "file:///F:/code project/SlideForge/certs/production.pfx"
$env:CSC_KEY_PASSWORD = "<your-production-password>"
```

## CI/CD Configuration (GitHub Actions)

The release workflow (`release-windows.yml`) will **automatically sign builds** when the following secrets are configured in your GitHub repository:

### Required Secrets

| Secret | Value |
|--------|-------|
| `CSC_LINK` | Base64-encoded PFX file |
| `CSC_KEY_PASSWORD` | PFX password |

### Setting Up the Secrets

**Step 1: Encode the PFX to Base64**

```pwsh
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certs/slideforge-dev.pfx"))
```

**Step 2: Add to GitHub**

1. Go to `Settings → Secrets and variables → Actions`
2. Add `CSC_LINK` with the Base64 string
3. Add `CSC_KEY_PASSWORD` with the PFX password

Now every push to a `v*.*.*` tag will produce **signed** executables.

### Timestamping

For production, also configure a timestamp server in your signing config. Electron-builder handles this automatically when `CSC_LINK` is set, but you can specify:

```pwsh
# electron-builder uses the Windows SDK signtool internally
# The timestamp server can be configured via env var:
$env:CSC_TIMESTAMP_SERVER = "http://timestamp.digicert.com"
```

## Verifying a Signed Executable

Check if an EXE is signed:

```pwsh
# Check digital signature
Get-AuthenticodeSignature -FilePath "path\to\SlideForge AI Setup.exe"

# Or use the Windows UI: right-click → Properties → Digital Signatures tab
```

A successful verification shows `Status: Valid` (for trusted certs) or `Status: UnknownError` (for self-signed).

## File Locations

| File | Purpose | Gitignored? |
|------|---------|-------------|
| `certs/slideforge-dev.pfx` | Self-signed dev certificate | ✅ Yes |
| `certs/slideforge-dev-cert.pem` | Public certificate (cleaned up after generation) | ✅ Yes |
| `certs/slideforge-dev-key.pem` | Private key (cleaned up after generation) | ✅ Yes |
| `scripts/generate-selfsigned-cert.ps1` | Certificate generation script | ❌ No (committed) |

## Troubleshooting

**Build fails with "Cannot find sign tool"**
Install the Windows SDK or ensure `signtool.exe` is in your PATH. The Windows SDK comes with Visual Studio Build Tools.

**Build succeeds but EXE is not signed**
Check that `CSC_LINK` and `CSC_KEY_PASSWORD` are set **before** running the build command. Also verify the PFX password is correct:

```pwsh
openssl pkcs12 -info -in "certs/slideforge-dev.pfx" -passin pass:"slideforge-dev-cert"
```

**"The certificate is not trusted" warning**
This is expected for self-signed certificates. Install the cert in the `Trusted Root Certification Authorities` store to silence it on your own machine:

```pwsh
# Import the PFX into the local machine store (requires admin)
Import-PfxCertificate -FilePath "certs/slideforge-dev.pfx" -CertStoreLocation Cert:\LocalMachine\Root -Password (ConvertTo-SecureString -String "slideforge-dev-cert" -AsPlainText -Force)
```

> ⚠️ Only do this on machines you trust. Never install unknown certificates as trusted root authorities.
