const express = require('express');
const { protect } = require('../middleware/auth');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

const router = express.Router();

// @desc    Get current user's notifications
// @route   GET /api/notifications/me
// @access  Private
router.get('/me', protect, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id }).sort('-createdAt').limit(50);
    res.status(200).json({ success: true, data: notifications });
  } catch (err) { next(err); }
});

// @desc    Mark all notifications as read for the current user
// @route   PATCH /api/notifications/me/mark-all-read
// @access  Private
router.patch('/me/mark-all-read', protect, async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.user.id, read: false }, { $set: { read: true } });
    res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
});

// @desc    Mark single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
router.patch('/:id/read', protect, async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user.id },
      { $set: { read: true } },
      { new: true }
    );
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: n });
  } catch (err) { next(err); }
});

// @desc    Clear all notifications for the current user
// @route   DELETE /api/notifications/me/clear-all
// @access  Private
router.delete('/me/clear-all', protect, async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({ recipient: req.user.id });
    res.json({ success: true, message: 'All notifications cleared', deletedCount: result.deletedCount });
  } catch (err) { next(err); }
});

// @desc    Batch delete notifications
// @route   POST /api/notifications/batch-delete or DELETE /api/notifications/batch
// @access  Private
const handleBatchDelete = async (req, res, next) => {
  try {
    const ids = req.body.ids || req.query.ids;
    const idArray = Array.isArray(ids) ? ids : (typeof ids === 'string' ? ids.split(',').map(s => s.trim()) : []);
    if (idArray.length === 0) {
      return res.status(400).json({ success: false, message: 'No notification IDs provided' });
    }
    const result = await Notification.deleteMany({
      _id: { $in: idArray },
      recipient: req.user.id,
    });
    res.json({ success: true, message: `${result.deletedCount} notifications deleted`, deletedCount: result.deletedCount });
  } catch (err) { next(err); }
};

router.post('/batch-delete', protect, handleBatchDelete);
router.delete('/batch', protect, handleBatchDelete);

// @desc    Delete a single notification
// @route   DELETE /api/notifications/:id
// @access  Private
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const n = await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user.id });
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) { next(err); }
});

module.exports = router;