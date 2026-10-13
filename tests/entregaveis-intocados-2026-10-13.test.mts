import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import test from "node:test";

/*
 * ===== 2026-10-13 · E0 · RETRATO BYTE A BYTE DOS ENTREGÁVEIS =====
 *
 * NENHUMA FASE DA SDD DE ACELERAÇÃO PODE ATUALIZAR ESTES HASHES; MUDAR
 * ENTREGÁVEL EXIGE DECISÃO DO DONO.
 *
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md` §2.3 (E0).
 * Pedido literal do dono: "sobre os entregáveis não muda nem apaga nada das
 * últimas arrumações que fizemos". Este teste é a prova: gera cada entregável
 * protegido (§2.1) sobre fixtures fixas e relógio fixo, e trava o SHA-256 e o
 * tamanho em bytes (UTF-8) de cada saída na tabela `RETRATO` abaixo.
 *
 *   · CSV "Para escrever" (completo, em partes como o MCP corta, por Silo) e
 *     CSV de vídeo (`lib/radar/portable-writing-*.ts`, `portable-video-export.ts`);
 *   · artigo-modelo: o pedido (brief, system e user, com a diretriz de voz
 *     humana dentro) e a planta congelada pela conferência real (JSON canônico);
 *   · diretriz de voz humana (`human-voice-guideline.ts`), inteira;
 *   · âncoras naturais (`natural-anchor*.ts`) sobre uma tabela fixa;
 *   · identidade de publicação (`publication-identity.ts`) e
 *     `resolveRadarPublication` nos três estados (novo, publicado, atualização);
 *   · `get_article_for_writing` e `get_video_material`: o material pela mesma
 *     decisão pura (`radarMcpMaterialOf`) e, ponta a ponta, pela montagem real
 *     (`radarMcpMaterialForArticle`) sobre o PostgREST simulado da bancada do
 *     export; a resposta da ferramenta parte a parte;
 *   · o que o Redator recebe: o documento do envio (`buildRadarDocument`), os
 *     fundamentos (`radarFoundationsOf`) e o núcleo de `get_writer_brief`
 *     (`writerBriefFromRow` + `mcpWithArticleBlueprintState`).
 *
 * Cenários: artigo sem grupo e sem Assunto; com grupo e promessa declarada
 * (plano do Silo e grupo manual); com Assunto no formato antigo
 * (`ArticleDNA.subject`, lido pelo contexto de pesquisa); Pilar e Suporte
 * (Google, Amazon e YouTube); com e sem links internos; publicado sem política.
 *
 * As respostas das ferramentas MCP são montadas aqui como o handler monta (o
 * handler não é exportado); por isso o texto dos handlers também é travado
 * (seção "fonte", sem comentários e com espaços colapsados).
 *
 * Como uma fase prova que não mexeu: `npm run test:radar` verde com este
 * arquivo intocado, e `git diff --stat <base da fase> -- <lista do §2.1> tests/entregaveis-intocados-2026-10-13.test.mts`
 * vazio. Se um hash mudar, a falha lista cada entrada que mudou com o valor
 * novo; a tabela NÃO é atualizada pela fase — a decisão é do dono.
 *
 * Determinismo: relógio fixo (Date e Date.now) durante a montagem inteira,
 * `exportedAt`/`today`/`now` injetados, rede proibida (PROVIDER_CALLS = 0) e
 * nenhuma IA (a planta é a resposta da bancada passando pela conferência real).
 * Nada de banco: o PostgREST é simulado em memória. O retrato é tirado duas
 * vezes e as duas tiradas precisam ser idênticas.
 */

/* ============================ relógio fixo ============================ */

const AGORA = "2026-09-23T12:00:00.000Z";
const DataReal = Date;
class DataFixa extends DataReal {
  constructor(...argumentos: unknown[]) {
    if (argumentos.length === 0) super(AGORA);
    else super(...(argumentos as [string]));
  }
  static now() { return new DataReal(AGORA).getTime(); }
}
(globalThis as { Date: DateConstructor }).Date = DataFixa as unknown as DateConstructor;

/* ============================ ambiente sem rede (bancada do export) ============================ */

const { HOST_DO_BANCO, ARTIGO: ARTIGO_DO_BANCO, MARCA: MARCA_DO_BANCO, instalarPostgrestSimulado, semearBanco } = await import("./radar-export-leitura-fixtures.mts");
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://${HOST_DO_BANCO}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste-sem-rede";

