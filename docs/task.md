# Registro de tasks — geração canônica e fase funcional

> A task vigente é [FUNCTIONAL_AREA_DEVELOPMENT](task-functional-area-development.md).
> As seções abaixo preservam o histórico da fase de geração canônica e não
> representam autorização ou gate atual.

## Registro da Fase 3 — preflight DeepSeek — 2026-08-19

- **Módulo proprietário:** Plataforma / Integrações compartilhadas de IA;
- **Entregue:** preflight remoto read-only e runbook manual sem exposição de
  segredo;
- **Estado:** `DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED` e
  `DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN`;
- **Evidência:** provider DeepSeek ausente; capability `ai_generation` ativa
  com `unit_name = request`; Connection OpenRouter global ainda `READY`;
- **Não executado:** cadastro remoto, secret, health check, smoke pago,
  migration, schema, commit, push e deploy;
- **Documento:** [runbook da Fase 3](compartilhado/runbook-homologacao-deepseek-fase-3-2026-08-19.md).

## Registro da Fase 3A — configuração administrativa DeepSeek — 2026-08-19

- **Módulo proprietário:** Admin / Integrações da Plataforma;
- **Implementado localmente:** card e painel `Configurar` em
  `/admin?tab=integracoes`, API Key password, modelo `deepseek-v4-pro` e
  endpoint `https://api.deepseek.com` somente leitura;
- **Writer:** rota protegida por `requireCanonicalPlatformAdmin`, Secret
  Store/Vault, provider/Connection `platform/production` idempotentes e
  readback sem segredo. O salvamento deixa a Connection `pending`;
- **Preservado:** health check continua sendo botão explícito e separado;
  OpenRouter não foi reintroduzido na UI nem os 37 eventos históricos foram
  alterados;
- **Validação:** testes administrativos, writer DeepSeek e health check com
  fixtures passaram; nenhuma escrita remota, chamada paga, migration, schema,
  commit, push ou deploy foi executado.

## Fase anterior — geração canônica

Fase ativa: 3B-R2a — Comunicação transacional mínima + 3B-R4a — fatia mínima de convite/onboarding, autorizadas para implementação local controlada. A 3B-R1 está homologada manualmente conforme evidência sanitizada recebida; comunicação real e provider continuam pendentes.

## Aprovado

- SDD de identidade e tenantização;
- SDD de integrações;
- template de evolução modular;
- plano estrutural.
- adendo de resequenciamento da SDD 3B-R, aprovado pelo usuário para as fases 3B-R2a e 3B-R4a;

As SDDs estão aprovadas para implementação controlada local. A entrega prepara somente a migration sucessora e contratos isolados; não autoriza a aplicação manual da migration nem operação remota.

### Autorização específica 3B-R2a + 3B-R4a

- **Autorizado pelo usuário:** implementar localmente comunicação transacional mínima e a fatia vertical de convite/onboarding necessária para criar atores operacionais;
- **Preservado:** 3B-R1, identidade Supabase, AgencyApplication, AgencyInvitation, criação da Agência após aceite, owner, provider global, Vault, estados de mensagem, delivery events e login permanente;
- **Fora do escopo:** sino, notificações internas, preferências, suporte, grants, observabilidade avançada, módulos editoriais, operação remota, commit, push e deploy;
- **Obrigatório antes de qualquer smoke:** migration aplicada manualmente, provider global READY, dispatcher operacional e e-mail real recebido;
- **Estado:** implementação local autorizada; persistência remota, provider e smoke permanecem pendentes.

## Preparado localmente

### Implementação local 3B-R2a + 3B-R4a — 2026-08-09

- `0020_communication_transactional_minimum.sql` foi criada como migration sucessora e não foi executada.
- Convites, aprovação, reenvio e welcome usam mensagens idempotentes e dispatcher server-side; o Admin não recebe links brutos.
- `/cadastro` usa `auth.signUp`; a decisão usuário existente/novo ocorre server-side no contexto de convite válido.
- O recovery administrativo legado foi aposentado localmente em favor de `/recuperar-senha` → Supabase Auth.
- TypeScript passou; testes focados, lint, build e smoke remoto ainda precisam ser registrados ao final desta tarefa.

- [Migration 0015 de identidade/autorização](../supabase/migrations/0015_canonical_identity_authorization_foundation.sql), aplicada manualmente e validada pelo usuário em 2026-08-06;
- resolvedores server-side de `brandRef` e `agencyRef` estritos, não conectados aos consumidores atuais;
- [auditoria local da Fase 0](00-produto/auditorias/fase-0-geracao-canonica-local.md);
- [matriz de consumidores legados](00-produto/auditorias/matriz-consumidores-legado-fase-0.md);
- testes unitários do contrato canônico preparado.
- validação local desta revisão: 65 testes direcionados, TypeScript, ESLint focalizado e build aprovados; isso não comprova catálogo, RLS ou persistência remotos.

