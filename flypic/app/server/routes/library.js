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
    
    // 关闭该素材库的数据库连接，释放文件锁
    const dbPool = require('../database/dbPool');
    console.log(`[Delete] Closing database connection for: ${library.path}`);
    dbPool.close(library.path);
    
    // 等待一下，确保连接完全关闭
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 删除索引
    removeLibrary(id);
    
    console.log(`✅ Library removed and database connection released: ${library.name}`);
    
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
router.post('/:id/set-current', (req, res) => {
  try {
    const { id } = req.params;
    const config = loadConfig();
    const dbPool = require('../database/dbPool');
    
    // 获取旧的当前素材库
    const oldLibraryId = config.currentLibraryId;
    if (oldLibraryId && oldLibraryId !== id) {
      const oldLibrary = config.libraries.find(lib => lib.id === oldLibraryId);
      if (oldLibrary) {
        // 关闭旧素材库的数据库连接
        console.log(`[Switch] Closing old library connection: ${oldLibrary.name}`);
        dbPool.close(oldLibrary.path);
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

module.exports = router;
