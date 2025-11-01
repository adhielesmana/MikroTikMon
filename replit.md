# MikroTik Network Monitoring Platform

## Overview
A comprehensive, enterprise-grade network monitoring platform for MikroTik routers. It offers real-time traffic analysis, intelligent threshold-based alerting, and multi-user role-based access control. The platform is designed for professional network administrators, providing a production-ready solution for efficient network oversight. The project aims to provide a robust, scalable, and user-friendly system for monitoring MikroTik router performance and health.

## Recent Changes (Nov 1, 2025)
-   **Login Page and Routing:** Created dedicated login page at `/login` with local admin and Google OAuth options. Updated landing page links from `/api/login` to `/login`. Added server-side redirect from `/api/login` to `/login` for backward compatibility in non-Replit environments. Login page features form validation, error handling, and display of default admin credentials.
-   **Simplified Default Admin Authentication:** Implemented default local admin account with username "admin" and password "admin" - no environment configuration required! On first login, users are forced to change both username and password with bcrypt hashing (10 salt rounds). This eliminates the complexity of pre-generating password hashes while maintaining security.
-   **Admin Password Recovery:** Added password reset script (`scripts/reset-admin-password.js`) for recovery when admin forgets password. Generates cryptographically secure random temporary password (16 characters) using Node.js crypto module. Can be run via `./deploy.sh reset-password` command. Sets `mustChangePassword` flag to force password change on next login. Includes detailed console output with security warnings and next steps.
-   **Forced Password Change Flow:** Added `mustChangePassword` flag to users table. Default admin account automatically triggers password change screen on first login. New dedicated ChangePassword page with form validation ensures secure password update (minimum 8 characters). Once password is changed, users gain full access to the platform.
-   **Multi-Provider Authentication:** Comprehensive authentication system supporting three methods: Google OAuth (for public access), local admin (default admin/admin credentials), and Replit Auth (for Replit-hosted deployments). All methods can work simultaneously. Session management uses universal serialize/deserialize handlers for all providers.
-   **Google OAuth Integration:** Added Passport.js Google OAuth strategy for public user sign-in. Users authenticate with Google accounts, profiles auto-populated (name, email, photo). New users are disabled by default and require admin approval.
-   **Enhanced Security:** Session cookie security is conditional on production environment (secure in production, permissive in development for local testing). Passwords stored as bcrypt hashes with 10 salt rounds. Old password verification required before changing to new password. Password generation uses cryptographically secure random number generator (crypto.randomInt).
-   **Multi-Auth User ID Handling:** Added `getUserId()` helper function in routes.ts to handle user ID extraction for all authentication providers. Function supports both OIDC users (ID in `req.user.claims.sub`) and local/Google users (ID in `req.user.id`). All API routes updated to use this helper instead of direct property access, ensuring compatibility across all authentication methods.

## Previous Changes (Oct 30, 2025)
-   **Background Fallback Optimization:** Major performance optimization for background scheduler! Connection method fallback testing (Native API → REST API → SNMP) now only happens when viewing/editing a router or when the cached method fails. Added `lastSuccessfulConnectionMethod` field to routers table to store the last working method. Background scheduler now uses the cached method directly, dramatically reducing unnecessary connection attempts. Result: ~66% reduction in background API calls and faster traffic data collection.
-   **RX-Only Threshold Monitoring:** Changed traffic threshold monitoring to check only RX (download/received) traffic instead of total traffic. Alert messages and emails now clearly indicate "RX traffic" for better clarity. This provides more accurate monitoring focused on incoming bandwidth consumption.
-   **Interface Filtering Bug Fix:** Fixed critical filtering bug where angle brackets in interface names (e.g., `<pppoe-xxx>`) bypassed the dynamic interface filter. Updated `filterInterfaces()` function to strip angle brackets before checking prefixes. Filtering now properly applied across all three connection methods at the `getInterfaceStats()` level (Native API, REST API, SNMP). Result: POP Soba Spasico now correctly shows 16 static interfaces instead of 135 total interfaces in "Static Only" mode.
-   **Dynamic Logo on Homepage:** Extended custom logo support to the Landing page (homepage). Logo now updates automatically on both the sidebar and homepage when a custom logo URL is set in Settings. Implements same error handling and dynamic update pattern using `useEffect` to reset error state when logo changes, ensuring seamless updates when logo becomes available.

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
**Backend:** Express.js with TypeScript, PostgreSQL (Neon serverless) with Drizzle ORM, Passport.js multi-provider authentication (Google OAuth, Local Strategy, Replit OIDC), MikroTik RouterOS API client, Node-cron for scheduled traffic polling, Nodemailer for email notifications, WebSocket server.

