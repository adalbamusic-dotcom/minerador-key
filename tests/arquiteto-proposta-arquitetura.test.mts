import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildArchitectureWorkingProposal,
  formatProposalCounters,
  identityCore,
  intentIsKnown,
  resolveKeywordDnaSignals,
  proposalCoversScope,
  type ExistingSilo,
  type KeywordDnaSignals,
} from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis, ClusterDestination } from "../lib/arquiteto/architecture-analysis.ts";

/* ------------------------------------------------------------- fixture */

/**
 * O LOTE REAL DA HOMOLOGAÇÃO.
 *
 * Nove keywords importadas na Brand care-glow em 2026-09-08. Na primeira
 * execução o analisador devolveu dois grupos, os dois "sem profundidade", e o
 * processamento terminou sem criar Silo e sem atribuir nada. A pessoa teve de
 * criar `skincare` à mão. Este é o cenário que não pode se repetir.
 */
const KEYWORDS: Array<[string, string]> = [
  ["kw-1", "skincare"],
  ["kw-2", "skincare vitamina c"],
  ["kw-3", "skincare para pele oleosa"],
  ["kw-4", "skin care noturno"],
  ["kw-5", "skin care nivea"],
  ["kw-6", "skin care pele oleosa"],
  ["kw-7", "skin care para peles oleosas"],
  ["kw-8", "mascara facial skin care"],
  ["kw-9", "pele oleosa e acne"],
];

const keywordTexts = new Map(KEYWORDS);

const score = (value: number) => ({ value, reasons: [] });

const cluster = (over: Partial<ClusterAnalysis> & { clusterRef: string; memberKeywordIds: string[] }): ClusterAnalysis => ({
  label: over.clusterRef,
  headKeywordId: over.memberKeywordIds[0],
  ambiguousHeadKeywordIds: [],
  destination: "insufficient_depth" as ClusterDestination,
  suggestedTerritoryRef: null,
  suggestedTerritoryLabel: null,
  alternativeTerritoryRefs: [],
  scores: { coherence: score(0.6), siloFit: score(0.4), depth: score(0.2), publishedEvidence: score(0) },
  confidence: "média",
  reason: "profundidade insuficiente para silo próprio",
  ...over,
});

const analise = (clusters: ClusterAnalysis[]): ArchitectureAnalysis => ({
  clusters,
  summary: {
    keywords: keywordTexts.size,
    clusters: clusters.length,
    strengthening: clusters.filter(item => item.destination === "strengthen_existing_silo").length,
    newSilos: clusters.filter(item => item.destination === "new_silo_candidate").length,
    insufficient: clusters.filter(item => item.destination === "insufficient_depth").length,
    ambiguous: clusters.filter(item => item.destination === "ambiguous").length,
    confidence: "média",
  },
  narrative: [],
  baseHash: "base:teste",
});

/** Os dois grupos que o motor devolveu na execução real. */
const DOIS_GRUPOS = [
  cluster({ clusterRef: "skincare", label: "skincare", memberKeywordIds: ["kw-1", "kw-2", "kw-3"] }),
  cluster({
    clusterRef: "skin care noturno",
    label: "skin care noturno",
    memberKeywordIds: ["kw-4", "kw-5", "kw-6", "kw-7", "kw-8", "kw-9"],
  }),
];

const slugOf = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * O KeywordDNA como ele chega de verdade.
 *
 * Medido no acervo em 2026-09-08: `semanticQualification` traz intent, funnel,
 * semanticState, versionId e contentHash. A coluna `intent` do Minerador vem
 * "Pendente" — quem responde pela intenção é o DNA.
 */
const sinal = (keywordId: string, over: Partial<KeywordDnaSignals> = {}): KeywordDnaSignals => ({
  keywordId,
  text: keywordTexts.get(keywordId) || keywordId,
  intent: "Informativa",
  funnel: "TOFU",
  semanticState: "conclusive",
  confidence: "alta",
  centralEntity: "skincare",
  modifiers: [],
  // O resto do DNA existe no acervo e o motor passou a ler; aqui ele é
  // ausência DECLARADA, que é o estado real de boa parte do lote.
  secondaryIntent: null,
  perceivedProblem: null,
  audience: null,
  desiredResult: null,
  editorialType: null,
  awarenessLevel: null,
  journeyStage: null,
  cannibalizationNote: null,
  dnaVersionId: `keyword_semantic_qualification:brand:${keywordId}:v1`,
  dnaContentHash: `sha256:${keywordId}`,
  ...over,
});

const SINAIS = [...keywordTexts.keys()].map(id => sinal(id));

const propor = (
  clusters: ClusterAnalysis[],
  existingSilos: ExistingSilo[] = [],
  keywords: KeywordDnaSignals[] = SINAIS,
) => buildArchitectureWorkingProposal({ analysis: analise(clusters), existingSilos, keywords, slugOf });

/* ------------------------------------------------------------- núcleo */

test("identityCore aproxima 'skin care' de 'skincare'", () => {
  const separado = identityCore("skin care noturno");
  const junto = identityCore("skincare");
  assert.ok(separado.has("skincare"), "a forma compacta precisa existir");
  assert.ok([...junto].some(token => separado.has(token)), "as duas grafias não se reconheceram");
  // Ruído curto não vira identidade.
  assert.equal(identityCore("de a o").size, 0);
});

/* ------------------------------------------------ o cenário que falhou */

