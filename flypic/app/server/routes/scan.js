const express = require('express');
const router = express.Router();
const LibraryDatabase = require('../database/db');
const { getLibrary, updateLibrary } = require('../utils/config');
const { scanLibrary, syncLibrary } = require('../utils/scanner');

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
      res.json({ message: 'Scan started' });
      
      scanLibrary(library.path, db, (progress) => {
        io.emit('scanProgress', {
          libraryId,
          ...progress
        });
      }).then(results => {
        dbPool.release(library.path);
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
      }).catch(error => {
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
      res.json({ message: 'Sync started' });
      
      syncLibrary(library.path, db).then(results => {
        dbPool.release(library.path);
        updateLibrary(libraryId, { lastScan: Date.now() });
        io.emit('scanComplete', { libraryId, results });
      }).catch(error => {
        dbPool.release(library.path);
        io.emit('scanError', { libraryId, error: error.message });
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
