/**
 * 文件冲突处理对话框
 */

import { X, AlertTriangle } from 'lucide-react';

function ConflictDialog({ isOpen, conflicts, onResolve, onCancel }) {
  if (!isOpen) return null;

  const handleResolveAll = (action) => {
    onResolve(action);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              文件冲突
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {conflicts.some(c => c.isSameLocation) ? (
              <>
                正在同一位置复制 <span className="font-semibold text-gray-900 dark:text-white">{conflicts.length}</span> 个文件/文件夹
              </>
            ) : (
              <>
                目标位置已存在 <span className="font-semibold text-gray-900 dark:text-white">{conflicts.length}</span> 个同名文件/文件夹
              </>
            )}
          </p>

          {/* Conflict List */}
          <div className="mb-4 max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded p-3">
            {conflicts.slice(0, 5).map((conflict, index) => (
              <div key={index} className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                • {conflict.name}
                {conflict.isSameLocation && (
                  <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">（同位置）</span>
                )}
              </div>
            ))}
            {conflicts.length > 5 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                ... 还有 {conflicts.length - 5} 个文件
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            请选择如何处理：
          </p>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={() => handleResolveAll('skip')}
              className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-left"
            >
              <div className="font-medium">跳过</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {conflicts.some(c => c.isSameLocation) 
                  ? '不创建副本，保持原样'
                  : '保留现有文件，不复制冲突的文件'}
              </div>
            </button>

            <button
              onClick={() => handleResolveAll('replace')}
              className="w-full px-4 py-2 bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900 dark:hover:bg-yellow-800 text-gray-900 dark:text-white rounded-lg transition-colors text-left"
            >
              <div className="font-medium">覆盖</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {conflicts.some(c => c.isSameLocation)
                  ? '无法覆盖自己，将跳过'
                  : '用新文件替换现有文件'}
              </div>
            </button>

            <button
              onClick={() => handleResolveAll('rename')}
              className="w-full px-4 py-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-gray-900 dark:text-white rounded-lg transition-colors text-left"
            >
              <div className="font-medium">保留两者</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                自动重命名为 "文件名 (1).ext"
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictDialog;
