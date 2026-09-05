import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const runtimeRoots = ["app", "components", "lib", "modules"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

async function collectRuntimeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectRuntimeFiles(entryPath));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

test("NEW_OPENROUTER_RUNTIME_REQUESTS = 0", async () => {
  const files = (await Promise.all(runtimeRoots.map((root) => collectRuntimeFiles(path.resolve(root))))).flat();
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  assert.equal(sources.filter((source) => /openrouter/i.test(source)).length, 0);
});
