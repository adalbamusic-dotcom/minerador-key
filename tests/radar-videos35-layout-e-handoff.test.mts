import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchRadarVideoBriefs,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";
import {
  assertRadarVideoEvidenceLayer,
  buildRadarVideoEvidenceLayer,
  type RadarVideoEvidenceIdentity,
} from "../lib/radar/video-evidence.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ====  VÍDEOS · GATE 3.5 — UI FINAL E CONTRATO DE HANDOFF  ==========
 *
 * A área funciona; o que falta é caber na tela e chegar ao Planejador.
 *
 * O LAYOUT tem uma regra só: a parte operacional é de TRABALHO à esquerda e de
 * CONSULTA à direita, e o RESULTADO — que é o que esta área produz — ocupa a
 * largura inteira embaixo. Espremer o desfecho numa coluna faria a leitura da
 * evidência competir com a escolha de fontes.
 *
 * O HANDOFF tem outra: a evidência de vídeo é camada do RadarEvidenceBundle,
 * amarrada à versão do ArticleDNA — nunca escrita DENTRO dele. O Arquiteto
 * aprova o contrato editorial; o Radar prova coisas sobre aquela versão. Se o
 * Radar escrevesse no ArticleDNA, o recorte de um vídeo mudaria um contrato que
 * ninguém reaprovou.
 *
 * PROVIDER_CALLS = 0 · nenhuma rede sai desta suíte.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");
const workbench = () => ler("../modules/radar/radar-r3-workbench.tsx");
const dossie = () => ler("../lib/radar/evidence-bundle.ts");
const camada = () => ler("../lib/radar/video-evidence.ts");

/* ==========  §1 e §3 · O LAYOUT  =================================== */

