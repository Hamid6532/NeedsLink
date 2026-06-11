const router = require('express').Router();
const ctrl   = require('../controllers/needsController');
const { protect, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public
router.get('/',    ctrl.getAllNeeds);
router.get('/:id', ctrl.getNeedById);

// Orphanage only
router.post('/',
  protect,
  requireRole('orphanage'),
  upload.array('images', 3),
  ctrl.createNeed
);

router.put('/:id',
  protect,
  requireRole('orphanage'),
  ctrl.updateNeed
);

router.delete('/:id',
  protect,
  requireRole('orphanage'),
  ctrl.deleteNeed
);

// Orphanage: get my needs
router.get('/orphanage/my',
  protect,
  requireRole('orphanage'),
  ctrl.getMyNeeds
);

module.exports = router;
