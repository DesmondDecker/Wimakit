'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User     = require('../models/User');
const Category = require('../models/Category');

const CATEGORIES = [
  { name:'Food & Groceries',    slug:'food',        icon:'food-apple-outline',   color:'#22C55E' },
  { name:'Electronics',          slug:'electronics', icon:'laptop',              color:'#4F46E5' },
  { name:'Fashion & Clothes',    slug:'fashion',     icon:'hanger',               color:'#EC4899' },
  { name:'Shoes & Footwear',     slug:'shoes',       icon:'shoe-formal',          color:'#8B5CF6' },
  { name:'Home & Living',        slug:'home',        icon:'sofa-outline',         color:'#F59E0B' },
  { name:'Health & Beauty',      slug:'health',      icon:'heart-outline',        color:'#F43F5E' },
  { name:'Agriculture',          slug:'agric',       icon:'sprout-outline',       color:'#16A34A' },
  { name:'Building & DIY',       slug:'building',    icon:'hammer-wrench',        color:'#78716C' },
  { name:'Services',             slug:'services',    icon:'briefcase-outline',    color:'#EF4444' },
  { name:'Vehicles & Auto Parts',slug:'vehicles',    icon:'car-outline',          color:'#64748B' },
  { name:'Education & Books',    slug:'education',   icon:'book-open-outline',    color:'#0EA5E9' },
  { name:'Baby & Kids',          slug:'baby',        icon:'baby-carriage',        color:'#F472B6' },
  { name:'Phones & Accessories', slug:'phones',      icon:'cellphone',            color:'#6366F1' },
  { name:'Computers & IT',       slug:'computers',   icon:'desktop-classic',      color:'#3B82F6' },
  { name:'Sports & Fitness',     slug:'sports',      icon:'soccer',               color:'#10B981' },
];

async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wimakit';
  // Mirrors the same safety net in server.js: only pin dbName when the URI
  // itself has no database name, so this script can never end up seeding a
  // different database ("test", by MongoDB's default) than whichever one
  // the actual running server reads from.
  const hasDbNameInUri = /:\/\/(?:[^@]+@)?[^/?]+\/([^/?]+)/.test(uri);
  await mongoose.connect(uri, hasDbNameInUri ? {} : { dbName: 'wimakit' });
  console.log('✅ Connected to MongoDB');
  console.log(`📂 Database: ${mongoose.connection.name}`);

  // Upsert categories
  for (const cat of CATEGORIES) {
    await Category.findOneAndUpdate({ slug: cat.slug }, cat, { upsert: true, new: true });
  }
  console.log(`✅ ${CATEGORIES.length} categories seeded`);

  // Remove test users
  await User.deleteMany({ email: { $in: ['admin@wimakit.com','seller@wimakit.com','buyer@wimakit.com','rider@wimakit.com'] } });

  const users = [
    { name:'WimaKit Admin', email:'admin@wimakit.com', phone:'+23278000001', password:'Admin@123!', role:'admin', isActive:true, emailVerified:true, isVerified:true, accountStatus:'active', storeStatus:undefined },
    { name:'Aminata Kamara', email:'seller@wimakit.com', phone:'+23278000002', password:'Seller@123!', role:'seller', isActive:true, emailVerified:true, isVerified:true, isKycVerified:true, kycStatus:'approved', accountStatus:'active', storeName:'Kamara Fresh Farm', storeDescription:'Premium fresh produce from Bo District.', storeStatus:'approved', bnplEligible:true, loanEligible:true },
    { name:'Mohamed Conteh', email:'buyer@wimakit.com', phone:'+23278000003', password:'Buyer@123!', role:'buyer', isActive:true, emailVerified:true, isKycVerified:true, kycStatus:'approved', accountStatus:'active', bnplEligible:true, loanEligible:true, wallet:{ available:750000, pending:0 } },
    { name:'Ibrahim Sesay', email:'rider@wimakit.com', phone:'+23278000004', password:'Rider@123!', role:'rider', isActive:true, emailVerified:true, isVerified:true, accountStatus:'active', vehicleType:'motorcycle', riderZone:'Freetown Central', wallet:{ available:185000, pending:0 } },
  ];

  for (const u of users) {
    const user = new User(u);
    await user.save();
    console.log(`✅ Created ${u.role}: ${u.email}`);
  }

  console.log('\n🎉 Seed complete!\n───────────────────────────────────────');
  console.log('  Admin  → admin@wimakit.com   / Admin@123!');
  console.log('  Seller → seller@wimakit.com  / Seller@123!');
  console.log('  Buyer  → buyer@wimakit.com   / Buyer@123!');
  console.log('  Rider  → rider@wimakit.com   / Rider@123!');
  console.log('───────────────────────────────────────');

  // Seed default delivery config
  const DeliveryConfig = require('../models/DeliveryConfig');
  await DeliveryConfig.deleteMany({});
  await DeliveryConfig.create({
    defaultPerKmRate: 3000,
    defaultBaseFee:   5000,
    defaultMinFee:    5000,
    defaultMaxFee:    80000,
    freeDeliveryThreshold: 500000,
    peakHourSurcharge: 0.25,
    nightSurcharge:    0.50,
    riderEarningsPercent: 85,
    bulkOrderDiscount: 0.10,
    multiDropDiscount: 0.15,
    regularCustomerDiscount: 0.05,
    weightBreakpoints: [
      { maxKg: 2,  surchargeLePerKg: 500  },
      { maxKg: 5,  surchargeLePerKg: 1000 },
      { maxKg: 20, surchargeLePerKg: 2000 },
    ],
    zones: [
      { name: 'Freetown Central', district: 'Western Area Urban', baseFee: 5000,  perKmRate: 2500, minFee: 5000,  maxFee: 60000  },
      { name: 'Western Rural',    district: 'Western Area Rural', baseFee: 8000,  perKmRate: 3500, minFee: 8000,  maxFee: 80000  },
      { name: 'Bo District',      district: 'Bo',                  baseFee: 15000, perKmRate: 4000, minFee: 15000, maxFee: 100000 },
      { name: 'Kenema District',  district: 'Kenema',              baseFee: 18000, perKmRate: 4500, minFee: 18000, maxFee: 120000 },
      { name: 'Makeni District',  district: 'Bombali',             baseFee: 16000, perKmRate: 4000, minFee: 16000, maxFee: 110000 },
    ],
    isActive: true,
  });
  console.log('✅ Default delivery config seeded');

  process.exit(0);
}

seed().catch(e => { console.error('❌ Seed error:', e.message); process.exit(1); });
