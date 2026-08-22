'use strict';
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/contentController');

// Public — legal pages and support contact info need to be readable
// without an account (e.g. Privacy Policy from the registration screen).
router.get('/legal/:slug', ctrl.getLegalPage);
router.get('/settings', ctrl.getSiteSettings);

module.exports = router;
