/**
 * 素材库 API
 */

import { api } from '../client';

/**
 * 获取所有素材库
 */
export async function getAll() {
  return api.get('/library');
}

/**
 * 添加素材库
 */
export async function add(name, path) {
  return api.post('/library', { name, path });
}

/**
 * 更新素材库
 */
export async function update(id, updates) {
  return api.put(`/library/${id}`, updates);
}

/**
 * 删除素材库
 * @param {string} id - 素材库ID
 * @param {boolean} autoSelectNext - 是否自动选择下一个素材库，默认 true
 */
export async function remove(id, autoSelectNext = true) {
  return api.delete(`/library/${id}?autoSelectNext=${autoSelectNext}`);
}

/**
 * 删除素材库（别名）
 */
export const deleteLibrary = remove;

/**
 * 设置当前素材库
 */
export async function setCurrent(id) {
  return api.post(`/library/${id}/set-current`);
}

/**
 * 更新偏好设置
 */
export async function updatePreferences(preferences) {
  return api.put('/library/preferences', preferences);
}

/**
 * 更新主题
 */
export async function updateTheme(theme) {
  return api.put('/library/theme', { theme });
}

/**
 * 验证素材库路径是否存在
 */
export async function validate(id) {
  return api.get(`/library/${id}/validate`);
}