### Database Schema
**Core Tables:** `users` (with roles), `router_groups`, `routers` (with encrypted credentials), `monitored_ports` (with thresholds), `traffic_data` (time-series), `alerts` (with acknowledged status), `notifications`, `sessions`.

**Key Storage Methods:**
- `getLatestUnacknowledgedAlertForPort`: Returns only unacknowledged alerts for proper alert independence and auto-acknowledgment logic.
- `getRealtimeTraffic`: Retrieves in-memory traffic data for real-time graphing (per-interface buffering with 7200 entries each).
- `getRecentTraffic`: Retrieves historical traffic data from database for long-term analysis.

**In-Memory Storage:**
- Nested Map structure: `Map<routerId, Map<portName, RealtimeTrafficData[]>>`
- 7,200 entries per interface (2 hours at 1-second intervals)
- Memory footprint: ~0.6 MB per router (9 interfaces × 7200 × ~80 bytes)

### Key Features
-   **User Management:** Multi-provider authentication (Google OAuth, Static Super Admin, Replit Auth), Administrator/Normal User roles, admin approval for new users (Google OAuth accounts disabled by default), guaranteed admin access via static super admin account.
-   **Router Management:** Add/manage MikroTik routers with secure credential storage, connection status monitoring, test connection functionality, user-specific router collections.
    -   **Router Groups:** Organize routers into customizable groups with filtering capabilities.
    -   **Three-Tier Fallback System:** Automatic failover between Native MikroTik API, HTTPS REST API (RouterOS v7.1+ with 64-bit counter support), and SNMP (v1/v2c with 64-bit counter support) for maximum connectivity and data accuracy. Each method is independently configurable.
    -   **Automatic Hostname Extraction:** For REST API connections via IP, extracts hostname from SSL certificates for improved reliability.
    -   **Network Reachability Status:** Basic TCP connectivity check to distinguish network issues from configuration problems, displayed in the UI.
-   **Traffic Monitoring:** 
    -   **Real-Time Updates:** 1-second polling interval with in-memory storage (2 hours per interface)
    -   **All Interfaces Tracked:** Collects traffic data for ALL router interfaces (not just monitored ports)
    -   **Multi-Interface Graphs:** Select and view multiple interfaces simultaneously with color-coded TX/RX lines
    -   **Dual Data Sources:** Real-time endpoint for 15m/1h ranges (1s polling), database endpoint for 6h+ ranges (30s polling)
    -   **Optimized Storage:** Database persistence every 5 minutes with intelligent sampling (~5 data points per interface per 5-minute period)
    -   **Default Selection:** All monitored ports automatically selected on page load for immediate visualization
    -   **Graph History Page:** Dedicated page for viewing historical data with router selection and time range controls (1h, 12h, 1d, 7d, 30d, or custom date range)
    -   **2-Year Data Retention:** Historical traffic data stored for 2 years with automatic daily cleanup
-   **Alert System:** Configurable thresholds per port, dual notification (Email + In-App Popup), alert severity levels, acknowledgment workflow, and history tracking.
    -   **Alert De-duplication:** Prevents spamming by only generating new alerts when status changes (port down vs traffic threshold).
    -   **Auto-Acknowledgment:** Automatically acknowledges alerts when conditions return to normal (traffic above threshold or port comes back up).
    -   **Port Status Monitoring:** Independent port down/up detection with critical severity alerts, separate from traffic threshold monitoring.
    -   **Dashboard Alert Filtering:** Recent alerts section shows only unacknowledged/active alerts requiring attention.
    -   **Table-Based Alert History:** Professional table layout for viewing and managing all alert history with sorting and filtering capabilities.
-   **Responsive Design:** Mobile-first approach with collapsible sidebar, touch-friendly interactions, auto-sizing components, and dark mode support.
-   **Security Features:** Encrypted router credentials (crypto-js AES), role-based access control, user approval workflow, session-based authentication, user-scoped WebSocket notifications, and proper authorization checks.
-   **Performance:** Background scheduler (30-second polling), indexed traffic data, efficient Drizzle ORM queries, real-time WebSocket updates, and responsive UI.

## External Dependencies
-   **PostgreSQL Database:** Utilized via Neon (serverless) for data persistence.
-   **Authentication Providers:** Google OAuth (optional, for public access), Replit Auth (optional, for Replit-hosted deployments). Static super admin uses local bcrypt authentication.
-   **MikroTik RouterOS API:** Primary method for router interaction.
-   **Node-cron:** For scheduling background tasks like traffic polling.
-   **Nodemailer:** For sending email notifications (currently configured for console logging).
-   **Passport.js:** Authentication middleware supporting multiple strategies (Google OAuth, Local, Replit OIDC).
-   **WebSocket:** For real-time, user-scoped notifications.
-   **net-snmp library:** For SNMP fallback functionality.