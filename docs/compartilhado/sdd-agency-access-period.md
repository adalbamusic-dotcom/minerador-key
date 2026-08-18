# SDD — Período canônico de acesso da Agency

**Módulo proprietário:** Agency Access / Onboarding

**Fase:** desenho estrutural do acesso temporário

**Status:** implementação remota concluída e post-verificada; evidência manual registrada

**Classificação:** `AGENCY_ACCESS_PERIOD_IMPLEMENTED_AND_POST_VERIFIED`

**Migration:** `0037_agency_access_periods.sql` aplicada e post-verificada
**Operações remotas:** aplicação e pós-verificação realizadas antes desta atualização; nenhuma operação remota nesta atualização documental

## 1. Escopo e decisão

Esta SDD resolveu a ausência de um contrato permanente para o direito de uso da
plataforma por uma Agency. A fundação foi implementada pela migration 0037 e
post-verificada; a atualização abaixo registra somente status e evidência, sem
executar schema, runtime, templates, UI, provider, SQL remoto ou bootstrap.

O contrato separa explicitamente:

```text
Agency lifecycle       ≠       Platform access
agencies.status        ≠       direito atual de uso
invite expires_at      ≠       período de acesso
```

`public.agencies` continua representando a organização, seu owner e seu
lifecycle operacional. O direito temporal de operar a plataforma será
representado por uma entidade própria:

```text
public.agencies
      |
      └── public.agency_access_periods
```

Não será usado `agencies.status`, `agency_invitations.expires_at` ou
`plan_code` isoladamente para liberar acesso.

## 2. Evidência do contrato atual

As migrations locais mostram:

- `agencies` possui `status`, `owner_user_id` e identidade da organização, mas
  não possui início, término ou status de acesso;
- `agency_applications`, `agency_invitations` e `agency_onboardings` possuem
  `plan_code` e origem do onboarding;
- `agency_invitations.expires_at` é a validade técnica do convite/token;
- o convite administrativo atualmente recebe uma data no fluxo da interface,
  mas a implementação local de criação usa a política curta de expiração
  técnica e não persiste a data como acesso;
- as RPCs atuais de onboarding criam Agency, onboarding e aceite do convite,
  mas não persistem `agency_access_periods`;
- a RPC atual também não cria o `agency_membership`; o helper
  `canonical_upsert_agency_membership` é uma operação separada. Isso deverá
  ser corrigido na futura fronteira transacional, sem simular atomicidade em
  chamadas independentes do servidor.

`integration_grants.starts_at/ends_at` não será reutilizado: ele governa
entitlements de providers/capabilities e usage, não o direito comercial e
operacional de uma Agency à plataforma.

## 3. Entidade `agency_access_periods`

### 3.1 Campos mínimos

| Campo | Contrato |
| --- | --- |
| `id` | `uuid` primary key |
| `agency_id` | `uuid NOT NULL`, FK para `public.agencies(id)`, `ON DELETE RESTRICT` |
| `plan_code` | `text NOT NULL`; valor inicial físico `FREE`, correspondente ao conceito de plano Free |
| `origin` | `text NOT NULL`; `PUBLIC_FREE_TRIAL`, `ADMIN_TRUSTED_INVITE` ou `PLATFORM_INTERNAL` |
| `starts_at` | `timestamptz NOT NULL`; instante de ativação do direito |
| `ends_at` | `timestamptz`; obrigatório para os fluxos temporários e nulo somente quando a política permitir acesso sem prazo, inicialmente `PLATFORM_INTERNAL` |
| `status` | `text NOT NULL`; `active` ou `revoked` |
| `source_application_id` | `uuid` nullable, FK para `agency_applications(id)`, `ON DELETE RESTRICT` |
| `source_invitation_id` | `uuid` nullable, FK para `agency_invitations(id)`, `ON DELETE RESTRICT` |
| `activated_by_actor_user_id` | `uuid` nullable, FK para `auth.users(id)`, `ON DELETE RESTRICT` |
| `created_at` | `timestamptz NOT NULL` |
| `revoked_at` | `timestamptz nullable` |
| `revoked_by_actor_user_id` | `uuid nullable`, FK para `auth.users(id)`, `ON DELETE RESTRICT` |
| `revocation_reason` | `text nullable`, sanitizado e limitado pelo contrato de auditoria |

O valor `FREE` preserva a convenção física já usada por application, invitation
e onboarding. A UI pode exibir “Free”; consumidores não podem inferir acesso a
partir desse valor.

### 3.2 Proveniência e invariantes

Cada período deve ter uma origem determinística:

| `origin` | Proveniência obrigatória | Política inicial |
| --- | --- | --- |
| `PUBLIC_FREE_TRIAL` | application e invitation da mesma linhagem | `FREE`, aprovação obrigatória, 30 dias a partir da ativação |
| `ADMIN_TRUSTED_INVITE` | invitation administrativo específico | `FREE`, término escolhido pelo Admin |
| `PLATFORM_INTERNAL` | bootstrap interno explicitamente autorizado | `FREE` como código inicial, sem término por política interna |

Restrições mínimas:

- `PUBLIC_FREE_TRIAL` exige `source_application_id` e
  `source_invitation_id` coerentes;
- `ADMIN_TRUSTED_INVITE` exige `source_invitation_id` e não possui
  `source_application_id`;
- `PLATFORM_INTERNAL` não pode depender de application/invitation;
- `source_invitation_id` não pode gerar dois períodos de ativação para a
  mesma aceitação;
- períodos históricos não são apagados nem sobrescritos para esconder uma
  concessão anterior;
- não pode haver dois períodos `active` sobrepostos para a mesma Agency;
- extensão/renovação futura deverá criar uma decisão explícita e preservar o
  histórico, sem alterar silenciosamente o período anterior.

Os nomes finais de constraints/índices serão definidos somente na migration
sucessora, após preflight de dados e revisão do catálogo. A implementação deve
enforçar a ausência de sobreposição de forma transacional, não apenas no
TypeScript.

## 4. Acesso efetivo

Não haverá job obrigatório para converter `active` em `expired`. O período é
efetivo somente quando:

```sql
status = 'active'
AND starts_at <= now()
AND (ends_at IS NULL OR ends_at > now())
```

A camada de leitura pode derivar:

- `ACTIVE`: expressão efetiva verdadeira;
- `EXPIRED`: `status = active`, mas `ends_at <= now()`;
- `REVOKED`: `status = revoked`.

Ausência de um período válido nunca é interpretada como acesso permitido.
`agencies.status = 'active'` sozinho também não é prova de acesso.

Uma Agency expirada permanece cadastrada e preserva Brands, memberships,
conteúdo e histórico. Ela não opera módulos privados até possuir direito
efetivo novo. Admin global continua podendo administrá-la no painel global,
sem que seu papel global seja um bypass de acesso operacional.

## 5. `access_expires_at` no convite

`agency_invitations` deverá receber uma propriedade semanticamente explícita:

```text
access_expires_at timestamptz nullable
```

Sem alterar o significado de:

```text
expires_at = validade técnica do convite/token
```

Regras futuras:

- convite `PUBLIC_APPLICATION`: `access_expires_at` pode permanecer nulo; o
  período será calculado na ativação;
- convite `ADMIN_INVITE`: novas criações devem persistir
  `access_expires_at` definido pelo Admin;
- `access_expires_at` deve ser posterior ao momento da ativação;
- se estiver vencido no aceite, o onboarding falha explicitamente e não cria
  Agency, membership ou período efetivo;
- a data não pode ser transportada por token bruto;
- convites legados sem essa informação não terão data reconstruída por nome,
  e-mail, owner ou validade técnica. Devem ser classificados e, para o smoke
  final, substituídos por convite novo.

O TTL técnico atual do link continua independente e não consome os 30 dias do
Free.

## 6. Fluxos canônicos

### 6.1 `PUBLIC_FREE_TRIAL`

```text
landing pública
→ agency_application PENDING
→ aprovação administrativa
→ invitation técnico curto
→ autenticação/cadastro
→ aceite autenticado
→ Agency + owner + membership
→ agency_access_period
```

No instante da ativação:

```text
plan_code = FREE
origin = PUBLIC_FREE_TRIAL
starts_at = activation_timestamp
ends_at = activation_timestamp + 30 dias
```

O período não começa na submissão, aprovação ou entrega do e-mail.

### 6.2 `ADMIN_TRUSTED_INVITE`

```text
Admin escolhe access_expires_at
→ invitation técnico curto
→ autenticação/cadastro
→ aceite autenticado
→ Agency + owner + membership
→ agency_access_period
```

No instante da ativação:

```text
plan_code = FREE
origin = ADMIN_TRUSTED_INVITE
starts_at = activation_timestamp
ends_at = invitation.access_expires_at
```

Os dois fluxos convergem no mesmo aceite autenticado. Não haverá tipo de
Agency permanente diferente nem acesso antes da aceitação.

## 7. Atomicidade do onboarding

A futura RPC canônica, ou uma sucessora aprovada da RPC atual, deverá formar
uma única unidade transacional contendo:

1. validação da sessão/actor e do convite;
2. lock determinístico da application/invitation;
3. criação da Agency com `owner_user_id`;
4. criação ou confirmação do `agency_membership` do owner, com role canônica
   e status `active`;
