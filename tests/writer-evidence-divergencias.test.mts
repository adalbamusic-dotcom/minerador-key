import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleId, articleVersion, atorMcp, brandA, brandB, bundleGoogle, conferirFormaDaLeitura, conferirMarca, contexto,
  documentId, documentoV2, documentV1, documentYoutube, erroDe, grantAtivo, grantOutraMarca, grantSoLeitura, kw1,
  prepararDivergencias, registros, reiniciar, skillVersion, tabelasDoFalso,
} from "./writer-evidence-reader.test.mts";

/*
 * ETAPA B2 DO LEITOR DE EVIDÊNCIAS · CONSUMIDORES, CONTRA O MESMO POSTGREST FALSO.
 *
 * SDD docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §4.4, §5 e §9; adendo D1, D3, D5 e D9. O falso do leitor ganhou a tabela
 * `writer_evidence_divergences` em dois modos — pendente (PGRST205) e
 * aplicada, com os gatilhos e CHECKs da migration reimplementados de forma
 * independente. Qualquer escrita noutra tabela faz o falso lançar: é assim
 * que "nada escreve em DNA" é provado por comportamento.
 *
 * O DeepSeek é falso (`fetchImpl` da camada canônica de IA): nenhuma chamada
 * paga, nenhuma rede.
 */

const {
  checkOpenBlockingWriterDivergence, insertWriterDivergence, readOpenWriterDivergences, readWriterGuardianContext, recordWriterDivergenceFromMcp,
  writerGuardianContextOf, WRITER_OPEN_DIVERGENCES_LIMIT,
} = await import("../lib/server/writer-evidence-divergences.ts");
const { writerDivergenceRow } = await import("../lib/redator/writer-evidence-divergence.ts");
const { readWriterSectionEvidence, registerWriterAiAlerts, runWriterImproveProposal, runWriterSectionProposal, WRITER_AI_ALERTS_REGISTERED_MAX } = await import("../lib/server/writer-evidence-ai.ts");
const { readWriterEvidenceHead } = await import("../lib/server/writer-evidence-document.ts");
const { describeWriterEvidenceSource } = await import("../lib/server/writer-evidence-reader.ts");
const { createClient } = await import("@supabase/supabase-js");
const { generateStructuredAI } = await import("../lib/server/structured-ai.ts");
const { WriterImproveProviderSchema, WriterSectionProviderSchema, WRITER_SECTION_PACKAGE_MAX_BYTES } = await import("../lib/redator/writer-section-evidence.ts");
const { runGuardian } = await import("../lib/redator/guardian.ts");
const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { DEEPSEEK_API_URL } = await import("../lib/deepseek-model-config.ts");

type Linha = Record<string, unknown>;
type Provedor = Parameters<typeof generateStructuredAI>[0]["provider"];

const OBSERVADO_EM = "2026-09-14T23:49:44.887Z";
const versaoDaQualificacao = (keywordId: string, versao: number) => `keyword_semantic_qualification:${brandA}:${keywordId}:v${versao}`;

const pedidoBase = () => ({
  target: { kind: "article_dna" as const },
  dnaClaim: { path: "mainIntent", summary: "O DNA declara intenção informacional; as perguntas observadas pedem comparação." },
  evidence: { sourceKey: "radar.bundle.observed.questions" },
  severity: "alerta" as const,
});

const gravar = (pedido: ReturnType<typeof pedidoBase> | Linha, opcoes: { brandId?: string; grant?: string | null; ator?: string } = {}) =>
  recordWriterDivergenceFromMcp(contexto(opcoes.brandId ?? brandA), {
    documentId, request: pedido as ReturnType<typeof pedidoBase>, actorUserId: opcoes.ator ?? atorMcp,
    mcpGrantId: opcoes.grant === undefined ? grantAtivo : opcoes.grant,
  });

const escritas = () => registros.filter(registro => registro.method !== "GET" && registro.method !== "HEAD" && !registro.table.startsWith("rpc/"));
const divergencias = () => tabelasDoFalso().writer_evidence_divergences as Linha[];

/* ================================ divergências ================================ */

test("divergência · sem a migration responde migration_pendente, não grava em lugar nenhum, e o Guardião segue com aviso", async () => {
  reiniciar("pendente");
  prepararDivergencias(false);
  const erro = await erroDe(gravar(pedidoBase()));
  assert.equal(erro.code, "migration_pendente");
  assert.deepEqual(escritas().map(registro => `${registro.method} ${registro.table}`), ["POST writer_evidence_divergences"], "só a tentativa na tabela que não existe");

  const lidas = await readOpenWriterDivergences(contexto(), documentId);
  assert.equal(lidas.status, "migration_pendente");
  const contextoDoGuardiao = writerGuardianContextOf(lidas);
  assert.match(contextoDoGuardiao.notices?.[0] ?? "", /migration_pendente/);

  const head = await readWriterEvidenceHead(contexto(), documentId);
  registros.length = 0;
  const alertas = await registerWriterAiAlerts(contexto(), {
    head, evidence: { package: null, notice: null }, alerts: ["Falta estudo citado.", "Outro alerta."], actorUserId: atorMcp,
    focus: { kind: "section", id: "b1", label: "Rotina" },
  });
  assert.equal(alertas.status, "migration_pendente");
  assert.deepEqual(alertas.notRecorded.map(item => item.reason), ["migration_pendente", "migration_pendente"]);
  assert.equal(escritas().length, 1, "depois do primeiro PGRST205 não tenta de novo");
  conferirMarca(brandA);
});

