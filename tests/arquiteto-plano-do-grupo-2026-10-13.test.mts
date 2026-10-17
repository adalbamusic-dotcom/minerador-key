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

test("o plano do GRUPO entra no recorte do Arquiteto mesmo sem Assunto nas keywords — e só o plano declarado DE FATO conta", () => {
  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  const inicio = tela.indexOf("const gruposComPlanoChave = useMemo(");
  const trecho = tela.slice(inicio, tela.indexOf("const [silosDosPlanos", inicio));
  assert.match(trecho, /standing\.plan!\.groupId/, "o Assunto das keywords continua acrescentando grupos");
  // 2026-10-14 (F7 "Excluir tudo da cor"): limpar o plano deixa plan_version > 0 e plan = null. A versão só dispara a releitura (e entra na chave);
  // quem diz se há plano é a leitura do plano (listEditorialGroupPlans: plan não nulo + readDeclaredSiloPlan).
  assert.match(trecho, /\.filter\(group => group\.status === "active" && \(group\.origin === "declared_plan" \|\| group\.planVersion > 0\)\)/);
  assert.match(trecho, /\.map\(group => `\$\{group\.id\}:\$\{group\.planVersion\}`\)/, "limpar o plano sobe a versão: a leitura é refeita");
  assert.match(trecho, /\[subjectStandings, selectedBrandId, arquitetoGroups\.groups\]/);
  const efeito = tela.slice(tela.indexOf("const [silosDosPlanos"), tela.indexOf("const declaredPlanGroupsForArchitecture"));
  assert.match(efeito, /const plano = group\.status === "active" \? readDeclaredSiloPlan\(group\.plan\) : null;/);
  assert.match(efeito, /setPlanosDaMarca\(\{ brandId: selectedBrandId, groups: comPlano\.map/);
  // Os selos do plano leem o plano de fato, nunca a versão.
  assert.doesNotMatch(tela, /groupHasPlan: [^,]*planVersion > 0/);
  assert.match(tela, /groupHasPlan: Boolean\(resumo && grupoTemPlano\(resumo\.id\)\)/);
  assert.match(tela, /siloDeclaredPlanSeal\(\{ groupHasPlan: grupoTemPlano\(resumo\.id\)/);
  assert.match(tela, /const grupoTemPlano = useCallback\(\(groupId: string \| null \| undefined\) => Boolean\(groupId && planosLidos\?\.some\(plano => plano\.groupId === groupId\)\), \[planosLidos\]\);/);
});

test("com uma cor na etiqueta, o painel da melhoria busca só aquela cor e avisa a análise de outro recorte", () => {
  /*
   * 2026-10-17 (noite) · SUBSTITUÍDOS o botão "Buscar keywords da cor …" e o aviso "análise de outro recorte" (dono:
   * "tem 7 botões totalmente inúteis"): abrir o refazedor JÁ lê a cor da etiqueta (a leitura é sempre a de agora);
   * a busca nova, o refazer e a leitura paga mantêm o recorte da execução.
   */
  const painel = semComentarios(ler("../modules/arquiteto/article-improvement-panel.tsx"));
  assert.match(painel, /const recorte = activeGroup \? \{ group: activeGroup\.requested \} : \{\};/);
  assert.match(painel, /void execute\("prepare", recorte, null\);/, "abrir lê a cor da etiqueta");
  assert.match(painel, /\.\.\.\(action === "prepare" \? \{ discover: true \} : \{\}\)/, "a busca nova no Google Ads é passo da leitura");
  assert.match(painel, /const recorteDaExecucao = run\?\.groupScope \? \{ group: run\.groupScope\.requested \} : recorte;/);
  assert.match(painel, /execute\("prepare", \{ \.\.\.recorteDaExecucao, reworkReason: dito \}\)/, "refazer mantém o recorte da execução");
  assert.doesNotMatch(painel, /Buscar keywords da cor|architect-improvement-other-scope/);

  const tela = semComentarios(ler("../modules/arquiteto/arquiteto-workspace.tsx"));
  // 2026-10-14 · a etiqueta escolhe por COR (`kind: "groups"`): sem isso o painel analisava a marca inteira com o azul escolhido.
  assert.match(tela, /const cor = filtro\.kind === "groups" \? filtro\.color : filtro\.kind === "group" \? arquitetoGroups\.groupById\.get\(filtro\.groupId\)\?\.color \?\? null : null;/);
});