5. criação do `agency_onboarding` idempotente;
6. cálculo e inserção de `agency_access_periods`;
7. aceite do convite e consumo da geração de token;
8. retorno de envelope completo, incluindo a referência do período.

Falha em qualquer etapa deve reverter a transação inteira. Não é aceitável
criar Agency e membership e retornar sucesso sem o período persistido.

Retry com a mesma chave e o mesmo actor deve retornar o mesmo resultado
canônico. Outra identidade deve receber conflito explícito. Não criar uma
segunda Agency, membership ou período para a mesma aceitação.

A migration sucessora não deve editar migrations históricas 0018/0023; deve
substituir/estender a RPC final de maneira compatível, com preflight,
snapshot, post-verifier e rollback aprovados.

## 8. AdalbaPro / `PLATFORM_INTERNAL`

A Agency AdalbaPro já existente receberá, quando o enforcement for ativado,
um período `PLATFORM_INTERNAL` por bootstrap explícito e idempotente.

Esse bootstrap deve:

- apontar para a Agency canônica por referência explícita autorizada;
- não inferir a Agency pelo fato de o actor ser Admin global;
- não liberar acesso quando um período simplesmente não for encontrado;
- não transformar o acesso interno em teste Free de 30 dias;
- registrar origem, actor de ativação e motivo da operação;
- ser executado uma vez, com preflight de duplicidade e readback.

O término nulo é permitido somente por essa política interna explicitamente
aprovada. Não serão criados períodos internos para todas as Agencies ativas
por conveniência.

## 9. RLS, ACL e fronteira de escrita

`agency_access_periods` será tabela privada:

- RLS habilitado;
- `anon`: nenhum acesso;
- `authenticated`: nenhum write direto e somente leitura mínima se uma policy
  explícita for necessária;
- ativações, revogações e bootstrap por RPC/serviço server-side autorizado;
- `service_role` somente no servidor e com o menor privilégio necessário;
- nenhum segredo, token ou payload de convite na tabela;
- FKs históricas com `ON DELETE RESTRICT`;
- funções `SECURITY DEFINER`, quando necessárias, com `search_path` restrito,
  actor explícito e validação de autorização antes da escrita.

A decisão de acesso deve ser feita por helper/RPC canônico. Uma leitura
administrativa de um período não deve, por si só, conceder acesso operacional.

## 10. Consumidores futuros

O enforcement deverá auditar e atualizar, em fase própria:

- `lib/tenant/canonical-authorization.ts`, especialmente
  `requireAgencyOperationalAccess`;
- `lib/server/canonical-authorization.ts` e resolução de contextos;
- `lib/server/tenant-context.ts` e `lib/server/authz.ts`;
- `lib/server/agency-workspace.ts`;
- rotas server-side de Agency e operações Brand herdadas da Agency;
- RLS/policies que hoje usam somente `agencies.status`;
- painel Admin, que deve continuar distinguindo administração global de acesso
  operacional.

O período não substitui:

- `brandId` como tenant editorial;
- owner ou membership como identidade/autorização;
- Agency → Brand e restrições explícitas da Brand;
- grants, bindings, connections, quotas e usage de integrações.

## 11. Comunicação e templates — fase posterior

Esta SDD não altera templates. Quando a fundação estiver implementada, a
seleção deverá usar `origin`, nunca apenas `plan_code`:

| Origem | Preset conceitual |
| --- | --- |
| `PUBLIC_FREE_TRIAL` | “Seu teste grátis foi aprovado” |
| `ADMIN_TRUSTED_INVITE` | “Você foi convidado para testar” |
| convite de membro | “Você foi convidado para colaborar” |

O CTA pode continuar neutro e comum aos dois caminhos. A expiração exibida
deve identificar a validade adequada ao contexto; a validade técnica do link
não deve ser apresentada como duração do teste.

O convite AdalSEO já enviado não será usado como smoke final de onboarding,
pois foi criado antes da persistência de `access_expires_at`. Ele permanece
como evidência do comportamento anterior. Depois da homologação da fundação,
deve ser revogado/deixado expirar e substituído por convite novo.

## 12. Migration, preflight e rollback futuros

Nenhum número de migration é reservado nesta SDD. Após sua aprovação formal,
serão verificados o próximo número livre e os objetos realmente aplicados.
`0031` não será reutilizada.

Antes da migration futura serão obrigatórios:

- snapshot de Agencies, applications, invitations e onboardings;
- diagnóstico de convites administrativos sem `access_expires_at`;
- preflight de duplicidades e períodos sobrepostos;
- preflight de RLS, policies, grants, FKs, índices e RPCs;
- plano explícito para o bootstrap AdalbaPro;
- teste de atomicidade e idempotência;
- post-verifier read-only do schema e das invariantes;
- rollback documental que preserve histórico e não apague Agencies, Auth,
  Brands, memberships ou convites.

