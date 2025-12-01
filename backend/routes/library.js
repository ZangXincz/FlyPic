const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  addLibrary,
  removeLibrary,
  updateLibrary,
  setCurrentLibrary,
  updatePreferences,
  updateTheme
} = require('../utils/config');

// Get all libraries and config
router.get('/', (req, res) => {
  try {
    const config = loadConfig();
    res.json({
      libraries: config.libraries,
      currentLibraryId: config.currentLibraryId,
      theme: config.theme,
      preferences: config.preferences
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new library
router.post('/', (req, res) => {
  try {
    const { name, path } = req.body;

    if (!name || !path) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    if (!fs.existsSync(path)) {
      return res.status(400).json({ error: 'Path does not exist' });
    }

    const id = addLibrary(name, path);

    // Check if .flypic directory exists
    const flypicDir = require('path').join(path, '.flypic');
    const hasExistingIndex = fs.existsSync(flypicDir);

    res.json({
      id,
      message: 'Library added successfully',
      hasExistingIndex
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update preferences (must be before /:id route)
router.put('/preferences', (req, res) => {
  try {
    const preferences = updatePreferences(req.body);
    res.json({ preferences });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update theme (must be before /:id route)
router.put('/theme', (req, res) => {
  try {
    const { theme } = req.body;
    updateTheme(theme);
    res.json({ theme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update library
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = updateLibrary(id, updates);
    if (success) {
      res.json({ message: 'Library updated successfully' });
    } else {
      res.status(404).json({ error: 'Library not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete library
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取素材库信息
    const config = loadConfig();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const dbPool = require('../database/dbPool');
    const fileWatcher = require('../utils/fileWatcher');
    const scanManager = require('../utils/scanManager');

    console.log(`[Delete] Cleaning up library: ${library.name}`);

    // 1. 停止扫描并清理状态
    scanManager.clearState(id);

    // 2. 停止文件监控
    fileWatcher.unwatch(id);

    // 3. 关闭数据库连接
    dbPool.close(library.path);

    // 等待一下，确保连接完全关闭
    await new Promise(resolve => setTimeout(resolve, 300));

    // 删除索引
    removeLibrary(id);

    console.log(`✅ Library removed: ${library.name}`);

    res.json({
      message: 'Library removed successfully',
      path: library.path
    });
  } catch (error) {
    console.error('Error in delete library:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set current library
router.post('/:id/set-current', async (req, res) => {
  try {
    const { id } = req.params;
    const config = loadConfig();
    const dbPool = require('../database/dbPool');
    const fileWatcher = require('../utils/fileWatcher');
    const scanManager = require('../utils/scanManager');

    // 获取旧的当前素材库
    const oldLibraryId = config.currentLibraryId;
    if (oldLibraryId && oldLibraryId !== id) {
      const oldLibrary = config.libraries.find(lib => lib.id === oldLibraryId);
      if (oldLibrary) {
        console.log(`[Switch] Cleaning up old library: ${oldLibrary.name}`);

        // 1. 停止扫描（如果正在进行），但保留暂停状态以便恢复
        if (scanManager.isScanning(oldLibraryId)) {
          const state = scanManager.getState(oldLibraryId);
          if (state.abortController) {
            state.abortController.aborted = true;
          }
          // 不调用 completeScan，让扫描自己暂停并保留待处理文件
          console.log(`  ⏸️ Pausing scan (will preserve state)`);
        }

        // 3. 关闭数据库连接
        dbPool.close(oldLibrary.path);
        console.log(`  ⏹️ Closed database`);
      }
    }

    // 设置新的当前素材库
    setCurrentLibrary(id);

    const newLibrary = config.libraries.find(lib => lib.id === id);
    console.log(`[Switch] Switched to library: ${newLibrary?.name}`);

    res.json({ message: 'Current library set successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Close database connection for a library
router.post('/:id/close-db', (req, res) => {
  try {
    const { id } = req.params;
    const config = loadConfig();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const dbPool = require('../database/dbPool');
    dbPool.close(library.path);

    res.json({ message: 'Database connection closed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Release all resources for a library (database + file watcher)
router.post('/:id/release', (req, res) => {
  try {
    const { id } = req.params;
    const config = loadConfig();
    const library = config.libraries.find(lib => lib.id === id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    console.log(`[Release] Releasing resources for library: ${library.name}`);

    // 1. 关闭数据库连接
    const dbPool = require('../database/dbPool');
    dbPool.close(library.path);
    console.log(`[Release] Database connection closed`);

    // 2. 停止文件监控
    const fileWatcher = req.app.get('fileWatcher');
    if (fileWatcher && fileWatcher.isWatching(id)) {
      fileWatcher.unwatch(id);
      console.log(`[Release] File watcher stopped`);
    }

    res.json({
      message: 'All resources released successfully',
      library: library.name
    });
  } catch (error) {
    console.error('[Release] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
