import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  libraryStatusSchema,
  libraryViewSchema,
  mediaTypeSchema,
  noteSchema,
} from "../shared/media-schema.js";
import type { MediaService } from "./services/media-service.js";
import { TmdbError } from "./tmdb/tmdb-client.js";

interface AppOptions {
  staticRoot?: string;
  service?: MediaService;
}

const searchQuerySchema = z.object({
  query: z.string().trim().min(2).max(200),
  type: z.enum(["movie", "tv", "all"]).default("all"),
  page: z.coerce.number().int().positive().default(1),
});
const catalogDetailParamsSchema = z.object({
  type: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
});
const personParamsSchema = z.object({
  tmdbPersonId: z.coerce.number().int().positive(),
});
const catalogEpisodeParamsSchema = z.object({
  tmdbId: z.coerce.number().int().positive(),
  season: z.coerce.number().int().min(0),
  episode: z.coerce.number().int().min(1),
});
const libraryQuerySchema = z.object({
  libraryView: libraryViewSchema.optional(),
  status: libraryStatusSchema.optional(),
  type: mediaTypeSchema.optional(),
  query: z.string().trim().max(200).optional(),
  genre: z.string().trim().max(100).optional(),
  provider: z.string().trim().max(100).optional(),
  sort: z.enum(["title", "progress", "nextEpisode", "lastUpdated"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});
const routeViewSchema = z.enum([
  "continue",
  "caught-up",
  "watchlist",
  "finished",
  "shows",
]);
const addLibrarySchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: mediaTypeSchema,
  status: libraryStatusSchema,
});
const updateLibrarySchema = z
  .object({
    status: libraryStatusSchema.optional(),
    note: noteSchema,
    favorite: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.note !== undefined ||
      value.favorite !== undefined,
  );
const episodeParamsSchema = z.object({
  id: z.string().uuid(),
  season: z.coerce.number().int().min(0),
  episode: z.coerce.number().int().min(1),
});
const seasonParamsSchema = episodeParamsSchema.omit({ episode: true });
const idParamsSchema = episodeParamsSchema.pick({ id: true });
const episodeQuerySchema = z.object({
  season: z.coerce.number().int().min(0).optional(),
});
const deleteAllDataSchema = z.object({
  confirmation: z.literal("DELETE ALL DATA"),
});

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  app.addContentTypeParser(
    ["text/csv", "application/csv"],
    { parseAs: "string" },
    (_request, body, done) => done(null, body),
  );
  app.get("/health", async () => ({ ok: true }));
  app.get("/api/v1/search", async (request) => {
    const input = searchQuerySchema.parse(request.query);
    if (!options.service) return { items: [], page: 1, totalPages: 0 };
    return options.service.searchCatalog(input.query, input.type, input.page);
  });
  app.get("/api/v1/catalog/:type/:tmdbId", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const input = catalogDetailParamsSchema.parse(request.params);
    return options.service.catalogDetail(input.tmdbId, input.type);
  });
  app.get("/api/v1/people/:tmdbPersonId", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: { code: "REQUEST_ERROR", message: "Library service is not configured" },
      });
    const input = personParamsSchema.parse(request.params);
    return options.service.personDetail(input.tmdbPersonId);
  });
  app.get(
    "/api/v1/catalog/tv/:tmdbId/seasons/:season/episodes/:episode",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: { code: "REQUEST_ERROR", message: "Library service is not configured" },
        });
      const input = catalogEpisodeParamsSchema.parse(request.params);
      return options.service.episodeDetail(
        input.tmdbId,
        input.season,
        input.episode,
      );
    },
  );
  app.get("/api/v1/library", async (request) => {
    const input = libraryQuerySchema.parse(request.query);
    return {
      items:
        options.service?.listLibrary({
          view: input.libraryView,
          status: input.status,
          type: input.type,
          query: input.query,
          genre: input.genre,
          provider: input.provider,
          sort: input.sort,
          direction: input.direction,
        }) ?? [],
    };
  });
  app.get("/api/v1/library/views/:view", async (request) => {
    const { view } = z.object({ view: routeViewSchema }).parse(request.params),
      input = libraryQuerySchema
        .omit({ libraryView: true })
        .parse(request.query);
    const unsupportedSorts: Partial<Record<typeof view, string[]>> = {
      watchlist: ["progress", "nextEpisode"],
      finished: ["progress", "nextEpisode"],
    };
    if (input.sort && unsupportedSorts[view]?.includes(input.sort))
      z.never().parse(input.sort);
    return {
      items:
        options.service?.listLibrary({
          view,
          status: input.status,
          type: input.type,
          query: input.query,
          genre: input.genre,
          provider: input.provider,
          sort: input.sort,
          direction: input.direction,
        }) ?? [],
    };
  });
  app.post("/api/v1/library", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const input = addLibrarySchema.parse(request.body);
    const id = await options.service.addFromCatalog(
      input.tmdbId,
      input.mediaType,
      input.status,
    );
    return reply.status(201).send({ id });
  });
  app.patch("/api/v1/library/:id", async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params),
      input = updateLibrarySchema.parse(request.body);
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    if (input.status !== undefined) options.service.setStatus(id, input.status);
    if (input.note !== undefined)
      options.service.setNote(id, input.note?.trim() || null);
    if (input.favorite !== undefined)
      options.service.setFavorite(id, input.favorite);
    return reply.status(204).send();
  });
  app.post("/api/v1/library/:id/actions/start", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    return { episode: options.service.startWatching(id) };
  });
  app.post("/api/v1/library/:id/actions/mark-next", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    return { episode: options.service.markNext(id) };
  });
  app.post("/api/v1/library/:id/actions/refresh", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    await options.service.refreshFromCatalog(id);
    return reply.status(204).send();
  });
  app.post(
    "/api/v1/library/:id/actions/unwatch-latest",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: {
            code: "REQUEST_ERROR",
            message: "Library service is not configured",
          },
        });
      const { id } = idParamsSchema.parse(request.params);
      return { episode: options.service.unwatchLatest(id) };
    },
  );
  app.delete("/api/v1/library/:id", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    z.object({ confirm: z.literal("true") }).parse(request.query);
    options.service.remove(id);
    return reply.status(204).send();
  });
  app.put(
    "/api/v1/library/:id/episodes/:season/:episode",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: {
            code: "REQUEST_ERROR",
            message: "Library service is not configured",
          },
        });
      const input = episodeParamsSchema.parse(request.params);
      options.service.setEpisodeWatched(
        input.id,
        input.season,
        input.episode,
        true,
      );
      return reply.status(204).send();
    },
  );
  app.delete(
    "/api/v1/library/:id/episodes/:season/:episode",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: {
            code: "REQUEST_ERROR",
            message: "Library service is not configured",
          },
        });
      const input = episodeParamsSchema.parse(request.params);
      options.service.setEpisodeWatched(
        input.id,
        input.season,
        input.episode,
        false,
      );
      return reply.status(204).send();
    },
  );
  app.get("/api/v1/library/:id/episodes", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params),
      { season } = episodeQuerySchema.parse(request.query);
    return { items: options.service.listEpisodes(id, season) };
  });
  app.put(
    "/api/v1/library/:id/seasons/:season/watched",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: {
            code: "REQUEST_ERROR",
            message: "Library service is not configured",
          },
        });
      const input = seasonParamsSchema.parse(request.params);
      options.service.setSeasonWatched(input.id, input.season, true);
      return reply.status(204).send();
    },
  );
  app.delete(
    "/api/v1/library/:id/seasons/:season/watched",
    async (request, reply) => {
      if (!options.service)
        return reply.status(503).send({
          error: {
            code: "REQUEST_ERROR",
            message: "Library service is not configured",
          },
        });
      const input = seasonParamsSchema.parse(request.params);
      options.service.setSeasonWatched(input.id, input.season, false);
      return reply.status(204).send();
    },
  );
  app.put("/api/v1/library/:id/episodes/watched", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    options.service.setShowWatched(id, true);
    return reply.status(204).send();
  });
  app.delete("/api/v1/library/:id/episodes/watched", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    options.service.setShowWatched(id, false);
    return reply.status(204).send();
  });
  app.get("/api/v1/activity/diary", async () => ({
    items: options.service?.activity() ?? [],
  }));
  app.get("/api/v1/activity/upcoming", async () => ({
    items: options.service?.upcoming() ?? [],
  }));
  app.get("/api/v1/library/:id/cast", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params);
    return { items: options.service.cast(id) };
  });
  app.get("/api/v1/library/:id", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params),
      detail = options.service.detail(id);
    return (
      detail ??
      reply
        .status(404)
        .send({ error: { code: "NOT_FOUND", message: "Show not found" } })
    );
  });
  app.get("/api/v1/library/:id/watch-providers", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    const { id } = idParamsSchema.parse(request.params),
      { region } = z
        .object({
          region: z
            .string()
            .regex(/^[A-Za-z]{2}$/)
            .transform((value) => value.toUpperCase()),
        })
        .parse(request.query);
    return {
      items: options.service.watchProviders(id, region),
      attribution: "JustWatch",
    };
  });
  app.get("/api/v1/admin/export.csv", async (_request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="media-tracker-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send(options.service.exportLibraryCsv());
  });
  app.post("/api/v1/admin/import.csv", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    if (typeof request.body !== "string")
      return reply.status(400).send({
        error: { code: "REQUEST_ERROR", message: "CSV body required" },
      });
    return { imported: options.service.importLibraryCsv(request.body) };
  });
  app.delete("/api/v1/admin/data", async (request, reply) => {
    if (!options.service)
      return reply.status(503).send({
        error: {
          code: "REQUEST_ERROR",
          message: "Library service is not configured",
        },
      });
    deleteAllDataSchema.parse(request.body);
    options.service.deleteAllData();
    return reply.status(204).send();
  });
  if (options.staticRoot) {
    void app.register(fastifyStatic, { root: options.staticRoot });
    app.get("/", (_request, reply) => reply.sendFile("index.html"));
    app.get("/shows/:id", (_request, reply) => reply.sendFile("index.html"));
    app.get("/shows/:id/cast", (_request, reply) =>
      reply.sendFile("index.html"),
    );
  }
  app.setErrorHandler((error, _request, reply) => {
    const candidate = error as { statusCode?: unknown; message?: unknown };
    const statusCode =
      error instanceof TmdbError
        ? 502
        : typeof candidate.statusCode === "number"
          ? candidate.statusCode
          : error instanceof z.ZodError
            ? 400
            : 500;
    const publicError =
      error instanceof z.ZodError
        ? { code: "VALIDATION_ERROR", message: "Invalid request." }
        : error instanceof TmdbError
          ? { code: "UPSTREAM_ERROR", message: "Catalog service unavailable." }
          : statusCode === 404
            ? { code: "NOT_FOUND", message: "Library item not found." }
            : statusCode === 409
              ? {
                  code: "STATE_CONFLICT",
                  message:
                    "The requested change conflicts with existing progress.",
                }
              : statusCode === 503
                ? {
                    code: "SERVICE_UNAVAILABLE",
                    message: "Service unavailable.",
                  }
                : { code: "INTERNAL_ERROR", message: "Something went wrong." };
    void reply.status(statusCode).send({
      error: publicError,
    });
  });
  return app;
}
