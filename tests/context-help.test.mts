import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ARQUITETO_CONTEXT_HELP } from "../modules/arquiteto/context-help.ts";
import { MARCA_CONTEXT_HELP } from "../modules/marca/context-help.ts";
import { MINERADOR_CONTEXT_HELP } from "../modules/minerador/context-help.ts";
import { PUBLICACOES_CONTEXT_HELP } from "../modules/publicacoes/context-help.ts";
import { RADAR_CONTEXT_HELP } from "../modules/radar/context-help.ts";
import { REDATOR_CONTEXT_HELP } from "../modules/redator/context-help.ts";

const contract = await readFile(new URL("../lib/context-help.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../lib/context-help-registry.ts", import.meta.url), "utf8");
const center = await readFile(new URL("../components/context-help-center.tsx", import.meta.url), "utf8");
const topbar = await readFile(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");
const mineradorContent = await readFile(new URL("../modules/minerador/context-help.ts", import.meta.url), "utf8");

test("ajuda contextual usa identidade de rota tenantizada e escopo operacional explícito", () => {
  assert.match(contract, /parseBrandRef\(brandRef\)/);
  assert.match(contract, /const routeArea = segments\[1\] \|\| "marca"/);
  assert.match(contract, /admin.*conta.*login.*cadastro.*selecionar-marca.*agencias/);
  // 2026-10-01: o Planejador foi aposentado (SDD aposentar-planejador); as seis áreas da linha editorial.
  for (const area of ["marca", "minerador", "arquiteto", "radar", "redator", "publicacoes"]) {
    assert.match(contract, new RegExp(`"${area}"`));
  }
  assert.doesNotMatch(contract, /"planejador"/);
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
  for (const topicId of ["sobre-o-minerador", "conferir-site", "logica", "volume", "resultados", "revisao-humana"]) {
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

test("catálogo local do Arquiteto explica todos os processos e botões para quem não conhece SEO (dono, 2026-09-30)", async () => {
  const arquitetoContent = await readFile(new URL("../modules/arquiteto/context-help.ts", import.meta.url), "utf8");
  assert.match(registry, /arquiteto: ARQUITETO_CONTEXT_HELP/);
  for (const topicId of [
    "sobre-o-arquiteto", "conceitos-basicos", "publicado-travado-livre", "volume-primeiro", "mesmo-assunto-no-google", "custos",
    "leitura-da-ia", "canibalizacao", "sobras", "desfazer-silo", "restaurar-keywords-no-silo", "revisao-do-artigo", "divergencia-serp", "parecer-da-serp",
    "kgr-do-artigo", "links-internos", "enviar-ao-radar",
  ]) assert.match(arquitetoContent, new RegExp(`id: "${topicId}"`));
  const topicIds = [...arquitetoContent.matchAll(/id: "([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(topicIds).size, topicIds.length, "IDs de ajuda duplicados");
  const summaries = [...arquitetoContent.matchAll(/summary: "([^"]*)"/g)].map(match => match[1]);
  assert.equal(summaries.length, topicIds.length, "cada tópico deve ter um resumo");
  assert.ok(summaries.every(summary => summary.length <= 240), "resumos devem permanecer curtos");
  // 2026-10-18: os 3 botões em sequência da barra de "Detalhes técnicos" (SDD da linha única §15.7) e os da linha.
  for (const botao of ["Processar artigos", "Concluir formação", "Melhorar publicados…", "Processar arquitetura", "Confirmar propostas novas", "Desfazer Silo", "Restaurar", "Criar artigo novo com este grupo", "Manter no artigo", "Aplicar recomendação", "Processar links", "Confirmar links internos", "Importar do Minerador", "Excluir no Minerador"]) {
    assert.ok(arquitetoContent.includes(botao), `botão sem explicação: ${botao}`);
  }
  // SUBSTITUÍDOS em 2026-10-17 (noite): o cartão "Próximo passo" e os botões numerados do painel de melhoria.
  for (const antigo of ["1 · Buscar keywords (grátis)", "2 · Coletar a SERP no DataForSEO", "3 · Gravar melhorias", "Cartão “Próximo passo”"]) {
    assert.ok(!arquitetoContent.includes(antigo), `texto antigo na ajuda: ${antigo}`);
  }
  assert.doesNotMatch(arquitetoContent, /fetch\(|supabase|OpenAI|DeepSeek|requestId|raw payload/i);
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

/* ======================================================================= */
/*   TUTORIAL DE USO NO "?" GLOBAL — dono, 2026-10-18 (AGENTS.md §0.1)     */
/* ======================================================================= */
/*
 * "escreve toda a usabilidade no ícone de informações no ícone do global, como
 * se fosse um tutorial da usabilidade em cada área ou etapa". Cada área abre a
 * ajuda com "Como funciona esta área" e um tópico por etapa da linha de
 * processo, na ordem da linha. Todo botão citado entre aspas “…” no tutorial
 * precisa existir na tela da área: o tutorial não pode ficar para trás em
 * silêncio quando um botão muda de nome ou sai. Exemplo, citação e botão de
 * OUTRA área vão entre aspas simples ‘…’ e não são conferidos aqui.
 */

const ROOT = new URL("../", import.meta.url);
const SHARED_SOURCES = [
  "components/editorial",
  "components/lifecycle",
  "components/global-topbar.tsx",
  "components/global-notice-center.tsx",
];

/** Onde a tela de cada área escreve os rótulos: o módulo, os componentes compartilhados que ele mostra e as constantes de rótulo. */
const AREA_SOURCES: Record<string, readonly string[]> = {
  marca: ["modules/marca", "app/(brand)/[brandRef]/page.tsx", ...SHARED_SOURCES],
  minerador: ["modules/minerador", "lib/arquiteto/minerador-suggestions.ts", ...SHARED_SOURCES],
  arquiteto: ["modules/arquiteto", "lib/arquiteto", ...SHARED_SOURCES],
  radar: ["modules/radar", "lib/radar", ...SHARED_SOURCES],
  redator: ["modules/redator", "components/editorial/professional-writer.tsx", ...SHARED_SOURCES],
  publicacoes: ["modules/publicacoes", "lib/publicacoes", ...SHARED_SOURCES],
};

const DEFINITIONS = {
  marca: MARCA_CONTEXT_HELP,
  minerador: MINERADOR_CONTEXT_HELP,
  arquiteto: ARQUITETO_CONTEXT_HELP,
  radar: RADAR_CONTEXT_HELP,
  redator: REDATOR_CONTEXT_HELP,
  publicacoes: PUBLICACOES_CONTEXT_HELP,
} as const;

function sourceFiles(relative: string, out: string[] = []): string[] {
  const full = new URL(relative, ROOT);
  if (statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) sourceFiles(`${relative}/${name}`, out);
  } else if (/\.(tsx?|mts)$/.test(relative) && !/context-help\.ts$/.test(relative)) {
    out.push(relative);
  }
  return out;
}

/* Sem comentários: um rótulo que só sobrevive num comentário não está na tela (memória: teste estrutural casa com o próprio comentário). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const collapse = (value: string) => value.replace(/\s+/g, " ");

function areaScreenText(area: string): string {
  return AREA_SOURCES[area].flatMap(path => sourceFiles(path)).map(file => collapse(withoutComments(readFileSync(new URL(file, ROOT), "utf8")))).join("\n");
}

type Topic = (typeof MINERADOR_CONTEXT_HELP.topics)[number];

function tutorialTopics(topics: readonly Topic[]): Topic[] {
  return topics.filter(topic => topic.id === "como-funciona" || topic.id.startsWith("etapa-"));
}

function topicText(topic: Topic): string {
  return [topic.title, topic.summary, topic.description, ...(topic.sections ?? []).flatMap(section => [section.heading, section.body]), ...(topic.howToUse ?? [])].join("\n");
}

/** Rótulos de tela citados no tutorial: o texto entre aspas curvas duplas. */
function quotedLabels(topic: Topic): string[] {
  return [...topicText(topic).matchAll(/“([^”]+)”/g)].map(match => match[1]);
}

const STEP_HEADINGS = ["Quando usar", "O que acontece", "Custo", "Quem decide", "Depois"] as const;

test("registro liga as seis áreas a um tutorial próprio, sem área vazia (dono, 2026-10-18)", () => {
  for (const [area, constant] of [["marca", "MARCA"], ["minerador", "MINERADOR"], ["arquiteto", "ARQUITETO"], ["radar", "RADAR"], ["redator", "REDATOR"], ["publicacoes", "PUBLICACOES"]] as const) {
    assert.match(registry, new RegExp(`import \\{ ${constant}_CONTEXT_HELP \\} from "@/modules/${area}/context-help"`));
    assert.match(registry, new RegExp(`${area}: ${constant}_CONTEXT_HELP`));
    assert.equal(DEFINITIONS[area].area, area);
    assert.ok(DEFINITIONS[area].topics.length > 0, `${area} sem ajuda`);
  }
});

for (const [area, definition] of Object.entries(DEFINITIONS)) {
  test(`${area}: o tutorial abre a ajuda — “Como funciona esta área” e uma etapa por passo da linha, na ordem`, () => {
    const topics = definition.topics;
    const ids = topics.map(topic => topic.id);
    assert.equal(new Set(ids).size, ids.length, `${area}: IDs de ajuda duplicados`);
    assert.equal(topics[0].id, "como-funciona", `${area}: o primeiro tópico é “Como funciona esta área”`);
    assert.equal(topics[0].title, "Como funciona esta área");
    const steps = topics.filter(topic => topic.id.startsWith("etapa-"));
    assert.ok(steps.length >= 2, `${area}: o tutorial precisa de uma etapa por passo da linha`);
    // As etapas vêm logo depois de "Como funciona", juntas, na ordem da linha (o título começa pelo número).
    assert.deepEqual(topics.slice(1, 1 + steps.length).map(topic => topic.id), steps.map(topic => topic.id), `${area}: as etapas vêm logo depois de “Como funciona”`);
    steps.forEach((step, index) => assert.ok(step.title.startsWith(`${index + 1} · `), `${area}: a etapa ${step.id} deve ser a nº ${index + 1} (“${index + 1} · …”)`));
    // "Como funciona" diz a linha de ponta a ponta: um passo para cada etapa.
    assert.equal(topics[0].howToUse?.length, steps.length, `${area}: “Como funciona” lista um passo por etapa`);
    for (const topic of [topics[0], ...steps]) {
      assert.ok(topic.summary.length > 0 && topic.summary.length <= 240, `${area}/${topic.id}: resumo curto`);
      assert.ok((topic.keywords ?? []).length > 0, `${area}/${topic.id}: palavras de busca`);
    }
    for (const step of steps) {
      const headings = (step.sections ?? []).map(section => section.heading);
      for (const heading of STEP_HEADINGS) assert.ok(headings.includes(heading), `${area}/${step.id}: falta a seção “${heading}”`);
      assert.ok((step.howToUse ?? []).length > 0, `${area}/${step.id}: falta o passo a passo (Como usar)`);
      assert.ok(quotedLabels(step).length > 0, `${area}/${step.id}: a etapa cita pelo menos um botão da tela entre aspas`);
    }
  });

  test(`${area}: todo botão citado no tutorial existe na tela da área (o tutorial não envelhece em silêncio)`, () => {
    const screen = areaScreenText(area);
    const missing: string[] = [];
    for (const topic of tutorialTopics(definition.topics)) {
      for (const label of quotedLabels(topic)) {
        if (!screen.includes(collapse(label))) missing.push(`${topic.id}: “${label}”`);
      }
    }
    assert.deepEqual(missing, [], `${area}: rótulos citados no tutorial que não existem na tela`);
  });

  test(`${area}: o tutorial fala a língua do dono, sem nome de código`, () => {
    for (const topic of tutorialTopics(definition.topics)) {
      assert.doesNotMatch(topicText(topic), /fetch\(|supabase|OpenAI|DeepSeek|requestId|decisionHash|lockVersion|payload|endpoint|\/api\/|ArticleDNA|KeywordDNA|SiloDNA|SiloPage|InternalLinkGraph|RadarApprovedPackage|ContentDocument|PublicationRecord|working copy|readback|\bMCP\b/i, `${area}/${topic.id}`);
    }
  });
}
