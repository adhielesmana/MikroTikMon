# 🔐 Session Persistence & Browser Caching Guide

Your MikroTik monitoring platform now has **persistent sessions** and **optimized browser caching** so users stay logged in after the 1-hour auto-refresh and static assets load instantly from cache.

## 🍪 Session Persistence

### How It Works

Users are automatically kept logged in across browser reloads, including the forced 1-hour auto-refresh.

**Session Configuration:**
- **Duration:** 7 days (604,800,000 ms)
- **Storage:** PostgreSQL database (persistent across server restarts)
- **Cookie Type:** Persistent (not session-only)
- **Auto-Renewal:** Yes - cookie expiry resets with every request (rolling sessions)
- **Security:** httpOnly, sameSite=lax, secure (HTTPS only in production)

### What This Means

✅ **Login persists across:**
- Browser reloads (F5)
- Tab close/reopen
- Browser restart
- 1-hour auto-refresh
- Browser crashes

❌ **Login expires when:**
- User explicitly logs out
- 7 days of inactivity
- Session manually cleared from database
- Browser cookies cleared

### Configuration

Session settings are in `server/replitAuth.ts`:

```typescript
const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 days

session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore, // PostgreSQL
  rolling: true, // Reset expiry on every request
  cookie: {
    httpOnly: true,
    secure: useSecureCookies, // true in production
    maxAge: sessionTtl, // 7 days
    sameSite: 'lax', // CSRF protection
  },
})
```

### For Self-Hosted Deployments

If you're self-hosting at `mon.maxnetplus.id` with Docker:

**With HTTPS (recommended):**
```bash
# docker-compose.yml or .env
USE_SECURE_COOKIES=true
```

**Without HTTPS (development/local):**
```bash
# .env
USE_SECURE_COOKIES=false
```

---

## 📦 Static Asset Caching

### Cache Strategy

The app uses aggressive browser caching for static assets while ensuring HTML is always fresh.

| Asset Type | Cache Duration | Reason |
|-----------|----------------|--------|
| **JS files** | 1 year (immutable) | Vite adds content hash to filenames |
| **CSS files** | 1 year (immutable) | Vite adds content hash to filenames |
| **Images** (png, jpg, svg) | 1 year (immutable) | Static logos and assets |
| **Fonts** (woff2, ttf) | 1 year (immutable) | Web fonts |
| **HTML files** | No cache (always fresh) | Ensures latest app version |
| **index.html** | No cache (always fresh) | Entry point - must be current |

### How It Works

