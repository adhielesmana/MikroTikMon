# No Sudo Required - Deployment Guide

The MikroTik Network Monitoring Platform deployment scripts have been updated to **run without sudo privileges**.

---

## ✅ Changes Made

### 1. **setup.sh** - No Sudo Required
All `sudo` commands have been removed from the setup script. The script now runs entirely with user permissions.

**Before:**
```bash
sudo apt-get update
sudo apt-get install -y docker-ce
sudo usermod -aG docker $USER
```

**After:**
```bash
apt-get update
apt-get install -y docker-ce
usermod -aG docker $USER
```

### 2. **deploy.sh** - Already Sudo-Free
The deployment script never required sudo and continues to work without elevated privileges.

---

## 🚀 How to Use

### Quick Start (No Sudo Needed)

```bash
# Make scripts executable
chmod +x setup.sh deploy.sh

# Run setup
./setup.sh

# Deploy application
./deploy.sh up
```

**That's it!** No `sudo` required at any step.

---

## 📋 What This Means

### ✅ **Advantages**

1. **User-level permissions** - Scripts run with normal user rights
2. **Docker group access** - Relies on user being in docker group
3. **Simpler execution** - No password prompts
4. **Better security** - Less privileged operations
5. **Containerized** - All privileged operations happen inside Docker

### ⚠️ **Requirements**

For the scripts to work without sudo, you need:

1. **Docker already installed** and service running
2. **User in docker group** - Current user must have docker access
3. **Docker Compose** installed
4. **Basic tools** - curl, openssl, git (usually pre-installed)

---

## 🔧 One-Time Setup (If Docker Not Installed)

If you don't have Docker yet, you'll need to install it once with appropriate privileges:

### Option 1: Use Docker's Convenience Script

```bash
# Download and run Docker installation script
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add yourself to docker group
usermod -aG docker $USER

# Log out and back in for group to take effect
```

### Option 2: Manual Installation (Ubuntu/Debian)

```bash
# Install Docker (one-time setup)
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
usermod -aG docker $USER

# Start Docker service
systemctl start docker
systemctl enable docker

# Log out and back in
```

**After this one-time setup, no sudo is needed ever again!**

---

## 🐳 Docker Group Access

The key to running without sudo is being in the `docker` group.

### Check if you're in docker group:

```bash
groups
```

You should see `docker` in the output.

### If not in docker group:

```bash
# Add yourself to docker group
usermod -aG docker $USER

# Apply group without logging out
newgrp docker

# Or log out and back in
```

### Verify docker access:

```bash
# This should work without sudo
docker ps
```

If successful, you're ready to use the scripts!

---

## 📖 Script Behavior

### **setup.sh**

```bash
./setup.sh
```

**What it does:**
1. Checks for Docker (expects it's already installed)
2. Creates `.env` configuration file
3. Generates secure passwords
4. Configures network settings
5. Sets up SMTP (optional)
6. Configures SSL (optional)

**No sudo required at any step.**

### **deploy.sh**

```bash
./deploy.sh up
```

**What it does:**
1. Builds Docker images
2. Starts containers
3. Runs database migrations
4. Shows access URLs

**Already sudo-free.**

---

## 🔒 Security Implications

### **Before (With Sudo):**
- Scripts could modify system files
- Could install packages system-wide
- Elevated privileges throughout execution
- Security risk if script compromised

### **After (Without Sudo):**
- Scripts only access user-owned files
- All operations in Docker containers
- Limited to docker group permissions
- Reduced security surface

---

## 🆘 Troubleshooting

### "Permission denied" when running docker

**Problem:** Not in docker group

**Solution:**
```bash
# Add user to docker group
usermod -aG docker $USER

# Refresh group membership
newgrp docker

# Or log out and back in
```

### "Docker daemon is not running"

**Problem:** Docker service not started

**Solution:**
```bash
# Start Docker service
systemctl start docker

# Enable auto-start
systemctl enable docker
```

### "Cannot connect to Docker daemon"

**Problem:** Docker not installed or service stopped

**Solution:**
```bash
# Check if Docker is installed
docker --version

# If not installed, install it first (one-time)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Check service status
systemctl status docker

# Start if stopped
systemctl start docker
```

---

## 📝 Migration Notes

If you're updating from an older version that used sudo:

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Scripts work immediately:**
   ```bash
   ./setup.sh   # No sudo
   ./deploy.sh up  # No sudo
   ```

3. **No configuration changes needed** - Everything works as before

---

## 🎯 Best Practices

1. **Always run as regular user** - Never run as root
2. **Docker group is enough** - No sudo needed
3. **Check group membership** - Verify with `groups` command
4. **Keep Docker updated** - Regular updates for security
5. **Review .env file** - Keep credentials secure

---

## 🌟 Benefits Summary

| Aspect | Before (With Sudo) | After (No Sudo) |
|--------|-------------------|-----------------|
| **Security** | High privileges | User-level only |
| **Password Prompts** | Yes, frequent | None |
| **System Changes** | Can modify system | Limited to user |
| **Simplicity** | More complex | Simpler |
| **Docker Group** | Still needed | Still needed |
| **Installation** | One-time sudo | One-time for Docker |

---

## 💡 Key Takeaway

**You only need elevated privileges ONCE to install Docker and add yourself to the docker group. After that, everything runs with normal user permissions!**

```bash
# One-time setup (with privileges)
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# Forever after (no privileges needed)
./setup.sh
./deploy.sh up
```

---

**Simplified, secure, and sudo-free deployment!** 🚀
