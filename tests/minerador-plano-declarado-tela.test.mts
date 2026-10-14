import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * O CARD "CADASTRAR ASSUNTOS" (SDD `sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * §3.1; substitui "Importar plano do Silo" da F4 de 2026-10-12 e o "Colar
 * Assuntos" do Processador).
 *
 * Provas estruturais, sem DOM, sem rede e sem custo: o card fala só com a rota
 * do núcleo único, gera a prévia antes de gravar, manda o importRequestId da
 * prévia no envio, só anuncia o resultado depois da resposta, o botão existe
 * no Minerador e as portas antigas saíram. Os comentários são tirados antes de
 * cada conferência, para o teste não casar com a própria explicação.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const semComentarios = (texto: string) => texto
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CARD = semComentarios(read("modules/minerador/subject-cadastro-card.tsx"));
const TELA = semComentarios(read("modules/minerador/minerador-workspace.tsx"));

function trecho(fonte: string, inicio: string, fim: string): string {
  const a = fonte.indexOf(inicio);
  assert.ok(a >= 0, `não achei "${inicio}"`);
  const b = fonte.indexOf(fim, a + inicio.length);
  assert.ok(b > a, `não achei "${fim}" depois de "${inicio}"`);
  return fonte.slice(a, b);
}

const PREVIA = trecho(CARD, "const handlePreview = async", "const handleApply = async");
const ENVIO = trecho(CARD, "const handleApply = async", "const busy = ");

test("o card chama só a rota /plans/import (POST e o GET do Silo existente) e não escreve direto no banco", () => {
  assert.match(CARD, /\/api\/minerador\/marcas\/\$\{encodeURIComponent\(brandId\)\}\/plans\/import/);
  assert.equal((CARD.match(/\bfetch\s*\(/g) || []).length, 1, "um único fetch, o da rota do cadastro");
  assert.doesNotMatch(CARD, /minerador_keywords|\.from\s*\(|supabase/i);
  const rotas = CARD.match(/\/api\/[^`"'\s]*/g) || [];
  assert.ok(rotas.length >= 1 && rotas.every(rota => rota.startsWith("/api/minerador/marcas/")), `rotas inesperadas: ${rotas.join(", ")}`);
  assert.doesNotMatch(TELA, /plans\/import/, "a tela não chama a rota por fora do card");
});

test("a prévia vem antes do envio, e o envio repete o pedido da prévia", () => {
  assert.match(PREVIA, /mode:\s*"preview"/);
  assert.doesNotMatch(PREVIA, /mode:\s*"apply"/);
  assert.match(ENVIO, /mode:\s*"apply"/);
  assert.match(ENVIO, /if \(!preview \|\| !preview\.result\.canApply/);
  assert.match(ENVIO, /plan:\s*preview\.request\.plan/);
  assert.match(ENVIO, /group:\s*preview\.request\.group/);
  assert.match(ENVIO, /destination:\s*preview\.request\.destination/);
  /* 2026-10-13 · F1 (SDD arquiteto-só-lê/listas-leves): na substituição com algo saindo, o envio também espera o nome da cor; o botão diz "Substituir o plano" (ajuste declarado). */
  assert.match(CARD, /disabled=\{busy \|\| !result\?\.canApply \|\| Boolean\(applied\) \|\| !confirmacaoSubstituicaoOk\}/);
  assert.match(CARD, /\{result\?\.replace \? MODO_PLANO_LABELS\.replace : "Cadastrar"\}\s*<\/button>/);
  assert.match(CARD, /\bGerar prévia\s*<\/button>/);
  const invalida = trecho(CARD, "const invalidate = () =>", "const mudarLinha");
  assert.match(invalida, /setPreview\(null\)/, "mudar qualquer campo descarta a prévia");
});

test("o envio manda o importRequestId gerado uma vez por prévia; sucesso só depois da resposta", () => {
  assert.match(PREVIA, /importRequestId:\s*crypto\.randomUUID\(\)/);
  assert.doesNotMatch(ENVIO, /randomUUID/);
  assert.match(ENVIO, /importRequestId:\s*preview\.importRequestId/);
  const chamada = ENVIO.indexOf("await callCadastro(");
  const recusa = ENVIO.indexOf("if (!answer.ok)");
  const anuncio = ENVIO.indexOf("setApplied(result)");
  const releitura = ENVIO.indexOf("onApplied(");
  assert.ok(chamada >= 0 && recusa > chamada && anuncio > recusa && releitura > anuncio, "await → recusa → resultado → releitura da planilha");
  assert.match(ENVIO, /body\.mode !== "apply"/);
  assert.equal((CARD.match(/setApplied\((?!null\))/g) || []).length, 1);
});

test("o card tem cor, destino (Silo novo, Silo existente, artigo publicado) e, por linha, Assunto, keyword, detalhes, papel e trava", () => {
  assert.match(CARD, /new_silo: "Silo novo", existing_silo: "Silo existente", published: "Artigo publicado"/);
  assert.match(CARD, /auto: "Automática \(pelo volume\)", locked: "Travada", free: "Livre"/);
  for (const coluna of ["Assunto (título)", "Keyword", "Detalhes", "Papel", "Trava"]) assert.ok(CARD.includes(`>${coluna}</th>`), coluna);
  assert.match(CARD, /const preencherDoTexto = \(texto: string = colado\) => \{[\s\S]*?parseDeclaredPlanText\(texto\)/, "colar o plano em texto preenche as linhas");
  assert.match(CARD, /method: "GET", groupId/, "Silo existente lê as linhas gravadas (leitura compatível)");
  assert.match(CARD, /linhaVazia\(1, "Pilar"\)/, "no Silo novo a primeira linha nasce Pilar");
  assert.match(CARD, /maxLength=\{DECLARED_PLAN_SCOPE_MAX\}/);
});

test("GROUPS_NOT_AVAILABLE esconde o recurso", () => {
  assert.match(PREVIA, /"GROUPS_NOT_AVAILABLE"\) \{ onUnavailable\(\); onClose\(\); return; \}/);
  assert.match(ENVIO, /"GROUPS_NOT_AVAILABLE"\) \{ onUnavailable\(\); onClose\(\); return; \}/);
  assert.match(TELA, /onUnavailable=\{\(\) => \{ setPlanImportOpen\(false\); keywordGroups\.markUnavailable\(\); \}\}/);
});

