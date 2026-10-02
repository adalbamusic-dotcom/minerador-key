import assert from "node:assert/strict";
import test from "node:test";
import {
  radarBrandVoiceAbsence,
  radarBrandVoiceBySlot,
  radarBrandVoiceOwnUrls,
  radarBrandVoiceSlotOf,
  type RadarBrandVoice,
  type RadarBrandVoiceState,
} from "../lib/radar/brand-voice.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { radarPortableVideoExport } from "../lib/radar/portable-video-export.ts";
import { buildRadarArticleBlueprintBrief, radarArticleBlueprintPrompt } from "../lib/radar/article-blueprint.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, entradaGoogle, montadasDoSilo, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== A VOZ DA MARCA NOS ENTREGÁVEIS (SDD diretriz editorial, Adendo C — 2026-10-02) =====
 *
 * A Skill `brand_voice` CORRENTE da Marca (regra canônica da spec da Marca
 * §24: rascunho, aguardando aprovação ou ativa) entra na linha "Voz da marca" do
 * CSV para escrever e do CSV de vídeo, e em trechos por assunto no pedido do
 * artigo-modelo (2026-10-02; antes ia inteira), com o estado dito. Sem Skill,
 * o entregável diz por quê — e nada mais muda.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* Os títulos da Skill real da AdalbaPro, com corpos curtos. */
const SECOES: Array<[string, string]> = [
  ["1. Missão", "Conteúdo útil para clínicas locais."],
  ["2. Identidade e oferta", "Marca: AdalbaPro. Site: https://careglow.com.br/. Oferta: site, páginas de serviço e artigos."],
  ["3. Público prioritário", "Biomédicas estetas."],
  ["4. Voz: firme, humana e provocadora", "Linguagem próxima e adulta."],
  ["5. Vocabulário e estilo", "Usar Internet em vez de digital. Não usar travessão."],
  ["6. Responder diretamente à keyword", "O primeiro parágrafo responde à intenção."],
  ["7. Uso das quatro janelas da SERP", "Recorrência não é comprovação."],
  ["8. Fontes, experiência e autoridade", "Não inventar estatísticas."],
  ["9. FAQ e dados estruturados", "Sem FAQ separado."],
  ["10. Recursos antigos ou inadequados", "Não recomendar Instagram Shopping."],
  ["11. Construção do artigo e transição comercial", "Resposta direta, depois a oferta."],
  ["12. Links e conteúdo já publicado", "Página comercial: https://careglow.com.br/servicos/seo-para-clinicas. Fonte: https://developers.google.com/search/updates"],
  ["13. Plano visual", "Uma capa e dois ou três respiros."],
  ["14. Critérios antes de redigir", "Conferir coerência."],
];

const VOZ: RadarBrandVoice = {
  versionId: "voz-v1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "active", title: "AdalbaPro: voz da marca",
  sections: SECOES.map(([heading, body]) => ({ heading, body })),
  markdown: ["# AdalbaPro: voz da marca", ...SECOES.map(([heading, body]) => `## ${heading}\n\n${body}`)].join("\n\n"),
};
const ATIVA: RadarBrandVoiceState = { kind: "available", voice: VOZ };
const RASCUNHO: RadarBrandVoiceState = { kind: "available", voice: { ...VOZ, status: "draft" } };
const NENHUMA: RadarBrandVoiceState = { kind: "none" };

function lerCsv(csv: string): Array<Record<string, string>> {
  const texto = csv.replace(/^\uFEFF/, "");
  const linhas: string[][] = [];
  let campo = ""; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) { if (c === "\"" && texto[i + 1] === "\"") { campo += "\""; i += 1; } else if (c === "\"") aspas = false; else campo += c; }
    else if (c === "\"") aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; } else if (c === "\r") { /* CRLF */ } else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; } else campo += c;
  }
  const [cabecalho, ...dados] = linhas;
  return dados.map(valores => Object.fromEntries(cabecalho.map((coluna, indice) => [coluna, valores[indice] ?? ""])));
}

