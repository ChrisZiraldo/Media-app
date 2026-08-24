import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";
import { createMcpServer } from "./mcp.js";
import { MediaRepository } from "./repositories/media-repository.js";
import { MediaService } from "./services/media-service.js";
import { TmdbClient } from "./tmdb/tmdb-client.js";

const config = loadConfig();
const database = openDatabase(config.dataDir);
const repository = new MediaRepository(database);
const tmdb = config.tmdbApiKey ? new TmdbClient(config.tmdbApiKey) : undefined;
const service = new MediaService(repository, tmdb, config.region);
const server = createMcpServer(service);

process.once(
  "SIGINT",
  () => void server.close().finally(() => database.close()),
);
process.once(
  "SIGTERM",
  () => void server.close().finally(() => database.close()),
);
await server.connect(new StdioServerTransport());
