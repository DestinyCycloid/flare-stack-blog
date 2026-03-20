/**
 * Storage Factory
 * 
 * 根据环境变量创建相应的存储适配器
 */

import type { StorageAdapter } from "./storage-adapter.interface";
import { R2StorageAdapter } from "./r2-adapter";
import { GitHubStorageAdapter } from "./github-adapter";

export type StorageType = "r2" | "github";

/**
 * 创建存储适配器
 */
export function createStorageAdapter(env: Env): StorageAdapter {
  const storageType = (env.STORAGE_TYPE || "r2").toLowerCase() as StorageType;

  switch (storageType) {
    case "github":
      return new GitHubStorageAdapter(env);
    case "r2":
    default:
      return new R2StorageAdapter(env);
  }
}

/**
 * 获取当前配置的存储类型
 */
export function getStorageType(env: Env): StorageType {
  return (env.STORAGE_TYPE || "r2").toLowerCase() as StorageType;
}

/**
 * 检查 R2 是否可用
 */
export function isR2Available(env: Env): boolean {
  return getStorageType(env) === "r2" && !!env.R2;
}

/**
 * 检查 GitHub 图床是否可用
 */
export function isGitHubStorageAvailable(env: Env): boolean {
  return (
    getStorageType(env) === "github" &&
    !!env.GITHUB_IMAGE_TOKEN &&
    !!env.GITHUB_IMAGE_REPO
  );
}
