# SlideForge AI - Build Versions

This document explains the different build types and how to create them.

## Build Types

### 🟢 LITE (Default - Recommended)
- **Size**: ~150 MB
- **What's included**: Core application only
- **Models**: Downloaded on demand by users
- **Best for**: 
  - Initial distribution
  - Users with text-rich PDFs (don't need OCR)
  - Minimal bandwidth usage
- **Build command**: 
  ```powershell
  npm run package:lite:release
  ```

### 🔵 FULL
- **Size**: ~800 MB
- **What's included**: Core app + pre-bundled OCR models
- **Models**: Ready to use immediately
- **Best for**:
  - Users with many scanned PDFs
  - Offline deployments
  - Enterprise distributions
- **Build command**:
  ```powershell
  npm run package:full
  ```

---

## Release Build: LITE + OCR Package

The recommended distribution method combines LITE installer with optional OCR package.

### What Users Get
1. **SlideForge-AI-Lite Setup.exe** (~150 MB)
   - Main application installer
   - Code signed for Windows trust
   - Can be installed immediately

2. **SlideForge-OCR-Models-v*.zip** (~400 MB, optional)
   - Separate OCR models package
   - Downloaded only by users who need it
   - Includes installers for Windows/Linux/Mac

### Build Process

**Step 1: Build LITE Release with OCR Package**

```powershell
cd "f:\code project\SlideForge"

# Build LITE installer + create OCR package
npm run package:lite:release
```

**Step 2: (Optional) Add Version Information**

```powershell
# Build with specific version
pwsh scripts/build-lite-with-ocr.ps1 -Version "1.0.0"
```

**Step 3: (Optional) Build Without Code Signing**

```powershell
# Skip signing (useful for testing)
pwsh scripts/build-lite-with-ocr.ps1 -SkipSigning
```

### Output Files

After build completes, you'll have:

```
release/electron-lite/
├── SlideForge-AI-Lite Setup.exe     ← Main installer (~150 MB, Signed ✓)
├── SlideForge-AI-Lite-portable.exe  ← Portable version (~150 MB, Signed ✓)
└── (other release files)

backend/
└── SlideForge-OCR-Models-v*.zip     ← OCR package (~400 MB)
    ├── surya_models/                ← Pre-packaged OCR models
    ├── README.txt                   ← Installation instructions
    ├── INSTALL_OCR_MODELS.bat       ← Windows installer
    ├── install_ocr_models.sh        ← Linux/Mac installer
    └── download_models.py           ← Direct HuggingFace downloader
```

---

## User Experience Flow

### Text-Rich PDF (Native extraction works)
```
User installs SlideForge LITE
       ↓
Uploads PDF
       ↓
Automatic text extraction (no models needed)
       ↓
Analysis completes (~5 minutes)
```

### Scanned PDF (OCR needed)
```
User installs SlideForge LITE
       ↓
Uploads scanned PDF
       ↓
Modal: "Download OCR models?"
       ├─→ Download now (auto-install)
       ├─→ Download manually (from provided links)
       └─→ Skip (analysis fails)
       ↓
Analysis completes (~30 minutes with OCR)
```

---

## Distribution Checklist

- [ ] Build LITE release: `npm run package:lite:release`
- [ ] Verify installers are code signed
- [ ] Test LITE installer on clean Windows
- [ ] Create release notes (version, features, fixes)
- [ ] Upload to distribution server:
  - `SlideForge-AI-Lite Setup.exe`
  - `SlideForge-OCR-Models-v*.zip` (optional)
- [ ] Generate download links
- [ ] Update website with new release
- [ ] Test download links
- [ ] Notify users of new version

---

## Code Signing

### Setup (One Time)
```powershell
# Generate self-signed certificate (if needed)
pwsh scripts/generate-selfsigned-cert.ps1

# Set environment variables
$env:CSC_LINK = "certs/slideforge-codesign.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
```

### During Build
- Certificate password is prompted if not provided
- Signing happens automatically during packaging
- Verify signatures in output

### Troubleshooting
```powershell
# Check if certificate exists
Test-Path "certs/slideforge-codesign.pfx"

# Verify signature
$sig = Get-AuthenticodeSignature "release/electron-lite/SlideForge-AI-Lite Setup.exe"
$sig | Select-Object Status, SignerCertificate
```

---

## Build Time Estimates

| Build Type | Time | Notes |
|-----------|------|-------|
| LITE only | 10-15 min | Fastest, no model bundling |
| LITE + OCR package | 12-18 min | Includes OCR packaging |
| FULL | 20-30 min | Includes model bundling |

---

## Advanced: Custom Version

```powershell
# Build with custom version number
pwsh scripts/build-lite-with-ocr.ps1 -Version "1.2.3"

# Build without signing (for testing)
pwsh scripts/build-lite-with-ocr.ps1 -SkipSigning

# Specify different certificate
pwsh scripts/build-lite-with-ocr.ps1 -CertPath "path/to/cert.pfx"
```

---

## Troubleshooting

### Build fails with "certificate not found"
```powershell
# Generate new certificate
pwsh scripts/generate-selfsigned-cert.ps1
```

### Build takes too long
- First build is slower (model processing)
- Subsequent builds are faster (caching)
- Be patient, don't interrupt

### Installers not code signed
```powershell
# Verify Windows SDK is installed
& "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" /?
```

---

## For Support

See `SIGNING.md` for code signing details.
See `README.md` for general project information.
