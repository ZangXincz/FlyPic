/**
 * ImageLoadService - 图片分批加载服务
 * 支持分页加载、空闲加载、缓存优先
 */
import { imageAPI } from './api';
import requestManager, { RequestType } from './requestManager';
import cacheService from './cacheService';

// 默认批次大小
const DEFAULT_BATCH_SIZE = 200;

// 空闲加载延迟（毫秒）
const IDLE_LOAD_DELAY = 500;

class ImageLoadService {
  constructor() {
    // 当前加载状态
    this.state = {
      libraryId: null,
      folder: null,
      images: [],
      offset: 0,
      total: 0,
      hasMore: false,
      isLoading: false,
      isIdleLoading: false
    };

    // 空闲加载定时器
    this.idleTimer = null;
    // 空闲加载是否暂停
    this.idlePaused = false;
    // 状态变化回调
    this.onStateChange = null;
  }

  /**
   * 设置状态变化回调
   */
  setOnStateChange(callback) {
    this.onStateChange = callback;
  }

  /**
   * 更新状态并通知
   */
  updateState(updates) {
    this.state = { ...this.state, ...updates };
    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.cancelIdleLoading();
    this.state = {
      libraryId: null,
      folder: null,
      images: [],
      offset: 0,
      total: 0,
      hasMore: false,
      isLoading: false,
      isIdleLoading: false
    };
  }

