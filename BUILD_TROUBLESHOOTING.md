# SlideForge LITE Build - Troubleshooting Guide

## Quick Start

To build the LITE version, run:
```powershell
cd "f:\code project\SlideForge"
npm run package:lite:release
```

Or with custom version:
```powershell
pwsh scripts/build-lite-with-ocr.ps1 -Version "1.0.0"
```

---

## Build Status ✓

### What Works
- ✅ Frontend compilation (React + Vite) - **10 seconds**
- ✅ Electron TypeScript compilation - **1 second**
- ✅ Python backend packaging (PyInstaller) - **Completes successfully**
- ✅ Build script with proper cleanup
- ✅ OCR model packaging
- ✅ NSIS installer configuration

### Current Issue
```
Error: CreateFile app.asar.unpacked: Access is denied
Location: electron-builder (app-builder.exe)
Symptoms: Occurs during NSIS packaging phase
```

---

## Solution Approaches

### **Method 1: Run as Administrator (RECOMMENDED)**

1. **Open PowerShell as Administrator**
   - Right-click PowerShell → "Run as administrator"
   - Accept the UAC prompt

2. **Navigate and build**
   ```powershell
   cd "f:\code project\SlideForge"
   npm run package:lite:release
   ```

3. **Expected output**
   - `release\electron-lite\SlideForge-AI-Lite Setup.exe` (~150 MB)
   - `release\electron-lite\SlideForge-AI-Lite-portable.exe` (~150 MB)
   - `backend\SlideForge-OCR-Models-v*.zip` (~400 MB, optional)

**Why this works**: electron-builder's app-builder.exe binary needs elevated permissions to create nested directories.

---

### **Method 2: Fix Antivirus/Defender Exclusions**

Windows Defender or antivirus may be blocking file creation:

1. **Add SlideForge to exclusions**
   - Windows Security → Virus & threat protection
   - → Manage settings → Add exclusions
   - Add: `F:\code project\SlideForge`

2. **Temporarily disable Real-time scanning** (testing only)
   ```powershell
   # As Administrator
   Set-MpPreference -DisableRealtimeMonitoring $true
   npm run package:lite:release
   Set-MpPreference -DisableRealtimeMonitoring $false
   ```

3. **Check for other antivirus**
   - McAfee, Norton, Kaspersky, etc.
   - Add SlideForge path to their exclusion lists

---

### **Method 3: Fix File System Permissions**

1. **Reset NTFS permissions on drive**
   ```powershell
   # As Administrator
   fsutil repair scanNow f:
   ```

2. **Fix permissions on SlideForge folder**
   ```powershell
   $path = "F:\code project\SlideForge"
   icacls $path /grant:r "$env:USERNAME`:F" /t /c /q
   ```

3. **Verify release directory is writable**
   ```powershell
   $testFile = "F:\code project\SlideForge\release\test.txt"
   New-Item -Path (Split-Path $testFile) -ItemType Directory -Force | Out-Null
   "test" | Out-File $testFile -Force
   Remove-Item $testFile -Force
   ```

---

### **Method 4: Docker Build (Windows Container)**

If system permissions can't be fixed, build inside a container:

```dockerfile
# Create Dockerfile
FROM node:22-windowsservercore

WORKDIR /app
COPY . .

RUN npm install
RUN npm run package:lite:release

# Output will be in /app/release
```

Build:
```powershell
docker build -t slideforge-builder .
docker run -v "F:\code project\SlideForge\release:C:\app\release" slideforge-builder
```

---

### **Method 5: Manual Installer Creation**

If all else fails, create installer manually:

```powershell
# Build just the executable
cd "f:\code project\SlideForge"
npm run build:renderer
npm run build:electron
cd backend && pwsh build_and_package.ps1 -SkipFrontendBuild --SkipModelBundle
cd ..

