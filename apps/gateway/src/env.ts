import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.NODE_ENV !== "test") {
  // Auto-load root .env or local .env if available outside unit tests
  for (const envPath of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env"),
  ]) {
    if (existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        break;
      } catch {
        // ignore
      }
    }
  }
}
