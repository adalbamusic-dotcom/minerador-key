# SDD â€” SincronizaÃ§Ã£o Site/Sitemap â†’ Minerador e revisÃ£o arquitetural de conteÃºdos publicados

**Status:** aprovada para a Fase A compatÃ­vel e implementada localmente â€” sem migration, escrita remota ou alteraÃ§Ã£o no Arquiteto
**Data:** 2026-07-21
**MÃ³dulo proprietÃ¡rio:** Minerador
**MÃ³dulos consultados:** Marca, Arquiteto e contratos compartilhados

> **Estado vigente â€” 2026-07-27:** a superfÃ­cie canÃ´nica Ã© `/{brandRef}/?secao=site`; referÃªncias posteriores a `/marca?secao=site` ou a `app/(workspace)` sÃ£o aliases/snapshots histÃ³ricos. A implementaÃ§Ã£o local permanece seletiva, idempotente, brand-scoped e sem inferir aprovaÃ§Ã£o, DNA, canonical ou publicaÃ§Ã£o.

## 1. Resumo executivo

Esta proposta define como o Minerador deverÃ¡ receber evidÃªncias do site e do sitemap sem transformar presenÃ§a de URL em aprovaÃ§Ã£o editorial, nem confundir relaÃ§Ã£o keywordâ†”URL com decisÃ£o arquitetural. A Fase A compatÃ­vel foi implementada localmente nesta execuÃ§Ã£o; a persistÃªncia durÃ¡vel, Supabase/RLS e validaÃ§Ã£o autenticada continuam fora da evidÃªncia obtida.

O repositÃ³rio jÃ¡ possui uma primeira implementaÃ§Ã£o local no mÃ³dulo Marca: configuraÃ§Ã£o de site, sincronizaÃ§Ã£o explÃ­cita de sitemap, catÃ¡logo de URLs, verificaÃ§Ã£o de pÃ¡ginas, extraÃ§Ã£o determinÃ­stica de candidatos e importaÃ§Ã£o seletiva de keywords para uma lista existente do Minerador. A implementaÃ§Ã£o atual Ã© uma base, mas ainda persiste somente uma origem resumida em `analise_semantica.site_origin` para keywords novas e nÃ£o atualiza a evidÃªncia de origem de keywords existentes.

A recomendaÃ§Ã£o Ã© evoluir o fluxo existente em fases:

- manter o catÃ¡logo/verificaÃ§Ã£o do Site/Sitemap como fonte da evidÃªncia da URL;
- manter `keywords_kgr` como fonte da identidade, status, mÃ©tricas, intenÃ§Ã£o e DNA lÃ³gico da keyword;
- registrar origem e evidÃªncia sem sobrescrever campos humanos jÃ¡ qualificados;
- exigir prÃ©via somente leitura, confirmaÃ§Ã£o explÃ­cita e resultado persistido por item;
- tratar reexecuÃ§Ã£o por identidade tÃ©cnica e origem, com resultado idempotente;
- impedir que a importaÃ§Ã£o marque keyword como aprovada/publicada ou forme artigo;
- encaminhar ao Arquiteto somente seleÃ§Ã£o explÃ­cita com identidade e proveniÃªncia verificÃ¡veis;
- corrigir primeiro os riscos M-01 a M-05 da auditoria do Minerador.

Esta SDD nÃ£o autoriza aplicaÃ§Ã£o da migration `0004_brand_site_catalog.sql`, escrita remota no Supabase, alteraÃ§Ã£o no Arquiteto ou limpeza de armazenamento local. A implementaÃ§Ã£o autorizada ficou limitada Ã  Fase A compatÃ­vel, ao adapter do Minerador, Ã  UI de prÃ©via/confirmaÃ§Ã£o, Ã  atualizaÃ§Ã£o aditiva de evidÃªncia e aos testes por fixtures.

## 2. Escopo, limites e critÃ©rios

### Em escopo

- Contrato de entrada Site/Sitemap â†’ Minerador.
- Contrato de saÃ­da e evidÃªncia devolvida pela importaÃ§Ã£o.
- RelaÃ§Ã£o entre URL, keyword e eventual conteÃºdo publicado.
- Estados, transiÃ§Ãµes, idempotÃªncia, reconciliaÃ§Ã£o e conflitos.
- Escopo por marca e por lista.
- Compatibilidade com a importaÃ§Ã£o local jÃ¡ existente.
- PrÃ©-requisitos para futura leitura pelo Arquiteto.
- Snapshot, rollback, testes e validaÃ§Ã£o manual.

### Fora de escopo

- Implementar endpoints, telas, filtros, repositÃ³rios ou migrations.
- Alterar `spec.md` ou `estado-atual.md` como se a proposta estivesse implantada.
- Alterar `KeywordDNA`, `ArticleDNA`, `SiloDNA` ou o Arquiteto.
- Confirmar publicaÃ§Ã£o, criar artigo, escolher keyword principal de artigo ou aprovar arquitetura automaticamente.
- Chamar IA, SERP, provedores externos ou APIs pagas.
- Corrigir agora M-01â€“M-08; sÃ£o prÃ©-condiÃ§Ãµes ou tarefas relacionadas.

### Regras que nÃ£o podem ser inferidas

