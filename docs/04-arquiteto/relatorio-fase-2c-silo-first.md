# Relatório — Fase 2C do Arquiteto (Silo-first)

**Data:** 2026-09-03 · **Escopo:** consolidação de Silo a partir de Território confirmado.

Este documento serve a três leitores: quem precisa saber **o que mudou**, quem
precisa entender **por que mudou assim**, e quem vai continuar o
desenvolvimento e precisa saber **o que não pode ser desfeito sem quebrar a
fase**.

---

## 1. Por que esta fase existiu

O Arquiteto nasceu com o fluxo `ARTIGOS → SILO`: agrupava ArticleDNAs por
similaridade e o Silo aparecia como consequência do agrupamento. O problema é
que similaridade lexical não distingue "mesmo assunto" de "mesma linha
editorial da Marca" — o Silo saía sem uma razão editorial que alguém pudesse
defender.

O fluxo canônico foi invertido para:

```
TERRITÓRIO → ARTIGOS → CONSOLIDAÇÃO DO SILO → LINKS INTERNOS → RADAR
```

Território é o estado de **trabalho** da arquitetura: mutável, reversível, com
identidade própria. Ele carrega a entidade central, a intenção macro, a
fronteira e a **narrativa** — o que responde *por que* estes artigos pertencem
juntos. O Silo só nasce na consolidação, depois dos Artigos confirmados, e
herda essa razão em vez de reinventá-la.

A 2C é a fase que fecha a metade final desse caminho: da working copy de Silo
até os artefatos consolidados.

---

## 2. O que foi feito

### 2.1 Recuperação do `lib/arquiteto/territory.ts`

Um script meu de edição por faixa de linhas apagou 814 das ~1.090 linhas do
arquivo. Ele era untracked no git, então não havia restore.

A reconstrução partiu **exclusivamente** do JavaScript transpilado no cache do
tsx — nada foi reescrito de memória. O resultado tem 1.032 linhas e os 61
exports de runtime do bundle original, conferidos um a um.

A transpilação apaga o que só existe em tipo, e isso custou um campo:
`actorUserId` em `TerritorySplitRequest` e `TerritoryMergeRequest`. Os planos
nunca leem esse campo — ele só viaja até virar `MembershipOperation` — então o
JS não o preserva. O typecheck o denunciou e ele foi reconstruído a partir dos
13 call-sites nos testes.

> **Lição registrada:** nunca editar fonte deste repo com script de faixa de
> linhas. Usar âncora única com verificação de unicidade, ou `Edit`/`Write`.
> O modo de falha é silencioso — o script termina com sucesso.

### 2.2 Preservação da narrativa territorial

`SiloDNA` ganhou `territoryNarrative?: TerritoryNarrativeSchema` — cópia fiel de
`Territory.narrative`, nunca redigida no Silo.

Existe porque a estrutura não reconstitui a razão: papéis, ordem e links
descrevem *como* o Silo é montado, e várias narrativas diferentes produzem a
mesma lista ordenada. Sem o snapshot, a razão editorial some na consolidação.

Não se confunde com `narrativeOrder` (sequência de leitura dos artigos) nem com
`SiloDNA.boundary` (prosa livre, legada). O binding compara o snapshot como
**igualdade exata**, incluindo a ordem de `rationale` — ao contrário da
fronteira, que é conjunto. Ausência tem código próprio
(`TERRITORY_NARRATIVE_MISSING`) para não se confundir com divergência: "perdi a
razão no caminho" não é "o humano mudou a razão".

O campo é opcional no schema por retrocompatibilidade; a obrigatoriedade vive
no gate de **nova** consolidação.

### 2.3 Gate próprio de aprovação da SiloPage

`lib/arquiteto/silo-page-approval.ts` — 212 linhas, domínio puro.

Até aqui, `siloPageStatus = 'approved'` era fail-closed porque não havia com o
que conferir. Agora há. **SiloDNA aprovado não aprova SiloPage:** o DNA é a
arquitetura, a página é o que vai ao ar. Reaproveitar a decisão de consolidação
para as duas coisas faria uma decisão valer por duas.

