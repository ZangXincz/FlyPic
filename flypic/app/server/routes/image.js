const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const dbPool = require('../database/dbPool');
const { getLibrary } = require('../utils/config');

// Get images with search and filters
router.get('/', (req, res) => {
  try {
    const { libraryId, keywords, folder, formats, minSize, maxSize, startDate, endDate } = req.query;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // 使用连接池获取数据库连接
    const db = dbPool.acquire(library.path);
    
    try {
      const filters = {};
      if (folder) filters.folder = folder;
      if (formats) filters.formats = formats.split(',');
      if (minSize) filters.minSize = parseInt(minSize);
      if (maxSize) filters.maxSize = parseInt(maxSize);
      if (startDate) filters.startDate = parseInt(startDate);
      if (endDate) filters.endDate = parseInt(endDate);
      
      const images = db.searchImages(keywords || '', filters);
      
      res.json({ images });
    } finally {
      // 释放连接
      dbPool.release(library.path);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get folders
router.get('/folders', (req, res) => {
  try {
    const { libraryId } = req.query;
    
    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // 使用连接池
    const db = dbPool.acquire(library.path);
    
    try {
      const folders = db.getFolderTree();
      res.json({ folders });
    } finally {
      dbPool.release(library.path);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve thumbnail
router.get('/thumbnail/:libraryId/:size/:filename', (req, res) => {
  try {
    const { libraryId, filename } = req.params;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // 直接从 thumbnails 目录获取
    const thumbnailPath = path.join(library.path, '.flypic', 'thumbnails', filename);
    
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.sendFile(thumbnailPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve original image
router.get('/original/:libraryId/*', (req, res) => {
  try {
    const { libraryId } = req.params;
    const imagePath = req.params[0];
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const fullPath = path.join(library.path, imagePath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.sendFile(fullPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Open folder in file explorer
router.post('/:libraryId/open-folder', (req, res) => {
  try {
    const { path: imagePath } = req.body;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Path is required' });
    }
    
    // 获取文件所在文件夹
    const folderPath = path.dirname(imagePath);
    
    // Windows: 使用 explorer
    // Linux: 使用 xdg-open
    // macOS: 使用 open
    const command = process.platform === 'win32' 
      ? `explorer "${folderPath}"`
      : process.platform === 'darwin'
      ? `open "${folderPath}"`
      : `xdg-open "${folderPath}"`;
    
    exec(command, (error) => {
      if (error) {
        console.error('打开文件夹失败:', error);
        return res.status(500).json({ error: '打开文件夹失败' });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