- Keyword parecida com slug, tÃ­tulo, H1 ou URL nÃ£o Ã© principal confirmada.
- SecundÃ¡ria ou menÃ§Ã£o extraÃ­da nÃ£o vira principal publicada.
- URL no sitemap nÃ£o prova publicaÃ§Ã£o, indexabilidade ou arquitetura correta.
- `status = publicado` nÃ£o pode ser criado pelo importador.
- Canonical divergente/ausente/conflitante nÃ£o Ã© corrigido silenciosamente.
- Keyword sem lista nÃ£o pertence automaticamente Ã  marca selecionada.
- `architectImportedKeywordIds` nÃ£o Ã© prova Ãºnica de transferÃªncia ao Arquiteto.

## 3. Fontes consultadas

### Produto e contratos

- `AGENTS.md`
- `docs/00-produto/invariantes.md`
- `docs/00-produto/glossario.md`
- `docs/00-produto/fluxo-oficial.md`
- `docs/compartilhado/README.md`

### Marca e Minerador

- `docs/02-marca/spec.md`
- `docs/02-marca/estado-atual.md`
- `docs/02-marca/backlog.md`
- `docs/02-marca/propostas/site-e-sitemap.md`
- `docs/03-minerador/spec.md`
- `docs/03-minerador/estado-atual.md`
- `docs/03-minerador/backlog.md`
- `docs/03-minerador/propostas/auditoria-de-saude-do-minerador.md`

### Arquiteto e cÃ³digo

- `docs/04-arquiteto/spec.md`
- `docs/04-arquiteto/estado-atual.md`
- `app/(brand)/[brandRef]/page.tsx`
- `components/marca/marca-page-entry.tsx`
- `components/marca/site-sitemap-panel.tsx`
- `lib/marca/site-contracts.ts`
- `lib/marca/site-domain.ts`
- `lib/marca/site-fetch.ts`
- `lib/marca/site-keyword-flow.ts`
- `lib/marca/site-parser.ts`
- `lib/marca/site-reconciliation.ts`
- `lib/marca/site-security.ts`
- `lib/marca/site-store.ts`
- `app/api/marca/site/_helpers.ts`
- `app/api/marca/site/lists/route.ts`
- `app/api/marca/site/import/keywords/preview/route.ts`
- `app/api/marca/site/import/keywords/route.ts`
- `app/api/marca/site/sitemap/test/route.ts`
- `app/api/marca/site/sitemap/sync/route.ts`
- `app/api/marca/site/page/verify/route.ts`
- `app/(brand)/[brandRef]/minerador/page.tsx`
- `lib/server/authz.ts`
- `components/editorial-pipeline-context.tsx`
- `lib/arquiteto/*`
- `supabase/migrations/0004_brand_site_catalog.sql` â€” preparada, nÃ£o aplicada
- `tests/marca-site.test.mts`

## 4. Estado atual e contrato existente

### 4.1 Fluxo observado

O painel Ã© acessado em `/{brandRef}/?secao=site`. A marca fornece `site_url`; sincronizaÃ§Ã£o, verificaÃ§Ã£o e importaÃ§Ã£o sÃ£o aÃ§Ãµes explÃ­citas. O estado local Ã© separado por `brandId` em `minerador-pro:site-workspace:${brandId}` via IndexedDB/localStorage, com fallback local. A abertura da tela nÃ£o deve sincronizar nem importar.

Rotas existentes:

- `/api/marca/site/lists` â€” listas `listas_kgr` da marca autorizada;
- `/api/marca/site/sitemap/test` e `/api/marca/site/sitemap/sync`;
- `/api/marca/site/page/verify`;
- `/api/marca/site/import/keywords/preview` â€” plano read-only;
- `/api/marca/site/import/keywords` â€” confirmaÃ§Ã£o/importaÃ§Ã£o.

O servidor valida sessÃ£o, marca, lista, domÃ­nio e `brandId`. Keywords novas entram em `keywords_kgr` como `status: "bruto"`, sem volume, KGR, intenÃ§Ã£o ou DNA inventados. A resposta atual devolve resultados por item.

### 4.2 Site/Sitemap

`BrandSiteWorkspace` contÃ©m `sitemaps`, `syncRuns`, `catalog`, `verifications`, `candidates`, `importBatches` e `events`.

Contratos principais:

- `SiteCatalogEntry`: URL descoberta/normalizada/resolvida, canonical, tÃ­tulo, H1, meta, headings, tipo, indexabilidade, verificaÃ§Ã£o e datas.
- `SitePageVerification`: HTTP, redirect, canonical, robots, tipo, indexabilidade e status verificado.
- `SiteKeywordCandidate`: texto original/normalizado, `catalogEntryId`, URL, campo, papel sugerido, confianÃ§a, status, `mineradorKeywordId`, lote e envio.
- `SiteImportBatch`: candidatos, entradas, lista, snapshot, resumo e estados `preview`, `importing`, `imported`, `partial`, `failed`, `rolled_back`.
- `SiteEvent`: evento por marca, entidade, payload, data e ator.

Os estados tÃ©cnicos de URL jÃ¡ disponÃ­veis sÃ£o `discovered`, `unverified`, `accessible`, `canonical_confirmed`, `canonical_missing`, `canonical_conflict`, `redirect`, `noindex`, `not_found`, `error` e `stale`. Isso representa a URL, nÃ£o o papel editorial da keyword.

### 4.3 Minerador

O Minerador lÃª/persiste `listas_kgr` e `keywords_kgr`. A identidade atual deriva de `id`, texto, `lista_id` e marca derivada da lista. O registro contÃ©m mÃ©tricas, intenÃ§Ã£o, status, fonte de volume, data e `analise_semantica`.