A decisão reusa a forma dos contratos existentes — `HumanPillarSelection`,
`SiloConsolidationDecision` — em vez de inventar campos: `actorUserId`,
`decidedAt`, `reason`, e **sobre o que** decidiu (`siloPageVersionId`,
`siloPageContentHash`, `siloDnaVersionId`, `territoryRef`). Essa última parte é
o mesmo remédio do `decidedOverArticleIds` do Pilar: aprovar a versão A e
persistir a B não passa.

Confere `brandId`, `territoryRef`, `siloId`, `siloDnaRef`, `slug`, `canonical`,
`publishedUrl` e `publicationVerification` quando publicada, `pillarArticleId`,
`supportArticleIds` e a estrutura publicável. 14 códigos de bloqueio. IA não
aprova — `actor !== "human"` é recusa.

`refuseStatusEscalation` passou a exigir uma readiness **já resolvida**. Ele não
recalcula de propósito: recalcular criaria duas autoridades sobre o mesmo fato,
capazes de divergir.

### 2.4 Autoridade remota da working copy na interface

Antes, a interface tratava `buildCopy` (estado local de React) como o estado da
working copy. Isso deixava a tela responder "qual é o Pilar?" de dois jeitos: a
proposta local se reescreve a cada formação e a cada aplicação de IA; a linha
remota carrega a decisão humana registrada. Não são a mesma coisa e não empatam.

`lib/arquiteto/silo-working-copy-bridge.ts` resolve a autoridade: **remoto
vence**. A proposta local sobrevive apenas enquanto não existe linha remota para
aquele território.

O território de uma proposta local é **lido** dos `ArticleDNA.territoryRef`, não
inventado. Dois territórios no mesmo grupo é `AMBIGUOUS_TERRITORY` — ambiguidade,
não empate a resolver escolhendo o primeiro.

Na tela, Pilar, Suportes e exclusões passaram a persistir no snapshot remoto com
o `expectedLock` da cópia carregada. Sucesso é o **readback**, não o `setState`.

### 2.5 Dono do envelope de retry

`lib/arquiteto/silo-consolidation-operation.ts`.

`createVersionEnvelope` gera `versionId` e `createdAt` novos a cada chamada, e o
hash acompanha. Se a consolidação falha de forma indeterminada (timeout, rede
caindo entre o commit e a resposta) e a interface reconstrói o envelope para
tentar de novo, a RPC vê uma operação **diferente** — o replay idempotente, que
compara o payload inteiro, não reconhece a repetição. Resultado: escrita dupla
ou recusa espúria.

O envelope agora é construído uma vez e reenviado byte a byte. `operationId` é
determinístico (`silo-consolidation:<territoryRef>:<lock>`) pelo mesmo motivo do
`workingCopyRef`: com id sorteado, um reload no meio da operação perde a
referência e o próximo clique abre outra operação — exatamente a escrita dupla
que se quer evitar.

Falha indeterminada marca `indeterminate` e **guarda** a operação. Descartar é o
que produziria o segundo envelope. Só o readback confirmado encerra.

Isto **não é fonte canônica**. É memória de uma operação em voo, com vida curta.

### 2.6 Caminho canônico único de consolidação

A interface ainda chamava `persistArquitetoSiloPair` — que a 2C.4.6 já havia
travado em draft-only. Na prática **a consolidação estava quebrada na tela**.

Agora vai por `POST /api/arquiteto/silo-consolidation` →
`persist_silo_from_working_copy_atomic`, partindo do snapshot remoto.

---

## 3. As regras que passaram a valer

Estas são as invariantes da fase. Quebrar qualquer uma delas reabre um defeito
que já foi fechado.

### Autoridade

| Pergunta | Quem responde |
|---|---|
| Qual é a arquitetura do Silo? | working copy **remota** |
| Qual é a entidade central, intenção, fronteira e narrativa? | **Território** confirmado |
| Qual versão do ArticleDNA entrou? | linha **remota** versionada |
| Este par pode ser persistido? | **servidor** |
| O que eu já mandei nesta operação? | operação congelada (só isso) |

O browser não é autoridade de nenhum gate. Readiness, confirmação humana,
binding semântico, validação de ArticleDNA e de Território, identidade publicada
e proveniência são todos resolvidos server-side.

### Identidade

