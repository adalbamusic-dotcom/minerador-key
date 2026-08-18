# Plano de implementação — geração canônica

- **Status:** implementação controlada local aprovada — não autoriza aplicação de migration, SQL remoto, provider, env, commit ou deploy.
- **Data:** 2026-08-06
- **SDDs de referência:** [identidade, acesso e tenantização](sdd-geracao-canonica-identidade-tenant.md) e [integrações de plataforma, agência e marca](sdd-arquitetura-integracoes-plataforma-agencia-marca.md).
- **Princípio:** o plano conecta o estado local auditado à arquitetura aprovada. Não confirma schema, RLS, dados, grants, funções ou constraints remotos.

## 1. Objetivo e limites

Levar o monólito para a identidade UUID, tenant `brandId`, ownership direto, agência canônica e integrações por conexão/capability/grant/binding, preservando dados editoriais, DNAs, versões, hashes, eventos, publicações e histórico.

O plano autoriza preparação local aditiva revisável. Não autoriza acesso ao Supabase remoto, rotação de segredo, chamada de provider, mudança de env, limpeza ou aplicação de migration nesta etapa. Migrations `0002`, `0005`, `0006` e `0014` permanecem históricas e não são reexecutadas nem apagadas.

## 2. Pré-condições

- aprovação explícita da fase e dos arquivos consumidores antes de cada implementação;
- checkout identificado e stage preservado;
- snapshot somente leitura de schema, dados, RLS, grants, funções, triggers, envs inventariados sem expor segredo e estado de uso;
- inventário versionado de contratos, consumidores, provider, roteamento e compatibilidades;
- plano de rollback, responsáveis humanos e janela operacional aprovados;
- fixtures sem chamadas pagas e smoke manual autorizado antes de qualquer corte.

## 3. Estado remoto ainda a confirmar

Os itens abaixo devem ser tratados como **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO REMOTO** antes de qualquer migration ou corte:

- colunas, tipos, índices, FKs, constraints parciais, defaults e dados de `marcas`, `perfis`, memberships, papéis e grants;
- existência e semântica efetiva de policies, grants SQL, funções, triggers e `SECURITY DEFINER` das migrations `0002`, `0005`, `0006` e `0014`;
- vínculo ativo de agência por marca, inclusive a constraint de uma agência `active` por `brand_id` declarada localmente em `0014`;
- catálogo, RLS, dados e homologação remota de `agencies`, `agency_memberships` e `agency_brands`;
- credenciais operacionais existentes, owner, expiração, custo e uso, sem ler segredo em logs ou documentação;
- referências ativas a NextAuth, `ADMIN_EMAIL`, chaves textuais, providers, Serper, RapidAPI e Extensão;
- possibilidade de backup restaurável, janela de rollback e contas humanas para smoke autorizado.

## 4. Inventário dos contratos atuais

| Área | Contrato atual auditado localmente | Contrato sucessor aprovado |
| --- | --- | --- |
| Identidade | `auth.users`, e-mail/chaves textuais e campos UUID convivem | `auth.users.id` como identidade técnica única |
| Sessão | NextAuth, JWT, `SessionProvider` e token Google no JWT ainda têm consumidores | Supabase SSR, `auth.getUser()` server-side e uma sessão única |
| Tenant e owner | `marcas.id`/`owner_user_id` coexistem com aliases, membership owner e `perfis.marca_id` | `brandId = marcas.id`; owner só por `marcas.owner_user_id` |
| Colaboração | `user_key`, `member_user_id`, role owner e grants legados | membership UUID ativa, papéis globais e grants explícitos |
| Agência | fundação local `0014`; homologação remota pendente | owner direto, memberships de agência e um vínculo ativo por marca |
| Integrações | credenciais operacionais dispersas/envs legados | connections, capabilities, grants, bindings e usage events sanitizados |
| Providers antigos | referências devem ser auditadas | Serper/RapidAPI fora da arquitetura; Extensão com estado próprio |

## 5. Schema sucessor proposto

O schema sucessor é conceitual e será detalhado somente após catálogo remoto, SDD de fase e autorização humana:

- identidade UUID, `perfis` global, owner direto, memberships UUID e papéis globais de marca;
- agência com `agencies.owner_user_id`, memberships `agency_admin`/`agency_member`, vínculo ativo de marca e `agency_brand_transfers`;
- `integration_providers`, `integration_connections`, `integration_capabilities`, `integration_grants`, `integration_bindings` e `integration_usage_events`;
- lifecycle separado de environment: `lifecycle_status` em `draft`, `validating`, `active`, `failed`, `suspended` ou `revoked`; `environment` em `test`, `homologation` ou `production`;
- bindings com `target_scope_type` e `target_scope_id`, sem fallback; eventos de uso com `operation_kind` e regra explícita de `brand_id`.

## 6. Matrizes de transição

### 6.1 Entidade atual → entidade canônica

| Atual | Sucessora | Regra |
| --- | --- | --- |
| `auth.users` e identificadores textuais | `auth.users.id` | UUID comprovado; e-mail não autoriza |
| `perfis` com `marca_id` legado | `perfis` global | perfil não seleciona tenant |
| membership owner/plataforma automática | `marcas.owner_user_id` e `perfis.role` | classificar antes de remover duplicidade |
| `brand_memberships` legado | membership UUID de collaborator | sem owner e sem chave textual |
| `brand_roles` por marca | catálogo global de papéis | sem `owner`/`platform_admin` |
| `agency_brands` atual | vínculo operacional e transferível | uma agência `active` por marca, **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO REMOTO** |
| env/provider disperso | connections/capabilities/grants/bindings | segredo fora de leitura comum |

### 6.2 Coluna atual → coluna sucessora

| Atual | Sucessora | Condição de backfill |
| --- | --- | --- |
| `user_key` | UUID de usuário referenciado | somente correspondência comprovada |
| `member_user_id` | `member_user_id` | única relação UUID canônica; não criar `user_id` concorrente |
| `perfis.marca_id` | nenhuma coluna substituta | nunca infere owner/membership |
| role `owner` em membership | `marcas.owner_user_id` | owner comprovado e snapshot aprovado |
| papel `platform_admin` em marca | `perfis.role='admin'` | sem membership implícita |
| segredo em env operacional | material cifrado da connection | inventário e rotação autorizados |
| estado único de integração | `lifecycle_status` + `environment` | sem promover teste a produção |

### 6.3 Consumidor atual → contrato sucessor

| Consumidor atual | Contrato sucessor |
| --- | --- |
| `SessionProvider`, JWT e helpers NextAuth | cliente/servidor Supabase SSR e `auth.getUser()` |
| `requireSessionProfile` e layouts/handlers privados | autorização UUID e tenant resolvido estritamente |
| `authz.ts`/contexts com e-mail ou chave textual | owner, membership ativa e grants UUID |
| Admin e contexto de agência | Admin estrutural e agencyRef estrito |
| Minerador, Arquiteto, Radar, Planejador, Redator e Publicações | `brandId` resolvido e capability/binding explícito quando aplicável |
| chamadas de provider dispersas | resolvedor central server-side e usage events |

### 6.4 Policy atual → policy sucessora

| Policy/função atual | Policy/função sucessora | Confirmação necessária |
| --- | --- | --- |
| `editorial_current_user_key()` | `editorial_current_user_id()` | **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO REMOTO** |
| `editorial_has_permission()` textual | autorização UUID por tenant | **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO REMOTO** |
| policies com `member_user_id`/owner role | owner direto, membership ativa e grants UUID | inventário de dependências |
| autorização por `ADMIN_EMAIL` | `perfis.role='admin'` | último Admin e recuperação humana |
| RLS de agência/local `0014` | RLS de owner, membership e vínculo ativo | catálogo e smoke remoto |
| RLS de integrações inexistente/não confirmado | escopo connection/grant/binding/usage | nova SDD de fase e revisão de segurança |

## 7. Ordem das migrations

