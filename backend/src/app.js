/**
 * Express 应用配置
 * 使用新的架构：Config → Model → Service → Route
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

// 导入服务
const LibraryService = require('./services/LibraryService');
const ImageService = require('./services/ImageService');
const ScanService = require('./services/ScanService');
const FileService = require('./services/FileService');

/**
 * 创建 Express 应用
 */
function createApp(dependencies) {
  const {
    configManager,
    dbPool,
    scanner,
    scanManager,
    lightweightWatcher,
    io
  } = dependencies;

  const app = express();

  // 中间件
  app.use(cors());
  app.use(express.json());

  // 初始化服务
  const libraryService = new LibraryService(
    configManager,
    dbPool,
    scanManager,
    lightweightWatcher,
    io
  );

  const imageService = new ImageService(
    configManager,
    dbPool
  );

  const scanService = new ScanService(
    configManager,
    dbPool,
    scanner,
    scanManager,
    io
  );

  const fileService = new FileService(dbPool, configManager);

  // 将服务注入到 app 中，供路由使用
  app.set('libraryService', libraryService);
  app.set('imageService', imageService);
  app.set('scanService', scanService);
  app.set('fileService', fileService);

  // API 路由
  const libraryRouter = require('./routes/library');
  const imageRouter = require('./routes/image');
  const scanRouter = require('./routes/scan');
  const fileRouter = require('./routes/file');

  app.use('/api/library', libraryRouter);
  app.use('/api/image', imageRouter);
  app.use('/api/scan', scanRouter);
  app.use('/api/file', fileRouter);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      status: 'ok',
      timestamp: Date.now()
    });
  });

  // 静态文件服务（前端）
  const FRONTEND_DIST = process.env.FRONTEND_DIST;
  if (FRONTEND_DIST) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  }

  // 错误处理中间件（必须放在最后）
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
