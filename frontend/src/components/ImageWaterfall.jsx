import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhotoProvider } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { VariableSizeList as List } from 'react-window';
import { Play, FileText, Palette, Music, File } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { useUIStore } from '../stores/useUIStore';
import { useScanStore } from '../stores/useScanStore';
import { useClipboardStore } from '../stores/useClipboardStore';
import { imageAPI, fileAPI } from '../api';
import requestManager, { RequestType } from '../services/requestManager';
import FileViewer from './FileViewer';
import ContextMenu, { menuItems } from './ContextMenu';
import UndoToast from './UndoToast';
import FolderSelector from './FolderSelector';
import ConflictDialog from './ConflictDialog';

// 虚拟滚动阈值：超过此数量启用虚拟滚动
const VIRTUAL_SCROLL_THRESHOLD = 100;

// 解析大小字符串为 KB
const parseSizeToKB = (sizeStr) => {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'B': return value / 1024;
    case 'KB': return value;
    case 'MB': return value * 1024;
    case 'GB': return value * 1024 * 1024;
    default: return 0;
  }
};

// 匹配大小范围
const matchSizeRange = (sizeKB, range) => {
  if (range.startsWith('>')) {
    const minStr = range.substring(1).trim();
    const minKB = parseSizeToKB(minStr);
    return sizeKB >= minKB;
  } else if (range.includes(' - ')) {
    const [minStr, maxStr] = range.split(' - ').map(s => s.trim());
    const minKB = parseSizeToKB(minStr);
    const maxKB = parseSizeToKB(maxStr);
    return sizeKB >= minKB && sizeKB < maxKB;
  }
  return false;
};

// 加载配置
const LOAD_CONFIG = {
  pageSize: 100,           // 每次加载 100 张（更轻量）
  preloadThreshold: 300,   // 距离边界 300px 时预加载
  overscanCount: 4,        // 预渲染 4 行（减少内存）
};

