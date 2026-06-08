#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=========================================================="
echo "🍓 Paxton Interpreter Raspberry Pi Deployment CLI"
echo "=========================================================="
echo "This script pushes your codebase to a Raspberry Pi,"
echo "installs dependencies, and configures it to run persistently via systemd."
echo "Ensure your Raspberry Pi is connected to WiFi and has SSH enabled."
echo ""

read -p "Enter Raspberry Pi IP address: " RPI_IP
read -p "Enter SSH Username [pi]: " RPI_USER
RPI_USER=${RPI_USER:-pi}

echo "Testing SSH Connection (you may be prompted for the password)..."
# Setting up ssh key so we don't have to keep entering password
if ! ssh -q -o BatchMode=yes -o ConnectTimeout=5 "$RPI_USER@$RPI_IP" exit; then
  echo "Initial connection needs SSH key setup (it's normal to ask for your password here)..."
  ssh-copy-id "$RPI_USER@$RPI_IP"
fi

echo "=========================================================="
echo "📦 Syncing codebase (excluding bulky folders)..."
echo "=========================================================="
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude 'uploads' --exclude '*.json' --exclude 'whisper' ./ "$RPI_USER@$RPI_IP:~/paxton-interpreter/"

echo "=========================================================="
echo "🔧 Running setup directly on the Raspberry Pi..."
echo "=========================================================="

ssh -t "$RPI_USER@$RPI_IP" << 'EOF'
  set -e
  
  echo "=> [1/4] Updating system & installing prerequisites"
  sudo apt-get update
  sudo apt-get install -y curl build-essential git cmake ffmpeg
  
  echo "=> [2/4] Verifying Node.js"
  if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "✅ Node.js $(node -v) is already installed."
  fi
  
  echo "=> [3/4] Verifying Ollama (Llama 3 Runtime)"
  if ! command -v ollama >/dev/null 2>&1; then
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
  else
    echo "✅ Ollama is already installed."
  fi
  
  sudo systemctl start ollama || true
  sudo systemctl enable ollama || true
  
  # Pull the base Llama 3 model silently in background so we don't block forever
  if ! ollama list | grep -q "llama3"; then
    echo "Llama 3 model missing. Pulling in background..."
    nohup ollama pull llama3 > ollama-pull.log 2>&1 &
  fi

  echo "=> [4/4] Setting up Paxton systemd service (Run on startup)"
  cd ~/paxton-interpreter
  echo "Installing Node dependencies..."
  npm install --omit=dev --no-audit --no-fund
  
  sudo bash -c "cat > /etc/systemd/system/paxton.service << EMD
[Unit]
Description=Paxton Interpreter Server
After=network.target ollama.service

[Service]
Environment=\"PORT=80\"
Environment=\"OLLAMA_HOST=0.0.0.0\"
WorkingDirectory=/home/$USER/paxton-interpreter
ExecStart=/usr/bin/npm run launch
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EMD"

  sudo systemctl daemon-reload
  sudo systemctl enable paxton.service
  sudo systemctl restart paxton.service
  
  echo ""
  echo "=========================================================="
  echo "✅ Paxton Interpreter successfully installed & running headless!"
  echo "🌐 Access it from your network via browser at: http://$(hostname -I | awk '{print $1}')"
  echo "ℹ️  The background service will automatically boot on startup."
  echo "=========================================================="
EOF

echo "Done."
