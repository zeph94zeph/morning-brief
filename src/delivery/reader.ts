import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Analysis } from "../analysis/schema.js";
import type { Settings } from "../settings.js";

/**
 * 読み上げページ（web/index.html）が読み込む brief.json を書き出す。
 * GitHub Actions がこのフォルダを GitHub Pages として公開する。
 */
export async function writeReaderData(
  analysis: Analysis,
  settings: Settings,
): Promise<void> {
  const dir = settings.reader.outputDir;
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "brief.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), analysis }),
  );
  console.info(`→ 読み上げページ用に ${join(dir, "brief.json")} を書き出しました`);
}
