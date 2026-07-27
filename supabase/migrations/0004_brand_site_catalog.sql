-- PROPOSTA PARA APLICAÇÃO MANUAL. NÃO APLICADA PELO CODEX.
-- Depende da 0002_operational_editorial_flow.sql e da função editorial_has_permission.
-- O fallback local da aba Site e Sitemap continua operacional sem este schema.

CREATE TABLE IF NOT EXISTS public.brand_site_sitemaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  url text NOT NULL,
  sitemap_type text NOT NULL CHECK (sitemap_type IN ('principal','sitemap_index','posts','paginas','produtos','categorias','outro')),
  parent_sitemap_id uuid REFERENCES public.brand_site_sitemaps(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('not_tested','testing','tested','syncing','synced','partial','error','disabled')),
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  url_count integer NOT NULL DEFAULT 0 CHECK (url_count >= 0),
  new_url_count integer NOT NULL DEFAULT 0 CHECK (new_url_count >= 0),
  updated_url_count integer NOT NULL DEFAULT 0 CHECK (updated_url_count >= 0),
  removed_url_count integer NOT NULL DEFAULT 0 CHECK (removed_url_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  last_valid_kind text CHECK (last_valid_kind IN ('urlset','sitemapindex')),
  last_valid_item_count integer NOT NULL DEFAULT 0 CHECK (last_valid_item_count >= 0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, url)
);

CREATE TABLE IF NOT EXISTS public.brand_site_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  sitemap_id uuid NOT NULL REFERENCES public.brand_site_sitemaps(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  found_count integer NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  new_count integer NOT NULL DEFAULT 0 CHECK (new_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brand_site_catalog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  source_sitemap_ids uuid[] NOT NULL DEFAULT '{}',
  discovered_url text NOT NULL,
  normalized_url text NOT NULL,
  resolved_url text,
  declared_canonical_url text,
  title text,
  h1 text,
  meta_description text,
  page_type text NOT NULL DEFAULT 'unknown' CHECK (page_type IN ('article','page','service','product','category','author','other','unknown')),
  indexability text NOT NULL DEFAULT 'unknown' CHECK (indexability IN ('unknown','indexable','noindex','blocked')),
  verification_status text NOT NULL DEFAULT 'discovered' CHECK (verification_status IN ('discovered','unverified','accessible','canonical_confirmed','canonical_missing','canonical_conflict','redirect','noindex','not_found','error','stale')),
  sitemap_lastmod timestamptz,
  first_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  import_status text NOT NULL DEFAULT 'not_imported' CHECK (import_status IN ('not_imported','selected','imported_as_legacy_content','keywords_sent','ignored','duplicate','conflict')),
  origin text NOT NULL DEFAULT 'sitemap' CHECK (origin IN ('sitemap','manual')),
  ignored_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marca_id, normalized_url)
);

CREATE TABLE IF NOT EXISTS public.brand_site_page_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  catalog_entry_id uuid NOT NULL REFERENCES public.brand_site_catalog_entries(id) ON DELETE RESTRICT,
  requested_url text NOT NULL,
  resolved_url text NOT NULL,
  http_status integer NOT NULL,
  content_type text NOT NULL,
  title text,
  h1 text,
  meta_description text,
  declared_canonical_url text,
  robots text,
  page_type text NOT NULL CHECK (page_type IN ('article','page','service','product','category','author','other','unknown')),
  indexability text NOT NULL CHECK (indexability IN ('unknown','indexable','noindex','blocked')),
  verification_status text NOT NULL CHECK (verification_status IN ('discovered','unverified','accessible','canonical_confirmed','canonical_missing','canonical_conflict','redirect','noindex','not_found','error','stale')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brand_site_keyword_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  catalog_entry_id uuid NOT NULL REFERENCES public.brand_site_catalog_entries(id) ON DELETE RESTRICT,
  text text NOT NULL,
  normalized_text text NOT NULL,
  source_url text NOT NULL,
  source_field text NOT NULL CHECK (source_field IN ('title','h1','slug','meta_description','heading','structured_data','other')),
  suggested_role text NOT NULL DEFAULT 'unclassified' CHECK (suggested_role IN ('possible_primary','possible_secondary','supporting_term','unclassified')),
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  extracted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','duplicate_batch','exists_in_minerador','selected','sent','ignored','error')),
  minerador_keyword_id uuid,
  import_batch_id uuid,
  sent_at timestamptz,
  original_text text NOT NULL,
  created_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_brand_site_keyword_candidates_brand_text ON public.brand_site_keyword_candidates(marca_id, normalized_text);

CREATE TABLE IF NOT EXISTS public.brand_site_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('keywords','legacy_content')),
  status text NOT NULL CHECK (status IN ('preview','importing','imported','partial','failed','rolled_back')),
  target_list_id uuid REFERENCES public.listas_kgr(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.brand_site_import_items (
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.brand_site_import_batches(id) ON DELETE RESTRICT,
  candidate_id uuid REFERENCES public.brand_site_keyword_candidates(id) ON DELETE RESTRICT,
  catalog_entry_id uuid REFERENCES public.brand_site_catalog_entries(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('selected','imported','already_exists','duplicate','ignored','failed','rolled_back')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (batch_id, candidate_id, catalog_entry_id)
);

CREATE TABLE IF NOT EXISTS public.brand_site_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_brand_site_events_brand_time ON public.brand_site_events(marca_id, occurred_at DESC);

ALTER TABLE public.brand_site_sitemaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_catalog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_page_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_keyword_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_site_events ENABLE ROW LEVEL SECURITY;

-- A leitura e escrita remotas só ficam disponíveis para a permissão Marca.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['brand_site_sitemaps','brand_site_sync_runs','brand_site_catalog_entries','brand_site_page_verifications','brand_site_keyword_candidates','brand_site_import_batches','brand_site_import_items','brand_site_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.editorial_has_permission(marca_id, ''marca'', ''view''))', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', table_name, table_name);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.editorial_has_permission(marca_id, ''marca'', ''edit''))', table_name, table_name);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_brand_site_sync_runs_append_only ON public.brand_site_sync_runs;
CREATE TRIGGER trg_brand_site_sync_runs_append_only BEFORE UPDATE OR DELETE ON public.brand_site_sync_runs FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only();
DROP TRIGGER IF EXISTS trg_brand_site_page_verifications_append_only ON public.brand_site_page_verifications;
CREATE TRIGGER trg_brand_site_page_verifications_append_only BEFORE UPDATE OR DELETE ON public.brand_site_page_verifications FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only();
DROP TRIGGER IF EXISTS trg_brand_site_events_append_only ON public.brand_site_events;
CREATE TRIGGER trg_brand_site_events_append_only BEFORE UPDATE OR DELETE ON public.brand_site_events FOR EACH ROW EXECUTE FUNCTION public.editorial_protect_append_only();
