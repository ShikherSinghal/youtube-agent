$ErrorActionPreference = "Stop"

Write-Host "=== YouTube Agent Setup ==="

function Test-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Python {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  if (Test-Command "py") {
    & py -3 @Arguments
    return
  }

  if (Test-Command "python") {
    & python @Arguments
    return
  }

  throw "Python was not found. Install Python 3.10+ and make sure it is available as 'py' or 'python'."
}

Write-Host "Installing Node.js dependencies..."
npm install

Write-Host "Setting up Python virtual environment..."
Push-Location "video-engine"
try {
  Invoke-Python -Arguments @("-m", "venv", ".venv")

  $venvPython = Join-Path ".venv" "Scripts/python.exe"
  & $venvPython -m pip install --upgrade pip
  & $venvPython -m pip install -r "requirements.txt"
}
finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path "data", "output/videos" | Out-Null

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from template - please fill in your credentials"
}

if (Test-Command "ollama") {
  Write-Host "Ollama found. Make sure qwen2.5:14b and qwen2.5:7b are pulled."
}
else {
  Write-Host "WARNING: Ollama not found. Install from https://ollama.com"
}

if (Test-Command "ffmpeg") {
  Write-Host "FFmpeg found."
}
else {
  Write-Host "WARNING: FFmpeg not found. Install with: winget install Gyan.FFmpeg"
}

Write-Host ""
Write-Host "=== Setup complete ==="
Write-Host "Next steps:"
Write-Host "  1. Fill in .env with your YouTube and Gmail credentials"
Write-Host "  2. Run: ollama pull qwen2.5:14b; ollama pull qwen2.5:7b"
Write-Host "  3. Run: npm run build"
Write-Host "  4. Run: npx youtube-agent plan"