## Gate remoto oficial da 0015

**Confirmado:** snapshot lógico local concluído, índice 0014, ausência de agências/pendências de owner e objetos 0014 no catálogo. O ledger remoto não está exposto para leitura; a indisponibilidade foi aceita com a prova de catálogo.

**Confirmado por relatório do usuário:** `integridade: OK`, `rls_0015_scope: OK` e `post_migration_validation: OK`. A 0015 foi aplicada manualmente. Os 12 grants e 3 funções operacionais fora das dependências da 0015 formam débito de segurança separado obrigatório; não bloqueiam a fundação, mas bloqueiam zero legado e homologação completa. A Fase 2D cortou localmente os consumidores de runtime e preparou a ponte 0016, sem executar SQL remoto, remoção física, deploy ou limpeza destrutiva. A aplicação manual da ponte e o smoke continuam obrigatórios antes de qualquer DROP posterior.

## Não autorizado

- corte de consumidores atuais;
- aplicação de migration pelo agente;
- SQL remoto;
- alteração de RLS;
- corte do NextAuth;
- remoção destrutiva;
- movimentação de credenciais;
- chamadas pagas;
- deploy.

## Próximo gate

O usuário deve confirmar no catálogo remoto:

- constraints;
- foreign keys;
- `ON DELETE`;
- RLS;
- policies;
- grants;
- `SECURITY DEFINER`;
- `search_path`;
- views;
- owners;
- memberships;
- objetos e consumidores antigos.

Depois, revisar o resultado contra a matriz da Fase 0, criar snapshot aprovado e decidir manualmente se a 0015 pode ser aplicada. O corte de NextAuth, `ADMIN_EMAIL`, `user_key`, `perfis.marca_id`, roles legados e policies atuais permanece em fase posterior.

## Decisões pendentes

- catálogo e RLS remotos;
- estratégia final de criptografia;
- retenção de usage events;
- limites e custos;
- Google Ads próprio por agência como evolução futura;
- permissões delegáveis;
- Google Sheets e `app/api/mine`;
- corte do NextAuth;
- suporte global auditado.

## Critério de conclusão da task

Esta etapa local termina somente quando:

- `AGENTS.md` estiver alinhado;
- `docs/README.md` apontar para os documentos canônicos;
- `docs/task.md` refletir a fase real;
- a matriz separar estado local, proposta e pendência remota;
- a migration sucessora e os contratos locais tiverem testes;
- não houver contradição com as SDDs;
- `git diff --check` passar.

### Correcao local do gate 3B-R2a/R4a - 2026-08-09

- Geracoes de token agora sao hash-only em `agency_invitation_token_generations`; uma nova tentativa nao invalida geracoes anteriores. O aceite valida qualquer geracao valida e consome todas atomicamente.
- `claim_communication_message` preserva `SENDING` dentro do lease e recupera somente lease expirado, com `FOR UPDATE SKIP LOCKED`, limite de tres tentativas e backoff existente.
- O rollback da 0020 foi separado em preflight read-only e script manual protegido por contagem de dados; rollback operacional significa parar dispatcher/config e nao apagar dados de negocio.
- Testes contratuais locais cobrem geracoes A/B, seguranca do token, lease/reclaim, idempotencia de aceite/delivery e guards de rollback.
- Estado permanece: implementacao local realizada; migration, provider, Vault, webhook, e-mail real e smoke remoto pendentes; nenhuma operacao remota foi executada.
## Fase 2A — primeira fatia de consumidores canônicos — 2026-08-06

### Correção do smoke de seleção e Admin — 2026-08-06

- O smoke encontrou uma disputa entre a negação inicial do shell server-side e o redirecionamento automático da seleção client-side. A tela não expõe mais `BRAND_ACCESS_DENIED` enquanto revalida a mesma marca solicitada; durante a resolução, mostra somente estado neutro.
- A retomada só acontece quando a consulta canônica confirma o `brandRef` e a permissão `view` do módulo solicitado. Sem confirmação, a negação é definitiva e não há fallback por localStorage, primeira marca, agência ou contexto anterior.
- `/admin` agora mantém uma negação explícita para quem não possui `perfis.role = 'admin'`; não redireciona para `/`, marca ou agência. A área canônica de agência segue não consolidada, sem rota inventada.
- A homologação autenticada da Fase 2A permanece pendente. O bootstrap do Admin global segue dependente de tarefa e validação próprias. Google Ads continua como pendência separada; esta correção não o consulta nem altera providers.
- Nenhuma operação remota foi realizada.

