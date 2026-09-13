import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * O DEADLOCK CIRCULAR DA ABA ARTIGOS.
 *
 * Homologação real de 2026-09-08, Brand care-glow. Depois de confirmar a fase
 * Silos, a aba Artigos sabia que existiam 3 candidatos — o painel dizia
 * "3 candidato(s)" e o mapa os desenhava — mas a tabela estava vazia e o botão
 * respondia "Selecione pelo menos um artigo".
 *
 *   para Processar artigos → precisa selecionar Article
 *   mas Article só nasce   → depois de Processar artigos
 *
 * A causa era uma linha: `formationCandidateByKeyword` só era montado quando
 * `articleFormationMarker` existia, e o marcador só nasce no processamento.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

const indiceDeCandidatos = workspace.slice(
  workspace.indexOf("const formationCandidateByKeyword = useMemo"),
  workspace.indexOf("const articlesList = useMemo"),
);

test("o índice de candidatos NÃO depende do marcador de processamento", () => {
  assert.ok(indiceDeCandidatos.length > 0, "índice de candidatos não encontrado");
  assert.equal(
    indiceDeCandidatos.includes("if (!articleFormationMarker) return indice;"),
    false,
    "o portão do marcador voltou: a tabela fica vazia e o botão exige seleção impossível",
  );
  // Ele é derivado dos universos de formação, que existem sem processamento.
  assert.ok(indiceDeCandidatos.includes("for (const universe of articleFormationUniverses)"));
  assert.ok(indiceDeCandidatos.includes("}, [articleFormationUniverses]);"));
});

test("a linha do candidato carrega candidateRef e se identifica como candidato", () => {
  const lista = workspace.slice(
    workspace.indexOf("const articlesList = useMemo"),
    workspace.indexOf("const articlesList = useMemo") + 9000,
  );
  // A identidade da linha vem do candidato — é ela que a seleção resolve.
  assert.ok(lista.includes("id: (c.candidateRef && articleSelectionIdForCandidate(c.candidateRef))"));
  assert.ok(lista.includes("candidateRef: c.candidateRef || null,"));
  /*
   * §5 — a linha diz o que ela É. Antes de processar não há SERP nem
   * ArticleDNA: chamá-la de Artigo prometeria um artefato inexistente.
   */
  assert.ok(lista.includes("isFormationCandidate: Boolean(c.candidateRef) && !articleFormationMarker"));
});

test("§5 — o rótulo separa processamento, conclusão e materialização", () => {
  /*
   * Eram DOIS estados: "aguardando processamento" e "ainda não confirmado".
   * Faltava o terceiro — formação concluída esperando o Silo canônico —, e
   * sem ele a mesa dizia "ainda não confirmado" sobre uma decisão já gravada
   * no remoto e sobrevivente ao F5.
   */
  assert.ok(workspace.includes("const formacao = readFormationConclusionState({"));
  const estado = readFileSync("lib/arquiteto/formation-conclusion-state.ts", "utf8");
  for (const marca of ["NOT_PROCESSED", "IN_FORMATION", "CONCLUDED_AWAITING_SILO", "MATERIALIZED"]) {
    assert.ok(estado.includes(marca), `o estado ${marca} precisa existir`);
  }
  assert.ok(estado.includes('unitDetail: "aguardando processamento"'));
  assert.ok(estado.includes('unitDetail: "formação concluída"'));
});

test("§4 — a autoridade de seleção resolve candidateRef sem exigir ArticleDNA", () => {
  const escopo = readFileSync("lib/arquiteto/article-selection-scope.ts", "utf8");
  /*
   * A autoridade sempre soube resolver linha → candidateRef; o que faltava era
   * a linha existir. Este teste guarda que ela não passe a exigir ArticleDNA.
   */
  assert.ok(escopo.includes("articles: readonly { id: string; candidateRef?: string | null"));
  assert.equal(escopo.includes("articleDnaVersionId"), false, "a seleção passou a exigir ArticleDNA");
  // UI e ações leem a MESMA contagem, do mesmo objeto.
  assert.ok(escopo.includes("selectedCount: number;"));
  assert.ok(escopo.includes("candidateRefs: Set<string>;"));
  assert.ok(workspace.includes("resolveFormationSelectionScope({ selectedArticleIds, articles: articlesList })"));
});

/* ============ §8 · inspeção do candidato antes de processar =========== */

test("§8 — o candidato expande e mostra a entrada da formação", () => {
  assert.ok(workspace.includes('data-testid="architect-candidate-formation-panel"'), "falta o painel do candidato");
  assert.ok(workspace.includes('data-testid="architect-candidate-member"'), "falta a linha por membro");

  // O que a pessoa precisa conferir antes de mandar para a SERP.
  for (const campo of ["candidateRef", "formationBaseHash", "Principal proposta"]) {
    assert.ok(workspace.includes(campo), `o painel não mostra ${campo}`);
  }
  // Por membro: papel, DNA e proveniência.
  assert.ok(workspace.includes("dnaSignalsByKeyword.get(String(keyword.id))"));
  assert.ok(workspace.includes("ausente(dna?.dnaVersionId)"));
  assert.ok(workspace.includes("ausente(dna?.dnaContentHash)"));
  assert.ok(workspace.includes("ausente(dna?.centralEntity)"));

  // §8 — leitura. Nenhum controle de edição de KeywordDNA no painel.
  const inicio = workspace.indexOf('data-testid="architect-candidate-formation-panel"');
  const painel = workspace.slice(inicio, workspace.indexOf("KeywordDNA é somente leitura aqui", inicio));
  for (const editavel of ["<input", "<textarea", "<select", "onChange"]) {
    assert.equal(painel.includes(editavel), false, `o painel do candidato tem ${editavel}`);
  }
});

test("§8 — ausência é declarada, não preenchida", () => {
  // Campo que o Minerador não produziu aparece como "—", nunca como zero.
  assert.ok(workspace.includes('valor === "" ? "—" : String(valor)'));
});
