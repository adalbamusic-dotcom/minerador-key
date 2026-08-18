# Master Refresh Decision Gates — Supabase

> **Decisão humana posterior:** `MASTER_REFRESH_HUMAN_DECISIONS = APPROVED`.
> As quatro Agencies e duas Brands foram confirmadas como homologação;
> `adalbapro@gmail.com` deve permanecer Admin global; o reset dos 22 Usage foi
> aprovado após export; e o DROP das seis tabelas `migration_backup` foi
> aprovado após reconfirmação imediata. `ALL_REFRESH_BLOCKERS_RESOLVED = YES`.

- **Projeto:** `hjjlntdpdgvpnazdztqw`
- **Baseline:** 2026-08-17
- **Módulo proprietário:** fundação global compartilhada
- **Modo:** diagnóstico remoto somente leitura e exports locais
- **Resultado técnico:** os quatro gates têm evidência suficiente para decisão humana; nenhum batch está autorizado

## 1. Tenants candidatos

### Agencies

| ID | Agency | Status | Owner | Memberships | Brands | Dados dependentes principais | Sinais observados |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1febb431-4e44-49e9-b8cd-12115f4ad999` | AdalbaFotos | active | Adal — `adalbafotos@gmail.com` | 1: owner, `agency_admin`, active | nenhuma | 1 convite, 1 onboarding, 1 access period, 4 grants, 4 bindings, 0 Usage | FREE/Public free trial; sem Brand; compatível com homologação, não prova descarte |
| `3cc14013-3296-4094-80de-712abc4ceae8` | AdalbaPro | active | adalbapro — `adalbapro@gmail.com` | 1: owner, `agency_admin`, active | Adalba, Care Glow | 2 vínculos de Brand, 1 access period, 4 grants, 4 bindings, 22 Usage | FREE/Platform internal; atividade recente e Usage em `production`; requer confirmação humana |
| `cd84f5ee-b939-4b05-afa4-52aabb8c9aa4` | AdaMusic | active | Adamus — `adalbamusic@gmail.com` | 1: owner, `agency_admin`, active | nenhuma | 1 convite, 1 onboarding, 1 access period, 4 grants, 4 bindings, 0 Usage | FREE/Admin trusted invite; sem Brand; compatível com homologação, não prova descarte |
| `ae851a64-5bff-449b-865c-ec6aa950be38` | AdaSEO | active | Cadsone — `scalbeto@gmail.com` | 1: owner, `agency_admin`, active | nenhuma | 1 convite, 1 onboarding, 1 access period, 4 grants, 4 bindings, 0 Usage | FREE/Admin trusted invite; sem Brand; compatível com homologação, não prova descarte |

### Brands

| ID | Brand | Status | Owner | Agency | Memberships | Dados dependentes principais | Sinais observados |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `f514a553-ce4a-472e-9aec-c3fecff375f1` | Adalba | active | adalbapro — `adalbapro@gmail.com` | AdalbaPro | 0 | 11 keywords, 19 runs, 708 candidates, 9 import batches, 14 origins, 183 current metrics, 3 metric history, 22 Usage | site configurado; BrandDNA ausente; atividade de 2026-08-14 a 2026-08-17; Usage marcado `production` |
| `033b0cde-6e00-472c-b9d6-3c10ad33ae61` | Care Glow | active | adalbapro — `adalbapro@gmail.com` | AdalbaPro | 0 | 6 keywords, 1 run, 6 candidates, 1 import batch, 6 origins, 0 métricas, 0 Usage | site configurado; BrandDNA ausente; uma execução em 2026-08-14; compatível com homologação |

`SAFE_TO_CONFIRM_AS_TEST = PARTIAL`: a topologia, os planos FREE, a ausência de BrandDNA e o volume concentrado em poucos dias são sinais de homologação. O catálogo não tem flag canônica de teste e os 22 Usage estão marcados `environment=production`; só o usuário pode confirmar que os seis tenants são descartáveis.

## 2. Identidade Admin global

O readback atual corrige o estado do manifesto anterior: `public.perfis` não está vazio. Há uma linha e ela pertence a `adalbapro@gmail.com` com `role=admin`.

| Nome | E-mail | Papel global em `public.perfis` | Vínculos relevantes |
| --- | --- | --- | --- |
| adalbapro | `adalbapro@gmail.com` | `admin` | owner/admin de AdalbaPro; owner de Adalba e Care Glow |
| Adal | `adalbafotos@gmail.com` | nenhum | owner/admin de AdalbaFotos |
| Adamus | `adalbamusic@gmail.com` | nenhum | owner/admin de AdaMusic |
| Cadsone | `scalbeto@gmail.com` | nenhum | owner/admin de AdaSEO |

`GLOBAL_ADMIN_CANDIDATE_PRIMARY = adalbapro <adalbapro@gmail.com>`. Não é necessário informar UUID manualmente. As quatro identidades Auth permanecem fora de qualquer reset; a escolha humana aqui confirma apenas qual delas deve conservar o papel global.

## 3. Usage append-only

- count remoto: **22**;
- fingerprint remoto completo: `ce3174ca2afe39b352ae704c6f96153c`;
- intervalo: `2026-08-16T00:03:10.548Z` a `2026-08-17T03:16:48.438Z`;
- tenant único: Agency AdalbaPro / Brand Adalba / 1 actor;
- DataForSEO: 7 sucessos, `module_operation`, Minerador, Connection;
- Google Ads: 4 falhas via Connection e 7 sucessos sem Connection, `module_operation`, Minerador;
- OpenRouter: 4 sucessos, `module_operation`, Minerador, Connection;
- todos os 22 eventos têm `environment=production`;
- referências: 3 providers, 3 capabilities, 3 Connections não nulas, 15 eventos com Connection e 7 sem Connection;
- sete FKs `ON DELETE RESTRICT` ligam Usage a Auth, Agency, Brand, provider, capability e Connection;
- trigger `trg_integration_usage_events_append_only_0024` impede UPDATE/DELETE; não há FK entrante para Usage.

O export local é um resumo sanitizado, com count e fingerprint do conjunto completo. Não contém IDs de requisição, idempotency keys, metadata values ou linhas brutas.

`USAGE_TEST_ONLY = UNCONFIRMED`. Recomendação atual: `PRESERVE`. Pode mudar para `RESET_DATA` somente após a declaração humana de que AdalbaPro e Adalba são homologação descartável e após um batch específico lidar explicitamente com o contrato append-only.

## 4. `migration_backup`

| Tabela | Rows | Fingerprint remoto | Export local |
| --- | ---: | --- | --- |
| `keywords_kgr_after_failed_0005_20260724` | 147 | `4ee7ae2d493302b1c931d61ce507cf84` | `keywords_kgr_after_failed_0005_20260724.jsonl` |
| `keywords_kgr_before_0005_20260724` | 147 | `f40807bb165f26961ecd43766d1b4d01` | `keywords_kgr_before_0005_20260724.jsonl` |
| `listas_kgr_before_0005_20260724` | 5 | `528c7c497898a3356b054728ffbf857d` | `listas_kgr_before_0005_20260724.jsonl` |
| `marcas_before_0005_20260724` | 1 | `2581e097fc9433204dfe990032518ce6` | `marcas_before_0005_20260724.jsonl` |
| `perfis_before_0005_20260724` | 1 | `adad261679f64bd820ba9dfab3fdeae2` | `perfis_before_0005_20260724.jsonl` |
| `policies_before_0005_20260724` | 2 | `f95208610ded30018af00f5db9340eac` | `policies_before_0005_20260724.jsonl` |

Total: **443 linhas**. Cada arquivo passou por parse JSONL, contagem local e SHA-256; os hashes estão no `export-manifest.json`. As duas cópias de 147 keywords não são idênticas: os fingerprints divergem.

Catálogo remoto: zero FKs de entrada, zero FKs de saída, zero triggers de usuário e zero dependências de functions/triggers/rewrite nas seis tabelas. Busca local: zero consumidores de runtime; existem apenas referências históricas em um script de snapshot, um teste de migration e documentação. Os nomes e essas referências confirmam a finalidade de recuperação da migration 0005 falha em 2026-07-24.

`MIGRATION_BACKUP_RECOMMENDATION = DROP`, condicionado à aprovação humana. O export já está pronto e verificável; nenhum DROP foi executado.

## 5. Artefatos locais

- `exports/master-refresh-gates-2026-08-17/export-manifest.json` — índice, contagens e hashes;
- `exports/master-refresh-gates-2026-08-17/usage-events-sanitized.json` — resumo verificável do Usage;
- seis arquivos JSONL — cópia integral das seis tabelas `migration_backup`.

O diretório de exports foi incluído no `.gitignore`, porque as cópias históricas podem conter dados tenantizados. Não deve ser commitado.

## 6. Saída canônica

```text
MASTER_REFRESH_DECISION_GATE = PASS

