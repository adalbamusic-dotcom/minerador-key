# SDD — Persistência canônica de Site, Sitemap e catálogo da Marca

- **Módulo proprietário:** Marca
- **Estado:** `SDD_STATUS = PROPOSED_AWAITING_APPROVAL`
- **Data:** 2026-09-02
- **Origem:** bloqueio comprovado da Fase 2 do Arquiteto
  (`PHASE_2_ARQUITETO = BLOCKED_BY_CANONICAL_SITE_SOURCE`).
- **Escopo:** onde vivem configuração de site/sitemap, execuções de sincronização
  e catálogo de URLs observadas; normalização de URL; transição do estado local;
  contrato de leitura read-only para o Arquiteto.
- **Fora de escopo:** Arquiteto, Minerador, Radar, Planejador, Redator,
  Publicações, auth, tenant, GlobalTopbar, redesign visual, novo crawler,
  extração de keywords do site (já funciona e já persiste no Minerador).

```
DDL_EXECUTED = 0 · SQL_EXECUTED = 0 · REMOTE_MUTATIONS = 0
SITEMAP_FETCHES = 0 · PAID_PROVIDER_CALLS = 0 · CODE_CHANGED = 0
```

---

## 1. Problema

A aba Site da Marca funciona, mas **não tem fonte canônica no servidor**. Todo o
catálogo estrutural do site vive no navegador do usuário.

Consequências verificadas:

- outro navegador, outro dispositivo ou outro colaborador não vê o catálogo;
- nenhum módulo server-side consegue ler o que o site publica;
- o Arquiteto não tem como montar a Base Territorial (Etapa 0) sem crawler
  próprio — o que é vetado;
- perder o storage do navegador perde o inventário inteiro.

## 2. Estado atual comprovado

Auditoria de código em 2026-09-02. Nenhum arquivo alterado.

### 2.1 Inventário

| Item | Onde está |
|---|---|
| UI | [`modules/marca/site-sitemap-panel.tsx`](../../../modules/marca/site-sitemap-panel.tsx) — 61 KB |
| Contrato | [`lib/marca/site-contracts.ts`](../../../lib/marca/site-contracts.ts) — `BrandSiteWorkspaceSchema` |
| Storage | [`lib/marca/site-store.ts`](../../../lib/marca/site-store.ts) — **navegador** |
| Reconciliação local | [`lib/marca/site-reconciliation.ts`](../../../lib/marca/site-reconciliation.ts) |
| Parser | [`lib/marca/site-parser.ts`](../../../lib/marca/site-parser.ts) |
| Coleta | [`lib/marca/site-fetch.ts`](../../../lib/marca/site-fetch.ts) — `crawlAuthorizedSitemap`, `fetchAuthorizedText` |
| Segurança | [`lib/marca/site-security.ts`](../../../lib/marca/site-security.ts) |
| Normalização | [`lib/marca/site-domain.ts`](../../../lib/marca/site-domain.ts) — `normalizeSiteUrl` |
| APIs | `app/api/marca/site/{sitemap/test, sitemap/sync, page/verify, lists, import/keywords, import/keywords/preview}` |
| Autorização das rotas | `app/api/marca/site/_helpers.ts` — `authorizedSiteBrand` |
| Import p/ Minerador | [`lib/marca/site-minerador-import.ts`](../../../lib/marca/site-minerador-import.ts) |
| Testes | `tests/marca-site.test.mts`, `tests/marca-site-navigation.test.mts`, `tests/site-kgr-contract.test.mts` |

### 2.2 O que é canônico hoje

```
CURRENT_CANONICAL_REMOTE_CONFIG  = marcas.site_url          (única coluna remota)
CURRENT_CANONICAL_REMOTE_CATALOG = NENHUM
```

O único caminho da aba Site que grava no banco é a importação de keywords, que
insere em `minerador_keywords` — e essa parte **funciona e não muda**.

### 2.3 O que é local

```
CURRENT_LOCAL_ONLY_STATE = BrandSiteWorkspace inteiro:
  sitemaps[] · syncRuns[] · catalog[] · verifications[] · candidates[]
  · importBatches[] · events[]
```

`site-store.ts` grava com `writeBrowserArtifact` na chave
`minerador-pro:site-workspace:{actorUserId}:{brandId}` e força
`persistenceMode: "local_fallback"` em toda gravação. `SitePersistenceModeSchema`
já prevê `"remote"`, mas nenhum código o produz.

### 2.4 As rotas são stateless

