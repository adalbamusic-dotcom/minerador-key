import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { VersionedSiloDNASchema, VersionedSiloPageSchema, type ArticleDNA, type SiloDNA, type SiloPage, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import {
  RADAR_SILO_MEMBER_STATUS_LABEL,
  planRadarSiloExport,
  radarSiloExportArchiveFilename,
  radarSiloExportCleanName,
  radarSiloMemberDescriptorsOfArticleDnas,
  type RadarSiloExportItem,
  type RadarSiloExportPlan,
} from "../lib/radar/portable-silo-export.ts";
import { radarPortableExportCsv, radarPortableExportFilename } from "../lib/radar/portable-export.ts";
import { radarStoredZipOfTexts } from "../lib/radar/stored-zip.ts";

/*
 * ===== O EXPORT POR SILO — um CSV por silo, com o silo inteiro =====
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 * - AGRUPAMENTO por `RadarItem.siloId`, e não pelo que a hidratação ou o
 *   ArticleDNA dizem;
 * - ORDEM do silo: Pilar, ordem narrativa, o resto — não a ordem do pedido;
 * - PARCIAL dito no nome do arquivo e no contexto, com cada faltante e a
 *   situação dele;
 * - COLISÃO de nomes resolvida com sufixo, sem diferenciar maiúsculas;
 * - SEM SILO num arquivo próprio, dizendo por que não há silo;
 * - NENHUM ID no contexto: nem do silo, nem do artigo, nem da versão, nem hash.
 *
 * ==================== AS BANCADAS SÃO DO CONTRATO REAL ====================
 *
 * SiloDNA e SiloPage passam pelos schemas do Arquiteto antes de entrar aqui.
 * Uma fixture inventada testaria a minha fantasia do contrato — e um campo com
 * nome errado passaria verde. Os ids são UUIDs de verdade e os hashes são
 * `sha256:` de verdade, para que um vazamento apareça no padrão da higiene.
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

/* ================================ a bancada ================================ */

const uuid = (numero: number) => `3f2a${String(numero).padStart(4, "0")}-7c1d-4e2b-9a8f-${String(numero).padStart(12, "0")}`;
const hash = (numero: number) => `sha256:${numero.toString(16).padStart(64, "0")}`;

const MARCA = uuid(1);
const OUTRA_MARCA = uuid(2);

const S1 = uuid(101); /* Cuidados com a Pele: parcial */
const S2 = uuid(102); /* Rotina Noturna: completo */
const S3 = uuid(103); /* "rotina noturna!": colide com S2 */
const S4 = uuid(104); /* sem nome */
const S5 = uuid(105); /* só existe na OUTRA marca */

const A1 = uuid(201), A2 = uuid(202), A3 = uuid(203), A4 = uuid(204);
const B1 = uuid(211), B2 = uuid(212);
const C1 = uuid(221);
const D1 = uuid(231);
const E1 = uuid(241), E2 = uuid(242);
const PAGINA_S1 = uuid(301);

let sequencia = 1000;
function envelope<T>(payload: T, entityId: string, versionNumber: number) {
  sequencia += 1;
  return {
    versionId: uuid(sequencia), entityId, versionNumber, previousVersionId: null,
    contentHash: hash(sequencia), origin: "human" as const, changeReason: "bancada",
    createdAt: `2026-09-${String(10 + versionNumber).padStart(2, "0")}T10:00:00.000Z`, createdBy: uuid(999),
    payload,
  };
}

function siloDna(input: {
  siloId: string;
  brandId?: string;
  name?: string;
  pillar: string | null;
  supports: string[];
  order?: string[];
  versionNumber?: number;
  included?: string[];
}): VersionEnvelope<SiloDNA> {
  const membros = [input.pillar, ...input.supports].filter((id): id is string => Boolean(id));
  return VersionedSiloDNASchema.parse(envelope({
    schemaVersion: 1,
    formationStatus: "formed",
    siloId: input.siloId,
    brandId: input.brandId ?? MARCA,
    ...(input.name ? { name: input.name } : {}),
    territoryNarrative: { statement: "Quem tem pele oleosa precisa de rotina, e não de produto solto.", continuity: "coherent", brandAlignment: "aligned", rationale: ["bancada"] },
    centralEntity: "pele oleosa",
    objective: "Construir autoridade em cuidados com pele oleosa.",
    audience: "Pessoas com pele oleosa que querem uma rotina simples.",
    macroProblem: "Brilho excessivo e poros obstruídos sem saber por onde começar.",
    dominantIntent: "informacional",
    pillarArticleId: input.pillar,
    supportArticleIds: input.supports,
    articleReferences: membros.map((articleId, indice) => ({
      articleId, articleDnaVersionId: uuid(600 + indice), articleDnaContentHash: hash(600 + indice),
      role: articleId === input.pillar ? "Pilar" as const : "Suporte" as const,
    })),
    articleRoles: membros.map(articleId => ({ articleId, role: articleId === input.pillar ? "Pilar" : "Suporte", reason: "bancada" })),
    narrativeOrder: input.order ?? membros,
    linkMap: [],
    boundary: "Pele oleosa no rosto; acne clínica fica fora.",
    includedTopics: input.included ?? ["limpeza", "hidratação leve", "protetor solar oil free"],
    excludedTopics: ["tratamento de acne com medicamento"],
    nearbySiloIds: [uuid(777)],
    possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
  }, input.siloId, input.versionNumber ?? 1)) as VersionEnvelope<SiloDNA>;
}

const S1_V1 = siloDna({ siloId: S1, name: "Pele", pillar: A1, supports: [A2], versionNumber: 1 });
const S1_V2 = siloDna({ siloId: S1, name: "Cuidados com a Pele", pillar: A1, supports: [A2, A3, A4], order: [A1, A3, A2], versionNumber: 2 });
const S2_V1 = siloDna({ siloId: S2, name: "Rotina Noturna", pillar: B1, supports: [B2] });
const S3_V1 = siloDna({ siloId: S3, name: "rotina noturna!", pillar: C1, supports: [] });
const S4_V1 = siloDna({ siloId: S4, pillar: D1, supports: [] });
const S5_OUTRA = siloDna({ siloId: S5, brandId: OUTRA_MARCA, name: "Silo da Outra Marca", pillar: E2, supports: [] });

const PAGINA_S1_V1 = VersionedSiloPageSchema.parse(envelope({
  schemaVersion: 1, formationStatus: "formed", siloPageId: PAGINA_S1, brandId: MARCA,
  siloDnaRef: { entityId: S1, versionId: S1_V2.versionId, contentHash: S1_V2.contentHash },
  siloId: S1, slug: "cuidados-com-a-pele", publicationStatus: "published",
  publishedUrl: "https://exemplo.com.br/cuidados-com-a-pele",
  h1: "Cuidados com a pele oleosa", seoTitle: "Cuidados com a pele oleosa", metaDescription: "Guia da rotina.",
  canonical: "https://exemplo.com.br/cuidados-com-a-pele", intro: "Introdução.", sections: [], cta: "Leia o guia.",
  coverImageBrief: "", visualBriefing: "", breadcrumbs: [], pillarArticleId: A1, supportArticleIds: [A2, A3, A4],
  indexationStatus: "index", alerts: [], confidence: 0.8, humanPendingDecisions: [],
}, PAGINA_S1, 1)) as VersionEnvelope<SiloPage>;

const item = (articleId: string, siloId: string | null, extra: Partial<RadarSiloExportItem> = {}): RadarSiloExportItem => ({
  articleId, siloId, status: "finalized", ...extra,
});

/*
 * A ORDEM DO PEDIDO É PROPOSITALMENTE EMBARALHADA: A2 antes de A1, e o Pilar
 * de S1 no meio. Se a saída seguir o pedido, a suíte percebe.
 */
const ITENS: RadarSiloExportItem[] = [
  item(A2, S1, { title: "Sérum para pele oleosa", principalKeyword: "sérum pele oleosa", slug: "serum-pele-oleosa", importedSiloDnaVersionId: S1_V1.versionId }),
  item(B1, S2, { title: "Rotina noturna para pele oleosa", principalKeyword: "rotina noturna pele oleosa", slug: "rotina-noturna", siloPage: { slug: "rotina-noturna-guia", canonical: "https://exemplo.com.br/rotina-noturna-guia", publicationStatus: "new" } }),
  item(A1, S1, { status: "not_finalized", title: "Guia de cuidados com a pele oleosa" }),
  item(A1, S1, { title: "Guia de cuidados com a pele oleosa", principalKeyword: "cuidados pele oleosa", slug: "cuidados-pele-oleosa" }),
  item(A3, S1, { status: "not_finalized", title: "Hidratante para pele oleosa", reason: "O Radar ainda não finalizou a investigação deste artigo." }),
  item(PAGINA_S1, S1, { unitType: "silo_page", title: "Página do silo" }),
  item(B2, S2, { title: "Ácido salicílico à noite", principalKeyword: "ácido salicílico noite", slug: "acido-salicilico-noite" }),
  item(C1, S3, { title: "Máscara de argila", principalKeyword: "máscara de argila", slug: "mascara-argila" }),
  item(D1, S4, { title: "Tônico sem álcool", principalKeyword: "tônico sem álcool", slug: "tonico-sem-alcool" }),
  item(E1, "", { title: "Artigo sem silo", principalKeyword: "limpeza facial", slug: "limpeza-facial" }),
  item(E2, S5, { title: "Artigo com silo de outra marca", principalKeyword: "argila verde", slug: "argila-verde" }),
];

const DESCRITORES = radarSiloMemberDescriptorsOfArticleDnas([
  { versionNumber: 1, payload: { articleId: A4, brandId: MARCA, suggestedSlug: "protetor-solar-rascunho" } },
  { versionNumber: 2, payload: { articleId: A4, brandId: MARCA, suggestedSlug: "protetor-solar-oil-free" } },
  /* Da outra marca: não pode emprestar slug. */
  { versionNumber: 9, payload: { articleId: A4, brandId: OUTRA_MARCA, suggestedSlug: "slug-da-outra-marca" } },
] as unknown as VersionEnvelope<ArticleDNA>[], MARCA);

const plano = (): RadarSiloExportPlan => planRadarSiloExport({
  today: "2026-09-23T15:04:05.000Z",
  brandId: MARCA,
  items: ITENS,
  siloVersions: [S1_V1, S2_V1, S1_V2, S3_V1, S4_V1, S5_OUTRA],
  siloPageVersions: [PAGINA_S1_V1],
  memberDescriptors: DESCRITORES,
});

const arquivo = (resultado: RadarSiloExportPlan, prefixo: string) => {
  const encontrado = resultado.files.find(file => file.filename.startsWith(prefixo));
  assert.ok(encontrado, `arquivo ${prefixo} ausente: ${resultado.files.map(file => file.filename).join(", ")}`);
  return encontrado;
};

const contextoDe = (resultado: RadarSiloExportPlan, articleId: string) => {
  const contexto = resultado.contextByArticleId[articleId];
  assert.ok(contexto, "a linha precisa do contexto do silo");
  return { md: contexto.silo_context_md, json: JSON.parse(contexto.silo_context_json) as Record<string, unknown> };
};

/* ================================ agrupamento ================================ */

test("agrupamento · um arquivo por silo, pela chave do RadarItem, na ordem em que os silos aparecem", () => {
  const resultado = plano();
  assert.deepEqual(resultado.files.map(file => file.filename), [
    "radar-silo-cuidados-com-a-pele-2026-09-23-parcial.csv",
    "radar-silo-rotina-noturna-2026-09-23.csv",
    "radar-silo-rotina-noturna-2-2026-09-23.csv",
    "radar-silo-sem-nome-1-2026-09-23.csv",
    "radar-sem-silo-2026-09-23.csv",
  ]);
  assert.deepEqual(arquivo(resultado, "radar-silo-rotina-noturna-2026").articleIds, [B1, B2]);
  assert.deepEqual(arquivo(resultado, "radar-silo-rotina-noturna-2-").articleIds, [C1]);

  /* A SiloPage entrou no pedido e não virou linha nem membro. */
  const todas = resultado.files.flatMap(file => [...file.articleIds, ...file.pending.map(membro => membro.articleId)]);
  assert.equal(todas.includes(PAGINA_S1), false, "a SiloPage não é linha");

  /* Cinco arquivos: um pacote só. */
  assert.deepEqual(resultado.delivery, { kind: "zip", filename: "radar-silos-2026-09-23.zip" });
  assert.equal(radarSiloExportArchiveFilename("2026-09-23T00:00:00Z"), "radar-silos-2026-09-23.zip");
});

test("agrupamento · o SiloDNA de maior versão dá nome, ordem e membros", () => {
  const resultado = plano();
  const s1 = arquivo(resultado, "radar-silo-cuidados");
  assert.equal(s1.siloName, "Cuidados com a Pele", "o nome precisa vir da versão 2, não da 1");
  assert.equal(s1.total, 4, "os membros são os da versão 2");
  assert.equal(contextoDe(resultado, A1).md.includes("Silo: Pele\n"), false);

  /* O artigo importado com a versão 1 é avisado — pela versão, sem id. */
  assert.ok(resultado.warnings.some(aviso =>
    aviso.includes("versão 2 do SiloDNA") && aviso.includes("\"Sérum para pele oleosa\" (versão 1)")),
  resultado.warnings.join("\n"));
});

/* ================================ ordem ================================ */

test("ordem · Pilar, depois a ordem narrativa, depois o resto — não a ordem do pedido", () => {
  const resultado = plano();
  const s1 = arquivo(resultado, "radar-silo-cuidados");
  /* Composição: A1 (Pilar), A3, A2 (ordem narrativa), A4 (só nos suportes). Linhas: só os finalizados. */
  assert.deepEqual(s1.articleIds, [A1, A2]);

  const serum = contextoDe(resultado, A2);
  assert.match(serum.md, /Este artigo: 3 de 4 na ordem do silo · papel: Suporte/);
  assert.deepEqual(serum.json.thisArticle, { position: 3, total: 4, role: "Suporte" });

  const guia = contextoDe(resultado, A1);
  assert.match(guia.md, /Este artigo: 1 de 4 na ordem do silo · papel: Pilar/);

  const ordem = guia.md.split("## Ordem narrativa")[1].split("## SiloPage")[0].trim().split("\n");
  assert.deepEqual(ordem, [
    "1. Pilar · \"Guia de cuidados com a pele oleosa\" · keyword: cuidados pele oleosa · slug: cuidados-pele-oleosa · finalizado, neste arquivo ← este artigo",
    "2. Suporte · \"Hidratante para pele oleosa\" · keyword: não informada · slug: não informado · não finalizado, fora deste arquivo",
    "3. Suporte · \"Sérum para pele oleosa\" · keyword: sérum pele oleosa · slug: serum-pele-oleosa · finalizado, neste arquivo",
    "4. Suporte · \"protetor-solar-oil-free\" · keyword: não informada · slug: protetor-solar-oil-free · não enviado ao Radar, fora deste arquivo",
  ]);

  const membros = guia.json.members as Array<Record<string, unknown>>;
  assert.deepEqual(membros.map(membro => [membro.position, membro.role, membro.status, membro.inThisFile]), [
    [1, "Pilar", "finalizado", true],
    [2, "Suporte", "não finalizado", false],
    [3, "Suporte", "finalizado", true],
    [4, "Suporte", "não enviado ao Radar", false],
  ]);
});

test("ordem · o Pilar abre o arquivo mesmo quando a ordem narrativa o põe depois", () => {
  const resultado = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA,
    items: [item(B2, S2, { title: "Ácido" }), item(B1, S2, { title: "Rotina" })],
    siloVersions: [siloDna({ siloId: S2, name: "Rotina Noturna", pillar: B1, supports: [B2], order: [B2, B1] })],
  });
  assert.deepEqual(resultado.files[0].articleIds, [B1, B2]);
  assert.match(contextoDe(resultado, B1).md, /Este artigo: 1 de 2 na ordem do silo · papel: Pilar/);
});

