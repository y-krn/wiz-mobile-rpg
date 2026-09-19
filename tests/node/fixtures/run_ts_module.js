import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("A TypeScript-compatible module path is required");

process.argv[1] = scriptPath;
register();
await import(pathToFileURL(scriptPath).href);
