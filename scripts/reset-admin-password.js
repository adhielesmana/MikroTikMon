#!/usr/bin/env node

/**
 * Reset Admin Password Script
 * 
 * Generates a random temporary password for the admin account and forces a password change on next login.
 * This script should only be run from the server console with direct database access.
 * 
 * Usage:
 *   Node environment: node scripts/reset-admin-password.js
 *   Docker: docker-compose exec app node scripts/reset-admin-password.js
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../server/db.js';
import { users } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const DEFAULT_ADMIN_ID = 'super-admin-001';
const DEFAULT_ADMIN_EMAIL = 'admin@local';

// Generate a cryptographically secure random password
function generateRandomPassword(length = 16) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;
  
  // Helper function to get a random character from a string using crypto
  const getRandomChar = (str) => {
    const randomIndex = crypto.randomInt(0, str.length);
    return str[randomIndex];
  };
  
  // Helper function to shuffle array using Fisher-Yates algorithm with crypto
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
  
  // Shuffle the password to randomize character positions using crypto
  return shuffleArray(passwordChars).join('');
}

async function resetAdminPassword() {
  try {
    console.log('\n🔐 Admin Password Reset Tool\n');
    console.log('━'.repeat(60));
    
    // Generate random password
    const tempPassword = generateRandomPassword(16);
    console.log('\n📋 Generating secure temporary password...');
    
    // Hash the password
    console.log('🔒 Hashing password with bcrypt (10 rounds)...');
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    
    // Check if admin user exists
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.id, DEFAULT_ADMIN_ID));
    
    if (existingAdmin) {
      // Update existing admin
      console.log('👤 Updating existing admin account...');
      await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          enabled: true,
          role: 'admin',
          updatedAt: new Date(),
        })
        .where(eq(users.id, DEFAULT_ADMIN_ID));
    } else {
      // Create new admin
      console.log('👤 Creating new admin account...');
      await db
        .insert(users)
        .values({
          id: DEFAULT_ADMIN_ID,
          email: DEFAULT_ADMIN_EMAIL,
          firstName: 'Admin',
          lastName: 'User',
          profileImageUrl: '',
          passwordHash,
          mustChangePassword: true,
          enabled: true,
          role: 'admin',
        });
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
    console.log('━'.repeat(60) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error resetting admin password:', error);
    console.error('\nTroubleshooting:');
    console.error('  - Ensure the database is running and accessible');
    console.error('  - Check DATABASE_URL environment variable');
    console.error('  - Verify database migrations have been run\n');
    process.exit(1);
  }
}

// Run the script
resetAdminPassword();
