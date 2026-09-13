import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { radarDeclaredArticleIntent, radarDeclaredKeywordIntent } from "../lib/radar/editorial-identity.ts";
import { radarPhase1Action } from "../lib/radar/serp-phase1.ts";
import { buildRadarResetPayload, RADAR_RESET_CLEARED } from "../lib/radar/radar-reset.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarInvestigationSufficiency } from "../lib/radar/investigation-sufficiency.ts";

/*
 * ======  GATE 18.4 · O ANALYZE COLIDINDO CONSIGO MESMO  ================
 *
 * A segunda rodada real chegou ao fim do ANALYZE — 12 lidas, 6 sem acesso, 11
 * comparáveis, SOURCE_UNKNOWN interno zero, blueprint e pautas gerados — e
 * então: "O registro foi alterado por outra sessão."
 *
 * Não havia outra sessão. Éramos nós.
 *
 * O Gate 18.1 fez o ANALYZE gravar DUAS vezes no mesmo handler (a amostra, para
 * que o servidor pudesse resolver os sourceIds, e depois a camada de
 * evidência). O token de concorrência, porém, continuava sendo lido UMA vez, do
 * estado de React capturado no render: a segunda escrita declarava esperar o
 * lock antigo e colidia com o que a primeira acabara de subir.
 *
 * E o pior não foi o conflito: foi a tela continuar oferecendo "Finalizar
 * pesquisa" depois dele. Congelar ali produziria um bundle sem camada factual,
 * com aparência de investigação completa.
 *
 * REAL_PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============ um servidor de concorrência otimista, em miniatura ======== */

/**
 * O CONTRATO DO SERVIDOR, REPRODUZIDO — sem rede.
 *
 * Uma única regra: a escrita só passa se o `expectedLock` for exatamente o lock
 * corrente. É o que o `/api/editorial/radar-analysis` faz, e é contra isto que
 * o encadeamento precisa ser provado.
 */
function servidorDeAnalise(lockInicial = 1) {
  let lock = lockInicial;
  const gravadas: string[] = [];
  return {
    get lock() { return lock; },
    get versoes() { return [...gravadas]; },
    save(expectedLock: number, versionId: string) {
      if (expectedLock !== lock) {
        return { ok: false as const, error: "O registro foi alterado por outra sessão. Recarregue antes de salvar novamente." };
      }
      lock += 1;
      gravadas.push(versionId);
      return { ok: true as const, lockVersion: lock, versionId };
    },
  };
}

/**
 * O CLIENTE, COM E SEM A CORREÇÃO.
 *
 * `encadeia` liga o comportamento do Gate 18.4: cada escrita usa o lock que o
 * servidor devolveu na anterior. Desligado, reproduz o defeito do smoke.
 */
function clienteDeAnalise(servidor: ReturnType<typeof servidorDeAnalise>, opcoes: { encadeia: boolean }) {
  const lockDoRender = servidor.lock;
  let lockConfirmado: number | null = null;
  const readbacks: Array<{ versionId: string; lockVersion: number }> = [];

  return {
    get readbacks() { return [...readbacks]; },
    gravar(versionId: string) {
      const expected = opcoes.encadeia && lockConfirmado !== null ? lockConfirmado : lockDoRender;
      const resposta = servidor.save(expected, versionId);
      if (!resposta.ok) return resposta;
      lockConfirmado = resposta.lockVersion;
      readbacks.push({ versionId, lockVersion: resposta.lockVersion });
      return resposta;
    },
  };
}

/* ==========  A, B, C, D e E · O ENCADEAMENTO  ====================== */

test("GATE 18.4 · A a E — as duas escritas do ANALYZE encadeiam pelo readback", () => {
  const servidor = servidorDeAnalise(1);
  const cliente = clienteDeAnalise(servidor, { encadeia: true });

  /* A e B — a amostra sobe N→N+1, e a final espera N+1. */
  const amostra = cliente.gravar("versao:amostra");
  assert.equal(amostra.ok, true, "SAMPLE_WRITE aceito");
  assert.equal(amostra.ok && amostra.lockVersion, 2, "SAMPLE_READBACK_VERSION");

  const final = cliente.gravar("versao:evidencia");
  assert.equal(final.ok, true, "E — o pipeline não gera conflito consigo mesmo");
  assert.equal(final.ok && final.lockVersion, 3, "FINAL_READBACK_VERSION");

  /* C e D — duas versões gravadas, dois readbacks confirmados. */
  assert.deepEqual(servidor.versoes, ["versao:amostra", "versao:evidencia"]);
  assert.deepEqual(cliente.readbacks.map(item => item.lockVersion), [2, 3]);
});

