import { createStorageAdapter } from "@/features/media/adapters/storage-factory";
import type { UploadResult } from "@/features/media/adapters/storage-adapter.interface";

/**
 * 上传图片到配置的存储后端
 */
export async function putToStorage(env: Env, image: File): Promise<UploadResult> {
  const adapter = createStorageAdapter(env);
  return await adapter.upload(image);
}

/**
 * 从存储后端删除图片
 */
export async function deleteFromStorage(env: Env, key: string): Promise<void> {
  const adapter = createStorageAdapter(env);
  await adapter.delete(key);
}

/**
 * 从存储后端获取图片
 */
export async function getFromStorage(env: Env, key: string): Promise<ReadableStream | null> {
  const adapter = createStorageAdapter(env);
  return await adapter.get(key);
}

/**
 * 上传站点资源（favicon、主题图片等）
 * 无数据库记录；重新上传时覆盖
 */
export async function putSiteAsset(
  env: Env,
  file: File,
  assetPath: string,
): Promise<{ key: string; url: string }> {
  const adapter = createStorageAdapter(env);
  return await adapter.uploadAsset(file, assetPath);
}

// ============ 向后兼容的别名 ============
// 保留旧的函数名以兼容现有代码

/**
 * @deprecated 使用 putToStorage 代替
 */
export const putToR2 = putToStorage;

/**
 * @deprecated 使用 deleteFromStorage 代替
 */
export const deleteFromR2 = deleteFromStorage;

/**
 * @deprecated 使用 getFromStorage 代替
 */
export const getFromR2 = getFromStorage;
