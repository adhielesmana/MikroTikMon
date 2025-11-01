#!/usr/bin/env node
/**
 * Setup Production Admin User
 * Creates the default admin account in production database
 */

import bcrypt from 'bcrypt';
import pg from 'pg';
const { Pool } = pg;

async function setupProductionAdmin() {
  console.log('==================================================');
  console.log('  Setup Production Admin User');
  console.log('==================================================');
  console.log('');

  // Check for production database URL
  const prodDbUrl = process.env.PRODUCTION_DATABASE_URL;
  
  if (!prodDbUrl) {
    console.error('❌ ERROR: PRODUCTION_DATABASE_URL environment variable is not set');
    console.error('');
    console.error('Please set it first:');
    console.error('  export PRODUCTION_DATABASE_URL="postgresql://user:pass@host/db"');
    console.error('');
    process.exit(1);
  }

  console.log('🎯 Target: Production Database');
  console.log('🔐 Generating secure password hash...');
  
  // Generate bcrypt hash for "admin" password
  const passwordHash = await bcrypt.hash('admin', 10);
  
  console.log('📊 Creating/updating admin user...');
  console.log('');

  const pool = new Pool({ connectionString: prodDbUrl });

  try {
    // Check if admin exists
    const checkResult = await pool.query(
      "SELECT id, username FROM users WHERE id = 'super-admin-001'"
    );

    if (checkResult.rows.length > 0) {
      console.log('⚠️  Admin user already exists');
      console.log('   Updating to default credentials...');
      
      // Update existing admin
      await pool.query(`
        UPDATE users 
        SET 
          username = $1,
          password_hash = $2,
          must_change_password = true,
          role = 'admin',
          enabled = true,
          first_name = 'Super',
          last_name = 'Admin',
          email = 'admin@localhost',
          updated_at = NOW()
        WHERE id = 'super-admin-001'
      `, ['admin', passwordHash]);
      
      console.log('   ✅ Admin user updated successfully!');
    } else {
      console.log('📝 Creating new admin user...');
      
      // Insert new admin
      await pool.query(`
        INSERT INTO users (
          id,
          username,
          email,
          first_name,
          last_name,
          role,
          enabled,
          password_hash,
          must_change_password,
          created_at,
          updated_at
        ) VALUES (
          'super-admin-001',
          $1,
          'admin@localhost',
          'Super',
          'Admin',
          'admin',
          true,
          $2,
          true,
          NOW(),
          NOW()
        )
      `, ['admin', passwordHash]);
      
      console.log('   ✅ Admin user created successfully!');
    }

    // Verify the user
    const verifyResult = await pool.query(`
      SELECT id, username, email, role, enabled, must_change_password
      FROM users 
      WHERE id = 'super-admin-001'
    `);

    console.log('');
    console.log('📋 Admin User Details:');
    console.log('   ID:', verifyResult.rows[0].id);
    console.log('   Username:', verifyResult.rows[0].username);
    console.log('   Email:', verifyResult.rows[0].email);
    console.log('   Role:', verifyResult.rows[0].role);
    console.log('   Enabled:', verifyResult.rows[0].enabled);
    console.log('   Must Change Password:', verifyResult.rows[0].must_change_password);
    
    console.log('');
    console.log('==================================================');
    console.log('✅ Production admin user is ready!');
    console.log('==================================================');
    console.log('');
    console.log('Login credentials:');
    console.log('  Username: admin');
    console.log('  Password: admin');
    console.log('');
    console.log('⚠️  You will be forced to change the password on first login');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Error setting up admin user:');
    console.error(error.message);
    console.error('');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupProductionAdmin();
