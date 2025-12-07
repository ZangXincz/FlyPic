/**
 * 上传进度提示组件
 */

const UploadProgress = ({ progress }) => {
  const { isUploading, percent, total } = progress;

  if (!isUploading) return null;

  return (
    <div className="absolute top-4 right-4 z-40 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 min-w-[300px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          正在上传...
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {percent}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right">
        共 {total} 个文件
      </div>
    </div>
  );
};

export default UploadProgress;
