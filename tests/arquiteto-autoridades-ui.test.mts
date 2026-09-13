import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveKeywordDnaSignals } from "../lib/arquiteto/keyword-dna-signals.ts";
import {
  editorialUnitTypeIsDerived,
  suggestEditorialUnitClassification,
} from "../lib/arquiteto/unit-strategy.ts";
import { buildArticleReviewChecklist } from "../lib/arquiteto/article-review-checklist.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/**
 * QUATRO AUTORIDADES DUPLICADAS, ENCONTRADAS NA HOMOLOGAÇÃO.
 *
 * A mesma tela dizia, sobre o mesmo candidato:
 *
 *   SERP = Inconclusivo        × SERP sustentada · manter composição
 *   Reforços = 3               × SECUNDÁRIA 1 / 2 / 3
 *   Informacional              × Ambíguo × Informativa
 *   "falta decisão humana"     × um Article formado na aba Artigos
 *
 * Nenhuma delas é contradição de dado: são duas leituras do mesmo estado,
 * cada uma com a sua fonte.
 */

/* ===================== §4/§5 · o tipo da unidade é derivado ============== */

test("§4 — o tipo da unidade JÁ era derivável; a tela é que não perguntava", () => {
  /*
   * `suggestEditorialUnitClassification` responde `article · suggested` mesmo
   * sem ArticleDNA e sem sinal na keyword. Ela nunca era chamada para um
   * candidato: a tela passava `null` quando não havia versão gravada, e `null`
   * não se deriva — daí "o tipo da unidade não pôde ser derivado".
   *
   * A correção foi PERGUNTAR, não criar um segundo derivador.
   */
  const doCandidato = suggestEditorialUnitClassification({ principal: undefined, published: false });
  assert.equal(doCandidato.type, "article");
  assert.equal(editorialUnitTypeIsDerived(doCandidato), true, "ARTICLE_UNIT_TYPE_AUTO_DERIVED = YES");
  assert.notEqual(doCandidato.status, "human_confirmed", "derivar não é fingir que alguém confirmou");

  // E `null` continua sendo o que era: ausência, não derivação.
  assert.equal(editorialUnitTypeIsDerived(null), false);
});

test("§5 — com o tipo derivado, o checklist para de cobrar decisão humana", () => {
  const checklist = (unitType: { defined: boolean; label: string | null }) => buildArticleReviewChecklist({
    kgr: {
      requiresHumanDecision: false, fullKgr: false, label: "Não aplicável",
      principalKeyword: "skincare para pele oleosa", principalScoreLabel: "—",
    },
    unitType,
    serp: { verdictLabel: "Inconclusivo", impact: "", divergenceCount: 0, divergences: [] },
    aiProposals: [],
    unresolvedConflicts: [],
  } as never).decisions;

  const derivado = suggestEditorialUnitClassification({ principal: undefined, published: false });
  const resolvida = checklist({ defined: editorialUnitTypeIsDerived(derivado), label: "Artigo" })
    .find(item => item.kind === "unit_type");
  assert.ok(resolvida);
  assert.equal(resolvida.resolved, true, "TYPE_OF_UNIT_PENDING não pode continuar como blocker");
  assert.doesNotMatch(resolvida.what, /falta decisão humana/);

  // E a pendência real continua existindo quando o tipo NÃO se deriva.
  const pendente = checklist({ defined: false, label: null }).find(item => item.kind === "unit_type");
  assert.equal(pendente?.resolved, false);
  assert.match(pendente?.what || "", /falta decisão humana/);
});

test("§4 — a fiação pergunta o tipo também para candidato sem ArticleDNA", () => {
  assert.match(workspace, /suggestEditorialUnitClassification\(\{ principal: art\.mainKeywordObj, published: art\.isPublished \}\)/);
  // E continua lendo a versão gravada quando ela existe: derivar não sobrepõe
  // o que já foi decidido e persistido.
  assert.match(workspace, /articleDnaVersion\.payload\.unitClassification \|\| suggestEditorialUnitClassification/);
  // `null` só sobra para linha que não é candidata nem tem ArticleDNA.
  assert.match(workspace, /: null;/);
});

