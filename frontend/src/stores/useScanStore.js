/**
 * 扫描状态管理（简化版）
 */

import { create } from 'zustand';

export const useScanStore = create((set, get) => ({
  scanProgress: null,
  scanStartTime: null,
  
  setScanProgress: (progress) => set((state) => {
    if (progress && !state.scanStartTime && progress.current > 0) {
      return { scanProgress: progress, scanStartTime: Date.now() };
    }
    if (!progress) {
      return { scanProgress: null, scanStartTime: null };
    }
    return { scanProgress: progress };
  }),
  
  clearScanProgress: () => set({ scanProgress: null, scanStartTime: null }),
  
  getEstimatedTimeLeft: () => {
    const { scanProgress, scanStartTime } = get();
    if (!scanProgress || !scanStartTime || scanProgress.current === 0) {
      return null;
    }
    const elapsed = Date.now() - scanStartTime;
    const rate = scanProgress.current / elapsed;
    const remaining = scanProgress.total - scanProgress.current;
    return Math.ceil((remaining / rate) / 1000);
  },
  
  isScanning: () => {
    const { scanProgress } = get();
    return scanProgress && scanProgress.status !== 'preparing';
  }
}));
