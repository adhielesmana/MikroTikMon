#!/usr/bin/env node

/**
 * Password Hash Generator for Super Admin
 * 
 * Usage: node scripts/hash-password.js <password>
 * Example: node scripts/hash-password.js MySecurePassword123
 */

import bcrypt from 'bcrypt';

const password = process.argv[2];

if (!password) {
  console.error('❌ Error: Please provide a password');
  console.log('');
  console.log('Usage: node scripts/hash-password.js <password>');
  console.log('Example: node scripts/hash-password.js MySecurePassword123');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ Error: Password must be at least 8 characters long');
  process.exit(1);
}

const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('❌ Error generating hash:', err.message);
    process.exit(1);
  }

  console.log('');
  console.log('✓ Password hash generated successfully!');
  console.log('');
  console.log('Add this to your .env file:');
  console.log('─'.repeat(50));
  console.log(`SUPER_ADMIN_PASSWORD=${hash}`);
  console.log('─'.repeat(50));
  console.log('');
  console.log('💡 Tip: Keep this password hash secure and never commit it to git!');
  console.log('');
});
