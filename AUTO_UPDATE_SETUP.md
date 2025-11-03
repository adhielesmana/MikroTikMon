# Auto-Update Setup Guide

This guide will help you set up automatic updates for your production MikroTik Monitor server at **mon.maxnetplus.id**.

## 🎯 What This Does

- Automatically checks for code updates from git every hour
- Deploys updates only when changes are detected
- Creates automatic backups before each update
- Logs all update activity
- Rolls back on deployment failure

## 📋 Prerequisites

✅ Your production server must have:
- Git repository initialized (`git init` already done)
- Remote repository configured (`git remote add origin <url>`)
- SSH access to the server
- Docker and deploy.sh working

## 🚀 Installation (5 Minutes)

### Step 1: Upload Script to Production Server

Copy the `auto-update.sh` file to your production server:

```bash
# From your local machine / development environment
scp auto-update.sh user@mon.maxnetplus.id:/path/to/mikrotik-monitor/
```

Or manually copy the content and create the file on the server.

### Step 2: SSH to Production Server

```bash
ssh user@mon.maxnetplus.id
cd /path/to/mikrotik-monitor
```

### Step 3: Make Script Executable

```bash
chmod +x auto-update.sh
```

### Step 4: Test the Script Manually

```bash
./auto-update.sh
```

Expected output:
- If no updates: `✓ Already up to date`
- If updates available: `✅ Update deployed successfully!`

### Step 5: Set Up Automatic Hourly Updates

Create a cron job that runs every hour:

```bash
# Edit crontab
crontab -e
```

Add this line (adjust the path to your actual installation path):

```cron
# MikroTik Monitor - Auto Update (every hour)
0 * * * * cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1
```

**Important:** Replace `/path/to/mikrotik-monitor` with your actual path!

Example paths:
- `/home/user/mikrotik-monitor`
- `/opt/mikrotik-monitor`
- `/srv/mikrotik-monitor`

### Step 6: Verify Cron Job

```bash
# List your cron jobs
crontab -l
```

You should see the auto-update line.

## 📊 Monitoring & Logs

### View Update Logs

```bash
# Watch logs in real-time
tail -f /var/log/mikrotik-auto-update.log

# View recent logs
tail -50 /var/log/mikrotik-auto-update.log

# Search for successful updates
grep "deployed successfully" /var/log/mikrotik-auto-update.log

# Search for errors
grep "✗" /var/log/mikrotik-auto-update.log
```

### Log Rotation (Optional)

To prevent logs from growing too large:

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/mikrotik-auto-update
```

Add:
```
/var/log/mikrotik-auto-update.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
}
```

## 🔔 Optional: Notification Setup

You can configure notifications to get alerts when updates are deployed.

### Option 1: Email Notifications

Edit `auto-update.sh` and add at the end (before `exit 0`):

```bash
# Send email notification
echo "MikroTik Monitor updated to ${REMOTE:0:7}" | \
  mail -s "MikroTik Monitor Updated" your-email@example.com
```

### Option 2: Slack/Discord Webhook

Edit `auto-update.sh` and uncomment/modify the webhook section:

```bash
# For Slack
curl -X POST "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"🚀 MikroTik Monitor updated to ${REMOTE:0:7}\"}"

# For Discord
curl -X POST "https://discord.com/api/webhooks/YOUR/WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"🚀 MikroTik Monitor updated to ${REMOTE:0:7}\"}"
```

### Option 3: Telegram Bot

```bash
# Get your bot token and chat ID from @BotFather
TELEGRAM_BOT_TOKEN="your-bot-token"
TELEGRAM_CHAT_ID="your-chat-id"

curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=🚀 MikroTik Monitor updated to ${REMOTE:0:7}"
```

## 🎛️ Customization Options

### Change Update Frequency

Edit your crontab to change how often updates are checked:

```bash
# Every 30 minutes
*/30 * * * * cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1

# Every 6 hours
0 */6 * * * cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1

# Daily at 3 AM
0 3 * * * cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1

# Only on weekdays at 9 AM
0 9 * * 1-5 cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1
```

### Disable Auto-Updates Temporarily

```bash
# Comment out the cron job
crontab -e

# Add # at the beginning of the line
# 0 * * * * cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1
```

## 🧪 Testing

### Test Manual Update

```bash
# Run the script manually
./auto-update.sh

# Check the output and logs
tail /var/log/mikrotik-auto-update.log
```

### Test Cron Job

```bash
# Wait for the next hour, then check logs
tail -f /var/log/mikrotik-auto-update.log

# Or manually trigger cron (for testing)
cd /path/to/mikrotik-monitor && ./auto-update.sh >> /var/log/mikrotik-auto-update.log 2>&1
```

## 🛡️ Safety Features

The auto-update script includes several safety features:

1. **Automatic Backup**: Creates database backup before each update
2. **Rollback on Failure**: Reverts to previous version if deployment fails
3. **Update Detection**: Only deploys when actual changes exist
4. **Detailed Logging**: Timestamps all actions for auditing
5. **Error Handling**: Exits gracefully on errors

## 🔧 Troubleshooting

### Script Not Running

```bash
# Check cron service is running
sudo systemctl status cron

# Check cron logs
sudo tail /var/log/syslog | grep CRON

# Verify file permissions
ls -la auto-update.sh
# Should show: -rwxr-xr-x
```

### Git Errors

```bash
# Ensure git credentials are configured
git config --list

# Test git connection
git fetch origin main

# If using SSH keys, ensure they're loaded
ssh-add -l
```

### Deployment Failures

```bash
# Check deployment logs
./deploy.sh logs

# Manually run deployment
./deploy.sh update

# Check Docker status
docker compose ps
```

## 📝 How It Works

1. **Hourly Check**: Cron runs the script every hour
2. **Fetch Updates**: Script checks remote repository for changes
3. **Compare Versions**: Compares local vs. remote commit hashes
4. **Skip if Same**: If versions match, script exits (no action)
5. **Backup**: Creates database backup if updates found
6. **Pull Code**: Downloads latest code from repository
7. **Deploy**: Runs `./deploy.sh update` to rebuild and restart
8. **Verify**: Checks deployment success/failure
9. **Rollback**: Reverts on failure, keeps changes on success
10. **Log**: Records all activity with timestamps

## 🎉 Benefits

✅ **Zero Downtime**: Docker handles graceful container restarts  
✅ **Always Updated**: Production stays in sync with development  
✅ **Automatic Backups**: Database backed up before each update  
✅ **Error Recovery**: Automatic rollback on failure  
✅ **Audit Trail**: Complete logs of all updates  
✅ **Hassle-Free**: Set it once, forget about manual updates  

## 📞 Support

If you encounter issues:

1. Check logs: `tail -f /var/log/mikrotik-auto-update.log`
2. Test manually: `./auto-update.sh`
3. Verify cron: `crontab -l`
4. Check deployment: `./deploy.sh status`

---

**Now your production server will automatically stay up-to-date with the latest fixes and features!** 🚀
