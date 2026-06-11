const router = require('express').Router();
const ctrl   = require('../controllers/messagesController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/',                   ctrl.sendMessage);
router.get('/conversations',       ctrl.getConversations);
router.get('/:userId',             ctrl.getThread);

module.exports = router;
