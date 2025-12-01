/**
 * CacheManager - 后端缓存文件管理
 * 管理 .flypic/cache/ 目录下的缓存文件
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 缓存版本号
const CACHE_VERSION = 1;

class CacheManager {
  constructor(libraryPath) {
    this.libraryPath = libraryPath;
    this.cacheDir = path.join(libraryPath, '.flypic', 'cache');
    this.foldersDir = path.join(this.cacheDir, 'folders');
    
    // 确保缓存目录存在
    this.ensureDirs();
  }

  /**
   * 确保缓存目录存在
   */
  ensureDirs() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(this.foldersDir)) {
      fs.mkdirSync(this.foldersDir, { recursive: true });
    }
  }

  /**
   * 生成文件夹路径的哈希值（用于缓存文件名）
   */
  hashFolder(folderPath) {
    return crypto.createHash('md5').update(folderPath || '__all__').digest('hex');
  }

  // ==================== 素材库缓存 ====================

  /**
   * 获取素材库缓存文件路径
   */
  getLibraryCachePath() {
    return path.join(this.cacheDir, 'library.json');
  }

  /**
   * 读取素材库缓存
   * @returns {object|null}
   */
  readLibraryCache() {
    try {
      const cachePath = this.getLibraryCachePath();
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const content = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content);
      
      // 验证版本
      if (cache.version !== CACHE_VERSION) {
        return null;
      }
      
      return cache;
    } catch (error) {
      console.warn('Failed to read library cache:', error.message);
      return null;
    }
  }

  /**
   * 写入素材库缓存
   * @param {object} data - { folderTree, totalCount, dbModifiedAt }
   */
  writeLibraryCache(data) {
    try {
      const cachePath = this.getLibraryCachePath();
      const cache = {
        version: CACHE_VERSION,
        createdAt: Date.now(),
        dbModifiedAt: data.dbModifiedAt,
        totalCount: data.totalCount,
        folderTree: data.folderTree
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
      return true;
    } catch (error) {
      console.warn('Failed to write library cache:', error.message);
      return false;
    }
  }

  // ==================== 文件夹缓存 ====================

  /**
   * 获取文件夹缓存文件路径
   */
  getFolderCachePath(folderPath) {
    const hash = this.hashFolder(folderPath);
    return path.join(this.foldersDir, `${hash}.json`);
  }

  /**
   * 读取文件夹缓存
   * @param {string|null} folderPath
   * @returns {object|null}
   */
  readFolderCache(folderPath) {
    try {
      const cachePath = this.getFolderCachePath(folderPath);
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const content = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content);
      
      // 验证版本
      if (cache.version !== CACHE_VERSION) {
        return null;
      }
      
      return cache;
    } catch (error) {
      console.warn('Failed to read folder cache:', error.message);
      return null;
    }
  }

  /**
   * 写入文件夹缓存
   * @param {string|null} folderPath
   * @param {Array} images
   * @param {number} dbModifiedAt
   */
  writeFolderCache(folderPath, images, dbModifiedAt) {
    try {
      const cachePath = this.getFolderCachePath(folderPath);
      
      // 精简图片数据
      const slimImages = images.map(img => ({
        id: img.id,
        path: img.path,
        filename: img.filename,
        width: img.width,
        height: img.height,
        thumbnail_path: img.thumbnail_path,
        file_type: img.file_type,
        created_at: img.created_at,
        format: img.format
      }));
      
      const cache = {
        version: CACHE_VERSION,
        folder: folderPath || '__all__',
        cachedAt: Date.now(),
        dbModifiedAt,
        imageCount: images.length,
        images: slimImages
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
      return true;
    } catch (error) {
      console.warn('Failed to write folder cache:', error.message);
      return false;
    }
  }

  // ==================== 缓存清理 ====================

  /**
   * 删除素材库缓存
   */
  deleteLibraryCache() {
    try {
      const cachePath = this.getLibraryCachePath();
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
      return true;
    } catch (error) {
      console.warn('Failed to delete library cache:', error.message);
      return false;
    }
  }

  /**
   * 删除文件夹缓存
   */
  deleteFolderCache(folderPath) {
    try {
      const cachePath = this.getFolderCachePath(folderPath);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
      return true;
    } catch (error) {
      console.warn('Failed to delete folder cache:', error.message);
      return false;
    }
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    try {
      // 删除素材库缓存
      this.deleteLibraryCache();
      
      // 删除所有文件夹缓存
      if (fs.existsSync(this.foldersDir)) {
        const files = fs.readdirSync(this.foldersDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.foldersDir, file));
        }
      }
      
      return true;
    } catch (error) {
      console.warn('Failed to clear all cache:', error.message);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    try {
      const stats = {
        hasLibraryCache: fs.existsSync(this.getLibraryCachePath()),
        folderCacheCount: 0,
        totalSize: 0
      };
      
      if (fs.existsSync(this.foldersDir)) {
        const files = fs.readdirSync(this.foldersDir);
        stats.folderCacheCount = files.length;
        
        for (const file of files) {
          const filePath = path.join(this.foldersDir, file);
          const fileStat = fs.statSync(filePath);
          stats.totalSize += fileStat.size;
        }
      }
      
      if (stats.hasLibraryCache) {
        const libCacheStat = fs.statSync(this.getLibraryCachePath());
        stats.totalSize += libCacheStat.size;
      }
      
      return stats;
    } catch (error) {
      return { hasLibraryCache: false, folderCacheCount: 0, totalSize: 0 };
    }
  }
}

module.exports = CacheManager;
