/**
 * 素材库状态管理
 */

import { create } from 'zustand';

export const useLibraryStore = create((set, get) => ({
  // 状态
  libraries: [],
  currentLibraryId: null,

  // 设置素材库列表
  setLibraries: (libraries) => set({ libraries }),
  
  // 设置当前素材库
  setCurrentLibrary: (id) => set({ currentLibraryId: id }),
  
  // 添加素材库
  addLibrary: (library) => set((state) => ({ 
    libraries: [...state.libraries, library] 
  })),
  
  // 移除素材库
  removeLibrary: (id) => set((state) => ({
    libraries: state.libraries.filter((lib) => lib.id !== id),
    currentLibraryId: state.currentLibraryId === id ? null : state.currentLibraryId
  })),
  
  // 更新素材库
  updateLibrary: (id, updates) => set((state) => ({
    libraries: state.libraries.map((lib) => 
      lib.id === id ? { ...lib, ...updates } : lib
    )
  })),
  
  // 获取当前素材库
  getCurrentLibrary: () => {
    const { libraries, currentLibraryId } = get();
    return libraries.find((lib) => lib.id === currentLibraryId);
  }
}));
