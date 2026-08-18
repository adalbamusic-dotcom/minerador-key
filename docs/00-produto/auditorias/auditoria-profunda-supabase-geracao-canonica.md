# Auditoria profunda de Supabase — geração canônica

**Módulo proprietário:** documentação compartilhada
**Data:** 2026-08-06
**Modo:** auditoria documental e SQL somente leitura
**Execução remota nesta tarefa:** nenhuma

## Resultado executivo

O checkout contém migrations locais `0001`–`0014`, consumidores ainda híbridos e registros documentais/capturas de uma instalação remota anterior. Isso não prova o estado atual do banco. Antes de qualquer ação manual, a auditoria deve executar primeiro o catálogo e, somente para os objetos que ele confirmar, a integridade.

Foram separados os contratos canônicos que precisam ser preservados — keywords, discovery, ArticleDNA e demais artefatos versionados, documentos, snapshots, publicações e históricos — dos contratos de autorização, sessão e provider que ainda estão em transição. Nenhum dado ou tabela é candidato a exclusão nesta auditoria.

## Evidências, limites e ordem de execução

| Fonte | O que prova | O que não prova |
| --- | --- | --- |
| migrations e código locais | desenho esperado e consumidores atuais | aplicação de migration, RLS, grants ou dados remotos |
| `docs/compartilhado/supabase.md` | registro histórico de 0005/0006 | confirmação do catálogo nesta tarefa |
| capturas relatadas | indícios de marcas, memberships, agência e guard | estado atual, timestamps ou políticas efetivas |
| scripts desta auditoria | consultas seguras propostas | qualquer resultado remoto: não foram executados |

