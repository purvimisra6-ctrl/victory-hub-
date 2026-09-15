const pool = require('../config/db');

/**
 * Get ALL descendants (entire team, unlimited depth) of an associate.
 * Uses a recursive CTE walking down parent_id -> id links.
 */
async function getAllDescendants(associateId) {
  const { rows } = await pool.query(`
    WITH RECURSIVE downline AS (
      SELECT id, name, email, phone, parent_id, status, created_at, 1 AS level
      FROM associates
      WHERE parent_id = $1
      UNION ALL
      SELECT a.id, a.name, a.email, a.phone, a.parent_id, a.status, a.created_at, d.level + 1
      FROM associates a
      INNER JOIN downline d ON a.parent_id = d.id
    )
    SELECT * FROM downline ORDER BY level, id;
  `, [associateId]);
  return rows;
}

/**
 * Get direct referrals only (level 1 downline).
 */
async function getDirects(associateId) {
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, status, created_at
     FROM associates WHERE parent_id = $1 ORDER BY created_at DESC`,
    [associateId]
  );
  return rows;
}

/**
 * Walk UP the chain from an associate to the top, returning
 * [{id, level}] where level 1 = immediate parent (upline), 2 = grandparent, etc.
 * Unlimited levels - stops when parent_id is NULL.
 */
async function getUplineChain(associateId) {
  const { rows } = await pool.query(`
    WITH RECURSIVE upline AS (
      SELECT id, parent_id, 0 AS level
      FROM associates WHERE id = $1
      UNION ALL
      SELECT a.id, a.parent_id, u.level + 1
      FROM associates a
      INNER JOIN upline u ON a.id = u.parent_id
    )
    SELECT id, level FROM upline WHERE level > 0 ORDER BY level;
  `, [associateId]);
  return rows;
}

/**
 * Build a nested tree structure (for rendering the Referral Tree page)
 * rooted at associateId.
 */
async function getTreeStructure(associateId) {
  const flat = await getAllDescendants(associateId);
  const byParent = {};
  flat.forEach((row) => {
    byParent[row.parent_id] = byParent[row.parent_id] || [];
    byParent[row.parent_id].push(row);
  });

  function build(parentId) {
    return (byParent[parentId] || []).map((node) => ({
      ...node,
      children: build(node.id),
    }));
  }

  return build(associateId);
}

module.exports = { getAllDescendants, getDirects, getUplineChain, getTreeStructure };