test("VÍDEOS 3.5 · duas colunas no desktop, biblioteca à esquerda e consulta à direita", () => {
  const tela = painel();

  /*
   * A GRADE É `lg:` PARA CIMA — §3. Abaixo disso ela não existe, e o DOM já
   * está na ordem pedida. Uma media query invertendo ordem seria a forma de
   * isso quebrar em silêncio no telefone.
   */
  assert.match(tela, /className="grid gap-3 lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,1fr\)\]" data-testid="radar-videos-operational-grid"/);
  /* §3 · `minmax(0, …)` é o que impede uma palavra longa de esticar a grade. */
  assert.match(tela, /minmax\(0,2fr\)_minmax\(0,1fr\)/);

  const grade = tela.indexOf('data-testid="radar-videos-operational-grid"');
  const biblioteca = tela.indexOf('data-testid="radar-videos-input"');
  const lateral = tela.indexOf('data-testid="radar-videos-side-column"');
  const material = tela.indexOf('data-testid="radar-videos-sources-heading"');
  const pautas = tela.indexOf('data-testid="radar-videos-brief-panel"');
  const resultado = tela.indexOf('data-testid="radar-videos-extracted"');

  assert.ok(grade > 0 && biblioteca > grade, "a biblioteca abre a grade, à esquerda");
  assert.ok(lateral > biblioteca, "a coluna de consulta vem depois dela");
  assert.ok(material > lateral && pautas > material, "§1.B · as pautas ficam embaixo das fontes com texto");
  assert.ok(resultado > pautas, "§2 · e o resultado vem depois da grade inteira");

  /*
   * §1 · A BIBLIOTECA NÃO É DUPLICADA À DIREITA. Só as fontes SELECIONADAS
   * aparecem ali, e é essa a diferença entre acervo e material de trabalho.
   */
  const colunaDireita = tela.slice(lateral, resultado);
  assert.match(colunaDireita, /\{selecionadasDoArtigo\.map\(fonte => \{/);
  assert.equal(/\{visiveis\.map\(|\{registradas\.map\(/.test(colunaDireita), false, "o acervo inteiro não se repete na direita");
});

test("VÍDEOS 3.5 · a pauta saiu do workbench e mantém a mesma autoridade", () => {
  /* Ela não pode existir nos dois lugares: seriam duas listas do mesmo dado. */
  assert.equal(/data-testid="radar-videos-brief-panel"/.test(workbench()), false, "o workbench não guarda mais a pauta");
  assert.match(painel(), /<RadarVideoBriefList briefs=\{vista!\.briefs\} \/>/);

  /* E continua recolhida, sem estado e sem efeito. */
  const bloco = painel().slice(painel().indexOf('<details className={bloco} data-testid="radar-videos-brief-panel">'));
  const ate = bloco.indexOf("</details>}");
  assert.ok(ate > 0, "o disclosure tem fim conhecido");
  const conteudo = bloco.slice(0, ate);
  assert.equal(/\bopen\b|useState|useEffect|localStorage/.test(conteudo), false, "VIDEO_BRIEFS_RIGHT, e recolhido por construção");
});

test("VÍDEOS 3.5 · o transcript bruto continua recolhido, na coluna de consulta", () => {
  const tela = painel();
  const marca = tela.indexOf("Ver transcrição completa</summary>");
  assert.ok(marca > 0, "o disclosure do transcript existe");

  const bloco = tela.slice(marca - 400, marca + 300);
  assert.match(bloco, /<details className="mt-2">/);
  assert.equal(/<details[^>]*\bopen\b/.test(bloco), false, "RAW_TRANSCRIPT_COLLAPSED = YES");

  /* E ele vive na coluna da direita, não embaixo do resultado. */
  const lateral = tela.indexOf('data-testid="radar-videos-side-column"');
  const resultado = tela.indexOf('data-testid="radar-videos-extracted"');
  assert.ok(marca > lateral && marca < resultado, "o transcript acompanha a fonte, não o desfecho");
});

test("VÍDEOS 3.5 · no telefone é uma coluna só, na ordem de trabalho", async () => {
  /*
   * PROVAR NO ARQUIVO NÃO É PROVAR NA TELA. Aqui o painel é montado e a ordem
   * do DOM é lida — é ela que vale quando a grade some, abaixo de `lg`.
   */
  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-1",
    videoSources: {
      sources: [], texts: [],
      briefs: [{ briefId: "b1", topic: "Uma pauta", narrativePurpose: "", whatToLookFor: ["o que procurar"], priority: "HIGH", frozen: true, relatedSectionTitle: null, evidenceNeeded: "", provenance: [] }],
      briefsUnavailableReason: null, coverage: null, matching: false,
      investigationFinalized: true, frozenBriefCount: 1,
      loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    },
  } as never)));

  const raiz = tela.get("radar-videos-panel");
  const posicao = (testid: string) => {
    const alvo = raiz.querySelector(`[data-testid="${testid}"]`);
    assert.ok(alvo, `${testid} está na tela`);
    const todos = [...raiz.querySelectorAll("*")];
    return todos.indexOf(alvo as Element);
  };

  const biblioteca = posicao("radar-videos-input");
  const material = posicao("radar-videos-sources-heading");
  const pautas = posicao("radar-videos-brief-panel");
  const resultado = posicao("radar-videos-extracted");

  assert.ok(biblioteca < material, "MOBILE_SINGLE_COLUMN: biblioteca primeiro");
  assert.ok(material < pautas, "depois as fontes com texto");
  assert.ok(pautas < resultado, "depois as pautas, e o resultado por último");

  tela.destroy();
});

/* ==========  §5 e §6 · O CONTRATO DE HANDOFF  ===================== */

const PAUTA: RadarFrozenBriefInput = {
  briefId: "video:b1", topic: "O que piora a oleosidade no rosto?",
  narrativePurpose: "", whatToLookFor: ["os sinais visíveis", "onde eles aparecem"],
  relatedSectionId: "section:b1", relatedSectionTitle: "O que piora a oleosidade no rosto?",
  questions: ["O que piora a oleosidade no rosto?"], entities: ["oleosa", "rosto"],
  evidenceNeeded: "1 de 10 página(s) comparável(is) tratam desta necessidade.",
  priority: "MEDIUM",
};

const FONTE: RadarMatchableSource = {
  videoSourceId: "f1", displayName: "Entrevista", textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 3, transcriptText: "",
  segments: [
    { text: "o calor aumenta a oleosidade visivel do rosto", startMs: 1_000, endMs: 5_500 },
    { text: "e a marca aparece mais na regiao da testa", startMs: 5_500, endMs: 10_000 },
  ],
};

const IDENTIDADE: RadarVideoEvidenceIdentity = {
  frozenBundleId: "bundle:2be6e384", frozenBundleHash: "0606f2d3",
  matchingRunId: "daa2ae60-0000-0000-0000-000000000000",
  inputFingerprint: "m4:f1@v3", matcherVersion: 4,
  matchedAt: "2026-09-13T05:53:07.125Z",
};

const camadaReal = () => {
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTA], sources: [FONTE] });
  return buildRadarVideoEvidenceLayer({
    identity: IDENTIDADE, briefs: [PAUTA], coverage,
    sources: [{ videoSourceId: "f1", displayName: "Entrevista", languageCode: "pt", processingVersion: 3 }],
  });
};