- `POST /api/marca/site/sitemap/test` → baixa, parseia, devolve. Não grava.
- `POST /api/marca/site/sitemap/sync` → `crawlAuthorizedSitemap`, devolve
  `{ run, urls, processed, errors }` com `newCount: 0` fixo. **Não grava.**
- `POST /api/marca/site/page/verify` → baixa a página, devolve verificação. Não grava.
- `GET /api/marca/site/lists` → lê `minerador_keyword_lists` (leitura de outro módulo).
- `POST /api/marca/site/import/keywords` → **grava** em `minerador_keywords`.

### 2.5 `brand_site_*` não existe em runtime

`grep -rn "brand_site_"` em `lib/`, `app/`, `modules/`, `components/` → **zero
ocorrências**. As oito tabelas existem apenas no arquivo da migration 0004.

### 2.6 Segurança da coleta já é sólida

`crawlAuthorizedSitemap` herda de `fetchAuthorizedText`: protocolo http/https,
recusa de credenciais na URL, bloqueio de host privado/reservado/metadata,
resolução DNS com verificação de **todos** os endereços, redirects manuais com
teto 3 e revalidação de host a cada salto, timeout de 10 s, teto de 5 MB (XML) /
2 MB (HTML), Content-Type restrito, e limites de profundidade/quantidade
(`maxDepth 2`, `maxSitemaps 20`, `maxUrls 10000`). **Nada disso é flexibilizado
por esta SDD.**

### 2.7 Defeito de normalização a corrigir

`normalizeSiteUrl` só remove a barra final quando `pathname === "/"` e não há
query. Portanto `https://marca.com/a/` e `https://marca.com/a` produzem chaves
diferentes, e `www.` só é ignorado na comparação de host de segurança
(`isAuthorizedSiteHost`), não na normalização. Sem regra determinística, o
catálogo duplicaria URLs e a reconciliação com Publicações erraria.

## 3. Política sobre a migration 0004

```
LEGACY_0004_POLICY = HISTORICAL_DESIGN_INPUT · NUNCA APLICAR
```

Motivos objetivos, além do cabeçalho "PROPOSTA PARA APLICAÇÃO MANUAL. NÃO
APLICADA PELO CODEX":

1. `brand_site_import_batches.target_list_id` referencia `public.listas_kgr`,
   renomeada pela 0036 para `minerador_keyword_lists` — falharia;
2. a RLS usa o padrão antigo `editorial_has_permission(...)`, enquanto as tabelas
   canônicas atuais (0027) usam `canonical_actor_can_access_brand(marca_id, auth.uid())`;
3. `created_by text` / `updated_by text` em vez de `uuid REFERENCES auth.users(id)`,
   divergindo do padrão de 0027;
4. define oito tabelas, cinco das quais esta SDD **não** propõe agora;
5. `docs/02-marca/estado-atual.md:265` já a registra como "Preparado, não aplicado".

A migration nova é um arquivo próprio, escrito a partir do estado presente. A
0004 permanece no repositório como histórico.

## 4. Três conceitos que não podem virar um só

```
A. CONFIGURAÇÃO   site_url, sitemaps cadastrados, tipo, habilitado
                  → muda por decisão humana, é pequena, é editável
B. EXECUÇÃO       um sync explícito num instante: início, fim, contagens, erro
                  → append-only, é histórico, nunca é editada
C. CATÁLOGO       URLs/páginas observadas e seu estado mais recente
                  → é grande, é consultável, precisa de chave e índice
```

Colapsar os três num único JSON mutável destruiria histórico, proveniência e o
last-known-good. Esta SDD os separa — mas **não** normaliza o que não precisa:
verificações de página, candidatas de keyword, lotes de importação e eventos
continuam fora do remoto nesta rodada (§6.4).

## 5. Opções avaliadas

### Opção A — tabelas relacionais dedicadas para configuração, sync e catálogo

- **A favor:** busca por `brandId`, chave única por URL normalizada, índice para
  reconciliação com Publicações, histórico de execuções, last-known-good natural,
  escrita incremental por URL.
- **Contra:** DDL, RLS e índices novos; exige execução remota.

### Opção B — configuração dedicada + snapshot versionado do catálogo

- **A favor:** menos tabelas; histórico completo grátis.
- **Contra:** o teto do crawler é 10 000 URLs; um snapshot com título, canonical,
  meta e status por URL fica na casa de vários MB, **gravado inteiro a cada
  sync**. Consultar "existe esta URL nesta Brand?" exigiria carregar e varrer o
  documento inteiro no servidor. Reconciliação com `PublicationRecord` viraria
  varredura em memória a cada leitura do Arquiteto.

### Opção C — `editorial_artifact_versions` com `artifact_type` novo

