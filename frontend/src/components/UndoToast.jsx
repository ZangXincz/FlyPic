/**
 * 撤销删除 Toast 组件
 * 删除后显示撤销按钮，允许用户恢复刚删除的文件
 */

import { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';

function UndoToast({ isVisible, message, onUndo, onClose, duration = 3000 }) {
  useEffect(() => {
    if (!isVisible) return;

    // Toast出现或消息变化时启动/重置计时器
    // 文件夹切换导致的重新计时问题通过外部useEffect监听selectedFolder解决
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, message, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl px-4 py-3 flex items-center gap-4 min-w-[300px]">
        <span className="flex-1 text-sm">{message}</span>
        <button
          onClick={onUndo}
          className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-sm font-medium"
        >
          <RotateCcw size={14} />
          撤销
        </button>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

export default UndoToast;
