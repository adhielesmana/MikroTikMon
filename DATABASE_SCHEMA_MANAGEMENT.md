# Database Schema Management Guide

This guide shows you how to ensure your database structure is always up-to-date with your code.

## 🎯 Quick Commands

### Check Current Database Structure
```bash
./scripts/check-database-schema.sh
```
Shows all tables, columns, and indexes in your database.

### Sync Schema (Recommended)
```bash
./scripts/sync-database-schema.sh
```
Automatically syncs your database structure with your code schema.

### Force Update Schema
```bash
npm run db:push -- --force
```
Forces schema changes without prompts (use when normal sync has issues).

---

## 📋 When to Update Database Schema

Update your database schema when:

1. ✅ You modify `shared/schema.ts` (add/remove columns, change types)
2. ✅ After pulling new code from git
3. ✅ Before running migrations
4. ✅ When you see database-related errors
5. ✅ Before deploying to production

---

## 🔧 Methods to Update Database Schema

### Method 1: Automatic Sync Script (Easiest)

```bash
# Make script executable (one time)
chmod +x scripts/sync-database-schema.sh

# Run the sync
./scripts/sync-database-schema.sh
```

**What it does:**
- Compares your code schema with database
- Adds missing columns/tables
- Creates missing indexes
- Handles conflicts automatically

**Output:**
```
✅ Schema synced successfully!
```

---

### Method 2: Manual Drizzle Push (More Control)

#### Option A: Normal Push (with prompts)
```bash
npm run db:push
```

**When to use:**
- First time syncing
- Want to review changes before applying
- Making non-destructive changes

**Interactive prompts:**
- Will ask before truncating tables
- Shows you what changes will be made
- Safe and controlled

#### Option B: Force Push (no prompts)
```bash
npm run db:push -- --force
```

**When to use:**
- You're confident in your changes
- Automated scripts/CI/CD
- Unique constraint errors
- Rapid development iteration

**Warning:** 
- No confirmation prompts
- Immediately applies all changes
- Make sure you have backups!

---

### Method 3: Direct SQL (Advanced)

Only use this when Drizzle can't handle the change:

```bash
# Check current structure
psql "$DATABASE_URL" -c "\d users"

# Add column manually
psql "$DATABASE_URL" -c "ALTER TABLE users ADD COLUMN new_field VARCHAR;"

# Add unique constraint
psql "$DATABASE_URL" -c "ALTER TABLE users ADD CONSTRAINT users_field_unique UNIQUE (new_field);"
```

---

## 🔍 Inspecting Your Schema

### Check All Tables
```bash
./scripts/check-database-schema.sh
```

### Check Specific Table Structure
```bash
psql "$DATABASE_URL" << 'EOF'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
EOF
```

### Check Indexes
```bash
psql "$DATABASE_URL" -c "\di"
```

### Check Constraints
```bash
psql "$DATABASE_URL" << 'EOF'
SELECT constraint_name, constraint_type, table_name
FROM information_schema.table_constraints
WHERE table_schema = 'public'
ORDER BY table_name, constraint_name;
EOF
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: "column already exists"

**Cause:** Database has column that schema doesn't know about

**Solution:**
```bash
# Force sync to match code schema
npm run db:push -- --force
```

### Issue 2: "unique constraint violation"

**Cause:** Trying to add UNIQUE constraint but duplicate values exist

**Solution:**
```bash
# Option A: Remove duplicates first
psql "$DATABASE_URL" << 'EOF'
DELETE FROM users a USING users b
WHERE a.id > b.id AND a.username = b.username;
EOF

# Option B: Make field nullable temporarily
# Edit shared/schema.ts to allow NULL, then force push
npm run db:push -- --force
```

### Issue 3: "cannot drop column, dependent objects exist"

**Cause:** Other tables reference this column (foreign keys)

**Solution:**
```bash
# Check dependencies
psql "$DATABASE_URL" -c "\d+ table_name"

