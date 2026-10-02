import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = path.join(REPO_ROOT, "scripts/service-worker.template.txt");
const CACHE_PREFIX = "depthward-static-";
const MAX_PRECACHE_FILES = 100;
const MAX_PRECACHE_BYTES = 40 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;

function listFiles(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath, root);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    return relativePath.endsWith(".map") ? [] : [relativePath];
  });
}

function encodePath(relativePath) {
  return `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function pwaServiceWorkerPlugin() {
  let outputDirectory;

  return {
    name: "depthward-pwa-service-worker",
    apply: "build",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outputDirectory)
        .filter(file => file !== "service-worker.js")
        .sort((a, b) => {
          const priority = file => file === "index.html" ? 0 : file === "manifest.webmanifest" ? 1 : 2;
          return priority(a) - priority(b) || a.localeCompare(b);
        });
      if (!files.includes("index.html") || !files.includes("manifest.webmanifest")) {
        throw new Error("PWA shell is missing index.html or manifest.webmanifest");
      }

      const precachePaths = ["/", ...files.slice(0, MAX_PRECACHE_FILES - 1).map(encodePath)];
      let totalBytes = 0;
      const boundedPaths = precachePaths.filter((url, index) => {
        if (index === 0) return true;
        const relativePath = decodeURIComponent(url.slice(1));
        const size = statSync(path.join(outputDirectory, relativePath)).size;
        if (size > MAX_SINGLE_FILE_BYTES || totalBytes + size > MAX_PRECACHE_BYTES) return false;
        totalBytes += size;
        return true;
      });

      const digest = createHash("sha256");
      for (const url of boundedPaths) {
        const relativePath = decodeURIComponent(url.slice(1)) || "index.html";
        digest.update(url);
        digest.update(readFileSync(path.join(outputDirectory, relativePath)));
      }
      const cacheName = `${CACHE_PREFIX}${digest.digest("hex").slice(0, 16)}`;
      const template = readFileSync(TEMPLATE_PATH, "utf8");
      const serviceWorker = template
        .replaceAll("__APP_CACHE_NAME__", cacheName)
        .replace("__PRECACHE_PATHS__", JSON.stringify(JSON.stringify(boundedPaths)));
      writeFileSync(path.join(outputDirectory, "service-worker.js"), serviceWorker);
    },
  };
}
