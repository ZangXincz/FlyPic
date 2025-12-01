import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { VariableSizeList as List } from 'react-window';
import { Play, FileText, Palette, Music, File } from 'lucide-react';
import useStore from '../store/useStore';
import { imageAPI } from '../services/api';
import imageLoadService from '../services/imageLoadService';
import FileViewer from './FileViewer';

// 虚拟滚动阈值：超过此数量启用虚拟滚动
const VIRTUAL_SCROLL_THRESHOLD = 100;

// Web Worker 阈值：超过此数量使用 Worker 计算布局
const WORKER_THRESHOLD = 500;

function ImageWaterfall() {
  const { 
    filteredImages, 
    currentLibraryId, 
    thumbnailHeight, 
    selectedImage, 
    setSelectedImage,
    selectedImages,
    setSelectedImages,
    toggleImageSelection,
    clearSelection,
    isResizingPanels,
    imageLoadingState
  } = useStore();
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [workerRows, setWorkerRows] = useState([]); // Worker 计算的行

  // 监听容器宽度变化（使用 ResizeObserver + 去抖/阈值抑制）
  useEffect(() => {
    let resizeObserver = null;
    let retryCount = 0;
    const maxRetries = 10;

    // 使用 ref 记录上次宽度，避免频繁 setState
    const lastWidthRef = { current: 0 };
    let debounceTimer = null;

    const emitSize = (width, height) => {
      // 仅当差异超过阈值时更新，减少重算次数
      const threshold = 12; // px
      if (Math.abs(width - lastWidthRef.current) < threshold) return true;

      lastWidthRef.current = width;

      // 去抖：在一小段静止后再更新（拖动时降低重算频率）
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setContainerWidth(width);
        setContainerHeight(height);
      }, 50);
      return true;
    };

    const measureAndEmit = () => {
      if (containerRef.current) {
        // 预留 padding：与现有布局保持一致
        const width = containerRef.current.offsetWidth - 32;
        const height = containerRef.current.offsetHeight;
        if (width > 0) {
          return emitSize(width, height);
        }
      }
      return false;
    };

    const tryInit = () => {
      if (measureAndEmit()) {
        // 成功获取宽度，设置 ResizeObserver
        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => {
            // 拖动时跳过更新，避免频繁重算布局
            if (useStore.getState().isResizingPanels) return;
            measureAndEmit();
          });
          resizeObserver.observe(containerRef.current);
        }
      } else if (retryCount < maxRetries) {
        // 重试
        retryCount++;
        requestAnimationFrame(tryInit);
      }
    };

    // 使用 requestAnimationFrame 确保 DOM 已渲染
    requestAnimationFrame(tryInit);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

  // 拖动结束时（isResizingPanels 从 true -> false）立即测量一次
  useEffect(() => {
    if (isResizingPanels) return;
    if (!containerRef.current) return;
    const width = containerRef.current.offsetWidth - 32;
    const height = containerRef.current.offsetHeight;
    if (width > 0) {
      setContainerWidth(width);
      setContainerHeight(height);
      // 重置虚拟列表缓存
      if (listRef.current) {
        listRef.current.resetAfterIndex(0);
      }
    }
  }, [isResizingPanels]);

  // 是否使用 Worker 计算布局
  const useWorker = filteredImages.length > WORKER_THRESHOLD;

  // 跟踪图片数据变化，用于增量计算判断
  const prevImagesRef = useRef({ length: 0, firstId: null, libraryId: null });
  const incrementalModeRef = useRef(false);
  
  useEffect(() => {
    const prevLen = prevImagesRef.current.length;
    const currLen = filteredImages.length;
    const prevFirstId = prevImagesRef.current.firstId;
    const currFirstId = filteredImages[0]?.id;
    const prevLibraryId = prevImagesRef.current.libraryId;
    
    // 判断是否需要重置
    const shouldReset = 
      (prevLen > 0 && currLen === 0) ||  // 图片被清空
      (currFirstId !== prevFirstId) ||    // 第一张图片变了（切换文件夹/素材库）
      (currentLibraryId !== prevLibraryId); // 素材库变了
    
    if (shouldReset) {
      // 重置 Worker 状态
      setWorkerRows([]);
      requestIdRef.current = 0;
      incrementalModeRef.current = false;
      
      // 通知 Worker 重置缓存
      if (workerRef.current) {
        workerRef.current.postMessage({ reset: true, requestId: 0 });
      }
    } else if (currLen > prevLen) {
      // 图片数量增加，可以使用增量模式
      incrementalModeRef.current = true;
    }
    
    prevImagesRef.current = { 
      length: currLen, 
      firstId: currFirstId,
      libraryId: currentLibraryId
    };
  }, [filteredImages, currentLibraryId]);

  // 初始化 Web Worker
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      workerRef.current = new Worker(
        new URL('../workers/layoutWorker.js', import.meta.url),
        { type: 'module' }
      );
      
      workerRef.current.onmessage = (e) => {
        const { rows, requestId, duration, imageCount } = e.data;
        // 只处理最新的请求结果
        if (requestId === requestIdRef.current) {
          setWorkerRows(rows);
          if (imageCount > 500) {
            console.log(`📐 Worker layout: ${imageCount} images in ${duration.toFixed(1)}ms`);
          }
        }
      };
    }
    
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // 使用 Worker 计算布局（大量图片时）
  useEffect(() => {
    if (!useWorker || !workerRef.current || !filteredImages.length || !containerWidth) {
      return;
    }
    
    const requestId = ++requestIdRef.current;
    
    // 只传输必要的字段，减少数据传输开销
    // 对于大量图片，这可以显著减少序列化/反序列化时间
    const minimalImages = filteredImages.map(img => ({
      id: img.id,
      width: img.width,
      height: img.height,
      filename: img.filename,
      thumbnail_path: img.thumbnail_path,
      path: img.path,
      file_type: img.file_type,
      format: img.format
    }));
    
    workerRef.current.postMessage({
      images: minimalImages,
      containerWidth,
      targetHeight: thumbnailHeight,
      requestId,
      incremental: incrementalModeRef.current
    });
  }, [filteredImages, containerWidth, thumbnailHeight, useWorker]);

  // 同步计算布局（少量图片时直接在主线程计算）
  const syncRows = useMemo(() => {
    // 使用 Worker 时返回空数组，由 workerRows 提供数据
    if (useWorker) return [];
    
    if (!filteredImages.length || !containerWidth) {
      return [];
    }

    const gap = 16;
    const targetHeight = thumbnailHeight;
    
    const calculatedRows = [];
    let currentRow = [];
    let currentRowWidthSum = 0;

    filteredImages.forEach((image, index) => {
      const aspectRatio = image.width / image.height;
      const imageWidth = targetHeight * aspectRatio;
      
      currentRow.push({ 
        ...image, 
        originalWidth: imageWidth,
        aspectRatio: aspectRatio
      });
      currentRowWidthSum += imageWidth;
      
      const currentGaps = (currentRow.length - 1) * gap;
      const totalWidth = currentRowWidthSum + currentGaps;
      const isLastImage = index === filteredImages.length - 1;
      
      let shouldFinishRow = false;
      
      if (isLastImage) {
        shouldFinishRow = true;
      } else if (totalWidth >= containerWidth * 0.95) {
        // Row is almost full (95% or more) - finish it
        shouldFinishRow = true;
      } else {
        // Check if adding next image would overflow too much
        const nextImage = filteredImages[index + 1];
        if (nextImage) {
          const nextAspectRatio = nextImage.width / nextImage.height;
          const nextImageWidth = targetHeight * nextAspectRatio;
          const nextTotalWidth = currentRowWidthSum + nextImageWidth + (currentRow.length * gap);
          
          // If adding next image would exceed 120% of container width, finish current row
          if (nextTotalWidth > containerWidth * 1.2) {
            shouldFinishRow = true;
          }
        }
      }
      
      if (shouldFinishRow) {
        const totalGaps = (currentRow.length - 1) * gap;
        const availableWidth = containerWidth - totalGaps;
        
        // For last row with few images, limit the scale to avoid over-stretching
        let scale = availableWidth / currentRowWidthSum;
        
        if (isLastImage && currentRow.length < 3) {
          // Last row with 1-2 images: don't stretch too much
          scale = Math.min(scale, 1.2);
        }
        
        const rowHeight = targetHeight * scale;
        
        currentRow = currentRow.map(img => ({
          ...img,
          calculatedWidth: img.originalWidth * scale,
          calculatedHeight: rowHeight
        }));
        
        calculatedRows.push(currentRow);
        
        // Reset for next row
        currentRow = [];
        currentRowWidthSum = 0;
      }
    });

    return calculatedRows;
  }, [filteredImages, thumbnailHeight, containerWidth, useWorker]);

  // 统一使用的行数据：Worker 模式用 workerRows，否则用 syncRows
  const rows = useWorker ? workerRows : syncRows;

  const getThumbnailUrl = (image) => {
    if (!currentLibraryId || !image.thumbnail_path) return '';
    // 提取文件名（兼容反斜杠）
    const filename = image.thumbnail_path.replace(/\\/g, '/').split('/').pop();
    // 统一使用 480 尺寸（与 Billfish 一致）
    return imageAPI.getThumbnailUrl(currentLibraryId, '480', filename);
  };

  const getOriginalUrl = (image) => {
    if (!currentLibraryId) return '';
    return imageAPI.getOriginalUrl(currentLibraryId, image.path);
  };

  // PhotoProvider 使用与布局无关的列表，避免随 containerWidth 变化重建
  const providerImages = useMemo(() => {
    return filteredImages.map(img => ({ src: getOriginalUrl(img), key: img.id }));
  }, [filteredImages, currentLibraryId]);

  // 是否启用虚拟滚动
  const useVirtualScroll = filteredImages.length > VIRTUAL_SCROLL_THRESHOLD;

  // 获取行高（用于虚拟滚动）
  const getRowHeight = useCallback((index) => {
    if (!rows[index] || rows[index].length === 0) return thumbnailHeight + 40;
    // 行高 = 图片高度 + 文件名区域 + 行间距
    return rows[index][0].calculatedHeight + 28 + 32;
  }, [rows, thumbnailHeight]);

  // 跟踪上次的行数，用于增量更新虚拟列表
  const prevRowCountRef = useRef(0);
  
  // 当行数据变化时，智能更新虚拟列表缓存
  useEffect(() => {
    if (listRef.current && useVirtualScroll) {
      const prevRowCount = prevRowCountRef.current;
      const currRowCount = rows.length;
      
      if (currRowCount > prevRowCount && prevRowCount > 0) {
        // 增量更新：只重置新增的行
        // 从上一个最后一行开始重置（因为最后一行可能被重新计算）
        listRef.current.resetAfterIndex(Math.max(0, prevRowCount - 1));
      } else {
        // 完全重置
        listRef.current.resetAfterIndex(0);
      }
      
      prevRowCountRef.current = currRowCount;
    }
  }, [rows, useVirtualScroll]);

  // 扁平化的图片列表（用于 Shift 多选）
  const flatImages = useMemo(() => rows.flat(), [rows]);

  // 处理图片点击（支持 Ctrl/Shift 多选）
  const handleImageClick = useCallback((image, event, imageIndex) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd 点击：切换选中状态
      event.preventDefault();
      toggleImageSelection(image);
      setLastSelectedIndex(imageIndex);
    } else if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift 点击：范围选择
      event.preventDefault();
      const start = Math.min(lastSelectedIndex, imageIndex);
      const end = Math.max(lastSelectedIndex, imageIndex);
      const rangeImages = flatImages.slice(start, end + 1);
      setSelectedImages(rangeImages);
    } else {
      // 普通点击：单选
      clearSelection();
      setSelectedImage(image);
      setLastSelectedIndex(imageIndex);
    }
  }, [flatImages, lastSelectedIndex, toggleImageSelection, setSelectedImages, clearSelection, setSelectedImage]);

  // 渲染单个图片单元格
  const renderImageCell = (image, flatIndex) => {
    const isSingleSelected = selectedImage?.id === image.id;
    const isMultiSelected = selectedImages.some(img => img.id === image.id);
    const isSelected = isSingleSelected || isMultiSelected;
    
    return (
      <div
        key={image.id}
        className="flex-shrink-0"
        style={{ width: `${image.calculatedWidth}px` }}
      >
        <div
          className="relative group cursor-pointer overflow-hidden rounded-lg transition-all hover:shadow-lg"
          style={{ 
            height: `${image.calculatedHeight}px`,
            backgroundColor: '#2a2a2a',
            border: isSelected ? '3px solid #3b82f6' : '3px solid transparent'
          }}
          onClick={(e) => handleImageClick(image, e, flatIndex)}
          onDoubleClick={() => {
            const fileType = image.file_type || 'image';
            if (fileType === 'image') {
              setPhotoIndex(flatIndex);
            } else {
              setViewerFile(image);
            }
          }}
        >
          <img
            src={getThumbnailUrl(image)}
            alt={image.filename}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          
          {/* 文件类型标识 */}
          {image.file_type && image.file_type !== 'image' && (
            <div className={`absolute top-2 right-2 rounded-md px-2 py-1 flex items-center gap-1 shadow-lg ${
              image.file_type === 'video' ? 'bg-blue-500 bg-opacity-90' :
              image.file_type === 'audio' ? 'bg-pink-500 bg-opacity-90' :
              image.file_type === 'document' ? 'bg-green-500 bg-opacity-90' :
              image.file_type === 'design' ? 'bg-purple-500 bg-opacity-90' :
              'bg-gray-500 bg-opacity-90'
            }`}>
              {image.file_type === 'video' && <Play className="w-4 h-4 text-white fill-white" />}
              {image.file_type === 'audio' && <Music className="w-4 h-4 text-white" />}
              {image.file_type === 'document' && <FileText className="w-4 h-4 text-white" />}
              {image.file_type === 'design' && <Palette className="w-4 h-4 text-white" />}
              {image.file_type === 'other' && <File className="w-4 h-4 text-white" />}
              <span className="text-white text-xs font-semibold uppercase">
                {image.format || image.filename.split('.').pop()}
              </span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all pointer-events-none" />
        </div>
        <div className="mt-1 px-1">
          <p 
            className="text-xs truncate text-center transition-colors"
            style={{ 
              color: isSelected ? '#3b82f6' : '#909090',
              fontWeight: isSelected ? '600' : '400'
            }}
          >
            {image.filename}
          </p>
        </div>
      </div>
    );
  };

  // 渲染一行（用于虚拟滚动）
  const renderRow = ({ index, style }) => {
    const row = rows[index];
    if (!row) return null;
    
    // 计算该行之前的所有图片数量
    let flatIndexBase = 0;
    for (let i = 0; i < index; i++) {
      flatIndexBase += rows[i]?.length || 0;
    }
    
    return (
      <div style={{ ...style, paddingBottom: '32px' }} className="flex gap-4">
        {row.map((image, imageIndex) => renderImageCell(image, flatIndexBase + imageIndex))}
      </div>
    );
  };

  if (!filteredImages.length) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-lg mb-2">暂无图片</p>
          <p className="text-sm">请添加素材库或调整搜索条件</p>
        </div>
      </div>
    );
  }

  // Worker 正在计算中，显示加载状态（只在容器宽度已知且 Worker 已触发时）
  if (useWorker && rows.length === 0 && filteredImages.length > 0 && containerWidth > 0) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-sm">正在计算布局...</p>
        </div>
      </div>
    );
  }

  // 等待容器宽度初始化
  if (!containerWidth && filteredImages.length > 0) {
    return (
      <div ref={containerRef} className="h-full overflow-hidden" />
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-hidden">
      <PhotoProvider
        images={providerImages}
        visible={photoIndex >= 0}
        onClose={() => setPhotoIndex(-1)}
        index={photoIndex}
        onIndexChange={setPhotoIndex}
      >
        {useVirtualScroll ? (
          /* 虚拟滚动模式（>500张图片） */
          <List
            ref={listRef}
            height={containerHeight || 600}
            width={containerWidth + 32}
            itemCount={rows.length}
            itemSize={getRowHeight}
            className="p-4"
            overscanCount={3}
            onScroll={({ scrollOffset, scrollDirection }) => {
              // 滚动到接近底部时触发加载更多
              if (scrollDirection === 'forward' && imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const totalHeight = rows.reduce((sum, _, i) => sum + getRowHeight(i), 0);
                const scrollBottom = scrollOffset + (containerHeight || 600);
                // 距离底部 500px 时触发加载
                if (totalHeight - scrollBottom < 500) {
                  imageLoadService.loadNextBatch();
                }
              }
            }}
          >
            {renderRow}
          </List>
        ) : (
          /* 普通渲染模式（≤500张图片） */
          <div 
            className="h-full overflow-y-auto p-4"
            onScroll={(e) => {
              // 滚动到接近底部时触发加载更多
              if (imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const { scrollTop, scrollHeight, clientHeight } = e.target;
                if (scrollHeight - scrollTop - clientHeight < 500) {
                  imageLoadService.loadNextBatch();
                }
              }
            }}
          >
            <div className="space-y-8">
              {rows.map((row, rowIndex) => {
                let flatIndexBase = 0;
                for (let i = 0; i < rowIndex; i++) {
                  flatIndexBase += rows[i]?.length || 0;
                }
                return (
                  <div key={rowIndex} className="flex gap-4">
                    {row.map((image, imageIndex) => renderImageCell(image, flatIndexBase + imageIndex))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PhotoProvider>

      {/* 文件查看器 */}
      {viewerFile && (
        <FileViewer
          file={viewerFile}
          libraryId={currentLibraryId}
          onClose={() => setViewerFile(null)}
        />
      )}
    </div>
  );
}

export default ImageWaterfall;
