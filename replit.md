# MikroTik Network Monitoring Platform

## Overview
A comprehensive, enterprise-grade network monitoring platform for MikroTik routers. It offers real-time traffic analysis, intelligent threshold-based alerting, and multi-user role-based access control. The platform is designed for professional network administrators, providing a production-ready solution for efficient network oversight. The project aims to provide a robust, scalable, and user-friendly system for monitoring MikroTik router performance and health.

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
**Frontend:** React with TypeScript, Wouter for routing, TanStack Query for data fetching, Shadcn UI + Tailwind CSS for components, Recharts for traffic visualization, WebSocket for real-time updates.
**Backend:** Express.js with TypeScript, PostgreSQL (Neon serverless) with Drizzle ORM, Replit Auth (OpenID Connect) for authentication, MikroTik RouterOS API client, Node-cron for scheduled traffic polling, Nodemailer for email notifications, WebSocket server.

### Database Schema
**Core Tables:** `users` (with roles), `router_groups`, `routers` (with encrypted credentials), `monitored_ports` (with thresholds), `traffic_data` (time-series), `alerts`, `notifications`, `sessions`.

### Key Features
-   **User Management:** Multi-user authentication (Replit Auth), Administrator/Normal User roles, admin approval for new users.
-   **Router Management:** Add/manage MikroTik routers with secure credential storage, connection status monitoring, test connection functionality, user-specific router collections.
    -   **Router Groups:** Organize routers into customizable groups with filtering capabilities.
    -   **Three-Tier Fallback System:** Automatic failover between Native MikroTik API, HTTPS REST API (RouterOS v7.1+ with 64-bit counter support), and SNMP (v1/v2c with 64-bit counter support) for maximum connectivity and data accuracy. Each method is independently configurable.
    -   **Automatic Hostname Extraction:** For REST API connections via IP, extracts hostname from SSL certificates for improved reliability.
    -   **Network Reachability Status:** Basic TCP connectivity check to distinguish network issues from configuration problems, displayed in the UI.
-   **Traffic Monitoring:** Real-time traffic graphs (Recharts) with multiple time ranges, per-port visualization, and historical data tracking.
-   **Alert System:** Configurable thresholds per port, dual notification (Email + In-App Popup), alert severity levels, acknowledgment workflow, and history tracking. Includes **Alert De-duplication** to prevent spamming by only generating new alerts when status changes.
-   **Responsive Design:** Mobile-first approach with collapsible sidebar, touch-friendly interactions, auto-sizing components, and dark mode support.
-   **Security Features:** Encrypted router credentials (crypto-js AES), role-based access control, user approval workflow, session-based authentication, user-scoped WebSocket notifications, and proper authorization checks.
-   **Performance:** Background scheduler (30-second polling), indexed traffic data, efficient Drizzle ORM queries, real-time WebSocket updates, and responsive UI.

## External Dependencies
-   **PostgreSQL Database:** Utilized via Neon (serverless) for data persistence.
-   **Replit Auth:** For user authentication and session management (OpenID Connect).
-   **MikroTik RouterOS API:** Primary method for router interaction.
-   **Node-cron:** For scheduling background tasks like traffic polling.
-   **Nodemailer:** For sending email notifications (currently configured for console logging).
-   **WebSocket:** For real-time, user-scoped notifications.
-   **net-snmp library:** For SNMP fallback functionality.