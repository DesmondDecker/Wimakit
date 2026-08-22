'use strict';
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    icon:        { type: String },
    color:       { type: String }, // hex color for category pill/tile theming — was missing from the schema, so seed data's colors were being silently dropped on insert
    image:       { type: String },
    isActive:    { type: Boolean, default: true },
    sortOrder:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

// slug index already created by unique:true above

const Category = mongoose.models && mongoose.models.Category
  ? mongoose.models.Category
  : mongoose.model('Category', CategorySchema);

module.exports = Category;
