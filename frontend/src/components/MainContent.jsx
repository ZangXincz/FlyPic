import { useEffect, useRef, useState, useCallback } from 'react';
import { Pause, Play } from 'lucide-react';
import useStore from '../store/useStore';
import { imageAPI, scanAPI } from '../services/api';
import imageLoadService from '../services/imageLoadService';
import requestManager, { RequestType } from '../services/requestManager';
import ImageWaterfall from './ImageWaterfall';
import Dashboard from './Dashboard';

function MainContent() {
  const {
    currentLibraryId,
    searchKeywords,
    filters,
    selectedFolder,
    setImages,
    scanProgress,
    imageLoadingState
  } = useStore();

  // 使用 ref 跟踪最新的请求上下文
  const currentRequestContextRef = useRef(null);
  // 文件夹切换防抖
  const debounceTimerRef = useRef(null);
  // 扫描控制
  const [scanPaused, setScanPaused] = useState(false);
  const [isStoppingOrResuming, setIsStoppingOrResuming] = useState(false);

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

  // 加载图片 - 核心函数
  const loadImages = useCallback(async () => {
    if (!currentLibraryId) return;

    // 如果没有选中文件夹且没有搜索条件，显示 Dashboard
    if (!selectedFolder && !searchKeywords && filters.formats.length === 0) {
      setImages([]);
      useStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: 0,
        totalCount: 0,
        hasMore: false
      });
      return;
    }

    // 暂停空闲加载并取消之前的所有请求（关键！）
    imageLoadService.onUserActionStart();
    cancelCurrentRequest();

    // 使用 requestManager 创建请求上下文
    const requestContext = requestManager.createRequest(RequestType.IMAGES);
    currentRequestContextRef.current = requestContext;

    // 设置加载状态
    useStore.getState().setImageLoadingState({
      isLoading: true,
      loadedCount: 0,
      totalCount: 0,
      hasMore: false
    });

    try {
      // 构建请求参数
      const params = { offset: 0, limit: 200 };
      if (selectedFolder) params.folder = selectedFolder;
      if (searchKeywords) params.keywords = searchKeywords;
      if (filters.formats?.length > 0) params.formats = filters.formats.join(',');

      const response = await imageAPI.search(currentLibraryId, params, {
        signal: requestContext.signal
      });

      // 检查请求是否被取消
      if (!requestManager.isValid(requestContext.id)) {
        return;
      }

      const { images, total, hasMore } = response.data;
      
      // 标记请求完成
      requestManager.complete(requestContext.id);

      // 更新状态
      setImages(images);
      useStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: images.length,
        totalCount: total || images.length,
        hasMore: hasMore || false
      });

      // 如果还有更多数据，恢复空闲加载
      if (hasMore) {
        imageLoadService.onUserActionEnd();
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
  }, [currentLibraryId, searchKeywords, filters, selectedFolder, setImages, cancelCurrentRequest]);

  // 监听文件夹变化
  useEffect(() => {
    if (!currentLibraryId) return;

    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 立即取消之前的请求（关键！）
    cancelCurrentRequest();

    // 立即清空图片，让 UI 快速响应
    setImages([]);

    // 使用防抖避免快速连续点击
    debounceTimerRef.current = setTimeout(() => {
      loadImages();
    }, 50);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentLibraryId, searchKeywords, filters, selectedFolder, loadImages, cancelCurrentRequest, setImages]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cancelCurrentRequest();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [cancelCurrentRequest]);

  // 停止扫描
  const handleStopScan = async () => {
    if (!currentLibraryId || isStoppingOrResuming) return;
    setIsStoppingOrResuming(true);
    try {
      await scanAPI.stop(currentLibraryId);
      setScanPaused(true);
    } catch (error) {
      console.error('Error stopping scan:', error);
    } finally {
      setIsStoppingOrResuming(false);
    }
  };

  // 继续扫描
  const handleResumeScan = async () => {
    if (!currentLibraryId || isStoppingOrResuming) return;
    setIsStoppingOrResuming(true);
    try {
      if (scanProgress?.needsRescan) {
        await scanAPI.sync(currentLibraryId);
      } else {
        await scanAPI.resume(currentLibraryId);
      }
      setScanPaused(false);
    } catch (error) {
      console.error('Error resuming scan:', error);
    } finally {
      setIsStoppingOrResuming(false);
    }
  };

  // 同步扫描暂停状态
  useEffect(() => {
    if (!scanProgress) {
      setScanPaused(false);
    } else if (scanProgress.isPaused) {
      setScanPaused(true);
    } else if (scanProgress.percent === 100) {
      setScanPaused(false);
    }
  }, [scanProgress]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Scan Progress */}
      {scanProgress && (
        <div className={`p-4 border-b ${scanPaused
          ? 'bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700'
          : 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`text-sm font-medium ${scanPaused ? 'text-yellow-700 dark:text-yellow-300' : 'text-blue-700 dark:text-blue-300'}`}>
              {scanPaused ? '扫描已暂停' : scanProgress?.status === 'preparing' ? '正在准备扫描...' : '正在扫描素材库'}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${scanPaused ? 'text-yellow-600' : 'text-blue-600'}`}>
                {scanProgress?.percent || 0}%
              </span>
              {(scanProgress?.canStop || scanPaused) && (
                <button
                  onClick={scanPaused ? handleResumeScan : handleStopScan}
                  disabled={isStoppingOrResuming}
                  className={`p-1.5 rounded-md ${scanPaused ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} text-white`}
                >
                  {scanPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
          <div className={`w-full rounded-full h-2 mb-2 ${scanPaused ? 'bg-yellow-200' : 'bg-blue-200'}`}>
            <div
              className={`h-2 rounded-full transition-all ${scanPaused ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${scanProgress?.percent || 0}%` }}
            />
          </div>
          <div className={`text-xs ${scanPaused ? 'text-yellow-600' : 'text-blue-600'}`}>
            已处理 {scanProgress?.current || 0} / {scanProgress?.total || 0} 张图片
            {getEstimatedTime() && ` · ${getEstimatedTime()}`}
          </div>
        </div>
      )}

      {/* Loading Progress */}
      {imageLoadingState.hasMore && imageLoadingState.loadedCount > 0 && (
        <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              已加载 {imageLoadingState.loadedCount} / {imageLoadingState.totalCount} 张
            </span>
            <div className="w-32 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500"
                style={{ width: `${(imageLoadingState.loadedCount / imageLoadingState.totalCount) * 100}%` }}
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
