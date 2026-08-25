import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  fs.readFileSync(path.resolve("deploy", name), "utf8");

describe("deployment assets", () => {
  it("hardens and restarts the loopback service", () => {
    const unit = read("media-app.service");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("ProtectSystem=strict");
    expect(unit).toContain(
      "ReadWritePaths=/home/hermes/.local/share/media-app",
    );
    expect(unit).toContain("dist/server/main.js");
  });

  it("builds browser assets for the mounted Tailnet /media path", () => {
    const viteConfig = fs.readFileSync(path.resolve("vite.config.ts"), "utf8");
    expect(viteConfig).toContain('base: "/media/"');
  });

  it("checks service, local health, and optional Tailnet health silently", () => {
    const watchdog = read("media-app-watchdog.sh");
    expect(watchdog).toContain("systemctl --user is-active --quiet");
    expect(watchdog).toContain("http://127.0.0.1:3460/health");
    expect(watchdog).toContain("MEDIA_APP_TAILNET_HEALTH_URL");
    expect(watchdog).toContain(">/dev/null");
  });
});