A importaÃ§Ã£o atual grava `analise_semantica.site_origin` para keywords novas, com fonte, marca, URL, catÃ¡logo, campo, papel, confianÃ§a, lote e data. Keywords existentes sÃ£o detectadas por texto normalizado na lista alvo, mas a rota atual nÃ£o anexa nova origem/evidÃªncia a elas. NÃ£o hÃ¡, ainda, relaÃ§Ã£o versionada e consultÃ¡vel keywordâ†”URL.

### 4.4 Arquiteto

O Arquiteto consome keywords aprovadas/publicadas e produz agrupamentos, `ArticleDNA` e `SiloDNA`. Seus contratos conseguem transportar identidade, versÃ£o, hash, papel, origem, confianÃ§a, confirmaÃ§Ã£o humana e referÃªncia de publicaÃ§Ã£o. A implementaÃ§Ã£o atual usa fontes legadas e o Ã­ndice local `architectImportedKeywordIds`; esta SDD apenas especifica o futuro contrato, sem alterar o mÃ³dulo.

## 5. Riscos e divergÃªncias atuais

- **M-01:** escopo de marca incompleto por inclusÃ£o de `lista_id.is.null` e caminhos que carregam tudo sem marca selecionada.
- **M-02:** `fetchData` deduplica, remove e persiste ajustes/DNA durante hidrataÃ§Ã£o.
- **M-03:** lotes podem ter falhas parciais e erros ignorados.
- **M-04:** criaÃ§Ã£o manual e publicaÃ§Ã£o em massa ainda permitem caminho sem gate completo; importaÃ§Ã£o nÃ£o deve agravar isso.
- **M-05:** transferÃªncia ao Arquiteto Ã© local e nÃ£o prova entrega, versÃ£o ou hash persistidos.
- **M-06:** `KeywordDNA` ainda Ã© lÃ³gico/legado, nÃ£o entidade prÃ³pria versionada suficiente para prova arquitetural.
- `site_origin` nÃ£o representa mÃºltiplas URLs, conflitos, histÃ³rico e filtros por dimensÃ£o.
- Keyword existente conserva seus dados, mas nÃ£o recebe a origem nova pela rota atual.
- O fluxo de reconciliaÃ§Ã£o fornece `extractedAt`, mas o `SiteKeywordCandidateSchema` consultado nÃ£o o retÃ©m efetivamente; isso reduz proveniÃªncia.
- `0004_brand_site_catalog.sql` estÃ¡ preparada, mas nÃ£o aplicada; nÃ£o hÃ¡ persistÃªncia remota confirmada para o catÃ¡logo.
- URL do sitemap, URL resolvida, canonical e URL publicada podem divergir e devem permanecer separadas.

## 6. Arquitetura proposta

### 6.1 Fontes de verdade

| InformaÃ§Ã£o | Fonte proposta | NÃ£o inferir de |
|---|---|---|
| Marca/site | marca autorizada e `marcas.site_url` | domÃ­nio informado pelo cliente |
| URL descoberta | `SiteCatalogEntry` | slug do Minerador |
| SituaÃ§Ã£o tÃ©cnica | catÃ¡logo + `SitePageVerification` | status da keyword |
| Identidade/qualificaÃ§Ã£o | `keywords_kgr` e lista/brand | tÃ­tulo/H1/URL parecidos |
| RelaÃ§Ã£o keywordâ†”URL | evidÃªncia do lote e vÃ­nculo aprovado | Ã­ndice local do Arquiteto |
| Arquitetura | Arquiteto/`ArticleDNA`/`SiloDNA` | papel sugerido pelo extrator |
| PublicaÃ§Ã£o | identidade publicada e sua evidÃªncia | presenÃ§a isolada no sitemap |
| HistÃ³rico | lote/evento aprovado | estado visual da tela |

O armazenamento local permanece fallback operacional por marca, nÃ£o fonte final de uma sincronizaÃ§Ã£o confirmada. Resposta HTTP sem confirmaÃ§Ã£o do registro final nÃ£o Ã© sucesso remoto.

### 6.2 Fluxo

```text
Marca/Site-Sitemap
  -> sincronizaÃ§Ã£o explÃ­cita e catÃ¡logo/verificaÃ§Ã£o por URL
  -> candidatos determinÃ­sticos
  -> revisÃ£o humana da relaÃ§Ã£o keyword <-> URL
  -> prÃ©via read-only
  -> confirmaÃ§Ã£o explÃ­cita e lote
  -> API revalida marca, lista, domÃ­nio e identidade
  -> Minerador reconcilia e devolve resultado por item
  -> Minerador qualifica intenÃ§Ã£o/KGR/status/KeywordDNA
  -> seleÃ§Ã£o explÃ­cita ao Arquiteto com identidade e evidÃªncia
  -> Arquiteto decide agrupamento e artigo
```

NÃ£o hÃ¡ sincronizaÃ§Ã£o durante hidrataÃ§Ã£o. â€œConferir com o siteâ€ deve exibir escopo, data, fonte, lote e resultado.

### 6.3 TrÃªs dimensÃµes independentes

**SituaÃ§Ã£o da URL.** Usar os estados tÃ©cnicos existentes. RÃ³tulos como â€œencontradaâ€, â€œredirectâ€, â€œcanonical ausenteâ€, â€œconflitoâ€, â€œnÃ£o localizadaâ€ e â€œfora do sitemapâ€ sÃ£o derivados do catÃ¡logo/verificaÃ§Ã£o e mantÃªm a evidÃªncia bruta. â€œPublicadaâ€ requer evidÃªncia editorial prÃ³pria.

