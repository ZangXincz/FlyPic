/**
 * 图片/文件夹移动 Hook
 */

import { useState, useCallback } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { fileAPI, imageAPI } from '../api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useImageMove');

/**
 * 图片/文件夹移动功能
 * @param {Function} showConflictDialog - 显示冲突对话框的回调
 * @returns {Object} 移动相关的状态和方法
 */
export const useImageMove = (showConflictDialog) => {
  const { currentLibraryId } = useLibraryStore();
  const { 
    images, setImages, selectedImage, selectedImages, 
    clearSelection, folders, setFolders, selectedFolder, setSelectedFolder
  } = useImageStore();
  
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [moveItems, setMoveItems] = useState([]);
  const [undoHistory, setUndoHistory] = useState([]); // 撤销历史栈
  const [undoToast, setUndoToast] = useState({ isVisible: false, message: '', count: 0 });

  /**
   * 打开文件夹选择器（准备移动）
   */
  const handleMoveClick = useCallback((itemsToMove) => {
    if (!itemsToMove || itemsToMove.length === 0) return;
    
    setMoveItems(itemsToMove);
    setShowFolderSelector(true);
  }, []);

  /**
   * 检查目标文件夹是否存在冲突
   */
  const checkMoveConflicts = useCallback(async (itemsToMove, targetFolder) => {
    if (!currentLibraryId) return [];
    
    try {
      // 从后端获取目标文件夹的图片列表
      const response = await imageAPI.search(currentLibraryId, { folder: targetFolder });
      const targetFolderImages = response.images || [];
      const conflicts = [];
      
      for (const item of itemsToMove) {
        const fileName = item.path.split('/').pop();
        const itemFolder = item.path.substring(0, item.path.lastIndexOf('/'));
        
        // 检查是否存在同名文件
        const exists = targetFolderImages.some(img => img.filename === fileName);
        
        if (exists) {
          conflicts.push({ 
            path: item.path, 
            name: fileName,
            isSameLocation: itemFolder === targetFolder
          });
        }
      }
      
      return conflicts;
    } catch (error) {
      logger.error('检查移动冲突失败:', error);
      return [];
    }
  }, [currentLibraryId]);

  /**
   * 执行移动操作
   */
  const executeMove = useCallback(async (items, targetFolder, conflictAction = 'rename') => {
    if (!currentLibraryId) return;

    logger.file(`开始移动 ${items.length} 个文件到: ${targetFolder}`);

    // 1. 立即从当前列表中移除这些图片（乐观更新）
    const movedPaths = new Set(items.map(item => item.path));
    const remainingImages = images.filter(img => !movedPaths.has(img.path));
    setImages(remainingImages);
    clearSelection();
    
    // 2. 立即更新文件夹计数（乐观更新）
    const originalFolders = folders; // 保存用于回滚
    
    if (folders && folders.length > 0) {
      const movedImages = images.filter(img => movedPaths.has(img.path));
      
      const updatedFolders = folders.map(folder => {
        // 减少源文件夹计数
        const movedFromFolder = movedImages.filter(img => 
          img.folder === folder.path || img.folder?.startsWith(folder.path + '/')
        ).length;
        
        // 增加目标文件夹计数
        const movedToFolder = (folder.path === targetFolder || targetFolder.startsWith(folder.path + '/'))
          ? items.length
          : 0;
        
        const newCount = (folder.count || 0) - movedFromFolder + movedToFolder;
        
        if (movedFromFolder > 0 || movedToFolder > 0) {
          return {
            ...folder,
            count: Math.max(0, newCount)
          };
        }
        return folder;
      });
      setFolders(updatedFolders);
    }

    // 3. 保存移动记录（用于撤销）
    const movedImagesList = images.filter(img => movedPaths.has(img.path));
    const sourceFolders = new Map();
    movedImagesList.forEach(img => {
      sourceFolders.set(img.path, img.folder);
    });

    // 4. 后台执行API调用
    try {
      const result = await fileAPI.move(currentLibraryId, items, targetFolder, conflictAction);
      
      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;
      
      // 5. 推入历史栈（用于撤销）
      if (successCount > 0) {
        const newHistory = [...undoHistory, {
          items,
          targetFolder,
          sourceFolders: Array.from(sourceFolders.entries()),
          images: movedImagesList
        }];
        setUndoHistory(newHistory);
        
        // 显示撤销提示
        setUndoToast({
          isVisible: true,
          message: `已移动 ${successCount} 个文件`,
          count: successCount
        });
        
        // 3秒后自动隐藏
        setTimeout(() => {
          setUndoToast({ isVisible: false, message: '', count: 0 });
        }, 3000);
      }
      
      // 6. 刷新文件夹列表（确保数据同步）
      const foldersRes = await imageAPI.getFolders(currentLibraryId);
      setFolders(foldersRes.folders);
      
      // 7. 刷新当前文件夹的图片列表（无论是源还是目标）
      if (selectedFolder) {
        const params = { folder: selectedFolder };
        const response = await imageAPI.search(currentLibraryId, params);
        setImages(response.images);
      }
      
      logger.file(`移动完成: 成功 ${successCount} 个${failedCount > 0 ? `, 失败 ${failedCount} 个` : ''}`);
      
      return { success: true, successCount, failedCount };
    } catch (error) {
      logger.error('移动失败:', error);
      // 失败时回滚
      setImages(images);
      setFolders(originalFolders);
      setUndoToast({ isVisible: false, message: '', count: 0 });
      throw error;
    }
  }, [currentLibraryId, images, folders, selectedFolder, setImages, setFolders, clearSelection]);

  /**
   * 处理移动请求（带冲突检测）
   */
  const handleMove = useCallback(async (targetFolder) => {
    if (!currentLibraryId || moveItems.length === 0) return;

    setShowFolderSelector(false);

    // 检查冲突（异步）
    const conflicts = await checkMoveConflicts(moveItems, targetFolder);
    
    if (conflicts.length > 0 && showConflictDialog) {
      // 有冲突，显示对话框
      showConflictDialog(conflicts, 'move', {
        items: moveItems,
        targetFolder
      });
    } else {
      // 无冲突，直接执行移动
      try {
        await executeMove(moveItems, targetFolder, 'rename');
        setMoveItems([]);
      } catch (error) {
        alert('移动失败: ' + (error.message || '未知错误'));
      }
    }
  }, [currentLibraryId, moveItems, checkMoveConflicts, showConflictDialog, executeMove]);

  /**
   * 取消移动
   */
  const handleCancelMove = useCallback(() => {
    setShowFolderSelector(false);
    setMoveItems([]);
  }, []);

  /**
   * 撤销移动 - 把文件移回原位置
   */
  const handleUndoMove = useCallback(async () => {
    if (undoHistory.length === 0) return;
    
    // 从历史栈中取出最近的移动记录
    const lastMove = undoHistory[undoHistory.length - 1];
    const remainingHistory = undoHistory.slice(0, -1);
    
    // 1. 立即关闭Toast
    setUndoToast({ isVisible: false, message: '', count: 0 });
    
    // 2. 立即更新历史栈
    setUndoHistory(remainingHistory);
    
    // 3. 构造撤销移动项（移回每个文件的原文件夹）
    const undoItems = [];
    const sourceMap = new Map(lastMove.sourceFolders);
    
    for (const item of lastMove.items) {
      const sourceFolder = sourceMap.get(item.path);
      if (sourceFolder !== undefined) {
        undoItems.push({
          ...item,
          sourceFolder
        });
      }
    }
    
    if (undoItems.length === 0) return;
    
    // 4. 按原文件夹分组（可能移到不同的原文件夹）
    const groupedBySource = new Map();
    for (const item of undoItems) {
      const source = item.sourceFolder;
      if (!groupedBySource.has(source)) {
        groupedBySource.set(source, []);
      }
      groupedBySource.get(source).push({
        type: item.type,
        path: item.path.split('/').pop() // 只要文件名，会自动加上 targetFolder 前缀
      });
    }
    
    // 5. 获取主要的源文件夹（大多数文件的源文件夹）
    let primarySourceFolder = null;
    if (groupedBySource.size > 0) {
      // 选择包含最多文件的源文件夹
      let maxCount = 0;
      for (const [folder, items] of groupedBySource.entries()) {
        if (items.length > maxCount) {
          maxCount = items.length;
          primarySourceFolder = folder;
        }
      }
    }
    
    // 6. 乐观更新UI - 如果在目标文件夹，移除这些文件
    if (selectedFolder === lastMove.targetFolder) {
      const undoPaths = new Set(undoItems.map(item => item.path.split('/').pop()));
      const remainingImages = images.filter(img => !undoPaths.has(img.filename));
      setImages(remainingImages);
    }
    
    // 7. 自动切换到主要源文件夹（让用户看到撤销后的文件）
    if (primarySourceFolder && selectedFolder !== primarySourceFolder) {
      setSelectedFolder(primarySourceFolder);
    }
    
    // 8. 后台执行撤销移动（并行移动到各自的源文件夹）
    Promise.all(
      Array.from(groupedBySource.entries()).map(([sourceFolder, items]) => {
        // 构造完整路径的 items
        const fullPathItems = items.map(item => ({
          type: item.type,
          path: `${lastMove.targetFolder}/${item.path}`
        }));
        return fileAPI.move(currentLibraryId, fullPathItems, sourceFolder, 'rename');
      })
    ).then(async () => {
      // 刷新文件夹列表
      const foldersRes = await imageAPI.getFolders(currentLibraryId);
      setFolders(foldersRes.folders);
      
      // 刷新当前文件夹（现在应该是源文件夹之一）
      if (selectedFolder) {
        const params = { folder: selectedFolder };
        const response = await imageAPI.search(currentLibraryId, params);
        setImages(response.images);
      }
      
      logger.file('撤销移动完成');
    }).catch(error => {
      logger.error('撤销移动失败:', error);
      // 失败时回滚
      setUndoHistory(undoHistory);
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        setFolders(foldersRes.folders);
      });
      if (selectedFolder) {
        imageAPI.search(currentLibraryId, { folder: selectedFolder }).then(response => {
          setImages(response.images);
        });
      }
      alert('撤销移动失败: ' + (error.message || '未知错误'));
    });
  }, [undoHistory, currentLibraryId, images, selectedFolder, folders, setImages, setFolders, setSelectedFolder]);

  return {
    showFolderSelector,
    moveItems,
    handleMoveClick,
    handleMove,
    handleCancelMove,
    executeMove,
    undoHistory,
    undoToast,
    setUndoToast,
    handleUndoMove
  };
};
