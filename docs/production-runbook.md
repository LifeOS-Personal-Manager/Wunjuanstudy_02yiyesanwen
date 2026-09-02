# 正式上线与运维手册

## 1. 创建 Cloudflare 资源

```bash
npx wrangler login
npx wrangler d1 create essay-studio
npx wrangler r2 bucket create essay-studio-assets
npx wrangler pages project create essay-image-studio --production-branch main
```

把 D1 命令返回的 `database_id` 写入 `wrangler.toml`。R2 名称如有调整，也同步修改 binding。不要提交 `.dev.vars`。

## 2. 初始化与密钥

```bash
npx wrangler d1 migrations apply essay-studio --remote
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name essay-image-studio
npx wrangler pages secret put BRAVE_SEARCH_API_KEY --project-name essay-image-studio
```

用 `npx wrangler pages secret list --project-name essay-image-studio` 确认两个变量存在，不要在日志中打印变量值。DeepSeek 用于候选核验和六卡分析，Brave 用于全网检索，两者不能互相替代。`DEEPSEEK_MODEL` 是非敏感变量，保留在 `wrangler.toml`。

## 3. Cloudflare Access

在 Zero Trust 中为正式域名创建 Self-hosted application，覆盖整个站点，配置允许访问的邮箱或组织身份。把团队域名（例如 `your-team.cloudflareaccess.com`）配置为 Pages 变量 `ACCESS_TEAM_DOMAIN`，把该 Access application 的 AUD tag 配置为 `ACCESS_AUD`。API 会校验 Access JWT 的签名、Audience、有效期和邮箱；`DEV_USER_EMAIL` 只能用于 `CF_PAGES_BRANCH=local` 的本机开发，正式 Pages 不得设置。

上线前分别验证：未登录访问被 Access 拦截；用户 A 无法读取用户 B 的项目和资源；跨域写请求返回 403。

## 4. 验证与发布

```bash
npm ci
npm run verify
npm run predeploy
npm run deploy
```

发布后检查 `/api/health` 返回 `status: ok`，再用一篇无版权争议的短文完成：新建、DeepSeek 六卡、单卡重生成、上传六图、排版、PNG/JPG 和 ZIP 导出。浏览器 Network 中不应出现 DeepSeek 密钥。

## 5. 备份与恢复

每次迁移和重要发布前导出 D1：

```bash
npx wrangler d1 export essay-studio --remote --output backups/essay-studio-YYYYMMDD.sql
```

备份文件含用户原文，必须存入受控位置且不要提交 Git。恢复演练应在独立临时数据库执行：创建临时 D1，导入 SQL，绑定 Preview 环境并验证项目、图卡与 asset 引用。只有演练通过后才允许在生产事故中执行恢复。

R2 应在 Dashboard 配置生命周期规则：未完成的分段上传 7 天清理；业务对象不设自动过期。删除或替换失败形成的未引用资源由 API 即时回收，另建议每月运行一次 D1/R2 对账任务。

## 6. 监控与配额

启用 Pages Functions 日志并对 5xx、DeepSeek 超时、R2 写入失败和 429 建立告警。日志只包含 request id、路由、耗时和用户邮箱哈希，不记录原文、提示词、Access JWT 或密钥。

当前限额为每用户每小时 60 次来源检索、每天 30 次 DeepSeek 分析、每天 300 次图片上传。发布前结合实际团队人数设置 Cloudflare Billing 告警，并检查 DeepSeek 账户余额与用量上限。

## 7. 回滚

前端与 Functions 使用 Pages deployment 回滚到上一成功版本。数据库迁移只允许向前修复，不直接删除列或表。若新版本写入了不兼容数据，先暂停 Access 允许策略，再恢复已演练的 D1 备份和对应 Pages deployment。
