const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { customAlphabet } = require('nanoid');
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

async function findByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM associates WHERE email = $1', [email]);
  return rows[0];
}

async function findByReferralCode(code) {
  const { rows } = await pool.query('SELECT * FROM associates WHERE referral_code = $1', [code]);
  return rows[0];
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM associates WHERE id = $1', [id]);
  return rows[0];
}

async function createAssociate({ name, email, phone, password, parentId, role = 'associate', city }) {
  const password_hash = await bcrypt.hash(password, 10);
  let referral_code;
  // ensure unique referral code
  while (true) {
    referral_code = genCode();
    const existing = await findByReferralCode(referral_code);
    if (!existing) break;
  }
  const { rows } = await pool.query(
    `INSERT INTO associates (name, email, phone, password_hash, referral_code, parent_id, role, city)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, email, phone, password_hash, referral_code, parentId || null, role, city || null]
  );
  return rows[0];
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

async function listAll(limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.email, a.phone, a.status, a.role, a.created_at,
            p.name AS parent_name
     FROM associates a
     LEFT JOIN associates p ON a.parent_id = p.id
     ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function updateProfile(id, { name, phone, city, profile_note }) {
  const { rows } = await pool.query(
    `UPDATE associates SET name=$1, phone=$2, city=$3, profile_note=$4 WHERE id=$5 RETURNING *`,
    [name, phone, city, profile_note, id]
  );
  return rows[0];
}

async function changePassword(id, newPassword) {
  const password_hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE associates SET password_hash=$1 WHERE id=$2', [password_hash, id]);
}

module.exports = {
  findByEmail, findByReferralCode, findById, createAssociate,
  verifyPassword, listAll, updateProfile, changePassword,
};