/* ================================ parcial ================================ */

test("parcial · nome com -parcial, faltantes com a situação, contexto que diz o que falta", () => {
  const resultado = plano();
  const s1 = arquivo(resultado, "radar-silo-cuidados");
  assert.equal(s1.partial, true);
  assert.match(s1.filename, /-parcial\.csv$/);
  assert.deepEqual(s1.pending.map(membro => [membro.articleId, membro.status]), [[A3, "not_finalized"], [A4, "not_sent"]]);
  assert.equal(s1.pending[0].reason, "O Radar ainda não finalizou a investigação deste artigo.");

  assert.ok(s1.warnings.some(aviso => aviso.startsWith("Silo \"Cuidados com a Pele\" saiu parcial: 2 de 4 artigos finalizados.")
    && aviso.includes("\"Hidratante para pele oleosa\" (não finalizado)")
    && aviso.includes("\"protetor-solar-oil-free\" (não enviado ao Radar)")), s1.warnings.join("\n"));

  const { md, json } = contextoDe(resultado, A2);
  assert.match(md, /Situação do silo neste arquivo: parcial — 2 de 4 artigos do silo estão neste arquivo/);
  assert.equal(json.complete, false);

  /* Completo não carrega "-parcial" nem aviso de parcial. */
  const s2 = arquivo(resultado, "radar-silo-rotina-noturna-2026");
  assert.equal(s2.partial, false);
  assert.deepEqual(s2.pending, []);
  assert.match(contextoDe(resultado, B2).md, /Situação do silo neste arquivo: completo — os 2 artigos do silo estão neste arquivo\./);
  assert.equal(RADAR_SILO_MEMBER_STATUS_LABEL.not_sent, "não enviado ao Radar");
});

