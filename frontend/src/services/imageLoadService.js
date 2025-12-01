/**
 * ImageLoadService - 图片分批加载服务
 * 支持分页加载、空闲加载
 */
import { imageAPI } from './api';
import requestManager, { RequestType } from './requestManager';

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
      isLoading: false
    };

    // 空闲加载定时器
    this.idleTimer = null;
    // 空闲加载是否暂停
    this.idlePaused = false;
  }

  /**
   * 用户操作开始时调用，暂停空闲加载并取消所有进行中的请求
   */
  onUserActionStart() {
    this.pauseIdleLoading();
    requestManager.cancelAll(RequestType.IMAGES);
  }

  /**
   * 用户操作结束时调用，恢复空闲加载
   */
  onUserActionEnd() {
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

    this.state.isLoading = true;

    try {
      const params = { offset, limit: batchSize };
      if (folder) params.folder = folder;

      const response = await imageAPI.search(libraryId, params, {
        signal: requestContext.signal
      });

      if (!requestManager.isValid(requestContext.id)) {
        return null;
      }

      const newImages = response.data.images;
      const allImages = [...images, ...newImages];

      this.state = {
        ...this.state,
        images: allImages,
        offset: allImages.length,
        total: response.data.total,
        hasMore: response.data.hasMore,
        isLoading: false
      };

      requestManager.complete(requestContext.id);

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
      this.state.isLoading = false;
      throw error;
    }
  }

  /**
   * 启动空闲加载
   */
  startIdleLoading() {
    if (this.idleTimer || this.idlePaused) return;

    const loadNext = async () => {
      if (this.idlePaused || !this.state.hasMore) return;

      try {
        await this.loadNextBatch();

        if (this.state.hasMore && !this.idlePaused) {
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
        }
      } catch (error) {
        console.error('Idle loading error:', error);
      }
    };

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
  }
}

// 单例实例
const imageLoadService = new ImageLoadService();

export default imageLoadService;
export { ImageLoadService, DEFAULT_BATCH_SIZE };
