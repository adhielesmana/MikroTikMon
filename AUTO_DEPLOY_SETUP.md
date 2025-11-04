# 🚀 Automatic Deployment Setup Guide

Your MikroTik monitoring platform now has **automatic deployment** from GitHub! The system checks for updates every 5 minutes and automatically pulls and deploys changes.

## How It Works

1. **Every 5 minutes**, the app checks GitHub for updates
2. If updates are found, it automatically pulls them
3. If `package.json` changed, it runs `npm install`
4. The application restarts automatically to apply changes

## Setup Instructions

### 1. Configure Git Repository

Make sure your Docker server has access to your GitHub repository:

```bash
# SSH into your Docker server
ssh user@mon.maxnetplus.id

# Navigate to your app directory
cd /path/to/your/app

# Configure Git (if not already done)
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Ensure you're on the main branch
git checkout main

# Set up Git credentials (choose one method):

# Method A: SSH Key (Recommended)
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your@email.com"
# Add the public key to GitHub: Settings > SSH Keys
cat ~/.ssh/id_ed25519.pub

# Method B: Personal Access Token
# Create token at: https://github.com/settings/tokens
git remote set-url origin https://YOUR_TOKEN@github.com/username/repo.git
```

### 2. Test Manual Pull

Verify that git pull works without prompting for credentials:

```bash
git pull origin main
```

If it asks for credentials, you need to set up SSH keys or a personal access token (see step 1).

### 3. Configure Docker for Auto-Restart

Update your `docker-compose.yml` to restart on exit:

```yaml
version: '3.8'
services:
  monitoring:
    build: .
    restart: always  # ← This ensures auto-restart after updates
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=your_database_url
      - SESSION_SECRET=your_session_secret
```

### 4. Deploy the Auto-Update Feature

```bash
# Pull the auto-update code
git pull origin main

# Rebuild and restart Docker container
docker-compose down
docker-compose up -d --build
```

### 5. Monitor Auto-Updates

Watch the logs to see the auto-update system in action:

```bash
# View real-time logs
docker-compose logs -f

# You'll see messages like:
# [Auto-Update] Starting automatic update checker (every 5 minutes)...
# [Auto-Update] Checking for updates from GitHub...
# [Auto-Update] ✅ Already up to date
```

## Customization

### Change Update Frequency

Edit `server/autoUpdate.ts`:

```typescript
// Check every 5 minutes (default)
const UPDATE_CHECK_INTERVAL = "*/5 * * * *";

// Change to every 10 minutes
const UPDATE_CHECK_INTERVAL = "*/10 * * * *";

// Change to every hour
const UPDATE_CHECK_INTERVAL = "0 * * * *";

// Change to every 30 minutes
const UPDATE_CHECK_INTERVAL = "*/30 * * * *";
```

### Disable Auto-Update

If you want to disable auto-updates temporarily:

```bash
# Set environment variable
export NODE_ENV=development

# Or in docker-compose.yml:
environment:
  - NODE_ENV=development
```

Auto-updates only run in production mode.

## Deployment Workflow

Now when you push changes to GitHub:

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin main
   ```

2. **Wait up to 5 minutes** - the app will automatically detect and deploy the update

3. **Monitor deployment:**
   ```bash
   docker-compose logs -f
   ```

## Troubleshooting

### Updates Not Pulling

**Problem:** Auto-update logs show errors

**Solution:**
```bash
# Check Git status
git status

# Ensure no local changes blocking pull
git stash

# Test manual pull
git pull origin main
```

### Container Not Restarting

**Problem:** Updates pull but app doesn't restart

**Solution:**
```bash
# Ensure Docker restart policy is set
docker inspect your-container-name | grep -A 5 RestartPolicy

# Should show: "Name": "always"
# If not, update docker-compose.yml with `restart: always`
```

### Permission Issues

**Problem:** Git pull fails with permission errors

**Solution:**
```bash
# Ensure proper SSH key permissions
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

# Or use HTTPS with token
git remote set-url origin https://YOUR_TOKEN@github.com/username/repo.git
```

## Manual Deployment

If you need to deploy manually:

```bash
# SSH into server
ssh user@mon.maxnetplus.id

# Navigate to app directory
cd /path/to/your/app

# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

## Security Notes

- Auto-update only runs in production (`NODE_ENV=production`)
- Make sure your GitHub repository is private for sensitive code
- Use SSH keys or personal access tokens (never commit passwords)
- The app exits gracefully to allow Docker to restart it

## Benefits

✅ **Zero Downtime Deployment** - Docker restarts the container seamlessly  
✅ **Automatic Updates** - No manual SSH required  
✅ **Dependency Management** - Auto-installs npm packages when needed  
✅ **Simple & Reliable** - Just push to GitHub and wait 5 minutes  
✅ **Production-Safe** - Only runs in production environment

---

**Need help?** Check the logs with `docker-compose logs -f` and look for `[Auto-Update]` messages.
