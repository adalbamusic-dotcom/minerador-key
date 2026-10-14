import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * 2026-10-13 · CASO REAL (WifiConecta, grupo azul "Wi-Fi e fibra óptica").
 *
 * As 7 keywords do azul perderam o Assunto (o antigo "Assunto: Não" do
 * Vínculo apagou `keyword_subject`), mas o GRUPO continuou com plano (v1).
 * Como o Arquiteto só reconhecia o plano pelo Assunto das keywords:
 *   1. "Processar arquitetura" espalhou as keywords do azul por Silos
 *      ("internet barata residencial") em vez de seguir o plano;
 *   2. com a etiqueta azul escolhida, o painel da melhoria mostrava a análise
 *      antiga da marca inteira (Assuntos do laranja).
 * Agora o plano gravado no grupo é a autoridade, e o painel respeita a cor.
 */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("o plano do GRUPO (planVersion > 0) entra no recorte do Arquiteto mesmo sem Assunto nas keywords", () => {
  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  const inicio = tela.indexOf("const gruposComPlanoChave = useMemo(");
  const trecho = tela.slice(inicio, tela.indexOf("const [silosDosPlanos", inicio));
  assert.match(trecho, /standing\.plan!\.groupId/, "o Assunto das keywords continua acrescentando grupos");
  assert.match(trecho, /arquitetoGroups\.groups\s*\.filter\(group => group\.status === "active" && group\.planVersion > 0\)/, "o plano gravado no grupo basta");
  assert.match(trecho, /\[subjectStandings, selectedBrandId, arquitetoGroups\.groups\]/);
});

test("com uma cor na etiqueta, o painel da melhoria busca só aquela cor e avisa a análise de outro recorte", () => {
  const painel = semComentarios(ler("../modules/arquiteto/article-improvement-panel.tsx"));
  assert.match(painel, /const recorteAtivo = activeGroup \? \{ group: activeGroup\.requested \} : \{\};/);
  assert.match(painel, /if \(next\.kind === "prepare"\) void execute\("prepare", recorteAtivo\);/, "o cartão Próximo passo usa a cor");
  assert.match(painel, /onClick=\{\(\) => void execute\("prepare", recorteAtivo\)\}>\{activeGroup \? `Buscar keywords da cor \$\{activeGroup\.label\} \(grátis\)`/, "o botão diz a cor");
  assert.match(painel, /execute\("prepare", \{ \.\.\.recorteDaExecucao, discover: true \}\)/, "a busca nova no Google Ads mantém o recorte da execução");
  assert.match(painel, /execute\("prepare", \{ \.\.\.recorteDaExecucao, reworkReason: reason \}\)/, "refazer mantém o recorte da execução");
  assert.match(painel, /data-testid="architect-improvement-other-scope"/);
  assert.match(painel, /run\.groupScope\?\.requested !== activeGroup\.requested/);

  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  assert.match(tela, /activeGroup=\{\(\(\) => \{ const filtro = arquitetoGroups\.filter; if \(filtro\.kind !== "group"\) return null;/);
});
