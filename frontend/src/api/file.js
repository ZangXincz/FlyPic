/**
 * 文件操作 API 客户端
 */

import { api, getToken } from './client';
import axios from 'axios';

const API_BASE = '/api';

export const fileAPI = {
  /**
   * 删除文件或文件夹（移到临时文件夹，5分钟内可撤销）
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待删除项 [{type: 'file'|'folder', path: 'path'}]
   */
  async delete(libraryId, items) {
    return api.delete('/file/delete', {
      body: JSON.stringify({ libraryId, items }),
      headers: { 'Content-Type': 'application/json' }
    });
  },

  /**
   * 重命名文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {string} path - 文件路径
   * @param {string} newName - 新名称
   */
  async rename(libraryId, path, newName) {
    return api.patch('/file/rename', {
      libraryId,
      path,
      newName
    });
  },

  /**
   * 移动文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待移动项
   * @param {string} targetFolder - 目标文件夹路径
   */
  async move(libraryId, items, targetFolder) {
    return api.post('/file/move', {
      libraryId,
      items,
      targetFolder
    });
  },

  /**
   * 复制文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待复制项
   * @param {string} targetFolder - 目标文件夹路径
   * @param {string} conflictAction - 冲突处理方式: 'skip'|'replace'|'rename'
   */
  async copy(libraryId, items, targetFolder, conflictAction = 'rename') {
    return api.post('/file/copy', {
      libraryId,
      items,
      targetFolder,
      conflictAction
    });
  },

  /**
   * 更新文件元数据（评分、收藏、标签）
   * @param {string} libraryId - 素材库ID
   * @param {string} path - 文件路径
   * @param {Object} metadata - 元数据 {rating?, favorite?, tags?}
   */
  async updateMetadata(libraryId, path, metadata) {
    return api.patch('/file/metadata', {
      libraryId,
      path,
      ...metadata
    });
  },

  /**
   * 恢复文件或文件夹（从临时备份恢复）
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待恢复项 [{type: 'file'|'folder', path: 'path'}]
   */
  async restore(libraryId, items) {
    return api.post('/file/restore', {
      libraryId,
      items
    });
  },

  /**
   * 创建空文件夹
   * @param {string} libraryId - 素材库ID
   * @param {string} folderPath - 文件夹路径
   */
  async createFolder(libraryId, folderPath) {
    return api.post('/file/create-folder', {
      libraryId,
      folderPath
    });
  },

  /**
   * 上传文件到指定文件夹
   * @param {string} libraryId - 素材库ID
   * @param {string} targetFolder - 目标文件夹路径（可选，默认根目录）
   * @param {File[]} files - 待上传的文件数组
   * @param {Function} onProgress - 进度回调函数 (progressEvent) => {}
   * @param {string} conflictAction - 冲突处理方式: 'skip'|'replace'|'rename'
   */
  async upload(libraryId, targetFolder, files, onProgress, conflictAction) {
    const formData = new FormData();
    formData.append('libraryId', libraryId);
    if (targetFolder) {
      formData.append('targetFolder', targetFolder);
    }
    if (conflictAction) {
      formData.append('conflictAction', conflictAction);
    }
    
    // 添加所有文件
    for (const file of files) {
      formData.append('files', file);
    }

    // 使用 Axios 处理上传（支持进度回调），手动添加 Authorization 头
    const token = getToken();
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await axios.post(`${API_BASE}/upload`, formData, {
      headers,
      onUploadProgress: onProgress
    });
    return response.data;
  }
};
