# SDD — Fundação de entradas externas para o Radar

Status: fundação remota verificada como READY; isolamento cross-brand comprovado
com JWT autenticado real. Inbound/texto/áudio Telegram e Speech real continuam
pendentes de homologação manual explícita.

Módulo proprietário: Infraestrutura compartilhada / Admin Global, com consumidor futuro no Radar e visualização tenantizada na Marca.

## Consolidação dos gates remotos — 2026-08-26

A migration da fundação Telegram/Experts foi aplicada antes desta consolidação
e a auditoria estrutural, o smoke JWT cross-brand e o readback dos contratos
foram concluídos em evidências anteriores. Nenhum smoke remoto novo foi
executado nesta atualização documental.

```text
REMOTE_RELATIONS=8/8 PASS
REMOTE_RLS=PASS
ANON_BLOCK=PASS
AUTHENTICATED_RLS=PASS

EXPERT=PASS
BINDING=PASS
ONBOARDING=PASS
BRIEF=PASS
CONTRIBUTION=PASS
PROCESSING_JOBS=PASS
INBOUND_UPDATES=PASS

CLAIM_RPC=PASS
CLAIM_ATOMIC=PASS
DOUBLE_CLAIM_PREVENTED=PASS
LEASE=PASS
RETRY=PASS
BACKOFF=PASS
ORIGINAL_ASSET_WRITEBACK=PASS

CROSS_BRAND_ISOLATION=PASS
TELEGRAM_BINDING_CROSS_BRAND_ROUTING=PASS
MULTI_BRIEF_ISOLATION=PASS
CROSS_BRAND_FK_GUARDS=PARTIAL
TELEGRAM_REMOTE_FOUNDATION=READY
READY_FOR_RADAR_TELEGRAM_IMPLEMENTATION=YES
```

O gate remoto não promove automaticamente um E2E externo a concluído. Permanecem:

```text
TELEGRAM_REAL_INBOUND_E2E=PENDING
TELEGRAM_REAL_TEXT_E2E=PENDING
TELEGRAM_REAL_AUDIO_E2E=PENDING
SPEECH_REAL_EXPERT_FLOW=PENDING
```

### Routing global e guard server-side

`telegram_inbound_updates` é um ledger `GLOBAL_PRE_ROUTING`: não é uma entidade
editorial tenantizada, não precisa de `brand_id` artificial, não é acessível
por `authenticated` e só é escrito/processado server-side. Ele registra a
idempotência do Update e somente promove contexto editorial depois da resolução
explícita de `TelegramExpertBinding`.

O fluxo canônico é:

`Telegram update → telegram_inbound_updates → TelegramExpertBinding → brandId + expertId → ExpertBrief filtrado no mesmo contexto → ExpertContribution → Radar`.

Não há resolução por username, nome, telefone, última Marca, último brief,
owner ou fallback. `service_role` pode acessar a infraestrutura server-side,
mas não é autorização para ignorar tenantização: toda promoção exige binding,
`brandId`, `expertId` e `briefId/articleDnaVersionId` compatíveis.

### Evidência de isolamento e limpeza do smoke JWT

O usuário autenticado temporário teve acesso permitido somente à Care Glow;
Brand B foi negada, inclusive em leituras e escritas cross-brand. Os guards
compostos de Expert, Brief, Contribution e Job passaram. O resultado
`CROSS_BRAND_FK_GUARDS=PARTIAL` corresponde somente ao ledger global
`telegram_inbound_updates`, protegido pela camada de routing server-side, e
não a uma falha das entidades editoriais tenantizadas.

As fixtures, a membership e a Brand temporária foram removidas:

```text
SMOKE_FIXTURES_CLEANED=YES
SMOKE_ROWS_REMAINING=0
TEMP_MEMBERSHIP_REMAINING=0
TEMP_BRAND_REMAINING=0
TEMP_AUTH_USERS_PENDING_CLEANUP=2
TEMP_AUTH_USERS_HAVE_TENANT_ACCESS=NO
TEMP_AUTH_USERS_DELETE_REQUIRES_EXPLICIT_AUTHORIZATION=YES
```

As duas identidades Auth temporárias não têm perfil, membership, ownership ou
acesso tenantizado. Elas não são excluídas por esta tarefa.

## 1. Decisão

A Plataforma terá um único Bot Telegram global. O Admin Global configura o
Bot Token, o Webhook Secret, o webhook e o diagnóstico. A Marca administra
especialistas e seus vínculos; o Radar apenas cria/consome `ExpertBrief` e
`ExpertContribution` por contratos compartilhados.

Não haverá bot por marca, token Telegram global exposto ao navegador,
Connection por módulo, `radar.telegram`, `radar.speech`, `radar.storage` ou
inferência de marca por username, nome, e-mail, telefone, owner, localStorage
ou primeiro resultado.

### Estado manual consolidado — 2026-08-25