test("divergência · a IA só cria 'aberta'; alvo e hierarquia vêm do servidor; a mesma divergência é um registro só", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const gravada = await gravar(pedidoBase());
  assert.equal(gravada.status, "recorded");
  assert.equal(divergencias().length, 1);
  assert.ok(!registros.some(registro => registro.table === "editorial_artifact_versions" && /artifact_type=eq\.brand_(dna|skill)/.test(registro.params.toString())),
    "alvo no ArticleDNA não lê o contexto da Marca");
  const [linha] = divergencias();
  assert.equal(linha.status, "aberta");
  assert.equal(linha.severity, "alerta");
  assert.equal(linha.origin, "ia_mcp");
  assert.equal(linha.mcp_grant_id, grantAtivo);
  assert.equal(linha.created_by, atorMcp);
  assert.equal(linha.marca_id, brandA);
  assert.equal(linha.article_id, articleId);
  assert.equal(linha.target_kind, "article_dna");
  assert.equal(linha.target_entity_id, articleId);
  assert.equal(linha.target_version_id, articleVersion);
  assert.equal(linha.suggested_owner, "arquiteto");
  assert.equal(linha.evidence_frozen, true);
  assert.equal(linha.evidence_hierarchy_level, "CURRENT_SUFFICIENT_SERP", "o Radar declarou a SERP autoritativa no congelamento");
  assert.equal(linha.evidence_observed_at, OBSERVADO_EM);
  assert.equal(linha.evidence_posterior_ao_pacote, false);
  for (const decisao of ["status_changed_by", "status_changed_via", "status_changed_at", "blocking_marked_by", "status_reason", "resolution_ref"]) {
    assert.ok(linha[decisao] === undefined || linha[decisao] === null, `a IA não traz decisão humana: ${decisao}`);
  }
  assert.equal(gravada.divergence.id, linha.id);

  const repetida = await gravar(pedidoBase());
  assert.equal(repetida.status, "already_recorded");
  assert.equal(repetida.divergence.id, linha.id);
  assert.equal(divergencias().length, 1, "idempotente pela chave de dedupe");

  /* Evidência fora do dossiê: cache de SERP coletado depois do pacote. Nunca SERP vigente, sempre datada. */
  const cache = await gravar({
    target: { kind: "keyword_dna", keywordId: kw1 }, dnaClaim: { path: "semanticIntent", summary: "A SERP atual mostra intenção comercial." },
    evidence: { sourceKey: `serp.cache/${kw1}#desktop-windows` }, severity: "info",
  });
  const doCache = divergencias().find(item => item.id === cache.divergence.id)!;
  assert.equal(doCache.evidence_frozen, false);
  assert.equal(doCache.evidence_hierarchy_level, "OTHER_RADAR_EVIDENCE");
  assert.equal(doCache.evidence_posterior_ao_pacote, true);
  assert.equal(doCache.target_version_id, versaoDaQualificacao(kw1, 2), "a versão fixada no documento, nunca a mais nova");
  assert.equal(doCache.suggested_owner, "minerador");
  assert.equal(doCache.severity, "info");

  /* DNA citado como evidência é hipótese, não prova. */
  const doDna = await gravar({ ...pedidoBase(), dnaClaim: { path: "requiredTopics", summary: "O DNA pede ordem da rotina." }, evidence: { sourceKey: `dna.keyword/${kw1}` } });
  assert.equal(divergencias().find(item => item.id === doDna.divergence.id)?.evidence_hierarchy_level, "ARTICLE_DNA_HYPOTHESIS");
  conferirMarca(brandA);
});

