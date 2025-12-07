/**
 * 图片重命名 Hook
 */

import { useState, useCallback, useRef } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useLibraryStore } from '../stores/useLibraryStore';
import { fileAPI } from '../api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useImageRename');

/**
 * 图片重命名功能
 * @returns {Object} 重命名相关的状态和方法
 */
export const useImageRename = () => {
  const { currentLibraryId } = useLibraryStore();
  const { renamingImage, setRenamingImage, updateImage } = useImageStore();
  
  const [editingFilename, setEditingFilename] = useState('');
  const editInputRef = useRef(null);

  /**
   * 开始重命名
   */
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

  /**
   * 完成重命名
   */
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
      const newPath = result.newPath;
      const actualNewName = result.newName;
      updateImage(renamingImage.path, {
        path: newPath,
        filename: actualNewName
      });

      logger.file(`重命名成功: ${oldFilename} → ${actualNewName}`);
    } catch (error) {
      logger.error('重命名失败:', error);
      alert('重命名失败: ' + (error.message || '未知错误'));
    } finally {
      setRenamingImage(null);
      setEditingFilename('');
    }
  }, [renamingImage, editingFilename, currentLibraryId, updateImage, setRenamingImage]);

  /**
   * 取消重命名
   */
  const handleCancelRename = useCallback(() => {
    setRenamingImage(null);
    setEditingFilename('');
  }, [setRenamingImage]);

  return {
    renamingImage,
    editingFilename,
    editInputRef,
    setEditingFilename,
    handleStartRename,
    handleFinishRename,
    handleCancelRename
  };
};