test("parcial · silo sem nenhum finalizado não gera arquivo, só aviso", () => {
  const resultado = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA,
    items: [item(B1, S2, { status: "not_finalized", title: "Rotina noturna" }), item(C1, S3, { title: "Máscara" })],
    siloVersions: [S2_V1, S3_V1],
  });
  assert.deepEqual(resultado.files.map(file => file.filename), ["radar-silo-rotina-noturna-2026-09-23.csv"],
    "S3 sai com o nome dele: sem S2 no plano, não há colisão");
  assert.equal(resultado.emptySilos.length, 1);
  assert.equal(resultado.emptySilos[0].siloLabel, "Rotina Noturna");
  assert.deepEqual(resultado.emptySilos[0].pending.map(membro => membro.status), ["not_finalized", "not_sent"]);
  assert.ok(resultado.warnings.includes("Silo \"Rotina Noturna\": nenhum artigo finalizado; nada foi exportado dele."));
  assert.deepEqual(resultado.delivery, { kind: "csv", filename: "radar-silo-rotina-noturna-2026-09-23.csv" });
});

test("parcial · membro no Radar sob outro silo, e artigo que o SiloDNA não lista", () => {
  /* A2 é membro do SiloDNA de S1, mas o Radar o registra em S2. */
  const resultado = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA,
    items: [item(A1, S1, { title: "Guia" }), item(A2, S2, { title: "Sérum" }), item(B1, S2, { title: "Rotina" }), item(B2, S2, { title: "Ácido" })],
    siloVersions: [S1_V2, S2_V1],
  });
  const s1 = arquivo(resultado, "radar-silo-cuidados");
  /* Ordem de S1: A1 (Pilar), A3, A2, A4. Só A1 é linha; A2 está no Radar, mas em S2. */
  assert.deepEqual(s1.pending.map(membro => [membro.articleId, membro.status]), [
    [A3, "not_sent"], [A2, "other_silo"], [A4, "not_sent"],
  ]);
  assert.equal(s1.pending.find(membro => membro.articleId === A2)?.statusLabel, "no Radar sob outro silo");
  assert.match(contextoDe(resultado, A1).md, /3\. Suporte · "Sérum" · .* · no Radar sob outro silo, fora deste arquivo/);

  /* Em S2, o Sérum é linha — no fim, marcado como fora da composição. */
  const s2 = arquivo(resultado, "radar-silo-rotina-noturna");
  assert.deepEqual(s2.articleIds, [B1, B2, A2]);
  assert.match(contextoDe(resultado, A2).md, /3\. fora da composição do SiloDNA · "Sérum"/);
  assert.ok(s2.warnings.some(aviso => aviso.includes("não constam da versão 1 do SiloDNA")), s2.warnings.join("\n"));
  assert.equal(s2.partial, false, "todos os artigos do silo pelo Radar estão no arquivo");
});