test("divergência · id inventado, chave fora do manifesto, outra Marca e falta de grant são recusados antes de gravar", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const casos: Array<[Linha, string]> = [
    [{ ...pedidoBase(), target: { kind: "keyword_dna", keywordId: "44444444-4444-4444-8444-000000000000" } }, "target_not_in_document"],
    [{ ...pedidoBase(), target: { kind: "keyword_dna" } }, "target_not_in_document"],
    [{ ...pedidoBase(), target: { kind: "article_dna", versionId: "article-v3-mais-nova" } }, "target_not_in_document"],
    [{ ...pedidoBase(), target: { kind: "brand_dna", versionId: "skill-outra-marca" } }, "target_not_in_document"],
    [{ ...pedidoBase(), target: { kind: "brand_dna" } }, "target_not_in_document"],
    [{ ...pedidoBase(), evidence: { sourceKey: "dna.article/versao-inventada" } }, "source_not_in_manifest"],
    [{ ...pedidoBase(), evidence: { sourceKey: "fonte.inventada" } }, "source_not_in_manifest"],
    [{ ...pedidoBase(), evidence: { sourceKey: "graph.article/graph:silo-9:v1" } }, "source_not_in_manifest"],
    [{ ...pedidoBase(), evidence: { sourceKey: "specialist.posterior" } }, "count_only"],
    [{ ...pedidoBase(), evidence: { sourceKey: "dna.siloPage" } }, "source_absent"],
  ];
  for (const [pedido, codigo] of casos) {
    registros.length = 0;
    const erro = await erroDe(gravar(pedido));
    assert.equal(erro.code, codigo, JSON.stringify(pedido));
    assert.equal(escritas().length, 0, `${codigo}: nada gravado`);
  }

  registros.length = 0;
  assert.equal((await erroDe(gravar(pedidoBase(), { grant: null }))).code, "divergence_requires_grant");
  assert.equal(registros.length, 0, "sem grant, nem a linha do documento é lida");

  registros.length = 0;
  assert.equal((await erroDe(gravar(pedidoBase(), { brandId: brandB }))).code, "document_not_found");
  assert.equal(escritas().length, 0);
  conferirMarca(brandB);

  /* O gatilho confere de novo o grant: sem escopo de escrita, de outra Marca ou de outro ator, o banco recusa. */
  for (const [grant, ator] of [[grantSoLeitura, atorMcp], [grantOutraMarca, atorMcp], [grantAtivo, "87654321-4321-4321-8321-210987654321"]] as const) {
    const erro = await erroDe(gravar(pedidoBase(), { grant, ator }));
    assert.equal(erro.code, "divergence_refused", `${grant} / ${ator}`);
  }
  assert.equal(divergencias().length, 0, "nenhuma recusa deixou registro");
});

test("divergência · a gravação recusa, antes do banco, linha de outra Marca ou que não nasce aberta", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const linha = writerDivergenceRow({
    brandId: brandA, documentId, articleId, target: { kind: "article_dna", entityId: articleId, versionId: articleVersion, contentHash: null },
    claim: { path: "mainIntent", summary: "Resumo." },
    evidence: { sourceKey: "ia.interna/section", path: null, etag: null, level: "AI_INTERPRETATION", frozen: false, observedAt: null, posteriorAoPacote: false },
    severity: "alerta", origin: "ia_interna", mcpGrantId: null, createdBy: atorMcp,
  });
  assert.equal((await erroDe(insertWriterDivergence(contexto(brandB), linha))).code, "divergence_refused", "a Marca da linha precisa ser a do contexto");
  assert.equal((await erroDe(insertWriterDivergence(contexto(), { ...linha, status: "resolvida" as "aberta" }))).code, "divergence_refused");
  assert.equal(escritas().length, 0, "nada chegou ao banco");
  assert.equal((await insertWriterDivergence(contexto(), linha)).status, "recorded");
});

test("divergência · alvo na Marca só pela Skill ou BrandDNA vigentes, pela regra do dono", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const gravada = await gravar({ ...pedidoBase(), target: { kind: "brand_dna", versionId: skillVersion }, dnaClaim: { path: "sections.s1", summary: "A voz pede tom técnico; o especialista usa tom coloquial." } });
  const linha = divergencias().find(item => item.id === gravada.divergence.id)!;
  assert.equal(linha.target_kind, "brand_dna");
  assert.equal(linha.target_version_id, skillVersion);
  assert.equal(linha.target_entity_id, "skill:voz");
  assert.equal(linha.suggested_owner, "marca");
  assert.ok(registros.some(registro => registro.table === "editorial_artifact_versions" && /artifact_type=eq\.brand_skill/.test(registro.params.toString())),
    "alvo na Marca lê o contexto da Marca — a conferência do teste anterior não é vazia");
  conferirMarca(brandA);
});

test("divergência · o etag que a IA declara não é gravado; o servidor grava a identidade da fonte que ele mesmo calcula", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const forjado = "we:etag-declarado-pela-ia";
  const gravada = await gravar({ ...pedidoBase(), evidence: { sourceKey: "radar.bundle.observed.questions", path: "3", etag: forjado } });
  const linha = divergencias().find(item => item.id === gravada.divergence.id)!;
  assert.notEqual(linha.evidence_etag, forjado, "etag da IA não vira prova de leitura");
  const head = await readWriterEvidenceHead(contexto(), documentId);
  const descrita = await describeWriterEvidenceSource(contexto(), head, "radar.bundle.observed.questions");
  assert.ok(descrita.identityEtag?.startsWith("src:we:"), String(descrita.identityEtag));
  assert.equal(linha.evidence_etag, descrita.identityEtag);
  assert.equal(linha.evidence_path, "3", "o caminho continua o apontado: é onde olhar");

  const mutavel = await gravar({
    target: { kind: "keyword_dna", keywordId: kw1 }, dnaClaim: { path: "volume", summary: "A métrica atual diverge do DNA." },
    evidence: { sourceKey: "dna.keyword.metrics", etag: forjado }, severity: "info",
  });
  assert.equal(divergencias().find(item => item.id === mutavel.divergence.id)?.evidence_etag, null, "fonte mutável não tem identidade: nenhum etag é gravado");
  conferirMarca(brandA);
});

