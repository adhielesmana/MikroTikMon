# Self-Hosted Authentication Guide

This guide covers all authentication options available for self-hosted deployments of the MikroTik Network Monitor.

---

## Authentication Options

Your MikroTik Monitor supports three authentication methods that can be used simultaneously:

### 1. Google OAuth (Recommended for most users)
- ✅ Public sign-in for any Google account
- ✅ Secure OAuth 2.0 flow
- ✅ Auto-populate user profiles
- ❌ Requires Google Cloud Console setup

### 2. Super Admin (Emergency access)
- ✅ Static username/password login
- ✅ Always works (no external dependencies)
- ✅ Guaranteed admin access
- ❌ Manual password hashing required

### 3. Replit Auth (Optional, Replit-hosted only)
- ✅ Automatic on Replit platform
- ❌ Only works when hosted on Replit
- ❌ Requires REPLIT_DOMAINS environment variable

---

## Quick Setup Guide

### Option A: Google OAuth + Super Admin (Recommended)

**Best for:** Production deployments with both convenience and emergency access

1. **Get Google OAuth credentials** (see [GOOGLE-OAUTH-SETUP.md](./GOOGLE-OAUTH-SETUP.md))
2. **Configure .env:**
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
   APP_URL=https://yourdomain.com
   
   SUPER_ADMIN_USERNAME=admin
   SUPER_ADMIN_PASSWORD=$2b$10$...hash-from-script...
   ```
3. **Generate super admin password:**
   ```bash
   node scripts/hash-password.js YourSecurePassword123
   ```
4. **Deploy:**
   ```bash
   docker-compose down && docker-compose up -d
   ```

---

### Option B: Super Admin Only (Simplest)

**Best for:** Private deployments or testing

1. **Generate password hash:**
   ```bash
   node scripts/hash-password.js YourPassword123
   ```
2. **Configure .env:**
   ```env
   SUPER_ADMIN_USERNAME=admin
   SUPER_ADMIN_PASSWORD=$2b$10$...copied-hash...
   ```
3. **Deploy:**
   ```bash
   docker-compose down && docker-compose up -d
   ```

---

## Security Best Practices

### ✅ Before Production

- [ ] Use strong database password
- [ ] Use secure session secret (32+ random characters)
- [ ] Enable HTTPS (use reverse proxy with SSL)
- [ ] Use strong super admin password (12+ characters)
- [ ] Configure firewall to block PostgreSQL port externally

### ✅ After Deployment

- [ ] Test login flows
- [ ] Verify new users are disabled by default
- [ ] Test user approval workflow
- [ ] Monitor logs for auth errors

---

## User Management

### Default Behavior
- **New Google users:** Account created but **disabled**
- **Super admin:** Always **enabled** with **admin** role
- **Approval required:** Admin must enable new accounts

### Enabling New Users

1. Login as super admin
2. Navigate to "User Management"
3. Find the new user
4. Toggle "Enabled" switch
5. (Optional) Change role to "Administrator"

---

## Troubleshooting

### Google OAuth Not Working

**Check environment variables:**
```bash
docker exec mikrotik-monitor-app env | grep GOOGLE
```

Expected: `✓ Google OAuth configured` in logs

### Super Admin Login Fails

**Re-generate password hash:**
```bash
node scripts/hash-password.js YourPassword
# Copy hash to .env SUPER_ADMIN_PASSWORD
docker-compose restart app
```

### Session Doesn't Persist

1. Check `SESSION_SECRET` is set
2. Verify PostgreSQL connection
3. For HTTPS: Ensure reverse proxy passes headers

---

## FAQ

**Q: Can I use both Google and Super Admin?**  
A: Yes! Recommended for production.

**Q: What if I forget super admin password?**  
A: Run hash-password.js, update .env, restart.

**Q: Can anyone with Google account sign in?**  
A: Yes, but accounts are disabled until admin approves.

**Q: Do I need email configured for auth?**  
A: No, email is only for alert notifications.

---

## Additional Resources

- **Google OAuth Setup:** [GOOGLE-OAUTH-SETUP.md](./GOOGLE-OAUTH-SETUP.md)
- **Deployment Guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Password Generator:** [scripts/hash-password.js](./scripts/hash-password.js)

---

**Last Updated:** November 1, 2025
