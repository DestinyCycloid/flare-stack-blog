/**
 * 检查数据库中的邮件配置
 */

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const D1_DATABASE_ID = "eb53ece8-ebf3-4c69-be48-322e56084c6b";

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error("❌ 缺少环境变量");
  process.exit(1);
}

async function checkConfig() {
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: "SELECT * FROM system_config",
    }),
  });
  
  const data = await response.json();
  
  if (!data.success) {
    console.error("❌ 查询失败:", JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }
  
  console.log("✅ 查询成功");
  console.log("\n数据库配置：");
  console.log(JSON.stringify(data.result[0], null, 2));
}

checkConfig();
