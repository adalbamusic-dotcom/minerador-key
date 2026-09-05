import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  identityTokens,
  normalizeSlug,
  slugSegments,
  validateManualSiloSlug,
  validateSlugArchitecture,
  type SlugSubject,
} from "../lib/arquiteto/slug-architecture.ts";

/**
 * Arquitetura de slug.
 *
 * Slug é decisão estrutural: pai, irmãos e publicados entram na mesma leitura.
 * Determinístico — sem IA, sem provider, sem score arbitrário.
 */

const siloPage = (ref: string, slug: string, overrides: Partial<SlugSubject> = {}): SlugSubject => ({
  kind: "silo_page", ref, label: ref, slug, parentRef: null, hierarchy: null, isPublished: false, canonical: null, ...overrides,
});

const article = (ref: string, slug: string, parentRef: string, overrides: Partial<SlugSubject> = {}): SlugSubject => ({
  kind: "article", ref, label: ref, slug, parentRef, hierarchy: "Suporte", isPublished: false, canonical: null, ...overrides,
});

const codes = (result: ReturnType<typeof validateSlugArchitecture>) => result.issues.map(issue => issue.code);

test("normalização trata acento, caixa, hífen e barra final como a mesma identidade", () => {
  assert.equal(normalizeSlug("/Cremes/"), "cremes");
  assert.equal(normalizeSlug("cremes"), "cremes");
  assert.equal(normalizeSlug("/CREMES//"), "cremes");
  assert.equal(normalizeSlug("/açaí-e-cia/"), "acai-e-cia");
  assert.equal(normalizeSlug("/Cremes/Para o Rosto/"), "cremes/para-o-rosto");
  assert.deepEqual(slugSegments("/cremes/para-o-rosto/"), ["cremes", "para-o-rosto"]);

  // Plural e stopword não criam identidades diferentes.
  assert.deepEqual([...identityTokens("cremes")], ["creme"]);
  assert.deepEqual([...identityTokens("creme-para-o-rosto")], ["creme", "rosto"]);
});

test("colisão exata bloqueia", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-a", "/silo-x/"), siloPage("silo-b", "/silo-x/")],
  });

  assert.equal(resultado.status, "blocked");
  assert.deepEqual(codes(resultado), ["EXACT_COLLISION"]);
});

test("colisão normalizada bloqueia mesmo com grafia diferente", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-a", "/Cremes/"), siloPage("silo-b", "/cremes")],
  });

  assert.equal(resultado.status, "blocked");
  assert.deepEqual(codes(resultado), ["NORMALIZED_COLLISION"]);
});

test("filho que repete o pai é redundância arquitetural, com sugestão", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-cremes", "/cremes/"), article("art-1", "/creme-para-o-rosto", "silo-cremes")],
  });

  assert.equal(resultado.status, "warning");
  assert.deepEqual(codes(resultado), ["REDUNDANT_PARENT_CHILD"]);
  // Sugestão determinística: tira do filho o contexto que o pai já carrega.
  assert.deepEqual(resultado.suggestions, [{
    subject: "art-1",
    slug: "/para-o-rosto",
    reason: 'O contexto "creme" já vem do pai.',
  }]);
});

test("filho que não repete o pai é permitido", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-cremes", "/cremes/"), article("art-1", "/para-o-rosto", "silo-cremes")],
  });

  assert.equal(resultado.status, "valid");
  assert.deepEqual(resultado.issues, []);
});

test("redundância vale também quando o filho só acrescenta cauda", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-manicure", "/manicure/"), article("art-1", "/manicure-perto-de-mim", "silo-manicure")],
  });

  assert.equal(resultado.status, "warning");
  assert.deepEqual(codes(resultado), ["REDUNDANT_PARENT_CHILD"]);
  assert.equal(resultado.suggestions[0].slug, "/perto-de-mim");
});

test("página do silo e Pilar com a mesma identidade é conflito bloqueante", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-cremes", "/cremes/"),
      article("art-pilar", "/creme", "silo-cremes", { hierarchy: "Pilar" }),
    ],
  });

  assert.equal(resultado.status, "blocked");
  assert.deepEqual(codes(resultado), ["SILO_PAGE_PILLAR_IDENTITY_CONFLICT"]);
});

test("suporte que reproduz a página pai é sinalizado", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-cremes", "/cremes/"),
      article("art-sup", "/creme", "silo-cremes", { hierarchy: "Suporte" }),
    ],
  });

  assert.deepEqual(codes(resultado), ["SUPPORT_DUPLICATES_PARENT"]);
  assert.equal(resultado.status, "warning");
});

test("dois artigos com o mesmo slug bloqueiam", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-cremes", "/cremes/"),
      article("art-1", "/hidratacao-facial", "silo-cremes"),
      article("art-2", "/hidratacao-facial", "silo-cremes"),
    ],
  });

  assert.equal(resultado.status, "blocked");
  assert.ok(codes(resultado).includes("EXACT_COLLISION"));
});

test("irmãos com a mesma identidade estrutural são sinalizados", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-cremes", "/cremes/"),
      article("art-1", "/hidratacao-da-pele", "silo-cremes"),
      article("art-2", "/pele-hidratacao", "silo-cremes"),
    ],
  });

  assert.ok(codes(resultado).includes("SIBLING_REDUNDANCY"));
  assert.equal(resultado.status, "warning");
});

