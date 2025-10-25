# MikroTik Monitoring Platform - Design Guidelines

## Design Approach
**System-Based Approach**: Modern dashboard design drawing from Linear's minimalist precision and Grafana's data visualization excellence. This utility-focused monitoring tool prioritizes data clarity, efficient workflows, and professional technical aesthetics.

**Core Principles**:
- Data-first hierarchy: Traffic metrics and graphs command primary attention
- Surgical precision: Every element serves a functional purpose
- Professional confidence: Clean, technical aesthetic for network administrators
- Responsive intelligence: Seamless experience from mobile to desktop

## Typography System

**Font Stack**: Inter (primary), JetBrains Mono (data/metrics)

**Hierarchy**:
- Dashboard Headers: text-2xl font-semibold (24px)
- Section Titles: text-lg font-semibold (18px)
- Card Headers: text-base font-medium (16px)
- Body Text: text-sm font-normal (14px)
- Data Labels: text-xs font-medium uppercase tracking-wide (12px)
- Metrics/Numbers: text-lg font-mono font-semibold (18px)
- Small Metrics: text-sm font-mono (14px)

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, and 16 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card margins: gap-4 to gap-6
- Dense data tables: p-2 to p-3

**Grid Strategy**:
- Desktop: 12-column responsive grid
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Router list: grid-cols-1 lg:grid-cols-2 xl:grid-cols-3
- Metrics overview: grid-cols-2 md:grid-cols-4
- Mobile: Always single column with full-width cards

**Container Widths**:
- Main content area: max-w-7xl mx-auto
- Narrow forms/settings: max-w-2xl
- Full-width graphs: w-full
- Sidebar navigation: w-64 (desktop), full-width drawer (mobile)

## Component Library

### Navigation Structure

**Desktop Sidebar**:
- Fixed left sidebar (w-64) with logo, main navigation, user profile
- Collapsible sections for Dashboard, Routers, Alerts, Settings, Admin (role-based)
- Active state indicators with subtle accent treatment
- User role badge beneath profile

**Mobile Navigation**:
- Top app bar with hamburger menu, page title, notification bell
- Slide-out drawer navigation replicating desktop sidebar
- Bottom tab bar for primary sections (Dashboard, Routers, Alerts, Profile)

**Header Bar**:
- Breadcrumb navigation for deep pages
- Global search (router/port quick access)
- Notification bell with unread count badge
- User avatar dropdown (profile, settings, logout)

### Dashboard Components

**Router Status Cards**:
- Card layout with router name, IP, connection status indicator
- Live status dot (connected/disconnected/warning)
- Quick metrics: Total ports, Active alerts, Last sync time
- Action menu (View details, Edit, Remove)
- Grid layout: 3 columns desktop, 2 tablet, 1 mobile

**Traffic Graph Section**:
- Full-width responsive chart containers
- Time range selector (15m, 1h, 6h, 24h, 7d, 30d)
- Real-time updating line charts for traffic data
- Dual-axis for upload/download with clear legends
- Port filter dropdown for multi-port selection
- Export data button (CSV/PNG)

**Alert Panel**:
- Dedicated alert sidebar or collapsible panel
- Alert cards with severity indicators (critical, warning, info)
- Timestamp, router name, port, threshold details
- Dismiss/acknowledge actions
- Alert history toggle

### Data Visualization

**Live Traffic Graphs**:
- Line charts with smooth animations for real-time updates
- Grid background for easy value reading
- Hover tooltips showing exact values and timestamps
- Responsive height: h-64 on mobile, h-80 on desktop
- Clear axis labels and legends

**Historical Data Views**:
- Stacked area charts for bandwidth over time
- Bar charts for port comparison
- Heatmap calendar view for traffic patterns
- Zoomable/pannable interfaces for data exploration

**Port Traffic Table**:
- Sortable data table with port name, current traffic, peak, average
- Inline mini-sparklines showing 24h trend
- Status indicators for threshold compliance
- Pagination for many ports

### Form Components

**Router Configuration**:
- Two-column form layout (desktop), single column (mobile)
- Input fields: Router name, IP address, API port, username, password
- Connection test button with loading state and result feedback
- Save/cancel actions fixed at bottom on mobile

**Alert Configuration**:
- Port selection with multi-select dropdown
- Threshold input with unit selector (Mbps/Kbps)
- Notification preferences checkboxes (Email, Popup)
- Enable/disable toggle for quick activation

**User Management (Admin)**:
- Data table with user email, role, status, registration date
- Inline action buttons (Edit, Enable/Disable, Delete)
- Filter/search bar for user lookup
- Role badge indicators
- Approve pending users with one-click action

### Authentication Pages

**Login Page**:
- Centered card (max-w-md) on clean background
- Logo and app name at top
- Replit Auth social login buttons
- Email/password form with validation
- "New user? Register" link
- Forgot password link

**Registration Page**:
- Similar centered card layout
- Required fields: Name, email, password, confirm password
- Terms acceptance checkbox
- "Account pending approval" message post-registration
- Login redirect link

### Notification System

**Popup Notifications**:
- Toast notifications sliding from top-right
- Alert severity color treatment on icon/border
- Router name, port, threshold breach details
- Timestamp and close button
- Auto-dismiss after 8 seconds, persist on hover
- Stack multiple notifications with spacing

**Email Notification Template**:
- Plain text structure for reliability
- Clear subject: "[ALERT] Router [name] Port [x] Below Threshold"
- Body: Router details, port, current traffic, threshold, timestamp
- Direct link to dashboard for quick access

### Administrative Interface

**User Management Dashboard**:
- Tabbed interface: Active Users, Pending Approval, Disabled
- Bulk action toolbar (Enable selected, Disable selected)
- User detail modal with edit capabilities
- Audit log showing user actions

**All Routers View**:
- Grouped by user with expandable sections
- User name header with total router count
- Router cards showing same metrics as user dashboard
- Quick filters by connection status

### Mobile Optimizations

**Touch-Friendly Interactions**:
- Minimum touch target: 44x44px for all interactive elements
- Swipe gestures for router card actions
- Pull-to-refresh for dashboard updates
- Long-press for context menus

**Responsive Adaptations**:
- Hamburger menu replacing sidebar
- Stacked graph layouts on small screens
- Simplified table views (hide non-critical columns)
- Fixed bottom action buttons for forms
- Single-column router grid

## Accessibility Standards

- Semantic HTML structure throughout
- ARIA labels for all interactive elements
- Keyboard navigation for all functions (Tab, Enter, Escape)
- Focus indicators on all interactive elements
- Screen reader announcements for real-time updates
- High contrast ratios for text (WCAG AA compliant)
- Form validation with clear error messages
- Loading states with aria-live regions

## Images

**Login/Registration Background**: 
Abstract network topology visualization or circuit board pattern (subtle, low opacity)

**Empty States**:
- No routers configured: Simple illustration of router icon with "Add your first router" message
- No alerts: Checkmark icon with "All systems running smoothly" message
- No data available: Clock icon with "Waiting for traffic data" message

**Dashboard Header**: 
Optional: Subtle gradient or network mesh pattern as decorative element (non-critical)

This design creates a professional, data-dense monitoring platform that scales beautifully from mobile to desktop while maintaining clarity and usability for technical users managing multiple routers.