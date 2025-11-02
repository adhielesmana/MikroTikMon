# 🔐 Password Reset Guide

## Quick Reference

| Environment | Command | Notes |
|-------------|---------|-------|
| **Replit Dev** | `tsx scripts/reset-admin-password.js` | Direct access to TypeScript |
| **Docker Production** | `./deploy.sh reset-password` | Wrapper script with prompts |
| **Docker Direct** | `docker compose exec app npx tsx scripts/reset-admin-password.js` | Bypass prompts |

---

## 🚀 Quick Reset (Choose Your Environment)

### **Option 1: Replit Development** (Current Environment)

```bash
tsx scripts/reset-admin-password.js
```

**When to use:** 
- Working in Replit development environment
- Testing locally with Node.js/TypeScript installed
- Direct database access available

---

### **Option 2: Docker Production** (Recommended for Deployment)

```bash
./deploy.sh reset-password
```

**Output:**
```
⚠ This will reset the admin password with a random generated password
⚠ The current admin password will no longer work

Continue? (y/N): y
ℹ Resetting admin password...

🔐 Admin Password Reset Tool
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Generating secure temporary password...
🔒 Hashing password with bcrypt (10 rounds)...
👤 Updating existing admin account...

✅ Admin password has been reset successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 TEMPORARY LOGIN CREDENTIALS:

   Username: admin
   Password: X7k@9mP2nQ5wY8tL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**When to use:**
- Production Docker deployment
- Server environment with Docker Compose
- Want confirmation prompts for safety

---

### **Option 3: Docker Direct** (Advanced)

```bash
docker compose exec app npx tsx scripts/reset-admin-password.js
```

**When to use:**
- Bypass confirmation prompts
- Scripting/automation
- CI/CD pipelines

---

## 📋 Complete Password Reset Process

### **Step 1: Run Reset Script**

Choose one of the commands above based on your environment.

### **Step 2: Copy Temporary Password**

The script will generate a secure 16-character password like:
```
Password: X7k@9mP2nQ5wY8tL
```

**⚠️ IMPORTANT:** Write it down immediately - it won't be shown again!

### **Step 3: Login**

1. Go to your application login page
2. Enter:
   - **Username:** `admin`
   - **Password:** (the temporary password from Step 2)

### **Step 4: Change Password**

You'll be automatically redirected to the password change page:

1. **Current Password:** Enter the temporary password
2. **New Username (Optional):** Change from "admin" to something else
3. **New Password:** Choose a strong password (minimum 8 characters)
4. **Confirm Password:** Re-enter your new password
5. Click **"Change Password"**

### **Step 5: Done!** ✅

You're now logged in with your new credentials!

---

## 🔒 What the Script Does

1. ✅ **Generates** a cryptographically secure random password
   - 16 characters long
   - Mix of uppercase, lowercase, numbers, and symbols
   - Uses Node.js `crypto.randomInt()` for true randomness

2. ✅ **Hashes** the password with bcrypt
   - 10 salt rounds (industry standard)
   - Secure one-way hashing

3. ✅ **Updates** the admin account in database
   - Sets new password hash
   - Forces password change on next login (`must_change_password = true`)
   - Enables account if disabled
   - Confirms admin role

4. ✅ **Displays** temporary credentials
   - Shows only once for security
   - Formatted for easy reading

---

## ⚠️ Security Best Practices

### **After Running Reset Script:**

1. **Write down the password immediately** - It won't be shown again
2. **Clear your terminal history** - Run `history -c` after copying
3. **Login immediately** - Don't leave the temporary password active
4. **Change password** - The temporary password must be changed on first login
5. **Choose a strong password** - Minimum 8 characters with mixed character types

### **Password Requirements:**

- ✅ Minimum 8 characters
- ✅ Mix of uppercase and lowercase letters
- ✅ Include numbers
- ✅ Include special characters
- ❌ Don't use dictionary words
- ❌ Don't reuse old passwords

---

## 🐛 Troubleshooting

### **Error: "Cannot find module"**

**Problem:**
```
Error: Cannot find module '/app/scripts/reset-admin-password.js'
```

**Solution:**
The script was using `node` instead of `tsx`. This has been fixed! Make sure you're using the latest version of `deploy.sh` which now uses:

```bash
docker compose exec app tsx scripts/reset-admin-password.js
```

---

### **Error: "Database connection failed"**

**Problem:**
```
Error: connect ECONNREFUSED
```

**Solution:**
1. Ensure the database is running:
   ```bash
   docker compose ps
   ```

2. Check database credentials in `.env`:
   ```bash
   cat .env | grep DATABASE_URL
   ```

3. Test database connection:
   ```bash
   docker compose exec mikrotik-monitor-db psql -U mikrotik_user mikrotik_monitor
   ```

---

### **"admin/admin" doesn't work**

**Problem:**
Default credentials `admin/admin` are rejected.

**Solution:**
This means the password has already been changed (which is good for security!). Use the reset script to get new credentials:

```bash
tsx scripts/reset-admin-password.js
```

Check if password was changed:
```bash
psql $DATABASE_URL -c "SELECT username, must_change_password FROM users WHERE id = 'super-admin-001';"
```

If `must_change_password = false`, the password was already changed.

---

### **Script runs but password doesn't work**

**Problem:**
Reset script completes successfully but login still fails.

**Solution:**
1. **Double-check the password** - Make sure you copied it exactly (no extra spaces)
2. **Check database** - Verify the update worked:
   ```bash
   psql $DATABASE_URL -c "SELECT username, must_change_password FROM users WHERE id = 'super-admin-001';"
   ```
   Should show: `must_change_password = true`

3. **Clear browser cache** - Old session might be cached
4. **Try incognito/private mode** - Eliminates caching issues

---

## 📚 Additional Resources

### **Check Current Admin Status**

```bash
# Replit/Development
psql $DATABASE_URL -c "SELECT id, username, email, role, enabled, must_change_password FROM users WHERE id = 'super-admin-001';"

