import React from 'react';
import { useLibraryStore } from '../stores/useLibraryStore';
import { useImageStore } from '../stores/useImageStore';
import { Folder, Image as ImageIcon, HardDrive } from 'lucide-react';

function Dashboard() {
    const { currentLibraryId, getCurrentLibrary } = useLibraryStore();
    const { totalImageCount, totalSize, folders } = useImageStore();

    const currentLibrary = getCurrentLibrary();
    const folderCount = folders.length;
    const topLevelFolders = folders.filter(f => !f.parentPath || f.parentPath === '.' || f.parentPath === '');

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-primary p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-primary mb-2">
                        {currentLibrary?.name || '素材库'}
                    </h1>
                    {currentLibrary?.path && (
                        <p className="text-sm text-tertiary">{currentLibrary.path}</p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-secondary rounded-xl p-6 shadow-sm border">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-lg text-accent">
                                <ImageIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-primary">{totalImageCount.toLocaleString()}</div>
                                <div className="text-sm text-tertiary">图片总数</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-secondary rounded-xl p-6 shadow-sm border">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600">
                                <Folder className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-primary">{folderCount.toLocaleString()}</div>
                                <div className="text-sm text-tertiary">文件夹数</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-secondary rounded-xl p-6 shadow-sm border">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
                                <HardDrive className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-primary">{formatBytes(totalSize)}</div>
                                <div className="text-sm text-tertiary">总大小</div>
                            </div>
                        </div>
                    </div>
                </div>

                {topLevelFolders.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold text-primary mb-4">根目录文件夹</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {topLevelFolders.map(folder => (
                                <div
                                    key={folder.path}
                                    className="bg-secondary rounded-lg p-4 shadow-sm border hover:shadow-md transition-shadow cursor-pointer group"
                                    onClick={() => useImageStore.getState().setSelectedFolder(folder.path)}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Folder className="w-8 h-8 text-yellow-500 group-hover:text-yellow-400 transition-colors" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-primary truncate" title={folder.name}>
                                                {folder.name}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-tertiary">{folder.imageCount || 0} 张图片</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {topLevelFolders.length === 0 && (
                    <div className="text-center py-12 bg-secondary rounded-xl border border-dashed">
                        <Folder className="w-12 h-12 text-secondary mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-primary mb-2">暂无文件夹</h3>
                        <p className="text-tertiary max-w-sm mx-auto">
                            您的素材库似乎是空的。请将图片添加到素材库目录中，系统会自动扫描。
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
