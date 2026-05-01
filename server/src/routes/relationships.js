const router = require('express').Router({ mergeParams: true });
const auth = require('../middleware/auth');
const c = require('../controllers/relationships');

router.use(auth);
router.get('/', c.list);
router.post('/batch', c.batchSave);
router.post('/', c.create);
router.delete('/:id', c.remove);

module.exports = router;
