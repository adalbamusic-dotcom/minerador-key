import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = await readFile(new URL("../lib/context-help.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../lib/context-help-registry.ts", import.meta.url), "utf8");
const center = await readFile(new URL("../components/context-help-center.tsx", import.meta.url), "utf8");
const topbar = await readFile(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");
const mineradorContent = await readFile(new URL("../modules/minerador/context-help.ts", import.meta.url), "utf8");

test("ajuda contextual usa identidade de rota tenantizada e escopo operacional explícito", () => {
  assert.match(contract, /parseBrandRef\(brandRef\)/);
  assert.match(contract, /const routeArea = segments\[1\] \|\| "marca"/);
  assert.match(contract, /admin.*conta.*login.*cadastro.*selecionar-marca.*agencias/);
  for (const area of ["marca", "minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"]) {
    assert.match(contract, new RegExp(`"${area}"`));
  }
  assert.match(topbar, /resolveContextHelpArea/);
  assert.match(topbar, /<ContextHelpCenter key=\{contextHelpArea \|\| "none"\} area=\{contextHelpArea\} \/>/);
});

test("contrato local cobre busca normalizada e conteúdo sem fallback", () => {
  assert.match(contract, /id: string;/);
  assert.match(contract, /title: string;/);
  assert.match(contract, /summary: string;/);
  assert.match(contract, /description: string;/);
  assert.match(contract, /keywords\?: readonly string\[\]/);
  assert.match(contract, /normalize\("NFD"\)/);
  assert.match(contract, /includes\(normalizedQuery\)/);
  assert.match(registry, /topics: EMPTY_TOPICS/);
  assert.match(center, /Ajuda desta área ainda não disponível\./);
  assert.doesNotMatch(center, /fetch\(|supabase|OpenAI|DeepSeek/);
});

test("catálogo local do Minerador cobre os fluxos autorizados", () => {
  for (const topicId of ["sobre-o-minerador", "conferir-site", "logica", "volume", "resultados", "ia", "revisao-humana"]) {
    assert.match(mineradorContent, new RegExp(`id: "${topicId}"`));
  }
  for (const topicId of [
    "descobrir-como-clientes-encontram",
    "descobrir-targeting",
    "descobrir-filtros",
    "descobrir-enviar-processador",
    "processar-kgr",
    "processar-cpc",
    "processar-kd",
    "processar-revalidacao",
    "perfil-dataforseo",
    "perfil-decisao",
    "revisao-checklist",
    "revisao-divergencias",
    "revisao-enriquecimentos",
    "revisao-concluir",
  ]) {
    assert.match(mineradorContent, new RegExp(`id: "${topicId}"`));
  }
  const topicIds = [...mineradorContent.matchAll(/id: "([^"]+)"/g)].map(match => match[1]);
  assert.ok(topicIds.length >= 30, `catálogo pequeno demais: ${topicIds.length} tópicos`);
  assert.equal(new Set(topicIds).size, topicIds.length, "IDs de ajuda duplicados");
  const summaries = [...mineradorContent.matchAll(/summary: "([^"]*)"/g)].map(match => match[1]);
  assert.equal(summaries.length, topicIds.length, "cada tópico deve ter um resumo");
  assert.ok(summaries.every(summary => summary.length <= 240), "resumos devem permanecer curtos");
  assert.match(mineradorContent, /Conferir site/);
  assert.match(mineradorContent, /Revisão Humana/);
  assert.match(mineradorContent, /TOFU — Topo do funil/);
  assert.match(mineradorContent, /MOFU — Meio do funil/);
  assert.match(mineradorContent, /BOFU — Fundo do funil/);
  assert.match(mineradorContent, /title: "Entender TOFU, MOFU e BOFU"/);
  assert.match(mineradorContent, /Indefinido não significa Pendente/);
  assert.match(mineradorContent, /Intenção e Funil são eixos relacionados, mas diferentes/);
  for (const searchAlias of ["Como clientes me encontram", "Google Ads", "DataForSEO", "KeywordDNA", "Resultado", "KGR", "KD", "Proveniência", "topo do funil", "meio do funil", "fundo do funil", "indefinido"]) {
    assert.match(mineradorContent, new RegExp(searchAlias));
  }
  assert.doesNotMatch(mineradorContent, /fetch\(|supabase|OpenAI|DeepSeek|requestId|raw payload/i);
});

test("drawer preserva interação de teclado, foco e composição sem nested button", () => {
  assert.match(center, /role="dialog" aria-modal="true"/);
  assert.match(center, /event\.key === "Escape"/);
  assert.match(center, /triggerRef\.current\?\.focus\(\)/);
  assert.match(center, /closeRef\.current\?\.focus\(\)/);
  assert.match(center, /querySelectorAll<HTMLElement>\(focusableSelector\)/);
  assert.match(center, /data-context-help-search/);
  assert.match(center, /data-context-help-topic=/);
  assert.match(center, /data-context-help-detail/);
  assert.match(center, /InfoHint/);
  assert.match(center, /createPortal\(drawerLayer, document\.body\)/);
  assert.doesNotMatch(center, /<button[^>]*>\s*<button/);
});

test("drawer usa tokens e larguras responsivas do padrão visual", () => {
  assert.match(center, /bg-surface-elevated/);
  assert.match(center, /border-divider/);
  assert.match(center, /bg-background\/45/);
  assert.match(center, /left-0 right-auto z-50 w-screen/);
  assert.match(center, /max-w-sm/);
  assert.match(center, /sm:w-96/);
  assert.match(center, /focus-visible:ring-2 focus-visible:ring-context-accent/);
});
