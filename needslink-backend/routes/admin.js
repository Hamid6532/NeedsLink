const router = require('express').Router();
const ctrl   = require('../controllers/adminController');
const { protect, requireRole } = require('../middleware/auth');

router.use(protect, requireRole('admin'));

router.get('/stats',                          ctrl.getStats);
router.get('/verifications',                  ctrl.getPendingVerifications);
router.post('/verify/:orphanage_id',          ctrl.verifyOrphanage);
router.get('/users',                          ctrl.getAllUsers);
router.patch('/users/:id/status',             ctrl.updateUserStatus);

// Orphanage needs (admin can view all needs for a given orphanage)
router.get('/needs', async (req, res, next) => {
  try {
    const db = require('../config/db');
    const { orphanage_id, status } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (orphanage_id) { where += ' AND n.orphanage_id = ?'; params.push(orphanage_id); }
    if (status)       { where += ' AND n.status = ?';        params.push(status); }
    const [needs] = await db.query(
      `SELECT n.*, o.org_name FROM needs n
       JOIN orphanages o ON o.orphanage_id = n.orphanage_id
       ${where} ORDER BY n.created_at DESC`,
      params
    );
    res.json({ needs });
  } catch (err) { next(err); }
});

module.exports = router;
