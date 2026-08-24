import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupDatabase, restoreDatabase, verifyBackup } from "./backup.js";
import { openDatabase } from "./database.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("database backup and restore", () => {
  it("backs up WAL data and restores it with a recovery copy", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-backup-")),
      dataDir = path.join(root, "data"),
      backup = path.join(root, "backups", "known-good.db");
    directories.push(root);
    const original = openDatabase(dataDir);
    original
      .prepare(
        "INSERT INTO media_items (id,tmdb_id,media_type,title,genres_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run("one", 1, "tv", "Before", "[]", "now", "now");
    await backupDatabase(dataDir, backup);
    verifyBackup(backup);
    original
      .prepare("UPDATE media_items SET title='After' WHERE id='one'")
      .run();
    original.close();

    const result = await restoreDatabase(dataDir, backup, true),
      restored = openDatabase(dataDir);
    expect(
      restored.prepare("SELECT title FROM media_items WHERE id='one'").get(),
    ).toEqual({ title: "Before" });
    expect(result.previousBackup).not.toBeNull();
    verifyBackup(result.previousBackup!);
    restored.close();
  });

  it("requires confirmation and rejects an invalid backup", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-backup-")),
      invalid = path.join(root, "invalid.db");
    directories.push(root);
    fs.writeFileSync(invalid, "not sqlite");
    await expect(restoreDatabase(root, invalid, false)).rejects.toThrow(
      "explicit confirmation",
    );
    await expect(restoreDatabase(root, invalid, true)).rejects.toThrow();
  });
});