**RelaÃ§Ã£o keywordâ†”URL.** Contrato proposto: `principal_confirmada`, `principal_candidata`, `apoio_provavel`, `mencionada_no_conteudo` e `sem_relacao_definida`. O extrator sugere papel/confianÃ§a; nÃ£o grava confirmaÃ§Ã£o. Sem evidÃªncia confiÃ¡vel, sem confirmaÃ§Ã£o humana, a keyword continua candidata/editÃ¡vel e nÃ£o protegida como decisÃ£o estrutural.

**SituaÃ§Ã£o arquitetural.** Contrato proposto: `nao_estruturado`, `aguardando_arquitetura`, `em_revisao`, `arquitetura_confirmada`, `revisao_arquitetural_necessaria`, `com_conflito`. A importaÃ§Ã£o nÃ£o cria DNA, artigo, silo, plano ou documento.

### 6.4 PersistÃªncia em fases

**Fase A, compatÃ­vel:** preservar `keywords_kgr`, status, mÃ©tricas, intenÃ§Ã£o, DNA lÃ³gico e `analise_semantica.site_origin`. Estender a evidÃªncia de forma aditiva, sem apagar a forma legada, com contrato versionado contendo `brandId`, `targetListId`, `mineradorKeywordId`, `catalogEntryId`, `sourceUrl`, URL resolvida, canonical, situaÃ§Ã£o tÃ©cnica, relaÃ§Ã£o, situaÃ§Ã£o arquitetural, papel, confianÃ§a, lote, fonte, data, ator, evidÃªncia e conflitos.

**Fase B, durÃ¡vel:** usar as entidades previstas em `0004` â€” `brand_site_keyword_candidates`, `brand_site_import_batches`, `brand_site_import_items` e `brand_site_events` â€” como base de proveniÃªncia. A forma final de persistir mÃºltiplas relaÃ§Ãµes keywordâ†”URL e seus estados exige SDD de schema prÃ³pria. Esta proposta nÃ£o inventa nem aplica uma tabela nova.

NÃ£o usar a carga do Minerador para deduplicar, apagar, preencher nicho ou gerar DNA silenciosamente.

### 6.5 Campos de contrato propostos

Estes sÃ£o campos de contrato, nÃ£o alteraÃ§Ãµes executadas:

| Campo | Base atual | Regra |
|---|---|---|
| `brandId` | workspace/candidato | servidor revalida; nÃ£o confiar na UI |
| `targetListId` | lote/rota | deve pertencer Ã  marca |
| `mineradorKeywordId` | candidato | preservar ID existente |
| `keywordText`/`normalizedText` | candidato/keyword | original preservado; normalizaÃ§Ã£o sÃ³ compara |
| `catalogEntryId`/`sourceUrl` | candidato | catÃ¡logo e host da mesma marca |
| `resolvedUrl`/`declaredCanonicalUrl` | catÃ¡logo | nÃ£o substituir origem; divergÃªncia vira conflito |
| `urlSituation` | derivado | independente do status da keyword |
| `keywordUrlRelation` | novo contrato | confirmaÃ§Ã£o humana/evidÃªncia |
| `architectureStatus` | novo contrato | nÃ£o definido pelo extrator/importador |
| `suggestedRole`/`confidence` | existente | sugestÃ£o, nÃ£o aprovaÃ§Ã£o |
| `sourceField`/`batchId` | existente | proveniÃªncia e retry |
| `sourceVersion`/`evidenceVersion` | novo contrato | diferencia verificaÃ§Ãµes |
| `confirmedBy`/`confirmedAt` | novo contrato | somente aÃ§Ã£o explÃ­cita |
| `conflictCode`/`conflictDetail` | novo contrato | divergÃªncia visÃ­vel e preservada |

As trÃªs dimensÃµes nÃ£o devem ser comprimidas em um Ãºnico `status`. Se a compatibilidade inicial exigir JSONB em `analise_semantica`, a forma versionada, o alias compatÃ­vel de `site_origin` e a consulta dos filtros precisam ser aprovados antes do cÃ³digo.

## 7. Contrato de entrada

A operaÃ§Ã£o futura deverÃ¡ receber, no mÃ­nimo:

```text
brandId
targetListId
batchId
candidateIds ou candidatos congelados na prÃ©via
aÃ§Ã£o explÃ­cita: preview | confirm
evidenceVersion da verificaÃ§Ã£o que originou o lote
```

Cada candidato deve ser resolvido/revalidado no servidor com identidade, `brandId`, texto original e normalizado, `catalogEntryId`, URL, campo de extraÃ§Ã£o, papel, confianÃ§a, estado de URL, relaÃ§Ã£o escolhida quando houver, condiÃ§Ã£o de candidato/conflito e confirmaÃ§Ã£o humana quando aplicÃ¡vel.

O cliente nÃ£o pode trocar a marca/lista, afirmar que a keyword Ã© publicada, substituir uma URL protegida ou enviar candidato de outra marca. A API deve reconsultar marca, lista, catÃ¡logo e keyword.

A prÃ©via Ã© read-only e retorna, por item:

- `new`, `existing_in_minerador`, `duplicate_in_batch`, `conflict` ou `failed`;
- ID existente, quando houver;
- diferenÃ§a de evidÃªncia a anexar;
- proteÃ§Ã£o de publicado;
- motivo de bloqueio;
- resumo sem apresentar inserÃ§Ã£o como concluÃ­da.

## 8. Contrato de saÃ­da

ApÃ³s confirmaÃ§Ã£o, a resposta deve conter `batchId`, estado efetivamente persistido, data, marca/lista e um resultado por item:

- nova keyword inserida como `bruto`, com ID real;
- keyword existente vinculada ou com evidÃªncia atualizada, sem alterar campos protegidos;
- item jÃ¡ processado/idempotente, sem nova inserÃ§Ã£o;
- conflito preservado e sinalizado;
- item rejeitado por autorizaÃ§Ã£o, escopo, URL ou regra;
- erro tÃ©cnico sem ser mascarado como sucesso.

O resumo sÃ³ pode ser `imported` quando os itens esperados tiverem resultado confirmado. `partial` exige sucesso persistido e erro/bloqueio em outro item. `failed` nÃ£o pode ocultar inserÃ§Ã£o parcial. O painel local deve refletir o resultado real da API.

Para keyword existente, o resultado deve registrar que foram preservados ID, lista, texto, intenÃ§Ã£o humana, mÃ©tricas/KGR, status, aprovaÃ§Ã£o, DNA lÃ³gico e histÃ³rico. EvidÃªncia de site Ã© relaÃ§Ã£o adicional, nÃ£o substituiÃ§Ã£o semÃ¢ntica.

## 9. Estados e transiÃ§Ãµes

### 9.1 Candidato e lote

Os estados atuais de candidato (`new`, `duplicate_batch`, `exists_in_minerador`, `selected`, `sent`, `ignored`, `error`) permanecem:

```text
new -> selected -> sent
                  |-> exists_in_minerador
                  |-> duplicate_batch
                  |-> ignored
                  |-> error
```

O lote segue:

```text
preview -> importing -> imported
                    |-> partial
                    |-> failed
                    |-> rolled_back
```

`preview` nÃ£o escreve no Minerador. `rolled_back` encerra a tentativa e marca seus vÃ­nculos operacionais; nÃ£o autoriza apagar keywords existentes ou publicadas.

### 9.2 Keyword no Minerador

Nova keyword entra como `bruto`. O Minerador continua responsÃ¡vel por intenÃ§Ã£o, mÃ©tricas e KGR. A importaÃ§Ã£o nÃ£o transita automaticamente para `aprovado` ou `publicado`.

Keyword existente em `publicado` mantÃ©m identidade estrutural e estado. EvidÃªncia divergente gera conflito/revisÃ£o, nunca reescrita automÃ¡tica de slug, canonical, URL, marca ou keyword principal publicada.

### 9.3 URL, relaÃ§Ã£o e arquitetura

Estados tÃ©cnicos da URL permanecem independentes. A relaÃ§Ã£o pode iniciar como `sem_relacao_definida` ou `principal_candidata`; sÃ³ confirmaÃ§Ã£o explÃ­cita e evidÃªncia suficiente chega a `principal_confirmada`. Mesmo essa confirmaÃ§Ã£o nÃ£o significa publicado nem arquitetura confirmada.

Redirect, URL fora do sitemap, canonical ausente/conflitante, noindex, stale ou nÃ£o encontrada podem ser mantidos como evidÃªncia/candidatura com pendÃªncia, mas nÃ£o como identidade publicada verificada.

Item sem agrupamento confirmado permanece em `aguardando_arquitetura`. DivergÃªncia com referÃªncia publicada/arquitetural vai para `revisao_arquitetural_necessaria` ou `com_conflito`.

## 10. ReconciliaÃ§Ã£o e idempotÃªncia

### 10.1 Identidade operacional

O retry compara, no mÃ­nimo:

```text
brandId + targetListId + normalizedText + catalogEntryId + normalizedSourceUrl
```

`batchId` e `sourceVersion` identificam a tentativa/evidÃªncia, mas nÃ£o fazem a mesma keyword virar outra. O ID real do Minerador Ã© preservado.

### 10.2 Retry

- Mesmo candidato e lote: `already_processed`, sem nova inserÃ§Ã£o.
- Mesmo texto/URL na marca/lista: keyword existente, evidÃªncia atualizada ou nenhum efeito.
- Mesmo texto em URL diferente: uma identidade pode possuir mÃºltiplas evidÃªncias; nÃ£o duplicar automaticamente.
- Mesmo texto em lista diferente: tratar pela identidade atual de lista, apÃ³s validaÃ§Ã£o explÃ­cita e sem cruzar marcas.
- Nova verificaÃ§Ã£o da mesma URL: atualizar evidÃªncia versionada e preservar a anterior.
- Falha parcial: retry somente de itens nÃ£o concluÃ­dos.

Nenhum retry apaga keyword, remove DNA, altera intenÃ§Ã£o humana, regenera anÃ¡lise semÃ¢ntica ou reclassifica publicaÃ§Ã£o.

### 10.3 Conflitos

Conflitos de URL, canonical, marca, lista, texto normalizado, status publicado ou arquitetura sÃ£o retornados por item. A reconciliaÃ§Ã£o nÃ£o escolhe silenciosamente â€œo Ãºltimo valorâ€; resoluÃ§Ã£o requer aÃ§Ã£o humana ou regra aprovada pelo mÃ³dulo proprietÃ¡rio.