### Shell persistente e loading de conteúdo — 2026-08-06

- O shell tenantizado deixou de receber uma `key` por marca e não usa mais uma tela cheia de revalidação. A autorização canônica continua no layout server-side antes de a nova rota ser renderizada.
- A troca de marca preserva shell, menu e módulo equivalente na URL. O novo `brandRef` só atualiza o contexto visual depois da resposta server-side; uma marca negada não recebe fallback para contexto anterior, primeira marca, localStorage, agência ou outro módulo.
- `app/(brand)/[brandRef]/loading.tsx` apresenta carregamento apenas no conteúdo. A homologação manual autenticada continua pendente; não houve mudança em NextAuth, providers, Google Ads, RLS, schema ou migrations.

**Estado remoto relatado pelo usuário:** a `0015` está aplicada e a validação pós-migration retornou `post_migration_validation: OK`, incluindo segurança das cinco funções, revogação de `PUBLIC`, grants esperados e ausência de acesso editorial automático para Admin global.

**Consumidores migrados nesta fatia:** `/selecionar-marca`, shell `/{brandRef}`, `/{brandRef}/`, `/{brandRef}/conta`, `/admin`, `/admin?tab=usuarios`, `/admin?tab=marcas` e as APIs de suporte desses fluxos. O `brandRef` é analisado como `slug--UUID`, a marca é buscada por UUID e o slug retornado é conferido. Owner usa `marcas.owner_user_id`; colaborador usa `brand_memberships.member_user_id` ativo e a permissão explícita necessária.

**Sessão transitória:** NextAuth continua presente apenas como entrada para o UUID de `auth.users`, revalidado server-side. As decisões canônicas desta fatia não usam e-mail, `user_key`, `perfis.marca_id`, seleção local ou primeira marca. Admin global é decidido por `perfis.role = 'admin'` e abre a Administração global; a mesma identidade pode também resolver sua única Agency operacional explícita, sem receber acesso editorial ou membership por efeito colateral.

**Consumidores remanescentes:** Minerador, Arquiteto, Radar, Planejador, Redator, Publicações, `/api/mine`, `lib/server/authz.ts`, `lib/server/tenant-context.ts`, `lib/server/agency-context.ts` e demais APIs editoriais continuam no contrato de compatibilidade. `ADMIN_EMAIL`, `user_key`, `perfis.marca_id`, `canonical_role` e helpers antigos não foram removidos.

**Rollback local:** reverter somente os arquivos desta fatia restaura os consumidores ao gate legado; não executar SQL, rollback de migration, limpeza de memberships ou remoção de dados remotos. A validação manual autenticada permanece obrigatória antes de ampliar a reconexão.

**Roteiro manual pendente:** validar login Admin → `/admin` e tabs de usuários/marcas; confirmar que Admin sem vínculo não abre marca; validar owner por `brandRef` correto, slug divergente, colaborador permitido/bloqueado, usuário sem vínculo, reload sem loop, logout e isolamento entre marcas. Nenhuma operação remota foi executada pelo agente.
## Fase 2B — Conta pessoal e workspace da agência — 2026-08-06

- **Implementado localmente:** `/conta` é independente de tenant e apresenta identidade, segurança informativa e contextos autorizados. As rotas de agência organizadas em `app/(agency)/agencias/[agencyRef]` cobrem visão geral, membros, marcas e configurações.
- **Contrato:** `agencyRef` é estrito (`slug--UUID`); owner ou membership ativa determinam acesso. O papel global, e-mail, `ADMIN_EMAIL`, `user_key`, estado local, primeira agência e slug isolado não concedem acesso. O vínculo ativo `agency_brands` concede controle operacional herdado por padrão, limitado por permissões do actor, restrições explícitas da Brand e RLS.
- **Compatibilidade preservada:** NextAuth continua como bridge de UUID revalidado; nenhum consumidor editorial, `app/api/mine`, provider, RLS, owner, membership, schema ou migration foi alterado. A rota `/{brandRef}/conta` permanece e encaminha para `/conta`.
- **Pendente:** homologar em navegador as contas sem marca, owner/membro/inativo de agência, Admin global sem membership, referências divergentes, isolamento entre agência/marca e responsividade. Não houve operação remota.

## Fase 2C — consolidação da raiz operacional — 2026-08-06

