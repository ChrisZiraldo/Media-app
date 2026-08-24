import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaService } from "./services/media-service.js";
import { createMcpServer } from "./mcp.js";

const openConnections: Array<{
  client: Client;
  server: ReturnType<typeof createMcpServer>;
}> = [];

afterEach(async () => {
  for (const connection of openConnections.splice(0)) {
    await connection.client.close();
    await connection.server.close();
  }
});

async function connect(service: MediaService) {
  const server = createMcpServer(service),
    client = new Client({ name: "media-tracker-test", version: "1.0.0" }),
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  openConnections.push({ client, server });
  return client;
}

describe("Media Tracker MCP", () => {
  it("publishes the specified safe and mutation tools", async () => {
    const service = {} as MediaService,
      client = await connect(service),
      names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "search_media",
        "list_media_library",
        "get_media_details",
        "list_library_view",
        "list_upcoming_episodes",
        "list_viewing_activity",
        "add_media_to_library",
        "update_media_status",
        "mark_episode_watched",
        "mark_season_watched",
        "mark_show_watched",
        "remove_media_from_library",
        "get_media_service_status",
      ]),
    );
  });

  it("requires explicit confirmation before destructive removal", async () => {
    const remove = vi.fn(),
      service = { remove } as unknown as MediaService,
      client = await connect(service),
      id = "00000000-0000-4000-8000-000000000000";
    const rejected = await client.callTool({
      name: "remove_media_from_library",
      arguments: { id, confirm: false },
    });
    expect(rejected.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    const accepted = await client.callTool({
      name: "remove_media_from_library",
      arguments: { id, confirm: true },
    });
    expect(accepted.isError).not.toBe(true);
    expect(remove).toHaveBeenCalledWith(id);
  });

  it("executes every published tool through the shared service", async () => {
    const id = "00000000-0000-4000-8000-000000000000",
      service = {
        searchCatalog: vi.fn(async () => ({
          items: [],
          page: 1,
          totalPages: 0,
        })),
        listLibrary: vi.fn(() => []),
        detail: vi.fn(() => ({ item: { id, title: "Example" } })),
        upcoming: vi.fn(() => []),
        activity: vi.fn(() => []),
        addFromCatalog: vi.fn(async () => id),
        setStatus: vi.fn(),
        setNote: vi.fn(),
        setEpisodeWatched: vi.fn(),
        setSeasonWatched: vi.fn(),
        setShowWatched: vi.fn(),
        remove: vi.fn(),
      } as unknown as MediaService,
      client = await connect(service),
      calls = [
        {
          name: "search_media",
          arguments: { query: "Dexter", type: "tv", page: 1 },
        },
        { name: "list_media_library", arguments: { query: "dex" } },
        { name: "get_media_details", arguments: { id } },
        { name: "list_library_view", arguments: { view: "continue" } },
        { name: "list_upcoming_episodes", arguments: {} },
        { name: "list_viewing_activity", arguments: {} },
        {
          name: "add_media_to_library",
          arguments: { tmdbId: 1405, mediaType: "tv", status: "watchlist" },
        },
        {
          name: "update_media_status",
          arguments: { id, status: "watching", note: "  note  " },
        },
        {
          name: "mark_episode_watched",
          arguments: { id, seasonNumber: 1, episodeNumber: 2, watched: true },
        },
        {
          name: "mark_season_watched",
          arguments: { id, seasonNumber: 1, watched: false },
        },
        { name: "mark_show_watched", arguments: { id, watched: true } },
        { name: "remove_media_from_library", arguments: { id, confirm: true } },
        { name: "get_media_service_status", arguments: {} },
      ];
    for (const call of calls) {
      const result = await client.callTool(call);
      expect(result.isError, call.name).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "text" })]),
      );
    }
    expect(service.searchCatalog).toHaveBeenCalledWith("Dexter", "tv", 1);
    expect(service.listLibrary).toHaveBeenCalledWith({ view: "continue" });
    expect(service.setStatus).toHaveBeenCalledWith(id, "watching");
    expect(service.setNote).toHaveBeenCalledWith(id, "note");
    expect(service.setEpisodeWatched).toHaveBeenCalledWith(id, 1, 2, true);
    expect(service.setSeasonWatched).toHaveBeenCalledWith(id, 1, false);
    expect(service.setShowWatched).toHaveBeenCalledWith(id, true);
    expect(service.remove).toHaveBeenCalledWith(id);
  });

  it("rejects invalid identifiers and empty updates before mutation", async () => {
    const setStatus = vi.fn(),
      setNote = vi.fn(),
      service = { setStatus, setNote } as unknown as MediaService,
      client = await connect(service);
    const invalidId = await client.callTool({
      name: "mark_show_watched",
      arguments: { id: "not-a-uuid", watched: true },
    });
    const emptyUpdate = await client.callTool({
      name: "update_media_status",
      arguments: {
        id: "00000000-0000-4000-8000-000000000000",
      },
    });
    expect(invalidId.isError).toBe(true);
    expect(emptyUpdate.isError).toBe(true);
    expect(setStatus).not.toHaveBeenCalled();
    expect(setNote).not.toHaveBeenCalled();
  });
});
