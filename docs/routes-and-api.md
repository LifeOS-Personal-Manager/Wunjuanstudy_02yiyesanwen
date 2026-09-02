# 页面路由与 API 设计

## 页面路由

| 路由 | 页面 | 主要职责 |
| --- | --- | --- |
| `/` | 项目列表 | 新建散文、查看状态、继续编辑、归档 |
| `/essays/new` | 新建散文 | 录入名称、作者、原文、版本来源、版权信息 |
| `/essays/:essayId` | 工作台 | 总览图卡、触发分析、排序、删除、进入各工作区 |
| `/essays/:essayId/cards/:cardId` | 图卡编辑 | 编辑短摘/导读/场景/提示词，单卡重新生成 |
| `/essays/:essayId/prompts` | 提示词 | 展示、单条复制、全部复制、Markdown 下载 |
| `/essays/:essayId/assets` | 图片匹配 | 批量上传、自动/手动匹配、替换底图 |
| `/essays/:essayId/layout` | 排版台 | 三类模板预览、裁剪、文字位置和样式调整 |
| `/essays/:essayId/export` | 导出 | 完整性检查、PNG/JPG 选择、发布包下载 |

所有工作区页面共享 essay 级导航。路由 loader 统一处理不存在、版本冲突和分析中状态。未保存编辑离开页面时必须提示。

## API 约定

- Base path：`/api`
- JSON：`Content-Type: application/json; charset=utf-8`
- ID：服务端生成 UUID v4
- 时间：UTC ISO 8601 字符串
- 成功 envelope：`{ "ok": true, "data": ..., "requestId": "..." }`
- 失败 envelope：`{ "ok": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }`
- 写操作使用 body 中的 `version` 做乐观锁；冲突返回 `409 VERSION_CONFLICT` 和当前实体摘要。
- 列表默认按业务顺序，除非端点另有说明。
- API 响应不返回 R2 key 和任何服务端 secret；资源读取使用短路径 `/api/assets/:assetId/content`。

## 公开来源 API

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `GET` | `/source-candidates` | query: `title`, `author?` | `SourceCandidate[]` | 优先检索中文维基文库与全网公开页面；无候选时由 DeepSeek 索引并补全文 |

客户端必须展示版本、来源 URL 和版权提示，由用户确认后才能创建 essay。DeepSeek 补全文候选的 `sourceName` 以 `DeepSeek` 开头，客户端必须显示为“AI 补全文”；该文本不是权威来源证明，发布前必须逐字核验。

## Essay API

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `GET` | `/essays` | query: `status?`, `cursor?` | essay summary page | 项目列表 |
| `POST` | `/essays` | `CreateEssayRequest` | `Essay` | 新建散文并计算 SHA-256 |
| `GET` | `/essays/:essayId` | - | `EssayWorkspace` | 工作台聚合读取 |
| `PATCH` | `/essays/:essayId` | `UpdateEssayRequest` | `Essay` | 修改原文会标记卡片 `source_stale` |
| `DELETE` | `/essays/:essayId` | query: `version` | `204` | MVP 使用归档语义，不物理删除 R2 |

## DeepSeek 分析 API

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `POST` | `/essays/:essayId/analysis-runs` | `StartAnalysisRequest` | `AnalysisRun` | 创建默认六卡分析；`202` |
| `GET` | `/essays/:essayId/analysis-runs/:runId` | - | `AnalysisRun` | 前端短轮询运行状态 |
| `POST` | `/essays/:essayId/cards/:cardId/regenerations` | `RegenerateCardRequest` | `AnalysisRun` | 单卡重新生成；`202` |

MVP 中 Functions 可在请求内完成 DeepSeek 调用，但仍以 run 资源建模，便于超时恢复和未来迁移到 Queue。若平台执行时间不足，端点保持不变，只替换内部执行方式。

整篇分析成功时一次性替换当前卡组为六张：第 1 张必须为 `cover`，第 2-5 张为 `body`，第 6 张为 `ending`。任意短摘校验失败则不写入部分结果。

