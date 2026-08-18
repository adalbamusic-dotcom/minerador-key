# SDD — Central de Comunicação da Plataforma

## Status

O runtime vigente usa `platform_communication_config` + Vault +
`CommunicationService`/`ResendProvider`. Convites e welcome agora usam a
fila transacional local de 3B-R2a; referências históricas a wrappers diretos
ou variáveis `RESEND_*` não descrevem o contrato operacional atual.

**PREPARAÇÃO LOCAL APROVADA — PREFLIGHT REMOTO APROVADO — MIGRATION AINDA NÃO APLICADA**

Módulo proprietário: Interface Planner / plataforma compartilhada.

## Objetivo

Criar uma configuração global de comunicação administrada pelo Admin da
plataforma, herdada por agências e marcas, com um `CommunicationService`
único e providers externos atrás dessa fronteira. O primeiro provider
previsto é o Resend.

O preflight remoto retornou `READY_FOR_COMMUNICATION_SCHEMA_REVIEW`. Esta SDD
autoriza a preparação local da migration sucessora, do contrato server-only e
da interface Admin. Não autoriza aplicação remota, configuração de credencial,
envio real, alteração de Auth ou deploy.

## Auditoria local

### Encontrado

- `lib/server/agency-invitation-email.ts` lê `RESEND_API_KEY` e
  `RESEND_FROM_EMAIL` exclusivamente no servidor e chama a API do Resend
  diretamente.
- `app/api/admin/agency-applications/route.ts` e
  `app/api/admin/agency-invitations/route.ts` usam o envio de convite.
- `app/api/admin/agencies/route.ts` usa o envio de acesso e retorna apenas
  o estado sanitizado `resendConfigured`.
- `.env.example` documenta nomes de variáveis, mas não fornece uma interface
  administrativa nem armazenamento persistente de credenciais.
- `minerador_google_ads_connections` guarda metadados operacionais de Ads,
  não um segredo de comunicação, e não pode ser reutilizada para esse fim.

### Não encontrado

Não foi localizado no checkout um cofre server-side, Supabase Vault,
KMS, secret manager integrado ou coluna de segredo cifrado com chave fora do
banco. Também não há outbox de comunicação ou catálogo de providers para
servir como contrato já implementado.

Conclusão: `RESEND_API_KEY`/`RESEND_FROM_EMAIL` são bootstrap operacional
server-side, não armazenamento seguro administrável pelo Admin. Não são
adequados como base para uma tela que salva credenciais.

## Preflight preparado

Foi criado `supabase/scripts/fase-comunicacao-vault-preflight-read-only.sql`.
O script consulta somente catálogo, funções, views, grants e metadados de
objetos. Ele não usa `vault.decrypted_secrets` para ler segredos, não chama
`vault.create_secret`/`vault.update_secret`, não cria objetos e não retorna
valores sensíveis.

O resultado remoto deve ser sanitizado e só poderá ser considerado pronto com:

```text
vault_extension_available: AVAILABLE
vault_schema_present: PRESENT
vault_create_secret_available: AVAILABLE
vault_update_secret_available: AVAILABLE
vault_decrypted_view_present: PRESENT
anon_vault_access: DENIED
authenticated_vault_access: DENIED
service_role_vault_access: ALLOWED
unexpected_dependencies: 0
preflight_status: READY_FOR_COMMUNICATION_SCHEMA_REVIEW
```

Até esse resultado, a disponibilidade do Vault permanece
`PENDING_REMOTE_CATALOG`. Nenhuma migration sucessora foi criada.

Atualização do gate: o catálogo remoto confirmou Vault disponível, schema e
view presentes, funções oficiais disponíveis, acesso `anon`/`authenticated`
negado, caminho `service_role` permitido e zero dependências inesperadas.
Foi preparada localmente a migration `0019_platform_communication.sql`, seu
rollback e a pós-validação. Nenhum deles foi executado remotamente.

## Decisão de segurança

A implementação usa exclusivamente o Supabase Vault confirmado pelo
preflight. Não será criada criptografia caseira, não será usado texto aberto
em tabela comum e não haverá retorno de segredo por GET, browser, log ou
bundle.

## Alternativas para aprovação

1. **Cofre gerenciado externo ou da plataforma** — armazenar o segredo fora
   da leitura comum do banco, com identidade server-side, rotação, revogação,
   auditoria e leitura mínima.
2. **Secret manager do ambiente de deploy** — pode sustentar um bootstrap
   temporário somente se a configuração continuar fora da interface e a
   limitação for documentada. Não atende sozinho ao objetivo final de o Admin
   salvar a credencial.
3. **Cofre persistente integrado ao Supabase** — exige confirmar a capacidade
   disponível no projeto, RLS, grants, rotação e recuperação antes de qualquer
   migration.