test("§2 — lote sem Silo nenhum não termina sem Silo nenhum", () => {
  const proposta = propor(DOIS_GRUPOS);

  // O que a homologação real produziu: 0 e 0. Agora não.
  assert.notEqual(proposta.counters.SILOS_PROPOSED + proposta.counters.SILOS_REUSED, 0);
  assert.notEqual(proposta.counters.ASSIGNED, 0);

  assert.equal(proposta.counters.SILOS_PROPOSED, 1);
  assert.equal(proposta.counters.KEYWORDS_ANALYZED, 9);
  assert.equal(proposta.counters.RESOLVED_KEYWORDS, 9);
  assert.equal(proposta.counters.ASSIGNED, 9);
  assert.equal(proposta.counters.EXPLICIT_UNASSIGNED, 0);

  // A identidade sai do grupo mais forte, não de um nome escrito no código.
  const silo = proposta.silos[0];
  assert.equal(silo.source, "proposed");
  assert.equal(silo.name, "skincare");
  assert.ok(silo.seedKeywordId, "o Silo proposto precisa dizer de qual keyword nasceu");
});

test("§14 — com o Silo criado à mão, o processamento absorve e resolve o resto", () => {
  const skincare: ExistingSilo = {
    territoryRef: "territory:9da03dd0-cf37-45c3-8562-20e943aa37bd",
    name: "skincare",
    centralEntity: "skincare",
    slug: "/skincare",
  };
  const proposta = propor(DOIS_GRUPOS, [skincare]);

  assert.equal(proposta.counters.SILOS_REUSED, 1);
  assert.equal(proposta.counters.SILOS_PROPOSED, 0, "não inventar um segundo Silo sobre o mesmo domínio");
  assert.equal(proposta.counters.ASSIGNED, 9);
  assert.equal(proposta.counters.EXPLICIT_UNASSIGNED, 0);
  // Tudo cai no Silo que já existia — nenhuma intervenção manual a mais.
  assert.ok(proposta.assignments.every(item => item.siloKey === skincare.territoryRef));
});

test("§3 — 'sem profundidade' vira associação ao Silo amplo, não no-op", () => {
  const amplo: ExistingSilo = {
    territoryRef: "territory:amplo", name: "skincare", centralEntity: "skincare", slug: "/skincare",
  };
  const raso = cluster({
    clusterRef: "skin care noturno", label: "skin care noturno",
    memberKeywordIds: ["kw-4", "kw-5"], destination: "insufficient_depth",
  });
  const proposta = propor([raso], [amplo]);
  assert.equal(proposta.counters.ASSIGNED, 2);
  assert.equal(proposta.assignments[0].siloKey, "territory:amplo");
  assert.match(proposta.assignments[0].reason, /fortalece o Silo de maior afinidade/i);
});

test("§3 — sem destino real, a recusa é EXPLICIT_UNASSIGNED com motivo, nunca silêncio", () => {
  const estranho = cluster({
    clusterRef: "receita de bolo", label: "receita de bolo",
    memberKeywordIds: ["kw-9"], destination: "insufficient_depth",
  });
  const amplo: ExistingSilo = {
    territoryRef: "territory:amplo", name: "skincare", centralEntity: "skincare", slug: "/skincare",
  };
  // Tema realmente outro: nem léxico, nem entidade, nem modificadores.
  const outroTema = SINAIS.map(item => item.keywordId === "kw-9"
    ? { ...item, centralEntity: "bolo", modifiers: [] }
    : item);
  const proposta = propor([estranho], [amplo], outroTema);
  assert.equal(proposta.counters.ASSIGNED, 0);
  assert.ok(proposta.unassigned.some(item => item.keywordId === "kw-9"));
  assert.match(
    proposta.unassigned.find(item => item.keywordId === "kw-9")!.reason,
    /sem Silo de afinidade/i,
  );
});

test("§2 — new_silo passa a CRIAR o Silo, não só recomendar", () => {
  const proprio = cluster({
    clusterRef: "protetor solar", label: "protetor solar",
    memberKeywordIds: ["kw-1", "kw-2"], destination: "new_silo_candidate",
  });
  const proposta = propor([proprio]);
  assert.equal(proposta.counters.SILOS_PROPOSED, 1);
  assert.equal(proposta.silos[0].name, "protetor solar");
  assert.equal(proposta.silos[0].slug, "protetor-solar");
  assert.equal(proposta.counters.ASSIGNED, 2);
});

test("grupo ambíguo é resolvido pela afinidade, e nomeado quando não há nenhuma", () => {
  const amplo: ExistingSilo = {
    territoryRef: "territory:amplo", name: "skincare", centralEntity: "skincare", slug: "/skincare",
  };
  const ambiguo = cluster({
    clusterRef: "skin care nivea", label: "skin care nivea",
    memberKeywordIds: ["kw-5"], destination: "ambiguous",
  });
  assert.equal(propor([ambiguo], [amplo]).counters.ASSIGNED, 1);

  const orfao = cluster({
    clusterRef: "receita de bolo", label: "receita de bolo",
    memberKeywordIds: ["kw-9"], destination: "ambiguous",
  });
  const semDestino = propor([orfao], [amplo], SINAIS.map(item => item.keywordId === "kw-9"
    ? { ...item, centralEntity: "bolo", modifiers: [] }
    : item));
  // As outras oito também aparecem, porque nenhuma keyword do lote fica fora
  // do plano (§4). O que importa aqui é o MOTIVO dado à do grupo ambíguo.
  const daKw9 = semDestino.unassigned.find(item => item.keywordId === "kw-9");
  assert.ok(daKw9, "a keyword do grupo ambíguo sumiu do plano");
  assert.match(daKw9.reason, /ambíguo/i);
  assert.equal(semDestino.counters.ASSIGNED, 0);
});

