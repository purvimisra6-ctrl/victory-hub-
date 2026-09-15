require('dotenv').config();
const pool = require('../config/db');
const associateModel = require('../models/associate');

async function seed() {
  // Default commission structure: own sale 5%, direct upline 3%, then 1% for levels 2-5.
  const levels = [
    { level: 0, percentage: 5 },
    { level: 1, percentage: 3 },
    { level: 2, percentage: 1 },
    { level: 3, percentage: 1 },
    { level: 4, percentage: 0.5 },
    { level: 5, percentage: 0.5 },
  ];
  for (const l of levels) {
    await pool.query(
      `INSERT INTO commission_settings (level, percentage) VALUES ($1,$2)
       ON CONFLICT (level) DO UPDATE SET percentage = EXCLUDED.percentage`,
      [l.level, l.percentage]
    );
  }

  const existingAdmin = await associateModel.findByEmail('admin@company.com');
  if (!existingAdmin) {
    await associateModel.createAssociate({
      name: 'Company Admin',
      email: 'admin@company.com',
      phone: '9999999999',
      password: 'Admin@123',
      parentId: null,
      role: 'admin',
    });
    console.log('Created default admin: admin@company.com / Admin@123  <-- CHANGE THIS PASSWORD IMMEDIATELY');
  } else {
    console.log('Admin already exists, skipping.');
  }

  console.log('Seed complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
