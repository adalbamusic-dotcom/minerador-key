# Revisao da migration 0005 de tenantizacao — 2026-07-24

> **Classificação atual — 2026-07-27:** proposta histórica/supersedida pelo resultado remoto posterior registrado em `docs/compartilhado/supabase.md`. Motivação, guards, rollback assistido e ordem operacional são preservados para proveniência; não reexecutar 0005 nem iniciar esta proposta como nova janela.

## Escopo e autorizacao

Infraestrutura compartilhada de tenantizacao e RLS. Esta proposta cobre apenas os tres artefatos SQL da 0005, testes estaticos e documentacao. Nenhum SQL remoto, migration aplicada, limpeza ou operacao de dados esta autorizado.

## Diagnostico

A migration local anterior era apenas uma proposta parcial: nao tinha `BEGIN/COMMIT`, nao criava `keywords_kgr.brand_id`, nao fazia backfill, nao tratava `lista_id` nullable, nao definia policies de `listas_kgr` e `keywords_kgr`, e assumia que `brand_memberships` ja existia. O dry-run consultava diretamente tabelas possivelmente ausentes e nao produzia um resultado de prontidao. O rollback removia apenas colunas auxiliares e podia apagar estrutura criada depois sem guardas.

O contrato local existente usa `marcas.id` como tenant, `listas_kgr.marca_id`, memberships legadas com `marca_id`/`user_key`/`role_id` e permissoes normalizadas em `brand_member_permissions`. A revisao preserva esses nomes por compatibilidade e adiciona `member_user_id` como identidade canonica; nao cria um segundo tenant.

## Decisoes

1. `keywords_kgr.brand_id` e obrigatorio depois do backfill; `lista_id` permanece nullable.
2. As keywords ligadas a lista herdam `listas_kgr.marca_id`; as keywords sem lista recebem explicitamente o tenant Adalba autorizado. Nenhum agrupamento e criado.
3. `listas_kgr.marca_id` passa a `NOT NULL` somente depois das validacoes.
4. `brand_memberships` e mantida compativel com o modelo legado quando ja existir; a chave canonica de usuario e `member_user_id`, com unicidade por `(marca_id, member_user_id)`. A coluna `user_key` permanece somente para compatibilidade de consumidores antigos.
5. O owner explicitamente autorizado e a marca Adalba `95bef1bb-0a3d-4218-a01f-ac7281c55e45` com usuario `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`. Nenhum outro owner e inferido.
6. A consistencia keyword/lista sera garantida por trigger no banco, alem de `brand_id` e `lista_id` opcionais/obrigatorios conforme o contrato.
7. Policies substitutas sao criadas antes da remocao das policies permissivas antigas, na mesma transacao.
8. Funcoes de autorizacao usam `SECURITY DEFINER` apenas nos predicados necessarios, `search_path` fixo e grants somente para `authenticated`.

## Impacto em consumidores

O Minerador e APIs legadas ainda gravam e leem `lista_id`/`marca_id` sem `brand_id` em alguns caminhos. Os pontos confirmados sao `modules/minerador/minerador-workspace.tsx` (imports em lote/manual, hidratacao, deduplicacao e movimentacao de lista), `app/api/marca/site/import/keywords/route.ts` e sua pre-visualizacao, e os fluxos de analise que fazem update por id. Esta proposta autoriza a compatibilizacao local desses consumidores e do helper compartilhado de autorizacao, sem alterar Arquiteto, Radar ou Planejador.

## Decisao de rollout dos consumidores

O contrato de aplicacao passa a assumir o schema pos-0005: toda leitura de `keywords_kgr` no Minerador deve filtrar `brand_id`, toda escrita deve enviar ou restringir `brand_id`, e toda lista deve ser validada por `listas_kgr.marca_id`. `lista_id` continua nullable; keyword sem lista continua pertencendo ao tenant pelo `brand_id`.

O codigo compatibilizado nao deve ser publicado nem executado contra um banco pre-0005, porque a coluna ainda nao existe. A ordem operacional obrigatoria e: (1) janela de manutencao para bloquear importacoes e mutacoes do Minerador; (2) snapshot e dry-run aprovados; (3) aplicacao controlada da migration 0005; (4) smoke test autenticado de leitura, importacao e movimentacao; (5) deploy/ativacao dos consumidores; (6) desbloqueio das mutacoes. Se migration e deploy forem feitos em janela diferente, o Minerador deve permanecer bloqueado entre as duas etapas. Nao sera criado fallback silencioso para schema antigo.

Consumidores fora do modulo proprietario permanecem somente auditados nesta rodada. `app/api/inteligencia/route.ts`, `app/api/editorial/serp/route.ts` e `modules/arquiteto/arquiteto-workspace.tsx` exigem rodada propria ou proposta conjunta antes de qualquer alteracao.

## Rollback e validacao

O rollback e assistido: remove somente objetos marcados pela 0005 e aborta se houver marcas, memberships ou keywords posteriores/incompativeis. A validacao local usa fixtures e analise estatica; o dry-run e somente leitura e foi desenhado para schema pre, parcial e pos-migration.

## Endurecimento final contra concorrencia

- `SET LOCAL lock_timeout = '10s'` e `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` ocorrem imediatamente depois de `BEGIN` para `marcas`, `perfis`, `listas_kgr` e `keywords_kgr`.
- O guard temporario `tenant_0005_keyword_list_guard` preserva exclusivamente `id` e `lista_id` antes do primeiro write. O snapshot nao inclui campos editoriais.
- A validacao final usa `FULL JOIN`, `IS DISTINCT FROM`, contagem total, contagem sem lista e contagem com lista. O hash deterministico permanece somente como diagnostico complementar.
- O backfill continua limitado a `brand_id`; `lista_id` nao aparece no lado esquerdo de `SET`, nao e agrupado e nao e preenchido por lista padrao.
- O dry-run e o snapshot manual permanecem somente leitura; os backups listados sao identificados e os backups de keywords sao comparados por fingerprint quando possuem a forma esperada.
- Rollback nao regrava `lista_id`, nao restaura linhas inteiras de keywords e aborta diante de dados posteriores ou incompativeis.
- O aplicativo deve permanecer encerrado durante a janela da migration. A migration ainda nao foi aplicada nem homologada remotamente.

## Estado apos validacao estrutural

A estrutura da 0005 foi confirmada no ambiente alvo, mas a validacao final de seguranca apontou execute para `anon`, fallback de e-mail vazio, modulo incorreto nas policies de listas e possiveis constraints duplicadas. A 0005 nao deve ser reexecutada. A reconciliacao foi separada para `0006_reconcile_tenant_security.sql`; nenhum dado operacional sera reprocessado.

## Estado

Preparado localmente, nao aplicado. A revisao humana dos tres SQL, o snapshot manual e a execucao controlada continuam pendentes.
