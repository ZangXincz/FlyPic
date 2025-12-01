import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Theme
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),

  // Libraries
  libraries: [],
  currentLibraryId: null,
  setLibraries: (libraries) => set({ libraries }),
  setCurrentLibrary: (id) => set({ currentLibraryId: id }),
  addLibrary: (library) => set((state) => ({ libraries: [...state.libraries, library] })),
  removeLibrary: (id) => set((state) => ({
    libraries: state.libraries.filter((lib) => lib.id !== id),
    currentLibraryId: state.currentLibraryId === id ? null : state.currentLibraryId
  })),

  // Images
  images: [],
  filteredImages: [],
  totalImageCount: 0,  // 整个素材库的总图片数
  setImages: (images) => set({ images, filteredImages: images }),
  setFilteredImages: (filteredImages) => set({ filteredImages }),
  setTotalImageCount: (count) => set({ totalImageCount: count }),
  
  // 图片加载状态（用于分批加载）
  imageLoadingState: {
    isLoading: false,
    isIdleLoading: false,
    loadedCount: 0,
    totalCount: 0,
    hasMore: false,
    currentRequestId: null
  },
  setImageLoadingState: (state) => set((prev) => ({
    imageLoadingState: { ...prev.imageLoadingState, ...state }
  })),
  
  // 追加图片（用于分批加载）
  appendImages: (newImages) => set((state) => ({
    images: [...state.images, ...newImages],
    filteredImages: [...state.filteredImages, ...newImages]
  })),

  // Folders
  folders: [],
  selectedFolder: null,
  setFolders: (folders) => set({ folders }),
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),

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
  }
}));

export default useStore;