/* ================================ colisão e nomes ================================ */

test("nomes · colisão sem diferenciar maiúsculas, silo sem nome, nome que limpa para vazio", () => {
  const resultado = plano();
  const s3 = arquivo(resultado, "radar-silo-rotina-noturna-2-");
  assert.equal(s3.siloLabel, "rotina noturna!", "o rótulo continua sendo o nome dado");

  const s4 = arquivo(resultado, "radar-silo-sem-nome-1");
  assert.equal(s4.siloLabel, "Silo sem nome 1");
  assert.equal(s4.siloName, null);
  assert.match(contextoDe(resultado, D1).md, /^Silo: Silo sem nome 1$/m);

  const S6 = uuid(106), F1 = uuid(251);
  const sinais = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA,
    items: [item(D1, S4, { title: "Tônico" }), item(F1, S6, { title: "Emoji" })],
    siloVersions: [S4_V1, siloDna({ siloId: S6, name: "!!! ???", pillar: F1, supports: [] })],
  });
  assert.deepEqual(sinais.files.map(file => [file.filename, file.siloLabel]), [
    ["radar-silo-sem-nome-1-2026-09-23.csv", "Silo sem nome 1"],
    ["radar-silo-sem-nome-2-2026-09-23.csv", "!!! ???"],
  ]);
});