- **Implementado localmente:** login, cadastro, logout de shell e clientes browser usam sessão nativa Supabase SSR. A rota NextAuth foi retirada do código; `app/api/mine` permanece em `410 DISABLED` enquanto seu descarte definitivo aguarda prova de uso zero e decisão para Google Sheets.
- **Autorização:** `brandRef` é resolvido no servidor em todas as páginas editoriais. Admin global só abre Administração; owner ou membership UUID ativo continuam obrigatórios para qualquer marca. `user_key` e `perfis.marca_id` não são usados como fallback de acesso.
- **Navegação:** `/selecionar-marca` agora lista separadamente Administração global, Agências e Marcas autorizadas, sem selecionar primeiro registro. Negação ou indisponibilidade de uma marca permanece na própria rota, sem retorno para ganhar acesso por transição client-side.
- **Bootstrap manual preparado:** `fase-2c-initial-identity-preflight-read-only.sql`, `fase-2c-initial-identity-bootstrap.sql` e `fase-2c-initial-identity-post-bootstrap-validation-read-only.sql` recebem um e-mail localmente, não o exibem, e validam Admin global, owner da Agência Adalba, membership de agência e acesso editorial explícito a Adalba/Lindisse. O bootstrap preserva `marcas.owner_user_id` e não recria marcas ou vínculos de agência.
- **Ainda manual:** executar preflight, bootstrap transacional e validação pós-bootstrap; rodar um único smoke autenticado; executar `pnpm install` para reconciliar `pnpm-lock.yaml` após a remoção de `next-auth` do `package.json`.
- **Não concluído:** não houve SQL remoto, alteração de Auth remoto, provider pago, commit, push ou deploy. Campos históricos de persistência e o lockfile com `next-auth` ainda exigem prova de uso zero e corte manual separado.

## Incidente 3B-R1 — login bloqueado — 2026-08-09

- **Auditoria:** o login antigo via CredentialsProvider já usava o mesmo Supabase Auth (`/auth/v1/token?grant_type=password`); não há base para reintroduzir uma segunda sessão.
- **Causa confirmada no código:** a tela nativa classificava qualquer falha não relacionada à confirmação de e-mail como credencial inválida, mascarando configuração, rede, limite e respostas inesperadas.
- **Correção local:** classificação segura por categoria, captura de exceções, diagnóstico sanitizado somente em desenvolvimento e redirecionamento condicionado a `session.user.id`.
- **Verificado localmente:** 20 testes focados, TypeScript, build Next.js e `git diff --check` passaram. O lint dos arquivos de código passou; o teste `.mts` foi ignorado pela configuração do ESLint.
- **Ainda não verificado:** login real do Admin e de conta comum, `actorUserId`, Admin global após autenticação, isolamento entre contas, reload e logout. Nenhuma operação remota foi executada.
- **Registro completo:** `docs/compartilhado/incidente-3b-r1-login.md`.

## Adendo proposto — conta canônica de Agência e workspace — 2026-08-09

- **Módulo proprietário:** Interface Planner. O modelo aprovado passa a exigir no máximo uma Agência operacional efetiva por usuário comum; Admin global é exceção e Agência continua organização operacional, enquanto Brand continua tenant editorial por `brandId`.
- **Auditoria local:** `0014` possui apenas `UNIQUE (agency_id, user_id)` em `agency_memberships`; `0015` possui FK/`NOT NULL` de `agencies.owner_user_id` e índice não-único. Não há constraint local de uma Agência por owner/member. O catálogo remoto não foi consultado.
- **Desvio documentado:** autorização, `/api/contexts`, seletor, sidebar e `/conta` ainda trabalham com `agencies[]`; a copy de “Agências autorizadas” e “Aceitar e criar agência” permanece no runtime. Nenhuma dessas superfícies foi alterada nesta tarefa.
- **Consulta futura:** `supabase/scripts/agency-single-operational-membership-audit-read-only.sql` detecta violações por contagem, sem executar SQL remoto.
- **Workspace:** as rotas existentes de Agência são reutilizáveis para Visão geral, Membros, Marcas e Configurações; “Dados da Agência” e “Notificações” permanecem planejamento. `/conta` não receberá dados organizacionais.
- **Documento canônico:** `docs/compartilhado/adendo-modelo-canonico-conta-agencia-workspace.md` registra contrato antigo/novo, impacto, compatibilidade, legado, rollback e próxima implementação.
- **Estado:** adendo proposto, não aprovado; implementação não realizada; nenhuma migration, provider, Vault, notificação, módulo editorial, operação remota, commit, push ou deploy.

## Complemento proposto — fluxos operacionais Agência/Brand — 2026-08-09