Nada de identidade canônica sobe do cliente. `territoryRef` e `workingCopyRef`
são emitidos/derivados pelo servidor, e a rota recusa um draft que já os traga.
Os espaços continuam separados: `territoryRef` ≠ `siloId` ≠ `lista_id` ≠
`articleId` ≠ `workingCopyRef`.

### Decisão humana

Toda decisão registra **ator, momento, motivo e o que estava na mesa**. Sugestão
não é decisão: `pillarSuggestionArticleId` (Lógica/IA) e `pillarSelection`
(humano) são campos distintos, e só o segundo consolida.

### Concorrência

Toda escrita usa o `lock_version` da cópia carregada.

- `STALE_WORKING_COPY` → recarrega o remoto, informa o conflito, **não
  sobrescreve e não faz retry automático**. Reenviar com o lock novo aplicaria a
  edição por cima de uma decisão que ninguém viu.
- `WORKING_COPY_ALREADY_CONSUMED` → território consolidado; a working copy virou
  histórico e a interface fica somente-leitura.

### Independência de status

`siloDnaStatus` e `siloPageStatus` são independentes. A consolidação produz
`approved` / `proposed`. A página sobe por decisão própria.

### Retrocompatibilidade

Campo novo entra **opcional** no schema; a obrigatoriedade vive no **gate de
operação nova**. Vale para `territoryRef`, `workingCopyRef`,
`workingCopyLockVersion` e `territoryNarrative`.

---

## 4. Como o desenvolvimento tem que seguir

**Para adicionar um gate novo:** módulo de domínio puro em `lib/arquiteto/`, sem
storage, sem rota, sem `server-only` (senão os testes não carregam). Ele devolve
uma *readiness*; quem compõe status apenas **consome** a readiness já resolvida.
Não recalcular a mesma regra em dois lugares.

**Para adicionar um campo ao SiloDNA/SiloPage:** opcional no schema, obrigatório
no gate. Se o campo espelha algo do Território, entrar em
`TERRITORY_TO_SILO_DNA_FIELD_MAP` e ser comparado — o mapa é a declaração do que
é equivalência real. O que não tem equivalente fica em
`TERRITORY_STRUCTURE_UNMAPPED_FIELDS`, explicitamente.

**Para mexer na consolidação:** só o caminho canônico. `/api/arquiteto/silos` e
`/api/arquiteto/silo-pair` são legado draft-only e não finalizam nada — a
recusa está na rota **e** no helper, para fechar o bypass por dentro.

**Para mexer na interface:** o sistema visual está congelado — layout 50/50,
GlobalTopbar, planilha única, React Flow, painel expandido, dark mode,
densidade. As mudanças desta fase foram funcionais.

**Para editar arquivos:** nunca script de faixa de linhas. Âncora única com
verificação de unicidade, ou `Edit`/`Write`. Depois de edição estrutural,
conferir o inventário de exports antes de rodar teste.

**Para escrever teste:** asserção estática sobre fonte é válida para provar
fiação, mas o alvo do `regex` não pode aparecer no próprio arquivo de teste —
montar o "needle" por concatenação. E asserção estática **não é** teste
comportamental de PostgreSQL; o comportamento da RPC só se prova no smoke.

---

## 5. Estado da validação

```text
test:arquiteto    735 / 734 / 1     única falha: asserção estática do Minerador (conhecida)
test:marca         81 /  81 / 0
test:editorial     20 /  16 / 4     baseline pré-existente
test:operational   50 /  41 / 9     pré-existente (ver §6)
test:authz         25 /  23 / 2     pré-existente (ver §6)
test:redator        3 /   3 / 0
TypeScript                          5 pré-existentes · 0 novos
Lint                                0 erro / 0 aviso nos 7 módulos novos e alterados
git diff --check                    limpo
NEW_DDL = 0 · NEW_MIGRATION = 0 · PROVIDER_CALLS = 0
```

`tests/arquiteto-silo-phase-2c-closure.test.mts` — 25 testes cobrindo autoridade
remota, concorrência, envelope de retry, gate da SiloPage, identidade publicada
e bloqueio do legado.

Duas asserções antigas ficaram obsoletas **por decisão desta fase** e foram
atualizadas, não removidas: o teste 23 de `silo-dna-binding` afirmava que o gate
da SiloPage não existia, e o de `structural-foundation` exigia
`persistArquitetoSiloPair` na consolidação.

