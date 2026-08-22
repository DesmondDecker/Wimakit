'use strict';
const mongoose = require('mongoose');

// Previously all four of these pages (privacy, terms, cookies, help) were
// hardcoded directly in the app bundle (app/legal/[slug].tsx) — correct,
// real content (a prior fix from dead no-op buttons), but changing a single
// word meant a full app store release. Any real business — and certainly
// one that needs to keep legal copy in sync with actual practice, or update
// a support number — needs to be able to edit this without shipping a new
// build.
const sectionSchema = new mongoose.Schema({
  heading: { type: String, required: true },
  body:    { type: String, required: true },
}, { _id: false });

const legalPageSchema = new mongoose.Schema({
  slug:     { type: String, required: true, unique: true, index: true }, // 'privacy' | 'terms' | 'cookies' | 'help'
  title:    { type: String, required: true },
  icon:     { type: String, default: 'file-document-outline' }, // MaterialCommunityIcons name
  sections: { type: [sectionSchema], default: [] },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  version:   { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('LegalPage', legalPageSchema);
