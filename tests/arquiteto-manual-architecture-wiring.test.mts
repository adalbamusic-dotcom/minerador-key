import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  commitManualArchitecture,
  manualMoveTargets,
  requestManualArchitecture,
  resolveManualArchitecture,
  type PendingManualArchitecture,
} from "../lib/arquiteto/manual-architecture-interaction.ts";
import { articleMembers, effectivePrincipalCount, manualKeywordRoleFor, type ManualArchitectureItem } from "../lib/arquiteto/manual-architecture.ts";
import { MAX_KEYWORDS_PER_ARTICLE } from "../lib/arquiteto/domain-rules.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

type Item = ManualArchitectureItem;

const keyword = (id: string, articleKey: string | null, role: Item["reviewRole"], extra: Partial<Item> = {}): Item => ({
  id,
  keyword: `keyword ${id}`,
  clusterId: articleKey,
  provisionalGroupId: articleKey,
  reviewRole: role,
  isPublished: false,
  ...extra,
});

/** Cenário do smoke: "mascara skin care" com 6 keywords e "creamy mandelico" com 1. */
const smoke = (): Item[] => [
  keyword("m1", "group-mascara", "principal", { keyword: "mascara skin care" }),
  keyword("m2", "group-mascara", "secundaria", { keyword: "mascara de skincare" }),
  keyword("m3", "group-mascara", "secundaria", { keyword: "cremes skin care" }),
  keyword("m4", "group-mascara", "secundaria", { keyword: "mantecorp skin care" }),
  keyword("m5", "group-mascara", "secundaria", { keyword: "skin care natural" }),
  keyword("m6", "group-mascara", "secundaria", { keyword: "creme skin care" }),
  keyword("c1", "group-creamy", "principal", { keyword: "creamy mandelico" }),
];

const ARTICLES = [
  { id: "article:mascara", articleKey: "group-mascara", label: "mascara skin care" },
  { id: "article:creamy", articleKey: "group-creamy", label: "creamy mandelico" },
];

const targetsFor = (items: readonly Item[], currentArticleId: string) =>
  manualMoveTargets({ articles: ARTICLES, items, currentArticleId });

/**
 * Simulação do componente: estado pendente, confirmar e cancelar, com a
 * cópia de trabalho e a persistência reais do caminho canônico injetadas.
 */
function workingCopyHarness(initial: Item[], persistResult = true) {
  let items = initial;
  let pending: PendingManualArchitecture | null = null;
  const persisted: Item[][] = [];
  const notices: Array<{ tone: string; message: string }> = [];
  const history: string[] = [];

  return {
    get items(): Item[] { return items; },
    get pending(): PendingManualArchitecture | null { return pending; },
    get persisted(): Item[][] { return persisted; },
    get notices() { return notices; },
    get history() { return history; },
    /** onClick / onChange do controle. */
    request(input: Parameters<typeof requestManualArchitecture<Item>>[0]) {
      const request = requestManualArchitecture({ ...input, items });
      if (!request.ok) {
        notices.push({ tone: "error", message: request.reason });
        return false;
      }
      pending = request.pending;
      return true;
    },
    chooseNextPrincipal(keywordId: string) {
      if (pending) pending = { ...pending, nextPrincipalKeywordId: keywordId };
    },
    cancel() { pending = null; },
    async confirm() {
      if (!pending) return null;
      const result = await commitManualArchitecture<Item>({
        previous: items,
        outcome: resolveManualArchitecture(items, pending),
        apply: next => { history.push("snapshot"); items = next; },
        persist: async changed => { persisted.push(changed); return persistResult; },
      });
      notices.push({ tone: result.status === "applied" ? "success" : "error", message: result.message });
      if (result.status === "applied") pending = null;
      return result;
    },
  };
}

