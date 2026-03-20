import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import * as CacheService from "@/features/cache/cache.service";
import type {
  ImportReport,
  TaskProgress,
} from "@/features/import-export/import-export.schema";
import { IMPORT_EXPORT_CACHE_KEYS } from "@/features/import-export/import-export.schema";
import { parseZip } from "@/features/import-export/utils/zip";
import {
  enumerateMarkdownPosts,
  enumerateNativePosts,
  importSinglePost,
} from "@/features/import-export/workflows/import-helpers";
import { serverEnv } from "@/lib/env/server.env";
import { m } from "@/paraglide/messages";

export class ImportWorkflow extends WorkflowEntrypoint<
  Env,
  ImportWorkflowParams
> {
  async run(event: WorkflowEvent<ImportWorkflowParams>, step: WorkflowStep) {
    const { taskId, tempKey, mode, locale: requestedLocale } = event.payload;
    const progressKey = IMPORT_EXPORT_CACHE_KEYS.importProgress(taskId);
    const locale = requestedLocale ?? serverEnv(this.env).LOCALE;

    console.log(
      JSON.stringify({ message: "import workflow started", taskId, mode }),
    );

    try {
      // 1. Enumerate posts from ZIP
      // NOTE: step.do() serializes return values as JSON for durability.
      // Uint8Array does NOT survive JSON round-tripping, so we must NOT
      // return binary data from steps. Instead, each step re-fetches the
      // ZIP from storage when it needs the binary content.
      const postEntries = await step.do("enumerate posts", async () => {
        const zipFiles = await this.fetchZipFiles(tempKey, locale);
        if (mode === "native") {
          return enumerateNativePosts(zipFiles);
        }
        return enumerateMarkdownPosts(zipFiles);
      });

      console.log(
        JSON.stringify({
          message: "posts enumerated",
          taskId,
          count: postEntries.length,
        }),
      );

      if (postEntries.length === 0) {
        await this.updateProgress(progressKey, {
          status: "completed",
          total: 0,
          completed: 0,
          current: "",
          errors: [],
          warnings: [m.import_export_import_warning_empty({}, { locale })],
          report: { succeeded: [], failed: [], warnings: [] },
        });
        return;
      }

      // 2. Process each post
      // Each step returns a delta (serializable). Accumulation happens outside
      // steps so it re-executes correctly on workflow restart/replay.
      const report: ImportReport = {
        succeeded: [],
        failed: [],
        warnings: [],
      };

      for (let i = 0; i < postEntries.length; i++) {
        const entry = postEntries[i];

        const delta = await step.do(
          `import post ${i + 1}/${postEntries.length}: ${entry.title || entry.dir}`,
          async () => {
            const stepReport: ImportReport = {
              succeeded: [],
              failed: [],
              warnings: [],
            };

            try {
              const zipFiles = await this.fetchZipFiles(tempKey, locale);
              const result = await importSinglePost(
                this.env,
                zipFiles,
                entry,
                mode,
                locale,
              );
              if (result.skipped) {
                stepReport.warnings.push(
                  m.import_export_import_warning_slug_skipped(
                    { title: result.title },
                    { locale },
                  ),
                );
              } else {
                stepReport.succeeded.push({
                  title: result.title,
                  slug: result.slug,
                });
              }
              for (const w of result.warnings) {
                stepReport.warnings.push(
                  m.import_export_import_warning_scoped(
                    { title: result.title, warning: w },
                    { locale },
                  ),
                );
              }
            } catch (error) {
              const reason =
                error instanceof Error ? error.message : String(error);
              stepReport.failed.push({
                title: entry.title || entry.dir,
                reason,
              });
            }

            return stepReport;
          },
        );

        // Accumulate outside step — on replay, cached return values flow here
        report.succeeded.push(...delta.succeeded);
        report.failed.push(...delta.failed);
        report.warnings.push(...delta.warnings);

        console.log(
          JSON.stringify({
            message: "post import step completed",
            taskId,
            step: i + 1,
            total: postEntries.length,
            title: entry.title || entry.dir,
            succeeded: delta.succeeded.length,
            failed: delta.failed.length,
          }),
        );

        // Progress update outside step — idempotent KV write, safe on replay
        await this.updateProgress(progressKey, {
          status: "processing",
          total: postEntries.length,
          completed: i + 1,
          current: entry.title || entry.dir,
          errors: report.failed.map((f) => ({
            post: f.title,
            reason: f.reason,
          })),
          warnings: report.warnings,
        });
      }

      // 3. Cleanup and finalize
      await step.do("finalize", async () => {
        try {
          const { createStorageAdapter } = await import("@/features/media/adapters/storage-factory");
          const adapter = createStorageAdapter(this.env);
          await adapter.deleteTemp(tempKey);
        } catch {
          // Ignore cleanup errors
        }

        await this.updateProgress(progressKey, {
          status: "completed",
          total: postEntries.length,
          completed: postEntries.length,
          current: "",
          errors: report.failed.map((f) => ({
            post: f.title,
            reason: f.reason,
          })),
          warnings: report.warnings,
          report,
        });
      });

      console.log(
        JSON.stringify({
          message: "import workflow completed",
          taskId,
          succeeded: report.succeeded.length,
          failed: report.failed.length,
          warnings: report.warnings.length,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "import workflow failed",
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

  private async fetchZipFiles(
    tempKey: string,
    locale: "zh" | "en",
  ): Promise<Record<string, Uint8Array>> {
    const { createStorageAdapter } = await import("@/features/media/adapters/storage-factory");
    const adapter = createStorageAdapter(this.env);
    
    const stream = await adapter.getTemp(tempKey);
    if (!stream) {
      throw new Error(m.import_export_import_error_zip_missing({}, { locale }));
    }

    // Read stream to Uint8Array
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const zipData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, offset);
      offset += chunk.length;
    }

    return parseZip(zipData);
  }

  private async updateProgress(key: string, progress: TaskProgress) {
    const context: BaseContext = { env: this.env };
    await CacheService.set(context, key, JSON.stringify(progress), {
      ttl: "24h",
    });
  }
}