- **Contrato:** Plataforma → Admin global; Agência como cliente operacional; Brand como tenant editorial por `brandId`. Agência não substitui o tenant de Brand.
- **Exclusividade:** a regra comum é conjunta entre `agencies.owner_user_id` e `agency_memberships.user_id`; dois índices independentes não bastam para impedir owner em uma Agência e member em outra. Alternativas e recomendação ficaram no adendo, sem implementação.
- **Workspace:** além das rotas existentes, o planejamento inclui Dados da Agência, Atividade e Notificações. Conta pessoal permanece separada.
- **Planilhas UI:** membros da Agência, Brands da Agência e colaboradores da Brand usarão entidades canônicas, busca/filtros/status/ações/estados de interface e autorização server-side; “planilha” não implica nova tabela SQL.
- **Brand:** criação futura parte de Minha Agência → Marcas → Cadastrar Marca e preserva BrandDNA, `brand_memberships`, papéis, permissões e `agency_brands`, sem reconstruir o módulo editorial.
- **Comunicação:** `0020` é a única infraestrutura transacional compartilhada; não há sistema separado por Admin/Agência/Brand. Provider global e segredos server-side permanecem fora desta tarefa.
- **Notificações/activity:** não há tabelas físicas correspondentes confirmadas nas migrations locais; sino, preferências e monitoramento são apenas contratos futuros filtrados por actor/escopo.
- **Sequência:** exclusividade conjunta → workspace Agência → administração de Brand → comunicação real → notifications → activity/monitoring → avaliação do smoke 3B-R1.
- **Estado:** complemento documental proposto, não aprovado; sem runtime, schema, migration, SQL remoto, provider, e-mail, notifications, activity, módulos editoriais, commit, push ou deploy.

## Decisão complementar — controle herdado da Agência sobre Brands — 2026-08-09

- **Contrato:** a Agência administra operacionalmente as Brands vinculadas por padrão, pois presta o serviço de marketing e opera o pipeline.
- **Limite da Brand:** a Brand pode persistir restrições explícitas, auditáveis e removíveis por área, módulo ou capacidade. A restrição não rompe `agency_brands`, não muda owner e não cria `brand_membership` artificial.
- **Acesso efetivo:** RLS/segurança da plataforma → restrições explícitas da Brand → permissões do actor na Agência → acesso herdado da Agência.
- **Visibilidade:** ver atividade é diferente de executar ação. Uma área restrita deve permanecer visível com estado e escopo explicados; não pode desaparecer silenciosamente.
- **Colaboradores:** funcionários da Agência operam pelo vínculo Agency → Brand e pelas permissões da Agência/Brand; colaboradores próprios continuam em `brand_memberships`.
- **Estado:** decisão incorporada ao adendo, ainda proposta e não implementada. O schema e o resolvedor atuais ainda não representam as restrições explícitas nem o acesso herdado completo.

## SDD estrutural proposta — autorização Pessoa/Agency/Brand — 2026-08-09

- **Documento:** `docs/compartilhado/sdd-autorizacao-pessoa-agencia-brand.md`.
- **Contrato:** uma relação operacional efetiva por qualquer actor, inclusive Admin global; Agency → Brand concede acesso herdado por padrão; restrições explícitas da Brand prevalecem por capability.
- **Recomendação:** preflight + índices parciais + constraint trigger transacional para a união owner/member, com RPCs server-side e retirada posterior de escritas diretas após migração dos consumers.
- **Restrições:** estrutura extensível futura com Brand, Agency, capability, status, motivo, actor, timestamps e histórico; nomes físicos ainda não decididos.
- **Preflight:** `supabase/scripts/agency-authorization-preflight-read-only.sql`, somente leitura e não executado.
- **Estado:** SDD aprovada pelo usuário para implementação local; 0021, RPCs, RLS/policies e canonical authorization preparados no checkout. Migration remota, preflight remoto, dados, smoke, commit, push e deploy permanecem pendentes/bloqueados.

## Implementação local da base canônica - 2026-08-10

- `supabase/migrations/0021_canonical_agency_brand_authorization.sql` adota trigger de constraint adiado + advisory lock para a união owner/member, sem reintroduzir `canonical_role` removido pela 0017.
- `brand_agency_capability_restrictions` preserva o vínculo Agency-Brand e registra revogação, motivo, actor e timestamps; `agency_membership_capabilities` exige grant explícito para membros não administrativos.
- `lib/server/canonical-authorization.ts`, `tenant-context.ts`, `authz.ts` e `editorial-authorization.ts` convergem para acesso direto Brand ou acesso herdado Agency, com `DENIED_NO_RELATION`, `DENIED_AGENCY_PERMISSION` e `DENIED_BRAND_RESTRICTION` em pontos server-side.
- **Gates:** testes focados 20/20, TypeScript, ESLint direcionado e `git diff --check` aprovados. Preflight remoto, migration remota, RLS remota e smoke não executados.
# Gate remoto pós-migration 0020 - 2026-08-09

snapshot_pre_0020: NOT_PERFORMED
migration_0020: APPLIED_MANUALLY
migration_result: SUCCESS_REPORTED_BY_USER
remote_schema_verification: NOT_EXECUTED_BY_AGENT
remote_verification_status: INCOMPLETE

