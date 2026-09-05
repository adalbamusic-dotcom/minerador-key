# SDD — Article KGR Decision e Keyword Contextual Presentation

- **Status:** aprovada para implementação local da Fase A; Fase B permanece pendente e nenhuma aprovação autoriza migration, SQL remoto ou operação remota
- **Módulo proprietário:** Arquiteto
- **Módulo upstream envolvido:** Minerador
- **Data:** 2026-08-28
- **Subcontratos:** A. Article KGR Decision; B. Keyword Contextual Presentation

Esta SDD registra auditoria local e proposta arquitetônica. Ela não altera
código, schema, RLS, API, payload persistido, dados ou documentação operacional.
Não foram executadas migrations, SQL remoto, smoke remoto ou chamadas de
provider. Uma aprovação futura ainda exigirá plano, preflight remoto e
autorização própria para cada mudança estrutural ou operação.

## 1. Objetivo e limites

Fechar dois contratos independentes do Arquiteto:

1. decisão canônica, versionada e revisável do KGR do Article;
2. persistência, readback e handoff da apresentação contextual da Keyword.

A decisão do Article usa exclusivamente a Keyword Principal aprovada na cópia
de trabalho. A apresentação contextual fornece contexto de marca e voz; nunca
altera KeywordDNA, intenção, funil, KGR, principal, aprovação ou SERP.

Fora do escopo: implementação de código; tabela, migration, policy, grant,
função ou API; alteração de payload; UI; backfill; geração de DNA; operação
remota; chamada de IA/provider.

## 2. Fontes e método

Foram confrontados:

- AGENTS.md;
- docs/00-produto/invariantes.md;
- docs/00-produto/glossario.md;
- docs/00-produto/fluxo-oficial.md;
- docs/00-produto/pipeline-editorial-papeis-handoffs.md;
- docs/00-produto/mapa-estado-atual-plataforma.md;
- docs/compartilhado/regras-de-trabalho-e-documentacao.md;
- docs/03-minerador/spec.md, estado-atual.md e backlog.md;
- docs/04-arquiteto/spec.md, estado-atual.md e backlog.md;
- docs/04-arquiteto/propostas/2026-08-28-pedido-estrutural-decisao-kgr-do-artigo.md;
- contratos, adapters, rotas, repositórios e testes citados abaixo;
- migrations locais de editorial_workflow_items e
  editorial_artifact_versions.

O catálogo remoto não foi consultado. Constraint, policy, grant, relação,
função ou coluna sem evidência remota anterior fica **PENDENTE DE CONFIRMAÇÃO
NO CATÁLOGO REMOTO**. A auditoria diferencia Verificado no código, Confirmado
por teste, Proposto e Ainda não verificado.

## 3. Estado atual comprovado

### 3.1 Article KGR

O Minerador é dono dos fatos KeywordDNA, score e aplicabilidade. O Arquiteto é
dono da formação do ArticleDNA e da decisão do Article. O código local em
lib/arquiteto/article-kgr-decision.ts já calcula um read model determinístico:

- score finito, não negativo e menor que 0.25: YES, FULL_KGR_RULE;
- score maior ou igual a 0.25 e aplicabilidade applicable:
  PENDING_HUMAN_DECISION;
- score maior ou igual a 0.25 e not_applicable: NO;
- score maior ou igual a 0.25 e aplicabilidade pendente:
  PENDING_APPLICABILITY;
- score ausente, inválido ou negativo: ABSENT, nunca zero;
- score exatamente 0.25 não é YES automático;
- secundária e reforço são somente diagnóstico.

lib/arquiteto/contracts.ts possui ArticleKgrIdentitySchema com isKgrArticle,
source, bindingStatus e evidências, mas não um estado discriminado completo
para decisão humana, aplicabilidade pendente e ausência. O adapter deriva a
identidade da identidade do grupo ou da Principal. ArticleDNA é versionado,
porém não carrega todo o ciclo da decisão proposta.

A AssignmentSchema de app/api/arquiteto/workspace/route.ts não contém decisão
KGR. O payload de editorial_workflow_items é durável, tenantizado e protegido
por lock_version, mas o assignment atual não salva essa decisão. O seletor de
KGR da revisão é inerte. Não há prova atual de save, readback, F5, bloqueio de
handoff pendente ou reavaliação ao trocar a Principal.

### 3.2 Keyword Contextual Presentation

lib/minerador/presentation-brief.ts define saída auxiliar curta, sem autoridade
sobre SEO. A rota
app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts valida sessão,
marca, Keyword, BrandDNA/Voice, geração explícita e saída estruturada, registra
usage e retorna persisted: false.

