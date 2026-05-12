import { z } from "zod";
import { config as loadDotenv } from "dotenv";

// プロジェクトルートの .env を自動読み込み（ファイルがなくても無視）
loadDotenv();

const baseSchema = z.object({
  JINA_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_USER_ID: z.string().min(1),
  LINE_USER_ID_2: z.string().optional(),
  USE_SAMPLE_DATA: z
    .enum(["true", "false", ""])
    .default("false")
    .transform((v) => v === "true"),
  USE_RSS: z
    .enum(["true", "false", ""])
    .default("false")
    .transform((v) => v === "true"),
});

const xSchema = z.object({
  X_CONSUMER_KEY: z.string().min(1),
  X_CONSUMER_SECRET: z.string().min(1),
  X_ACCESS_TOKEN: z.string().min(1),
  X_ACCESS_TOKEN_SECRET: z.string().min(1),
});

type BaseParsed = z.infer<typeof baseSchema>;
type XParsed = z.infer<typeof xSchema>;
type Common = Omit<BaseParsed, "USE_SAMPLE_DATA" | "USE_RSS">;

export type Config =
  | (Common & { USE_SAMPLE_DATA: true;  USE_RSS: boolean })
  | (Common & { USE_SAMPLE_DATA: false; USE_RSS: true  })
  | (Common & { USE_SAMPLE_DATA: false; USE_RSS: false } & XParsed);

export function loadConfig(): Config {
  const baseResult = baseSchema.safeParse(process.env);
  if (!baseResult.success) {
    reportAndExit("環境変数の検証に失敗しました", baseResult.error);
  }

  const { USE_SAMPLE_DATA, USE_RSS, ...common } = baseResult.data;

  // モックルート（X API 不要・RSS 不要）
  if (USE_SAMPLE_DATA) {
    return { ...common, USE_SAMPLE_DATA: true, USE_RSS };
  }

  // RSS ルート（X API 不要）
  if (USE_RSS) {
    return { ...common, USE_SAMPLE_DATA: false, USE_RSS: true };
  }

  // X API ルート
  const xResult = xSchema.safeParse(process.env);
  if (!xResult.success) {
    reportAndExit(
      "X API の環境変数が揃っていません。" +
      "X API を使わない場合は USE_RSS=true（RSSフィード）または USE_SAMPLE_DATA=true（モック）を指定してください。" +
      "X API を使う場合は X_CONSUMER_KEY / X_CONSUMER_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET の4つが必須です",
      xResult.error,
    );
  }

  return { ...common, USE_SAMPLE_DATA: false, USE_RSS: false, ...xResult.data };
}

function reportAndExit(title: string, error: z.ZodError): never {
  const missing = error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`[CONFIG] ${title}:\n${missing}`);
  process.exit(1);
}
