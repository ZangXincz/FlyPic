/**
 * 扫描 API
 */

import { api } from '../client';

/**
 * 全量扫描
 */
export async function fullScan(libraryId, wait = false) {
  return api.post('/scan/full', { libraryId, wait });
}

/**
 * 增量同步
 */
export async function sync(libraryId, wait = false) {
  return api.post('/scan/sync', { libraryId, wait });
}

/**
 * 停止扫描
 */
export async function stop(libraryId) {
  return api.post('/scan/stop', { libraryId });
}

/**
 * 继续扫描
 */
export async function resume(libraryId) {
  return api.post('/scan/resume', { libraryId });
}

/**
 * 获取扫描状态
 */
export async function getStatus(libraryId) {
  return api.get(`/scan/status/${libraryId}`);
}

/**
 * 修复文件夹路径
 */
export async function fixFolders(libraryId) {
  return api.post('/scan/fix-folders', { libraryId });
}
