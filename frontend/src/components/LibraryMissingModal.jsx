import { AlertTriangle, FolderOpen, Plus, RefreshCw } from 'lucide-react';

/**
 * 素材库路径丢失弹窗
 * 两种状态：
 * - missing_index: 文件夹存在但索引不存在（可重新扫描）
 * - missing_folder: 文件夹不存在（只能打开其他或新建）
 */
function LibraryMissingModal({ 
  isOpen, 
  libraryName, 
  libraryPath,
  status, // 'missing_index' | 'missing_folder'
  onRescan,
  onOpenOther, 
  onCreateNew
}) {
  if (!isOpen) return null;

  const isMissingIndex = status === 'missing_index';
  const title = isMissingIndex ? '素材库索引丢失' : '打开资源库失败';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        <div className="flex">
          {/* 左侧内容 */}
          <div className="flex-1 p-6">
            {/* 标题 */}
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
            </div>

            {/* 描述 */}
            <div className="text-gray-600 dark:text-gray-300 mb-6 space-y-2">
              {isMissingIndex ? (
                <>
                  <p>
                    素材库 <span className="font-medium text-gray-900 dark:text-white">{libraryName}</span> 的索引数据已丢失。
                  </p>
                  <p>
                    路径: <span className="text-blue-500 break-all">{libraryPath}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    图片文件夹仍然存在，您可以重新扫描来重建索引。
                  </p>
                </>
              ) : (
                <>
                  <p>
                    在这个位置的资源库(
                    <span className="text-blue-500 break-all">{libraryPath}</span>
                    ) 打开失败，可能是因为路径已经变化，或者资源库链接错误。
                  </p>
                  <p>
                    如果您更改过资源库位置，可以{' '}
                    <button 
                      onClick={onOpenOther}
                      className="text-blue-500 hover:text-blue-600 hover:underline"
                    >
                      重新选择路径
                    </button>
                    {' '}打开
                  </p>
                </>
              )}
            </div>

            {/* 分隔线 */}
            <div className="text-gray-500 dark:text-gray-400 mb-4">
              {isMissingIndex ? '请选择操作:' : '您也可以:'}
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3">
              {isMissingIndex && (
                <button
                  onClick={onRescan}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  重新扫描
                </button>
              )}
              <button
                onClick={onOpenOther}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                打开其他资源库
              </button>
              <button
                onClick={onCreateNew}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                  isMissingIndex 
                    ? 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                创建新资源库
              </button>
            </div>
          </div>

          {/* 右侧插图 */}
          <div className="hidden md:flex items-center justify-center w-48 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-600">
            <div className="relative">
              {/* 简化的插图：房子和警告标志 */}
              <svg className="w-32 h-32" viewBox="0 0 128 128" fill="none">
                {/* 房子 */}
                <path 
                  d="M64 20L20 55V108H108V55L64 20Z" 
                  className="fill-blue-200 dark:fill-blue-900"
                />
                <path 
                  d="M64 20L20 55V108H108V55L64 20Z" 
                  className="stroke-blue-400 dark:stroke-blue-600" 
                  strokeWidth="3"
                  fill="none"
                />
                {/* 门 */}
                <rect 
                  x="52" y="70" width="24" height="38" 
                  className="fill-blue-300 dark:fill-blue-800"
                />
                {/* 窗户 */}
                <rect 
                  x="30" y="65" width="16" height="16" 
                  className="fill-yellow-200 dark:fill-yellow-900"
                />
                <rect 
                  x="82" y="65" width="16" height="16" 
                  className="fill-yellow-200 dark:fill-yellow-900"
                />
                {/* 警告三角 */}
                <path 
                  d="M100 30L110 48H90L100 30Z" 
                  className="fill-yellow-400"
                />
                <text 
                  x="100" y="45" 
                  textAnchor="middle" 
                  className="fill-yellow-800 text-xs font-bold"
                >!</text>
              </svg>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default LibraryMissingModal;