- **Contra:** aquele artefato modela **artefato editorial versionado com
  aprovação humana** (`article_dna`, `silo_dna`, `content_plan`…). Catálogo de
  site é inventário observado de máquina, sem aprovação e sem sucessor
  semântico. Usá-lo enfraqueceria o significado do artefato — mesma objeção que
  já rejeitamos no Arquiteto.
- **Contra:** herda todo o problema de tamanho da Opção B.

### Opção D — só colunas em `marcas`

- **Contra:** `marcas` é linha única por Brand; catálogo com milhares de URLs
  num jsonb da própria Brand transforma toda leitura de Marca numa leitura
  pesada e todo sync numa reescrita concorrente da linha.

## 6. Recomendação

```
RECOMMENDED = OPÇÃO A, com escopo mínimo comprovado (3 tabelas, não 8)
```

### 6.1 Configuração

```
RECOMMENDED_SITE_CONFIG_STORAGE    = marcas.site_url  (INALTERADO — já é canônico)
RECOMMENDED_SITEMAP_CONFIG_STORAGE = nova tabela brand_site_sitemaps
```

`site_url` fica onde está: já é remoto, já é lido por `authorizedSiteBrand`, já
define `primaryHost` para os guards. Mover seria risco sem ganho.

Sitemaps ganham tabela porque são **vários por Brand**, têm tipo, hierarquia
(`parent_sitemap_id`), estado de habilitação e precisam ser referenciados por
execuções e por entradas do catálogo.

### 6.2 Execução

```
RECOMMENDED_SYNC_STORAGE = nova tabela brand_site_sync_runs, append-only
```

Guarda início, fim, status, contagens e mensagem de erro. **Um sync que falha
grava uma linha de falha e não toca o catálogo** — é isso que materializa o
last-known-good.

### 6.3 Catálogo

```
RECOMMENDED_CATALOG_STORAGE = nova tabela brand_site_catalog_entries
```

Uma linha por URL normalizada por Brand, com o estado observado mais recente e
os carimbos `first_discovered_at` / `last_seen_at` / `last_verified_at`.

### 6.4 O que NÃO vai para o remoto agora

`verifications`, `candidates`, `importBatches` e `events` continuam locais.

**Verificação da condição de parada** (nenhum deles pode ser fonte única de
decisão humana, proveniência necessária ou aprovação):

| Estado local | É fonte única? | Prova |
|---|---|---|
| `verifications` | Não | Rederivável por `page/verify`; o estado corrente vai para a linha do catálogo (`verification_status`, `last_verified_at`) |
| `candidates` | Não | Rederivável por `extractCandidatesForEntry(entry)`, função pura sobre a entrada do catálogo |
| `candidates.relationConfirmedBy/At` | **Não** | A decisão humana é produzida pelo Minerador (`lib/minerador/publication-link.ts:227`) e persiste em `minerador_keywords.analise_semantica.site_origin` — `site-minerador-import.ts:193-194` a carrega para a evidência gravada na linha 306 |
| `importBatches` | Não | O resultado canônico é a keyword inserida em `minerador_keywords`, com `mineradorKeywordId` real |
| `events` | Não | Trilha de UI; nenhuma decisão depende dela |
| Decisão "ignorar esta URL" | **Seria** | Por isso `import_status`/`ignored_at` foram movidos para o catálogo remoto |

Resíduo declarado: marcar uma **candidata de termo** como ignorada continua
local e não sobrevive à troca de navegador. É triagem refazível, não gate de
aprovação, e nenhum artefato canônico depende dela. Se o uso real mostrar que
essa perda incomoda, vira adendo — não é ampliado em silêncio.

```
NEW_TABLES  = 3   (brand_site_sitemaps, brand_site_sync_runs, brand_site_catalog_entries)
NEW_COLUMNS = 0   em tabelas existentes
NEW_ARTIFACT_TYPES = 0
```

### 6.5 Forma proposta (para aprovação, não para aplicar)

