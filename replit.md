# MikroTik Network Monitoring Platform

## Overview
A comprehensive, enterprise-grade network monitoring platform for MikroTik routers. It offers real-time traffic analysis, intelligent threshold-based alerting, and multi-user role-based access control. The platform is designed for professional network administrators, providing a production-ready solution for efficient network oversight. The project aims to provide a robust, scalable, and user-friendly system for monitoring MikroTik router performance and health, with features like user invitation, multi-provider authentication, and a three-tier fallback system for router connectivity.

## User Preferences
- Professional, data-dense monitoring interface
- Mobile and desktop accessibility required
- Real-time updates essential
- Email and popup notifications for alerts
- Administrator oversight of user accounts
- Follow the `design_guidelines.md` for all UI implementations
- Use the existing Shadcn component library
- Maintain type safety with TypeScript throughout
- Implement proper error handling and loading states
- Keep security in mind (encrypted credentials, role checks)
- Test on mobile devices during development

## System Architecture

### Technology Stack
**Frontend:** React with TypeScript, Wouter, TanStack Query, Shadcn UI + Tailwind CSS, Recharts, WebSocket.
**Backend:** Express.js with TypeScript, TimescaleDB (PostgreSQL time-series database) with Drizzle ORM, Passport.js (Google OAuth, Local Strategy, Replit OIDC), MikroTik RouterOS API client, Node-cron, Nodemailer, WebSocket server.

### Database Schema
**Core Tables:** `users`, `router_groups`, `routers`, `monitored_ports`, `traffic_data` (TimescaleDB hypertable), `alerts`, `notifications`, `sessions`.
**In-Memory Storage:** Nested Map structure for real-time traffic data.
**TimescaleDB Features:** Hypertables, automatic compression (90%+ storage savings after 7 days), 2-year data retention, continuous aggregates (hourly/daily summaries).
**Data Persistence:** Named Docker volume `postgres_data` ensures database survives container recreations.

### Deployment Architecture
- **Production Setup**: Nginx (host system) + Docker application (on port 5000) using docker-compose.
- **Deployment Script**: `intelligent-deploy.sh` for smart, idempotent deployments with **safe database preservation** (only recreates app container, database container reuses existing volume). Features intelligent UID detection (queries running container, parses Dockerfile, or falls back to 1000) to ensure correct permissions on any system. Auto-verifies data persistence after each deployment.
- **SSL Certificates**: Let's Encrypt via certbot.
- **Auto-Updates**: GitHub polling every 5 minutes for automatic deployment on code changes.
- **Database Safety**: Deployment script explicitly preserves database container and verifies data counts (users, routers) post-deployment.

### System Design Choices
- **UI/UX:** Mobile-first responsive design, dark mode, collapsible sidebar, touch-friendly interactions, dynamic logo management, auto-created and permissioned asset directories.
- **Authentication:** Multi-provider (Google OAuth, Local Admin, Replit Auth), session management, user invitation system, admin password recovery.
- **Authorization:** Role-Based Access Control (RBAC) with "admin" and "user" roles, enforcing ownership validation.
- **Router Connectivity:** Three-tier fallback (Native API, HTTPS REST API, SNMP), automatic host extraction, network reachability, optimized background scheduling.
- **Traffic Monitoring:** On-demand real-time (1-second WebSocket) and historical (60-second background polling for monitored ports), 2-year data retention, automatic interface metadata updates. **Poller dynamically reloads routers and ports from database every 60 seconds**, ensuring immediate awareness of database changes (e.g., after restore, new routers, new monitored ports).
- **Alerting:** Configurable thresholds per port, dual Email/In-App Popup notifications, smart de-duplication, auto-acknowledgment on issue resolution, manual acknowledgment tracking, independent port status monitoring, router connectivity alerts.
- **Security:** Encrypted router credentials (AES), bcrypt password hashing, conditional session cookie security, user approval for new Google OAuth accounts, WebSocket authorization checks, persistent session cookies.
- **Performance:** HTTP caching with ETags, React Query optimization, memoized data processing, throttled chart updates, background scheduler, aggressive static asset caching, dynamic gauge scaling.
- **Key Features:** User management (roles, invitations), router management (secure credentials, bulk checks, groups, fallbacks), traffic monitoring (real-time, historical, graphs), robust alerting system, automated daily backups with intelligent data-only restore, admin-only logs page with live view, automatic deployment, responsive design.

## External Dependencies
-   **PostgreSQL Database:** Neon (serverless).
-   **Authentication Providers:** Google OAuth, Replit Auth.
-   **MikroTik RouterOS API:** For router interaction.
-   **Node-cron:** For scheduling background tasks.
-   **Nodemailer:** For email notifications.
-   **Passport.js:** Authentication middleware.
-   **WebSocket:** For real-time notifications.
-   **net-snmp library:** For SNMP fallback.