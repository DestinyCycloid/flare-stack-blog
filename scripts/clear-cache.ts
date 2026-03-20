/**
 * 清除配置缓存
 */

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_NAMESPACE_ID = "acf3e87cc31146f2aa5b8e583412a6ad";

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error("❌ 缺少环境变量");
  process.exit(1);
}

async function clearCache() {
  // 删除配置缓存 key
  const cacheKey = "cache:system";
  
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${cacheKey}`;
  
  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
    },
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error("❌ 删除缓存失败:", text);
    process.exit(1);
  }
  
  console.log("✅ 配置缓存已清除");
  console.log("现在访问 https://dcycloid.us.ci 应该可以看到注册按钮了");
}

clearCache();
