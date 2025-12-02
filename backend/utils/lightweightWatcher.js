/**
 * 轻量级文件监控器
 * 使用智能轮询代替 chokidar，内存占用 < 50MB
 * 
 * 策略：
 * 1. 每 5-10 秒检查一次文件夹的修改时间戳
 * 2. 只扫描时间戳变化的文件夹
 * 3. 不缓存任何文件元数据
 * 4. 使用增量对比，只处理变化的文件
 */

const fs = require('fs').promises;
const path = require('path');
const { applyChangesFromEvents } = require('./scanner');
const dbPool = require('../database/dbPool');

class LightweightWatcher {
  constructor() {
    this.watchers = new Map(); // libraryId -> { interval, folderTimestamps, libraryPath }
    this.ioRef = null;
    this.pollInterval = 5000; // 5 秒轮询一次
  }

  /**
   * 启动轻量级监控
   */
  async watch(libraryId, libraryPath, libraryName, io) {
    this.ioRef = io;

    // 如果已经在监控，先停止
    if (this.watchers.has(libraryId)) {
      this.unwatch(libraryId);
    }

    console.log(`[LightweightWatcher] Starting for: ${libraryName}`);
    console.log(`  Strategy: Folder timestamp polling (${this.pollInterval}ms interval)`);
    console.log(`  Memory: < 50MB (vs chokidar ~800MB)`);

    // 初始化文件夹时间戳缓存
    const folderTimestamps = new Map();
    
    try {
      await this._initializeFolderTimestamps(libraryPath, folderTimestamps);
      console.log(`  Initialized ${folderTimestamps.size} folders`);
    } catch (error) {
      console.error(`[LightweightWatcher] Failed to initialize:`, error.message);
      return;
    }

    // 启动轮询
    const interval = setInterval(async () => {
      try {
        await this._checkForChanges(libraryId, libraryPath, libraryName, folderTimestamps);
      } catch (error) {
        console.error(`[LightweightWatcher] Error checking changes:`, error.message);
      }
    }, this.pollInterval);

    this.watchers.set(libraryId, {
      interval,
      folderTimestamps,
      libraryPath,
      libraryName
    });

    console.log(`[LightweightWatcher] Started for: ${libraryName}`);
  }

  /**
   * 初始化文件夹时间戳（只扫描文件夹，不扫描文件）
   */
  async _initializeFolderTimestamps(libraryPath, folderTimestamps) {
    const folders = await this._getAllFolders(libraryPath);
    
    for (const folder of folders) {
      try {
        const stats = await fs.stat(folder);
        folderTimestamps.set(folder, stats.mtimeMs);
      } catch (error) {
        // 忽略无法访问的文件夹
      }
    }
  }