/* ================= Guardião e entrega · falha de leitura e bloqueante ================= */

const clienteQueFalha = createClient("http://supabase.test", "chave-de-teste", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (async () => new Response(JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout DADO-DA-LINHA", details: null, hint: null }),
      { status: 500, headers: { "content-type": "application/json" } })) as typeof fetch,
  },
});

test("Guardião · falha transitória ao ler divergências vira aviso e a análise determinística segue; a leitura estrita e a entrega não engolem o erro", async () => {
  const contextoQueFalha = { brandId: brandA, client: clienteQueFalha };
  const lido = await readWriterGuardianContext(contextoQueFalha, documentId);
  assert.deepEqual(lido.divergences, []);
  assert.match(lido.notices?.[0] ?? "", /^divergencias_nao_lidas \(statement_timeout\)/);
  assert.doesNotMatch(lido.notices?.[0] ?? "", /DADO-DA-LINHA|canceling/, "a mensagem do driver não vaza");
  const documento = documentoDoNavegador();
  const relatorio = runGuardian(documento, "hash-doc", lido);
  assert.deepEqual(relatorio.findings, runGuardian(documento, "hash-doc").findings, "as regras determinísticas seguem iguais");
  assert.match(relatorio.notices?.[0] ?? "", /divergencias_nao_lidas/);
  await assert.rejects(readOpenWriterDivergences(contextoQueFalha, documentId));
  await assert.rejects(checkOpenBlockingWriterDivergence(contextoQueFalha, documentId), "quem decide a entrega não segue às cegas");

  reiniciar("pendente");
  prepararDivergencias(false);
  assert.match((await readWriterGuardianContext(contexto(), documentId)).notices?.[0] ?? "", /^migration_pendente/);
});

test("entrega · divergência bloqueante não encerrada barra o envio a Publicações; encerrada, de outra Marca, de outro documento ou só alerta não barra", async () => {
  reiniciar("pendente");
  prepararDivergencias(false);
  assert.deepEqual(await checkOpenBlockingWriterDivergence(contexto(), documentId), { status: "migration_pendente", blocking: false });
  prepararDivergencias(true);
  assert.deepEqual(await checkOpenBlockingWriterDivergence(contexto(), documentId), { status: "read", blocking: false });
  const linha = (id: string, extra: Linha) => ({ id, marca_id: brandA, document_id: documentId, status: "aberta", severity: "alerta", ...extra });
  divergencias().push(
    linha("b1-alerta", {}),
    linha("b2-resolvida", { severity: "bloqueante", status: "resolvida" }),
    linha("b3-descartada", { severity: "bloqueante", status: "descartada" }),
    { ...linha("b4-outra-marca", { severity: "bloqueante" }), marca_id: brandB },
    { ...linha("b5-outro-documento", { severity: "bloqueante" }), document_id: "writer:doc-grande" },
  );
  registros.length = 0;
  assert.deepEqual(await checkOpenBlockingWriterDivergence(contexto(), documentId), { status: "read", blocking: false });
  divergencias().push(linha("b6-reconhecida", { severity: "bloqueante", status: "reconhecida" }));
  assert.deepEqual(await checkOpenBlockingWriterDivergence(contexto(), documentId), { status: "read", blocking: true });
  const consultas = registros.filter(registro => registro.table === "writer_evidence_divergences");
  assert.equal(consultas.length, 2);
  for (const consulta of consultas) {
    assert.equal(consulta.method, "GET", "HEAD esconderia o PGRST205 da migration pendente");
    assert.equal(consulta.select, "id");
    assert.equal(consulta.params.get("marca_id"), `eq.${brandA}`);
    assert.equal(consulta.params.get("document_id"), `eq.${documentId}`);
    assert.equal(consulta.params.get("severity"), "eq.bloqueante");
    assert.equal(consulta.params.get("status"), "in.(aberta,reconhecida,enviada_ao_dono)");
    assert.equal(consulta.params.get("limit"), "1");
  }
});

/* ============================ pacote da seção ============================ */

