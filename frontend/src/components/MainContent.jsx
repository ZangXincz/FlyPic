import { useEffect, useRef, useState, useCallback } from 'react';
import { Pause, Play } from 'lucide-react';
import useStore from '../store/useStore';
import { imageAPI, scanAPI } from '../services/api';
import ImageWaterfall from './ImageWaterfall';
import Dashboard from './Dashboard';

function MainContent() {
  const {
    currentLibraryId,
    searchKeywords,
    filters,
    selectedFolder,
    setImages,
    setTotalImageCount,
    scanProgress,
    scanStartTime
  } = useStore();

  // 使用 ref 跟踪最新的请求
  const loadingRequestRef = useRef(0);
  // 文件夹切换防抖
  const folderDebounceRef = useRef(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  // 计算预估剩余时间（优先使用后端提供的estimatedTimeLeft）
  const getEstimatedTime = () => {
    if (!scanProgress || scanProgress.current === 0) {
      return null;
    }

    // 优先使用后端提供的预估时间
    if (scanProgress.estimatedTimeLeft !== undefined) {
      const seconds = scanProgress.estimatedTimeLeft;
      if (seconds < 1) return '即将完成';
      if (seconds < 60) return `剩余约 ${seconds} 秒`;
      if (seconds < 3600) {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return sec > 0 ? `剩余约 ${min} 分 ${sec} 秒` : `剩余约 ${min} 分钟`;
      }
      const hrs = Math.floor(seconds / 3600);
      const min = Math.floor((seconds % 3600) / 60);
      return min > 0 ? `剩余约 ${hrs} 小时 ${min} 分钟` : `剩余约 ${hrs} 小时`;
    }

    // 降级：使用前端计算
    if (!scanStartTime) return null;
    const elapsed = Date.now() - scanStartTime;
    const progress = scanProgress.current / scanProgress.total;
    if (progress === 0) return null;

    const remaining = (elapsed / progress) - elapsed;
    const seconds = Math.ceil(remaining / 1000);

    if (seconds < 60) return `剩余约 ${seconds} 秒`;
    if (seconds < 3600) {
      const min = Math.floor(seconds / 60);
      const sec = seconds % 60;
      return sec > 0 ? `剩余约 ${min} 分 ${sec} 秒` : `剩余约 ${min} 分钟`;
    }
    const hrs = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    return min > 0 ? `剩余约 ${hrs} 小时 ${min} 分钟` : `剩余约 ${hrs} 小时`;
  };

  // 使用 ref 追踪上次的 libraryId，避免重复加载
  const lastLibraryIdRef = useRef(null);
  // 扫描控制
  const [scanPaused, setScanPaused] = useState(false);
  const [isStoppingOrResuming, setIsStoppingOrResuming] = useState(false);

  useEffect(() => {
    if (currentLibraryId) {
      // 文件夹切换使用防抖（30ms），避免快速点击导致多次请求
      if (folderDebounceRef.current) {
        clearTimeout(folderDebounceRef.current);
      }

      folderDebounceRef.current = setTimeout(() => {
        loadImages();
      }, selectedFolder !== null ? 30 : 0); // 选择文件夹时防抖，清空时立即加载

      // 只在切换素材库时加载文件夹和总数
      if (lastLibraryIdRef.current !== currentLibraryId) {
        loadFolders();
        lastLibraryIdRef.current = currentLibraryId;
      }
    }

    return () => {
      if (folderDebounceRef.current) {
        clearTimeout(folderDebounceRef.current);
      }
    };
  }, [currentLibraryId, searchKeywords, filters, selectedFolder]);

  const loadImages = useCallback(async () => {
    if (!currentLibraryId) return;

    // 递增请求ID
    const requestId = ++loadingRequestRef.current;

    // Optimization: If no folder selected and no search/filters, do NOT fetch images
    // This prevents loading all images when showing Dashboard
    if (!selectedFolder && !searchKeywords && filters.formats.length === 0) {
      if (requestId === loadingRequestRef.current) {
        setImages([]); // Clear images to save memory
        setIsLoadingImages(false);
      }
      return;
    }

    setIsLoadingImages(true);

    try {
      const params = {
        keywords: searchKeywords,
        ...filters
      };

      // 只有选中了文件夹才添加 folder 参数
      if (selectedFolder) {
        params.folder = selectedFolder;
      }

      const response = await imageAPI.search(currentLibraryId, params);

      // 只有当这是最新的请求时才更新状态
      if (requestId === loadingRequestRef.current) {
        setImages(response.data.images);

        // 无筛选条件时，同步更新总数
        if (!selectedFolder && !searchKeywords) {
          setTotalImageCount(response.data.images.length);
        }
      }
    } catch (error) {
      // 只有当这是最新的请求时才显示错误
      if (requestId === loadingRequestRef.current) {
        console.error('Error loading images:', error);
      }
    } finally {
      if (requestId === loadingRequestRef.current) {
        setIsLoadingImages(false);
      }
    }
  }, [currentLibraryId, searchKeywords, filters, selectedFolder, setImages, setTotalImageCount]);

  const loadFolders = async () => {
    if (!currentLibraryId) return;

    try {
      const response = await imageAPI.getFolders(currentLibraryId);
      useStore.getState().setFolders(response.data.folders);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

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
        // 应用重启后的恢复：使用增量同步
        console.log('🔄 使用增量同步恢复扫描');
        await scanAPI.sync(currentLibraryId);
      } else {
        // 正常继续扫描
        await scanAPI.resume(currentLibraryId);
      }
      setScanPaused(false);
    } catch (error) {
      console.error('Error resuming scan:', error);
    } finally {
      setIsStoppingOrResuming(false);
    }
  };

  // 当扫描进度变化时同步暂停状态
  useEffect(() => {
    if (!scanProgress) {
      setScanPaused(false);
    } else if (scanProgress.isPaused) {
      // 从 Sidebar/App 恢复的暂停状态
      setScanPaused(true);
    } else if (scanProgress.percent === 100) {
      // 扫描完成时清除暂停状态
      setScanPaused(false);
    }
  }, [scanProgress]);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Scan Progress - 只有当有进度数据时才显示 */}
      {scanProgress && (
        <div className={`p-4 border-b ${scanPaused
          ? 'bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700'
          : 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700'
          }`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`text-sm font-medium ${scanPaused
              ? 'text-yellow-700 dark:text-yellow-300'
              : 'text-blue-700 dark:text-blue-300'
              }`}>
              {scanPaused
                ? '扫描已暂停'
                : scanProgress?.status === 'preparing'
                  ? '正在准备扫描...'
                  : '正在扫描素材库，期间请勿操作，会影响扫描速度'
              }
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${scanPaused
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
                }`}>
                {scanProgress?.percent || 0}%
              </span>
              {/* 停止/继续按钮 */}
              {(scanProgress?.canStop || scanPaused) && (
                <button
                  onClick={scanPaused ? handleResumeScan : handleStopScan}
                  disabled={isStoppingOrResuming}
                  className={`p-1.5 rounded-md transition-colors ${scanPaused
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    } ${isStoppingOrResuming ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={scanPaused ? '继续扫描' : '暂停扫描'}
                >
                  {isStoppingOrResuming ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : scanPaused ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
          <div className={`w-full rounded-full h-2 mb-2 ${scanPaused
            ? 'bg-yellow-200 dark:bg-yellow-800'
            : 'bg-blue-200 dark:bg-blue-800'
            }`}>
            <div
              className={`h-2 rounded-full transition-all duration-300 ${scanPaused
                ? 'bg-yellow-500'
                : scanProgress?.status === 'preparing'
                  ? 'bg-blue-400 animate-pulse'
                  : 'bg-blue-500'
                }`}
              style={{ width: `${scanProgress?.percent || 0}%` }}
            />
          </div>
          <div className={`flex items-center justify-between text-xs ${scanPaused
            ? 'text-yellow-600 dark:text-yellow-400'
            : 'text-blue-600 dark:text-blue-400'
            }`}>
            <span>
              {scanPaused
                ? scanProgress?.needsRescan
                  ? `上次扫描中断于 ${scanProgress?.current || 0} 张，点击继续完成`
                  : `已处理 ${scanProgress?.current || 0} 张，剩余 ${scanProgress?.pendingCount || (scanProgress?.total - scanProgress?.current) || 0} 张待处理`
                : scanProgress?.status === 'preparing'
                  ? '正在初始化...'
                  : `已处理 ${scanProgress?.current || 0} / ${scanProgress?.total || 0} 张图片`
              }
            </span>
            <span>
              {scanPaused
                ? scanProgress?.needsRescan ? '需要继续' : '暂停中'
                : (getEstimatedTime() || '扫描完成后将自动显示')
              }
            </span>
          </div>
        </div>
      )}

      {/* Content Area */}
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
