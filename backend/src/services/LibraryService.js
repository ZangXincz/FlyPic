/**
 * 素材库服务层
 * 封装素材库相关的业务逻辑
 */

const fs = require('fs');
const path = require('path');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');
const { getFlypicPath, getDatabasePath } = require('../config');

class LibraryService {
  constructor(configManager, dbPool, scanManager, lightweightWatcher, io) {
    this.configManager = configManager;
    this.dbPool = dbPool;
    this.scanManager = scanManager;
    this.lightweightWatcher = lightweightWatcher;
    this.io = io;
  }

  /**
   * 获取所有素材库
   */
  getAllLibraries() {
    const config = this.configManager.load();
    return {
      libraries: config.libraries || [],
      currentLibraryId: config.currentLibraryId,
      theme: config.theme || 'light',
      preferences: config.preferences || {}
    };
  }

  /**
   * 创建新素材库
   */
  async createLibrary(name, libraryPath) {
    // 验证参数
    if (!name || !libraryPath) {
      throw new ValidationError('Name and path are required');
    }

    if (!fs.existsSync(libraryPath)) {
      throw new ValidationError('Path does not exist', 'path');
    }

    // 检查路径是否已存在
    const config = this.configManager.load();
    const existingLib = config.libraries.find(lib => lib.path === libraryPath);
    if (existingLib) {
      throw new ValidationError('Library path already exists', 'path');
    }

    // 创建素材库
    const id = this.configManager.addLibrary(name, libraryPath);

    // 检查是否有现有索引
    const flypicDir = getFlypicPath(libraryPath);
    const dbPath = getDatabasePath(libraryPath);
    const hasExistingIndex = fs.existsSync(flypicDir) && fs.existsSync(dbPath);

    return { 
      id, 
      hasExistingIndex,
      message: hasExistingIndex 
        ? 'Library created with existing index' 
        : 'Library created, please scan to build index'
    };
  }

  /**
   * 更新素材库
   */
  updateLibrary(id, updates) {
    const config = this.configManager.load();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      throw new NotFoundError('Library', id);
    }

    // 验证更新的路径是否存在
    if (updates.path && !fs.existsSync(updates.path)) {
      throw new ValidationError('Path does not exist', 'path');
    }

    const success = this.configManager.updateLibrary(id, updates);
    return { success };
  }

  /**
   * 删除素材库
   */
  async deleteLibrary(id) {
    const config = this.configManager.load();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      throw new NotFoundError('Library', id);
    }

    // 清理资源
    await this._cleanupLibraryResources(id, library.path);

    // 删除配置
    this.configManager.removeLibrary(id);

    return { 
      success: true,
      path: library.path,
      message: 'Library deleted successfully'
    };
  }

  /**
   * 设置当前素材库
   */
  async setCurrentLibrary(id) {
    const config = this.configManager.load();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      throw new NotFoundError('Library', id);
    }

    // 切换前清理旧素材库资源
    if (config.currentLibraryId && config.currentLibraryId !== id) {
      const oldLibrary = config.libraries.find(lib => lib.id === config.currentLibraryId);
      if (oldLibrary) {
        await this._cleanupLibraryResources(config.currentLibraryId, oldLibrary.path, false);
      }
    }

    // 设置新素材库
    this.configManager.setCurrentLibrary(id);

    // 预热数据库连接
    try {
      const db = this.dbPool.acquire(library.path);
      db.db.prepare('SELECT 1').get();
      this.dbPool.release(library.path);
    } catch (e) {
      // 忽略预热错误
    }

    // 启动文件监控
    if (this.lightweightWatcher && this.io) {
      try {
        this.lightweightWatcher.watch(id, library.path, library.name, this.io);
      } catch (e) {
        console.warn('Failed to start file watcher:', e.message);
      }
    }

    return { 
      success: true,
      libraryId: id,
      message: 'Current library set successfully'
    };
  }

  /**
   * 更新偏好设置
   */
  updatePreferences(preferences) {
    this.configManager.updatePreferences(preferences);
    return { success: true };
  }

  /**
   * 更新主题
   */
  updateTheme(theme) {
    if (!['light', 'dark'].includes(theme)) {
      throw new ValidationError('Invalid theme, must be light or dark', 'theme');
    }

    this.configManager.updateTheme(theme);
    return { success: true, theme };
  }

  /**
   * 清理素材库资源
   * @private
   */
  async _cleanupLibraryResources(libraryId, libraryPath, deleteConfig = true) {
    // 停止扫描
    if (this.scanManager) {
      this.scanManager.clearState(libraryId);
    }

    // 停止文件监控
    if (this.lightweightWatcher) {
      this.lightweightWatcher.unwatch(libraryId);
    }

    // 关闭数据库连接
    if (this.dbPool) {
      this.dbPool.close(libraryPath);
    }

    // 等待资源释放
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  /**
   * 获取素材库统计信息
   */
  async getLibraryStats(libraryId) {
    const config = this.configManager.load();
    const library = config.libraries.find(lib => lib.id === libraryId);

    if (!library) {
      throw new NotFoundError('Library', libraryId);
    }

    const db = this.dbPool.acquire(library.path);
    try {
      const imageCount = db.db.prepare('SELECT COUNT(*) as count FROM images').get().count;
      const folderCount = db.db.prepare('SELECT COUNT(*) as count FROM folders').get().count;
      
      const sizeResult = db.db.prepare('SELECT SUM(size) as totalSize FROM images').get();
      const totalSize = sizeResult.totalSize || 0;

      return {
        libraryId,
        imageCount,
        folderCount,
        totalSize,
        path: library.path,
        name: library.name
      };
    } finally {
      this.dbPool.release(library.path);
    }
  }
}

module.exports = LibraryService;
