'use strict';
const mongoose = require('mongoose');

// Singleton document (isActive: true, same fetch-or-create pattern as
// DeliveryConfig). Previously the support phone number was hardcoded
// verbatim in TWO places (app/legal/[slug].tsx and app/about.tsx) and the
// support email in a third — changing WimaKit's support number meant
// finding and editing multiple files and shipping a new build. One
// admin-editable source of truth now backs all of them.
const siteSettingsSchema = new mongoose.Schema({
  supportPhone:    { type: String, default: '+23276000000' },
  supportEmail:    { type: String, default: 'support@wimakit.sl' },
  supportWhatsApp: { type: String, default: '+23276000000' },
  isActive:  { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  version:   { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
