# MVP 开发计划

每阶段只进入下一阶段的前提：实现完成、相关自动化测试通过、人工验收项已汇报。阶段内保持可部署，不累计到最后统一修复。

## 阶段 1：基础框架

目标：得到可本地运行和可部署的空壳应用。

- 初始化 React + Vite + TypeScript。
- 配置 Tailwind CSS、shadcn/ui、React Router、表单与 schema 校验库。
- 配置 Pages Functions、`wrangler.toml.example`、D1/R2 bindings 类型。
- 实现项目列表、新建散文和工作台基础布局。
- 实现 D1 repository、统一 API envelope、错误处理和 request ID。
- 应用 `0001_initial.sql`，完成 essay CRUD。
- 配置 Vitest、Testing Library、Playwright、ESLint 和 typecheck。

验收：能创建并重新打开散文；刷新后数据仍在本地 D1；浏览器 bundle 不含 `DEEPSEEK_API_KEY`。

测试：类型检查、lint、repository integration test、创建散文 E2E、production build。

## 阶段 2：DeepSeek 接入

目标：从原文得到经过服务端验证的默认六卡结构。

- 建立 DeepSeek server client、超时和错误映射。
- 定义版本化 system prompt 与严格 JSON schema，运行时用 schema validator 校验。
- 实现分析 run 状态机和整篇分析接口。
- 实现原文精确定位、重复短摘检测和 UTF-16 offset 校验。
- 实现单图卡重新生成，支持保留短摘。
- 前端展示分析进度、可恢复错误和重试入口。

验收：固定得到 `cover + 4 body + ending`；任何存入的短摘都能从原文逐字 slice 得到；密钥仅存在 Worker secret。

测试：DeepSeek mock contract test、恶意/非 JSON 响应、重复文本、emoji/代理对、超时、整次事务回滚。

## 阶段 3：图卡编辑

目标：完成六卡的人工校订工作流。

- 图卡列表、详情编辑、拖拽排序、删除和单卡重生成。
- 编辑短摘时实时提示原文命中位置，服务端最终校验。
- 提示词页支持单条复制、全部复制和 Markdown 下载。
- 乐观更新与 `version` 冲突恢复。
- 完成发布文案编辑。

验收：刷新后顺序和内容保持；删除后顺序连续；两个标签页不会静默覆盖修改。

测试：card API integration、排序事务、源文校验、编辑/删除/复制 E2E、可访问性基础检查。

## 阶段 4：图片上传

目标：人工生图后能快速批量入库并匹配卡片。

- 单文件上传 API、R2 adapter、文件签名/大小/尺寸校验。
- 前端拖放批量上传、并发限制、逐项进度和失败重试。
- 按文件名序号给出匹配建议，支持手工匹配、替换和取消匹配。
- R2 读取 endpoint、ETag 和缓存策略。

验收：六张图可一次选取并完成匹配；失败文件不影响成功项；替换后旧资源仍可追溯。

测试：R2 fake integration、非法 MIME/magic bytes/超限、断点失败 UI、上传匹配 E2E。

## 阶段 5：自动排版

目标：以三类固定模板生成可发布的 1080×1440 图像。

- cover/body/ending 三种 HTML/CSS 模板。
- 统一逻辑画布与响应式缩放预览。
- 裁剪焦点、zoom、替换图片、文字框拖动和数值微调。
- 字体加载完成检测、文字溢出检测和安全区提示。
- `html-to-image` PNG/JPEG 渲染，结果上传 R2。

验收：导出像素严格为 1080×1440；预览与成图位置一致；长文本不会无提示地溢出。

测试：布局计算 unit test、模板 visual snapshot、字体失败降级、桌面/移动 viewport Playwright 截图、实际输出尺寸检查。

## 阶段 6：导出

目标：一键得到完整发布资产。

- 导出前检查缺图、失效短摘、文字溢出和未完成渲染。
- 支持全部 PNG 或 JPG，按 position 稳定命名。
- 生成 `prompts.md`、`publication-copy.md` 和 `manifest.json`。
- JSZip 生成 ZIP，显示进度并控制内存峰值。
- 可选将 ZIP 备份到 R2，并在 D1 留存 export job。

验收：ZIP 可解压、顺序正确、每张图尺寸正确、文案和提示词完整；中文标题不会造成非法路径。

测试：manifest unit test、ZIP 内容 integration test、六图完整导出 E2E、PNG/JPEG 双格式、缺失资源阻断。

## 上线门槛

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run build`
- D1 migration 在全新数据库和已有上一版本数据库各执行一次。
- Cloudflare Preview 环境完成一次真实 D1/R2 冒烟测试。
- DeepSeek secret 通过 `wrangler secret` 注入，并检查构建产物与日志无泄漏。

## 主要风险

- DeepSeek 的 JSON mode 仍可能返回格式正确但原文引用错误，因此“schema 校验 + 原文精确校验”缺一不可。
- `html-to-image` 对跨域图片和 Web Font 很敏感，所有图片通过同域 API 提供，渲染前等待 `document.fonts.ready`。
- 1080×1440 批量渲染和 ZIP 会占用较多浏览器内存，第一版顺序渲染并及时释放 object URL。
- Pages Functions 的请求时长可能限制同步 AI 调用，API 已用 run 资源建模，为未来 Queue 化保留兼容路径。
- 单租户 MVP 依赖 Cloudflare Access。若面向公网，账号、授权、限流、配额和审计必须先补齐。