/* ======================= §1 · dois vereditos, dois nomes ================= */

test("§1 — parecer bruto e decisão operacional aparecem separados e nomeados", () => {
  assert.match(workspace, /Parecer bruto · \{articleSerpVerdict\.label\}/);
  assert.match(workspace, /data-testid="architect-serp-operational-decision"/);
  assert.match(workspace, /sustentada · manter composição/);
  assert.match(workspace, /não libera concluir/);
  // A decisão operacional vem do GATE, não de um segundo cálculo na tela.
  assert.match(workspace, /const gate = art\.candidateRef \? articleSerpGates\.get\(art\.candidateRef\) : undefined;/);
  // E o rótulo bruto deixou de ser apresentado como o resultado final.
  assert.doesNotMatch(workspace, /Resultado · \{articleSerpVerdict\.label\}/);
});

/* ==================== §2 · uma autoridade de papel ====================== */

test("§2 — o papel do card vem da composição do candidato, não do reviewRole", () => {
  const trecho = workspace.slice(workspace.indexOf("const formationRoleFor"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));
  // A composição do candidato responde primeiro.
  assert.match(corpo, /articleFormationUniverses/);
  assert.match(corpo, /candidato\?\.keywords\.find\(item => item\.keywordId === String\(keyword\.id\)\)/);
  // `reforco` e `reforco_narrativo` são o mesmo papel com dois nomes.
  assert.match(corpo, /membro\.role === "reforco" \? "reforco_narrativo" : "secundaria"/);
  // Publicado não passa pelo formador e continua no papel manual.
  assert.match(corpo, /return manualKeywordRoleFor\(/);

  // E o card deixou de ler o papel legado direto.
  assert.match(workspace, /MANUAL_KEYWORD_ROLE_LABELS\[formationRoleFor\(art, keyword\)\]/);
  assert.doesNotMatch(workspace, /MANUAL_KEYWORD_ROLE_LABELS\[manualKeywordRoleFor\(keyword\)\]/);
});

/* ================== §3 · ARTICLE_INTENT_SOURCE = KEYWORD_DNA ============ */

test("§3 — 'Pendente' no registro semântico não vira intenção do artigo", () => {
  // É o estado real do lote: a coluna e `intencao_principal` vêm "Pendente"
  // enquanto o KeywordDNA canônico já responde "Informativa".
  const canonico = resolveKeywordDnaSignals({
    keywordId: "k3",
    text: "skincare para pele oleosa",
    semanticQualification: { intent: "Informativa", semanticState: "conclusive" },
    semantic: { intencao_principal: "Pendente", entidade_central: "skincare" },
  });
  assert.equal(canonico.intent, "Informativa", "a qualificação responde antes do registro");

  const semQualificacao = resolveKeywordDnaSignals({
    keywordId: "k3",
    text: "skincare para pele oleosa",
    semantic: { intencao_principal: "Pendente" },
  });
  assert.equal(semQualificacao.intent, null, "marcador de pendência não é intenção");
});

test("§3 — a classificação do artigo lê o DNA canônico, não a coluna legada", () => {
  const trecho = workspace.slice(workspace.indexOf("const classificationEvidenceFor"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  };"));
  assert.match(corpo, /const dna = dnaSignalsByKeyword\.get\(keywordId\)/);
  assert.match(corpo, /intent: dna\s*\n?\s*\? dna\.intent/);
  // A coluna `minerador_keywords.intent` saiu da conta.
  assert.doesNotMatch(corpo, /texto\(keyword\?\.intent\)/);
  // E o registro semântico só responde por ausência de DNA, já normalizado.
  assert.match(corpo, /intentIsKnown\(texto\(semantic\.intencao_principal\)\)/);
});

/* ============================ §6 · sem provider ========================= */

test("§6 — nenhuma destas correções chama o provider", () => {
  for (const arquivo of ["lib/arquiteto/unit-strategy.ts", "lib/arquiteto/article-review-checklist.ts"]) {
    const fonte = readFileSync(arquivo, "utf8");
    assert.doesNotMatch(fonte, /fetch\(|dataforseo|\/api\//i, `${arquivo} não pode falar com provider`);
  }
});
