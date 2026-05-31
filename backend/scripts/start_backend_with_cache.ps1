$repoRoot = 'F:\code project\SlideForge\backend'
Set-Location -LiteralPath $repoRoot
$env:SLIDEFORGE_OCR_DIR = 'C:\Users\user\.slideforge\data\ocr_models'
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
$maxRetries = 3
$attempt = 0
$exitCode = 0
while ($attempt -lt $maxRetries) {
	$attempt++
	Write-Host "Starting backend (attempt $attempt of $maxRetries)..."
	& $python -u scripts/start_backend_and_wait.py
	$exitCode = $LASTEXITCODE
	if ($exitCode -eq 0) {
		Write-Host "Backend started successfully."
		break
	}
	Write-Warning "start_backend_and_wait.py exited with code $exitCode. Retrying..."
	$sleep = [math]::Min(30, [math]::Pow(2, $attempt))
	Start-Sleep -Seconds $sleep
}
if ($exitCode -ne 0) {
	Write-Error "Failed to start backend after $maxRetries attempts. Exit code: $exitCode"
	exit $exitCode
}