test("GATE 18.4 · sem o encadeamento, o defeito do smoke reaparece", () => {
  /*
   * O CONTRASTE QUE PROVA A CAUSA.
   *
   * Mesmo servidor, mesma sequência — só o encadeamento desligado. A segunda
   * escrita é recusada com a mesma frase que o USER viu na tela.
   */
  const servidor = servidorDeAnalise(1);
  const cliente = clienteDeAnalise(servidor, { encadeia: false });

  assert.equal(cliente.gravar("versao:amostra").ok, true);
  const final = cliente.gravar("versao:evidencia");
  assert.equal(final.ok, false, "era exatamente isto que acontecia");
  assert.match(String(final.ok === false && final.error), /alterado por outra sessão/);
  assert.deepEqual(servidor.versoes, ["versao:amostra"], "a camada de evidência nunca chegou ao banco");
});

/* ==========  F · OUTRA SESSÃO REAL CONTINUA PROTEGIDA  ============ */

test("GATE 18.4 · F — sessão concorrente real continua sendo recusada", () => {
  /*
   * A CORREÇÃO NÃO PODE VIRAR "ÚLTIMA ESCRITA VENCE".
   *
   * O lock só avança com readback NOSSO confirmado. Quando outra sessão grava,
   * o servidor fica à frente do nosso último confirmado — e o conflito acontece,
   * que é o comportamento correto.
   */
  const servidor = servidorDeAnalise(1);
  const sessaoA = clienteDeAnalise(servidor, { encadeia: true });
  const sessaoB = clienteDeAnalise(servidor, { encadeia: true });

  /* B grava primeiro: o servidor vai para 2. */
  assert.equal(sessaoB.gravar("versao:da-sessao-b").ok, true);

  /* A ainda acredita no lock que leu no render: recusado. */
  const tentativaDeA = sessaoA.gravar("versao:da-sessao-a");
  assert.equal(tentativaDeA.ok, false, "REAL_CROSS_SESSION_CONFLICT_STILL_PROTECTED");
  assert.match(String(tentativaDeA.ok === false && tentativaDeA.error), /alterado por outra sessão/);
  assert.deepEqual(servidor.versoes, ["versao:da-sessao-b"], "nada foi sobrescrito");

  /* E a própria B continua encadeando normalmente depois disso. */
  assert.equal(sessaoB.gravar("versao:da-sessao-b-2").ok, true);
});

test("GATE 18.4 · o lock encadeado sai do servidor, nunca de um palpite", () => {
  const fonte = readFileSync(new URL("../components/editorial-pipeline-context.tsx", import.meta.url), "utf8");

  /* O ref existe e é alimentado pelo que o save devolveu. */
  assert.match(fonte, /radarAnalysisLockRef/);
  assert.match(fonte, /if \(typeof body\.lockVersion === "number"\) radarAnalysisLockRef\.current\.set\(syncKey, body\.lockVersion\)/);
  /*
   * HOTFIX 18.10.3 · o lock lido AGORA tem prioridade sobre o encadeado.
   *
   * O encadeamento deste gate continua inteiro para as escritas que não releem
   * o item. Quando a operação acaba de buscar o item remoto — o caso da
   * retomada — é esse número que ela declara, porque nem o render nem o ref
   * desta aba sabem o que o banco tem agora.
   */
  assert.match(fonte, /\? options\.expectedLock\s*\r?\n\s*: typeof lockConfirmado === "number" \? lockConfirmado : currentItem\.lockVersion;/);

  /* E nada de desligar a concorrência otimista para contornar o problema. */
  assert.ok(!/expectedLock: *(undefined|null|0)\b/.test(fonte), "a proteção não foi desligada");
  assert.ok(!/force: *true|overwrite/i.test(fonte), "nem substituída por overwrite");
});

/* ==========  G, H e I · O FALSO "PRONTO"  ========================= */

const suficiencia: Pick<RadarInvestigationSufficiency, "level" | "headline"> = {
  level: "PARTIAL_BUT_USABLE", headline: "Análise parcial",
};

const acao = (patch: Partial<Parameters<typeof radarPhase1Action>[0]> = {}) => radarPhase1Action({
  state: "AWAITING_REVIEW", contextReady: true, hasPrimaryQuery: true, running: false, mode: "WEB",
  selected: 18, pending: 0, failed: 6, analyzed: 12, sufficiency: suficiencia, ...patch,
});

