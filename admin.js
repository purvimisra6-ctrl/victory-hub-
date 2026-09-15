const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const associateModel = require('../models/associate');
const { generatePayoutsForBooking } = require('../models/commission');

router.use(requireLogin, requireAdmin);
router.use((req, res, next) => {
  res.locals.companyName = process.env.COMPANY_NAME || 'Company Hub';
  res.locals.activeAdminPage = '';
  next();
});

// Admin overview
router.get('/', async (req, res) => {
  const totals = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM associates WHERE role='associate') AS total_associates,
      (SELECT COUNT(*) FROM bookings) AS total_bookings,
      (SELECT COALESCE(SUM(amount),0) FROM bookings WHERE status <> 'cancelled') AS total_business,
      (SELECT COALESCE(SUM(amount),0) FROM payouts) AS total_payout,
      (SELECT COALESCE(SUM(amount),0) FROM payments) AS total_paid
  `);
  res.render('admin/overview', { title: 'Admin Overview', activeAdminPage: 'overview', stats: totals.rows[0] });
});

// Manage associates
router.get('/associates', async (req, res) => {
  const rows = await associateModel.listAll(2000, 0);
  res.render('admin/associates', { title: 'Associates', activeAdminPage: 'associates', rows });
});

router.get('/associates/new', async (req, res) => {
  const sponsors = await pool.query('SELECT id, name, email, referral_code FROM associates ORDER BY name');
  res.render('admin/associate_new', { title: 'Add Associate', activeAdminPage: 'associates', sponsors: sponsors.rows, error: null });
});

router.post('/associates/new', async (req, res) => {
  const { name, email, phone, password, parent_id, city, role } = req.body;
  try {
    await associateModel.createAssociate({
      name, email, phone, password,
      parentId: parent_id ? parseInt(parent_id, 10) : null,
      role: role === 'admin' ? 'admin' : 'associate',
      city,
    });
    res.redirect('/admin/associates');
  } catch (err) {
    console.error(err);
    const sponsors = await pool.query('SELECT id, name, email, referral_code FROM associates ORDER BY name');
    res.render('admin/associate_new', { title: 'Add Associate', activeAdminPage: 'associates', sponsors: sponsors.rows, error: 'Could not create (duplicate email/phone?).' });
  }
});

router.post('/associates/:id/status', async (req, res) => {
  const { status } = req.body;
  await pool.query('UPDATE associates SET status=$1 WHERE id=$2', [status, req.params.id]);
  res.redirect('/admin/associates');
});

// Bookings - add a sale, which auto-generates payouts up the unlimited-level chain
router.get('/bookings', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.*, a.name AS associate_name FROM bookings b
    JOIN associates a ON b.associate_id = a.id ORDER BY b.booking_date DESC LIMIT 500
  `);
  res.render('admin/bookings', { title: 'Bookings', activeAdminPage: 'bookings', rows });
});

router.get('/bookings/new', async (req, res) => {
  const associates = await pool.query("SELECT id, name, email FROM associates WHERE role='associate' ORDER BY name");
  res.render('admin/booking_new', { title: 'Add Booking', activeAdminPage: 'bookings', associates: associates.rows, error: null });
});

router.post('/bookings/new', async (req, res) => {
  const { associate_id, customer_name, customer_phone, project_name, plot_no, sqft, amount, booking_date } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO bookings (associate_id, customer_name, customer_phone, project_name, plot_no, sqft, amount, booking_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed') RETURNING *`,
      [associate_id, customer_name, customer_phone, project_name, plot_no, sqft, amount, booking_date]
    );
    await generatePayoutsForBooking(rows[0]);
    res.redirect('/admin/bookings');
  } catch (err) {
    console.error(err);
    const associates = await pool.query("SELECT id, name, email FROM associates WHERE role='associate' ORDER BY name");
    res.render('admin/booking_new', { title: 'Add Booking', activeAdminPage: 'bookings', associates: associates.rows, error: 'Could not save booking.' });
  }
});

// Commission settings (per-level %)
router.get('/commission-settings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM commission_settings ORDER BY level');
  res.render('admin/commission_settings', { title: 'Commission Settings', activeAdminPage: 'commission', rows });
});

router.post('/commission-settings', async (req, res) => {
  const { level, percentage } = req.body;
  await pool.query(
    `INSERT INTO commission_settings (level, percentage) VALUES ($1,$2)
     ON CONFLICT (level) DO UPDATE SET percentage = EXCLUDED.percentage`,
    [level, percentage]
  );
  res.redirect('/admin/commission-settings');
});

// Approve payouts (pending -> approved -> paid) + record actual payment
router.get('/payouts', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.*, a.name AS associate_name FROM payouts p
    JOIN associates a ON p.associate_id = a.id
    ORDER BY p.created_at DESC LIMIT 500
  `);
  res.render('admin/payouts', { title: 'Payouts', activeAdminPage: 'payouts', rows });
});

router.post('/payouts/:id/status', async (req, res) => {
  const { status } = req.body;
  await pool.query('UPDATE payouts SET status=$1 WHERE id=$2', [status, req.params.id]);
  res.redirect('/admin/payouts');
});

router.get('/payments/new', async (req, res) => {
  const associates = await pool.query("SELECT id, name, email FROM associates WHERE role='associate' ORDER BY name");
  res.render('admin/payment_new', { title: 'Record Payment', activeAdminPage: 'payments', associates: associates.rows, error: null });
});

router.post('/payments/new', async (req, res) => {
  const { associate_id, amount, payment_date, mode, reference_no, notes } = req.body;
  try {
    await pool.query(
      `INSERT INTO payments (associate_id, amount, payment_date, mode, reference_no, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [associate_id, amount, payment_date, mode, reference_no, notes]
    );
    res.redirect('/admin/payouts');
  } catch (err) {
    console.error(err);
    const associates = await pool.query("SELECT id, name, email FROM associates WHERE role='associate' ORDER BY name");
    res.render('admin/payment_new', { title: 'Record Payment', activeAdminPage: 'payments', associates: associates.rows, error: 'Could not record payment.' });
  }
});

module.exports = router;
