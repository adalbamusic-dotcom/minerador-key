import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRadarExpertEvidence } from "../lib/radar/expert-evidence.ts";
import { PlatformContributionError, submitPlatformExpertContribution } from "../lib/server/expert-platform-contribution.ts";

/*
 * SDD Radar 2026-09-30, Parte B: o especialista com acesso à plataforma
 * escreve o parecer direto na aba Especialista. Ele segue o caminho das
 * respostas do Telegram (revisão humana antes do pacote) e não muda nada do
 * que já foi entregue pelo Telegram.
 */
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const ler = async (caminho: string) => semComentarios(await readFile(new URL(`../${caminho}`, import.meta.url), "utf8"));

const base = {
  brandId: "10000000-0000-4000-8000-0000000000a1",
  articleId: "article-a",
  articleDnaVersionId: "article-dna-v1",
  brief: { id: "20000000-0000-4000-8000-0000000000a1", brandId: "10000000-0000-4000-8000-0000000000a1", expertId: "30000000-0000-4000-8000-0000000000a1", articleId: "article-a", articleDnaVersionId: "article-dna-v1" },
  contribution: {
    id: "40000000-0000-4000-8000-0000000000a1",
    brandId: "10000000-0000-4000-8000-0000000000a1",
    expertId: "30000000-0000-4000-8000-0000000000a1",
    briefId: "20000000-0000-4000-8000-0000000000a1",
    sourceType: "TEXT" as const,
    originalText: "Parecer escrito.",
    transcriptText: null,
    organizationPayload: null,
    externalUpdateId: "telegram-update-1",
    originalAssetUri: null,
    checksum: null,
    receivedAt: "2026-09-30T12:00:00.000Z",
  },
  review: { decision: "accepted" as const },
};

test("resposta do Telegram sem canal declarado continua idêntica (o hash do pacote entregue não muda)", () => {
  const semCanal = buildRadarExpertEvidence(base);
  const comCanal = buildRadarExpertEvidence({ ...base, contribution: { ...base.contribution, provider: "telegram" } });
  assert.equal(semCanal.provider, "telegram");
  assert.equal(JSON.stringify(semCanal), JSON.stringify(comCanal));
});

test("parecer escrito na plataforma entra com o canal 'platform'", () => {
  const evidencia = buildRadarExpertEvidence({ ...base, contribution: { ...base.contribution, provider: "platform", externalUpdateId: "platform:x" } });
  assert.equal(evidencia.provider, "platform");
  assert.equal(evidencia.approvedContent, "Parecer escrito.");
});

test("sem a migration, recusa antes de qualquer escrita (nenhuma pauta órfã)", async () => {
  const chamadas: string[] = [];
  const cliente = {
    from(tabela: string) {
      chamadas.push(tabela);
      return {
        select() { return { limit: async () => ({ data: null, error: { code: "42703", message: "column does not exist" } }) }; },
        insert() { throw new Error("não devia escrever"); },
        update() { throw new Error("não devia escrever"); },
      };
    },
  };
  await assert.rejects(
    submitPlatformExpertContribution({ ...base, expertId: base.brief.expertId, kind: "FECHAMENTO", text: "Fecho.", actorUserId: "50000000-0000-4000-8000-0000000000a1" }, cliente as never),
    (erro: unknown) => erro instanceof PlatformContributionError && erro.code === "migration_pending" && erro.status === 503,
  );
  assert.deepEqual(chamadas, ["expert_contributions"]);
});

test("texto vazio e resposta sem ponto são recusados sem tocar no banco", async () => {
  const cliente = { from() { throw new Error("não devia consultar"); } };
  const pedido = { ...base, expertId: base.brief.expertId, actorUserId: "50000000-0000-4000-8000-0000000000a1" };
  await assert.rejects(submitPlatformExpertContribution({ ...pedido, kind: "CTA", text: "   " }, cliente as never), { code: "empty_text" });
  await assert.rejects(submitPlatformExpertContribution({ ...pedido, kind: "RESPOSTA", text: "Resposta." }, cliente as never), { code: "requirement_required" });
});

test("o núcleo grava como contribuição a revisar, com autoria, e nunca aceita sozinho", async () => {
  const nucleo = await ler("lib/server/expert-platform-contribution.ts");
  assert.ok(nucleo.indexOf('select("authored_by")') < nucleo.indexOf("createExpertBrief("), "a migration é conferida antes de criar a pauta");
  assert.match(nucleo, /provider: "platform"/);
  assert.match(nucleo, /authored_by: input\.actorUserId/);
  assert.match(nucleo, /status: "awaiting_review"/);
  assert.doesNotMatch(nucleo, /"accepted"|"approved"|contributionReviews/, "a decisão continua sendo da revisão humana");
});

test("a rota exige sessão, acesso à Marca e edição do Radar antes de gravar", async () => {
  const rota = await ler("app/api/editorial/expert-contributions/platform/route.ts");
  const acesso = rota.indexOf("assertCanAccessMarca(");
  const permissao = rota.indexOf('assertEditorialPermission(profile, input.brandId, "radar", "edit")');
  const grava = rota.indexOf("submitPlatformExpertContribution(");
  assert.ok(acesso > 0 && permissao > acesso && grava > permissao);
  assert.match(rota, /actorUserId: profile\.userId/, "o autor é quem está logado, nunca um campo do pedido");
});

test("a aba Especialista tem o campo e mostra o canal real de cada resposta", async () => {
  const tela = await ler("modules/radar/radar-expert-brief-panel.tsx");
  assert.match(tela, /data-testid="radar-specialist-direct-entry"/);
  assert.match(tela, /fetch\("\/api\/editorial\/expert-contributions\/platform"/);
  assert.match(tela, /onSent=\{\(\) => leituraDaArea\.refresh\(\)\}/);
  assert.doesNotMatch(tela, /· Telegram<\/h5>|>Telegram · \{formatDate/, "o rótulo do canal não é mais fixo");
  assert.match(tela, /provider: record\.provider === "platform" \? "platform" : "telegram"/);
});

test("ponto sintético do parecer livre não conta como ponto preparado pela investigação", async () => {
  const servidor = await ler("lib/server/radar-canonical-authorities.ts");
  assert.match(servidor, /!String\(valor\)\.startsWith\("direto:"\)/);
});

test("o catálogo do MCP conhece a rota do parecer direto", async () => {
  const catalogo = await readFile(new URL("../lib/agent/platform-catalog.ts", import.meta.url), "utf8");
  assert.match(catalogo, /"\/api\/editorial\/expert-contributions\/platform"/);
  assert.doesNotMatch(catalogo, /Parte B, aguarda a migration do dono/);
});