O rollback estrutural não poderá fingir que um período histórico nunca existiu.
Em caso de falha, a preferência é interromper antes do apply ou desativar a
leitura/enforcement preservando os registros, mediante decisão humana.

## 13. Critérios de aceite da fundação

### Schema

- `agency_access_periods` existe com os campos, FKs, checks e índices aprovados;
- `agency_invitations.access_expires_at` não é confundido com `expires_at`;
- origens e provenance não dependem de nome, e-mail ou Admin global;
- RLS/ACL não permitem write client-side;
- não há período sobreposto efetivo para a mesma Agency.

### Runtime

- public trial inicia no aceite e dura 30 dias;
- trusted invite usa exatamente `access_expires_at` escolhido pelo Admin;
- access expiry anterior ao aceite falha sem criar estado parcial;
- Agency, owner, membership e período são atômicos;
- retry é idempotente;
- ausência de período nega operação, sem fallback por Admin;
- AdalbaPro funciona por bootstrap `PLATFORM_INTERNAL` explícito;
- Agency expirada permanece administrável globalmente, mas não opera módulos
  privados.

### Comunicação e smoke

- os presets são selecionados por origem;
- o convite legado AdalSEO não é usado como prova final;
- há um smoke novo para `PUBLIC_FREE_TRIAL`;
- há um smoke novo para `ADMIN_TRUSTED_INVITE`;
- ambos confirmam persistência do período após logout/login e nova sessão.

## 14. Fora do escopo desta SDD

- implementar migration;
- escolher número de migration;
- alterar `agencies.status`;
- alterar runtime de autorização;
- criar/alterar templates ou telas;
- revogar o convite remoto AdalSEO;
- executar onboarding, bootstrap ou recovery;
- alterar Minerador, keywords, listas, pipeline editorial, Google Ads,
  DataForSEO, Resend, Vault ou providers;
- atualizar `estado-atual.md`, `backlog.md` ou documentação geral nesta fase.

## 15. Resultado

```text
AGENCY_ACCESS_PERIOD_SCHEMA_CHANGE_REQUIRED = APPROVED
AGENCY_ACCESS_PERIOD_ENTITY = agency_access_periods
AGENCY_ACCESS_PERIOD_SCHEMA = IMPLEMENTED_AND_POST_VERIFIED
RUNTIME_IMPLEMENTATION = IMPLEMENTED_AND_MANUALLY_VALIDATED
TEMPLATES_IMPLEMENTATION = VALIDATED_OUTSIDE_THIS_SDD
UI_IMPLEMENTATION = NOT_PERFORMED
MIGRATION = 0037_APPLIED_AND_POST_VERIFIED
REMOTE_OPERATION = COMPLETED_BEFORE_THIS_DOCUMENTATION_UPDATE
```

Evidência adicionada em 2026-08-13: `PUBLIC_FREE_TRIAL` e
`ADMIN_TRUSTED_INVITE` foram relatados como smokes manuais aprovados; o trial
público usa 30 dias desde a ativação e o convite confiável usa
`access_expires_at`. O período canônico continua separado da validade técnica
do link. A 0037 teve post-verifier final `FULLY_EXPECTED_POST_APPLY`, com
fingerprints, default ACL e RLS/ACL preservados e zero dados de negócio criados
pela migration.

O enforcement geral de expiração e a homologação de webhook `DELIVERED`
continuam fora do resultado concluído.

Em 2026-08-14, `0037 = REMOTE HOMOLOGATED`,
`0039 = REMOTE HOMOLOGATED` e o bootstrap `PLATFORM_INTERNAL` da AdalbaPro
foram registrados como homologados remotamente. O script observável
`2026-08-13-platform-internal-bootstrap-v3-observable`
retornou `access_period_count = 1`, `platform_internal_active_count = 1`,
`plan_code = FREE`, `origin = PLATFORM_INTERNAL`, `status = active`,
`ends_at = NULL`, `final_state = PRESENT_AFTER_COMMIT` e
`access_period_id = 6190db46-ba12-48ee-b8c8-b24535331df3`. O post-verifier v2
retornou `PASS` em identidade, Admin global independente, Agency, owner/membership,
unicidade do período e isolamento de outras Agencies, com classificação
`ADALBAPRO_PLATFORM_INTERNAL_BOOTSTRAP_VERIFIED` e classificação canônica
`AdalbaPro PLATFORM_INTERNAL = REMOTE HOMOLOGATED`. Esta evidência registra a
persistência do período interno; não constitui evidência de enforcement de
expiração.

Classificação final:

`AGENCY_ACCESS_PERIOD_IMPLEMENTED_AND_POST_VERIFIED`
