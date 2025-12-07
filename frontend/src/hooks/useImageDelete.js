/**
 * 图片删除和撤销 Hook
 */

import { useState, useCallback } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { fileAPI, imageAPI } from '../api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useImageDelete');

/**
 * 图片删除和撤销功能
 * @returns {Object} 删除相关的状态和方法
 */
export const useImageDelete = () => {
  const { currentLibraryId } = useLibraryStore();
  const { 
    images, setImages, selectedImage, selectedImages, 
    clearSelection, folders, setFolders, selectedFolder 
  } = useImageStore();
  
  const [undoHistory, setUndoHistory] = useState([]); // 撤销历史栈，支持多次撤销
  const [undoToast, setUndoToast] = useState({ isVisible: false, message: '', count: 0 });

  /**
   * 快速删除（乐观更新，立即响应）
   */
  const handleQuickDelete = useCallback(async () => {
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
    
    // 4. 显示Toast（立即显示）
    setUndoToast({
      isVisible: true,
      message: `已将 ${items.length} 个文件移入临时文件夹（Ctrl+Z撤销 · ${newHistory.length}次）`,
      count: items.length
    });
    
    // 5. 后台执行API调用（不阻塞UI）
    Promise.all([
      fileAPI.delete(currentLibraryId, items),
      imageAPI.getFolders(currentLibraryId)
    ]).then(([deleteResult, foldersRes]) => {
      // 检查是否有失败的项
      if (deleteResult.failed.length > 0) {
        logger.warn(`⚠️ 删除失败: ${deleteResult.failed.length} 个文件`, deleteResult.failed);
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
      logger.error('删除失败:', error);
      // 失败时回滚UI
      setImages(images);
      setUndoHistory(undoHistory);
      setUndoToast({ isVisible: false, message: '', count: 0 });
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        setFolders(foldersRes.folders);
      });
      alert('删除失败: ' + (error.message || '未知错误'));
    });
  }, [selectedImages, selectedImage, images, currentLibraryId, undoHistory, folders, setImages, clearSelection, setFolders]);

  /**
   * 撤销删除 - 乐观更新，立即响应
   */
  const handleUndo = useCallback(async () => {
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
      useImageStore.getState().setSelectedFolder(restoredFolder);
      // 跳转到恢复的文件夹
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
      if (restoreResult.failed.length > 0) {
        logger.warn(`⚠️ 恢复失败: ${restoreResult.failed.length} 个文件`);
        const errorMsg = restoreResult.failed[0].error || '未知错误';
        
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
      logger.error('恢复失败:', error);
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
  }, [undoHistory, currentLibraryId, images, selectedFolder, folders, setImages, setFolders]);

  return {
    undoHistory,
    undoToast,
    setUndoToast,
    handleQuickDelete,
    handleUndo
  };
};
