# Nginx Deployment Options

This document explains the two nginx deployment configurations available for the MikroTik Monitor application.

## Overview

You have two options for deploying nginx:

1. **Host-Level Nginx** (Outside Docker) - For multiple applications on one server
2. **Docker Nginx** (Inside Docker) - Containerized deployment (current default)

## Option 1: Host-Level Nginx (Multiple Apps on One Server)

### When to Use

Choose this option when:
- ✅ You want to run **multiple applications** on the same server
- ✅ You need a **single nginx instance** to manage all your apps
- ✅ You want to use **system-wide SSL certificates** (Let's Encrypt)
- ✅ You prefer **centralized reverse proxy** management
- ✅ You want to **easily add more apps** without managing multiple nginx containers

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ Server (Host OS - Ubuntu/Debian)                    │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Nginx (Host-level)                           │  │
│  │ Port 80, 443                                 │  │
│  │ /etc/nginx/sites-available/                  │  │
│  │   - mikrotik-monitor                         │  │
│  │   - other-app-1                              │  │
│  │   - other-app-2                              │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                    │
│  ┌──────────────┴───────────────────────────────┐  │
│  │ Docker Containers                            │  │
│  │                                              │  │
│  │  ┌─────────────────┐  ┌──────────────────┐  │  │
│  │  │ MikroTik App    │  │ PostgreSQL       │  │  │
│  │  │ Port 5000       │  │ Port 5432        │  │  │
│  │  └─────────────────┘  └──────────────────┘  │  │
│  │                                              │  │
│  │  ┌─────────────────┐  ┌──────────────────┐  │  │
│  │  │ Other App 1     │  │ Other App 2      │  │  │
│  │  │ Port 3000       │  │ Port 8080        │  │  │
│  │  └─────────────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Setup Instructions

#### Prerequisites
- Ubuntu/Debian-based server
- Root/sudo access
- Domain name pointing to server IP
- Docker and docker-compose installed

#### Step 1: Setup Nginx on Host

Run the automated setup script:

```bash
sudo chmod +x scripts/setup-nginx-host.sh
sudo ./scripts/setup-nginx-host.sh
```

This script will:
1. Install nginx (if not already installed)
2. Install certbot for SSL (if not already installed)
3. Create nginx configuration for your domain
4. Setup Let's Encrypt SSL certificate
5. Configure automatic certificate renewal

#### Step 2: Deploy Application (Without Docker Nginx)

```bash
# Deploy WITHOUT the nginx container
./deploy.sh up
```

**Important:** Do NOT use `--with-nginx` flag when using host-level nginx.

#### Step 3: Verify Deployment

```bash
# Check nginx status
sudo systemctl status nginx

# Test nginx configuration
sudo nginx -t

# View application logs
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log
```

### Configuration Files

**Nginx Config Location:** `/etc/nginx/sites-available/mikrotik-monitor`

**SSL Certificates:** `/etc/letsencrypt/live/your-domain.com/`

**Logs:**
- Access: `/var/log/nginx/mikrotik-monitor-access.log`
- Error: `/var/log/nginx/mikrotik-monitor-error.log`

### Adding More Applications

To add another application to the same server:

1. Create a new nginx configuration file:
```bash
sudo nano /etc/nginx/sites-available/my-other-app
```

2. Add upstream and server blocks:
```nginx
upstream my_other_app {
    server 127.0.0.1:3000;  # Your app's port
}

server {
    listen 443 ssl http2;
    server_name myapp.example.com;
    
    ssl_certificate /etc/letsencrypt/live/myapp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.example.com/privkey.pem;
    
    location / {
        proxy_pass http://my_other_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/my-other-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Maintenance Commands

```bash
# Test nginx configuration
sudo nginx -t

# Reload nginx (apply config changes)
sudo systemctl reload nginx

# Restart nginx
sudo systemctl restart nginx

# View logs in real-time
sudo tail -f /var/log/nginx/mikrotik-monitor-access.log

# Renew SSL certificates manually
sudo certbot renew

# Check certificate expiry
sudo certbot certificates
```

### Advantages

✅ **Single nginx instance** - Manage all apps from one place  
✅ **Resource efficient** - One nginx process for all apps  
✅ **Centralized SSL** - Manage certificates in one location  
✅ **Easy to scale** - Add new apps without complexity  
✅ **System integration** - Works with system tools (systemctl, logrotate)  
✅ **Automatic SSL renewal** - Certbot handles all domains  

### Disadvantages

❌ **Manual nginx management** - Need root access to configure  
❌ **Global restart** - Nginx reload affects all apps  
❌ **Host dependency** - Nginx must be installed on host  

---

## Option 2: Docker Nginx (Containerized)

### When to Use

Choose this option when:
- ✅ You're running **only this application** on the server
- ✅ You want **everything containerized** (isolated)
- ✅ You prefer **Docker-only deployment** (no host services)
- ✅ You want **portable deployment** (move containers easily)
- ✅ You're comfortable managing **SSL certificates manually**

### Architecture

```
┌─────────────────────────────────────────────────────┐
│ Server (Host OS)                                     │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Docker Containers                            │  │
│  │                                              │  │
│  │  ┌─────────────────────────────────────┐    │  │
│  │  │ Nginx Container                     │    │  │
│  │  │ Port 80, 443                        │    │  │
│  │  │ /etc/nginx/nginx.conf               │    │  │
│  │  └──────────────┬──────────────────────┘    │  │
│  │                 │                            │  │
│  │  ┌──────────────┴──────────────────────┐    │  │
│  │  │ MikroTik App Container              │    │  │
│  │  │ Port 5000                           │    │  │
│  │  └─────────────────────────────────────┘    │  │
│  │                                              │  │
│  │  ┌─────────────────────────────────────┐    │  │
│  │  │ PostgreSQL Container                │    │  │
│  │  │ Port 5432                           │    │  │
│  │  └─────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Setup Instructions

#### Prerequisites
- Docker and docker-compose installed
- SSL certificates ready in `./ssl/` folder

#### Step 1: Prepare SSL Certificates

Place your SSL certificates in the `ssl/` directory:

```bash
mkdir -p ssl
# Copy your certificates
cp /path/to/fullchain.pem ssl/
cp /path/to/privkey.pem ssl/
```

**Or** use Let's Encrypt with certbot:

```bash
# Install certbot on host
sudo apt-get install certbot

# Get certificate (standalone mode, requires port 80 to be free)
sudo certbot certonly --standalone -d mon.maxnetplus.id

# Copy to ssl directory
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem ssl/
sudo chmod 644 ssl/*.pem
```

#### Step 2: Configure Nginx

Edit `nginx.conf` and set your domain name:

```nginx
server_name your-domain.com;  # Change this
```

#### Step 3: Deploy with Docker Nginx

```bash
# Deploy WITH nginx container
./deploy.sh up --with-nginx
```

#### Step 4: Verify Deployment

```bash
# Check container status
docker ps

# View nginx logs
docker logs mikrotik-monitor-nginx

# View application logs
docker logs mikrotik-monitor-app
```

### Configuration Files

**Nginx Config:** `./nginx.conf` (mounted to container)

**SSL Certificates:** `./ssl/` (mounted to container)

**Docker Compose:** `docker-compose.yml`

### SSL Certificate Renewal

Since certbot runs on the host but nginx is in Docker, you need to:

1. **Stop nginx container:**
```bash
docker stop mikrotik-monitor-nginx
```

2. **Renew certificate:**
```bash
sudo certbot renew
```

3. **Copy new certificates:**
```bash
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/privkey.pem ssl/
sudo chmod 644 ssl/*.pem
```

4. **Restart nginx container:**
```bash
docker start mikrotik-monitor-nginx
```

**Or** use a renewal script:

```bash
#!/bin/bash
# ssl-renew.sh
docker stop mikrotik-monitor-nginx
sudo certbot renew
sudo cp /etc/letsencrypt/live/mon.maxnetplus.id/*.pem ssl/
sudo chmod 644 ssl/*.pem
docker start mikrotik-monitor-nginx
```

Add to crontab:
```bash
0 3 * * * /path/to/ssl-renew.sh
```

### Maintenance Commands

```bash
# View nginx logs
docker logs -f mikrotik-monitor-nginx

# Reload nginx config (after editing nginx.conf)
docker exec mikrotik-monitor-nginx nginx -s reload

# Restart nginx container
docker restart mikrotik-monitor-nginx

# Check nginx config syntax
docker exec mikrotik-monitor-nginx nginx -t
```

### Advantages

✅ **Fully containerized** - Everything in Docker  
✅ **Portable** - Move containers to any server  
✅ **Isolated** - No interference with host system  
✅ **Easy rollback** - Docker version control  
✅ **Consistent environment** - Same config everywhere  

### Disadvantages

❌ **Single app only** - Not ideal for multiple apps  
❌ **Manual SSL renewal** - More complex certificate management  
❌ **Extra container** - Additional resource overhead  
❌ **Port conflicts** - Can't run multiple nginx containers on 80/443  

---

## Comparison Table

| Feature | Host-Level Nginx | Docker Nginx |
|---------|------------------|--------------|
| **Best For** | Multiple apps on one server | Single app deployment |
| **SSL Management** | Automatic (certbot) | Manual renewal |
| **Resource Usage** | Lower (single nginx) | Higher (per-app nginx) |
| **Scalability** | High (add more apps easily) | Limited (one app per server) |
| **Complexity** | Moderate (nginx knowledge) | Lower (Docker-focused) |
| **Portability** | Server-specific | Highly portable |
| **Isolation** | Shared nginx | Fully isolated |
| **Certificate Renewal** | Automatic | Manual/scripted |

---

## Recommendations

### Use **Host-Level Nginx** if:
- You plan to run multiple applications (recommended for production servers)
- You want automatic SSL certificate renewal
- You need centralized reverse proxy management
- You're comfortable with Linux system administration

### Use **Docker Nginx** if:
- You're only running this single application
- You want everything containerized
- You prefer Docker-only deployment
- You're okay with manual SSL certificate management

---

## Migration Between Options

### From Docker Nginx → Host-Level Nginx

1. **Stop Docker nginx:**
```bash
./deploy.sh stop
```

2. **Setup host nginx:**
```bash
sudo ./scripts/setup-nginx-host.sh
```

3. **Start app without nginx:**
```bash
./deploy.sh up
```

### From Host-Level Nginx → Docker Nginx

1. **Stop app:**
```bash
./deploy.sh stop
```

2. **Disable host nginx site:**
```bash
sudo rm /etc/nginx/sites-enabled/mikrotik-monitor
sudo systemctl reload nginx
```

3. **Setup SSL certificates:**
```bash
mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain/*.pem ssl/
sudo chmod 644 ssl/*.pem
```

4. **Start with Docker nginx:**
```bash
./deploy.sh up --with-nginx
```

---

## Need Help?

- **Host-Level Setup Issues:** Check nginx logs in `/var/log/nginx/`
- **Docker Setup Issues:** Check container logs with `docker logs`
- **SSL Certificate Issues:** Run `sudo certbot certificates` to check status
- **Port Conflicts:** Ensure no other service is using ports 80/443

For more help, see the main README.md or open an issue on GitHub.
