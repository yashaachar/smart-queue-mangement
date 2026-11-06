const express = require('express');
const { generateToken, getAllTokens, getMyToken } = require('../controllers/tokenController');
const { authenticate, requireStaff } = require('../middleware/auth');
const { tokenRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * POST /api/tokens/generate
 * Any authenticated user can take a token.
 * Rate-limited to prevent burst abuse.
 */
router.post('/generate', tokenRateLimiter, authenticate, generateToken);

/**
 * GET /api/tokens/my
 * Returns the calling user's current active token.
 */
router.get('/my', authenticate, getMyToken);

/**
 * GET /api/tokens
 * Staff/admin only — paginated list of all tokens.
 * Query params: ?page=1&limit=20&status=waiting
 */
router.get('/', authenticate, requireStaff, getAllTokens);

module.exports = router;
