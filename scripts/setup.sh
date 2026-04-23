#!/bin/bash
set -e

echo "=== YouTube Agent Setup ==="

# Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Python virtual environment
echo "Setting up Python virtual environment..."
cd video-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..

# Create directories
mkdir -p data output/videos

# Check for .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template — please fill in your credentials"
fi

# Check Ollama
if command -v ollama &> /dev/null; then
  echo "Ollama found. Make sure qwen2.5:14b and qwen2.5:7b are pulled."
else
  echo "WARNING: Ollama not found. Install from https://ollama.com"
fi

# Check FFmpeg
if command -v ffmpeg &> /dev/null; then
  echo "FFmpeg found."
else
  echo "WARNING: FFmpeg not found. Install with: brew install ffmpeg"
fi

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Fill in .env with your YouTube and Gmail credentials"
echo "  2. Run: ollama pull qwen2.5:14b && ollama pull qwen2.5:7b"
echo "  3. Run: npm run build"
echo "  4. Run: npx youtube-agent plan"