test("pai publicado permanece protegido; a sugestão recai só sobre o filho", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-cremes", "/cremes/", { isPublished: true, canonical: "https://marca.com/cremes/" }),
      article("art-1", "/creme-para-o-rosto", "silo-cremes"),
    ],
  });

  const redundancia = resultado.issues.find(issue => issue.code === "REDUNDANT_PARENT_CHILD");
  assert.ok(redundancia);
  assert.equal(redundancia.subject, "art-1", "o publicado nunca é o alvo da mudança");
  assert.equal(redundancia.relatedSubject, "silo-cremes");
  assert.deepEqual(resultado.suggestions.map(item => item.subject), ["art-1"]);
});

test("canonical publicado conflitante bloqueia o candidato, não o publicado", () => {
  const resultado = validateSlugArchitecture({
    subjects: [
      siloPage("silo-pub", "/cuidados/", { isPublished: true, canonical: "https://marca.com/cuidados/" }),
      siloPage("silo-novo", "/cuidados-novo", { canonical: "https://marca.com/cuidados/" }),
    ],
  });

  assert.equal(resultado.status, "blocked");
  const conflito = resultado.issues.find(issue => issue.code === "CANONICAL_CONFLICT");
  assert.ok(conflito);
  assert.equal(conflito.subject, "silo-novo");
  assert.equal(conflito.relatedSubject, "silo-pub");
});

test("+ Silo consulta o validador antes de criar", () => {
  const existentes = [siloPage("silo-cremes", "/cremes/")];

  const bloqueado = validateManualSiloSlug({ subjects: existentes, name: "Cremes", slug: "/cremes" });
  assert.equal(bloqueado.status, "blocked");
  assert.equal(bloqueado.issues[0].subject, "candidate:new-silo");

  const livre = validateManualSiloSlug({ subjects: existentes, name: "Protetor solar", slug: "/protetor-solar" });
  assert.equal(livre.status, "valid");
});

test("cada issue declara code, reason, subject e relatedSubject, sem score", () => {
  const resultado = validateSlugArchitecture({
    subjects: [siloPage("silo-cremes", "/cremes/"), article("art-1", "/creme-para-o-rosto", "silo-cremes")],
  });

  for (const issue of resultado.issues) {
    assert.ok(issue.code);
    assert.ok(issue.reason.trim());
    assert.ok(issue.subject);
    assert.ok("relatedSubject" in issue);
    assert.ok(["warning", "blocked"].includes(issue.severity));
  }

  const source = readFileSync("lib/arquiteto/slug-architecture.ts", "utf8");
  assert.doesNotMatch(source, /seoScore|score:\s*\d|penalt/i);
  // Determinístico: nada de IA, provider ou storage.
  assert.doesNotMatch(source, /fetch\(|supabase|deepseek|dataforseo|localStorage/i);
});

test("o validador nunca altera slug: só devolve leitura e sugestão", () => {
  const assuntos = [siloPage("silo-cremes", "/cremes/"), article("art-1", "/creme-para-o-rosto", "silo-cremes")];
  const congelado = JSON.stringify(assuntos);

  const primeira = validateSlugArchitecture({ subjects: assuntos });
  const segunda = validateSlugArchitecture({ subjects: assuntos });

  assert.equal(JSON.stringify(assuntos), congelado, "a entrada não é mutada");
  assert.deepEqual(primeira, segunda, "determinístico");
});

test("a página do Silo é unidade editorial própria na mesma mesa", () => {
  const rows = readFileSync("modules/arquiteto/territorial-workspace-rows.tsx", "utf8");

  assert.match(rows, /architect-silo-page-row/);
  assert.match(rows, /function SiloPageRow/);
  // Badge próprio, distinguível de Article e Keyword — e a estrutura observada
  // no site recebe rótulo diferente da página canônica do silo.
  assert.match(rows, /observadaNoSite \? "Estrutura" : "Silo"/);
  assert.match(rows, /architect-silo-page-counts/);
  // Mesma mesa: nenhuma segunda tabela.
  assert.doesNotMatch(rows, /<table/);
  // Design system, sem paleta nova. Comentários fora: a palavra "violeta"
  // aparece na justificativa e não é cor aplicada.
  const semComentario = rows.split("\n").filter(line => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  }).join("\n");
  assert.doesNotMatch(semComentario, /purple|violet|indigo|#[0-9a-fA-F]{3,6}/i);
  assert.match(rows, /text-module-accent/);
});

test("page status e canonical só aparecem quando existem de verdade", () => {
  const surface = readFileSync("lib/arquiteto/territorial-surface.ts", "utf8");

  // Candidato sem SiloPage declara null em vez de fingir rascunho.
  assert.match(surface, /pageStatus: territory\.slugState\.publishedSlug \? "published" : null/);
  assert.match(surface, /pageStatus: structure\.siloPageId \? \(structure\.isPublished \? "published" : "draft"\) : null/);
});

test("o formulário do + Silo consulta o validador antes de gravar", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

  assert.match(workspace, /validateManualSiloSlug\(\{/);
  assert.match(workspace, /arquitetura\.status === "blocked"/);
  // Bloqueio impede a criação; aviso exige confirmação humana.
  assert.match(workspace, /slugArchitectureAcknowledged/);
  // As identidades vêm dos contratos existentes, sem inventar outra.
  assert.match(workspace, /version\.payload\.suggestedSlug/);
  assert.match(workspace, /version\.payload\.slug/);
  assert.match(workspace, /slugState\.proposals\[0\]\?\.slug/);
});
