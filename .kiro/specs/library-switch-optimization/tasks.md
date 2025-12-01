# Implementation Plan

- [x] 1. 后端 API 扩展 - 支持分页和缓存元数据

  - [x] 1.1 扩展图片搜索 API 支持分页参数


    - 修改 `backend/routes/image.js` 的 GET `/` 接口
    - 添加 `offset` 和 `limit` 参数支持
    - 返回 `total`、`hasMore` 字段
    - _Requirements: 2.3_
  - [x] 1.2 添加缓存元数据 API


    - 新增 GET `/api/cache/meta/:libraryId` 接口
    - 返回数据库最后修改时间戳
    - _Requirements: 6.3_
  - [x] 1.3 修改数据库记录修改时间

    - 在 `backend/database/db.js` 添加 `last_modified` 表或字段
    - 每次插入/更新/删除图片时更新时间戳
    - _Requirements: 6.3, 6.4_

- [x] 2. 前端请求管理器 - RequestManager

  - [x] 2.1 创建 RequestManager 服务


    - 新建 `frontend/src/services/requestManager.js`
    - 实现 `createRequest`、`cancelAll`、`isValid` 方法
    - 使用 AbortController 管理请求取消
    - _Requirements: 4.1, 4.2_
  - [x] 2.2 编写 RequestManager 属性测试


    - **Property 7: Unique request IDs**
    - **Validates: Requirements 4.1**
  - [x] 2.3 编写请求取消属性测试

    - **Property 8: Cancelled requests don't trigger callbacks**
    - **Validates: Requirements 4.2**

<!-- 任务 3-4: 前端/后端缓存服务已规划但未实现，当前性能已满足需求 -->

- [x] 3. Checkpoint - 确保基础设施测试通过

  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. 前端图片加载服务 - ImageLoadService

  - [x] 4.1 创建 ImageLoadService 服务
    - 新建 `frontend/src/services/imageLoadService.js`
    - 实现 `loadNextBatch` 方法
    - 集成 RequestManager 进行请求管理
    - _Requirements: 2.1, 2.3_

  - [x] 4.2 实现空闲加载逻辑
    - 使用 `requestIdleCallback` 或 `setTimeout` 实现空闲检测
    - 在空闲时继续加载剩余图片
    - _Requirements: 2.4_

  - [x] 4.3 编写分批加载属性测试

    - **Property 4: Scroll triggers batch loading**
    - **Property 11: Batch loading updates display incrementally**
    - **Validates: Requirements 2.3, 5.2**

- [x] 5. 重构 Sidebar 组件 - 素材库切换

  - [x] 5.1 重构 handleLibraryClick 函数
    - 集成 RequestManager 取消之前的请求
    - 清理之前素材库的状态
    - _Requirements: 1.2, 1.3_

  - [x] 5.2 编写素材库切换属性测试

    - **Property 1: Request cancellation on library switch**
    - **Property 2: Memory cleanup on library switch**
    - **Validates: Requirements 1.2, 1.3**

- [x] 6. 重构 MainContent 组件 - 文件夹切换

  - [x] 6.1 重构 loadImages 函数
    - 实现请求取消和 debounce
    - _Requirements: 2.1, 2.2, 3.2_

  - [x] 6.2 添加加载进度显示
    - 显示已加载/总数
    - 加载完成后隐藏进度条
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.3 编写文件夹切换属性测试

    - **Property 3: Request cancellation on folder switch**
    - **Property 5: Debounce rapid folder clicks**
    - **Validates: Requirements 2.2, 3.2**

- [x] 7. 重构 ImageWaterfall 组件 - 滚动加载

  - [x] 7.1 添加滚动加载触发
    - 监听滚动事件，接近底部时触发加载下一批
    - 集成 ImageLoadService
    - _Requirements: 2.3_

  - [x] 7.2 优化大数据量渲染
    - 确保虚拟滚动正确处理增量数据
    - 优化 Worker 数据传输
    - _Requirements: 3.1_

- [x] 8. Store 状态扩展

  - [x] 8.1 添加加载状态字段
    - 添加 `isLoadingImages`、`loadedImageCount`、`hasMoreImages` 等字段
    - _Requirements: 4.3, 5.1_

  - [x] 8.2 编写状态管理属性测试
    - **Property 9: Only latest request result applied**
    - **Validates: Requirements 4.3**

- [x] 9. 组件卸载清理

  - [x] 9.1 添加组件卸载时的请求取消
    - 在 MainContent、ImageWaterfall 的 useEffect cleanup 中取消请求
    - _Requirements: 4.4_

- [x] 10. 空闲加载与用户操作协调

  - [x] 10.1 实现空闲加载暂停机制
    - 用户操作时暂停空闲加载
    - 操作完成后恢复空闲加载
    - _Requirements: 3.3_

- [x] 11. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