---

## 6. O que ficou aberto

### Vão real: a decisão de aprovar a SiloPage não tem tela

O gate existe e é aplicado server-side. **Mas não há superfície na interface
para um humano tomar essa decisão.** A consolidação envia
`siloPageStatus: "proposed"` e `siloPageApproval: null` fixos, e nenhum outro
ponto da UI monta uma `SiloPageApprovalDecision`.

Consequência prática: hoje uma SiloPage **não pode** ser aprovada por nenhum
caminho. Isso é fail-closed correto, não um bug — mas é um passo do fluxo que
falta construir, e o passo **J** do smoke não pode ser executado até lá.

O contrato e a rota já aceitam a decisão; falta o controle na tela que a monta e
a envia.

### Smoke pendente

`docs/04-arquiteto/smoke-silo-consolidacao-2c.md` — roteiro A→Q com placeholders
e SQL somente-leitura. Execução manual, pelo PLANNER. Nenhum passo chama
provider.

### Falhas pré-existentes não fechadas

9 em `test:operational` e 2 em `test:authz`, todas assertando trechos de
`arquiteto-workspace.tsx` que esta fase não tocou —
`getCurrentSupabaseToken()`, `minerador_keyword_lists`, `h-screen min-h-0`,
`buildKeywordReviewBatches`, `Zona de segurança`, `Processar lógica`. É deriva
da refatoração canônica já presente na árvore de trabalho e não commitada: o
código migrou para `loadCanonicalArquitetoWorkspace` e os testes seguem cobrando
a forma antiga.

**Não são desta fase, e também não são desta fase para fechar** — alguém precisa
decidir se atualiza a asserção ou reverte o código.

### Lint da interface

`modules/arquiteto/arquiteto-workspace.tsx` tem 61 erros de lint, o mesmo número
de antes desta fase. Os 3 que caem em regiões tocadas são as mesmas linhas já
sinalizadas antes. Os módulos novos estão limpos.

### Itens ainda registrados de fases anteriores

- `CAN_TWO_RUNNING_RUNS_EXIST_FOR_SAME_SITEMAP = YES` (Marca A2)
- migração `0047` purga por `source_entity_id` sem filtrar `subject_type` —
  contornado por refs prefixados
- `.git/index.lock` obsoleto bloqueia escrita de índice

---

## 7. Arquivos

**Novos**

| Arquivo | Linhas | Papel |
|---|---|---|
| `lib/arquiteto/silo-page-approval.ts` | 212 | gate próprio da SiloPage |
| `lib/arquiteto/silo-working-copy-bridge.ts` | 283 | proposta local ↔ autoridade remota |
| `lib/arquiteto/silo-consolidation-operation.ts` | 177 | dono do envelope de retry |
| `lib/arquiteto/territory-narrative.ts` | 23 | primitivo isolado da narrativa |
| `tests/arquiteto-silo-phase-2c-closure.test.mts` | 587 | 25 testes de fechamento |
| `docs/04-arquiteto/smoke-silo-consolidacao-2c.md` | 209 | roteiro do smoke |

**Alterados**

| Arquivo | O que mudou |
|---|---|
| `lib/arquiteto/territory.ts` | reconstruído (1.032 linhas, 61 exports) |
| `lib/arquiteto/contracts.ts` | `SiloDNA.territoryNarrative` |
| `lib/arquiteto/silo-dna-binding.ts` | binding da narrativa · gate da página passou a `PRESENT` |
| `lib/arquiteto/canonical-workspace.ts` | WC e territórios remotos no snapshot · clientes de create/update/consolidação |
| `lib/server/arquiteto-silo-consolidation-adapter.ts` | narrativa + readiness da SiloPage |
| `app/api/arquiteto/silo-consolidation/route.ts` | campo `siloPageApproval` |
| `modules/arquiteto/arquiteto-workspace.tsx` | autoridade remota · decisões persistidas · caminho canônico |

Duas migrations da 2C já aplicadas remotamente, **não** reexecutar:
`20260902140000_silo_pair_territory_consolidation_atomic.sql` e
`20260902150000_silo_working_copy_transactional_writers.sql`.
