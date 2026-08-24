import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  MEDIA_APP_HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  MEDIA_APP_PORT: z.coerce.number().int().min(1).max(65535).default(3460),
  MEDIA_APP_DATA_DIR: z.string().trim().min(1).default("./data"),
  MEDIA_APP_REGION: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .default("CA"),
  TMDB_API_KEY: z.string().trim().min(1).optional(),
});

export interface AppConfig {
  host: "127.0.0.1";
  port: number;
  dataDir: string;
  region: string;
  tmdbApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = configSchema.parse(env);
  return {
    host: value.MEDIA_APP_HOST,
    port: value.MEDIA_APP_PORT,
    dataDir: path.resolve(value.MEDIA_APP_DATA_DIR),
    region: value.MEDIA_APP_REGION,
    ...(value.TMDB_API_KEY ? { tmdbApiKey: value.TMDB_API_KEY } : {}),
  };
}
