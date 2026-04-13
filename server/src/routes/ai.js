const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkAiLimit } = require('../controllers/users');
const c = require('../controllers/ai');

router.post('/assist', auth, checkAiLimit, c.assist);
router.post('/stream', auth, checkAiLimit, c.stream);

module.exports = router;
