/**
 * 统一的冲突处理 Hook
 * 用于复制、粘贴、移动、上传等操作的冲突处理
 */

import { useState, useCallback } from 'react';

/**
 * 冲突类型
 */
export const ConflictType = {
  PASTE: 'paste',       // 粘贴冲突
  MOVE: 'move',         // 移动冲突
  UPLOAD: 'upload',     // 上传冲突
};

/**
 * 冲突处理 Hook
 * @returns {Object} 冲突处理相关的状态和方法
 */
export const useConflictHandler = () => {
  const [conflictDialog, setConflictDialog] = useState({
    isOpen: false,
    conflicts: [],
    type: null,           // 冲突类型: 'paste' | 'move' | 'upload'
    pendingOperation: null // 待执行的操作数据
  });

  /**
   * 显示冲突对话框
   * @param {Array} conflicts - 冲突列表 [{path, name, isSameLocation}]
   * @param {string} type - 冲突类型
   * @param {Object} operationData - 操作数据
   */
  const showConflictDialog = useCallback((conflicts, type, operationData) => {
    setConflictDialog({
      isOpen: true,
      conflicts,
      type,
      pendingOperation: operationData
    });
  }, []);

  /**
   * 隐藏冲突对话框
   */
  const hideConflictDialog = useCallback(() => {
    setConflictDialog({
      isOpen: false,
      conflicts: [],
      type: null,
      pendingOperation: null
    });
  }, []);

  /**
   * 处理冲突解决
   * @param {string} action - 解决方式: 'skip' | 'replace' | 'rename'
   * @param {Function} onResolve - 解决后的回调函数
   */
  const resolveConflict = useCallback(async (action, onResolve) => {
    const { pendingOperation } = conflictDialog;
    
    // 关闭对话框
    hideConflictDialog();
    
    // 执行回调
    if (onResolve && pendingOperation) {
      await onResolve(action, pendingOperation);
    }
  }, [conflictDialog, hideConflictDialog]);

  return {
    conflictDialog,
    showConflictDialog,
    hideConflictDialog,
    resolveConflict
  };
};
