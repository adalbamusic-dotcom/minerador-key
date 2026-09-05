# Adendo SDD — DataForSEO para SERP de compatibilidade

**Módulo proprietário:** Plataforma / Integrações  
**Consumidor previsto:** Arquiteto  
**Data:** 2026-08-24  
**Estado:** operação local implementada; configuração remota pendente de operação manual

Este adendo complementa a SDD canônica de integrações em
`docs/compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md`.
Ele registra a preparação aditiva e a implementação local da capability de
SERP de compatibilidade DataForSEO. A rota `/api/arquiteto/serp` usa somente a
operação compartilhada server-side; nenhuma integração específica do Arquiteto
é criada. A migration, o cadastro remoto e o smoke real continuam operações
manuais.

## 1. Decisão de nomenclatura

### Auditoria do contrato encontrado

- `lib/server/platform-integrations-admin.ts` já usa as chaves canônicas
  `dataforseo.allintitle` e `dataforseo.serp_compatibility`.
- O mesmo catálogo reconhece o namespace `dataforseo.` e mantém compatibilidade
  de leitura com o padrão legado `dataforseo_`.
- A forma histórica `dataforseo_serp_compatibility` não é criada como segunda
  capability; o runtime local usa somente a forma pontuada.

```text
CAPABILITY_KEY_FOUND_CONVENTION = dataforseo.allintitle
CAPABILITY_KEY_CHOSEN = dataforseo.serp_compatibility
JUSTIFICATION = reutilizar o namespace pontuado já ativo, sem renomear
                allintitle e sem criar duas formas para a nova capability
```

A forma com sublinhado não será criada como segunda capability. O provider
canônico é `dataforseo` e o `operation_kind` canônico é
`serp_compatibility`.

## 2. Contrato aditivo

O catálogo de `integration_capabilities` continuará aceitando as operações
existentes:

- `ai_generation`;
- `keyword_discovery`;
- `keyword_metrics`;
- `allintitle`;
- `transactional_email`.

O contrato recebe, adicionalmente, `serp_compatibility`. A nova entrada
canônica é:

```text
capability_key = dataforseo.serp_compatibility
operation_kind = serp_compatibility
environment = por ambiente do catálogo
unit_name = request
status = active|disabled|legacy
```

`allintitle` permanece uma capability distinta. Uma não autoriza a outra.
Ausência de uma delas não deve ser convertida em autorização implícita da
outra.

## 3. Capacidade DataForSEO

DataForSEO é o único provider canônico para a SERP de compatibilidade. Serper,
RapidAPI e qualquer fallback equivalente são proibidos. O executor compartilhado
server-side implementa a chamada HTTP somente após a resolução governada; testes
usam fixtures e não consomem créditos.

Unidade inicial contratual: `request`, uma unidade por requisição de SERP que o
futuro consumidor efetivamente enviar. Custos monetários, quando disponíveis,
serão registrados separadamente em `cost_amount`/`currency_code`; custo não
substitui a unidade de quota.

O contrato de produção ainda deve ser validado por smoke manual. O executor
normaliza organic/PAA/related, preserva falhas sem aplicar estado parcial e
registra `module_operation` no ledger compartilhado.

## 4. Connection, grants, quota e disponibilidade

O Arquiteto consumirá a Connection existente da Plataforma cujo provider seja
`dataforseo`. Não existe `Connection` do Arquiteto.

`dataforseo.allintitle` continua no caminho legado de disponibilidade global de
homologação já usado pelos consumidores atuais. `serp_compatibility` fica fora
desse mapa de homologação e usa o caminho normal governado por:

```text
ator autenticado
→ Agency/Brand autorizada
→ capability ativa
→ grant ou binding explícito
→ Connection DataForSEO READY com secret_ref server-side
→ quota aplicável ao escopo
```

Assim, uma Connection pode servir mais de uma capability, mas cada capability
mantém seu próprio contrato, grant, binding, quota, auditoria e operação. A
configuração de Platform → AdalbaPro → Adalba deverá ser feita e confirmada
manualmente no Admin após a migration; não há IDs de Agency ou Brand
hardcoded nesta alteração.