/* --------------------------------------------------------- §4 e §10 */

test("§4 — toda keyword do lote sai com destino, inclusive a que não entrou em grupo", () => {
  const soUmGrupo = cluster({
    clusterRef: "skincare", label: "skincare",
    memberKeywordIds: ["kw-1", "kw-2"], destination: "new_silo_candidate",
  });
  const proposta = propor([soUmGrupo]);
  assert.equal(proposta.counters.RESOLVED_KEYWORDS, 9);
  assert.equal(proposta.counters.ASSIGNED + proposta.counters.EXPLICIT_UNASSIGNED, 9);

  const orfas = proposta.unassigned.map(item => item.keywordId).sort();
  assert.deepEqual(orfas, ["kw-3", "kw-4", "kw-5", "kw-6", "kw-7", "kw-8", "kw-9"]);
  assert.match(proposta.unassigned[0].reason, /não entrou em nenhum grupo/i);
});

test("§10 — proposta que não cobre o lote é recusada com o número que falta", () => {
  const completa = propor(DOIS_GRUPOS);
  assert.equal(proposalCoversScope(completa).ok, true);

  const parcial = {
    ...completa,
    counters: { ...completa.counters, RESOLVED_KEYWORDS: 3 },
  };
  const veredito = proposalCoversScope(parcial);
  assert.equal(veredito.ok, false);
  assert.equal(veredito.missing, 6);
  assert.match(veredito.reason!, /Processe a arquitetura novamente/);
});

/* ------------------------------------------------------------- §7 */

test("§7 — o hash identifica a proposta: igual quando nada muda, diferente quando muda", () => {
  const a = propor(DOIS_GRUPOS);
  const b = propor(DOIS_GRUPOS);
  assert.equal(a.proposalHash, b.proposalHash);

  const skincare: ExistingSilo = {
    territoryRef: "territory:9da03dd0", name: "skincare", centralEntity: "skincare", slug: "/skincare",
  };
  const c = propor(DOIS_GRUPOS, [skincare]);
  assert.notEqual(a.proposalHash, c.proposalHash);
});

test("§15 — os contadores saem nomeados, nenhum omitido", () => {
  const texto = formatProposalCounters(propor(DOIS_GRUPOS).counters);
  for (const chave of [
    "KEYWORDS_ANALYZED", "RESOLVED_KEYWORDS", "SILOS_REUSED",
    "SILOS_PROPOSED", "ASSIGNED", "EXPLICIT_UNASSIGNED", "BLOCKED",
  ]) {
    assert.match(texto, new RegExp(`${chave} = `));
  }
});

/* ------------------------------------------------------- contratos de UI */