test("pacote da seção · ≤ 24 kB, montado da linha do documento pela Marca, sem payload; o que casa com a seção vem primeiro", async () => {
  for (const modo of ["pendente", "aplicada"] as const) {
    reiniciar(modo);
    const lido = await readWriterSectionEvidence(contexto(), documentId, { kind: "section", id: "b1", label: "Pergunta observada 9: niacinamida" });
    const pacote = lido.evidence.package!;
    assert.ok(pacote, lido.evidence.notice ?? "sem pacote");
    assert.ok(lido.bytes! <= WRITER_SECTION_PACKAGE_MAX_BYTES, `${lido.bytes} B`);
    assert.equal(pacote.kind, "writer_section_evidence");
    assert.ok(pacote.guards.some(guarda => /FAQ/.test(guarda)), "guarda de FAQ");
    assert.ok(pacote.guards.some(guarda => /terceiros/.test(guarda)), "guarda de terceiros");
    assert.equal(pacote.questions[0].question, "Pergunta observada 9?", "a pergunta da seção vem primeiro");
    assert.ok(pacote.questions[0].matchesSection);
    assert.deepEqual(pacote.entities.article, ["niacinamida"]);
    assert.equal(pacote.article?.versionId, articleVersion);
    assert.equal(pacote.article?.fields.promise, "Rotina simples para pele oleosa");
    assert.ok(pacote.specialist?.items.length, "especialista congelado entra");
    const fontes = new Map(pacote.sources.map(fonte => [fonte.sourceKey, fonte.level]));
    assert.equal(fontes.get("radar.bundle.observed.questions"), "CURRENT_SUFFICIENT_SERP");
    assert.equal(fontes.get("radar.bundle.specialist"), "QUALIFIED_SPECIALIST");
    assert.equal(fontes.get(`dna.article/${articleVersion}`), "ARTICLE_DNA_HYPOTHESIS");
    assert.ok(![...fontes.keys()].some(chave => /externalSources|internalLinks|evidence\b/.test(chave)), "o peso do dossiê não entra");
    conferirFormaDaLeitura();
    conferirMarca(brandA);
    assert.ok(!registros.some(registro => registro.table.startsWith("rpc/")), "o pacote não depende da migration");
    const lidos = registros.filter(registro => registro.table === "content_documents").reduce((total, registro) => total + registro.responseBytes, 0);
    assert.ok(lidos < 160_000, `o pacote leu ${lidos} B do documento`);
  }
});

test("pacote da seção · dossiê grande corta e diz onde ler; YOUTUBE e v1 declaram a ausência; outra Marca interrompe", async () => {
  reiniciar("pendente");
  const grande = await readWriterSectionEvidence(contexto(), "writer:doc-grande", { kind: "section", id: "b1", label: "Rotina" });
  assert.ok(grande.bytes! <= WRITER_SECTION_PACKAGE_MAX_BYTES, `${grande.bytes} B`);
  const cortes = new Map(grande.evidence.package!.trimmed.map(item => [item.field, item]));
  assert.equal(cortes.get("questions")?.total, 300);
  assert.equal(cortes.get("questions")?.readAt, "radar.bundle.observed.questions");
  assert.ok((cortes.get("questions")?.kept ?? 0) > 0);

  const youtube = await readWriterSectionEvidence(contexto(), documentYoutube, { kind: "section", id: "b1", label: "Rotina" });
  assert.ok(youtube.evidence.package!.absent.some(item => /YOUTUBE/.test(item.reason)));
  assert.deepEqual(youtube.evidence.package!.questions, []);

  const v1 = await readWriterSectionEvidence(contexto(), documentV1, { kind: "section", id: "b1", label: "Rotina" });
  assert.equal(v1.evidence.package!.bundle, null);
  assert.ok(v1.evidence.package!.absent.some(item => item.field === "bundle"));

  const corrompido = await readWriterSectionEvidence(contexto(), "writer:doc-corrompido", { kind: "section", id: "b1", label: "Rotina" });
  assert.equal(corrompido.evidence.package, null);
  assert.match(corrompido.evidence.notice ?? "", /document_incompatible/);

  assert.equal((await erroDe(readWriterSectionEvidence(contexto(brandB), documentId, { kind: "section", id: "b1", label: "x" }))).code, "document_not_found");
});

/* ========================== IA interna com DeepSeek falso ========================== */

const FORJADA = "EVIDENCIA-FORJADA-DO-NAVEGADOR";
const provedor = { provider: "deepseek", apiKey: "chave-falsa-que-nao-sai-daqui", apiUrl: DEEPSEEK_API_URL, model: "deepseek-v4-pro", extraHeaders: {}, thinkingMode: "provider_default" } as unknown as Provedor;

function deepseekFalso(resposta: unknown, capturados: Linha[]) {
  return async (_url: RequestInfo | URL, init?: RequestInit) => {
    capturados.push(JSON.parse(String(init?.body)) as Linha);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(resposta) }, finish_reason: "stop" }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

/** O documento como o navegador o manda: blocos em edição e um dossiê que o servidor NÃO deve usar. */
function documentoDoNavegador() {
  const forjado = { ...bundleGoogle(), observed: { ...bundleGoogle().observed, questions: [{ id: "forjada", canonicalQuestion: `${FORJADA}?` }] } };
  const base = documentoV2(documentId, forjado, "GOOGLE") as unknown as Linha;
  const provenance = { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] };
  return ContentDocumentSchema.parse({ ...base, blocks: [{ id: "h2-noite", type: "heading", level: 2, text: "Pergunta observada 3: rotina da noite", provenance }, ...(base.blocks as unknown[])] });
}

const mensagens = (corpo: Linha) => (corpo.messages as Array<{ role: string; content: string }>);

