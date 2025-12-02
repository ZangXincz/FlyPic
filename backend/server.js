const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fileWatcher = require('./utils/fileWatcher');
const MemoryMonitor = require('./utils/memoryMonitor');
const CleanupManager = require('./utils/cleanupManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_DIST ? false : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 15002;

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

// Initialize memory optimization components
const memoryConfig = require('./config/memory');
const dbPool = require('./database/dbPool');

// 应用更激进的数据库配置
dbPool.maxIdleTime = memoryConfig.database.idleTimeout;

const cleanupManager = new CleanupManager({
  routineInterval: memoryConfig.memory.cleanupInterval,
  dbPool: dbPool
});

const memoryMonitor = new MemoryMonitor({
  warningThreshold: memoryConfig.memory.warningThreshold * 1024 * 1024,
  dangerThreshold: memoryConfig.memory.dangerThreshold * 1024 * 1024,
  checkInterval: memoryConfig.memory.checkInterval,
  cleanupManager: cleanupManager,
  devMode: process.env.NODE_ENV === 'development'
});

console.log('🧠 Memory optimization config:');
console.log(`  Warning: ${memoryConfig.memory.warningThreshold}MB, Danger: ${memoryConfig.memory.dangerThreshold}MB`);
console.log(`  DB idle timeout: ${memoryConfig.database.idleTimeout}ms`);
console.log(`  Cleanup interval: ${memoryConfig.memory.cleanupInterval}ms`);

// Register database pool as a clearable cache
cleanupManager.registerCache('dbPool', dbPool);

// Make cleanup manager accessible to routes
app.set('cleanupManager', cleanupManager);

server.listen(PORT, () => {
  console.log(`🚀 FlyPic server running on http://localhost:${PORT}`);

  // Start memory monitoring and cleanup
  console.log('🧠 Starting memory optimization...');
  memoryMonitor.start();
  cleanupManager.startRoutineCleanup();
  
  // 定期诊断内存（每30秒）
  const memoryDiagnostics = require('./utils/memoryDiagnostics');
  setInterval(() => {
    const issues = memoryDiagnostics.detectMemoryLeak();
    if (issues.length > 0) {
      console.log('\n⚠️  Memory issues detected:');
      issues.forEach(issue => {
        console.log(`  [${issue.severity}] ${issue.message}`);
      });
      
      // 如果有严重问题，强制 GC
      const critical = issues.some(i => i.severity === 'critical');
      if (critical) {
        console.log('  🔧 Forcing aggressive GC...');
        memoryDiagnostics.forceGCAndReport();
      }
    }
  }, 30000);

  // 只为当前选中的素材库启动文件监控和快速同步
  const { loadConfig } = require('./utils/config');
  const config = loadConfig();
  const currentLibraryId = config.currentLibraryId;
  const currentLibrary = config.libraries.find(lib => lib.id === currentLibraryId);

  if (currentLibrary) {
    // 🎯 内存优化：使用轻量级监控代替 chokidar（Requirements 11.1-11.7）
    // chokidar 会在启动时扫描整个目录树，占用大量内存（800MB+）
    // 轻量级监控使用智能轮询，内存占用 < 50MB
    console.log(`📡 当前素材库: ${currentLibrary.name}`);
    
    const lightweightWatcher = require('./utils/lightweightWatcher');
    try {
      lightweightWatcher.watch(currentLibrary.id, currentLibrary.path, currentLibrary.name, io);
      console.log(`  ✅ 轻量级监控已启动（内存 < 50MB）`);
    } catch (err) {
      console.log(`  ❌ 监控启动失败: ${err.message}`);
    }

    console.log('💡 策略：智能轮询（5秒间隔），只检查变化的文件夹');
    console.log('💡 提示：如需立即同步，请在前端点击"同步"按钮');
  } else {
    console.log('📭 未选中素材库，等待用户操作...');
  }
});

// Graceful shutdown - 优雅关闭，释放所有资源
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // 1. 停止内存监控和清理
    console.log('🧠 Stopping memory monitoring...');
    memoryMonitor.stop();
    cleanupManager.stopRoutineCleanup();

    // 2. 停止所有文件监控
    console.log('📡 Stopping file watchers...');
    const lightweightWatcher = require('./utils/lightweightWatcher');
    lightweightWatcher.unwatchAll();

    // 3. 关闭所有数据库连接
    console.log('💾 Closing database connections...');
    const dbPool = require('./database/dbPool');
    dbPool.closeAll();

    // 4. 关闭 HTTP 服务器
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
