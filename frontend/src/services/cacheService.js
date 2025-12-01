/**
 * CacheService - 前端缓存服务
 * 管理素材库和文件夹的图片元数据缓存
 */
import { imageAPI } from './api';

// 缓存版本号，用于处理缓存格式升级
const CACHE_VERSION = 1;

// IndexedDB 数据库名称
const DB_NAME = 'flypic_cache';
const DB_VERSION = 1;

// 存储名称
const STORE_LIBRARY = 'library_cache';
const STORE_FOLDER = 'folder_cache';

// LRU 缓存最大文件夹数量
const MAX_FOLDER_CACHE = 50;

class CacheService {
  constructor() {
    this.db = null;
    this.dbReady = this.initDB();
    // 文件夹访问时间记录（用于 LRU）
    this.folderAccessTimes = new Map();
  }

  /**
   * 初始化 IndexedDB
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 素材库缓存存储
        if (!db.objectStoreNames.contains(STORE_LIBRARY)) {
          db.createObjectStore(STORE_LIBRARY, { keyPath: 'libraryId' });
        }

        // 文件夹缓存存储
        if (!db.objectStoreNames.contains(STORE_FOLDER)) {
          const folderStore = db.createObjectStore(STORE_FOLDER, { keyPath: 'cacheKey' });
          folderStore.createIndex('libraryId', 'libraryId', { unique: false });
          folderStore.createIndex('accessedAt', 'accessedAt', { unique: false });
        }
      };
    });
  }

  /**
   * 确保数据库已就绪
   */
  async ensureDB() {
    if (!this.db) {
      await this.dbReady;
    }
    return this.db;
  }

  /**
   * 生成文件夹缓存键
   */
  getFolderCacheKey(libraryId, folder) {
    return `${libraryId}:${folder || '__all__'}`;
  }

  // ==================== 素材库缓存 ====================

  /**
   * 获取素材库缓存
   * @param {string} libraryId
   * @returns {Promise<LibraryCache|null>}
   */
  async getLibraryCache(libraryId) {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LIBRARY, 'readonly');
        const store = tx.objectStore(STORE_LIBRARY);
        const request = store.get(libraryId);

        request.onsuccess = () => {
          const cache = request.result;
          if (cache && cache.version === CACHE_VERSION) {
            resolve(cache);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to get library cache:', error);
      return null;
    }
  }