# Correção local do pós-login de solicitante aprovado - 2026-08-09

- **Fechamento do dead-end:** o CTA `Finalizar acesso à agência` abre `/onboarding/agencia` sem token, ID de convite ou dependência do e-mail.
- **Retomada:** o GET/POST autenticado resolve novamente, no servidor, o `AgencyInvitation PENDING` do ator atual. A confirmação chama o RPC canônico existente `complete_agency_onboarding`; nenhum aceite ocorre ao abrir a página.
- **Script pós-0020 v2:** a auditoria do arquivo real encontrou a nomenclatura antiga `remote/pass`, ausência de `script_version` e ausência da correção uniforme descrita anteriormente. O primeiro SELECT atual daquele arquivo produziria `MISSING/false` para uma relação ausente; portanto `remote = null / pass = true` não pode ser produzido por esse bloco e não constitui prova do catálogo remoto.
- **Script pós-0020 v3:** não há outra cópia com o mesmo nome dentro do repositório; o arquivo era local e não rastreado pelo Git. A v3 consolida todos os checks em uma única instrução/result set, usa `check_name/expected/observed/verdict`, com `PASS/FAIL/INFO`, existência `1/0`, e versão fixa `2026-08-10-v3`. A alteração é local/read-only e ainda não foi executada no Supabase.
- **Ajuste após erro do SQL Editor:** a contagem deixou de usar `query_to_xml`/SQL dinâmico e passou a consultar somente `pg_stat_user_tables.n_live_tup` como metadado sanitizado. Isso evita o erro de validação `query: Too small...`; a contagem é informativa, não prova de linhas exatas.

- **Causa confirmada no código:** `/api/contexts` listava somente marcas e agências já autorizadas/operacionais. Uma identidade autenticada com `agency_applications.status = 'APPROVED'`, convite `PENDING` e onboarding ausente caía no estado vazio de `/selecionar-marca` sem explicação do próximo passo.
- **Implementado localmente:** consulta server-side do estado pendente do próprio ator autenticado, com correspondência interna pela identidade Auth, aplicação aprovada, convite pendente não expirado e ausência de `agency_onboardings`.
- **Contrato preservado:** e-mail, UUID e token não são retornados ao navegador nem usados como autorização. Não há endpoint público de enumeração. A Agência continua sendo criada somente pelo aceite autenticado e conclusão do onboarding.
- **Implementado localmente:** aviso de acesso aprovado, convite pendente, onboarding não concluído e Agência ainda não criada, orientando o uso do convite existente. Nenhum reenvio automático ou link manual foi adicionado.
- **Implementado localmente:** `SessionLogoutButton` compartilhado no ProductShell e no WorkspaceFrame, cobrindo Admin, Marca, Agência e Conta. O logout usa `supabase.auth.signOut()` e retorno seguro ao login; dados locais de recuperação não são apagados.
- **Verificado localmente:** testes direcionados 24/24 e TypeScript. Nenhuma operação remota, migration, provider, e-mail, commit, push ou deploy foi executado nesta correção.
- **Ainda pendente:** validação visual autenticada, e-mail real e smoke de onboarding. Não retomar o smoke da 3B-R1 nesta correção.
- **Evidência manual registrada:** recovery Supabase do solicitante `PASS`; login do solicitante `PASS`; detecção do onboarding pendente `PASS` visual; CTA estava `AUSENTE` antes desta correção; e-mail transacional `NÃO RECEBIDO`; provider real `NÃO VALIDADO`; onboarding completo `PENDENTE`.

O retorno informado pelo Supabase foi `Success. No rows returned`. Isso
confirma somente a execução manual sem erro reportada pelo usuário; não
substitui a verificação read-only do catálogo. O script local
`supabase/scripts/fase-comunicacao-0020-post-verification-read-only.sql`
na versão `2026-08-10-v3` deve ser executado antes de Vault, provider,
dispatcher ou mensagem real. A classificação local é
`READY_FOR_REMOTE_0020_VERIFICATION_V3`; a classificação remota continua
pendente.

# Auditoria dos 9 FAILs remotos da 0020 v3 - 2026-08-10

