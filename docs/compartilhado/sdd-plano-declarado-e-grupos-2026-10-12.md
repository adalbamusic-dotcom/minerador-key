# SDD — Plano declarado, grupos por cor e guarda de retrabalho — 2026-10-12

> **Status: APROVADA PELO DONO em 2026-10-12 — entrega em fases (§15).**
> Decisões da §17 registradas na §18. F1 (grupos no Minerador), a ampliação
> do Silo (D3) e a F2 (grupo no Arquiteto e no Radar, leitura por grupo) foram
> implementadas em 2026-10-12 (ver `docs/03-minerador/estado-atual.md`,
> `docs/04-arquiteto/estado-atual.md` e `docs/05-radar/estado-atual.md`);
> F3 e F4 (plano declarado) foram implementadas em 2026-10-12 (§18.1); a F6
> (Radar, Redator, Publicações e MCP por grupo) também, em 2026-10-12 (adendo F6
> no §18.1); a interface dos grupos e do plano (Gerenciar a cor, Histórico do grupo,
> selos do plano no Arquiteto e "Tirar do plano") também, em 2026-10-12 (adendo
> no §18.1); a F5 (guarda de retrabalho) também, em 2026-10-12 (adendo F5 no
> §18.1). Migration, SQL remoto, commit, push e deploy
> continuam com o dono (`AGENTS.md` §15). Toda leitura de banco citada aqui foi
> `SELECT` (`npx supabase db query --linked`), em 2026-10-12.

## 0. Resumo para o dono

O plano que você cadastrou no Minerador (Silo "Planos e contratação", 8
artigos com Assunto, principal, papel e descrição) chegou ao Arquiteto só pela
metade. Hoje a plataforma só sabe guardar a **frase** do Assunto; a principal,
o papel, a descrição e o próprio Silo planejado não têm onde morar. O Arquiteto
então fez o que faz sem plano: escolheu principal pela heurística, deixou o
Pilar para o `pillarScores` e transformou sobra de pesquisa em artigo solto.

A proposta tem três partes, que se entregam em fases:

1. **Plano declarado.** O plano vira um registro do Minerador: o Silo (nome,
   slug, objetivo) mora no **grupo**; cada artigo (ordem, papel, descrição,
   principal declarada) mora na declaração do Assunto, dentro do pacote
   aprovado. A principal declarada é cabeceira fixa e se aprova sem volume,
   como o Assunto. O Arquiteto forma pelo **mesmo caminho de hoje**, só que
   obedecendo ao plano: não troca a principal, usa o papel declarado no Silo, a
   descrição vira a promessa do ArticleDNA, as sustentações saem primeiro da
   lista que a Pesquisa por Assunto já trouxe, e nada do grupo vira artigo
   solto.
2. **Grupos por cor.** Um grupo (nome + cor da paleta) nasce no Minerador e
   etiqueta keywords; artigos, Silo, itens do Radar e documentos herdam o grupo
   pelo artigo. As três planilhas ganham um seletor de grupo no topo, e o
   servidor passa a ler **só o grupo ativo** — o que também tira o peso da mesa
   (hoje ~11 MB na marca AdalbaPro).
3. **Guarda de retrabalho.** Um guarda único, chamado pelo núcleo de cada
   operação, compara os insumos com o que já foi feito e avisa **antes do
   clique**: "já feito com os mesmos insumos", "a mesma recusa já aconteceu",
   "isto trocaria o que você declarou". Fica registrado no histórico do grupo.

Nenhuma chamada paga nasce desta SDD. A única migration (M1) cria o grupo; o
plano declarado não tem migration (jsonb aditivo), mas exige deploy em duas
fases (A lê, B grava), como o Assunto em 2026-09-24.

## 1. Identificação

- **Módulo proprietário:** Minerador (o plano e o grupo nascem nele). Cada
  fase declara o seu próprio dono: F3/F4 Arquiteto, F6 Radar/Redator.
- **Módulos consumidores:** Arquiteto, Radar, Redator, Publicações (só leitura
  do grupo pelo artigo), MCP (`lib/server/platform-mcp-tools.ts`) e catálogo
  (`lib/agent/platform-catalog.ts`).
- **Data:** 2026-10-12. **Aprovação humana:** dono do produto.
- **Provider/capability:** nenhum novo. Nenhum custo novo por padrão.
- **Tipo de mudança:** estrutural (nova entidade, coluna nova, contrato de
  pacote aprovado ampliado, regra de aprovação, workflow de formação) —
  exige esta SDD e autorização (`AGENTS.md` §4).
- **Fontes lidas:** `AGENTS.md`; ADR-022; `template-proposta-evolucao-modular.md`;
  `sistema-visual.md` §5 e §8; SDD do Assunto (2026-09-24); SDD da SERP no
  artigo (2026-09-28); memória do dono "o caminho do piloto é o de tudo, sem
  nada paralelo; o Radar se adapta ao Arquiteto".

## 2. Contrato atual (verificado no código)

As linhas citadas são do commit `985dad0` (HEAD da branch
`resgate/trabalho-nao-commitado-2026-09-05`). Em 2026-10-12 a árvore de
trabalho tem mudanças **não commitadas** de outra sessão que tocam o mesmo
assunto (estado: **Ainda não verificado** — não commitado, não homologado):

- `lib/arquiteto/article-improvement-reuse.ts` (novo) e
  `lib/server/arquiteto-article-improvement.ts`: impressão digital dos insumos
  da preparação (`improvementInputsFingerprint`), reaproveitamento por 24 h
  (`IMPROVEMENT_REUSE_WINDOW_MS`, `reusedFromRunId`), busca nova no Google Ads
  só com `discover: true` no pedido, IA e busca registradas em
  `integration_usage_events`;
- `lib/arquiteto/silo-consolidation-operation.ts`: recusa de domínio anterior
  à RPC descarta a operação congelada em vez de reenviar o mesmo corpo
  (`siloConsolidationFailureDisposition`) e o fechamento sem site declarado é
  dito antes do clique (`siloPageCanonicalRefusal`).

Esta SDD **não duplica** esse trabalho: a guarda do §10 o adota como primeira
instância (C13, C14 e o fechamento) e generaliza a regra para as demais
operações.

| # | Onde | O que faz hoje | Consequência no plano do dono |
|---|---|---|---|
| C1 | `lib/minerador/keyword-subject.ts:58-63` | `KeywordSubjectDeclaration = { declared, note, destinationUrl, destinationCheck }` em `analise_semantica.keyword_subject` | Não há campo para principal, papel, descrição, ordem nem Silo. |
| C2 | `lib/minerador/keyword-dna.ts:116-123` | `KeywordDna.subject` `.strict()` com `declared, note, destinationUrl, declaredBy, declaredAt, origin` | Qualquer campo novo no Assunto é recusado por leitor antigo: precisa Fase A. |
| C3 | `lib/minerador/approved-package.ts:95-98` | Exceção D2: Assunto declarado dispensa Volume e KGR; Lógica exigida | Só o **Assunto** tem a exceção; a principal digitada é keyword comum e fica presa sem Volume. |
| C4 | `lib/server/platform-mcp-tools.ts:721-765` | `declare_subjects` recebe `{ keyword, note, destinationUrl }` | O MCP também não tem como declarar o plano. |
| C5 | `lib/agent/silo-plan.ts:33`, `:45-52`, `:118-122` | `SiloPlanSchema` tem `targetKeyword` e `role`, mas só **valida** (não grava); teto `SILO_ARTICLE_RANGE = { min: 4, max: 7 }` (em 2026-10-12, por D3, passou a `{ min: 4, max: 30 }`) | O plano de 8 artigos seria bloqueado; papel e principal morrem na conversa. |
| C6 | `lib/arquiteto/article-formation-priority.ts:284-293` | Assunto sem Volume: principal = `suggestPrincipal` entre as elegíveis **com volume** (`:508`) | Principal declarada sem volume nunca é elegível; a heurística escolhe outra. |
| C7 | `lib/arquiteto/article-formation.ts:413-470` | `suggestPrincipal`: centralidade, especificidade, KGR, volume | É a origem de "claro ou vivo" e "contratar internet residencial". |
| C8 | `lib/arquiteto/article-formation-priority.ts:792` | Excedente com `motivo === "dna"` forma artigo **sozinho** (`gruposNovos`, sem Assunto) | "plano vivo controle" (49.500) virou artigo solto com `subject` nulo. |
| C9 | `lib/arquiteto/article-formation-confirmation.ts:532-546` | Gate `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` (só Assunto como principal) | Não existe gate "principal declarada preservada". |
| C10 | `lib/arquiteto/adapters.ts:257` | `promise: text(semantic.promessa, "Cobrir com clareza o tema …")` | A descrição do plano não chega: todos os 8 ArticleDNA têm a moldura genérica. |
| C11 | `lib/arquiteto/silo-formation.ts:251-257` | `pillarScores` ordena; `pillar = null` até `chooseSiloWorkingCopyPillar` (`:374`) | O papel declarado não existe como insumo; o Pilar saiu da sugestão. |
| C12 | `lib/arquiteto/article-improvement.ts:338-346` | Alvo `kind: "subject"`: `needsPrimary` troca a principal quando aparece candidata com mais volume | A melhoria trocaria de novo a principal declarada. |
| C13 | `lib/server/arquiteto-article-improvement.ts:391` | Cada `prepare` cria `runId: randomUUID()` novo, mesmo com os mesmos `sourceHashes` | 9 execuções com os mesmos 8 alvos na WifiConecta (§3). Em curso na árvore: reaproveitamento por impressão digital. |
| C14 | idem `:398` e `:405` | IA na lista (`readEditorialAi`) e busca no Google Ads (`discover`) rodam a cada `prepare` | IA paga repetida 9 vezes; o Google Ads é consultado mesmo quando o Assunto já tem lista. Em curso na árvore: busca só a pedido. |
| C15 | idem `:874` | `importSubjectDiscoveryWithCore({ subjectKeywordId: null, … })` | Keyword nova trazida pela melhoria de um Assunto entra sem ligação com o Assunto. |
| C16 | `modules/minerador/minerador-workspace.tsx:1641-1659` | Listagem lê `minerador_keywords_listagem` inteira da marca (`.eq("brand_id")`) | Sem recorte por grupo. |
| C17 | `lib/server/arquiteto-workspace.ts:100`, `:126-133`, `:486-500` | Mesa do Arquiteto lê índice de todas as keywords, todos os itens `keyword/architect` e todos os artefatos da marca | Sem recorte por grupo. |
| C18 | `app/api/editorial/workspace/route.ts:56-65`; `lib/server/editorial-repositories.ts:85-86`, `:178-197` | GET da mesa agrega 8 repositórios, todos por `marca_id`; artefatos = todas as versões de ArticleDNA/SiloDNA; workflow = `stage = 'radar'` (qualquer `subject_type`) | ~11 MB na AdalbaPro (4,17 MB Radar + 6,55 MB ArticleDNA, medido em 2026-10-09). |
| C19 | `components/editorial-pipeline-context.tsx:502`; `modules/arquiteto/arquiteto-workspace.tsx:5001` | Os dois consumidores da mesa | Precisam aceitar leitura parcial sem apagar o resto. |
| C20 | `public.minerador_keyword_lists` (`id, nome, nicho, marca_id`) | "Listas" antigas de KGR; a WifiConecta tem **zero** | Não servem de grupo (§5.1). |

## 3. O que aconteceu na WifiConecta (lido no banco, 2026-10-12)

Marca `d4fa133a-13bd-4bf7-bfd1-d0f22253f223`: 56 keywords vivas, 8 Assuntos
declarados (todos com `note = null`), nenhuma lista, nenhum documento, nenhuma
publicação, nenhum item do Radar.

| Art. | Assunto (id) | Principal hoje (ArticleDNA vigente) | Principal declarada (linha no Minerador) | Situação |
|---|---|---|---|---|
| 1 | `4339882e` Como escolher o melhor plano… | melhor plano de internet residencial (260) · v2 | a mesma | certo |
| 2 | `04320a9b` Internet residencial barata… | internet residencial barata (1.600) · v3 | a mesma | certo |
| 3 | `6d5d87cd` Claro, Vivo ou TIM… | **claro ou vivo** (590) · v3 | `65bf5bc8` Claro Vivo ou TIM internet — **bruto, sem volume** | corrigir |
| 4 | `f6c2f85e` Operadoras no meu CEP | internet disponível no meu cep (260) · v2 | a mesma | certo |
| 5 | `9df07c7b` 300, 500, 600 Mega ou 1 Giga | **sem artigo** | `f7a6c14b` quantos Mega de internet preciso — **bruto, sem volume** | criar |
| 6 | `d59f40a5` Combo internet, celular e TV | combo internet celular e TV (20) · v3 | a mesma | certo |
| 7 | `4ac4d315` Sem fidelidade | internet residencial sem fidelidade (170) · v1 | a mesma | certo |
| 8 | `a1306160` Contratar em São Paulo | **contratar internet residencial** (390) · v4 | `11a34ba3` contratar internet residencial em São Paulo — **bruto, sem volume** | corrigir |

Outros achados:

- **Artigo solto:** `article-candidate:territory:9c75c3a7…:679b1bb2` = "plano
  vivo controle" (49.500), ArticleDNA v1 aprovado, `subject` nulo. A keyword
  veio da pesquisa do Assunto 6 (`subject_discovery.subjectKeywordIds =
  [d59f40a5]`) e virou artigo pelo passo 4 (C8).
