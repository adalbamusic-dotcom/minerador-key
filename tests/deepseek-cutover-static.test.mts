import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

/*
 * Corte de provider de IA, leitura estática.
 *
 * 2026-08: a DeepSeek virou a IA canônica e a OpenRouter saiu do runtime.
 * 2026-10-11: decisão do dono, a OpenRouter volta como IA canônica e a DeepSeek
 * fica só como reserva de rollback. Este teste guarda o desenho novo:
 * uma porta de saída por provider, nenhuma rota chamando provider por fora da
 * camada compartilhada e nenhuma chave indo para o navegador.
 */

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

async function runtimeSources() {
  const files = (await Promise.all(runtimeRoots.map((root) => collectRuntimeFiles(path.resolve(root))))).flat();
  return Promise.all(files.map(async (file) => ({ file: path.relative(process.cwd(), file).replaceAll("\\", "/"), source: await readFile(file, "utf8") })));
}

test("o host da OpenRouter só aparece na configuração do modelo", async () => {
  const sources = await runtimeSources();
  const hosts = sources.filter(({ source }) => /openrouter\.ai/i.test(source)).map(({ file }) => file);
  assert.deepEqual(hosts, ["lib/openrouter-model-config.ts"]);
});

test("o host da DeepSeek só aparece na configuração da reserva", async () => {
  const sources = await runtimeSources();
  const hosts = sources.filter(({ source }) => /api\.deepseek\.com/i.test(source)).map(({ file }) => file);
  assert.deepEqual(hosts, ["lib/deepseek-model-config.ts"]);
});

test("as chamadas de chat saem só da camada compartilhada de IA", async () => {
  const sources = await runtimeSources();
  const callers = sources
    .filter(({ source }) => /\brequestOpenRouterChatCompletion\(|\brequestDeepSeekChatCompletion\(/.test(source))
    .map(({ file }) => file)
    .sort();
  assert.deepEqual(callers, ["lib/server/deepseek-provider.ts", "lib/server/openrouter-provider.ts", "lib/server/structured-ai.ts"]);
});

test("a chave da OpenRouter é lida só no servidor e nunca como variável pública", async () => {
  const sources = await runtimeSources();
  assert.equal(sources.some(({ source }) => /NEXT_PUBLIC_OPENROUTER/i.test(source)), false);
  const envReaders = sources.filter(({ source }) => /\.OPENROUTER_API_KEY\b/.test(source)).map(({ file }) => file).sort();
  assert.deepEqual(envReaders, ["lib/server/deepseek-canonical.ts", "lib/server/platform-integrations-admin.ts", "lib/server/platform-integrations-health.ts"]);
  for (const file of envReaders) {
    const source = sources.find((item) => item.file === file)?.source || "";
    assert.match(source, /^import "server-only";/m, `${file} precisa ser server-only`);
  }
});

test("o runtime aponta a capability de IA para a OpenRouter nos dois mapas", async () => {
  const runtime = await readFile(path.resolve("lib/server/integrations-runtime.ts"), "utf8");
  const requirements = runtime.slice(runtime.indexOf("INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS"), runtime.indexOf("INTEGRATION_RESOURCE_BY_OPERATION"));
  const byOperation = runtime.slice(runtime.indexOf("INTEGRATION_RESOURCE_BY_OPERATION"), runtime.indexOf("function resourceProviderForOperation"));
  assert.match(requirements, /\bai_generation: "openrouter"/);
  assert.match(byOperation, /\bai_generation: "openrouter"/);
  assert.doesNotMatch(requirements + byOperation, /\bai_generation: "deepseek"/);
});