```
brand_site_sitemaps
  id uuid pk · marca_id uuid not null → marcas(id) on delete restrict
  url text not null · normalized_url text not null
  sitemap_type text check (principal|sitemap_index|posts|paginas|produtos|categorias|outro)
  parent_sitemap_id uuid → self on delete restrict
  enabled boolean not null default true
  status text check (not_tested|testing|tested|syncing|synced|partial|error|disabled)
  last_tested_at · last_synced_at timestamptz
  last_successful_run_id uuid → brand_site_sync_runs(id)     -- last-known-good
  created_by/updated_by uuid not null → auth.users(id)
  created_at/updated_at timestamptz · lock_version integer
  UNIQUE (marca_id, normalized_url)

brand_site_sync_runs                                        -- APPEND-ONLY
  id uuid pk · marca_id uuid not null → marcas(id)
  sitemap_id uuid not null → brand_site_sitemaps(id)
  status text check (running|completed|partial|failed)
  found_count · new_count · updated_count · missing_count · error_count integer
  duration_ms integer · error_message text
  started_at · completed_at timestamptz
  created_by uuid not null → auth.users(id)

brand_site_catalog_entries
  id uuid pk · marca_id uuid not null → marcas(id)
  normalized_url text not null            -- CHAVE (§7)
  discovered_url text not null            -- como observada, nunca reescrita
  resolved_url · declared_canonical_url · normalized_canonical_url text
  title · h1 · meta_description text
  page_type text · indexability text · verification_status text
  source_sitemap_id uuid → brand_site_sitemaps(id)
  sitemap_lastmod timestamptz
  -- histórico mínimo exigido + presença corrente
  presence_state text check (present|missing)
  first_seen_at timestamptz not null · first_seen_run_id uuid → brand_site_sync_runs(id)
  last_seen_at  timestamptz not null · last_seen_run_id  uuid → brand_site_sync_runs(id)
  last_verified_at timestamptz
  -- decisão humana sobre a URL; preservada por qualquer sync posterior
  import_status text · origin text · ignored_at timestamptz
  publication_ref text                    -- vínculo editorial confirmado (1º passo do matching)
  created_by/updated_by uuid not null → auth.users(id)
  created_at/updated_at timestamptz
  UNIQUE (marca_id, normalized_url)
```

**Ajustes decididos durante a implementação da Fase 1**, em relação ao rascunho
inicial desta SDD:

- `presence_state`, `first_seen_run_id` e `last_seen_run_id` acrescentados para
  atender o histórico mínimo exigido; `last_sync_run_id` genérico foi descartado
  em favor de `last_seen_run_id`, que responde "qual execução viu esta URL pela
  última vez";
- `import_status`, `origin`, `ignored_at` e `publication_ref` acrescentados
  porque são **decisão humana sobre a URL**. Deixá-los locais faria a decisão
  "ignorar esta URL" se perder ao trocar de navegador — exatamente a condição de
  parada do escopo aprovado. `applyCatalogSync` nunca os sobrescreve.

```
INDEXES_REQUIRED =
  brand_site_catalog_entries (marca_id, normalized_url)          -- UNIQUE, reconciliação
  brand_site_catalog_entries (marca_id, normalized_canonical_url) -- canonical × Publicações
  brand_site_catalog_entries (marca_id, last_seen_at DESC)        -- listagem da UI
  brand_site_sync_runs (marca_id, sitemap_id, started_at DESC)    -- histórico e last-known-good
  brand_site_sitemaps (marca_id)                                  -- UNIQUE já cobre lookup
```

```
RLS_REQUIRED = SIM, no padrão de 0027 (não no de 0004):
  ENABLE ROW LEVEL SECURITY nas três
  SELECT TO authenticated USING (canonical_actor_can_access_brand(marca_id, auth.uid()))
  REVOKE ALL de PUBLIC/anon/authenticated/service_role
  GRANT SELECT TO authenticated
  GRANT SELECT, INSERT, UPDATE TO service_role   (escrita só server-side)
  brand_site_sync_runs: apenas SELECT/INSERT + trigger append-only
```

Escrita passa por `resolvePipelineContext`-equivalente da Marca, com
`canonical_actor_can_use_brand_action(brandId, actor, 'marca', 'edit')`. Cross-brand
é impossível: FK + RLS + `.eq("marca_id", brandId)` no repositório.

## 7. Normalização de URL

```
URL_NORMALIZATION = regra determinística, declarada, aplicada só na CHAVE
```

`discovered_url`, `resolved_url`, `declared_canonical_url` guardam **o que foi
observado**, sem reescrita. A chave de identidade é derivada:

```
canonicalSiteKey(url):
  1. exige http/https; recusa credenciais            (guard atual, preservado)
  2. hostname minúsculo, remove "www." inicial
  3. remove porta padrão (80/443)
  4. remove fragment
  5. remove barra final, EXCETO na raiz
  6. preserva a query, com parâmetros ordenados por nome
  7. NÃO inclui o protocolo na chave                 (http→https é o mesmo recurso)
  8. NÃO decodifica percent-encoding nem muda o caso do path
```

