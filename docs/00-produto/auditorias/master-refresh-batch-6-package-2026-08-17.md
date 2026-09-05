# Master Refresh Batch 6 — Migration Backup + Confirmed Orphans

Módulo proprietário: fundação global / Supabase. Estado: preparado, não executado.

## DROP confirmado

Somente o schema histórico `migration_backup`, depois do DROP explícito e sem `CASCADE` de suas seis tabelas:

- `keywords_kgr_after_failed_0005_20260724`: 147;
- `keywords_kgr_before_0005_20260724`: 147;
- `listas_kgr_before_0005_20260724`: 5;
- `marcas_before_0005_20260724`: 1;
- `perfis_before_0005_20260724`: 1;
- `policies_before_0005_20260724`: 2.

Os seis valores por tabela somam **303**, total canônico confirmado. Todos os fingerprints remotos coincidem individualmente com o manifesto e os seis JSONL foram novamente abertos, parseados e conferidos por contagem e SHA-256. Owner das tabelas e schema: `postgres`; ACL explícita vazia. Dependências: zero FK de entrada/saída, zero view/materialized view, zero função, zero trigger, zero índice e zero constraint.

O total anterior de **443** foi rastreado ao commit documental `6706259f`: nesse mesmo commit, a tabela já registrava as seis contagens individuais que somam 303. O manifesto de exportação local repetiu o agregado incorreto, mas contém somente os mesmos seis arquivos e as mesmas contagens. Não existe snapshot, tabela ou export que sustente outras 140 linhas. A baseline e o blocker da migration foram corrigidos para 303 sem alterar os fingerprints individuais.

A busca local encontrou somente documentação, scripts/migrations históricos e um teste da migration 0005; nenhum consumidor de runtime.

## Órfãos públicos

Nenhum novo objeto em `public` atingiu os critérios de `DROP_CONFIRMED`. Os três objetos dinâmicos Google Ads e seu validator já estão ausentes. Não há índice inválido nem trigger desabilitado.

Preservados/bloqueados por prudência:

- `briefings_artigos`, `protect_published_briefing()` e `protect_published_lista()`: compatibilidade vigente e triggers ativos;
- `communication_templates`: catálogo canônico; apareceu somente por conter a substring `temp`;
- `agency_invitations.ck_agency_invitations_trusted_access_expiry_`: CHECK `NOT VALID`, mas pertence ao contrato ativo de convites e não é órfã; validação futura fica fora do Batch 6;
- funções sem consumidor local óbvio: preservadas quando RPC, trigger, helper canônico ou contrato histórico ainda não possui prova suficiente de morte.

Baseline não alvo: catálogo `public` com 1.368 definições, fingerprint `f058b86b56e6d99ab24dac967241c221`. DataForSEO, OpenRouter, Vault, Auth, perfis, providers, capabilities e quotas estão bound por contagem e fingerprint no post-verifier.

O preflight remoto bound foi repetido após a correção e retornou `PASS`: conjunto exato de seis tabelas, total 303, seis fingerprints, owners, ACL e dependências coincidentes; zero checks falharam.

`READY_FOR_BATCH_6_EXECUTION = YES`. A migration permanece não executada e exige autorização específica.
