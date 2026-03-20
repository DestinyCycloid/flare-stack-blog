import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import * as CacheService from "@/features/cache/cache.service";
import type {
  ExportManifest,
  PostFrontmatter,
  TaskProgress,
} from "@/features/import-export/import-export.schema";
import {
  EXPORT_MANIFEST_VERSION,
  IMPORT_EXPORT_CACHE_KEYS,
  IMPORT_EXPORT_R2_KEYS,
} from "@/features/import-export/import-export.schema";
import { stringifyFrontmatter } from "@/features/import-export/utils/frontmatter";
import {
  jsonContentToMarkdown,
  makeExportImageRewriter,
} from "@/features/import-export/utils/markdown-serializer";
import { buildZip } from "@/features/import-export/utils/zip";
import { createStorageAdapter } from "@/features/media/adapters/storage-factory";
import * as PostRepo from "@/features/posts/data/posts.data";
import { extractAllImageKeys } from "@/features/posts/utils/content";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server.env";
import { m } from "@/paraglide/messages";

export class ExportWorkflow extends WorkflowEntrypoint<
  Env,
  ExportWorkflowParams
> {
  async run(event: WorkflowEvent<ExportWorkflowParams>, step: WorkflowStep) {
    const { taskId, postIds, status, locale: requestedLocale } = event.payload;
    const progressKey = IMPORT_EXPORT_CACHE_KEYS.exportProgress(taskId);
    const locale = requestedLocale ?? serverEnv(this.env).LOCALE;

    console.log(JSON.stringify({ message: "export workflow started", taskId }));

    try {
      // 1. Fetch posts
      const posts = await step.do("fetch posts", async () => {
        const db = getDb(this.env);

        return await PostRepo.findFullPosts(db, {
          ids: postIds && postIds.length > 0 ? postIds : undefined,
          status: status ?? undefined,
        });
      });

      console.log(
        JSON.stringify({
          message: "posts fetched",
          taskId,
          count: posts.length,
        }),
      );

      if (posts.length === 0) {
        await this.updateProgress(progressKey, {
          status: "completed",
          total: 0,
          completed: 0,
          current: "",
          errors: [],
          warnings: [m.import_export_export_warning_empty({}, { locale })],
        });
        return;
      }

      // 2. Process all posts, build ZIP, upload
      // Consolidated into one step because zipFiles accumulates Uint8Array data
      // which cannot survive JSON serialization through step.do() boundaries.
      // A single atomic step guarantees all data is available for ZIP building,
      // and retries the entire process on transient failures.
      await step.do("build and upload export", async () => {
        const zipFiles: Record<string, Uint8Array | string> = {};
        const warnings: Array<string> = [];

        for (let i = 0; i < posts.length; i++) {
          const post = posts[i];
          const slug = post.slug;
          const prefix = `posts/${slug}`;

          // Generate frontmatter
          const frontmatter: PostFrontmatter = {
            title: post.title,
            slug: post.slug,
            summary: post.summary ?? undefined,
            status: post.status,
            publishedAt: post.publishedAt?.toISOString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            readTimeInMinutes: post.readTimeInMinutes,
            tags: post.tags.map((t) => t.name),
          };

          // Convert content to Markdown
          const rewriter = makeExportImageRewriter();
          const markdown = post.contentJson
            ? jsonContentToMarkdown(post.contentJson, {
                rewriteImageSrc: rewriter,
              })
            : "";

          // Write index.md with frontmatter
          zipFiles[`${prefix}/index.md`] = stringifyFrontmatter(
            frontmatter,
            markdown,
          );

          // Write content.json (lossless backup)
          if (post.contentJson) {
            zipFiles[`${prefix}/content.json`] = JSON.stringify(
              post.contentJson,
              null,
              2,
            );
          }

          // Download images from storage
          if (post.contentJson) {
            const adapter = createStorageAdapter(this.env);
            const imageKeys = extractAllImageKeys(post.contentJson);
            for (const key of imageKeys) {
              try {
                const stream = await adapter.get(key);
                if (stream) {
                  const reader = stream.getReader();
                  const chunks: Uint8Array[] = [];
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                  }
                  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                  const result = new Uint8Array(totalLength);
                  let offset = 0;
                  for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                  }
                  zipFiles[`${prefix}/images/${key}`] = result;
                } else {
                  warnings.push(
                    m.import_export_export_warning_image_missing(
                      { key, title: post.title },
                      { locale },
                    ),
                  );
                }
              } catch (error) {
                warnings.push(
                  m.import_export_export_warning_image_download_failed(
                    {
                      key,
                      title: post.title,
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                    { locale },
                  ),
                );
              }
            }
          }

          // Update progress
          await this.updateProgress(progressKey, {
            status: "processing",
            total: posts.length,
            completed: i + 1,
            current: post.title,
            errors: [],
            warnings,
          });

          console.log(
            JSON.stringify({
              message: "post exported",
              taskId,
              step: i + 1,
              total: posts.length,
              slug: post.slug,
            }),
          );
        }

        // Add tags.json
        const uniqueTagsMap = new Map<string, (typeof posts)[0]["tags"][0]>();
        for (const post of posts) {
          for (const tag of post.tags) {
            uniqueTagsMap.set(tag.name, tag);
          }
        }

        zipFiles["tags.json"] = JSON.stringify(
          Array.from(uniqueTagsMap.values()).map((t) => ({
            name: t.name,
            createdAt: t.createdAt.toISOString(),
          })),
          null,
          2,
        );

        // Add manifest.json
        const manifest: ExportManifest = {
          version: EXPORT_MANIFEST_VERSION,
          exportedAt: new Date().toISOString(),
          postCount: posts.length,
          generator: "blog-cms",
        };
        zipFiles["manifest.json"] = JSON.stringify(manifest, null, 2);

        // Build ZIP
        const zipData = buildZip(zipFiles);

        // Upload ZIP to storage using adapter
        const tempKey = IMPORT_EXPORT_R2_KEYS.exportZip(taskId);
        try {
          const adapter = createStorageAdapter(this.env);
          
          // Check file size limit
          const maxSize = adapter.getMaxFileSize();
          if (zipData.byteLength > maxSize) {
            throw new Error(`Export ZIP size (${zipData.byteLength} bytes) exceeds storage limit (${maxSize} bytes)`);
          }

          const zipFile = new File([zipData], `export-${taskId}.zip`, {
            type: "application/zip",
          });
          await adapter.uploadTemp(zipFile, tempKey);
        } catch (error) {
          await this.updateProgress(progressKey, {
            status: "failed",
            total: posts.length,
            completed: 0,
            current: "",
            errors: [
              {
                post: m.import_export_export_error_zip_upload_label(
                  {},
                  { locale },
                ),
                reason: error instanceof Error ? error.message : String(error),
              },
            ],
            warnings,
          });
          throw error;
        }

        // Mark completed
        await this.updateProgress(progressKey, {
          status: "completed",
          total: posts.length,
          completed: posts.length,
          current: "",
          errors: [],
          warnings,
          downloadKey: tempKey,
        });
      });

      console.log(
        JSON.stringify({
          message: "export workflow completed",
          taskId,
          postCount: posts.length,
        }),
      );

      // 3. Cleanup storage after 24h
      const cleanupTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await step.sleepUntil("cleanup delay", cleanupTime);

      await step.do("cleanup export zip", async () => {
        const tempKey = IMPORT_EXPORT_R2_KEYS.exportZip(taskId);
        try {
          const adapter = createStorageAdapter(this.env);
          await adapter.deleteTemp(tempKey);
        } catch {
          // Ignore cleanup errors
        }
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "export workflow failed",
          taskId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      await this.updateProgress(progressKey, {
        status: "failed",
        total: 0,
        completed: 0,
        current: "",
        errors: [],
        warnings: [
          error instanceof Error
            ? error.message
            : m.import_export_common_unknown_error({}, { locale }),
        ],
      });
    }
  }

  private async updateProgress(key: string, progress: TaskProgress) {
    const context: BaseContext = { env: this.env };
    await CacheService.set(context, key, JSON.stringify(progress), {
      ttl: "24h",
    });
  }
}