- **Silo:** `territory:9c75c3a7…` consolidado às 18:30, nome "planos de
  internet", SiloPage `planos-de-internet`, **Pilar = artigo 3** (Claro/Vivo/TIM),
  com "plano vivo controle" entre os suportes e sem o artigo 5. O nome "Planos e
  contratação", o objetivo e o Pilar declarado não estão gravados em lugar
  nenhum.
- **Sobras de import:** `5ea8448a` "Planos e contratação" (o nome do Silo
  entrou como keyword) e `e2fe761a` "Palavra-chave: internet disponível no meu
  CEP" (o rótulo foi colado junto). As duas estão `bruto`.
- **Retrabalho medido:** 9 execuções de "Melhorar publicados e formar
  Assuntos" (`article_improvement_run`) com **os mesmos 8 alvos** entre 16:31 e
  17:58, todas com leitura de IA; a primeira pagou 64 consultas SERP (até US$
  0,224), a segunda 4 (US$ 0,014); 4 ficaram em `prepared` sem uso. 54
  pareceres de composição (40 `inconclusive`). Ledger: 132 operações do
  Arquiteto (176 requisições) e 13 do Minerador em `integration_usage_events`.

## 4. Princípios desta proposta

1. **Um caminho só.** O plano entra como **restrição** do formador que já
   existe (`reservePriorityArticleGroups` e `planArticleImprovements`); não
   nasce um "formador de plano". O piloto é o caminho de tudo.
2. **Declarado é humano.** Plano, principal declarada e papel são declarações
   humanas com ator e data (ADR-022, item 5). A IA pode propor; só vale depois
   do aceite (MCP com `userConfirmation`).
3. **O grupo é organização, não significado.** Mudar nome, cor ou grupo de uma
   keyword não muda hash de pacote, não rebaixa aprovação e não gera versão.
4. **O plano é significado.** Principal, papel e descrição entram no pacote
   aprovado (hash) — senão seriam um segundo leitor do fundamento do artigo,
   alternativa já rejeitada no ADR-022.
5. **O Radar se adapta.** O Radar lê o grupo pelo artigo e a nova versão do
   ArticleDNA pela "Atualização disponível" de sempre; nunca pede reenvio.
6. **Nada pago automático.** Nenhuma fase liga chamada paga sem clique humano
   com prévia de custo.

## 5. Modelo de dados

### 5.1 Escolha: o grupo é entidade própria; o Silo planejado é a origem dele

**Decisão proposta:** tabela `public.editorial_groups`. Um grupo de origem
`declared_plan` carrega o Silo planejado (nome, slug, objetivo) e, quando o
Silo é consolidado, aponta para ele (`silo_id`, 1:1 por marca).

Por que não "o Silo é o grupo":

- o grupo precisa existir **no Minerador, antes de qualquer Silo**; o Silo é
  artefato do Arquiteto (`territory:…`), e fazer o Minerador depender dele
  inverteria a fronteira (`AGENTS.md` §2);
- o território tem ciclo próprio (`candidate → confirmed → consolidated`,
  `rejected`, `absorbed`, `split`, ver `lib/arquiteto/territory-undo.ts:1-23`):
  a cor sumiria ou mudaria de dono a cada desfazer/dividir;
- há grupos sem Silo novo (um lote de publicados a melhorar, um grupo de
  descoberta) que o dono também quer separar por cor.

Por que não as listas (`minerador_keyword_lists`): são do Minerador antigo de
KGR, sem cor, sem plano, sem ligação com artigo, e `AGENTS.md` §14 fixa a
semântica delas (FK `RESTRICT`, excluir lista nunca apaga keyword). Reaproveitá-
las misturaria dois significados na mesma coluna `lista_id`.

### 5.2 Onde cada dado mora

| Dado | Onde | Dentro do hash do pacote? |
|---|---|---|
| Grupo (nome, cor, status) | `editorial_groups` | não |
| Silo planejado (nome, slug, objetivo) | `editorial_groups.plan` (jsonb) + `plan_version` + `plan_hash` | não (é do grupo); entra no SiloDNA na consolidação |
| Grupo de uma keyword | `minerador_keywords.group_id` (coluna) | não |
| Grupo de um artigo | `editorial_group_articles (marca_id, article_id, group_id)` | não |
| Grupo do Silo | `editorial_groups.silo_id` | não |
| Grupo do item do Radar, documento, publicação | herdado por `article_id` (sem linha nova) | — |
| Artigo do plano: ordem, papel, descrição, principal declarada | `analise_semantica.keyword_subject.plan` do **Assunto** | **sim** |
| Marca de "principal declarada" | `analise_semantica.keyword_declared_principal` da **principal** | **sim** |
| Histórico do grupo | `editorial_group_events` (append-only) | — |
| Registro do guarda | `editorial_workflow_items`, `subject_type = 'operation_ledger'` (§10) | — |

Uma keyword e um artigo têm **no máximo um grupo** (D5). Coluna/PK garantem.

### 5.3 Formato no jsonb (aditivo)

Assunto (`keyword_subject`, C1):

```ts
type KeywordSubjectDeclaration = {
  declared: true;
  note: string | null;
  destinationUrl: string | null;
  destinationCheck: DestinationCheck | null;
  /** NOVO, opcional. Ausente = Assunto sem plano, parse e hash como hoje. */
  plan?: {
    groupId: string;          // uuid de editorial_groups (proveniência da declaração)
    planVersion: number;      // editorial_groups.plan_version no ato
    order: number;            // 1..20, a ordem do plano
    role: "Pilar" | "Suporte";
    scope: string;            // a descrição do escopo: 1..1200 caracteres, sem quebra de linha (D10)
    declaredPrincipal: { keywordId: string; phrase: string } | null;
  };
};
```

Principal declarada (linha da principal, mesmo padrão de chaves de C1):

```
keyword_declared_principal          { subjectKeywordId, groupId, planVersion } | null
keyword_declared_principal_actor    auth.users.id
keyword_declared_principal_at       ISO 8601
keyword_declared_principal_history  append-only
```

`KeywordDna` (C2) ganha, só leitura: `subject.plan?` (mesmo formato) e
`declaredPrincipal?: { subjectKeywordId, groupId, planVersion }`, ambos
`.strict().optional()`.

