'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');
dns.setDefaultResultOrder?.('ipv4first');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean'); // NOTE: xss-clean is unmaintained (last
// meaningfully updated ~2019) and uses a regex-based approach that's known
// to be bypassable in places. Left in place rather than swapped blind in
// this pass — replacing a global input sanitizer needs real test coverage
// first so nothing silently breaks. Recommended path: migrate to
// output-encoding at render time plus `sanitize-html` for specific
// rich-text fields (e.g. community post bodies), rather than a blanket
// input sanitizer.
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const logger = require('./utils/logger');
const User = require('./models/User');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ─── Route imports ────────────────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const productRoutes  = require('./routes/products');
const orderRoutes    = require('./routes/orders');
const reviewRoutes   = require('./routes/reviews');
const uploadRoutes   = require('./routes/upload');
const categoryRoutes = require('./routes/categories');
const profileRoutes  = require('./routes/profiles');
const notificationRoutes = require('./routes/notifications'); // New import
const webhookRoutes  = require('./routes/webhooks');
const adminRoutes    = require('./routes/admin'); // New import
// ─── WimaKit v3 Routes ───────────────────────────────────────────────────────
const walletRoutes    = require('./routes/wallet');
const payoutsRoutes   = require('./routes/payouts');
const deliveryRoutes  = require('./routes/delivery');
// Note: there used to be a second, separate escrow implementation mounted
// at /api/escrow (routes/escrow.js). It duplicated /api/admin/escrow with a
// different (incorrect — overpaid the seller by the delivery fee, or in one
// version the full order total including the platform's own cut) payout
// formula, and was never actually called by the admin dashboard UI. Removed
// to avoid two live, differently-behaved endpoints for the same action.
const communityRoutes = require('./routes/community');
const bnplRoutes      = require('./routes/bnpl');
const loansRoutes     = require('./routes/loans');
const { startGrowthStatsScheduler } = require('./tasks/calculateGrowthStats'); // New import
const { startPaymentRemindersScheduler } = require('./tasks/paymentReminders');
const { startSearchHistoryPruner } = require('./tasks/searchHistoryPrune');
const { startExpireTrendingScheduler } = require('./tasks/expireTrending');
const { startBnplOverdueScheduler } = require('./tasks/bnplOverdueSweep');

const app = express();

// Both Render and Fly.io terminate TLS at a reverse proxy in front of this
// app, so every incoming request looks like it's coming from that proxy's
// internal address unless we tell Express to trust the X-Forwarded-For
// header. Without this, req.ip is the same for every request no matter who
// the real client is — which means express-rate-limit below buckets EVERY
// user on the entire app into one shared limit instead of limiting each
// client individually. `1` trusts exactly one hop (the platform's own
// proxy), which is correct for both Render and Fly's single-proxy setups.
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(mongoSanitize());
app.use(xss()); // Prevent XSS attacks in bio/descriptions

