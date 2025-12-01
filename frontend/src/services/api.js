import axios from 'axios';

const API_BASE = '/api';

// Library API
export const libraryAPI = {
  getAll: () => axios.get(`${API_BASE}/library`),
  add: (name, path) => axios.post(`${API_BASE}/library`, { name, path }),
  update: (id, updates) => axios.put(`${API_BASE}/library/${id}`, updates),
  delete: (id) => axios.delete(`${API_BASE}/library/${id}`),
  setCurrent: (id) => axios.post(`${API_BASE}/library/${id}/set-current`),
  updatePreferences: (preferences) => axios.put(`${API_BASE}/library/preferences`, preferences),
  updateTheme: (theme) => axios.put(`${API_BASE}/library/theme`, { theme })
};

// Image API
export const imageAPI = {
  search: (libraryId, params = {}) => {
    const query = new URLSearchParams({
      libraryId,
      ...params
    });
    return axios.get(`${API_BASE}/image?${query}`);
  },
  getCount: (libraryId) => axios.get(`${API_BASE}/image/count?libraryId=${libraryId}`),
  getFolders: (libraryId) => axios.get(`${API_BASE}/image/folders?libraryId=${libraryId}`),
  getThumbnailUrl: (libraryId, size, filename) => `${API_BASE}/image/thumbnail/${libraryId}/${size}/${filename}`,
  getOriginalUrl: (libraryId, path) => `${API_BASE}/image/original/${libraryId}/${path}`,
  openInExplorer: (libraryId, path) => axios.post(`${API_BASE}/image/${libraryId}/open-file`, { path })
};

// Scan API
export const scanAPI = {
  fullScan: (libraryId, wait = false) => axios.post(`${API_BASE}/scan/full`, { libraryId, wait }),
  sync: (libraryId, wait = false) => axios.post(`${API_BASE}/scan/sync`, { libraryId, wait }),
  stop: (libraryId) => axios.post(`${API_BASE}/scan/stop`, { libraryId }),
  resume: (libraryId) => axios.post(`${API_BASE}/scan/resume`, { libraryId }),
  getStatus: (libraryId) => axios.get(`${API_BASE}/scan/status/${libraryId}`),
  fixFolders: (libraryId) => axios.post(`${API_BASE}/scan/fix-folders`, { libraryId })
};

// Watch API
export const watchAPI = {
  start: (libraryId) => axios.post(`${API_BASE}/watch/start/${libraryId}`),
  stop: (libraryId) => axios.post(`${API_BASE}/watch/stop/${libraryId}`),
  status: (libraryId) => axios.get(`${API_BASE}/watch/status/${libraryId}`),
  list: () => axios.get(`${API_BASE}/watch/list`)
};