const flagsDoProcesso = [...process.execArgv, String(process.env.NODE_OPTIONS || "")].join(" ");
if (!flagsDoProcesso.includes("integrations-runtime-loader")) {
  register("./integrations-runtime-loader.mjs", import.meta.url);
}
const STUBS: Record<string, string> = {
  "@/lib/server/authz": [
    "export class AuthzError extends Error { constructor(status, message) { super(message); this.status = status; } }",
    "export function authzErrorResponse(error) { return { status: (error && error.status) || 500, message: String((error && error.message) || error) }; }",
    "export async function requireCanonicalSessionProfile() { throw new Error('sessão não usada neste retrato'); }",
  ].join("\n"),
  "@/lib/server/editorial-authorization": "export async function assertEditorialPermission() {}",
};
const HOOKS = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(specifier, context, next) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]), shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
}
`;
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url);

type Banco = ReturnType<typeof semearBanco>;
let banco: Banco = semearBanco();
const { foraDoBanco } = instalarPostgrestSimulado(() => banco);

/* ============================ os módulos (depois do relógio e da rede) ============================ */

const F = await import("./radar-portable-writing-fixtures.mts");
const { plantaDe, comPlantas } = await import("./radar-piloto-planta-fixtures-2026-10-09.mts");
const { comArtigosModeloConcluidos } = await import("./radar-piloto-artigo-modelo-fixtures-2026-10-09.mts");
const { radarPortableWritingExport } = await import("../lib/radar/portable-writing-batch.ts");
const { radarPortableVideoExport } = await import("../lib/radar/portable-video-export.ts");
const { buildRadarArticleBlueprintBrief, radarArticleBlueprintPrompt } = await import("../lib/radar/article-blueprint.ts");
const voz = await import("../lib/radar/human-voice-guideline.ts");
const ancora = await import("../lib/radar/natural-anchor.ts");
const regraDaAncora = await import("../lib/radar/natural-anchor-rule.ts");
const identidade = await import("../lib/radar/publication-identity.ts");
const { resolveRadarPublication } = await import("../lib/radar/editorial-identity.ts");
const { sliceWritingCsv } = await import("../lib/agent/platform-tool-projections.ts");
const { mcpArticleBlueprintStateOf, mcpWithArticleBlueprintState } = await import("../lib/agent/mcp-article-blueprint.ts");
const { radarMcpMaterialOf, radarMcpMaterialForArticle } = await import("../lib/server/radar-mcp-material.ts");
const { createCanonicalServiceClient } = await import("../lib/server/canonical-authorization.ts");
const { buildRadarDocument, radarDocumentId } = await import("../lib/redator/radar-import.ts");
const { radarFoundationsOf } = await import("../lib/redator/radar-foundations.ts");
const { WRITER_BRIEF_SELECT, writerBriefFromRow } = await import("../lib/redator/writer-document-reads.ts");
const { WRITER_EVIDENCE_GUARDS } = await import("../lib/redator/writer-evidence-catalog.ts");
const { editorialGroupLabelOf } = await import("../lib/editorial/editorial-group-scope.ts");

type Entrada = ReturnType<typeof F.entradaGoogle>;
type Planta = ReturnType<typeof plantaDe>;
type Contexto = ReturnType<typeof F.contextoDePesquisa>;
type Grupo = ReturnType<typeof editorialGroupLabelOf>;
type Publicacao = typeof F.PUBLICACAO_SEM_POLITICA;
type Material = ReturnType<typeof radarMcpMaterialOf>;

/* ============================ o retrato ============================ */

type Foto = { sha256: string; bytes: number };
type Retrato = Record<string, Foto>;

/** JSON canônico: chaves ordenadas, Map e Set como objeto e lista, `undefined` fora. */
function canonico(valor: unknown): string {
  if (valor instanceof Map) return canonico(Object.fromEntries([...valor.entries()].map(([chave, item]) => [String(chave), item])));
  if (valor instanceof Set) return canonico([...valor]);
  if (valor === null || valor === undefined || typeof valor === "function") return "null";
  if (typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const registro = valor as Record<string, unknown>;
  return `{${Object.keys(registro).filter(chave => registro[chave] !== undefined).sort()
    .map(chave => `${JSON.stringify(chave)}:${canonico(registro[chave])}`).join(",")}}`;
}

const foto = (texto: string): Foto => ({ sha256: createHash("sha256").update(texto, "utf8").digest("hex"), bytes: Buffer.byteLength(texto, "utf8") });

/* As palavras do comentário não contam: o texto do handler sem comentários, com espaços colapsados. */
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\s+/g, " ").trim();
const fonte = (arquivo: string) => readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");
function trecho(arquivo: string, de: string, ate: string, incluirAte = false): string {
  const texto = fonte(arquivo);
  const inicio = texto.indexOf(de);
  assert.ok(inicio >= 0, `${arquivo}: âncora "${de}" não encontrada`);
  const fim = texto.indexOf(ate, inicio + de.length);
  assert.ok(fim > inicio, `${arquivo}: âncora "${ate}" não encontrada depois de "${de}"`);
  return semComentarios(texto.slice(inicio, incluirAte ? fim + ate.length : fim));
}

/* O teto de cada parte do CSV no MCP (`WRITING_CSV_PART_CHARS` de platform-mcp-tools.ts, travado na seção "fonte"). */
const PARTE = 12_000;

/* ============================ fixtures dos cenários ============================ */

const ATOR = "d2e3f4a5-b6c7-4d8e-9f0a-000000000999";
const PROMESSA_DO_PLANO = "Explicar o que comparar antes de montar a rotina: ordem, textura, frequência e o que evitar.";
const PROMESSA_MANUAL = "Mostrar como montar uma rotina simples que caiba na manhã.";
const GRUPO_DO_PLANO = editorialGroupLabelOf({ id: "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d", color: "laranja", name: "Rotina e cuidados", origin: "declared_plan" });
const GRUPO_MANUAL = editorialGroupLabelOf({ id: "22222222-3333-4444-8555-666666666666", color: "azul", name: "Azul", origin: "manual" });

type Assunto = { phrase: string; note: string | null; destinationUrl: string | null };
const CONSULTA: Assunto = { phrase: "Consulta dermatológica online", note: "A marca atende por teleconsulta.", destinationUrl: "https://careglow.com.br/consulta-online" };

const contextoCom = (assunto: Assunto): Contexto => {
  const base = F.contextoDePesquisa();
  return { ...base, article: { ...base.article, subject: { ...assunto } } } as Contexto;
};
function entradaComAssunto(assunto: Assunto): Entrada {
  const contexto = contextoCom(assunto);
  const vista = F.vistaDoGoogleSobre(contexto);
  return F.entradaGoogle({ articleModel: vista.articleModel, googleObserved: vista.observed, researchContext: contexto });
}
/* O Assunto como o ArticleDNA o guarda (formato antigo, `ArticleDNA.subject`). */
const assuntoDoDna = (assunto: Assunto) => ({
  keywordId: "kw-assunto",
  approvedPackageRef: { version: 3, contentHash: `sha256:${"p".repeat(64)}`, approvedAt: "2026-09-24T10:00:00+00:00" },
  ...assunto,
  attachedBy: ATOR,
  attachedAt: "2026-09-24T12:00:00+00:00",
});

type Cenario = {
  nome: string;
  articleId: string;
  entrada: Entrada;
  /** Contexto de escrita do Silo da seleção (o que a rota e o MCP montam com `selectionSiloContext`). */
  noSilo: boolean;
  publicacao?: Publicacao | null;
  semLinks?: boolean;
  grupo?: Grupo | null;
  /** O perfil YouTube primário não pede planta no modo "Para escrever". */
  semPlanta?: boolean;
};

function cenarios(): Cenario[] {
  const base = F.entradaGoogle();
  return [
    { nome: "pilar-avulso-sem-grupo-sem-assunto-sem-links", articleId: F.ARTIGO, entrada: F.entradaGoogle(), noSilo: false, semLinks: true },
    { nome: "pilar-no-silo-com-links", articleId: F.ARTIGO, entrada: F.entradaGoogle(), noSilo: true },
    { nome: "pilar-grupo-do-plano-com-promessa-declarada", articleId: F.ARTIGO, entrada: F.entradaGoogle({ article: { ...base.article, promise: PROMESSA_DO_PLANO } }), noSilo: true, grupo: GRUPO_DO_PLANO },
    { nome: "pilar-grupo-manual-com-promessa-declarada", articleId: F.ARTIGO, entrada: F.entradaGoogle({ article: { ...base.article, promise: PROMESSA_MANUAL } }), noSilo: false, grupo: GRUPO_MANUAL },
    { nome: "pilar-com-assunto-formato-antigo", articleId: F.ARTIGO, entrada: entradaComAssunto(CONSULTA), noSilo: false },
    { nome: "pilar-publicado-sem-politica", articleId: F.ARTIGO, entrada: F.entradaGoogleSaude(), noSilo: false, publicacao: F.PUBLICACAO_SEM_POLITICA },
    { nome: "suporte-amazon-no-silo-com-links", articleId: F.ARTIGO_AMAZON, entrada: F.entradaAmazon(true), noSilo: true },
    { nome: "suporte-amazon-avulso-sem-links", articleId: F.ARTIGO_AMAZON, entrada: F.entradaAmazon(true), noSilo: false, semLinks: true },
    { nome: "suporte-youtube-no-silo", articleId: F.ARTIGO_YOUTUBE, entrada: F.entradaYoutube(), noSilo: true, semPlanta: true },
  ];
}

/* ============================ as respostas das ferramentas, como o handler monta ============================ */

function respostaParaEscrever(articleId: string, material: Material) {
  if (material.status !== "ready") return [material];
  const grupo = material.group ? { color: material.group.color, colorLabel: material.group.colorLabel, name: material.group.name, text: material.group.text } : null;
  const primeira = sliceWritingCsv(material.csv, 1, PARTE);
  return Array.from({ length: primeira.parts }, (_, indice) => ({
    articleId, filename: material.filename, canWrite: material.blocked === 0, exportedAt: material.exportedAt, group: grupo,
    ...sliceWritingCsv(material.csv, indice + 1, PARTE),
  }));
}

function respostaDoVideo(articleId: string, material: Material) {
  if (material.status !== "ready") return [material];
  const primeira = sliceWritingCsv(material.csv, 1, PARTE);
  return Array.from({ length: primeira.parts }, (_, indice) => ({
    articleId, filename: material.filename, withoutYoutube: material.withoutYoutube > 0, exportedAt: material.exportedAt,
    ...sliceWritingCsv(material.csv, indice + 1, PARTE),
  }));
}

/* ============================ o Redator ============================ */

const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: F.HASH_DO_DNA });

function documentoDoEnvio(contexto: Contexto, planta: Planta | null, assunto: Assunto | null) {
  const autoridades = { google: F.vistaDoGoogleSobre(contexto), video: null, specialist: null, researchContext: contexto };
  const dossie = {
    analysis: { versionId: "analise-v5", versionNumber: 5, payload: { articleId: F.ARTIGO } },
    article: { brandId: F.MARCA, articleId: F.ARTIGO, articleDnaVersionId: F.VERSAO, articleDnaContentHash: F.HASH_DO_DNA },
    profile: "GOOGLE", blueprintView: {}, bundle: F.DOSSIE, authorities: autoridades,
    keywordContext: { principal: "skincare facial", secondary: ["skin care noturno"], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
    readiness: F.PRONTO,
  };
  return buildRadarDocument({
    documentId: radarDocumentId(F.MARCA, F.ARTIGO), dossier: dossie, radarItemId: `radar:${F.ARTIGO}`,
    title: "Skincare facial passo a passo", slug: "skincare-facial",
    brandDnaRef: ref("brand-dna-careglow", "brand-dna-v1"), siloDnaRef: ref(F.SILO, "c1d2e3f4-a5b6-4c7d-8e9f-000000000003"),
    keywordDnaRefs: [ref(F.KEYWORD, "kwdna-v1"), ref(F.KEYWORD_SECUNDARIA, "kwdna-v1")],
    actorUserId: ATOR, now: AGORA,
    ...(assunto ? { subject: assuntoDoDna(assunto) } : {}),
    ...(planta ? { articleBlueprint: planta.blueprint } : {}),
  } as never);
}

/* A linha que o PostgREST devolve para `WRITER_BRIEF_SELECT` (mesma projeção da bancada do export). */
function linhaDoBriefing(documento: ReturnType<typeof buildRadarDocument>): Record<string, unknown> {
  const linha: Record<string, unknown> = { id: documento.id, marca_id: F.MARCA, content_hash: "sha256:documento-do-retrato", payload: documento };
  const saida: Record<string, unknown> = {};
  for (const item of WRITER_BRIEF_SELECT.split(",")) {
    const [apelido, expressao] = item.includes(":") ? item.split(":") : [item, item];
    const partes = expressao.split(/->>?/);
    let atual: unknown = linha[partes[0]];
    for (const chave of partes.slice(1)) atual = atual && typeof atual === "object" && !Array.isArray(atual) ? (atual as Record<string, unknown>)[chave] : undefined;
    saida[apelido] = atual === undefined ? null : structuredClone(atual);
  }
  return saida;
}

/* O núcleo de `get_writer_brief` (app/api/mcp/redator/route.ts), com o estado da planta dado. */
function respostaDoBriefing(documento: ReturnType<typeof buildRadarDocument>, estado: ReturnType<typeof mcpArticleBlueprintStateOf>) {
  const linha = linhaDoBriefing(documento);
  const brief = writerBriefFromRow(linha as never);
  assert.ok(brief, "o documento do envio abre no briefing");
  const dossier = brief.dossier;
  const linhasDoAssunto = brief.editorialContext;
  return mcpWithArticleBlueprintState({
    documentId: documento.id, documentHash: linha.content_hash,
    articleDnaRef: brief.fields.articleDnaRef, keywordDnaRefs: brief.fields.keywordDnaRefs, siloDnaRef: brief.fields.siloDnaRef,
    instructions: brief.fields.instructions,
    ...(linhasDoAssunto.length ? { editorialContext: [...linhasDoAssunto] } : {}),
    linkMap: brief.fields.linkMap,
    sourceIds: brief.fields.sourceIds, evidenceRefs: brief.fields.evidenceRefs,
    radarOrigin: brief.schemaVersion === 2 ? brief.fields.radarOrigin ?? null : null,
    dossier: dossier ? {
      bundleId: dossier.bundleId, bundleHash: dossier.bundleHash, researchProfile: dossier.researchProfile,
      keywordContext: dossier.keywordContext, writerMayNot: dossier.writerMayNot,
      bundle: "not_included",
      read: { manifest: "get_writer_evidence_manifest", foundations: "get_writer_foundations", slices: "read_writer_evidence" },
    } : null,
    pendingDecisions: brief.pendingDecisions,
    guards: WRITER_EVIDENCE_GUARDS,
    warning: brief.schemaVersion === 2 && !dossier ? "Dossiê ausente nesta versão; não inferir evidências." : null,
  }, estado);
}

/* ============================ a tirada ============================ */

type Cobertura = Record<string, { links: number; csv: string }>;

async function tirarRetrato(): Promise<{ retrato: Retrato; cobertura: Cobertura }> {
  const retrato: Retrato = {};
  const cobertura: Cobertura = {};
  const fixar = (nome: string, texto: string) => {
    assert.equal(nome in retrato, false, `entrada repetida: ${nome}`);
    retrato[nome] = foto(texto);
  };
  const plano = F.planoDoSilo();
  const escritaDoSilo = plano.files[0].writing;

  /* ---------------- por cenário: artigo-modelo, CSVs e MCP ---------------- */
  const plantas = new Map<string, Planta | null>();
  for (const cenario of cenarios()) {
    const silo = cenario.noSilo ? escritaDoSilo ?? null : null;
    const publicacao = cenario.publicacao ?? null;
    let planta: Planta | null = null;
    if (!cenario.semPlanta) {
      const brief = buildRadarArticleBlueprintBrief({ entrada: cenario.entrada, silo, articleId: cenario.articleId, publication: publicacao });
      const pedido = radarArticleBlueprintPrompt(brief);
      fixar(`${cenario.nome}/artigo-modelo.brief`, canonico(brief));
      fixar(`${cenario.nome}/artigo-modelo.pedido.system`, pedido.system);
      fixar(`${cenario.nome}/artigo-modelo.pedido.user`, pedido.user);
      planta = plantaDe(cenario.entrada, { silo, articleId: cenario.articleId, publication: publicacao, semLinks: cenario.semLinks });
      fixar(`${cenario.nome}/artigo-modelo.planta-congelada`, canonico(planta));
    }
    plantas.set(cenario.nome, planta);

    const montada = {
      articleId: cenario.articleId, entrada: cenario.entrada,
      lentes: cenario.articleId === F.ARTIGO ? F.KEYWORDS_DAS_LENTES : [],
      ...(planta ? { blueprint: planta } : {}),
    };
    const publicacoes = new Map(publicacao ? [[cenario.articleId, publicacao]] : []);
    const grupos = new Map(cenario.grupo ? [[cenario.articleId, cenario.grupo]] : []);
    const planoDaSelecao = cenario.noSilo ? plano : null;

    const escrita = radarPortableWritingExport({
      articles: [montada as never], lenses: F.LEITURA_DAS_LENTES, plan: null, selectionPlan: planoDaSelecao,
      publications: publicacoes, today: F.EXPORTADO_EM, brandVoice: { kind: "none" },
      ...(grupos.size ? { groups: grupos } : {}),
    });
    assert.ok(escrita.csv, `${cenario.nome}: o CSV "Para escrever" sai`);
    fixar(`${cenario.nome}/csv-para-escrever`, escrita.csv!);
    fixar(`${cenario.nome}/csv-para-escrever.meta`, canonico({ filename: escrita.filename, blocked: escrita.blocked }));

    const video = radarPortableVideoExport({
      articles: [{ articleId: cenario.articleId, entrada: cenario.entrada, blueprint: planta }],
      today: F.EXPORTADO_EM, brandVoice: { kind: "none" }, selectionPlan: planoDaSelecao, publications: publicacoes,
    });
    fixar(`${cenario.nome}/csv-video`, canonico(video));

    const montagem = {
      exportedAt: F.EXPORTADO_EM, montadas: [montada] as never, recusados: [], publicacoes,
      lentes: F.LEITURA_DAS_LENTES, plano: null, planoDaSelecao, brandVoice: { kind: "none" } as const,
      ...(grupos.size ? { grupos } : {}),
    };
    const paraEscrever = radarMcpMaterialOf("writing", montagem as never);
    assert.equal(paraEscrever.status, "ready", `${cenario.nome}: get_article_for_writing pronto`);
    if (paraEscrever.status === "ready") assert.equal(paraEscrever.csv, escrita.csv, `${cenario.nome}: o MCP entrega o mesmo CSV da tela`);
    const partes = respostaParaEscrever(cenario.articleId, paraEscrever);
    assert.equal(partes.map(parte => (parte as { csv: string }).csv).join(""), escrita.csv, `${cenario.nome}: as partes juntas voltam ao CSV`);
    fixar(`${cenario.nome}/mcp.get_article_for_writing`, canonico(partes));
    fixar(`${cenario.nome}/mcp.get_video_material`, canonico(respostaDoVideo(cenario.articleId, radarMcpMaterialOf("video", montagem as never))));

    cobertura[cenario.nome] = { links: planta ? planta.blueprint.sections.reduce((soma, secao) => soma + (secao.internalLinks?.length || 0), 0) : 0, csv: escrita.csv! };
  }

  /* ---------------- o Silo inteiro: Pilar e Suportes num arquivo ---------------- */
  const silo = radarPortableWritingExport({ articles: comPlantas(F.montadasDoSilo(), escritaDoSilo), lenses: F.LEITURA_DAS_LENTES, plan: plano, today: F.EXPORTADO_EM });
  assert.equal(silo.files?.length, 1);
  fixar("silo-pilar-e-suportes/csv-para-escrever", silo.files![0].csv);
  fixar("silo-pilar-e-suportes/csv-para-escrever.meta", canonico({ filename: silo.files![0].filename, archiveFilename: silo.archiveFilename, exported: silo.exported, blocked: silo.blocked }));
  const siloSaude = radarPortableWritingExport({
    articles: comPlantas(F.montadasDoSiloSaude(), escritaDoSilo), lenses: F.LEITURA_DAS_LENTES, plan: plano, today: F.EXPORTADO_EM,
    publications: new Map([[F.ARTIGO, F.PUBLICACAO_SEM_POLITICA]]),
  });
  fixar("silo-saude-pilar-publicado/csv-para-escrever", siloSaude.files![0].csv);

  /* ---------------- ponta a ponta: a montagem real sobre o PostgREST simulado ---------------- */
  const cliente = createCanonicalServiceClient();
  for (const [nome, articleId, mode] of [
    ["bancada-pilar", ARTIGO_DO_BANCO.F, "writing"],
    ["bancada-pilar", ARTIGO_DO_BANCO.F, "video"],
    ["bancada-suporte", ARTIGO_DO_BANCO.T, "writing"],
    ["bancada-suporte", ARTIGO_DO_BANCO.T, "video"],
  ] as const) {
    banco = comArtigosModeloConcluidos(semearBanco());
    const material = await radarMcpMaterialForArticle({ brandId: MARCA_DO_BANCO, articleId, mode, supabase: cliente as never, actorUserId: "ator-de-teste" });
    assert.equal(material.status, "ready", `${nome}/${mode}: ${JSON.stringify(material).slice(0, 300)}`);
    fixar(`${nome}/mcp.${mode === "writing" ? "get_article_for_writing" : "get_video_material"}`, canonico(mode === "writing" ? respostaParaEscrever(articleId, material) : respostaDoVideo(articleId, material)));
  }

  /* ---------------- o que o Redator recebe ---------------- */
  const aprovado = mcpArticleBlueprintStateOf({ kind: "approved", meta: { id: "planta-do-retrato", versionNumber: 1, approvedAt: "2026-09-23T10:00:00+00:00" } });
  const semPlanta = mcpArticleBlueprintStateOf({ kind: "none", reason: "Nenhum artigo-modelo concluído para o pacote entregue." });
  const envios: Array<[string, Contexto, Planta | null, Assunto | null]> = [
    ["redator-sem-assunto", F.contextoDePesquisa(), plantas.get("pilar-avulso-sem-grupo-sem-assunto-sem-links") ?? null, null],
    ["redator-com-assunto-formato-antigo", contextoCom(CONSULTA), plantas.get("pilar-com-assunto-formato-antigo") ?? null, CONSULTA],
  ];
  for (const [nome, contexto, planta, assunto] of envios) {
    assert.ok(planta, `${nome}: a planta do cenário existe`);
    const documento = documentoDoEnvio(contexto, planta, assunto);
    fixar(`${nome}/documento-do-envio`, canonico(documento));
    fixar(`${nome}/fundamentos`, canonico(radarFoundationsOf(documento as never)));
    fixar(`${nome}/mcp.get_writer_brief.planta-aprovada`, canonico(respostaDoBriefing(documento, aprovado)));
    fixar(`${nome}/mcp.get_writer_brief.sem-planta`, canonico(respostaDoBriefing(documento, semPlanta)));
  }

  /* ---------------- diretriz de voz humana ---------------- */
  fixar("voz-humana/diretriz", canonico({
    version: voz.RADAR_HUMAN_VOICE_GUIDELINE_VERSION, origin: voz.RADAR_HUMAN_VOICE_ORIGIN, intentionalErrors: voz.RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS,
    h2: voz.RADAR_HUMAN_VOICE_H2, titleOptions: voz.RADAR_HUMAN_VOICE_TITLE_OPTIONS, keywordEarlyChars: voz.RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS,
    seoTitleMax: voz.RADAR_HUMAN_VOICE_SEO_TITLE_MAX, metaMax: voz.RADAR_HUMAN_VOICE_META_MAX,
    rules: voz.RADAR_HUMAN_VOICE_RULES, serpRules: voz.RADAR_HUMAN_VOICE_SERP_RULES, core: voz.RADAR_HUMAN_VOICE_CORE,
    precedence: voz.RADAR_HUMAN_VOICE_PRECEDENCE, serpSummary: voz.RADAR_HUMAN_VOICE_SERP_SUMMARY,
    closingSteps: voz.RADAR_HUMAN_VOICE_CLOSING_STEPS, localAuthority: voz.RADAR_HUMAN_VOICE_LOCAL_AUTHORITY,
  }));
  fixar("voz-humana/textos", canonico({
    promptBlock: voz.radarHumanVoicePromptBlock(), writingRule: voz.radarHumanVoiceWritingRule(), brandVoiceRowNote: voz.radarHumanVoiceBrandVoiceRowNote(),
    redatorRule: voz.radarHumanVoiceRedatorRule(), videoRule: voz.radarHumanVoiceVideoRule(), catalogNote: voz.radarHumanVoiceCatalogNote(),
  }));
  const PRINCIPAL = "skincare facial";
  const TITULOS = [
    "Skincare facial: o guia prático", "Tudo o que você precisa saber sobre skincare facial", "O guia definitivo de skincare facial",
    "Como montar a rotina da manhã sem produto sobrando", "Rotina de skincare facial para pele oleosa", "Você sabia? Skincare facial em 5 passos",
  ];
  fixar("voz-humana/reguas", canonico(TITULOS.map(titulo => ({
    titulo,
    isca: voz.radarHumanVoiceGenericBait(titulo, [PRINCIPAL]),
    comeca: voz.radarHumanVoiceStartsWithKeyword(titulo, PRINCIPAL),
    cedo: voz.radarHumanVoiceKeywordEarly(titulo, PRINCIPAL),
    noTitulo: voz.radarHumanVoiceHeadingHasKeyword(titulo, PRINCIPAL),
    primeiro: voz.radarHumanVoiceTitleWithKeywordFirst(titulo, PRINCIPAL),
  }))));

  /* ---------------- âncoras naturais ---------------- */
  fixar("ancoras-naturais/regras", canonico({
    rule: regraDaAncora.RADAR_NATURAL_ANCHOR_RULE, promptRule: regraDaAncora.RADAR_NATURAL_ANCHOR_PROMPT_RULE,
    freeInstruction: regraDaAncora.RADAR_FREE_ANCHOR_INSTRUCTION, freeWithIdea: regraDaAncora.radarFreeAnchorInstruction("a rotina da noite"),
    freeWithoutIdea: regraDaAncora.radarFreeAnchorInstruction(null), writerNote: regraDaAncora.RADAR_NATURAL_ANCHOR_WRITER_NOTE,
    isFree: [regraDaAncora.RADAR_FREE_ANCHOR_INSTRUCTION, "rotina da noite", ""].map(item => regraDaAncora.radarAnchorIsFree(item)),
  }));
  const CASOS_DE_ANCORA = [
    { anchor: "rotina da manhã", targetLabel: "skincare facial" },
    { anchor: "skincare facial", targetLabel: "skincare facial" },
    { anchor: "o guia de skincare facial para pele oleosa", targetLabel: "skincare facial", targetKeywords: ["skin care noturno"] },
    { anchor: "skin care noturno", targetLabel: "skin care noturno", graphConcepts: ["rotina da noite", "cuidados antes de dormir"] },
    { anchor: "rotina da noite", targetLabel: "skin care noturno", graphConcepts: ["rotina da noite", "cuidados antes de dormir"], usedAnchors: ["rotina da noite"] },
    { anchor: "cuidados com a pele", targetLabel: "Cuidados com a Pele", graphConcepts: ["guia de cuidados com a pele"], takenAnchors: ["guia de cuidados com a pele"] },
    { anchor: "skin care nivea", targetLabel: "skin care nivea", targetKeywords: ["nivea"] },
    { anchor: regraDaAncora.RADAR_FREE_ANCHOR_INSTRUCTION, targetLabel: "máscara facial", graphConcepts: ["máscara caseira"] },
    { anchor: "como atrair clientes pelo instagram", targetLabel: "como atrair clientes pelo instagram para clínicas" },
  ];
  fixar("ancoras-naturais/regua", canonico(CASOS_DE_ANCORA.map(caso => ({ caso, saida: ancora.radarNaturalAnchor(caso) }))));
  fixar("ancoras-naturais/auxiliares", canonico({
    keys: ["Promoções de Clientes", "leads", "Cuidados com a Pele"].map(item => ancora.radarAnchorKey(item)),
    repeats: ancora.radarAnchorRepeatsKeyword("guia de skincare facial", ["skincare facial"]),
    forbidden: ancora.radarAnchorForbiddenList("skin care noturno", ["skin care noturno", "rotina noturna"]),
    trim: ancora.radarAnchorTrim("Como montar a rotina de skincare facial para pele oleosa?"),
    cuts: ancora.radarAnchorCuts("como atrair clientes pelo instagram para clínicas"),
    formulations: ancora.radarNaturalAnchorFormulations({ targetKeywords: ["skincare facial"], graphConcepts: ["skincare facial para pele oleosa", "rotina", "ordem dos produtos", "\"guia de cuidados\""] }),
    graph: ancora.radarAnchorGraphConcepts([
      { targetNodeId: `article:${F.ARTIGO_AMAZON}`, relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["produtos nivea", "nivea para o rosto"], direction: "outbound" },
      { targetNodeId: "silo-page:cuidados-com-a-pele", relationType: "ARTICLE_TO_SILO_PAGE", anchorConcepts: ["guia de cuidados com a pele"], direction: "outbound" },
      { targetNodeId: `article:${F.ARTIGO_YOUTUBE}`, relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina da noite"], direction: "inbound" },
    ]),
    destinations: [
      { role: "SiloPage", destination: "https://careglow.com.br/cuidados-com-a-pele", label: "Cuidados com a Pele" },
      { role: "Suporte", destination: "https://careglow.com.br/cuidados-com-a-pele/skin-care-nivea?utm=1", label: "skin care nivea" },
      { role: "Suporte", destination: null, label: "“máscara facial”" },
    ].map(item => ancora.radarAnchorDestinationKey(item)),
  }));

  /* ---------------- identidade de publicação ---------------- */
  const PUBLICADO_EM = "2026-08-01T10:00:00+00:00";
  const estadosDaPublicacao = {
    novo: resolveRadarPublication({}),
    publicado: resolveRadarPublication({ operational: { state: "published", destinationUrl: "https://careglow.com.br/skincare-facial", publishedAt: PUBLICADO_EM, updateRequested: false } as never }),
    publicadoPelaKeyword: resolveRadarPublication({ keywordPublished: true }),
    atualizacaoPeloLegado: resolveRadarPublication({ legacy: { status: "update_due", destination: "https://careglow.com.br/skincare-facial", publishedAt: PUBLICADO_EM } as never }),
    atualizacaoPedida: resolveRadarPublication({ operational: { state: "published", destinationUrl: "https://careglow.com.br/skincare-facial", publishedAt: PUBLICADO_EM, updateRequested: true } as never }),
  };
  fixar("identidade-de-publicacao/resolveRadarPublication", canonico(estadosDaPublicacao));
  const paginaDoSilo = { publishedUrl: null, canonical: "https://careglow.com.br/cuidados-com-a-pele", slug: "cuidados-com-a-pele", published: false };
  const identidades = [
    identidade.radarPublicationIdentity({ slug: "skincare-facial", published: true, publishedUrl: "https://careglow.com.br/skincare-facial/", canonical: "https://careglow.com.br/skincare-facial", silo: { label: "Cuidados com a Pele", page: paginaDoSilo } }),
    identidade.radarPublicationIdentity({ slug: "/skin-care-nivea/", published: false, silo: { label: "Cuidados com a Pele", page: paginaDoSilo } }),
    identidade.radarPublicationIdentity({ slug: "mascara-facial", published: false, silo: { label: "Cuidados com a Pele", page: null, baseUrl: "https://careglow.com.br/cuidados" } }),
    identidade.radarPublicationIdentity({ slug: "skin-care-noturno", published: false, siteOrigin: "https://careglow.com.br/blog" }),
    identidade.radarPublicationIdentity({ slug: "sem-silo", published: false }),
    identidade.radarPublicationIdentity({ published: true }),
  ];
  fixar("identidade-de-publicacao/identidades", canonico(identidades.map(item => ({ identidade: item, linhas: identidade.radarPublicationIdentityLines(item) }))));
  fixar("identidade-de-publicacao/silo", canonico(identidade.radarSiloPublicationIdentities({
    silo: {
      kind: "silo", label: "Cuidados com a Pele",
      siloPage: { publishedUrl: null, canonical: "https://careglow.com.br/cuidados-com-a-pele", slug: "cuidados-com-a-pele", status: "new" },
      members: [{ articleId: F.ARTIGO, slug: "skincare-facial" }, { articleId: F.ARTIGO_AMAZON, slug: "skin-care-nivea" }, { articleId: F.ARTIGO_YOUTUBE, slug: "skin-care-noturno" }],
    } as never,
    publications: new Map([[F.ARTIGO, { published: true, publishedUrl: "https://careglow.com.br/cuidados-com-a-pele/skincare-facial", canonical: null, slug: "skincare-facial" }]]),
    siteUrls: ["https://careglow.com.br"],
  })));
  fixar("identidade-de-publicacao/rotulos", canonico([identidade.RADAR_PUBLICATION_PUBLISHED, identidade.RADAR_PUBLICATION_NEW, identidade.RADAR_PUBLICATION_NO_SILO]));

  /* ---------------- a fonte dos handlers do MCP (a resposta é montada lá) ---------------- */
  fixar("fonte/platform-mcp-tools.get_article_for_writing+get_video_material", trecho("lib/server/platform-mcp-tools.ts", 'server.registerTool("get_article_for_writing"', "const WRITING_CSV_PART_CHARS = 12_000;", true));
  fixar("fonte/mcp-redator.fitBrief", trecho("app/api/mcp/redator/route.ts", "const LISTAS_DO_BRIEFING", "export function createWriterServer"));
  fixar("fonte/mcp-redator.get_writer_brief", trecho("app/api/mcp/redator/route.ts", 'server.registerTool("get_writer_brief"', 'server.registerTool("get_writer_evidence_manifest"'));

  return { retrato, cobertura };
}

let primeira: Awaited<ReturnType<typeof tirarRetrato>>;
let segunda: Awaited<ReturnType<typeof tirarRetrato>>;
try {
  primeira = await tirarRetrato();
  segunda = await tirarRetrato();
} finally {
  (globalThis as { Date: DateConstructor }).Date = DataReal;
}

/* ============================ A TABELA TRAVADA (E0, 2026-10-13) ============================ */

/*
 * NÃO ATUALIZE. Tirada em 2026-10-13 e conferida numa worktree limpa do HEAD
 * `4d546ce` (a mesma tabela passa lá e na árvore de trabalho do dia). Mudar
 * uma linha daqui é mudar um entregável: exige decisão do dono, registrada.
 *
 * Conferência cruzada: "silo-pilar-e-suportes" e "silo-saude-pilar-publicado"
 * têm o mesmo SHA-256 dos snapshots `silo` e `saude` de
 * `radar-assunto-f4.test.mts` (4be7e971… e ba83b780…): a bancada daqui monta o
 * mesmo arquivo que as suítes anteriores já travavam.
 */
const RETRATO: Retrato = {
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/artigo-modelo.brief": { sha256: "c4885ff0889e97f890f0f2e304144fefcf34e37819971e5aae9fbdd43271c9a6", bytes: 7811 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/artigo-modelo.pedido.user": { sha256: "fc01dc6677f414dfad520c573f68ba2a1820b8736121205fc1a84526793d8031", bytes: 7073 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/artigo-modelo.planta-congelada": { sha256: "edf2f49d8a1b35a75fcd94824b5fb4fdb2e978dffcf8c9cd5c001133e3c60bca", bytes: 9350 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/csv-para-escrever": { sha256: "11383168a80abd0ef6d3e36a2ebdcf12ba6c9a98685e3c9be5518b901bbf1e65", bytes: 18256 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/csv-para-escrever.meta": { sha256: "351eadf4a711ca32f75ab9f6a63d47a5b850567270561ff7d21369dbd8a2b04c", bytes: 67 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/csv-video": { sha256: "380cbb663bea7f95138bcd0864ad598cecfd1cf86d85609841f3ab6aec1d85df", bytes: 22345 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/mcp.get_article_for_writing": { sha256: "87b1a011461703a9fbc15f30d2796d4074a02f543e7a88e9f3701b9d64f675ce", bytes: 19027 },
  "pilar-avulso-sem-grupo-sem-assunto-sem-links/mcp.get_video_material": { sha256: "8d372b2f15544d13be0babb7c4a07c8a465b7cf0698b14fc783b8907bf0100e6", bytes: 22662 },
  "pilar-no-silo-com-links/artigo-modelo.brief": { sha256: "1e659b605e44df0fe845550c63e738d15a265d4e7960ed623254bea88d4a8a51", bytes: 8902 },
  "pilar-no-silo-com-links/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-no-silo-com-links/artigo-modelo.pedido.user": { sha256: "44dadee0e82d12ed61002c1a723e087c0da6cf16b93f6ac621e37b76e6768b07", bytes: 7932 },
  "pilar-no-silo-com-links/artigo-modelo.planta-congelada": { sha256: "c7703a823343836d247e52522060959465ec07221b9e58e37cdb7c4431182d93", bytes: 10545 },
  "pilar-no-silo-com-links/csv-para-escrever": { sha256: "161a868bb45fe8099a4c02bfb40eb615a45e9b45530f0ec8acf4ee651de91940", bytes: 23417 },
  "pilar-no-silo-com-links/csv-para-escrever.meta": { sha256: "8737af384d81f4f6a62f75e97436062be87564e96b151c13c1bc103b8fc14aa5", bytes: 69 },
  "pilar-no-silo-com-links/csv-video": { sha256: "380cbb663bea7f95138bcd0864ad598cecfd1cf86d85609841f3ab6aec1d85df", bytes: 22345 },
  "pilar-no-silo-com-links/mcp.get_article_for_writing": { sha256: "dd4bcf8ce8f628f402071de4eb3c8dd19d86e5137467df17da49c8d1d0348c16", bytes: 24334 },
  "pilar-no-silo-com-links/mcp.get_video_material": { sha256: "8d372b2f15544d13be0babb7c4a07c8a465b7cf0698b14fc783b8907bf0100e6", bytes: 22662 },
  "pilar-grupo-do-plano-com-promessa-declarada/artigo-modelo.brief": { sha256: "1691926222be166b471f717a81438d5802d39d23c3ed781902cdb6f98b0a4722", bytes: 8966 },
  "pilar-grupo-do-plano-com-promessa-declarada/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-grupo-do-plano-com-promessa-declarada/artigo-modelo.pedido.user": { sha256: "c28cbf2b89df2931a1f958e9af360bc4b1bc85a104e4478b1191a16b8d0861ae", bytes: 7996 },
  "pilar-grupo-do-plano-com-promessa-declarada/artigo-modelo.planta-congelada": { sha256: "c7703a823343836d247e52522060959465ec07221b9e58e37cdb7c4431182d93", bytes: 10545 },
  "pilar-grupo-do-plano-com-promessa-declarada/csv-para-escrever": { sha256: "fb69b798a4670d8354ce45e9750ee001b24b7b4b8dd2e3c70d8f30124dd358a7", bytes: 23584 },
  "pilar-grupo-do-plano-com-promessa-declarada/csv-para-escrever.meta": { sha256: "8737af384d81f4f6a62f75e97436062be87564e96b151c13c1bc103b8fc14aa5", bytes: 69 },
  "pilar-grupo-do-plano-com-promessa-declarada/csv-video": { sha256: "33a2f991e0cc6b5fbf1bd86e4a4206263fb8618578ce4726eaff24d24625fd33", bytes: 22409 },
  "pilar-grupo-do-plano-com-promessa-declarada/mcp.get_article_for_writing": { sha256: "c42dd7b660a518ad4b22d81f7a8f0ec9a12234f553edd9ac07b4a1cc0d1ab8f2", bytes: 24709 },
  "pilar-grupo-do-plano-com-promessa-declarada/mcp.get_video_material": { sha256: "2e9c5e8b51d8663e5d21f320e8fbd3b1d4fc7be72dc8b511edceda0f507092d3", bytes: 22726 },
  "pilar-grupo-manual-com-promessa-declarada/artigo-modelo.brief": { sha256: "39346e2fb1a148230b92ed88295cd2230d6f067288e1584f8757fa19194ecf94", bytes: 7841 },
  "pilar-grupo-manual-com-promessa-declarada/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-grupo-manual-com-promessa-declarada/artigo-modelo.pedido.user": { sha256: "b3504afeca3cb51a7c87562dc234c7b7b571032b252c96db9692650a99cd655f", bytes: 7103 },
  "pilar-grupo-manual-com-promessa-declarada/artigo-modelo.planta-congelada": { sha256: "edf2f49d8a1b35a75fcd94824b5fb4fdb2e978dffcf8c9cd5c001133e3c60bca", bytes: 9350 },
  "pilar-grupo-manual-com-promessa-declarada/csv-para-escrever": { sha256: "075d5dd57a9255c5f65bbcf663ffa02065b83444e4441fb02a15c4ab077cd9b7", bytes: 18348 },
  "pilar-grupo-manual-com-promessa-declarada/csv-para-escrever.meta": { sha256: "351eadf4a711ca32f75ab9f6a63d47a5b850567270561ff7d21369dbd8a2b04c", bytes: 67 },
  "pilar-grupo-manual-com-promessa-declarada/csv-video": { sha256: "514707e885b515d31c52d54fcd22734104879f085878ada791397c4533f30fe0", bytes: 22375 },
  "pilar-grupo-manual-com-promessa-declarada/mcp.get_article_for_writing": { sha256: "0cfc3906f1d3c235a622ebdf8287ac9de7fdc4b5d965563492c2f36f18686dc8", bytes: 19241 },
  "pilar-grupo-manual-com-promessa-declarada/mcp.get_video_material": { sha256: "ecaed436a3427a0a4151ff1e06d886ae5ff06e7deb08382c29107bbd81fb0a14", bytes: 22692 },
  "pilar-com-assunto-formato-antigo/artigo-modelo.brief": { sha256: "24e2811a5c96235f20bedd346bba80c5e794242ea3d6a6f552af98de1a8d4650", bytes: 8281 },
  "pilar-com-assunto-formato-antigo/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-com-assunto-formato-antigo/artigo-modelo.pedido.user": { sha256: "69a8a4586f8ea557f9e2ca5dfa307e714db0de95212e8255ca7b519bf1329efa", bytes: 7652 },
  "pilar-com-assunto-formato-antigo/artigo-modelo.planta-congelada": { sha256: "0e53344b2989176dfdcdf941f36ee1914ae67c626b1aa2576a52ddb74baf4a09", bytes: 9460 },
  "pilar-com-assunto-formato-antigo/csv-para-escrever": { sha256: "aaa1a3d1720022f508f2d8dc919ea62e1a04c14eb71ac7e78c016c4ffb9874d8", bytes: 18414 },
  "pilar-com-assunto-formato-antigo/csv-para-escrever.meta": { sha256: "351eadf4a711ca32f75ab9f6a63d47a5b850567270561ff7d21369dbd8a2b04c", bytes: 67 },
  "pilar-com-assunto-formato-antigo/csv-video": { sha256: "0a17aba9240b1bf202064d1ef68622c41abc8cf2820db30783902189926b312d", bytes: 22399 },
  "pilar-com-assunto-formato-antigo/mcp.get_article_for_writing": { sha256: "2c785f7de9181d59220287d8465648ec1f88323ecde7f1e70356539d5f70d7db", bytes: 19186 },
  "pilar-com-assunto-formato-antigo/mcp.get_video_material": { sha256: "a4f98a31ce332c757eef74a94782a38811cf3586b34b20bd9705b8c5c4fcc2ff", bytes: 22716 },
  "pilar-publicado-sem-politica/artigo-modelo.brief": { sha256: "89322b38549b6782472fc92b72acb566d52f76bd00f3be4a42ea96981fdec669", bytes: 8950 },
  "pilar-publicado-sem-politica/artigo-modelo.pedido.system": { sha256: "5e37f872ab45bc86d01d4683fa4df4a935c4579eaccb5bc3e76b81aec8598832", bytes: 13978 },
  "pilar-publicado-sem-politica/artigo-modelo.pedido.user": { sha256: "3ab2d8440ceed9e8cdfa150d04753516b22f3d60a72bdd81112cf732d1096c42", bytes: 8338 },
  "pilar-publicado-sem-politica/artigo-modelo.planta-congelada": { sha256: "c5d875991d2b7b07a3298090e219e22651de3a15bf297782d6b42b743ae5f8c7", bytes: 9896 },
  "pilar-publicado-sem-politica/csv-para-escrever": { sha256: "f78dc13823a9640ebcd3124833141dc2a085537f5c1d65b7bb657117a8739717", bytes: 21411 },
  "pilar-publicado-sem-politica/csv-para-escrever.meta": { sha256: "351eadf4a711ca32f75ab9f6a63d47a5b850567270561ff7d21369dbd8a2b04c", bytes: 67 },
  "pilar-publicado-sem-politica/csv-video": { sha256: "08afa7ccd2918583eccd97a8d8f4cd2d853e8cdd48584fd28d1721dbb4702a85", bytes: 22940 },
  "pilar-publicado-sem-politica/mcp.get_article_for_writing": { sha256: "5866e09a96252b86eb148ee4f635b2a48f3f450dabfba7c9703236ac058a1a8d", bytes: 22243 },
  "pilar-publicado-sem-politica/mcp.get_video_material": { sha256: "781a7cfab73bc1ad1d9589b6a73504e70f8ca4b89144fb756b81e96886357b2d", bytes: 23257 },
  "suporte-amazon-no-silo-com-links/artigo-modelo.brief": { sha256: "075f8a053d74ffa25297fb2a34630f34f660a57fcb96ddcf7cd6a48bbb609098", bytes: 2167 },
  "suporte-amazon-no-silo-com-links/artigo-modelo.pedido.system": { sha256: "5975a527156d4f539300eaae8cc92bdabba8b5f789e6a462dc479acfcffbb9b6", bytes: 13970 },
  "suporte-amazon-no-silo-com-links/artigo-modelo.pedido.user": { sha256: "a6fb45bc54a2ee59b816208a24a15cde6467b8561ab4a7374deb69cd8a1a7652", bytes: 2831 },
  "suporte-amazon-no-silo-com-links/artigo-modelo.planta-congelada": { sha256: "b3b52059aab2341397d0d400828ea71ad44fe11fe6fe3140cd6e6472db395c13", bytes: 4891 },
  "suporte-amazon-no-silo-com-links/csv-para-escrever": { sha256: "cc41ced4aaa8549b72357df7a7d5342c756d9fadca9638355deb78bc5c81dff9", bytes: 18322 },
  "suporte-amazon-no-silo-com-links/csv-para-escrever.meta": { sha256: "dfab37a4e61bc5f372f32f3144304c558183fbdbf775c140943f8ae6855f20fb", bytes: 71 },
  "suporte-amazon-no-silo-com-links/csv-video": { sha256: "9b4c8a7707e9c44b4ffdaf560a6935661004cf2389cf4c370d80f10b6a4c66ce", bytes: 19787 },
  "suporte-amazon-no-silo-com-links/mcp.get_article_for_writing": { sha256: "7d27d7b7682b3c8245a48ac0500e6a8b92de5956aaaca7e8ccb1ae2629b012ca", bytes: 19173 },
  "suporte-amazon-no-silo-com-links/mcp.get_video_material": { sha256: "6f91c8007406ff657aa4077dc914e05c7b079448544f1b497b143240c27ed57c", bytes: 20104 },
  "suporte-amazon-avulso-sem-links/artigo-modelo.brief": { sha256: "a7b615780c2d30aaf2dfd7770c3b3428a5323508ec15258b153c334f9ace86ad", bytes: 1078 },
  "suporte-amazon-avulso-sem-links/artigo-modelo.pedido.system": { sha256: "5975a527156d4f539300eaae8cc92bdabba8b5f789e6a462dc479acfcffbb9b6", bytes: 13970 },
  "suporte-amazon-avulso-sem-links/artigo-modelo.pedido.user": { sha256: "596fd4bce4e2d0b5cda1f99730113ffaa48c07eef460e75f1b289969f2ff0b22", bytes: 1974 },
  "suporte-amazon-avulso-sem-links/artigo-modelo.planta-congelada": { sha256: "4fd9619d0ca650379ff2419c9635b04269afea556b79418dcfb463c536976afd", bytes: 3699 },
  "suporte-amazon-avulso-sem-links/csv-para-escrever": { sha256: "576944a36317a88a86ccb80cac3628989e2a9d97160ad117a0634c0bf776a7a4", bytes: 13108 },
  "suporte-amazon-avulso-sem-links/csv-para-escrever.meta": { sha256: "59e10c09aef0eb0c3af019c1a487539a7fa7d5e33b0f491ac362d671ef45b6d2", bytes: 67 },
  "suporte-amazon-avulso-sem-links/csv-video": { sha256: "682dfff03946cb61489106d1b1bca094cf8cb4dec2a0e8c0ae495d9ab2b76ddb", bytes: 19411 },
  "suporte-amazon-avulso-sem-links/mcp.get_article_for_writing": { sha256: "e16d7978609ea662d0a77d5dcdd91fa0f5c96564b11bfd6868062525c9c70f86", bytes: 13811 },
  "suporte-amazon-avulso-sem-links/mcp.get_video_material": { sha256: "1753af21790c4c672b263253d58b4a5ace2258905aa440c7e1c34d8ba1f8e49f", bytes: 19728 },
  "suporte-youtube-no-silo/csv-para-escrever": { sha256: "dce5d86a098474d278178dcceb94026c229838704eb91046ad458608db70924f", bytes: 8402 },
  "suporte-youtube-no-silo/csv-para-escrever.meta": { sha256: "ce9d453e9edf9681d29679c1608e57a662d65624b07e25d29dd47a86d946e498", bytes: 73 },
  "suporte-youtube-no-silo/csv-video": { sha256: "755f9d477fb9d90e773590b47196881cadd4e125466485cd2ff5f2fbcbe42fed", bytes: 90 },
  "suporte-youtube-no-silo/mcp.get_article_for_writing": { sha256: "cea35639762210711ced33ca7ef4b7553064d452fca127d7eee411e4d4ffae6a", bytes: 8791 },
  "suporte-youtube-no-silo/mcp.get_video_material": { sha256: "fe51633d26545cb0e8d4b60afd8c2e1f46e2ea8a95483676116751a36aaa08f6", bytes: 283 },
  "silo-pilar-e-suportes/csv-para-escrever": { sha256: "4be7e971c7c13357c3c65bbf62290bdd6d6cfbbf9ab09aa2aa98a868e0066f1d", bytes: 34975 },
  "silo-pilar-e-suportes/csv-para-escrever.meta": { sha256: "cb88c03d73ed6eff3e5a098e621ec6fed76a0a4e23e30fa32f8a431f9069241f", bytes: 124 },
  "silo-saude-pilar-publicado/csv-para-escrever": { sha256: "ba83b7807aac70c1b83a42d1bb909e3f5f1c95e89124d9dd77978b654c59d472", bytes: 38859 },
  "bancada-pilar/mcp.get_article_for_writing": { sha256: "7eb37557f35385842efee61cf7a73afa2fb7b02bbfb55133622c6763e4368b5e", bytes: 19437 },
  "bancada-pilar/mcp.get_video_material": { sha256: "c45318b3e046bfbce6dd887f87b40b05c10adad6ba1f8ef065ddec382b45443b", bytes: 17684 },
  "bancada-suporte/mcp.get_article_for_writing": { sha256: "838a593c7c154b598211e85b502a247ba5a84d9e5377442d26991da99e283261", bytes: 19573 },
  "bancada-suporte/mcp.get_video_material": { sha256: "1b4d36de809b161073376420a043dae05bc557b1ebf99037278953f8a6c6eff9", bytes: 17795 },
  "redator-sem-assunto/documento-do-envio": { sha256: "19f2ba3c73dd4815cb479c12902f2d51c079d12195a926bb60c94a322b336258", bytes: 206550 },
  "redator-sem-assunto/fundamentos": { sha256: "f43d4eb201d63e9bf574ed132c0bd740d671fe613c3351e999a898915ff0a46a", bytes: 3537 },
  "redator-sem-assunto/mcp.get_writer_brief.planta-aprovada": { sha256: "aa371d091aed8da5a1f052c52725c38cc4a07ede3d755fc3c66b9706a537b277", bytes: 2902 },
  "redator-sem-assunto/mcp.get_writer_brief.sem-planta": { sha256: "250f9d29da679d16338ba9c38f6eabdb620eac4f94498909c20f2c926a4b865d", bytes: 3915 },
  "redator-com-assunto-formato-antigo/documento-do-envio": { sha256: "f9b9df2e1d8d5ab38a417823c42a997f69d2bfdd11ae10ca473af28378242d10", bytes: 207082 },
  "redator-com-assunto-formato-antigo/fundamentos": { sha256: "332291514fe9b2baedd525b82504ac49b4dddc61f4bd8840abc63c984504faa8", bytes: 4091 },
  "redator-com-assunto-formato-antigo/mcp.get_writer_brief.planta-aprovada": { sha256: "8843a94c99af9e3bee570ae030dc8ac1c6351803a96afd13703ed643e52733db", bytes: 3456 },
  "redator-com-assunto-formato-antigo/mcp.get_writer_brief.sem-planta": { sha256: "f3e60787b139e725d343ad79e9facb007468089c0ab76b0613b0470035c874d6", bytes: 4280 },
  "voz-humana/diretriz": { sha256: "893dbfd269e99e2cd2ea13aaade477e321b30d10706a38f61885dfec8dfedd7c", bytes: 13908 },
  "voz-humana/textos": { sha256: "fec9b2feaee73f01311440f7036c4810a121353c4db5e6186269ac088bfe41f6", bytes: 11824 },
  "voz-humana/reguas": { sha256: "dff73a140048722c8dbc55e859c008d3f20454b8cb4ff2cf2e424138c477f8cf", bytes: 1058 },
  "ancoras-naturais/regras": { sha256: "47fdd76f4807be21da34b299f5e817d8070c93f2cc2ac8a0e00ca0bceeee7a87", bytes: 1674 },
  "ancoras-naturais/regua": { sha256: "5992c214c50fae4aae88866ee71be44f175271f33c93e3e93cceb5798bfa2113", bytes: 2533 },
  "ancoras-naturais/auxiliares": { sha256: "f38af159734a0288dd65b7b24803e7bd3c0d5858d94411a6468e3032381bcf07", bytes: 513 },
  "identidade-de-publicacao/resolveRadarPublication": { sha256: "2ae35f319bc603ba889b9241e504d7712b4642262c4aa3ca591a8d414fa90f55", bytes: 817 },
  "identidade-de-publicacao/identidades": { sha256: "0e52ed6d12e94f9f28a8ff1369ffe1514fd2d144412487b667b952650d7abd38", bytes: 3875 },
  "identidade-de-publicacao/silo": { sha256: "3291644f7ca8bd849244a8fde5cffc79c9c1b4817553bef8cb646e3c56f32f7e", bytes: 1878 },
  "identidade-de-publicacao/rotulos": { sha256: "7431881533267e6a176c75a869e22c8b8bc9540c8c313c85735b2bd3e13a9d2a", bytes: 107 },
  "fonte/platform-mcp-tools.get_article_for_writing+get_video_material": { sha256: "1c3fd9aa42f008fcb4e9de0b9b0ad1043fbe8fdb995aeb5950dd1ff06f8caaa2", bytes: 4732 },
  "fonte/mcp-redator.fitBrief": { sha256: "f6cbf41a19c08ce4ec43549f7cf7c6dbb7454f49f2a9fee1b4053b1862d4e6f6", bytes: 2130 },
  "fonte/mcp-redator.get_writer_brief": { sha256: "cbb877fb300e1b96b51abed144d8aea4980a28d540dc54b49343db856418cd08", bytes: 2628 },
};

/* ============================ os testes ============================ */

test("E0 · cada entregável é byte a byte o do retrato (SHA-256 e bytes)", () => {
  const atual = primeira.retrato;
  const diferencas: string[] = [];
  for (const nome of new Set([...Object.keys(RETRATO), ...Object.keys(atual)])) {
    const esperado = RETRATO[nome];
    const obtido = atual[nome];
    if (!esperado) diferencas.push(`NOVA     ${JSON.stringify(nome)}: ${JSON.stringify(obtido)},`);
    else if (!obtido) diferencas.push(`SUMIU    ${JSON.stringify(nome)} (esperado ${JSON.stringify(esperado)})`);
    else if (esperado.sha256 !== obtido.sha256 || esperado.bytes !== obtido.bytes) diferencas.push(`MUDOU    ${JSON.stringify(nome)}: ${JSON.stringify(obtido)}, (era ${JSON.stringify(esperado)})`);
  }
  assert.equal(diferencas.length, 0, [
    "Entregável mudou. Nenhuma fase da SDD de aceleração pode atualizar estes hashes; mudar entregável exige decisão do dono.",
    ...diferencas,
  ].join("\n"));
});

test("E0 · determinismo: duas tiradas seguidas dão o mesmo retrato", () => {
  assert.deepEqual(segunda.retrato, primeira.retrato);
});

test("E0 · cobertura dos cenários: links, grupo, promessa, Assunto, papel e publicação aparecem onde devem", () => {
  const { cobertura } = primeira;
  assert.equal(cobertura["pilar-avulso-sem-grupo-sem-assunto-sem-links"].links, 0, "sem links internos");
  assert.equal(cobertura["suporte-amazon-avulso-sem-links"].links, 0, "Suporte sem links internos");
  assert.ok(cobertura["pilar-no-silo-com-links"].links > 0, "Pilar com links internos");
  assert.ok(cobertura["suporte-amazon-no-silo-com-links"].links > 0, "Suporte com links internos");
  const SEM_GRUPO = /Grupo: |Promessa declarada/;
  const SEM_ASSUNTO = /Assunto \(tronco\)/;
  assert.doesNotMatch(cobertura["pilar-avulso-sem-grupo-sem-assunto-sem-links"].csv, SEM_GRUPO);
  assert.doesNotMatch(cobertura["pilar-avulso-sem-grupo-sem-assunto-sem-links"].csv, SEM_ASSUNTO);
  assert.ok(cobertura["pilar-grupo-do-plano-com-promessa-declarada"].csv.includes(`Grupo: Laranja · Rotina e cuidados\nPromessa declarada no plano do Silo: ${PROMESSA_DO_PLANO}\n`));
  assert.ok(cobertura["pilar-grupo-manual-com-promessa-declarada"].csv.includes(`Grupo: Azul\nPromessa declarada: ${PROMESSA_MANUAL}\n`));
  assert.ok(cobertura["pilar-com-assunto-formato-antigo"].csv.includes(`Assunto (tronco): ${CONSULTA.phrase} — destino da virada: ${CONSULTA.destinationUrl}`));
  assert.ok(cobertura["pilar-publicado-sem-politica"].csv.includes(`- Situação: ${identidade.RADAR_PUBLICATION_PUBLISHED}`));
  assert.ok(cobertura["pilar-no-silo-com-links"].csv.includes(`- Situação: ${identidade.RADAR_PUBLICATION_NEW}`));
  const nomes = Object.keys(primeira.retrato);
  for (const prefixo of ["silo-pilar-e-suportes/", "bancada-pilar/", "bancada-suporte/", "redator-sem-assunto/", "redator-com-assunto-formato-antigo/", "voz-humana/", "ancoras-naturais/", "identidade-de-publicacao/", "fonte/"]) {
    assert.ok(nomes.some(nome => nome.startsWith(prefixo)), prefixo);
  }
});

test("E0 · PROVIDER_CALLS = 0: nada saiu para fora do banco simulado", () => {
  assert.deepEqual(foraDoBanco, []);
});