function ImageWaterfall() {
  const { currentLibraryId } = useLibraryStore();
  const { 
    images, selectedImage, setSelectedImage, selectedImages, setSelectedImages, 
    toggleImageSelection, clearSelection, imageLoadingState, selectedFolder, setSelectedFolder,
    searchKeywords, filters, appendImages, setImageLoadingState, setImages, folders, setFolders,
    renamingImage, setRenamingImage, updateImage
  } = useImageStore();
  
  const { thumbnailHeight, isResizingPanels } = useUIStore();
  
  // 前端筛选逻辑：基于 filters 过滤图片
  const filteredImages = useMemo(() => {
    const { formats, sizes, orientation } = filters;
    
    // 如果没有任何筛选条件，直接返回原始图片
    if ((!formats || formats.length === 0) && 
        (!sizes || sizes.length === 0) && 
        !orientation) {
      return images;
    }

    return images.filter(img => {
      // 格式筛选
      if (formats && formats.length > 0) {
        if (!formats.includes(img.format?.toLowerCase())) {
          return false;
        }
      }

      // 文件大小筛选
      if (sizes && sizes.length > 0) {
        const sizeKB = img.size / 1024;
        let matchesSize = false;
        
        for (const range of sizes) {
          if (matchSizeRange(sizeKB, range)) {
            matchesSize = true;
            break;
          }
        }
        
        if (!matchesSize) return false;
      }

      // 横竖图筛选
      if (orientation === 'horizontal') {
        if (img.width <= img.height) return false;
      } else if (orientation === 'vertical') {
        if (img.height <= img.width) return false;
      }

      return true;
    });
  }, [images, filters]);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: null, image: null });
  const [undoToast, setUndoToast] = useState({ isVisible: false, message: '', count: 0 });
  const [undoHistory, setUndoHistory] = useState([]); // 撤销历史栈，支持多次撤销
  const [showFolderSelector, setShowFolderSelector] = useState(false); // 显示文件夹选择器
  const [moveItems, setMoveItems] = useState([]); // 待移动的项
  const [editingFilename, setEditingFilename] = useState(''); // 编辑中的文件名
  const editInputRef = useRef(null); // 编辑输入框引用
  const [conflictDialog, setConflictDialog] = useState({ isOpen: false, conflicts: [], pendingPaste: null }); // 冲突对话框
  
  // 剪贴板状态
  const { copyToClipboard, getClipboard, hasClipboard } = useClipboardStore();

  // 监听文件夹切换，切换时关闭Toast
  useEffect(() => {
    // 文件夹切换时立即关闭Toast，避免重新计时
    setUndoToast({ isVisible: false, message: '', count: 0 });
  }, [selectedFolder]);

  // 全局快捷键监听 - Del 键删除, Ctrl+Z 撤销, F2/Enter 重命名, Ctrl+C 复制, Ctrl+V 粘贴
  useEffect(() => {
    const handleGlobalKeyDown = async (e) => {
      // 忽略输入框中的快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Ctrl+C → 复制
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          handleCopy();
        }
        return;
      }
      
      // Ctrl+V → 粘贴
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (hasClipboard() && selectedFolder) {
          e.preventDefault();
          await handlePaste();
        }
        return;
      }
      
      // Ctrl+Z → 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (undoHistory.length > 0) {
          await handleUndo();
        }
        return;
      }
      
      // F2 或 Enter → 重命名（仅单选时）
      if ((e.key === 'F2' || e.key === 'Enter') && selectedImage && selectedImages.length === 0) {
        e.preventDefault();
        handleStartRename(selectedImage);
        return;
      }
      
      // Del 键 → 直接移入回收站
      if (e.key === 'Delete') {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          await handleQuickDelete();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedImages, selectedImage, images, currentLibraryId, undoHistory, selectedFolder, hasClipboard]);

  // 简单的向下无限滚动加载
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
      console.error('Error loading more images:', error);
      requestManager.error(requestContext.id);
      setImageLoadingState({ isLoading: false });
    }
  }, [currentLibraryId, imageLoadingState, images.length, selectedFolder, searchKeywords, filters, appendImages, setImageLoadingState]);

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
            if (useUIStore.getState().isResizingPanels) return;
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

  // 布局计算（始终在主线程同步执行）
  const rows = useMemo(() => {
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
  }, [filteredImages, thumbnailHeight, containerWidth]);

  const getThumbnailUrl = (image) => {
    // 后端已统一转换为 camelCase
    const thumbnailPath = image.thumbnailPath;
    
    if (!currentLibraryId || !thumbnailPath) {
      return '';
    }
    // 提取文件名（兼容反斜杠）
    const filename = thumbnailPath.replace(/\\/g, '/').split('/').pop();
    // 使用分片结构，不再需要 size 参数
    return imageAPI.getThumbnailUrl(currentLibraryId, filename);
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
    if (!rows || !rows[index] || rows[index].length === 0) {
      return thumbnailHeight + 40;
    }
    // 行高 = 图片高度 + 文件名区域 + 行间距
    const firstImage = rows[index][0];
    return (firstImage?.calculatedHeight || thumbnailHeight) + 28 + 32;
  }, [rows, thumbnailHeight]);

  // 跟踪上次的行数，用于增量更新虚拟列表
  const prevRowCountRef = useRef(0);
  
  // 当行数据变化时，智能更新虚拟列表缓存
  useEffect(() => {
    if (listRef.current && useVirtualScroll) {
      const prevRowCount = prevRowCountRef.current;
      const currRowCount = rows.length;
      
      if (currRowCount > prevRowCount && prevRowCount > 0) {
        // 增量更新：只重置新增的行，保持滚动位置
        const resetIndex = Math.max(0, prevRowCount - 1);
        listRef.current.resetAfterIndex(resetIndex);
        
        // 不需要手动恢复滚动位置，react-window 会自动保持
      } else if (currRowCount !== prevRowCount) {
        // 完全重置（只在行数减少或首次加载时）
        listRef.current.resetAfterIndex(0);
      }
      
      prevRowCountRef.current = currRowCount;
    }
  }, [rows, useVirtualScroll]);

  // 扁平化的图片列表（用于 Shift 多选）
  const flatImages = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return rows.flat();
  }, [rows]);

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

  // 处理右键菜单
  const handleContextMenu = useCallback((e, image) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      image
    });
  }, []);

  // 撤销删除 - 乐观更新，立即响应
  const handleUndo = async () => {
    if (undoHistory.length === 0) return;
    
    // 从历史栈中取出最近的删除记录
    const lastDeleted = undoHistory[undoHistory.length - 1];
    const remainingHistory = undoHistory.slice(0, -1);
    
    // 1. 立即关闭Toast
    setUndoToast({ isVisible: false, message: '', count: 0 });
    
    // 2. 立即更新历史栈
    setUndoHistory(remainingHistory);
    
    // 3. 获取被恢复文件的文件夹路径
    const restoredFolder = lastDeleted.images[0]?.folder || null;
    
    // 4. 立即更新文件夹计数（乐观更新）
    const { folders, setFolders } = useImageStore.getState();
    if (folders && folders.length > 0) {
      const updatedFolders = folders.map(folder => {
        // 计算该文件夹下恢复的图片数量
        const restoredInFolder = lastDeleted.images.filter(img => 
          img.folder === folder.path || img.folder?.startsWith(folder.path + '/')
        ).length;
        
        if (restoredInFolder > 0) {
          return {
            ...folder,
            count: (folder.count || 0) + restoredInFolder
          };
        }
        return folder;
      });
      setFolders(updatedFolders);
    }
    
    // 5. 立即恢复图片到UI（乐观更新）
    if (restoredFolder && restoredFolder !== selectedFolder) {
      // 跨文件夹：先跳转，让文件夹加载自然显示图片
      setSelectedFolder(restoredFolder);
      console.log(`📂 跳转到文件夹: ${restoredFolder}`);
    } else {
      // 同文件夹：立即添加到列表
      const restoredImages = [...images, ...lastDeleted.images];
      setImages(restoredImages);
    }
    
    // 6. 后台执行API调用（不阻塞UI）
    Promise.all([
      fileAPI.restore(currentLibraryId, lastDeleted.items),
      imageAPI.getFolders(currentLibraryId)
    ]).then(([restoreResult, foldersRes]) => {
      // 检查恢复结果
      if (restoreResult.data.failed.length > 0) {
        console.warn(`⚠️ 恢复失败: ${restoreResult.data.failed.length} 个文件`);
        const errorMsg = restoreResult.data.failed[0].error || '未知错误';
        
        // 失败时回滚UI
        setUndoHistory(undoHistory);
        if (restoredFolder === selectedFolder) {
          setImages(images);
        }
        setFolders(foldersRes.folders);
        alert(`恢复失败: ${errorMsg}\n\n提示：超过5分钟的文件已移入系统回收站，请手动从回收站恢复。`);
      } else {
        // 成功时刷新文件夹列表以确保同步
        setFolders(foldersRes.folders);
      }
    }).catch(error => {
      console.error('恢复失败:', error);
      // 失败时回滚
      setUndoHistory(undoHistory);
      if (restoredFolder === selectedFolder) {
        setImages(images);
      }
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        setFolders(foldersRes.folders);
      });
      alert('恢复失败: ' + (error.message || '未知错误'));
    });
  };

  // 快速删除（乐观更新，立即响应）
  const handleQuickDelete = async () => {
    const items = selectedImages.length > 0
      ? selectedImages.map(img => ({ type: 'file', path: img.path }))
      : selectedImage
      ? [{ type: 'file', path: selectedImage.path }]
      : [];
    
    if (items.length === 0) return;
    
    // 保存被删除的图片信息（乐观更新）
    const deletingPaths = new Set(items.map(item => item.path));
    const deletedImagesList = images.filter(img => deletingPaths.has(img.path));
    
    // 1. 立即更新UI（乐观更新）- 最快的响应
    const remainingImages = images.filter(img => !deletingPaths.has(img.path));
    setImages(remainingImages);
    clearSelection();
    
    // 2. 立即更新文件夹计数（乐观更新）
    const { folders, setFolders } = useImageStore.getState();
    if (folders && folders.length > 0) {
      const updatedFolders = folders.map(folder => {
        // 计算该文件夹下被删除的图片数量
        const deletedInFolder = deletedImagesList.filter(img => 
          img.folder === folder.path || img.folder?.startsWith(folder.path + '/')
        ).length;
        
        if (deletedInFolder > 0) {
          return {
            ...folder,
            count: Math.max(0, (folder.count || 0) - deletedInFolder)
          };
        }
        return folder;
      });
      setFolders(updatedFolders);
    }
    
    // 3. 推入历史栈
    const newHistory = [...undoHistory, { 
      images: deletedImagesList, 
      paths: Array.from(deletingPaths),
      items: items
    }];
    setUndoHistory(newHistory);
    
    // 5. 显示Toast（立即显示）
    setUndoToast({
      isVisible: true,
      message: `已将 ${items.length} 个文件移入临时文件夹（Ctrl+Z撤销 · ${newHistory.length}次）`,
      count: items.length
    });
    
    // 6. 后台执行API调用（不阻塞UI）
    Promise.all([
      fileAPI.delete(currentLibraryId, items),
      imageAPI.getFolders(currentLibraryId)
    ]).then(([deleteResult, foldersRes]) => {
      // 检查是否有失败的项
      if (deleteResult.data.failed.length > 0) {
        console.warn(`⚠️ 删除失败: ${deleteResult.data.failed.length} 个文件`, deleteResult.data.failed);
        // 如果有失败，回滚UI
        setImages(images);
        setUndoHistory(undoHistory);
        setUndoToast({ isVisible: false, message: '', count: 0 });
        setFolders(foldersRes.folders);
        alert('删除失败: 部分文件无法删除');
      } else {
        // 成功时刷新文件夹列表（但已经被乐观更新了，这里主要是确保同步）
        setFolders(foldersRes.folders);
      }
    }).catch(error => {
      console.error('删除失败:', error);
      // 失败时回滚UI
      setImages(images);
      setUndoHistory(undoHistory);
      setUndoToast({ isVisible: false, message: '', count: 0 });
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        setFolders(foldersRes.folders);
      });
      alert('删除失败: ' + (error.message || '未知错误'));
    });
  };

  // 打开移动文件夹选择器
  const handleMoveClick = useCallback(() => {
    // 准备待移动的项
    const itemsToMove = selectedImages.length > 0
      ? selectedImages.map(img => ({ type: 'file', path: img.path }))
      : selectedImage
      ? [{ type: 'file', path: selectedImage.path }]
      : [];

    if (itemsToMove.length === 0) return;

    setMoveItems(itemsToMove);
    setShowFolderSelector(true);
    setContextMenu({ isOpen: false, position: null, image: null });
  }, [selectedImages, selectedImage]);

  // 执行移动
  const handleMove = useCallback(async (targetFolder) => {
    if (!currentLibraryId || moveItems.length === 0) return;

    setShowFolderSelector(false);

    // 1. 立即从当前列表中移除这些图片（乐观更新）
    const movedPaths = new Set(moveItems.map(item => item.path));
    const remainingImages = images.filter(img => !movedPaths.has(img.path));
    setImages(remainingImages);
    clearSelection();

    try {
      // 2. 后台执行移动和刷新（并行）
      const [result, foldersRes] = await Promise.all([
        fileAPI.move(currentLibraryId, moveItems, targetFolder),
        imageAPI.getFolders(currentLibraryId)
      ]);

      if (result.failed && result.failed.length > 0) {
        alert(`移动失败: ${result.failed[0].error}`);
        // 失败时恢复图片列表
        setImages(images);
      } else {
        console.log(`✅ 已移动 ${moveItems.length} 个文件到: ${targetFolder || '根目录'}`);
      }

      // 3. 刷新文件夹列表
      setFolders(foldersRes.folders);
    } catch (error) {
      console.error('移动失败:', error);
      alert('移动失败: ' + (error.message || '未知错误'));
      // 失败时恢复图片列表
      setImages(images);
    } finally {
      setMoveItems([]);
    }
  }, [currentLibraryId, moveItems, images, setImages, clearSelection, setFolders]);

  // 复制图片到系统剪贴板（支持多图，使用 HTML 格式）
  const copyImagesToSystemClipboard = async (images) => {
    try {
      // 检查 Clipboard API 是否可用
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
        console.warn('系统剪贴板 API 不可用');
        return false;
      }

      if (images.length === 0) return false;

      // 单张图片：直接复制为 PNG
      if (images.length === 1) {
        try {
          const img = images[0];
          const imageUrl = `/api/image/original/${currentLibraryId}/${img.path}`;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          // 转换为 PNG
          const canvas = document.createElement('canvas');
          const image = new Image();
          
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = URL.createObjectURL(blob);
          });
          
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0);
          
          URL.revokeObjectURL(image.src);
          
          const pngBlob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png');
          });
          
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': pngBlob
            })
          ]);
          
          return true;
        } catch (error) {
          console.warn('单图复制失败:', error);
          return false;
        }
      }

      // 多张图片：使用 HTML 格式（包含所有图片的 base64）
      try {
        const imageDataList = await Promise.all(
          images.map(async (img) => {
            const imageUrl = `/api/image/original/${currentLibraryId}/${img.path}`;
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve({
                  dataUrl: reader.result,
                  filename: img.filename
                });
              };
              reader.readAsDataURL(blob);
            });
          })
        );
        
        // 创建 HTML 格式（使用 span 包裹每张图片，消除间距）
        const htmlContent = imageDataList.map(({ dataUrl, filename }) => `<span><img src="${dataUrl}" alt="${filename}"></span>`).join('');
        
        // 创建纯文本格式（文件名列表）
        const textContent = images.map(img => img.filename).join('\n');
        
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([textContent], { type: 'text/plain' })
          })
        ]);
        
        return true;
      } catch (error) {
        console.warn('多图复制失败:', error);
        return false;
      }
    } catch (error) {
      console.warn('写入系统剪贴板失败:', error);
      return false;
    }
  };

  // 复制到剪贴板（立即更新应用内剪贴板，异步写入系统剪贴板）
  const handleCopy = useCallback(() => {
    const imagesToCopy = selectedImages.length > 0
      ? selectedImages
      : selectedImage
      ? [selectedImage]
      : [];

    if (imagesToCopy.length === 0) return;

    // 1. 立即写入应用内剪贴板（用于应用内粘贴，同步操作）
    const itemsToCopy = imagesToCopy.map(img => ({ type: 'file', path: img.path, data: img }));
    copyToClipboard(itemsToCopy, 'copy');
    console.log(`📋 已复制 ${itemsToCopy.length} 个文件到应用内剪贴板`);
    
    // 2. 立即显示Toast
    setUndoToast({
      isVisible: true,
      message: `已复制 ${itemsToCopy.length} 个文件`,
      count: itemsToCopy.length
    });
    
    // 3秒后自动隐藏
    setTimeout(() => {
      setUndoToast({ isVisible: false, message: '', count: 0 });
    }, 3000);
    
    // 3. 异步写入系统剪贴板（用于跨应用粘贴，不阻塞）
    copyImagesToSystemClipboard(imagesToCopy).then(success => {
      if (success) {
        console.log(`✅ 已写入系统剪贴板，可粘贴到外部应用`);
      }
    });
  }, [selectedImages, selectedImage, copyToClipboard, currentLibraryId]);

  // 粘贴（先检查冲突）
  const handlePaste = useCallback(async () => {
    if (!currentLibraryId || !selectedFolder) return;
    
    const { items } = getClipboard();
    if (!items || items.length === 0) return;

    // 检查目标文件夹中是否存在同名文件（包括源文件本身）
    const targetFolderImages = images.filter(img => img.folder === selectedFolder);
    const conflicts = [];
    
    for (const item of items) {
      const fileName = item.path.split('/').pop();
      const itemFolder = item.path.substring(0, item.path.lastIndexOf('/'));
      
      // 检查是否存在同名文件（包括源文件本身）
      const exists = targetFolderImages.some(img => img.filename === fileName);
      
      if (exists) {
        conflicts.push({ 
          path: item.path, 
          name: fileName,
          isSameLocation: itemFolder === selectedFolder // 标记是否在同一位置
        });
      }
    }

    // 如果有冲突，显示对话框
    if (conflicts.length > 0) {
      setConflictDialog({
        isOpen: true,
        conflicts,
        pendingPaste: { items, targetFolder: selectedFolder }
      });
    } else {
      // 没有冲突，直接执行粘贴
      await executePaste(items, selectedFolder, 'rename');
    }
  }, [currentLibraryId, selectedFolder, getClipboard, images]);

  // 执行粘贴操作
  const executePaste = useCallback(async (items, targetFolder, conflictAction) => {
    if (!currentLibraryId) return;

    console.log(`📋 开始粘贴 ${items.length} 个文件到: ${targetFolder}`);

    // 1. 立即更新文件夹计数（乐观更新）
    const { folders, setFolders } = useImageStore.getState();
    const originalFolders = folders; // 保存用于回滚
    
    if (folders && folders.length > 0) {
      const updatedFolders = folders.map(folder => {
        // 更新目标文件夹及其所有父文件夹的计数
        if (folder.path === targetFolder || targetFolder.startsWith(folder.path + '/')) {
          return {
            ...folder,
            count: (folder.count || 0) + items.length
          };
        }
        return folder;
      });
      setFolders(updatedFolders);
    }

    // 2. 立即显示Toast
    setUndoToast({
      isVisible: true,
      message: `已粘贴 ${items.length} 个文件`,
      count: items.length
    });
    
    // 3秒后自动隐藏
    setTimeout(() => {
      setUndoToast({ isVisible: false, message: '', count: 0 });
    }, 3000);

    // 3. 后台执行API调用（串行，确保文件夹数据是最新的）
    (async () => {
      try {
        // 先执行复制
        const result = await fileAPI.copy(currentLibraryId, items, targetFolder, conflictAction);
        
        // 处理结果
        const successCount = result.data.success?.length || 0;
        const failedCount = result.data.failed?.length || 0;
        
        if (failedCount > 0) {
          // 有失败的项，更新Toast提示
          setUndoToast({
            isVisible: true,
            message: successCount > 0 
              ? `已粘贴 ${successCount} 个文件，${failedCount} 个失败`
              : `粘贴失败: ${result.data.failed[0].error}`,
            count: successCount
          });
          
          setTimeout(() => {
            setUndoToast({ isVisible: false, message: '', count: 0 });
          }, 3000);
        }

        // 刷新当前文件夹的图片列表
        if (selectedFolder === targetFolder) {
          const params = { folder: selectedFolder };
          const response = await imageAPI.search(currentLibraryId, params);
          setImages(response.images);
        }

        // 复制完成后再刷新文件夹列表（确保拿到最新数据）
        const foldersRes = await imageAPI.getFolders(currentLibraryId);
        setFolders(foldersRes.folders);
      } catch (error) {
        console.error('粘贴失败:', error);
        // 失败时回滚文件夹计数
        setFolders(originalFolders);
        setUndoToast({ isVisible: false, message: '', count: 0 });
        alert('粘贴失败: ' + (error.message || '未知错误'));
      }
    })();
  }, [currentLibraryId, selectedFolder, setImages]);

  // 处理冲突对话框的选择
  const handleConflictResolve = useCallback(async (action) => {
    const { pendingPaste } = conflictDialog;
    if (!pendingPaste) return;

    setConflictDialog({ isOpen: false, conflicts: [], pendingPaste: null });
    await executePaste(pendingPaste.items, pendingPaste.targetFolder, action);
  }, [conflictDialog, executePaste]);

  // 取消冲突对话框
  const handleConflictCancel = useCallback(() => {
    setConflictDialog({ isOpen: false, conflicts: [], pendingPaste: null });
  }, []);

  // 开始重命名
  const handleStartRename = useCallback((image) => {
    if (!image) return;
    setRenamingImage(image);
    // 获取不带扩展名的文件名
    const nameWithoutExt = image.filename.substring(0, image.filename.lastIndexOf('.')) || image.filename;
    setEditingFilename(nameWithoutExt);
    // 延迟聚焦，确保输入框已渲染
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.select();
      }
    }, 50);
  }, [setRenamingImage]);

  // 完成重命名
  const handleFinishRename = useCallback(async () => {
    if (!renamingImage || !editingFilename.trim()) {
      setRenamingImage(null);
      setEditingFilename('');
      return;
    }

    const oldFilename = renamingImage.filename;
    const ext = oldFilename.substring(oldFilename.lastIndexOf('.'));
    const newFilename = editingFilename.trim() + ext;

    // 如果文件名没有改变，直接退出
    if (newFilename === oldFilename) {
      setRenamingImage(null);
      setEditingFilename('');
      return;
    }

    try {
      // 调用重命名API
      const result = await fileAPI.rename(currentLibraryId, renamingImage.path, newFilename);
      
      // 更新图片信息
      const newPath = result.data.newPath;
      const actualNewName = result.data.newName;
      updateImage(renamingImage.path, {
        path: newPath,
        filename: actualNewName
      });

      console.log(`✅ 重命名成功: ${oldFilename} → ${actualNewName}`);
    } catch (error) {
      console.error('重命名失败:', error);
      alert('重命名失败: ' + (error.message || '未知错误'));
    } finally {
      setRenamingImage(null);
      setEditingFilename('');
    }
  }, [renamingImage, editingFilename, currentLibraryId, updateImage]);

  // 取消重命名
  const handleCancelRename = useCallback(() => {
    setRenamingImage(null);
    setEditingFilename('');
  }, []);

  // 准备右键菜单选项
  const getContextMenuOptions = useCallback((image) => {
    const isMultiSelection = selectedImages.length > 0;
    const menuOptions = [];
    
    // 只在单选时显示重命名选项
    if (!isMultiSelection) {
      menuOptions.push(
        menuItems.rename(() => {
          setContextMenu({ isOpen: false, position: null, image: null });
          handleStartRename(image);
        })
      );
    }
    
    menuOptions.push(
      menuItems.copy(() => {
        setContextMenu({ isOpen: false, position: null, image: null });
        handleCopy();
      }),
      menuItems.move(handleMoveClick),
      menuItems.delete(async () => {
        setContextMenu({ isOpen: false, position: null, image: null });
        await handleQuickDelete();
      })
    );
    
    return menuOptions;
  }, [selectedImages, selectedImage, handleMoveClick, handleStartRename, handleCopy]);

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
          className={`relative group cursor-pointer overflow-hidden rounded-lg transition-all hover:shadow-lg ${
            isSelected 
              ? 'border-2 border-blue-400 dark:border-blue-500' 
              : 'border border-gray-200 dark:border-gray-600'
          }`}
          style={{ 
            height: `${image.calculatedHeight}px`
          }}
          onClick={(e) => handleImageClick(image, e, flatIndex)}
          onDoubleClick={() => {
            const fileType = image.fileType || 'image';
            if (fileType === 'image') {
              setPhotoIndex(flatIndex);
            } else {
              setViewerFile(image);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, image)}
          draggable={true}
          onDragStart={(e) => {
            // 准备拖拽的图片列表
            const draggedImages = selectedImages.length > 0 && selectedImages.some(img => img.id === image.id)
              ? selectedImages
              : [image];
            
            // 转换为 items 格式（type + path）
            const items = draggedImages.map(img => ({
              type: 'file',
              path: img.path
            }));
            
            e.dataTransfer.setData('application/json', JSON.stringify({ items }));
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <img
            src={getThumbnailUrl(image) || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext x="50%25" y="45%25" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="sans-serif" font-size="14"%3E需要同步%3C/text%3E%3Ctext x="50%25" y="60%25" dominant-baseline="middle" text-anchor="middle" fill="%23d1d5db" font-family="sans-serif" font-size="12"%3E点击同步按钮%3C/text%3E%3C/svg%3E'}
            alt={image.filename}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // 缩略图加载失败时显示占位符
              e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23fef2f2" width="200" height="200"/%3E%3Ctext x="50%25" y="45%25" dominant-baseline="middle" text-anchor="middle" fill="%23dc2626" font-family="sans-serif" font-size="14"%3E加载失败%3C/text%3E%3Ctext x="50%25" y="60%25" dominant-baseline="middle" text-anchor="middle" fill="%23f87171" font-family="sans-serif" font-size="12"%3E请重新同步%3C/text%3E%3C/svg%3E';
              e.target.onerror = null; // 防止无限循环
            }}
          />
          
          {/* 文件类型标识 */}
          {image.fileType && image.fileType !== 'image' && (
            <div className={`absolute top-2 right-2 rounded-md px-2 py-1 flex items-center gap-1 shadow-lg ${
              image.fileType === 'video' ? 'bg-blue-500 bg-opacity-90' :
              image.fileType === 'audio' ? 'bg-pink-500 bg-opacity-90' :
              image.fileType === 'document' ? 'bg-green-500 bg-opacity-90' :
              image.fileType === 'design' ? 'bg-purple-500 bg-opacity-90' :
              'bg-gray-500 bg-opacity-90'
            }`}>
              {image.fileType === 'video' && <Play className="w-4 h-4 text-white fill-white" />}
              {image.fileType === 'audio' && <Music className="w-4 h-4 text-white" />}
              {image.fileType === 'document' && <FileText className="w-4 h-4 text-white" />}
              {image.fileType === 'design' && <Palette className="w-4 h-4 text-white" />}
              {image.fileType === 'other' && <File className="w-4 h-4 text-white" />}
              <span className="text-white text-xs font-semibold uppercase">
                {image.format || image.filename.split('.').pop()}
              </span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all pointer-events-none" />
        </div>
        <div className="mt-1 px-1 h-4 flex items-center">
          {renamingImage?.id === image.id ? (
            // 编辑模式 - 保持与显示模式相同的样式，只添加下划线提示
            <input
              ref={editInputRef}
              type="text"
              value={editingFilename}
              onChange={(e) => setEditingFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFinishRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelRename();
                }
              }}
              onBlur={handleFinishRename}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-xs text-center bg-transparent border-none outline-none focus:outline-none underline decoration-2 decoration-blue-500 underline-offset-2 truncate leading-none"
              style={{ 
                color: isSelected ? '#3b82f6' : '#909090',
                fontWeight: isSelected ? '600' : '400',
                padding: 0,
                margin: 0,
                height: '1rem'
              }}
            />
          ) : (
            // 显示模式
            <p 
              className="text-xs truncate text-center transition-colors cursor-text m-0 leading-none"
              style={{ 
                color: isSelected ? '#3b82f6' : '#909090',
                fontWeight: isSelected ? '600' : '400',
                height: '1rem'
              }}
              onDoubleClick={(e) => {
                // 只在单选时允许双击重命名
                if (selectedImages.length === 0) {
                  e.stopPropagation();
                  handleStartRename(image);
                }
              }}
              title={selectedImages.length === 0 ? "双击重命名" : ""}
            >
              {image.filename}
            </p>
          )}
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

  // 加载中时显示空容器，避免闪烁"暂无图片"
  if (!filteredImages.length && imageLoadingState.isLoading) {
    return (
      <div ref={containerRef} className="h-full overflow-hidden" />
    );
  }

  // 真正没有图片时才显示提示
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
          /* 虚拟滚动模式 */
          <List
            ref={listRef}
            height={containerHeight || 600}
            width={containerWidth + 32}
            itemCount={rows.length}
            itemSize={getRowHeight}
            className="p-4"
            overscanCount={LOAD_CONFIG.overscanCount}
            onScroll={({ scrollOffset, scrollDirection }) => {
              // 向下滚动：接近底部时加载更多
              if (scrollDirection === 'forward' && imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const totalHeight = rows.reduce((sum, _, i) => sum + getRowHeight(i), 0);
                const scrollBottom = scrollOffset + (containerHeight || 600);
                if (totalHeight - scrollBottom < LOAD_CONFIG.preloadThreshold) {
                  loadMoreImages();
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
              // 向下滚动：接近底部时加载更多
              if (imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const { scrollTop, scrollHeight, clientHeight } = e.target;
                if (scrollHeight - scrollTop - clientHeight < LOAD_CONFIG.preloadThreshold) {
                  loadMoreImages();
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

      {/* 右键菜单 */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu({ isOpen: false, position: null, image: null })}
        options={contextMenu.image ? getContextMenuOptions(contextMenu.image) : []}
      />

      {/* 撤销删除提示 */}
      <UndoToast
        isVisible={undoToast.isVisible}
        message={undoToast.message}
        onUndo={handleUndo}
        onClose={() => {
          setUndoToast({ isVisible: false, message: '', count: 0 });
          // 不清空历史栈，允许Toast消失后仍可Ctrl+Z
        }}
      />

      {/* 文件夹选择器 */}
      {showFolderSelector && (
        <FolderSelector
          folders={folders}
          currentFolder={selectedFolder}
          onSelect={handleMove}
          onClose={() => {
            setShowFolderSelector(false);
            setMoveItems([]);
          }}
        />
      )}

      {/* 冲突处理对话框 */}
      <ConflictDialog
        isOpen={conflictDialog.isOpen}
        conflicts={conflictDialog.conflicts}
        onResolve={handleConflictResolve}
        onCancel={handleConflictCancel}
      />
    </div>
  );
}

export default ImageWaterfall;
