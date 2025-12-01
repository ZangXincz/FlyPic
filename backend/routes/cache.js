/**
 * 缓存 API 路由
 * 管理素材库和文件夹的缓存数据
 */
const express = require('express');
const router = express.Router();
const CacheManager = require('../utils/cacheManager');
const dbPool = require('../database/dbPool');
const { getLibrary } = require('../utils/config');

/**
 * 获取素材库缓存
 * GET /api/cache/library/:libraryId
 */
router.get('/library/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const cacheManager = new CacheManager(library.path);
    const cache = cacheManager.readLibraryCache();
    
    if (!cache) {
      return res.status(404).json({ error: 'Cache not found' });
    }
    
    res.json(cache);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 保存素材库缓存
 * POST /api/cache/library/:libraryId
 */
router.post('/library/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    const { folderTree, totalCount, dbModifiedAt } = req.body;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const cacheManager = new CacheManager(library.path);
    const success = cacheManager.writeLibraryCache({
      folderTree,
      totalCount,
      dbModifiedAt
    });
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to write cache' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取文件夹缓存
 * GET /api/cache/folder/:libraryId
 * Query: folder (可选，不传则获取全部图片缓存)
 */
router.get('/folder/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    const { folder } = req.query;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const cacheManager = new CacheManager(library.path);
    const cache = cacheManager.readFolderCache(folder || null);
    
    if (!cache) {
      return res.status(404).json({ error: 'Folder cache not found' });
    }
    
    // 验证缓存是否过期
    const db = dbPool.acquire(library.path);
    try {
      const dbModifiedAt = db.getLastModified();
      
      if (cache.dbModifiedAt < dbModifiedAt) {
        // 缓存过期
        return res.status(410).json({ 
          error: 'Cache stale', 
          cacheModifiedAt: cache.dbModifiedAt,
          dbModifiedAt 
        });
      }
      
      res.json(cache);
    } finally {
      dbPool.release(library.path);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 保存文件夹缓存
 * POST /api/cache/folder/:libraryId
 */
router.post('/folder/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    const { folder, images } = req.body;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // 获取当前数据库修改时间
    const db = dbPool.acquire(library.path);
    let dbModifiedAt;
    try {
      dbModifiedAt = db.getLastModified();
    } finally {
      dbPool.release(library.path);
    }
    
    const cacheManager = new CacheManager(library.path);
    const success = cacheManager.writeFolderCache(folder || null, images, dbModifiedAt);
    
    if (success) {
      res.json({ success: true, dbModifiedAt });
    } else {
      res.status(500).json({ error: 'Failed to write cache' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除素材库所有缓存
 * DELETE /api/cache/library/:libraryId
 */
router.delete('/library/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const cacheManager = new CacheManager(library.path);
    cacheManager.clearAllCache();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取缓存统计信息
 * GET /api/cache/stats/:libraryId
 */
router.get('/stats/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    
    const library = getLibrary(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    const cacheManager = new CacheManager(library.path);
    const stats = cacheManager.getCacheStats();
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