test("nomes · a limpeza é a mesma do dossiê avulso", () => {
  const amostras = [
    "Cuidados com a Pele",
    "Sérum: ação/reação — 100% (ou não?)",
    "  --Rotina  Noturna--  ",
    "ÁÉÍÓÚ àèìòù ç ñ",
    "x".repeat(59) + " y",
  ];
  for (const amostra of amostras) {
    const avulso = radarPortableExportFilename({ articles: [{ slug: amostra, keyword: null }], today: "2026-09-23" });
    assert.equal(avulso, `radar-${radarSiloExportCleanName(amostra) || "artigo"}-dossie.csv`, `divergiu em ${amostra}`);
  }
  /* O corte em 60 pode terminar em hífen; o nome do arquivo de silo não fica com "--". */
  const longo = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA,
    items: [item(C1, S3, { title: "x" })],
    siloVersions: [siloDna({ siloId: S3, name: "x".repeat(59) + " y", pillar: C1, supports: [] })],
  });
  assert.equal(longo.files[0].filename, `radar-silo-${"x".repeat(59)}-2026-09-23.csv`);
});

/* ================================ sem silo ================================ */

test("sem silo · siloId vazio e SiloDNA de outra marca vão para o arquivo sem silo, com o motivo", () => {
  const resultado = plano();
  const semSilo = arquivo(resultado, "radar-sem-silo-");
  assert.equal(semSilo.kind, "no_silo");
  assert.deepEqual(semSilo.articleIds, [E1, E2]);

  assert.match(contextoDe(resultado, E1).md, /Sem silo: o artigo não tem silo registrado no Radar\./);
  const outra = contextoDe(resultado, E2);
  assert.match(outra.md, /Sem silo: o silo registrado para este artigo no Radar não tem SiloDNA disponível nesta marca/);
  assert.equal(outra.json.silo, null);

  /* O SiloDNA da outra marca não empresta nada — nem o nome. */
  const tudo = JSON.stringify(resultado);
  assert.equal(tudo.includes("Silo da Outra Marca"), false, "nome de silo de outra marca vazou");
  assert.equal(tudo.includes("slug-da-outra-marca"), false, "slug de artigo de outra marca vazou");
  assert.ok(resultado.warnings.some(aviso => aviso.includes("\"Artigo com silo de outra marca\"") && aviso.includes("não foi encontrado nesta marca")));
  assert.ok(resultado.warnings.includes("2 artigo(s) sem silo resolvido saíram em radar-sem-silo-2026-09-23.csv."));
});

