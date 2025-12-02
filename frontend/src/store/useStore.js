import { create } from 'zustand';
import imageCache from '../utils/imageCache';
import domCleanup from '../utils/domCleanup';

const useStore = create((set, get) => ({
  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  // Libraries
  libraries: [],
  currentLibraryId: null,
  setLibraries: (libraries) => set({ libraries }),
  
  // 切换素材库时清理缓存
  setCurrentLibrary: (id) => {
    const state = get();
    if (state.currentLibraryId !== id) {
      console.log('[Store] Switching library, clearing caches...');
      imageCache.clear();
      domCleanup.revokeAllBlobUrls();
    }
    set({ currentLibraryId: id });
  },
  addLibrary: (library) => set((state) => ({ libraries: [...state.libraries, library] })),
  removeLibrary: (id) => set((state) => ({
    libraries: state.libraries.filter((lib) => lib.id !== id),
    currentLibraryId: state.currentLibraryId === id ? null : state.currentLibraryId
  })),

  // Images (只存储轻量元数据)
  images: [],
  filteredImages: [],
  totalImageCount: 0,  // 整个素材库的总图片数
  
  // 设置图片（只存储必要字段）
  setImages: (images) => {
    // 只保留必要字段，减少内存占用
    const lightweightImages = images.map(img => ({
      id: img.id,
      path: img.path,
      filename: img.filename,
      size: img.size,
      format: img.format,
      width: img.width,
      height: img.height,
      thumbnailPath: img.thumbnail_path || img.thumbnailPath,
      folder: img.folder
    }));
    set({ images: lightweightImages, filteredImages: lightweightImages });
  },
  
  setFilteredImages: (filteredImages) => set({ filteredImages }),
  setTotalImageCount: (count) => set({ totalImageCount: count }),
  
  // 图片加载状态（用于分批加载）
  imageLoadingState: {
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    hasMore: false
  },
  setImageLoadingState: (state) => set((prev) => ({
    imageLoadingState: { ...prev.imageLoadingState, ...state }
  })),
  
  // 追加图片（用于分批加载）
  appendImages: (newImages) => set((state) => ({
    images: [...state.images, ...newImages],
    filteredImages: [...state.filteredImages, ...newImages]
  })),

  // Folders (只存储路径和图片数量)
  folders: [],
  selectedFolder: null,
  
  // 设置文件夹（只保留必要字段）
  setFolders: (folders) => {
    const lightweightFolders = folders.map(folder => ({
      path: folder.path,
      name: folder.name,
      imageCount: folder.image_count || folder.imageCount,
      parentPath: folder.parent_path || folder.parentPath,
      children: folder.children || []
    }));
    set({ folders: lightweightFolders });
  },
  
  // 切换文件夹时清理缓存
  setSelectedFolder: (folder) => {
    const state = get();
    if (state.selectedFolder !== folder) {
      console.log('[Store] Switching folder, clearing ALL data...');
      imageCache.clear();
      domCleanup.revokeAllBlobUrls();
      // 完全清空图片列表（真正的按需加载）
      set({ 
        selectedFolder: folder,
        images: [],
        filteredImages: []
      });
      return;
    }
    set({ selectedFolder: folder });
  },

  // Search and filters
  searchKeywords: '',
  filters: {
    formats: [],
    minSize: null,
    maxSize: null,
    startDate: null,
    endDate: null
  },
  setSearchKeywords: (keywords) => set({ searchKeywords: keywords }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({
    searchKeywords: '',
    filters: {
      formats: [],
      minSize: null,
      maxSize: null,
      startDate: null,
      endDate: null
    }
  }),

  // Selected image (单选)
  selectedImage: null,
  setSelectedImage: (image) => set({ selectedImage: image }),

  // Selected images (多选)
  selectedImages: [],
  setSelectedImages: (images) => set({ selectedImages: images }),
  toggleImageSelection: (image) => set((state) => {
    const isSelected = state.selectedImages.some(img => img.path === image.path);
    if (isSelected) {
      return { selectedImages: state.selectedImages.filter(img => img.path !== image.path) };
    } else {
      return { selectedImages: [...state.selectedImages, image] };
    }
  }),
  clearSelection: () => set({ selectedImages: [], selectedImage: null }),

  // Scan progress
  scanProgress: null,
  scanStartTime: null,  // 扫描开始时间
  setScanProgress: (progress) => set((state) => {
    // 第一次收到进度时记录开始时间
    if (progress && !state.scanStartTime && progress.current > 0) {
      return { scanProgress: progress, scanStartTime: Date.now() };
    }
    // 扫描结束时清空开始时间
    if (!progress) {
      return { scanProgress: null, scanStartTime: null };
    }
    return { scanProgress: progress };
  }),

  // Panel resizing state（拖动侧边栏时置为 true，用于抑制重算）
  isResizingPanels: false,
  setIsResizingPanels: (value) => set({ isResizingPanels: value }),

  // 正在拖动的侧边：'left' | 'right' | null
  resizingSide: null,
  setResizingSide: (side) => set({ resizingSide: side }),

  // Thumbnail size
  thumbnailHeight: 200,
  setThumbnailHeight: (height) => set({ thumbnailHeight: height }),

  // Mobile view state
  mobileView: 'main', // 'sidebar' | 'main' | 'detail'
  setMobileView: (view) => set({ mobileView: view }),

  // Get current library
  getCurrentLibrary: () => {
    const state = get();
    return state.libraries.find((lib) => lib.id === state.currentLibraryId);
  },

  // Image cache statistics
  getCacheStats: () => {
    return imageCache.getStats();
  },

  // Clear all caches (for manual cleanup)
  clearAllCaches: () => {
    console.log('[Store] Clearing all caches...');
    imageCache.clear();
    domCleanup.cleanup();
  }
}));

export default useStore;