test("GATE 18.4 · G e H — sem a gravação final confirmada, FINALIZE não é oferecido", () => {
  /*
   * O ESTADO EXATO DO SMOKE: amostra gravada, 12 lidas, 0 pendentes — e a
   * camada de evidência que nunca chegou ao banco.
   */
  const naoConfirmada = acao({ analysisConfirmed: false });
  assert.notEqual(naoConfirmada.id, "FINALIZE_SERP", "FINALIZE_VISIBLE_AFTER_FAILED_FINAL_SAVE = NO");

  /*
   * GATE 18.10.1 · A RECUSA VIROU RETOMADA — a garantia acima é a mesma.
   *
   * Este teste guardava a recusa de FINALIZE, e ela segue de pé. O que mudou
   * foi a SAÍDA: era um botão morto mandando recarregar a página, o que
   * mostrava a verdade e deixava o artigo parado com doze páginas pagas e
   * gravadas. Agora a ação existe e diz o seu escopo — consolidar o que já foi
   * lido, sem reler nada.
   */
  assert.equal(naoConfirmada.id, "ANALYZE_COMPETITION");
  assert.equal(naoConfirmada.enabled, true);
  assert.equal(naoConfirmada.label, "Concluir análise");
  assert.match(String(naoConfirmada.hint), /já gravadas no servidor/);
  assert.match(String(naoConfirmada.info), /não serão coletadas de novo/, "e promete que nada caro se repete");

  /* A frase não pode voltar a ser vocabulário do fluxo antigo. */
  assert.ok(!/revis(ão|ao) SERP|Aprovar/i.test(`${naoConfirmada.hint} ${naoConfirmada.info}`));
});

test("GATE 18.4 · I — somente com o readback final confirmado a Fase 1 oferece finalizar", () => {
  const confirmada = acao({ analysisConfirmed: true });
  assert.equal(confirmada.id, "FINALIZE_SERP", "FALSE_READY_AFTER_CONFLICT = NO");
  assert.equal(confirmada.enabled, true);
  assert.equal(confirmada.label, "Finalizar pesquisa");

  /* E pendência continua mandando mais que a confirmação. */
  const aindaPendente = acao({ analysisConfirmed: true, pending: 4 });
  assert.equal(aindaPendente.id, "ANALYZE_COMPETITION");
});

test("GATE 18.4 · quem não informa a confirmação continua se comportando como antes", () => {
  /*
   * O campo é opcional de propósito: nenhuma leitura antiga muda de resposta
   * por causa deste gate. Só quem sabe dizer "não confirmado" muda.
   */
  const semInformar = acao({});
  assert.equal(semInformar.id, "FINALIZE_SERP");
  assert.equal(semInformar.enabled, true);
});

/* ==========  §8 e K · A AUTORIDADE É O QUE ESTÁ GRAVADO  ========= */

test("GATE 18.4 · §8 e K — o carimbo de conclusão vem do persistido, não da memória", () => {
  const pagina = readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  /* A amostra nasce sem carimbo; a versão final o escreve. */
  assert.match(pagina, /analysisCompletedAt: null,\s*\n\s*selectedCompetitorIds: selectedKeys/, "a amostra não se declara concluída");
  assert.match(pagina, /analysisCompletedAt: new Date\(\)\.toISOString\(\)/, "só a gravação final carimba");

  /* E a leitura da tela usa o que voltou do banco. */
  assert.match(pagina, /analysisConfirmed: Boolean\(analysis\?\.payload\.analysisCompletedAt\)/, "K — F5 lê o estado remoto confirmado");

  /* A ordem continua: amostra antes da verificação de fontes (Gate 18.1). */
  const gravaAmostra = pagina.indexOf("let versaoDaAmostra: RadarAnalysisVersion;");
  const verifica = pagina.indexOf("/api/editorial/radar-analysis/verify-sources");
  const carimba = pagina.indexOf("analysisCompletedAt: new Date().toISOString()");
  assert.ok(gravaAmostra < verifica, "amostra antes da verificação");
  assert.ok(verifica < carimba, "e o carimbo depois de tudo");
});

test("GATE 18.4 · o reset descarta o carimbo junto com a rodada", () => {
  const zerado = buildRadarResetPayload(RadarAnalysisPayloadSchema.parse({
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "v1",
    serpSnapshotId: "s1", serpSnapshotVersion: 1, serpSnapshotHash: `sha256:${"a".repeat(64)}`,
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "medium", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [],
    extractionFailures: [], verifiedSources: [], sourceVerificationFailures: [], benchmark: null,
    semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    competitiveReport: null, deepResearch: null, finalizedBundle: null, plannerPackage: null, plannerTransfer: null,
    analysisCompletedAt: "2026-09-10T13:00:00.000Z",
    status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  }));

  assert.equal(zerado.analysisCompletedAt, null);
  assert.ok((RADAR_RESET_CLEARED as readonly string[]).includes("analysisCompletedAt"), "e a lista declarada acompanha");
});

/* ==========  L e M · A LACUNA "unknown"  ========================= */