Ordem proposta, sem SQL nesta tarefa: migrations aditivas de identidade/owner; agência e transferência; fundação de integrações; conexões por escopo; resolvedor e usage; consumidores; corte; limpeza posterior. Cada migration será nova, pequena, reversível quando possível, precedida de catálogo/snapshot e acompanhada de migration de rollback aprovada. Nenhuma migration histórica será editada, apagada ou reexecutada.

## 8. Estratégia de backfill

Backfill é somente aditivo, por lote reversível e com relatório de linhas elegíveis, ambíguas, rejeitadas e preservadas. Relações são preenchidas apenas por UUID existente e comprovado. Dados ambíguos, owner ausente, mais de uma agência ativa, papel desconhecido, segredo sem owner, binding sem destino ou consumo sem correlação bloqueiam a respectiva fase. Dados editoriais históricos nunca são reescritos para “corrigir” autorização.

## 9. RLS e autorização

Servidor e RLS validam o mesmo UUID. `can_access_brand` abrange somente owner da marca resolvida ou membership ativa autorizada; Admin global não ganha acesso editorial normal. `agencyRef` é `slug--agencyId`, resolvido por UUID, slug confirmado e ator autorizado, sem fallback. Suporte global futuro é temporário, motivado, auditado, visível e revogável, fora da autorização normal. Toda policy/função/grant concreto permanece **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO REMOTO** até auditoria autorizada.

## 10. Integrações

- **Connections:** owner exclusivo `platform`, `agency` ou `brand`, segredo cifrado, lifecycle/environment independentes e leitura sanitizada.
- **Capabilities:** permitem uso por módulo, modelo, ambiente e limite; novos providers/capabilities exigem proposta modular aprovada.
- **Grants:** compartilham conexão sem copiar segredo; Google Ads/OpenRouter podem usar política global aprovada; DataForSEO global é seletivo.
- **Bindings:** destinam-se a agência ou marca, escolhem origem explicitamente e não fazem fallback. Marca não usa connection de agência diferente da ativa.
- **Usage events:** registram conexão, source scope, ator, capability, módulo, ambiente, quantidade, custo e status. `brand_id` é obrigatório em `module_operation`; somente testes/health/admin validation podem ser sem marca e jamais criam dado editorial.

## 11. Transferência de marca

`agency_brand_transfers` é o registro conceitual de solicitação, aceite, aprovação, agenda, execução, validação, falha e rollback. Solicita o brand owner ou admin autorizado da origem; aceita owner/admin autorizado do destino; confirma o brand owner. Destino não recebe acesso editorial antes do corte; token não concede acesso, expira/é de uso único e é invalidado ao concluir. Falha restaura vínculo anterior. Nunca há duas agências `active`. Admin global só participa por recuperação, fraude, disputa ou suporte explicitamente autorizado.

## 12. Corte do NextAuth

O corte só inicia após a identidade UUID, perfis globais, autorização server-side e smoke de tenant estarem aprovados. Inventariar rota, callbacks, cookies, `SessionProvider`, JWT, tipos, variáveis, `requireSessionProfile`, contexts, layouts, APIs, testes e o dependente Google Sheets. Substituir por Supabase SSR antes de remover qualquer parte. Nenhum login, token Google ou consumidor remanescente é descartado sem decisão específica e rollback validado.

## 13. Corte dos providers antigos

Serper e RapidAPI já estão fora da arquitetura. Não têm migration, provider transitório, fallback ou gate de paridade. A única condição é prova de ausência em código, rotas, envs, testes, mocks, fixtures, tipos, mensagens, interfaces e documentação ativa. A Extensão tem estado, inventário e gate próprios; não é agrupada a Serper/RapidAPI.

## 14. Limpeza destrutiva

Somente após snapshot novo, migração aditiva validada, dupla leitura/escrita autorizada quando necessária, smoke completo e janela de rollback. Remoções potenciais incluem chaves textuais, aliases, membership owner redundante, `perfis.marca_id`, roles legados, NextAuth e adaptadores superados. Cada remoção exige prova de nenhum consumidor, dados reconciliados, backup restaurável e autorização humana específica.

## 15. Rollback