Consequências declaradas: `https://marca.com/a/` ≡ `http://www.marca.com/a`;
`/a?b=1&c=2` ≡ `/a?c=2&b=1`; `/A` ≢ `/a`. Duas URLs só são equivalentes por esta
regra — **nunca por substring**. `normalizeSiteUrl` atual permanece para
apresentação e para os guards; `canonicalSiteKey` é função nova, pura e testada.

**Nenhuma URL publicada é alterada.** A normalização existe para comparar, não
para reescrever.

## 8. Sincronização e last-known-good

```
SYNC = AÇÃO EXPLÍCITA DO USUÁRIO, SEMPRE
```

Proibido buscar sitemap ao abrir a Marca ou ao abrir o Arquiteto.

```
usuário aciona Sync na Marca
  → servidor coleta (crawlAuthorizedSitemap, guards intactos)
  → valida
  → abre sync_run status=running
  → aplica o catálogo em transação:
       URL nova           → insere (first_discovered_at = agora)
       URL já conhecida   → atualiza last_seen_at e campos observados
       URL ausente agora  → NÃO apaga; last_seen_at fica antigo (missing_count++)
  → fecha sync_run completed|partial
  → atualiza sitemaps.last_successful_run_id
  → readback obrigatório
  → só então a UI informa sucesso
```

```
LAST_KNOWN_GOOD:
  snapshot N válido + tentativa N+1 falha ⇒ N continua canônico
  A falha grava sync_run status=failed com error_message
  Estado vazio NUNCA substitui estado válido
  Nenhuma URL é apagada por ausência num sync
```

## 9. Transição do estado local

```
LOCAL_FALLBACK_TRANSITION = remoto canônico + adapter de compatibilidade
                            + reconciliação humana explícita
NUNCA: apagar, limpar ou promover silenciosamente o estado local
```

1. leitura passa a ser **remoto primeiro**;
2. `persistenceMode` deixa de ser fixo: `"remote"` quando o remoto responde,
   `"local_fallback"` quando não;
3. se existir estado local que o remoto não tem, a UI mostra
   `LOCAL_STATE_NEEDS_RECONCILIATION` com contagem e uma ação explícita de
   importar;
4. o IndexedDB/localStorage **permanece intacto** — inclusive depois da
   importação, até o usuário decidir;
5. `AGENTS.md` §10 continua valendo: navegador nunca é fonte canônica.

## 10. Contrato de leitura do Arquiteto

```
ARCHITECT_READ_CONTRACT = função server-only exportada pela MARCA,
                          importada diretamente pelo Arquiteto
```

```ts
// lib/server/brand-site-snapshot.ts — proprietário: Marca
export async function readBrandSiteSnapshot(context): Promise<{
  brandId: string;
  siteUrl: string | null;
  sitemaps: BrandSitemapSummary[];
  lastSuccessfulRun: SiteSyncRunSummary | null;
  catalog: SiteCatalogSnapshotEntry[];   // normalizedUrl, canonical, title, status, timestamps
  freshness: { lastSyncedAt: string | null; stale: boolean };
}>;
```

- somente leitura; nenhum caminho de escrita exposto ao Arquiteto;
- **sem HTTP interno**: o Arquiteto importa a função, não chama
  `fetch("http://localhost:3000/...")`;
- `SITEMAP_EXTERNAL_FETCH_ON_ARCHITECT_LOAD = 0` — devolve o último snapshot
  persistido e declara `freshness`;
- Brand sem sync devolve `catalog: []` e `lastSuccessfulRun: null` — Base
  Territorial válida e vazia, que o contrato do Arquiteto já suporta.

## 11. Reconciliação com Publicações

```
PUBLICATION_RECONCILIATION = por refs e chave normalizada, nunca por substring
AUTORIDADE EDITORIAL INTERNA = PublicationRecord / SiloPage / ArticleDNA
EVIDÊNCIA EXTERNA            = catálogo do site
```

Achado relevante: `PublicationRecordSchema`
([operational-contracts.ts:39](../../../lib/editorial/operational-contracts.ts))
tem `slug` e `destination`, mas **não** guarda URL absoluta nem canonical. Quem
guarda identidade publicada completa é `SiloPage` (`publishedUrl`, `canonical`,
`slug`) e `ArticleDNA.publishedIdentityRef` (`publishedUrl`, `slug`, `canonical`).

Ordem de correspondência proposta:

1. `catalog.normalized_canonical_url` × `canonicalSiteKey(SiloPage.canonical)`;
2. `catalog.normalized_url` × `canonicalSiteKey(publishedIdentityRef.publishedUrl)`;
3. `catalog.normalized_url` × `canonicalSiteKey(site_url + SiloPage.slug)`;
4. sem correspondência ⇒ permanece sem correspondência.

