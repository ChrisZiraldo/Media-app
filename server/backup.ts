import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databaseName = "media-tracker.db";

function assertHealthyDatabase(file: string): void {
  if (!fs.existsSync(file)) throw new Error("Database file does not exist");
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = database.pragma("quick_check") as Array<{
      quick_check: string;
    }>;
    if (
      quickCheck.length !== 1 ||
      quickCheck[0]?.quick_check.toLowerCase() !== "ok"
    )
      throw new Error("SQLite integrity check failed");
    const foreignKeys = database.pragma("foreign_key_check") as unknown[];
    if (foreignKeys.length) throw new Error("SQLite foreign key check failed");
  } finally {
    database.close();
  }
}

export function verifyBackup(file: string): void {
  assertHealthyDatabase(path.resolve(file));
}

export async function backupDatabase(
  dataDir: string,
  destination: string,
): Promise<string> {
  const source = path.join(path.resolve(dataDir), databaseName),
    target = path.resolve(destination);
  if (source === target)
    throw new Error("Backup destination must be different");
  if (fs.existsSync(target))
    throw new Error("Backup destination already exists");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const database = new Database(source, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    await database.backup(target);
  } finally {
    database.close();
  }
  assertHealthyDatabase(target);
  return target;
}

export async function restoreDatabase(
  dataDir: string,
  sourceBackup: string,
  confirm: boolean,
): Promise<{ restored: string; previousBackup: string | null }> {
  if (!confirm) throw new Error("Restore requires explicit confirmation");
  const directory = path.resolve(dataDir),
    source = path.resolve(sourceBackup),
    target = path.join(directory, databaseName);
  if (source === target)
    throw new Error("Restore source must be a backup file");
  assertHealthyDatabase(source);
  fs.mkdirSync(directory, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    previousBackup = fs.existsSync(target)
      ? path.join(directory, `media-tracker.pre-restore-${stamp}.db`)
      : null;
  if (previousBackup) await backupDatabase(directory, previousBackup);

  const staged = path.join(
    directory,
    `media-tracker.restore-${process.pid}-${Date.now()}.db`,
  );
  fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL);
  try {
    assertHealthyDatabase(staged);
    const replaced = `${target}.replaced-${process.pid}`;
    if (fs.existsSync(target)) fs.renameSync(target, replaced);
    try {
      fs.renameSync(staged, target);
      if (fs.existsSync(replaced)) fs.rmSync(replaced);
    } catch (error) {
      if (fs.existsSync(replaced) && !fs.existsSync(target))
        fs.renameSync(replaced, target);
      throw error;
    }
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${target}${suffix}`;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
    }
  } finally {
    if (fs.existsSync(staged)) fs.rmSync(staged);
  }
  return { restored: target, previousBackup };
}
