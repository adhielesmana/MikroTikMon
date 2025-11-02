#!/usr/bin/env node

/**
 * Standalone Admin Password Reset Script
 * 
 * This script works independently without importing from the main codebase.
 * It connects directly to the database and resets the admin password.
 * 
 * Usage:
 *   Docker: docker compose exec app node scripts/reset-password-standalone.js
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pg from 'pg';

const { Client } = pg;

const DEFAULT_ADMIN_ID = 'super-admin-001';

// Generate a cryptographically secure random password
function generateRandomPassword(length = 16) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;
  
  const getRandomChar = (str) => {
    const randomIndex = crypto.randomInt(0, str.length);
    return str[randomIndex];
  };
  
  const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };
  
  let passwordChars = [];
  
  // Ensure at least one character from each category
  passwordChars.push(getRandomChar(uppercase));
  passwordChars.push(getRandomChar(lowercase));
  passwordChars.push(getRandomChar(numbers));
  passwordChars.push(getRandomChar(symbols));
  
  // Fill the rest with random characters
  for (let i = passwordChars.length; i < length; i++) {
    passwordChars.push(getRandomChar(allChars));
  }
  
  // Shuffle the password to randomize character positions
  return shuffleArray(passwordChars).join('');
}

async function resetAdminPassword() {
  let client;
  
  try {
    console.log('\n🔐 Admin Password Reset Tool\n');
    console.log('━'.repeat(60));
    
    // Connect to database
    console.log('\n📡 Connecting to database...');
    client = new Client({
      connectionString: process.env.DATABASE_URL
    });
    await client.connect();
    console.log('✓ Database connected');
    
    // Generate random password
    const tempPassword = generateRandomPassword(16);
    console.log('\n📋 Generating secure temporary password...');
    
    // Hash the password
    console.log('🔒 Hashing password with bcrypt (10 rounds)...');
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    
    // Check if admin user exists
    const checkQuery = 'SELECT id FROM users WHERE id = $1';
    const checkResult = await client.query(checkQuery, [DEFAULT_ADMIN_ID]);
    
    if (checkResult.rows.length > 0) {
      // Update existing admin
      console.log('👤 Updating existing admin account...');
      const updateQuery = `
        UPDATE users 
        SET password_hash = $1,
            must_change_password = true,
            enabled = true,
            role = 'admin',
            updated_at = NOW()
        WHERE id = $2
      `;
      await client.query(updateQuery, [passwordHash, DEFAULT_ADMIN_ID]);
    } else {
      // Create new admin
      console.log('👤 Creating new admin account...');
      const insertQuery = `
        INSERT INTO users (
          id, email, first_name, last_name, 
          profile_image_url, password_hash, username,
          must_change_password, enabled, role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      await client.query(insertQuery, [
        DEFAULT_ADMIN_ID,
        'admin@local',
        'Admin',
        'User',
        '',
        passwordHash,
        'admin',
        true,
        true,
        'admin'
      ]);
    }
    
    console.log('\n✅ Admin password has been reset successfully!\n');
    console.log('━'.repeat(60));
    console.log('\n🔑 TEMPORARY LOGIN CREDENTIALS:\n');
    console.log(`   Username: admin`);
    console.log(`   Password: ${tempPassword}\n`);
    console.log('━'.repeat(60));
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:\n');
    console.log('   1. This is a TEMPORARY password');
    console.log('   2. You will be forced to change it on first login');
    console.log('   3. Write down the password above - it will not be shown again');
    console.log('   4. Clear your terminal history after copying the password\n');
    console.log('━'.repeat(60));
    console.log('\n📝 Next Steps:\n');
    console.log('   1. Visit your application login page');
    console.log('   2. Login with username "admin" and the password above');
    console.log('   3. You will be redirected to change your password');
    console.log('   4. Choose a new secure password (minimum 8 characters)');
    console.log('   5. Optionally change your username during password reset\n');
    console.log('━'.repeat(60));
    console.log('');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error resetting admin password:\n');
    console.error(error.message);
    console.error('\nPlease check:');
    console.error('  - Database connection (DATABASE_URL environment variable)');
    console.error('  - Database is running and accessible');
    console.error('  - Users table exists in database\n');
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

resetAdminPassword();
