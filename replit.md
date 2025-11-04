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
**Backend:** Express.js with TypeScript, PostgreSQL (Neon serverless) with Drizzle ORM, Passport.js (Google OAuth, Local Strategy, Replit OIDC), MikroTik RouterOS API client, Node-cron, Nodemailer, WebSocket server.

### Database Schema
**Core Tables:** `users` (with roles, username for local auth), `router_groups`, `routers` (with encrypted credentials), `monitored_ports` (with thresholds, cached interface metadata: comment, MAC, lastInterfaceUpdate), `traffic_data` (time-series), `alerts` (with acknowledged status), `notifications`, `sessions`.
**In-Memory Storage:** Nested Map structure for real-time traffic data, 7,200 entries per interface (2 hours at 1-second intervals).

### System Design Choices
- **UI/UX:** Mobile-first responsive design, dark mode support, collapsible sidebar, touch-friendly interactions, dynamic logo on homepage and sidebar, error handling and dynamic updates for custom logos.
- **Authentication:** Multi-provider authentication (Google OAuth, Local Admin, Replit Auth) with session management. Default local admin account ("admin"/"admin") with forced password change on first login. User invitation system for super admins with secure temporary passwords and forced password change. Admin password recovery script.
- **Authorization:** Role-Based Access Control (RBAC) with "admin" and "user" roles. Super admins have full system-wide access to all routers; normal users are restricted to their own. Authorization checks enforce ownership validation on all router operations.
- **Router Connectivity:** Three-tier fallback system for connecting to MikroTik routers: Native MikroTik API, HTTPS REST API (RouterOS v7.1+), and SNMP (v1/v2c). Automatic host extraction for REST API via SSL certificates. Network reachability status check. Optimized background scheduler using `lastSuccessfulConnectionMethod` to reduce unnecessary connection attempts.
- **Traffic Monitoring:** On-demand real-time traffic (1-second polling via WebSocket) when router details page is open, and historical (database, 30-second background polling for monitored ports only). Background scheduler polls monitored ports every 60 seconds for alert checking. Real-time polling starts/stops automatically based on page visibility. Dual data sources for different time ranges. Optimized storage with database persistence every 5 minutes and intelligent sampling. 2-year data retention with daily cleanup. RX-only threshold monitoring. Automatic interface metadata updates (comment, MAC address) during all router communications (background polling, alert checking, test connections, router creation/update) with zero additional API calls, stored in database for instant retrieval.
- **Alerting:** Configurable thresholds per port. Dual notification via Email and In-App Popup to owner AND all assigned users. Alert severity levels, acknowledgment workflow, and history tracking. Alert de-duplication, auto-acknowledgment, and independent port status monitoring. Dashboard shows only unacknowledged/active alerts. All alerts (router down, port down, traffic threshold) are sent to both router owner and all assigned users.
- **Security:** Encrypted router credentials (crypto-js AES), bcrypt password hashing (10 salt rounds), conditional session cookie security based on environment, user approval for new Google OAuth accounts (disabled by default). Multi-Auth User ID Handling for compatibility across all authentication methods. WebSocket real-time traffic polling authorization checks (users can only poll routers they own or if they're superadmins).
- **Performance:** HTTP caching with ETag and Cache-Control headers (30s max-age) on router/ports/interfaces endpoints. React Query optimized with 30s staleTime and 5min gcTime. Router details page optimized with memoized filtering/sorting, 2-second throttled chart updates, React.memo wrapped gauge components, and removed verbose logging. Monitored ports list uses cached database metadata for instant loading (no live API calls). Browser auto-refresh every 1 hour.

### Key Features
- **User Management:** Multi-provider authentication, Admin/Normal User roles, user invitation system with secure temporary passwords, role-based access control.
- **Router Management:** Add/manage MikroTik routers, secure credential storage, connection status monitoring, test connection functionality, router groups, three-tier fallback system, automatic hostname extraction, network reachability status, connection method display (Native API/REST API/SNMP badges).
- **Traffic Monitoring:** On-demand real-time updates (1-second WebSocket polling when router details page is open), all interfaces tracked during real-time mode, multi-interface graphs with 2-second visual throttle, dual data sources (WebSocket real-time/database historical), graph history page, 2-year data retention, interface comments in port selection, automatic start/stop based on page visibility.
- **Alert System:** Configurable thresholds, dual notification (Email + In-App Popup), alert de-duplication, auto-acknowledgment, port status monitoring, dashboard alert filtering, professional table-based alert history with traffic column showing threshold-triggering values, router connectivity alerts with 3-check confirmation, emergency sound notifications with toggleable buzzer alarm.
- **System Monitoring:** Admin-only logs page with live view mode that streams real-time server and browser logs with 1-second auto-refresh, downloadable logs, file size display, and auto-scroll to bottom in live mode.
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