Resultados: `MATCHED`, `SITE_ONLY`, `DATABASE_ONLY`, `CONFLICTING` — exatamente o
vocabulário que o Arquiteto já contratou em `lib/arquiteto/territorial-base.ts`.
**Nada é corrigido automaticamente.**

## 12. Matriz estrutural

| AREA | CURRENT_STATE | PROPOSED_CHANGE | STRUCT | DDL | CONSUMERS | BACK_COMPAT | ROLLBACK |
|---|---|---|---|---|---|---|---|
| SITE_CONFIG_STORAGE | `marcas.site_url` | **nenhuma** | NO | NO | `authorizedSiteBrand`, UI Marca, Arquiteto | total | n/a |
| SITEMAP_CONFIG_STORAGE | navegador | tabela `brand_site_sitemaps` | YES | YES | UI Marca, sync, snapshot | aditiva; local intacto | parar de ler; tabela fica inerte |
| SYNC_RUN_STORAGE | navegador | tabela `brand_site_sync_runs`, append-only | YES | YES | UI Marca, last-known-good | aditiva | idem |
| CATALOG_STORAGE | navegador | tabela `brand_site_catalog_entries` | YES | YES | UI Marca, Arquiteto | aditiva | idem |
| URL_NORMALIZATION | `normalizeSiteUrl` (não idempotente p/ barra final) | + `canonicalSiteKey` puro, testado | NO | NO | catálogo, reconciliação | aditiva; função atual preservada | remover a função nova |
| LOCAL_FALLBACK_TRANSITION | única fonte | remoto primeiro + `LOCAL_STATE_NEEDS_RECONCILIATION` | YES | NO | UI Marca | local nunca apagado | voltar a ler local |
| BRAND_SITE_API | rotas stateless | `sitemap/sync` passa a persistir; nova rota de leitura | YES | NO | UI Marca | resposta atual preservada, campos aditivos | reverter a persistência |
| BRAND_SITE_UI | lê/escreve navegador | lê remoto, escreve por ação explícita | NO | NO | usuário | fallback preservado | reverter leitura |
| ARCHITECT_READ_API | inexistente | `readBrandSiteSnapshot` server-only | YES | NO | Arquiteto Fase 2 | aditiva | remover import |
| PUBLICATION_RECONCILIATION | inexistente | derivada, sem autocorreção | NO | NO | Arquiteto | aditiva | remover derivação |
| RLS | n/a | padrão 0027 nas três tabelas | YES | YES | plataforma | aditiva | drop policies com as tabelas |
| INDEXES | n/a | 5 índices (§6.5) | YES | YES | reconciliação, UI | aditiva | drop com as tabelas |
| MIGRATION | n/a | 1 arquivo novo | YES | YES | usuário executa | aditiva | drop das 3 tabelas (dado novo, nenhum legado perdido) |
| LEGACY_0004_POLICY | não aplicada | permanece histórica, nunca aplicada | NO | NO | ninguém | total | n/a |

## 13. Fases

```
FASE 0  auditoria + SDD                                          ← esta entrega
FASE 1  domínio puro: canonicalSiteKey, contratos de snapshot,
        contrato de reconciliação. Sem DDL, sem API, sem UI.
FASE 2  migration local + probe do schema remoto + SQL controlado
        → PARADA: o usuário executa → readback remoto
FASE 3  repository server-side + escrita no sync explícito + readback
FASE 4  UI da Marca lê remoto; LOCAL_STATE_NEEDS_RECONCILIATION
FASE 5  readBrandSiteSnapshot + consumo read-only do Arquiteto
        → desbloqueia a Fase 2 do Arquiteto
FASE 6  smoke: Sync → F5 → outro navegador → mesmo catálogo → Arquiteto lê o mesmo
```

```
DDL_REQUIRED       = SIM, na Fase 2 — nunca antes
MIGRATION_REQUIRED = 1 arquivo novo (não a 0004)
```

Ledger: o baseline remoto não tem `supabase_migrations.schema_migrations`
reconstruído. Proibido `supabase db push` e `supabase migration repair`. O
caminho é migration local → probe remoto → SQL controlado → **usuário executa** →
readback.

## 14. Compatibilidade, rollback e riscos

```
BACKWARD_COMPATIBILITY = aditiva em tudo. Nenhuma coluna existente muda de
  significado; nenhuma rota perde campo; o estado local não é tocado; a
  importação de keywords para o Minerador não muda.

ROLLBACK = por fase. Parar de ler o remoto devolve o comportamento atual, com o
  estado local ainda íntegro. As três tabelas contêm apenas dado novo — dropá-las
  não perde nada que exista hoje. Nenhum caminho apaga catálogo, URL, canonical,
  PublicationRecord, KeywordDNA ou localStorage.
```