test("VÍDEOS 3.5 · a camada carrega tudo o que o Planejador precisa referenciar", () => {
  const layer = camadaReal();

  /* §5 · a lista inteira do que o handoff tem de conseguir receber. */
  assert.deepEqual(layer.briefs.map(item => item.briefId), ["video:b1"], "videoBriefSnapshots");
  const resultado = layer.results[0];
  assert.ok(["SUPPORTED", "PARTIAL", "NOT_FOUND"].includes(resultado.state), "status por pauta");
  assert.deepEqual(layer.sources.map(item => item.videoSourceId), ["f1"], "fontes utilizadas");
  assert.ok(resultado.extracts.length >= 1, "extracts selecionados");
  assert.ok(resultado.extracts.every(item => item.endMs >= item.startMs && item.segmentIndexes.length), "timestamps e âncoras");
  assert.ok(Array.isArray(resultado.matchedCriteria), "matchedCriteria");
  assert.ok(Array.isArray(resultado.missingCriteria), "missingCriteria");
  assert.deepEqual(resultado.whatToLookFor, PAUTA.whatToLookFor, "a guia congelada viaja verbatim");

  /* A identidade da execução viaja junto: sem ela, o Planejador não confere nada. */
  assert.equal(layer.identity.matchingRunId, IDENTIDADE.matchingRunId);
  assert.equal(layer.identity.frozenBundleId, "bundle:2be6e384");
  assert.equal(layer.identity.matcherVersion, 4);

  /*
   * E O TEXTO É O DO TRANSCRIPT, letra por letra. O Planejador recebe a
   * evidência, não uma paráfrase dela.
   */
  const trecho = resultado.extracts[0];
  const colado = trecho.segmentIndexes.map(indice => FONTE.segments[indice].text).join(" ");
  assert.equal(trecho.originalText, colado);
});

test("VÍDEOS 3.5 · pauta sem cobertura continua na entrega, declarada como não encontrada", () => {
  /*
   * OMITIR SERIA PIOR QUE DIZER. Uma pauta que some da entrega faria o
   * Planejador acreditar que a investigação não pediu aquele apoio — quando
   * ela pediu e o material não respondeu.
   */
  const semMaterial = buildRadarVideoEvidenceLayer({
    identity: IDENTIDADE, briefs: [PAUTA], coverage: [],
    sources: [{ videoSourceId: "f1", displayName: "Entrevista", languageCode: "pt", processingVersion: 3 }],
  });
  assert.equal(semMaterial.results.length, 1);
  assert.equal(semMaterial.results[0].state, "NOT_FOUND");
  assert.deepEqual(semMaterial.results[0].missingCriteria, PAUTA.whatToLookFor);
  assert.deepEqual(semMaterial.sources, [], "fonte que não sustentou nada não é fonte utilizada");
  assert.equal(semMaterial.summary.notFound, 1);
});

test("VÍDEOS 3.5 · evidência sem âncora não sai daqui", () => {
  const layer = camadaReal();
  const trecho = layer.results[0].extracts[0];

  const quebrados: Array<[string, typeof trecho]> = [
    ["sem índices", { ...trecho, segmentIndexes: [] }],
    ["tempo impossível", { ...trecho, startMs: 9_000, endMs: 2_000 }],
    ["sem texto", { ...trecho, originalText: "   " }],
  ];
  for (const [nome, quebrado] of quebrados) {
    assert.throws(
      () => assertRadarVideoEvidenceLayer({ ...layer, results: [{ ...layer.results[0], extracts: [quebrado] }] }),
      /RADAR_VIDEO_EVIDENCE_EXTRACT/,
      `o contrato recusa trecho ${nome}`,
    );
  }

  /* E resultado de uma pauta que não está no congelamento também não passa. */
  assert.throws(
    () => assertRadarVideoEvidenceLayer({ ...layer, results: [{ ...layer.results[0], videoBriefId: "video:fantasma" }] }),
    /RADAR_VIDEO_EVIDENCE_RESULT_WITHOUT_BRIEF/,
  );
});

