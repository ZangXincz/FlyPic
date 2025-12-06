/**
 * 文件操作 API 客户端
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:15002';

export const fileAPI = {
  /**
   * 删除文件或文件夹（移到临时文件夹，5分钟内可撤销）
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待删除项 [{type: 'file'|'folder', path: 'path'}]
   */
  async delete(libraryId, items) {
    const response = await axios.delete(`${API_BASE}/api/file/delete`, {
      data: { libraryId, items }
    });
    return response.data;
  },

  /**
   * 重命名文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {string} path - 文件路径
   * @param {string} newName - 新名称
   */
  async rename(libraryId, path, newName) {
    const response = await axios.patch(`${API_BASE}/api/file/rename`, {
      libraryId,
      path,
      newName
    });
    return response.data;
  },

  /**
   * 移动文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待移动项
   * @param {string} targetFolder - 目标文件夹路径
   */
  async move(libraryId, items, targetFolder) {
    const response = await axios.post(`${API_BASE}/api/file/move`, {
      libraryId,
      items,
      targetFolder
    });
    return response.data;
  },

  /**
   * 复制文件或文件夹
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待复制项
   * @param {string} targetFolder - 目标文件夹路径
   * @param {string} conflictAction - 冲突处理方式: 'skip'|'replace'|'rename'
   */
  async copy(libraryId, items, targetFolder, conflictAction = 'rename') {
    const response = await axios.post(`${API_BASE}/api/file/copy`, {
      libraryId,
      items,
      targetFolder,
      conflictAction
    });
    return response.data;
  },

  /**
   * 更新文件元数据（评分、收藏、标签）
   * @param {string} libraryId - 素材库ID
   * @param {string} path - 文件路径
   * @param {Object} metadata - 元数据 {rating?, favorite?, tags?}
   */
  async updateMetadata(libraryId, path, metadata) {
    const response = await axios.patch(`${API_BASE}/api/file/metadata`, {
      libraryId,
      path,
      ...metadata
    });
    return response.data;
  },

  /**
   * 恢复文件或文件夹（从临时备份恢复）
   * @param {string} libraryId - 素材库ID
   * @param {Array} items - 待恢复项 [{type: 'file'|'folder', path: 'path'}]
   */
  async restore(libraryId, items) {
    const response = await axios.post(`${API_BASE}/api/file/restore`, {
      libraryId,
      items
    });
    return response.data;
  },

  /**
   * 创建空文件夹
   * @param {string} libraryId - 素材库ID
   * @param {string} folderPath - 文件夹路径
   */
  async createFolder(libraryId, folderPath) {
    const response = await axios.post(`${API_BASE}/api/file/create-folder`, {
      libraryId,
      folderPath
    });
    return response.data;
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

    const response = await axios.post(`${API_BASE}/api/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: onProgress
    });
    return response.data;
  }
};
