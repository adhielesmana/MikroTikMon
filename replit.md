# MikroTik Network Monitoring Platform

## Overview
A comprehensive, enterprise-grade network monitoring platform for MikroTik routers with real-time traffic analysis, intelligent threshold-based alerting, and multi-user role-based access control. Built with modern web technologies for professional network administrators.

## Current State
**Phase:** Development - Task 1 Complete (Frontend & Schema)
- ✅ Complete database schema designed with PostgreSQL
- ✅ User authentication with Replit Auth (supports Google, GitHub, email/password)
- ✅ Role-based access control (Administrator & Normal User)
- ✅ Beautiful, mobile-responsive UI with Shadcn components
- ✅ All frontend pages and components implemented
- 🚧 Backend API implementation in progress
- 🚧 MikroTik API integration pending
- 🚧 Real-time WebSocket notifications pending

## Recent Changes (Latest Session)
- Created complete database schema with users, routers, monitored ports, traffic data, alerts, and notifications
- Implemented all frontend pages: Landing, Dashboard, Routers, Alerts, Settings, Admin Users
- Built reusable components: RouterCard, AddRouterDialog, AppSidebar
- Configured responsive sidebar navigation with role-based menu items
- Added comprehensive form validation with Zod schemas
- Implemented beautiful empty states and loading skeletons
- Created mobile-first responsive layouts

## Project Architecture

### Technology Stack
**Frontend:**
- React with TypeScript
- Wouter for routing
- TanStack Query for data fetching
- Shadcn UI + Tailwind CSS for components
- Recharts for traffic visualization
- WebSocket for real-time updates

**Backend:**
- Express.js with TypeScript
- PostgreSQL database (Neon serverless)
- Drizzle ORM for type-safe queries
- Replit Auth (OpenID Connect) for authentication
- MikroTik RouterOS API client
- Node-cron for scheduled traffic polling
- Nodemailer for email notifications
- WebSocket server for real-time alerts

### Database Schema
**Core Tables:**
1. `users` - User accounts with roles (admin/user) and enabled status
2. `routers` - MikroTik router configurations with encrypted credentials
3. `monitored_ports` - Port monitoring configuration with thresholds
4. `traffic_data` - Historical traffic metrics (time-series data)
5. `alerts` - Triggered threshold breach alerts
6. `notifications` - Notification delivery history
7. `sessions` - User session management (Replit Auth)

### Key Features Implemented

#### User Management
- Multi-user authentication via Replit Auth
- Two-tier role system: Administrator and Normal User
- New users disabled by default, requiring admin approval
- Admins can enable/disable users, change roles, and view all routers

#### Router Management
- Add multiple MikroTik routers with secure credential storage
- Encrypted password storage using crypto-js
- Connection status monitoring
- Test connection functionality
- Each user manages their own router collection

#### Traffic Monitoring (Frontend Ready)
- Real-time traffic graphs with Recharts
- Multiple time range views (15m, 1h, 6h, 24h, 7d, 30d)
- Per-port traffic visualization
- Historical data tracking
- Responsive charts for mobile and desktop

#### Alert System (Frontend Ready)
- Configurable thresholds per port
- Dual notification system (Email + In-App Popup)
- Alert severity levels (critical, warning, info)
- Alert acknowledgment workflow
- Alert history tracking

#### Responsive Design
- Mobile-first approach
- Collapsible sidebar navigation
- Touch-friendly interactions
- Auto-sizing components
- Dark mode support (built into Shadcn)

## User Preferences
- Professional, data-dense monitoring interface
- Mobile and desktop accessibility required
- Real-time updates essential
- Email and popup notifications for alerts
- Administrator oversight of user accounts

## Next Steps

### Task 2: Backend Implementation
1. Implement Replit Auth integration in server
2. Create all API endpoints:
   - User management (admin)
   - Router CRUD operations
   - Port configuration
   - Traffic data retrieval
   - Alert management
   - Notification delivery
3. Set up PostgreSQL database with Drizzle
4. Integrate MikroTik RouterOS API client
5. Implement background job scheduler for traffic polling
6. Set up email notification service
7. Create WebSocket server for real-time updates

### Task 3: Integration & Testing
1. Connect all frontend components to backend APIs
2. Implement real-time WebSocket updates
3. Add comprehensive error handling
4. Test multi-user workflows
5. Test alert triggering and notifications
6. Verify mobile responsiveness
7. Ensure admin user management works correctly
8. Get architect review of complete implementation
9. Conduct end-to-end testing

## Development Guidelines
- Follow the `design_guidelines.md` for all UI implementations
- Use the existing Shadcn component library
- Maintain type safety with TypeScript throughout
- Implement proper error handling and loading states
- Keep security in mind (encrypted credentials, role checks)
- Test on mobile devices during development

## API Structure (To Be Implemented)
```
Authentication:
GET  /api/auth/user                 - Get current user
GET  /api/login                     - Start login flow (Replit Auth)
GET  /api/logout                    - Logout user

Routers:
GET    /api/routers                 - List user's routers
POST   /api/routers                 - Add new router
GET    /api/routers/:id             - Get router details
PATCH  /api/routers/:id             - Update router
DELETE /api/routers/:id             - Delete router
POST   /api/routers/test            - Test connection
POST   /api/routers/:id/test        - Test specific router

Ports:
GET    /api/routers/:id/ports       - List monitored ports
POST   /api/routers/:id/ports       - Add monitored port
PATCH  /api/ports/:id               - Update port config
DELETE /api/ports/:id               - Delete port

Traffic Data:
GET    /api/routers/:id/traffic     - Get traffic data with time range

Alerts:
GET    /api/alerts                  - List user's alerts
POST   /api/alerts/:id/acknowledge  - Acknowledge alert

Admin:
GET    /api/admin/users             - List all users
PATCH  /api/admin/users/:id         - Update user (enable/role)
DELETE /api/admin/users/:id         - Delete user
GET    /api/admin/routers           - List all routers (all users)
```

## Notes
- PostgreSQL database already provisioned
- All required npm packages installed
- Design system fully configured
- Frontend components tested for responsiveness
- Ready for backend implementation phase
