import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  page: new URL("../modules/marca/brand-page.tsx", import.meta.url),
  entry: new URL("../modules/marca/marca-page-entry.tsx", import.meta.url),
  dna: new URL("../modules/marca/brand-dna-panel.tsx", import.meta.url),
  site: new URL("../modules/marca/site-sitemap-panel.tsx", import.meta.url),
  googleAds: new URL("../modules/marca/google-ads-connection-panel.tsx", import.meta.url),
  topbarControl: new URL("../components/global-topbar-control.ts", import.meta.url),
  shared: new URL("../components/editorial/operational-screen-shared.tsx", import.meta.url),
};

test("Marca preserva hierarquia, rotas tenantizadas e variante neutra do shell", async () => {
  const [page, entry, shared] = await Promise.all([readFile(files.page, "utf8"), readFile(files.entry, "utf8"), readFile(files.shared, "utf8")]);
  assert.match(page, /GlobalTopbarPageControls/);
  assert.match(entry, /GlobalTopbarPageControls/);
  assert.doesNotMatch(page, /ModuleHeader/);
  assert.doesNotMatch(entry, /ModuleHeader/);
  assert.match(page, /<h1 className="text-2xl[^>]*>\{activeBrand\.nome\}/);
  assert.match(page, /aria-label="Se[^\"]*es da marca"/);
  assert.match(page, /aria-current=\{section === id \? "page"/);
  assert.match(entry, /buildTenantPath/);
  assert.match(entry, /secao=\$\{id\}/);
  assert.match(shared, /tone\?: "default" \| "neutral"/);
  assert.match(shared, /tone === "neutral" \? "text-slate-400"/);
  assert.doesNotMatch(page, /\/workspace/);
  assert.doesNotMatch(entry, /window\.location\.reload|router\.refresh/);
});

test("Marca remove acento roxo, capsulas e molduras decorativas", async () => {
  const [page, entry, dna, site, topbarControl] = await Promise.all([readFile(files.page, "utf8"), readFile(files.entry, "utf8"), readFile(files.dna, "utf8"), readFile(files.site, "utf8"), readFile(files.topbarControl, "utf8")]);
  for (const source of [page, dna, site]) {
    assert.doesNotMatch(source, /indigo|violet|purple|gradient/i);
    assert.doesNotMatch(source, /text-\[9px\]|text-\[10px\]|text-\[11px\]/);
    assert.doesNotMatch(source, /bg-black|\[#(?:[0-9a-f]{3,8})/i);
    assert.match(source, /focus-visible:ring-2/);
  }
  assert.match(page, /GLOBAL_TOPBAR_PAGE_TAB/);
  assert.match(entry, /GLOBAL_TOPBAR_PAGE_TAB/);
  assert.match(topbarControl, /focus-visible:ring-2/);
  assert.doesNotMatch(page, /const selectedTab =/);
  assert.doesNotMatch(entry, /const tab =/);
  assert.match(site, /const card = "w-full max-w-none space-y-4"/);
  assert.match(site, /const navTab =/);
  assert.doesNotMatch(dna, /rounded-full border/);
});

test("Marca preserva acoes, BrandDNA, convite e importacao", async () => {
  const [page, dna, site] = await Promise.all([readFile(files.page, "utf8"), readFile(files.dna, "utf8"), readFile(files.site, "utf8")]);
  assert.match(page, /Convites foram validados no servidor/);
  assert.match(page, /e-mail[^\n]*enviado/);
  assert.match(page, /type="button"/);
  assert.match(dna, /Salvar vers[^\n]*o/);
  assert.match(dna, /Aprovar/);
  assert.match(dna, /localStorage/);
  assert.match(site, /id="revisao-importacao"/);
  assert.match(site, /Nada .* gravado no Minerador .* confirma/);
  assert.match(site, /brandId/);
});

test("Equipe mantém labels, matriz legível e estados acessíveis", async () => {
  const page = await readFile(files.page, "utf8");
  assert.match(page, /<label className="text-sm font-semibold/);
  assert.match(page, /<fieldset/);
  assert.match(page, /<table className="min-w-\[900px\] w-full text-sm"/);
  assert.match(page, /Nenhum convite/);
  assert.match(page, /focus-visible:outline-none/);
});

test("Configurações da Marca não exigem Customer ID para pesquisa Google Ads", async () => {
  const [page, panel, route] = await Promise.all([
    readFile(files.page, "utf8"),
    readFile(files.googleAds, "utf8"),
    readFile(new URL("../app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /GoogleAdsConnectionPanel/);
  assert.match(page, /Research Customer ID da Plataforma/);
  assert.match(panel, /Salvar Customer ID/);
  assert.match(panel, /method: "GET"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /customerIdRef/);
  assert.match(panel, /Google Ads Customer ID/);
  assert.doesNotMatch(panel, /ID da conta administradora|Targeting configurado|<select/);
  assert.match(panel, /minerador:manage/);
  assert.match(panel, /replaceConfirmed/);
  assert.doesNotMatch(panel, /googleDeveloperToken|googleClientId|googleClientSecret|googleRefreshToken|loginCustomerId|targeting/);
  assert.match(route, /module: "minerador", action: "manage"/);
  assert.doesNotMatch(route, /ensureConnectionManager/);
  assert.match(route, /GoogleAdsBrandCustomerBindingSchema/);
  assert.match(route, /ensureGoogleAdsExternalAccountBinding/);
});
