import { useEffect, useRef, useState, useCallback } from 'react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { useUIStore } from '../stores/useUIStore';
import { useScanStore } from '../stores/useScanStore';
import { imageAPI } from '../api';
import { onUserActionStart, onUserActionEnd } from '../services/imageLoadService';
import requestManager, { RequestType } from '../services/requestManager';
import imageCache from '../utils/imageCache';
import domCleanup from '../utils/domCleanup';
import ImageWaterfall from './ImageWaterfall';
import Dashboard from './Dashboard';

function MainContent() {
  const { currentLibraryId } = useLibraryStore();
  const { searchKeywords, filters, selectedFolder, setImages, setOriginalImages, imageLoadingState, images } = useImageStore();
  const { scanProgress } = useScanStore();

  // 使用 ref 跟踪最新的请求上下文
  const currentRequestContextRef = useRef(null);
  // 文件夹切换防抖
  const debounceTimerRef = useRef(null);

  // 计算预估剩余时间
  const getEstimatedTime = () => {
    if (!scanProgress || scanProgress.current === 0) return null;
    if (scanProgress.estimatedTimeLeft !== undefined) {
      const seconds = scanProgress.estimatedTimeLeft;
      if (seconds < 1) return '即将完成';
      if (seconds < 60) return `剩余约 ${seconds} 秒`;
      const min = Math.floor(seconds / 60);
      return `剩余约 ${min} 分钟`;
    }
    return null;
  };

  // 取消当前请求（使用 requestManager 统一管理）
  const cancelCurrentRequest = useCallback(() => {
    // 取消所有 IMAGES 类型的请求
    requestManager.cancelAll(RequestType.IMAGES);
    currentRequestContextRef.current = null;
  }, []);

  // 加载图片 - 核心函数（使用后端分页，前端不再维护本地分页窗口）
  const loadImages = useCallback(async (isInitialLoad = true) => {
    if (!currentLibraryId) return;

    // 如果没有选中文件夹且没有搜索条件，显示 Dashboard
    if (!selectedFolder && !searchKeywords && filters.formats.length === 0) {
      setImages([]);
      useImageStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: 0,
        totalCount: 0,
        hasMore: false
      });
      return;
    }

    // 初始加载时重置本地缓存
    if (isInitialLoad) {
      imageCache.clear(); // 清理缓存
    }

    // 暂停空闲加载并取消之前的所有请求（关键！）
    onUserActionStart();
    cancelCurrentRequest();

    // 使用 requestManager 创建请求上下文
    const requestContext = requestManager.createRequest(RequestType.IMAGES);
    currentRequestContextRef.current = requestContext;

    // 设置加载状态（保持当前计数不变，只更新 loading 标志）
    useImageStore.getState().setImageLoadingState({
      ...imageLoadingState,
      isLoading: true
    });

    try {
      // 直接从后端加载一页数据（每次 100 张，更轻量）
      const params = {
        offset: isInitialLoad ? 0 : imageLoadingState.loadedCount,
        limit: 100
      };
      if (selectedFolder) params.folder = selectedFolder;
      if (searchKeywords) params.keywords = searchKeywords;
      if (filters.formats?.length > 0) params.formats = filters.formats.join(',');

      const response = await imageAPI.search(currentLibraryId, params, {
        signal: requestContext.signal
      });

      const { images, total, hasMore } = response;

      // 检查请求是否被取消
      if (!requestManager.isValid(requestContext.id)) {
        return;
      }

      // 标记请求完成
      requestManager.complete(requestContext.id);

      // 初次加载：设置图片数据和原始图片（用于筛选选项）
      if (isInitialLoad) {
        setImages(images);
        setOriginalImages(images);
      }

      useImageStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: images.length,
        totalCount: total,
        hasMore: hasMore || false,
      });

      // 如果还有更多数据，恢复空闲加载
      if (hasMore) {
        onUserActionEnd(hasMore);
      }

    } catch (error) {
      // 忽略取消错误
      if (error.name === 'CanceledError' || error.name === 'AbortError') {
        return;
      }
      console.error('Error loading images:', error);
      requestManager.error(requestContext.id);
    } finally {
      // 只有当请求仍然有效时才更新状态
      if (requestManager.isValid(requestContext.id) || requestContext.status === 'completed') {
        currentRequestContextRef.current = null;
      }
    }
  }, [currentLibraryId, searchKeywords, selectedFolder, setImages, setOriginalImages, cancelCurrentRequest]);

  // 监听文件夹/搜索变化
  useEffect(() => {
    if (!currentLibraryId) return;

    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 立即取消之前的请求（关键！）
    cancelCurrentRequest();

    // 🎯 优化：不立即清空图片，保持当前显示直到新数据加载完成
    // 只设置加载状态，让用户知道正在切换
    useImageStore.getState().setImageLoadingState({
      isLoading: true,
      loadedCount: imageLoadingState.loadedCount,
      totalCount: imageLoadingState.totalCount,
      hasMore: false
    });

    // 使用防抖避免快速连续点击
    debounceTimerRef.current = setTimeout(() => {
      loadImages(true); // 初始加载（会在完成时替换图片）
    }, 50);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentLibraryId, searchKeywords, selectedFolder, loadImages, cancelCurrentRequest]);

  // 恢复撤销前的文件夹状态
  useEffect(() => {
    const restoreFolder = localStorage.getItem('flypic_restore_folder');
    if (restoreFolder) {
      const { setSelectedFolder } = useImageStore.getState();
      setSelectedFolder(restoreFolder);
      localStorage.removeItem('flypic_restore_folder');
      console.log('✅ 已恢复到文件夹:', restoreFolder);
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelCurrentRequest();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // DOM 清理：取消待加载的图片，清理事件监听器
      domCleanup.cancelPendingLoads();
      domCleanup.removeAllEventListeners();
    };
  }, [cancelCurrentRequest]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Scan Progress - 简化版，无暂停按钮 */}
      {scanProgress && (
        <div className="p-4 border-b bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {scanProgress?.status === 'preparing' ? '正在准备扫描...' : '正在扫描素材库...'}
            </div>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {scanProgress?.percent || 0}%
            </span>
          </div>
          <div className="w-full rounded-full h-2 mb-2 bg-blue-200 dark:bg-blue-800">
            <div
              className="h-2 rounded-full transition-all bg-blue-500"
              style={{ width: `${scanProgress?.percent || 0}%` }}
            />
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400">
            已处理 {scanProgress?.current || 0} / {scanProgress?.total || 0} 张图片
            {getEstimatedTime() && ` · ${getEstimatedTime()}`}
          </div>
        </div>
      )}

      {/* Loading Progress */}
      {imageLoadingState.totalCount > 0 && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              已加载 {images.length} / {imageLoadingState.totalCount} 张
            </span>
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500"
                style={{ width: `${imageLoadingState.totalCount ? (images.length / imageLoadingState.totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {(!selectedFolder && !searchKeywords && filters.formats.length === 0) ? (
          <Dashboard />
        ) : (
          <ImageWaterfall />
        )}
      </div>
    </div>
  );
}

export default MainContent;
