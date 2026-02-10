require('dotenv').config();

process.env.TZ = process.env.TZ || 'UTC';

const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedules');
const userRoutes = require('./routes/user');
const logsRoutes = require('./routes/logs');
const { initializeCronJobs } = require('./utils/cronManager');

const app = express();
const PORT = process.env.PORT || 3000;

// SSE clients: userId -> [response objects]
global.sseClients = new Map();
global.sseHeartbeats = new Map();

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-secret-key-change-in-production') {
  console.warn('[WARN] Using default SESSION_SECRET. Set a secure secret in production.');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (!process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
  console.error('[ERROR] Database credentials not set in environment variables');
  process.exit(1);
}

const dbURI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.690fc.mongodb.net/n8n-scheduler?retryWrites=true&w=majority&appName=Cluster0`;

function authenticateJWT(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      res.clearCookie('token');
    }
    req.user = null;
    next();
  }
}

app.use(authenticateJWT);

app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

async function connectToDatabase() {
  try {
    await mongoose.connect(dbURI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });
    
    isConnected = true;
    connectionAttempts = 0;
    console.log('[OK] Connected to MongoDB Atlas');
    
    await initializeCronJobs();
    
    if (!app.get('server')) {
      const server = app.listen(PORT, () => {
        console.log(`[OK] Server running on http://localhost:${PORT}`);
        console.log(`[OK] SSE ready for real-time updates`);
        console.log(`[OK] Timezone: ${process.env.TZ} (${new Date().toString()})`);
        console.log(`[OK] Environment: ${process.env.NODE_ENV || 'development'}`);
      });
      app.set('server', server);
    }
  } catch (err) {
    isConnected = false;
    connectionAttempts++;
    console.error(`[ERROR] MongoDB connection error (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}):`, err.message);
    
    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      console.log(`[RETRY] Reconnecting in 5 seconds...`);
      setTimeout(connectToDatabase, 5000);
    } else {
      console.error('[ERROR] Max connection attempts reached. Exiting...');
      process.exit(1);
    }
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[WARN] MongoDB disconnected. Attempting to reconnect...');
  isConnected = false;
  if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    setTimeout(connectToDatabase, 5000);
  }
});

mongoose.connection.on('error', (err) => {
  console.error('[ERROR] MongoDB error:', err.message);
});

// Start initial connection
connectToDatabase();

app.get('/health', (req, res) => {
  const health = {
    status: isConnected ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: isConnected ? 'connected' : 'disconnected',
    timezone: process.env.TZ,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    },
    activeSSEConnections: global.sseClients.size
  };
  
  res.status(isConnected ? 200 : 503).json(health);
});

app.use('/auth', authRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/user', userRoutes);
app.use('/logs', logsRoutes);

app.get('/', (req, res) => {
  if (req.user && req.user.userId) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

app.get('/login', (req, res) => {
  if (req.user && req.user.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.get('/register', (req, res) => {
  if (req.user && req.user.userId) {
    return res.redirect('/dashboard');
  }
  res.render('register');
});

app.get('/dashboard', (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.redirect('/login');
  }
  res.render('dashboard', { user: req.user });
});

app.get('/execution-logs', (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.redirect('/login');
  }
  res.render('logs', { user: req.user });
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// SSE endpoint for real-time updates
app.get('/events', (req, res) => {
  if (!req.user || !req.user.userId) {
    return res.status(401).send('Unauthorized');
  }

  const userId = req.user.userId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);
  } catch (error) {
    console.error('Error sending initial SSE message:', error);
    return res.end();
  }

  if (!global.sseClients.has(userId)) {
    global.sseClients.set(userId, []);
  }
  global.sseClients.get(userId).push(res);

  console.log(`[SSE] Client connected for user: ${userId} (Total: ${global.sseClients.get(userId).length})`);

  // Heartbeat with error handling
  const heartbeat = setInterval(() => {
    try {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      clearInterval(heartbeat);
    }
  }, 30000);

  if (!global.sseHeartbeats.has(userId)) {
    global.sseHeartbeats.set(userId, []);
  }
  global.sseHeartbeats.get(userId).push(heartbeat);

  const cleanup = () => {
    clearInterval(heartbeat);
    
    if (global.sseHeartbeats.has(userId)) {
      const heartbeats = global.sseHeartbeats.get(userId);
      const hbIndex = heartbeats.indexOf(heartbeat);
      if (hbIndex > -1) {
        heartbeats.splice(hbIndex, 1);
      }
      if (heartbeats.length === 0) {
        global.sseHeartbeats.delete(userId);
      }
    }
    
    if (global.sseClients.has(userId)) {
      const clients = global.sseClients.get(userId);
      const index = clients.indexOf(res);
      if (index > -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        global.sseClients.delete(userId);
      }
    }
    
    console.log(`[SSE] Client disconnected for user: ${userId}`);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
});

// Broadcast to a specific user via SSE
global.broadcastToUser = (userId, data) => {
  if (!global.sseClients.has(userId)) {
    return;
  }

  const message = `data: ${JSON.stringify(data)}\n\n`;
  const clients = global.sseClients.get(userId);
  const deadClients = [];
  
  clients.forEach((client, index) => {
    try {
      if (!client.writableEnded) {
        client.write(message);
      } else {
        deadClients.push(index);
      }
    } catch (error) {
      console.error('Error sending SSE message:', error);
      deadClients.push(index);
    }
  });

  if (deadClients.length > 0) {
    deadClients.reverse().forEach(index => {
      clients.splice(index, 1);
    });
    
    if (clients.length === 0) {
      global.sseClients.delete(userId);
    }
  }
};

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal server error');
});

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  console.log('\n[SHUTDOWN] Shutting down gracefully...');
  
  console.log('[SHUTDOWN] Closing SSE connections...');
  global.sseClients.forEach((clients, userId) => {
    clients.forEach(client => {
      try {
        client.end();
      } catch (error) {
      }
    });
  });
  global.sseClients.clear();
  
  global.sseHeartbeats.forEach((heartbeats) => {
    heartbeats.forEach(hb => clearInterval(hb));
  });
  global.sseHeartbeats.clear();
  
  const server = app.get('server');
  if (server) {
    server.close(() => {
      console.log('[SHUTDOWN] Server closed');
    });
  }
  
  try {
    await mongoose.connection.close();
    console.log('[SHUTDOWN] Database connection closed');
  } catch (error) {
    console.error('[ERROR] Closing database:', error);
  }
  
  console.log('[SHUTDOWN] Complete');
  process.exit(0);
}

module.exports = app;
