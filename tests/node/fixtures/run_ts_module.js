import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";

const [scriptPath] = process.argv.slice(2);
if (!scriptPath) throw new Error("A TypeScript-compatible module path is required");

process.env.TSX_MODULE_RUNNER = "1";
process.argv[1] = scriptPath;
register();
await new Promise(resolve => setImmediate(resolve));
await import(pathToFileURL(scriptPath).href);
