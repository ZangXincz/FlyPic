/**
 * FlyPic 服务器入口（新架构）
 * 使用重构后的 Service 层和 Model 层
 */

const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

// 导入新架构的应用
const { createApp } = require('./src/app');

// 导入现有的依赖（保持兼容）
const config = require('./utils/config');
const dbPool = require('./database/dbPool');
const scanner = require('./utils/scanner');
const scanManager = require('./utils/scanManager');
const lightweightWatcher = require('./utils/lightweightWatcher');
const MemoryMonitor = require('./utils/memoryMonitor');
const CleanupManager = require('./utils/cleanupManager');

const PORT = process.env.PORT || 15002;

// 自动检测前端构建目录
let FRONTEND_DIST = process.env.FRONTEND_DIST;
if (!FRONTEND_DIST) {
  const possiblePaths = [
    path.join(__dirname, 'public'),
    path.join(__dirname, '../frontend/dist'),
    path.join(__dirname, '../public'),
    path.join(__dirname, '../../frontend/dist')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      FRONTEND_DIST = p;
      console.log('✅ Found frontend at:', p);
      break;
    }
  }

  if (!FRONTEND_DIST) {
    console.log('⚠️  Frontend not found, API-only mode');
  }
}

// 设置环境变量
if (FRONTEND_DIST) {
  process.env.FRONTEND_DIST = FRONTEND_DIST;
}

// 创建 Socket.IO 服务器
const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: FRONTEND_DIST ? false : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// 准备依赖注入
// 包装 config 函数为对象接口
const configManager = {
  load: () => config.loadConfig(),
  save: (data) => config.saveConfig(data),
  addLibrary: (name, path) => config.addLibrary(name, path),
  removeLibrary: (id) => config.removeLibrary(id),
  updateLibrary: (id, updates) => config.updateLibrary(id, updates),
  setCurrentLibrary: (id) => config.setCurrentLibrary(id),
  updatePreferences: (prefs) => config.updatePreferences(prefs),
  updateTheme: (theme) => config.updateTheme(theme)
};

const dependencies = {
  configManager,
  dbPool,
  scanner,
  scanManager,
  lightweightWatcher,
  io
};

// 创建 Express 应用（使用新架构）
const app = createApp(dependencies);

// 将 Express 应用挂载到 HTTP 服务器
server.on('request', app);

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('✅ Socket.IO client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Socket.IO client disconnected:', socket.id);
  });
});

// 启动内存监控
const memoryMonitor = new MemoryMonitor();
memoryMonitor.start();

// 启动清理管理器
const cleanupManager = new CleanupManager({ dbPool });
cleanupManager.startRoutineCleanup();

// 启动服务器
server.listen(PORT, () => {
  console.log('\n🚀 FlyPic Server (New Architecture) Started');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready`);
  console.log(`📁 Frontend: ${FRONTEND_DIST || 'Not found (API-only mode)'}`);
  console.log(`🏗️  Architecture: Config → Model → Service → Route`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 为当前素材库启动文件监控
  try {
    const currentConfig = config.loadConfig();
    if (currentConfig.currentLibraryId) {
      const currentLib = currentConfig.libraries.find(lib => lib.id === currentConfig.currentLibraryId);
      if (currentLib) {
        lightweightWatcher.watch(currentLib.id, currentLib.path, currentLib.name, io);
        console.log(`📂 File watcher started for: ${currentLib.name}`);
      }
    }
  } catch (e) {
    console.warn('⚠️  Failed to start file watcher:', e.message);
  }
});

// 优雅关闭
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');

  // 停止接受新连接
  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  // 停止监控
  memoryMonitor.stop();
  cleanupManager.stopRoutineCleanup();

  // 停止所有文件监控
  lightweightWatcher.stopAll();

  // 关闭所有数据库连接
  dbPool.closeAll();

  // 等待资源释放
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('✅ Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown();
});

// 导出供测试使用
module.exports = { app, server, io };
