import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/(brand)/[brandRef]/minerador/descobrir/page.tsx", import.meta.url), "utf8");
const processRoute = readFileSync(new URL("../app/(brand)/[brandRef]/minerador/page.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../modules/minerador/discovery/discovery-keywords-page.tsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../modules/minerador/minerador-section-tabs.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../components/global-topbar.tsx", import.meta.url), "utf8");
const search = readFileSync(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const filters = readFileSync(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../lib/minerador/discovery-persistence.ts", import.meta.url), "utf8");

test("rota Descobrir mantém autorização tenantizada", () => {
  assert.match(route, /requireTenantModule\(brandRef, "minerador"\)/);
  assert.match(processRoute, /MineradorSectionTabs/);
  assert.match(page, /useGlobalTopbarControlsRegistration/);
  assert.match(page, /tabs: <MineradorSectionTabs brandRef=\{brandRef\} \/>/);
  assert.doesNotMatch(page, /ModuleHeader/);
  assert.match(workspace, /sectionTabs\?: ReactNode/);
  assert.match(tabs, /usePathname/);
});
test("rota Descobrir converte sessão inválida em redirecionamento, não em 404", () => {
  assert.match(route, /import \{ redirect \} from "next\/navigation"/);
  assert.match(route, /import \{ SupabaseSessionError \} from "@\/lib\/server\/supabase-session"/);
  assert.match(route, /error instanceof SupabaseSessionError/);
  assert.match(route, /callbackUrl=.*minerador\/descobrir/);
});
test("abas compartilhadas mantêm tamanho compacto e não criam rolagem vertical", () => {
  assert.match(page, /MineradorSectionTabs brandRef=\{brandRef\}/);
  assert.match(workspace, /sectionTabs/);
  assert.match(tabs, /data-minerador-section-tabs/);
  assert.match(tabs, /grid h-8 w-40 shrink-0 grid-cols-2/);
  assert.match(tabs, /inline-flex h-7 w-full items-center justify-center/);
  assert.match(tabs, /lg:w-72/);
  assert.match(tabs, /border-divider-dark/);
  assert.match(tabs, /module-accent/);
  assert.doesNotMatch(tabs, /(?:purple|violet|indigo)/i);
  assert.doesNotMatch(tabs, /overflow-y-(auto|scroll)/);
  assert.match(workspace, /tabs: sectionTabs/);
  assert.match(topbar, /data-topbar-module-tabs/);
});
test("abas preservam ordem fixa e estado derivado da rota", () => {
  assert.ok(tabs.indexOf('id: "discover"') < tabs.indexOf('id: "process"'));
  assert.match(tabs, /pathname === discoverHref \? "discover" : "process"/);
  assert.match(tabs, /aria-current=\{active === control\.id \? "page"/);
});
test("somente Descobrir inicia a consulta e resultados permanecem em memória", () => {
  assert.match(page, /\bfetch\s*\(/);
  assert.match(page, /descobrir-keywords/);
  assert.doesNotMatch(page, /supabase|DiscoveryRun|\.insert\(|\.update\(/);
  assert.match(filters, /onDiscover/);
  assert.match(filters, /Aplicado somente ao clicar em Descobrir Keywords/);
});
test("intenção existe somente como contexto preliminar", () => {
  assert.match(search, /Inten..o preliminar/);
  assert.doesNotMatch(filters, /filterIntent|Filtrar inten..o|DISCOVERY_INTENTS/);
  assert.doesNotMatch(page, /setFilterIntent|filterIntent/);
  assert.match(page, /intent=\{preliminaryIntent\}/);
});
test("linha de filtros preserva a ordem contratada e capacidades futuras", () => {
  assert.match(filters, /Resultados.*em breve/);
  assert.match(filters, /KD.*em breve/);
  const rendered = filters.slice(filters.indexOf("return <section"));
  assert.ok(rendered.indexOf("Resultados") < rendered.indexOf("Volume"));
  assert.ok(rendered.indexOf("Volume") < rendered.indexOf("KD"));
  assert.ok(rendered.indexOf("KD") < rendered.indexOf("CPC"));
  assert.ok(rendered.indexOf("CPC") < rendered.indexOf("Incluir palavras-chave"));
  assert.ok(rendered.indexOf("Incluir palavras-chave") < rendered.indexOf("Excluir palavras-chave"));
  const adultKeywords = rendered.lastIndexOf("Incluir palavras-chave adultas");
  assert.ok(rendered.indexOf("Excluir palavras-chave") < adultKeywords);
  assert.ok(adultKeywords < rendered.indexOf("Limpar filtros"));
});
test("adultas fica na Linha 2 e preserva o draft", () => {
  assert.doesNotMatch(search, /includeAdultKeywords|Incluir palavras-chave adultas/);
  assert.match(filters, /includeAdultKeywords/);
  assert.match(page, /<DiscoveryFilterRow[^>]*includeAdultKeywords={includeAdultKeywords}/);
  assert.match(page, /setIncludeAdultKeywords\(initialDraft\.includeAdultKeywords\)/);
  assert.match(filters, /aria-label="Incluir palavras-chave adultas"/);
});
test("resumo é derivado do motor de filtros", () => {
  assert.match(persistence, /summary\.relation/);
  assert.match(persistence, /summary\.volume/);
  assert.match(persistence, /summary\.include/);
  assert.match(persistence, /summary\.exclude/);
  assert.match(page, /applyDiscoveryFilters/);
  assert.match(page, /fora da relação selecionada/);
});
test("resultado operacional da Descoberta fica somente no aviso global", async () => {
  const noticeContract = readFileSync(new URL("../lib/visual-notice-contract.ts", import.meta.url), "utf8");
  const noticeCenter = readFileSync(new URL("../components/global-notice-center.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /draftChanged|summaryText|Pesquisa executada em|Origem local:/);
  assert.match(page, /title: "Descoberta concluída"/);
  assert.match(page, /metadata: \{ summary:/);
  assert.match(noticeContract, /metadata\?: NoticeMetadata/);
  assert.match(noticeCenter, /function NoticeMetadata/);
  assert.match(noticeCenter, /<NoticeMetadata metadata=\{notice\.metadata\} \/>/);
  assert.match(noticeCenter, /<p className="mt-1 text-sm leading-6 text-foreground\/80">\{notice\.message\}<\/p>/);
});
