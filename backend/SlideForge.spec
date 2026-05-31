# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, collect_dynamic_libs
import os

block_cipher = None

hidden_imports = []
hidden_imports += collect_submodules('uvicorn')
hidden_imports += collect_submodules('fastapi')
hidden_imports += collect_submodules('chromadb')
hidden_imports += collect_submodules('pptx')
hidden_imports += collect_submodules('langchain_core')
hidden_imports += collect_submodules('langgraph')
hidden_imports += collect_submodules('pydantic')
hidden_imports += collect_submodules('pydantic_core')
hidden_imports += collect_submodules('huggingface_hub')
hidden_imports += collect_submodules('pdfplumber')
hidden_imports += collect_submodules('pypdf')
hidden_imports += collect_submodules('pdfminer')
hidden_imports += collect_submodules('cv2')
hidden_imports += collect_submodules('paddleocr')
hidden_imports += collect_submodules('doctr')
hidden_imports += ['app.main']

static_source_dir = os.environ.get('SLIDEFORGE_STATIC_DIR', 'static_build')

datas = [
    (static_source_dir, 'static'),
    ('app/data', 'app/data'),
]
datas += collect_data_files('chromadb')
datas += collect_data_files('pptx')
datas += collect_data_files('langchain_core')
datas += collect_data_files('langgraph')
datas += collect_data_files('setuptools')
datas += collect_data_files('pkg_resources')
datas += collect_data_files('huggingface_hub')
datas += collect_data_files('pdfplumber')
datas += collect_data_files('pypdf')
datas += collect_data_files('pdfminer')
datas += collect_data_files('cv2')
datas += collect_data_files('paddleocr')
datas += collect_data_files('doctr')

binaries = []
binaries += collect_dynamic_libs('pydantic_core')

a = Analysis(
    ['app\\main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SlideForge',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='SlideForge',
)
