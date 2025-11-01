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
**Core Tables:** `users` (with roles, username for local auth), `router_groups`, `routers` (with encrypted credentials), `monitored_ports` (with thresholds), `traffic_data` (time-series), `alerts` (with acknowledged status), `notifications`, `sessions`.
**In-Memory Storage:** Nested Map structure for real-time traffic data, 7,200 entries per interface (2 hours at 1-second intervals).

### System Design Choices
- **UI/UX:** Mobile-first responsive design, dark mode support, collapsible sidebar, touch-friendly interactions, dynamic logo on homepage and sidebar, error handling and dynamic updates for custom logos.
- **Authentication:** Multi-provider authentication (Google OAuth, Local Admin, Replit Auth) with session management. Default local admin account ("admin"/"admin") with forced password change on first login. User invitation system for super admins with secure temporary passwords and forced password change. Admin password recovery script.
- **Authorization:** Role-Based Access Control (RBAC) with "admin" and "user" roles. Super admins have full system-wide access to all routers; normal users are restricted to their own. Authorization checks enforce ownership validation on all router operations.
- **Router Connectivity:** Three-tier fallback system for connecting to MikroTik routers: Native MikroTik API, HTTPS REST API (RouterOS v7.1+), and SNMP (v1/v2c). Automatic host extraction for REST API via SSL certificates. Network reachability status check. Optimized background scheduler using `lastSuccessfulConnectionMethod` to reduce unnecessary connection attempts.
- **Traffic Monitoring:** Real-time (1-second polling, in-memory) and historical (database, 30-second polling) data. Collects data for all router interfaces. Dual data sources for different time ranges. Optimized storage with database persistence every 5 minutes and intelligent sampling. 2-year data retention with daily cleanup. RX-only threshold monitoring.
- **Alerting:** Configurable thresholds per port. Dual notification via Email and In-App Popup. Alert severity levels, acknowledgment workflow, and history tracking. Alert de-duplication, auto-acknowledgment, and independent port status monitoring. Dashboard shows only unacknowledged/active alerts.
- **Security:** Encrypted router credentials (crypto-js AES), bcrypt password hashing (10 salt rounds), conditional session cookie security based on environment, user approval for new Google OAuth accounts (disabled by default). Multi-Auth User ID Handling for compatibility across all authentication methods.

### Key Features
- **User Management:** Multi-provider authentication, Admin/Normal User roles, user invitation system with secure temporary passwords, role-based access control.
- **Router Management:** Add/manage MikroTik routers, secure credential storage, connection status monitoring, test connection functionality, router groups, three-tier fallback system, automatic hostname extraction, network reachability status.
- **Traffic Monitoring:** Real-time updates (1-second polling), all interfaces tracked, multi-interface graphs, dual data sources (in-memory/database), graph history page, 2-year data retention.
- **Alert System:** Configurable thresholds, dual notification (Email + In-App Popup), alert de-duplication, auto-acknowledgment, port status monitoring, dashboard alert filtering, professional table-based alert history.
- **Responsive Design:** Mobile-first approach, collapsible sidebar, touch-friendly, auto-sizing components, dark mode.
- **Security Features:** Encrypted credentials, role-based access control, user approval workflow, session-based authentication, user-scoped WebSocket notifications, authorization checks.
- **Performance:** Background scheduler, indexed traffic data, efficient Drizzle ORM queries, real-time WebSocket updates, responsive UI.

## External Dependencies
-   **PostgreSQL Database:** Neon (serverless) for data persistence.
-   **Authentication Providers:** Google OAuth, Replit Auth.
-   **MikroTik RouterOS API:** For router interaction.
-   **Node-cron:** For scheduling background tasks.
-   **Nodemailer:** For email notifications.
-   **Passport.js:** Authentication middleware.
-   **WebSocket:** For real-time notifications.
-   **net-snmp library:** For SNMP fallback.