A reciprocidade (o Assunto aponta para a principal e a principal aponta de
volta) é gravada pelo **mesmo núcleo, na mesma operação**, e conferida na
releitura. Divergência vira conflito visível ("principal declarada sem
reciprocidade"), nunca correção silenciosa.

Grupo (`editorial_groups.plan`):

```json
{ "siloName": "Planos e contratação", "siloSlug": "planos-de-internet",
  "objective": "…", "articleCount": 8 }
```

### 5.4 ArticleDNA e SiloDNA: sem campo novo

O plano chega ao ArticleDNA por campos que **já existem** — por isso não há
fase A/B no Arquiteto:

| Plano | ArticleDNA / SiloDNA |
|---|---|
| principal declarada | `principalKeywordId` |
| papel | `hierarchy` ("Pilar" / "Suporte") e `SiloDNA.pillarArticleId` / `supportArticleIds` |
| descrição | `promise` (no lugar da moldura de C10) |
| ordem | `SiloDNA.narrativeOrder` |
| nome, slug, objetivo do Silo | `SiloDNA.name`, `SiloPage.slug`, `SiloDNA.objective` |
| proveniência | `subject.approvedPackageRef` (já existe) → pacote do Assunto → `plan` |

O guarda (§10) confere a principal e o papel contra o pacote referenciado em
`subject.approvedPackageRef`; não precisa de cópia no ArticleDNA.

## 6. Proposta por módulo

### 6.1 Minerador (proprietário)

1. **Domínio novo** `lib/minerador/declared-plan.ts` (puro): `DeclaredPlanSchema`
   (zod), `parseDeclaredPlanTable(text)` (aceita a tabela colada: cabeçalho do
   Silo + linhas `# | Assunto | Keyword principal | Papel | Descrição`),
   `classifyDeclaredPlan(plan, existing)` e as recusas: 0 ou 2+ Pilares,
   ordem repetida, principal igual ao Assunto sem Volume (D1 do ADR-022 continua),
   principal repetida em dois artigos, slug do Silo inválido
   (`normalizeManualSiloPageSlug`). Limpa rótulos colados ("Palavra-chave:",
   "Assunto:", "Principal:") e **nunca** importa o nome do Silo como keyword.
2. **Núcleo** `lib/minerador/declared-plan-import-core.ts`
   (`importDeclaredPlanWithCore`), modos `preview`/`apply`, idempotente por
   `importRequestId`. No `apply`, numa sequência só e com releitura:
   cria/atualiza o grupo; chama **`importSubjectsWithCore`** (o núcleo de hoje)
   para os Assuntos; importa as principais que não existem pelo núcleo de
   import de sempre; grava `keyword_subject.plan` e
   `keyword_declared_principal` por `setKeywordSubject`/novo
   `setDeclaredPrincipal` (ambos em `keyword-subject.ts`); grava `group_id` nas
   linhas. A lista fechada de chamadores de `tests/minerador-assunto-dominio.test.mts`
   ganha este núcleo.
3. **Aprovação (D2-bis)** em `approved-package.ts:95`: a linha com
   `keyword_declared_principal` dispensa Volume e KGR, como o Assunto; a Lógica
   continua exigida. Motivo próprio: `DECLARED_PRINCIPAL_APPROVAL_REASON`. A trava
   no envio ao Arquiteto (`SERVER_APPROVAL_GATE_SINCE`) aplica a mesma função.
4. **Grupo das sustentações.** `importSubjectDiscoveryWithCore` passa a
   carimbar `group_id` do Assunto na keyword nova (ou na existente sem grupo)
   quando o Assunto tem grupo. Keyword que já está em outro grupo não muda:
   aviso "pertence ao grupo X" (D5).
5. **Atribuição manual**: `lib/minerador/keyword-group-core.ts`
   (`assignKeywordGroupWithCore`), única função que escreve `group_id`
   (teste estrutural de chamadores, como o Assunto). Recusa mover Assunto ou
   principal **com plano** para outro grupo (tem de sair do plano antes).
6. **Rotas** (Next 16, App Router; consultar `node_modules/next/dist/docs/`
   antes de escrever):
   - `POST /api/minerador/marcas/[brandId]/plans/import` — `{ mode, text | plan, groupName, color, importRequestId }`;
   - `GET|POST|PATCH /api/editorial/groups?marcaId=` — listar (resumo), criar manual, renomear/recolorir/arquivar;
   - `POST /api/minerador/marcas/[brandId]/keywords/group` — `{ keywordIds, groupId | null }`.
7. **Listagem** (C16): `lerDe` ganha `.eq("group_id", ativo)` ou
   `.is("group_id", null)` ("Sem grupo"); "Todos" é a leitura de hoje.

### 6.2 Arquiteto

1. **Insumo do formador.** `article-formation-priority.ts:284-293`: se o
   Assunto do `claim` tem `plan.declaredPrincipal`, o artigo é
   `[principalDeclarada, ...compativeis(principalDeclarada, pool)]` e
   `suggestPrincipal` **não roda**. A principal declarada entra em
   `principalEligibleKeywordIds` (`:508`) sem exigir volume.
2. **Sustentações primeiro da lista do Assunto.** O `pool` do claim já vem de
   `subject_discovery.subjectKeywordIds`; passa a ser ordenado assim: (a) lista
   do Assunto, (b) demais keywords do mesmo grupo, (c) nada de fora do grupo
   sem decisão humana. Teto de 6 mantido.
3. **Nada solto dentro de grupo com plano** (`:792`): excedente cujo Assunto de
   origem tem plano **não** forma artigo próprio; vai para "Keywords não
   agrupadas" **do grupo**, com o motivo ("sustentação do Assunto 6 fora do
   escopo declarado") e a ação "anexar a um artigo do plano". Fora de grupo com
   plano, o comportamento de hoje continua.
4. **Gate novo** em `article-formation-confirmation.ts` (estrutural):
   `DECLARED_PLAN_PRESERVED` — principal = declarada, `hierarchy` = papel
   declarado, toda keyword da lista do Assunto está no artigo ou em "não
   agrupadas" do grupo com motivo. `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` fica como
   está (vale para o **Assunto** como principal).
5. **Adapter** (`adapters.ts:257`): `promise = plan.scope` quando há plano;
   `hierarchy = plan.role`.
6. **Silo** (`silo-formation.ts:251-257`): se todos os artigos da cópia são do
   mesmo grupo com plano e exatamente um tem `role = "Pilar"`, a cópia nasce
   com esse Pilar escolhido por `chooseSiloWorkingCopyPillar` com a razão
   "Pilar declarado no plano por <ator> em <data>" — é decisão humana, não
   heurística. `pillarScores` continua calculado, só informativo. Nome, slug e
   objetivo vêm de `editorial_groups.plan`; `narrativeOrder` vem de `order`. Ao
   consolidar, `editorial_groups.silo_id` recebe o `siloId`.
7. **Melhoria** (`article-improvement.ts:343`): alvo `subject` com principal
   declarada → `needsPrimary = false` sempre. Em
   `arquiteto-article-improvement.ts`: `discover` (`:405`) não roda para Assunto
   que já tem lista do Minerador (guarda); `:874` passa `subjectKeywordId:
   target.id` (o alvo `subject` é o próprio Assunto), e a keyword nova herda o
   grupo.
8. **Leitura por grupo** (C17): `loadCanonicalArquitetoWorkspace(context, {
   groupId })` — §8.
9. **Artigo do grupo**: ao materializar o ArticleDNA, o mesmo núcleo grava
   `editorial_group_articles` com o grupo do Assunto (ou da principal). Artigo
   com keywords de dois grupos: conflito visível, sem grupo até decisão.

### 6.3 Radar

- Lê o grupo pelo `article_id` (`editorial_group_articles`); não grava grupo.
- Mesa por grupo (§8); faixa e etiqueta na `OperationalDataGrid`.
- Recebe a `promise` declarada: a regra 24 do artigo-modelo
  (`lib/radar/article-blueprint.ts:1500`) deixa de ter a moldura para apagar.
- Nova versão do ArticleDNA (artigos 3 e 8) aparece como "Atualização
  disponível", como hoje. Não troca principal, não reagrupa.
- `WorkflowRepository.list` passa a filtrar `subject_type = 'article'` além de
  `stage = 'radar'` (pré-requisito do registro do guarda, §10.3).

### 6.4 Redator e Publicações

- Lista de documentos filtrada por grupo (`content_documents.article_id ∈
  artigos do grupo`), etiqueta na linha. Sem mudança de contrato.
- `get_article_for_writing` e o CSV "Para escrever" levam o nome do grupo e a
  promessa declarada (já é o campo `promise`).

### 6.5 MCP e catálogo (`AGENTS.md` §17.1)

- Ferramenta nova `declare_silo_plan` (preview/apply, `userConfirmation`,
  escopo `minerador.write`, permissão `minerador:edit`) chamando
  `importDeclaredPlanWithCore` — o mesmo núcleo da tela.
- `validate_silo_plan`: `SiloPlanSchema` ganha `scope` opcional; teto conforme D3
  (4 a 30 artigos por Silo, sem aviso para 8+; aplicado em 2026-10-12).
- `get_platform_state`, `list_platform_keywords`: parâmetro `groupId` opcional.
- `lib/agent/platform-catalog.ts`: rotas novas, botão "Importar plano do
  Silo", seletor de grupo, regra "principal declarada é fixa", guarda. `npm run
  test:agent` verde na mesma entrega.

## 7. Migrations

### 7.1 M1 — `supabase/migrations/20261013120000_grupos_editoriais.sql`

```sql
-- =============================================================================
-- GRUPOS EDITORIAIS (etiquetas por cor)
-- SDD: docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md, §7.1
-- APLICAÇÃO: pelo dono, `npx supabase db query --linked -f <este arquivo>` e
-- depois `npx supabase migration repair --status applied 20261013120000 --linked`.
-- Nunca `supabase db push`. O código da F1 só sobe depois disto.
-- Rollback: supabase/rollback/20261013120000_grupos_editoriais.rollback.sql
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.can_access_brand(uuid)') IS NULL THEN
    RAISE EXCEPTION 'GRUPOS_PRE: public.can_access_brand(uuid) ausente.';
  END IF;
  IF to_regclass('public.editorial_groups') IS NOT NULL THEN
    RAISE EXCEPTION 'GRUPOS_PRE: editorial_groups já existe (migration aplicada?).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'minerador_keywords' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'GRUPOS_PRE: minerador_keywords.group_id já existe.';
  END IF;
  IF (SELECT array_agg(column_name::text ORDER BY ordinal_position) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'minerador_keywords_listagem')
     IS DISTINCT FROM ARRAY['id','keyword','location','results_allintitle','volume_search','kgr_score','intent',
       'status','created_at','lista_id','analise_semantica','volume_source','brand_id','deleted_at','purge_after','deleted_by'] THEN
    RAISE EXCEPTION 'GRUPOS_PRE: colunas de minerador_keywords_listagem divergem do esperado.';
  END IF;
END $$;

CREATE TABLE public.editorial_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color text NOT NULL CHECK (color IN ('amarelo', 'azul', 'verde', 'lima', 'laranja')),
  origin text NOT NULL CHECK (origin IN ('declared_plan', 'manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  plan jsonb CHECK (plan IS NULL OR jsonb_typeof(plan) = 'object'),
  plan_version integer NOT NULL DEFAULT 0 CHECK (plan_version >= 0),
  plan_hash text CHECK (plan_hash IS NULL OR char_length(plan_hash) BETWEEN 1 AND 128),
  silo_id text CHECK (silo_id IS NULL OR char_length(btrim(silo_id)) BETWEEN 1 AND 256),
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_editorial_groups_id_marca UNIQUE (id, marca_id),
  CONSTRAINT ck_editorial_groups_plan_origin CHECK (plan IS NULL OR origin = 'declared_plan')
);
CREATE UNIQUE INDEX uq_editorial_groups_active_name
  ON public.editorial_groups (marca_id, lower(btrim(name))) WHERE status = 'active';
CREATE UNIQUE INDEX uq_editorial_groups_silo
  ON public.editorial_groups (marca_id, silo_id) WHERE silo_id IS NOT NULL;

CREATE TABLE public.editorial_group_articles (
  marca_id uuid NOT NULL,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),
  group_id uuid NOT NULL,
  origin text NOT NULL CHECK (origin IN ('subject', 'principal', 'keywords', 'human')),
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (marca_id, article_id),
  CONSTRAINT fk_editorial_group_articles_group
    FOREIGN KEY (group_id, marca_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT
);
CREATE INDEX ix_editorial_group_articles_group ON public.editorial_group_articles (marca_id, group_id);

CREATE TABLE public.editorial_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid NOT NULL,
  group_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'renamed', 'recolored', 'plan_declared', 'plan_changed',
    'keywords_assigned', 'keywords_unassigned', 'article_assigned', 'silo_linked', 'archived', 'reactivated')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_editorial_group_events_group
    FOREIGN KEY (group_id, marca_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT
);
CREATE INDEX ix_editorial_group_events_group ON public.editorial_group_events (marca_id, group_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.editorial_group_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'editorial_group_events_is_append_only';
END;
$$;
CREATE TRIGGER trg_editorial_group_events_append_only
  BEFORE UPDATE OR DELETE ON public.editorial_group_events
  FOR EACH ROW EXECUTE FUNCTION public.editorial_group_events_append_only();

-- A etiqueta da keyword. Fora de analise_semantica de propósito: não entra no
-- hash do pacote aprovado. FK composta impede grupo de outra marca.
ALTER TABLE public.minerador_keywords ADD COLUMN group_id uuid;
ALTER TABLE public.minerador_keywords
  ADD CONSTRAINT fk_minerador_keywords_group
  FOREIGN KEY (group_id, brand_id) REFERENCES public.editorial_groups(id, marca_id) ON DELETE RESTRICT;
CREATE INDEX ix_minerador_keywords_group
  ON public.minerador_keywords (brand_id, group_id) WHERE deleted_at IS NULL;

-- Listagem: mesmas colunas, `group_id` acrescentado no fim (CREATE OR REPLACE aceita).
CREATE OR REPLACE VIEW public.minerador_keywords_listagem WITH (security_invoker = true) AS
SELECT k.id, k.keyword, k.location, k.results_allintitle, k.volume_search, k.kgr_score, k.intent, k.status,
  k.created_at, k.lista_id,
  (((k.analise_semantica #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
    #- '{volume_measurement,monthlySearchVolumes}'::text[])
    #- '{dataforseo_keyword_overview_history}'::text[])
    #- '{allintitle_measurement_history}'::text[] AS analise_semantica,
  k.volume_source, k.brand_id, k.deleted_at, k.purge_after, k.deleted_by,
  k.group_id
FROM public.minerador_keywords k;
GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;

-- Resumo leve para o seletor: contagens, sem payload.
CREATE VIEW public.editorial_group_summary WITH (security_invoker = true) AS
SELECT g.id, g.marca_id, g.name, g.color, g.origin, g.status, g.silo_id, g.plan_version, g.updated_at,
  (SELECT count(*) FROM public.minerador_keywords k
    WHERE k.group_id = g.id AND k.brand_id = g.marca_id AND k.deleted_at IS NULL) AS keyword_count,
  (SELECT count(*) FROM public.editorial_group_articles a
    WHERE a.group_id = g.id AND a.marca_id = g.marca_id) AS article_count
FROM public.editorial_groups g;

ALTER TABLE public.editorial_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_group_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_group_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.editorial_groups, public.editorial_group_articles,
  public.editorial_group_events FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.editorial_group_summary FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.editorial_groups, public.editorial_group_articles,
  public.editorial_group_events, public.editorial_group_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.editorial_groups, public.editorial_group_articles TO service_role;
GRANT SELECT, INSERT ON TABLE public.editorial_group_events TO service_role;
GRANT SELECT ON TABLE public.editorial_group_summary TO service_role;
GRANT DELETE ON TABLE public.editorial_group_articles TO service_role;

CREATE POLICY editorial_groups_select ON public.editorial_groups
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));
CREATE POLICY editorial_group_articles_select ON public.editorial_group_articles
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));
CREATE POLICY editorial_group_events_select ON public.editorial_group_events
  FOR SELECT TO authenticated USING (public.can_access_brand(marca_id));

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.editorial_groups', 'SELECT')
     OR has_table_privilege('anon', 'public.editorial_group_summary', 'SELECT')
     OR has_table_privilege('authenticated', 'public.editorial_groups', 'INSERT') THEN
    RAISE EXCEPTION 'GRUPOS_POS: privilégios fora do contrato.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'minerador_keywords_listagem' AND column_name = 'group_id') THEN
    RAISE EXCEPTION 'GRUPOS_POS: listagem sem group_id.';
  END IF;
END $$;

COMMIT;
```

Notas:

- **Escrita só pelo servidor** (`service_role`), depois da autorização da rota
  (`assertEditorialPermission` / ação de marca) — o padrão das tabelas do Radar.
  `minerador_keywords.group_id` segue as policies atuais da tabela; a garantia de
  escritor único é estrutural (§6.1, item 5), não de banco: uma trava por papel
  quebraria os imports que usam o cliente autenticado do usuário.
- `ON DELETE RESTRICT` em tudo: arquivar grupo é `status = 'archived'`; nunca
  apaga keyword, artigo nem evento.
- Ensaio antes de aplicar: rodar o arquivo com `RAISE EXCEPTION 'ENSAIO'` antes
  do `COMMIT` (devolve o erro e desfaz tudo), como nas migrations recentes.
- **Como foi escrita (F1, 2026-10-12)** — `supabase/migrations/20261013120000_grupos_editoriais.sql`
  segue o texto acima com quatro acréscimos: `editorial_group_summary` também
  expõe `lock_version` (o PATCH do grupo usa trava otimista); a função do
  gatilho append-only tem `search_path` fixo e `REVOKE` de `PUBLIC`/`anon`/`authenticated`;
  a pré-checagem confere a poda de séries da view; a pós-checagem confere
  `security_invoker`, RLS ligada nas três tabelas, a FK composta e que nenhuma
  keyword nasceu com grupo. O rollback recusa rodar se já houver plano
  declarado gravado (F4) e recoloca o comentário da view.

### 7.2 Rollback — `supabase/rollback/20261013120000_grupos_editoriais.rollback.sql`

Antes, o dono salva o retrato das etiquetas (só leitura):
`SELECT id, group_id FROM minerador_keywords WHERE group_id IS NOT NULL;` e
`SELECT * FROM editorial_groups; SELECT * FROM editorial_group_articles;`.

```sql
BEGIN;
DROP VIEW IF EXISTS public.editorial_group_summary;
-- CREATE OR REPLACE não remove coluna: recria a view como era.
DROP VIEW IF EXISTS public.minerador_keywords_listagem;
CREATE VIEW public.minerador_keywords_listagem WITH (security_invoker = true) AS
SELECT k.id, k.keyword, k.location, k.results_allintitle, k.volume_search, k.kgr_score, k.intent, k.status,
  k.created_at, k.lista_id,
  (((k.analise_semantica #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
    #- '{volume_measurement,monthlySearchVolumes}'::text[])
    #- '{dataforseo_keyword_overview_history}'::text[])
    #- '{allintitle_measurement_history}'::text[] AS analise_semantica,
  k.volume_source, k.brand_id, k.deleted_at, k.purge_after, k.deleted_by
FROM public.minerador_keywords k;
REVOKE ALL PRIVILEGES ON TABLE public.minerador_keywords_listagem FROM PUBLIC, anon;
GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;
ALTER TABLE public.minerador_keywords DROP CONSTRAINT IF EXISTS fk_minerador_keywords_group;
DROP INDEX IF EXISTS public.ix_minerador_keywords_group;
ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS group_id;
DROP TABLE IF EXISTS public.editorial_group_events;
DROP FUNCTION IF EXISTS public.editorial_group_events_append_only();
DROP TABLE IF EXISTS public.editorial_group_articles;
DROP TABLE IF EXISTS public.editorial_groups;
COMMIT;
```

O rollback da M1 só é limpo **antes** da Fase B do plano (F4): depois dela, os
pacotes aprovados guardam `plan.groupId`, que fica como proveniência inerte
(leitores da Fase A toleram grupo inexistente). O código volta antes do banco.

### 7.3 Sem migration

Plano declarado (jsonb aditivo em `analise_semantica`), registro do guarda
(`editorial_workflow_items`, `subject_type` é texto livre: só o CHECK de
`stage` existe), ArticleDNA e SiloDNA (campos que já existem).

## 8. Leitura por grupo

| Rota / leitor | Hoje | Com `groupId` | Sem `groupId` |
|---|---|---|---|
| Minerador (browser, view) | marca inteira | `.eq("group_id", g)`; "Sem grupo" = `.is("group_id", null)` | igual a hoje |
| `GET /api/editorial/groups?marcaId=` | — | `editorial_group_summary` + contagem "Sem grupo" (head count) | — |
| `GET /api/arquiteto/workspace?brandId=&groupId=` | marca inteira | índice de keywords `.eq("group_id")`; itens `keyword/architect` `.in("subject_id", ids)`; artefatos `.in("entity_id", artigos do grupo + silo_id)` | igual a hoje |
| `GET /api/editorial/workspace?marcaId=&groupId=&detail=light` | 8 seções, marca inteira, todas as versões | workflow `.eq("subject_type","article").in("article_id", A)`; artefatos `.in("entity_id", A ∪ {silo})`; documentos, publicações, snapshots e revisões SERP `.in("article_id", A)` | igual a hoje (streaming) |
| `detail=light` | — | ArticleDNA/SiloDNA: **só a versão vigente e a última aprovada** por entidade, com seus eventos | — |
| `GET /api/editorial/workspace/versions?marcaId=&entityId=` | — | histórico completo de uma entidade, sob demanda | — |
| MCP `get_platform_state` | marca inteira | `groupId` opcional | igual a hoje |

Regras de compatibilidade:

- **Quem lê tudo continua lendo tudo.** O parâmetro é opcional em todas as
  rotas; o MCP, a exportação e os testes atuais não mudam.
- **Leitura parcial nunca apaga o resto.** O cache da mesa
  (`components/editorial-pipeline-context.tsx`) passa a ter chave
  `${actor}:${brand}:${groupId | "todos"}`; uma leitura de grupo só substitui o
  recorte daquele grupo (`AGENTS.md` §10: estado vazio não substitui válido).
- **Ids na URL:** `.in()` em blocos de 200 (`KEYWORD_READBACK_ID_CHUNK`).
- **Fallback de implantação:** se `group_id` não existir (código antes da
  migration), a rota responde `409 GROUPS_NOT_AVAILABLE` e a tela esconde o
  seletor — mesmo padrão do recuo da view em `minerador-workspace.tsx:447-466`.
- **Peso:** a F2 mede de novo pelo método de 2026-10-09 (bytes do corpo por
  seção, marca AdalbaPro) com e sem `groupId`/`detail=light`. Meta: corpo da
  mesa por grupo abaixo de 1 MB; nenhum número é prometido antes da medição.

## 9. Interface (sistema visual)

Leitura obrigatória antes de codar: `docs/compartilhado/sistema-visual.md` e
`.agents/skills/app-visual-system/SKILL.md`.

1. **Seletor de grupo** — `components/editorial/group-selector.tsx`,
   compartilhado, no topo das três planilhas (junto das abas de seção:
   `modules/minerador/minerador-section-tabs.tsx`, cabeçalho do Arquiteto e do
   Radar). Opções: "Todos os grupos", "Sem grupo", e cada grupo com bolinha de
   cor, **nome** e contagem ("54 keywords · 8 artigos"). O grupo ativo vai na URL
   (`?grupo=<id>`, sobrevive a F5 e é compartilhável); o último escolhido por
   marca fica no `localStorage` só como conveniência (try/catch).
   **Substituído em 2026-10-12 pelo adendo §9.1-A** (cores fixas, etiqueta
   fixa na topbar global, escolha por área).
2. **Cor nas linhas** — faixa de 4 px à esquerda (`border-l-4`) com o token do
   grupo e coluna "Grupo" com etiqueta de nome (texto ≥ 14 px, fundo
   `color-mix` do token a ~18 %). **Nunca a linha inteira pintada** (§8: "não
   usar cores saturadas em linhas completas") e **nunca só a cor** (§11: o nome
   sempre aparece). A keyword continua `text-keyword`.
3. **Paleta de grupo** (D4) — aliases novos em `app/globals.css`, sem valor
   bruto novo: `--group-amarelo: var(--pending)`, `--group-azul:
   var(--context-accent)`, `--group-verde: var(--positive-soft)`,
   `--group-lima: var(--highlight)`, `--group-laranja: var(--warning)`.
   Ficam de fora: `module-accent` (interação), `action-accent` (ação),
   `danger`, `success`, `keyword` e as identidades. Registrar em
   `sistema-visual.md` como §5.0.2 "Cores de grupo".
4. **Criar o grupo a partir do plano** — Minerador, botão "Importar plano do
   Silo": colar a tabela (ou preencher o formulário Silo + linhas) → prévia com
   cada artigo (Assunto: novo/já existe; principal: nova/já existe/sem
   volume/igual ao Assunto; papel; escopo; sobras que **não** serão importadas,
   como o nome do Silo e rótulos colados) → nome do grupo (padrão = nome do
   Silo) e cor (5 amostras com nome) → "Criar grupo e declarar plano". Sucesso
   só depois da releitura.
5. **Grupo manual e lote** — "Novo grupo" no seletor; no rodapé do Minerador,
   "Grupo ▸ Mover para… / Tirar do grupo" para as selecionadas. (2026-10-12:
   "Novo grupo" saiu; o rodapé move para uma das 5 cores — §9.1-A.) Arquiteto e
   Radar mostram o grupo; não o atribuem (herdam).
6. **Plano no Arquiteto** — no cartão do Silo, selo "Plano declarado" com o
   Pilar declarado; na linha do artigo, "Principal declarada" ao lado da
   keyword; divergência entre proposta e plano aparece como aviso do guarda
   (§10.4), nunca como troca.

### 9.1-A Adendo de 2026-10-12 — cores fixas, etiqueta global, escolha por área

Pedido do dono (literal): "estão boa as tags mas vc não colou eles por cores,
para não ficar escrevendo, e acho que essa tag tem que estar no global fixado e
não de forma independente, e ele esta demorando em carregar, ele é para ser um
item de seleção (…) coloca umas cores prefixados e pronto, e até pode e tem que
funcionar de forma independente em cada área, mas não pode atrapalhar o
carregamento."

1. **Cada cor da paleta É o grupo** (um grupo por cor por marca daqui em
   diante). O seletor é um select de cores: "Todos os grupos" (cinza, padrão),
   Amarelo, Azul, Verde, Lima, Laranja, "Sem grupo" e o rodapé do módulo. O
   formulário "Novo grupo" (nome) saiu. Se o grupo de uma cor tem nome próprio
   (ex.: o nome de um plano de Silo), ele aparece discretamente ao lado da cor.
   Contagens só quando já chegaram do servidor; nunca seguram o menu.
2. **Garantir o grupo da cor no servidor** — `ensureEditorialGroupForColor`
   (`lib/editorial/editorial-groups-store.ts`): grupo ativo com a cor (vários =
   o mais antigo por `created_at`) → devolve; senão o arquivado da cor →
   reativa (se o nome colide com outro ativo, reativa com o nome da cor); senão
   cria o manual com o nome da cor ("Laranja"; "Laranja 2" se o nome já é de
   outro grupo ativo). A corrida entre duas abas cai no índice único do nome e
   relê. `POST /api/editorial/groups` aceita `{ marcaId, color }` sem nome
   (com nome, o comportamento antigo, `minerador:edit`); o ensure exige edição
   no Minerador, no Arquiteto ou no Radar (`canEnsureEditorialGroupColor`).
   **Filtrar por uma cor nunca escreve**; só mover/etiquetar chama o ensure.
3. **Fixo na topbar global** — a `GlobalTopbar` renderiza a etiqueta ela
   mesma (`TopbarGroupTag`), sempre e na hora, imediatamente antes do sino, no
   Minerador, no Arquiteto e no Radar (`model.moduleId` + marca ativa de
   `useBrand()` + sessão autenticada). Some só quando o banco não tem os grupos
   (409). O módulo não registra mais `groupTag`; só acrescenta ações no fim
   do menu (`groupTagMenuFooter`, ex.: "Etiquetar artigos pelo grupo das
   keywords") e, no Radar, o texto do "Sem grupo" (`groupTagUngroupedDetail`).
4. **Independente por área (D12 revisto)** — estado leve de cliente
   (`components/editorial/editorial-group-area-store.ts`, módulo +
   `useSyncExternalStore`) com a escolha por `brandId + área`, lembrada em
   `localStorage` `minerador-key:grupo-ativo:${brandId}:${area}` guardando a
   COR, "todos" ou "sem-grupo" (try/catch; nada é limpo; a chave única antiga
   não é mais lida). A URL `?grupo=<cor>` (e "sem-grupo"; o uuid antigo vira a
   cor quando a lista chega) vale na página da área aberta e é lida antes do
   primeiro uso; abrir um link não troca a lembrança.
5. **Não atrapalhar o carregamento** — a lista de grupos da marca é lida uma
   vez por sessão, em segundo plano, compartilhada pelas três áreas, com cache
   de apresentação em `localStorage` `minerador-key:grupos:${brandId}` (id,
   cor, nome, status) que entra na hora; relida depois de escrever. No
   Minerador a carga das keywords não espera a lista com "todos"/"sem-grupo"
   nem quando o cache resolve a cor; cor sem grupo = planilha vazia com
   "Nenhuma keyword na cor X ainda", sem consulta; cache errado se corrige
   sozinho (a chave do recorte muda e a planilha relê uma vez). No Arquiteto e
   no Radar, `GET /api/editorial/groups/articles` (pesado) só começa depois da
   mesa da área (`useEditorialPipeline().loading`), ou na hora quando há cor ou
   "sem-grupo"; enquanto não chega, o recorte não mostra nada (nunca "tudo" por
   engano).
6. **Mover e plano por cor** — rodapé do Minerador (os dois selects) e
   `ArticleGroupMoveSelect` do Arquiteto/Radar: "Mover para <cor>" (5 cores) e
   "Tirar do grupo"/"Voltar ao grupo das keywords", com o ensure antes. Diálogo
   "Importar plano do Silo": escolhe a cor; a cor com grupo ativo vira
   `{ mode: "existing", groupId }`, a sem grupo `{ mode: "new", name: null,
   color }` (o nome padrão continua o do Silo).
7. **Recorte de tela** — `EditorialGroupScreenFilter` (só cliente) acrescenta
   `{ kind: "groups", color, groupIds }` = todos os grupos ATIVOS da cor (o
   legado com duas etiquetas da mesma cor aparece inteiro). As rotas de leitura
   continuam com `EditorialGroupFilter` (uuid/sem-grupo), sem mudança.

Sem migration, sem SQL remoto, sem escrita no banco nesta entrega. Verificado
no código e confirmado por teste (`tests/radar-grupos-cores-fixas.test.mts`,
`tests/radar-grupos-etiqueta-topbar.test.mts`, F1-21..25 em
`tests/minerador-grupos-f1.test.mts`). **Validado manualmente: não.**

## 10. Guarda de retrabalho

### 10.1 Onde vive

- **Domínio:** `lib/editorial/rework-guard.ts` (puro). `operationFingerprint(kind,
  inputs)` = `contentHash(canonicalJson(...))` de `lib/arquiteto/versioning.ts`;
  `assessRework({ kind, fingerprint, previous, declared })` devolve um veredito.
- **Servidor:** `lib/server/rework-guard.ts` — `checkRework(context, op)` e
  `recordOperation(context, op, outcome)`. **Chamado pelo núcleo de cada
  operação**, nunca pela tela: rota, MCP e tela passam pelo mesmo ponto.
- **Registro — o registro que a operação já tem, quando tem:**
  - melhoria: a própria execução (`article_improvement_run`, com `inputsHash` e
    `reusedFromRunId` do trabalho em curso, §2); a guarda só a lê;
  - custo de IA e Google Ads: `integration_usage_events` (idem);
  - fechamento do Silo: a operação congelada de
    `silo-consolidation-operation.ts` (idem);
  - só o que não tem registro próprio (conclusão da formação, parecer de
    composição recusado, retirada de artigo) ganha linha em
    `editorial_workflow_items` com `subject_type = 'operation_ledger'`,
    `subject_id = '<kind>:<fingerprint>'`, `stage` do módulo dono, `payload = {
    kind, fingerprint, groupId, inputsSummary, attempts: [{ at, actorId,
    outcome, outcomeCode, resultRef, costUsd }] }` (últimas 20). A chave única
    `(marca_id, subject_type, subject_id, stage)` já existente faz "mesmos
    insumos = mesma linha".
  Nenhuma tabela nova; nenhum processo paralelo; o fingerprint da melhoria é
  `improvementInputsFingerprint`, e as outras operações usam a mesma forma
  (insumos canônicos → `contentHash`).

### 10.2 Vereditos

| Veredito | Quando | O que a operação faz |
|---|---|---|
| `fresh` | nunca feito com estes insumos | roda e registra |
| `same_inputs_reuse` | mesmo fingerprint com sucesso | devolve o resultado anterior (`resultRef`); refazer só com `reworkOverride.reason` |
| `same_refusal` | mesmo fingerprint terminou na mesma recusa | não roda; mostra a recusa anterior e o que precisa mudar |
| `contradicts_declared` | trocaria principal ou papel declarado, ou deixaria keyword da lista do Assunto fora do artigo e de "não agrupadas" | recusa; **sem** "refazer mesmo assim" — muda-se o plano no Minerador |
| `parallel_path` | gravaria fora do núcleo canônico (ex.: artigo sem Assunto dentro de grupo com plano) | recusa |

### 10.3 Onde é chamado (insumos do fingerprint)

| Operação | Ponto | Insumos | Efeito no caso real |
|---|---|---|---|
| Preparar melhoria | `arquiteto-article-improvement.ts:389-391` (HEAD) | `improvementInputsFingerprint` (em curso, §2) | as 9 execuções viram 1; a guarda acrescenta o aviso antes do clique e o histórico do grupo |
| Leitura da IA | idem `:398` | reaproveitada com a execução (em curso) | IA paga 1 vez |
| Busca no Google Ads | idem `:405` (`discover`) | só com `discover: true` (em curso); a guarda acrescenta "Assunto com lista do Minerador não busca" | sustentações saem da lista do Assunto |
| Coleta SERP paga | `/api/arquiteto/serp` | keyword + lente + composição | o cache por lente continua; o guarda só impede recoleta da mesma composição inconclusiva sem mudança e exige clique com prévia |
| Formação / conclusão | `article-formation-confirmation.ts` | candidatos + hashes + pareceres | `contradicts_declared` antes de gravar |
| Fechamento do Silo | `lib/arquiteto/silo-consolidation.ts` e `silo-consolidation-operation.ts` | cópia + pareceres + código da recusa | a recusa pré-RPC já descarta a operação (em curso); a guarda mostra "a mesma recusa de <data>" e desabilita o botão até um insumo mudar |

### 10.4 O que aparece na tela

- **Antes do clique:** cada prévia/plano devolve `rework: { verdict,
  previous }`. Componente compartilhado `components/editorial/rework-notice.tsx`
  acima do botão, com token `warning` e texto, por exemplo: "Já feito com os
  mesmos insumos em 12/10 às 17:30 — 8 alvos, IA leu a lista, 0 consultas
  pagas. [Abrir resultado] [Refazer mesmo assim]" ou "A mesma recusa aconteceu
  em 12/10 às 17:41: SERP da composição incompleta. Nada mudou desde então." (o
  botão fica desabilitado, com `InfoHint` dizendo o que mudar).
- **Registro:** "Histórico do grupo", no menu do seletor: operações do grupo
  (tipo, data, ator, resultado, custo, link do resultado), lido do
  `operation_ledger` e de `editorial_group_events`.
- **Servidor é a autoridade:** sem `reworkOverride`, a rota responde `409
  REWORK_SAME_INPUTS` / `REWORK_SAME_REFUSAL` / `DECLARED_PLAN_CONTRADICTION`
  com o registro anterior.

## 11. Reimportar o plano e aproveitar a WifiConecta

**Runbook para o DONO executar pela tela, depois do deploy da F3 (sozinha) e da
F4.** Nada pago, nada apagado definitivamente, cada passo com releitura. Marca
`d4fa133a-13bd-4bf7-bfd1-d0f22253f223`. Nenhum agente executa este runbook.

**Estado conferido por SELECT em 2026-10-12 (fim do dia):** 1 grupo, "laranja"
(`a9d5c87b…`, origem `manual`, sem plano), com as 56 keywords vivas; 8
ArticleDNA vigentes (7 dos Assuntos 1, 2, 3, 4, 6, 7, 8, com `entity_id` = id
do Assunto, e o solto "plano vivo controle"
`article-candidate:territory:9c75c3a7…:679b1bb2`); **SiloDNA v1 e SiloPage v1
aprovados existem** (`territory:9c75c3a7…`, "planos de internet", slug
`planos-de-internet`, Pilar = artigo 3 `6d5d87cd`, "plano vivo controle" entre
os suportes, sem o artigo 5) — o pedido de 2026-10-12 dizia "nenhum
SiloDNA/SiloPage", mas o banco os tem; a cópia de trabalho
`silo-working-copy:territory:9c75c3a7…` está em `draft` com o Pilar escolhido =
artigo 3 (claro ou vivo). As três principais declaradas sem volume
(`65bf5bc8` "Claro Vivo ou TIM internet", `f7a6c14b` "quantos Mega de internet
preciso", `11a34ba3` "contratar internet residencial em São Paulo") estão
`bruto`, ainda não chegaram ao Arquiteto e **não têm SERP no cache** (0 entradas).
As sobras `5ea8448a` "Planos e contratação" e `e2fe761a` "Palavra-chave:
internet disponível no meu CEP" estão `bruto`.

1. **Importar o plano (prévia).** Minerador da WifiConecta → barra do topo,
   ao lado de "Colar keywords" e "Importar CSV" → **"Importar plano do Silo"**
   → colar o texto do plano (o do §0/§17, "Silo 1 — Planos de internet…") em
   "Plano do Silo (texto colado ou tabela)" → em "Grupo do plano", **"Grupo
   existente" → "laranja"** (use o existente: as sustentações já estão nele;
   um grupo novo deixaria as sustentações no "laranja" e fora das regras do
   plano) → **"Gerar prévia"**. Conferir na prévia:
   - Silo "Planos e contratação", slug `planos-de-internet`, o objetivo;
   - os 8 Assuntos como "já existe como Assunto"; Pilar = artigo 1;
   - principais 1, 2, 4, 6, 7 "já existe, com volume"; 3, 5, 8 "já existe, sem
     volume (D2-bis: aprova sem volume)";
   - sobras: "Planos e contratação" (nome do Silo) e "Palavra-chave: internet
     disponível no meu CEP" (rótulo) como "não faz parte do plano";
   - "itens aprovados voltam a Em revisão": 13 (8 Assuntos + 5 principais);
   - **nenhum impedimento**. Se aparecer impedimento ou linha não entendida, pare.
2. **Gravar o plano.** **"Declarar plano"** → esperar "8 artigo(s)
   declarado(s), reciprocidade confirmada em 8; falhas: 0" e "plano v1" →
   "Fechar". Releitura (SELECT): `editorial_groups` "laranja" com
   `origin = 'declared_plan'`, `plan_version = 1`, `plan->>'siloName' =
   'Planos e contratação'`; os 8 Assuntos com `analise_semantica->
   'keyword_subject'->'plan'` (ordem 1–8, papel, escopo) e as 8 principais com
   `analise_semantica->'keyword_declared_principal'` apontando de volta.
   (Opcional: renomear o grupo para "Planos e contratação" — desde o adendo
   "interface dos grupos e do plano" (§18.1), pela tela: etiqueta ao lado do
   sino → engrenagem "Gerenciar a cor Laranja" → "Nome (opcional)" → "Salvar
   nome". O nome do grupo não muda nada no plano.)
3. **Sobras para a lixeira (D9).** Minerador → Processar Keywords → marcar
   "Planos e contratação" e "Palavra-chave: internet disponível no meu CEP" →
   rodapé → **"Excluir"** → confirmar (vão para a lixeira, recuperáveis por
   "Restaurar").
4. **Lógica e reaprovação (grátis).** Marcar as 3 principais `bruto` → rodapé
   → **"Lógica"** (se a coluna já mostrar a Lógica feita, pule). Depois marcar
   os 16 itens (8 Assuntos + 8 principais) → Revisão Humana em grupo pelo
   rodapé → **"Concluir revisão"** → status "aprovado" (a D2/D2-bis só pede a
   Lógica). Marcar os 16 → **"Enviar ao Arquiteto"**.
5. **Artigos pelo caminho de sempre (Arquiteto → Artigos).** Cartão "Próximo
   passo" → **"1 · Buscar keywords (grátis)"** (com os 8 Assuntos marcados na
   planilha, ou nada marcado = todos). Conferir na tabela da análise:
   - artigos 1, 2, 4, 6, 7: mesma principal e o motivo "Plano declarado: a
     descrição do escopo vira a promessa e o papel do plano vira a hierarquia
     (D8)";
   - artigo 3: principal "Claro Vivo ou TIM internet" com "Principal declarada
     no plano do Silo: cabeceira fixa (D1-bis)… “claro ou vivo” fica como
     secundária"; artigo 8: "contratar internet residencial em São Paulo", com
     "contratar internet residencial" como secundária; artigo 5: artigo novo
     com "quantos Mega de internet preciso";
   - a principal declarada entra no Silo `planos de internet` pela
     transferência da prévia.
   **Não clicar "2 · Validar no Google (pago)".** Marcar 1, 2, 3, 4, 5, 6, 7 e 8
   → **"3 · Gravar melhorias"** (na fileira pode aparecer como "Gravar sem
   validar (n)") → **"Confirmar e aplicar"**. Resultado esperado: versão nova
   de cada um, `hierarchy` = papel (1 = Pilar), `promise` = escopo.
   - **Artigos 3, 5 e 8 — D2(a), adendo de 2026-10-12:** as três principais
     declaradas não têm volume nem SERP no cache; o parecer da composição vem das
     SUSTENTAÇÕES do artigo com volume e as 4 lentes no cache, sem pagar. A linha
     da análise diz "Parecer pelas sustentações: “…” … (D2a)" e que "Validar no
     Google" é opcional (D2b); o cartão "Próximo passo" não manda pagar por causa
     delas. O ArticleDNA grava a mesma frase em `serpStrategy.rationale`
     (proveniência, não pendência). Se um desses artigos não tiver NENHUMA
     sustentação com volume e as 4 lentes no cache (o artigo 5 pode não ter, se
     a única keyword dele é a principal declarada), "Gravar melhorias" recusa
     dizendo isso; a saída é a D2(b), "2 · Validar no Google", com o custo antes
     e "Autorizar este custo". **Decisão do dono; não faça sem decidir.**
6. **Retirar "plano vivo controle".** Arquiteto → **aba Silos** → Silo
   consolidado "planos de internet" → no artigo "plano vivo controle" →
   **"Retirar artigo do Silo"** → prévia → motivo "fora do plano declarado" →
   **"Confirmar retirada"**. Grava o evento `rejected` na versão
   `14e82c40-150e-4024-aa2f-2addd84d60ed` com o motivo e o novo par
   SiloDNA/SiloPage sem o artigo (v2), com releitura. Não há item no Radar nem
   documento. **Adendo de 2026-10-12:** a leitura da mesa aplica o evento
   `rejected` — o artigo rejeitado sai da aba Artigos e `679b1bb2` aparece em
   "Keywords não agrupadas" (só na leitura; nada é apagado). Faça este passo
   ANTES do 7: com "plano vivo controle" no Silo, o passo 7 recusa ("fora do
   plano") e aponta esta ação.
7. **Aplicar o plano declarado ao Silo (adendo de 2026-10-12: caminho pela
   tela).** Arquiteto → **aba Silos** → cartão do Silo consolidado "planos de
   internet" → **"Aplicar o plano declarado ao Silo"** → conferir a prévia:
   - "Pilar: “claro ou vivo” → “melhor plano de internet residencial” (Pilar
     declarado no plano por <ator> em <data>)" e "“claro ou vivo” deixa de ser o
     Pilar e fica como suporte";
   - "Entram como suporte: …" (o artigo 5, se já tiver ArticleDNA deste Silo);
   - a ordem de leitura 1–8 do plano; nome "Planos e contratação"; objetivo
     declarado; "Slug `planos-de-internet`, URL e canonical ficam como estão";
   - "SiloDNA v2 → v3 e SiloPage v2 → v3" (v1 → v2 se o passo 6 não gravou);
   - avisos: o grafo de links internos (processar de novo na aba Links
     internos) e, se houver, "O artigo N do plano ainda não tem ArticleDNA neste
     Silo" (grave-o no passo 5 e aplique de novo).
   → **"Confirmar o plano no Silo"** → esperar a notificação com a releitura e
   "O grupo “laranja” ficou ligado a este Silo". Recusas possíveis: "Fora do
   plano: “plano vivo controle”" (faça o passo 6), "O Pilar atual está publicado"
   (não é o caso). Releitura (SELECT): SiloDNA vigente com `pillarArticleId` =
   artigo 1 (`4339882e…`), `narrativeOrder` = ordem do plano, `name` = "Planos e
   contratação"; SiloPage vigente apontando para ele, slug `planos-de-internet`;
   `editorial_groups.silo_id` = `territory:9c75c3a7-15e1-4655-b627-c08e394b4606`.
   Depois: aba **Links internos** → processar os links do Silo de novo (a base
   passa para a versão nova; arestas com papel incompatível saem com o motivo).
   Pelo MCP, o mesmo ato é `apply_declared_plan_to_silo` (prévia → aceite →
   apply com o mesmo `decisionHash`).
8. **Conferência final (SELECT):** 8 ArticleDNA vigentes com a principal
   declarada (depois do passo 5 completo), nenhum artigo do grupo sem
   `subject`, nenhuma keyword do grupo fora de artigo e de "não agrupadas",
   SiloDNA com o Pilar = artigo 1 (`4339882e`) e
   `editorial_groups.silo_id = 'territory:9c75c3a7-15e1-4655-b627-c08e394b4606'`.

## 12. Consumidores e riscos

| Consumidor | Efeito | Proteção |
|---|---|---|
| Leitores de `KeywordDna` (`.strict()`) | `subject.plan` e `declaredPrincipal` novos | Fase A antes da B; teste de parse com pacote antigo e novo |
| Trava de aprovação (`approved-package.ts`) | nova exceção D2-bis | teste: principal declarada sem Volume aprova só com Lógica; sem marca, não |
| Formador (`article-formation-priority.ts`) | principal fixa; excedente não solto | fixtures do §3; regressão das marcas sem plano (Care Glow, AdalbaPro) com saída idêntica |
| Melhoria | não troca principal declarada; reaproveita execução | testes de `planArticleImprovements` e do servidor |
| Silo (`silo-formation.ts`, `silo-consolidation.ts`) | Pilar declarado | sem plano, `pillar = null` como hoje |
| Mesa (`/api/editorial/workspace`) | parâmetros novos | sem parâmetro = resposta idêntica (teste de agregação existente) |
| Radar listagem | filtro `subject_type = 'article'` | todos os itens do Radar são `article` hoje (conferir no banco antes) |
| Minerador listagem | coluna nova na view | fallback se a coluna faltar |
| MCP / catálogo | ferramenta e parâmetro novos | `npm run test:agent` |

Riscos:

- **R1 · Principal sem volume** dá slug e H1 a uma frase sem busca medida. É o
  que o dono pede; precisa da emenda D1-bis no ADR-022 (D1). Mitigação: o selo
  "sem volume medido" segue até o Redator.
- **R2 · Reaprovação em massa** ao gravar o plano (pacotes mudam). Mitigação:
  a prévia diz quantos itens voltam a "em revisão"; aprovação em lote pelo
  caminho de sempre.
- **R3 · Leitura parcial apagando estado** na mesa. Mitigação: chave de cache
  por grupo e teste "ler grupo não remove artigos de outro grupo".
- **R4 · Isolamento entre marcas.** FK composta `(group_id, brand_id)` e RLS
  por `can_access_brand`; teste cross-brand.
- **R5 · Conflito de grupo** (keyword trazida por Assuntos de dois grupos).
  Fica no primeiro, com aviso; nunca muda sozinha.
- **R6 · Guarda bloqueando trabalho legítimo.** Insumos incluem hashes dos
  pacotes e pareceres: qualquer mudança real gera `fresh`. Override com motivo
  para operações grátis e pagas.
- **R7 · Cor com significado de status** (amarelo = `pending`). Mitigação:
  faixa + nome, nunca badge de status; decisão D4.
- **R8 · Deploy em fases.** Depois da Fase A no ar, nenhum rollback volta para
  antes dela (memória "F2·A vai sozinha").

## 13. Testes (sem chamada paga, só fixtures)

- `tests/editorial-grupos-dominio.test.mts` — nome, cor, um grupo por keyword,
  recusas.
- `tests/minerador-plano-declarado.test.mts` — parse da tabela do dono
  (fixture com os 8 artigos do §3), limpeza de "Palavra-chave:", nome do Silo
  fora, 0/2 Pilares, principal repetida, reciprocidade.
- `tests/minerador-assunto-dominio.test.mts` — lista fechada de chamadores com
  o núcleo do plano e o de grupo.
- `tests/minerador-assunto-aprovacao.test.mts` — D2-bis.
- `tests/keyword-dna-plano-fase-a.test.mts` — pacote antigo e novo passam no
  `.strict()`.
- `tests/arquiteto-principal-declarada.test.mts` — formação com a fixture da
  WifiConecta: artigos 3, 5, 8 com a principal declarada; "plano vivo
  controle" em "não agrupadas" do grupo; nenhum artigo sem `subject`.
- `tests/arquiteto-silo-pilar-declarado.test.mts` — Pilar declarado; sem plano,
  `null`.
- `tests/arquiteto-article-improvement.test.mts` (ampliar) — `needsPrimary`
  falso com principal declarada; `:874` com `subjectKeywordId`.
- `tests/editorial-workspace-agregacao.test.mts` (ampliar) — sem `groupId`
  idêntico; com `groupId` só o recorte; `detail=light`.
- `tests/editorial-rework-guard.test.mts` — vereditos; 9 preparos iguais → 1.
- Isolamento: grupo da marca A recusado em keyword da marca B (domínio e FK).
- `npm run test:agent`, `tsc`, lint direcionado, `scripts/check-visual-system.mjs`,
  `git diff --check`; build nas fases com rota nova.
- Migration: ensaio por `RAISE EXCEPTION` antes do `COMMIT`.
- **Validação manual do dono** (homologação é dele): seletor nas 3 planilhas,
  importação do plano, runbook do §11 com readback no banco.

## 14. Rollback

| Fase | Como volta |
|---|---|
| F1 (grupo no Minerador) | código anterior; depois, rollback da M1 (§7.2) |
| F2 (leitura por grupo) | código anterior; parâmetros são opcionais |
| F3 (Fase A do plano) | **sem volta abaixo dela** depois do deploy da F4 |
| F4 (Fase B) | código da F3; os `plan` gravados ficam inertes e legíveis |
| F5 (guarda) | código anterior; linhas `operation_ledger` ficam sem leitor |
| F6 (Radar/Redator/MCP) | código anterior |
| Dados da WifiConecta | versões são imutáveis: voltar = nova versão/decisão; lixeira é recuperável |

## 15. Fases de entrega (a menor fatia útil primeiro)

1. **F1 · Grupos no Minerador** (dono: Minerador). M1; `editorial_groups`
   CRUD; `group_id` nas keywords; seletor, faixa e etiqueta no Minerador;
   "Mover para o grupo"; leitura por grupo no Minerador. Já separa o amarelo do
   azul e alivia a planilha do Minerador.
2. **F2 · Leitura por grupo no Arquiteto e na mesa** (dono: Arquiteto/Radar).
   `groupId` e `detail=light`; seletor no Arquiteto e no Radar;
   `editorial_group_articles` preenchida para artigos existentes pelo grupo das
   keywords (backfill pela tela, com prévia, nunca automático). Medição do peso.
3. **F3 · Plano declarado, Fase A** (dono: Minerador). Leitores aceitam
   `subject.plan` e `declaredPrincipal`. Nenhuma escrita. Deploy sozinho.
4. **F4 · Plano declarado, Fase B** (dono: Minerador → Arquiteto). Importação
   do plano, D2-bis, formação com principal fixa, papel no Silo, escopo na
   promessa, nada solto, "Retirar artigo do Silo", vereditos
   `contradicts_declared`/`parallel_path`. Aqui o runbook do §11 fica possível.
5. **F5 · Guarda de retrabalho completo** (dono: Arquiteto). Parte do
   trabalho em curso na árvore (reuso da melhoria, busca só a pedido, recusa do
   fechamento descartada) pode subir antes, sozinha, porque não depende de grupo
   nem de plano. A F5 generaliza: `rework-guard.ts`, `operation_ledger`,
   `same_refusal`, avisos na tela e histórico do grupo.
6. **F6 · Radar, Redator e MCP** (cada um dono da sua parte). Etiqueta e
   filtro no Redator, `declare_silo_plan`, `groupId` no MCP, catálogo.

Cada fase atualiza `estado-atual.md` e `backlog.md` do módulo dono e o
catálogo quando mudar processo.

## 16. Autorização necessária

- [x] Aprovar esta SDD e o escopo das fases — dono, 2026-10-12 ("Entrega em
      fases; sim").
- [x] Emenda ao ADR-022 (D1-bis: principal declarada no plano é fixa e se
      aprova sem Volume) — D1 aceito; a emenda é escrita na F3/F4.
- [x] M1 (o dono aplica, com ensaio antes) e o rollback dela — arquivos
      escritos na F1; **aplicação pendente com o dono**.
- [x] Atualização do `sistema-visual.md` (§5.0.2, cores de grupo) — D4.
- [x] Deploy em fases (F3 sozinha antes da F4).
- [ ] Na WifiConecta: reaprovação dos 16 itens, lixeira das 2 sobras, rejeição
      do artigo "plano vivo controle", nova consolidação do Silo (runbook §11,
      depois de F1–F4; executado pelo dono).
- [ ] Qualquer coleta SERP paga das principais sem volume (D2), por clique.

## 17. Decisões do dono — resolvidas em 2026-10-12

Regra do dono: **sim a todas as recomendações, exceto D3**, e D7 = artigo 1.
Onde a SDD só fazia a pergunta, vale a proposta do próprio texto.

- **D1 · Principal declarada sem volume:** aceita como cabeceira fixa (slug e H1
  saem dela; KGR "não aplicável"; volume "sem medição"). Exige emenda ao
  ADR-022. **Decidido: sim.**
- **D2 · SERP dessas principais:** (a) o parecer do artigo usa as sustentações
  com volume, sem pagar; (b) botão pago por artigo, com prévia. **Decidido: (a)
  padrão, (b) opcional.**
- **D3 · Tamanho do Silo — decidido de outro jeito (não é "aceitar acima de 7
  com aviso").** Palavras do dono: os próximos projetos vão ter **15 artigos
  por Silo no mínimo**; lançamentos de Silos com 14 a 15 artigos de uma vez,
  que podem ser distribuídos em dois ou três Silos — "tem que ser amplo".
  **Decidido:** `SILO_ARTICLE_RANGE = { min: 4, max: 30 }` em toda a
  plataforma (validação do plano, ferramenta MCP, catálogo, telas). De 8 a 30
  é tamanho normal, **sem aviso e sem exceção**; dividir um lançamento em 2 ou
  3 Silos é escolha editorial, não exigência da plataforma. Implementado em
  2026-10-12 (ver `docs/04-arquiteto/estado-atual.md`), incluindo o lote de
  âncoras do grafo de links, que recusava Silos de 14+ artigos.
- **D4 · Paleta de grupo:** as 5 cores do §9.3 (amarelo, azul, verde, lima,
  laranja), sempre com nome, mesmo reaproveitando tons que também marcam
  status. **Decidido: sim** (registrado no `sistema-visual.md` §5.0.2).
- **D5 · Um grupo por keyword e por artigo** (exclusivo). **Decidido: sim.**
- **D6 · Sustentação que não cabe em artigo do plano** (ex.: "plano vivo
  controle"): fica em "não agrupadas" do grupo, nunca vira artigo sozinha.
  **Decidido: sim.**
- **D7 · Qual é o Pilar:** **Decidido: o artigo 1, "melhor plano de internet
  residencial"** (Assunto `4339882e` "Como escolher o melhor plano…"). O Silo
  hoje tem o artigo 3 como Pilar; a troca acontece no fechamento do runbook
  (§11, passo 7), por decisão humana.
- **D8 · Artigos 1, 2, 4, 6, 7:** ganham versão nova para trazer a descrição
  (promessa) e o papel. **Decidido: sim (mudança real).**
- **D9 · Sobras do import** ("Planos e contratação", "Palavra-chave: internet
  disponível no meu CEP") vão para a lixeira recuperável. **Decidido: sim.**
- **D10 · Descrição:** até 1.200 caracteres, uma linha (viaja no CSV).
  **Decidido: sim.**
- **D11 · "Refazer mesmo assim":** permitido com motivo para operações grátis e
  pagas; proibido para contradição do plano. **Decidido: sim.**
- **D12 · Seletor ao abrir:** **Decidido: o último grupo usado**, lembrado só
  como conveniência local do navegador (`localStorage`, por marca); o grupo
  ativo de verdade é o da URL (`?grupo=`). Sem lembrança válida, "Todos os
  grupos". **Revisto em 2026-10-12 (§9.1-A):** a lembrança é por marca E por
  área e guarda a cor.

## 18. Decisão

- [ ] aprovada para documentação somente
- [x] aprovada para implementação no escopo descrito (fases: F1 a F6, em
      ordem, cada uma com a sua entrega; D3 ampliado conforme §17)
- [ ] bloqueada: decisão humana pendente
- Decisão, data e aprovador: dono do produto, 2026-10-12 — "Entrega em fases;
  sim"; sim a todas as recomendações da §17, exceto D3 (Silo amplo, até 30
  artigos); D7 = artigo 1.

### 18.1 Andamento

| Fase | Estado em 2026-10-12 |
|---|---|
| D3 (Silo de 4 a 30) | implementado; testes com Silo de 15 e de 30 artigos |
| F1 (grupos no Minerador) | no ar (commit `b3a5d30`) e M1 aplicada — relatado pelo dono, que testou as etiquetas no Minerador (a M1 conferida por SELECT: `editorial_groups`, `editorial_group_articles` e `group_id` existem) |
| F2 (Arquiteto, Radar e leitura por grupo) | código e testes prontos em 2026-10-12; **sem migration nova** (usa `editorial_group_articles` da M1); validado manualmente: não. Detalhe abaixo |
| F3 (Fase A do plano) | código e testes prontos em 2026-10-12; **deploy sozinho, antes da F4**; sem migration; validado manualmente: não |
| F4 (Fase B do plano) | código e testes prontos em 2026-10-12; **sem migration nova**; validado manualmente: não. Detalhe abaixo; runbook da WifiConecta no §11 |
| F6 (Radar, Redator, Publicações e MCP por grupo) | código e testes prontos em 2026-10-12; **sem migration**, sem escrita remota, sem chamada paga; `declare_silo_plan` passou a ser POR COR (decisão do dono); validado manualmente: não. Adendo F6 abaixo |
| F5 (guarda de retrabalho) | código e testes prontos em 2026-10-12; **sem migration, sem tabela nova**, sem escrita remota (só SELECT do schema), sem chamada paga; **ordem de deploy: o filtro `subject_type = 'article'` do Radar sobe antes (ou junto) de qualquer linha `operation_ledger`**; validado manualmente: não. Três pendências feitas antes (D2(a), plano no Silo consolidado, `rejected` na mesa) e o adendo F5 abaixo |
| Interface dos grupos e do plano | código e testes prontos em 2026-10-12: "Gerenciar a cor" (nome opcional, trocar para cor livre, liberar só vazia), "Histórico do grupo" (§10.4, eventos + `operation_ledger`), selos do plano no Arquiteto (§9 item 6) e "Tirar do plano"; **sem migration**, sem escrita remota, sem chamada paga; validado manualmente: não. Adendo abaixo |

#### F2 — como foi feita (2026-10-12)

- **Regra da herança** (uma só, `lib/editorial/article-groups.ts` → `inheritArticleGroup`): o grupo do Assunto
  do ArticleDNA; sem ele, o da principal; sem os dois, o grupo com mais keywords do artigo (principal,
  secundárias e reforços); empate = sem grupo, com o conflito visível; nenhuma com grupo = sem grupo. A
  etiqueta gravada em `editorial_group_articles` vence a herança e nunca é trocada por ela.
- **Núcleo único** (`lib/editorial/article-group-core.ts`, repositório `lib/editorial/article-groups-store.ts`,
  o único escritor da tabela, conferido por teste estrutural): prévia e gravação de "Etiquetar artigos pelo
  grupo das keywords" (aditivo, `ignoreDuplicates`), etiqueta aditiva ao gravar o ArticleDNA
  (`appendArquitetoArtifact`, só com `PERSISTED`) e ao importar no Radar (depois da releitura), e o "Mover
  para <grupo> / Voltar ao grupo das keywords" do rodapé (origem `human`). A formação e a importação nunca
  falham por causa do grupo; marca sem grupo nas keywords do artigo paga uma leitura só.
- **Rota** `/api/editorial/groups/articles`: GET (grupo efetivo dos artigos e, com `include=keywords`, das
  keywords com grupo), POST `preview|apply` e PATCH (mover). Escrever exige edição no Arquiteto ou no Radar.
- **Leitura por grupo** (§8): `GET /api/editorial/workspace?groupId=` e `GET /api/arquiteto/workspace?groupId=`
  (uuid ou `sem-grupo`; inválido = 400). Sem o parâmetro, as mesmas consultas e o mesmo corpo de antes (teste).
  Com ele, a mesa lê só os itens do Radar, ArticleDNA/SiloDNA (os Silos que têm esses artigos), documentos,
  publicações e SERP dos artigos do grupo efetivo, e a resposta leva `groupScope` (parcial). O Arquiteto lê
  só as keywords e itens do grupo, **fechados por artigo** (`closeKeywordSetOverArticles`): nenhum artigo chega
  com parte das keywords. O fluxo em partes, a listagem do Radar pela tabela e a função
  `editorial_content_documents_listing` continuam iguais (o recorte filtra o que a função devolve).
- **Telas:** o mesmo `EditorialGroupSelector` no topo do Arquiteto (abas Artigos e Silos) e do Radar, a mesma
  etiqueta e a faixa de 4 px; grupo na URL e o último usado lembrado com a mesma chave do Minerador. O filtro é
  **de tela**: a mesa continua lida inteira e o cache e a cópia local nunca recebem um recorte — a leitura
  parcial pela tela (cache por grupo) fica para depois da medição do peso.
- **WifiConecta (SELECT, 2026-10-12):** 1 grupo ("laranja", 56 keywords, 0 artigos etiquetados); os 8
  ArticleDNA vigentes têm todas as keywords em "laranja". Os 8 recebem "laranja": 7 pelo Assunto
  (`04320a9b`, `4339882e`, `4ac4d315`, `6d5d87cd`, `a1306160`, `d59f40a5`, `f6c2f85e`) e "plano vivo controle"
  (`article-candidate:territory:9c75c3a7…:679b1bb2`, sem Assunto) pela principal. A SiloPage
  `territory:9c75c3a7…` mostra "laranja" porque todos os artigos dela concordam.

#### F3 e F4 — como foram feitas (2026-10-12)

- **Contrato (F3):** `lib/minerador/declared-plan.ts` (zod, sem ciclo de import); `keyword_subject.plan`
  (`groupId`, `planVersion`, `order` 1..30 — o mesmo teto de `SILO_ARTICLE_RANGE` —, `role`, `scope` até 1.200
  numa linha, `declaredPrincipal`) e `keyword_declared_principal` (+ `_actor`, `_at`, `_history`) lidos por
  `resolveKeywordSubject(...).plan` e `resolveDeclaredPrincipal`; `KeywordDna.subject.plan` e
  `KeywordDna.declaredPrincipal` opcionais `.strict()`; no Arquiteto, `ArchitectSubjectStanding.plan` e
  `.declaredPrincipal` só do pacote aprovado. Writers antigos preservam o plano. Emenda D1-bis escrita no
  ADR-022. O vínculo do Silo planejado com o grupo é `editorial_groups.plan` (M1, sem coluna nova) e
  `editorial_groups.silo_id` gravado na consolidação.
- **Minerador (F4):** núcleo único `importDeclaredPlanWithCore` (`lib/minerador/declared-plan-import-core.ts`),
  rota `POST /api/minerador/marcas/[brandId]/plans/import`, diálogo "Importar plano do Silo"
  (`modules/minerador/declared-plan-import-dialog.tsx`, na barra do topo do Minerador) e ferramenta MCP
  `declare_silo_plan` (escopo `minerador.write`, permissão `minerador:edit`, aceite do usuário no `apply`) —
  o mesmo núcleo. D2-bis em `resolveApprovalReadiness` (`DECLARED_PRINCIPAL_APPROVAL_REASON`). A Pesquisa por
  Assunto carimba o grupo do Assunto nas keywords sem grupo. Repositório do grupo:
  `createDeclaredPlanGroup`, `declareEditorialGroupPlan` (trava otimista, `plan_hash` = mesma versão),
  `linkEditorialGroupSilo`.
- **Arquiteto (F4):** principal declarada como cabeceira fixa e lista do Assunto antes do grupo
  (`reservePriorityArticleGroups`/`planSiloArticleFormation`); D6 (nada solto) antes dos núcleos e dos
  excedentes; portaria `DECLARED_PLAN_PRESERVED`; `ProvisionalArticleGroup.declaredPlan` → `hierarchy` e
  `promise` no adapter; melhoria com `needsPrimary` falso, plano aplicado ao DNA (D8) e `subjectKeywordId` do
  Assunto na keyword nova; Pilar declarado no Silo pelo `chooseSiloWorkingCopyPillar`/decisão humana
  (`lib/arquiteto/silo-declared-plan.ts`); "Retirar artigo do Silo" (rota
  `POST /api/arquiteto/silo-article-withdrawal`). Catálogo atualizado (AGENTS §17.1).
- **Testes:** `test:arquiteto` 2838/2838, `test:arquiteto:servidor` 111/111, `test:arquiteto:lentes` 81/81,
  `test:radar` 3466 (3465 + 1 pulado), `test:redator` 357/357, `test:agent` 78/78, Minerador por glob
  1225 com as mesmas 28 falhas antigas, `test:editorial` 172 com as 4 antigas; `tsc` 0; `git diff --check` limpo.
- **Não feito nesta fase (pendências):** D2(a) (parecer pelas sustentações, sem pagar) — sem ela, os artigos 3,
  5 e 8 da WifiConecta só gravam com a coleta paga D2(b); trocar o Pilar de Silo já consolidado; a mesa aplicar
  o evento `rejected` às keywords do artigo retirado; selos visuais do plano no Arquiteto (§9.6); "Tirar do
  plano" pela tela; vereditos `contradicts_declared`/`parallel_path` do guarda (F5).
- **Validado manualmente: não.** A homologação e o runbook do §11 são do dono.

#### Adendo de 2026-10-12 — D2(a), plano no Silo consolidado e `rejected` na mesa

Dono do módulo: Arquiteto. Sem migration, sem escrita remota, sem chamada paga, sem campo novo em ArticleDNA/SiloDNA.
Detalhe completo em `docs/04-arquiteto/estado-atual.md` (seção do mesmo dia).

- **D2(a) (decidido: (a) padrão, (b) opcional):** no MESMO núcleo da SERP de formação (`handleArchitectFormationSerp`), na
  validação só com cache: principal com `keyword_declared_principal`, sem volume e sem a lente canônica no cache não é consultada;
  o parecer usa as sustentações do artigo com volume e as 4 lentes no cache e é reescrito para falar da principal declarada (nunca
  "alternativa melhor"). Proveniência: `supportBasis` no parecer (opcional), `serpStrategy.rationale` e `changeReason` no ArticleDNA
  ("Parecer pelas sustentações: …"). "Gravar melhorias" só aceita isso para a principal declarada do pacote aprovado; sem sustentação
  em cache recusa e aponta a D2(b). O plano pago continua contando a principal declarada (D2(b) por clique, custo antes), mas essas
  consultas ficam opcionais e o cartão não manda pagar por elas.
- **Plano no Silo consolidado (D7):** "Aplicar o plano declarado ao Silo" (aba Silos; rota `/api/arquiteto/silo-declared-plan`;
  ferramenta MCP `apply_declared_plan_to_silo` com prévia/`decisionHash`/aceite e `platform.decide`; catálogo
  `arquiteto.apply_declared_plan_to_silo`). O mesmo núcleo do fechamento decide o plano; a escrita é a do par canônico
  (`persistSiloPairAtomic`) com releitura; depois, `linkDeclaredPlanGroupToSilo`. SiloDNA e SiloPage v+1 só com mudança real;
  URL/slug/canonical publicados nunca mudam; Pilar atual publicado é conflito explícito; artigo fora do plano no Silo é recusa que
  aponta "Retirar artigo do Silo". InternalLinkGraph: fica sobre a base anterior; o caminho existente (Links internos → processar de
  novo, `rebaseInternalLinkGraph`) refaz a base — dito na prévia e no resultado.
- **`rejected` na mesa:** `loadCanonicalArquitetoWorkspace` lê os eventos das versões vigentes e aplica `releaseRejectedArticles`
  (puro): o artigo com a versão vigente rejeitada sai dos ativos e as keywords que só ele usava chegam sem a atribuição a ele —
  voltam para "Keywords não agrupadas". Só leitura; nada é apagado. Consumidores: mesa, melhoria, Reforçar publicados, plano no Silo.
- **Testes:** `test:arquiteto` 2849/2849 (era 2838), `test:arquiteto:servidor` 114/114 (era 111), `test:arquiteto:lentes` 85/85 (era
  81; +4 da D2(a) na rota real), `test:agent` 79/79 (era 78), `test:redator` 357/357, `test:radar` 3484 (3483 + 1 pulado; a base subiu
  com o trabalho paralelo de grupos), `tsc` 0.
- **Limites:** a cópia de trabalho do Silo consolidado continua com o Pilar antigo (histórico; a tela mostra o Pilar do SiloDNA);
  `listArquitetoArtifacts` e o handoff do Minerador ainda leem só o status da linha; a formação automática pode reagrupar a keyword
  liberada (decisão do dono, D6); sem teste de integração da melhoria com Assunto de plano (cobertura pela rota e por testes puros).
- **Validado manualmente: não.** O runbook do §11 (passos 5–7 atualizados) é do dono.

#### Adendo F6 de 2026-10-12 — Radar, Redator, Publicações e MCP por grupo

Cada área é dona da sua parte (Radar, Redator, Publicações; MCP/catálogo pelo `AGENTS.md` §17.1). Sem migration, sem
SQL remoto, sem escrita no banco, sem chamada paga, sem campo novo em ArticleDNA/SiloDNA. Detalhe em
`docs/05-radar/estado-atual.md`, `docs/07-redator/estado-atual.md` e `docs/08-publicacoes/estado-atual.md`.

- **Etiqueta nas cinco áreas (§6.4, §9.1-A):** `EDITORIAL_GROUP_AREAS` ganhou `redator` e `publicacoes`; a `GlobalTopbar`
  (sem mudança no arquivo) já renderiza a etiqueta para toda área da lista, com a escolha por área. Redator: a lista de
  documentos filtra pela cor, com faixa e etiqueta; Publicações: Biblioteca, Fila, Publicados e Atualizações filtram, com
  faixa e etiqueta. O grupo efetivo dos artigos (`useEditorialGroups`) só é lido depois da mesa ou com uma cor escolhida.
  Só tela; contratos iguais.
- **Radar (§6.3):** a mesa já tinha etiqueta, filtro e faixa (conferido). A regra 24 do artigo-modelo ganhou a frase da
  promessa declarada (parte dela, sem ampliar nem trocar o escopo); `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION` não mudou.
- **Entregáveis:** o CSV "Para escrever" e `get_article_for_writing` (a mesma montagem) levam `Grupo: <cor> · <nome>` e a
  promessa declarada na coluna artigo (`radarWritingGroupLines`; sem moldura; D10); o MCP devolve também `group`. Artigo
  sem grupo: o arquivo de antes, byte a byte. Leitura do grupo por `readArticleGroupLabels` (efetivo, estreita, nunca
  segura o arquivo).
- **MCP (§6.5):** o parâmetro é `group` (não `groupId`): a COR ("laranja"), "sem-grupo" ou o uuid de antes, em
  `get_platform_state` (keywords e Assuntos pelo grupo da keyword; artigos, Silos, itens do Radar e documentos pelo grupo
  efetivo do artigo; publicadas = o site inteiro) e `list_platform_keywords`; cor sem grupo = recorte vazio dito em
  `group.description`. Sem o parâmetro, as consultas de antes. Recorte puro em `lib/editorial/editorial-group-scope.ts`.
- **`declare_silo_plan` POR COR (recomendação aprovada pelo dono):** `group { mode: "color", color, name? }`. No núcleo
  único (`importDeclaredPlanWithCore`): a cor que já tem grupo ativo recebe o plano (`readActiveEditorialGroupIdForColor`,
  a mesma escolha do ensure); a sem grupo ganha o grupo no `apply` por `ensureEditorialGroupForColor` (reativa o arquivado
  da cor ou cria), depois `declareEditorialGroupPlan` e o nome do Silo (ou o `name`). `mode: "new"` (o diálogo da tela)
  segue a mesma regra; `existing` (uuid) continua aceito. Nunca dois grupos da mesma cor. `createDeclaredPlanGroup` ficou
  sem chamador (continua exportado no repositório).
- **Catálogo:** notas de `minerador.keyword_groups`, `minerador.declare_silo_plan`, `arquiteto.article_groups` (título e
  tela com Redator e Publicações) e `radar.export_for_writing`.
- **Testes:** novos `tests/radar-grupos-f6-entregaveis.test.mts` (10, no glob do Radar) e `tests/agent-grupos-f6-mcp.test.mts`
  (9, em `test:agent`); `tests/radar-grupos-etiqueta-topbar.test.mts` cobre Redator e Publicações (+4); dois testes
  estruturais do Radar atualizados para a montagem com `grupos`. Contagens: `test:radar` 3498 (3497 + 1 pulado; era 3484);
  `test:agent` 88/88 (era 79); `test:redator` 357/357; `test:redator:mcp` 150/150; `test:editorial` 172 com as 4 antigas;
  Minerador por glob 1236 com as mesmas 28 falhas antigas (por nome); `tsc` 0. `test:arquiteto` 2853 com 4 falhas em
  arquivos do Arquiteto em edição paralela (`arquiteto-artigos-simples`, `arquiteto-links-observabilidade`,
  `arquiteto-retomada-fechamento`, `arquiteto-serp-partial`) — não tocados nesta fase.
- **Limites:** o CSV de vídeo não leva o grupo; Redator e Publicações sem teste DOM da lista filtrada (estrutural + topbar
  em DOM); a leitura do grupo no export roda também no formato completo e no de vídeo (a montagem é uma só).
- **Validado manualmente: não.** Homologação do dono.

#### Adendo de 2026-10-12 — interface dos grupos e do plano (Gerenciar a cor, Histórico do grupo, selos, Tirar do plano)

Dono do módulo: Compartilhado/editorial (grupos), com o núcleo do plano no Minerador e pontos no Arquiteto. Sem migration,
sem escrita remota, sem SQL remoto, sem chamada paga nem de IA, sem campo novo em ArticleDNA/SiloDNA. Detalhe em
`docs/03-minerador/estado-atual.md` e `docs/04-arquiteto/estado-atual.md` (seções do mesmo dia).

- **Gerenciar a cor (decisão aplicada, recomendada e aprovada):** no menu da etiqueta, engrenagem por cor que já tem grupo
  (só com a lista do servidor). (a) **Nome (opcional)** — vazio = o nome da cor; (b) **Trocar a cor** — só para cor LIVRE;
  ocupada = recusa `GROUP_COLOR_TAKEN` explicando que juntaria dois grupos (nunca funde); o nome que era só a cor
  acompanha a cor nova; a escolha das áreas que olhavam a cor antiga acompanha o grupo; (c) **Liberar a cor** — arquiva,
  só sem keywords (inclusive na lixeira, porque são restauráveis), artigos etiquetados, plano ou Silo ligado; senão
  `GROUP_NOT_EMPTY` com as contagens. `PATCH /api/editorial/groups` = `manageEditorialGroup` →
  `updateEditorialGroup` de sempre (trava otimista, releitura, evento). **Mudança de permissão (aditiva):** o PATCH passou
  de `minerador:edit` para edição no Minerador, no Arquiteto ou no Radar (a mesma regra do "garantir a cor"), porque as
  três áreas mostram a etiqueta. `status: "archived"` continua aceito (= liberar).
- **Histórico do grupo (§10.4):** `GET /api/editorial/groups/history` (leitura de quem vê a marca; até 10 grupos, os da cor
  escolhida), lido só ao abrir. Fontes: `editorial_group_events` e as tentativas de `operation_ledger`
  (`editorial_workflow_items`, filtro `payload->>groupId`), no formato do §10.1; leitura tolerante (linha sem data ou de
  outro grupo é descartada; erro no registro do guarda vira aviso, não falha). Link do resultado só se for caminho
  interno. Ator: "Você" ou "Outro membro · id curto" (sem expor e-mail; nome do ator fica no backlog).
- **Selos do plano no Arquiteto (§9 item 6):** "Pilar do plano · 1º" / "Suporte do plano · nº", "Principal declarada",
  "Principal ≠ declarada" (aviso, nunca troca) e "Fora do plano" na linha do artigo; "Plano declarado · Pilar: …" na
  SiloPage (aba Artigos) e no cartão do Silo (aba Silos). Só leitura do pacote aprovado (`ArchitectSubjectStanding`).
- **Tirar do plano (§6.1 item 5; a SDD só dizia "sair do plano antes de mover"):** menor versão coerente, registrada aqui.
  Núcleo `withdrawFromDeclaredPlanWithCore` (`lib/minerador/declared-plan-withdraw-core.ts`; rota
  `/api/minerador/marcas/[brandId]/plans/withdraw`, POST com `minerador:edit`): prévia com `decisionHash` → aplicar só com
  o mesmo hash → grupo com o plano restante pelo `declareEditorialGroupPlan` (`plan_version + 1`; `plan_hash` = o que
  reimportar o texto restante daria; evento `plan_changed` com `withdrawal`, via o novo `eventPayload` opcional) →
  principal sem a marca → Assunto sem `keyword_subject.plan` (ainda declarado) → releitura. Decisões: o Assunto e a
  principal **ficam no grupo** (nenhum `group_id` muda) e deixam de estar presos a ele; os outros Assuntos do plano não
  são regravados (guardam o `planVersion` do ato, que é proveniência); o Pilar não sai (`PILLAR_CANNOT_LEAVE`: trocar o
  Pilar = reimportar o plano); o artigo do Arquiteto não é tocado — o Arquiteto só obedece ao pacote aprovado, então o
  selo "Fora do plano" aparece depois da reaprovação e do novo envio, e "Retirar artigo do Silo" continua sendo o caminho
  para as keywords do artigo voltarem a "Keywords não agrupadas" do grupo. Nada é apagado. **Sem ferramenta MCP** (só
  tela); o catálogo descreve o caminho (`minerador.withdraw_from_declared_plan`).
- **Catálogo (AGENTS §17.1):** operações `editorial.group_manage_and_history` e `minerador.withdraw_from_declared_plan`
  (as duas `access: "ui"`, grátis, decisão humana), com os selos descritos nas notas.
- **Testes:** `tests/editorial-grupos-gerenciar-historico.test.mts` (10, `test:editorial`),
  `tests/minerador-plano-tirar-do-plano.test.mts` (6, glob do Minerador), `tests/radar-grupos-gerenciar-historico-dom.test.mts`
  (5, DOM, `test:radar`), `tests/arquiteto-selos-do-plano.test.mts` (4, `test:arquiteto`); listas/regex ajustadas de
  propósito: `tests/minerador-assunto-dominio.test.mts` (novo chamador de `setKeywordSubject`),
  F1-17 de `tests/minerador-grupos-f1.test.mts` (PATCH = Gerenciar), `tests/arquiteto-links-observabilidade.test.mts` e
  `tests/arquiteto-retomada-fechamento.test.mts` (a revisão da linha ganhou `declaredPlanSealsFor` — eram as duas falhas
  "em edição paralela" citadas no adendo F6). Suítes no fim: `test:arquiteto` 2853/2853, `test:agent` 88/88,
  `test:radar` 3503 (3501 + 1 pulado + 1 falha de outra frente: `radar-artigo-modelo-congelamento`, export do Radar),
  `test:editorial` 182 com as 4 falhas antigas, Minerador por glob 1258 com as MESMAS 25 falhas antigas (por nome),
  `tsc` 0, eslint dos arquivos tocados sem erro.
- **Validado manualmente: não.** Homologação do dono (dark mode, 360/768/1024/1440 px, foco, Esc, os dois diálogos).

#### Adendo F5 de 2026-10-12 — guarda de retrabalho completa

Dono do módulo: Arquiteto (domínio compartilhado em `lib/editorial`). Sem migration, sem tabela nova, sem escrita remota (o
schema de `editorial_workflow_items` foi conferido por SELECT: sem CHECK em `subject_type`, UNIQUE `(marca_id, subject_type,
subject_id, stage)`, `source_entity_id` não vazio, `state` 1..80, `source_version_id` FK opcional; os 12 itens do Radar são
`article`), sem chamada paga, sem campo novo em ArticleDNA/SiloDNA. Detalhe em `docs/04-arquiteto/estado-atual.md`.

- **§6.3 (pré-requisito):** `WorkflowRepository.list` lê `subject_type = 'article'` e `stage = 'radar'`. Os outros leitores
  de `editorial_workflow_items` filtram por `subject_type`, por `article_id` (nulo na linha do guarda) ou no código. A linha do
  guarda usa `source_entity_id = subject_id` (o ciclo de exclusão da keyword não a alcança).
- **§10.1:** domínio `lib/editorial/rework-guard.ts` (`operationFingerprint` = `contentHash`; `assessRework` com política por
  operação; `decideRework`; linha `operation_ledger` com as últimas 20 tentativas `{ at, actorId, outcome, outcomeCode,
  resultRef, costUsd, message?, overrideReason? }`, `kind`, `fingerprint`, `groupId`, `inputsSummary`; nomes canônicos em
  `REWORK_OPERATION_LABELS`). Servidor `lib/server/rework-guard.ts` (`checkRework`, `recordOperation` melhor esforço e
  idempotente, `runUnderReworkGuard`, `ReworkRefusedError`, porta `reworkGuardPort`). Registro próprio reaproveitado: a
  execução da melhoria (`inputsHash`) e o registro de uso; ganham linha a coleta PAGA da SERP por artigo, a conclusão da
  formação (rota do marcador), a recusa da gravação do ArticleDNA, o fechamento do Silo, a retirada e o plano no Silo.
- **§10.2/§10.3:** melhoria — mesma execução devolvida com `rework` (as 9 viram 1), `reworkOverride` refaz IA e medições,
  busca não repetida, Assunto com lista do Minerador fora da busca; SERP paga — a mesma composição paga e inconclusiva sai do
  plano e volta como falha `REWORK_SAME_REFUSAL` (todos barrados = 409); ArticleDNA — `DECLARED_PLAN_CONTRADICTION` (mudança
  da principal ou do papel para longe do plano, lida do pacote aprovado do Assunto) e `REWORK_PARALLEL_PATH` (ArticleDNA novo
  sem Assunto, não publicado, principal em grupo com plano), sem override; fechamento — a mesma recusa anterior à RPC volta 409
  `REWORK_SAME_REFUSAL` sem chegar à RPC. "Refazer mesmo assim" (D11) aceito para `same_inputs_reuse` e `same_refusal` com
  motivo (≥ 5 caracteres); nunca para plano declarado nem caminho paralelo.
- **§10.4:** `components/editorial/rework-notice.tsx` acima dos botões da melhoria, das prévias do plano no Silo e da
  retirada, e em "Fechamento dos Silos". As respostas trazem `rework: { verdict, previous, … }`; o MCP devolve o código e o
  `rework` (`app/api/mcp/redator/route.ts`), `improve_articles` aceita `reworkOverride`; catálogo atualizado.
- **D6 (decisão do dono):** a keyword liberada por artigo rejeitado fica em "Keywords não agrupadas" do grupo dela, com o
  motivo; a formação automática não a reagrupa (`releasedHold`); formação humana posterior à rejeição a tira daí.
- **Backlog do Arquiteto:** "Gravar sem validar (n)" só com validação obrigatória pendente (`improvementRowApplyLabel`);
  teste de integração da melhoria com Assunto de plano declarado e principal sem volume (D2(a)).
- **Ordem de deploy:** o filtro do Radar (`subject_type = 'article'`) sobe ANTES ou JUNTO de qualquer código que grave
  `operation_ledger` — no mesmo deploy da F5 serve, porque nenhuma linha existe antes dele. Nada depende de migration.
- **Testes:** `test:arquiteto` 2867/2867 (era 2849), `test:arquiteto:servidor` 122/122 (era 114), `test:arquiteto:lentes`
  90/90 (era 85), `test:agent` 88/88, `test:redator` 357/357, `test:redator:mcp` 150/150, `test:editorial` 182 com as 4 falhas
  antigas (mesmos nomes), `tsc` 0. Os números de base incluem o trabalho das frentes paralelas do mesmo dia.
- **Limites:** o fingerprint do fechamento usa o envelope (sem ids e datas) e os locks — estado lido só no servidor que mude
  sem mudar o envelope pede "Refazer mesmo assim" pela rota; o fechamento automático não oferece override na tela; `costUsd` por
  artigo da coleta paga fica nulo (o custo exato está em `integration_usage_events`); a lista do Assunto fora do artigo e de não
  agrupadas segue conferida pela portaria `DECLARED_PLAN_PRESERVED` da tela (a gravação confere principal e papel).
- **Validado manualmente: não.** Homologação do dono: preparar a melhoria duas vezes na WifiConecta, "Refazer mesmo assim"
  com motivo, retirar "plano vivo controle" e conferir as linhas `operation_ledger` por SELECT.
