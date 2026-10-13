import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { looksLikeSiloPlanText } from "../lib/minerador/plan-text-detector.ts";

/*
 * 2026-10-13 · PLANO DE SILO ENTRA POR UMA PORTA SÓ.
 *
 * Caso real (WifiConecta): o dono colou o plano do Silo 2 em "Colar
 * keywords" e ele virou 36 "keywords" na Descoberta ("Nome: …", "Slug: …",
 * títulos e descrições). Depois achou o card "Cadastrar Assuntos", colou o
 * plano no "Nome do Silo" (campo de uma linha) e as linhas ficaram vazias.
 *
 * Agora: colar/CSV de keyword recusam texto de plano e oferecem o card; o
 * Processador só tem o card; colar o plano em qualquer campo do card
 * preenche tudo. Sem rede.
 */

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SILO_2 = [
  "Silo 2 — Wi-Fi, fibra óptica e qualidade da internet",
  "Nome: Wi-Fi e fibra óptica",
  "Slug: /wifi-e-fibra/",
  "Objetivo: conquistar tráfego de pessoas que querem entender a tecnologia, melhorar a conexão ou descobrir se precisam trocar de plano.",
  "9. Internet fibra óptica ou internet comum: qual a diferença e qual escolher?",
  "Artigo pilar • Palavra-chave: internet fibra óptica",
  "Explicar tecnologias de acesso, vantagens, limitações e o que observar na contratação.",
  "10. Qual a diferença entre internet e Wi-Fi? Entenda antes de contratar",
  "Palavra-chave: diferença entre internet e Wi-Fi",
  "Esclarecer a diferença entre a conexão da operadora e a rede sem fio dentro de casa.",
].join("\n");

test("o detector reconhece o plano do Silo 2 (também com CRLF) e deixa listas de keyword passarem", () => {
  assert.equal(looksLikeSiloPlanText(SILO_2), true);
  assert.equal(looksLikeSiloPlanText(SILO_2.replace(/\n/g, "\r\n")), true);
  assert.equal(looksLikeSiloPlanText("Palavra-chave: internet fibra óptica\nExplicar tecnologias de acesso."), true, "só um artigo também é plano");
  assert.equal(looksLikeSiloPlanText("internet fibra óptica\nwi-fi lento\nteste de velocidade da internet"), false);
  assert.equal(looksLikeSiloPlanText("palavra chave seo\nnome de domínio barato\nslug amigável"), false, "keyword com as mesmas palavras, sem rótulo com dois-pontos, é keyword");
  assert.equal(looksLikeSiloPlanText(""), false);
});

test("colar/CSV de keyword recusam texto de plano ANTES de gravar e oferecem o card", () => {
  const controles = semComentarios(ler("../modules/minerador/discovery/discovery-source-controls.tsx"));
  const inicio = controles.indexOf("const postSource = async");
  const corpo = controles.slice(inicio, controles.indexOf("const parseFile", inicio));
  const recusa = corpo.indexOf("looksLikeSiloPlanText(bruto)");
  assert.ok(recusa > 0 && recusa < corpo.indexOf("fetch("), "a portaria vem antes do POST da Descoberta");
  assert.match(corpo, /source === "manual" \? manualText : \(csvRows/, "vale para colar e para CSV");
  assert.match(controles, /Abrir em Cadastrar Assuntos/);
  assert.match(controles, /onPlanText\(texto\)/);
});

test("o Processador tem uma porta só (Cadastrar Assuntos); o Descobrir ganha o mesmo botão, primeiro", () => {
  const processador = semComentarios(ler("../modules/minerador/minerador-workspace.tsx"));
  assert.doesNotMatch(processador, /<DiscoverySourceControls\b|<DiscoverySourceTopbarActions\b/);
  assert.match(processador, /<SubjectCadastroButton onClick=\{\(\) => abrirCadastroDeAssuntos\(\)\} \/>/);
  assert.match(processador, /SUBJECT_CADASTRO_URL_PARAM\) !== "1"/, "abre o card quando chega do Descobrir");
  assert.match(processador, /initialText=\{planInitialText\}/);

  const descobrir = semComentarios(ler("../modules/minerador/discovery/discovery-keywords-page.tsx"));
  const acoes = descobrir.slice(descobrir.indexOf("const sourceActions = useMemo"));
  assert.ok(acoes.indexOf("<SubjectCadastroButton") < acoes.indexOf("<DiscoverySourceTopbarActions"), "Cadastrar Assuntos vem primeiro");
  assert.match(descobrir, /onPlanText=\{texto => \{ stashSubjectCadastroText\(brandIdFromRef\(brandRef\), texto\); router\.push\(subjectCadastroHref\(brandRef\)\); \}\}/);
});

test("no card, colar o plano em qualquer campo preenche tudo; o colar fica aberto e o botão mostra o nome", () => {
  const card = semComentarios(ler("../modules/minerador/subject-cadastro-card.tsx"));
  const colar = card.slice(card.indexOf("const colarPlano"), card.indexOf("const escolherSiloExistente"));
  assert.match(colar, /if \(!looksLikeSiloPlanText\(texto\)\) return;/, "colagem comum (uma keyword) segue normal");
  assert.match(colar, /event\.preventDefault\(\);[\s\S]*preencherDoTexto\(texto\)/);
  for (const campo of ["id={ids.name}", "id={ids.slug}", "id={ids.objective}", "id={ids.paste}"]) {
    const linha = card.slice(card.indexOf(campo), card.indexOf(campo) + 200);
    assert.match(linha, /onPaste=\{colarPlano\}/, campo);
  }
  assert.equal((card.match(/aria-label=\{`(?:Assunto|Keyword|Detalhes) da linha \$\{index \+ 1\}`\} onPaste=\{colarPlano\}/g) || []).length, 3, "título, keyword e detalhes das linhas");
  // 2026-10-13: o colar também aparece no Silo existente (escolhido), fechado ali; no Silo novo fica aberto.
  assert.match(card, /\{destino !== "existing_silo" \|\| existingGroupId \? \(\s*<details className="rounded-md border border-divider px-3 py-2" open=\{destino !== "existing_silo"\}>/);
  const preencher = card.slice(card.indexOf("const preencherDoTexto"), card.indexOf("const preencheuInicial"));
  assert.match(preencher, /const novas = lidas\.filter\(linha => !jaGravada\(linha\)\);/, "no Silo existente, o artigo colado que já está gravado fica como está");
  assert.match(preencher, /setLinhas\(\[\.\.\.gravadas, \.\.\.novas\]\);/);
  assert.match(card, /<span>Cadastrar Assuntos<\/span>/);
  assert.match(card, /useState\(initialText\)/);
});