# Docker
docker compose exec mikrotik-monitor-db psql -U mikrotik_user mikrotik_monitor -c "SELECT id, username, email, role, enabled, must_change_password FROM users WHERE id = 'super-admin-001';"
```

### **Manual Password Hash Generation**

If you need to generate a bcrypt hash manually:

```javascript
const bcrypt = require('bcrypt');
const password = 'your-password-here';
const hash = await bcrypt.hash(password, 10);
console.log(hash);
```

### **Database Shell Access**

```bash
# Replit
psql $DATABASE_URL

# Docker
./deploy.sh db-shell
```

---

## 🎯 Common Scenarios

### **Scenario 1: Fresh Installation**

**Default credentials:** `admin` / `admin`

On first login, you'll be forced to change the password. No reset needed!

---

### **Scenario 2: Forgot Password**

**Solution:** Run password reset script

```bash
# Development
tsx scripts/reset-admin-password.js

# Production
./deploy.sh reset-password
```

Get new temporary password → Login → Change password

---

### **Scenario 3: Locked Out (No Access)**

**Solution:** Direct database access required

```bash
# Connect to database
psql $DATABASE_URL

# Manually set password (use this bcrypt hash for "admin123")
UPDATE users 
SET password_hash = '$2b$10$cMvOUlC.MTj7ynM.j/JyMu4IfHEsTjHYTTJBNAmTklFZ9wxTUJP1O',
    must_change_password = true
WHERE id = 'super-admin-001';
```

Then login with:
- Username: `admin`
- Password: `admin123`

Change password immediately!

---

### **Scenario 4: Production Server**

**Best practice:** Use SSH + Docker

```bash
# SSH into server
ssh user@mon.maxnetplus.id

# Navigate to project
cd ~/MikroTikMon

# Run reset
./deploy.sh reset-password
```

---

## 🔐 Password Policy Recommendations

### **For Production Deployments:**

1. **Change default immediately** - Never keep `admin/admin` in production
2. **Use strong passwords** - Minimum 12 characters for production
3. **Regular rotation** - Change passwords every 90 days
4. **Unique passwords** - Don't reuse across systems
5. **Password manager** - Use 1Password, LastPass, Bitwarden, etc.
6. **2FA consideration** - Plan to add two-factor authentication

### **For Development:**

1. **Different from production** - Never use production passwords in dev
2. **Document securely** - Store in password manager or secure notes
3. **Rotate after team changes** - Change when people leave/join
4. **Avoid sharing** - Each developer should have their own account (future feature)

---

## 📞 Need Help?

If you're still having trouble:

1. **Check logs:**
   ```bash
   # Docker
   docker compose logs app | tail -50
   
   # Replit
   Check workflow logs
   ```

2. **Verify database connection:**
   ```bash
   ./deploy.sh db-shell
   ```

3. **Try the reset script in debug mode:**
   ```bash
   DEBUG=* tsx scripts/reset-admin-password.js
   ```

---

**Last Updated:** November 2, 2024  
**Version:** 1.0