test("IA interna · a seção leva o pacote do servidor e as guardas; o navegador não injeta evidência; alertas viram divergências", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const capturados: Linha[] = [];
  const respostaDaIa = {
    paragraphs: ["À noite, a niacinamida entra depois da limpeza."],
    alerts: [
      "Falta estudo citado para a afirmação sobre sebo.",
      { message: "As perguntas observadas pedem comparação; o DNA declara intenção só informacional.", targetKind: "article_dna", dnaClaimPath: "mainIntent", evidenceSourceKey: "radar.bundle.observed.questions#3" },
      { message: "Keyword que não está no documento.", targetKind: "keyword_dna", keywordId: "44444444-4444-4444-8444-000000000000" },
    ],
  };
  const resultado = await runWriterSectionProposal({
    context: contexto(), actorUserId: atorMcp, document: documentoDoNavegador(), sectionId: "h2-noite", humanInstruction: "Clareza.",
    generate: ({ system, user }) => generateStructuredAI({ provider: provedor, system, user, schema: WriterSectionProviderSchema, maxTokens: 2400, fetchImpl: deepseekFalso(respostaDaIa, capturados) as typeof fetch }),
  });

  assert.equal(capturados.length, 1, "uma chamada ao modelo, falsa");
  const [sistema, usuario] = mensagens(capturados[0]).map(mensagem => mensagem.content);
  assert.match(sistema, /FAQ/);
  assert.match(sistema, /terceiros/);
  assert.match(sistema, /JSON/);
  assert.match(sistema, /evidenceSourceKey/);
  assert.match(usuario, /writer_section_evidence/);
  assert.match(usuario, /Pergunta observada 3\?/, "a evidência vem do banco");
  assert.doesNotMatch(usuario, new RegExp(FORJADA), "o dossiê do navegador não entra no prompt");
  assert.ok(resultado.evidence.included);
  assert.ok((resultado.evidence.bytes ?? Infinity) <= WRITER_SECTION_PACKAGE_MAX_BYTES);

  assert.deepEqual(resultado.proposal.paragraphs, respostaDaIa.paragraphs);
  assert.equal(resultado.proposal.alerts.length, 3, "a tela continua recebendo todos os alertas");
  assert.equal(resultado.proposal.humanDecisionRequired, true);
  assert.equal(resultado.divergences.status, "partial");
  assert.equal(resultado.divergences.recorded.length, 2);
  assert.match(resultado.divergences.notRecorded[0].reason, /keyword/);

  const gravadas = divergencias();
  assert.equal(gravadas.length, 2);
  for (const linha of gravadas) {
    assert.equal(linha.origin, "ia_interna");
    assert.equal(linha.mcp_grant_id, null);
    assert.equal(linha.created_by, atorMcp);
    assert.equal(linha.status, "aberta");
    assert.equal(linha.severity, "alerta");
    assert.equal(linha.target_version_id, articleVersion);
  }
  const livre = gravadas.find(linha => linha.dna_claim_path === "nao_declarado")!;
  assert.equal(livre.evidence_source_key, "ia.interna/section");
  assert.equal(livre.evidence_path, "h2-noite");
  assert.equal(livre.evidence_hierarchy_level, "AI_INTERPRETATION");
  assert.equal(livre.evidence_frozen, false);
  const apontada = gravadas.find(linha => linha.dna_claim_path === "mainIntent")!;
  assert.equal(apontada.evidence_source_key, "radar.bundle.observed.questions#3");
  assert.equal(apontada.evidence_frozen, true);
  assert.equal(apontada.evidence_hierarchy_level, "CURRENT_SUFFICIENT_SERP");
  conferirFormaDaLeitura();
  conferirMarca(brandA);
});

test("IA interna · sem a migration a proposta sai igual e os alertas voltam 'não registrado'; outra Marca não chega ao modelo", async () => {
  reiniciar("pendente");
  prepararDivergencias(false);
  const capturados: Linha[] = [];
  const resultado = await runWriterSectionProposal({
    context: contexto(), actorUserId: atorMcp, document: documentoDoNavegador(), sectionId: "h2-noite", humanInstruction: "",
    generate: ({ system, user }) => generateStructuredAI({ provider: provedor, system, user, schema: WriterSectionProviderSchema, fetchImpl: deepseekFalso({ paragraphs: ["Texto."], alerts: ["Alerta um.", "Alerta dois."] }, capturados) as typeof fetch }),
  });
  assert.equal(resultado.proposal.paragraphs[0], "Texto.");
  assert.equal(resultado.divergences.status, "migration_pendente");
  assert.deepEqual(resultado.divergences.notRecorded.map(item => item.message), ["Alerta um.", "Alerta dois."]);

  const chamadas: Linha[] = [];
  const erro = await erroDe(runWriterSectionProposal({
    context: contexto(brandB), actorUserId: atorMcp, document: documentoDoNavegador(), sectionId: "h2-noite", humanInstruction: "",
    generate: ({ system, user }) => generateStructuredAI({ provider: provedor, system, user, schema: WriterSectionProviderSchema, fetchImpl: deepseekFalso({ paragraphs: ["x"], alerts: [] }, chamadas) as typeof fetch }),
  }));
  assert.equal(erro.code, "document_not_found");
  assert.equal(chamadas.length, 0, "documento de outra Marca não gasta chamada de IA");
});

