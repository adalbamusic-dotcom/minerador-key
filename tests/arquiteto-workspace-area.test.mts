import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARCHITECT_AREAS,
  ARCHITECT_AREA_PARAM,
  architectAreaHref,
  readArchitectAreaFromLocation,
  resolveArchitectArea,
} from "../lib/arquiteto/deep-link.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const canonicalWorkspace = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");

const HREF = "http://localhost:3000/care-glow--09762023/arquiteto";

test("a área explícita da URL vence o default em cada modo", () => {
  for (const area of ARCHITECT_AREAS) {
    const href = `${HREF}?${ARCHITECT_AREA_PARAM}=${area}`;
    assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(href), "articles"), area,
      `F5 em ${area} precisa voltar em ${area}`);
  }
});

test("sem área explícita cai no default vigente", () => {
  assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(HREF), "articles"), "articles");
  assert.equal(resolveArchitectArea(null, "articles"), "articles");
  // O default é parâmetro, não constante: trocá-lo depois não mexe no resolver.
  assert.equal(resolveArchitectArea(null, "silos"), "silos");
});

test("valor inválido cai no fallback seguro, sem lançar", () => {
  for (const invalido of ["", "   ", "SILO", "artigos", "../links", "silos;drop"]) {
    assert.equal(resolveArchitectArea(invalido, "articles"), "articles", invalido);
  }
  assert.equal(readArchitectAreaFromLocation("nao-e-url"), null);
  assert.equal(readArchitectAreaFromLocation(null), null);
  // Maiúsculas e espaços são normalizados, não recusados.
  assert.equal(resolveArchitectArea("  Silos  ", "articles"), "silos");
});

test("trocar de área reescreve a URL preservando os demais parâmetros", () => {
  const comExtras = `${HREF}?articleId=abc&x=1`;

  const href = architectAreaHref(comExtras, "silos");

  assert.ok(href);
  const url = new URL(href, HREF);
  assert.equal(url.searchParams.get(ARCHITECT_AREA_PARAM), "silos");
  assert.equal(url.searchParams.get("articleId"), "abc", "o deep link do artigo sobrevive");
  assert.equal(url.searchParams.get("x"), "1");
  assert.equal(url.pathname, "/care-glow--09762023/arquiteto", "nenhum segmento de rota novo");
});

test("não empilha histórico quando a área já é a atual", () => {
  assert.equal(architectAreaHref(`${HREF}?${ARCHITECT_AREA_PARAM}=silos`, "silos"), null);
  assert.notEqual(architectAreaHref(`${HREF}?${ARCHITECT_AREA_PARAM}=silos`, "articles"), null);
});

test("o workspace inicializa o modo pela URL e o mantém endereçável", () => {
  assert.match(workspace, /resolveArchitectArea\(readArchitectAreaFromLocation\(/);
  assert.match(workspace, /architectAreaHref\(window\.location\.href, workspaceMode\)/);
  assert.match(workspace, /window\.history\.replaceState/);
  // Preferência local nunca vira autoridade de rota.
  assert.doesNotMatch(workspace, /localStorage[^\n]*workspaceMode|IndexedDB[^\n]*workspaceMode/);
  // Silos é o default; a URL explícita continua acima da preferência local.
  assert.match(workspace, /readArchitectAreaFromLocation\([^)]*\), "silos"\)/);
});

test("a membership territorial atravessa o read-model sem storage novo", () => {
  const bloco = canonicalWorkspace.slice(
    canonicalWorkspace.indexOf("const assignment = item.payload"),
    canonicalWorkspace.indexOf("canonicalWorkflow: item,"),
  );

  // Projeção de leitura do mesmo payload; a autoridade continua no item da keyword.
  assert.match(bloco, /assignment\.territoryRef !== undefined \? \{ territoryRef: assignment\.territoryRef \}/);
  assert.match(bloco, /assignment\.territoryAssignment !== undefined/);
  // Nada é copiado para o Territory nem gravado em lugar novo.
  assert.doesNotMatch(bloco, /keywordRefs|territory\.keywordRefs|persist|insert|upsert/);
});

test("o trilho e o default combinados com a URL", () => {
  assert.match(workspace, /\["silos", "articles", "links"\] as const/);
  assert.deepEqual([...ARCHITECT_AREAS], ["silos", "articles", "links"]);
});

test("Silos é o default e a URL explícita continua vencendo", () => {
  assert.match(workspace, /readArchitectAreaFromLocation\([^)]*\), "silos"\)/);

  // Sem ?area, cai no default. Com ?area, a URL manda — inclusive para Artigos.
  assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(HREF), "silos"), "silos");
  assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(`${HREF}?${ARCHITECT_AREA_PARAM}=articles`), "silos"), "articles");
  assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(`${HREF}?${ARCHITECT_AREA_PARAM}=links`), "silos"), "links");
  assert.equal(resolveArchitectArea(readArchitectAreaFromLocation(`${HREF}?${ARCHITECT_AREA_PARAM}=silos`), "silos"), "silos");
  // Valor inválido não derruba a área: cai no default declarado.
  assert.equal(resolveArchitectArea("planilha", "silos"), "silos");
});
