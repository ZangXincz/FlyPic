/**
 * 认证 API
 */

import { api } from './client';

/**
 * 获取认证状态
 */
export function getAuthStatus() {
  return api.get('/auth/status');
}

/**
 * 首次设置密码
 */
export function setupPassword(password) {
  return api.post('/auth/setup', { password });
}

/**
 * 登录
 */
export function login(password) {
  return api.post('/auth/login', { password });
}

/**
 * 修改密码
 */
export function changePassword(oldPassword, newPassword) {
  return api.post('/auth/change-password', { oldPassword, newPassword });
}

export const authAPI = {
  getAuthStatus,
  setupPassword,
  login,
  changePassword
};
