/**
 * 文件夹选择器组件
 * 用于移动/复制文件时选择目标文件夹
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Folder, ChevronRight, ChevronDown, X, Home } from 'lucide-react';

export default function FolderSelector({ folders, currentFolder, onSelect, onClose }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [selectedFolder, setSelectedFolder] = useState(currentFolder || null);
  const selectedFolderRef = useRef(null); // 用于引用选中的文件夹元素
  const scrollContainerRef = useRef(null); // 用于引用滚动容器

  // 初始化时自动展开当前文件夹的所有父级路径
  useEffect(() => {
    if (currentFolder && currentFolder !== '') {
      const pathsToExpand = new Set();
      
      // 获取所有父级路径
      // 例如：A/B/C -> 需要展开 A 和 A/B
      const parts = currentFolder.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        const parentPath = parts.slice(0, i + 1).join('/');
        pathsToExpand.add(parentPath);
      }
      
      console.log(`📂 自动展开路径:`, Array.from(pathsToExpand));
      console.log(`📍 当前选中: ${currentFolder}`);
      setExpandedFolders(pathsToExpand);
    }
  }, [currentFolder]);

  // 立即定位到选中的文件夹并居中显示
  useEffect(() => {
    if (selectedFolderRef.current && scrollContainerRef.current) {
      // 立即执行，不等待动画
      const element = selectedFolderRef.current;
      const container = scrollContainerRef.current;
      
      if (element && container) {
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // 计算需要滚动的距离，使元素居中
        const scrollTop = element.offsetTop - container.offsetTop - (containerRect.height / 2) + (elementRect.height / 2);
        
        // 立即定位，不使用平滑滚动
        container.scrollTop = scrollTop;
        
        console.log(`📍 立即定位到选中文件夹: ${currentFolder}`);
      }
    }
  }, [expandedFolders, currentFolder]);

  // 切换文件夹展开/折叠
  const toggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  // 处理文件夹点击：首次选中，再次点击展开/折叠
  const handleFolderClick = (folder) => {
    const hasChildren = folder.children && folder.children.length > 0;

    // 如果是第一次点击（未选中），则选中
    if (selectedFolder !== folder.path) {
      setSelectedFolder(folder.path);
    } else if (hasChildren) {
      // 如果已经选中，且有子文件夹，则展开/折叠
      toggleFolder(folder.path);
    }
  };

  // 点击箭头图标：只展开/折叠，不选中
  const handleToggleClick = (e, folderPath) => {
    e.stopPropagation();
    toggleFolder(folderPath);
  };

  // 确认选择
  const handleConfirm = () => {
    if (selectedFolder !== null) {
      onSelect(selectedFolder);
    }
  };

  // 渲染文件夹树
  const renderFolderTree = (folders, level = 0) => {
    return folders.map((folder) => {
      const isExpanded = expandedFolders.has(folder.path);
      const hasChildren = folder.children && folder.children.length > 0;
      const isSelected = selectedFolder === folder.path;
      const isCurrent = currentFolder === folder.path;
      const isDisabled = isCurrent; // 禁止选择当前文件夹

      return (
        <div key={folder.path}>
          <div
            ref={isCurrent ? selectedFolderRef : null}
            className={`flex items-center px-3 py-2 cursor-pointer rounded-md transition-colors ${
              isDisabled
                ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700'
                : isSelected
                ? 'bg-blue-500 dark:bg-blue-600'
                : 'hover:bg-blue-50 dark:hover:bg-gray-700'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => !isDisabled && handleFolderClick(folder)}
          >
            {/* 展开/折叠图标 - 独立点击区域 */}
            {hasChildren ? (
              <div
                className="flex items-center justify-center w-5 h-5 mr-1 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                onClick={(e) => handleToggleClick(e, folder.path)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            ) : (
              <div className="w-5 mr-1" />
            )}

            {/* 文件夹图标和名称 */}
            <Folder className={`w-4 h-4 mr-2 flex-shrink-0 ${
              isSelected ? 'text-white' : 'text-yellow-500 dark:text-yellow-400'
            }`} />
            <span className={`text-sm truncate flex-1 font-medium ${
              isSelected 
                ? 'text-white' 
                : 'text-gray-900 dark:text-gray-100'
            }`}>
              {folder.name}
            </span>
            
            {isCurrent && (
              <span className={`text-xs ml-2 ${
                isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
              }`}>(当前)</span>
            )}
          </div>

          {/* 子文件夹 */}
          {hasChildren && isExpanded && (
            <div>{renderFolderTree(folder.children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[500px] max-h-[600px] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">选择目标文件夹</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 文件夹列表 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          {/* 根目录选项 */}
          <div
            className={`flex items-center px-3 py-2 cursor-pointer rounded-md transition-colors mb-2 ${
              selectedFolder === ''
                ? 'bg-blue-500 dark:bg-blue-600'
                : 'hover:bg-blue-50 dark:hover:bg-gray-700'
            }`}
            onClick={() => setSelectedFolder('')}
          >
            <Home className={`w-4 h-4 mr-2 ${
              selectedFolder === '' ? 'text-white' : 'text-blue-500 dark:text-blue-400'
            }`} />
            <span className={`text-sm font-medium ${
              selectedFolder === '' 
                ? 'text-white' 
                : 'text-gray-900 dark:text-gray-100'
            }`}>根目录</span>
          </div>

          {/* 文件夹树 */}
          {folders && folders.length > 0 ? (
            renderFolderTree(folders)
          ) : (
            <div className="text-center text-gray-500 py-8">
              暂无文件夹
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedFolder === null}
            className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
