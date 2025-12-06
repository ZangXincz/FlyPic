import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Folder, Search, ChevronRight, ChevronDown, X, Trash2, ChevronsRight, ChevronsDown } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { useScanStore } from '../stores/useScanStore';
import { libraryAPI, scanAPI, imageAPI, fileAPI } from '../api';
import requestManager from '../services/requestManager';
import { onUserActionStart } from '../services/imageLoadService';
import LibraryMissingModal from './LibraryMissingModal';
import ContextMenu, { menuItems } from './ContextMenu';
import UndoToast from './UndoToast';
import FolderSelector from './FolderSelector';

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
  const { folders, selectedFolder, totalImageCount, setSelectedFolder, setSelectedFolderItem } = useImageStore();
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
  const [contextMenu, setContextMenu] = useState({ isOpen: false, position: null, folder: null });
  const [undoToast, setUndoToast] = useState({ isVisible: false, message: '', count: 0 });
  const [undoHistory, setUndoHistory] = useState([]); // 撤销历史栈，支持多次撤销
  const [dragOverFolder, setDragOverFolder] = useState(null); // 拖拽悬停的文件夹
  const [showFolderSelector, setShowFolderSelector] = useState(false); // 显示文件夹选择器
  const [moveFolderPath, setMoveFolderPath] = useState(null); // 待移动的文件夹路径
  const [renamingFolder, setRenamingFolder] = useState(null); // 正在重命名的文件夹
  const [editingFolderName, setEditingFolderName] = useState(''); // 编辑中的文件夹名
  const [creatingFolder, setCreatingFolder] = useState(null); // 正在创建的文件夹 { type: 'sibling' | 'child', parentPath: string }
  const [newFolderName, setNewFolderName] = useState(''); // 新建文件夹名称
  const folderSearchDebounceRef = useRef(null);
  const librarySelectorRef = useRef(null);
  const folderNameInputRef = useRef(null);
  const newFolderInputRef = useRef(null);

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

  // 监听文件夹切换，切换时关闭Toast
  useEffect(() => {
    // 文件夹切换时立即关闭Toast，避免重新计时
    setUndoToast({ isVisible: false, message: '', count: 0 });
  }, [selectedFolder]);

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

  // 从树形结构中移除指定节点
  const removeNodeFromTree = useCallback((tree, targetPath) => {
    if (!tree || tree.length === 0) return tree;
    
    return tree
      .filter(node => node.path !== targetPath)
      .map(node => ({
        ...node,
        children: node.children ? removeNodeFromTree(node.children, targetPath) : []
      }));
  }, []);

  // 智能选择删除文件夹后的下一个文件夹
  const findNextFolderAfterDelete = useCallback((deletedPath, allFolders) => {
    if (!allFolders || allFolders.length === 0) return null;

    // 将树形结构拍平成一维列表，便于按 path / 父路径 处理
    const flat = [];
    const walk = (nodes) => {
      if (!nodes) return;
      for (const node of nodes) {
        flat.push(node);
        if (node.children && node.children.length > 0) {
          walk(node.children);
        }
      }
    };
    walk(allFolders);

    // 计算被删除文件夹的父级路径
    const parentPath = deletedPath.includes('/')
      ? deletedPath.substring(0, deletedPath.lastIndexOf('/'))
      : null;

    // 找出所有同级兄弟（包括被删除的那个）
    const siblings = flat.filter((f) => {
      const fParent = f.path.includes('/')
        ? f.path.substring(0, f.path.lastIndexOf('/'))
        : null;
      return fParent === parentPath;
    });

    if (siblings.length === 0) {
      // 没有任何同级，直接回退到父级或"全部"
      return parentPath || null;
    }

    const deletedIndex = siblings.findIndex((f) => f.path === deletedPath);

    if (deletedIndex === -1) {
      // 在当前树结构中已找不到该节点，保守地回退到父级/全部
      return parentPath || null;
    }

    // 优先级1：同级下方
    if (deletedIndex < siblings.length - 1) {
      return siblings[deletedIndex + 1].path;
    }

    // 优先级2：同级上方
    if (deletedIndex > 0) {
      return siblings[deletedIndex - 1].path;
    }

    // 优先级3：父级
    return parentPath || null;
  }, []);

  // 监听快捷键（Del删除、F2重命名、Ctrl+Z撤销）
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // 忽略输入框中的快捷键
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Del 键 → 删除当前选中的文件夹（只在没有选中图片时）
      if (e.key === 'Delete' && selectedFolder) {
        const { selectedImages, selectedImage } = useImageStore.getState();
        // 如果有选中的图片，让 ImageWaterfall 处理删除
        if (selectedImages.length > 0 || selectedImage) return;
        
        e.preventDefault();
        await handleDeleteFolder(selectedFolder);
      }
      
      // F2 键 → 重命名当前选中的文件夹（只在没有选中图片时）
      if (e.key === 'F2' && selectedFolder) {
        const { selectedImages, selectedImage } = useImageStore.getState();
        // 如果有选中的图片，让 ImageWaterfall 处理重命名
        if (selectedImages.length > 0 || selectedImage) return;
        
        e.preventDefault();
        // 找到对应的文件夹对象
        const findFolderByPath = (foldersList, path) => {
          for (const folder of foldersList) {
            if (folder.path === path) return folder;
            if (folder.children) {
              const found = findFolderByPath(folder.children, path);
              if (found) return found;
            }
          }
          return null;
        };
        const folderObj = findFolderByPath(folders, selectedFolder);
        if (folderObj) {
          // 直接调用重命名逻辑，不依赖外部函数
          setRenamingFolder(folderObj);
          setEditingFolderName(folderObj.name);
          setContextMenu({ isOpen: false, position: null, folder: null });
          
          setTimeout(() => {
            if (folderNameInputRef.current) {
              folderNameInputRef.current.focus();
              folderNameInputRef.current.select();
            }
          }, 50);
        }
      }
      
      // Ctrl+Z → 撤销（文件夹或图片）
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        // 如果有文件夹撤销历史，撤销文件夹
        if (undoHistory.length > 0) {
          e.preventDefault();
          await handleUndoFolderDelete();
        }
        // 否则让 ImageWaterfall 处理图片撤销
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFolder, undoHistory, folders, findNextFolderAfterDelete]);

  // 文件夹删除功能（乐观更新，立即响应）
  const handleDeleteFolder = async (folderPath) => {
    if (!currentLibraryId) return;
    
    const items = [{ type: 'folder', path: folderPath }];
    
    // 1. 推入历史栈
    const newHistory = [...undoHistory, { 
      items: items,
      folderPath: folderPath 
    }];
    setUndoHistory(newHistory);
    
    // 2. 如果删除的是当前选中的文件夹，智能选择下一个文件夹
    if (selectedFolder === folderPath) {
      // 先从当前 folders 树中移除即将被删除的节点，再计算下一个目标
      const foldersAfterDelete = removeNodeFromTree(folders, folderPath);
      const nextFolder = findNextFolderAfterDelete(folderPath, foldersAfterDelete);
      setSelectedFolder(nextFolder);
    }
    
    // 3. 立即显示Toast
    setUndoToast({
      isVisible: true,
      message: `已将文件夹移入临时文件夹（Ctrl+Z撤销 · ${newHistory.length}次）`,
      count: 1
    });
    
    // 4. 后台执行API调用（不阻塞UI）
    Promise.all([
      fileAPI.delete(currentLibraryId, items),
      imageAPI.getFolders(currentLibraryId)
    ]).then(([deleteResult, foldersRes]) => {
      const { setFolders } = useImageStore.getState();
      if (deleteResult.data.failed.length > 0) {
        console.warn(`⚠️ 删除失败:`, deleteResult.data.failed);
        // 失败时回滚
        setUndoHistory(undoHistory);
        setUndoToast({ isVisible: false, message: '', count: 0 });
        setFolders(foldersRes.folders);
        alert('删除失败: ' + deleteResult.data.failed[0].error);
      } else {
        // 成功时刷新文件夹列表以确保同步
        setFolders(foldersRes.folders);
      }
    }).catch(error => {
      console.error('删除文件夹失败:', error);
      // 失败时回滚
      setUndoHistory(undoHistory);
      setUndoToast({ isVisible: false, message: '', count: 0 });
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        const { setFolders } = useImageStore.getState();
        setFolders(foldersRes.folders);
      });
      alert('删除失败: ' + (error.message || '未知错误'));
    });
  };

  // 撤销文件夹删除（乐观更新，立即响应）
  const handleUndoFolderDelete = async () => {
    if (undoHistory.length === 0) return;
    
    // 从历史栈中取出最近的删除记录
    const lastDeleted = undoHistory[undoHistory.length - 1];
    const remainingHistory = undoHistory.slice(0, -1);
    
    // 1. 立即关闭Toast
    setUndoToast({ isVisible: false, message: '', count: 0 });
    
    // 2. 立即更新历史栈
    setUndoHistory(remainingHistory);
    
    // 3. 立即更新文件夹列表（乐观更新）- 让恢复的文件夹立即出现
    const { folders, setFolders } = useImageStore.getState();
    if (folders && folders.length > 0) {
      // 检查文件夹是否已在列表中
      const folderExists = folders.some(f => f.path === lastDeleted.folderPath);
      if (!folderExists) {
        // 如果文件夹不在列表中，立即添加（占位符，后端会返回正确的计数）
        const newFolder = {
          path: lastDeleted.folderPath,
          count: 0, // 占位符，后端刷新时会更新
          name: lastDeleted.folderPath.split('/').pop() || lastDeleted.folderPath
        };
        setFolders([...folders, newFolder]);
      }
    }
    
    // 4. 立即跳转到恢复的文件夹
    setSelectedFolder(lastDeleted.folderPath);
    console.log(`📂 跳转到文件夹: ${lastDeleted.folderPath}`);
    
    // 5. 后台执行API调用（不阻塞UI）
    Promise.all([
      fileAPI.restore(currentLibraryId, lastDeleted.items),
      imageAPI.getFolders(currentLibraryId)
    ]).then(([restoreResult, foldersRes]) => {
      const { setFolders } = useImageStore.getState();
      // 检查恢复结果
      if (restoreResult.data.failed.length > 0) {
        console.warn(`⚠️ 恢复失败: ${restoreResult.data.failed.length} 个文件`);
        const errorMsg = restoreResult.data.failed[0].error || '未知错误';
        
        // 失败时回滚
        setUndoHistory(undoHistory);
        setFolders(foldersRes.folders);
        alert(`恢复失败: ${errorMsg}\n\n提示：超过5分钟的文件已移入系统回收站，请手动从回收站恢复。`);
      } else {
        // 成功时刷新文件夹列表以确保同步
        setFolders(foldersRes.folders);
      }
    }).catch(error => {
      console.error('撤销失败:', error);
      // 失败时回滚
      setUndoHistory(undoHistory);
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        const { setFolders } = useImageStore.getState();
        setFolders(foldersRes.folders);
      });
      alert('撤销失败: ' + (error.message || '未知错误'));
    });
  };

  // 处理拖拽到文件夹
  const handleDrop = async (e, targetFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);

    if (!currentLibraryId) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      const { items } = data;

      if (!items || items.length === 0) return;

      // 检查是否包含文件夹
      const hasFolders = items.some(item => item.type === 'folder');
      
      // 1. 如果是移动文件，立即从UI中移除（乐观更新）
      if (!hasFolders) {
        const { images, setImages } = useImageStore.getState();
        const movedPaths = new Set(items.map(item => item.path));
        const remainingImages = images.filter(img => !movedPaths.has(img.path));
        setImages(remainingImages);
      }

      // 2. 执行移动和刷新（并行）
      const [result, foldersRes] = await Promise.all([
        fileAPI.move(currentLibraryId, items, targetFolder.path),
        imageAPI.getFolders(currentLibraryId)
      ]);

      if (result.failed && result.failed.length > 0) {
        alert(`移动失败: ${result.failed[0].error}`);
      } else {
        console.log(`✅ 已移动 ${items.length} 个${hasFolders ? '文件夹' : '文件'}到: ${targetFolder.path}`);
      }
      
      // 3. 刷新文件夹列表
      const { setFolders } = useImageStore.getState();
      setFolders(foldersRes.folders);
    } catch (error) {
      console.error('拖拽移动失败:', error);
    }
  };

  const handleDragOver = (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(folder.path);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
  };

  // 打开文件夹移动选择器
  const handleMoveFolderClick = (folderPath) => {
    setMoveFolderPath(folderPath);
    setShowFolderSelector(true);
    setContextMenu({ isOpen: false, position: null, folder: null });
  };

  // 执行文件夹移动
  const handleMoveFolder = async (targetFolder) => {
    if (!currentLibraryId || !moveFolderPath) return;

    setShowFolderSelector(false);

    // 计算移动后的新路径
    const folderName = moveFolderPath.split('/').pop();
    const newPath = targetFolder ? `${targetFolder}/${folderName}` : folderName;

    try {
      const items = [{ type: 'folder', path: moveFolderPath }];
      
      // 1. 后台执行移动和刷新（并行）
      const [result, foldersRes] = await Promise.all([
        fileAPI.move(currentLibraryId, items, targetFolder),
        imageAPI.getFolders(currentLibraryId)
      ]);

      if (result.failed && result.failed.length > 0) {
        alert(`移动失败: ${result.failed[0].error}`);
      } else {
        // 2. 移动成功，选中新位置
        setSelectedFolder(newPath);
        console.log(`✅ 已移动文件夹: ${moveFolderPath} -> ${newPath}`);
      }

      // 3. 刷新文件夹列表
      const { setFolders } = useImageStore.getState();
      setFolders(foldersRes.folders);
    } catch (error) {
      console.error('移动文件夹失败:', error);
      alert('移动失败: ' + (error.message || '未知错误'));
      
      // 失败时重新加载文件夹列表
      imageAPI.getFolders(currentLibraryId).then(foldersRes => {
        const { setFolders } = useImageStore.getState();
        setFolders(foldersRes.folders);
      });
    } finally {
      setMoveFolderPath(null);
    }
  };

  // 开始重命名文件夹
  const handleStartRenameFolder = (folder) => {
    if (!folder) return;
    setRenamingFolder(folder);
    setEditingFolderName(folder.name);
    setContextMenu({ isOpen: false, position: null, folder: null });
    
    // 延迟聚焦，确保输入框已渲染
    setTimeout(() => {
      if (folderNameInputRef.current) {
        folderNameInputRef.current.focus();
        folderNameInputRef.current.select();
      }
    }, 50);
  };

  // 完成文件夹重命名
  const handleFinishRenameFolder = async () => {
    if (!renamingFolder || !editingFolderName.trim()) {
      setRenamingFolder(null);
      setEditingFolderName('');
      return;
    }

    const oldName = renamingFolder.name;
    const newName = editingFolderName.trim();

    // 如果名称没有改变，直接退出
    if (newName === oldName) {
      setRenamingFolder(null);
      setEditingFolderName('');
      return;
    }

    const oldPath = renamingFolder.path;
    const isRenamingCurrentFolder = selectedFolder === oldPath;

    try {
      // 调用重命名API
      const result = await fileAPI.rename(currentLibraryId, oldPath, newName);
      const newPath = result.data.newPath;
      
      console.log(`✅ 文件夹重命名成功: ${oldName} → ${newName}, 路径: ${oldPath} → ${newPath}`);
      
      // 1. 立即清空图片列表（避免显示旧路径的无效图片）
      const { setImages, setFolders, setSelectedFolder: setSelectedFolderGlobal } = useImageStore.getState();
      setImages([]);
      
      // 2. 重新加载文件夹列表（关键：确保浏览器重新渲染）
      const foldersRes = await imageAPI.getFolders(currentLibraryId);
      console.log('📁 重命名后最新文件夹列表:', foldersRes.folders);
      setFolders(foldersRes.folders);
      
      // 3. 如果重命名的是当前选中的文件夹，强制触发重新加载
      if (isRenamingCurrentFolder) {
        console.log(`📂 重命名当前文件夹: ${oldPath} → ${newPath}`);
        
        // 先切换到 null，再切换到新路径，强制触发 useEffect
        setSelectedFolderGlobal(null);
        
        // 使用 setTimeout 确保状态更新被 React 检测到
        setTimeout(() => {
          setSelectedFolderGlobal(newPath);
          console.log('✅ 已切换到新文件夹, selectedFolder =', newPath);
        }, 50);
      }
    } catch (error) {
      console.error('文件夹重命名失败:', error);
      alert('重命名失败: ' + (error.message || '未知错误'));
    } finally {
      setRenamingFolder(null);
      setEditingFolderName('');
    }
  };

  // 取消文件夹重命名
  const handleCancelRenameFolder = () => {
    setRenamingFolder(null);
    setEditingFolderName('');
  };

  // 开始创建文件夹
  const handleStartCreateFolder = (type, basePath) => {
    // type: 'sibling' 同级 | 'child' 子级
    // basePath: 基准文件夹路径
    const parentPath = type === 'sibling' 
      ? (basePath.includes('/') ? basePath.substring(0, basePath.lastIndexOf('/')) : '')
      : basePath;
    
    setCreatingFolder({ type, parentPath, basePath });
    setNewFolderName('新建文件夹');
    setContextMenu({ isOpen: false, position: null, folder: null });
    
    // 延迟聚焦
    setTimeout(() => {
      if (newFolderInputRef.current) {
        newFolderInputRef.current.focus();
        newFolderInputRef.current.select();
      }
    }, 50);
  };

  // 完成创建文件夹
  const handleFinishCreateFolder = async () => {
    if (!creatingFolder || !newFolderName.trim()) {
      setCreatingFolder(null);
      setNewFolderName('');
      return;
    }

    const folderName = newFolderName.trim();
    const { parentPath } = creatingFolder;
    const newFolderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    try {
      // 调用后端 API 创建文件夹
      await fileAPI.createFolder(currentLibraryId, newFolderPath);
      
      console.log(`✅ 文件夹创建成功: ${newFolderPath}`);
      
      // 刷新文件夹列表
      const foldersRes = await imageAPI.getFolders(currentLibraryId);
      const { setFolders } = useImageStore.getState();
      setFolders(foldersRes.folders);
      
      // 展开父文件夹
      if (parentPath) {
        setExpandedFolders(prev => new Set([...prev, parentPath]));
      }
    } catch (error) {
      console.error('创建文件夹失败:', error);
      alert('创建文件夹失败: ' + (error.message || '未知错误'));
    } finally {
      setCreatingFolder(null);
      setNewFolderName('');
    }
  };

  // 取消创建文件夹
  const handleCancelCreateFolder = () => {
    setCreatingFolder(null);
    setNewFolderName('');
  };

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
      
      // 关键修复：清空图片选中，设置文件夹为选中项
      const { clearSelection, setSelectedFolderItem: setFolderItemGlobal } = useImageStore.getState();
      clearSelection();  // 清空所有图片选中状态
      setFolderItemGlobal(folder);  // 设置文件夹为选中项
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
            className={`flex items-center px-3 py-2 rounded-md cursor-pointer transition-colors ${
              isSelected
                ? 'bg-blue-50 dark:bg-blue-900'
                : dragOverFolder === folder.path
                ? 'bg-green-100 dark:bg-green-900'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => handleFolderClick(folder)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                isOpen: true,
                position: { x: e.clientX, y: e.clientY },
                folder: folder
              });
            }}
            draggable={true}
            onDragStart={(e) => {
              // 拖拽文件夹
              const items = [{ type: 'folder', path: folder.path }];
              e.dataTransfer.setData('application/json', JSON.stringify({ items }));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDrop={(e) => handleDrop(e, folder)}
            onDragOver={(e) => handleDragOver(e, folder)}
            onDragLeave={handleDragLeave}
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
            {renamingFolder?.path === folder.path ? (
              // 编辑模式 - 保持与显示模式相同的样式，只添加下划线提示
              <input
                ref={folderNameInputRef}
                type="text"
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFinishRenameFolder();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelRenameFolder();
                  }
                }}
                onBlur={handleFinishRenameFolder}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate bg-transparent border-none outline-none focus:outline-none underline decoration-2 decoration-blue-500 underline-offset-2"
                style={{ padding: 0, margin: 0 }}
              />
            ) : (
              // 显示模式
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                {folder.name}
              </span>
            )}

            {/* 图片数量 */}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{folder.imageCount}</span>
          </div>
          
          {/* 新建子文件夹输入框 */}
          {creatingFolder && creatingFolder.type === 'child' && creatingFolder.basePath === folder.path && isExpanded && (
            <div
              className="flex items-center py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              style={{ paddingLeft: `${(level + 1) * 16 + 12}px` }}
            >
              <div className="w-5 mr-1" />
              <Folder className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFinishCreateFolder();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelCreateFolder();
                  }
                }}
                onBlur={handleFinishCreateFolder}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:outline-none underline decoration-2 decoration-green-500 underline-offset-2"
              />
            </div>
          )}
          
          {hasChildren && isExpanded && renderFolderTree(folder.children, level + 1)}
          
          {/* 新建同级文件夹输入框（在当前文件夹的子元素之后） */}
          {creatingFolder && creatingFolder.type === 'sibling' && creatingFolder.basePath === folder.path && (
            <div
              className="flex items-center py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              style={{ paddingLeft: `${level * 16 + 12}px` }}
            >
              <div className="w-5 mr-1" />
              <Folder className="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" />
              <input
                ref={newFolderInputRef}
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFinishCreateFolder();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelCreateFolder();
                  }
                }}
                onBlur={handleFinishCreateFolder}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none focus:outline-none underline decoration-2 decoration-green-500 underline-offset-2"
              />
            </div>
          )}
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

      {/* 文件夹右键菜单 */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={() => setContextMenu({ isOpen: false, position: null, folder: null })}
        options={contextMenu.folder ? [
          menuItems.newSiblingFolder(() => handleStartCreateFolder('sibling', contextMenu.folder.path)),
          menuItems.newSubFolder(() => handleStartCreateFolder('child', contextMenu.folder.path)),
          menuItems.divider(),
          menuItems.rename(() => handleStartRenameFolder(contextMenu.folder)),
          menuItems.move(() => handleMoveFolderClick(contextMenu.folder.path)),
          menuItems.delete(async () => {
            setContextMenu({ isOpen: false, position: null, folder: null });
            await handleDeleteFolder(contextMenu.folder.path);
          })
        ] : []}
      />

      {/* 撤销删除提示 */}
      <UndoToast
        isVisible={undoToast.isVisible}
        message={undoToast.message}
        onUndo={handleUndoFolderDelete}
        onClose={() => {
          setUndoToast({ isVisible: false, message: '', count: 0 });
          // 不清空历史栈，允许Toast消失后仍可Ctrl+Z
        }}
      />

      {/* 文件夹选择器 */}
      {showFolderSelector && (
        <FolderSelector
          folders={folders}
          currentFolder={moveFolderPath}
          onSelect={handleMoveFolder}
          onClose={() => {
            setShowFolderSelector(false);
            setMoveFolderPath(null);
          }}
        />
      )}
    </div>
  );
}

export default Sidebar;