test("A · escolher o destino no Mover cria o estado de confirmação", () => {
  const harness = workingCopyHarness(smoke());
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;

  const antesDeEscolher = harness.pending;
  assert.equal(antesDeEscolher, null);

  const opened = harness.request({
    kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care",
    keywordId: "m4", target,
  });

  assert.equal(opened, true);
  const pending = harness.pending;
  if (!pending) assert.fail("a confirmação precisa existir depois de escolher o destino");
  assert.equal(pending.kind, "move");
  assert.equal(pending.keywordLabel, "mantecorp skin care");
  assert.equal(pending.targetLabel, "creamy mandelico");
  // Antes e depois legíveis, com as contagens dos dois artigos.
  assert.match(pending.before, /mascara skin care \(6 keyword\(s\)\)/);
  assert.match(pending.after, /mascara skin care com 5 keyword\(s\)/);
  assert.match(pending.after, /creamy mandelico com 2/);
  assert.match(pending.after, /papel no destino: Secundária/);
  assert.equal(pending.requiresNextPrincipal, false);
});

test("B/C · confirmar o movimento executa a mutação e persiste", async () => {
  const harness = workingCopyHarness(smoke());
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;
  harness.request({ kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m4", target });

  const result = await harness.confirm();

  assert.equal(result?.status, "applied");
  assert.equal(articleMembers(harness.items, "group-mascara").length, 5);
  assert.equal(articleMembers(harness.items, "group-creamy").length, 2);
  assert.equal(articleMembers(harness.items, "group-mascara").some(item => item.id === "m4"), false);
  assert.equal(manualKeywordRoleFor(harness.items.find(item => item.id === "m4")!), "secundaria");
  // A Principal do destino não é deslocada.
  assert.equal(effectivePrincipalCount(harness.items, "group-creamy"), 1);
  assert.equal(harness.items.find(item => item.id === "c1")?.reviewRole, "principal");
  // Persistência canônica chamada com o estado novo, só das keywords tocadas.
  assert.equal(harness.persisted.length, 1);
  assert.deepEqual(harness.persisted[0].map(item => item.id), ["m4"]);
  assert.equal(harness.persisted[0][0].provisionalGroupId, "group-creamy");
  assert.equal(harness.pending, null);
  assert.match(harness.notices.at(-1)!.message, /atualize a SERP e execute a IA novamente/);
});

test("D · cancelar não altera nada", async () => {
  const harness = workingCopyHarness(smoke());
  const before = harness.items;
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;
  harness.request({ kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m4", target });

  harness.cancel();

  assert.equal(harness.pending, null);
  assert.equal(harness.items, before);
  assert.equal(harness.persisted.length, 0);
  assert.equal(harness.history.length, 0);
});

test("destino cheio é recusado antes da confirmação", () => {
  const cheio = [...smoke(), ...Array.from({ length: 5 }, (_, index) => keyword(`f${index}`, "group-creamy", "secundaria"))];
  const harness = workingCopyHarness(cheio);
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;

  assert.equal(target.keywordCount, MAX_KEYWORDS_PER_ARTICLE);
  assert.equal(target.full, true);
  const opened = harness.request({ kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m4", target });

  assert.equal(opened, false);
  assert.equal(harness.pending, null);
  assert.match(harness.notices.at(-1)!.message, new RegExp(`o máximo é ${MAX_KEYWORDS_PER_ARTICLE}`));
});

test("F · definir como Principal confirma e troca de verdade", async () => {
  const harness = workingCopyHarness(smoke());

  harness.request({ kind: "principal", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m3" });
  assert.match(harness.pending!.after, /Principal de mascara skin care/);
  const result = await harness.confirm();

  assert.equal(result?.status, "applied");
  assert.equal(harness.items.find(item => item.id === "m3")?.reviewRole, "principal");
  assert.notEqual(harness.items.find(item => item.id === "m1")?.reviewRole, "principal");
  assert.equal(effectivePrincipalCount(harness.items, "group-mascara"), 1);
  assert.equal(harness.persisted.length, 1);
});

test("G · retirar do artigo confirma e devolve para não agrupadas", async () => {
  const harness = workingCopyHarness(smoke());

  harness.request({ kind: "ungroup", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m5" });
  assert.match(harness.pending!.after, /Keywords não agrupadas/);
  const result = await harness.confirm();

  assert.equal(result?.status, "applied");
  const solta = harness.items.find(item => item.id === "m5")!;
  assert.equal(solta.clusterId, null);
  assert.equal(solta.provisionalGroupId, null);
  assert.equal(harness.items.length, smoke().length, "a keyword não desaparece");
  assert.equal(articleMembers(harness.items, "group-mascara").length, 5);
});

test("H · criar novo artigo gera um grupo com a keyword como Principal", async () => {
  const harness = workingCopyHarness(smoke());

  harness.request({ kind: "split", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m6" });
  const result = await harness.confirm();

  assert.equal(result?.status, "applied");
  const novo = harness.items.find(item => item.id === "m6")!;
  assert.equal(novo.provisionalGroupId, "manual-article-m6");
  assert.equal(novo.reviewRole, "principal");
  assert.deepEqual(articleMembers(harness.items, "manual-article-m6").map(item => item.id), ["m6"]);
  assert.equal(articleMembers(harness.items, "group-mascara").length, 5);
});

test("mover a Principal só confirma com a nova Principal escolhida", async () => {
  const harness = workingCopyHarness(smoke());
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;

  harness.request({ kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m1", target });
  assert.equal(harness.pending?.requiresNextPrincipal, true);
  assert.equal(harness.pending?.nextPrincipalOptions.length, 5);

  harness.chooseNextPrincipal("m2");
  const result = await harness.confirm();

  assert.equal(result?.status, "applied");
  assert.equal(harness.items.find(item => item.id === "m2")?.reviewRole, "principal");
  assert.equal(effectivePrincipalCount(harness.items, "group-mascara"), 1);
  assert.equal(effectivePrincipalCount(harness.items, "group-creamy"), 1);
});

test("artigo publicado é recusado na intenção, antes de qualquer confirmação", () => {
  const publicado = smoke().map(item => item.clusterId === "group-mascara" ? { ...item, isPublished: true } : item);
  const harness = workingCopyHarness(publicado);

  const opened = harness.request({
    kind: "ungroup", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care",
    keywordId: "m4", isPublishedArticle: true,
  });

  assert.equal(opened, false);
  assert.equal(harness.pending, null);
  assert.match(harness.notices.at(-1)!.message, /protegidas/);
});

test("persistência que não confirma não é anunciada como sucesso", async () => {
  const harness = workingCopyHarness(smoke(), false);
  const target = targetsFor(harness.items, "article:mascara").find(candidate => candidate.id === "article:creamy")!;
  harness.request({ kind: "move", items: harness.items, articleKey: "group-mascara", articleLabel: "mascara skin care", keywordId: "m4", target });

  const result = await harness.confirm();

  assert.equal(result?.status, "not_persisted");
  assert.equal(harness.notices.at(-1)!.tone, "error");
  assert.match(harness.notices.at(-1)!.message, /gravação canônica não confirmou/);
  // A confirmação continua aberta para o usuário desfazer ou repetir.
  assert.notEqual(harness.pending, null);
});

test("mutação recusada nunca toca a cópia de trabalho nem a persistência", async () => {
  const harness = workingCopyHarness(smoke());
  const result = await commitManualArchitecture<Item>({
    previous: harness.items,
    outcome: { ok: false, reason: "recusa de teste" },
    apply: () => assert.fail("apply não pode ser chamado em recusa"),
    persist: async () => assert.fail("persist não pode ser chamado em recusa"),
  });

  assert.equal(result.status, "refused");
  assert.equal(result.message, "recusa de teste");
});

test("a confirmação entra na revisão de render do subtree memoizado", () => {
  // Causa raiz do smoke: o painel expandido é memoizado por `revision`; sem o
  // estado pendente ali, a confirmação nunca aparecia e o controle virava enfeite.
  const revision = workspace.slice(workspace.indexOf("const articleTableRenderRevision"), workspace.indexOf("]);", workspace.indexOf("const articleTableRenderRevision")));
  const ocorrencias = revision.match(/pendingManualArchitecture,/g) || [];

  assert.equal(ocorrencias.length, 2, "presente no objeto e nas dependências");
  assert.match(workspace, /previous\.revision === next\.revision && previous\.processTab === next\.processTab/);
});
