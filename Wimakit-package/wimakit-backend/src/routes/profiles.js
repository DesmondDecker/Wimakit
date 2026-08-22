'use strict';
const express = require('express');
const ctrl    = require('../controllers/profileController');
const { protect, optionalAuth } = require('../middleware/auth');
const router  = express.Router();

router.get('/stores', ctrl.listStores);
router.get('/followed-stores', protect, ctrl.getFollowedStoresDetails);
router.get('/recommended', protect, ctrl.getRecommendedSellers);
router.patch('/me',   protect,      ctrl.updateMyProfile);

router.post('/:id/follow', protect, ctrl.followUser);
router.delete('/:id/follow', protect, ctrl.unfollowUser);

router.get ('/:slug', optionalAuth, ctrl.getProfile);


// ─── Addresses ──────────────────────────────────────────────────────────────
router.get   ('/me/addresses',            protect, ctrl.getAddresses);
router.post  ('/me/addresses',            protect, ctrl.addAddress);
router.put   ('/me/addresses/:addressId', protect, ctrl.updateAddress);
router.delete('/me/addresses/:addressId', protect, ctrl.deleteAddress);
router.patch ('/me/addresses/:addressId/default', protect, ctrl.setDefaultAddress);

// ─── Avatar ─────────────────────────────────────────────────────────────────
router.patch('/me/avatar', protect, ctrl.updateAvatar);

// ─── KYC ────────────────────────────────────────────────────────────────────
router.post ('/me/kyc',    protect, ctrl.submitKyc);
router.get  ('/me/kyc',    protect, ctrl.getKycStatus);

module.exports = router;