  /**
   * 加载文件夹的第一批图片
   * @param {string} libraryId
   * @param {string|null} folder
   * @param {object} options - { batchSize, useCache }
   */
  async loadInitialBatch(libraryId, folder, options = {}) {
    const { batchSize = DEFAULT_BATCH_SIZE, useCache = true } = options;

    // 暂停并取消之前的空闲加载
    this.pauseIdleLoading();
    
    // 取消之前的请求
    requestManager.cancelAll(RequestType.IMAGES);

    // 更新状态
    this.updateState({
      libraryId,
      folder,
      images: [],
      offset: 0,
      total: 0,
      hasMore: false,
      isLoading: true
    });

    // 尝试从缓存加载
    if (useCache) {
      try {
        const cachedData = await cacheService.getFolderCache(libraryId, folder);
        if (cachedData) {
          // 验证缓存是否有效
          const metaResponse = await imageAPI.getCacheMeta(libraryId);
          const dbModifiedAt = metaResponse.data.dbModifiedAt;

          if (cachedData.dbModifiedAt >= dbModifiedAt) {
            // 缓存有效，直接使用
            console.log(`📦 Using cached data for folder: ${folder || 'all'}`);
            this.updateState({
              images: cachedData.images,
              offset: cachedData.images.length,
              total: cachedData.imageCount,
              hasMore: false,
              isLoading: false
            });
            return {
              images: cachedData.images,
              total: cachedData.imageCount,
              hasMore: false,
              fromCache: true
            };
          } else {
            // 缓存过期，清除
            await cacheService.invalidateFolder(libraryId, folder);
          }
        }
      } catch (error) {
        console.warn('Cache check failed:', error);
      }
    }

    // 从 API 加载
    const requestContext = requestManager.createRequest(RequestType.IMAGES);

    try {
      const params = {
        offset: 0,
        limit: batchSize
      };
      if (folder) {
        params.folder = folder;
      }

      const response = await imageAPI.search(libraryId, params, {
        signal: requestContext.signal
      });

      // 检查请求是否仍然有效
      if (!requestManager.isValid(requestContext.id)) {
        return null;
      }

      const { images, total, hasMore } = response.data;

      this.updateState({
        images,
        offset: images.length,
        total,
        hasMore,
        isLoading: false
      });

      requestManager.complete(requestContext.id);

      // 如果还有更多数据，启动空闲加载
      if (hasMore) {
        this.startIdleLoading();
      } else {
        // 加载完成，保存到缓存
        this.saveToCacheAsync(libraryId, folder, images);
      }

      return { images, total, hasMore, fromCache: false };
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return null;
      }

      requestManager.error(requestContext.id);
      this.updateState({ isLoading: false });
      throw error;
    }
  }

  /**
   * 用户操作开始时调用，暂停空闲加载并取消所有进行中的请求
   */
  onUserActionStart() {
    this.pauseIdleLoading();
    // 关键：取消所有正在进行的图片请求，避免阻塞新请求
    requestManager.cancelAll(RequestType.IMAGES);
  }

  /**
   * 用户操作结束时调用，恢复空闲加载
   */
  onUserActionEnd() {
    // 延迟恢复，避免频繁切换
    setTimeout(() => {
      if (this.state.hasMore && !this.state.isLoading) {
        this.resumeIdleLoading();
      }
    }, 300);
  }

  /**
   * 加载下一批图片
   */
  async loadNextBatch(batchSize = DEFAULT_BATCH_SIZE) {
    if (!this.state.hasMore || this.state.isLoading) {
      return null;
    }

    const { libraryId, folder, offset, images } = this.state;
    const requestContext = requestManager.createRequest(RequestType.IMAGES);

    this.updateState({ isLoading: true });

    try {
      const params = {
        offset,
        limit: batchSize
      };
      if (folder) {
        params.folder = folder;
      }

      const response = await imageAPI.search(libraryId, params, {
        signal: requestContext.signal
      });

      if (!requestManager.isValid(requestContext.id)) {
        return null;
      }

      const newImages = response.data.images;
      const allImages = [...images, ...newImages];

      this.updateState({
        images: allImages,
        offset: allImages.length,
        total: response.data.total,
        hasMore: response.data.hasMore,
        isLoading: false
      });

      requestManager.complete(requestContext.id);

      // 如果加载完成，保存到缓存
      if (!response.data.hasMore) {
        this.saveToCacheAsync(libraryId, folder, allImages);
      }

      return {
        images: newImages,
        total: response.data.total,
        hasMore: response.data.hasMore
      };
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return null;
      }

      requestManager.error(requestContext.id);
      this.updateState({ isLoading: false });
      throw error;
    }
  }

  /**
   * 启动空闲加载
   */
  startIdleLoading() {
    if (this.idleTimer || this.idlePaused) {
      return;
    }

    this.updateState({ isIdleLoading: true });

    const loadNext = async () => {
      if (this.idlePaused || !this.state.hasMore) {
        this.updateState({ isIdleLoading: false });
        return;
      }

      try {
        await this.loadNextBatch();

        if (this.state.hasMore && !this.idlePaused) {
          // 使用 requestIdleCallback 或 setTimeout
          if (typeof requestIdleCallback !== 'undefined') {
            this.idleTimer = requestIdleCallback(() => {
              this.idleTimer = null;
              loadNext();
            }, { timeout: 2000 });
          } else {
            this.idleTimer = setTimeout(() => {
              this.idleTimer = null;
              loadNext();
            }, IDLE_LOAD_DELAY);
          }
        } else {
          this.updateState({ isIdleLoading: false });
        }
      } catch (error) {
        console.error('Idle loading error:', error);
        this.updateState({ isIdleLoading: false });
      }
    };

    // 延迟启动空闲加载
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      loadNext();
    }, IDLE_LOAD_DELAY);
  }

  /**
   * 暂停空闲加载
   */
  pauseIdleLoading() {
    this.idlePaused = true;
    this.cancelIdleLoading();
  }

  /**
   * 恢复空闲加载
   */
  resumeIdleLoading() {
    this.idlePaused = false;
    if (this.state.hasMore) {
      this.startIdleLoading();
    }
  }

  /**
   * 取消空闲加载
   */
  cancelIdleLoading() {
    if (this.idleTimer) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.idleTimer);
      } else {
        clearTimeout(this.idleTimer);
      }
      this.idleTimer = null;
    }
    this.updateState({ isIdleLoading: false });
  }

  /**
   * 异步保存到缓存（不阻塞主流程）
   */
  async saveToCacheAsync(libraryId, folder, images) {
    try {
      const metaResponse = await imageAPI.getCacheMeta(libraryId);
      const dbModifiedAt = metaResponse.data.dbModifiedAt;
      await cacheService.saveFolderCache(libraryId, folder, images, dbModifiedAt);
      console.log(`💾 Cached ${images.length} images for folder: ${folder || 'all'}`);
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  }

  /**
   * 获取当前加载状态
   */
  getState() {
    return { ...this.state };
  }
}

// 单例实例
const imageLoadService = new ImageLoadService();

export default imageLoadService;
export { ImageLoadService, DEFAULT_BATCH_SIZE };
