# Electron Version - Comprehensive Issue Fixes

**Date**: May 20, 2026  
**Build Version**: 0.1.0 LITE  
**Status**: ✅ All issues identified and fixed

---

## Overview

The Electron LITE build had multiple critical issues preventing PDF processing and OCR functionality. This document details all root causes identified and fixes applied.

---

## Issues Fixed

### 1. **`pdfplumber` Not Imported into PyInstaller Bundle**

**Error**: `Parsing/OCR Failed: No module named 'pdfplumber'`

**Root Cause**: 
- `pdfplumber` was listed as a dependency in `pyproject.toml` but was NOT in the build environment (hermes agent venv)
- PyInstaller spec files (`.spec`) did not explicitly include `pdfplumber`, `pypdf`, `pdfminer`, or `cv2` in hidden imports or data files
- PyInstaller had no hooks to auto-collect these modules

**Where Used**:
- [backend/app/agents/parallel_analysis.py](backend/app/agents/parallel_analysis.py#L99) - line 99
- [backend/app/main.py](backend/app/main.py#L878) - line 878
- [backend/app/services/document_ingestion.py](backend/app/services/document_ingestion.py#L127) - line 127
- [backend/app/services/document_ingestion.py](backend/app/services/document_ingestion.py#L694) - line 694

**Fix Applied**:
1. Installed missing packages in hermes agent venv:
   ```powershell
   python.exe -m pip install pdfplumber pypdf opencv-python pdf2image --upgrade
   ```

2. Updated [backend/SlideForge.spec](backend/SlideForge.spec) - added to hidden imports:
   ```python
   hidden_imports += collect_submodules('pdfplumber')
   hidden_imports += collect_submodules('pypdf')
   hidden_imports += collect_submodules('pdfminer')
   hidden_imports += collect_submodules('cv2')
   ```

3. Updated [backend/SlideForge.spec](backend/SlideForge.spec) - added to data files:
   ```python
   datas += collect_data_files('pdfplumber')
   datas += collect_data_files('pypdf')
   datas += collect_data_files('pdfminer')
   datas += collect_data_files('cv2')
   ```

4. Applied same changes to [backend/SlideForge.prod.spec](backend/SlideForge.prod.spec)

**Verification**:
PyInstaller now recognizes and bundles these packages:
```
145397 INFO: Processing standard module hook 'hook-cv2.py'
178222 INFO: Processing standard module hook 'hook-pdfminer.py'
183925 INFO: Processing standard module hook 'hook-pypdfium2.py'
206589 INFO: Analyzing hidden import 'pdfplumber.cli'
206595 INFO: Analyzing hidden import 'pypdf'
```

**Build Output**:
- ✅ Portable EXE size: **321.9 MB** (vs 301.7 MB before)
- ✅ Built at: 23:04:06 on 2026-05-20
- ✅ All PDF packages present in `_internal` folder

---

## Related Fixes from Previous Session

### 2. **OCR Backend Downloads Silently Failed**
**Status**: ✅ Fixed (see [LITE_BUILD_DEPLOYMENT.md](LITE_BUILD_DEPLOYMENT.md))
- GOT-OCR2_0 manifest had non-existent `tokenizer.json` file
- docTR and PaddleOCR blocked (private HF repos, libraries not bundled)
- Global download banner now shows progress on top of UI

### 3. **Download Progress Not Visible**
**Status**: ✅ Fixed
- Added indigo global banner (z-[200]) always visible during OCR downloads
- Modal includes sticky header with download progress
- Indeterminate animated progress bar (since `snapshot_download` doesn't report byte-level progress)

### 4. **Error Toast Hidden Behind Modal**
**Status**: ✅ Fixed
- Error toast z-index changed from `z-50` to `z-[250]` 
- Now visible above modal (z-120) and settings panel (z-130)

---

## Build Environment Details

**Build Machine**: Windows 11 10.0.26200  
**Python Environment**: `C:\Users\user\AppData\Local\hermes\hermes-agent\venv` (Python 3.12.12)
**PyInstaller**: 6.20.0  
**Electron**: 41.3.0  
**electron-builder**: 26.8.1

**Bundled Packages** (verified in build):
```
✅ pdfplumber
✅ pypdf  
✅ pdfminer
✅ cv2 (opencv-python 4.13.0.92)
✅ pypdfium2
✅ uvicorn
✅ fastapi
✅ chromadb
✅ pptx (python-pptx)
✅ transformers
✅ torch (2.11.0)
✅ huggingface_hub (1.11.0)
```

---

## Files Modified

| File | Changes |
|------|---------|
| [backend/SlideForge.spec](backend/SlideForge.spec) | Added pdfplumber, pypdf, pdfminer, cv2 to hidden imports & data files |
| [backend/SlideForge.prod.spec](backend/SlideForge.prod.spec) | Same additions |
| [App.tsx](App.tsx) | Error toast z-index z-50 → z-[250] |
| [types.ts](types.ts) | Added `available_in_lite?: boolean` to OcrBackendInfo |
| [components/OcrSetupModal.tsx](components/OcrSetupModal.tsx) | UI for unavailable backends, sticky progress banner |
| [backend/app/data/ocr_backends_manifest.json](backend/app/data/ocr_backends_manifest.json) | Fixed GOT-OCR2_0, marked others unavailable |
| [backend/app/services/ocr_asset_manager.py](backend/app/services/ocr_asset_manager.py) | Added `available_in_lite` check & subfolder path fixes |
| [backend/app/api/ocr.py](backend/app/api/ocr.py) | Exposed `available_in_lite` in API response |
| [index.css](index.css) | Added `@keyframes ocr-progress-slide` |

---

## Testing Checklist

- [ ] **PDF Processing**: Upload a text-rich PDF → should process without "No module named 'pdfplumber'" error
- [ ] **OCR Download**: Click OCR setup → GOT-OCR2_0 should download successfully (~1.4 GB)
- [ ] **Download Progress**: Global indigo banner visible at top during download
- [ ] **Download Progress Bar**: Animated sliding bar (not frozen at 0%)
- [ ] **Unavailable Backends**: docTR and PaddleOCR show amber "Not available in this build" badge
- [ ] **Error Messages**: Error toasts visible above modal if download fails
- [ ] **PDF with Tables**: pdfplumber should extract table structure correctly
- [ ] **Scanned PDFs**: Should prompt to download OCR models (GOT-OCR2_0)

---

## Known Constraints

1. **Build Environment is Locked**: PyInstaller uses `hermes\hermes-agent\venv` (not `backend\.venv`). This is by design to avoid a broken `setuptools-81.0.0.dist-info/METADATA` in the backend venv.

2. **Missing Libraries in LITE**:
   - `doctr` package is NOT installed (private HF repo, library doesn't exist in hermes venv)
   - `paddleocr` package is NOT installed  
   - `surya-ocr` requires optional GPU dependencies
   - These are blocked with `available_in_lite: false` in the manifest

3. **Snapshot Download Progress**: HuggingFace's `snapshot_download()` does not provide byte-level progress callbacks, so we use indeterminate animated progress bar instead of percentage-based

---

## Next Steps (Optional)

1. **Full Build**: To include all OCR engines, use `npm run package:full` instead of `package:lite`
2. **GPU Support**: Add optional CUDA/GPU detection and surya-ocr version selector
3. **Cloud OCR**: Consider adding cloud-based OCR as fallback for unavailable engines
4. **Telemetry**: Track which OCR backend users choose to guide future development

---

## Summary

All identified issues in the Electron version have been fixed:
- ✅ PDF processing libraries now bundled
- ✅ OCR downloads visible with proper progress UI
- ✅ Error messages always visible
- ✅ Unavailable backends clearly marked
- ✅ Build size increased minimally (20 MB for critical functionality)

**Status**: Ready for production testing