const workspaceSource = () => readFile(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");

test("§1 — Processar materializa a proposta e não aprova nada", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const processArchitecture = async () => {");
  assert.ok(inicio > 0, "processArchitecture não encontrado");
  const resto = source.slice(inicio + 20);
  const fim = resto.search(/\r?\n {2}\/\*\*\r?\n {3}\* Confirmar arquitetura/);
  const corpo = source.slice(inicio, fim > 0 ? inicio + 20 + fim : inicio + 8000);

  // Materializa o que a proposta precisa para PODER ser confirmada: o Silo
  // candidato e a identidade dele. A membership é ato de Confirmar.
  assert.ok(corpo.includes("createRemoteSiloCandidate"), "não cria o Silo candidato");
  assert.ok(corpo.includes("formatProposalCounters"), "não devolve os contadores");

  // Mas NÃO aprova: SiloDNA e SiloPage continuam nascendo em Confirmar.
  for (const proibido of ["confirmSiloCandidate", "consolidateSilos", "persistSiloDna", "persistSiloPage"]) {
    assert.equal(corpo.includes(proibido), false, `Processar chamou ${proibido}`);
  }
});

test("§5 — a SERP dentro do processamento não anuncia revisão humana", async () => {
  const source = await workspaceSource();
  assert.ok(source.includes("validateTerritorialSerp(true)"), "o processamento não marca a SERP como insumo");
  assert.ok(source.includes("dentroDoProcessamento"), "a SERP não distingue de onde foi chamada");
});

test("§6/§7 — confirmar é um clique, e plano vencido manda processar de novo", async () => {
  const source = await workspaceSource();
  assert.equal(
    source.includes("setArchitecturePlanPreview"),
    false,
    "o preview de dois cliques voltou",
  );
  assert.ok(source.includes("Processe novamente antes de confirmar"));
  assert.ok(source.includes("Processe a arquitetura antes de confirmar"));
  // §10 — cobertura do lote antes de fechar.
  assert.ok(source.includes("proposalCoversScope(architectureProposal)"));
});

test("§11 — a fase Silos não oferece mais o caminho manual", async () => {
  const source = await workspaceSource();
  assert.match(source, /const SILO_ADVANCED_CONTROLS = false;/);
  // Escolher silo / Aplicar e Confirmar Silo / Definir contexto saem por aqui.
  assert.ok(source.includes("confirmControls={SILO_ADVANCED_CONTROLS ?"));
  assert.ok(source.includes("controls={SILO_ADVANCED_CONTROLS ?"));
  // Formar cópias de trabalho / Consolidar Silos.
  assert.ok(source.includes("consolidation={!SILO_ADVANCED_CONTROLS ? null"));
  // Ações humanas.
  assert.ok(source.includes('(SILO_ADVANCED_CONTROLS || workspaceMode !== "silos")'));
  // A implementação FICA: os handlers continuam no arquivo.
  assert.ok(source.includes("const applySiloDecision"));
  assert.ok(source.includes("confirmSiloCandidate"));
});

test("§8 — o Silo nasce com identidade, senão a confirmação nunca o vê", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const processArchitecture = async () => {");
  const resto = source.slice(inicio + 20);
  const fim = resto.search(/\r?\n {2}\/\*\*\r?\n {3}\* Confirmar arquitetura/);
  const corpo = source.slice(inicio, fim > 0 ? inicio + 20 + fim : inicio + 12000);

  /*
   * `territoryContentIssues` barra território sem entidade central, sem
   * intenção macro, sem fronteira ou com narrativa "unknown". Era esse gate
   * que produzia "0 Silo(s) serão confirmados" com um Silo candidato na tela.
   */
  assert.ok(corpo.includes("updateRemoteTerritoryContext"), "o processamento não grava a identidade do Silo");
  assert.ok(corpo.includes("centralEntity:"));
  assert.ok(corpo.includes("macroIntent:"));
  assert.ok(corpo.includes("includes: fronteira"));
  assert.ok(corpo.includes('continuity: "coherent"'));
  assert.ok(corpo.includes('brandAlignment: "aligned"'));
  // A base do juízo fica escrita, não implícita.
  assert.ok(corpo.includes("aprovadas no Minerador para esta Brand"));
  // E identidade humana existente não é sobrescrita.
  assert.ok(corpo.includes("jaTemIdentidade"));
});

/* ------------------------------- a proposta é a autoridade visual ------ */

test("§1 — Processar NÃO aprova membership canônica", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const processArchitecture = async () => {");
  const resto = source.slice(inicio + 20);
  const fim = resto.search(/\r?\n {2}\/\*\*\r?\n {3}\* Confirmar arquitetura/);
  const corpo = source.slice(inicio, fim > 0 ? inicio + 20 + fim : inicio + 12000);

  /*
   * Medido no banco em 2026-09-08: depois de um Processar que anunciou
   * "9 atribuídas", as 9 keywords seguiam com territoryRef vazio e
   * lock_version = 1. A escrita não chegava e ninguém conferia o retorno.
   */
  assert.equal(corpo.includes("persistArchitectWorkingCopy"), false, "Processar voltou a gravar membership");
  // O que ele materializa é o Silo candidato e a identidade dele.
  assert.ok(corpo.includes("createRemoteSiloCandidate"));
  assert.ok(corpo.includes("updateRemoteTerritoryContext"));
});

test("§8 — Confirmar materializa a proposta VISÍVEL, não outro plano", async () => {
  const source = await workspaceSource();
  // `handleEditorialUnitDecision` vem ANTES no arquivo: fatiar até ele
  // devolvia string vazia, e o teste passaria sem olhar nada.
  const abre = source.indexOf("const confirmArchitecture = async");
  assert.ok(abre > 0, "confirmArchitecture não encontrado");
  // A janela é o CORPO da função, não um número de caracteres: a fatia fixa de
  // 9000 passou a cortar antes dos laços quando o fechamento da fase Silos
  // entrou no começo de `confirmArchitecture`, e o teste reprovava por tamanho.
  const trecho = source.slice(abre);
  const confirmar = trecho.slice(0, trecho.indexOf("\n  };"));
  assert.ok(confirmar.length > 1000, "o corpo de confirmArchitecture não foi isolado");
  // A fonte é a mesma que a tabela e a cobertura projetam.
  assert.ok(confirmar.includes("for (const assignment of architectureProposal.assignments)"));
  assert.ok(confirmar.includes("for (const item of architectureProposal.unassigned)"));
  // E o plano do analisador deixa de mandar nas atribuições.
  assert.equal(confirmar.includes("for (const assignment of plan.assignments)"), false);
});

test("§4 — a cobertura separa ATUAL de PROPOSTA e lê a proposta", async () => {
  const painel = await readFile(new URL("../modules/arquiteto/architecture-panel.tsx", import.meta.url), "utf8");
  assert.ok(painel.includes("Atual · já gravado"));
  assert.ok(painel.includes("Proposta · aguardando confirmação"));
  assert.ok(painel.includes("value={proposal?.ASSIGNED"));
  assert.ok(painel.includes("value={proposal?.EXPLICIT_UNASSIGNED"));
  // O "com destino sugerido" derivado dos clusters saiu da cobertura.
  assert.equal(painel.includes('label="Com destino sugerido"'), false);
  const source = await workspaceSource();
  assert.ok(source.includes("currentAssigned={masterList.filter"));
});

test("§5 — cada row mostra atual e proposto, sem fingir aprovação", async () => {
  const rows = await readFile(new URL("../modules/arquiteto/territorial-workspace-rows.tsx", import.meta.url), "utf8");
  assert.ok(rows.includes('data-testid="architect-keyword-proposed"'));
  assert.ok(rows.includes("proposedByKeywordId?.get(row.keywordId)"));
  assert.ok(rows.includes("Atual: "));
  assert.ok(rows.includes(" · Proposto: "));

  const source = await workspaceSource();
  assert.ok(source.includes("const architectureProposedByKeyword = useMemo"));
  assert.ok(source.includes('status: pendente ? "Aguardando confirmação" : "Confirmada"'));
  assert.ok(source.includes("proposedByKeywordId={architectureProposedByKeyword}"));
});

test("a gravação da identidade é conferida no readback, não presumida", async () => {
  const source = await workspaceSource();
  /*
   * O defeito que fechou a homologação: o processamento anunciava sucesso sem
   * olhar o retorno de nenhum writer. Medido no banco depois daquele clique,
   * nada tinha sido gravado.
   */
  assert.ok(source.includes("a identidade não apareceu no readback do Silo"));
  assert.ok(source.includes("const gravou = Boolean(String(atualizado.territory.centralEntity"));
});

/* ============ §12 · o motor consome KeywordDNA, não só strings ========= */

test("§12 — texto parecido, intenção incompatível: NÃO agrupa", () => {
  /*
   * "skin care nivea" casa lexicalmente com o Silo "skincare". O DNA diz que a
   * intenção é Transacional, e a do Silo é Informativa. Agrupar por semelhança
   * de string sobre intenções incompatíveis é exatamente o erro que o veto
   * existe para impedir.
   */
  const silo: ExistingSilo = {
    territoryRef: "territory:informativo", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "skin care nivea", label: "skin care nivea",
    memberKeywordIds: ["kw-5"], destination: "insufficient_depth",
  });
  const comercial = SINAIS.map(item =>
    item.keywordId === "kw-5" ? { ...item, intent: "Transacional" } : item);

  const proposta = propor([grupo], [silo], comercial);
  assert.equal(proposta.counters.ASSIGNED, 0, "o veto de intenção não segurou");
  const recusa = proposta.unassigned.find(item => item.keywordId === "kw-5");
  assert.ok(recusa);
  assert.match(recusa.reason, /intenção "transacional" incompatível/i);

  // Prova de que o veto veio do DNA: com a MESMA string e intenção alinhada,
  // a associação acontece.
  const alinhado = propor([grupo], [silo], SINAIS);
  assert.equal(alinhado.counters.ASSIGNED, 1);
});

