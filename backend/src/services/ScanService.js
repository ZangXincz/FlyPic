/**
 * 扫描服务层
 * 封装扫描相关的业务逻辑
 */

const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

class ScanService {
  constructor(configManager, dbPool, scanner, scanManager, io) {
    this.configManager = configManager;
    this.dbPool = dbPool;
    this.scanner = scanner;
    this.scanManager = scanManager;
    this.io = io;
  }

  /**
   * 全量扫描
   */
  async fullScan(libraryId, wait = false) {
    const library = this._getLibrary(libraryId);
    const db = this.dbPool.acquire(library.path);

    try {
      // 检查是否已在扫描
      if (this.scanManager.isScanning(libraryId)) {
        throw new ValidationError('Scan already in progress', 'libraryId');
      }

      // 开始扫描
      if (wait) {
        // 同步模式：等待扫描完成
        await this.scanner.scanLibrary(
          library.path,
          db,
          (progress) => this._emitProgress(libraryId, progress)
        );

        return {
          success: true,
          message: 'Scan completed',
          libraryId
        };
      } else {
        // 异步模式：后台扫描
        this._startAsyncScan(libraryId, library.path, db);

        return {
          success: true,
          message: 'Scan started',
          libraryId,
          async: true
        };
      }
    } catch (error) {
      this.dbPool.release(library.path);
      throw error;
    }
  }

  /**
   * 增量同步
   */
  async incrementalSync(libraryId, wait = false) {
    const library = this._getLibrary(libraryId);
    const db = this.dbPool.acquire(library.path);

    try {
      // 检查是否已在扫描
      if (this.scanManager.isScanning(libraryId)) {
        throw new ValidationError('Scan already in progress', 'libraryId');
      }

      // 开始增量同步
      if (wait) {
        // 同步模式
        await this.scanner.incrementalSync(
          library.path,
          db,
          (progress) => this._emitProgress(libraryId, progress)
        );

        return {
          success: true,
          message: 'Sync completed',
          libraryId
        };
      } else {
        // 异步模式
        this._startAsyncSync(libraryId, library.path, db);

        return {
          success: true,
          message: 'Sync started',
          libraryId,
          async: true
        };
      }
    } catch (error) {
      this.dbPool.release(library.path);
      throw error;
    }
  }

  /**
   * 停止扫描
   */
  stopScan(libraryId) {
    const library = this._getLibrary(libraryId);

    if (!this.scanManager.isScanning(libraryId)) {
      throw new ValidationError('No scan in progress', 'libraryId');
    }

    this.scanManager.pauseScan(libraryId);

    return {
      success: true,
      message: 'Scan stopped',
      libraryId
    };
  }

  /**
   * 继续扫描
   */
  resumeScan(libraryId) {
    const library = this._getLibrary(libraryId);

    if (!this.scanManager.isPaused(libraryId)) {
      throw new ValidationError('No paused scan found', 'libraryId');
    }

    this.scanManager.resumeScan(libraryId);

    return {
      success: true,
      message: 'Scan resumed',
      libraryId
    };
  }

  /**
   * 获取扫描状态
   */
  getScanStatus(libraryId) {
    const library = this._getLibrary(libraryId);
    const state = this.scanManager.getState(libraryId);

    return {
      libraryId,
      isScanning: this.scanManager.isScanning(libraryId),
      isPaused: this.scanManager.isPaused(libraryId),
      progress: state?.progress || null,
      startTime: state?.startTime || null
    };
  }

  /**
   * 修复文件夹路径
   */
  async fixFolders(libraryId) {
    const library = this._getLibrary(libraryId);
    const db = this.dbPool.acquire(library.path);

    try {
      await this.scanner.fixFolderPaths(library.path, db);

      return {
        success: true,
        message: 'Folders fixed',
        libraryId
      };
    } finally {
      this.dbPool.release(library.path);
    }
  }

  /**
   * 启动异步扫描
   * @private
   */
  _startAsyncScan(libraryId, libraryPath, db) {
    this.scanner.scanLibrary(
      libraryPath,
      db,
      (progress) => this._emitProgress(libraryId, progress)
    ).then(() => {
      this._emitComplete(libraryId);
      this.dbPool.release(libraryPath);
    }).catch((error) => {
      this._emitError(libraryId, error);
      this.dbPool.release(libraryPath);
    });
  }

  /**
   * 启动异步同步
   * @private
   */
  _startAsyncSync(libraryId, libraryPath, db) {
    this.scanner.incrementalSync(
      libraryPath,
      db,
      (progress) => this._emitProgress(libraryId, progress)
    ).then(() => {
      this._emitComplete(libraryId);
      this.dbPool.release(libraryPath);
    }).catch((error) => {
      this._emitError(libraryId, error);
      this.dbPool.release(libraryPath);
    });
  }

  /**
   * 发送进度更新
   * @private
   */
  _emitProgress(libraryId, progress) {
    if (this.io) {
      this.io.emit('scanProgress', {
        libraryId,
        ...progress
      });
    }
  }

  /**
   * 发送完成事件
   * @private
   */
  _emitComplete(libraryId) {
    if (this.io) {
      this.io.emit('scanComplete', { libraryId });
    }
  }

  /**
   * 发送错误事件
   * @private
   */
  _emitError(libraryId, error) {
    if (this.io) {
      this.io.emit('scanError', {
        libraryId,
        error: error.message
      });
    }
  }

  /**
   * 获取素材库对象
   * @private
   */
  _getLibrary(libraryId) {
    const config = this.configManager.load();
    const library = config.libraries.find(lib => lib.id === libraryId);

    if (!library) {
      throw new NotFoundError('Library', libraryId);
    }

    return library;
  }
}

module.exports = ScanService;
