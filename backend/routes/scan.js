const express = require('express');
const router = express.Router();
const LibraryDatabase = require('../database/db');
const { getLibrary, updateLibrary } = require('../utils/config');
const { scanLibrary, syncLibrary } = require('../utils/scanner');
const scanManager = require('../utils/scanManager');

// Start full scan
router.post('/full', async (req, res) => {
  try {
    const { libraryId, wait } = req.body;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const io = req.app.get('io');
    const dbPool = require('../database/dbPool');
    const db = dbPool.acquire(library.path);
    
    // 如果需要等待扫描完成
    if (wait) {
      try {
        const results = await scanLibrary(library.path, db, (progress) => {
          io.emit('scanProgress', {
            libraryId,
            ...progress
          });
        });
        
        dbPool.release(library.path);
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
        
        res.json({ message: 'Scan completed', results });
      } catch (error) {
        dbPool.release(library.path);
        io.emit('scanError', { libraryId, error: error.message });
        throw error;
      }
    } else {
      // Start scan in background
      console.log(`🔍 Starting background scan for library: ${libraryId}`);
      res.json({ message: 'Scan started' });
      
      scanLibrary(library.path, db, (progress) => {
        console.log(`📊 Progress: ${progress.current}/${progress.total} (${progress.percent}%)`);
        io.emit('scanProgress', {
          libraryId,
          ...progress
        });
      }, libraryId).then(results => {
        console.log(`✅ Scan complete for library: ${libraryId}`, results);
        dbPool.release(library.path);
        if (!results.stopped) {
          updateLibrary(libraryId, { lastScan: Date.now() });
          io.emit('scanComplete', { libraryId, results });
        } else {
          io.emit('scanPaused', { libraryId, results });
        }
      }).catch(error => {
        console.error(`❌ Scan error for library: ${libraryId}`, error);
        dbPool.release(library.path);
        io.emit('scanError', { libraryId, error: error.message });
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start incremental sync
router.post('/sync', async (req, res) => {
  try {
    const { libraryId, wait } = req.body;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const io = req.app.get('io');
    const dbPool = require('../database/dbPool');
    const db = dbPool.acquire(library.path);
    
    // 如果需要等待同步完成
    if (wait) {
      try {
        const results = await syncLibrary(library.path, db);
        
        dbPool.release(library.path);
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
        
        res.json({ message: 'Sync completed', results });
      } catch (error) {
        dbPool.release(library.path);
        io.emit('scanError', { libraryId, error: error.message });
        throw error;
      }
    } else {
      // Start sync in background
      console.log(`🔄 Starting background sync for library: ${libraryId}`);
      res.json({ message: 'Sync started' });
      
      syncLibrary(library.path, db, false, (progress) => {
        console.log(`📊 Sync progress: ${progress.current}/${progress.total} (${progress.percent}%)`);
        io.emit('scanProgress', {
          libraryId,
          ...progress
        });
      }).then(results => {
        console.log(`✅ Sync complete for library: ${libraryId}`, results);
        dbPool.release(library.path);
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
      }).catch(error => {
        console.error(`❌ Sync error for library: ${libraryId}`, error);
        dbPool.release(library.path);
        io.emit('scanError', { libraryId, error: error.message });
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix folder paths in database (one-time migration)
router.post('/fix-folders', async (req, res) => {
  try {
    const { libraryId } = req.body;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const db = dbPool.acquire(library.path);
    
    try {
      const path = require('path');
      let fixed = 0;
      
      // 使用流式处理，不加载所有数据到内存
      const stmt = db.db.prepare('SELECT path, folder FROM images');
      for (const img of stmt.iterate()) {
        const expectedFolderRaw = path.dirname(img.path || '');
        const expectedFolder = expectedFolderRaw === '.' ? '' : expectedFolderRaw.replace(/\\/g, '/');
        const currentFolder = (img.folder || '').replace(/\\/g, '/');
        
        if (expectedFolder !== currentFolder) {
          db.updateImageFolder(img.path, expectedFolder);
          fixed++;
        }
      }
      
      console.log(`✅ Fixed ${fixed} folder paths`);
      res.json({ message: `Fixed ${fixed} folder paths`, fixed });
    } finally {
      dbPool.release(library.path);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 停止扫描
router.post('/stop', async (req, res) => {
  try {
    const { libraryId } = req.body;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    if (!scanManager.isScanning(libraryId)) {
      return res.status(400).json({ error: 'No scan in progress' });
    }
    
    // 设置停止标志（实际停止在下一个批次检查时）
    const state = scanManager.getState(libraryId);
    state.abortController.aborted = true;
    
    console.log(`⏸️ Stop requested for library: ${libraryId}`);
    res.json({ message: 'Stop requested', libraryId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 继续扫描
router.post('/resume', async (req, res) => {
  try {
    const { libraryId } = req.body;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    if (!scanManager.isPaused(libraryId)) {
      return res.status(400).json({ error: 'Scan is not paused' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const pendingFiles = scanManager.resumeScan(libraryId);
    if (pendingFiles.length === 0) {
      return res.status(400).json({ error: 'No pending files to resume' });
    }
    
    const io = req.app.get('io');
    const dbPool = require('../database/dbPool');
    const db = dbPool.acquire(library.path);
    
    console.log(`▶️ Resuming scan for library: ${libraryId}, ${pendingFiles.length} files`);
    res.json({ message: 'Scan resumed', pendingFiles: pendingFiles.length });
    
    // 继续扫描
    scanLibrary(library.path, db, (progress) => {
      io.emit('scanProgress', {
        libraryId,
        ...progress
      });
    }, libraryId, pendingFiles).then(results => {
      dbPool.release(library.path);
      if (!results.stopped) {
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
      } else {
        io.emit('scanPaused', { libraryId, results });
      }
    }).catch(error => {
      dbPool.release(library.path);
      io.emit('scanError', { libraryId, error: error.message });
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取扫描状态
router.get('/status/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    
    // 注册素材库路径（用于持久化恢复）
    const library = getLibrary(libraryId);
    if (library) {
      scanManager.registerLibraryPath(libraryId, library.path);
    }
    
    const state = scanManager.getState(libraryId);
    res.json({
      libraryId,
      status: state.status,
      progress: state.progress,
      pendingCount: state.pendingFiles?.length || 0,
      needsRescan: state.needsRescan || false  // 标记是否需要重新扫描
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
