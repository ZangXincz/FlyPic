/**
 * 图片瀑布流组件 - 重构版
 * 从 1880 行精简到 ~300 行，通过提取 hooks 和组件实现
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { PhotoProvider } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { VariableSizeList as List } from 'react-window';

// Stores
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';

// Custom Hooks
import { useWaterfallLayout } from '../hooks/useWaterfallLayout';
import { useImageDelete } from '../hooks/useImageDelete';
import { useConflictHandler } from '../hooks/useConflictHandler';
import { useImageClipboard } from '../hooks/useImageClipboard';
import { useImageMove } from '../hooks/useImageMove';
import { useImageRename } from '../hooks/useImageRename';
import { useImageRating } from '../hooks/useImageRating';
import { useImageUpload } from '../hooks/useImageUpload';
import { useImageKeyboard } from '../hooks/useImageKeyboard';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

// Utils
import { filterImages } from '../utils/imageFilters';
import { imageAPI } from '../api';

// Components
import ImageCell from './ImageCell';
import DragDropOverlay from './DragDropOverlay';
import UploadProgress from './UploadProgress';
import EmptyState from './EmptyState';
import FileViewer from './FileViewer';
import ContextMenu, { menuItems } from './ContextMenu';
import UndoToast from './UndoToast';
import RatingToast from './RatingToast';
import FolderSelector from './FolderSelector';
import ConflictDialog from './ConflictDialog';

// 虚拟滚动阈值
const VIRTUAL_SCROLL_THRESHOLD = 50;

// 加载配置
const LOAD_CONFIG = {
  overscanCount: 4, // 预渲染 4 行
};

function ImageWaterfall() {
  const { currentLibraryId } = useLibraryStore();
  const { 
    images, selectedImage, setSelectedImage, selectedImages, setSelectedImages, 
    toggleImageSelection, clearSelection, imageLoadingState, selectedFolder,
    searchKeywords, filters, folders, setSelectedFolderItem
  } = useImageStore();

  // 状态
  const [photoIndex, setPhotoIndex] = useState(-1);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: null, image: null });
  // 统一图片移动/删除撤销顺序的栈：按操作时间顺序记录 'move' | 'delete'
  const [undoStack, setUndoStack] = useState([]);
  const listRef = useRef(null);
  const prevRowCountRef = useRef(0);

  // 前端筛选
  const filteredImages = useMemo(() => {
    return filterImages(images, filters);
  }, [images, filters]);

  // 瀑布流布局
  const { rows, flatImages, containerRef, containerWidth, containerHeight, getRowHeight } = 
    useWaterfallLayout(filteredImages);

  // 删除和撤销
  const { undoHistory, undoToast, setUndoToast, handleQuickDelete, handleUndo } = 
    useImageDelete();

  // 统一冲突处理
  const { conflictDialog, showConflictDialog, hideConflictDialog, resolveConflict } = 
    useConflictHandler();

  // 剪贴板操作
  const { handleCopy, handlePaste, executePaste } = 
    useImageClipboard(showConflictDialog);

  // 移动功能
  const { 
    showFolderSelector, moveItems, handleMoveClick, handleMove, handleCancelMove, executeMove,
    undoHistory: moveUndoHistory, undoToast: moveUndoToast, setUndoToast: setMoveUndoToast, handleUndoMove
  } = useImageMove(showConflictDialog);

  // 重命名
  const { 
    renamingImage, 
    editingFilename, 
    editInputRef, 
    setEditingFilename, 
    handleStartRename, 
    handleFinishRename, 
    handleCancelRename 
  } = useImageRename();

  // 评分
  const { ratingToast, setRatingToast, handleQuickRating } = useImageRating();

  // 上传
  const { 
    isDraggingOver, 
    uploadProgress, 
    handleDragEnter, 
    handleDragOver, 
    handleDragLeave, 
    handleDrop: baseHandleDrop,
    uploadWithConflictAction
  } = useImageUpload();

  // 无限滚动
  const { loadMoreImages, preloadThreshold } = useInfiniteScroll();

  // 带撤销栈的删除
  const handleQuickDeleteWithUndoStack = useCallback(async () => {
    await handleQuickDelete();
    setUndoStack(prev => [...prev, 'delete']);
  }, [handleQuickDelete]);

  // 带撤销栈的移动（通过文件夹选择器触发）
  const handleMoveWithUndoStack = useCallback(async (targetFolder) => {
    await handleMove(targetFolder);
    setUndoStack(prev => [...prev, 'move']);
  }, [handleMove]);

  // 键盘快捷键（Ctrl+Z 按照 undoStack 顺序一步步撤销）
  useImageKeyboard({
    onDelete: handleQuickDeleteWithUndoStack,
    onUndo: async () => {
      // 检查撤销栏状态
      
      if (undoStack.length === 0) return;
      const last = undoStack[undoStack.length - 1];
      setUndoStack(prev => prev.slice(0, -1));

      // 准备撤销操作

      if (last === 'move' && moveUndoHistory.length > 0) {
        // 执行移动撤销
        await handleUndoMove();
      } else if (last === 'delete' && undoHistory.length > 0) {
        // 执行删除撤销
        await handleUndo();
      }
      
      // 撤销完成
    },
    onCopy: () => {
      const result = handleCopy();
      if (result.success) {
        setUndoToast({
          isVisible: true,
          message: `已复制 ${result.count} 个文件`,
          count: result.count
        });
        setTimeout(() => setUndoToast({ isVisible: false, message: '', count: 0 }), 2000);
      }
    },
    onPaste: handlePaste,
    onRename: handleStartRename,
    onRating: handleQuickRating,
    canUndo: undoStack.length > 0,
    canPaste: selectedFolder !== null
  });

  // 包装上传处理以集成冲突对话框
  const handleDrop = useCallback(async (e) => {
    await baseHandleDrop(e, (conflicts, files, targetFolder) => {
      showConflictDialog(conflicts, 'upload', { files, targetFolder });
    });
  }, [baseHandleDrop, showConflictDialog]);

  // 缩略图和原图 URL
  const getThumbnailUrl = useCallback((image) => {
    if (!currentLibraryId || !image.thumbnailPath) return '';
    const filename = image.thumbnailPath.replace(/\\/g, '/').split('/').pop();
    return imageAPI.getThumbnailUrl(currentLibraryId, filename);
  }, [currentLibraryId]);

  const getOriginalUrl = useCallback((image) => {
    if (!currentLibraryId) return '';
    return imageAPI.getOriginalUrl(currentLibraryId, image.path);
  }, [currentLibraryId]);

  // PhotoProvider 图片列表
  const providerImages = useMemo(() => {
    return filteredImages.map(img => ({ src: getOriginalUrl(img), key: img.id }));
  }, [filteredImages, getOriginalUrl]);

  // 图片点击处理
  const handleImageClick = useCallback((image, event, imageIndex) => {
    setSelectedFolderItem(null);
    
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleImageSelection(image);
      setLastSelectedIndex(imageIndex);
    } else if (event.shiftKey && lastSelectedIndex !== null) {
      event.preventDefault();
      const start = Math.min(lastSelectedIndex, imageIndex);
      const end = Math.max(lastSelectedIndex, imageIndex);
      const rangeImages = flatImages.slice(start, end + 1);
      setSelectedImages(rangeImages);
    } else {
      clearSelection();
      setSelectedImage(image);
      setLastSelectedIndex(imageIndex);
    }
  }, [flatImages, lastSelectedIndex, toggleImageSelection, setSelectedImages, clearSelection, setSelectedImage, setSelectedFolderItem]);

  // 图片双击处理
  const handleImageDoubleClick = useCallback((image, flatIndex) => {
    const fileType = image.fileType || 'image';
    if (fileType === 'image') {
      setPhotoIndex(flatIndex);
    } else {
      setViewerFile(image);
    }
  }, []);
  
  // 文件名双击处理（重命名）
  const handleFilenameDoubleClick = useCallback((e, image) => {
    // 始终阻止事件冒泡，避免触发图片放大
    e.stopPropagation();
    
    // 只在单选时允许双击重命名
    if (selectedImages.length === 0) {
      handleStartRename(image);
    }
  }, [selectedImages, handleStartRename]);

  // 右键菜单
  const handleContextMenu = useCallback((e, image) => {
    e.preventDefault();

    // 右键时，如果当前图片不在选区中，则将其设为新的选中项
    if (selectedImages.length === 0) {
      if (!selectedImage || selectedImage.id !== image.id) {
        clearSelection();
        setSelectedImage(image);
      }
    } else if (!selectedImages.some(img => img.id === image.id)) {
      // 已经有多选，但右键点在选区外，则重置为单选
      clearSelection();
      setSelectedImage(image);
    }

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      image
    });
  }, [selectedImages, selectedImage, clearSelection, setSelectedImage]);

  // 拖拽开始
  const handleDragStart = useCallback((e, image) => {
    const draggedImages = selectedImages.length > 0 && selectedImages.some(img => img.id === image.id)
      ? selectedImages
      : [image];
    
    const items = draggedImages.map(img => ({ type: 'file', path: img.path }));
    e.dataTransfer.setData('application/json', JSON.stringify({ items }));
    e.dataTransfer.effectAllowed = 'move';
  }, [selectedImages]);

  // 准备移动文件（用于右键菜单）
  const handlePrepareMove = useCallback(() => {
    const itemsToMove = selectedImages.length > 0
      ? selectedImages.map(img => ({ type: 'file', path: img.path }))
      : selectedImage
      ? [{ type: 'file', path: selectedImage.path }]
      : [];

    if (itemsToMove.length === 0) return;
    
    setContextMenu({ isOpen: false, position: null, image: null });
    handleMoveClick(itemsToMove);
  }, [selectedImages, selectedImage, handleMoveClick]);

  // 处理冲突解决（统一处理粘贴、移动、上传）
  const handleConflictResolveAll = useCallback(async (action) => {
    await resolveConflict(action, async (resolvedAction, operation) => {
      const { type, pendingOperation } = conflictDialog;
      
      try {
        if (type === 'paste') {
          await executePaste(pendingOperation.items, pendingOperation.targetFolder, resolvedAction);
        } else if (type === 'move') {
          await executeMove(pendingOperation.items, pendingOperation.targetFolder, resolvedAction);
          // 注意：不在这里推入 undoStack，由外层的 handleMoveWithUndoStack 统一管理
        } else if (type === 'upload') {
          const result = await uploadWithConflictAction(
            pendingOperation.files,
            pendingOperation.targetFolder,
            resolvedAction
          );
          if (result.success && !result.skipped) {
            setUndoToast({
              isVisible: true,
              message: `上传完成: 成功 ${result.successCount} 个${result.failedCount > 0 ? `, 失败 ${result.failedCount} 个` : ''}`,
              count: result.successCount
            });
            setTimeout(() => setUndoToast({ isVisible: false, message: '', count: 0 }), 3000);
          }
        }
      } catch (error) {
        alert(`操作失败: ${error.message || '未知错误'}`);
      }
    });
  }, [conflictDialog, resolveConflict, executePaste, executeMove, uploadWithConflictAction, setUndoToast]);

  // 右键菜单选项
  const getContextMenuOptions = useCallback((image) => {
    const isMultiSelection = selectedImages.length > 0;
    const menuOptions = [
      menuItems.copy(() => {
        setContextMenu({ isOpen: false, position: null, image: null });
        const result = handleCopy();
        if (result.success) {
          setUndoToast({
            isVisible: true,
            message: `已复制 ${result.count} 个文件`,
            count: result.count
          });
          setTimeout(() => setUndoToast({ isVisible: false, message: '', count: 0 }), 3000);
        }
      })
    ];
    
    if (!isMultiSelection) {
      menuOptions.push(
        menuItems.rename(() => {
          setContextMenu({ isOpen: false, position: null, image: null });
          handleStartRename(image);
        })
      );
    }
    
    menuOptions.push(
      menuItems.move(handlePrepareMove),
      menuItems.delete(async () => {
        setContextMenu({ isOpen: false, position: null, image: null });
        await handleQuickDelete();
      })
    );
    
    return menuOptions;
  }, [selectedImages, handlePrepareMove, handleStartRename, handleCopy, handleQuickDelete, setUndoToast]);

  // 渲染单行
  const renderRow = useCallback(({ index, style }) => {
    const row = rows[index];
    if (!row) return null;
    
    let flatIndexBase = 0;
    for (let i = 0; i < index; i++) {
      flatIndexBase += rows[i]?.length || 0;
    }
    
    return (
      <div style={{ ...style, paddingBottom: '32px' }} className="flex gap-4">
        {row.map((image, imageIndex) => {
          const flatIndex = flatIndexBase + imageIndex;
          const isSingleSelected = selectedImage?.id === image.id;
          const isMultiSelected = selectedImages.some(img => img.id === image.id);
          const isSelected = isSingleSelected || isMultiSelected;
          
          return (
            <ImageCell
              key={image.id}
              image={image}
              flatIndex={flatIndex}
              isSelected={isSelected}
              renamingImage={renamingImage}
              editingFilename={editingFilename}
              editInputRef={editInputRef}
              getThumbnailUrl={getThumbnailUrl}
              onImageClick={handleImageClick}
              onImageDoubleClick={handleImageDoubleClick}
              onContextMenu={handleContextMenu}
              onDragStart={handleDragStart}
              onEditingChange={setEditingFilename}
              onFinishRename={handleFinishRename}
              onCancelRename={handleCancelRename}
              onStartRename={handleStartRename}
            />
          );
        })}
      </div>
    );
  }, [
    rows, 
    selectedImage, 
    selectedImages, 
    renamingImage, 
    editingFilename, 
    getThumbnailUrl,
    handleImageClick,
    handleImageDoubleClick,
    handleContextMenu,
    handleDragStart,
    handleStartRename,
    handleFinishRename,
    handleCancelRename
  ]);

  // 虚拟列表更新
  useRef(() => {
    if (listRef.current && filteredImages.length > VIRTUAL_SCROLL_THRESHOLD) {
      const prevRowCount = prevRowCountRef.current;
      const currRowCount = rows.length;
      
      if (currRowCount > prevRowCount && prevRowCount > 0) {
        const resetIndex = Math.max(0, prevRowCount - 1);
        listRef.current.resetAfterIndex(resetIndex);
      } else if (currRowCount !== prevRowCount) {
        listRef.current.resetAfterIndex(0);
      }
      
      prevRowCountRef.current = currRowCount;
    }
  }, [rows, filteredImages.length]);

  // 是否启用虚拟滚动
  const useVirtualScroll = filteredImages.length > VIRTUAL_SCROLL_THRESHOLD;

  // 空状态
  if (!filteredImages.length) {
    return (
      <div 
        ref={containerRef} 
        className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <DragDropOverlay isVisible={isDraggingOver} />
        <UploadProgress progress={uploadProgress} />
        <EmptyState isLoading={imageLoadingState.isLoading} />
      </div>
    );
  }

  // 等待容器宽度初始化
  if (!containerWidth && filteredImages.length > 0) {
    return <div ref={containerRef} className="h-full overflow-hidden" />;
  }

  return (
    <div 
      ref={containerRef} 
      className="h-full overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DragDropOverlay isVisible={isDraggingOver} />
      <UploadProgress progress={uploadProgress} />
      
      <PhotoProvider
        images={providerImages}
        visible={photoIndex >= 0}
        onClose={() => setPhotoIndex(-1)}
        index={photoIndex}
        onIndexChange={setPhotoIndex}
      >
        {useVirtualScroll ? (
          <List
            ref={listRef}
            height={containerHeight || 600}
            width={containerWidth + 32}
            itemCount={rows.length}
            itemSize={getRowHeight}
            className="p-4"
            overscanCount={LOAD_CONFIG.overscanCount}
            onScroll={({ scrollOffset, scrollDirection }) => {
              if (scrollDirection === 'forward' && imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const totalHeight = rows.reduce((sum, _, i) => sum + getRowHeight(i), 0);
                const scrollBottom = scrollOffset + (containerHeight || 600);
                if (totalHeight - scrollBottom < preloadThreshold) {
                  loadMoreImages();
                }
              }
            }}
          >
            {renderRow}
          </List>
        ) : (
          <div 
            className="h-full overflow-y-auto p-4"
            onScroll={(e) => {
              if (imageLoadingState.hasMore && !imageLoadingState.isLoading) {
                const { scrollTop, scrollHeight, clientHeight } = e.target;
                if (scrollHeight - scrollTop - clientHeight < preloadThreshold) {
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
                    {row.map((image, imageIndex) => {
                      const flatIndex = flatIndexBase + imageIndex;
                      const isSingleSelected = selectedImage?.id === image.id;
                      const isMultiSelected = selectedImages.some(img => img.id === image.id);
                      const isSelected = isSingleSelected || isMultiSelected;
                      
                      return (
                        <ImageCell
                          key={image.id}
                          image={image}
                          flatIndex={flatIndex}
                          isSelected={isSelected}
                          renamingImage={renamingImage}
                          editingFilename={editingFilename}
                          editInputRef={editInputRef}
                          getThumbnailUrl={getThumbnailUrl}
                          onImageClick={handleImageClick}
                          onImageDoubleClick={handleImageDoubleClick}
                          onContextMenu={handleContextMenu}
                          onDragStart={handleDragStart}
                          onEditingChange={setEditingFilename}
                          onFinishRename={handleFinishRename}
                          onCancelRename={handleCancelRename}
                          onStartRename={handleStartRename}
                        />
                      );
                    })}
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
        onClose={() => setUndoToast({ isVisible: false, message: '', count: 0 })}
      />

      {/* 撤销移动提示 */}
      <UndoToast
        isVisible={moveUndoToast.isVisible}
        message={moveUndoToast.message}
        onUndo={handleUndoMove}
        onClose={() => setMoveUndoToast({ isVisible: false, message: '', count: 0 })}
      />

      {/* 评分提醒 */}
      <RatingToast
        isVisible={ratingToast.isVisible}
        rating={ratingToast.rating}
        count={ratingToast.count}
        onClose={() => setRatingToast({ isVisible: false, rating: 0, count: 0 })}
      />

      {/* 文件夹选择器 */}
      {showFolderSelector && (
        <FolderSelector
          folders={folders}
          currentFolder={selectedFolder}
          onSelect={handleMoveWithUndoStack}
          onClose={handleCancelMove}
        />
      )}

      {/* 冲突处理对话框 */}
      <ConflictDialog
        isOpen={conflictDialog.isOpen}
        conflicts={conflictDialog.conflicts}
        onResolve={handleConflictResolveAll}
        onCancel={hideConflictDialog}
      />
    </div>
  );
}

export default ImageWaterfall;
