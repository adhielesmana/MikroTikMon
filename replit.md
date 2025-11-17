# MikroTik Network Monitoring Platform

## Overview
A comprehensive, enterprise-grade network monitoring platform for MikroTik routers. It offers real-time traffic analysis, intelligent threshold-based alerting, and multi-user role-based access control. The platform is designed for professional network administrators, providing a production-ready solution for efficient network oversight. The project aims to provide a robust, scalable, and user-friendly system for monitoring MikroTik router performance and health, with features like user invitation, multi-provider authentication, and a three-tier fallback system for router connectivity.

## Recent Updates (Nov 17, 2025)
- **Removed Redundant 5-Minute Polling:** Eliminated `interface_graph` table and 5-minute background polling system. The 60-second `traffic_data` table (with 2-year retention and 90% compression after 7 days) provides more detailed historical data, making the 5-minute snapshots unnecessary. Simplified system architecture and reduced maintenance overhead.
- **Smart Deployment Script:** `intelligent-deploy.sh` now skips Nginx/SSL reconfiguration on subsequent runs, only updating Docker app. Preserves custom configurations. Use `FORCE_NGINX_RECONFIGURE=1` to force reconfiguration.
- **Automatic Directory Creation:** Deployment script automatically creates `attached_assets/logos/` and `logs/` directories on host with proper ownership (UID 1000 for nodejs user).
- **Logo Upload Fixed:** Resolved permission issues and missing `retention_days` column. Logo upload now works seamlessly on production.
- **Database Restoration:** Successfully restored production database from backup after second data loss incident.

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
**Core Tables:** `users` (with roles, username for local auth), `router_groups`, `routers` (with encrypted credentials), `monitored_ports` (with thresholds, cached interface metadata: comment, MAC, lastInterfaceUpdate), `traffic_data` (TimescaleDB hypertable for 60-second interval time-series data), `alerts` (with acknowledged status and acknowledgedBy tracking), `notifications`, `sessions`.
**In-Memory Storage:** Nested Map structure for real-time traffic data, 7,200 entries per interface (2 hours at 1-second intervals).
**TimescaleDB Features:**
- **Hypertables**: `traffic_data` table automatically partitioned into 1-day chunks for optimal query performance
- **Automatic Compression**: Data older than 7 days compressed automatically (90%+ storage savings)
- **Data Retention**: Automatic deletion of data older than 2 years
- **Continuous Aggregates**: Pre-computed hourly and daily summaries for fast dashboard queries
  - `traffic_data_hourly`: 1-hour time buckets with AVG/MAX metrics
  - `traffic_data_daily`: 1-day time buckets with AVG/MAX metrics
- **Single Source of Truth**: 60-second interval captures provide complete historical data (no separate 5-minute snapshots needed)

### Deployment Architecture
- **Production Setup**: Host nginx + Docker app architecture at mon.maxnetplus.id
- **Nginx**: Runs on host system (not Docker), handles SSL/TLS, reverse proxy, and WebSocket upgrades
- **Application**: Runs in Docker container on port 5000, managed by docker-compose
- **Deployment Script**: `intelligent-deploy.sh` with smart behavior:
  - **First run**: Installs nginx, configures SSL, creates directories, deploys app
  - **Subsequent runs**: Skips nginx/SSL (preserves configs), only updates Docker app
  - **Auto-creates directories**: `attached_assets/logos/`, `logs/` with proper ownership (UID 1000)
  - **Force reconfigure**: Set `FORCE_NGINX_RECONFIGURE=1` environment variable
- **SSL Certificates**: Let's Encrypt via certbot in standalone mode
- **Auto-Updates**: GitHub polling every 5 minutes, automatic deployment on code changes
- **Directory Ownership**: Host directories owned by UID 1000 (nodejs user in container) for proper write permissions

