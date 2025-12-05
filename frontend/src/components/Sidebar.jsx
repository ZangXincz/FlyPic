import { useState, useMemo, useEffect, useRef } from 'react';
import { Folder, Search, ChevronRight, ChevronDown, X, Trash2, ChevronsRight, ChevronsDown } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { useScanStore } from '../stores/useScanStore';
import { libraryAPI, scanAPI, imageAPI } from '../api';
import requestManager from '../services/requestManager';
import { onUserActionStart } from '../services/imageLoadService';
import LibraryMissingModal from './LibraryMissingModal';

// 检查素材库扫描状态
const checkScanStatus = async (libraryId) => {
  try {
    const response = await scanAPI.getStatus(libraryId);
    return response.data || response;
  } catch (error) {
    return null;
  }
};

function Sidebar() {
  const { 
    libraries, 
    currentLibraryId, 
    setCurrentLibrary, 
    addLibrary, 
    removeLibrary,
    showAddLibraryForm,
    setShowAddLibraryForm,
    expandLibrarySelector,
    resetExpandLibrarySelector
  } = useLibraryStore();
  const { folders, selectedFolder, totalImageCount, setSelectedFolder } = useImageStore();
  const { isScanning } = useScanStore();

  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [folderSearch, setFolderSearch] = useState('');
  const [localFolderSearch, setLocalFolderSearch] = useState('');  // 本地输入值
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [missingLibrary, setMissingLibrary] = useState(null); // 切换时发现的丢失素材库
  const [isLibrarySelectorOpen, setIsLibrarySelectorOpen] = useState(false); // 素材库选择器展开状态
  const folderSearchDebounceRef = useRef(null);
  const librarySelectorRef = useRef(null);

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

  // 响应全局状态：显示新建素材库表单
  useEffect(() => {
    if (showAddLibraryForm) {
      setShowAddLibrary(true);
      setShowAddLibraryForm(false); // 重置全局状态
    }
  }, [showAddLibraryForm, setShowAddLibraryForm]);

  // 响应全局状态：展开素材库选择器
  useEffect(() => {
    if (expandLibrarySelector) {
      setIsLibrarySelectorOpen(true);
      resetExpandLibrarySelector(); // 重置全局状态
    }
  }, [expandLibrarySelector, resetExpandLibrarySelector]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (librarySelectorRef.current && !librarySelectorRef.current.contains(event.target)) {
        setIsLibrarySelectorOpen(false);
      }
    };

    if (isLibrarySelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLibrarySelectorOpen]);

  const handleAddLibrary = async () => {
    // 扫描期间禁止添加素材库
    if (isScanning()) {
      alert('扫描进行中，请稍后再试或暂停扫描');
      return;
    }
    
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
      const newLibId = response.id;
      const hasExistingIndex = response.hasExistingIndex;

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
      useImageStore.getState().setImages([]);
      useImageStore.getState().setFolders([]);
      useImageStore.getState().setSelectedImage(null);
      useImageStore.getState().setTotalImageCount(0); // 清空总数

      // 5. 显示初始进度（立即显示，不等待后端）
      useScanStore.getState().setScanProgress({
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
          useImageStore.getState().setFolders(foldersRes.folders);
          useImageStore.getState().setTotalImageCount(countRes.count);
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
      
      // 提取错误信息
      let errorMessage = error.message || '未知错误';
      
      // 如果是后端返回的错误响应
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      
      // 特殊处理权限错误
      if (errorMessage.includes('无法访问') || errorMessage.includes('权限') || errorMessage.includes('数据共享')) {
        alert(
          '⚠️ 文件夹权限不足\n\n' +
          errorMessage + '\n\n' +
          '操作步骤：\n' +
          '1. 应用中心找到 FlyPic 应用\n' +
          '2. 点击 应用设置\n' +
          '3. 将该文件夹添加到 FlyPic 应用的读写权限'
        );
      } else {
        alert('添加素材库失败: ' + errorMessage);
      }
      
      useScanStore.getState().setScanProgress(null);
      setIsAdding(false);
    }
  };

  const handleLibraryClick = async (libraryId) => {
    if (libraryId === currentLibraryId) return;
    
    // 扫描期间禁止切换素材库
    if (isScanning()) {
      alert('扫描进行中，请稍后再试或暂停扫描');
      return;
    }

    setIsSwitching(true);
    try {
      // 0. 先验证目标素材库路径是否存在
      const validateRes = await libraryAPI.validate(libraryId);
      const validateData = validateRes.data || validateRes;
      
      if (validateData.status !== 'ok') {
        // 路径或索引不存在，显示弹窗
        setMissingLibrary({
          id: libraryId,
          name: validateData.name,
          path: validateData.path,
          status: validateData.status
        });
        setIsSwitching(false);
        return;
      }

      // 1. 暂停空闲加载并取消所有之前的请求
      onUserActionStart();
      requestManager.cancelAllRequests();

      // 2. 清理当前素材库的状态（立即响应）
      useScanStore.getState().setScanProgress(null);
      useImageStore.getState().setSelectedImage(null);
      useImageStore.getState().setImages([]);
      useImageStore.getState().setFolders([]);
      useImageStore.getState().setImageLoadingState({
        isLoading: false,
        loadedCount: 0,
        totalCount: 0,
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
      useImageStore.getState().setFolders(foldersRes.folders);
      useImageStore.getState().setTotalImageCount(countRes.count);
      setCurrentLibrary(libraryId); // 最后才更新 currentLibraryId

      // 7. 检查新素材库是否正在扫描
      checkScanStatus(libraryId).then(scanStatus => {
        if (scanStatus && scanStatus.status === 'scanning') {
          useScanStore.getState().setScanProgress(scanStatus.progress);
        }
      }).catch(() => { });
    } catch (error) {
      console.error('Error setting current library:', error);
      alert('切换素材库失败: ' + error.message);
      useImageStore.getState().setImageLoadingState({ isLoading: false });
    } finally {
      setIsSwitching(false);
    }
  };


  const handleDeleteLibrary = async () => {
    if (!currentLibraryId) return;
    
    // 扫描期间禁止删除素材库
    if (isScanning()) {
      alert('扫描进行中，请稍后再试或暂停扫描');
      return;
    }

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
      await libraryAPI.remove(currentLibraryId);
      removeLibrary(currentLibraryId);

      // Clear UI state
      useImageStore.getState().setImages([]);
      useImageStore.getState().setFolders([]);
      useImageStore.getState().setSelectedImage(null);
      useImageStore.getState().setSelectedFolder(null);

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
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{folder.imageCount}</span>
          </div>
          {hasChildren && isExpanded && renderFolderTree(folder.children, level + 1)}
        </div>
      );
    });
  };

  // 弹窗处理函数
  const handleMissingRescan = async () => {
    if (!missingLibrary) return;
    const libId = missingLibrary.id;
    setMissingLibrary(null);
    
    try {
      // 1. 清理当前状态
      useScanStore.getState().setScanProgress(null);
      useImageStore.getState().setSelectedImage(null);
      useImageStore.getState().setImages([]);
      useImageStore.getState().setFolders([]);
      useImageStore.getState().setTotalImageCount(0);
      setSelectedFolder(null);
      
      // 2. 先切换到该素材库（后端）
      await libraryAPI.setCurrent(libId);
      
      // 3. 更新前端状态（这会触发 UI 更新，select 会显示正确的值）
      setCurrentLibrary(libId);
      
      // 4. 启动扫描（扫描进度会通过 Socket.IO 推送）
      await scanAPI.fullScan(libId);
    } catch (error) {
      console.error('启动扫描失败:', error.message);
      alert('启动扫描失败: ' + error.message);
    }
  };

  const handleMissingOpenOther = async () => {
    if (!missingLibrary) return;
    
    try {
      // 删除时不自动选择下一个素材库
      await libraryAPI.remove(missingLibrary.id, false);
      removeLibrary(missingLibrary.id);
      
      // 清空当前素材库，让用户自己选择
      setCurrentLibrary(null);
      useImageStore.getState().setImages([]);
      useImageStore.getState().setFolders([]);
      useImageStore.getState().setTotalImageCount(0);
      setSelectedFolder(null);
    } catch (error) {
      console.error('移除素材库失败:', error.message);
    }
    
    setMissingLibrary(null);
    
    // 展开素材库选择器让用户选择
    setTimeout(() => {
      setIsLibrarySelectorOpen(true);
    }, 100);
  };

  const handleMissingCreateNew = async () => {
    if (!missingLibrary) return;
    
    try {
      await libraryAPI.remove(missingLibrary.id);
      removeLibrary(missingLibrary.id);
    } catch (error) {
      console.error('移除素材库失败:', error.message);
    }
    
    setMissingLibrary(null);
    setShowAddLibrary(true);
  };

  return (
    <div className="w-full h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
      {/* 素材库路径丢失弹窗 */}
      <LibraryMissingModal
        isOpen={!!missingLibrary}
        libraryName={missingLibrary?.name}
        libraryPath={missingLibrary?.path}
        status={missingLibrary?.status}
        onRescan={handleMissingRescan}
        onOpenOther={handleMissingOpenOther}
        onCreateNew={handleMissingCreateNew}
      />
      
      {/* Library Management */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">素材库</h2>
        </div>

        {/* Library Selector with Delete Button */}
        <div className="flex gap-2">
          <div className="relative flex-1" ref={librarySelectorRef}>
            {/* 自定义下拉选择器 */}
            <div
              onClick={() => {
                if (!isSwitching && !isScanning()) {
                  setIsLibrarySelectorOpen(!isLibrarySelectorOpen);
                }
              }}
              className={`w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 cursor-pointer flex items-center justify-between ${
                (isSwitching || isScanning()) ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span className="truncate">
                {libraries.length === 0
                  ? '暂无素材库'
                  : !currentLibraryId
                  ? '请选择素材库...'
                  : libraries.find(lib => lib.id === currentLibraryId)?.name || '未知素材库'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
            </div>

            {/* 下拉选项列表 */}
            {isLibrarySelectorOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                {libraries.map((library) => (
                  <div
                    key={library.id}
                    onClick={() => {
                      if (library.id !== currentLibraryId) {
                        handleLibraryClick(library.id);
                      }
                      setIsLibrarySelectorOpen(false);
                    }}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      library.id === currentLibraryId ? 'bg-blue-50 dark:bg-blue-900' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{library.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={library.path}>
                      {library.path}
                    </div>
                  </div>
                ))}
                <div
                  onClick={() => {
                    if (isScanning()) {
                      alert('扫描进行中，请稍后再试或暂停扫描');
                      return;
                    }
                    setShowAddLibrary(true);
                    setIsLibrarySelectorOpen(false);
                  }}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400"
                >
                  + 添加新素材库
                </div>
              </div>
            )}
          </div>

          {currentLibraryId && libraries.length > 0 && (
            <button
              onClick={handleDeleteLibrary}
              disabled={isScanning()}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={isScanning() ? "扫描进行中，无法删除" : "删除当前素材库"}
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
