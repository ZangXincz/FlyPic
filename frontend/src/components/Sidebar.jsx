import { useState, useMemo, useEffect, useRef } from 'react';
import { Folder, Search, ChevronRight, ChevronDown, X, Trash2, ChevronsRight, ChevronsDown } from 'lucide-react';
import useStore from '../store/useStore';
import { libraryAPI, scanAPI, imageAPI } from '../services/api';
import requestManager from '../services/requestManager';
import { onUserActionStart } from '../services/imageLoadService';

// 检查素材库是否有暂停的扫描
const checkPausedScan = async (libraryId) => {
  try {
    const response = await scanAPI.getStatus(libraryId);
    return response.data;
  } catch (error) {
    return null;
  }
};

function Sidebar() {
  const {
    libraries,
    currentLibraryId,
    folders,
    selectedFolder,
    totalImageCount,
    setCurrentLibrary,
    setSelectedFolder,
    addLibrary,
    removeLibrary
  } = useStore();

  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [localFolderSearch, setLocalFolderSearch] = useState('');  // 本地输入值
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const folderSearchDebounceRef = useRef(null);

  // 文件夹搜索防抖（300ms）
  const handleFolderSearchChange = (value) => {
    setLocalFolderSearch(value);

    if (folderSearchDebounceRef.current) {
      clearTimeout(folderSearchDebounceRef.current);
    }

    folderSearchDebounceRef.current = setTimeout(() => {
      setFolderSearch(value);
    }, 300);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (folderSearchDebounceRef.current) {
        clearTimeout(folderSearchDebounceRef.current);
      }
    };
  }, []);

  const handleAddLibrary = async () => {
    if (!newLibraryName.trim()) {
      alert('请输入素材库名称');
      return;
    }

    if (!newLibraryPath.trim()) {
      alert('请输入文件夹路径');
      return;
    }

    setIsAdding(true);

    try {
      // 1. 添加素材库
      console.log('📝 添加素材库...');
      const response = await libraryAPI.add(newLibraryName.trim(), newLibraryPath.trim());
      const newLibId = response.data.id;
      const hasExistingIndex = response.data.hasExistingIndex;

      addLibrary({
        id: newLibId,
        name: newLibraryName.trim(),
        path: newLibraryPath.trim()
      });

      // 2. 关闭表单
      setNewLibraryName('');
      setNewLibraryPath('');
      setShowAddLibrary(false);
      setIsAdding(false); // 立即释放按钮

      // 3. 切换到新素材库
      console.log('🔄 切换到新素材库...');
      await libraryAPI.setCurrent(newLibId);
      setCurrentLibrary(newLibId);
      setSelectedFolder(null);

      // 4. 清空当前显示
      useStore.getState().setImages([]);
      useStore.getState().setFolders([]);
      useStore.getState().setSelectedImage(null);
      useStore.getState().setTotalImageCount(0); // 清空总数

      // 5. 显示初始进度（立即显示，不等待后端）
      useStore.getState().setScanProgress({
        libraryId: newLibId,
        current: 0,
        total: 0,
        percent: 0,
        status: 'preparing'
      });

      // 6. 如果有已有索引，先快速加载数据库中的数据
      if (hasExistingIndex) {
        console.log('检测到已有索引，先加载现有数据...');
        try {
          const [foldersRes, countRes] = await Promise.all([
            imageAPI.getFolders(newLibId),
            imageAPI.getCount(newLibId)
          ]);
          useStore.getState().setFolders(foldersRes.data.folders);
          useStore.getState().setTotalImageCount(countRes.data.count);
          console.log('✅ 已加载现有数据');
        } catch (err) {
          console.warn('⚠️ 加载现有数据失败:', err);
        }
      }

      // 7. 开始异步扫描（不等待，Socket.IO 会推送进度）
      console.log('🔍 开始异步扫描...');
      if (hasExistingIndex) {
        console.log('执行增量同步，检测变化...');
        scanAPI.sync(newLibId, false); // wait=false，异步执行
      } else {
        console.log('首次添加，执行全量扫描...');
        scanAPI.fullScan(newLibId, false); // wait=false，异步执行
      }

      // 扫描在后台进行，Socket.IO 会推送进度和完成事件
      // App.jsx 中的 scanComplete 监听器会自动刷新数据
      console.log('✅ 扫描已启动，请等待进度显示...');
    } catch (error) {
      console.error('❌ Error adding library:', error);
      alert('添加素材库失败: ' + error.message);
      useStore.getState().setScanProgress(null);
      setIsAdding(false);
    }
  };

  const handleLibraryClick = async (libraryId) => {
    if (libraryId === currentLibraryId) return;

    setIsSwitching(true);
    try {
      // 1. 暂停空闲加载并取消所有之前的请求
      onUserActionStart();
      requestManager.cancelAllRequests();

      // 2. 清理当前素材库的状态（立即响应）
      useStore.getState().setScanProgress(null);
      useStore.getState().setSelectedImage(null);
      useStore.getState().setImages([]);
      useStore.getState().setFolders([]);
      useStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: 0,
        totalCount: 0,
        hasMore: false
      });
      setSelectedFolder(null);

      // 3. 先切换素材库（确保后端数据库连接已切换）
      await libraryAPI.setCurrent(libraryId);
      
      // 4. 然后并行加载文件夹和总数
      const [foldersRes, countRes] = await Promise.all([
        imageAPI.getFolders(libraryId),
        imageAPI.getCount(libraryId)
      ]);

      // 5. 更新状态（包括 currentLibraryId，这样其他组件才会响应）
      useStore.getState().setFolders(foldersRes.data.folders);
      useStore.getState().setTotalImageCount(countRes.data.count);
      setCurrentLibrary(libraryId); // 最后才更新 currentLibraryId

      // 7. 后台检查新素材库是否有暂停的扫描（不阻塞主流程）
      checkPausedScan(libraryId).then(scanStatus => {
        if (scanStatus && scanStatus.status === 'paused') {
          if (scanStatus.needsRescan) {
            useStore.getState().setScanProgress({
              ...scanStatus.progress,
              libraryId,
              canStop: true,
              isPaused: true,
              pendingCount: scanStatus.progress?.total - scanStatus.progress?.current || 0,
              needsRescan: true
            });
            console.log(`⏸️ 发现中断的扫描，需要继续完成`);
          } else if (scanStatus.pendingCount > 0) {
            useStore.getState().setScanProgress({
              ...scanStatus.progress,
              libraryId,
              canStop: true,
              isPaused: true,
              pendingCount: scanStatus.pendingCount
            });
            console.log(`⏸️ 发现暂停的扫描，待处理: ${scanStatus.pendingCount} 张`);
          }
        }
      }).catch(() => { }); // 忽略状态检查错误
    } catch (error) {
      console.error('Error setting current library:', error);
      alert('切换素材库失败: ' + error.message);
      useStore.getState().setImageLoadingState({ isLoading: false });
    } finally {
      setIsSwitching(false);
    }
  };


  const handleDeleteLibrary = async () => {
    if (!currentLibraryId) return;

    const currentLib = libraries.find(lib => lib.id === currentLibraryId);
    if (!currentLib) return;

    // 确认删除
    const confirmDelete = confirm(
      `确定要删除素材库"${currentLib.name}"吗？\n\n` +
      `路径: ${currentLib.path}\n\n` +
      `⚠️ 注意：\n` +
      `• 将删除索引数据并释放数据库连接\n` +
      `• 不会删除原始图片文件\n` +
      `• .flypic 文件夹将保留，您可以手动删除`
    );

    if (!confirmDelete) return;

    try {
      // 删除素材库（会自动关闭数据库连接）
      await libraryAPI.delete(currentLibraryId);
      removeLibrary(currentLibraryId);

      // Clear UI state
      useStore.getState().setImages([]);
      useStore.getState().setFolders([]);
      useStore.getState().setSelectedImage(null);
      useStore.getState().setSelectedFolder(null);

      // Switch to first available library if exists
      const remainingLibs = libraries.filter(lib => lib.id !== currentLibraryId);
      if (remainingLibs.length > 0) {
        const firstLib = remainingLibs[0];
        await libraryAPI.setCurrent(firstLib.id);
        setCurrentLibrary(firstLib.id);
      }

      // 静默成功，不弹窗
      console.log(`✅ 素材库已删除: ${currentLib.name}`);
      console.log(`数据库连接已释放，可手动删除: ${currentLib.path}\\.flypic`);
    } catch (error) {
      console.error('Error deleting library:', error);
      alert('删除素材库失败: ' + error.message);
    }
  };

  const toggleFolder = (folderPath) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  // 收集所有文件夹路径
  const getAllFolderPaths = (folderList) => {
    const paths = [];
    const traverse = (folders) => {
      folders.forEach(folder => {
        if (folder.children && folder.children.length > 0) {
          paths.push(folder.path);
          traverse(folder.children);
        }
      });
    };
    traverse(folderList);
    return paths;
  };

  // 全部展开
  const expandAll = () => {
    const allPaths = getAllFolderPaths(filteredFolders.length > 0 ? filteredFolders : folders);
    setExpandedFolders(new Set(allPaths));
  };

  // 全部折叠
  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  // 判断是否全部展开
  const isAllExpanded = () => {
    const allPaths = getAllFolderPaths(filteredFolders.length > 0 ? filteredFolders : folders);
    return allPaths.length > 0 && allPaths.every(path => expandedFolders.has(path));
  };

  // 使用 useMemo 缓存过滤结果（支持多关键词搜索）
  const filteredFolders = useMemo(() => {
    if (!folderSearch) return folders;

    // 分割搜索词，支持空格分隔的多个关键词
    const keywords = folderSearch
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(k => k.length > 0);

    if (keywords.length === 0) return folders;

    const pathsToExpand = [];

    const filterRecursive = (folderList) => {
      return folderList.reduce((acc, folder) => {
        const folderName = folder.name.toLowerCase();
        const folderPath = folder.path.toLowerCase();

        // 检查是否所有关键词都匹配（AND 逻辑）
        const nameMatches = keywords.every(keyword =>
          folderName.includes(keyword)
        );
        const pathMatches = keywords.every(keyword =>
          folderPath.includes(keyword)
        );

        let filteredChildren = [];
        if (folder.children && folder.children.length > 0) {
          filteredChildren = filterRecursive(folder.children);
        }

        // 如果文件夹名称匹配，或者路径匹配，或者有子文件夹匹配，则包含此文件夹
        if (nameMatches || pathMatches || filteredChildren.length > 0) {
          acc.push({
            ...folder,
            children: filteredChildren
          });

          // 记录需要展开的路径
          if (filteredChildren.length > 0) {
            pathsToExpand.push(folder.path);
          }
        }

        return acc;
      }, []);
    };

    const result = filterRecursive(folders);

    // 使用 setTimeout 来更新展开状态
    if (pathsToExpand.length > 0) {
      setTimeout(() => {
        setExpandedFolders(prev => {
          const newSet = new Set(prev);
          pathsToExpand.forEach(path => newSet.add(path));
          return newSet;
        });
      }, 0);
    }

    return result;
  }, [folders, folderSearch]);

  // 点击箭头图标：只展开/折叠，不选中
  const handleToggleClick = (e, folderPath) => {
    e.stopPropagation(); // 阻止事件冒泡
    toggleFolder(folderPath);
  };

  // 点击文件夹主体：首次选中，再次点击展开/折叠
  const handleFolderClick = (folder) => {
    const hasChildren = folder.children && folder.children.length > 0;

    // 如果是第一次点击（未选中），则选中
    if (selectedFolder !== folder.path) {
      // 暂停空闲加载
      onUserActionStart();
      setSelectedFolder(folder.path);
    } else if (hasChildren) {
      // 如果已经选中，且有子文件夹，则展开/折叠
      toggleFolder(folder.path);
    }
  };

  const renderFolderTree = (folders, level = 0) => {
    return folders.map((folder) => {
      const isExpanded = expandedFolders.has(folder.path);
      const hasChildren = folder.children && folder.children.length > 0;
      const isSelected = selectedFolder === folder.path;

      return (
        <div key={folder.path}>
          <div
            className={`flex items-center px-3 py-2 cursor-pointer rounded-md transition-colors ${isSelected
                ? 'bg-blue-50 dark:bg-blue-900'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => handleFolderClick(folder)}
          >
            {/* 展开/折叠图标 - 独立点击区域 */}
            {hasChildren ? (
              <div
                className="flex items-center justify-center w-5 h-5 mr-1 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                onClick={(e) => handleToggleClick(e, folder.path)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </div>
            ) : (
              <div className="w-5 mr-1" />
            )}

            {/* 文件夹图标 */}
            <Folder className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />

            {/* 文件夹名称 */}
            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
              {folder.name}
            </span>

            {/* 图片数量 */}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{folder.image_count}</span>
          </div>
          {hasChildren && isExpanded && renderFolderTree(folder.children, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="w-full h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
      {/* Library Management */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">素材库</h2>
        </div>

        {/* Library Selector with Delete Button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={currentLibraryId || ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '__add__') {
                  setShowAddLibrary(true);
                } else if (value) {
                  handleLibraryClick(value);
                }
              }}
              disabled={isSwitching}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ paddingRight: '2rem' }}
            >
              {libraries.length === 0 && (
                <option value="">暂无素材库</option>
              )}
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.name}
                </option>
              ))}
              <option value="__add__" style={{ borderTop: '1px solid #ccc' }}>
                + 添加新素材库
              </option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {currentLibraryId && libraries.length > 0 && (
            <button
              onClick={handleDeleteLibrary}
              className="px-3 py-2 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 transition-colors"
              title="删除当前素材库"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Add Library Form */}
        {showAddLibrary && (
          <div className="mt-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">添加素材库</h3>
              <button
                onClick={() => setShowAddLibrary(false)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="素材库名称"
                value={newLibraryName}
                onChange={(e) => setNewLibraryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLibrary()}
                autoFocus
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                placeholder="文件夹路径（例如：C:\Users\Pictures）"
                value={newLibraryPath}
                onChange={(e) => setNewLibraryPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddLibrary()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddLibrary(false)}
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  取消
                </button>
                <button
                  onClick={handleAddLibrary}
                  disabled={isAdding}
                  className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdding ? '添加中...' : '添加'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Folder Tree */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索文件夹（支持多关键词）..."
                value={localFolderSearch}
                onChange={(e) => handleFolderSearchChange(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <button
              onClick={isAllExpanded() ? collapseAll : expandAll}
              className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
              title={isAllExpanded() ? "折叠全部" : "展开全部"}
            >
              {isAllExpanded() ? (
                <ChevronsRight className="w-4 h-4" />
              ) : (
                <ChevronsDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {/* 全部图片选项 */}
          <div
            className={`flex items-center px-3 py-2 cursor-pointer rounded-md transition-colors ${selectedFolder === null
                ? 'bg-blue-50 dark:bg-blue-900'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            onClick={() => setSelectedFolder(null)}
          >
            <div className="w-5 mr-1" />
            <Folder className="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium flex-1">
              全部图片
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              {totalImageCount}
            </span>
          </div>

          {/* 分隔线 */}
          {(filteredFolders.length > 0 || folders.length > 0) && (
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-2" />
          )}

          {/* 文件夹树 */}
          {filteredFolders.length > 0 ? (
            renderFolderTree(filteredFolders)
          ) : folderSearch ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              未找到匹配的文件夹
            </div>
          ) : folders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              暂无文件夹
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