4. **Material cifrado em storage dedicado com KMS externo** — exige SDD
   aprovada, chave fora do banco, envelope encryption, rotação e rollback.

Somente depois da escolha e da aprovação de uma alternativa pode ser definida
a persistência de `platform communication`, seu catálogo, capabilities,
outbox e políticas.

## Contrato planejado após o gate

- configuração global: provider, status, remetente e domínio sem segredo no
  retorno;
- estados de configuração: `DISABLED`, `NOT_CONFIGURED`, `VALIDATING`,
  `READY`, `ERROR`;
- estados de envio: `QUEUED`, `SENT`, `FAILED`;
- `READY` somente após teste explícito e real do Admin;
- `CommunicationService` como único ponto de envio;
- templates server-side versionados para convites, acesso, boas-vindas,
  recuperação e comunicados;
- Admin global como único configurador; agências e marcas somente consomem
  capabilities autorizadas;
- Supabase Auth continua dono de identidade, confirmação, senha, recuperação
  e sessão;
- link de acesso continua interno e seguro, no formato
  `/login?callbackUrl=/agencias/{agencyRef}`;
- outbox/log sanitizado futuro com tipo, destino sanitizado, provider, status,
  tentativa, data e erro sanitizado, sem corpo sensível desnecessário.

## Compatibilidade e rollback

Até a aprovação do cofre, os fluxos atuais de convite e acesso permanecem com
`NOT_CONFIGURED` quando as variáveis não estiverem presentes. Não serão
alterados owners, memberships, agencies, Auth, RLS ou contratos editoriais.

O rollback da futura implementação será a desativação da configuração global
e o retorno controlado ao estado `NOT_CONFIGURED`; nenhuma credencial deverá
ser copiada ou apagada automaticamente. A migração futura só poderá ser
proposta depois de snapshot, inventário de consumidores, política de retenção
e teste de restauração.

## Critérios para desbloqueio

- cofre escolhido e disponibilidade confirmada;
- segredo nunca legível por browser, GET, tabela comum, log ou bundle;
- identidade server-side e grants mínimos revisados;
- rotação, revogação, auditoria e recuperação definidos;
- necessidade de schema/outbox documentada em SDD própria ou adendo;
- testes de Admin, não-Admin, provider ausente, validação real e falhas sem
  alteração de owner/membership;
- revisão humana e autorização específica antes de código ou migration.

## Estado

```text
secure_secret_store: NOT_FOUND_IN_CHECKOUT
remote_vault_preflight: PENDING
vault_preflight_script: PREPARED_READ_ONLY
communication_ui: PREPARED_LOCAL
communication_service: PREPARED_LOCAL
schema_change: PREPARED_LOCAL_NOT_APPLIED
remote_operations: NONE
```

## Implementação local 3B-R2a — link de convite com sessão isolada — 2026-08-10

- `lib/auth/isolated-auth-entry.ts` é o helper server-side canônico para gerar
  `/auth/new-slot?next=<destino-interno>` usando `APP_BASE_URL` ou a origem de
  fallback do servidor. Open redirect, base inválida e localhost em produção
  são rejeitados.
- O dispatcher de `AGENCY_INVITATION` cria a geração hash-only, mantém o token
  bruto somente em memória e envolve o destino do mesmo `AgencyInvitation` no
  helper de slot. Não há URL final persistida em `communication_messages`.
- Existing user e new user continuam sendo decididos server-side por
  `/api/onboarding/agency/continue`, retornando ao mesmo convite antes do
  onboarding e do aceite explícito. Nenhuma primeira Agency ou Brand é usada
  como fallback.
- Não foram criados fila, dispatcher, provider ou armazenamento paralelo.
  Recovery Supabase, migration 0020, Vault, Resend, webhook, cron/worker e
  envio real permanecem fora desta implementação local.
- **Estado:** `READY_FOR_REAL_EMAIL_PROVIDER_GATE`; comunicação real ainda não
  validada e nenhuma operação remota executada pelo agente.

## Retificação operacional — 2026-08-07

- A configuração de runtime é lida de `platform_communication_config`.
- O segredo é resolvido somente no servidor pelo Supabase Vault.
- O status operacional vem do `CommunicationService` e usa `NOT_CONFIGURED`, `VALIDATING`, `READY` e `ERROR`.
- As referências históricas a `RESEND_CONFIGURED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e `resendConfigured` não são fontes operacionais.
- A migration `0019_platform_communication.sql` e sua pós-validação foram aplicadas manualmente pelo operador; o Codex não executou operação remota.
- Links de acesso, recuperação e signup usam action links Auth gerados server-side e entregues pelo `CommunicationService`; os links não são persistidos.
