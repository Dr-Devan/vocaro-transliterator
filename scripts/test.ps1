$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Create .venv and install backend/requirements-dev.txt first. See README.md.' }
Push-Location (Join-Path $projectRoot 'backend')
try {
    & $pythonPath -m pytest tests -q
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
} finally { Pop-Location }
$apiProcess = $null
try {
    $health = $null
    try { $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 } catch { }
    if ($health) {
        if ($health.version -ne '0.2.0') { throw 'Stop the old API server on port 8000 and retry.' }
    } else {
        $apiProcess = Start-Process -FilePath $pythonPath -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            Start-Sleep -Milliseconds 500
            try { $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; break } catch { }
        }
        if (-not $health) { throw 'API did not become ready' }
    }
    Push-Location (Join-Path $projectRoot 'frontend')
    try {
        & npm.cmd test
        if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
        & npm.cmd run test:e2e
        if ($LASTEXITCODE -ne 0) { throw 'Browser tests failed' }
    } finally { Pop-Location }
} finally {
    if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id }
}
