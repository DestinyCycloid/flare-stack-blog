/**
 * Storage Adapter Interface
 * 
 * 定义统一的存储接口，支持多种存储后端（R2、GitHub、SM.MS 等）
 */

export interface UploadResult {
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeInBytes: number;
}

export interface StorageAdapter {
  /**
   * 上传文件
   */
  upload(file: File): Promise<UploadResult>;

  /**
   * 删除文件
   */
  delete(key: string): Promise<void>;

  /**
   * 获取文件
   */
  get(key: string): Promise<ReadableStream | null>;

  /**
   * 上传站点资源（favicon、主题图片等）
   */
  uploadAsset(file: File, assetPath: string): Promise<{ key: string; url: string }>;

  /**
   * 上传临时文件（如导入导出的 ZIP）
   * @param key 文件键名
   * @param data 文件数据
   * @param metadata 元数据
   */
  uploadTemp(key: string, data: Uint8Array, metadata?: Record<string, string>): Promise<void>;

  /**
   * 获取临时文件
   */
  getTemp(key: string): Promise<Uint8Array | null>;

  /**
   * 删除临时文件
   */
  deleteTemp(key: string): Promise<void>;

  /**
   * 获取存储类型名称
   */
  getType(): string;

  /**
   * 获取最大文件大小限制（字节）
   */
  getMaxFileSize(): number;
}