```
RISKS
  R1 Normalização mudar identidade de URL já conhecida.
     Mitigação: canonicalSiteKey é função nova e pura, com teste por regra;
     a URL observada nunca é reescrita.
  R2 Catálogo grande. Mitigação: teto de 10 000 do crawler preservado; escrita
     incremental por URL; índices declarados.
  R3 CHECK/RLS remotos divergirem do repositório. Mitigação: probe remoto antes
     de escrever a migration; nunca reconstruir CHECK por lista do repo.
  R4 Estado local divergir do remoto. Mitigação: reconciliação explícita, nunca
     promoção silenciosa.
  R5 Sync concorrente de dois atores. Mitigação: sync_runs append-only e
     `lock_version` na configuração; catálogo é upsert idempotente por chave.
  R6 Tentação de crawler no Arquiteto. Mitigação: o contrato de leitura não expõe
     coleta, e `SITEMAP_EXTERNAL_FETCH_ON_ARCHITECT_LOAD = 0` é invariante.
```

## 15. Perguntas fechadas

| # | Pergunta | Resposta |
|---|---|---|
| A | Quem guarda configuração? | `marcas.site_url` (inalterado) + `brand_site_sitemaps` |
| B | Quem guarda a URL do sitemap? | `brand_site_sitemaps.url` + `normalized_url` |
| C | Como nasce o snapshot? | Só por Sync explícito do usuário na Marca |
| D | Como o catálogo é persistido? | Upsert incremental por `(marca_id, normalized_url)` |
| E | Histórico completo ou last-known-good + runs? | **last-known-good + runs**; snapshots completos não se justificam |
| F | Como um sync falho é representado? | `sync_run status=failed`; catálogo anterior intacto |
| G | Como o fallback local é reconciliado? | `LOCAL_STATE_NEEDS_RECONCILIATION` + ação humana; nada apagado |
| H | Como outro navegador lê? | Do remoto, por `brandId`, sem depender do storage do ator |
| I | Como o Arquiteto consome? | `readBrandSiteSnapshot` server-only, read-only, sem HTTP interno |
| J | Como reconcilia com Publicações? | §11: canonical → publishedUrl → site_url+slug; sem substring |
| K | Tenant/RLS? | `marca_id` FK + RLS padrão 0027 + escrita só server-side |
| L | Cross-brand? | Impossível: FK, RLS e filtro por `marca_id` no repositório |
| M | Rollback? | §14 — aditivo, sem perda |
| N | DDL? | 3 tabelas, 5 índices, RLS; zero coluna nova em tabela existente |
| O | Migration 0004? | `HISTORICAL_DESIGN_INPUT`; nunca aplicar |

## 16. Autorização

Esta SDD altera persistência, APIs e fronteira de leitura entre módulos.
Conforme `AGENTS.md` §4, exige aprovação antes do código.

```
SDD_READY_FOR_APPROVAL = YES
SDD_APPROVED = NO
```

Nenhuma implementação foi feita. Nenhuma migration criada. Nenhum SQL executado.
Nenhuma chamada externa.

---

## Adendo A1 — Atomicidade da promoção COMPLETED

- **Data:** 2026-09-02 · **Estado:** `AMENDMENT_STATUS = PROPOSED_AWAITING_APPROVAL`
- **Origem:** atomicity gate da Fase 3.

### A1.1 Bloqueio comprovado

```
CAN_SERVER_OPEN_DB_TRANSACTION = NO
CURRENT_DB_ACCESS_PATH = PostgREST via @supabase/supabase-js + @supabase/ssr
DIRECT_POSTGRES_DRIVER = NENHUM (sem pg, postgres, knex, drizzle, prisma, kysely)
SUPABASE_JS_MULTI_STATEMENT_TRANSACTION_AVAILABLE = NO
EXISTING_RPC_PATTERN_FOR_ATOMIC_MUTATION = YES
  precedente: persist_silo_pair_atomic (20260826225154_silo_pair_atomicity.sql)
```

Cada requisição PostgREST é a própria transação. Promover `completed` exige
quatro escritas coerentes — inferir ausência, transicionar o run, promover o
last-known-good e carimbar o sitemap. Em chamadas soltas, uma falha entre a
primeira e a segunda deixaria o catálogo marcando URLs como sumidas com base
numa execução que nunca terminou. Isso viola o contrato aprovado.

### A1.2 Função proposta