```text
TELEGRAM_BOT_CONFIG = READY
TELEGRAM_BOT_TOKEN = CONFIGURED
TELEGRAM_WEBHOOK_SECRET = CONFIGURED
TELEGRAM_GETME = PASS
TELEGRAM_WEBHOOK = NOT_CONFIGURED
TELEGRAM_INBOUND_E2E = PENDING
```

O último `getMe` reconheceu `Assistente Conteúdo do EEAT`. A diferença entre
Bot pronto e webhook pronto é obrigatória: `TELEGRAM_BOT_READY` não implica
`TELEGRAM_WEBHOOK_READY`.

### Auditoria remota read-only pré-migration — 2026-08-26 (histórica)

Antes da aplicação manual, o projeto remoto auditado não possuía ainda as oito relações da fundação
(`brand_experts`, `telegram_expert_bindings`, `telegram_onboarding_tokens`,
`expert_briefs`, `telegram_brief_selection_tokens`, `expert_contributions`,
`external_processing_jobs` e `telegram_inbound_updates`) nem a RPC
`claim_external_processing_job`. A função `public.can_access_brand(uuid)`
existe, é `SECURITY DEFINER`, tem `search_path` fixado e é usada pelas
policies tenantizadas existentes. As relações atuais `marcas`,
`brand_memberships` e `briefings_artigos` estão com RLS habilitado.

```text
TELEGRAM_SCHEMA_REMOTE = ABSENT
TELEGRAM_MIGRATION_ALREADY_APPLIED = NO
TELEGRAM_REMOTE_FOUNDATION = NOT_READY (pré-migration)
REMOTE_OPERATION = READ_ONLY_ONLY
```

Esse bloco preserva o baseline pré-migration. Ele foi supersedido pela
consolidação remota READY registrada no início desta SDD. A configuração do
webhook e os E2Es reais continuam gates manuais separados.

## 2. Auditoria local anterior à mudança estrutural

| Item | Resultado auditado |
| --- | --- |
| `EXPERT_ENTITY_EXISTS` | Não. Há `brand_memberships` para usuários autenticados, mas não entidade de domínio para especialista sem login. O Radar possui somente fixture local. |
| `EXPERT_CURRENT_OWNER` | A equipe existente pertence à Marca e é operada por convites/memberships; não deve ser reutilizada como identidade externa Telegram. |
| `EXPERT_HAS_BRAND_ID` | Memberships possuem `marca_id`; a fixture não possui tenant persistido. |
| `EXPERT_CAN_BE_REUSED` | Não como entidade canônica. `brand_memberships` continua para acesso de usuários; `brand_experts` representa o especialista externo. |
| `CURRENT_TELEGRAM_INFRASTRUCTURE` | Preparada localmente: adapter, webhook, binding, token de onboarding e capabilities globais; configuração remota do webhook permanece pendente. |
| `CURRENT_JOB_INFRASTRUCTURE` | `external_processing_jobs` e Local Worker são o contrato preparado para mídia externa, claim, lease e retry; filas anteriores permanecem separadas. |
| `CURRENT_ASSET_STORAGE` | Google Cloud Storage é operação compartilhada; o asset original e o processamento temporário permanecem referências distintas. |
| `CURRENT_GLOBAL_CONNECTION_MODEL` | `integration_connections` com owner explícito `platform`, Secret Store por `secret_ref`, grants/bindings/quota compartilhados. |
| `CURRENT_SECRET_STORE` | Resolver server-side existente; segredos não são retornados ao cliente. |
| `BINDING_PERSISTENCE_REQUIRED` | Sim, para routing tenant-safe e revogação. |
| `BRIEF_PERSISTENCE_REQUIRED` | Sim, para múltiplas pautas, retomada, seleção explícita e idempotência. |
| `CONTRIBUTION_PERSISTENCE_REQUIRED` | Sim, para preservar cada entrada original e proveniência. |
| `JOB_PERSISTENCE_REQUIRED` | Sim, para webhook rápido, PC offline, claim, retry e heartbeat. |

### Writeback local do asset original — 2026-08-26

O worker local agora grava `original_asset_uri`, checksum, `EXTRACTED` e
`processed_at` em `expert_contributions`, sempre filtrando por `brand_id` e
`contribution_id`, antes de marcar o job como concluído. Se o writeback falhar,
o job não é concluído. Isso fecha somente o adaptador local; a tabela remota
continua pendente até a migration ser aplicada manualmente.

## 3. Schema sucessor mínimo

A migration local sucessora poderá criar somente as estruturas comprovadas:

- `brand_experts`: identidade de domínio do especialista, sempre com
  `brand_id`, sem exigir `auth.users`.
- `telegram_expert_bindings`: relação explícita entre `brand_id`,
  `expert_id`, `telegram_user_id` e `telegram_chat_id`, com estado e revogação.
- `telegram_onboarding_tokens`: hash de token opaco, expiração, uso único e
  revogação; o token bruto nunca é persistido.