# Either:
# 1. Remove foreign key first, or
# 2. Use CASCADE (careful!)
# 3. Update schema to keep the column
```

### Issue 4: "relation does not exist"

**Cause:** Database table missing entirely

**Solution:**
```bash
# Create all missing tables
npm run db:push
```

### Issue 5: Drizzle won't sync certain changes

**Cause:** Some schema changes require manual migration

**Solution:**
```bash
# Generate migration SQL
npx drizzle-kit generate:pg

# Review migration in drizzle/ folder
# Then apply manually
psql "$DATABASE_URL" < drizzle/0001_migration.sql
```

---

## 🔐 Best Practices

### 1. Always Backup Before Major Changes
```bash
# Export current database
./scripts/export-dev-db.sh

# Or quick backup with pg_dump
pg_dump -Fc "$DATABASE_URL" -f backup_$(date +%Y%m%d).dump
```

### 2. Test on Development First
```bash
# Never test schema changes on production directly!
# Always:
# 1. Test on development database
# 2. Verify everything works
# 3. Then apply to production
```

### 3. Version Control Your Schema
```bash
# Always commit schema.ts changes
git add shared/schema.ts
git commit -m "Add username field to users table"
```

### 4. Document Breaking Changes
```markdown
## Breaking Change: Username Required
- Added username field (VARCHAR UNIQUE) to users table
- All new users must have unique usernames
- Existing users: username can be NULL
```

### 5. Use Migrations for Production
```bash
# Generate migration SQL
npx drizzle-kit generate:pg

# Review the SQL
cat drizzle/0001_*.sql

# Apply to production (with backup!)
psql "$PRODUCTION_DATABASE_URL" < drizzle/0001_*.sql
```

---

## 📊 Schema Change Workflow

### For Development:
```bash
1. Edit shared/schema.ts
2. Run: ./scripts/sync-database-schema.sh
3. Test your application
4. Commit changes
```

### For Production:
```bash
1. Backup production database
2. Test changes on development
3. Generate migration SQL (optional)
4. Apply changes to production
5. Verify application works
6. Monitor for issues
```

---

## 🎯 Examples

### Example 1: Add New Column
```typescript
// In shared/schema.ts
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(), // NEW FIELD
  email: varchar("email").unique(),
  // ... other fields
});
```

```bash
# Sync the change
./scripts/sync-database-schema.sh
```

### Example 2: Make Column Required
```typescript
// Before
username: varchar("username"),

// After
username: varchar("username").notNull(),
```

```bash
# First, ensure all existing records have values
psql "$DATABASE_URL" -c "UPDATE users SET username = email WHERE username IS NULL;"

# Then sync
npm run db:push -- --force
```

### Example 3: Add Index
```typescript
import { index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  // ... fields
}, (table) => [
  index("idx_username").on(table.username),
]);
```

```bash
# Sync to create index
./scripts/sync-database-schema.sh
```

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Check current schema | `./scripts/check-database-schema.sh` |
| Sync schema | `./scripts/sync-database-schema.sh` |
| Force sync | `npm run db:push -- --force` |
| Backup database | `./scripts/export-dev-db.sh` |
| View table structure | `psql "$DATABASE_URL" -c "\d table_name"` |
| List all tables | `psql "$DATABASE_URL" -c "\dt"` |
| List all indexes | `psql "$DATABASE_URL" -c "\di"` |

---

## ✅ Current Schema Status

Your database is currently **up-to-date** with:

- ✅ `username` field (VARCHAR UNIQUE)
- ✅ `email` field (VARCHAR UNIQUE)
- ✅ `must_change_password` field (BOOLEAN)
- ✅ All table indexes created
- ✅ All foreign key constraints in place

**Last verified:** Just now
**Schema version:** Latest (matches shared/schema.ts)

---

## 🚀 Need Help?

If you encounter issues:

1. Check error messages carefully
2. Review this guide's troubleshooting section
3. Backup your database before making changes
4. Test on development first
5. Use force push only when confident

**Remember:** It's always safer to have a backup before making schema changes!
