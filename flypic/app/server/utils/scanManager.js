/**
 * 扫描状态管理器
 * 支持扫描的停止、继续和持久化
 */

const fs = require('fs');
const path = require('path');

class ScanManager {
  constructor() {
    // 每个素材库的扫描状态（内存）
    this.scanStates = new Map();
    // 素材库路径映射（用于持久化）
    this.libraryPaths = new Map();
  }

  /**
   * 注册素材库路径（用于持久化）
   */
  registerLibraryPath(libraryId, libraryPath) {
    this.libraryPaths.set(libraryId, libraryPath);
  }

  /**
   * 获取状态文件路径
   */
  getStateFilePath(libraryId) {
    const libraryPath = this.libraryPaths.get(libraryId);
    if (!libraryPath) return null;
    return path.join(libraryPath, '.flypic', 'scan-state.json');
  }

  /**
   * 保存状态到文件（轻量：只保存关键信息）
   */
  saveState(libraryId) {
    const stateFile = this.getStateFilePath(libraryId);
    if (!stateFile) return;
    
    const state = this.scanStates.get(libraryId);
    if (!state || state.status === 'idle') {
      // 删除状态文件
      try {
        if (fs.existsSync(stateFile)) {
          fs.unlinkSync(stateFile);
        }
      } catch (e) { /* ignore */ }
      return;
    }
    
    try {
      const saveData = {
        status: state.status,
        progress: state.progress,
        pendingCount: state.pendingFiles?.length || 0,
        // 只保存文件相对路径，不保存完整路径列表（太大）
        savedAt: Date.now()
      };
      fs.writeFileSync(stateFile, JSON.stringify(saveData, null, 2));
    } catch (e) {
      console.error('Failed to save scan state:', e.message);
    }
  }

  /**
   * 从文件加载状态
   */
  loadState(libraryId) {
    const stateFile = this.getStateFilePath(libraryId);
    if (!stateFile || !fs.existsSync(stateFile)) return null;
    
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      // 状态超过 24 小时视为过期
      if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(stateFile);
        return null;
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取扫描状态（优先内存，其次文件）
   */
  getState(libraryId) {
    // 先检查内存中的状态
    const memState = this.scanStates.get(libraryId);
    if (memState) return memState;
    
    // 尝试从文件加载（应用重启后的恢复）
    const fileState = this.loadState(libraryId);
    if (fileState && fileState.status === 'paused') {
      // 重建内存状态（不含 pendingFiles，需要重新扫描确定）
      const restored = {
        status: 'paused',
        progress: fileState.progress,
        pendingFiles: [],  // 无法恢复完整列表，需要继续扫描时重新计算
        processedCount: fileState.progress?.current || 0,
        abortController: { aborted: true },
        needsRescan: true  // 标记需要重新扫描
      };
      this.scanStates.set(libraryId, restored);
      return restored;
    }
    
    return { 
      status: 'idle', 
      progress: null, 
      pendingFiles: [],
      processedCount: 0
    };
  }

  /**
   * 开始扫描
   */
  startScan(libraryId, totalFiles) {
    this.scanStates.set(libraryId, {
      status: 'scanning',
      progress: { current: 0, total: totalFiles, percent: 0 },
      pendingFiles: [],
      processedCount: 0,
      abortController: { aborted: false }
    });
    return this.scanStates.get(libraryId);
  }

  /**
   * 更新进度
   */
  updateProgress(libraryId, current, total) {
    const state = this.scanStates.get(libraryId);
    if (state) {
      state.progress = {
        current,
        total,
        percent: Math.round((current / total) * 100)
      };
      state.processedCount = current;
    }
  }

  /**
   * 停止扫描
   */
  stopScan(libraryId, pendingFiles = []) {
    const state = this.scanStates.get(libraryId);
    if (state) {
      state.status = 'paused';
      state.pendingFiles = pendingFiles;
      state.abortController.aborted = true;
      // 持久化状态
      this.saveState(libraryId);
      console.log(`⏸️ Scan paused for ${libraryId}, ${pendingFiles.length} files pending`);
    }
  }

  /**
   * 检查是否应该停止
   */
  shouldStop(libraryId) {
    const state = this.scanStates.get(libraryId);
    return state?.abortController?.aborted || false;
  }

  /**
   * 获取待处理文件
   */
  getPendingFiles(libraryId) {
    const state = this.scanStates.get(libraryId);
    return state?.pendingFiles || [];
  }

  /**
   * 恢复扫描
   */
  resumeScan(libraryId) {
    const state = this.scanStates.get(libraryId);
    if (state && state.status === 'paused') {
      const pendingFiles = [...state.pendingFiles];  // 复制一份
      state.status = 'scanning';
      state.abortController = { aborted: false };
      state.pendingFiles = [];  // 清空待处理列表
      console.log(`▶️ Scan resumed for ${libraryId}, ${pendingFiles.length} files to process`);
      return pendingFiles;
    }
    return [];
  }

  /**
   * 完成扫描
   */
  completeScan(libraryId) {
    const state = this.scanStates.get(libraryId);
    if (state) {
      state.status = 'idle';
      state.pendingFiles = [];
      state.progress = null;
    }
    // 清除持久化状态
    this.saveState(libraryId);
  }

  /**
   * 是否正在扫描
   */
  isScanning(libraryId) {
    const state = this.scanStates.get(libraryId);
    return state?.status === 'scanning';
  }

  /**
   * 是否已暂停
   */
  isPaused(libraryId) {
    const state = this.scanStates.get(libraryId);
    return state?.status === 'paused';
  }

  /**
   * 清除素材库状态（删除素材库时调用）
   */
  clearState(libraryId) {
    this.scanStates.delete(libraryId);
  }

  /**
   * 清除所有空闲状态（内存清理）
   */
  cleanupIdleStates() {
    for (const [libraryId, state] of this.scanStates.entries()) {
      if (state.status === 'idle') {
        this.scanStates.delete(libraryId);
      }
    }
  }
}

// 单例
const scanManager = new ScanManager();

module.exports = scanManager;