modules/minerador/minerador-workspace.tsx guarda presentationBriefs em
useState. Os testes locais comprovam ausência de localStorage, IndexedDB,
autogeração no mount e botão no painel. O resultado é descartado no F5, não há
readback canônico e o handoff Minerador → Arquiteto não carrega presentationRef.
Não foi encontrada relação dedicada nas migrations locais auditadas.

## 4. Contrato atual e gaps

| Área | Armazenamento atual | Readback/F5 | Gap |
|---|---|---|---|
| Keyword score/aplicabilidade | fatos do Minerador e histórico próprio | contrato do Minerador | não é decisão do Article |
| Article KGR | identidade em ArticleDNA quando salvo | sem decisão humana completa | estado/source/gate ausentes |
| Working copy | editorial_workflow_items.payload + lock_version | repositório canônico | assignment não inclui KGR |
| Apresentação | React state, persisted: false | não sobrevive F5 | sem storage ou handoff |
| Handoff Keyword | refs de KeywordDNA, versão e hash | idempotência de origem | sem presentationRef |

O workflow e o artifact store existentes não constituem prova de persistência
de campos que o contrato ainda não escreve.

## 5. Subcontrato A — Article KGR Decision

### 5.1 Regra canônica

A decisão pertence ao Article e considera somente a Principal vigente:

| Fato da Principal | Estado | Fonte | Handoff |
|---|---|---|---|
| score >= 0 e < 0.25 | YES | FULL_KGR_RULE | permitido após outros gates |
| score >= 0.25 + applicable | PENDING_HUMAN_DECISION até SIM/NÃO humano | AWAITING_HUMAN_DECISION/HUMAN_DECISION | bloqueado enquanto pendente |
| score >= 0.25 + not_applicable | NO | KEYWORD_APPLICABILITY_RULE | permitido após outros gates |
| score >= 0.25 + aplicabilidade pendente | PENDING_APPLICABILITY | AWAITING_KEYWORD_APPLICABILITY | bloqueado enquanto pendente |
| ausente, inválido ou negativo | ABSENT | MISSING_KGR_SCORE | ausência explícita; nunca zero |

IA, SERP, volume, resultados, secundária ou reforço não escolhem a decisão.
A KeywordDNA e seus fatos permanecem intactos.

### 5.2 Contrato único proposto

Evoluir ArticleKgrIdentitySchema como o único envelope de decisão. Não criar
articleKgrFinal paralelo. O envelope deve conter:

- brandId, articleId, workflowItemId e identidade da working copy/versão;
- principalKeywordId e referência KeywordDNA com id, versão e hash;
- score e aplicabilidade efetivamente usados;
- decision: YES, NO, PENDING_HUMAN_DECISION, PENDING_APPLICABILITY ou ABSENT;
- decisionSource, decisionReason e versão do contrato da regra;
- decidedBy/decidedAt somente em ato humano compatível;
- referência opcional de SERP, sem autoridade sobre fatos upstream;
- sourceVersion, sourceHash e provenance;
- projeções legadas de isKgrArticle/status/bindingStatus durante a transição.

A projeção booleana não distingue NO, ABSENT e pendência. O estado discriminado
é a fonte de verdade; projeções não podem gerar dual-write ambíguo.

### 5.3 Working copy, aprovação e Principal

A implementação futura salvará o envelope no payload durável do workflow, ou
em referência versionada ligada a ele, sempre com marca, Principal, KeywordDNA,
actor, timestamps e histórico. O PATCH deverá validar brandId server-side,
workflowItemId e expectedLock; lock obsoleto rejeita sem sobrescrever.

A working copy pode estar pendente, mas aprovação e handoff editorial ficam
bloqueados. ArticleDNA aprovado é imutável. Ao trocar a Principal, a decisão
anterior não é reutilizada: a nova referência é validada e a matriz é aplicada
novamente. A decisão antiga permanece no histórico.

Mesmo conteúdo não cria sucessora. Mudança real de Principal, decisão,
referência/hash ou contrato cria nova versão. Slug, URL e canonical publicados
continuam protegidos.

### 5.4 Downstream

ArticleDNA carrega a referência única da decisão e as referências individuais
das KeywordDNAs. Radar recebe a decisão formada; pode diagnosticar SERP, mas
não recalcula KGR nem reabre arquitetura. Pendência bloqueia o pacote que
dependa dela; apresentação ausente não bloqueia o handoff.

## 6. Subcontrato B — Keyword Contextual Presentation

### 6.1 Autoridade