// ─── CORS ─────────────────────────────────────────────────────────────────────
const localOriginPatterns = [
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^exp:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/,
  /^exp:\/\/192\.168\.\d+\.\d+(\:\d+)?$/,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    let allowedOrigins = [
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:8081',
      'exp://localhost:8081',
    ].filter(Boolean);

    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push(
        'http://localhost:19000', 'http://localhost:19001', 'http://localhost:19006',
        'http://127.0.0.1:19000', 'http://127.0.0.1:19006'
      );
    }

    if (allowedOrigins.includes(origin) || localOriginPatterns.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }

    logger.warn(`Blocked CORS origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
}));

// ─── General Middleware ───────────────────────────────────────────────────────
app.use(compression());
// Webhooks MUST be mounted before express.json() — body-parser sets
// req._body=true after reading the stream, and any subsequent body-parser
// (including express.raw() declared at the route level inside webhooks.js)
// sees that flag and skips re-reading entirely, leaving req.body as the
// already-parsed JS object instead of the raw Buffer needed for byte-accurate
// HMAC signature verification. Moving webhooks here, before express.json(),
// is the only correct fix.
app.use('/api/webhooks', webhookRoutes);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'testing') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Definitions moved to middleware/rateLimiters.js — routes/auth.js needs
// authLimiter too now, applied selectively per-route instead of as a
// blanket over the whole router (see that file's comment for why).
const { apiLimiter: limiter } = require('./middleware/rateLimiters');
app.use('/api/', limiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: process.env.APP_NAME,
    env: process.env.NODE_ENV,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.get('/', (req, res) => {
  res.json({ message: '🛵 WimaKit API – di makit na you phone', version: '1.0.0' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/orders',     orderRoutes);
app.use('/api/reviews',    reviewRoutes);
app.use('/api/upload',     uploadRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/profiles',   profileRoutes);
app.use('/api/notifications', notificationRoutes); // New route
app.use('/api/admin',      adminRoutes);
app.use('/api/wallet',     walletRoutes);
app.use('/api/payouts',    payoutsRoutes);
app.use('/api/delivery',   deliveryRoutes);
app.use('/api/community',  communityRoutes);
app.use('/api/bnpl',       bnplRoutes);
app.use('/api/loans',      loansRoutes);
// Helmet's global default sets `Cross-Origin-Resource-Policy: same-origin`
// on every response, which is the right call for the JSON API — but it
// also silently blocks an <img> tag on a *different* origin from loading
// these files. That's not a hypothetical: render.yaml deploys the web
// frontend (wimakit-web) and this API (wimakit-api) as two separate
// origins, and the same is true of any local dev setup where the web
// preview runs on a different port than the API. CORP isn't part of CORS,
// so the cors() config above doesn't cover it — the browser just fails the
// image load with nothing useful in the console. Native (iOS/Android)
// doesn't enforce CORP at all, so this only ever bit the web build, which
// is exactly why it could look like "images are broken" with no obvious
// cause. This is the one route that's *meant* to be embedded cross-origin,
// so it gets its own explicit override instead of touching the global
// default and weakening it for everything else.
app.use(
  '/uploads',
  (req, res, next) => { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); },
  express.static(path.join(__dirname, '..', 'uploads')),
);
app.use('/api/delivery-pricing', require('./routes/deliveryPricing'));
app.use('/api/content', require('./routes/content'));

// ─── Error Handling (must be LAST) ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Database + Server Start ──────────────────────────────────────────────────
let currentPort = parseInt(process.env.PORT, 10) || 5000;
const DEFAULT_DB_CONNECT_TIMEOUT_MS = 5000;

// Simple in-memory database for development when MongoDB is unavailable
const inMemoryDB = {
  users: [],
  products: [],
  orders: [],
  categories: []
};

const resolveAtlasHost = (uri) => {
  if (!uri || typeof uri !== 'string') return null;
  const match = uri.match(/^mongodb\+srv:\/\/(?:[^@]+@)?([^/?]+)(?:\/|\?|$)/i);
  return match?.[1] || null;
};

const connectWithDnsFallback = async (uri) => {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (e) {}

  const hasDbNameInUri = /:\/\/(?:[^@]+@)?[^/?]+\/([^/?]+)/.test(uri);

  const options = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    autoIndex: true,
    ...(hasDbNameInUri ? {} : {
      dbName: 'wimakit',
    }),
  };

  try {
    return await mongoose.connect(uri, options);
  } catch (error) {
    if (uri && uri.startsWith('mongodb+srv://') && error.message.includes('querySrv')) {
      const atlasHost = resolveAtlasHost(uri);
      logger.warn(`⚠️  DNS SRV lookup failed for Atlas host: ${atlasHost}`);
      logger.info('🔧 Retrying with public DNS servers (8.8.8.8, 1.1.1.1)');

      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        const records = await dns.promises.resolveSrv(`_mongodb._tcp.${atlasHost}`);
        logger.info(`✅ Public DNS resolved ${records.length} SRV records`);
        records.forEach((record) => {
          logger.info(`   • ${record.name}:${record.port}`);
        });
        return await mongoose.connect(uri, options);
      } catch (dnsError) {
        logger.error(`❌ DNS fallback failed: ${dnsError.message}`);
        throw dnsError;
      }
    }
    throw error;
  }
};

const startServer = async () => {
  try {
    logger.info('🔄 Connecting to MongoDB...');
    const conn = await connectWithDnsFallback(process.env.MONGODB_URI);
    logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
    logger.info(`📂 Database: ${conn.connection.name}`);

    // Handle connection loss after initial start
    mongoose.connection.on('error', err => {
      logger.error('❌ Mongoose connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ Mongoose disconnected. Backend will retry operations...');
    });

  } catch (error) {
    logger.error(`❌ MongoDB connection failed: ${error.message}`);
    logger.warn('⚠️  Falling back to plain in-memory JS objects for development');
    global.USE_MEMORY_DB = true;
    logger.warn('💡 If you are using mongodb+srv, ensure DNS SRV lookups are available on this machine.');
    logger.warn('💡 Check that MONGODB_URI in .env matches your Atlas URI and that the password is correct.');
  }

  const server = http.createServer(app);
  
  // ─── Socket.io Initialization ───────────────────────────────────────────────
  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const allowed = [
          process.env.FRONTEND_URL,
          'http://localhost:3000', 'http://localhost:8081',
          'http://localhost:19000', 'http://localhost:19006',
        ].filter(Boolean);
        cb(null, allowed.includes(origin) || /^exp:\/\//.test(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  app.set('io', io); // Make io accessible in routes/controllers

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId; // Assuming userId is passed as a query param
    logger.info(`🔌 New socket connection: ${socket.id} (User: ${userId || 'Guest'})`);
    
    // Join private user room for notifications/wallet updates
    if (userId) socket.join(`user:${userId}`);

    // Admin room — for new order broadcasts. Previously this joined
    // room:admin for literally any client that emitted the event with any
    // string — the token argument was received but never verified, so any
    // socket connection (no auth required to open one) could listen in on
    // every new-order broadcast and admin-only events. Now the token is
    // verified the same way the REST `protect` middleware does, and only an
    // actual admin user is allowed into the room.
    socket.on('join-admin', async (token) => {
      try {
        if (!token) return;
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        const user = await User.findById(decoded.id).select('role accountStatus');
        if (!user || user.role !== 'admin' || user.accountStatus === 'banned' || user.accountStatus === 'suspended') {
          return;
        }
        socket.join('room:admin');
      } catch (err) {
        // Invalid/expired token — silently refuse to join, same as a
        // failed REST auth check. Don't leak verification details over the socket.
      }
    });

    socket.on('join-order', (orderId) => {
      socket.join(`order:${orderId}`);
      logger.info(`📦 Tracking order: ${orderId}`);
    });

    // Post room for real-time reaction broadcasts — communityController
    // emits `reaction:updated` to `post:${id}` so all viewers of a post
    // see reaction count changes without polling.
    socket.on('join-post', (postId) => { socket.join(`post:${postId}`); });
    socket.on('leave-post', (postId) => { socket.leave(`post:${postId}`); });

    socket.on('order-status-update', (data) => {
      // Expected: { orderId, newStatus, userId, sellerId }
      io.to(`order:${data.orderId}`).emit('order-status-updated', data.newStatus);
      if (data.userId) io.to(`user:${data.userId}`).emit('order-status-updated', data.newStatus);
      if (data.sellerId) io.to(`user:${data.sellerId}`).emit('seller-order-updated', data.newStatus);
      logger.info(`📢 Order ${data.orderId} status updated to ${data.newStatus}`);
    });

    socket.on('rider-location-update', (data) => {
      // Expected: { orderId, coordinates: [lng, lat] }
      io.to(`order:${data.orderId}`).emit('location-update', data.coordinates);
      logger.info(`📍 Rider location for order ${data.orderId} updated to ${data.coordinates}`);
    });

    socket.on('update-location', (data) => {
      // Expected: { orderId, coordinates: [lng, lat] }
      io.to(`order:${data.orderId}`).emit('location-update', data.coordinates);
    });

    socket.on('send-message', (data) => {
      // Real-time chat: { orderId, text, senderId }
      io.to(`order:${data.orderId}`).emit('new-message', data);
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  // Start scheduled tasks
  startGrowthStatsScheduler();
  startPaymentRemindersScheduler();
  startSearchHistoryPruner();
  startExpireTrendingScheduler();
  startBnplOverdueScheduler(io);

  server.on('listening', () => {
    const env = process.env.NODE_ENV || 'development';
    logger.info(`🚀 WimaKit API (PID: ${process.pid}) running on port ${currentPort} [${env}]`);
    
    if (currentPort !== 5000) {
      logger.warn(`🔔 ATTENTION: Backend port changed to ${currentPort} because 5000 was locked.`);
      logger.warn(`👉 Update EXPO_PUBLIC_API_URL in wimakit/.env.local to: http://localhost:${currentPort}`);
    }

    logger.info(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    if (global.USE_MEMORY_DB) {
      logger.warn('🗄️  Using in-memory JavaScript database - data will not persist between restarts');
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`⚠️  Port ${currentPort} is locked. Retrying on port ${currentPort + 1}...`);
      currentPort++;
      server.listen(currentPort, '0.0.0.0');
    } else {
      logger.error('❌ Server failed to start:', err.message);
      process.exit(1);
    }
  });

  try {
    server.listen(currentPort, '0.0.0.0');
  } catch (err) {
    logger.error('❌ Failed to bind server port:', err.message);
    process.exit(1);
  }

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`${signal} received – shutting down gracefully`);
    
    // Force exit after 2 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.warn('Force exiting after timeout...');
      process.exit(0);
    }, 2000);

    if (server.listening) {
      server.close(async () => {
        if (!global.USE_MEMORY_DB) await mongoose.connection.close();
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // CRITICAL: Handle nodemon restarts by exiting immediately to free the port
  process.once('SIGUSR2', () => {
    logger.info(`Nodemon restart detected – releasing port ${currentPort}...`);
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('❌ Unhandled Promise Rejection:', reason);
    process.exit(1); // A rejection here is a programmer error, exit immediately
  });
  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    process.exit(1); // Uncaught exceptions are fatal, exit immediately
  });
};

startServer();

module.exports = app;