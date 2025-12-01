const chokidar = require('chokidar');
const path = require('path');
const { getLibrary } = require('./config');
const { syncLibrary, applyChangesFromEvents } = require('./scanner');
const dbPool = require('../database/dbPool');

class FileWatcher {
  constructor() {
    this.watchers = new Map(); // libraryId -> watcher
    this.debounceTimers = new Map(); // libraryId -> { timer, forceRebuildFolders }
    this.changeBuffers = new Map(); // libraryId -> { filesAdded, filesChanged, filesRemoved, dirsAdded, dirsRemoved }
  }

  // 获取或创建变更缓冲区
  _getBuffer(libraryId) {
    if (!this.changeBuffers.has(libraryId)) {
      this.changeBuffers.set(libraryId, {
        filesAdded: new Set(),
        filesChanged: new Set(),
        filesRemoved: new Set(),
        dirsAdded: new Set(),
        dirsRemoved: new Set()
      });
    }
    return this.changeBuffers.get(libraryId);
  }

  // 缓冲区事件数量
  _bufferCount(buf) {
    return (
      buf.filesAdded.size +
      buf.filesChanged.size +
      buf.filesRemoved.size +
      buf.dirsAdded.size +
      buf.dirsRemoved.size
    );
  }

  // 启动监控
  watch(libraryId, io) {
    // 如果已经在监控，先停止
    if (this.watchers.has(libraryId)) {
      this.unwatch(libraryId);
    }

    const library = getLibrary(libraryId);
    if (!library) {
      console.error(`Library ${libraryId} not found`);
      return;
    }

    // 检查路径是否存在和可访问
    const fs = require('fs');
    try {
      fs.accessSync(library.path, fs.constants.R_OK);
    } catch (error) {
      console.error(`Cannot access library path: ${library.path}`, error.message);
      console.error('提示：在飞牛 fnOS 上，请确保在应用设置中授予了文件夹访问权限');
      return;
    }

    console.log(`Starting file watcher for library: ${library.name} (${library.path})`);

    // 支持的图片格式
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
    const pattern = `**/*.{${imageExtensions.join(',')}}`;

    // 创建监控器（监控文件和文件夹）
    const watcher = chokidar.watch([pattern, '**/'], {
      cwd: library.path,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.flypic/**', // 忽略自己的缓存目录
        '**/.*' // 忽略隐藏文件
      ],
      persistent: true,
      ignoreInitial: true, // 忽略初始扫描
      awaitWriteFinish: {
        stabilityThreshold: 1200, // 文件稳定 1.2 秒后触发，提升响应
        pollInterval: 100
      }
    });

    // 防抖处理：多个文件变化合并为一次同步（自适应时长）
    const debouncedSync = (forceRebuildFolders = false) => {
      const buf = this._getBuffer(libraryId);
      const changeCount = this._bufferCount(buf);

      // 清除之前的定时器
      if (this.debounceTimers.has(libraryId)) {
        const oldTimer = this.debounceTimers.get(libraryId);
        clearTimeout(oldTimer.timer);
        // 聚合 forceRebuildFolders 标记
        forceRebuildFolders = forceRebuildFolders || oldTimer.forceRebuildFolders;
      }

      // 自适应防抖时间：少量变化更快响应
      let debounceMs = 5000;
      if (changeCount <= 1) debounceMs = 1200;
      else if (changeCount <= 10) debounceMs = 2000;
      else if (changeCount <= 50) debounceMs = 3500;
      else if (changeCount <= 200) debounceMs = 5000;
      else debounceMs = 8000; // 超大批量进一步聚合

      const timer = setTimeout(async () => {
        const snapshot = this._getBuffer(libraryId);
        // 清空缓冲区（开始新一轮累计）
        this.changeBuffers.set(libraryId, {
          filesAdded: new Set(),
          filesChanged: new Set(),
          filesRemoved: new Set(),
          dirsAdded: new Set(),
          dirsRemoved: new Set()
        });

        // 从连接池获取数据库连接
        const db = dbPool.acquire(library.path);
        
        try {
          const total = this._bufferCount(snapshot);
          let results;

          if (forceRebuildFolders || total > 200) {
            // 大量变化或目录级变化：走增量全量路径（更稳）
            results = await syncLibrary(library.path, db, true);
          } else {
            // 小批量变化：基于事件的快速同步
            results = await applyChangesFromEvents(library.path, db, {
              filesAdded: Array.from(snapshot.filesAdded),
              filesChanged: Array.from(snapshot.filesChanged),
              filesRemoved: Array.from(snapshot.filesRemoved),
              dirsAdded: Array.from(snapshot.dirsAdded),
              dirsRemoved: Array.from(snapshot.dirsRemoved)
            });
          }

          // 通过 Socket.IO 通知前端
          io.emit('scanComplete', { libraryId, results });
          console.log(`Sync complete for ${library.name}:`, results);
        } catch (error) {
          console.error(`Sync error for ${library.name}:`, error);
          io.emit('scanError', { libraryId, error: error.message });
        } finally {
          // 释放数据库连接（不关闭，复用）
          dbPool.release(library.path);
        }

        this.debounceTimers.delete(libraryId);
      }, debounceMs);

      this.debounceTimers.set(libraryId, { timer, forceRebuildFolders });
    };

    // 监听文件和文件夹变化（写入缓冲，统一合并处理）
    watcher
      .on('add', (filePath) => {
        this._getBuffer(libraryId).filesAdded.add(filePath);
        debouncedSync();
      })
      .on('unlink', (filePath) => {
        this._getBuffer(libraryId).filesRemoved.add(filePath);
        debouncedSync();
      })
      .on('change', (filePath) => {
        this._getBuffer(libraryId).filesChanged.add(filePath);
        debouncedSync();
      })
      .on('addDir', (dirPath) => {
        this._getBuffer(libraryId).dirsAdded.add(dirPath);
        debouncedSync(true); // 强制重建文件夹结构
      })
      .on('unlinkDir', (dirPath) => {
        this._getBuffer(libraryId).dirsRemoved.add(dirPath);
        debouncedSync(true); // 强制重建文件夹结构
      })
      .on('error', (error) => {
        console.error(`Watcher error for ${library.name}:`, error);
      })
      .on('ready', () => {
        console.log(`File watcher ready for: ${library.name}`);
      });

    this.watchers.set(libraryId, watcher);
  }

  // 停止监控
  unwatch(libraryId) {
    const watcher = this.watchers.get(libraryId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(libraryId);
      console.log(`Stopped file watcher for library: ${libraryId}`);
    }

    // 清除防抖定时器
    if (this.debounceTimers.has(libraryId)) {
      const timerObj = this.debounceTimers.get(libraryId);
      clearTimeout(timerObj.timer);
      this.debounceTimers.delete(libraryId);
    }

    // 清空缓冲区
    if (this.changeBuffers.has(libraryId)) {
      this.changeBuffers.delete(libraryId);
    }
  }

  // 停止所有监控
  unwatchAll() {
    for (const libraryId of this.watchers.keys()) {
      this.unwatch(libraryId);
    }
  }

  // 获取监控状态
  isWatching(libraryId) {
    return this.watchers.has(libraryId);
  }

  // 获取所有正在监控的库
  getWatchedLibraries() {
    return Array.from(this.watchers.keys());
  }
}

// 单例模式
const fileWatcher = new FileWatcher();

module.exports = fileWatcher;