- A migration local 0020 contém fisicamente `CHECK (used_at IS NULL OR revoked_at IS NULL)`. O FAIL do v3 decorre do `LIKE` sobre `pg_get_constraintdef`, que não normaliza os parênteses gerados pelo catálogo; não comprova ausência do constraint remoto.
- Os oito FAILs de `service_role` medem privilégio efetivo por `has_table_privilege`/`has_function_privilege`, não a origem do grant emitido pela 0020. A migration só revoga `PUBLIC`, `anon` e `authenticated` e concede os privilégios explícitos documentados a `service_role`; owner, herança, ACL padrão ou comportamento do papel Supabase ainda precisam de catálogo read-only para atribuição remota.
- Consumidores locais encontrados usam RPCs para enqueue, geração/revogação de token, claim, complete e delivery. As leituras diretas localizadas são templates no dispatcher, token generations no inspect do convite e mensagens no helper de consulta. Não foram encontrados consumidores legítimos de `DELETE` nessas quatro tabelas.
- `communication_delivery_events` permanece append-only no contrato da SDD. Qualquer privilégio efetivo adicional de `UPDATE/DELETE` é uma preocupação de hardening, mas não é classificado como mismatch confirmado sem identificar sua origem ACL/owner.
- Foi preparado `supabase/scripts/fase-comunicacao-0020-hardening-preflight-read-only.sql`, somente leitura, para contar estados `used_at`/`revoked_at`, conferir o constraint no catálogo e confirmar as RPCs relacionadas. Nenhuma correção foi aplicada.
- **Classificação:** `VERIFIER_NEEDS_CORRECTION`. Zero mismatch real foi confirmado, nove expectativas do verificador precisam ser corrigidas/qualificadas, e nenhuma dependência de consumidor direto foi estabelecida.
Recomenda-se snapshot imediato do estado pós-0020 antes de qualquer
configuração de comunicação.

## Correção local da premissa Admin + Agency — 2026-08-10

- **Contrato corrigido:** `perfis.role = 'admin'` pode coexistir com uma única Agency operacional efetiva da mesma identidade, como owner, member ou ambos na mesma Agency.
- **Exclusividade:** a migration e o preflight calculam `COUNT(DISTINCT agency_id)` pela união deduplicada de `agencies.owner_user_id` e `agency_memberships.user_id`; qualquer actor com mais de uma Agency efetiva continua bloqueado.
- **Preflight:** `global_admin_with_explicit_agency_link` deixou de ser falha e virou informação; `global_admin_with_single_operational_agency` também é informativo; `effective_multi_agency_actors` é o check canônico esperado em zero.
- **Migration 0021:** removido o bloqueio específico a Admin global no precondition, trigger e RPCs. A proteção transacional, advisory lock e rejeição de segunda Agency permanecem.
- **Contexts:** o contexto global (`isPlatformAdmin`) permanece separado do contexto operacional. `operationalAgency` só é preenchida quando exatamente uma Agency é resolvida; não há fallback para a primeira Agency de uma lista administrativa.
- **Brand:** o papel global não é bypass automático dentro do contexto Brand; a autorização Agency → Brand continua sujeita ao vínculo, capability, restrição explícita e RLS. Operações globais permanecem nas rotas próprias de `/admin`.
- **Dados preservados:** nenhuma Agency, owner, membership, Brand ou vínculo remoto foi alterado. Migration remota, SQL remoto, provider, e-mail, commit, push e deploy não foram executados.

# Minha Agência — base operacional - 2026-08-10

- **Módulo proprietário:** Interface Planner.
- **Implementado localmente:** workspace `/agencias/{agencyRef}` com overview real, Dados da Agency, membros, Brands, Configurações, navegação singular e estados operacionais básicos.
- **Autorização:** cada leitura e mutação reconfirma sessão, `agencyRef`, Agency ativa e owner/membership no servidor. Global Admin mantém o contexto `/admin`; não recebe bypass dentro de Agency ou Brand.
- **Membros:** o fluxo usa identidades Auth existentes pesquisadas server-side, sem UUID manual e sem alegar envio de convite. Papéis, status e as 11 capabilities 0021 são persistidos por RPC/serviço server-side.
- **Brands:** o cadastro segue Minha Agência → Marcas → Cadastrar Marca, preserva `brandId`, cria vínculo Agency → Brand e não cria `brand_membership` artificial nem dispara BrandDNA, IA, SERP ou editorial.
- **Contratos preservados:** `/conta` pessoal, logout, owners, memberships de Brand, provider global, comunicação, notifications, activity e 3B-R1.
- **Validação local:** TypeScript e ESLint focalizado aprovados. Checklist manual autenticado/visual foi preparado, mas não executado.
- **Estado remoto:** `0021 APPLIED_MANUALLY` e `POST_VERIFICATION_PASS` conforme relato do usuário; snapshot pré-0021 não realizado. Não houve SQL remoto, migration, provider, e-mail, commit, push ou deploy pelo agente.
- **Classificação:** `READY_FOR_AGENCY_WORKSPACE_SMOKE` — implementação local pronta para validação manual, sem declarar o smoke concluído.

## Correção do erro Runtime da Minha Agência - 2026-08-10