A entrada é Keyword/KeywordDNA, BrandDNA, Brand Voice, skills válidos e
contrato de geração. A saída é texto complementar. Ela não é KeywordDNA,
ArticleDNA, decisão KGR, intent, funnel, SERP ou aprovação. SERP permanece
evidência externa; apresentação permanece contexto de marca.

### 6.2 Storage proposto

A opção preferencial é uma relação dedicada, com nome provisório
public.minerador_keyword_contextual_presentations. Ela não existe comprovadamente
no estado local e não será criada nesta tarefa. O registro versionado deve
preservar id, brandId, keywordId, referência/version/hash da KeywordDNA,
texto, status, versão, Brand Voice/BrandDNA e skills com seus hashes e versões,
provider/model autorizado, request/execution IDs sanitizados, input/output
hashes, actor, timestamps e referência anterior/sucessora.

Segredos não entram no registro. ai_review não será reutilizado. O ponteiro da
apresentação é opcional; ausência produz presentationRef = null.

### 6.3 Geração, save, readback e F5

O fluxo futuro será: ação explícita → autorização server-side → geração
estruturada → validação → save → readback canônico → retorno à working copy →
F5 lendo a referência, sem provider → handoff por referência. Falha,
truncamento ou JSON inválido preserva a última saída válida. O Arquiteto não
gera novamente nem substitui a apresentação.

### 6.4 Idempotência

A chave idempotente combina hash de KeywordDNA, Brand Voice, contexto e
versão do gerador. Mesmo input não duplica nem cria sucessora; mudança material
cria sucessora e preserva histórico. Diagnóstico não altera versão estrutural
do Article.

## 7. Arquivos, consumidores e compatibilidade

| Arquivo/área | Mudança futura | Regra preservada |
|---|---|---|
| lib/arquiteto/contracts.ts | evoluir envelope único KGR | ArticleKgrIdentity sem paralelo |
| lib/arquiteto/article-kgr-decision.ts | ligar matriz à persistência/gates | limite 0.25 e ABSENT |
| lib/arquiteto/adapters.ts | formar decisão da Principal vigente | KeywordDNA imutável |
| app/api/arquiteto/workspace/route.ts | campo aditivo + lock/tenant | payload legado legível |
| lib/server/pipeline-repositories.ts | save/readback no workflow | conflito otimista |
| lib/arquiteto/canonical-persistence.ts | referência no ArticleDNA | versões antigas legíveis |
| lib/arquiteto/minerador-handoff.ts | presentationRef opcional | ausência não bloqueia |
| lib/server/arquiteto-workspace.ts | carregar referência | sem nova IA |
| lib/radar/strategy-context.ts | consumir estado discriminado | Radar não decide KGR |
| app/api/minerador/marcas/[brandId]/ia/brief-apresentacao/route.ts | save/readback explícito | ação explícita |
| modules/minerador/minerador-workspace.tsx | hidratar referência | não usar browser storage |

Todas são áreas para implementação posterior. Nenhum arquivo acima foi
alterado nesta tarefa além desta SDD.

A evolução será aditiva: campos ausentes permanecem legíveis; apresentação
null é válida; não haverá backfill inventado; refs, IDs, versões, hashes,
histórico, marca, slug, URL e canonical publicados serão preservados.

## 8. Persistência e migrations

Article KGR usará o workflow payload e ArticleDNA existentes. Assim, não há
nova tabela obrigatória identificada nesta auditoria e
KGR_MIGRATION_REQUIRED = NO no desenho atual, sujeito ao preflight remoto. Se
limites ou catálogo exigirem relação própria, será nova decisão e migration.

A apresentação dedicada, se confirmada, exigirá migration futura ainda sem
número. Antes dela: catálogo remoto, contrato de ponteiro/handoff, RLS, grants,
índices, versionamento, snapshot e rollback. Não editar migrations históricas
nem assumir que a relação existe remotamente.

## 9. RLS, autorização e tenantização

O contrato é brandId = public.marcas.id e actorUserId = auth.uid()/identidade
Auth. A implementação futura reutilizará resolução server-side, membership,
canonical actor/action checks, filtros de marca, lock_version e service role
somente no servidor. Owner, slug e nome não substituem tenant.

Para KGR, nenhuma policy nova é necessária no desenho que usa workflow
existente; policies/grants remotos seguem **PENDENTE DE CONFIRMAÇÃO NO CATÁLOGO
REMOTO** quando não comprovados.

Para a apresentação proposta: SELECT autenticado na mesma marca; escrita
somente em caminho server-side autorizado; anon/PUBLIC sem acesso; sem leitura
cross-brand; versões confirmadas append-only; falha não remove a última saída;
actor, membership e brandId conferidos. Isso é proposta, não estado remoto.

## 10. Versionamento e readback

