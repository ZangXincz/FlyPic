/**
 * Memory Optimization Configuration
 * 超激进内存控制配置
 */

module.exports = {
  // 内存监控配置
  memory: {
    // 更激进的阈值（降低到 100MB/200MB）
    warningThreshold: parseInt(process.env.MEMORY_WARNING_MB) || 100, // 100MB 警告
    dangerThreshold: parseInt(process.env.MEMORY_DANGER_MB) || 200,   // 200MB 危险
    checkInterval: parseInt(process.env.MEMORY_CHECK_INTERVAL_MS) || 2000, // 2秒检查
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL_MS) || 3000 // 3秒清理（更频繁）
  },

  // 数据库配置
  database: {
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 1, // 最大1个连接
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 3000, // 3秒空闲关闭（更激进）
    cacheSize: parseInt(process.env.DB_CACHE_SIZE_MB) || 4 // 4MB 缓存（更小）
  },

  // 前端缓存配置
  cache: {
    maxImageCache: parseInt(process.env.MAX_IMAGE_CACHE) || 50, // 50个图片缓存（更小）
    pageSize: parseInt(process.env.PAGE_SIZE) || 100, // 每页100张
    memoryWindow: parseInt(process.env.MEMORY_WINDOW) || 200 // 最多200张在内存
  },

  // 查询优化
  query: {
    // 只返回必要字段，减少数据传输
    essentialFields: [
      'id',
      'path', 
      'filename',
      'size',
      'format',
      'width',
      'height',
      'thumbnail_path',
      'folder'
    ]
  }
};
