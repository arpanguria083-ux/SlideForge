# Start both frontend and backend for development

# This script will:
# 1. Start the backend FastAPI server on port 8000
# 2. Start the Vite frontend dev server on port 3000
#
# Usage: npm run dev:full

$backendDir = "backend"
$backendVenv = "$backendDir\.venv\Scripts\python.exe"
$backendApp = "app.main:app"

Write-Host "[slideforge] Starting backend server on port 8000..."
Start-Process -NoNewWindow -FilePath $backendVenv -ArgumentList "-m", "uvicorn", $backendApp, "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory $backendDir

Start-Sleep -Seconds 2

Write-Host "[slideforge] Starting frontend (Vite) dev server on port 3000..."
npm run dev