## 11. Multi-brand e autorizaÃ§Ã£o

- workspace, lote, catÃ¡logo, candidato, evento e armazenamento local carregam `brandId`;
- lista alvo pertence Ã  mesma marca;
- keyword existente Ã© localizada pela lista da marca; `lista_id.is.null` nÃ£o prova pertencimento;
- host da URL Ã© autorizado pela configuraÃ§Ã£o da marca;
- troca de marca invalida seleÃ§Ã£o, prÃ©via e confirmaÃ§Ã£o pendentes do contexto anterior;
- API revalida todos os candidatos e o lote;
- nenhum resultado de uma marca entra em lista, catÃ¡logo ou histÃ³rico de outra.

Antes de implementar, M-01 precisa ser resolvido ou isolado no caminho de leitura; esta SDD nÃ£o autoriza uma mudanÃ§a incidental global.

## 12. Publicados e revisÃ£o arquitetural

ConteÃºdo publicado conserva slug, canonical, keyword principal, marca e URL estrutural. Quando a verificaÃ§Ã£o trouxer URL/canonical/tÃ­tulo divergente:

1. registrar a evidÃªncia observada;
2. comparar com a identidade protegida;
3. marcar conflito/revisÃ£o;
4. impedir atualizaÃ§Ã£o automÃ¡tica dos campos protegidos;
5. encaminhar para revisÃ£o humana.

CorrespondÃªncia aproximada com slug, tÃ­tulo ou H1 gera `principal_candidata`, nunca confirmaÃ§Ã£o. MenÃ§Ã£o/secundÃ¡ria nÃ£o Ã© promovida. A futura transferÃªncia deve carregar identidade real, versÃ£o/hash de `KeywordDNA` quando disponÃ­vel, marca, URL, relaÃ§Ã£o, arquitetura e evidÃªncia; nÃ£o pode depender sÃ³ do Ã­ndice do browser.

## 13. Consumidores e compatibilidade

### Consumidores atuais

- `components/marca/site-sitemap-panel.tsx` e fila de prÃ©via/importaÃ§Ã£o;
- APIs de listas, prÃ©via e importaÃ§Ã£o;
- `lib/marca/site-keyword-flow.ts` e `site-reconciliation.ts`;
- `app/(brand)/[brandRef]/minerador/page.tsx`, `modules/minerador`, filtros e exportaÃ§Ã£o CSV;
- leitores de `analise_semantica`;
- contexto de pipeline e recuperaÃ§Ã£o local do Arquiteto;
- scripts/testes que leem `keywords_kgr`, `listas_kgr` e `briefings_artigos`.

### Compatibilidade obrigatÃ³ria

- manter configuraÃ§Ã£o do site e `site_origin` durante a transiÃ§Ã£o;
- nÃ£o mudar o significado de `bruto`, `aprovado`, `rejeitado` ou `publicado`;
- seleÃ§Ã£o nÃ£o controla renderizaÃ§Ã£o;
- preservar campos semÃ¢nticos, mÃ©tricas, intenÃ§Ã£o, DNA e histÃ³rico;
- nÃ£o tratar localStorage/IndexedDB como autoridade remota;
- nÃ£o alterar Arquiteto/contratos nesta SDD.

### AlteraÃ§Ãµes incompatÃ­veis, separadas

- trocar a identidade de keyword sem migraÃ§Ã£o/mapeamento;
- mudar o formato de `site_origin` sem mapear consumidores;
- criar/aplicar relaÃ§Ã£o remota sem SDD de schema, RLS e rollback;
- aceitar candidato `bruto` no Arquiteto;
- fazer catÃ¡logo/localStorage ser fonte final de publicaÃ§Ã£o;
- fazer `fetchData` reconciliar ou escrever silenciosamente.

## 14. Arquivos e fronteiras futuras

Esta execuÃ§Ã£o implementou a Fase A compatÃ­vel. A persistÃªncia durÃ¡vel e qualquer mudanÃ§a estrutural posterior deverÃ£o revisar:

- Marca: `components/marca/site-sitemap-panel.tsx`, contratos, fluxo, reconciliaÃ§Ã£o, store e rotas de Site/Sitemap;
- Minerador: `app/(brand)/[brandRef]/minerador/page.tsx`, `modules/minerador`, contratos/repositÃ³rios prÃ³prios aprovados e testes focados;
- autorizaÃ§Ã£o: `lib/server/authz.ts`, sem exceÃ§Ã£o para keyword sem lista;
- persistÃªncia: `supabase/migrations/0004_brand_site_catalog.sql` e eventual migration posterior, somente em SDD prÃ³pria;
- Arquiteto: apenas contrato de entrada/testes de compatibilidade em proposta futura.

Se for necessÃ¡ria alteraÃ§Ã£o compartilhada, a implementaÃ§Ã£o deve parar, mapear consumidores e produzir SDD especÃ­fica.

## 15. Snapshot, rollback e seguranÃ§a operacional

Antes da implementaÃ§Ã£o autorizada:

- preservar o diff jÃ¡ existente no checkout;
- gerar snapshot somente leitura de keywords, listas e estados por marca;
- registrar IDs, `lista_id`, status, intenÃ§Ã£o, mÃ©tricas, `analise_semantica`, DNA lÃ³gico e histÃ³rico;
- exportar workspace Site/Sitemap, candidatos, lotes e eventos por `brandId`, sem limpar armazenamento;
- confirmar que `0004` nÃ£o foi aplicada;
- executar primeiro fixtures locais.

