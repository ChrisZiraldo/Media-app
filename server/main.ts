import path from "node:path";
import { createApp } from "./api.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { MediaRepository } from "./repositories/media-repository.js";
import { MediaService } from "./services/media-service.js";
import { TmdbClient } from "./tmdb/tmdb-client.js";

const config = loadConfig();
const database = openDatabase(config.dataDir);
const repository = new MediaRepository(database);
const tmdb = config.tmdbApiKey ? new TmdbClient(config.tmdbApiKey) : undefined;
const service = new MediaService(repository, tmdb, config.region);
const app = createApp({ staticRoot: path.resolve("dist/client"), service });

const shutdown = async () => {
  await app.close();
  database.close();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

await app.listen({ host: config.host, port: config.port });
