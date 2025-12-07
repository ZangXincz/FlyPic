/**
 * 图片剪贴板操作 Hook（重构版 - 使用统一冲突处理）
 */

import { useCallback } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useClipboardStore } from '../stores/useClipboardStore';
import { fileAPI, imageAPI } from '../api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useImageClipboard');

/**
 * 图片剪贴板功能（复制粘贴）
 * @param {Function} showConflictDialog - 显示冲突对话框的回调
 * @returns {Object} 剪贴板相关的状态和方法
 */
export const useImageClipboard = (showConflictDialog) => {
  const { currentLibraryId } = useLibraryStore();
  const { 
    selectedImage, selectedImages, images, setImages,
    selectedFolder, folders, setFolders 
  } = useImageStore();
  const { copyToClipboard, getClipboard } = useClipboardStore();

  /**
   * 复制图片到系统剪贴板（支持多图，使用 HTML 格式）
   */
  const copyImagesToSystemClipboard = useCallback(async (images) => {
    try {
      // 检查 Clipboard API 是否可用
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.write !== 'function') {
        logger.warn('系统剪贴板 API 不可用');
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
          logger.warn('单图复制失败:', error);
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
        const htmlContent = imageDataList.map(({ dataUrl, filename }) => 
          `<span><img src="${dataUrl}" alt="${filename}"></span>`
        ).join('');
        
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
        logger.warn('多图复制失败:', error);
        return false;
      }
    } catch (error) {
      logger.warn('写入系统剪贴板失败:', error);
      return false;
    }
  }, [currentLibraryId]);

  /**
   * 复制到剪贴板（立即更新应用内剪贴板，异步写入系统剪贴板）
   */
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
    logger.file(`已复制 ${itemsToCopy.length} 个文件到应用内剪贴板`);
    
    // 2. 异步写入系统剪贴板（用于跨应用粘贴，不阻塞）
    copyImagesToSystemClipboard(imagesToCopy).then(success => {
      if (success) {
        logger.file('已写入系统剪贴板，可粘贴到外部应用');
      }
    });

    return { success: true, count: itemsToCopy.length };
  }, [selectedImages, selectedImage, copyToClipboard, copyImagesToSystemClipboard]);

  /**
   * 检查粘贴冲突
   */
  const checkPasteConflicts = useCallback((items, targetFolder) => {
    const targetFolderImages = images.filter(img => img.folder === targetFolder);
    const conflicts = [];
    
    for (const item of items) {
      const fileName = item.path.split('/').pop();
      const itemFolder = item.path.substring(0, item.path.lastIndexOf('/'));
      
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
  }, [images]);

  /**
   * 执行粘贴操作
   */
  const executePaste = useCallback(async (items, targetFolder, conflictAction) => {
    if (!currentLibraryId) return;

    logger.file(`开始粘贴 ${items.length} 个文件到: ${targetFolder}`);

    // 1. 立即更新文件夹计数（乐观更新）
    const originalFolders = folders;
    
    if (folders && folders.length > 0) {
      const updatedFolders = folders.map(folder => {
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

    // 2. 后台执行API调用
    try {
      const result = await fileAPI.copy(currentLibraryId, items, targetFolder, conflictAction);
      
      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;

      // 刷新当前文件夹的图片列表
      if (selectedFolder === targetFolder) {
        const params = { folder: selectedFolder };
        const response = await imageAPI.search(currentLibraryId, params);
        setImages(response.images);
      }

      // 刷新文件夹列表
      const foldersRes = await imageAPI.getFolders(currentLibraryId);
      setFolders(foldersRes.folders);

      return { success: true, successCount, failedCount };
    } catch (error) {
      logger.error('粘贴失败:', error);
      // 失败时回滚文件夹计数
      setFolders(originalFolders);
      throw error;
    }
  }, [currentLibraryId, selectedFolder, folders, setImages, setFolders]);

  /**
   * 粘贴（先检查冲突）
   */
  const handlePaste = useCallback(async () => {
    if (!currentLibraryId || !selectedFolder) return;
    
    const { items } = getClipboard();
    if (!items || items.length === 0) return;

    // 检查冲突
    const conflicts = checkPasteConflicts(items, selectedFolder);
    
    if (conflicts.length > 0 && showConflictDialog) {
      // 有冲突，显示对话框
      showConflictDialog(conflicts, 'paste', {
        items,
        targetFolder: selectedFolder
      });
    } else {
      // 没有冲突，直接执行粘贴
      await executePaste(items, selectedFolder, 'rename');
    }
  }, [currentLibraryId, selectedFolder, getClipboard, checkPasteConflicts, showConflictDialog, executePaste]);

  return {
    handleCopy,
    handlePaste,
    executePaste
  };
};