test("GATE 18.4 · L — intenção Informacional não produz lacuna de intenção esperada unknown", () => {
  const rota = readFileSync(new URL("../app/api/editorial/serp/route.ts", import.meta.url), "utf8");

  /*
   * O MESMO SENTINELA DO GATE 18.2, NUM SEGUNDO LEITOR.
   *
   * `normalizeSearchIntent` devolve a string "unknown" e ela é truthy; o `||`
   * parava nela e o diagnóstico registrava "A intenção esperada (unknown) não
   * coincide com a aparente (informacional)" — uma lacuna sobre a ausência de
   * leitura, não sobre o artigo.
   */
  /*
   * GATE 18.6 · O FILTRO LOCAL SAIU DA ROTA — a exigência ficou mais dura.
   *
   * `conclusiva()` resolvia o sentinela AQUI, e o Gate 18.5 escreveu a mesma
   * cadeia trinta linhas abaixo, no caminho canônico. Duas cópias da mesma
   * decisão é exatamente como o defeito atravessou três gates. A precedência
   * entre keyword e artigo continua sendo desta rota; a ordem DENTRO de cada
   * um saiu daqui e não pode voltar.
   */
  assert.ok(!/const conclusiva = /.test(rota), "o filtro local não sobreviveu à centralização");
  assert.match(rota, /const intencao = radarDeclaredKeywordIntent\(reference\)/, "a keyword pergunta à autoridade dela");
  assert.match(rota, /\|\| radarDeclaredArticleIntent\(article\.payload\)/, "e o artigo à dele");

  /*
   * TODA LEITURA DE INTENÇÃO PASSA PELO FILTRO — não basta ele existir.
   *
   * Escrevi este teste verificando a PRESENÇA de `conclusiva(...)`, e uma
   * mutação que apenas PREPENDIA `reference.normalizedIntent ||` na frente da
   * cadeia passou verde: o novo código continuava lá, só não era mais o
   * primeiro. O que precisa ser provado é que nenhuma das fontes é lida CRUA
   * na atribuição — porque ler cru é o que deixa o sentinela vencer.
   */
  const atribuicao = rota.slice(rota.indexOf("const intencao ="), rota.indexOf("const queryInput ="));
  assert.ok(atribuicao.length > 40, "a atribuição foi localizada");
  /*
   * NENHUMA FONTE É NOMEADA NA ATRIBUIÇÃO — nem crua, nem filtrada.
   *
   * O 18.4 exigia que toda fonte passasse por `conclusiva()`. A exigência
   * agora é mais forte: a rota não escolhe entre campos do fundamento, então
   * nenhum deles aparece aqui. Uma mutação que prepende qualquer um destes
   * volta a falhar — que foi o furo original deste teste.
   */
  for (const fonte of [
    "reference.semanticQualificationRef?.intent",
    "reference.normalizedIntent",
    "article.payload.classification?.intent.value",
    "article.payload.mainIntent",
  ]) {
    assert.ok(!atribuicao.includes(fonte), `${fonte} voltou a ser escolhido dentro da rota`);
  }

  /* E a lógica, agora executada de verdade — não reimplementada no teste. */
  assert.equal(radarDeclaredKeywordIntent({ normalizedIntent: "unknown" }), null);
  assert.equal(radarDeclaredKeywordIntent({ normalizedIntent: "unknown", coveredIntentions: ["informacional"] }), "informacional");
  assert.equal(radarDeclaredKeywordIntent({ semanticQualificationRef: { intent: "Comercial" }, normalizedIntent: "informational" }), "Comercial");
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: { value: "AMBIGUOUS" } } }), null);
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: { value: "INFORMATIONAL" } } }), "INFORMATIONAL");

  /* Sem nada conclusivo, a comparação é PULADA em vez de inventar conflito. */
  const intencao = radarDeclaredKeywordIntent({ normalizedIntent: "unknown" })
    || radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: { value: "AMBIGUOUS" } } })
    || "";
  assert.equal(intencao, "", "string vazia desliga a comparação no provider");
});

test("GATE 18.4 · M — a intenção observada na SERP continua separada da do Article", () => {
  const provider = readFileSync(new URL("../lib/radar/serper-provider-core.ts", import.meta.url), "utf8");

  /*
   * A separação não muda: `expectedIntent` é o fundamento e `dominantIntent` é
   * o que a SERP devolveu. O provider compara as duas; ele nunca escreve uma na
   * outra — e a comparação só acontece quando existe intenção declarada.
   */
  /*
   * A separação continua, e agora é a autoridade que a garante: o Gate 18.5
   * tirou a comparação por substring do provider e a levou para
   * `radarIntentConflict`, que só declara divergência com as DUAS pontas
   * conclusivas.
   */
  assert.match(provider, /const leituraDeIntencao = radarIntentConflict\(\{ expected: input\.expectedIntent, observed: dominantIntent \}\)/);
  assert.ok(!/expectedIntent = dominantIntent|mainIntent = dominantIntent/.test(provider), "a SERP não preenche o fundamento");
});

/* ==============  J · ZERO PROVIDER  ============================== */

test("GATE 18.4 · J — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
