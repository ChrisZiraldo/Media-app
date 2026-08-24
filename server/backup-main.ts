import path from "node:path";
import { backupDatabase, restoreDatabase, verifyBackup } from "./backup.js";
import { loadConfig } from "./config.js";

const [command, file, confirmation] = process.argv.slice(2);
if (!command || !file) {
  throw new Error(
    "Usage: backup-main.js backup|verify|restore <file> [--confirm]",
  );
}

const config = loadConfig();
if (command === "backup") {
  const destination = await backupDatabase(config.dataDir, file);
  process.stdout.write(`Backup created and verified: ${destination}\n`);
} else if (command === "verify") {
  verifyBackup(file);
  process.stdout.write(`Backup verified: ${path.resolve(file)}\n`);
} else if (command === "restore") {
  const result = await restoreDatabase(
    config.dataDir,
    file,
    confirmation === "--confirm",
  );
  process.stdout.write(`Database restored: ${result.restored}\n`);
  if (result.previousBackup)
    process.stdout.write(
      `Previous database preserved: ${result.previousBackup}\n`,
    );
} else {
  throw new Error("Unknown backup command");
}