test("IA interna · a melhoria de trecho usa o próprio trecho como foco e também leva as guardas", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const capturados: Linha[] = [];
  const resultado = await runWriterImproveProposal({
    context: contexto(), actorUserId: atorMcp, document: documentoDoNavegador(), selectedText: "Pergunta observada 5 sobre niacinamida", humanInstruction: "Mais natural.",
    generate: ({ system, user }) => generateStructuredAI({ provider: provedor, system, user, schema: WriterImproveProviderSchema, fetchImpl: deepseekFalso({ replacementText: "Trecho melhorado.", alerts: [] }, capturados) as typeof fetch }),
  });
  const [sistema, usuario] = mensagens(capturados[0]).map(mensagem => mensagem.content);
  assert.match(sistema, /FAQ/);
  assert.match(usuario, /Pergunta observada 5 sobre niacinamida/);
  assert.match(usuario, /writer_section_evidence/);
  assert.doesNotMatch(usuario, new RegExp(FORJADA));
  assert.equal(resultado.proposal.replacementText, "Trecho melhorado.");
  assert.equal(resultado.divergences.status, "none");
  assert.equal(divergencias().length, 0);
});

test("IA interna · no máximo 20 alertas viram tentativa de registro; os excedentes voltam ditos, nunca somem", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const head = await readWriterEvidenceHead(contexto(), documentId);
  const alertas = Array.from({ length: 25 }, (_, indice) => `Alerta livre número ${indice}.`);
  const foco = { kind: "section" as const, id: "b1", label: "Rotina" };
  registros.length = 0;
  const resultado = await registerWriterAiAlerts(contexto(), { head, evidence: { package: null, notice: null }, alerts: alertas, actorUserId: atorMcp, focus: foco });
  assert.equal(WRITER_AI_ALERTS_REGISTERED_MAX, 20);
  assert.equal(escritas().length, 20, "25 alertas, 20 tentativas de INSERT");
  assert.equal(resultado.recorded.length, 20);
  assert.deepEqual(resultado.notRecorded.map(item => item.message), alertas.slice(20));
  assert.ok(resultado.notRecorded.every(item => /limite de 20 alertas/.test(item.reason)));
  assert.equal(resultado.status, "partial");
  assert.ok(!registros.some(registro => registro.table === "editorial_artifact_versions" && /artifact_type=eq\.brand_(dna|skill)/.test(registro.params.toString())),
    "alerta sem alvo na Marca não lê o contexto da Marca");
  conferirMarca(brandA);

  const semCabecalho = await registerWriterAiAlerts(contexto(), { head: null, evidence: { package: null, notice: null }, alerts: alertas.slice(0, 22), actorUserId: atorMcp, focus: foco });
  assert.equal(semCabecalho.notRecorded.length, 22, "sem documento legível, todos voltam — inclusive os acima do teto");
});

/* ================================= Guardião ================================= */

test("Guardião · divergências abertas viram intenção, evidência e canibalização; encerradas não entram; bloqueante só por pessoa", async () => {
  reiniciar("pendente");
  prepararDivergencias(true);
  const linha = (id: string, extra: Linha) => ({
    id, marca_id: brandA, document_id: documentId, article_id: articleId, dedupe_key: `k-${id}`, status: "aberta", severity: "alerta", origin: "ia_mcp",
    target_kind: "article_dna", target_entity_id: articleId, target_version_id: articleVersion, dna_claim_path: "evidenceNeeded",
    dna_claim_summary: `resumo ${id}`, evidence_source_key: "radar.bundle.observed.questions", evidence_path: null, evidence_hierarchy_level: "OTHER_RADAR_EVIDENCE",
    evidence_frozen: true, evidence_posterior_ao_pacote: false, suggested_owner: "arquiteto", created_at: `2026-09-23T1${id.length % 10}:00:00+00:00`, ...extra,
  });
  divergencias().push(
    linha("d1-intencao", { dna_claim_path: "mainIntent" }),
    linha("d2-canibal", { dna_claim_path: "antiCannibalizationBoundary", status: "reconhecida" }),
    linha("d3-grafo", { evidence_source_key: "graph.article/graph:silo-1:v2", severity: "info", status: "enviada_ao_dono" }),
    linha("d4-evidencia", { severity: "bloqueante", blocking_marked_by: atorMcp }),
    linha("d5-resolvida", { status: "resolvida", status_reason: "Arquiteto publicou nova versão." }),
    { ...linha("d6-outra-marca", {}), marca_id: brandB },
    { ...linha("d7-outro-documento", {}), document_id: "writer:doc-grande" },
  );
  const lidas = await readOpenWriterDivergences(contexto(), documentId);
  assert.equal(lidas.status, "read");
  assert.deepEqual(lidas.items.map(item => item.id).sort(), ["d1-intencao", "d2-canibal", "d3-grafo", "d4-evidencia"]);

  const documento = documentoDoNavegador();
  const semDivergencias = runGuardian(documento, "hash-doc");
  const relatorio = runGuardian(documento, "hash-doc", writerGuardianContextOf(lidas));
  const porDivergencia = relatorio.findings.filter(item => /Divergência/.test(item.message));
  const categoria = (id: string) => porDivergencia.find(item => item.message.includes(id.slice(0, 8)));
  assert.equal(categoria("d1-intencao")?.category, "intent");
  assert.equal(categoria("d1-intencao")?.severity, "warning");
  assert.equal(categoria("d2-canibal")?.category, "cannibalization");
  assert.equal(categoria("d3-grafo")?.category, "cannibalization");
  assert.equal(categoria("d3-grafo")?.severity, "info");
  assert.equal(categoria("d4-evidencia")?.category, "evidence");
  assert.equal(categoria("d4-evidencia")?.severity, "blocked", "bloqueante marcado por pessoa bloqueia");
  assert.equal(porDivergencia.length, 4);
  assert.equal(relatorio.blockingCount, semDivergencias.blockingCount + 1);
  assert.ok(porDivergencia.every(item => item.humanDecisionRequired));
  assert.equal(relatorio.notices, undefined, "leitura completa, sem aviso");
  conferirMarca(brandA);

  /* Mais de 50 abertas: só as 50 mais recentes entram, e o relatório diz. */
  for (let indice = 0; indice < WRITER_OPEN_DIVERGENCES_LIMIT + 5; indice += 1) divergencias().push(linha(`massa-${String(indice).padStart(3, "0")}`, {}));
  registros.length = 0;
  const muitas = await readOpenWriterDivergences(contexto(), documentId);
  assert.equal(muitas.items.length, WRITER_OPEN_DIVERGENCES_LIMIT);
  assert.equal(muitas.status === "read" && muitas.truncated, true);
  const leitura = registros.filter(registro => registro.table === "writer_evidence_divergences");
  assert.equal(leitura.length, 1);
  assert.equal(leitura[0].method, "GET");
  assert.equal(leitura[0].params.get("limit"), String(WRITER_OPEN_DIVERGENCES_LIMIT + 1), "o teto vai na consulta, não só no corte depois");
  assert.equal(leitura[0].params.get("marca_id"), `eq.${brandA}`);
  assert.equal(leitura[0].params.get("document_id"), `eq.${documentId}`);
  assert.match(runGuardian(documento, "hash-doc", writerGuardianContextOf(muitas)).notices?.[0] ?? "", /50/);
});

