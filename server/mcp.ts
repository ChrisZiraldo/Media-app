import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  libraryStatusSchema,
  libraryViewSchema,
  mediaIdSchema,
  mediaTypeSchema,
  noteSchema,
} from "../shared/media-schema.js";
import type { MediaService } from "./services/media-service.js";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

export function createMcpServer(service: MediaService): McpServer {
  const server = new McpServer({ name: "media-tracker", version: "0.1.0" });

  server.registerTool(
    "search_media",
    {
      description: "Search TMDB for normalized movie or television metadata.",
      inputSchema: {
        query: z.string().trim().min(2).max(200),
        type: z.enum(["movie", "tv", "all"]).default("all"),
        page: z.number().int().positive().default(1),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, type, page }) =>
      textResult(await service.searchCatalog(query, type, page)),
  );
  server.registerTool(
    "list_media_library",
    {
      description: "List normalized entries in the private media library.",
      inputSchema: {
        query: z.string().trim().max(200).optional(),
        genre: z.string().trim().max(100).optional(),
        provider: z.string().trim().max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (input) => textResult(service.listLibrary(input)),
  );
  server.registerTool(
    "get_media_details",
    {
      description:
        "Get one tracked title with progress, episodes, cast, and providers.",
      inputSchema: { id: mediaIdSchema },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => textResult(service.detail(id) ?? { found: false }),
  );
  server.registerTool(
    "list_library_view",
    {
      description: "List a derived Compact Tracker library view.",
      inputSchema: { view: libraryViewSchema },
      annotations: { readOnlyHint: true },
    },
    ({ view }) => textResult(service.listLibrary({ view })),
  );
  server.registerTool(
    "list_upcoming_episodes",
    {
      description: "List announced future episodes for watching series.",
      annotations: { readOnlyHint: true },
    },
    () => textResult(service.upcoming()),
  );
  server.registerTool(
    "list_viewing_activity",
    {
      description: "List explicit viewing and status-change diary events.",
      annotations: { readOnlyHint: true },
    },
    () => textResult(service.activity()),
  );
  server.registerTool(
    "add_media_to_library",
    {
      description:
        "Mutation: add one TMDB title with an explicit library status.",
      inputSchema: {
        tmdbId: z.number().int().positive(),
        mediaType: mediaTypeSchema,
        status: libraryStatusSchema,
      },
    },
    async ({ tmdbId, mediaType, status }) => {
      const id = await service.addFromCatalog(tmdbId, mediaType, status);
      return textResult(service.detail(id));
    },
  );
  server.registerTool(
    "update_media_status",
    {
      description:
        "Mutation: update the explicit status and/or private note for one named entry.",
      inputSchema: {
        id: mediaIdSchema,
        status: libraryStatusSchema.optional(),
        note: noteSchema,
      },
    },
    ({ id, status, note }) => {
      if (status === undefined && note === undefined)
        throw new Error("Status or note is required");
      if (status !== undefined) service.setStatus(id, status);
      if (note !== undefined) service.setNote(id, note?.trim() || null);
      return textResult(service.detail(id));
    },
  );
  server.registerTool(
    "mark_episode_watched",
    {
      description:
        "Mutation: mark one explicit television episode watched or unwatched.",
      inputSchema: {
        id: mediaIdSchema,
        seasonNumber: z.number().int().min(0),
        episodeNumber: z.number().int().min(1),
        watched: z.boolean(),
      },
    },
    ({ id, seasonNumber, episodeNumber, watched }) => {
      service.setEpisodeWatched(id, seasonNumber, episodeNumber, watched);
      return textResult(service.detail(id));
    },
  );
  server.registerTool(
    "mark_season_watched",
    {
      description:
        "Mutation: transactionally mark every known episode in a season watched or unwatched.",
      inputSchema: {
        id: mediaIdSchema,
        seasonNumber: z.number().int().min(0),
        watched: z.boolean(),
      },
    },
    ({ id, seasonNumber, watched }) => {
      service.setSeasonWatched(id, seasonNumber, watched);
      return textResult(service.detail(id));
    },
  );
  server.registerTool(
    "mark_show_watched",
    {
      description:
        "Mutation: transactionally mark every known episode in a show watched or unwatched.",
      inputSchema: { id: mediaIdSchema, watched: z.boolean() },
    },
    ({ id, watched }) => {
      service.setShowWatched(id, watched);
      return textResult(service.detail(id));
    },
  );
  server.registerTool(
    "remove_media_from_library",
    {
      description:
        "Destructive mutation: permanently remove one entry and its history. Requires confirm=true.",
      inputSchema: { id: mediaIdSchema, confirm: z.literal(true) },
      annotations: { destructiveHint: true },
    },
    ({ id }) => {
      service.remove(id);
      return textResult({ removed: true, id });
    },
  );
  server.registerTool(
    "get_media_service_status",
    {
      description:
        "Report safe Media Tracker service availability without host or secret data.",
      annotations: { readOnlyHint: true },
    },
    () => textResult({ ok: true }),
  );
  return server;
}
