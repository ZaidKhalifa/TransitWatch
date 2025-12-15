/**
 * Master Seed - runs transit seeds then user seeds
 * Usage: npm run seed
 */

import { execSync } from 'child_process';

console.log('TransitWatch - Full Database Seed\n');

console.log('>>> Seeding transit data...');
execSync('node tasks/seed_transit.js', { stdio: 'inherit' });

console.log('\n>>> Seeding users and reports...');
execSync('node tasks/seed_users.js', { stdio: 'inherit' });

console.log('\nAll seeding complete! Run: npm start');
