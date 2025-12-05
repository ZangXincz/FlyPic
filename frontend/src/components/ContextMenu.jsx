/**
 * 右键上下文菜单组件
 * 提供文件操作选项：删除、重命名、移动、复制
 */

import { useEffect, useRef } from 'react';
import { Trash2, Edit3, Move, Copy } from 'lucide-react';

function ContextMenu({ isOpen, position, onClose, options }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  // 计算菜单位置，防止超出屏幕
  const menuStyle = {
    left: `${position.x}px`,
    top: `${position.y}px`,
  };

  const handleOptionClick = (action) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px]"
      style={menuStyle}
    >
      {options.map((option, index) => (
        <div key={index}>
          {option.divider ? (
            <div className="my-2 border-t border-gray-200 dark:border-gray-700" />
          ) : (
            <button
              onClick={() => handleOptionClick(option.action)}
              disabled={option.disabled}
              className={`
                w-full flex items-center gap-3 px-4 py-2 text-left text-sm
                ${option.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }
                ${option.danger
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-700 dark:text-gray-300'
                }
              `}
            >
              {option.icon}
              <span className="flex-1">{option.label}</span>
              {option.shortcut && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {option.shortcut}
                </span>
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// 预定义常用菜单项
export const menuItems = {
  delete: (action) => ({
    icon: <Trash2 size={16} />,
    label: '移入回收站',
    shortcut: 'Del',
    danger: false,
    action
  }),
  rename: (action) => ({
    icon: <Edit3 size={16} />,
    label: '重命名',
    shortcut: 'F2',
    action
  }),
  move: (action) => ({
    icon: <Move size={16} />,
    label: '移动到...',
    action
  }),
  copy: (action) => ({
    icon: <Copy size={16} />,
    label: '复制到...',
    shortcut: 'Ctrl+C',
    action
  }),
  divider: () => ({ divider: true })
};

export default ContextMenu;
