import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("configuration", () => {
  it("refuses a non-loopback host", () => {
    expect(() => loadConfig({ MEDIA_APP_HOST: "0.0.0.0" })).toThrow();
  });

  it("normalizes a configured provider region and defaults to Canada", () => {
    expect(loadConfig({ MEDIA_APP_REGION: "us" }).region).toBe("US");
    expect(loadConfig({}).region).toBe("CA");
    expect(() => loadConfig({ MEDIA_APP_REGION: "Canada" })).toThrow();
  });

  it("accepts the legacy TMDB_API variable and prefers TMDB_API_KEY", () => {
    expect(loadConfig({ TMDB_API: "legacy-key" }).tmdbApiKey).toBe(
      "legacy-key",
    );
    expect(
      loadConfig({ TMDB_API: "legacy-key", TMDB_API_KEY: "current-key" })
        .tmdbApiKey,
    ).toBe("current-key");
  });
});
