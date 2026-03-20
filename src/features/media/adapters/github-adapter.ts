/**
 * GitHub Storage Adapter
 * 
 * 使用 GitHub + jsDelivr CDN 作为图床
 */

import { generateKey } from "@/features/media/utils/media.utils";
import type { StorageAdapter, UploadResult } from "./storage-adapter.interface";

export interface GitHubConfig {
  token: string;
  repo: string; // 格式: "username/repo"
  branch: string;
  path: string; // 图片存储路径，如 "images/"
}

export class GitHubStorageAdapter implements StorageAdapter {
  private config: GitHubConfig;
  private static readonly USER_AGENT = "flare-stack-blog";
  private static readonly API_VERSION = "2022-11-28";

  constructor(env: Env) {
    this.config = {
      token: env.GITHUB_IMAGE_TOKEN || "",
      repo: env.GITHUB_IMAGE_REPO || "",
      branch: env.GITHUB_IMAGE_BRANCH || "main",
      path: env.GITHUB_IMAGE_PATH || "images/",
    };

    if (!this.config.token || !this.config.repo) {
      throw new Error("GitHub image hosting configuration is incomplete. Please set GITHUB_IMAGE_TOKEN and GITHUB_IMAGE_REPO.");
    }
  }

  private buildHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GitHubStorageAdapter.API_VERSION,
      "User-Agent": GitHubStorageAdapter.USER_AGENT,
    };
  }

  private buildReadonlyHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GitHubStorageAdapter.API_VERSION,
      "User-Agent": GitHubStorageAdapter.USER_AGENT,
    };
  }

  async upload(file: File): Promise<UploadResult> {
    const key = generateKey(file.name);
    const filePath = `${this.config.path}${key}`;

    // 读取文件内容并转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = this.arrayBufferToBase64(arrayBuffer);

    // 上传到 GitHub
    const response = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: `Upload image: ${file.name}`,
          content: base64Content,
          branch: this.config.branch,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub upload failed: ${response.status} ${error}`);
    }

    const result = await response.json();

    // 生成 jsDelivr CDN URL
    const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.config.repo}@${this.config.branch}/${filePath}`;

    return {
      key,
      url: cdnUrl,
      fileName: file.name,
      mimeType: file.type,
      sizeInBytes: file.size,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = `${this.config.path}${key}`;

    // 首先获取文件的 SHA（GitHub API 删除文件需要 SHA）
    const getResponse = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}?ref=${this.config.branch}`,
      {
        headers: this.buildReadonlyHeaders(),
      }
    );

    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        // 文件不存在，视为删除成功
        return;
      }
      throw new Error(`Failed to get file SHA: ${getResponse.status}`);
    }

    const fileData = await getResponse.json();
    const sha = fileData.sha;

    // 删除文件
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}`,
      {
        method: "DELETE",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: `Delete image: ${key}`,
          sha: sha,
          branch: this.config.branch,
        }),
      }
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      throw new Error(`GitHub delete failed: ${deleteResponse.status} ${error}`);
    }
  }

  async get(key: string): Promise<ReadableStream | null> {
    const filePath = `${this.config.path}${key}`;
    const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.config.repo}@${this.config.branch}/${filePath}`;

    const response = await fetch(cdnUrl);
    if (!response.ok) {
      return null;
    }

    return response.body;
  }

  async uploadAsset(file: File, assetPath: string): Promise<{ key: string; url: string }> {
    const filePath = `assets/${assetPath}`;

    // 读取文件内容并转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = this.arrayBufferToBase64(arrayBuffer);

    // 检查文件是否已存在
    const getResponse = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}?ref=${this.config.branch}`,
      {
        headers: this.buildReadonlyHeaders(),
      }
    );

    let sha: string | undefined;
    if (getResponse.ok) {
      const existingFile = await getResponse.json();
      sha = existingFile.sha;
    }

    // 上传或更新文件
    const response = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: `Upload asset: ${assetPath}`,
          content: base64Content,
          branch: this.config.branch,
          ...(sha && { sha }), // 如果文件存在，包含 SHA 以更新
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub asset upload failed: ${response.status} ${error}`);
    }

    // 生成 jsDelivr CDN URL
    const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.config.repo}@${this.config.branch}/${filePath}`;

    return {
      key: `asset/${assetPath}`,
      url: cdnUrl,
    };
  }

  async uploadTemp(file: File, key: string): Promise<void> {
    const filePath = `temp/${key}`;

    // 检查文件大小限制 (50MB)
    if (file.size > 50 * 1024 * 1024) {
      throw new Error(`File size exceeds 50MB limit: ${file.size} bytes`);
    }

    // 读取文件内容并转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = this.arrayBufferToBase64(arrayBuffer);

    // 上传到 GitHub
    const response = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: `Upload temp file: ${key}`,
          content: base64Content,
          branch: this.config.branch,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub temp upload failed: ${response.status} ${error}`);
    }
  }

  async getTemp(key: string): Promise<ReadableStream | null> {
    const filePath = `temp/${key}`;
    const cdnUrl = `https://cdn.jsdelivr.net/gh/${this.config.repo}@${this.config.branch}/${filePath}`;

    const response = await fetch(cdnUrl);
    if (!response.ok) {
      return null;
    }

    return response.body;
  }

  async deleteTemp(key: string): Promise<void> {
    const filePath = `temp/${key}`;

    // 获取文件的 SHA
    const getResponse = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}?ref=${this.config.branch}`,
      {
        headers: this.buildReadonlyHeaders(),
      }
    );

    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        // 文件不存在，视为删除成功
        return;
      }
      throw new Error(`Failed to get temp file SHA: ${getResponse.status}`);
    }

    const fileData = await getResponse.json();
    const sha = fileData.sha;

    // 删除文件
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${this.config.repo}/contents/${filePath}`,
      {
        method: "DELETE",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          message: `Delete temp file: ${key}`,
          sha: sha,
          branch: this.config.branch,
        }),
      }
    );

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      throw new Error(`GitHub temp delete failed: ${deleteResponse.status} ${error}`);
    }
  }

  getMaxFileSize(): number {
    return 50 * 1024 * 1024; // 50MB
  }

  getType(): string {
    return "github";
  }

  /**
   * 将 ArrayBuffer 转换为 Base64 字符串
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
