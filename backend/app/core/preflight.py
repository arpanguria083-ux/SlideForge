import os
import sys
import shutil
import subprocess
import urllib.request
from datetime import datetime
from pathlib import Path

def run_preflight_checks(data_dir: str) -> dict:
    checks = []

    # 1. Check System RAM (Prerequisite Check)
    try:
        import psutil
        mem = psutil.virtual_memory()
        total_gb = mem.total / (1024**3)
        if total_gb >= 15.5:
            checks.append({"name": "SYSTEM_RAM", "status": "OK", "message": f"{total_gb:.1f} GB RAM (Optimal spec detected)"})
        elif total_gb >= 7.5:
            checks.append({"name": "SYSTEM_RAM", "status": "WARNING", "message": f"{total_gb:.1f} GB RAM (Minimum 8GB met, but may experience slowdown during heavy OCR)"})
        else:
            checks.append({"name": "SYSTEM_RAM", "status": "ERROR", "message": f"{total_gb:.1f} GB RAM (Below minimum 8GB requirement)"})
    except Exception as e:
        checks.append({"name": "SYSTEM_RAM", "status": "WARNING", "message": f"Could not audit virtual memory: {e}"})

    # 2. Check Disk Space (Prerequisite Check)
    try:
        data_path = Path(data_dir)
        data_path.mkdir(parents=True, exist_ok=True)
        total, used, free = shutil.disk_usage(str(data_path.absolute()))
        free_gb = free / (1024**3)
        if free_gb >= 5.0:
            checks.append({"name": "DISK_SPACE", "status": "OK", "message": f"{free_gb:.1f} GB free space available in data directory"})
        elif free_gb >= 2.0:
            checks.append({"name": "DISK_SPACE", "status": "WARNING", "message": f"{free_gb:.1f} GB free space (Low space; local models and caches may fill up)"})
        else:
            checks.append({"name": "DISK_SPACE", "status": "ERROR", "message": f"{free_gb:.1f} GB free space (Critical; below 2GB prerequisite)"})
    except Exception as e:
        checks.append({"name": "DISK_SPACE", "status": "WARNING", "message": f"Could not audit free disk space: {e}"})

    # 3. Check GPU Acceleration (CUDA / PyTorch Check)
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            checks.append({"name": "GPU_ACCELERATION", "status": "OK", "message": f"CUDA GPU Acceleration available (GPU: {device_name})"})
        else:
            checks.append({"name": "GPU_ACCELERATION", "status": "WARNING", "message": "CUDA GPU not detected. SlideForge will run OCR/ML models on CPU (slower performance)"})
    except Exception as e:
        checks.append({"name": "GPU_ACCELERATION", "status": "WARNING", "message": f"Could not check GPU state: PyTorch check failed: {e}"})

    # 4. Check Local LLM Engines (Ollama & LM Studio Checks)
    # Check Ollama status
    try:
        # Use short timeout to avoid blocking startup
        req = urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=0.8)
        if req.status == 200:
            checks.append({"name": "OLLAMA_ENGINE", "status": "OK", "message": "Local Ollama engine detected (Port 11434 is active)"})
        else:
            checks.append({"name": "OLLAMA_ENGINE", "status": "WARNING", "message": f"Local Ollama engine is active but returned status code {req.status}"})
    except Exception:
        checks.append({"name": "OLLAMA_ENGINE", "status": "WARNING", "message": "Local Ollama service not running on port 11434 (Configure remote or start Ollama)"})

    # Check LM Studio status (optional check, reported if online)
    try:
        req = urllib.request.urlopen("http://127.0.0.1:1234/v1/models", timeout=0.8)
        if req.status == 200:
            checks.append({"name": "LM_STUDIO_ENGINE", "status": "OK", "message": "Local LM Studio engine detected (Port 1234 is active)"})
    except Exception:
        pass  # Do not warn for LM Studio if missing, since Ollama is the primary default local engine

    # 5. Check Java Runtime (LanguageTool Grammar Prerequisite)
    try:
        # Run java -version inside a subprocess
        subprocess.run(["java", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.0, shell=True)
        checks.append({"name": "JAVA_RUNTIME", "status": "OK", "message": "Java runtime environment detected (supports LanguageTool grammar)"})
    except Exception:
        checks.append({"name": "JAVA_RUNTIME", "status": "WARNING", "message": "Java not detected in PATH. Local LanguageTool grammar reviewing will be unavailable"})

    # 6. Check Offline Envs
    t_offline = os.environ.get("TRANSFORMERS_OFFLINE") == "1"
    h_offline = os.environ.get("HF_DATASETS_OFFLINE") == "1"
    if t_offline and h_offline:
        checks.append(
            {"name": "OFFLINE_ISOLATION", "status": "OK", "message": "Offline mode enforced (Local operations isolated)"}
        )
    else:
        checks.append(
            {
                "name": "OFFLINE_ISOLATION",
                "status": "WARNING",
                "message": "Offline mode not strictly enforced (Some Hugging Face modules may perform online validation check)",
            }
        )

    # 7. Check Data Dir Writable
    try:
        data_path = Path(data_dir)
        data_path.mkdir(parents=True, exist_ok=True)
        test_file = data_path / ".preflight_check"
        test_file.write_text("ok")
        test_file.unlink()
        checks.append(
            {
                "name": "DATA_DIR_WRITABLE",
                "status": "OK",
                "message": "Data directory has healthy read/write permission",
            }
        )
    except Exception as e:
        checks.append(
            {
                "name": "DATA_DIR_WRITABLE",
                "status": "ERROR",
                "message": f"Data directory not writable: {e}",
            }
        )

    # 8. Check ChromaDB Dir
    chroma_path = Path(data_dir) / "chromadb"
    if chroma_path.exists():
        checks.append(
            {
                "name": "CHROMADB_DIR",
                "status": "OK",
                "message": "ChromaDB database folder exists",
            }
        )
    else:
        checks.append(
            {
                "name": "CHROMADB_DIR",
                "status": "MISSING",
                "message": "ChromaDB database folder not found (will be created automatically on first run)",
            }
        )

    # 9. Python Version
    if sys.version_info >= (3, 11):
        checks.append(
            {
                "name": "PYTHON_VERSION",
                "status": "OK",
                "message": f"Python version {sys.version.split()[0]} is compatible",
            }
        )
    else:
        checks.append(
            {
                "name": "PYTHON_VERSION",
                "status": "WARNING",
                "message": f"Python version {sys.version.split()[0]} is below the recommended 3.11+",
            }
        )

    overall = "OK"
    if any(c["status"] == "ERROR" for c in checks):
        overall = "ERROR"
    elif any(c["status"] in ["WARNING", "MISSING"] for c in checks):
        overall = "WARNING"

    return {
        "timestamp": datetime.now().isoformat(),
        "checks": checks,
        "overall": overall,
    }
