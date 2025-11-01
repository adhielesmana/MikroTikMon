# Authentication for Self-Hosted Deployments

## Current Status

Your MikroTik Monitor is now configured to run **without authentication** when deployed outside of Replit.

### What This Means

✅ **Application will start successfully** on self-hosted servers  
⚠️ **Authentication is bypassed** - anyone can access the application  
⚠️ **For testing/development only** - not secure for production use  

---

## Security Notice

**WARNING:** The current configuration bypasses all authentication checks when `REPLIT_DOMAINS` environment variable is not set.

When you see these warnings in the logs:
```
⚠️  Replit Auth not configured - REPLIT_DOMAINS environment variable not set
⚠️  Authentication endpoints will return informational messages
⚠️  For production use, configure an alternative authentication method
⚠️  Authentication bypassed - not in Replit environment
```

This means **anyone with access to the URL can use the application**.

---

## Production Authentication Options

For production self-hosted deployments, you should implement one of these authentication methods:

### Option 1: Use Replit Auth (Recommended for Replit-hosted)

If you want to use Replit's OAuth authentication on your self-hosted server:

1. **Set environment variables in `.env`:**
   ```env
   REPL_ID=your-repl-id-here
   ISSUER_URL=https://replit.com/oidc
   REPLIT_DOMAINS=yourdomain.com,www.yourdomain.com
   ```

2. **Configure your domain** to point to your server

3. **Restart the application:**
   ```bash
   ./deploy.sh restart
   ```

### Option 2: Implement Custom Authentication

You can implement your own authentication system:

- **Email/Password** - Traditional username and password
- **OAuth 2.0** - Google, GitHub, Microsoft, etc.
- **SAML** - Enterprise SSO
- **LDAP** - Corporate directory integration

### Option 3: Reverse Proxy Authentication

Use Nginx or Apache as a reverse proxy with authentication:

**Example with Nginx Basic Auth:**

1. Create password file:
   ```bash
   sudo apt-get install apache2-utils
   sudo htpasswd -c /etc/nginx/.htpasswd admin
   ```

2. Update `nginx.conf`:
   ```nginx
   location / {
       auth_basic "MikroTik Monitor";
       auth_basic_user_file /etc/nginx/.htpasswd;
       proxy_pass http://app:5000;
   }
   ```

3. Deploy with Nginx:
   ```bash
   ./deploy.sh up --with-nginx
   ```

### Option 4: VPN/Private Network

Deploy the application on a private network or VPN:

- Accessible only via VPN connection
- Use firewall rules to restrict access
- Network-level authentication

---

## Quick Security Measures (Temporary)

If you need to deploy **now** but want basic security:

### 1. Firewall Rules

```bash
# Allow only specific IP addresses
sudo ufw allow from YOUR_IP_ADDRESS to any port 5000
sudo ufw deny 5000
sudo ufw enable
```

### 2. Change Default Port

```bash
# Edit .env
APP_PORT=8765  # Use non-standard port

./deploy.sh restart
```

### 3. Use SSH Tunnel

Instead of exposing the application publicly:

```bash
# On your server
./deploy.sh up

# On your local machine
ssh -L 8080:localhost:5000 user@your-server.com

# Access via http://localhost:8080
```

---

## Testing the Current Setup

The application is currently running without authentication. You can test it:

1. **Access the application:**
   ```
   http://your-server-ip:5000
   ```

2. **Check authentication status:**
   ```
   curl http://your-server-ip:5000/api/login
   ```
   
   Should return:
   ```json
   {
     "message": "Authentication not configured",
     "info": "This is a self-hosted deployment without Replit Auth...",
     "hint": "Set REPLIT_DOMAINS and REPL_ID environment variables..."
   }
   ```

3. **Use the application:**
   - All features are accessible without login
   - No user management
   - All data is shared (no multi-user support without auth)

---

## Recommended Next Steps

1. ✅ **Get the application running** (you're here!)
2. ⚠️ **Secure with firewall** (restrict access immediately)
3. 🔒 **Implement authentication** (choose from options above)
4. 📊 **Test thoroughly** before production use
5. 🔐 **Enable SSL/TLS** with Let's Encrypt

---

## FAQ

### Q: Can I use the app without authentication?
**A:** Yes, but **only for testing/development**. For production, implement proper authentication.

### Q: Will my routers be secure?
**A:** Router credentials are encrypted in the database, but without authentication, anyone can access and view them.

### Q: Can I add users manually?
**A:** Without authentication, the user management features won't work. You'll need to implement authentication first.

### Q: Is there a simple auth plugin I can use?
**A:** Yes! Consider using Nginx Basic Auth (Option 3) for a quick solution, or implement Passport.js with local strategy for email/password authentication.

---

## Support

For authentication implementation help:
- See: `DEPLOYMENT.md` for production setup
- See: `DOCKER.md` for Docker configuration
- See: `TROUBLESHOOTING.md` for common issues

---

**Last Updated:** November 1, 2025
