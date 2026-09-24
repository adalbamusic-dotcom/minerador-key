import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * Fechamento da F1b (estruturais): operação keyword_research no painel Admin,
 * "Buscar sustentação" na Revisão Humana, ajuda do modo Por Assunto e o nome
 * acessível do "Limpar seleção" da Descoberta. Só leitura de arquivo, sem rede.
 * Comentários são removidos antes de casar: um teste estrutural não pode casar
 * com o próprio comentário do código.
 */

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const panel = stripComments(read("modules/admin/platform-integrations-panel.tsx"));
const runtime = stripComments(read("lib/server/integrations-runtime.ts"));
const dnaPanels = stripComments(read("components/editorial/dna-panels.tsx"));
const workspace = stripComments(read("modules/minerador/minerador-workspace.tsx"));
const help = read("modules/minerador/context-help.ts");
const discoveryTable = stripComments(read("modules/minerador/discovery/discovery-table-placeholder.tsx"));
const subjectResults = stripComments(read("modules/minerador/discovery/subject-search-results.tsx"));

function listFrom(source: string, pattern: RegExp): string[] {
  const block = source.match(pattern)?.[1] ?? "";
  return [...block.matchAll(/"([a-z_]+)"/g)].map(match => match[1]);
}

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} não encontrado`);
  const next = source.indexOf("\nfunction ", start + signature.length);
  const nextExport = source.indexOf("\nexport function ", start + signature.length);
  const ends = [next, nextExport].filter(index => index > start);
  return source.slice(start, ends.length ? Math.min(...ends) : undefined);
}

test("painel Admin lista keyword_research entre as operações de capability, como serp_compatibility e allintitle", () => {
  const operations = listFrom(panel, /const capabilityOperations = \[([^\]]*)\] as const;/);
  assert.ok(operations.includes("keyword_research"));
  assert.ok(operations.includes("serp_compatibility"));
  assert.ok(operations.includes("allintitle"));
  assert.equal(new Set(operations).size, operations.length, "operação repetida no painel");
  const runtimeOperations = listFrom(runtime, /INTEGRATION_CAPABILITY_OPERATIONS = \[([\s\S]*?)\] as const;/);
  assert.ok(runtimeOperations.length > 0);
  assert.deepEqual([...operations].sort(), [...runtimeOperations].sort(), "o painel oferece exatamente as operações que o runtime aceita");
  assert.equal(operations[0], "ai_generation", "o padrão do formulário não mudou");
  assert.match(panel, /capabilityOperations\.map\(\(operation\) => <option key=\{operation\} value=\{operation\}>/);
});

test("Revisão Humana mostra Buscar sustentação no Vínculo só com o Assunto declarado e um caminho recebido", () => {
  const review = functionBody(dnaPanels, "function HumanReviewPanel(");
  const vinculoStart = review.indexOf('aria-label="Vínculo da keyword"');
  assert.ok(vinculoStart >= 0);
  const vinculoEnd = review.indexOf("</section>", vinculoStart);
  const vinculo = review.slice(vinculoStart, vinculoEnd);
  assert.match(vinculo, /\{vinculo\.subjectLabel && onSubjectSearch \? \(/);
  assert.match(vinculo, /data-review-subject-search-link/);
  assert.match(vinculo, /onClick=\{onSubjectSearch\}/);
  assert.match(vinculo, /Buscar sustentação/);
  assert.match(vinculo, /type="button"/);
  assert.match(review, /onSubjectSearch\?: \(\) => void;/);
  assert.doesNotMatch(review, /router\.push|window\.location|href=|subjectSearchLinkHref|modo=assunto/, "o painel compartilhado não monta rota");
  const button = vinculo.slice(vinculo.indexOf("data-review-subject-search-link"), vinculo.indexOf("Buscar sustentação"));
  assert.match(button, /text-sm/);
  assert.match(button, /min-h-9/);
  assert.doesNotMatch(button, /text-\[(?:9|10|11|12|13)px\]|text-xs|#[0-9a-f]{3,6}|rgb\(/i);
});

test("KeywordDnaPanel só repassa onSubjectSearch; o workspace usa o mesmo link da linha do Processador", () => {
  const dna = functionBody(dnaPanels, "export function KeywordDnaPanel(");
  assert.match(dna, /\n  onSubjectSearch,\n|\r\n  onSubjectSearch,\r\n/);
  assert.match(dna, /onSubjectSearch\?: \(\) => void;/);
  assert.match(dna, /<HumanReviewPanel[\s\S]*?onSubjectSearch=\{onSubjectSearch\}[\s\S]*?\/>/);

  const rowLink = "router.push(subjectSearchLinkHref(brandRef, item.id))";
  const uses = workspace.split(rowLink).length - 1;
  assert.equal(uses, 2, "a linha e a Revisão usam o mesmo caminho");
  assert.match(workspace, /<KeywordDnaPanel[\s\S]*?onSubjectSearch=\{item\.id \? \(\) => router\.push\(subjectSearchLinkHref\(brandRef, item\.id\)\) : undefined\}/);
  assert.match(workspace, /data-subject-search-link[\s\S]{0,80}onClick=\{\(\) => router\.push\(subjectSearchLinkHref\(brandRef, item\.id\)\)\}/);
});

test("ajuda do modo Por Assunto explica fontes, custo antes, lista no navegador e a regra de não fabricar termos", () => {
  const start = help.indexOf('id: "descobrir-por-assunto"');
  assert.ok(start >= 0, "tópico descobrir-por-assunto ausente");
  const end = help.indexOf("\n  },", start);
  const topic = help.slice(start, end);
  assert.match(topic, /O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos\./);
  assert.match(topic, /Por Assunto/);
  assert.match(topic, /Google Ads/);
  assert.match(topic, /DataForSEO Labs/);
  assert.match(topic, /custo/i);
  assert.match(topic, /antes/);
  assert.match(topic, /neste navegador/);
  assert.match(topic, /Só vai ao banco quando você envia as selecionadas ao Processador/);
  assert.match(topic, /Buscar sustentação/);
  const summary = topic.match(/summary: "([^"]*)"/)?.[1] ?? "";
  assert.ok(summary.length > 0 && summary.length <= 240, "resumo curto");
  assert.doesNotMatch(topic, /fetch\(|supabase|OpenAI|DeepSeek|Serper|RapidAPI/i);
});

test("Limpar seleção da Descoberta tem nome acessível abaixo de xl, igual ao da Pesquisa por Assunto", () => {
  const clearButton = (source: string, marker: string) => {
    const start = source.lastIndexOf("<button", source.indexOf(marker));
    return source.slice(start, source.indexOf("</button>", start));
  };
  const discovery = clearButton(discoveryTable, "data-discovery-bulk-clear");
  assert.ok(discovery.length > 0);
  assert.match(discovery, /aria-label="Limpar seleção"/);
  assert.match(discovery, /title="Limpar seleção"/);
  assert.match(discovery, /<span className="hidden xl:inline">Limpar seleção<\/span>/);
  assert.match(discovery, /<X className="h-3\.5 w-3\.5" aria-hidden="true" \/>/);
  const subject = clearButton(subjectResults, "<span className=\"hidden xl:inline\">Limpar seleção</span>");
  assert.ok(subject.length > 0);
  assert.match(subject, /aria-label="Limpar seleção"/);
});