/* ================================ estrutura ================================ */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("ESTRUTURAL · a IA só INSERE divergência; nada atualiza, apaga ou escreve em DNA, pacote ou pipeline", () => {
  const modulos = ["../lib/server/writer-evidence-divergences.ts", "../lib/server/writer-evidence-ai.ts", "../app/api/mcp/redator/route.ts",
    "../app/api/redator/section/route.ts", "../app/api/redator/improve/route.ts", "../app/api/redator/guardian/route.ts"];
  for (const caminho of modulos) {
    const fonte = semComentarios(caminho);
    assert.doesNotMatch(fonte, /\.(update|upsert|delete)\(/, `${caminho} não atualiza nem apaga`);
    assert.doesNotMatch(fonte, /from\("editorial_artifact_versions"\)|from\("editorial_workflow_items"\)/, `${caminho} não toca DNA nem pipeline`);
  }
  const divergencias = semComentarios("../lib/server/writer-evidence-divergences.ts");
  assert.equal(divergencias.split(".insert(").length - 1, 1, "um único INSERT");
  assert.equal(divergencias.split(".from(").length - 1, divergencias.split(".from(TABELA)").length - 1, "só a tabela de divergências");
  assert.match(divergencias, /const TABELA = "writer_evidence_divergences";/);
  assert.equal(divergencias.split('.eq("marca_id", context.brandId)').length - 1, 3, "releitura, leitura e conferência de bloqueante filtram a Marca");

  for (const rota of ["../app/api/redator/section/route.ts", "../app/api/redator/improve/route.ts"]) {
    const fonte = semComentarios(rota);
    assert.doesNotMatch(fonte, /importedContext|dossier/, `${rota} não lê evidência do corpo do pedido`);
    assert.match(fonte, /context: \{ brandId: input\.brandId \}/);
  }
});

test("ESTRUTURAL · a entrega a Publicações confere divergência bloqueante antes de persistir; o Guardião da tela lê pela forma que não derruba", () => {
  const entrega = semComentarios("../lib/server/writer-publication-handoff.ts");
  const conferencia = entrega.indexOf("await checkOpenBlockingWriterDivergence({ brandId: input.brandId }, input.documentId)");
  assert.ok(conferencia > 0, "a entrega confere as divergências bloqueantes");
  assert.ok(conferencia < entrega.indexOf("repositorio.create("), "antes de persistir");
  assert.match(entrega, /if \(divergencia\.blocking\) \{\s*throw new WriterPublicationError\("writer_publication_divergence_blocking"/);
  const rotaDaEntrega = semComentarios("../app/api/redator/publication-handoff/route.ts");
  assert.match(rotaDaEntrega, /error instanceof WriterEvidenceError/);
  const guardiao = semComentarios("../app/api/redator/guardian/route.ts");
  assert.match(guardiao, /readWriterGuardianContext\(\{ brandId: input\.brandId \}, input\.document\.id\)/);
  assert.doesNotMatch(guardiao, /readOpenWriterDivergences/);
});