`public.finalize_brand_site_sync(p_marca_id, p_actor_user_id, p_run_id, p_status,
p_observed_urls, p_found_count, p_new_count, p_updated_count, p_error_count,
p_duration_ms, p_error_message) RETURNS jsonb`

`SECURITY INVOKER`, `EXECUTE` só para `service_role`, autorização canônica
interna (`canonical_assert_rpc_actor` + `canonical_actor_can_use_brand_action(…,
'marca', 'manage')`) — o mesmo desenho de `persist_silo_pair_atomic`.

Numa transação: valida run `running` da Brand com `FOR UPDATE`; valida o sitemap
da mesma Brand; confirma que a ingestão terminou (toda URL declarada já está no
catálogo carimbada por esta execução); infere ausência **só** em `completed`;
transiciona o run; promove `last_successful_run_id` **só** em `completed`;
carimba o sitemap; devolve readback.

**É só FINALIZAÇÃO.** A coleta continua em Node, com o crawler seguro existente.
Nenhum acesso de rede a partir do Postgres.

Decisões que a função materializa:

- **Ordem run → sitemap.** O gatilho `brand_site_sitemaps_last_known_good_trg`
  exige execução `completed`; inverter a ordem quebraria a própria migration
  anterior. Há teste travando essa ordem.
- **Escopo da ausência é o próprio sitemap.** Marcar como `missing` toda URL da
  Brand não vista nesta coleta apagaria indevidamente URLs de outro sitemap. A
  inferência só alcança linhas cuja última observação veio de execução **do mesmo
  sitemap**; origem manual (`last_seen_run_id` nulo) fica intacta.
- **`missing_count` não é argumento.** Quem conta é o banco, dentro da transação.
- **`failed` com observação gravada é recusado** — o resultado honesto é
  `partial`. O banco verifica e recusa.

### A1.3 Migration, rollback e testes

```
MIGRATION_FILE = supabase/migrations/20260902130000_brand_site_sync_finalization_atomic.sql
NEW_TABLES = 0 · NEW_COLUMNS = 0 · NEW_POLICIES = 0 · NEW_INDEXES = 0
NEW_TRIGGERS = 0 · NEW_CONSTRAINTS = 0 · NEW_FUNCTIONS = 1
ROLLBACK = DROP FUNCTION. Nenhum dado lido ou alterado. Depois do rollback o
  runtime deve RECUSAR promover `completed` em vez de aplicá-la em etapas soltas.
TESTS = tests/marca-site-sync-finalization.test.mts (13) — política de status,
  argumentos determinísticos, readback coerente e contrato estático do DDL.
```

`FUNCTION_CONTRACT` no domínio: `lib/marca/site-sync-finalization.ts` —
`resolveSyncOutcome`, `buildFinalizeSyncArgs`, `parseFinalizeSyncResult`.

### A1.4 Revisão 2 — retry idempotente e igualdade de conjunto

Auditoria do Planner encontrou dois defeitos na primeira versão da função.

**1. `run.status <> 'running'` → exception não atendia o contrato.** Uma resposta
perdida transformava um retry legítimo em erro. Agora, depois dos dois
`FOR UPDATE`, existe um branch idempotente com **zero mutação**: mesmo status e
mesmo payload devolvem `idempotentReplay: true` com o `missing_count` já
persistido; status diferente é `FINALIZATION_STATE_CONFLICT`; mesmo status com
payload diferente é `FINALIZATION_REPLAY_CONFLICT`. `missing_count` não vem do
caller e por isso não entra na comparação. `lastKnownGoodPromoted` volta como
**fato relido** (`sitemap.last_successful_run_id = run.id`), não deduzido do
status — o sitemap pode já ter avançado para outra execução.

**2. `INPUT ⊆ DB` era insuficiente.** A validação passou a provar `INPUT = DB`:
recusa nulo/vazio (`OBSERVED_SET_INVALID_VALUE`), recusa duplicata, e exige
`v_input_count = v_input_distinct_count` **e**
`v_input_count = v_db_observed_count = v_matched_count`
(`OBSERVED_SET_MISMATCH`). `p_found_count` continua metadado do run e **não**
participa da prova — há teste que varre o SQL executável, sem comentários, para
garantir isso. A validação precede os dois branches: um retry também precisa
descrever o mesmo resultado material.

`failed` ganhou guarda própria em duas frentes — declarar URL observada e existir
observação persistida — ambas antes da comparação genérica, para responder "use
partial" em vez de só acusar diferença.

O `DO` de pré-condição passou a exigir `brand_site_sync_run_guard()` e
`brand_site_sitemap_last_known_good_guard()`: a RPC depende semanticamente dos
dois.
