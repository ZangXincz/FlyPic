# Requirements Document

## Introduction

本文档定义了素材库切换性能优化的需求。当前系统在切换到大型素材库（如5万张图片）时存在严重的性能问题，表现为20-30秒的UI卡顿。优化目标是实现流畅的素材库切换体验，即使面对大量图片也能保持响应性。

## Glossary

- **素材库 (Library)**: 用户添加的图片文件夹，包含图片索引数据库
- **文件夹树 (Folder Tree)**: 素材库内的文件夹层级结构
- **虚拟滚动 (Virtual Scroll)**: 只渲染可视区域内的元素，减少DOM节点数量
- **分页加载 (Pagination)**: 分批次加载数据，而非一次性加载全部
- **请求取消 (Request Cancellation)**: 当用户切换操作时，取消之前未完成的请求
- **空闲加载 (Idle Loading)**: 在用户无操作时后台预加载数据
- **AbortController**: Web API，用于取消 fetch 请求

## Requirements

### Requirement 1

**User Story:** As a user, I want to switch between libraries quickly, so that I can browse different image collections without waiting.

#### Acceptance Criteria

1. WHEN a user clicks on a different library THEN the System SHALL display the folder tree within 500ms
2. WHEN a user switches libraries THEN the System SHALL cancel any pending image loading requests from the previous library
3. WHEN a user switches libraries THEN the System SHALL clear the previous library's image data from memory before loading new data
4. WHEN switching to a large library (>10000 images) THEN the System SHALL show a loading indicator instead of freezing the UI

### Requirement 2

**User Story:** As a user, I want to click on folders and see images immediately, so that I can browse my collection efficiently.

#### Acceptance Criteria

1. WHEN a user selects a folder THEN the System SHALL load and display the first batch of images within 300ms
2. WHEN a user selects a different folder while images are loading THEN the System SHALL cancel the previous folder's loading request
3. WHEN a folder contains more images than the initial batch THEN the System SHALL load additional images as the user scrolls
4. WHEN the user stops scrolling THEN the System SHALL continue loading remaining images in the background during idle time

### Requirement 3

**User Story:** As a user, I want the application to remain responsive while loading large amounts of data, so that I can continue interacting with the UI.

#### Acceptance Criteria

1. WHEN loading images THEN the System SHALL process data in chunks to avoid blocking the main thread for more than 50ms
2. WHEN multiple rapid folder clicks occur THEN the System SHALL debounce requests and only execute the final selection
3. WHEN background loading is in progress THEN the System SHALL pause background loading when user initiates a new action
4. WHEN an error occurs during loading THEN the System SHALL display an error message and allow retry

### Requirement 4

**User Story:** As a developer, I want a robust request management system, so that concurrent requests do not cause race conditions or memory leaks.

#### Acceptance Criteria

1. WHEN a new request is initiated THEN the System SHALL assign a unique request ID for tracking
2. WHEN a request is cancelled THEN the System SHALL clean up associated resources and pending callbacks
3. WHEN multiple requests complete out of order THEN the System SHALL only apply the result of the most recent request
4. WHEN the component unmounts THEN the System SHALL cancel all pending requests

### Requirement 5

**User Story:** As a user, I want to see progress feedback when loading large folders, so that I know the application is working.

#### Acceptance Criteria

1. WHEN loading a folder with more than 500 images THEN the System SHALL display a progress indicator showing loaded count
2. WHEN images are being loaded in batches THEN the System SHALL update the display incrementally as each batch completes
3. WHEN all images are loaded THEN the System SHALL hide the progress indicator

### Requirement 6

**User Story:** As a user, I want the application to remember my library data between sessions, so that switching libraries is instant without re-querying the database.

#### Acceptance Criteria

1. WHEN a library's image list is fully loaded THEN the System SHALL cache the image metadata to a local file in the .flypic folder
2. WHEN switching to a library with existing cache THEN the System SHALL load from cache file first and display within 200ms
3. WHEN cache exists THEN the System SHALL verify cache validity by comparing database modification timestamp
4. WHEN cache is stale (database modified after cache) THEN the System SHALL invalidate cache and reload from database
5. WHEN new images are added or removed THEN the System SHALL update the cache file incrementally

### Requirement 7

**User Story:** As a user, I want folder-level caching, so that clicking on previously visited folders is instant.

#### Acceptance Criteria

1. WHEN a folder's images are loaded THEN the System SHALL cache that folder's image list separately
2. WHEN clicking a cached folder THEN the System SHALL display cached images immediately
3. WHEN the folder's content changes THEN the System SHALL detect the change and refresh the cache
4. WHEN memory usage exceeds threshold THEN the System SHALL evict least recently used folder caches

