# Template — Proposta de Evolução Modular

Use este template antes de implementar provider, capability, tabela, coluna, papel, permissão, RLS ou contrato compartilhado novo.

## Identificação

- Módulo proprietário:
- Data:
- Responsável humano pela aprovação:
- Capability/provider solicitado:
- lifecycle_status (`draft`, `validating`, `active`, `failed`, `suspended` ou `revoked`):
- environment (`test`, `homologation` ou `production`):
- Origem da credencial: infraestrutura de deployment ou conexão administrativa:
- Justificativa, se qualquer componente ficar em env:
- Owner da conexão e, quando aplicável, owner canônico da agência:

## Problema e objetivo

Descrever a necessidade sem inferir schema, provider ou fallback. Informar por que a capability atual não cobre o caso.

## Contrato proposto

- Escopo proprietário permitido: platform, agency ou brand.
- Conexão, grant ou binding necessário:
- target_scope_type do binding (`agency` ou `brand`):
- target_scope_id do binding (`agency_id` ou `brand_id`):
- Origem efetiva permitida:
- Interface administrativa necessária (`/admin/integracoes`, `/agencias/{agencyRef}/integracoes` ou `/{brandRef}/integracoes`):
- Política de distribuição: `explicit`, `all_active_agencies` ou `all_authorized_brands`:
- Capabilities autorizadas por módulo consumidor:
- Dados produzidos e `brandId`:
- operation_kind (`connection_test`, `health_check`, `administrative_validation` ou `module_operation`):
- Regra de obrigatoriedade de `brandId` e persistência no tenant:
- Justificativa para `brandId` nulo, quando aplicável:
- Consumo, custo, limite e correlação:
- Estados de conexão, grant e binding:
- Para IA: modelo(s) permitido(s), limite por ambiente e critério de custo:
- Efeito durante transferência de marca:

## Consumidores, segurança e isolamento

- Módulos/rotas/handlers/contexts consumidores:
- Autorização por platform admin, agência, owner ou collaborator:
- RLS esperada e tratamento de `anon`/`authenticated`/`service_role`:
- Segredo, criptografia, rotação, expiração e logs sanitizados:
- Confirmação de que a interface não lê nem devolve segredo:
- Prova de que não há fallback silencioso:

## Persistência e migração

- Contrato atual:
- Entidades/colunas/policies propostas:
- Compatibilidade, dupla leitura/escrita e gate:
- Backfill e reconciliação:
- Snapshot, rollback e retenção:

## Validação e corte

- Fixtures/testes sem chamada paga:
- Smoke manual autorizado:
- Cenários autorizados, negados, suspensos e cross-tenant:
- Critério de paridade:
- Itens de código, rota, env, mock, fixture, teste, mensagem e documento a remover:

## Decisão

- [ ] aprovada para documentação somente
- [ ] aprovada para implementação no escopo descrito
- [ ] bloqueada: decisão humana pendente
- Decisão, data e aprovador:
