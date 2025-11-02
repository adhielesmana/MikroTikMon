# Database Schema Documentation

Complete reference for the MikroTik Network Monitoring Platform database structure.

---

## Overview

The database uses PostgreSQL with the following tables:
- **Users** - Authentication and authorization
- **Sessions** - Session management
- **Router Groups** - Router organization
- **Routers** - MikroTik router configurations
- **Monitored Ports** - Interface monitoring settings
- **Traffic Data** - Historical traffic metrics (time-series)
- **Alerts** - Threshold violation alerts
- **Notifications** - Notification history
- **App Settings** - Global application settings

---

## Table Structures

### 1. Users Table

Stores user accounts with multi-provider authentication support.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `username` | VARCHAR | UNIQUE, NULLABLE | Username for local auth |
| `email` | VARCHAR | UNIQUE, NULLABLE | Email for OAuth providers |
| `first_name` | VARCHAR | NULLABLE | User's first name |
| `last_name` | VARCHAR | NULLABLE | User's last name |
| `profile_image_url` | VARCHAR | NULLABLE | Profile picture URL |
| `role` | VARCHAR(20) | NOT NULL, DEFAULT 'user' | User role: 'admin' or 'user' |
| `is_superadmin` | BOOLEAN | NOT NULL, DEFAULT false | Hardcoded superadmin flag |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT false | Account enabled status |
| `password_hash` | TEXT | NULLABLE | Bcrypt password hash |
| `must_change_password` | BOOLEAN | NOT NULL, DEFAULT false | Force password change |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update time |

**Hardcoded Superadmin:**
- ID: `super-admin-001`
- Username: `adhielesmana`
- Password: `admin123` (hash: `$2b$10$ASst66/GZvS3LHAnC5671ep42D8MQtyPguAkUMFittEvbrXXg//tW`)
- Cannot be deleted or disabled

---

### 2. Sessions Table

