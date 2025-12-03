/**
 * 图片 API
 */

import { api } from '../client';

/**
 * 搜索图片
 */
export async function search(libraryId, params = {}, options = {}) {
  const query = new URLSearchParams({
    libraryId,
    ...params
  });
  
  return api.get(`/image?${query}`, options);
}

/**
 * 获取图片总数
 */
export async function getCount(libraryId) {
  return api.get(`/image/count?libraryId=${libraryId}`);
}

/**
 * 获取统计信息
 */
export async function getStats(libraryId) {
  return api.get(`/image/stats?libraryId=${libraryId}`);
}

/**
 * 获取文件夹列表
 */
export async function getFolders(libraryId) {
  return api.get(`/image/folders?libraryId=${libraryId}`);
}

/**
 * 获取缓存元数据
 */
export async function getCacheMeta(libraryId) {
  return api.get(`/image/cache-meta?libraryId=${libraryId}`);
}

/**
 * 获取缩略图 URL
 * 使用分片结构，不再需要 size 参数
 */
export function getThumbnailUrl(libraryId, filename) {
  return `/api/image/thumbnail/${libraryId}/${filename}`;
}

/**
 * 获取原图 URL
 */
export function getOriginalUrl(libraryId, path) {
  return `/api/image/original/${libraryId}/${path}`;
}

/**
 * 在文件管理器中打开
 */
export async function openInExplorer(libraryId, path) {
  return api.post(`/image/${libraryId}/open-file`, { path });
}
