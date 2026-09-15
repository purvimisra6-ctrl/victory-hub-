const pool = require('../config/db');
const { getAllDescendants } = require('./tree');

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

async function getSelfBusiness(associateId, { monthOnly = false } = {}) {
  const params = [associateId];
  let dateFilter = '';
  if (monthOnly) {
    dateFilter = `AND to_char(booking_date, 'YYYY-MM') = $2`;
    params.push(currentMonth());
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(sqft),0) AS sqft, COALESCE(SUM(amount),0) AS amount, COUNT(*) AS cnt
     FROM bookings WHERE associate_id = $1 AND status <> 'cancelled' ${dateFilter}`,
    params
  );
  return rows[0];
}

async function getTeamBusiness(associateId, { monthOnly = false } = {}) {
  const team = await getAllDescendants(associateId);
  if (team.length === 0) return { sqft: 0, amount: 0, cnt: 0 };
  const ids = team.map((t) => t.id);

  const params = [ids];
  let dateFilter = '';
  if (monthOnly) {
    dateFilter = `AND to_char(booking_date, 'YYYY-MM') = $2`;
    params.push(currentMonth());
  }
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(sqft),0) AS sqft, COALESCE(SUM(amount),0) AS amount, COUNT(*) AS cnt
     FROM bookings WHERE associate_id = ANY($1) AND status <> 'cancelled' ${dateFilter}`,
    params
  );
  return rows[0];
}

async function getPayoutSummary(associateId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total_payout
     FROM payouts WHERE associate_id = $1`,
    [associateId]
  );
  return parseFloat(rows[0].total_payout);
}

async function getPaymentSummary(associateId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total_payment
     FROM payments WHERE associate_id = $1`,
    [associateId]
  );
  return parseFloat(rows[0].total_payment);
}

async function getDashboardData(associateId) {
  const [directCount, teamRows, selfMonth, teamMonth, selfTotal, teamTotal, payout, payment] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM associates WHERE parent_id = $1', [associateId]),
    getAllDescendants(associateId),
    getSelfBusiness(associateId, { monthOnly: true }),
    getTeamBusiness(associateId, { monthOnly: true }),
    getSelfBusiness(associateId, { monthOnly: false }),
    getTeamBusiness(associateId, { monthOnly: false }),
    getPayoutSummary(associateId),
    getPaymentSummary(associateId),
  ]);

  return {
    myDirect: parseInt(directCount.rows[0].count, 10),
    myTeam: teamRows.length,
    monthlyBusinessSelf: selfMonth,
    monthlyBusinessTeam: teamMonth,
    totalSelfBusiness: selfTotal,
    totalTeamBusiness: teamTotal,
    myPayout: payout,
    myPayment: payment,
    balance: payout - payment,
  };
}

module.exports = { getSelfBusiness, getTeamBusiness, getPayoutSummary, getPaymentSummary, getDashboardData, currentMonth };
