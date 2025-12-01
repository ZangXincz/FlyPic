# Design Document

## Overview

本设计文档描述素材库切换性能优化的技术方案。核心思路是将"一次性加载全部数据"改为"按需分批加载"，并引入健壮的请求管理机制来处理取消、竞态和空闲加载。

## Architecture

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Sidebar   │  │ MainContent  │  │  ImageWaterfall   │  │
│  │  (文件夹树)  │  │  (协调加载)   │  │   (虚拟滚动)      │  │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          ▼                                   │
│              ┌───────────────────────┐                      │
│              │   RequestManager      │                      │
│              │  (请求管理/取消/队列)  │                      │
│              └───────────┬───────────┘                      │
│                          │                                   │
│              ┌───────────────────────┐                      │
│              │   ImageLoadService    │                      │
│              │  (分批加载/空闲加载)   │                      │
│              └───────────┬───────────┘                      │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Image API (分页支持)                     │   │
│  │  GET /api/image?libraryId=x&folder=y&offset=0&limit=200│   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 数据流

```mermaid
sequenceDiagram
    participant User
    participant Sidebar
    participant RequestManager
    participant ImageLoadService
    participant Backend

    User->>Sidebar: 点击文件夹A
    Sidebar->>RequestManager: loadFolder(A)
    RequestManager->>RequestManager: 取消之前的请求
    RequestManager->>ImageLoadService: fetchBatch(A, offset=0)
    ImageLoadService->>Backend: GET /api/image?folder=A&offset=0&limit=200
    Backend-->>ImageLoadService: 返回前200张
    ImageLoadService-->>Sidebar: 更新UI显示
    
    Note over ImageLoadService: 用户空闲时
    ImageLoadService->>Backend: GET /api/image?folder=A&offset=200&limit=200
    Backend-->>ImageLoadService: 返回下一批
    ImageLoadService-->>Sidebar: 追加到列表
```

## Components and Interfaces

### 1. RequestManager (新增)

负责管理所有异步请求的生命周期。

```typescript
interface RequestManager {
  // 创建一个新的请求上下文
  createRequest(type: 'library' | 'folder' | 'images'): RequestContext;
  
  // 取消指定类型的所有请求
  cancelAll(type: 'library' | 'folder' | 'images'): void;
  
  // 取消所有请求
  cancelAllRequests(): void;
  
  // 检查请求是否仍然有效
  isValid(requestId: string): boolean;
}

interface RequestContext {
  id: string;
  abortController: AbortController;
  signal: AbortSignal;
  isActive: boolean;
  cancel(): void;
}
```

### 2. ImageLoadService (工具函数集合)

提供空闲加载控制的工具函数，状态由 Store 统一管理。

```typescript
// 用户操作开始时调用，暂停空闲加载并取消请求
function onUserActionStart(): void;

// 用户操作结束时调用，恢复空闲加载
function onUserActionEnd(hasMore: boolean): void;

// 暂停/恢复空闲加载
function pauseIdleLoading(): void;
function resumeIdleLoading(): void;

// 检查空闲加载是否暂停
function isIdlePaused(): boolean;
```

### 3. 后端 API 扩展

```typescript
// 扩展现有的 GET /api/image 接口
interface ImageSearchParams {
  libraryId: string;
  folder?: string;
  keywords?: string;
  offset?: number;  // 新增：分页偏移
  limit?: number;   // 新增：每页数量
  // ... 其他现有参数
}

interface ImageSearchResponse {
  images: Image[];
  total: number;    // 新增：总数
  offset: number;   // 新增：当前偏移
  hasMore: boolean; // 新增：是否有更多
}
```

### 4. Store 扩展

```typescript
// useStore 新增状态
interface ImageLoadingState {
  isLoading: boolean;      // 是否正在加载
  loadedCount: number;     // 已加载数量
  totalCount: number;      // 总数量
  hasMore: boolean;        // 是否还有更多
}
```

<!--
### 5. CacheService (未实现 - 保留设计供未来参考)

注意：以下缓存服务设计已规划但未实现，当前性能已满足需求。
如需进一步优化，可参考此设计实现前端缓存服务。

