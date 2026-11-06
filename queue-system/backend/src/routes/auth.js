const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Apply auth rate limiter to all auth routes
router.use(authRateLimiter);

/**
 * POST /api/auth/register
 */
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 80 })
      .withMessage('Username must be 3-80 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username may only contain letters, numbers, and underscores'),
    body('email')
      .isEmail()
      .withMessage('Valid email required')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('role')
      .optional()
      .isIn(['user', 'staff'])
      .withMessage('Role must be user or staff'),
  ],
  validate,
  register
);

/**
 * POST /api/auth/login
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  login
);

/**
 * GET /api/auth/me  — returns the authenticated user's profile
 */
router.get('/me', authenticate, getMe);

module.exports = router;
