const express = require('express');
const { getServices, getCounters } = require('../controllers/serviceController');

const router = express.Router();

// Public: Get all active services
router.get('/', getServices);

// Public / Operations: Get all active counters
router.get('/counters', getCounters);

module.exports = router;