Stores user session data (required for authentication).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sid` | VARCHAR | PRIMARY KEY | Session ID |
| `sess` | JSONB | NOT NULL | Session data |
| `expire` | TIMESTAMP | NOT NULL | Expiration time |

**Indexes:**
- `idx_session_expire` on `expire`

---

### 3. Router Groups Table

Organizes routers into logical groups.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Group identifier |
| `user_id` | VARCHAR | NOT NULL, FK → users(id) | Owner user ID |
| `name` | VARCHAR(255) | NOT NULL | Group name |
| `description` | TEXT | NULLABLE | Group description |
| `color` | VARCHAR(7) | DEFAULT '#3b82f6' | UI color (hex) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update time |

**Constraints:**
- UNIQUE(`user_id`, `name`) - Unique group names per user
- ON DELETE CASCADE - Deletes when user is deleted

---

### 4. Routers Table

Stores MikroTik router configurations with three-tier connection support.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Router identifier |
| `user_id` | VARCHAR | NOT NULL, FK → users(id) | Owner user ID |
| `group_id` | VARCHAR | NULLABLE, FK → router_groups(id) | Group assignment |
| `name` | VARCHAR(255) | NOT NULL | Router name |
| `ip_address` | VARCHAR(255) | NOT NULL | IP address or hostname |
| `port` | INTEGER | NOT NULL, DEFAULT 8728 | API port |
| `username` | VARCHAR(255) | NOT NULL | Router username |
| `encrypted_password` | TEXT | NOT NULL | AES-encrypted password |
| `connected` | BOOLEAN | NOT NULL, DEFAULT false | Connection status |
| `reachable` | BOOLEAN | NOT NULL, DEFAULT false | Network reachability |
| `last_connected` | TIMESTAMP | NULLABLE | Last successful connection |
| `rest_enabled` | BOOLEAN | NOT NULL, DEFAULT false | REST API enabled |
| `rest_port` | INTEGER | NOT NULL, DEFAULT 443 | REST API port |
| `snmp_enabled` | BOOLEAN | NOT NULL, DEFAULT false | SNMP enabled |
| `snmp_community` | VARCHAR(255) | DEFAULT 'public' | SNMP community string |
| `snmp_version` | VARCHAR(10) | DEFAULT '2c' | SNMP version: '1', '2c' |
| `snmp_port` | INTEGER | NOT NULL, DEFAULT 161 | SNMP port |
| `interface_display_mode` | VARCHAR(20) | NOT NULL, DEFAULT 'static' | Display mode: 'none', 'static', 'all' |
| `last_successful_connection_method` | VARCHAR(20) | DEFAULT 'native' | Last method: 'native', 'rest', 'snmp' |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update time |

**Constraints:**
- ON DELETE CASCADE - Deletes when user is deleted
- ON DELETE SET NULL - Ungroups when group is deleted

**Three-Tier Connection:**
1. **Native API** (port 8728) - Primary method
2. **REST API** (HTTPS port 443) - Fallback for RouterOS 7.1+
3. **SNMP** (port 161) - Final fallback

---

### 5. Monitored Ports Table

Configures which router interfaces to monitor and alert thresholds.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Port config identifier |
| `router_id` | VARCHAR | NOT NULL, FK → routers(id) | Router reference |
| `port_name` | VARCHAR(255) | NOT NULL | Interface name (e.g., 'ether1') |
| `enabled` | BOOLEAN | NOT NULL, DEFAULT true | Monitoring enabled |
| `min_threshold_bps` | INTEGER | NOT NULL, DEFAULT 0 | Minimum traffic threshold (bytes/sec) |
| `email_notifications` | BOOLEAN | NOT NULL, DEFAULT true | Email alerts enabled |
| `popup_notifications` | BOOLEAN | NOT NULL, DEFAULT true | Popup alerts enabled |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update time |

**Constraints:**
- UNIQUE(`router_id`, `port_name`) - One config per interface
- ON DELETE CASCADE - Deletes when router is deleted

**Note:** Thresholds apply to RX (download) traffic only.

---

### 6. Traffic Data Table

Stores historical traffic metrics (time-series data).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Data point identifier |
| `router_id` | VARCHAR | NOT NULL, FK → routers(id) | Router reference |
| `port_id` | VARCHAR | NULLABLE, FK → monitored_ports(id) | Port config reference |
| `port_name` | VARCHAR(255) | NOT NULL | Interface name |
| `timestamp` | TIMESTAMP | NOT NULL, DEFAULT NOW() | Measurement time |
| `rx_bytes_per_second` | REAL | NOT NULL, DEFAULT 0 | Download speed |
| `tx_bytes_per_second` | REAL | NOT NULL, DEFAULT 0 | Upload speed |
| `total_bytes_per_second` | REAL | NOT NULL, DEFAULT 0 | Total speed |

**Indexes:**
- `idx_traffic_data_router_port_name_time` on (`router_id`, `port_name`, `timestamp`)
- `idx_traffic_data_timestamp` on `timestamp`

**Constraints:**
- ON DELETE CASCADE - Deletes when router is deleted

**Data Retention:**
- Database: 2 years (cleaned up daily)
- In-memory: 2 hours (7,200 1-second samples per interface)

**Collection Schedule:**
- Real-time: 1-second polling (in-memory only)
- Database: 30-second polling
- Persistence: Every 5 minutes

---

### 7. Alerts Table

Stores threshold violation alerts with acknowledgment tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Alert identifier |
| `router_id` | VARCHAR | NOT NULL, FK → routers(id) | Router reference |
| `port_id` | VARCHAR | NOT NULL, FK → monitored_ports(id) | Port config reference |
| `port_name` | VARCHAR(255) | NOT NULL | Interface name |
| `user_id` | VARCHAR | NOT NULL, FK → users(id) | User to notify |
| `severity` | VARCHAR(20) | NOT NULL, DEFAULT 'warning' | Severity: 'critical', 'warning', 'info' |
| `message` | TEXT | NOT NULL | Alert message |
| `current_traffic_bps` | REAL | NOT NULL | Traffic at alert time |
| `threshold_bps` | REAL | NOT NULL | Configured threshold |
| `acknowledged` | BOOLEAN | NOT NULL, DEFAULT false | User acknowledged |
| `acknowledged_at` | TIMESTAMP | NULLABLE | Acknowledgment time |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Alert creation time |

**Indexes:**
- `idx_alerts_user_created` on (`user_id`, `created_at`)
- `idx_alerts_router` on `router_id`

**Alert Logic:**
- Requires 3 consecutive checks below threshold before triggering
- Auto-acknowledges when traffic returns above threshold
- De-duplicates alerts (won't create duplicate unacknowledged alerts)

---

### 8. Notifications Table

Stores notification history (email and popup).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Notification identifier |
| `user_id` | VARCHAR | NOT NULL, FK → users(id) | Recipient user ID |
| `alert_id` | VARCHAR | NULLABLE, FK → alerts(id) | Related alert |
| `type` | VARCHAR(20) | NOT NULL | Type: 'email', 'popup' |
| `title` | VARCHAR(255) | NOT NULL | Notification title |
| `message` | TEXT | NOT NULL | Notification message |
| `read` | BOOLEAN | NOT NULL, DEFAULT false | Read status |
| `sent_at` | TIMESTAMP | DEFAULT NOW() | Send time |

**Indexes:**
- `idx_notifications_user_sent` on (`user_id`, `sent_at`)

---

### 9. App Settings Table

Global application configuration (logo, branding, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | VARCHAR | PRIMARY KEY, DEFAULT gen_random_uuid() | Settings identifier |
| `logo_url` | TEXT | NULLABLE | Custom logo URL |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update time |

---

## Relationships

```
users (1) ──┬──< (N) router_groups
            ├──< (N) routers
            ├──< (N) alerts
            └──< (N) notifications