test("entrega · um arquivo sai direto em CSV; nenhum, nada a baixar", () => {
  const um = planRadarSiloExport({ today: "2026-09-23", brandId: MARCA, items: [item(C1, S3, { title: "Máscara" })], siloVersions: [S3_V1] });
  assert.deepEqual(um.delivery, { kind: "csv", filename: "radar-silo-rotina-noturna-2026-09-23.csv" });

  const nenhum = planRadarSiloExport({ today: "2026-09-23", brandId: MARCA, items: [item(E1, null, { status: "not_finalized", title: "Sem silo" })], siloVersions: [] });
  assert.deepEqual(nenhum.files, []);
  assert.deepEqual(nenhum.delivery, { kind: "none", filename: null });
  assert.ok(nenhum.warnings.includes("1 artigo(s) sem silo resolvido não estão finalizados; nada foi exportado deles."));
});

/* ================================ SiloPage ================================ */

test("SiloPage · contexto com slug, canonical e status — da versão do Arquiteto, ou da hidratação", () => {
  const resultado = plano();
  const s1 = contextoDe(resultado, A1);
  assert.match(s1.md, /## SiloPage\n\nSlug: cuidados-com-a-pele\nCanonical: https:\/\/exemplo\.com\.br\/cuidados-com-a-pele\nURL publicada: https:\/\/exemplo\.com\.br\/cuidados-com-a-pele\nStatus: publicada\n/);
  assert.match(s1.md, /A SiloPage não tem dossiê do Radar/);
  assert.deepEqual(s1.json.siloPage, {
    slug: "cuidados-com-a-pele", canonical: "https://exemplo.com.br/cuidados-com-a-pele",
    publishedUrl: "https://exemplo.com.br/cuidados-com-a-pele", status: "publicada", radarDossier: false,
  });

  assert.match(contextoDe(resultado, B2).md, /Slug: rotina-noturna-guia\nCanonical: https:\/\/exemplo\.com\.br\/rotina-noturna-guia\nStatus: nova, ainda não publicada/);
  assert.match(contextoDe(resultado, D1).md, /Nenhuma SiloPage registrada para este silo no momento da exportação\./);
});

test("contexto · objetivo, público, problema, intenção, tópicos e fronteira do SiloDNA", () => {
  const { md, json } = contextoDe(plano(), A2);
  for (const trecho of [
    "Objetivo: Construir autoridade em cuidados com pele oleosa.",
    "Público: Pessoas com pele oleosa que querem uma rotina simples.",
    "Problema central: Brilho excessivo e poros obstruídos sem saber por onde começar.",
    "Intenção dominante: informacional",
    "Por que estes artigos pertencem juntos: Quem tem pele oleosa precisa de rotina, e não de produto solto.",
    "Tópicos incluídos:\n- limpeza\n- hidratação leve\n- protetor solar oil free",
    "Tópicos excluídos — não cubra neste silo:\n- tratamento de acne com medicamento",
    "Fronteira: Pele oleosa no rosto; acne clínica fica fora.",
  ]) assert.ok(md.includes(trecho), `faltou: ${trecho}`);
  assert.deepEqual(json.includedTopics, ["limpeza", "hidratação leve", "protetor solar oil free"]);
  assert.equal(json.centralProblem, "Brilho excessivo e poros obstruídos sem saber por onde começar.");

  /* Tópicos demais são cortados com a contagem declarada, não em silêncio. */
  const muitos = planRadarSiloExport({
    today: "2026-09-23", brandId: MARCA, items: [item(C1, S3, { title: "x" })],
    siloVersions: [siloDna({ siloId: S3, name: "Muitos", pillar: C1, supports: [], included: Array.from({ length: 45 }, (_, indice) => `tópico ${indice + 1}`) })],
  });
  const cortado = contextoDe(muitos, C1);
  assert.match(cortado.md, /- tópico 40\n- \(\+5 não listados aqui\)/);
  assert.equal(cortado.json.includedTopicsOmitted, 5);
});

/* ================================ higiene ================================ */

const ENDERECOS_INTERNOS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i,
  /sha256:/,
  /legacy:/,
  /territory:/,
];