Antes de limpeza, rollback é desativar o consumidor novo, restaurar a versão anterior e reverter apenas migration sucessora com plano testado, preservando dados já backfilled. Durante transferência, rollback restaura o vínculo anterior. Após limpeza, rollback depende de backup conferido e migration reversa própria; não usa reexecução de migration histórica, `git reset` ou limpeza de dados.

## 16. Testes automatizados

Por fase: fixtures autorizadas/negadas, UUID e tenant divergentes, owner sem membership, collaborator ativo/suspenso, agência sem acesso editorial, uma agência ativa, grants/bindings sem fallback, segredo ausente de respostas/logs, lifecycle/environment, `operation_kind`, transferência e rollback. TypeScript, lint, build e testes unitários são evidência técnica parcial; não provam persistência, RLS remota, integração autenticada ou browser real.

## 17. Smoke manual

Validar manualmente login/logout, Admin estrutural, owner e collaborator de duas marcas, usuário sem marca, membro de agência sem acesso editorial, deep links por brandRef/agencyRef, bloqueio cross-tenant, transferências autorizadas/negadas, bindings por escopo, testes administrativos sem `brandId`, operação de módulo com `brandId`, persistência, versões, publicações e ausência de segredo na interface. Providers reais só são testados com autorização explícita e custo conhecido.

## 18. Prova de zero legado

Prova documental e técnica, não apenas build: nenhuma referência ativa a e-mail como autorização, `ADMIN_EMAIL`, `user_key`, owner role, membership owner automática, `perfis.marca_id`, sessão NextAuth, Serper ou RapidAPI. `member_user_id` permanece como a única relação UUID canônica de collaborator. A busca cobre código, rotas, envs, testes, mocks, fixtures, tipos, mensagens, interfaces e documentos ativos. Migrations históricas, snapshots e dados editoriais permanecem preservados como histórico.

## 19. Operações que o usuário deverá executar manualmente

- autorizar auditoria do catálogo remoto e fornecer o método seguro de leitura;
- gerar/conferir snapshots e backup restaurável fora do Git;
- aprovar migrations novas e rollbacks antes de execução;
- executar migrations/SQL remotos aprovados, rotação de credenciais e configuração de env/deployment quando houver tarefa específica;
- realizar smoke autenticado, provider real autorizado, verificação RLS e validação visual;
- aprovar cada corte, limpeza, commit, push e deploy em tarefas separadas.

## 20. Bloqueadores e decisões pendentes

- catálogo remoto, RLS, grants, funções, constraints e dados de agência ainda não confirmados;
- owner e armazenamento da chave de criptografia, retenção e rotação de connections/grants/usage;
- limites, modelos e custo por capability/ambiente, incluindo OpenRouter;
- política final de conexão própria de Google Ads por agência;
- permissionamento delegável de binding/WordPress/IA para collaborator;
- destino do consumidor Google Sheets ligado a NextAuth;
- aprovação da interface e do mecanismo de suporte global temporário;
- classificação de dados ambíguos e janela de corte/rollback.

## Fases de execução futura

Cada fase abaixo requer SDD de execução, arquivos autorizados, revisão de consumidores e aprovação humana antes de mudar estado.

### Fase 0 — auditoria e snapshot

- **Pré-condições:** acesso de leitura autorizado e escopo de catálogo definido.
- **Áreas consumidoras:** schema, dados, RLS, funções, triggers, grants, envs inventariados e módulos afetados.
- **Schema/mudança aditiva:** nenhum; produzir inventário e snapshot somente leitura.
- **Dados/backfill:** classificar UUIDs, owners, memberships, agências, secrets por metadado e conflitos.
- **RLS/riscos:** não alterar RLS; risco de assumir estado remoto não confirmado.
- **Rollback/testes/smoke:** snapshot verificável; smoke somente leitura autorizado.
- **Operação manual/gate:** usuário executa auditoria/backup; avança somente com catálogo confirmado e backup restaurável.

### Fase 1 — identidade UUID e owners

