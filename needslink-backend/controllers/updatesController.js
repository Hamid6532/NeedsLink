const db = require('../config/db');
const { asyncHandler, createError } = require('../middleware/error');

// POST /api/updates — orphanage only
const createUpdate = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) throw createError(400, 'Title and description are required.');

  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  const [result] = await db.query(
    'INSERT INTO donation_updates (orphanage_id, title, description, image_url) VALUES (?, ?, ?, ?)',
    [orp[0].orphanage_id, title, description, image_url]
  );
  res.status(201).json({ message: 'Update published.', update_id: result.insertId });
});

// GET /api/updates/:orphanageId — public
const getUpdates = asyncHandler(async (req, res) => {
  const [updates] = await db.query(
    'SELECT * FROM donation_updates WHERE orphanage_id = ? ORDER BY created_at DESC',
    [req.params.orphanageId]
  );
  res.json({ updates });
});

// DELETE /api/updates/:id — orphanage owner only
const deleteUpdate = asyncHandler(async (req, res) => {
  const [orp] = await db.query('SELECT orphanage_id FROM orphanages WHERE user_id = ?', [req.user.user_id]);
  if (!orp.length) throw createError(404, 'Orphanage not found.');

  const [upd] = await db.query('SELECT orphanage_id FROM donation_updates WHERE update_id = ?', [req.params.id]);
  if (!upd.length) throw createError(404, 'Update not found.');
  if (upd[0].orphanage_id !== orp[0].orphanage_id) throw createError(403, 'Not your update.');

  await db.query('DELETE FROM donation_updates WHERE update_id = ?', [req.params.id]);
  res.json({ message: 'Update deleted.' });
});

module.exports = { createUpdate, getUpdates, deleteUpdate };
