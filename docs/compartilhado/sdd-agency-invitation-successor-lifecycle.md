# SDD — Sucessão e lifecycle de AgencyInvitation

Status: Aprovada para implementação local
Implementação local: Preparada e validada; não aplicada remotamente
Migration: Criada somente no checkout local; não aplicada remotamente
Operações remotas: Nenhuma
Classificação do gate: `READY_FOR_0023_MANUAL_REVIEW`

## 1. Decisão fechada

O lifecycle canônico é:

```text
AgencyApplication 1 ─── N AgencyInvitations históricos
```

`agency_invitations.application_id` continua sendo a origem canônica do
vínculo, obrigatório para convites `PUBLIC_APPLICATION`, como FK para
`agency_applications(id)` e indexado, mas deixa de ser `UNIQUE`.

Não será criado convite por nome, e-mail, owner, primeira application, Agency
ativa ou primeiro resultado de uma consulta.

O convite antigo nunca será apagado nem terá `expires_at` reescrito para
parecer válido. A sucessão mantém a mesma `application_id`, cria novo
`invitation_id`, nova validade conforme a política do ambiente e nova mensagem
correlacionada ao sucessor.

## 2. Estados atuais confirmados

O schema 0018 define os estados reais:

- `PENDING`;
- `ACCEPTED`;
- `EXPIRED`;
- `REVOKED`.

`ACCEPTED` é terminal. A RPC `complete_agency_onboarding_with_token` cria a
Agency, registra `agency_onboardings`, grava `accepted_at`,
`accepted_by_actor_user_id` e `agency_id`, e marca as token generations como
usadas. Uma chamada posterior do mesmo owner pode retornar a Agency já criada
por idempotência; isso não reabre o convite nem representa continuação legítima
de onboarding. `ACCEPTED` não será reutilizado e não gera successor.

Atualmente, um `PENDING` cujo `expires_at <= now()` é apresentado pelo runtime
como expirado em algumas leituras, mas não é necessariamente convertido em
`EXPIRED` no banco. Essa diferença deve ser eliminada pelo lifecycle futuro,
sem alterar retroativamente a validade gravada.

O caso observado com `expires_at = 13/12/2026`, em `10/08/2026`, está fora da
política oficial de sete dias, apesar de ainda estar no futuro. Ele é legado e
incompatível; não é um convite operacional saudável.

## 3. Identificação determinística do convite operacional

Não será usado somente `ORDER BY created_at DESC LIMIT 1`.

A migration deverá adicionar um marcador explícito, aqui chamado
`is_operational boolean NOT NULL DEFAULT false`, com o seguinte significado:

- `true`: ponteiro para o convite corrente da linhagem da application; isso
  não significa válido, reutilizável ou não expirado;
- `false`: registro histórico, convite terminal `ACCEPTED` ou predecessor já
  substituído;
- convites `ADMIN_INVITE` sem `application_id` não participam da unicidade de
  convites por application.

Uma unicidade parcial deverá garantir no máximo um registro operacional por
application:

```sql
UNIQUE (application_id) WHERE application_id IS NOT NULL AND is_operational
```

O nome final da constraint/índice será definido na migration 0023. O estado
operacional não substitui `status`; os dois campos serão avaliados em conjunto.

No backfill determinístico, a migration aproveitará o fato confirmado de que
0018 permitia no máximo um invitation por `application_id`, sem heurística de
nome, e-mail ou data:

- `PENDING` válido: `is_operational = true`;
- `PENDING` expirado pelo tempo: `is_operational = true`, mas inelegível;
- `PENDING` com validade legada incompatível: `is_operational = true`, mas
  inelegível;
- `EXPIRED`: `is_operational = true` até a criação explícita do successor;
- `REVOKED`: `is_operational = true` até a criação explícita do successor;
- `ACCEPTED`: `is_operational = false`, pois é terminal;
- convite `ADMIN_INVITE` sem `application_id`: `is_operational = false`.

O backfill não altera `expires_at`, status, token generations ou mensagens.

## 4. Concorrência

As ações de aprovação, rotação e sucessão deverão ocorrer em operação
server-side transacional/RPC que:

1. bloqueia a linha da `agency_applications` com `FOR UPDATE`;
2. relê os convites vinculados à mesma `application_id`;
3. identifica o único `is_operational = true`, sem ordenar por conveniência;
4. reutiliza esse registro quando ele for válido;
5. caso contrário, marca o registro anterior como histórico e cria um único
   sucessor operacional;
6. persiste a mensagem com a application original e o novo invitation id.

Assim, duas ações simultâneas “Gerar novo convite” ficam serializadas pela
application. A unicidade parcial funciona como segunda barreira. A camada
React/API não será responsável por impedir duplicidade.

## 5. REUSE_CURRENT_INVITATION

O resultado é `REUSE_CURRENT_INVITATION` somente quando o convite:

- possui a mesma `application_id` solicitada;
- é o único convite operacional;
- está em `PENDING`;
- não foi aceito;
- não foi revogado;
- não expirou;
- respeita a janela temporal vigente do ambiente;
- ainda pode receber nova token generation pelo contrato do banco.

Nesse caminho:

- o `invitation_id` permanece o mesmo;
- não há novo registro de invitation;
- uma nova token generation pode ser criada;
- a mensagem mantém a application e o invitation originais.

## 6. CREATE_SUCCESSOR_INVITATION

O resultado é `CREATE_SUCCESSOR_INVITATION` quando o convite anterior:

- expirou;
- foi aceito;
- foi revogado;
- possui validade estruturalmente incompatível, como o registro de
  `13/12/2026`;
- ou não pode mais receber nova generation.

Nesse caminho:

- o convite antigo permanece histórico e não tem `expires_at` corrigido;
- o antigo deixa de ser operacional dentro da mesma transação;
- um novo `invitation_id` é criado com a mesma `application_id`;
- `expires_at` é calculado pela política atual do ambiente;
- a nova mensagem aponta para `agency_application_id` original e para o novo
  `agency_invitation_id`;
- o token bruto permanece somente em memória e apenas o hash é persistido.

O predecessor/sucessor não será inferido por nome ou e-mail. O vínculo
histórico mínimo é a mesma `application_id`; eventual coluna explícita de
sucessor só será adicionada se o preflight demonstrar necessidade de auditoria
além dessa relação.

## 7. Política temporal por ambiente

A política temporal é operacional, não de segurança:

| Ambiente | TTL inicial |
| --- | ---: |
| Produção | 7 dias |
| Homologação/desenvolvimento | 2 horas |
| Testes automatizados | override controlável pelo teste |

Hoje não existe um mecanismo canônico de TTL por ambiente no projeto. O
helper `lib/server/agency-invitation-lifecycle.ts` concentra apenas a
constante fixa de sete dias; `NODE_ENV` aparece em outros fluxos, mas não há
resolver de política de convite reutilizável.

O resolver centralizado usará, nesta ordem, `AGENCY_INVITATION_ENV` server-side
tipado, `VERCEL_ENV` quando disponível e, apenas como fallback de runtime local,
`NODE_ENV`. Os valores canônicos serão `production`, `staging`, `development` e
`test`; `preview` será normalizado para `staging`. Ambiente ausente ou
desconhecido usará o fallback seguro de produção, sete dias. Override de TTL
será aceito somente por injeção explícita nos testes. Não serão espalhados
`if NODE_ENV`, `if production` ou `if test` nos consumidores.

A mudança de ambiente não recalcula convites existentes. Cada invitation
preserva o `expires_at` produzido pela política vigente no momento da criação.

Homologação pode reduzir tempo para acelerar smoke, mas nunca reduz ou
desabilita hash-only, uso único, exactly-once, RLS, isolamento de sessão,
isolamento tenant/Agency/Brand, autorização, resolução por IDs, proteção contra
replay, expiração como conceito, histórico, auditoria ou ausência de fallback.

## 8. Comunicação

O dispatcher buscará os dados do invitation real pelo `invitation_id` da
mensagem. Para sucessor, a mensagem deverá conter:

```text
communication_message.agency_application_id = application original
communication_message.agency_invitation_id = novo successor
```

O template não inferirá Agency, destinatário, plano ou expiração por owner,
nome ou e-mail. O token raw continua somente em memória.

## 9. Migration 0023 — implementação local

No diretório local, a última migration é `0022_communication_service_role_acl_hardening.sql`.
A próxima numeração livre é `0023`.

A migration local `0023_agency_invitation_successor_lifecycle.sql` foi criada
somente no checkout e contém apenas o necessário para:

- remover a unicidade exclusiva atual de `application_id`;
- preservar a FK e criar índice não único para a relação 1:N;
- adicionar o marcador operacional e sua unicidade parcial;
- preservar registros existentes sem cascade silencioso;
- suportar lock/transição/insert no RPC transacional;
- manter RLS, grants, token generations e correlação de comunicação.

Antes da aplicação serão preparados:

- snapshot das tabelas afetadas;
- preflight de duplicidades, estados e vínculos;
- plano de rollback compatível com dados históricos;
- post-verification read-only dos índices, FK, RLS, RPCs e invariantes.

Ela não foi aplicada remotamente nesta tarefa. Antes de qualquer aplicação
manual continuam obrigatórios snapshot pré-0023, preflight remoto e revisão
humana do SQL integral.

## 10. Riscos e rollback

Riscos principais:

- registros legados com validade incompatível;
- duas ações administrativas concorrentes;
- mensagens duplicadas ou apontando para invitation incorreto;
- backfill que marque mais de um convite como operacional;
- tentativa de rollback depois da criação de múltiplos históricos.

Rollback operacional definido: antes da aplicação, qualquer FAIL do precheck
interrompe o gate e a migration não é executada. Depois da aplicação, não há
rollback lógico que apague convites, gerações ou mensagens históricas. Se o
preflight pós-aplicação demonstrar que ainda não existe mais de um convite por
`application_id`, uma reversão física poderá ser analisada separadamente, com
snapshot e decisão humana. Depois que qualquer `application_id` tiver N > 1,
não se reinstala a UNIQUE destruindo dados: o processo para e exige decisão
humana para uma evolução compatível, preservando o histórico.

## 11. Testes e critérios de aceite

O gate futuro deverá provar:

- produção com TTL de 7 dias;
- homologação/desenvolvimento com TTL de 2 horas;
- override explícito em teste;
- convite válido resultando em `REUSE_CURRENT_INVITATION`;
- expirado resultando em successor;
- revogado seguindo a transição canônica;
- aceito sem reutilização;
- legado inválido resultando em successor;
- histórico preservado;
- duas tentativas simultâneas criando no máximo um successor operacional;
- `application_id` preservado;
- mensagem apontando para o invitation correto;
- token antigo sem reabrir o successor;
- exatamente uma aceitação válida;
- token hash-only, RLS, autorização e isolamento preservados.

Critério de aceite da implementação: o migration verifier local está preparado
e deverá comprovar remotamente, após aplicação manual,
`is_operational`, lock por application, unicidade parcial, política temporal,
preservação dos registros e rollback compatível. A aprovação desta SDD autoriza
somente a implementação local descrita; não autoriza operação remota, envio
real, Resend, Vault, commit, push ou deploy.