test("cada seção da Skill vai para o assunto do entregável; título sem assunto vai para a voz", () => {
  const esperado: Record<string, string> = {
    "1. Missão": "reader", "2. Identidade e oferta": "reader", "3. Público prioritário": "reader",
    "4. Voz: firme, humana e provocadora": "voice", "5. Vocabulário e estilo": "voice",
    "6. Responder diretamente à keyword": "title", "7. Uso das quatro janelas da SERP": "research",
    "8. Fontes, experiência e autoridade": "sources", "9. FAQ e dados estruturados": "structure",
    "10. Recursos antigos ou inadequados": "research", "11. Construção do artigo e transição comercial": "structure",
    "12. Links e conteúdo já publicado": "links", "13. Plano visual": "visual", "14. Critérios antes de redigir": "voice",
  };
  for (const [heading, slot] of Object.entries(esperado)) assert.equal(radarBrandVoiceSlotOf(heading), slot, heading);
  const por = radarBrandVoiceBySlot(VOZ);
  assert.equal(Object.values(por).reduce((soma, lista) => soma + lista.length, 0), SECOES.length, "nenhuma seção se perde");
});

test("só a URL do próprio site da marca vira destino; documentação de terceiro não", () => {
  assert.deepEqual(radarBrandVoiceOwnUrls(VOZ, "https://careglow.com.br/skincare-facial"), ["https://careglow.com.br/servicos/seo-para-clinicas"]);
  assert.deepEqual(radarBrandVoiceOwnUrls(VOZ, null), ["https://careglow.com.br/servicos/seo-para-clinicas"], "sem site no pacote, vale o 'Site:' da Skill");
});

test("CSV para escrever: Skill ativa ganha a linha 'Voz da marca' logo abaixo do topo, e cada artigo aponta para ela", () => {
  const saida = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM, brandVoice: ATIVA });
  const linhas = lerCsv(saida.files![0].csv);
  assert.deepEqual(linhas.slice(0, 2).map(item => item.ordem), ["Silo", "Voz da marca"]);
  const voz = linhas[1];
  assert.match(voz.promessa_e_leitor, /Missão:\nConteúdo útil/);
  assert.match(voz.cobrir_e_superar, /Instagram Shopping/);
  assert.match(voz.estrutura, /Sem FAQ separado/);
  assert.match(voz.links_internos, /seo-para-clinicas/);
  assert.match(voz.prompt, /Usar Internet em vez de digital/);
  assert.match(linhas[0].promessa_e_leitor, /Voz da marca: aplique a linha "Voz da marca"/);
  assert.match(linhas[0].prompt, /1\. Escreva em português do Brasil, na voz da marca da linha "Voz da marca"/);
  assert.match(linhas[2].promessa_e_leitor, /Voz da marca: copy, CTA e transição comercial seguem a linha "Voz da marca"/);
});

test("CSV para escrever: Skill em rascunho entra (regra canônica da Marca) e o estado é dito", () => {
  const saida = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM, brandVoice: RASCUNHO });
  const linhas = lerCsv(saida.csv || "");
  assert.deepEqual(linhas.slice(0, 2).map(item => item.ordem), ["Marca", "Voz da marca"]);
  assert.match(linhas[0].promessa_e_leitor, /Skill "AdalbaPro" v1 \(em rascunho na Marca\)/);
  assert.match(linhas[1].pode_escrever, /em rascunho na Marca/);
});

test("CSV para escrever: sem Skill na Marca, sem linha de voz, e o topo diz onde ela mora", () => {
  const saida = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM, brandVoice: NENHUMA });
  const linhas = lerCsv(saida.csv || "");
  assert.equal(linhas.some(item => item.ordem === "Voz da marca"), false);
  assert.match(linhas[0].promessa_e_leitor, /não há Skill de voz na Marca \(Skills e prompts\)/);
  assert.equal(/seguem a linha "Voz da marca"/.test(saida.csv || ""), false);
  assert.match(radarBrandVoiceAbsence({ kind: "unreadable", reason: "banco fora" }) || "", /não foi possível ler a Skill/);
});

