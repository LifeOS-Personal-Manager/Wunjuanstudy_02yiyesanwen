# 散文贴图生产台

面向微信公众号配图生产的 React + Cloudflare MVP。仓库内已包含完整工作台、Cloudflare Pages Functions API，以及从 `reference/范文.docx` 制作的丰子恺《蝌蚪》六卡案例。

当前 Pages 地址：[essay-image-studio.pages.dev](https://essay-image-studio.pages.dev/)。静态站点、D1、R2 与 Functions 已部署；正式启用云端功能前仍须按运维手册配置 Cloudflare Access 的 `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD`，并录入 `DEEPSEEK_API_KEY`。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:5173/essays/demo-tadpoles`。点击右上角“+”进入新建流程，输入篇名和作者即可检索公开原文、确认版本并生成六卡。多个项目会保存在浏览器 `localStorage`，可从顶部下拉框切换；恢复按钮可还原《蝌蚪》初始案例。

生产构建：

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## 案例导出

- 预生成发布包：`exports/蝌蚪-微信贴图发布包.zip`
- 《背影》发布包：`exports/背影-微信贴图发布包.zip`
- 已排版图片：`exports/蝌蚪-发布包/images/`
- 应用内导出：进入“导出”，选择 PNG/JPG 后点击“一键导出 ZIP 发布包”
- 重新生成案例资产：`npm run demo:assets`

案例底图是项目内生成的原创水墨风演示位图，不替代正式外部生图结果。正式发布前需核验《蝌蚪》的文本版本和版权状态。

## Cloudflare 部署

1. 创建 D1 数据库与 R2 bucket，并将真实 D1 ID、bucket name 写入 `wrangler.toml`。
2. 执行 `npx wrangler d1 migrations apply essay-studio --remote`。
3. 执行 `npx wrangler pages secret put DEEPSEEK_API_KEY --project-name essay-image-studio`，密钥不得写入源码或前端环境变量。
4. 构建并部署 Pages；静态目录为 `dist`，Functions 位于 `functions/`。

本地 D1/R2 联调可执行 `npm run build` 后运行 `npm run cf:dev`。

正式环境必须先启用 Cloudflare Access。完整的资源创建、身份策略、迁移、备份恢复、监控和回滚步骤见 [正式上线与运维手册](docs/production-runbook.md)。`npm run predeploy` 会在 D1 ID 仍为占位值时阻止误部署。

## 技术架构

- Web：React、Vite、TypeScript、Tailwind CSS、shadcn/ui
- API：Cloudflare Pages Functions（兼容迁移到独立 Worker）
- 数据：Cloudflare D1
- 对象存储：Cloudflare R2
- AI：DeepSeek API，仅由服务端读取 `DEEPSEEK_API_KEY`
- 排版：浏览器端 HTML/CSS 模板 + `html-to-image`
- 打包：浏览器端 JSZip

详细决策见 [架构说明](docs/architecture.md)，接口契约见 [页面路由与 API](docs/routes-and-api.md)，实施节奏见 [MVP 开发计划](docs/mvp-plan.md)。

## 目标目录结构

```text
.
├─ contracts/                    # 外部服务的机器可校验契约
├─ docs/                         # 架构、接口与开发计划
├─ functions/
│  ├─ api/                       # Pages Functions 路由入口
│  └─ _shared/                   # 鉴权、D1/R2、校验、DeepSeek 客户端
├─ migrations/                   # D1 顺序迁移
├─ public/                       # 静态资源
├─ src/
│  ├─ app/                       # Router、providers、全局布局
│  ├─ components/
│  │  ├─ ui/                     # shadcn/ui 生成组件
│  │  ├─ cards/                  # 图卡编辑与排序
│  │  ├─ editor/                 # 原文与项目信息编辑
│  │  ├─ prompts/                # 提示词管理
│  │  ├─ renderer/               # 三类固定模板与预览
│  │  └─ uploads/                # 上传、匹配、替换和裁剪
│  ├─ features/                  # 按业务域组织的 hooks/services/state
│  ├─ lib/                       # API client、下载、格式化等通用能力
│  ├─ pages/                     # 页面级组件
│  ├─ styles/                    # Tailwind 入口与打印/渲染样式
│  ├─ templates/                 # cover/body/ending 模板定义
│  └─ types/                     # 前后端共享 TypeScript 契约
├─ tests/
│  ├─ unit/                      # Vitest
│  ├─ integration/               # Pages Functions + local D1/R2
│  └─ e2e/                       # Playwright
├─ package.json                  # 依赖与开发命令
├─ vite.config.ts                # Vite/Tailwind 构建配置
└─ wrangler.toml                 # D1/R2 bindings 与 Pages 配置
```

## 主要产物

- `migrations/0001_initial.sql`：D1 初始 Schema
- `contracts/deepseek-analysis.schema.json`：DeepSeek 严格 JSON Schema
- `src/types/`：领域模型、API envelope、DeepSeek 严格 JSON 契约
- `docs/routes-and-api.md`：页面和 API 设计
- `docs/mvp-plan.md`：分阶段开发与测试门槛
- `functions/api/[[path]].ts`：D1、R2、DeepSeek 服务端 API
- `src/App.tsx`：图卡、提示词、上传、排版和导出工作台