O rollback recomendado Ã© lÃ³gico e nÃ£o destrutivo: desabilitar a funcionalidade, marcar lote/itens revertidos, preservar resultados e bloquear retry atÃ© anÃ¡lise. NÃ£o apagar automaticamente keywords novas, especialmente se alguma estiver publicada. RemoÃ§Ã£o excepcional exige autorizaÃ§Ã£o especÃ­fica, identificaÃ§Ã£o por lote e guard de publicado.

## 16. Plano de testes automatizados

Usar fixtures locais; nÃ£o chamar IA, SERP, provedores pagos, sitemap real ou Supabase remoto.

### Contrato e seguranÃ§a

- rejeitar candidato e lista de outra marca;
- nÃ£o atribuir keyword sem lista Ã  marca;
- rejeitar URL fora do host autorizado, redirect inseguro, IP privado e conteÃºdo invÃ¡lido;
- provar que preview nÃ£o escreve keyword, lote final ou confirmaÃ§Ã£o;
- rejeitar confirmaÃ§Ã£o sem sessÃ£o/acesso.

### Novos e existentes

- nova keyword conserva texto, normalizaÃ§Ã£o, origem, URL, catÃ¡logo, lote e `bruto`;
- existente conserva ID, intenÃ§Ã£o, mÃ©tricas/KGR, status, aprovaÃ§Ã£o, DNA e histÃ³rico;
- origem nova Ã© anexada sem substituir semÃ¢ntica;
- publicada preserva slug, canonical, marca, keyword principal e URL;
- slug/tÃ­tulo/H1 parecido resulta em candidata;
- secundÃ¡ria/menÃ§Ã£o nÃ£o Ã© promovida;
- canonical divergente resulta em conflito visÃ­vel.

### IdempotÃªncia e lotes

- repetiÃ§Ã£o nÃ£o duplica keyword;
- texto igual em URLs diferentes nÃ£o cria duplicata automÃ¡tica;
- retry processa sÃ³ itens pendentes;
- erro nÃ£o Ã© reportado como sucesso;
- reload reconstrÃ³i resultado real;
- rollback nÃ£o apaga dados nem perde trilha.

### Minerador e Arquiteto

- filtros de URL, relaÃ§Ã£o e arquitetura nÃ£o misturam dimensÃµes;
- seleÃ§Ã£o nÃ£o controla renderizaÃ§Ã£o;
- hidrataÃ§Ã£o nÃ£o reconcilia nem escreve;
- transferÃªncia futura carrega marca, identidade, versÃ£o/hash, URL/relaÃ§Ã£o/evidÃªncia e condiÃ§Ã£o de candidata;
- teste nÃ£o considera `architectImportedKeywordIds` isolado como persistÃªncia.

### RegressÃ£o

Executar, com autorizaÃ§Ã£o e escopo, suÃ­tes focadas de Marca/Minerador, testes operacionais, autorizaÃ§Ã£o e Arquiteto, alÃ©m de `git diff --check`. NÃ£o usar `npm test` como atalho de auditoria do Minerador enquanto incluir teste de banco real nÃ£o autorizado.

## 17. ValidaÃ§Ã£o manual posterior

ValidaÃ§Ã£o local automatizada foi executada; validaÃ§Ã£o remota e de navegador ainda deve registrar evidÃªncias separadas:

1. selecionar marca e confirmar isolamento;
2. configurar/verificar site e testar sitemap;
3. sincronizar sÃ³ por aÃ§Ã£o explÃ­cita;
4. verificar URL acessÃ­vel, canonical divergente, ausente e redirect;
5. extrair/revisar candidatos, campo, URL, papel e confianÃ§a;
6. confirmar que similaridade com slug/tÃ­tulo/H1 nÃ£o confirma principal;
7. abrir prÃ©via e comprovar ausÃªncia de alteraÃ§Ã£o;
8. importar nova keyword e confirmar ID, `bruto`, marca/lista e origem;
9. repetir e confirmar idempotÃªncia;
10. importar existente e comprovar preservaÃ§Ã£o de intenÃ§Ã£o, mÃ©tricas, status e DNA;
11. comprovar evidÃªncia nova sem sobrescrever semÃ¢ntica;
12. testar lote parcial e retry dos pendentes;
13. trocar marca antes da confirmaÃ§Ã£o e comprovar invalidaÃ§Ã£o;
14. bloquear lista/candidato de outra marca;
15. confirmar que importaÃ§Ã£o nÃ£o publica/aprova automaticamente;
16. provocar conflito publicado sem alterar slug/canonical/URL;
17. recarregar e confirmar ausÃªncia de deduplicaÃ§Ã£o/escrita silenciosa;
18. selecionar explicitamente keyword qualificada ao Arquiteto;
19. comprovar identidade, marca, versÃ£o/proveniÃªncia e evidÃªncia na transferÃªncia;
20. comprovar que destino nÃ£o depende apenas de Ã­ndice local;
21. registrar IDs, `batchId`, estados e limitaÃ§Ãµes.

TypeScript, build e fixtures nÃ£o bastam para declarar end-to-end. RLS, persistÃªncia remota, browser e publicaÃ§Ã£o real exigem execuÃ§Ã£o prÃ³pria.

## 18. Observabilidade e auditoria

