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
  echo "⚠️ FFmpeg is required for audio format conversions. Attempting to install..."
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
  printf "Waiting for Ollama to spin up..."
  OLLAMA_WAIT=0
  while ! curl -s -f http://localhost:11434/api/tags >/dev/null 2>&1; do
    if [ $OLLAMA_WAIT -ge 20 ]; then
      echo ""
      echo "⚠️ Ollama daemon did not report healthy within 20s. Check ollama.log."
      break
    fi
    sleep 1
    OLLAMA_WAIT=$((OLLAMA_WAIT + 1))
    printf "."
  done
  echo ""
  echo "✅ Ollama Gateway started locally."
else
  echo "✅ Ollama Gateway is already running."
fi

echo "=> [4/8] Verifying Local Models (Llama 3)"
if ! ollama list | grep -iq "llama3"; then
  echo "⚠️ Llama 3 not found locally. Downloading parameters (this may take several minutes)..."
  ollama pull llama3
  echo "✅ Llama 3 successfully downloaded."
else
  echo "✅ Llama 3 is already available locally."
fi

echo "=> [5/8] Checking Whisper.cpp (Local STT API)"
WHISPER_DIR="./whisper.cpp"
if [ ! -d "$WHISPER_DIR" ]; then
  echo "⚠️ Whisper repository not found. Cloning locally..."
  git clone https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR" || git clone https://github.com/ggml-org/whisper.git "$WHISPER_DIR"
fi

cd "$WHISPER_DIR"

SERVER_BUILT="false"
if [ -f "./build/bin/whisper-server" ] || [ -f "./build/bin/server" ] || [ -f "./build/bin/Release/whisper-server" ] || [ -f "./build/bin/Release/server" ] || [ -f "./server" ] || [ -f "./whisper-server" ]; then
  SERVER_BUILT="true"
fi

if [ "$SERVER_BUILT" = "false" ]; then
  echo "⚠️ Whisper server not built. Building it now..."
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
      echo "macOS: brew install cmake"
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
elif [ "$SERVER_BUILT" = "true" ]; then
  echo "✅ Whisper.cpp directory and server executable found."
fi

# Ensure model exists and is not corrupted/truncated (<50MB)
MODEL_FILE="models/ggml-base.en.bin"
if [ ! -f "$MODEL_FILE" ] && [ -f "models/ggml-base.bin" ]; then
  MODEL_FILE="models/ggml-base.bin"
fi

M_SIZE=0
if [ -f "$MODEL_FILE" ]; then
  M_SIZE=$(wc -c < "$MODEL_FILE" 2>/dev/null || echo 0)
fi

if [ ! -f "$MODEL_FILE" ] || [ "$M_SIZE" -lt 50000000 ]; then
  echo "⚠️ Whisper model is missing or incomplete (${M_SIZE} bytes). Downloading ggml-base.en.bin (~148MB)..."
  rm -f "$MODEL_FILE"
  bash ./models/download-ggml-model.sh base.en
  MODEL_FILE="models/ggml-base.en.bin"
fi

cd ..

echo "=> [6/8] Starting Whisper OS API Gateway..."
if ! curl -s -f http://localhost:8080/ >/dev/null 2>&1 && ! curl -s http://localhost:8080/inference >/dev/null 2>&1; then
  echo "Starting Whisper server on port 8080..."
  cd whisper.cpp
  WHISPER_EXEC=""
  if [ -f "./build/bin/whisper-server" ]; then
    WHISPER_EXEC="./build/bin/whisper-server"
  elif [ -f "./build/bin/server" ]; then
    WHISPER_EXEC="./build/bin/server"
  elif [ -f "./build/bin/Release/whisper-server" ]; then
    WHISPER_EXEC="./build/bin/Release/whisper-server"
  elif [ -f "./build/bin/Release/server" ]; then
    WHISPER_EXEC="./build/bin/Release/server"
  elif [ -f "./server" ]; then
    WHISPER_EXEC="./server"
  elif [ -f "./whisper-server" ]; then
    WHISPER_EXEC="./whisper-server"
  else
    echo "❌ Whisper server executable not found! Attempting to build..."
    cmake -B build -DWHISPER_BUILD_SERVER=ON
    cmake --build build --config Release -j
    if [ -f "./build/bin/whisper-server" ]; then
      WHISPER_EXEC="./build/bin/whisper-server"
    elif [ -f "./build/bin/server" ]; then
      WHISPER_EXEC="./build/bin/server"
    fi
  fi

  if [ -z "$WHISPER_EXEC" ] || [ ! -f "$WHISPER_EXEC" ]; then
    echo "❌ Whisper server executable could not be found or built."
    cd ..
    exit 1
  fi

  # Determine if --host flag is supported by the binary
  HOST_FLAG=""
  if $WHISPER_EXEC --help 2>&1 | grep -q -- "--host"; then
    HOST_FLAG="--host 0.0.0.0"
  fi

  $WHISPER_EXEC -m "$MODEL_FILE" --port 8080 $HOST_FLAG > ../whisper.log 2>&1 &
  WHISPER_PID=$!
  cd ..

  printf "Waiting for Whisper server to spin up..."
  MAX_WAIT=20
  WAITED=0
  WHISPER_READY=false

  while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if Whisper process died
    if ! kill -0 $WHISPER_PID 2>/dev/null; then
      echo ""
      echo "❌ Whisper process exited abruptly (PID: $WHISPER_PID)!"
      if [ -f "whisper.log" ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📋 whisper.log output:"
        tail -n 25 whisper.log
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      fi

      echo "⚙️ Attempting automatic recovery..."
      cd whisper.cpp
      # Check if model was corrupted
      CURR_SIZE=$(wc -c < "$MODEL_FILE" 2>/dev/null || echo 0)
      if [ "$CURR_SIZE" -lt 50000000 ]; then
        echo "📥 Re-downloading ggml-base.en.bin..."
        rm -f "$MODEL_FILE"
        bash ./models/download-ggml-model.sh base.en
      fi

      echo "🔨 Rebuilding Whisper server cleanly..."
      rm -rf build
      cmake -B build -DWHISPER_BUILD_SERVER=ON
      cmake --build build --config Release -j
      
      if [ -f "./build/bin/whisper-server" ]; then
        WHISPER_EXEC="./build/bin/whisper-server"
      elif [ -f "./build/bin/server" ]; then
        WHISPER_EXEC="./build/bin/server"
      fi

      echo "🚀 Restarting Whisper server..."
      $WHISPER_EXEC -m "$MODEL_FILE" --port 8080 > ../whisper.log 2>&1 &
      WHISPER_PID=$!
      cd ..
    fi

    if curl -s -f http://localhost:8080/ >/dev/null 2>&1 || curl -s http://localhost:8080/inference >/dev/null 2>&1; then
      WHISPER_READY=true
      break
    fi

    sleep 1
    WAITED=$((WAITED + 1))
    printf "."
  done
  echo ""
  if [ "$WHISPER_READY" = "true" ]; then
    echo "✅ Whisper Gateway is running."
  else
    echo "⚠️ Whisper server did not respond within ${MAX_WAIT}s. The main app will still launch."
    echo "You can check whisper.log for details."
  fi
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