test("o botão \"Cadastrar Assuntos\" é a única porta: o diálogo antigo saiu e o Processador não declara Assunto", () => {
  assert.match(CARD, /aria-label="Cadastrar Assuntos"/);
  const acoes = trecho(TELA, "const discoverySourceActions = useMemo(", "]);");
  assert.match(acoes, /keywordGroups\.available \? <SubjectCadastroButton onClick=\{\(\) => abrirCadastroDeAssuntos\(\)\} \/> : null/);
  assert.match(trecho(TELA, "const abrirCadastroDeAssuntos = useCallback(", "}, ["), /setPlanImportOpen\(true\)/);
  assert.match(TELA, /<SubjectCadastroCard key=\{selectedBrandId\} brandId=\{selectedBrandId\} groups=\{keywordGroups\.activeGroups\}/);
  assert.equal(existsSync(join(ROOT, "modules/minerador/declared-plan-import-dialog.tsx")), false, "o diálogo \"Importar plano do Silo\" saiu");
  assert.doesNotMatch(TELA, /DeclaredPlanImportDialog|DeclaredPlanImportButton/);
  // 2026-10-13 · pedido do dono: o Processador não tem mais colar/CSV de keyword (moram no Descobrir).
  assert.doesNotMatch(TELA, /<DiscoverySourceControls\b/, "o Processador tem uma porta só, o card");
  const releitura = trecho(TELA, "const handleDeclaredPlanApplied = async", "const loadRecoverableKeywords");
  assert.match(releitura, /await handleSubjectsImported\(/);
  assert.doesNotMatch(releitura, /\.update\(|\.insert\(|\.upsert\(/, "a tela não grava: só relê");
});

test("o card segue o sistema visual (tokens, keyword, sem cor crua)", () => {
  assert.doesNotMatch(CARD, /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i);
  assert.doesNotMatch(CARD, /\btext-\[(?:[0-9]|1[01])px\]|\btext-xs\b/);
  assert.doesNotMatch(CARD, /\b(?:bg|text|border)-(?:slate|gray|zinc|emerald|amber|sky|white|black)\b/);
  assert.match(CARD, /className="text-keyword">\{article\.principal\.phrase\}/);
  assert.match(CARD, /EDITORIAL_GROUP_COLOR_LABELS\[option\]/, "a cor sempre com o nome escrito");
});
