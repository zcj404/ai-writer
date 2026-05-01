const router = require('express').Router({ mergeParams: true });
const auth = require('../middleware/auth');
const c = require('../controllers/mapexports');

router.use(auth);
router.get('/', c.list);
router.get('/:id', c.get);
router.post('/', c.create);
router.get('/job/:jobId', c.jobStatus);
router.post('/generate', c.generate);
router.delete('/:id', c.remove);

module.exports = router;