test("§1 — intenção alinhada NÃO basta: tema diferente não vai para o mesmo Silo", () => {
  /*
   * "pele oleosa e acne" e "protetor solar" podem ser as duas Informativas.
   * Isso não as torna o mesmo assunto.
   *
   * Esta era a regra permissiva que o Planejador vetou: eu tratava intenção
   * alinhada como afinidade suficiente, e o lote inteiro ia parar em qualquer
   * Silo cuja intenção casasse.
   */
  const silo: ExistingSilo = {
    territoryRef: "territory:protetor", name: "protetor solar",
    centralEntity: "protetor solar", slug: "/protetor-solar", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "pele oleosa e acne", label: "pele oleosa e acne",
    memberKeywordIds: ["kw-9"], destination: "insufficient_depth",
  });

  // Mesma intenção, entidade e modificadores de OUTRO tema.
  const outroTema = SINAIS.map(item => item.keywordId === "kw-9"
    ? { ...item, centralEntity: "acne", modifiers: ["oleosa"] }
    : item);
  const proposta = propor([grupo], [silo], outroTema);
  assert.equal(proposta.counters.ASSIGNED, 0, "intenção alinhada não pode criar afinidade sozinha");
  assert.ok(proposta.unassigned.some(item => item.keywordId === "kw-9"));
});

test("§7 — texto distante, ENTIDADE do DNA igual: o DNA sustenta a associação", () => {
  /*
   * "oleosidade no rosto" não compartilha token nenhum com "skincare". O que
   * aproxima os dois não é a intenção — é a entidade central declarada no
   * KeywordDNA, que é a mesma. Base temática real, não estágio editorial.
   */
  const silo: ExistingSilo = {
    territoryRef: "territory:skincare", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "oleosidade no rosto", label: "oleosidade no rosto",
    memberKeywordIds: ["kw-9"], destination: "insufficient_depth",
  });
  const comEntidade = SINAIS.map(item => item.keywordId === "kw-9"
    ? { ...item, text: "oleosidade no rosto", centralEntity: "skincare" }
    : item);

  // Sem a entidade, nada aproxima os dois textos.
  const semEntidade = propor([grupo], [silo], comEntidade.map(item =>
    item.keywordId === "kw-9" ? { ...item, centralEntity: null } : item));
  assert.equal(semEntidade.counters.ASSIGNED, 0, "sem base temática não pode associar");

  const proposta = propor([grupo], [silo], comEntidade);
  assert.equal(proposta.counters.ASSIGNED, 1, "a entidade central do DNA precisa sustentar a associação");
  assert.match(proposta.assignments[0].basis.join(" "), /Entidade central do KeywordDNA/);
});

test("§5 — funil não é identidade de Silo e não entra na base", () => {
  const silo: ExistingSilo = {
    territoryRef: "territory:amplo", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "skin care noturno", label: "skin care noturno",
    memberKeywordIds: ["kw-4"], destination: "insufficient_depth",
  });
  const proposta = propor([grupo], [silo], SINAIS);
  assert.equal(proposta.counters.ASSIGNED, 1);
  const base = proposta.assignments[0].basis.join(" ");
  assert.equal(base.includes("Funil"), false, "o funil voltou a ser citado como fundamento");

  // E funil igual, sozinho, não aproxima temas diferentes.
  const outroTema = cluster({
    clusterRef: "receita de bolo", label: "receita de bolo",
    memberKeywordIds: ["kw-9"], destination: "insufficient_depth",
  });
  const semTema = propor([outroTema], [silo], SINAIS.map(item =>
    item.keywordId === "kw-9" ? { ...item, centralEntity: "bolo", modifiers: [] } : item));
  assert.equal(semTema.counters.ASSIGNED, 0);
});

