/**
 * R2 Storage Adapter
 * 
 * Cloudflare R2 存储适配器
 */

import { generateKey } from "@/features/media/utils/media.utils";
import type { StorageAdapter, UploadResult } from "./storage-adapter.interface";

export class R2StorageAdapter implements StorageAdapter {
  constructor(private env: Env) {}

  async upload(file: File): Promise<UploadResult> {
    const key = generateKey(file.name);
    const contentType = file.type;
    const url = `/images/${key}`;

    await this.env.R2.put(key, file.stream(), {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        originalName: file.name,
      },
    });

    return {
      key,
      url,
      fileName: file.name,
      mimeType: contentType,
      sizeInBytes: file.size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.env.R2.delete(key);
  }

  async get(key: string): Promise<ReadableStream | null> {
    const object = await this.env.R2.get(key);
    return object?.body || null;
  }

  async uploadAsset(file: File, assetPath: string): Promise<{ key: string; url: string }> {
    const key = `asset/${assetPath}`;
    await this.env.R2.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });
    return { key, url: `/images/${key}` };
  }

  async uploadTemp(key: string, data: Uint8Array, metadata?: Record<string, string>): Promise<void> {
    await this.env.R2.put(key, data, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: metadata,
    });
  }

  async getTemp(key: string): Promise<Uint8Array | null> {
    const object = await this.env.R2.get(key);
    if (!object) return null;
    return new Uint8Array(await object.arrayBuffer());
  }

  async deleteTemp(key: string): Promise<void> {
    await this.env.R2.delete(key);
  }

  getType(): string {
    return "r2";
  }

  getMaxFileSize(): number {
    // R2 单个对象最大 5TB，但实际上我们限制为 100MB 以避免滥用
    return 100 * 1024 * 1024; // 100 MB
  }
}