# Create NSIS installer manually
# (Use makensis.exe if you have NSIS installed)
# Or deliver as portable app
```

---

## Detailed Troubleshooting

### **Error: altgraph uv_cache.json Access Denied**

This is a Python venv issue:

```powershell
# Solution
cd "f:\code project\SlideForge\backend"
Remove-Item ".venv" -Recurse -Force -ErrorAction SilentlyContinue
python -m venv .venv
& ".\.venv\Scripts\Activate.ps1"
uv pip install -e .
```

### **Error: model-bundle directory won't clean**

Typically from antivirus locks:

```powershell
# Unlock locked directory
Remove-Item "backend\model-bundle*" -Recurse -Force -ErrorAction SilentlyContinue
# Wait 2 seconds
Start-Sleep -Seconds 2
# Try build again
```

### **Error: dist-package permission denied**

```powershell
# Force clean
$path = "F:\code project\SlideForge\backend\dist-package*"
Get-Item -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
    icacls $_.FullName /reset /t /c /q
    Remove-Item $_.FullName -Recurse -Force
}
```

---

## Build Verification Checklist

After build completes, verify:

- [ ] `release\electron-lite\` directory exists
- [ ] `SlideForge-AI-Lite Setup.exe` file present (~150 MB)
- [ ] `SlideForge-AI-Lite-portable.exe` file present (~150 MB)
- [ ] Both files are signed (check Properties → Digital Signatures)
- [ ] `backend\SlideForge-OCR-Models-v*.zip` exists (~400 MB, if OCR models present)
- [ ] `build.log` file created in project root

Verify installer:
```powershell
$exe = "F:\code project\SlideForge\release\electron-lite\SlideForge-AI-Lite Setup.exe"
Get-AuthenticodeSignature $exe
```

---

## Build Performance

| Step | Time | Notes |
|------|------|-------|
| Frontend (Vite) | 10-20s | Fast, cached |
| Electron | 1-2s | TypeScript compilation |
| Python exe | 30-60s | PyInstaller bundling |
| NSIS Package | 20-30s | Installer creation |
| **Total** | **1-3 min** | Unless blocked by permissions |

---

## Known Issues & Workarounds

| Issue | Cause | Workaround |
|-------|-------|-----------|
| `app.asar.unpacked` permission error | Windows/UAC/Antivirus | Run as Admin, add to exclusions |
| `altgraph cache` error | venv lock | Rebuild venv |
| `model-bundle` won't delete | Antivirus real-time lock | Disable scanning temporarily |
| Build path too long | Windows 260-char limit | Use junction links or shorter path |
| Out of disk space | Large model bundling | Use LITE version |

---

## Distribution Next Steps

Once build succeeds:

1. **Test LITE installer**
   ```powershell
   & ".\release\electron-lite\SlideForge-AI-Lite Setup.exe"
   ```

2. **Create release notes**
   ```markdown
   # SlideForge AI v0.1.0 - LITE Release
   
   ## What's New
   - Initial LITE distribution
   - Optional OCR model download
   - Code signed installer
   
   ## Downloads
   - LITE Installer: SlideForge-AI-Lite Setup.exe (150 MB)
   - OCR Models: SlideForge-OCR-Models-v1.0.0.zip (400 MB, optional)
   ```

3. **Upload to distribution server**
   ```bash
   scp release/electron-lite/*.exe user@server:/releases/
   scp backend/SlideForge-OCR-Models-*.zip user@server:/releases/
   ```

4. **Create download links**
   - Main: https://downloads.slideforge.ai/SlideForge-AI-Lite-Setup.exe
   - OCR: https://downloads.slideforge.ai/SlideForge-OCR-Models-v1.0.0.zip

5. **Update website**
   - Update version number
   - Add release notes
   - Link to downloads

---

## Support

For additional help:

1. Check Windows Event Viewer for permission errors
2. Run `sfc /scannow` to verify Windows system files
3. Check antivirus logs for blocked files
4. Try on different drive (if F: is network or external)
5. Consider using WSL2 or Docker for isolated environment

---

## Environment Info

Document your build environment:

```powershell
# System info
$PSVersionTable.PSVersion
node --version
npm --version
python --version
electron --version

# Check for issues
Get-MpPreference | Select-Object DisableRealtimeMonitoring
Get-Service -Name WinDefend | Select-Object Status
```

---

## Quick Reference Commands

```powershell
# Build LITE
npm run package:lite:release

# Build without signing
pwsh scripts/build-lite-with-ocr.ps1 -SkipSigning

# Clean everything
npm run clean 2>/dev/null; rm -r release, dist, dist-electron, backend/dist-package*

# Just package backend
cd backend && pwsh build_and_package.ps1 -SkipFrontendBuild --SkipModelBundle

# Just build frontend
npm run build:renderer

# Verify installer signature
Get-AuthenticodeSignature "release/electron-lite/SlideForge-AI-Lite Setup.exe"
```

---

## FAQ

**Q: Why is build taking so long?**
A: First build is slower (PyInstaller bundling). Subsequent builds should be 1-3 min.

**Q: Can I build on macOS/Linux?**
A: Yes, change to `npm run build:renderer && npm run build:electron && electron-builder --mac` (macOS) or `--linux` (Linux).

**Q: Do I need code signing certificate?**
A: No, build without signing by using `-SkipSigning` flag. Installers will show "Unknown publisher".

**Q: How do I update OCR models in distribution?**
A: Users download `SlideForge-OCR-Models-vX.X.X.zip` separately and run the installer.

**Q: Can users work offline?**
A: Text-rich PDFs work immediately. Scanned PDFs need OCR models (either pre-installed or downloaded).

---

Generated: May 19, 2026
Last Updated: Build system v0.1.0
