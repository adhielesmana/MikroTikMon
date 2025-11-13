# Nginx Configuration Enhancements

## Summary of Improvements

The nginx configurations have been enhanced with industry best practices for security, performance, and WebSocket support.

## 🔒 Security Enhancements

### 1. Hide Nginx Version
```nginx
server_tokens off;
```
**Benefit:** Prevents attackers from knowing your nginx version, reducing targeted exploits.

### 2. Buffer Overflow Protection
```nginx
client_body_buffer_size 1k;
client_header_buffer_size 1k;
large_client_header_buffers 2 16k;
```
**Benefit:** Protects against buffer overflow attacks by limiting request sizes.

### 3. Hide Backend Headers
```nginx
proxy_hide_header X-Powered-By;
```
**Benefit:** Prevents leaking backend technology information (e.g., Express.js version).

### 4. Optimized Timeout Settings
```nginx
client_body_timeout 12;
client_header_timeout 12;
send_timeout 10;
```
**Benefit:** Prevents slowloris attacks by limiting connection time for slow clients.

---

## ⚡ WebSocket Improvements

### Smart Connection Handling

**Before:**
```nginx
location / {
    proxy_set_header Connection "upgrade";  # Always upgrade
}
```

**After:**
```nginx
# In http block
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location / {
    proxy_set_header Connection $connection_upgrade;  # Smart switching
}
```

**Benefits:**
- ✅ Automatically detects WebSocket upgrade requests
- ✅ Handles both WebSocket and regular HTTP traffic in same location
- ✅ Properly closes non-WebSocket connections
- ✅ Industry best practice from nginx official docs

### Dedicated WebSocket Endpoint

Added dedicated `/ws` location with optimal settings:

```nginx
location /ws {
    # Long timeout for WebSocket connections (24 hours)
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    
    # Disable buffering for real-time communication
    proxy_buffering off;
    proxy_cache_bypass $http_upgrade;
}
```

**Benefits:**
- ✅ 24-hour timeout prevents premature connection drops
- ✅ No buffering ensures real-time message delivery
- ✅ Optimized specifically for long-lived connections

---

## 🚀 Performance Enhancements

### 1. Gzip Improvements
```nginx
gzip_disable "msie6";  # Don't gzip for old IE6 (security)
```
**Benefit:** Prevents BREACH attack on old browsers.

### 2. Cache Bypass for Upgrades
```nginx
proxy_cache_bypass $http_upgrade;
```
**Benefit:** Ensures WebSocket connections bypass any caching layers.

---

## 📋 Configuration Comparison

### Docker Nginx (`nginx.conf`)

**Key Changes:**
1. ✅ Added `server_tokens off` to hide version
2. ✅ Added buffer overflow protection
3. ✅ Added smart WebSocket map
4. ✅ Added dedicated `/ws` location block
5. ✅ Added `proxy_hide_header X-Powered-By`
6. ✅ Added `proxy_cache_bypass $http_upgrade`

### Host-Level Nginx (`nginx-host.conf`)

**Key Changes:**
1. ✅ Same security enhancements as Docker nginx
2. ✅ Integrated WebSocket map instructions
3. ✅ Dedicated `/ws` location block
4. ✅ Optimized for multiple apps on one server
5. ✅ Rate limiting zones with unique names (`mikrotik_general`, `mikrotik_api`)

---

## 🔧 Installation Notes

### For Docker Nginx

No changes needed! The enhanced configuration is ready to use:

```bash
./deploy.sh up --with-nginx
```

### For Host-Level Nginx

The setup script now automatically:
1. Adds WebSocket map to `/etc/nginx/nginx.conf`
2. Adds rate limiting zones
3. Creates optimized site configuration

```bash
sudo ./scripts/setup-nginx-host.sh
```

---

## 🧪 Testing WebSocket Connections

### Test WebSocket Upgrade

```bash
# Test WebSocket handshake
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: test" \
     https://your-domain.com/ws
```

**Expected response:**
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: upgrade
```

### Monitor WebSocket Connections

```bash
# Docker nginx
docker logs -f mikrotik-monitor-nginx | grep "upgrade"

# Host-level nginx
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log | grep "upgrade"
```

---

## 📊 Performance Metrics

### Before Enhancements
- WebSocket timeout: 60 seconds (caused disconnections)
- Connection handling: Hardcoded "upgrade" (less flexible)
- Buffer protection: None (vulnerable to overflow attacks)
- Server version: Visible (security risk)

### After Enhancements
- WebSocket timeout: 24 hours (stable long-lived connections)
- Connection handling: Smart map-based switching
- Buffer protection: Active (1k-16k limits)
- Server version: Hidden (reduced attack surface)

---

## 🔐 Security Checklist

✅ **Server version hidden** (`server_tokens off`)  
✅ **Buffer overflow protection** (strict limits)  
✅ **Backend headers hidden** (no X-Powered-By)  
✅ **Timeout protection** (slowloris defense)  
✅ **WebSocket security** (proper upgrade handling)  
✅ **Rate limiting** (DDoS protection)  
✅ **SSL/TLS** (HTTPS only with HSTS)  
✅ **Security headers** (X-Frame-Options, CSP, etc.)  

---

## 📚 References

- [Nginx WebSocket Proxying](https://nginx.org/en/docs/http/websocket.html)
- [Nginx Security Best Practices](https://docs.nginx.com/nginx/admin-guide/security-controls/)
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455)

---

## 🆘 Troubleshooting

### WebSocket connections still timing out?

**Check timeout values:**
```bash
# Docker
docker exec mikrotik-monitor-nginx nginx -T | grep timeout

# Host-level
sudo nginx -T | grep timeout
```

### Map not working?

**Verify map is in http block:**
```bash
# Host-level
sudo nginx -T | grep -A 3 "map.*connection_upgrade"
```

**Should show:**
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

### Need to reload after changes?

```bash
# Docker
docker exec mikrotik-monitor-nginx nginx -s reload

# Host-level
sudo nginx -t && sudo systemctl reload nginx
```

---

## ✅ Summary

**All nginx configurations now follow 2024 industry best practices for:**
- ✅ Security (hidden version, buffer protection, header hiding)
- ✅ WebSocket support (smart connection handling, 24-hour timeouts)
- ✅ Performance (optimized buffering, caching)
- ✅ Reliability (proper timeout management)

**No breaking changes** - Fully backward compatible with existing deployments!