test("CSV para escrever: sem informar a voz, o arquivo é o de antes", () => {
  const antes = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
  assert.equal(/Voz da marca: aplique|ordem.*Voz da marca/.test(antes.files![0].csv), false);
  assert.match(antes.files![0].csv, /Voz, tom, autor e revisor: não fazem parte deste arquivo/);
});

test("CSV de vídeo: a mesma voz, em linha própria, e o roteiro aponta para ela", () => {
  const saida = radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: null }], today: EXPORTADO_EM, brandVoice: ATIVA });
  const linhas = lerCsv(saida.csv);
  assert.deepEqual(linhas.map(item => item.ordem), ["Marca", "Voz da marca", "1"]);
  assert.match(linhas[1].tema_e_publico, /Biomédicas estetas/);
  assert.match(linhas[1].prompt, /Linguagem próxima/);
  assert.match(linhas[2].diretrizes_de_roteiro, /seguem a linha "Voz da marca"/);
  /* 2026-10-02 · na linha do vídeo, só o que serve ao vídeo: o que é do artigo é nomeado e fica de fora. */
  assert.match(linhas[1].pode_gravar, /Fica fora desta linha \(vale para o artigo, não para o vídeo\): Responder diretamente à keyword; FAQ e dados estruturados; Links e conteúdo já publicado; Plano visual\./);
  assert.equal(/Uma capa e dois ou três respiros/.test(Object.values(linhas[1]).join("\n")), false);
  assert.match(linhas[1].diretrizes_de_roteiro, /Não recomendar Instagram Shopping/);
  assert.match(linhas[2].prompt, /usando SOMENTE os dados desta linha e da linha "Voz da marca"/);
  const semVoz = lerCsv(radarPortableVideoExport({ articles: [{ entrada: entradaGoogle(), youtube: null }], today: EXPORTADO_EM, brandVoice: NENHUMA }).csv);
  assert.deepEqual(semVoz.map(item => item.ordem), ["Marca", "1"]);
  assert.match(semVoz[0].pode_gravar, /não há Skill de voz na Marca/);
});

/*
 * 2026-10-02 · o título dizia "a Skill inteira vai à IA": desde a revisão do
 * artigo-modelo, vão TRECHOS da Skill por assunto, com teto (CTA e oferta, voz
 * e vocabulário, o que não fazer, plano visual). O que o teste prova não mudou.
 */
test("artigo-modelo: trechos da Skill por assunto vão à IA, a página comercial vira candidata ao CTA e a versão fica registrada", () => {
  const silo = planoDoSilo().files[0].writing!;
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo, articleId: ARTIGO, publication: null, brandVoice: VOZ });
  assert.deepEqual(brief.brandVoice?.ref, { versionId: "voz-v1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "active" });
  const pagina = brief.linkCandidates.find(item => item.destination === "https://careglow.com.br/servicos/seo-para-clinicas");
  assert.ok(pagina, "a página comercial do próprio site é candidata");
  assert.equal(pagina!.status, "PUBLISHED");
  assert.equal(brief.linkCandidates.some(item => /developers\.google\.com/.test(item.destination || "")), false, "documentação de terceiro não é link interno");
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /12\. VOZ DA MARCA/);
  assert.match(user, /# Voz da marca — Skill "AdalbaPro" v1 \(ativa na Marca\)/);
  assert.match(user, /Não recomendar Instagram Shopping/);

  const semVoz = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo, articleId: ARTIGO, publication: null });
  assert.equal(semVoz.brandVoice, null);
  assert.equal(/# Voz da marca/.test(radarArticleBlueprintPrompt(semVoz).user), false);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
