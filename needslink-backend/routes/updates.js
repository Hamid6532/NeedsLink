const router = require('express').Router();
const ctrl   = require('../controllers/updatesController');
const { protect, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/',
  protect,
  requireRole('orphanage'),
  upload.single('image'),
  ctrl.createUpdate
);

router.get('/:orphanageId', ctrl.getUpdates);

router.delete('/:id',
  protect,
  requireRole('orphanage'),
  ctrl.deleteUpdate
);

module.exports = router;
