# Setup Script Guide - Automatic Installation

The `setup.sh` script now **automatically installs Docker and all required dependencies** if they're not present on your system.

---

## 🚀 Quick Start

```bash
# Make script executable
chmod +x setup.sh

# Run setup script
./setup.sh
```

**That's it!** The script will handle everything automatically.

---

## ✨ What Gets Installed Automatically

### 1. **Docker & Docker Compose**

If Docker is not installed, the script will:
- Detect your OS (Ubuntu/Debian/CentOS/RHEL/Fedora)
- Ask if you want to install Docker automatically
- Install Docker CE (Community Edition)
- Install Docker Compose plugin
- Add your user to the docker group
- Start and enable Docker service

**Supported Operating Systems:**
- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ CentOS 8+
- ✅ RHEL 8+
- ✅ Fedora
- ⚠️ macOS (requires manual Docker Desktop installation)

### 2. **Additional Prerequisites**

The script also installs:
- `curl` - For downloading resources
- `wget` - For file downloads
- `git` - For version control
- `openssl` - For generating secure passwords
- `dnsutils` / `bind-utils` - For DNS verification
- `net-tools` - For network diagnostics

---

## 📋 Installation Flow

### Step 1: Check for Docker

```bash
./setup.sh
```

**If Docker is NOT installed:**
```
⚠ Docker is not installed

Would you like to install Docker automatically? (y/N):
```

- Press **`y`** to auto-install
- Press **`n`** to install manually

### Step 2: Docker Installation

```
ℹ Installing Docker for ubuntu...
ℹ Installing Docker on Ubuntu/Debian...
✓ Docker installed successfully
⚠ You may need to log out and back in for group changes to take effect
```

### Step 3: Group Permissions

After installation, you'll see:

```
⚠ Docker group changes require a new login session

Please run ONE of the following commands:
  Option 1 (Recommended): Log out and log back in, then run ./setup.sh again
  Option 2 (Quick): Run: newgrp docker && ./setup.sh
```

**Option 1 (Recommended):**
```bash
# Log out and log back in
# Then run:
./setup.sh
```

**Option 2 (Quick):**
```bash
newgrp docker && ./setup.sh
```

### Step 4: Complete Setup

After Docker is ready, the script continues with:
1. Network configuration (IP or domain)
2. Secure credentials generation
3. SMTP configuration (optional)
4. SSL certificate setup (optional)
5. Google OAuth (optional)

---

## 🎯 Example Session (Fresh Ubuntu Server)

```bash
$ ./setup.sh

=========================================
  MikroTik Monitor - Setup Script
=========================================

ℹ Checking prerequisites...
⚠ Docker is not installed

Would you like to install Docker automatically? (y/N): y

ℹ Installing Docker for ubuntu...
ℹ Installing Docker on Ubuntu/Debian...
[... installation output ...]
✓ Docker installed successfully
✓ Docker Compose plugin installed
✓ All prerequisites are installed
ℹ Detected server IP: 192.168.1.100

=========================================
  Network Configuration
=========================================

Options:
  1. IP address only (HTTP) - Quick setup, no SSL
  2. Domain name (HTTP) - Use custom domain without SSL
  3. Domain name (HTTPS) - Use custom domain with automatic SSL setup

Choose option (1/2/3): 1

✓ Using IP address: 192.168.1.100
✓ Network configuration complete
  Access URL: http://192.168.1.100:5000

[... continues with setup ...]
```

---

## 🔧 Manual Installation (If Automatic Fails)

### Ubuntu/Debian

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker repository
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### CentOS/RHEL

```bash
# Install prerequisites
sudo yum install -y yum-utils

# Add Docker repository
sudo yum-config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo

# Install Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### macOS

```bash
# Install Docker Desktop manually
# Visit: https://www.docker.com/products/docker-desktop
# Download and install Docker Desktop for Mac
# Start Docker Desktop
# Then run: ./setup.sh
```

---

## 🐛 Troubleshooting

### "Permission denied" when running docker

**Problem:** Docker requires sudo or group membership

**Solution:**
```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Option 1: Log out and back in
# Option 2: Apply group immediately
newgrp docker
```

### "Docker daemon not running"

**Problem:** Docker service not started

**Solution:**
```bash
# Start Docker service
sudo systemctl start docker

# Enable auto-start on boot
sudo systemctl enable docker

# Check status
sudo systemctl status docker
```

### Script fails on unsupported OS

**Problem:** OS not supported by auto-installer

**Solution:**
```bash
# Install Docker manually following official documentation
# Visit: https://docs.docker.com/engine/install/

# Then run setup script
./setup.sh
```

### "Cannot connect to Docker daemon"

**Problem:** User not in docker group or service not running

**Solution:**
```bash
# Check Docker is running
sudo systemctl status docker

# If stopped, start it
sudo systemctl start docker

# Check group membership
groups

# If 'docker' not listed, add user and re-login
sudo usermod -aG docker $USER
# Log out and back in
```

---

## ⚙️ Advanced Options

### Silent Installation (Non-Interactive)

For automated deployments, you can pre-install Docker:

```bash
# Install Docker first
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Then run setup
./setup.sh
```

### Skip Prerequisites Check

If you want to skip prerequisite installation:

```bash
# When prompted "Install missing prerequisites? (Y/n):"
# Press 'n'
```

### Verify Installation

```bash
# Check Docker version
docker --version

# Check Docker Compose
docker compose version

# Test Docker
docker run hello-world
```

---

## 📝 What Happens After Setup

After `./setup.sh` completes, you'll have:

1. ✅ Docker installed and running
2. ✅ Docker Compose plugin installed
3. ✅ `.env` file created with secure credentials
4. ✅ Directories created (`logs/`, `ssl/`)
5. ✅ SSL certificates (if configured)
6. ✅ Ready to deploy!

**Next steps:**

```bash
# Start the application
./deploy.sh up

# Or with Nginx (if SSL configured)
./deploy.sh up --with-nginx

# Access your application
# http://your-ip:5000 or https://your-domain
```

---

## 🔐 Security Notes

- **Secure passwords** are auto-generated (32 characters)
- **Session secrets** are randomly created
- **Docker group** grants significant privileges (equivalent to root)
- **`.env` file** contains sensitive data - never commit to git

---

## 📖 Related Documentation

- **Fresh Deployment:** See `FRESH_DEPLOYMENT.md` for non-Docker installation
- **Docker Deployment:** See `DEPLOYMENT.md` for Docker-specific guide
- **Database Schema:** See `DATABASE_SCHEMA.md` for database details

---

## 🆘 Getting Help

If automatic installation fails:

1. Check the error message
2. Consult the Troubleshooting section above
3. Check Docker documentation: https://docs.docker.com
4. Install Docker manually, then run `./setup.sh` again

---

**The enhanced setup.sh script makes deployment effortless!** 🚀
