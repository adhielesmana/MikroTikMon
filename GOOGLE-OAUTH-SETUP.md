# Google OAuth Setup Guide

This guide will help you set up Google OAuth authentication for your MikroTik Monitor application.

---

## Overview

Google OAuth allows users to sign in with their Google accounts. This is the recommended authentication method for self-hosted deployments.

**Benefits:**
- ✅ Secure authentication via Google
- ✅ No need to manage passwords
- ✅ Users can sign in with existing Google accounts
- ✅ Automatic profile information (name, email, photo)

---

## Step 1: Create Google OAuth Credentials

### 1.1 Go to Google Cloud Console

Visit: https://console.cloud.google.com/

### 1.2 Create a New Project (or select existing)

1. Click on the project dropdown (top left)
2. Click **"New Project"**
3. Enter project name: **"MikroTik Monitor"**
4. Click **"Create"**

### 1.3 Enable Google+ API

1. In the left sidebar, go to **"APIs & Services" → "Library"**
2. Search for **"Google+ API"**
3. Click on it and click **"Enable"**

### 1.4 Configure OAuth Consent Screen

1. Go to **"APIs & Services" → "OAuth consent screen"**
2. Select **"External"** (for public use) or **"Internal"** (for organization only)
3. Click **"Create"**

**Fill in the required information:**
- **App name:** MikroTik Network Monitor
- **User support email:** Your email address
- **Developer contact email:** Your email address

4. Click **"Save and Continue"**
5. Click **"Save and Continue"** again (Scopes page)
6. Click **"Save and Continue"** again (Test users page)
7. Click **"Back to Dashboard"**

### 1.5 Create OAuth Credentials

1. Go to **"APIs & Services" → "Credentials"**
2. Click **"Create Credentials" → "OAuth client ID"**
3. Select **"Web application"**
4. Enter name: **"MikroTik Monitor Web Client"**

**Authorized JavaScript origins:**
```
http://localhost:5000
http://your-server-ip:5000
https://yourdomain.com
```

**Authorized redirect URIs:**
```
http://localhost:5000/api/auth/google/callback
http://your-server-ip:5000/api/auth/google/callback
https://yourdomain.com/api/auth/google/callback
```

5. Click **"Create"**

### 1.6 Copy Your Credentials

A popup will appear with your credentials:
- **Client ID:** `123456789-abc...xyz.apps.googleusercontent.com`
- **Client Secret:** `GOCSPX-abc...xyz`

**⚠️ Keep these secure! Never commit them to git.**

---

## Step 2: Configure Your Application

### 2.1 Add to `.env` File

```bash
# Edit your .env file
nano .env
```

Add these lines:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=123456789-abc...xyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc...xyz
APP_URL=http://your-server-ip:5000
```

**For production with domain:**
```env
GOOGLE_CLIENT_ID=123456789-abc...xyz.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc...xyz
APP_URL=https://yourdomain.com
```

### 2.2 Generate Super Admin Password

For emergency access, create a super admin account:

```bash
# Generate password hash
node scripts/hash-password.js YourSecurePassword123

# Copy the output hash to your .env file
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=$2b$10$...copied-hash-here...
```

---

## Step 3: Deploy

```bash
# If using Docker
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Check logs
docker logs -f mikrotik-monitor-app

# You should see:
# ✓ Google OAuth configured
# ✓ Super Admin account configured
```

---

## Step 4: Test Authentication

### 4.1 Access Your Application

Visit: `http://your-server-ip:5000`

### 4.2 Login with Google

1. You should see a **"Sign in with Google"** button
2. Click it
3. Choose your Google account
4. Grant permissions
5. You'll be redirected back to the application

### 4.3 Login as Super Admin

For administrative access:

1. Use the **"Admin Login"** option
2. Username: `admin` (or whatever you set)
3. Password: Your password (not the hash!)

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause:** The redirect URI in your Google Cloud Console doesn't match.

**Solution:**
1. Check your `APP_URL` in `.env`
2. Make sure the redirect URI in Google Console matches exactly:
   ```
   {APP_URL}/api/auth/google/callback
   ```

### Error: "Access blocked: This app's request is invalid"

**Cause:** OAuth consent screen not configured or app not published.

**Solution:**
1. Complete OAuth consent screen configuration
2. Add your email as a test user (for testing mode)
3. Or publish the app (for production)

### Users Can't Access After Login

**Cause:** New users are disabled by default and need admin approval.

**Solution:**
1. Login as super admin
2. Go to **"User Management"**
3. Enable the new user accounts

### Google Login Button Not Showing

**Cause:** Environment variables not set correctly.

**Solution:**
```bash
# Check environment variables are loaded
docker exec mikrotik-monitor-app env | grep GOOGLE

# Should show:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
```

---

## Security Best Practices

### 1. Use HTTPS in Production

```nginx
# nginx.conf
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    location / {
        proxy_pass http://app:5000;
    }
}
```

### 2. Restrict Authorized Domains

In Google Cloud Console, only add your actual domain - not `localhost` for production.

### 3. Rotate Client Secret Regularly

Every 6-12 months:
1. Generate new client secret in Google Console
2. Update `.env` file
3. Restart application

### 4. Monitor OAuth Usage

In Google Cloud Console:
1. Go to **"APIs & Services" → "Credentials"**
2. Check usage statistics
3. Review for suspicious activity

---

## Multi-Domain Setup

If you have multiple domains (e.g., `app.example.com` and `monitor.example.com`):

1. **Add all redirect URIs in Google Console:**
   ```
   https://app.example.com/api/auth/google/callback
   https://monitor.example.com/api/auth/google/callback
   ```

2. **Update APP_URL based on deployment:**
   ```env
   # For app.example.com
   APP_URL=https://app.example.com
   
   # Or for monitor.example.com
   APP_URL=https://monitor.example.com
   ```

---

## User Management

### First Login Creates Account

When a user logs in with Google for the first time:
1. Account is automatically created
2. User is assigned **"user"** role (not admin)
3. Account is **disabled** by default
4. Admin must enable the account

### Enable New Users

As super admin:
1. Navigate to **"User Management"**
2. Find the new user
3. Click **"Enable Account"**

### Promote Users to Admin

1. Go to **"User Management"**
2. Find the user
3. Change role to **"Administrator"**

---

## FAQ

### Q: Can I use both Google and Super Admin login?
**A:** Yes! Both methods work simultaneously. Google for regular users, super admin for emergency access.

### Q: Do I need to keep the super admin account?
**A:** Recommended! It provides emergency access if Google OAuth has issues.

### Q: Can users from any Google account sign in?
**A:** Yes, but their accounts will be disabled until an admin enables them.

### Q: How do I disable Google OAuth?
**A:** Remove `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env` and restart.

### Q: Can I use Google Workspace accounts only?
**A:** Yes! Configure the OAuth consent screen as "Internal" to restrict to your organization.

---

## Support

For more help:
- See: `DEPLOYMENT.md` for deployment guide
- See: `SELF-HOSTED-AUTH.md` for authentication options
- See: `TROUBLESHOOTING.md` for common issues

---

**Last Updated:** November 1, 2025
