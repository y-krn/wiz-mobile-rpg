import { runDependencyPreflight } from "../../scripts/dependency-preflight.js";

if (!runDependencyPreflight()) process.exit(1);