const CHAVES_PROIBIDAS = new Set([
  "id", "siloId", "articleId", "brandId", "versionId", "entityId", "contentHash", "siloDnaVersionId",
  "siloPageId", "articleDnaVersionId", "territoryRef", "nearbySiloIds", "keywordId", "createdBy",
]);

function chavesDe(valor: unknown, saida: string[] = []): string[] {
  if (Array.isArray(valor)) valor.forEach(item => chavesDe(item, saida));
  else if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) { saida.push(chave); chavesDe(filho, saida); }
  }
  return saida;
}

test("higiene · nenhum id, versão técnica ou hash no contexto do silo", () => {
  const resultado = plano();
  const ids = [MARCA, OUTRA_MARCA, S1, S2, S3, S4, S5, A1, A2, A3, A4, B1, B2, C1, D1, E1, E2, PAGINA_S1,
    S1_V1.versionId, S1_V2.versionId, S1_V2.contentHash, PAGINA_S1_V1.versionId, uuid(777)];

  const contextos = Object.values(resultado.contextByArticleId);
  assert.equal(contextos.length, 8, "uma entrada por linha: A1, A2, B1, B2, C1, D1, E1, E2");

  for (const contexto of contextos) {
    for (const celula of [contexto.silo_context_md, contexto.silo_context_json]) {
      for (const id of ids) assert.equal(celula.includes(id), false, `id interno no contexto: ${id}`);
      for (const padrao of ENDERECOS_INTERNOS) {
        const encontro = celula.match(padrao);
        assert.equal(encontro, null, `endereço interno no contexto: ${encontro?.[0]}`);
      }
    }
    const proibidas = chavesDe(JSON.parse(contexto.silo_context_json)).filter(chave => CHAVES_PROIBIDAS.has(chave));
    assert.deepEqual(proibidas, [], "chave de id no silo_context_json");
  }

  /* Os avisos vão para a tela — e também não carregam id. */
  for (const aviso of resultado.warnings) {
    for (const id of ids) assert.equal(aviso.includes(id), false, `id interno no aviso: ${aviso}`);
  }
  for (const file of resultado.files) {
    for (const id of ids) assert.equal(file.filename.includes(id), false, "id no nome do arquivo");
  }
});

