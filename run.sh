#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=========================================================="
echo "🚀 Paxton Interpreter Local Setup & Launch CLI"
echo "=========================================================="

echo "=> [1/8] System Compatibility Check"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required but not installed. Please install Node.js (v18+)."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but not installed."
  exit 1
fi
echo "✅ Node & NPM found. ($(node -v))"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "⚠️ FFmpeg is recommended/required for audio format conversions. Attempting to install..."
  if [[ "$OSTYPE" == "darwin"* ]] && command -v brew >/dev/null 2>&1; then
    echo "Installing FFmpeg via Homebrew..."
    brew install ffmpeg || echo "⚠️ Failed to install FFmpeg."
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Installing FFmpeg via apt-get..."
    sudo apt-get update && sudo apt-get install -y ffmpeg || echo "⚠️ Failed to install FFmpeg."
  else
    echo "⚠️ Cannot install FFmpeg automatically. Please install manually if needed."
  fi
else
  echo "✅ FFmpeg found."
fi

echo "=> [2/8] Checking AI Engine (Ollama)"
if ! command -v ollama >/dev/null 2>&1; then
  echo "⚠️ Ollama not found. Attempting automatic installation..."
  if curl -fsSL https://ollama.com/install.sh | sh; then
    echo "✅ Ollama installed successfully."
  else
    echo "❌ Ollama automatic installation failed. Please verify OS compatibility and install manually at https://ollama.com."
    exit 1
  fi
else
  echo "✅ Ollama found."
fi

echo "=> [3/8] Starting background Ollama daemon for local inference..."
if ! curl -s -f http://localhost:11434/api/tags >/dev/null 2>&1; then
  # Start Ollama binding to all network interfaces
  OLLAMA_HOST=0.0.0.0 ollama serve > ollama.log 2>&1 &
  OLLAMA_PID=$!
  echo -n "Waiting for Ollama to spin up..."
  while ! curl -s -f http://localhost:11434/api/tags >/dev/null 2>&1; do
    sleep 2
    echo -n "."
  done
  echo ""
  echo "✅ Ollama Gateway started locally."
else
  echo "✅ Ollama Gateway is already running."
fi

echo "=> [4/8] Verifying Local Models (Llama 3)"
if ! ollama list | grep -iq "llama3"; then
  echo "⚠️ Llama 3 not found locally. Downloading parameters (this may take several minutes depending on your connection)..."
  ollama pull llama3
  echo "✅ Llama 3 successfully downloaded."
else
  echo "✅ Llama 3 is already available locally."
fi

echo "=> [5/8] Checking Whisper.cpp (Local STT API)"
WHISPER_DIR="./whisper.cpp"
if [ ! -d "$WHISPER_DIR" ]; then
  echo "⚠️ Whisper.cpp not found. Cloning locally..."
  git clone https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR" || git clone https://github.com/ggml-org/whisper.git "$WHISPER_DIR"
fi

cd "$WHISPER_DIR"

SERVER_BUILT=false
if [ -f "./build/bin/whisper-server" ] || [ -f "./server" ] || [ -f "./whisper-server" ]; then
  SERVER_BUILT=true
fi

if [ "$SERVER_BUILT" = false ]; then
  echo "⚠️ Whisper server not built. Building locally..."
  if ! command -v cmake >/dev/null 2>&1; then
    echo "⚠️ CMake is required but not found. Attempting to install it..."
    if [[ "$OSTYPE" == "darwin"* ]] && command -v brew >/dev/null 2>&1; then
      echo "Installing CMake via Homebrew..."
      brew install cmake
    elif command -v apt-get >/dev/null 2>&1; then
      echo "Installing CMake and build-essential via apt-get..."
      sudo apt-get update && sudo apt-get install -y build-essential cmake
    else
      echo "❌ Cannot install cmake automatically. Please install it manually:"
      echo "macOS: brew install cmake (or xcode-select --install)"
      echo "Ubuntu/Debian: sudo apt update && sudo apt install build-essential cmake"
      exit 1
    fi
  fi
  
  if command -v cmake >/dev/null 2>&1; then
    echo "⚙️  Building with CMake..."
    cmake -B build -DWHISPER_BUILD_SERVER=ON -DWHISPER_METAL=ON
    cmake --build build --config Release
  else
    echo "❌ CMake installation failed. Please install manually to build Whisper server."
    exit 1
  fi
  
  echo "Downloading base.en model..."
  bash ./models/download-ggml-model.sh base.en
  echo "✅ Whisper.cpp built successfully."
else
  echo "✅ Whisper.cpp directory and server executable found."
fi
cd ..

echo "=> [6/8] Starting Whisper OS API Gateway..."
if ! curl -s -f http://localhost:8080/ >/dev/null 2>&1; then
  echo "Starting Whisper server on port 8080..."
  cd whisper.cpp
  WHISPER_EXEC=""
  if [ -f "./build/bin/whisper-server" ]; then
    WHISPER_EXEC="./build/bin/whisper-server"
  elif [ -f "./server" ]; then
    WHISPER_EXEC="./server"
  elif [ -f "./whisper-server" ]; then
    WHISPER_EXEC="./whisper-server"
  else
    echo "❌ Whisper server executable not found!"
    exit 1
  fi
  $WHISPER_EXEC -m models/ggml-base.en.bin --port 8080 --host 0.0.0.0 > ../whisper.log 2>&1 &
  WHISPER_PID=$!
  cd ..
  echo -n "Waiting for Whisper server to spin up..."
  while ! curl -s http://localhost:8080/ >/dev/null 2>&1; do
    sleep 2
    echo -n "."
  done
  echo ""
  echo "✅ Whisper Gateway is running."
else
  echo "✅ A server is already running on port 8080. Assuming it's Whisper."
fi

echo "=> [7/8] Verifying & Installing Node Dependencies"
npm install --no-audit --no-fund
if [ $? -ne 0 ]; then
    echo "❌ Failed to install npm dependencies."
    exit 1
fi
echo "✅ Node dependencies ready."

echo "=> [8/8] Launching Paxton Interpreter Ecosystem"
echo "=========================================================="
echo "🌐 The local server environment is now spinning up."
echo ""
echo "If this is your first time loading, Vite may take a second"
echo "to bundle dependencies."
echo ""
echo "To shut down the entire system safely, press [Ctrl+C]."
echo "=========================================================="

# Register cleanup for when the user hits Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down Paxton Interpreter server..."
    if [ ! -z "$OLLAMA_PID" ]; then
        echo "🛑 Stopping background Ollama daemon (PID: $OLLAMA_PID)..."
        kill $OLLAMA_PID 2>/dev/null || true
    fi
    if [ ! -z "$WHISPER_PID" ]; then
        echo "🛑 Stopping background Whisper API (PID: $WHISPER_PID)..."
        kill $WHISPER_PID 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM

# Run the dev server
npm run dev
