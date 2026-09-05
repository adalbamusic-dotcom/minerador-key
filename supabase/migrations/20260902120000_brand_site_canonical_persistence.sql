-- Persistência canônica de Site/Sitemap da Marca.
-- SDD: docs/02-marca/propostas/2026-09-02-sdd-site-sitemap-persistencia-canonica.md
--
-- Cria TRÊS tabelas: configuração de sitemaps, execuções de sync (append-only) e
-- catálogo de URLs observadas. Nenhuma coluna nova em tabela existente, nenhum
-- artifact_type novo, nenhum CHECK existente alterado.
--
-- `marcas.site_url` permanece a fonte canônica do site e NÃO é duplicada aqui.
--
-- Esta migration NÃO substitui nem repara `0004_brand_site_catalog.sql`, que
-- continua histórica e nunca aplicada: aquela referencia `listas_kgr` (renomeada
-- pela 0036), usa RLS no padrão `editorial_has_permission` anterior à 0027 e
-- declara `created_by text` em vez de FK para `auth.users`.
--
-- NÃO aplicada automaticamente. O usuário executa. Sem db push, sem migration repair.
--
-- Transacionalidade: todo o DDL está entre BEGIN e COMMIT. Um erro de SQL antes
-- do COMMIT aborta a transação inteira e nenhum objeto desta tentativa
-- permanece. Aplicação parcial NÃO é comportamento esperado.
-- Ainda assim, após qualquer erro remoto execute um probe do estado material
-- antes de tentar de novo: conexão interrompida, resultado de COMMIT
-- desconhecido, objeto preexistente ou intervenção externa são cenários em que
-- a mensagem de erro não basta como prova.

BEGIN;