### System Design Choices
- **UI/UX:** Mobile-first responsive design, dark mode support, collapsible sidebar, touch-friendly interactions, dynamic logo on homepage and sidebar, error handling and dynamic updates for custom logos. **Automatic directory creation** on server startup ensures `attached_assets/logos/` and `logs/` directories exist with proper permissions (755) - no manual intervention required.
- **Logo Management:** Admin settings page accepts logo URLs which are automatically downloaded, stored locally in `attached_assets/logos/` with unique filenames (crypto random hash), and database updated with local file path. Old logos automatically deleted to prevent disk bloat. Seamless local storage for faster loading and offline reliability. **Production fix applied:** Directories auto-created with proper ownership (UID 1000), `retention_days` column added to `app_settings` table.
- **Authentication:** Multi-provider authentication (Google OAuth, Local Admin, Replit Auth) with session management. Default local admin account ("admin"/"admin") with forced password change on first login. User invitation system for super admins with secure temporary passwords and forced password change. Admin password recovery script.
- **Authorization:** Role-Based Access Control (RBAC) with "admin" and "user" roles. Super admins have full system-wide access to all routers; normal users are restricted to their own. Authorization checks enforce ownership validation on all router operations.
- **Router Connectivity:** Three-tier fallback system for connecting to MikroTik routers: Native MikroTik API, HTTPS REST API (RouterOS v7.1+), and SNMP (v1/v2c). Automatic host extraction for REST API via SSL certificates. Network reachability status check. Optimized background scheduler using `lastSuccessfulConnectionMethod` to reduce unnecessary connection attempts.
- **Traffic Monitoring:** On-demand real-time traffic (1-second polling via WebSocket) when router details page is open, and historical (60-second background polling for monitored ports only, stored in database). Background scheduler polls monitored ports every 60 seconds for alert checking and data collection. Real-time polling starts/stops automatically based on page visibility. Optimized storage with database persistence every 5 minutes. 2-year data retention with automatic compression (90% savings after 7 days) and daily cleanup. RX-only threshold monitoring. Automatic interface metadata updates (comment, MAC address) during all router communications (background polling, alert checking, test connections, router creation/update) with zero additional API calls, stored in database for instant retrieval.
- **Alerting:** Configurable thresholds per port. Dual notification via Email and In-App Popup to owner AND all assigned users. Alert severity levels, acknowledgment workflow with tracking (shows "system" for auto-acknowledgment or user's full name for manual acknowledgment), and history tracking. **Smart alert de-duplication** prevents sending multiple alerts for the same ongoing issue - if an active unacknowledged alert exists for a specific interface/router, no duplicate alerts are created until the issue is resolved or acknowledged. **Auto-acknowledgment** when issues resolve (router back online, port back up, traffic above threshold) - system automatically acknowledges alerts and logs them as acknowledged by "system". Independent port status monitoring. Dashboard shows only unacknowledged/active alerts. All alerts (router down, port down, traffic threshold) are sent to both router owner and all assigned users. Alerts table displays "Acknowledged By" column showing who resolved each alert.
- **Security:** Encrypted router credentials (crypto-js AES), bcrypt password hashing (10 salt rounds), conditional session cookie security based on environment, user approval for new Google OAuth accounts (disabled by default). Multi-Auth User ID Handling for compatibility across all authentication methods. WebSocket real-time traffic polling authorization checks (users can only poll routers they own or if they're superadmins). Persistent session cookies (7-day expiry with rolling refresh) to maintain login state across browser reloads.
- **Performance:** HTTP caching with ETag and Cache-Control headers (30s max-age) on router/ports/interfaces endpoints. React Query optimized with 30s staleTime and 5min gcTime. Router details page optimized with memoized filtering/sorting, 2-second throttled chart updates, React.memo wrapped gauge components, and removed verbose logging. Monitored ports list uses cached database metadata for instant loading (no live API calls). Browser auto-refresh every 1 hour with persistent login (session cookies). Aggressive static asset caching (1-year max-age with immutable flag) for JS/CSS/images while HTML is never cached. Dynamic gauge scaling (<100Mbps uses 0-100 scale, 100-1000Mbps uses 0-1000 scale, >1000Mbps uses 0-10000 scale).

### Key Features
- **User Management:** Multi-provider authentication, Admin/Normal User roles, user invitation system with secure temporary passwords, role-based access control.
- **Router Management:** Add/manage MikroTik routers, secure credential storage, connection status monitoring, test connection functionality, router groups, three-tier fallback system, automatic hostname extraction, network reachability status, connection method display (Native API/REST API/SNMP badges).
- **Traffic Monitoring:** On-demand real-time updates (1-second WebSocket polling when router details page is open), all interfaces tracked during real-time mode, multi-interface graphs with 2-second visual throttle, dual data sources (WebSocket real-time/database historical), graph history page, 2-year data retention, interface comments in port selection, automatic start/stop based on page visibility.
- **Alert System:** Configurable thresholds, dual notification (Email + In-App Popup), smart alert de-duplication (prevents duplicate alerts for same ongoing issue), auto-acknowledgment when issues resolve (logged as "system"), manual acknowledgment (logged with user's full name), port status monitoring, dashboard alert filtering, professional table-based alert history with traffic column showing threshold-triggering values and "Acknowledged By" column, router connectivity alerts with 3-check confirmation, emergency sound notifications with toggleable buzzer alarm.
- **System Monitoring:** Admin-only logs page with live view mode that streams real-time server and browser logs with 1-second auto-refresh, downloadable logs, file size display, and auto-scroll to bottom in live mode.
- **Automatic Deployment:** Self-updating system that checks GitHub every 5 minutes for code updates. Automatically pulls changes, installs dependencies if needed, and restarts the application. Zero-downtime deployments with Docker restart policies. Production-only feature (disabled in development).
- **Responsive Design:** Mobile-first approach, collapsible sidebar, touch-friendly, auto-sizing components, dark mode.
- **Security Features:** Encrypted credentials, role-based access control, user approval workflow, session-based authentication, user-scoped WebSocket notifications, authorization checks.
- **Performance:** HTTP caching with ETags (30s), React Query optimization (30s stale/5min gc), memoized data processing, throttled chart updates (2s), React.memo components, background scheduler (60s interval for monitored ports only), on-demand real-time polling (1s interval via WebSocket), indexed traffic data, efficient Drizzle ORM queries, real-time WebSocket updates, responsive UI, optimized alert queries, reduced server load by polling only when needed, automatic browser refresh every 1 hour.

## External Dependencies
-   **PostgreSQL Database:** Neon (serverless) for data persistence.
-   **Authentication Providers:** Google OAuth, Replit Auth.
-   **MikroTik RouterOS API:** For router interaction.
-   **Node-cron:** For scheduling background tasks.
-   **Nodemailer:** For email notifications.
-   **Passport.js:** Authentication middleware.
-   **WebSocket:** For real-time notifications.
-   **net-snmp library:** For SNMP fallback.