import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useUIStore } from './stores/useUIStore';
import { useLibraryStore } from './stores/useLibraryStore';
import { useImageStore } from './stores/useImageStore';
import { useScanStore } from './stores/useScanStore';
import { libraryAPI, imageAPI, scanAPI } from './api';
import domCleanup from './utils/domCleanup';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import RightPanel from './components/RightPanel';
import Header from './components/Header';

function App() {
  const { theme, mobileView, setMobileView } = useUIStore();
  const { setLibraries, setCurrentLibrary } = useLibraryStore();
  const { selectedImage } = useImageStore();
  const { setScanProgress } = useScanStore();
  const [leftWidth, setLeftWidth] = useState(256); // 默认 256px (w-64)
  const [rightWidth, setRightWidth] = useState(320); // 默认 320px (w-80)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    // Apply theme
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // 检测屏幕尺寸
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // < 768px 为移动端
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 选中图片时自动切换到详情视图（移动端）
  useEffect(() => {
    if (isMobile && selectedImage) {
      setMobileView('detail');
    }
  }, [selectedImage, isMobile, setMobileView]);

  useEffect(() => {
    // Setup Socket.IO - 开发模式连接后端端口，生产模式使用同源
    const socketUrl = import.meta.env.DEV
      ? 'http://localhost:15002'  // 开发模式：后端端口
      : window.location.origin;   // 生产模式：同源

    console.log('🔌 Connecting to Socket.IO:', socketUrl);
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'], // 优先使用 websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
    });

    socket.on('scanProgress', (progress) => {
      // 只显示当前素材库的进度
      const currentLibId = useLibraryStore.getState().currentLibraryId;
      if (progress.libraryId === currentLibId) {
        setScanProgress(progress);
      }
    });

    socket.on('scanComplete', ({ libraryId, results }) => {
      console.log('📊 Scan complete:', { libraryId, results });

      // Only reload if this is the current library
      const currentLibId = useLibraryStore.getState().currentLibraryId;
      console.log('🔍 Current library:', currentLibId, 'Scan library:', libraryId, 'Match:', libraryId === currentLibId);

      if (libraryId === currentLibId) {
        console.log('🔄 Reloading folders and images...');

        // 获取当前的筛选条件
        const imageState = useImageStore.getState();
        const params = {
          keywords: imageState.searchKeywords,
          ...imageState.filters
        };

        // 只有选中了文件夹才添加 folder 参数
        if (imageState.selectedFolder) {
          params.folder = imageState.selectedFolder;
        }

        // 并行加载文件夹和图片
        Promise.all([
          imageAPI.getFolders(libraryId),
          // 如果没有选中文件夹且没有搜索条件，不加载图片（保持在 Dashboard）
          (imageState.selectedFolder || imageState.searchKeywords || imageState.filters.formats.length > 0)
            ? imageAPI.search(libraryId, params)
            : Promise.resolve({ images: [] }),
          // 扫描完成后总是重新获取总数
          imageAPI.getCount(libraryId)
        ]).then(([foldersRes, imagesRes, countRes]) => {
          useImageStore.getState().setFolders(foldersRes.folders);
          useImageStore.getState().setImages(imagesRes.images);
          // 更新图片总数
          useImageStore.getState().setTotalImageCount(countRes.count);

          console.log(`✅ Data reloaded, total: ${countRes.count}`);
        }).catch(err => {
          console.error('❌ Error reloading data:', err);
        }).finally(() => {
          // 最后清除进度
          setScanProgress(null);
          console.log('✅ Scan progress cleared');
        });
      } else {
        console.log('⚠️ Library mismatch, skipping reload');
        // 不是当前素材库，直接清除进度
        setScanProgress(null);
      }
    });

    socket.on('scanError', ({ libraryId, error }) => {
      setScanProgress(null);
      console.error('Scan error:', error);
    });

    socket.on('scanPaused', ({ libraryId, results }) => {
      console.log('⏸️ Scan paused:', { libraryId, results });
      // 保持进度显示，但标记为可以继续
    });

    // Socket 监听已就绪后，再加载库并可能触发同步
    loadLibraries();

    return () => {
      socket.disconnect();
      // 组件卸载时清理所有 DOM 资源
      domCleanup.cleanup();
    };
  }, []);

  const loadLibraries = async () => {
    try {
      const response = await libraryAPI.getAll();
      const { libraries, currentLibraryId: libId, theme: configTheme, preferences } = response;

      // 立即更新基础状态
      setLibraries(libraries);
      setCurrentLibrary(libId);

      // 加载主题和偏好设置
      if (configTheme) {
        useUIStore.getState().setTheme(configTheme);
      }
      if (preferences) {
        const { thumbnailHeight, leftPanelWidth, rightPanelWidth } = preferences;
        if (thumbnailHeight) useUIStore.getState().setThumbnailHeight(thumbnailHeight);
        if (leftPanelWidth) setLeftWidth(leftPanelWidth);
        if (rightPanelWidth) setRightWidth(rightPanelWidth);
      }

      if (libId) {
        // 并行加载图片和文件夹（加快初始加载速度）
        // 优化：启动时不加载全部图片，只加载文件夹
        const [foldersRes] = await Promise.all([
          imageAPI.getFolders(libId)
        ]);

        useImageStore.getState().setFolders(foldersRes.folders);

        // 获取总数
        try {
          const countRes = await imageAPI.getCount(libId);
          useImageStore.getState().setTotalImageCount(countRes.count);
        } catch (e) {
          console.error('Failed to get image count:', e);
        }

        console.log('📂 数据加载完成，文件监控器将自动检测变化');

        // 后台检查扫描状态（不阻塞主流程）
        scanAPI.getStatus(libId).then(scanStatus => {
          const { status, progress, pendingCount } = scanStatus;
          if (status === 'scanning' || status === 'paused') {
            console.log(`🔄 恢复扫描状态: ${status}, 进度: ${progress?.percent || 0}%`);
            setScanProgress({
              ...progress,
              canStop: true,
              isPaused: status === 'paused',
              pendingCount: pendingCount
            });
          }
        }).catch(() => { }); // 忽略状态检查错误
      }
    } catch (error) {
      console.error('Error loading libraries:', error);
    }
  };

  const loadImages = async (libraryId) => {
    try {
      const params = {};

      // Get current selected folder
      const selectedFolder = useImageStore.getState().selectedFolder;
      if (selectedFolder) {
        params.folder = selectedFolder;
      }

      const response = await imageAPI.search(libraryId, params);
      useImageStore.getState().setImages(response.images);
    } catch (error) {
      console.error('Error loading images:', error);
    }
  };

  const loadFolders = async (libraryId) => {
    try {
      const response = await imageAPI.getFolders(libraryId);
      useImageStore.getState().setFolders(response.folders);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  // 保存面板宽度
  const savePanelWidths = async (left, right) => {
    try {
      await libraryAPI.updatePreferences({
        leftPanelWidth: left,
        rightPanelWidth: right
      });
    } catch (error) {
      console.error('Error saving panel widths:', error);
    }
  };

  // 处理鼠标拖动（极致性能优化 + RAF 批处理）
  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    let currentLeftWidth = leftWidth;
    let currentRightWidth = rightWidth;

    // 缓存容器位置，避免重复计算
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerLeft = containerRect.left;
    const containerRight = containerRect.right;

    // RAF 批处理，避免一帧多次样式写入
    let rafId = null;
    let pendingLeft = null;
    let pendingRight = null;

    const flushStyle = () => {
      if (leftPanel && pendingLeft != null) {
        leftPanel.style.width = `${pendingLeft}px`;
        currentLeftWidth = pendingLeft;
      }
      if (rightPanel && pendingRight != null) {
        rightPanel.style.width = `${pendingRight}px`;
        currentRightWidth = pendingRight;
      }
      rafId = null;
      pendingLeft = null;
      pendingRight = null;
    };

    const handleMouseMove = (e) => {
      let needSchedule = false;

      if (isDraggingLeft && leftPanel) {
        const newWidth = e.clientX - containerLeft;
        if (newWidth >= 200 && newWidth <= 400) {
          pendingLeft = newWidth;
          needSchedule = true;
        }
      }

      if (isDraggingRight && rightPanel) {
        const newWidth = containerRight - e.clientX;
        if (newWidth >= 280 && newWidth <= 500) {
          pendingRight = newWidth;
          needSchedule = true;
        }
      }

      if (needSchedule && rafId == null) {
        rafId = requestAnimationFrame(flushStyle);
      }
    };

    const handleMouseUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        flushStyle();
      }
      // 更新 state 并保存
      setLeftWidth(currentLeftWidth);
      setRightWidth(currentRightWidth);
      savePanelWidths(currentLeftWidth, currentRightWidth);

      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      // 拖动结束，恢复
      useUIStore.getState().setIsResizingPanels(false);
      useUIStore.getState().setResizingSide(null);
    };

    // 使用 passive: false 确保可以阻止默认行为
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    // 禁用过渡动画
    if (leftPanel) leftPanel.style.transition = 'none';
    if (rightPanel) rightPanel.style.transition = 'none';

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      // 恢复过渡动画
      if (leftPanel) leftPanel.style.transition = '';
      if (rightPanel) rightPanel.style.transition = '';
    };
  }, [isDraggingLeft, isDraggingRight]);

  // 移动端布局
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <div className="flex-1 overflow-hidden relative">
          {/* 侧边栏视图 */}
          <div className={`absolute inset-0 transition-transform duration-300 ${mobileView === 'sidebar' ? 'translate-x-0' : '-translate-x-full'
            }`}>
            <Sidebar />
          </div>

          {/* 主内容视图 */}
          <div className={`absolute inset-0 transition-transform duration-300 ${mobileView === 'main' ? 'translate-x-0' :
            mobileView === 'sidebar' ? 'translate-x-full' : '-translate-x-full'
            }`}>
            <MainContent />
          </div>

          {/* 详情视图 */}
          <div className={`absolute inset-0 transition-transform duration-300 ${mobileView === 'detail' ? 'translate-x-0' : 'translate-x-full'
            }`}>
            <RightPanel />
          </div>
        </div>

        {/* 底部导航 */}
        <div className="flex border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <button
            onClick={() => setMobileView('sidebar')}
            className={`flex-1 flex flex-col items-center py-2 ${mobileView === 'sidebar' ? 'text-blue-500' : 'text-gray-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-xs mt-1">文件夹</span>
          </button>
          <button
            onClick={() => setMobileView('main')}
            className={`flex-1 flex flex-col items-center py-2 ${mobileView === 'main' ? 'text-blue-500' : 'text-gray-500'
              }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs mt-1">图片</span>
          </button>
          <button
            onClick={() => setMobileView('detail')}
            disabled={!selectedImage}
            className={`flex-1 flex flex-col items-center py-2 ${mobileView === 'detail' ? 'text-blue-500' : 'text-gray-500'
              } disabled:opacity-30`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs mt-1">详情</span>
          </button>
        </div>
      </div>
    );
  }

  // 桌面端布局
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* 左侧边栏 */}
        <div id="left-panel" style={{ width: `${leftWidth}px` }} className="flex-shrink-0 h-full">
          <Sidebar />
        </div>

        {/* 左侧拖动条 */}
        <div
          className={`group relative w-1 h-full cursor-col-resize flex-shrink-0 transition-colors ${isDraggingLeft ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700 hover:bg-blue-400'
            }`}
          onMouseDown={(e) => {
            e.preventDefault();
            // 标记正在拖动，供其他组件抑制重算
            useUIStore.getState().setIsResizingPanels(true);
            useUIStore.getState().setResizingSide('left');
            setIsDraggingLeft(true);
          }}
        >
          {/* 扩大点击区域 */}
          <div className="absolute inset-y-0 -left-2 -right-2 w-5" />
        </div>

        {/* 中间主内容区 */}
        <div className="flex-1 min-w-0 h-full">
          <MainContent />
        </div>

        {/* 右侧拖动条 */}
        <div
          className={`group relative w-1 h-full cursor-col-resize flex-shrink-0 transition-colors ${isDraggingRight ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700 hover:bg-blue-400'
            }`}
          onMouseDown={(e) => {
            e.preventDefault();
            // 标记正在拖动，供其他组件抑制重算
            useUIStore.getState().setIsResizingPanels(true);
            useUIStore.getState().setResizingSide('right');
            setIsDraggingRight(true);
          }}
        >
          {/* 扩大点击区域 */}
          <div className="absolute inset-y-0 -left-2 -right-2 w-5" />
        </div>

        {/* 右侧边栏 */}
        <div id="right-panel" style={{ width: `${rightWidth}px` }} className="flex-shrink-0 h-full">
          <RightPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
