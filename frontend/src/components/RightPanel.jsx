import { useState, useEffect } from 'react';
import { Copy, Download, Check, FolderDown, ArrowLeft } from 'lucide-react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { useUIStore } from '../stores/useUIStore';
import { useScanStore } from '../stores/useScanStore';
import { imageAPI } from '../api';
import JSZip from 'jszip';

function RightPanel() {
  const { currentLibraryId } = useLibraryStore();
  const { selectedImage, selectedImages, selectedFolder, images } = useImageStore();
  const { setMobileView, isResizingPanels, resizingSide } = useUIStore();
  const [isMobile, setIsMobile] = useState(false);
  const [imageUrl, setImageUrl] = useState(''); // 当前显示的图片URL
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExportingFolder, setIsExportingFolder] = useState(false);
  const [folderExportProgress, setFolderExportProgress] = useState(0);
  const [pathCopied, setPathCopied] = useState(false);

  // 计算实际选中的图片数量（合并 selectedImage 和 selectedImages）
  const actualSelectedCount = (() => {
    if (selectedImages.length > 0) {
      // 检查 selectedImage 是否已经在 selectedImages 中
      if (selectedImage && !selectedImages.some(img => img.id === selectedImage.id)) {
        return selectedImages.length + 1;
      }
      return selectedImages.length;
    }
    return selectedImage ? 1 : 0;
  })();
  
  // 判断是单选还是多选
  const isMultiSelect = actualSelectedCount > 1;
  const displayImage = selectedImages.length > 0 ? selectedImages[0] : selectedImage;
  const { getCurrentLibrary } = useLibraryStore();
  const currentLibrary = getCurrentLibrary();

  // 检测操作系统并获取路径分隔符
  const getPathSeparator = () => {
    // 检测操作系统
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Windows 系统使用反斜杠
    if (platform.includes('win') || userAgent.includes('windows')) {
      return '\\';
    }
    // macOS 和 Linux 使用正斜杠
    return '/';
  };

  // 标准化路径（统一使用当前系统的分隔符）
  const normalizePath = (path) => {
    if (!path) return '';
    const separator = getPathSeparator();
    // 将所有斜杠统一为当前系统的分隔符
    return path.replace(/[\\/]+/g, separator);
  };

  // 获取完整路径（素材库路径 + 图片相对路径）
  const getFullPath = (imagePath) => {
    if (!currentLibrary?.path || !imagePath) return imagePath || '';
    const separator = getPathSeparator();
    const libraryPath = currentLibrary.path.replace(/[\\/]+$/, ''); // 移除末尾斜杠
    const relativePath = imagePath.replace(/^[\\/]+/, ''); // 移除开头斜杠
    const fullPath = `${libraryPath}${separator}${relativePath}`;
    return normalizePath(fullPath);
  };

  // 获取多个图片的共同父路径
  const getCommonParentPath = (images) => {
    if (!images || images.length === 0) return '';
    if (images.length === 1) return getFullPath(images[0].path);

    const separator = getPathSeparator();
    
    // 获取所有完整路径
    const fullPaths = images.map(img => getFullPath(img.path));
    
    // 分割路径为数组
    const pathParts = fullPaths.map(path => path.split(/[\\/]/));
    
    // 找到共同的前缀路径
    const commonParts = [];
    const minLength = Math.min(...pathParts.map(parts => parts.length - 1)); // 排除文件名
    
    for (let i = 0; i < minLength; i++) {
      const part = pathParts[0][i];
      if (pathParts.every(parts => parts[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }
    
    return commonParts.length > 0 ? commonParts.join(separator) : normalizePath(currentLibrary?.path || '');
  };

  // 复制路径到剪贴板
  const copyPathToClipboard = async (path) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(path);
      } else {
        // 备用方案
        fallbackCopyText(path);
      }
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2000);
    } catch (error) {
      console.error('复制路径失败:', error);
      alert('复制失败，请重试');
    }
  };

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 图片加载策略：先显示缩略图，后台加载原图；拖动右侧面板时只显示缩略图
  useEffect(() => {
    if (!selectedImage || !currentLibraryId) {
      setImageUrl('');
      return;
    }
    
    // 1. 立即显示缩略图
    const thumbnailUrl = getThumbnailUrl();
    setImageUrl(thumbnailUrl);
    setIsLoadingOriginal(true);
    
    // 如果正在拖动任一面板，则先不加载原图，降低主线程和解码压力
    if (isResizingPanels) {
      setIsLoadingOriginal(false);
      return;
    }

    // 2. 后台预加载原图
    const originalUrl = getOriginalUrl();
    const img = new Image();
    
    img.onload = () => {
      // 原图加载完成，切换到原图
      setImageUrl(originalUrl);
      setIsLoadingOriginal(false);
    };
    
    img.onerror = () => {
      // 原图加载失败，保持显示缩略图
      console.error('Failed to load original image');
      setIsLoadingOriginal(false);
    };
    
    img.src = originalUrl;
    
    // 清理函数
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [selectedImage, currentLibraryId, isResizingPanels, resizingSide]);

  if (!selectedImage && selectedImages.length === 0) {
    return (
      <div className="w-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">选择图片查看详情</p>
      </div>
    );
  }

  const getThumbnailUrl = () => {
    if (!currentLibraryId || !selectedImage?.thumbnail_path) return '';
    // Handle both forward and backslash
    const filename = selectedImage.thumbnail_path.replace(/\\/g, '/').split('/').pop();
    return imageAPI.getThumbnailUrl(currentLibraryId, filename);
  };
  
  const getOriginalUrl = () => {
    if (!currentLibraryId || !selectedImage?.path) return '';
    return imageAPI.getOriginalUrl(currentLibraryId, selectedImage.path);
  };

  // 检查剪贴板 API 是否可用
  const isClipboardApiSupported = () => {
    return typeof ClipboardItem !== 'undefined' && 
           navigator.clipboard && 
           typeof navigator.clipboard.write === 'function';
  };

  // 备用方案：使用 contenteditable + execCommand 复制图片（适用于非 HTTPS 环境）
  const fallbackCopyImage = async (imageUrl) => {
    return new Promise((resolve) => {
      // 创建一个隐藏的 contenteditable 容器
      const container = document.createElement('div');
      container.setAttribute('contenteditable', 'true');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      container.style.opacity = '0';
      document.body.appendChild(container);

      // 创建图片元素
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // 将图片添加到容器
        container.appendChild(img);
        
        // 选中容器内容
        const range = document.createRange();
        range.selectNodeContents(container);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        // 执行复制命令
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (err) {
          console.error('execCommand copy 失败:', err);
        }
        
        // 清理
        selection.removeAllRanges();
        document.body.removeChild(container);
        
        resolve(success);
      };
      
      img.onerror = () => {
        document.body.removeChild(container);
        resolve(false);
      };
      
      img.src = imageUrl;
    });
  };

  // 备用方案：使用 canvas + blob URL 复制图片
  const fallbackCopyImageViaCanvas = async (imageUrl) => {
    return new Promise(async (resolve) => {
      try {
        // 获取图片数据
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        
        // 创建图片元素
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const loadPromise = new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        
        img.src = URL.createObjectURL(blob);
        await loadPromise;
        
        // 使用 canvas 转换
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // 清理 blob URL
        URL.revokeObjectURL(img.src);
        
        // 获取 data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        // 创建 contenteditable 容器
        const container = document.createElement('div');
        container.setAttribute('contenteditable', 'true');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.opacity = '0';
        document.body.appendChild(container);
        
        // 创建使用 data URL 的图片
        const copyImg = document.createElement('img');
        copyImg.src = dataUrl;
        container.appendChild(copyImg);
        
        // 等待图片渲染
        await new Promise(r => setTimeout(r, 50));
        
        // 选中并复制
        const range = document.createRange();
        range.selectNodeContents(container);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (err) {
          console.error('execCommand copy 失败:', err);
        }
        
        // 清理
        selection.removeAllRanges();
        document.body.removeChild(container);
        
        resolve(success);
      } catch (err) {
        console.error('Canvas 复制失败:', err);
        resolve(false);
      }
    });
  };

  // 备用方案：使用 execCommand 复制文本
  const fallbackCopyText = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      return true;
    } catch (err) {
      console.error('execCommand 复制失败:', err);
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  };

  // 复制图片到剪贴板（支持粘贴到聊天软件和文件管理器）
  const copyImageToClipboard = async () => {
    try {
      // 获取原图URL
      const imageUrl = imageAPI.getOriginalUrl(currentLibraryId, selectedImage.path);
      
      // 方案1：尝试现代 Clipboard API（需要 HTTPS）
      if (isClipboardApiSupported()) {
        try {
          // 获取图片数据
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          // 创建临时图片元素
          const img = new Image();
          const loadPromise = new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          img.src = URL.createObjectURL(blob);
          await loadPromise;
          
          // 使用 canvas 转换为 PNG
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // 清理 blob URL
          URL.revokeObjectURL(img.src);
          
          // 转换为 PNG blob
          const pngBlob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png');
          });
          
          // 尝试写入剪贴板
          const clipboardItem = new ClipboardItem({
            'image/png': pngBlob
          });
          
          await navigator.clipboard.write([clipboardItem]);
          
          setImageCopied(true);
          setTimeout(() => setImageCopied(false), 2000);
          return;
        } catch (err) {
          console.warn('Clipboard API 失败，尝试备用方案:', err);
        }
      }
      
      // 方案2：使用 canvas + contenteditable + execCommand（非 HTTPS 环境）
      console.log('尝试 Canvas + execCommand 方案...');
      const canvasSuccess = await fallbackCopyImageViaCanvas(imageUrl);
      if (canvasSuccess) {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
        return;
      }
      
      // 方案3：直接使用图片 URL + contenteditable
      console.log('尝试直接图片 URL 方案...');
      const directSuccess = await fallbackCopyImage(imageUrl);
      if (directSuccess) {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
        return;
      }
      
      // 方案4：最后降级为复制链接
      console.warn('所有图片复制方案失败，降级为复制链接');
      const textSuccess = fallbackCopyText(imageUrl);
      if (textSuccess) {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
        alert('已复制图片链接到剪贴板\n（当前浏览器环境限制，无法直接复制图片）');
      } else {
        alert('复制失败，请手动复制图片链接：\n' + imageUrl);
      }
      
    } catch (error) {
      console.error('复制图片失败:', error);
      alert('复制图片失败，请重试');
    }
  };

  // 使用 contenteditable 复制多张图片（非 HTTPS 环境）
  const fallbackCopyMultipleImages = async (imageUrls) => {
    return new Promise(async (resolve) => {
      try {
        // 创建 contenteditable 容器
        const container = document.createElement('div');
        container.setAttribute('contenteditable', 'true');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.opacity = '0';
        document.body.appendChild(container);
        
        // 加载所有图片并转换为 data URL
        for (const { url, filename } of imageUrls) {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
              img.src = URL.createObjectURL(blob);
            });
            
            // 使用 canvas 转换为 data URL
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(img.src);
            
            const dataUrl = canvas.toDataURL('image/png');
            
            // 创建图片元素
            const copyImg = document.createElement('img');
            copyImg.src = dataUrl;
            copyImg.alt = filename;
            copyImg.style.display = 'block';
            copyImg.style.marginBottom = '10px';
            container.appendChild(copyImg);
          } catch (err) {
            console.error(`加载图片失败: ${filename}`, err);
          }
        }
        
        // 等待图片渲染
        await new Promise(r => setTimeout(r, 100));
        
        // 选中并复制
        const range = document.createRange();
        range.selectNodeContents(container);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (err) {
          console.error('execCommand copy 失败:', err);
        }
        
        // 清理
        selection.removeAllRanges();
        document.body.removeChild(container);
        
        resolve(success);
      } catch (err) {
        console.error('批量复制图片失败:', err);
        resolve(false);
      }
    });
  };

  // 计算要操作的图片列表（合并 selectedImage 和 selectedImages，避免漏选）
  const getImagesToProcess = () => {
    if (selectedImages.length > 0) {
      // 如果有多选，检查 selectedImage 是否已经在列表中
      if (selectedImage && !selectedImages.some(img => img.id === selectedImage.id)) {
        return [selectedImage, ...selectedImages];
      }
      return selectedImages;
    }
    return selectedImage ? [selectedImage] : [];
  };

  // 批量复制图片
  const copyMultipleImages = async () => {
    try {
      const imagesToCopy = getImagesToProcess();
      
      if (imagesToCopy.length === 1) {
        // 单张图片：直接复制
        await copyImageToClipboard();
        return;
      }
      
      // 多张图片
      const imageUrls = imagesToCopy.map(img => ({
        url: imageAPI.getOriginalUrl(currentLibraryId, img.path),
        filename: img.filename
      }));
      
      // 创建纯文本格式（文件名列表）
      const textContent = imagesToCopy.map(img => img.filename).join('\n');
      
      // 方案1：尝试现代 Clipboard API
      if (isClipboardApiSupported()) {
        try {
          // 加载所有图片并转换为 base64
          const imageDataList = await Promise.all(
            imagesToCopy.map(async (img) => {
              const imageUrl = imageAPI.getOriginalUrl(currentLibraryId, img.path);
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve({
                    dataUrl: reader.result,
                    filename: img.filename
                  });
                };
                reader.readAsDataURL(blob);
              });
            })
          );
          
          // 创建 HTML 格式
          const htmlContent = imageDataList.map(({ dataUrl, filename }) => 
            `<img src="${dataUrl}" alt="${filename}" style="display:block; margin:10px 0;">`
          ).join('\n');
          
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/html': new Blob([htmlContent], { type: 'text/html' }),
              'text/plain': new Blob([textContent], { type: 'text/plain' })
            })
          ]);
          
          setImageCopied(true);
          setTimeout(() => setImageCopied(false), 2000);
          return;
        } catch (err) {
          console.warn('Clipboard API 失败，尝试备用方案:', err);
        }
      }
      
      // 方案2：使用 contenteditable + execCommand
      console.log('尝试 contenteditable 批量复制方案...');
      const success = await fallbackCopyMultipleImages(imageUrls);
      if (success) {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
        return;
      }
      
      // 方案3：降级为复制文件名列表
      console.warn('批量图片复制失败，降级为复制文件名');
      const textSuccess = fallbackCopyText(textContent);
      if (textSuccess) {
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
        alert(`已复制 ${imagesToCopy.length} 个文件名到剪贴板\n（当前环境限制，建议使用"导出"功能）`);
      } else {
        alert('复制失败，请使用"导出"功能下载图片');
      }
      
    } catch (error) {
      console.error('复制图片失败:', error);
      alert('复制图片失败，请重试');
    }
  };

  // 批量导出图片（打包成 ZIP）
  const exportMultipleImages = async () => {
    setIsExporting(true);
    try {
      const imagesToExport = getImagesToProcess();
      
      if (imagesToExport.length === 1) {
        // 单张图片直接下载
        const url = imageAPI.getOriginalUrl(currentLibraryId, imagesToExport[0].path);
        const link = document.createElement('a');
        link.href = url;
        link.download = imagesToExport[0].filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // 多张图片：打包成 ZIP
        const zip = new JSZip();
        const folder = zip.folder('images');
        
        setExportProgress(0);
        
        // 下载所有图片并添加到 ZIP
        for (let i = 0; i < imagesToExport.length; i++) {
          const img = imagesToExport[i];
          const url = imageAPI.getOriginalUrl(currentLibraryId, img.path);
          
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            
            // 添加到 ZIP，使用原文件名
            folder.file(img.filename, blob);
            
            // 更新进度
            const progress = Math.round(((i + 1) / imagesToExport.length) * 90); // 90% 用于下载
            setExportProgress(progress);
            
            console.log(`已添加: ${img.filename} (${i + 1}/${imagesToExport.length})`);
          } catch (error) {
            console.error(`下载失败: ${img.filename}`, error);
          }
        }
        
        // 生成 ZIP 文件
        setExportProgress(95);
        console.log('正在生成 ZIP 文件...');
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });
        
        // 下载 ZIP 文件
        setExportProgress(100);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `FlyPic_导出_${imagesToExport.length}张_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        console.log('导出完成！');
      }
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 导出当前文件夹的所有图片
  const exportCurrentFolder = async () => {
    if (!selectedFolder) {
      alert('请先选择一个文件夹');
      return;
    }

    setIsExportingFolder(true);
    setFolderExportProgress(0);

    try {
      // 获取当前文件夹下的所有图片
      const folderImages = images.filter(img => {
        // 检查图片是否在当前文件夹或其子文件夹中
        return img.folder && img.folder.startsWith(selectedFolder);
      });

      if (folderImages.length === 0) {
        alert('当前文件夹没有图片');
        return;
      }

      // 创建 ZIP
      const zip = new JSZip();
      const folderName = selectedFolder.split('/').pop() || 'images';
      const folder = zip.folder(folderName);

      // 下载所有图片并添加到 ZIP
      for (let i = 0; i < folderImages.length; i++) {
        const img = folderImages[i];
        const url = imageAPI.getOriginalUrl(currentLibraryId, img.path);

        try {
          const response = await fetch(url);
          const blob = await response.blob();

          // 保持相对路径结构
          const relativePath = img.folder.replace(selectedFolder, '').replace(/^\//, '');
          const filePath = relativePath ? `${relativePath}/${img.filename}` : img.filename;
          
          folder.file(filePath, blob);

          // 更新进度
          const progress = Math.round(((i + 1) / folderImages.length) * 90);
          setFolderExportProgress(progress);

          console.log(`已添加: ${filePath} (${i + 1}/${folderImages.length})`);
        } catch (error) {
          console.error(`下载失败: ${img.filename}`, error);
        }
      }

      // 生成 ZIP 文件
      setFolderExportProgress(95);
      console.log('正在生成 ZIP 文件...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // 下载 ZIP 文件
      setFolderExportProgress(100);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${folderName}_${folderImages.length}张_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      console.log('文件夹导出完成！');
    } catch (error) {
      console.error('导出文件夹失败:', error);
      alert('导出文件夹失败，请重试');
    } finally {
      setIsExportingFolder(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '无数据';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '无效日期';
    return date.toLocaleString('zh-CN');
  };

  // 计算多选图片的统计信息
  const getMultiSelectStats = () => {
    const images = getImagesToProcess();
    if (images.length === 0) return null;

    // 总大小
    const totalSize = images.reduce((sum, img) => sum + (img.size || 0), 0);

    // 尺寸范围
    const widths = images.map(img => img.width).filter(Boolean);
    const heights = images.map(img => img.height).filter(Boolean);
    const minWidth = widths.length > 0 ? Math.min(...widths) : 0;
    const maxWidth = widths.length > 0 ? Math.max(...widths) : 0;
    const minHeight = heights.length > 0 ? Math.min(...heights) : 0;
    const maxHeight = heights.length > 0 ? Math.max(...heights) : 0;

    // 格式列表（去重）
    const formats = [...new Set(images.map(img => img.format).filter(Boolean))];

    // 时间范围（支持两种字段名：created_at 和 createdAt）
    const timestamps = images.map(img => img.createdAt || img.created_at).filter(Boolean);
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : null;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : null;

    const modifiedTimestamps = images.map(img => img.modifiedAt || img.modified_at).filter(Boolean);
    const minModifiedTime = modifiedTimestamps.length > 0 ? Math.min(...modifiedTimestamps) : null;
    const maxModifiedTime = modifiedTimestamps.length > 0 ? Math.max(...modifiedTimestamps) : null;

    const sizes = images.map(img => img.size).filter(Boolean);
    const minSize = sizes.length > 0 ? Math.min(...sizes) : 0;
    const maxSize = sizes.length > 0 ? Math.max(...sizes) : 0;

    return {
      count: images.length,
      totalSize,
      sizeRange: { min: minSize, max: maxSize },
      dimensionRange: { minWidth, maxWidth, minHeight, maxHeight },
      formats,
      timeRange: { min: minTime, max: maxTime },
      modifiedTimeRange: { min: minModifiedTime, max: maxModifiedTime }
    };
  };

  return (
    <div className="w-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col h-full">
      {/* 移动端返回按钮 */}
      {isMobile && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
          <button
            onClick={() => setMobileView('main')}
            className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-blue-500"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回</span>
          </button>
        </div>
      )}
      
      {/* Progressive Image Preview */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="w-full aspect-square bg-transparent border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden relative">
          <img
            src={imageUrl}
            alt={displayImage.filename}
            decoding="async"
            className={`w-full h-full object-contain transition-opacity duration-300 ${
              isLoadingOriginal ? 'opacity-75' : 'opacity-100'
            }`}
          />
          {isLoadingOriginal && (
            <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
              加载原图中...
            </div>
          )}
        </div>
      </div>

      {/* Image Info - 可滚动区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {isMultiSelect ? `已选择 ${actualSelectedCount} 张图片` : '基本信息'}
          </h3>
          <div className="space-y-2 text-sm">
            {isMultiSelect ? (
              // 多选模式
              (() => {
                const stats = getMultiSelectStats();
                if (!stats) return null;
                
                return (
                  <>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">数量:</span>
                      <p className="text-gray-900 dark:text-gray-100">{stats.count} 张图片</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">尺寸范围:</span>
                      <p className="text-gray-900 dark:text-gray-100">
                        {stats.dimensionRange.minWidth === stats.dimensionRange.maxWidth && 
                         stats.dimensionRange.minHeight === stats.dimensionRange.maxHeight ? (
                          // 所有图片尺寸相同
                          `${stats.dimensionRange.minWidth} × ${stats.dimensionRange.minHeight}`
                        ) : (
                          // 尺寸不同，显示范围
                          `${stats.dimensionRange.minWidth}~${stats.dimensionRange.maxWidth} × ${stats.dimensionRange.minHeight}~${stats.dimensionRange.maxHeight}`
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">总大小:</span>
                      <p className="text-gray-900 dark:text-gray-100">{formatFileSize(stats.totalSize)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">格式:</span>
                      <p className="text-gray-900 dark:text-gray-100 uppercase">
                        {stats.formats.join(', ')}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">创建时间:</span>
                      <p className="text-gray-900 dark:text-gray-100 text-xs">
                        {stats.timeRange.min && stats.timeRange.max ? (
                          stats.timeRange.min === stats.timeRange.max ? (
                            formatDate(stats.timeRange.min)
                          ) : (
                            `${formatDate(stats.timeRange.min)} ~ ${formatDate(stats.timeRange.max)}`
                          )
                        ) : (
                          '无数据'
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">修改时间:</span>
                      <p className="text-gray-900 dark:text-gray-100 text-xs">
                        {stats.modifiedTimeRange.min && stats.modifiedTimeRange.max ? (
                          stats.modifiedTimeRange.min === stats.modifiedTimeRange.max ? (
                            formatDate(stats.modifiedTimeRange.min)
                          ) : (
                            `${formatDate(stats.modifiedTimeRange.min)} ~ ${formatDate(stats.modifiedTimeRange.max)}`
                          )
                        ) : (
                          '无数据'
                        )}
                      </p>
                    </div>
                  </>
                );
              })()
            ) : (
              // 单选模式
              <>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">文件名:</span>
                  <p className="text-gray-900 dark:text-gray-100 break-all">{selectedImage.filename}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">尺寸:</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {selectedImage.width} × {selectedImage.height}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">大小:</span>
                  <p className="text-gray-900 dark:text-gray-100">{formatFileSize(selectedImage.size)}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">格式:</span>
                  <p className="text-gray-900 dark:text-gray-100 uppercase">{selectedImage.format}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">创建时间:</span>
                  <p className="text-gray-900 dark:text-gray-100">{formatDate(selectedImage.createdAt || selectedImage.created_at)}</p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">修改时间:</span>
                  <p className="text-gray-900 dark:text-gray-100">{formatDate(selectedImage.modifiedAt || selectedImage.modified_at)}</p>
                </div>
              </>
            )}
            <div>
              <span className="text-gray-500 dark:text-gray-400">路径:</span>
              <div className="flex items-start gap-2 mt-1">
                <p 
                  className="flex-1 text-gray-900 dark:text-gray-100 text-xs break-all cursor-pointer hover:text-blue-500 transition-colors"
                  onClick={() => {
                    const path = isMultiSelect 
                      ? getCommonParentPath(getImagesToProcess())
                      : getFullPath(selectedImage.path);
                    copyPathToClipboard(path);
                  }}
                  title="点击复制路径"
                >
                  {isMultiSelect 
                    ? getCommonParentPath(getImagesToProcess())
                    : getFullPath(selectedImage.path)
                  }
                </p>
                <button
                  onClick={() => {
                    const path = isMultiSelect 
                      ? getCommonParentPath(getImagesToProcess())
                      : getFullPath(selectedImage.path);
                    copyPathToClipboard(path);
                  }}
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    pathCopied
                      ? 'text-green-500'
                      : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title="复制路径"
                >
                  {pathCopied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              {isMultiSelect && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  已选择 {actualSelectedCount} 张图片的共同父路径
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions - 仅桌面端显示 */}
      {!isMobile && (
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2 flex-shrink-0">
        {/* 复制按钮 */}
        <button
          onClick={copyMultipleImages}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all ${
            imageCopied
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {imageCopied ? (
            <>
              <Check className="w-4 h-4" />
              <span>已复制{isMultiSelect ? ` ${actualSelectedCount} 张` : ''}</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>复制图片{isMultiSelect ? ` (${actualSelectedCount})` : ''}</span>
            </>
          )}
        </button>
        
        {/* 导出按钮 */}
        <button
          onClick={exportMultipleImages}
          disabled={isExporting}
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>
              {isExporting 
                ? `打包中... ${exportProgress}%` 
                : `导出图片${isMultiSelect ? ` (${actualSelectedCount})` : ''}`
              }
            </span>
          </div>
          {isExporting && isMultiSelect && (
            <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-1.5 mt-1">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          )}
        </button>
        
        {/* 导出文件夹按钮 */}
        {selectedFolder && (
          <button
            onClick={exportCurrentFolder}
            disabled={isExportingFolder}
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <FolderDown className="w-4 h-4" />
              <span>
                {isExportingFolder 
                  ? `打包文件夹... ${folderExportProgress}%` 
                  : '导出当前文件夹'
                }
              </span>
            </div>
            {isExportingFolder && (
              <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-1.5 mt-1">
                <div
                  className="bg-gray-700 dark:bg-gray-300 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${folderExportProgress}%` }}
                />
              </div>
            )}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export default RightPanel;
