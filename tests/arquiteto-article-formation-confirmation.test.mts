import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildArticleFormationConfirmationPlan,
  summarizeConfirmationPlan,
} from "../lib/arquiteto/article-formation-confirmation.ts";
import {
  buildArticleFormationUniverse,
  type ArticleFormationKeyword,
} from "../lib/arquiteto/article-formation.ts";

const SILO = "territory:11111111-1111-4111-8111-111111111111";

const kw = (id: string, keyword: string, overrides: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId: id,
  keyword,
  intent: "informacional",
  volume: 100,
  kgr: null,
  entity: null,
  problem: null,
  isPublished: false,
  ...overrides,
});

const universo = (keywords: ArticleFormationKeyword[], publicados: { path: string; label: string }[] = []) =>
  buildArticleFormationUniverse({
    siloRef: SILO,
    siloLabel: "Cremes",
    siloSlug: "/cremes",
    keywords,
    publishedArticles: publicados.map(item => ({
      normalizedUrl: `site.com.br${item.path}`,
      path: item.path,
      label: item.label,
      canonical: `site.com.br${item.path}`,
      matchedKeywordId: null,
    })),
  });

/* ------------------------- §28 confirmação parcial ----------------------- */

test("o que está pronto passa e o pendente continua candidato", () => {
  const resultado = universo([
    kw("k1", "creme hidratante facial"),
    // Nove buscas convergentes geram excesso além do teto: conflito declarado.
    ...Array.from({ length: 8 }, (_, index) =>
      kw(`x${index}`, `creme noturno ${["", "bom", "top", "novo", "ideal", "leve", "puro", "forte"][index]}`.trim(),
        { entity: "creme noturno", problem: "escolher creme noturno" })),
  ]);

  const plano = buildArticleFormationConfirmationPlan({ universes: [resultado] });
  assert.ok(plano.approved.length >= 1, "o candidato limpo precisa passar");
  assert.ok(plano.blocked.length >= 1, "o candidato com excesso não pode passar às cegas");
  assert.equal(plano.blocked[0].code, "FORMATION_CONFLICT");
  // Bloquear o lote inteiro por causa de um caso duvidoso seria impasse.
  assert.equal(plano.approved.length + plano.blocked.length, resultado.candidates.length);
});

/* --------------------------- §31 slug validado --------------------------- */

test("dois candidatos não saem com o mesmo endereço", () => {
  // Depois de descontar o pai `/cremes`, ambas reduzem ao mesmo slug.
  const resultado = universo([
    kw("k1", "creme hidratante", { intent: "informacional" }),
    kw("k2", "cremes hidratante", { intent: "comercial" }),
  ]);
  assert.equal(resultado.candidates.length, 2, "intenções diferentes mantêm dois candidatos");

  const plano = buildArticleFormationConfirmationPlan({ universes: [resultado] });
  assert.equal(plano.approved.length, 1, "só um pode ficar com o endereço");
  assert.equal(plano.blocked.length, 1);
  assert.equal(plano.blocked[0].code, "SLUG_BLOCKED");
});

test("cada aprovado leva o caminho completo sob o Silo", () => {
  const plano = buildArticleFormationConfirmationPlan({
    universes: [universo([kw("k1", "creme hidratante facial")])],
  });
  assert.equal(plano.approved[0].slug, "hidratante-facial");
  assert.equal(plano.approved[0].fullPath, "/cremes/hidratante-facial");
});

/* ---------------------------- §32 publicado vence ------------------------ */

test("candidato que cai em cima de publicado vira reforço, não artigo", () => {
  const resultado = universo(
    [kw("k1", "creme hidratante facial")],
    [{ path: "/cremes/hidratante-facial", label: "Guia de hidratação" }],
  );

  const plano = buildArticleFormationConfirmationPlan({ universes: [resultado] });
  assert.equal(plano.approved.length, 0, "publicado vence: não se confirma por cima");
  assert.equal(plano.blocked[0].code, "PUBLISHED_COLLISION");
  assert.match(plano.blocked[0].reason, /publicado/i);
});

test("§29 publicado é reconhecido e protegido, nunca materializado de novo", () => {
  const resultado = universo(
    [kw("k1", "creme noturno antissinais")],
    [
      { path: "/cremes/hidratante-facial", label: "Guia de hidratação" },
      { path: "/cremes/creme-de-dia", label: "Creme de dia" },
    ],
  );

  const plano = buildArticleFormationConfirmationPlan({ universes: [resultado] });
  assert.equal(plano.protectedPublished.length, 2);
  // Nenhum aprovado aponta para um caminho publicado.
  const caminhosPublicados = new Set(plano.protectedPublished.map(item => item.path));
  assert.ok(plano.approved.every(entry => !caminhosPublicados.has(entry.fullPath)));
});

/* -------------------------------- síntese -------------------------------- */

test("a síntese conta aprovados, bloqueados e reforços", () => {
  const resultado = universo(
    [kw("k1", "creme hidratante facial"), kw("k2", "creme noturno antissinais")],
    [{ path: "/cremes/hidratante-facial", label: "Guia de hidratação" }],
  );

  const plano = buildArticleFormationConfirmationPlan({ universes: [resultado] });
  const resumo = summarizeConfirmationPlan(plano);
  assert.equal(resumo.approved + resumo.blocked, resultado.candidates.length);
  assert.equal(resumo.protectedPublished, 1);
  assert.equal(resumo.reinforcements, 1);
});

/* ---------------------------- contrato do corte -------------------------- */

test("o plano é puro: não escreve, não chama provider, não cria ArticleDNA", () => {
  const source = readFileSync("lib/arquiteto/article-formation-confirmation.ts", "utf8")
    .split("\n")
    .filter(line => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    })
    .join("\n");

  assert.doesNotMatch(source, /fetch\(|supabase|persistArquitetoArtifact|createVersionEnvelope/);
  // O plano LÊ o gate SERP que o chamador passa; ele não chama provider e não
  // coleta nada. Proibir a palavra proibiria a portaria de exigir evidência.
  assert.doesNotMatch(source, /dataforseo|deepseek/i);
  assert.doesNotMatch(source, /collectDataForSeo|callStrategicApi|api\/arquiteto/);
  // A validação de slug é a que já existe; nada de regra paralela.
  assert.match(source, /validateSlugArchitecture/);
});

test("o candidato nunca entra no validador como publicado", () => {
  const source = readFileSync("lib/arquiteto/article-formation-confirmation.ts", "utf8");
  // É `isPublished: false` no candidato que impede o validador de propor
  // mudança numa URL que já está no ar.
  const inicio = source.indexOf("const assunto: SlugSubject");
  const trecho = source.slice(inicio, source.indexOf("};", inicio));
  assert.match(trecho, /isPublished: false/);
  assert.doesNotMatch(trecho, /isPublished: true/);
});