test("§11 — a base declarada cita só o sinal que existe", () => {
  const silo: ExistingSilo = {
    territoryRef: "territory:amplo", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "skin care noturno", label: "skin care noturno",
    memberKeywordIds: ["kw-4"], destination: "insufficient_depth",
  });

  const completo = propor([grupo], [silo], SINAIS);
  const base = completo.assignments[0].basis;
  // O tema é o que sustenta; a intenção entra como apoio e vem NOMEADA.
  assert.ok(base.includes("Coerência lexical do lote"));
  assert.ok(base.some(linha => /^Intenção .+ compatível$/.test(linha)), base.join(" · "));

  // Sem intenção canônica, a base não afirma compatibilidade nenhuma.
  const semIntencao = propor([grupo], [silo], SINAIS.map(item => ({ ...item, intent: null })));
  assert.equal(
    semIntencao.assignments[0].basis.some(linha => /Intenção .* compatível/.test(linha)),
    false,
  );

  /*
   * Conclusividade só é fundamento quando foi CONDIÇÃO — quando a afinidade
   * passou por entidade/modificadores, que exigem DNA conclusivo. Aqui a
   * entidade central bate com o Silo, então ela decidiu e pode ser citada.
   */
  assert.ok(base.includes("Entidade central do KeywordDNA"));
  assert.ok(base.includes("Qualificação semântica conclusiva"));

  // Sem entidade, sobra o léxico — e a conclusividade deixa de ser fundamento.
  const soLexico = propor([grupo], [silo], SINAIS.map(item => ({ ...item, centralEntity: null, modifiers: [] })));
  const baseLexical = soLexico.assignments[0].basis;
  assert.ok(baseLexical.includes("Coerência lexical do lote"));
  assert.equal(baseLexical.includes("Qualificação semântica conclusiva"), false);
});

/* ============ §7 · proveniência do DNA na proposta ==================== */

test("§7 — cada atribuição registra a versão do KeywordDNA que a sustenta", () => {
  const proposta = propor(DOIS_GRUPOS);
  for (const item of proposta.assignments) {
    assert.ok(item.dnaVersionId, `atribuição sem versão de DNA: ${item.keywordId}`);
    assert.ok(item.dnaContentHash, `atribuição sem hash de DNA: ${item.keywordId}`);
  }
});

test("§7 — DNA diferente é PROPOSTA diferente, mesmo com o mesmo destino", () => {
  const antes = propor(DOIS_GRUPOS);
  const depois = propor(DOIS_GRUPOS, [], SINAIS.map(item =>
    item.keywordId === "kw-1" ? { ...item, dnaContentHash: "sha256:mudou" } : item));

  // Os destinos são os mesmos; o dado da keyword é que mudou.
  assert.deepEqual(
    antes.assignments.map(item => `${item.keywordId}->${item.siloKey}`).sort(),
    depois.assignments.map(item => `${item.keywordId}->${item.siloKey}`).sort(),
  );
  assert.notEqual(antes.proposalHash, depois.proposalHash, "o hash precisa mudar quando o DNA muda");
});

/* ============ §13 · integridade da importação ======================== */

test("§13 — a mesa lê o DNA do payload canônico, não da coluna 'Pendente'", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const architectureKeywordSignals = useMemo");
  assert.ok(inicio > 0, "os sinais do KeywordDNA não são extraídos");
  const corpo = source.slice(inicio, inicio + 1400);

  // §4 — a mesa NÃO interpreta por conta própria: delega à autoridade única.
  assert.ok(corpo.includes("resolveKeywordDnaSignals({"));
  assert.ok(corpo.includes("payload.semanticQualification"));
  assert.ok(corpo.includes("keyword.analise_semantica"));
  // E a intenção macro do Silo deixou de sair da coluna do Minerador.
  assert.equal(source.includes('const intent = String(keyword?.intent || "").trim();'), false);

  /*
   * A interpretação saiu do módulo da proposta e virou autoridade própria,
   * porque a fase Artigos precisa da MESMA leitura. Nenhuma das duas fases é
   * dona dela — e é justamente isso que impede uma segunda interpretação.
   */
  const dominio = await readFile(new URL("../lib/arquiteto/keyword-dna-signals.ts", import.meta.url), "utf8");
  assert.ok(dominio.includes("dnaVersionId: texto(qualificacao.versionId)"));
  assert.ok(dominio.includes("dnaContentHash: texto(qualificacao.contentHash)"));
  const proposta = await readFile(new URL("../lib/arquiteto/architecture-working-proposal.ts", import.meta.url), "utf8");
  assert.ok(proposta.includes('from "./keyword-dna-signals'), "a proposta perdeu o vínculo com a autoridade");
});

/* ============ §8/§9 · seleção e inspeção do KeywordDNA ================ */

test("§8 — as rows são selecionáveis, e a seleção NÃO recorta o processamento", async () => {
  const rows = await readFile(new URL("../modules/arquiteto/territorial-workspace-rows.tsx", import.meta.url), "utf8");
  assert.ok(rows.includes('data-testid="architect-keyword-select"'), "falta o checkbox por keyword");
  assert.ok(rows.includes('data-testid="architect-keyword-select-all"'), "falta o selecionar todos");

  const source = await workspaceSource();
  // "Todos" é o lote inteiro — o mesmo escopo que o motor lê.
  assert.ok(source.includes("new Set(masterList.map(item => String(item.id)))"));

  /*
   * A prova que importa: `processArchitecture` não olha a seleção. Se olhasse,
   * o motor perderia as fronteiras entre as keywords fora dela.
   */
  const inicio = source.indexOf("const processArchitecture = async () => {");
  const resto = source.slice(inicio + 20);
  const fim = resto.search(/\r?\n {2}\/\*\*\r?\n {3}\* Confirmar arquitetura/);
  const corpo = source.slice(inicio, fim > 0 ? inicio + 20 + fim : inicio + 12000);
  assert.equal(corpo.includes("selectedSiloKeywordIds"), false, "o processamento passou a depender da seleção");
});

