/**
 * 素材库 Hook
 */

import { useState, useCallback } from 'react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { libraryAPI } from '../api';

export function useLibrary() {
  const { 
    libraries, 
    currentLibraryId, 
    setLibraries, 
    setCurrentLibrary,
    getCurrentLibrary 
  } = useLibraryStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * 加载所有素材库
   */
  const loadLibraries = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await libraryAPI.getAll();
      setLibraries(response.libraries || []);
      setCurrentLibrary(response.currentLibraryId);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLibraries, setCurrentLibrary]);

  /**
   * 创建素材库
   */
  const createLibrary = useCallback(async (name, path) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await libraryAPI.add(name, path);
      await loadLibraries(); // 重新加载列表
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadLibraries]);

  /**
   * 切换素材库
   */
  const switchLibrary = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    
    try {
      await libraryAPI.setCurrent(id);
      setCurrentLibrary(id);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setCurrentLibrary]);

  /**
   * 删除素材库
   */
  const deleteLibrary = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    
    try {
      await libraryAPI.remove(id);
      await loadLibraries(); // 重新加载列表
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadLibraries]);

  return {
    libraries,
    currentLibraryId,
    currentLibrary: getCurrentLibrary(),
    loading,
    error,
    loadLibraries,
    createLibrary,
    switchLibrary,
    deleteLibrary
  };
}
