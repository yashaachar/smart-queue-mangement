const express = require('express');
const { generateToken, getAllTokens, getMyToken, cancelToken } = require('../controllers/tokenController');
const { authenticate, requireStaff } = require('../middleware/auth');
const { tokenRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * POST /api/tokens/generate
 * Issue a new token with service routing and concurrency lock.
 */
router.post('/generate', tokenRateLimiter, authenticate, generateToken);

/**
 * GET /api/tokens/my
 * Current user's active token.
 */
router.get('/my', authenticate, getMyToken);

/**
 * POST /api/tokens/:id/cancel
 * Cancel a waiting token.
 */
router.post('/:id/cancel', authenticate, cancelToken);

/**
 * GET /api/tokens
 * Staff list of all tokens with filters.
 */
router.get('/', authenticate, requireStaff, getAllTokens);

module.exports = router;