- **Pré-condições:** Fase 0 aprovada; ambiguidades de owner classificadas.
- **Áreas consumidoras:** Auth, perfis, memberships, roles, handlers, layouts e contexts.
- **Schema/mudança aditiva:** colunas UUID sucessoras, perfil global e funções/policies paralelas, conforme SDD futura.
- **Dados/backfill:** preencher apenas UUID comprovado; `perfis.marca_id` nunca cria relação.
- **RLS/riscos:** owner direto e membership ativa; risco de perda de acesso ou duplicidade.
- **Rollback/testes/smoke:** migration reversa, testes owner/collaborator/Admin e smoke cross-tenant.
- **Operação manual/gate:** usuário valida RLS e identidades reais; avança com acesso normal/negado confirmado.

### Fase 2 — agência e transferência

- **Pré-condições:** Fase 1 estável; `0014` e catálogo remoto confirmados.
- **Áreas consumidoras:** agência, Admin, contexto de agência, vínculos de marca e transferência.
- **Schema/mudança aditiva:** owner direto, roles, vínculo ativo e transferência somente se houver lacuna comprovada.
- **Dados/backfill:** reconciliar uma agência ativa por marca e classificar exceções.
- **RLS/riscos:** agência não concede editorial; risco de duas agências ou acesso pré-corte.
- **Rollback/testes/smoke:** restaurar vínculo anterior; teste de token e fluxo negado/autorizado.
- **Operação manual/gate:** usuário aprova transferência piloto; avança com rollback testado e isolamento confirmado.

### Fase 3 — fundação geral de integrações

- **Pré-condições:** owners/escopos confirmados e política de criptografia aprovada.
- **Áreas consumidoras:** Admin, Agência, Marca, resolvedor server-side e auditoria.
- **Schema/mudança aditiva:** catálogo de provider/capability/connections/grants/bindings/usage, sem provider real.
- **Dados/backfill:** inventário de metadados; segredo não é copiado por suposição.
- **RLS/riscos:** segredo nunca legível; risco de exposição em log/GET.
- **Rollback/testes/smoke:** estruturas vazias reversíveis, fixture sanitizada e inspeção de respostas.
- **Operação manual/gate:** usuário aprova chave/retention; avança sem segredo exposto e com RLS revisada.

### Fase 4 — conexões globais da plataforma

- **Pré-condições:** Fase 3 homologada e capabilities/limites aprovados.
- **Áreas consumidoras:** `/admin/integracoes` futuro, Admin estrutural e grants globais.
- **Schema/mudança aditiva:** connections `platform`, grants e lifecycle/environment.
- **Dados/backfill:** registrar somente conexão operacional autorizada e metadados sanitizados.
- **RLS/riscos:** Admin administra disponibilidade, não binding normal de marca.
- **Rollback/testes/smoke:** revogação/binding indisponível e teste administrativo sem marca.
- **Operação manual/gate:** usuário cadastra/testa credencial quando autorizado; avança com custo/uso e revogação verificados.

### Fase 5 — conexões próprias de agência

- **Pré-condições:** Fase 2/3 aprovadas e agência ativa resolvida estritamente.
- **Áreas consumidoras:** superfície futura da agência, grants para marcas e usage agregado.
- **Schema/mudança aditiva:** connections `agency`, agency binding e grants seletivos.
- **Dados/backfill:** connection recebe owner e agencyId comprovados.
- **RLS/riscos:** risco de usar agency diferente da ativa; negar cross-agency.
- **Rollback/testes/smoke:** binding `unavailable`, revogação e testes por agência sem dado editorial.
- **Operação manual/gate:** usuário valida admin autorizado; avança após isolamento de duas agências.

### Fase 6 — conexões próprias de marca

- **Pré-condições:** Fase 1/3 aprovadas e brandId/owner validados.
- **Áreas consumidoras:** Marca, WordPress/site/sitemap e bindings de marca.
- **Schema/mudança aditiva:** connections `brand` e bindings `brand_owned` autorizados.
- **Dados/backfill:** mapear somente credenciais com owner e marca comprovados.
- **RLS/riscos:** collaborator só por permissão; segredo não entra em BrandDNA.
- **Rollback/testes/smoke:** revogar binding, testar WordPress sem publicar e validar ausência de segredo.
- **Operação manual/gate:** usuário homologa marca piloto; avança sem alteração de conteúdo publicado.

