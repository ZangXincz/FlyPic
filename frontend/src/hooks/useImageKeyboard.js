/**
 * 图片键盘快捷键 Hook
 */

import { useEffect } from 'react';
import { useImageStore } from '../stores/useImageStore';
import { useClipboardStore } from '../stores/useClipboardStore';

/**
 * 键盘快捷键处理
 * @param {Object} handlers - 快捷键处理函数
 * @returns {void}
 */
export const useImageKeyboard = (handlers) => {
  const { selectedImage, selectedImages } = useImageStore();
  const { hasClipboard } = useClipboardStore();

  const {
    onDelete,
    onUndo,
    onCopy,
    onPaste,
    onRename,
    onRating,
    canUndo = false,
    canPaste = false
  } = handlers;

  useEffect(() => {
    const handleGlobalKeyDown = async (e) => {
      // 忽略输入框中的快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Ctrl+C → 复制
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          onCopy?.();
        }
        return;
      }
      
      // Ctrl+V → 粘贴
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (hasClipboard() && canPaste) {
          e.preventDefault();
          await onPaste?.();
        }
        return;
      }
      
      // Ctrl+Z → 撤销
      // 只有在有可撤销的【图片】操作时，才拦截并阻止事件继续传播，避免 Sidebar 的全局监听同一按键再次处理
      // 当没有图片撤销时，保持事件传播，让 Sidebar 处理文件夹删除/拖拽移动等撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (canUndo) {
          e.preventDefault();
          // 阻止后续监听器（例如 Sidebar 的 window.keydown）处理本次 Ctrl+Z
          if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
          } else if (typeof e.stopPropagation === 'function') {
            e.stopPropagation();
          }
          await onUndo?.();
        }
        // 如果没有可撤销的图片操作，则不拦截，让其他监听器处理
        return;
      }
      
      // F2 或 Enter → 重命名（仅单选时）
      if ((e.key === 'F2' || e.key === 'Enter') && selectedImage && selectedImages.length === 0) {
        e.preventDefault();
        onRename?.(selectedImage);
        return;
      }
      
      // Del 键 → 删除
      if (e.key === 'Delete') {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          await onDelete?.();
        }
        return;
      }
      
      // 数字键 1-5 → 快速评分
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          const rating = parseInt(e.key);
          await onRating?.(rating);
        }
        return;
      }
      
      // 数字键 0 → 取消评分
      if (e.key === '0') {
        if (selectedImages.length > 0 || selectedImage) {
          e.preventDefault();
          await onRating?.(0);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    selectedImages, 
    selectedImage, 
    hasClipboard, 
    canUndo, 
    canPaste,
    onDelete,
    onUndo,
    onCopy,
    onPaste,
    onRename,
    onRating
  ]);
};
