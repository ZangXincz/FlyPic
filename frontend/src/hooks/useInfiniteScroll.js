/**
 * 无限滚动 Hook
 */

import { useCallback } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { imageAPI } from '../api';
import requestManager, { RequestType } from '../services/requestManager';
import { createLogger } from '../utils/logger';

const logger = createLogger('useInfiniteScroll');

// 加载配置
const LOAD_CONFIG = {
  pageSize: 100,           // 每次加载 100 张
  preloadThreshold: 300,   // 距离边界 300px 时预加载
};

/**
 * 无限滚动加载
 * @returns {Object} 加载相关的状态和方法
 */
export const useInfiniteScroll = () => {
  const { currentLibraryId } = useLibraryStore();
  const { 
    images, 
    imageLoadingState, 
    setImageLoadingState,
    selectedFolder,
    searchKeywords,
    filters,
    appendImages 
  } = useImageStore();

  /**
   * 加载更多图片
   */
  const loadMoreImages = useCallback(async () => {
    if (!currentLibraryId || !imageLoadingState.hasMore || imageLoadingState.isLoading) {
      return;
    }

    const requestContext = requestManager.createRequest(RequestType.IMAGES);
    setImageLoadingState({ isLoading: true });

    try {
      const params = { 
        offset: images.length,
        limit: LOAD_CONFIG.pageSize 
      };
      if (selectedFolder) params.folder = selectedFolder;
      if (searchKeywords) params.keywords = searchKeywords;
      if (filters.formats?.length > 0) params.formats = filters.formats.join(',');

      const response = await imageAPI.search(currentLibraryId, params, {
        signal: requestContext.signal
      });

      if (!requestManager.isValid(requestContext.id)) {
        return;
      }

      const { images: newImages, total, hasMore } = response;
      requestManager.complete(requestContext.id);

      appendImages(newImages);
      setImageLoadingState({
        isLoading: false,
        loadedCount: images.length + newImages.length,
        totalCount: total,
        hasMore: hasMore || false,
      });
    } catch (error) {
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return;
      }
      logger.error('Error loading more images:', error);
      requestManager.error(requestContext.id);
      setImageLoadingState({ isLoading: false });
    }
  }, [
    currentLibraryId, 
    imageLoadingState, 
    images.length, 
    selectedFolder, 
    searchKeywords, 
    filters, 
    appendImages, 
    setImageLoadingState
  ]);

  return {
    loadMoreImages,
    preloadThreshold: LOAD_CONFIG.preloadThreshold
  };
};
