/**
 * 图片状态管理
 * 简化版：只做向下无限滚动，依赖浏览器原生懒加载管理内存
 */

import { create } from 'zustand';

export const useImageStore = create((set, get) => ({
  // 图片列表
  images: [],
  selectedImage: null,
  selectedImages: [],
  totalImageCount: 0,
  
  // 文件夹
  folders: [],
  selectedFolder: null,
  
  // 搜索和过滤
  searchKeywords: '',
  filters: {
    formats: [],
    minSize: null,
    maxSize: null,
    startDate: null,
    endDate: null
  },
  
  // 加载状态
  imageLoadingState: {
    isLoading: false,
    loadedCount: 0,
    totalCount: 0,
    hasMore: false,
  },
  
  // 图片操作
  setImages: (images) => set({ images }),
  
  // 追加图片（向下滚动时）
  appendImages: (newImages) => set((state) => ({
    images: [...state.images, ...newImages]
  })),
  
  clearImages: () => set({ images: [] }),
  
  // 选择操作
  setSelectedImage: (image) => set({ selectedImage: image }),
  
  setSelectedImages: (images) => set({ selectedImages: images }),
  
  toggleImageSelection: (image) => set((state) => {
    const isSelected = state.selectedImages.some(img => img.path === image.path);
    return {
      selectedImages: isSelected
        ? state.selectedImages.filter(img => img.path !== image.path)
        : [...state.selectedImages, image]
    };
  }),
  
  clearSelection: () => set({ selectedImages: [], selectedImage: null }),
  
  // 文件夹操作
  setFolders: (folders) => set({ folders }),
  
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),
  
  // 搜索和过滤
  setSearchKeywords: (keywords) => set({ searchKeywords: keywords }),
  
  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters } 
  })),
  
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
  
  // 统计
  setTotalImageCount: (count) => set({ totalImageCount: count }),
  
  // 加载状态
  setImageLoadingState: (state) => set((prev) => ({
    imageLoadingState: { ...prev.imageLoadingState, ...state }
  }))
}));
