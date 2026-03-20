/**
 * 初始化邮件配置脚本
 * 用于在数据库中插入邮件配置，启用邮箱注册功能
 * 
 * 使用方法：
 * bun run scripts/init-email-config.ts
 */

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { SystemConfigTable } from "@/lib/db/schema/config.table";
import type { SystemConfig } from "@/features/config/config.schema";

// 从环境变量读取配置
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const D1_DATABASE_ID = "eb53ece8-ebf3-4c69-be48-322e56084c6b";

if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error("❌ 缺少环境变量：CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN");
  console.error("请在 .env 文件中配置这些变量");
  process.exit(1);
}

// 邮件配置（使用占位符，启用注册功能）
const emailConfig: SystemConfig = {
  email: {
    apiKey: "placeholder-key",
    senderName: "Blog",
    senderAddress: "noreply@dcycloid.us.ci",
  },
  notification: {
    admin: {
      channels: {
        email: false, // 暂时禁用邮件通知
        webhook: false,
      },
    },
    user: {
      emailEnabled: false, // 暂时禁用用户邮件通知
    },
    webhooks: [],
  },
};

async function initEmailConfig() {
  try {
    console.log("🔄 连接到 D1 数据库...");
    
    // 使用 Cloudflare API 执行 SQL
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
    
    const configJson = JSON.stringify(emailConfig);
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    
    // 检查是否已存在配置
    const checkResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: "SELECT id FROM system_config LIMIT 1",
      }),
    });
    
    const checkData = await checkResponse.json();
    
    if (!checkData.success) {
      throw new Error(`查询失败: ${JSON.stringify(checkData.errors)}`);
    }
    
    const exists = checkData.result[0]?.results?.length > 0;
    
    let sql: string;
    let params: any[];
    
    if (exists) {
      console.log("📝 更新现有配置...");
      sql = "UPDATE system_config SET config_json = ?1, updated_at = ?2";
      params = [configJson, now];
    } else {
      console.log("➕ 插入新配置...");
      sql = "INSERT INTO system_config (config_json, updated_at) VALUES (?1, ?2)";
      params = [configJson, now];
    }
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        sql,
        params 
      }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(`操作失败: ${JSON.stringify(data.errors)}`);
    }
    
    console.log("✅ 邮件配置已成功初始化！");
    console.log("\n📧 配置详情：");
    console.log(`   - Sender: ${emailConfig.email?.senderName} <${emailConfig.email?.senderAddress}>`);
    console.log(`   - API Key: ${emailConfig.email?.apiKey}`);
    console.log("\n⚠️  注意：这是占位符配置，邮件验证功能将被跳过");
    console.log("   现在可以访问 https://dcycloid.us.ci/register 注册管理员账号了");
    console.log(`   使用邮箱: admin@dcycloid.us.ci`);
    
  } catch (error) {
    console.error("❌ 初始化失败：", error);
    process.exit(1);
  }
}

initEmailConfig();
