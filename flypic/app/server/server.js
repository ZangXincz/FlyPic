const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fileWatcher = require('./utils/fileWatcher');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_DIST ? false : 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.TRIM_SERVICE_PORT || process.env.PORT || 3000;

// Auto-detect frontend dist path
let FRONTEND_DIST = process.env.FRONTEND_DIST;
if (!FRONTEND_DIST) {
  // Try common locations
  const possiblePaths = [
    path.join(__dirname, 'public'),           // 飞牛 fnOS 打包后的位置
    path.join(__dirname, '../frontend/dist'), // 开发环境
    path.join(__dirname, '../public'),
    path.join(__dirname, '../../frontend/dist')
  ];
  
  for (const p of possiblePaths) {
    if (require('fs').existsSync(p)) {
      FRONTEND_DIST = p;
      console.log('✅ Found frontend at:', p);
      break;
    }
  }
  
  if (!FRONTEND_DIST) {
    console.log('⚠️  Frontend not found, tried:', possiblePaths);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
const libraryRouter = require('./routes/library');
const imageRouter = require('./routes/image');
const scanRouter = require('./routes/scan');
const watchRouter = require('./routes/watch');

app.use('/api/library', libraryRouter);
app.use('/api/image', imageRouter);
app.use('/api/scan', scanRouter);
app.use('/api/watch', watchRouter);

// Serve static files (production)
if (FRONTEND_DIST) {
  console.log('📁 Serving frontend from:', FRONTEND_DIST);
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    }
  });
}

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Make fileWatcher accessible to routes
app.set('fileWatcher', fileWatcher);

server.listen(PORT, () => {
  console.log(`🚀 FlyPic server running on http://localhost:${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  fileWatcher.unwatchAll();
  process.exit(0);
});
