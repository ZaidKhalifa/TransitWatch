/**
 * Transit Seed - runs all transit seeds sequentially
 * Usage: npm run seed-transit
 */

import { execSync } from 'child_process';

const seeds = [
    'njt_bus_seed.js',
    'njt_rail_seed.js', 
    'mta_subway_seed.js',
    'mta_bus_seed.js',
    'path_seed.js'
];

console.log('Seeding all transit data...\n');

for (const seed of seeds) {
    console.log(`\n>>> Running ${seed}...`);
    execSync(`node tasks/${seed}`, { stdio: 'inherit' });
}

console.log('\nAll transit data seeded!');
