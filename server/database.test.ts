import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("database", () => {
  it("enables foreign keys and applies migrations idempotently", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-tracker-"));
    temporaryDirectories.push(directory);
    const first = openDatabase(directory);
    expect(first.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(
      first.prepare("SELECT MAX(version) AS version FROM schema_version").get(),
    ).toEqual({ version: 4 });
    first.close();
    const second = openDatabase(directory);
    expect(
      second.prepare("SELECT COUNT(*) AS count FROM schema_version").get(),
    ).toEqual({ count: 4 });
    second.close();
  });
});
