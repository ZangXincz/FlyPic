/**
 * 认证状态管理
 */

import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  // 是否已设置密码
  hasPassword: false,
  
  // 是否已通过认证
  isAuthenticated: false,
  
  // 是否正在检查认证状态
  isChecking: true,

  // 设置认证状态
  setAuthStatus: (hasPassword, isAuthenticated) => set({
    hasPassword,
    isAuthenticated,
    isChecking: false
  }),

  // 设置检查状态
  setChecking: (isChecking) => set({ isChecking }),

  // 登录成功
  setAuthenticated: () => set({ isAuthenticated: true }),

  // 登出
  logout: () => set({ isAuthenticated: false })
}));