- **Erro:** “Não foi possível carregar a estrutura operacional da Agency.”
- **Causa:** consulta incompatível com o schema final, referenciando `agency_memberships.canonical_role`, removido pela 0017.
- **Correção:** usar `agency_memberships.role`, conforme o contrato efetivamente preparado pela 0021.
- **Estado:** corrigido e validado localmente; nenhuma operação remota foi executada.

# Cadastro operacional completo de Marca e first-run - 2026-08-10

- **Formulário anterior:** o histórico local de `app/(admin)/admin/marcas/page.tsx` tinha nome, Site URL, nicho, diretrizes legadas, silos e localização; upload e DNA misturavam contratos diferentes.
- **Formulário atual antes da correção:** `modules/conta/agency-workspace-controls.tsx` aceitava somente nome.
- **Formulário restaurado:** nome, website, nicho operacional e localização/área de atuação. O cadastro não recebe propósito, público, posicionamento, voz, estratégia, BrandDNA, keywords ou SERP.
- **Owner:** `marcas.owner_user_id` mantém a semântica técnica existente e recebe o owner da Agency no fluxo Agency → Brand. O vínculo operacional é `agency_brands`; não há `brand_membership` artificial.
- **First-run:** a home `/{brandRef}` agora renderiza estado operacional real sem `pipeline.snapshot`, exibe o estado do BrandDNA sem criá-lo e encaminha para a área canônica existente.
- **Labels:** “Marcas da Agência”, “Marca atual”, “Minha Agência”, “Ativa” e “Cadastrar Marca” substituem resíduos inválidos de plural/inglês nas superfícies alteradas.
- **Preservação:** CareGlow não foi apagada ou recriada; Adalba, Lindisse e o pipeline editorial não foram alterados remotamente.
- **Validação:** TypeScript e ESLint focalizado aprovados nesta etapa; testes focados, build e validação manual visual/autenticada ainda serão concluídos antes do smoke.
- **Classificação pretendida:** `READY_FOR_NEW_AGENCY_BRAND_SMOKE`, após a rodada final de testes locais.

## Fechamento da restauração operacional de Marca - 2026-08-10

- **Validação local:** 40 testes direcionados passaram; TypeScript, ESLint focalizado e build de produção passaram.
- **Integridade:** `git diff --check` passou; os avisos observados são somente conversões LF/CRLF do checkout.
- **Escopo:** nenhum SQL remoto, migration, provider, e-mail, alteração de CareGlow, commit, push ou deploy foi executado pelo agente.
- **Manual pendente:** ainda falta o smoke autenticado/visual do cadastro de uma nova Marca em uma Agency sem Marcas. A evidência manual existente sobre CareGlow permanece relatada pelo usuário, não reexecutada nesta etapa.
- **Classificação:** `READY_FOR_NEW_AGENCY_BRAND_SMOKE`.

## Refinamento da gestão de Marcas da Agência - 2026-08-10

- Cadastro operacional convertido para modal único em `modules/conta/agency-brand-create-modal.tsx`; topo e estado vazio usam a mesma implementação.
- Cards/listagem são o conteúdo principal; o menu secundário oferece edição e colaboradores pelas rotas existentes.
- Standby, arquivamento e exclusão definitiva não foram implementados porque o contrato atual só define `active`, `suspended` e `inactive` para `marcas`.
- Relatório detalhado: `docs/02-marca/auditoria-gestao-marcas-2026-08-10.md`.
- Classificações: `READY_FOR_BRAND_MANAGEMENT_SMOKE` para a gestão; `BRAND_LIFECYCLE_NEEDS_SDD` para lifecycle.

## 3B-R2a — link de convite com sessão isolada — 2026-08-10

- **Implementado localmente:** `buildIsolatedAuthEntryUrl` centraliza a entrada
  em `/auth/new-slot?next=...`, valida destino interno e usa `APP_BASE_URL`
  configurável, sem hardcode de host de produção.
- **AgencyInvitation:** o dispatcher cria a geração hash-only e envolve o
  destino original `/onboarding/agencia?token=...` no novo slot. O token bruto
  permanece somente em memória durante a renderização/envio.
- **Existing/new:** `/api/onboarding/agency/continue` continua decidindo
  server-side entre login e cadastro e retorna ao mesmo convite; não usa
  primeira Agency/Brand nem endpoint público de enumeração.
- **Preservado:** retry/generation/aceite exactly-once da 0020, recovery
  Supabase, AgencyInvitation, onboarding, fila/dispatcher e delivery events.
- **Homologação 3B-R1:** evidência manual do usuário registrada como PASS para
  multi-session, isolamento de sessão, contexto e logout.
- **Estado:** `READY_FOR_REAL_EMAIL_PROVIDER_GATE`; provider, Vault, webhook,
  cron/worker, envio real e comunicação real continuam pendentes.