interface CacheService {
  getLibraryCache(libraryId: string): Promise<LibraryCache | null>;
  saveLibraryCache(libraryId: string, data: LibraryCache): Promise<void>;
  validateCache(libraryId: string): Promise<CacheValidation>;
  getFolderCache(libraryId: string, folder: string): Promise<FolderCache | null>;
  saveFolderCache(libraryId: string, folder: string, images: Image[]): Promise<void>;
  invalidateCache(libraryId: string): Promise<void>;
}
-->

## Data Models

### 请求上下文

```typescript
interface RequestContext {
  id: string;              // 唯一请求ID (UUID)
  type: 'library' | 'folder' | 'images';
  createdAt: number;       // 创建时间戳
  abortController: AbortController;
  status: 'pending' | 'completed' | 'cancelled' | 'error';
}
```

<!-- 缓存文件结构和策略设计已规划但未实现，保留供未来参考 -->



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Request cancellation on library switch
*For any* library switch operation, all pending requests from the previous library should be cancelled (aborted) before new requests are initiated.
**Validates: Requirements 1.2**

### Property 2: Memory cleanup on library switch
*For any* library switch operation, the previous library's image data should be cleared from the store state, and the new state should only contain data from the new library.
**Validates: Requirements 1.3**

### Property 3: Request cancellation on folder switch
*For any* folder selection while a previous folder's images are still loading, the previous folder's loading request should be cancelled.
**Validates: Requirements 2.2**

### Property 4: Scroll triggers batch loading
*For any* folder with more images than the initial batch size, scrolling to the bottom should trigger loading of the next batch.
**Validates: Requirements 2.3**

### Property 5: Debounce rapid folder clicks
*For any* sequence of rapid folder clicks (within debounce window), only the final folder selection should result in a completed request.
**Validates: Requirements 3.2**

### Property 6: Background loading pauses on user action
*For any* user-initiated action (folder click, library switch) while background loading is in progress, the background loading should pause until the user action completes.
**Validates: Requirements 3.3**

### Property 7: Unique request IDs
*For any* set of requests created by RequestManager, each request should have a unique ID that is different from all other request IDs.
**Validates: Requirements 4.1**

### Property 8: Cancelled requests don't trigger callbacks
*For any* cancelled request, its completion callback should not be executed, and its result should not be applied to the state.
**Validates: Requirements 4.2**

### Property 9: Only latest request result applied
*For any* sequence of requests for the same resource (folder/library), only the result of the most recently initiated request should be applied to the state, regardless of completion order.
**Validates: Requirements 4.3**

### Property 10: Unmount cancels all requests
*For any* component unmount event, all pending requests associated with that component should be cancelled.
**Validates: Requirements 4.4**

### Property 11: Batch loading updates display incrementally
*For any* batch load completion, the displayed image count should increase by the batch size (or remaining count if less).
**Validates: Requirements 5.2**

<!-- Property 12-18: 缓存相关属性已规划但未实现 -->

## Error Handling

### 网络错误
- 请求超时：显示重试按钮，允许用户手动重试
- 网络断开：显示离线提示，使用缓存数据（如果可用）

### 缓存错误
- 缓存文件损坏：删除损坏的缓存，从数据库重新加载
- 缓存写入失败：记录警告日志，继续正常运行（缓存是优化，不是必需）

### 并发错误
- 竞态条件：通过 requestId 机制确保只应用最新请求的结果
- 重复请求：通过 debounce 和请求去重避免

## Testing Strategy

### 单元测试

使用 Vitest 进行单元测试：

1. **RequestManager 测试**
   - 测试请求创建和 ID 唯一性
   - 测试请求取消功能
   - 测试按类型取消请求

2. **ImageLoadService 测试**
   - 测试分批加载逻辑
   - 测试空闲加载触发

### 属性测试

使用 fast-check 进行属性测试：

1. **请求管理属性测试**
   - Property 7: 生成随机数量的请求，验证所有 ID 唯一
   - Property 8: 生成请求序列，取消部分，验证回调行为
   - Property 9: 生成乱序完成的请求，验证只应用最新结果

### 集成测试

1. **素材库切换流程测试**
   - 模拟切换素材库，验证请求取消和状态清理
   
2. **文件夹导航测试**
   - 模拟快速点击多个文件夹，验证 debounce 和取消逻辑