-- Guarda por estado real, não por texto: recusa se a fundação esperada não
-- existir ou se alguma das tabelas já existir com forma desconhecida.
DO $$
BEGIN
  IF to_regclass('public.marcas') IS NULL THEN
    RAISE EXCEPTION 'brand_site_canonical_persistence recusada: public.marcas ausente';
  END IF;

  IF to_regclass('public.brand_site_sitemaps') IS NOT NULL
     OR to_regclass('public.brand_site_sync_runs') IS NOT NULL
     OR to_regclass('public.brand_site_catalog_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'brand_site_canonical_persistence recusada: tabela alvo já existe; auditar drift antes de reaplicar';
  END IF;

  IF to_regprocedure('public.canonical_actor_can_access_brand(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'brand_site_canonical_persistence recusada: canonical_actor_can_access_brand ausente';
  END IF;

  IF to_regprocedure('public.pipeline_editorial_touch_updated_at()') IS NULL
     OR to_regprocedure('public.pipeline_editorial_touch_lock_version()') IS NULL THEN
    RAISE EXCEPTION 'brand_site_canonical_persistence recusada: gatilhos canônicos do pipeline ausentes';
  END IF;

  IF to_regprocedure('public.brand_site_sync_run_guard()') IS NOT NULL
     OR to_regprocedure('public.brand_site_sitemap_last_known_good_guard()') IS NOT NULL THEN
    RAISE EXCEPTION 'brand_site_canonical_persistence recusada: função guard já existe';
  END IF;
END $$;

-- ─── Configuração ────────────────────────────────────────────────────────────
-- Vários sitemaps por Brand, com hierarquia, estado e ponteiro de last-known-good.

CREATE TABLE public.brand_site_sitemaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  url text NOT NULL CHECK (char_length(btrim(url)) > 0),
  -- Identidade derivada por brandCanonicalSiteKey(marcas.site_url, url)
  -- (lib/marca/site-canonical-url.ts): ancorada na origem declarada pela Brand,
  -- não numa regra global. Host fora dessa origem não recebe chave.
  normalized_url text NOT NULL CHECK (char_length(btrim(normalized_url)) > 0),
  sitemap_type text NOT NULL CHECK (
    sitemap_type IN ('principal', 'sitemap_index', 'posts', 'paginas', 'produtos', 'categorias', 'outro')
  ),
  parent_sitemap_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'not_tested' CHECK (
    status IN ('not_tested', 'testing', 'tested', 'syncing', 'synced', 'partial', 'error', 'disabled')
  ),
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  -- FK adicionada depois da criação de brand_site_sync_runs.
  last_successful_run_id uuid,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_site_sitemaps_identity_unique UNIQUE (marca_id, normalized_url),
  -- Alvo das FKs compostas: garante que um filho só referencie um sitemap da
  -- MESMA Brand. UUID válido de outra Brand passa a ser recusado pelo banco.
  CONSTRAINT brand_site_sitemaps_tenant_unique UNIQUE (id, marca_id),
  CONSTRAINT brand_site_sitemaps_parent_same_brand_fkey
    FOREIGN KEY (parent_sitemap_id, marca_id)
    REFERENCES public.brand_site_sitemaps(id, marca_id) ON DELETE RESTRICT,
  -- Um sitemap não é pai de si mesmo. Ciclos mais longos continuam guardados
  -- pelo domínio; detector recursivo não se justifica aqui.
  CONSTRAINT brand_site_sitemaps_parent_not_self CHECK (
    parent_sitemap_id IS NULL OR parent_sitemap_id <> id
  )
);

-- ─── Execução ────────────────────────────────────────────────────────────────
-- Append-only. NÃO guarda a lista de URLs: URLs vivem no catálogo.

CREATE TABLE public.brand_site_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  sitemap_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  found_count integer NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  new_count integer NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  -- Diagnóstico tratado. Nunca corpo bruto de resposta externa.
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT brand_site_sync_runs_tenant_unique UNIQUE (id, marca_id),
  -- Alvo da FK de last_successful_run_id: amarra execução, Brand E sitemap.
  CONSTRAINT brand_site_sync_runs_sitemap_scope_unique UNIQUE (id, marca_id, sitemap_id),
  CONSTRAINT brand_site_sync_runs_sitemap_same_brand_fkey
    FOREIGN KEY (sitemap_id, marca_id)
    REFERENCES public.brand_site_sitemaps(id, marca_id) ON DELETE RESTRICT,
  -- Estado terminal exige carimbo de conclusão; `running` não pode tê-lo.
  CONSTRAINT brand_site_sync_runs_completion_coherent CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX brand_site_sync_runs_history_idx
  ON public.brand_site_sync_runs (marca_id, sitemap_id, started_at DESC);

-- A execução apontada precisa ser da mesma Brand E do PRÓPRIO sitemap: a
-- terceira coluna referenciadora é o `id` do próprio sitemap, comparado com
-- `sitemap_id` da execução. Só (run_id, marca_id) deixaria um sitemap apontar
-- para a execução de outro sitemap da mesma Brand.
ALTER TABLE public.brand_site_sitemaps
  ADD CONSTRAINT brand_site_sitemaps_last_successful_run_fkey
  FOREIGN KEY (last_successful_run_id, marca_id, id)
  REFERENCES public.brand_site_sync_runs(id, marca_id, sitemap_id) ON DELETE RESTRICT;

-- ─── Catálogo ────────────────────────────────────────────────────────────────
-- Uma linha por URL canônica por Brand. Presença é observação, não exclusão:
-- nenhuma linha é removida por deixar de aparecer num sync.

CREATE TABLE public.brand_site_catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,

  normalized_url text NOT NULL CHECK (char_length(btrim(normalized_url)) > 0),
  discovered_url text NOT NULL CHECK (char_length(btrim(discovered_url)) > 0),
  resolved_url text,
  declared_canonical_url text,
  normalized_canonical_url text,

  title text,
  h1 text,
  meta_description text,
  page_type text NOT NULL DEFAULT 'unknown' CHECK (
    page_type IN ('article', 'page', 'service', 'product', 'category', 'author', 'other', 'unknown')
  ),
  indexability text NOT NULL DEFAULT 'unknown' CHECK (
    indexability IN ('unknown', 'indexable', 'noindex', 'blocked')
  ),
  verification_status text NOT NULL DEFAULT 'discovered' CHECK (
    verification_status IN ('discovered', 'unverified', 'accessible', 'canonical_confirmed',
                            'canonical_missing', 'canonical_conflict', 'redirect', 'noindex',
                            'not_found', 'error', 'stale')
  ),

  source_sitemap_id uuid,
  sitemap_lastmod timestamptz,

  -- Histórico mínimo exigido: primeira e última observação, com a execução que
  -- as produziu, mais o estado de presença corrente.
  presence_state text NOT NULL DEFAULT 'present' CHECK (presence_state IN ('present', 'missing')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  first_seen_run_id uuid,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_run_id uuid,
  last_verified_at timestamptz,

  -- Decisão humana sobre a URL. Preservada por qualquer sync posterior.
  import_status text NOT NULL DEFAULT 'not_imported' CHECK (
    import_status IN ('not_imported', 'selected', 'imported_as_legacy_content',
                      'keywords_sent', 'ignored', 'duplicate', 'conflict')
  ),
  origin text NOT NULL DEFAULT 'sitemap' CHECK (origin IN ('sitemap', 'manual')),
  ignored_at timestamptz,
  -- Não existe coluna de vínculo editorial confirmado. Uma referência humana
  -- pode apontar para PublicationRecord (uuid em publication_records), SiloPage
  -- ou ArticleDNA (text em editorial_artifact_versions.entity_id): identidades
  -- heterogêneas, sem alvo único de FK e sem nenhum produtor no código hoje.
  -- Materializá-la como `text` seria referência genérica opaca. Até existir
  -- contrato tipado e discriminado, a reconciliação continua DERIVADA por
  -- canonical → publishedUrl → site_url + slug.

  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_site_catalog_entries_identity_unique UNIQUE (marca_id, normalized_url),
  -- Toda referência cruzada carrega marca_id: cross-brand vira erro de FK.
  CONSTRAINT brand_site_catalog_entries_sitemap_same_brand_fkey
    FOREIGN KEY (source_sitemap_id, marca_id)
    REFERENCES public.brand_site_sitemaps(id, marca_id) ON DELETE RESTRICT,
  CONSTRAINT brand_site_catalog_entries_first_run_same_brand_fkey
    FOREIGN KEY (first_seen_run_id, marca_id)
    REFERENCES public.brand_site_sync_runs(id, marca_id) ON DELETE RESTRICT,
  CONSTRAINT brand_site_catalog_entries_last_run_same_brand_fkey
    FOREIGN KEY (last_seen_run_id, marca_id)
    REFERENCES public.brand_site_sync_runs(id, marca_id) ON DELETE RESTRICT,
  -- Decisão humana de ignorar carrega carimbo; sem ela, não há carimbo órfão.
  CONSTRAINT brand_site_catalog_entries_ignored_coherent CHECK (
    (import_status = 'ignored') = (ignored_at IS NOT NULL)
  )
);

-- Reconciliação por canonical observado; parcial porque a maioria é nula.
CREATE INDEX brand_site_catalog_entries_canonical_idx
  ON public.brand_site_catalog_entries (marca_id, normalized_canonical_url)
  WHERE normalized_canonical_url IS NOT NULL;

-- Listagem da aba Site e leitura do snapshot pelo Arquiteto.
CREATE INDEX brand_site_catalog_entries_presence_idx
  ON public.brand_site_catalog_entries (marca_id, presence_state, last_seen_at DESC);

-- ─── Gatilhos ────────────────────────────────────────────────────────────────

-- A configuração tem lock_version: o gatilho canônico incrementa a versão e
-- carimba updated_at na mesma operação.
CREATE TRIGGER brand_site_sitemaps_touch_lock_version_trg
  BEFORE UPDATE ON public.brand_site_sitemaps
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_lock_version();

CREATE TRIGGER brand_site_catalog_entries_touch_updated_at_trg
  BEFORE UPDATE ON public.brand_site_catalog_entries
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_editorial_touch_updated_at();

-- Execução é histórico. Um append-only incondicional seria incompatível com o
-- modelo de escrita adotado: a linha nasce `running`, antes da coleta, para que
-- uma queda no meio deixe evidência em vez de silêncio. O guard abaixo permite
-- EXATAMENTE uma transição — running → completed|partial|failed — e nada mais:
-- identidade, tenant, sitemap, início e autor são imutáveis, um estado terminal
-- nunca é reescrito e DELETE é sempre recusado.
CREATE FUNCTION public.brand_site_sync_run_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'brand_site_sync_runs is append-only: delete refused';
  END IF;

  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'brand_site_sync_runs terminal record cannot be changed (status=%)', OLD.status;
  END IF;

  IF NEW.status NOT IN ('completed', 'partial', 'failed') THEN
    RAISE EXCEPTION 'brand_site_sync_runs only accepts a terminal transition, got %', NEW.status;
  END IF;

  IF NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'brand_site_sync_runs terminal transition requires completed_at';
  END IF;

  -- Allowlist explícita: só campos de CONCLUSÃO podem mudar. Comparar o restante
  -- do registro por diferença de jsonb congela, por padrão, qualquer coluna
  -- futura — o inverso (lista de imutáveis) deixaria colunas novas mutáveis sem
  -- ninguém perceber.
  IF (to_jsonb(NEW)
        - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
        - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message')
     IS DISTINCT FROM
     (to_jsonb(OLD)
        - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
        - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message') THEN
    RAISE EXCEPTION 'brand_site_sync_runs allows only completion fields to change';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.brand_site_sync_run_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER brand_site_sync_runs_terminal_transition_trg
  BEFORE UPDATE OR DELETE ON public.brand_site_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.brand_site_sync_run_guard();

-- Last-known-good é a última coleta ÍNTEGRA. A FK de três colunas já garante
-- mesma Brand e mesmo sitemap, mas não garante o status: sem este guard, o
-- banco aceitaria apontar para uma execução `partial`, `failed` ou `running` e
-- contradiria a política do domínio. Guard mínimo, só sobre esta coluna.
CREATE FUNCTION public.brand_site_sitemap_last_known_good_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  referenced_status text;
BEGIN
  IF NEW.last_successful_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO referenced_status
    FROM public.brand_site_sync_runs
    WHERE id = NEW.last_successful_run_id;

  IF referenced_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'brand_site_sitemaps.last_successful_run_id requires a completed run (status=%)',
      COALESCE(referenced_status, 'missing');
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.brand_site_sitemap_last_known_good_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER brand_site_sitemaps_last_known_good_trg
  BEFORE INSERT OR UPDATE OF last_successful_run_id ON public.brand_site_sitemaps
  FOR EACH ROW EXECUTE FUNCTION public.brand_site_sitemap_last_known_good_guard();

-- ─── RLS e grants ────────────────────────────────────────────────────────────
-- Padrão da 0027: leitura por autorização canônica da Brand; escrita apenas
-- server-side por service_role. `anon` sem acesso.

ALTER TABLE public.brand_site_sitemaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_catalog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_site_sitemaps_select_policy
  ON public.brand_site_sitemaps FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY brand_site_sync_runs_select_policy
  ON public.brand_site_sync_runs FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

CREATE POLICY brand_site_catalog_entries_select_policy
  ON public.brand_site_catalog_entries FOR SELECT TO authenticated
  USING (public.canonical_actor_can_access_brand(marca_id, auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
  public.brand_site_sitemaps,
  public.brand_site_sync_runs,
  public.brand_site_catalog_entries
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.brand_site_sitemaps TO authenticated;
GRANT SELECT ON TABLE public.brand_site_sync_runs TO authenticated;
GRANT SELECT ON TABLE public.brand_site_catalog_entries TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.brand_site_sitemaps TO service_role;
-- UPDATE é necessário para a única transição permitida (running → terminal); o
-- gatilho recusa qualquer outra escrita, e DELETE não é concedido a ninguém.
GRANT SELECT, INSERT, UPDATE ON TABLE public.brand_site_sync_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.brand_site_catalog_entries TO service_role;

COMMIT;

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- As três tabelas contêm apenas dado novo desta frente; nenhum dado anterior
-- passa a viver aqui. O rollback não altera `marcas`, `minerador_keywords`,
-- `publication_records`, `editorial_artifact_versions` nem o estado local do
-- navegador, que permanece intacto durante toda a transição.
--
-- Objetos criados por esta migration, e apenas eles:
--   3 tabelas · 2 funções · 4 gatilhos · 3 policies
--   · 3 PRIMARY KEY · 5 UNIQUE · 3 índices explícitos
--   · 14 FOREIGN KEY (6 compostas nomeadas + 8 inline para marcas/auth.users)
--   · 23 CHECK
-- DROP TABLE remove, em cascata do próprio objeto, os gatilhos, policies,
-- constraints e índices daquela tabela. As duas funções são os únicos objetos
-- que sobrevivem a um DROP TABLE e por isso são derrubadas explicitamente.
--
-- BEGIN;
--   DROP TABLE IF EXISTS public.brand_site_catalog_entries;
--   ALTER TABLE public.brand_site_sitemaps
--     DROP CONSTRAINT IF EXISTS brand_site_sitemaps_last_successful_run_fkey;
--   DROP TABLE IF EXISTS public.brand_site_sync_runs;
--   DROP TABLE IF EXISTS public.brand_site_sitemaps;
--   DROP FUNCTION IF EXISTS public.brand_site_sync_run_guard();
--   DROP FUNCTION IF EXISTS public.brand_site_sitemap_last_known_good_guard();
-- COMMIT;
--
-- O rollback não toca marcas, minerador_keywords, publication_records,
-- editorial_artifact_versions, funções do pipeline reutilizadas
-- (pipeline_editorial_touch_updated_at, pipeline_editorial_touch_lock_version)
-- nem o estado local do navegador.