TENANTS_DECISION_READY = YES
ADMIN_IDENTITY_DECISION_READY = YES
USAGE_DECISION_READY = YES
MIGRATION_BACKUP_DECISION_READY = YES

TEST_AGENCIES = AdalbaFotos; AdalbaPro; AdaMusic; AdaSEO
TEST_BRANDS = Adalba; Care Glow
SAFE_TO_CONFIRM_AS_TEST = PARTIAL

GLOBAL_ADMIN_CANDIDATES = adalbapro <adalbapro@gmail.com> [admin atual]; Adal <adalbafotos@gmail.com>; Adamus <adalbamusic@gmail.com>; Cadsone <scalbeto@gmail.com>

USAGE_EVENTS_COUNT = 22
USAGE_TEST_ONLY = UNCONFIRMED
USAGE_EXPORT_READY = YES
USAGE_RECOMMENDATION = PRESERVE

MIGRATION_BACKUP_EXPORT_READY = YES
MIGRATION_BACKUP_ZERO_CONSUMERS = YES
MIGRATION_BACKUP_RECOMMENDATION = DROP, condicionado à aprovação humana

ALL_REFRESH_BLOCKERS_RESOLVED = NO

REMOTE_WRITES = 0
MIGRATIONS_APPLIED = 0
PROVIDER_CALLS = 0

NEXT_STEP = aguardar somente: (1) confirmação das 4 Agencies e 2 Brands como teste; (2) confirmação de adalbapro@gmail.com como Admin global; (3) decisão explícita sobre reset dos 22 Usage após export; (4) autorização para DROP das seis tabelas migration_backup após export verificado. Só então autorizar os batches do refresh.
```
