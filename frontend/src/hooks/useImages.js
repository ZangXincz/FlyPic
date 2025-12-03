/**
 * 图片 Hook
 */

import { useState, useCallback, useRef } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { imageAPI } from '../api';

export function useImages(libraryId) {
  const { 
    images, 
    setImages, 
    appendImages,
    clearImages,
    setImageLoadingState 
  } = useImageStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  /**
   * 加载图片
   */
  const loadImages = useCallback(async (filters = {}, pagination = null) => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const params = { ...filters };
      if (pagination) {
        params.offset = pagination.offset;
        params.limit = pagination.limit;
      }

      const response = await imageAPI.search(libraryId, params, {
        signal: abortControllerRef.current.signal
      });

      // 分页追加或全量替换
      if (pagination && pagination.offset > 0) {
        appendImages(response.images || []);
      } else {
        setImages(response.images || []);
      }

      // 更新加载状态
      if (response.total !== undefined) {
        setImageLoadingState({
          isLoading: false,
          loadedCount: response.images?.length || 0,
          totalCount: response.total,
          hasMore: response.hasMore || false
        });
      }

      return response;
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        throw err;
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [libraryId, setImages, appendImages, setImageLoadingState]);

  /**
   * 取消加载
   */
  const cancelLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  /**
   * 清空图片
   */
  const clear = useCallback(() => {
    clearImages();
    setImageLoadingState({
      isLoading: false,
      loadedCount: 0,
      totalCount: 0,
      hasMore: false
    });
  }, [clearImages, setImageLoadingState]);

  return {
    images,
    loading,
    error,
    loadImages,
    cancelLoading,
    clear
  };
}