## 5. Usage e proveniência

Não será criado ledger paralelo. O futuro consumidor deverá usar
`integration_usage_events` com:

- `connection_id` e `provider_id` da Connection DataForSEO;
- `capability_id` de `dataforseo.serp_compatibility`;
- `operation_kind = module_operation` no evento de uso do Arquiteto;
- `actor_user_id`, `agency_id` e `brand_id` do contexto resolvido;
- `units` em requisições;
- `result_status`, timestamp/período e erro sanitizado;
- referência do provider somente quando segura.

`brand_id` continua obrigatório para `module_operation`. Nenhum segredo,
credential, customerId, MCC, resposta bruta ou identificador sensível chega ao
frontend ou ao contrato do Arquiteto.

## 6. Versionamento e compatibilidade

- A migration é sucessora da 0024 e somente amplia o `CHECK` de
  `operation_kind`.
- A 0024 não será editada e operações existentes não serão removidas.
- O catálogo local adiciona uma entrada opcional; consumidores anteriores
  continuam aceitando as operações já existentes.
- Nenhuma migration será executada pelo agente nesta etapa.
- A criação de grant, binding, quota, capability remota e health check fica
  para operação manual posterior, com readback autenticado.
- Não há regravação de dados, fallback de provider nem alteração de
  persistência editorial.

## 7. Consumidores e limites

O primeiro consumidor é o Arquiteto, por meio de `/api/arquiteto/serp`. O Radar
não foi alterado funcionalmente, mas pode reutilizar o executor e o normalizador
compartilhados em tarefa própria. O Minerador `allintitle` continua em seu
contrato separado.

O contrato de integração não decide agrupamento, principal, secundárias,
reforços ou publicação. Essas decisões continuam pertencendo ao Arquiteto e à
revisão humana; a capability só governa a disponibilidade e o registro do uso.

## 8. Riscos

- Migration ainda não aplicada pode fazer o banco remoto rejeitar a nova
  operação até a operação manual.
- Capability sem grant, binding, quota ou Brand disponível deve falhar fechado.
- Connection DataForSEO ambígua, não READY ou sem segredo deve bloquear a
  resolução.
- Uma chave com sublinhado criada por engano geraria catálogo duplicado; por
  isso a forma pontuada é a única chave nova autorizada.
- O catálogo técnico não deve ser interpretado como autorização para
  `allintitle` nem para a SERP de compatibilidade.

## 9. Rollback

Antes da aplicação remota, o rollback é simplesmente não executar a migration e
não cadastrar a capability. Depois de aplicada, o rollback operacional deve
desabilitar a capability e revogar grants/bindings/quota conforme o Admin; não
remover a constraint nem apagar usage histórico. A reversão estrutural exigiria
uma migration própria e revisão de compatibilidade.

## 10. Testes e validação

Os testes locais devem comprovar:

1. `serp_compatibility` é aceito sem quebrar operações antigas e `allintitle`;
2. a capability canônica aponta para DataForSEO;
3. uma Connection pode ser reutilizada por capacidades distintas;
4. grant, binding, quota ou Brand indisponível falham fechado;
5. `brandId` é obrigatório ao registrar `module_operation`;
6. agência e marca permanecem no Usage;
7. `integration_usage_events` aceita o uso sem ledger paralelo;
8. não há segredo no frontend nem referência a Serper/RapidAPI como fallback;
9. `allintitle` não autoriza `serp_compatibility` e vice-versa;
10. a migration sucessora amplia o schema sem editar 0024.

Validação manual remota posterior, executada pelo usuário:

```text
DATAFORSEO_SERP_CAPABILITY_READY = PENDING_MANUAL_APPLY_AND_READBACK
```

Sequência: aplicar migration sucessora; cadastrar/confirmar a capability pelo
Admin; confirmar a Connection DataForSEO Platform READY; aplicar a política ou
grants/bindings/quota para a Agency/Brand; ler novamente capability, connection,
grant, binding e quota; então executar um smoke explícito do Arquiteto e
confirmar o Usage. Nenhuma chamada paga faz parte dos testes locais; o smoke
real é manual e autorizado separadamente.