test("§9/§10 — a seta abre o KeywordDNA, e ele é somente leitura", async () => {
  const rows = await readFile(new URL("../modules/arquiteto/territorial-workspace-rows.tsx", import.meta.url), "utf8");
  assert.ok(rows.includes('data-testid="architect-keyword-expand"'));
  assert.ok(rows.includes('data-testid="architect-keyword-dna-panel"'));
  for (const bloco of ["Identidade", "Estratégia", "Semântica", "Arquitetura", "Proveniência"]) {
    assert.ok(rows.includes(`titulo="${bloco}"`), `falta o bloco ${bloco}`);
  }
  // §10 — leitura declarada, e nenhum campo editável no painel.
  assert.ok(rows.includes("o Arquiteto não o reescreve"));
  const painel = rows.slice(rows.indexOf("function DnaBloco"), rows.indexOf("function DnaBloco") + 900);
  for (const editavel of ["<input", "<textarea", "<select", "onChange"]) {
    assert.equal(painel.includes(editavel), false, `o painel de DNA tem ${editavel}`);
  }
  // Ausência de DNA é dita, não escondida.
  assert.ok(rows.includes('data-testid="architect-keyword-dna-missing"'));
});

test("§9 — o painel só mostra campo que existe no payload canônico", async () => {
  const source = await workspaceSource();
  const inicio = source.indexOf("const architectureDnaByKeyword = useMemo");
  assert.ok(inicio > 0, "o painel de DNA não é montado");
  const corpo = source.slice(inicio, inicio + 3200);
  // O helper devolve [] quando o valor não existe: linha vazia não é criada.
  assert.ok(corpo.includes("return texto ? [{ label, value: texto }] : [];"));
  assert.ok(corpo.includes("KeywordDNA version"));
  assert.ok(corpo.includes("contentHash"));
});

/* ====== §8 · os dois casos reais que a homologação revelou ============ */

test("§1/§8A — 'skin care noturno': Silo Pendente NÃO conflita com intenção canônica", () => {
  /*
   * O caso real. O Silo manual foi criado antes da correção e carrega
   * `macroIntent = "Pendente"`. A keyword tem intenção canônica Informativa e
   * qualificação conclusiva — e a proposta a recusava dizendo
   * "intenção 'informativa' incompatível com a do Silo ('pendente')".
   *
   * "Pendente" é ausência de decisão, não uma decisão contrária.
   */
  assert.equal(intentIsKnown("Pendente"), false);
  assert.equal(intentIsKnown("pending"), false);
  assert.equal(intentIsKnown("unknown"), false);
  assert.equal(intentIsKnown(null), false);
  assert.equal(intentIsKnown("Informativa"), true);

  const siloPendente: ExistingSilo = {
    territoryRef: "territory:skincare", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Pendente",
  };
  const grupo = cluster({
    clusterRef: "skin care noturno", label: "skin care noturno",
    memberKeywordIds: ["kw-4"], destination: "insufficient_depth",
  });
  const dna = SINAIS.map(item => item.keywordId === "kw-4"
    ? { ...item, intent: "Informativa", semanticState: "conclusive" as const }
    : item);

  const proposta = propor([grupo], [siloPendente], dna);
  assert.equal(proposta.counters.ASSIGNED, 1, "o Silo pendente voltou a bloquear por conflito");
  assert.equal(proposta.counters.EXPLICIT_UNASSIGNED, 8);
  assert.equal(
    proposta.unassigned.some(item => /incompatível/.test(item.reason)),
    false,
    "nenhuma recusa pode citar conflito com 'pendente'",
  );

  // Intenção REALMENTE incompatível continua vetando.
  const siloComercial: ExistingSilo = { ...siloPendente, intent: "Transacional" };
  const vetada = propor([grupo], [siloComercial], dna);
  assert.equal(vetada.counters.ASSIGNED, 0);
});

test("§3/§8B — 'skincare vitamina c': a base não afirma o que o DNA nega", () => {
  /*
   * O segundo caso real: o painel mostrava intenção Pendente e qualificação
   * `non_conclusive`, e a Base da proposta afirmava "Intenção compatível" e
   * "Qualificação semântica conclusiva" — sobre a MESMA keyword.
   *
   * A causa era a base ser montada por GRUPO, com `some(...)`: bastava um
   * membro conclusivo para todos afirmarem conclusividade.
   */
  const silo: ExistingSilo = {
    territoryRef: "territory:skincare", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "skincare", label: "skincare",
    memberKeywordIds: ["kw-1", "kw-2"], destination: "insufficient_depth",
  });
  // kw-1 conclusiva e com intenção; kw-2 é a "skincare vitamina c" real.
  const misto = SINAIS.map(item => item.keywordId === "kw-2"
    ? { ...item, intent: null, semanticState: "non_conclusive" as const }
    : item);

  const proposta = propor([grupo], [silo], misto);
  const daVitaminaC = proposta.assignments.find(item => item.keywordId === "kw-2");
  assert.ok(daVitaminaC, "a keyword saiu do plano");
  const base = daVitaminaC.basis.join(" · ");

  assert.equal(/Intenção .* compatível/.test(base), false, `base afirma intenção: ${base}`);
  assert.equal(base.includes("Qualificação semântica conclusiva"), false, `base afirma conclusividade: ${base}`);
  // E a ressalva aparece, em vez de silêncio.
  assert.ok(base.includes("não conclusiva"), base);

  // A vizinha conclusiva e com intenção continua podendo afirmar as duas.
  const daSkincare = proposta.assignments.find(item => item.keywordId === "kw-1");
  assert.ok(daSkincare!.basis.some(linha => /Intenção .* compatível/.test(linha)));
});

