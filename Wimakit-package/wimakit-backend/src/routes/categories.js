'use strict';
const express = require('express');
const ctrl    = require('../controllers/categoryController');
const router  = express.Router();

router.get('/', ctrl.listCategories);
router.get('/:slug', ctrl.getCategoryBySlug);

module.exports = router;
