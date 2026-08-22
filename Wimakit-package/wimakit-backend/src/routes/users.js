'use strict';
const express = require('express');
const ctrl = require('../controllers/userController'); // Assuming a userController exists
const { protect, restrictTo } = require('../middleware/auth');
const router = express.Router();

// Admin-specific user management routes
router.get('/', protect, restrictTo('admin'), ctrl.getAllUsers);
router.patch('/:id/status', protect, restrictTo('admin'), ctrl.toggleUserStatus);

module.exports = router;