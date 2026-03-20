# 部署指南（Cloudflare Workers）

本文档用于部署 Flare Stack Blog 到 Cloudflare Workers，内容简洁、可执行，并区分 GitHub 图床与 R2 存储两种配置分支。

**前置条件**
- 本机已安装 `bun`
- 已有 Cloudflare 账号并能创建 Workers / D1 / KV / Queues
- 已准备好自定义域名（可选）

---

**一、准备 Cloudflare 资源**

1. D1 数据库
- 创建 D1
- 记录 `database_id`

2. KV 命名空间
- 创建 KV
- 记录 `id`

3. Queue
- 创建 Queue
- 队列名必须是 `blog`

4. （可选）R2
- 仅在使用 R2 存储时创建
- 记录 `bucket_name`

---

**二、生成必要密钥**

1. Better Auth Secret
```bash
openssl rand -hex 32
```

2. Cloudflare API Token（用于部署）
- 权限建议包含：Workers Scripts (Edit)、D1 (Edit)、KV (Edit)、Queues (Edit)

---

**三、配置文件**

1. `.env`（用于 wrangler）
```bash
CLOUDFLARE_ACCOUNT_ID=你的account_id
CLOUDFLARE_DATABASE_ID=你的d1_database_id
CLOUDFLARE_API_TOKEN=你的api_token
```

2. `.dev.vars`（运行时变量）
```bash
BETTER_AUTH_SECRET=上一步生成的密钥
BETTER_AUTH_URL=https://你的域名
ADMIN_EMAIL=your-email@example.com
STORAGE_TYPE=github
GITHUB_IMAGE_TOKEN=github_pat_xxx
GITHUB_IMAGE_REPO=username/blog-images
```

3. `wrangler.jsonc`（资源绑定）
```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_id": "你的D1数据库ID" }
  ],
  "kv_namespaces": [
    { "binding": "KV", "id": "你的KV命名空间ID" }
  ],
  "queues": {
    "producers": [
      { "binding": "QUEUE", "queue": "blog" }
    ]
  }
}
```

---

**四、存储分支配置（GitHub 图床 vs R2）**

**方案 A：GitHub 图床（默认）**
- `.dev.vars`
```bash
STORAGE_TYPE=github
GITHUB_IMAGE_TOKEN=github_pat_xxx
GITHUB_IMAGE_REPO=username/blog-images
```
- `wrangler.jsonc` 不需要 R2 配置

**方案 B：Cloudflare R2**
- `.dev.vars`
```bash
STORAGE_TYPE=r2
```
- `wrangler.jsonc` 增加 R2 绑定
```jsonc
{
  "r2_buckets": [
    { "binding": "R2", "bucket_name": "你的bucket名称", "remote": true }
  ]
}
```

---

**五、部署**

1. 构建
```powershell
bun run build
```

2. 部署（推荐在终端设置 token 环境变量）
```powershell
$env:CLOUDFLARE_API_TOKEN="你的api_token"
bunx wrangler deploy
```

3. 上传文件并配置环境变量
```powershell
$env:CLOUDFLARE_API_TOKEN="你的api_token"
bunx wrangler secret bulk .dev.vars
```

---

**六、常用命令**

```bash
bun dev              # 本地开发
bun run build        # 构建
bunx wrangler deploy # 部署
bun db:migrate       # 数据库迁移
```

---

**七、可选配置**

1. CDN 清理（可选）
```bash
CLOUDFLARE_ZONE_ID=xxx
CLOUDFLARE_PURGE_API_TOKEN=xxx
DOMAIN=yourdomain.com
```

2. GitHub OAuth（可选）
```bash
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
```