Cada operaÃ§Ã£o deve ser rastreÃ¡vel por `brandId`, `batchId`, `catalogEntryId`, `mineradorKeywordId`, versÃ£o da evidÃªncia e ator. O resultado por item mantÃ©m causa de erro/conflito e data. Eventos sÃ£o append-only quando a persistÃªncia remota correspondente for aprovada.

Logs nÃ£o devem conter segredos, tokens ou conteÃºdo completo desnecessÃ¡rio. Devem registrar referÃªncias e resumos suficientes para auditar origem, decisÃ£o humana e divergÃªncia.

## 19. DependÃªncias e prÃ©-condiÃ§Ãµes

Antes de implementar:

- resolver ou isolar M-01;
- retirar/isolar mutaÃ§Ãµes de hidrataÃ§Ã£o M-02;
- definir persistÃªncia e resultado de lote M-03;
- fechar gate de publicado M-04;
- definir transferÃªncia persistida M-05;
- decidir o tratamento versionado do KeywordDNA M-06;
- revisar RLS e eventual aplicaÃ§Ã£o de `0004` separadamente;
- definir mÃºltiplas evidÃªncias keywordâ†”URL;
- esclarecer autoridade da confirmaÃ§Ã£o de `principal_confirmada`.

## 20. DecisÃµes e aprovaÃ§Ãµes remanescentes

1. Registrar a Fase A compatÃ­vel com `site_origin` como aprovada e implementada localmente; nÃ£o hÃ¡ aprovaÃ§Ã£o remota implÃ­cita.
2. Aprovar persistÃªncia durÃ¡vel baseada nas entidades Site/Sitemap existentes ou solicitar SDD de schema.
3. Definir se `urlSituation` Ã© derivada ou tambÃ©m snapshot persistido.
4. Definir onde a relaÃ§Ã£o `principal_confirmada` pode ser confirmada.
5. Definir o tratamento de uma keyword em vÃ¡rias URLs e listas.
6. Confirmar que importaÃ§Ã£o nunca muda status editorial por inferÃªncia.
7. Aprovar contrato futuro de transferÃªncia ao Arquiteto sem alterar o mÃ³dulo agora.
8. Autorizar separadamente migration, escrita remota, sessÃ£o autenticada e validaÃ§Ã£o manual.

## 21. Resultado desta execuÃ§Ã£o

- Documento atualizado: `docs/03-minerador/propostas/sincronizacao-site-sitemap-minerador.md`.
- Fase A implementada em `lib/minerador/site-sync-adapter.ts`, `lib/marca/site-minerador-import.ts`, contratos/reconciliaÃ§Ã£o Site/Sitemap, rotas de importaÃ§Ã£o, painel Marca e `app/(brand)/[brandRef]/minerador/page.tsx`.
- O fluxo oferece `Conferir com o site`, prÃ©via somente leitura, confirmaÃ§Ã£o explÃ­cita, atualizaÃ§Ã£o aditiva de evidÃªncia, filtros separados e retorno por item.
- Keywords novas entram com ID real, `bruto`, lista de destino e mÃ©tricas/intenÃ§Ã£o nulas; existentes preservam seus campos e recebem `evidence_updated`/`no_change`.
- Testes locais: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/marca-site.test.mts` passou 14/14; `npx tsc --noEmit` foi executado apÃ³s a correÃ§Ã£o do adapter e deve ser repetido no fechamento.
- Schema/migrations nÃ£o alterados nem aplicados.
- Supabase remoto nÃ£o recebeu escrita.
- IndexedDB/localStorage nÃ£o foram limpos ou modificados por esta tarefa.
- Arquiteto e contratos compartilhados nÃ£o foram alterados.
- Nenhuma chamada de IA, SERP ou API paga foi realizada.
- NÃ£o foram executados `npm test`, chamadas de IA/SERP, Supabase remoto ou browser autenticado.

## 22. Backlog resultante

O backlog do Minerador deve registrar a Fase A como implementada localmente. Permanecem pendentes a validaÃ§Ã£o remota/browser, eventual persistÃªncia durÃ¡vel do catÃ¡logo, decisÃµes de schema/RLS e as correÃ§Ãµes M-01â€“M-05; nenhuma dessas pendÃªncias foi mascarada por TypeScript ou build.
## Fase B relacionada - 2026-07-22

A implementacao local adiciona a consolidacao apos a confirmacao persistida: a evidencia Site/Sitemap registra URL de origem, URL resolvida, canonical declarado, situacao de publicacao e o `targetListId`/nome do silo ja existente escolhido pelo usuario. A operacao continua preview-first, seletiva, idempotente e brand-scoped; nao cria silo, nao infere slug/canonical publicado e nao altera Arquiteto.

A validacao desta fase foi feita com fixtures, TypeScript e diff local. Migration, Supabase remoto, RLS e browser autenticado continuam fora da execucao.

## Correcao critica de qualificacao de volume - Fase B.2 - 2026-07-22
A qualificacao deixa de persistir nulos quando o provedor falha ou nao retorna uma keyword. O contrato local normaliza apenas mediacoes numericas vinculadas a solicitacoes explicitas; a rota rejeita o endpoint de auditoria de site configurado por engano. Nenhuma chamada externa foi executada.
## Correcoes de interface do Minerador - Fase B.1 - 2026-07-22

O contrato Site/Sitemap nao foi alterado. A interface do Minerador agora envia para previa apenas candidatas cujo texto normalizado pertence as keywords selecionadas e mantem a confirmacao explicita. A aÃ§ao vive na barra inferior existente; nao foi criada nova barra nem nova persistencia.
