const pool = require('../config/db');
const { getUplineChain } = require('./tree');

/**
 * Get the commission % configured for a given level.
 * Level 0 = the associate's own sale. Level 1 = their direct upline. Level 2 = next upline...
 * Any level with no explicit row gets 0% (so the chain naturally stops paying
 * once you go past however many levels the company has configured -
 * but the referral TREE itself still has unlimited depth for reporting).
 */
async function getPercentageForLevel(level) {
  const { rows } = await pool.query(
    'SELECT percentage FROM commission_settings WHERE level = $1',
    [level]
  );
  return rows.length ? parseFloat(rows[0].percentage) : 0;
}

/**
 * Called whenever a new booking is confirmed.
 * 1. Pays the associate who made the sale at "level 0" (their own sale %).
 * 2. Walks UP the unlimited-level referral chain and pays every upline
 *    associate their configured %, until either the chain ends (top of
 *    company) or the configured percentage hits 0.
 */
async function generatePayoutsForBooking(booking) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const month = new Date(booking.booking_date).toISOString().slice(0, 7); // YYYY-MM
    const payoutRows = [];

    // Level 0: own sale commission
    const ownPct = await getPercentageForLevel(0);
    if (ownPct > 0) {
      payoutRows.push({
        associate_id: booking.associate_id,
        level: 0,
        percentage: ownPct,
      });
    }

    // Levels 1..N up the chain (unlimited depth, stops at top of company)
    const upline = await getUplineChain(booking.associate_id);
    for (const u of upline) {
      const pct = await getPercentageForLevel(u.level);
      if (pct > 0) {
        payoutRows.push({ associate_id: u.id, level: u.level, percentage: pct });
      }
    }

    for (const p of payoutRows) {
      const amount = (parseFloat(booking.amount) * p.percentage) / 100;
      await client.query(
        `INSERT INTO payouts
          (associate_id, booking_id, source_associate_id, level, percentage_applied, amount, payout_month, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [p.associate_id, booking.id, booking.associate_id, p.level, p.percentage, amount, month]
      );
    }

    await client.query('COMMIT');
    return payoutRows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPercentageForLevel, generatePayoutsForBooking };
