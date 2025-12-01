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

const PORT = process.env.PORT || 3000;

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

  // 只为当前选中的素材库启动文件监控和快速同步
  const { loadConfig } = require('./utils/config');
  const config = loadConfig();
  const currentLibraryId = config.currentLibraryId;
  const currentLibrary = config.libraries.find(lib => lib.id === currentLibraryId);

  if (currentLibrary) {
    console.log(`📡 启动当前素材库监控: ${currentLibrary.name}`);

    // 启动文件监控
    try {
      fileWatcher.watch(currentLibrary.id, io);
      console.log(`  ✅ 文件监控已启动`);
    } catch (err) {
      console.log(`  ❌ 文件监控失败: ${err.message}`);
    }

    // 快速同步检测离线变化
    console.log('🔄 检测离线期间的文件变化...');
    const { quickSync } = require('./utils/scanner');
    const dbPool = require('./database/dbPool');

    (async () => {
      try {
        const db = dbPool.acquire(currentLibrary.path);
        const results = await quickSync(currentLibrary.path, db);
        dbPool.release(currentLibrary.path);

        const changes = results.added + results.deleted;
        if (changes > 0) {
          console.log(`  📊 ${currentLibrary.name}: +${results.added} -${results.deleted}`);
          io.emit('scanComplete', { libraryId: currentLibrary.id, results });
        } else {
          console.log(`  ✅ ${currentLibrary.name}: 无变化`);
        }
      } catch (err) {
        console.log(`  ❌ ${currentLibrary.name}: ${err.message}`);
      }
      console.log('✅ 启动检查完成');
    })();
  } else {
    console.log('📭 未选中素材库，等待用户操作...');
  }
});

// Graceful shutdown - 优雅关闭，释放所有资源
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // 1. 停止所有文件监控
    console.log('📡 Stopping file watchers...');
    fileWatcher.unwatchAll();

    // 2. 关闭所有数据库连接
    console.log('💾 Closing database connections...');
    const dbPool = require('./database/dbPool');
    dbPool.closeAll();

    // 3. 关闭 HTTP 服务器
    console.log('🌐 Closing HTTP server...');
    server.close(() => {
      console.log('✅ All resources released, goodbye!');
      process.exit(0);
    });

    // 如果10秒内没有正常关闭，强制退出
    setTimeout(() => {
      console.error('⚠️ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);

  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// 监听各种退出信号
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));   // 终端关闭

// Windows 特殊处理（Ctrl+C）
if (process.platform === 'win32') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
