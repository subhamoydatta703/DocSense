import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";
// Host-provided environment variables take precedence over a local .env file.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), override: false, quiet: true });
