# 🚀 SlideForge LITE Build - Quick Reference

## ⚡ Build Now (3 steps)

### Step 1: Open PowerShell as Administrator
- **Windows 10/11**: Right-click PowerShell → "Run as administrator"
- Click "Yes" on UAC prompt

### Step 2: Navigate to project
```powershell
cd "f:\code project\SlideForge"
```

### Step 3: Run build
```powershell
cd "F:\code project\SlideForge"
npm run package:lite:release
# (quick test without signing)
pwsh scripts/build-lite-with-ocr.ps1 -SkipSigning
```

---

## ✅ What You'll Get

**After ~3 minutes**, you'll see:
```
╔════════════════════════════════════════════════════════════════╗
║                      BUILD COMPLETE ✓                          ║
╚════════════════════════════════════════════════════════════════╝

📦 LITE Installer:
  • SlideForge-AI-Lite Setup.exe (150 MB) ✓ Signed
  • SlideForge-AI-Lite-portable.exe (150 MB) ✓ Signed

📥 OCR Models Package (Optional):
  • SlideForge-OCR-Models-v1.0.0.zip (400 MB)
```

---

## 📂 Output Files Location

Both installers created in:
```
F:\code project\SlideForge\release\electron-lite\
```

OCR package (if models built):
```
F:\code project\SlideForge\backend\SlideForge-OCR-Models-v1.0.0.zip
```

---

## 🆘 If Build Fails

**Error**: `CreateFile app.asar.unpacked: Access is denied`

**Quick Fix**:
1. Make sure you're running PowerShell as **Administrator**
2. Check your antivirus isn't blocking the build
3. See [BUILD_TROUBLESHOOTING.md](BUILD_TROUBLESHOOTING.md) for 5 detailed solutions

**Most common fix**: UAC/Admin permissions not elevated enough

---

## 🔧 Build Options

### Build without code signing (for testing)
```powershell
pwsh scripts/build-lite-with-ocr.ps1 -SkipSigning
```

### Build with custom version
```powershell
pwsh scripts/build-lite-with-ocr.ps1 -Version "1.0.0"
```

### Build with code signing (production)
```powershell
# First set certificate path
$env:CSC_LINK = "certs/slideforge-codesign.pfx"

# Build (will prompt for password)
npm run package:lite:release
```

---

## 📊 Build Progress

Watch for these phases:

```
✓ Cleaned                           (5 sec)
✓ Permissions fixed                 (2 sec)
  ├─ Compiling React frontend...    (15 sec)
  ├─ Compiling Electron...          (2 sec)
  ├─ Building Python backend...     (45 sec)
  └─ Creating NSIS installer...     (25 sec)
✓ LITE installer created
✓ OCR package created (if available)

BUILD COMPLETE ✓
```

---

## 📚 Detailed Guides

| Need | Read |
|------|------|
| Full build instructions | [BUILDS.md](BUILDS.md) |
| Having problems? | [BUILD_TROUBLESHOOTING.md](BUILD_TROUBLESHOOTING.md) |
| Implementation details | [LITE_BUILD_SUMMARY.md](LITE_BUILD_SUMMARY.md) |
| Build script code | [scripts/build-lite-with-ocr.ps1](scripts/build-lite-with-ocr.ps1) |

---

## ✨ Distribution

After build succeeds:

1. **Test installer** (optional)
   ```powershell
   & ".\release\electron-lite\SlideForge-AI-Lite Setup.exe"
   ```

2. **Upload to server**
   - `SlideForge-AI-Lite-Setup.exe` → Main download
   - `SlideForge-OCR-Models-v1.0.0.zip` → Optional download

3. **Share links with users**
   - LITE: ~150 MB (fast download)
   - OCR: ~400 MB (optional, for scanned PDFs)

---

## 💡 Pro Tips

- ✅ First build is slower (caching builds in ~1 min)
- ✅ Run as Admin to avoid permissions issues
- ✅ Add SlideForge to antivirus exclusions for faster builds
- ✅ Use LITE for most users, FULL for offline deployments
- ✅ Users get OCR models only when they need them

---

## 🎯 Next Steps

1. **Try building**: `npm run package:lite:release`
2. **Verify output**: Check `release\electron-lite\` folder
3. **Test installer**: Run the .exe file
4. **Distribute**: Upload files to your server

**Estimated build time: 3-5 minutes**

---

**Ready?** Just run:
```powershell
npm run package:lite:release
```

For help, see [BUILD_TROUBLESHOOTING.md](BUILD_TROUBLESHOOTING.md)