  /**
   * 保存素材库缓存
   * @param {string} libraryId
   * @param {object} data - { folders, totalCount, dbModifiedAt }
   */
  async saveLibraryCache(libraryId, data) {
    try {
      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LIBRARY, 'readwrite');
        const store = tx.objectStore(STORE_LIBRARY);

        const cache = {
          libraryId,
          version: CACHE_VERSION,
          createdAt: Date.now(),
          dbModifiedAt: data.dbModifiedAt,
          totalCount: data.totalCount,
          folders: data.folders
        };

        const request = store.put(cache);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to save library cache:', error);
    }
  }

  /**
   * 验证素材库缓存是否有效
   * @param {string} libraryId
   * @returns {Promise<CacheValidation>}
   */
  async validateLibraryCache(libraryId) {
    try {
      const cache = await this.getLibraryCache(libraryId);
      
      if (!cache) {
        return { isValid: false, reason: 'not_found' };
      }

      // 从后端获取当前数据库修改时间
      const response = await imageAPI.getCacheMeta(libraryId);
      const currentDbModifiedAt = response.data.dbModifiedAt;

      if (cache.dbModifiedAt >= currentDbModifiedAt) {
        return { 
          isValid: true, 
          cache,
          dbModifiedAt: currentDbModifiedAt,
          cacheModifiedAt: cache.dbModifiedAt
        };
      } else {
        return { 
          isValid: false, 
          reason: 'stale',
          dbModifiedAt: currentDbModifiedAt,
          cacheModifiedAt: cache.dbModifiedAt
        };
      }
    } catch (error) {
      console.warn('Failed to validate library cache:', error);
      return { isValid: false, reason: 'error' };
    }
  }

  // ==================== 文件夹缓存 ====================

  /**
   * 获取文件夹缓存
   * @param {string} libraryId
   * @param {string|null} folder
   * @returns {Promise<FolderCache|null>}
   */
  async getFolderCache(libraryId, folder) {
    try {
      const db = await this.ensureDB();
      const cacheKey = this.getFolderCacheKey(libraryId, folder);

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readwrite');
        const store = tx.objectStore(STORE_FOLDER);
        const request = store.get(cacheKey);

        request.onsuccess = () => {
          const cache = request.result;
          if (cache && cache.version === CACHE_VERSION) {
            // 更新访问时间
            cache.accessedAt = Date.now();
            store.put(cache);
            this.folderAccessTimes.set(cacheKey, cache.accessedAt);
            resolve(cache);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to get folder cache:', error);
      return null;
    }
  }

  /**
   * 保存文件夹缓存
   * @param {string} libraryId
   * @param {string|null} folder
   * @param {Array} images
   * @param {number} dbModifiedAt
   */
  async saveFolderCache(libraryId, folder, images, dbModifiedAt) {
    try {
      const db = await this.ensureDB();
      const cacheKey = this.getFolderCacheKey(libraryId, folder);
      const now = Date.now();

      // 先检查是否需要 LRU 驱逐（全局检查）
      await this.evictIfNeeded(null, true);

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readwrite');
        const store = tx.objectStore(STORE_FOLDER);

        // 精简图片数据，只保留必要字段
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
          cacheKey,
          libraryId,
          folder: folder || '__all__',
          version: CACHE_VERSION,
          cachedAt: now,
          accessedAt: now,
          dbModifiedAt,
          imageCount: images.length,
          images: slimImages
        };

        const request = store.put(cache);
        request.onsuccess = () => {
          this.folderAccessTimes.set(cacheKey, now);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to save folder cache:', error);
    }
  }

  /**
   * LRU 驱逐：如果缓存数量超过阈值，删除最久未访问的缓存
   * @param {string} libraryId - 当前素材库ID（可选，如果提供则只检查该素材库）
   * @param {boolean} global - 是否检查全局缓存数量
   */
  async evictIfNeeded(libraryId, global = false) {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readwrite');
        const store = tx.objectStore(STORE_FOLDER);
        
        // 获取所有缓存或特定素材库的缓存
        let request;
        if (global || !libraryId) {
          request = store.getAll();
        } else {
          const index = store.index('libraryId');
          request = index.getAll(libraryId);
        }

        request.onsuccess = () => {
          const caches = request.result;
          
          if (caches.length >= MAX_FOLDER_CACHE) {
            // 按访问时间排序（最旧的在前）
            caches.sort((a, b) => (a.accessedAt || 0) - (b.accessedAt || 0));
            
            // 计算需要删除的数量：保留 MAX_FOLDER_CACHE - 1 个，为新缓存腾出空间
            const deleteCount = caches.length - MAX_FOLDER_CACHE + 1;
            const toDelete = caches.slice(0, deleteCount);
            
            console.log(`🗑️ LRU eviction: removing ${toDelete.length} folder caches`);
            
            for (const cache of toDelete) {
              store.delete(cache.cacheKey);
              this.folderAccessTimes.delete(cache.cacheKey);
            }
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to evict cache:', error);
    }
  }

  /**
   * 获取当前缓存统计信息
   * @returns {Promise<{libraryCount: number, folderCount: number, totalSize: number}>}
   */
  async getCacheStats() {
    try {
      const db = await this.ensureDB();

      const libraryCount = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LIBRARY, 'readonly');
        const store = tx.objectStore(STORE_LIBRARY);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const folderCount = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readonly');
        const store = tx.objectStore(STORE_FOLDER);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return { libraryCount, folderCount };
    } catch (error) {
      console.warn('Failed to get cache stats:', error);
      return { libraryCount: 0, folderCount: 0 };
    }
  }

  /**
   * 获取最近访问的文件夹缓存列表
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array<{cacheKey: string, folder: string, accessedAt: number}>>}
   */
  async getRecentFolderCaches(limit = 10) {
    try {
      const db = await this.ensureDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readonly');
        const store = tx.objectStore(STORE_FOLDER);
        const index = store.index('accessedAt');
        
        // 使用游标从最新到最旧遍历
        const results = [];
        const request = index.openCursor(null, 'prev');
        
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor && results.length < limit) {
            const cache = cursor.value;
            results.push({
              cacheKey: cache.cacheKey,
              libraryId: cache.libraryId,
              folder: cache.folder,
              accessedAt: cache.accessedAt,
              imageCount: cache.imageCount
            });
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to get recent folder caches:', error);
      return [];
    }
  }

  // ==================== 缓存失效 ====================

  /**
   * 清除素材库的所有缓存
   * @param {string} libraryId
   */
  async invalidateLibrary(libraryId) {
    try {
      const db = await this.ensureDB();

      // 删除素材库缓存
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LIBRARY, 'readwrite');
        const store = tx.objectStore(STORE_LIBRARY);
        const request = store.delete(libraryId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // 删除该素材库的所有文件夹缓存
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readwrite');
        const store = tx.objectStore(STORE_FOLDER);
        const index = store.index('libraryId');
        const request = index.getAllKeys(libraryId);

        request.onsuccess = () => {
          const keys = request.result;
          for (const key of keys) {
            store.delete(key);
            this.folderAccessTimes.delete(key);
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to invalidate library cache:', error);
    }
  }

  /**
   * 清除特定文件夹的缓存
   * @param {string} libraryId
   * @param {string|null} folder
   */
  async invalidateFolder(libraryId, folder) {
    try {
      const db = await this.ensureDB();
      const cacheKey = this.getFolderCacheKey(libraryId, folder);

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FOLDER, 'readwrite');
        const store = tx.objectStore(STORE_FOLDER);
        const request = store.delete(cacheKey);
        
        request.onsuccess = () => {
          this.folderAccessTimes.delete(cacheKey);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Failed to invalidate folder cache:', error);
    }
  }
}

// 单例实例
const cacheService = new CacheService();

export default cacheService;
export { CacheService, MAX_FOLDER_CACHE };
