/**
 * 测试邮件配置 API
 */

async function testEmailConfig() {
  const url = "https://dcycloid.us.ci/api/auth/is-email-configured";
  
  console.log("🔍 测试邮件配置 API...");
  console.log(`URL: ${url}\n`);
  
  const response = await fetch(url);
  const data = await response.json();
  
  console.log("响应状态:", response.status);
  console.log("响应数据:", JSON.stringify(data, null, 2));
  
  if (data === true) {
    console.log("\n✅ 邮件已配置，应该显示注册按钮");
  } else {
    console.log("\n❌ 邮件未配置，不会显示注册按钮");
  }
}

testEmailConfig();
