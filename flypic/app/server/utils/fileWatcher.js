const { Worker } = require('worker_threads');
const path = require('path');
const { getLibrary } = require('./config');
const { applyChangesFromEvents } = require('./scanner');
const dbPool = require('../database/dbPool');

class FileWatcher {
  constructor() {
    this.workers = new Map(); // libraryId -> Worker
    this.debounceTimers = new Map(); // libraryId -> { timer, forceRebuildFolders }
    this.changeBuffers = new Map(); // libraryId -> { filesAdded, filesChanged, filesRemoved, dirsAdded, dirsRemoved }
    this.ioRef = null; // Socket.IO 引用
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

  // 启动监控（使用 Worker Thread，不阻塞主线程）
  watch(libraryId, io) {
    // 保存 io 引用
    this.ioRef = io;

    // 如果已经在监控，先停止
    if (this.workers.has(libraryId)) {
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
      const errorMsg = `Cannot access library path: ${library.path} - ${error.message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log(`[FileWatcher] Starting worker for: ${library.name} (${library.path})`);

    // 创建 Worker Thread
    const workerPath = path.join(__dirname, 'fileWatcherWorker.js');
    const worker = new Worker(workerPath, {
      workerData: {
        libraryPath: library.path,
        libraryName: library.name
      }
    });

    // 处理 Worker 消息
    worker.on('message', (msg) => {
      this._handleWorkerMessage(libraryId, library, msg);
    });

    worker.on('error', (error) => {
      console.error(`[FileWatcher] Worker error for ${library.name}:`, error);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[FileWatcher] Worker exited with code ${code} for ${library.name}`);
      }
      this.workers.delete(libraryId);
    });

    this.workers.set(libraryId, worker);
  }

  // 处理 Worker 发来的消息
  _handleWorkerMessage(libraryId, library, msg) {
    switch (msg.type) {
      case 'add':
        this._getBuffer(libraryId).filesAdded.add(msg.path);
        this._debouncedSync(libraryId, library);
        break;
      case 'unlink':
        this._getBuffer(libraryId).filesRemoved.add(msg.path);
        this._debouncedSync(libraryId, library);
        break;
      case 'change':
        this._getBuffer(libraryId).filesChanged.add(msg.path);
        this._debouncedSync(libraryId, library);
        break;
      case 'addDir':
        this._getBuffer(libraryId).dirsAdded.add(msg.path);
        this._debouncedSync(libraryId, library, true);
        break;
      case 'unlinkDir':
        this._getBuffer(libraryId).dirsRemoved.add(msg.path);
        this._debouncedSync(libraryId, library, true);
        break;
      case 'ready':
        console.log(`[FileWatcher] Ready for: ${library.name}`);
        break;
      case 'error':
        console.error(`[FileWatcher] Error for ${library.name}:`, msg.message);
        break;
      case 'closed':
        console.log(`[FileWatcher] Closed for: ${library.name}`);
        break;
    }
  }

  // 防抖同步
  _debouncedSync(libraryId, library, forceRebuildFolders = false) {
    const buf = this._getBuffer(libraryId);
    const changeCount = this._bufferCount(buf);

    // 清除之前的定时器
    if (this.debounceTimers.has(libraryId)) {
      const oldTimer = this.debounceTimers.get(libraryId);
      clearTimeout(oldTimer.timer);
      forceRebuildFolders = forceRebuildFolders || oldTimer.forceRebuildFolders;
    }

    // 自适应防抖时间
    let debounceMs = 2000;
    if (changeCount <= 1) debounceMs = 800;
    else if (changeCount <= 5) debounceMs = 1000;
    else if (changeCount <= 20) debounceMs = 1500;
    else if (changeCount <= 100) debounceMs = 2000;
    else debounceMs = 3000;

    const timer = setTimeout(async () => {
      const snapshot = this._getBuffer(libraryId);
      // 清空缓冲区
      this.changeBuffers.set(libraryId, {
        filesAdded: new Set(),
        filesChanged: new Set(),
        filesRemoved: new Set(),
        dirsAdded: new Set(),
        dirsRemoved: new Set()
      });

      const db = dbPool.acquire(library.path);

      try {
        const results = await applyChangesFromEvents(library.path, db, {
          filesAdded: Array.from(snapshot.filesAdded),
          filesChanged: Array.from(snapshot.filesChanged),
          filesRemoved: Array.from(snapshot.filesRemoved),
          dirsAdded: Array.from(snapshot.dirsAdded),
          dirsRemoved: Array.from(snapshot.dirsRemoved)
        });

        if (this.ioRef) {
          this.ioRef.emit('scanComplete', { libraryId, results });
        }
        console.log(`[FileWatcher] Sync complete for ${library.name}:`, results);
      } catch (error) {
        console.error(`[FileWatcher] Sync error for ${library.name}:`, error);
        if (this.ioRef) {
          this.ioRef.emit('scanError', { libraryId, error: error.message });
        }
      } finally {
        dbPool.release(library.path);
      }

      this.debounceTimers.delete(libraryId);
    }, debounceMs);

    this.debounceTimers.set(libraryId, { timer, forceRebuildFolders });
  }

  // 停止监控
  unwatch(libraryId) {
    const worker = this.workers.get(libraryId);
    if (worker) {
      // 发送关闭命令给 Worker
      worker.postMessage({ type: 'close' });
      // 给 Worker 一些时间优雅关闭，然后强制终止
      setTimeout(() => {
        if (this.workers.has(libraryId)) {
          worker.terminate();
          this.workers.delete(libraryId);
        }
      }, 1000);
      console.log(`[FileWatcher] Stopping worker for: ${libraryId}`);
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
    for (const libraryId of this.workers.keys()) {
      this.unwatch(libraryId);
    }
  }

  // 获取监控状态
  isWatching(libraryId) {
    return this.workers.has(libraryId);
  }

  // 获取所有正在监控的库
  getWatchedLibraries() {
    return Array.from(this.workers.keys());
  }
}

// 单例模式
const fileWatcher = new FileWatcher();

module.exports = fileWatcher;
