# 架构说明

## 1. 系统边界

采用同域部署：Vite 静态产物由 Cloudflare Pages 托管，`/api/*` 由 Pages Functions 处理。Functions 通过 bindings 访问 D1 与 R2，并通过服务端 secret 调用 DeepSeek。浏览器永远不会获得 `DEEPSEEK_API_KEY`。

```text
Browser (React)
  ├─ /api/* ── Pages Functions ── D1
  │                         ├──── R2
  │                         └──── DeepSeek API
  ├─ HTML/CSS + html-to-image ── rendered PNG/JPG
  └─ JSZip ── local ZIP download
```

MVP 使用 Pages Functions，业务服务放在 `functions/_shared`，不依赖 Pages 专有全局变量。以后若导出任务需要排队，可平移到独立 Worker + Queues。

## 2. 核心数据流

1. 用户输入篇名和作者。服务端优先检索公开校勘来源；没有候选时由 DeepSeek 索引并补全文，返回明确标记为 AI 补全文的候选版本。用户确认后写入 `essays`。用户也可以直接提交自有原文。
2. `POST /api/essays/:id/analysis-runs` 创建分析运行，服务端调用 DeepSeek。
3. DeepSeek 返回严格 JSON 提案。服务端用原文执行逐字定位，生成最终 UTF-16 `sourceStart/sourceEnd`。
4. 只有满足 `originalText.slice(sourceStart, sourceEnd) === sourceExcerpt` 的提案才能写入 `cards`；无法定位或文本不一致则整次分析失败，不静默改写原文。
5. 用户编辑图卡。所有写操作携带 `version`，通过乐观锁避免覆盖并发编辑。
6. 用户上传外部生成图，API 写入 R2，并在 D1 `assets` 中保存元数据。图卡通过 `sourceAssetId` 选择底图。
7. 浏览器以固定 1080×1440 DOM 模板预览和渲染。裁剪参数和文字位置写回图卡；渲染结果再次上传 R2，并记录为 `renderedAssetId`。
8. 浏览器拉取导出清单，必要时顺序重渲染，以 JSZip 生成图片、提示词 Markdown、发布文案和 manifest。

## 3. 原文完整性

- `sourceStart`/`sourceEnd` 是 JavaScript 字符串 UTF-16 code-unit 半开区间 `[start, end)`，与 `String.prototype.slice` 一致。
- AI 只能返回 `sourceExcerpt` 和位置提示。最终位置由服务端在用户原文中精确解析。
- 若同一短摘出现多次，使用 AI 的 `sourceStartHint` 选择最近的精确匹配；若仍有歧义，返回 `SOURCE_AMBIGUOUS`，交给用户确认。
- 用户修改完整原文后，所有已有图卡进入 `source_stale`，必须重新校验或重新分析。
- 服务端保留 `originalTextSha256`，用于检测渲染和导出时引用的原文版本。

## 4. 渲染与资源策略

- 模板只有 `cover`、`body`、`ending` 三种，逻辑尺寸固定 1080×1440；预览仅按比例缩放 DOM，不改变排版坐标系。
- `textPosition` 使用百分比坐标，保证预览缩放与最终渲染一致；字号仍以 1080×1440 逻辑像素保存。
- `crop` 使用归一化中心点和 zoom，前端通过 `object-position` 与 transform 呈现。
- 上传原图与最终渲染图都存 R2。浏览器通过同域 API 访问，不公开 bucket。
- R2 key 由服务端生成：`essays/{essayId}/{purpose}/{assetId}.{ext}`；禁止使用用户文件名拼接 key。
- MVP 单图限制 10 MiB，只接受经实际文件签名校验的 JPEG/PNG/WebP。批量上传由前端限并发逐文件提交。

## 5. DeepSeek 安全与可靠性

- `DEEPSEEK_API_KEY` 仅通过 `wrangler secret put DEEPSEEK_API_KEY` 配置，不出现在 `wrangler.toml`、源码、日志或响应中。
- DeepSeek 可用于无公开候选时的全文补全。此类候选必须标记为 AI 补全文，且版权提示要求用户在发布、转载或商用前逐字核验授权版本。
- 服务端设置超时、最大响应体、JSON schema 校验和可重试错误分类；不自动重试明确的 4xx。
- `analysis_runs` 保存脱敏后的请求参数、模型名、状态和原始响应 JSON，禁止保存请求 headers。
- DeepSeek 返回内容先经过结构校验和原文校验，再进入业务表。

## 6. 一致性和状态

- D1 是业务事实来源，R2 是二进制来源。上传顺序为 R2 写入成功后再写 D1；D1 失败时尽力删除孤立对象并记录错误。
- 删除图卡不立即删除其 asset，避免误删共享或历史文件。资源清理由后续维护任务按引用状态处理。
- `cards.position` 在单个 essay 内唯一。排序 API 在 D1 transaction/batch 中整体更新。
- `analysis_runs` 与 `export_jobs` 使用有限状态机，不允许从终态退回运行态。

## 7. MVP 范围约束

- 第一版为单租户/受 Cloudflare Access 保护的内部工具，不自建账号系统。公开部署前必须增加身份认证与 essay 级授权。
- 不在 Worker 内运行无头浏览器。最终像素渲染由用户浏览器完成。
- 不集成外部生图平台 API；用户人工生图后上传。
- 不做多人实时协作，只通过 `version` 防止覆盖。