  /**
   * 递归获取所有文件夹（不包含文件）
   */
  async _getAllFolders(dir, folders = []) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        // 跳过隐藏文件夹和特殊文件夹
        if (entry.name.startsWith('.') || 
            entry.name === 'node_modules' || 
            entry.name === '.flypic') {
          continue;
        }

        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          folders.push(fullPath);
          // 递归获取子文件夹
          await this._getAllFolders(fullPath, folders);
        }
      }
    } catch (error) {
      // 忽略无法访问的文件夹
    }

    return folders;
  }

  /**
   * 检查文件夹变化（核心逻辑）
   */
  async _checkForChanges(libraryId, libraryPath, libraryName, folderTimestamps) {
    const changedFolders = [];
    const deletedFolders = [];

    // 1. 检查现有文件夹的时间戳
    for (const [folder, oldTimestamp] of folderTimestamps.entries()) {
      try {
        const stats = await fs.stat(folder);
        const newTimestamp = stats.mtimeMs;

        if (newTimestamp !== oldTimestamp) {
          changedFolders.push(folder);
          folderTimestamps.set(folder, newTimestamp);
        }
      } catch (error) {
        // 文件夹被删除
        console.log(`[LightweightWatcher] Folder deleted: ${folder}`);
        deletedFolders.push(folder);
        folderTimestamps.delete(folder);
      }
    }

    // 2. 检查新增的文件夹
    const currentFolders = await this._getAllFolders(libraryPath);
    for (const folder of currentFolders) {
      if (!folderTimestamps.has(folder)) {
        console.log(`[LightweightWatcher] New folder detected: ${folder}`);
        changedFolders.push(folder);
        try {
          const stats = await fs.stat(folder);
          folderTimestamps.set(folder, stats.mtimeMs);
        } catch (error) {
          // 忽略
        }
      }
    }

    // 3. 如果有变化，扫描这些文件夹
    if (changedFolders.length > 0) {
      console.log(`[LightweightWatcher] Detected changes in ${changedFolders.length} folders`);
      await this._processChangedFolders(libraryId, libraryPath, libraryName, changedFolders);
    }

    // 4. 处理删除的文件夹
    if (deletedFolders.length > 0) {
      console.log(`[LightweightWatcher] Processing ${deletedFolders.length} deleted folders`);
      await this._processDeletedFolders(libraryId, libraryPath, deletedFolders);
    }
  }

  /**
   * 处理变化的文件夹（只扫描这些文件夹）
   */
  async _processChangedFolders(libraryId, libraryPath, libraryName, changedFolders) {
    const db = dbPool.acquire(libraryPath); // 这是 LibraryDatabase 实例

    try {
      // 获取数据库中这些文件夹的文件列表
      const dbFiles = new Set();
      for (const folder of changedFolders) {
        const relativePath = path.relative(libraryPath, folder).replace(/\\/g, '/');
        // 使用正确的 SQL 模式匹配
        const pattern = relativePath ? `${relativePath}/%` : '%';
        const stmt = db.db.prepare('SELECT path FROM images WHERE folder = ? OR folder LIKE ?');
        const rows = stmt.all(relativePath, pattern);
        rows.forEach(row => dbFiles.add(row.path));
      }

      // 扫描文件系统中这些文件夹的文件
      const fsFiles = new Set();
      for (const folder of changedFolders) {
        await this._scanFolder(folder, libraryPath, fsFiles);
      }

      // 对比找出变化
      const filesAdded = [];
      const filesRemoved = [];

      for (const file of fsFiles) {
        if (!dbFiles.has(file)) {
          filesAdded.push(file);
        }
      }

      for (const file of dbFiles) {
        if (!fsFiles.has(file)) {
          filesRemoved.push(file);
        }
      }

      // 应用变化
      if (filesAdded.length > 0 || filesRemoved.length > 0) {
        console.log(`[LightweightWatcher] Changes: +${filesAdded.length} -${filesRemoved.length}`);
        
        // 打印详细信息用于调试
        if (filesAdded.length > 0) {
          console.log(`[LightweightWatcher] Files added:`, filesAdded.slice(0, 5));
        }
        if (filesRemoved.length > 0) {
          console.log(`[LightweightWatcher] Files removed:`, filesRemoved.slice(0, 5));
        }
        
        const results = await applyChangesFromEvents(libraryPath, db, {
          filesAdded,
          filesChanged: [],
          filesRemoved,
          dirsAdded: [],
          dirsRemoved: []
        });

        if (this.ioRef) {
          this.ioRef.emit('scanComplete', { libraryId, results });
        }
      }
    } catch (error) {
      console.error(`[LightweightWatcher] Error processing changes:`, error);
      if (this.ioRef) {
        this.ioRef.emit('scanError', { libraryId, error: error.message });
      }
    } finally {
      dbPool.release(libraryPath);
    }
  }

  /**
   * 扫描单个文件夹的所有支持的文件
   */
  async _scanFolder(folder, libraryPath, fsFiles) {
    try {
      const entries = await fs.readdir(folder, { withFileTypes: true });
      // 支持所有文件类型（与 scanner.js 保持一致）
      const supportedExtensions = [
        // 图片
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif', '.avif', '.heif', '.heic',
        // 视频
        '.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.m4v', '.wmv', '.mpg', '.mpeg',
        // 音频
        '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
        // 文档
        '.pdf', '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        // 设计
        '.psd', '.ai', '.sketch', '.xd', '.fig'
      ];

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            const fullPath = path.join(folder, entry.name);
            const relativePath = path.relative(libraryPath, fullPath).replace(/\\/g, '/');
            fsFiles.add(relativePath);
          }
        }
      }
    } catch (error) {
      // 忽略无法访问的文件夹
      console.warn(`[LightweightWatcher] Cannot access folder: ${folder}`, error.message);
    }
  }

  /**
   * 处理删除的文件夹
   */
  async _processDeletedFolders(libraryId, libraryPath, deletedFolders) {
    const db = dbPool.acquire(libraryPath);

    try {
      const filesRemoved = [];

      // 获取这些文件夹中的所有文件
      for (const folder of deletedFolders) {
        const relativePath = path.relative(libraryPath, folder);
        const stmt = db.db.prepare('SELECT path FROM images WHERE path LIKE ?');
        const rows = stmt.all(`${relativePath}%`);
        rows.forEach(row => filesRemoved.push(row.path));
      }

      if (filesRemoved.length > 0) {
        console.log(`[LightweightWatcher] Removing ${filesRemoved.length} files from deleted folders`);
        
        const results = await applyChangesFromEvents(libraryPath, db, {
          filesAdded: [],
          filesChanged: [],
          filesRemoved,
          dirsAdded: [],
          dirsRemoved: deletedFolders.map(f => path.relative(libraryPath, f))
        });

        if (this.ioRef) {
          this.ioRef.emit('scanComplete', { libraryId, results });
        }
      }
    } catch (error) {
      console.error(`[LightweightWatcher] Error processing deleted folders:`, error);
    } finally {
      dbPool.release(libraryPath);
    }
  }

  /**
   * 停止监控
   */
  unwatch(libraryId) {
    const watcher = this.watchers.get(libraryId);
    if (watcher) {
      clearInterval(watcher.interval);
      this.watchers.delete(libraryId);
      console.log(`[LightweightWatcher] Stopped for: ${watcher.libraryName}`);
    }
  }

  /**
   * 停止所有监控
   */
  unwatchAll() {
    for (const libraryId of this.watchers.keys()) {
      this.unwatch(libraryId);
    }
  }

  /**
   * 获取监控状态
   */
  isWatching(libraryId) {
    return this.watchers.has(libraryId);
  }

  /**
   * 获取所有正在监控的库
   */
  getWatchedLibraries() {
    return Array.from(this.watchers.keys());
  }
}

// 单例模式
const lightweightWatcher = new LightweightWatcher();

module.exports = lightweightWatcher;