test("§4 — a leitura do DNA é uma só, e normaliza a pendência na origem", () => {
  const pendente = resolveKeywordDnaSignals({
    keywordId: "kw-2",
    text: "skincare vitamina c",
    semanticQualification: { intent: "Pendente", semanticState: "non_conclusive", versionId: "v1", contentHash: "sha256:x" },
    semantic: { entidade_central: "skincare", modificadores: ["vitamina c"] },
  });
  assert.equal(pendente.intent, null, "'Pendente' não pode virar intenção");
  assert.equal(pendente.semanticState, "non_conclusive");
  assert.equal(pendente.dnaVersionId, "v1");
  assert.deepEqual(pendente.modifiers, ["vitamina c"]);

  const valida = resolveKeywordDnaSignals({
    keywordId: "kw-4",
    text: "skin care noturno",
    semanticQualification: { intent: "Informativa", semanticState: "conclusive" },
    semantic: {},
  });
  assert.equal(valida.intent, "Informativa");
  assert.equal(valida.semanticState, "conclusive");
});

test("§6 — entidade de DNA não conclusivo não sustenta associação", () => {
  const silo: ExistingSilo = {
    territoryRef: "territory:skincare", name: "skincare",
    centralEntity: "skincare", slug: "/skincare", intent: "Informativa",
  };
  const grupo = cluster({
    clusterRef: "oleosidade no rosto", label: "oleosidade no rosto",
    memberKeywordIds: ["kw-9"], destination: "insufficient_depth",
  });
  const base = SINAIS.map(item => item.keywordId === "kw-9"
    ? { ...item, text: "oleosidade no rosto", centralEntity: "skincare" }
    : item);

  const conclusivo = propor([grupo], [silo], base);
  assert.equal(conclusivo.counters.ASSIGNED, 1);

  const naoConclusivo = propor([grupo], [silo], base.map(item => item.keywordId === "kw-9"
    ? { ...item, semanticState: "non_conclusive" as const }
    : item));
  assert.equal(naoConclusivo.counters.ASSIGNED, 0, "entidade incerta não pode sustentar associação");
});

/* ====== pós-confirmação · o que o teste manual de 2026-09-08 revelou === */

test("§1 — 'já está no destino' é no-op, e ref cru não vira mensagem", async () => {
  const source = await workspaceSource();
  /*
   * A keyword que já estava associada ao mesmo Silo caía em
   * `ALREADY_IN_TARGET`, cujo `detail` é o próprio `territoryRef`. A
   * confirmação exibia um ERROR cujo texto inteiro era
   * `territory:9da03dd0-…` para uma operação que não tinha nada de errado.
   */
  const inicio = source.indexOf("const applySiloDecision = async (");
  assert.ok(inicio > 0, "applySiloDecision não encontrado");
  const handler = source.slice(inicio, inicio + 3000);

  assert.ok(handler.includes('refusal.code === "ALREADY_IN_TARGET"'), "o no-op voltou a ser tratado como recusa");
  assert.ok(handler.includes('return "unchanged";'));
  // Nenhum ref técnico chega à tela: ele é trocado pelo nome do Silo.
  assert.ok(handler.includes("replace(/territory:[0-9a-f-]{36}/gi, nomeDoSilo)"));
  assert.equal(
    handler.includes('showNotification("error", plan.refusals.map(refusal => refusal.detail).join(" ")'),
    false,
    "a mensagem crua de recusa voltou ao caminho de decisão de Silo",
  );

  // §1 — três contadores, não dois.
  assert.ok(source.includes("APPLIED_ASSIGNMENTS = "));
  assert.ok(source.includes("UNCHANGED_ASSIGNMENTS = "));
  assert.ok(source.includes("FAILED_ASSIGNMENTS = "));
});

test("§2/§3/§4 — proposta materializada deixa de ser pendência", async () => {
  const source = await workspaceSource();
  /*
   * A proposta é derivada: ela continua sendo calculada depois da confirmação.
   * Pendente passa a ser o que DIFERE do gravado — se nada difere, virou
   * histórico, e a tela para de pedir um clique que já aconteceu.
   */
  assert.ok(source.includes("const architectureProposalPending = useMemo"));
  assert.ok(source.includes("pendentePorKeyword"));
  assert.ok(source.includes('status: pendente ? "Aguardando confirmação" : "Confirmada"'));
  assert.equal(source.includes('status: jaEsta ? "Sem mudança"'), false);

  const painel = await readFile(new URL("../modules/arquiteto/architecture-panel.tsx", import.meta.url), "utf8");
  assert.ok(painel.includes('"Proposta · aguardando confirmação" : "Proposta · aplicada"'));
  assert.ok(painel.includes('"Com destino proposto" : "Última proposta aplicada"'));
});

test("a resolução do Silo proposto é uma autoridade só", async () => {
  const source = await workspaceSource();
  // Projeção e confirmação resolvem o mesmo `proposed:<slug>` pelo mesmo
  // caminho: duas resoluções divergentes mostrariam um destino e gravariam
  // outro.
  assert.ok(source.includes("const resolveProposalSiloRef = useCallback"));
  assert.ok(source.includes("const refDoSilo = resolveProposalSiloRef;"));
});