1. Executar [`auditoria-geracao-canonica-catalogo-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-catalogo-read-only.sql); ele não depende do ledger para terminar.
2. Confirmar a relação `supabase_migrations.schema_migrations` e a permissão de leitura.
3. Executar opcionalmente [`auditoria-geracao-canonica-ledger-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-ledger-read-only.sql), que retorna somente `version` e `name`.
4. Confirmar relations e colunas exigidas por cada seção de [`auditoria-geracao-canonica-integridade-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-integridade-read-only.sql).
5. Executar somente as seções compatíveis da integridade; não executar o arquivo inteiro se alguma relation ou coluna necessária não foi confirmada.

O arquivo [`auditoria-geracao-canonica-read-only.sql`](../../../supabase/scripts/auditoria-geracao-canonica-read-only.sql) é somente um índice e não duplica consultas.

## Arquitetura canônica aprovada

| Escopo | Identidade | Não pode ser usado como fallback final |
| --- | --- | --- |
| plataforma | `platform_admin` | membership de agência ou marca |
| agência | `agencyId` para operação, provider privado e consumo | tenant editorial |
| marca | `brandId = public.marcas.id` | e-mail, primeira marca ou slug isolado |
| ator | `actorUserId = auth.uid()` / `auth.users.id` | `user_key` textual ou estado local |
| rota | `brandRef = slug--brandId` | slug sem `brandId` |
| owner | `marcas.owner_user_id`, depois de a marca ser resolvida | mecanismo para resolver tenant |

Admin global não se torna agência; agência não se torna marca; owner não é tenant. `owner_user_id` não resolve tenant, não substitui `brandId` e não pode selecionar uma marca. Depois da resolução canônica por `brandRef`/`brandId`, ele é relação válida de autorização do owner; membership ativa continua autorizando colaboradores. O runtime final não terá fallback por e-mail, `perfis.marca_id`, `brandUserId`, primeira marca, slug isolado, contrato anterior ou vínculo de outra agência.

## Linhagem de migrations, scripts e objetos fora do ledger

| Faixa | Evidência local | Classificação | Confirmação manual necessária |
| --- | --- | --- | --- |
| `0001` | proteção de publicados por triggers/funções | HISTÓRICO IMUTÁVEL | triggers, dependências e grants efetivos |
| `0002` | workflow, versão, publicação, convite e permissões originalmente textuais | LEGADO ATIVO A MIGRAR | tabelas canônicas preservadas; autorização por `user_key` separada para migração |
| `0003`–`0004` | snapshots SERP e catálogo Site/Sitemap por marca | CANÔNICO DA NOVA GERAÇÃO | FKs, RLS e relações de marca |
| `0005`–`0006` | tenant UUID, owner UUID, membership UUID, RLS e FK `RESTRICT` | HISTÓRICO IMUTÁVEL | ledger, constraints, funções, policies, grants e guard |
| `0007`–`0013` | métricas, discovery, importação e histórico do Minerador | CANÔNICO DA NOVA GERAÇÃO | ledger, RLS, FKs e isolamento por marca |
| `0014` | implementação local da fundação canônica agência–marca | RISCO NÃO CONFIRMADO — FUNDAÇÃO CANÔNICA NÃO HOMOLOGADA | relação, índice parcial, RLS, policies, grants e bootstrap |
| scripts de bootstrap/demote/snapshot | materiais operacionais fora das migrations | TRANSIÇÃO TEMPORÁRIA | classificar leitura/mutação antes do uso |

O catálogo não consulta o ledger. Depois de confirmar relação e permissão, o ledger opcional compara objetos esperados sem supor que a existência do arquivo local demonstre instalação. Ele retorna apenas `version` e `name`; não retorna `statements` nem pressupõe `inserted_at`.

## Owner e membership

O contrato desta auditoria não consulta `brand_memberships.role`. Papel de owner é determinado somente por:

`brand_memberships.role_id → brand_roles.id → brand_roles.slug = 'owner'`.

A reconciliação inicia em `public.marcas` com `LEFT JOIN`; por isso inclui marcas sem owner ou sem qualquer membership. Ela retorna somente contagens agregadas para:

- marca sem `owner_user_id`;
- owner inexistente em `auth.users`;
- owner com membership owner ativa correspondente;
- owner com membership owner inativa correspondente;
- owner sem membership owner ativa;
- membership owner ativa ou inativa de ator diferente de `owner_user_id`;
- grupos e linhas duplicadas de membership owner ativa;
- linhas owner inativas/históricas;
- memberships potencialmente redundantes;
- grupos/linhas duplicados por marca e ator;
- divergência agregada entre `user_key` e e-mail de `auth.users` ligado por `member_user_id`.

Nenhuma consulta imprime e-mail. Membership inativa não é autorização vigente. Uma ausência de membership owner ativa não viola, por si só, o contrato futuro: `owner_user_id` permanece relação canônica distinta da autorização de colaboradores por membership ativa. A conclusão sobre redundância depende do resultado, do propósito de `brand_roles` e do fluxo de convite, não apenas de contagem.

## Inventário e classificação por entidade/contrato

O catálogo fornece o inventário exaustivo de relations públicas. A classificação não trata uma tabela editorial inteira como temporária apenas porque sua autorização será modernizada.

| Entidade, coluna ou contrato | Consumidores observados | Classificação |
| --- | --- | --- |
| `marcas.id` como `brandId`, keywords, listas e métricas | Admin, Marca, Minerador, Arquiteto e contexto tenant | CANÔNICO DA NOVA GERAÇÃO |
| ArticleDNA, SiloDNA, SiloPage, versões, hashes, eventos, documentos e publicações | Arquiteto, Radar, Planejador, Redator, Publicações e repositórios editoriais | CANÔNICO DA NOVA GERAÇÃO |
| snapshots SERP, discovery, importação, métricas atuais e histórico | Radar e Minerador | CANÔNICO DA NOVA GERAÇÃO |
| `brand_memberships.member_user_id` e FKs UUID | `tenant-context`, provisionamento e autorização | CANÔNICO DA NOVA GERAÇÃO |
| `brand_memberships.user_key`, `perfis.marca_id`, `brandUserId`, `ADMIN_EMAIL` e bootstrap automático de Admin em marca | autorização, contexto e editorial | LEGADO ATIVO A MIGRAR |
| NextAuth como ponte de sessão e `session.accessToken` para Supabase | authz, browser e rotas legadas | TRANSIÇÃO TEMPORÁRIA |
| `brand_roles.marca_id IS NULL` | provisionamento e autorização editorial | RISCO NÃO CONFIRMADO |
| `tenant_0005_migration_guard` | migrations, rollback e testes; nenhum runtime localizado por esta leitura | RISCO NÃO CONFIRMADO — ARTEFATO HISTÓRICO DE MIGRATION |
| Agency, AgencyMembership e AgencyBrand como conceitos de domínio | `agency-context`, `agency-admin`, Admin | CANÔNICO DA NOVA GERAÇÃO |
| implementação atual de `agencies`, `agency_memberships`, `agency_brands` e regras 0014 | migration 0014 e consumidores locais | RISCO NÃO CONFIRMADO — FUNDAÇÃO CANÔNICA NÃO HOMOLOGADA |

Para `brand_roles.marca_id IS NULL`, a auditoria deve confirmar finalidade do catálogo global, consumidores, interpretação do nulo e separação futura de papéis de plataforma, agência e marca. Não é legado confirmado antes dessa prova.

Para o guard 0005, a decisão futura deve auditar RLS, grants, consumidores, necessidade real de rollback, retenção e eventual exportação/remoção. A auditoria não autoriza exclusão e não declara retenção permanente.

## Agência, integridade e segurança de catálogo

O catálogo audita relations, colunas, constraints, FKs e ações, índices, RLS/force-RLS, policies, grants de tabelas/colunas/sequences, default privileges, views e `security_invoker`, ACL real de funções para `PUBLIC`, execução para `anon`/`authenticated` apenas se esses roles existirem, `SECURITY DEFINER` e respectivo `search_path`, triggers e dependências. Não retorna `p.proconfig` completo.

As expressões brutas `qual` e `with_check` de policies permanecem na saída para inspeção local. Elas podem conter literais sensíveis; o resultado não deve ser compartilhado sem sanitização humana prévia.

A integridade só é executada após confirmação das relations necessárias. Ela cobre estados e duplicidades de `agency_memberships`, FKs de agência, mais de uma agência ativa por marca, isolamento de listas/keywords e órfãos de artefatos/editoriais/providers. IDs técnicos podem aparecer somente em listas de duplicidade; e-mails e segredos não aparecem.

As capturas que indicam agência vazia, duas marcas, memberships textuais ou guard `UNRESTRICTED` permanecem **RISCO NÃO CONFIRMADO** até o resultado do catálogo.

## Providers e direção arquitetônica

| Integração | Direção aprovada | Classificação |
| --- | --- | --- |
| Google Ads por marca | contrato atual de configuração/métricas por `brand_id` | LEGADO ATIVO A MIGRAR |
| Google Ads global da plataforma | capacidade técnica global do destino arquitetônico | CANÔNICO DA NOVA GERAÇÃO |
| DataForSEO por env | contrato atual server-side por variável de ambiente | LEGADO ATIVO A MIGRAR |
| DataForSEO por agência | conexão privada, autorização e consumo por agência | CANÔNICO DA NOVA GERAÇÃO |
| Serper | remover depois de paridade DataForSEO; não será fallback no runtime final | LEGADO ATIVO A REMOVER |
| RapidAPI | eliminar após seu gate de paridade e corte | LEGADO ATIVO A REMOVER |
| Extensão | eliminar após o gate próprio de ingestão autenticada e paridade | LEGADO ATIVO A REMOVER |

Essa direção já é arquiteturalmente aprovada: não há decisão pendente entre DataForSEO e Serper. A auditoria não lê variáveis de ambiente, Vault, Edge Function secrets, tokens, prompts ou credenciais; apenas inventaria, por nome e tipo, colunas potencialmente sensíveis quando existirem.

## Zero legado e gates de remoção

Dupla leitura e dupla escrita são permitidas somente dentro de janela de migração explicitamente aprovada. Cada compatibilidade temporária deve ter owner, gate de entrada, evidência de paridade, tarefa de remoção e rollback delimitado.

Antes do corte:

1. confirmar catálogo e integridade remotos por consultas somente leitura;
2. mapear consumidores de código, rota, env, teste, fixture, mensagem e documento;
3. criar contrato sucessor e migration aditiva autorizada;
4. executar backfill/reconciliação verificável e medir uso da compatibilidade;
5. validar RLS, grants, sessão autenticada e isolamento plataforma–agência–marca;
6. retirar compatibilidade e remover também código, rotas, envs, testes, fixtures, mensagens e documentos antigos.

O runtime final não pode manter fallback para contratos anteriores. Histórico, versões, hashes, eventos, DNAs, snapshots, discovery, documentos, publicações, keywords e demais dados canônicos permanecem preservados durante e após o corte.

## Conclusão

**Verificado localmente:** a aplicação contém tanto o contrato canônico de marca/ator UUID quanto compatibilidades de sessão, permissionamento e provider; 0014 não cria conexão de provider por agência.

**Ainda não verificado:** ledger remoto, schema, dados, RLS, policies, grants, views, funções, triggers, índices, FKs, states de agência, guard 0005 e execução autenticada. Nenhuma operação remota foi realizada nesta tarefa.