**Static Assets (Cached):**
```
Cache-Control: public, max-age=31536000, immutable
```
- Browser stores for 1 year
- Marked as `immutable` (won't change)
- Safe because Vite adds hash to filenames: `app-a1b2c3d4.js`

**HTML Files (Never Cached):**
```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```
- Always fetched from server
- Ensures users get latest version

### Benefits

✅ **Instant Loading** - Static assets load from browser cache  
✅ **Zero Server Requests** - Cached assets don't hit server  
✅ **Always Current** - HTML always fetches latest version  
✅ **Bandwidth Savings** - Reduces server bandwidth usage  
✅ **Better UX** - Near-instant page loads on repeat visits

### Why This Is Safe

Vite (the build tool) automatically adds content hashes to all static assets:

```
Before build:  app.js
After build:   app-a1b2c3d4.js

If you change code:
After build:   app-e5f6g7h8.js  ← Different hash, new file!
```

So even with aggressive caching:
1. You change code → Vite generates new file with new hash
2. User reloads → Gets new `index.html` (never cached)
3. `index.html` references new `app-e5f6g7h8.js`
4. Browser downloads new version (cache miss)

**Result:** Users always get the latest code, but static assets load instantly from cache when unchanged.

---

## 🔄 1-Hour Auto-Refresh

### Current Behavior

The app automatically refreshes every 1 hour:

```typescript
// client/src/App.tsx
const oneHour = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  console.log('[App] Auto-refreshing browser after 1 hour...');
  window.location.reload();
}, oneHour);
```

### What Happens During Auto-Refresh

1. **Before Refresh:**
   - User is logged in
   - Session cookie stored in browser
   - Static assets cached

2. **During Refresh:**
   - `window.location.reload()` triggered
   - Browser sends session cookie to server
   - Server validates session (still valid - 7 days)

3. **After Refresh:**
   - ✅ User **stays logged in** (session restored)
   - ✅ Static assets **load from cache** (instant)
   - ✅ Fresh HTML loaded (ensures latest version)
   - ✅ WebSocket reconnects automatically

**User Experience:** Seamless refresh - stays logged in, instant load

---

## 🛠️ Troubleshooting

### Users Getting Logged Out

**Problem:** Users logged out after refresh

**Check:**
```bash
# Verify session cookie settings
# In browser DevTools > Application > Cookies
# Look for: connect.sid cookie
# Check: Expires/Max-Age should be ~7 days in future
```

**Solution:**
```bash
# Ensure SESSION_SECRET is set
echo $SESSION_SECRET

# Ensure database is accessible
# Session data is stored in PostgreSQL 'sessions' table
SELECT * FROM sessions LIMIT 5;
```

### Static Assets Not Caching

**Problem:** Assets downloading on every page load

**Check Browser DevTools:**
```
Network tab → Reload page
Look at Status column for:
- 200 = Downloaded from server
- 304 = Not modified (using cache)
- (disk cache) = Loaded from cache
```

**Expected Behavior:**
- First visit: All assets show `200`
- Subsequent visits: Assets show `(disk cache)` or `304`

**If assets show `200` every time:**
```bash
# Check cache headers are being set
curl -I https://mon.maxnetplus.id/assets/app-*.js

# Should see:
# Cache-Control: public, max-age=31536000, immutable
```

### Session Expires Too Quickly

**Problem:** Login only lasts a few hours

**Check:**
```typescript
// server/replitAuth.ts
const sessionTtl = 7 * 24 * 60 * 60 * 1000; // Should be 7 days

// Ensure rolling: true is set
rolling: true, // This resets cookie expiry on every request
```

---

## 📊 Testing Session Persistence

### Test 1: Browser Reload
1. Login to app
2. Press F5 (reload)
3. ✅ Should stay logged in

### Test 2: Tab Close/Reopen
1. Login to app
2. Close tab
3. Open new tab, navigate to app URL
4. ✅ Should stay logged in

### Test 3: Browser Restart
1. Login to app
2. Close entire browser
3. Reopen browser, navigate to app URL
4. ✅ Should stay logged in

### Test 4: 1-Hour Auto-Refresh
1. Login to app
2. Wait 1 hour (or modify code to 1 minute for testing)
3. Page auto-refreshes
4. ✅ Should stay logged in
5. ✅ Static assets should load instantly

---

## 🔧 Advanced Configuration

### Customize Session Duration

Edit `server/replitAuth.ts`:

```typescript
// Change from 7 days to desired duration
const sessionTtl = 14 * 24 * 60 * 60 * 1000; // 14 days
// Or
const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
```

### Customize Auto-Refresh Interval

Edit `client/src/App.tsx`:

```typescript
// Change from 1 hour to desired duration
const refreshInterval = 2 * 60 * 60 * 1000; // 2 hours
// Or
const refreshInterval = 30 * 60 * 1000; // 30 minutes
```

### Disable Auto-Refresh

Remove this code from `client/src/App.tsx`:

```typescript
// Delete or comment out this entire block:
const oneHour = 60 * 60 * 1000;
const refreshInterval = setInterval(() => {
  console.log('[App] Auto-refreshing browser after 1 hour...');
  window.location.reload();
}, oneHour);
```

---

## 🔐 Security Notes

**Session Security:**
- ✅ `httpOnly` - Cannot be accessed by JavaScript (prevents XSS)
- ✅ `sameSite: lax` - CSRF protection while allowing normal navigation
- ✅ `secure` (production) - Only sent over HTTPS
- ✅ PostgreSQL storage - Sessions persist across server restarts
- ✅ 7-day expiry - Balance between UX and security

**Cache Security:**
- ✅ Only static assets cached (not sensitive data)
- ✅ HTML never cached (ensures latest security patches)
- ✅ `public` cache - Safe for CDNs (no sensitive content)
- ✅ Content hashing - Prevents cache poisoning attacks

---

## 📖 Summary

✅ **Session Persistence:**
- Login lasts 7 days
- Survives browser reloads, restarts, and 1-hour auto-refresh
- Stored in PostgreSQL for persistence

✅ **Static Asset Caching:**
- JS/CSS/Images cached for 1 year
- HTML never cached (always fresh)
- Instant page loads on repeat visits

✅ **Auto-Refresh:**
- Happens every 1 hour
- Users stay logged in
- Static assets load from cache
- Seamless UX

---

**Need help?** Check browser console for session/cache debugging messages, or inspect cookies/network in DevTools.