test("VÍDEOS 3.5 · a camada vive no dossiê, amarrada à versão do ArticleDNA", () => {
  const fonte = dossie();

  /* §6 · o dossiê é que carrega a evidência, e ele já é preso ao fundamento. */
  assert.match(fonte, /video: RadarVideoEvidenceLayer \| null;/);
  assert.match(fonte, /video: input\.video \|\| null,/);
  assert.match(fonte, /if \(bundle\.video\) assertRadarVideoEvidenceLayer\(bundle\.video\);/);
  assert.match(fonte, /articleDnaVersionId: string;/);
  assert.match(fonte, /articleDnaContentHash: string \| null;/);

  /*
   * §5 · ARTICLE_DNA_MUTATED = NO.
   *
   * A varredura é sobre ESCRITA. A camada não conhece caminho nenhum de volta
   * ao contrato editorial: nenhuma menção a ArticleDNA, nenhuma gravação.
   */
  const codigo = camada().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const proibido of ["ArticleDNA", "article_dna", "articleDna", "upsert", "insert", "update(", "supabase"]) {
    assert.ok(!codigo.includes(proibido), `a camada de vídeo não faz "${proibido}"`);
  }
  /* E ela é domínio puro: sem rede, sem storage, sem provider. */
  assert.equal(/fetch\(|localStorage|server-only/.test(codigo), false);
});

test("VÍDEOS 3.5 · o handoff do Planejador entrega o dossiê inteiro, com a camada dentro", () => {
  /*
   * O CONTRATO JÁ EXISTIA E NÃO PRECISOU MUDAR: o handoff v3 entrega o
   * `dossier` verbatim. Bastou a camada existir dentro dele — foi por isso que
   * este gate não criou tabela, rota nem versão de matcher.
   */
  const handoff = ler("../lib/radar/planner-handoff.ts");
  assert.match(handoff, /dossier: RadarEvidenceBundle;/);
  assert.match(handoff, /A fotografia inteira da rodada congelada\. O que o Planejador consome\./);
  assert.match(handoff, /binding: RadarPlannerArticleFoundation;/);

  /* E o dossiê que ele carrega é o tipo que agora tem a camada de vídeo. */
  assert.match(dossie(), /export type RadarEvidenceBundle = \{[\s\S]*?video: RadarVideoEvidenceLayer \| null;[\s\S]*?\};/);

  /*
   * O DOSSIÊ VIAJA POR REFERÊNCIA, NÃO POR CÓPIA CAMPO A CAMPO.
   *
   * É isso que garante que a camada chega inteira: uma cópia manual perderia
   * `video` em silêncio no dia em que alguém acrescentasse um campo e
   * esquecesse de copiá-lo — e o Planejador receberia um dossiê sem vídeo sem
   * que nada falhasse.
   */
  assert.match(handoff, /    dossier: input\.dossier,/);
  assert.equal(/dossier: \{[\s\S]{0,200}\.\.\.input\.dossier/.test(handoff), false, "ninguém remonta o dossiê no caminho");
});

test("VÍDEOS 3.5 · o gate não criou tabela, rota, migration nem versão de matcher", () => {
  /*
   * §7 · O QUE ESTE GATE NÃO PODIA CRIAR.
   *
   * A camada é projeção de domínio: ela não persiste nada, e por isso não
   * precisou de tabela nem de migration. O matcher continua m4 — apresentação
   * e contrato não mudam a régua do casamento.
   */
  const codigo = camada().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const proibido of ["CREATE TABLE", "from(", "rpc(", "RADAR_VIDEO_MATCHER_VERSION"]) {
    assert.ok(!codigo.includes(proibido), `a camada não traz "${proibido}"`);
  }
  /* E a régua do casamento continua onde estava, intocada. */
  const matcher = ler("../lib/radar/video-brief-matching.ts");
  assert.match(matcher, /export const RADAR_VIDEO_MATCHER_VERSION = 4;/);
});

test("VÍDEOS 3.5 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
