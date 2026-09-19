import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Redator registra a operação na GlobalTopbar e preserva a toolbar do editor", () => {
  const writer = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");

  assert.match(writer, /useGlobalTopbarControlsRegistration/);
  assert.match(writer, /moduleId: "redator"/);
  /* CORTE 3.5 · a barra passou a carregar abas de ambiente e controles do documento. */
  assert.match(writer, /data-redator-environment-tabs/);
  assert.match(writer, /data-redator-document-actions/);
  assert.match(writer, /useLocalHistory\("redator"/);
  assert.equal((writer.match(/useLocalHistory\("redator"/g) || []).length, 1, "o Redator mantém uma única pilha de histórico operacional");
  assert.doesNotMatch(writer, /topbarHistoryHandlersRef/);
  assert.match(writer, /<HistoryControls moduleId="redator" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.match(writer, /global-topbar-history/);

  assert.match(writer, /setImportOpen\(true\)/);
  /* `Tela cheia` foi apagada e não tem substituta. */
  assert.doesNotMatch(writer, /setFullscreen/);
  /* Publicações é área própria, pela navegação lateral — não um atalho na barra. */
  assert.doesNotMatch(writer, /href="\/publicacoes"/);
  assert.match(writer, /WorkflowStatusBadge status=\{selected\.status\}/);
  assert.match(writer, /wordCount} palavras/);

  assert.match(writer, /<Toolbar editor=\{editor\}/);
  assert.match(writer, /canUndo: \(\) =>/);
  assert.match(writer, /canRedo: \(\) =>/);
  assert.match(writer, /undo: \(\) =>/);
  assert.match(writer, /redo: \(\) =>/);
  assert.match(writer, /undoLabel: "Desfazer edição"/);
  assert.match(writer, /redoLabel: "Refazer edição"/);
  assert.match(writer, /historyLabel: "Histórico do documento"/);
  assert.doesNotMatch(writer, /action\("Desfazer", <Undo2/);
  assert.doesNotMatch(writer, /action\("Refazer", <Redo2/);
  assert.match(writer, /action\(`H\$\{level\}`/);
  assert.match(writer, /action\("Localizar", <Search/);

  assert.doesNotMatch(writer, /<header className="flex h-11/);
  assert.doesNotMatch(writer, /router\.(back|forward)\(|window\.history\.(back|forward)\(/);
});

test("Redator não registra uma busca de área na GlobalTopbar", () => {
  const writer = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  const registration = writer.slice(writer.indexOf("const globalTopbarControls ="), writer.indexOf("const globalTopbarControlsRef"));

  assert.doesNotMatch(registration, /\bsearch\s*:/);
  assert.doesNotMatch(registration, /history\.(undo|redo)\b/);
  /*
   * ===== CORTE 3.5 · A BARRA GLOBAL PASSOU A CARREGAR O DOCUMENTO =====
   *
   * As três asserções anteriores exigiam `Importar do Planejador`, `Tela cheia`
   * e `Publicações` aqui. As três descreviam superfícies que saíram:
   *
   *   - a entrada do Redator é "Importar do Radar", no painel esquerdo;
   *   - `Tela cheia` foi apagada e não tem substituta;
   *   - `Publicações` é área própria, pela navegação lateral.
   *
   * O que entrou no lugar são as abas de ambiente e os controles do documento —
   * antes espalhados por duas barras horizontais extras.
   */
  assert.match(registration, /data-redator-environment-tabs/);
  assert.match(registration, /data-redator-document-actions/);
  for (const controle of ["Artigo", "Roteiro e storyboard", "Carrossel", "palavras", "Salvar rascunho", "Finalizar artigo"]) {
    assert.ok(registration.includes(controle), `a GlobalTopbar precisa de: ${controle}`);
  }
  assert.doesNotMatch(registration, /Tela cheia/);
  assert.doesNotMatch(registration, /Conectar IA/);
});

test("os controles do Redator não voltam a esconder-se atrás de uma barra de rolagem", () => {
  const writer = readFileSync(new URL("../components/editorial/professional-writer.tsx", import.meta.url), "utf8");
  const registration = writer.slice(writer.indexOf("const globalTopbarControls ="), writer.indexOf("const globalTopbarControlsRef"));
  /* Os comentários deste bloco citam as classes proibidas; comparar só o código. */
  const codigo = registration.replace(/\/\*[\s\S]*?\*\//g, "");
  const topbar = readFileSync(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");

  /*
   * A barra tem altura fixa (`h-10`). Um scroller dentro dela desenha o trilho
   * sobre a altura útil, que foi o defeito relatado; `flex-wrap` produziria uma
   * segunda linha cortada. Nenhum dos dois pode voltar.
   */
  assert.doesNotMatch(codigo, /overflow-[xy]-(?:auto|scroll)/);
  assert.doesNotMatch(codigo, /flex-wrap/);

  /*
   * A largura vem daqui: as laterais são dimensionadas pelo conteúdo e o centro
   * fica com a folga. Com os três blocos em `flex-1` o centro recebia um terço,
   * menos do que os controles do documento ocupam.
   */
  assert.match(topbar, /const redatorLayout = model\.moduleId === "redator"/);
  assert.match(topbar, /redatorLayout \? "flex-initial" : "flex-1"/);
  assert.equal((topbar.match(/redatorLayout \? "flex-initial" : "flex-1"/g) || []).length, 2, "as duas laterais cedem a folga ao centro");

  /*
   * Medido no navegador em 1024px: sem isto os controles transbordavam o centro
   * em 9px e `Finalizar artigo` colidia com a aba `Artigo`. A contagem de
   * palavras é o item decorativo e some antes de qualquer colisão.
   */
  assert.match(registration, /hidden shrink-0 tabular-nums text-text-muted xl:inline/);
  /* Quem cede espaço é o texto de estado do save, truncando — nunca os botões. */
  assert.match(registration, /min-w-0 max-w-64 truncate/);
});

test("GlobalTopbar permite semântica separada para edição e histórico operacional", () => {
  const topbar = readFileSync(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");

  assert.match(topbar, /undoLabel\?: string/);
  assert.match(topbar, /redoLabel\?: string/);
  assert.match(topbar, /historyLabel\?: string/);
  assert.match(topbar, /undoTitle\?: string/);
  assert.match(topbar, /historyTitle\?: \(count: number\) => string/);
  assert.match(topbar, /aria-label=\{moduleControls\.history\.undoLabel \|\| "Desfazer"\}/);
  assert.match(topbar, /aria-label=\{moduleControls\.history\.historyLabel \|\| "Histórico"\}/);
});