Working copy usa lock otimista. ArticleDNA aprovado e apresentação confirmada
são imutáveis por versão; sucessora somente com mudança real. Hashes devem ser
canônicos e não incluir React state, localStorage, IndexedDB, UI ou diagnóstico
não estrutural.

Prova obrigatória:
request → autorização → save → readback canônico → reload/F5 → handoff.
Nenhuma mensagem de sucesso se baseia apenas no retorno da chamada local.

## 11. Handoffs

Minerador → Arquiteto continua entregando KeywordDNA, status, versão, hash e
marca. Pode acrescentar presentationRef opcional e resumo read-only. O
Minerador não decide Article KGR.

Arquiteto → Radar → Planejador entrega ArticleDNA, SiloDNA/SiloPage,
InternalLinkGraph, decisão KGR consolidada e apresentação por referência. Radar
separa evidence de contexto e Planejador não refaz investigação. Decisão KGR
pendente bloqueia o pacote; presentationRef null é aceito.

## 12. Alternativas e ordem futura

Rejeitados: somente booleano KGR; segundo articleKgrFinal; React state;
localStorage/IndexedDB como canônico; relação genérica sem preflight.
Preferidos: envelope ArticleKgrIdentity único no workflow/ArticleDNA e storage
dedicado versionado para apresentação, condicionado a catálogo/RLS/migration.

Ordem: aprovar SDD; preflight remoto; implementar envelope/gates KGR; save,
readback e versionamento; storage da apresentação; presentationRef; adaptar
ArticleDNA/Radar; testes; smoke autenticado; avaliar operação remota.

## 13. Riscos e rollback

Riscos: duas fontes de decisão; ausência tratada como zero; decisão reutilizada
após troca da Principal; apresentação virar autoridade SEO; perda após F5;
cross-brand; consumidor externo do payload; credencial no browser.
Mitigações: envelope único, ABSENT, refs/version/hash, separação SERP/contexto,
readback, brand/RLS/actor, compatibilidade aditiva e server-only.

Antes de implementar, capturar snapshot. Rollback deve preservar versões,
decisões e apresentações confirmadas, interromper somente a nova escrita,
manter leitores legados e não usar CASCADE ou limpeza de browser como
recuperação.

## 14. Testes e smoke planejados

Nenhum teste de implementação foi executado nesta auditoria. A futura bateria
deve cobrir matriz KGR completa (incluindo 0.25, ausência, inválido, negativo),
decisão humana, bloqueio pendente, save/readback/F5, troca de Principal,
histórico, idempotência, sucessora, lock obsoleto, ArticleDNA imutável,
isolamento cross-brand e Radar sem recálculo.

Para apresentação: ação explícita, save/readback/F5 sem provider, null
opcional, import sem IA, retry idempotente, sucessora, preservação em falha,
separação de autoridade, isolamento e ausência de credencial no browser.
Testes negativos persistentes usarão transação isolada com rollback ou fixture
local equivalente.

Smoke manual futuro: formar Principal; observar estado; salvar pendência e
confirmar bloqueio; decidir humanamente; trocar Principal; gerar apresentação;
confirmar readback/F5; importar sem nova geração; verificar provenance e
isolamento. Não autorizado por esta SDD.

## 15. Operações manuais e gates

O usuário deverá aprovar esta SDD, o plano, eventual migration, configuração
necessária e smoke. Aplicação remota, login, validação de produção, commit,
push e deploy permanecem manuais e fora desta entrega.

Nenhuma implementação começa sem aprovação explícita, contrato único KGR,
storage contextual definido, preflight remoto, RLS/grants/rollback/testes
revisados e autorização específica. Estado desta entrega:

- ARTICLE_KGR_DECISION_IMPLEMENTATION = BLOCKED_UNTIL_SDD_APPROVAL;
- CONTEXTUAL_PRESENTATION_PERSISTENCE = BLOCKED_UNTIL_SDD_APPROVAL;
- REMOTE_MIGRATION = NOT_AUTHORIZED;
- REMOTE_OPERATION = NOT_AUTHORIZED.

## Conclusão

O primeiro gap é persistência e governança da decisão do Article, não
requalificação da Keyword. O segundo é persistência e handoff de contexto, não
nova autoridade SEO. A proposta preserva a fronteira
Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações,
BrandDNA → KeywordDNA → ArticleDNA e todos os IDs, versões, hashes, histórico,
marca e decisões humanas.

**READY_FOR_USER_SDD_REVIEW = YES**

**REMOTE_OPERATIONS = 0**

**PAID_PROVIDER_CALLS = 0**

**MIGRATIONS_EXECUTED = 0**