test("integração · as colunas entram no CSV do dossiê, e os CSVs entram no zip", () => {
  const resultado = plano();
  const csvs = resultado.files.map(file => ({
    name: file.filename,
    text: radarPortableExportCsv(file.articleIds.map(articleId => ({
      title: ITENS.find(entrada => entrada.articleId === articleId && entrada.status === "finalized")?.title || "",
      ...resultado.contextByArticleId[articleId],
    }))),
  }));

  /* As duas colunas novas seguem a regra de sufixo e mantêm JSON ≤ Markdown. */
  const colunas = Object.keys(resultado.contextByArticleId[A1]);
  assert.deepEqual(colunas, ["silo_context_md", "silo_context_json"]);
  assert.ok(colunas.every(coluna => /_(md|json)$/.test(coluna)));

  for (const csv of csvs) {
    for (const padrao of ENDERECOS_INTERNOS) assert.equal(csv.text.match(padrao), null, `endereço interno em ${csv.name}`);
  }

  const zip = radarStoredZipOfTexts(csvs, { modifiedAt: new Date(2026, 8, 23, 15, 4, 6) });
  const texto = new TextDecoder("utf-8").decode(zip);
  for (const csv of csvs) assert.ok(texto.includes(csv.name), `o zip precisa conter ${csv.name}`);
  assert.ok(texto.includes("Sérum para pele oleosa"), "o conteúdo acentuado atravessa o zip");
});

/* ================================ pureza ================================ */

test("pureza · o módulo não lê banco, rede, storage nem React", async () => {
  const fonte = (await readFile(new URL("../lib/radar/portable-silo-export.ts", import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(fonte, /\bfetch\(/);
  assert.doesNotMatch(fonte, /supabase|localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(fonte, /from\s+["']react/);
  const imports = fonte.match(/^import[^;]+;/gm) || [];
  assert.ok(imports.every(linha => linha.startsWith("import type")), `só import de tipo: ${imports.join(" | ")}`);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