## Card API

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `GET` | `/essays/:essayId/cards` | - | `EssayCard[]` | 按 `position` 排序 |
| `PATCH` | `/essays/:essayId/cards/:cardId` | `UpdateCardRequest` | `EssayCard` | 更新内容、模板参数或关联图片 |
| `DELETE` | `/essays/:essayId/cards/:cardId` | query: `version` | `204` | 删除后压紧 position |
| `PUT` | `/essays/:essayId/cards/order` | `ReorderCardsRequest` | `EssayCard[]` | 原子更新全部顺序 |

当用户手工修改 `sourceExcerpt` 时，API 必须在完整原文中重新定位。找不到返回 `422 SOURCE_NOT_FOUND`；多处匹配返回 `409 SOURCE_AMBIGUOUS` 并提供候选位置。

## Prompt API

| Method | Path | Response | 说明 |
| --- | --- | --- | --- |
| `GET` | `/essays/:essayId/prompts` | `PromptItem[]` | 页面展示和复制 |
| `GET` | `/essays/:essayId/prompts.md` | `text/markdown` | Markdown 下载，UTF-8 BOM 可选 |

“单条复制”和“全部复制”由前端基于同一 `PromptItem[]` 完成，避免额外写接口。

## Asset API

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `POST` | `/essays/:essayId/assets` | 单文件 `multipart/form-data` + `purpose` | `UploadAssetResponse` | 前端限并发批量调用 |
| `GET` | `/essays/:essayId/assets` | query: `purpose?` | `Asset[]` | 图片库 |
| `GET` | `/assets/:assetId/content` | - | binary | 同域流式读取，支持缓存/ETag |
| `PUT` | `/essays/:essayId/assets/:assetId/match` | `MatchAssetRequest` | `EssayCard` | 匹配到指定图卡 |
| `DELETE` | `/essays/:essayId/assets/:assetId` | - | `204` | 仅允许删除未引用资源 |

文件验证同时检查声明 MIME、magic bytes、尺寸和大小。图片匹配的第一版策略为：文件名中若含 `01`-`06` 则建议对应 position，否则进入未匹配区，用户确认后才写关联。

## Render 与 Export API

渲染发生在浏览器：前端创建固定 1080×1440 DOM，调用 `html-to-image` 得到 Blob，再以 `purpose=rendered_image` 上传，并 PATCH 对应 `renderedAssetId`。服务端不提供 DOM 截图接口。

| Method | Path | Request | Response | 说明 |
| --- | --- | --- | --- | --- |
| `GET` | `/essays/:essayId/export-manifest` | query: `format=png|jpeg` | `ExportManifest` | 导出前完整性检查与文件清单 |
| `POST` | `/essays/:essayId/export-jobs` | format + manifest | export job | 可选记录本次导出 |
| `POST` | `/essays/:essayId/export-jobs/:jobId/bundle` | ZIP Blob | asset/job | 可选将发布包备份到 R2 |

前端 ZIP 固定包含：

```text
{safe-title}/
├─ images/01-cover.png
├─ images/02-body.png
├─ ...
├─ prompts.md
├─ publication-copy.md
└─ manifest.json
```

文件名中的用户输入必须 slugify，禁止出现路径分隔符。ZIP 下载可以仅在本地生成；其中所有图片仍须先有对应 R2 asset 记录，满足图片存入 R2 的要求。

## HTTP 状态码

| Status | 使用场景 |
| --- | --- |
| `200/201/202/204` | 成功、创建、异步接受、无响应体 |
| `400` | JSON 或参数格式错误 |
| `404` | essay/card/asset 不存在 |
| `409` | version 冲突、短摘歧义、资源仍被引用 |
| `413` | 上传超过限制 |
| `415` | 文件类型不支持 |
| `422` | 业务校验失败、AI JSON 或原文引用无效 |
| `502/504` | DeepSeek/R2 上游失败或超时 |
