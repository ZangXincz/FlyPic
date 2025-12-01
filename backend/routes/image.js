const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const dbPool = require('../database/dbPool');
const { generateThumbnail } = require('../utils/thumbnail');
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

// Get total image count
router.get('/count', (req, res) => {
  try {
    const { libraryId } = req.query;

    if (!libraryId) {
      return res.status(400).json({ error: 'Library ID is required' });
    }

    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const db = dbPool.acquire(library.path);
    try {
      const row = db.db.prepare('SELECT COUNT(*) as count FROM images').get();
      res.json({ count: row.count });
    } finally {
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
router.get('/thumbnail/:libraryId/:size/:filename', async (req, res) => {
  try {
    const { libraryId, size, filename } = req.params;

    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // New structure: .flypic/thumbnails/ab/hash.webp
    const thumbBase = path.join(library.path, '.flypic', 'thumbnails');
    const hash = filename.replace(/\.[^/.]+$/, ""); // remove extension if present
    const shard1 = hash.slice(0, 2);

    const targetPath = path.join(thumbBase, shard1, filename);

    if (!fs.existsSync(targetPath)) {
      // 按需生成：尝试通过文件名在数据库中定位原图并生成
      try {
        const db = dbPool.acquire(library.path);
        try {
          const row = db.db.prepare('SELECT path, thumbnail_path FROM images WHERE thumbnail_path LIKE ?').get(`%/${filename}`);
          if (row && row.path) {
            const originalFull = path.join(library.path, row.path);
            // 确保目标目录存在
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            // 生成指定尺寸 (default 480)
            await generateThumbnail(originalFull, targetPath, parseInt(size, 10) || 480);
          }
        } finally {
          dbPool.release(library.path);
        }
      } catch (e) {
        // 忽略生成失败
      }
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // 设置缓存头，减少重复请求（缩略图内容不变）
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept-Encoding'
    });
    res.sendFile(targetPath);
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

// Open file in system default application
router.post('/:libraryId/open-file', (req, res) => {
  try {
    const { libraryId } = req.params;
    const { path: filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const fullPath = path.join(library.path, filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 使用系统默认应用打开文件
    const command = process.platform === 'win32'
      ? `start "" "${fullPath}"`
      : process.platform === 'darwin'
        ? `open "${fullPath}"`
        : `xdg-open "${fullPath}"`;

    exec(command, (error) => {
      if (error) {
        console.error('打开文件失败:', error);
        return res.status(500).json({ error: '打开文件失败' });
      }
      res.json({ success: true });
    });
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
