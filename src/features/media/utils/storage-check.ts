/**
 * Storage Configuration Check Utilities
 * 
 * 检查存储配置是否正确
 */

import { getStorageType } from "@/features/media/adapters/storage-factory";

export interface StorageCheckResult {
  isValid: boolean;
  storageType: "r2" | "github";
  errors: string[];
  warnings: string[];
}

/**
 * 检查存储配置是否有效
 */
export function checkStorageConfiguration(env: Env): StorageCheckResult {
  const storageType = getStorageType(env);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (storageType === "r2") {
    // 检查 R2 配置
    if (!env.R2) {
      errors.push("R2 binding is not configured. Please check your wrangler.jsonc file.");
    }
  } else if (storageType === "github") {
    // 检查 GitHub 配置
    if (!env.GITHUB_IMAGE_TOKEN) {
      errors.push("GITHUB_IMAGE_TOKEN is not set. Please set it in your environment variables.");
    }
    if (!env.GITHUB_IMAGE_REPO) {
      errors.push("GITHUB_IMAGE_REPO is not set. Please set it in format 'username/repo'.");
    }
    
    // 检查仓库格式
    if (env.GITHUB_IMAGE_REPO && !env.GITHUB_IMAGE_REPO.includes("/")) {
      errors.push("GITHUB_IMAGE_REPO format is invalid. Should be 'username/repo'.");
    }

    // 警告：GitHub 图床的限制
    warnings.push("GitHub image hosting has upload rate limits (5000 requests/hour).");
    warnings.push("Single repository size should be less than 1GB.");
    warnings.push("Image optimization (Cloudflare Images) is not available with GitHub storage.");
  }

  return {
    isValid: errors.length === 0,
    storageType,
    errors,
    warnings,
  };
}

/**
 * 获取存储配置信息（用于显示）
 */
export function getStorageInfo(env: Env): string {
  const storageType = getStorageType(env);
  
  if (storageType === "r2") {
    return "Cloudflare R2 Storage";
  } else if (storageType === "github") {
    const repo = env.GITHUB_IMAGE_REPO || "not-configured";
    const branch = env.GITHUB_IMAGE_BRANCH || "main";
    return `GitHub Storage (${repo}@${branch})`;
  }
  
  return "Unknown Storage";
}