### Fase 7 — resolvedor central e usage events

- **Pré-condições:** Fases 3–6 e contratos de capability aprovados.
- **Áreas consumidoras:** handlers server-side de módulos autorizados.
- **Schema/mudança aditiva:** resolvedor e eventos append-only; `operation_kind`, lifecycle/environment e correlação sanitizada.
- **Dados/backfill:** não reescrever consumo histórico; agregar somente eventos novos confirmados.
- **RLS/riscos:** sem fallback; `brandId` obrigatório em módulo e nulo apenas em operações administrativas previstas.
- **Rollback/testes/smoke:** origem indisponível, custo, retry e evento sanitizado.
- **Operação manual/gate:** usuário revisa uso/custo; avança com operação por marca e teste sem marca distintos.

### Fase 8 — migração dos consumidores

- **Pré-condições:** resolvedor, UUID, RLS e contratos de cada módulo aprovados.
- **Áreas consumidoras:** Minerador, Arquiteto, Radar, Planejador, Redator, Publicações, Marca, Admin e Extensão quando aplicável.
- **Schema/mudança aditiva:** adaptadores compatíveis por capability; nenhum módulo importa entidades internas de outro.
- **Dados/backfill:** preservar DNAs, artigos, publicações, eventos e proveniência.
- **RLS/riscos:** tenant e origem escolhida coerentes; risco de regressão operacional.
- **Rollback/testes/smoke:** regressão de consumidor, fixture e smoke de módulo autorizado.
- **Operação manual/gate:** usuário homologa módulo a módulo; avança somente sem consumo de contrato antigo.

### Fase 9 — corte do NextAuth e contratos antigos

- **Pré-condições:** Fases 1/8 completas e todos os consumidores NextAuth mapeados/substituídos.
- **Áreas consumidoras:** rota, callbacks, cookies, providers, JWT, APIs, contexts, testes e Google Sheets.
- **Schema/mudança aditiva:** nenhuma remoção até substituto Supabase SSR validado.
- **Dados/backfill:** sessões antigas expiram conforme janela aprovada; dados editoriais não mudam.
- **RLS/riscos:** não manter sessão dupla; risco de login/bloqueio indevido.
- **Rollback/testes/smoke:** rollback de aplicação, login/logout/callback e acesso tenant real.
- **Operação manual/gate:** usuário valida browser autenticado; avança com prova de nenhum consumidor ativo.

### Fase 10 — limpeza e prova de zero legado

- **Pré-condições:** snapshots novos, rollback, smoke completo e autorização específica de limpeza.
- **Áreas consumidoras:** todos os contratos, docs ativos, envs, testes, mocks, fixtures e interfaces.
- **Schema/mudança aditiva:** nenhuma; remoções somente por migrations sucessoras aprovadas.
- **Dados/backfill:** preservar histórico; remover apenas redundância comprovada.
- **RLS/riscos:** risco irreversível; confirmar ausência de dependência e backup restaurável.
- **Rollback/testes/smoke:** prova de zero legado, testes direcionados e smoke completo pós-corte.
- **Operação manual/gate:** usuário autoriza cada remoção/deploy; encerra somente com evidência técnica, remota e manual.
# Registro de execução — 2026-08-06

**Fase 0 local concluída; Fase 1 preparada localmente, sem aplicação.** A evidência está em `docs/00-produto/auditorias/fase-0-geracao-canonica-local.md`, a matriz de corte em `docs/00-produto/auditorias/matriz-consumidores-legado-fase-0.md` e a migration sucessora é `supabase/migrations/0015_canonical_identity_authorization_foundation.sql`.

Nada nesta atualização confirma catálogo, dados, RLS, grants ou ledger remotos. O próximo gate permanece a execução manual dos scripts read-only, snapshot aprovado e revisão humana da 0015. Nenhum consumidor atual foi cortado e nenhuma operação remota ocorreu.
