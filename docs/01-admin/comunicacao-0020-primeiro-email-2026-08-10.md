# Gate de comunicacao: preparacao do primeiro e-mail transacional

Data: 2026-08-10

## Estado registrado

- 3B-R1: HOMOLOGADA manualmente pelo usuario; nenhum novo smoke desta fase.
- 0020: APPLIED_MANUALLY e schema/token validation relatados pelo usuario.
- snapshot_pre_0020: NOT_PERFORMED.
- snapshot_pos_0020: recomendado imediatamente antes de qualquer configuracao real.
- provider real: NOT_CONFIGURED pelo agente.
- Vault, sender/domain, health READY, dispatcher real e webhook: NOT_VALIDATED.
- operacoes remotas nesta tarefa: nenhuma.

## Verificador ACL local

`supabase/scripts/fase-comunicacao-0020-post-verification-read-only.sql`
esta na versao fixa `2026-08-10-v4`, com um unico SELECT/result set e as
colunas `check_name`, `expected`, `observed` e `verdict`.

A v4 separa:

- concessao explicita catalogada em `relacl`/`proacl`;
- privilegio efetivo medido pelo catalogo PostgreSQL;
- excesso efetivo de `service_role`, que e informativo quando a concessao
  explicita prevista pela migration esta correta.

Isso corrige a classificacao anterior que tratava privilegio efetivo de
`service_role` como prova automatica de mismatch. O script continua somente
leitura e ainda nao foi executado remotamente nesta etapa.

## Provider, Vault e sender

- O provider implementado localmente e Resend (`POST https://api.resend.com/emails`).
- A chave entra somente na rota server-side de configuracao e segue para o
  RPC que cria/atualiza o segredo Vault `platform_communication_resend`.
- A tabela de configuracao guarda `secret_ref`, nunca a chave bruta.
- O remetente efetivo enviado ao provider e `sender_email`; `domain` e
  metadado de configuracao e a verificacao externa do dominio ainda nao foi
  executada.
- A transicao para `READY` depende da configuracao e da validacao; nenhum
  health remoto foi confirmado nesta tarefa.

## APP_BASE_URL e slots

`APP_BASE_URL` agora e a unica base server-side usada pelo dispatcher. O
`origin` da requisicao nao participa da composicao de links de convite ou
workspace. Convites seguem `APP_BASE_URL -> /auth/new-slot?next=...` e o slot
continua sendo criado dinamicamente no clique.
Em producao ainda devem ser confirmados o dominio publico, wildcard DNS/TLS,
`SESSION_SLOT_ROOT_DOMAIN` e cookies host-only.

## Dispatcher e delivery

As chamadas encontradas do dispatcher continuam inline nas Route Handlers de
convite, aprovacao/reconvite e onboarding. Foi adicionada a acao autenticada
`POST /api/admin/communication` com `action: dispatch_once`, protegida por
`requireCanonicalPlatformAdmin()` e executada server-side com o cliente
service. Ela processa uma iteracao `QUEUED -> claim -> SENDING -> SENT/FAILED`.
Nao foi criado cron, worker ou rotina automatica de reclaim/retry; uma
mensagem pode permanecer sem processamento ate nova execucao explicita.

`POST /api/communication/delivery` exige HMAC por
`COMMUNICATION_WEBHOOK_SECRET`, aceita `DELIVERED`/`BOUNCED` e usa `event_id`
idempotente via RPC. `SENT` permanece diferente de `DELIVERED`.

## Classificacao

`READY_FOR_REMOTE_V4_AND_PROVIDER_SETUP`

Os dois bloqueios locais foram fechados. Provider/Vault/sender/health ainda
nao foram configurados ou validados remotamente, e retry/reclaim automatico
continua pendente de decisao de producao. Nenhuma configuracao, envio, SQL
remoto, migration, commit, push ou deploy foi executado pelo agente.

## Sequencia manual futura, sem executar

1. executar o verifier v4 remoto e exigir `script_version = 2026-08-10-v4` e `0 FAIL`;
2. configurar `APP_BASE_URL`;
3. cadastrar o segredo Resend no Vault;
4. configurar `platform_communication_config`;
5. verificar sender/domain;
6. confirmar health `READY`;
7. gerar um `AgencyInvitation` real;
8. executar `dispatch_once` como Admin global;
9. confirmar `SENT`;
10. receber o e-mail;
11. clicar no link;
12. confirmar o novo slot;
13. concluir onboarding;
14. confirmar que a sessao anterior continua ativa.