router_groups (1) ──< (N) routers

routers (1) ──┬──< (N) monitored_ports
              ├──< (N) traffic_data
              └──< (N) alerts

monitored_ports (1) ──┬──< (N) traffic_data
                       └──< (N) alerts

alerts (1) ──< (N) notifications
```

---

## Initialization

### Fresh Installation

Run the initialization script:

```bash
psql -h localhost -U mikrotik_user -d mikrotik_monitor -f migrations/00_fresh_init.sql
```

This will:
1. Create all tables with proper indexes
2. Set up foreign key relationships
3. Create the hardcoded superadmin account
4. Display verification results

### Verification

Check schema is correct:

```bash
./scripts/verify-schema.sh
```

This verifies:
- All tables exist
- All critical columns exist
- Indexes are created
- Superadmin account exists
- Database statistics

---

## Migrations

### Adding New Columns

When adding new features that require schema changes:

1. Update `shared/schema.ts` with new fields
2. Run Drizzle push to sync:
   ```bash
   npm run db:push
   ```

### Migration Files

Located in `migrations/` directory:
- `00_fresh_init.sql` - Complete fresh installation
- `add_is_superadmin_column.sql` - Add superadmin flag (for existing databases)

---

## Backup & Restore

### Backup

```bash
# Using pg_dump
pg_dump -h localhost -U mikrotik_user -d mikrotik_monitor > backup_$(date +%Y%m%d_%H%M%S).sql

# Using verification script
./scripts/verify-schema.sh  # Shows current row counts
```

### Restore

```bash
# Restore from backup
psql -h localhost -U mikrotik_user -d mikrotik_monitor < backup_20240101_120000.sql
```

---

## Performance Considerations

### Indexes

Critical indexes for performance:
- `idx_traffic_data_router_port_name_time` - Optimizes graph queries
- `idx_traffic_data_timestamp` - Optimizes time-range queries
- `idx_alerts_user_created` - Optimizes alert dashboard
- `idx_notifications_user_sent` - Optimizes notification list

### Data Retention

- Traffic data: Retained for 2 years
- Old data cleaned up daily via cron job
- In-memory storage: 2 hours per interface (7,200 samples)

### Vacuum

Regular maintenance:

```sql
VACUUM ANALYZE traffic_data;
VACUUM ANALYZE alerts;
VACUUM ANALYZE notifications;
```

---

## Security

### Password Encryption

- **User passwords**: Bcrypt with 10 salt rounds
- **Router passwords**: AES encryption via crypto-js
- **Session secret**: Required environment variable

### Access Control

- **Superadmin**: Full system access, cannot be deleted
- **Admin**: Can manage routers and users (except superadmins)
- **User**: Can only manage own routers

### Row-Level Security

- Users can only see their own routers (except superadmins)
- Alerts and notifications are user-scoped
- Authorization enforced server-side

---

## Troubleshooting

### Connection Issues

```bash
# Test database connection
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT 1;"

# Check running queries
psql -h localhost -U mikrotik_user -d mikrotik_monitor -c "SELECT * FROM pg_stat_activity;"
```

### Missing Superadmin

```sql
-- Recreate superadmin account
INSERT INTO users (
  id, username, email, first_name, last_name, password_hash,
  must_change_password, role, is_superadmin, enabled
) VALUES (
  'super-admin-001', 'adhielesmana', 'adhielesmana@local',
  'Super', 'Admin',
  '$2b$10$ASst66/GZvS3LHAnC5671ep42D8MQtyPguAkUMFittEvbrXXg//tW',
  false, 'admin', true, true
) ON CONFLICT (id) DO NOTHING;
```

### Schema Out of Sync

```bash
# Force sync schema
npm run db:push --force

# Or reinitialize (WARNING: Deletes all data!)
psql -h localhost -U mikrotik_user -d mikrotik_monitor -f migrations/00_fresh_init.sql
```

---

## Environment Variables

Required for database connection:

```env
DATABASE_URL=postgresql://mikrotik_user:password@localhost:5432/mikrotik_monitor
PGHOST=localhost
PGPORT=5432
PGUSER=mikrotik_user
PGPASSWORD=your_secure_password
PGDATABASE=mikrotik_monitor
```

---

**For complete deployment instructions, see:** `FRESH_DEPLOYMENT.md`
