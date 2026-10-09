import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/*
 * O ENCADEAMENTO AUTOMÁTICO NÃO PAGA A IA DUAS VEZES PELO MESMO PACOTE (2026-10-02).
 *
 * Congelar YouTube ou Amazon num artigo do Google não muda o pacote do Google;
 * organizar de novo criaria outra proposta igual e gastaria uma chamada. O
 * automático manda `ifMissing`; os botões do painel não mandam e organizam de novo.
 */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));

test("a rota aceita ifMissing só como opção e repassa ao servidor", async () => {
  const rota = await ler("app/api/editorial/radar-article-blueprint/route.ts");
  assert.match(rota, /confirmPaid: z\.literal\(true\), ifMissing: z\.boolean\(\)\.optional\(\) \}\)\.strict\(\)/);
  assert.match(rota, /generateRadarArticleBlueprint\(\{ \.\.\.base, ifMissing: entrada\.ifMissing === true \}\)/);
});

test("o servidor reaproveita a versão do MESMO pacote antes de resolver o provider de IA", async () => {
  const servidor = await ler("lib/server/radar-article-blueprint.ts");
  const corpo = servidor.slice(servidor.indexOf("export async function generateRadarArticleBlueprint"));
  const reaproveita = corpo.indexOf("if (input.ifMissing)");
  const provider = corpo.indexOf("resolveDeepSeekCanonicalConfig(");
  assert.ok(reaproveita > 0 && provider > reaproveita, "a checagem vem antes da chamada paga");
  /*
   * 2026-10-09 · só a CONCLUÍDA do mesmo pacote (hash exato) ou da mesma
   * investigação congelada e ArticleDNA: a regra única do export
   * (`radarArticleBlueprintPick`, sem rascunho), e não mais "a primeira do
   * mesmo hash", que devolvia o rascunho antigo.
   */
  assert.match(corpo, /radarArticleBlueprintRowForInvestigation\(existentes, \{ bundleHash: montada\.bundleHash, investigation: investigacao \}\)/);
  assert.doesNotMatch(corpo.replace(/\/\*[\s\S]*?\*\//g, ""), /doPacote\[0\]/, "o rascunho do mesmo hash não é reaproveitado");
});

test("só o encadeamento automático manda ifMissing; o botão do painel organiza de novo", async () => {
  const pagina = await ler("modules/radar/radar-page.tsx");
  assert.match(pagina, /postRadarArticleBlueprintOrganize\(\{ brandId: marca, articleId, ifMissing: true \}\)/);
  const painel = await ler("modules/radar/radar-article-blueprint-panel.tsx");
  assert.match(painel, /\.\.\.\(input\.ifMissing \? \{ ifMissing: true \} : \{\}\)/);
  assert.equal(/enviar\("generate", \{[^}]*ifMissing/.test(painel), false, "o botão do painel não manda ifMissing");
});