- `expert_briefs`: uma pauta por especialista e artigo/versão, permitindo
  várias pautas abertas para o mesmo especialista.
- `telegram_brief_selection_tokens`: token opaco de seleção de pauta, usado
  para callback sem expor UUIDs no Telegram.
- `expert_contributions`: uma linha por Update aceito, com `source_type`,
  metadata original, texto original ou identidade de arquivo e estado de
  processamento.
- `external_processing_jobs`: fila durável com `claimed_by`, timestamps de
  claim/heartbeat/lease, tentativas, retry e erro sanitizado.
- `telegram_inbound_updates`: idempotência do Update, inclusive para updates
  que não geram contribuição.

Todas as tabelas serão tenantizadas por `brand_id` quando aplicável, terão RLS
e grants explícitos, usarão `ON DELETE RESTRICT` para dados editoriais e não
criarão bucket, Secret Store ou configuração remota.

## 4. Contratos e fronteiras

### Original, transcrição e organização

`expert_contributions` preserva a camada ORIGINAL. Speech-to-Text e extração
documental serão jobs derivados e nunca sobrescreverão o original. A
organização editorial, quando o Radar a implementar, será uma camada terceira
e revisável. A IA não pode alterar fala, ressalva, opinião ou fato do
especialista.

### Telegram

O webhook valida `X-Telegram-Bot-Api-Secret-Token`, payload, Update idempotente,
binding, estado do especialista, marca e contexto de pauta. Sem binding válido
ou sem `brief_id` selecionado, a contribuição editorial não é processada; o
webhook responde de forma controlada para não provocar retry infinito.

No Admin, as operações são separadas. Salvar a configuração exige somente o
Bot Token; o Webhook Secret é gerado ou preservado no Secret Store server-side,
sem ser retornado ao navegador, e o salvamento não chama a API do Telegram.
`Testar Bot` executa `getMe` sem depender de URL. `Configurar Webhook` é uma
ação explícita independente: exige URL pública HTTPS, resolve o segredo salvo e
executa `setWebhook` usando a rota canônica
`/api/integrations/telegram/webhook`. Em desenvolvimento local, não há
configuração automática de webhook.

O callback de seleção usa token opaco. Mensagens posteriores só entram quando
o contexto selecionado estiver explícito. Duas pautas do mesmo especialista
permanecem independentes.

Não existe resolução por “última pauta”. `brandId`, `expertId`, chat, usuário,
`briefId` e artigo/versão devem ser resolvidos explicitamente; ambiguidade
interrompe o processamento e pede decisão.

### Google Cloud e YouTube

Speech, Storage e YouTube reutilizam as operações compartilhadas existentes e
o resolvedor de Connection/Agency/Brand. Nenhuma API é chamada no webhook para
processamento pesado. YouTube fornece somente metadata; não existe download,
yt-dlp ou FFmpeg nesta fase.

### Local Worker

O worker é um processo local explícito, nunca uma função Vercel. Ele pode
reivindicar um job, renovar lease, preservar mídia original no Storage,
encaminhar Speech/extração por adapters e registrar retry/falha. O webhook só
persiste e enfileira; o worker offline não causa perda.

## 5. Governança e segurança

- Bot Token e Webhook Secret pertencem à Connection global Telegram e ao
  Secret Store server-side.
- Admin Global configura e testa; Marca nunca recebe secrets.
- O runtime resolve `brand_id` somente pelo binding persistido.
- O worker usa credencial server-side mínima e valida binding, brief,
  lifecycle e governança antes de consumir provider.
- Logs, erros, usage e diagnósticos são sanitizados.
- Payload Telegram é não confiável; nenhum arquivo recebido é executado.
- Agência bloqueada mantém o inbound e o estado controlado, mas não dispara
  consumo externo bloqueado.

## 6. Rollback e gates

O rollback é local e técnico: remover a migration somente depois de snapshot,
preflight e confirmação de ausência de dados novos. Não há rollback remoto
automático. A fundação remota já passou o gate estrutural e o smoke JWT
cross-brand; não se deve reaplicar a migration. Os gates restantes são a
configuração explícita do webhook, o inbound/texto/áudio E2E e o fluxo real de
Speech, todos com autorização manual própria.

## 7. Não implementado nesta etapa

Investigação editorial final do Radar, `ExpertEvidence` persistente, Feed de
Trends, Planejador, Redator, publicação, processamento automático de vídeo,
OCR, Amazon, redes sociais, instalação de yt-dlp/FFmpeg e chamadas pagas.

## 8. Evidência de package manager

O repositório usa pnpm e possui somente `pnpm-lock.yaml`; não existe campo
`packageManager` nem lockfile misto. `@google-cloud/speech` e
`@google-cloud/storage` não resolvem no checkout atual. A instalação manual,
quando autorizada, é:

```text
pnpm add @google-cloud/speech @google-cloud/storage
```

Nenhuma instalação foi executada pelo Codex.
