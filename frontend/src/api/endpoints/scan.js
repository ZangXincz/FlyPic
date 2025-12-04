/**
 * 扫描 API（简化版）
 */

import { api } from '../client';

export async function fullScan(libraryId, wait = false) {
  return api.post('/scan/full', { libraryId, wait });
}

export async function sync(libraryId, wait = false) {
  return api.post('/scan/sync', { libraryId, wait });
}

export async function getStatus(libraryId) {
  return api.get(`/scan/status/${libraryId}`);
}

export async function fixFolders(libraryId) {
  return api.post('/scan/fix-folders', { libraryId });
}
