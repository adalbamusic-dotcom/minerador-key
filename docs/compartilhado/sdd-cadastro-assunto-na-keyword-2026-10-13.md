# SDD — Cadastro único: o Assunto mora na keyword — 2026-10-13

> **Status: APROVADA PELO DONO em 2026-10-13 para SDD + implementação em fases.**
> Adendo da SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`
> (o plano declarado continua valendo; esta SDD muda a PORTA de entrada, o
> lugar do Assunto e a regra da principal declarada). Emenda o ADR-022 (D1-ter).
> Sem migration, sem SQL remoto, sem escrita no banco, sem chamada paga.
> Commit, push e deploy são do dono (`AGENTS.md` §15).

**Por que um arquivo próprio e não mais um adendo na SDD de 2026-10-12:** aquela
SDD já tem seis adendos e 1.358 linhas; esta decisão revisa a D1/D1-bis (a
principal declarada deixa de ser sempre fixa), troca as duas portas de entrada
por uma e muda o lugar do Assunto (da linha própria para dentro da keyword). É
decisão nova, com autorização nova; a SDD de 2026-10-12 ganha só a referência
no §18.1.

## 0. Resumo para o dono

Você sempre cadastra um grupo de Assuntos que (a) forma um Silo novo, (b) entra
num Silo existente ou (c) reforça artigos já publicados, e já chega com a
provável keyword e os detalhes. A plataforma passa a ter **um card só** para
isso no Minerador ("Cadastrar Assuntos"): no topo a cor e o destino; em cada
linha o Assunto (título), a keyword, os detalhes, o papel/posição e a trava.

O Assunto **nunca mais fica sozinho**: ele mora dentro da linha da keyword. É a
keyword que passa pelos processos normais (Lógica, aprovação, envio, SERP) e
carrega o Assunto. Nenhuma linha "Assunto" solta é criada.

A trava: keyword **com volume medido** entra **travada** (o Arquiteto a usa como
principal e só procura sustentações); **sem volume** entra **livre** (o Arquiteto
pode trocá-la por uma principal melhor pela SERP/volume, mas o Assunto, o papel
e a ordem continuam presos ao artigo). Você troca a trava à mão quando quiser.

## 1. Identificação

- **Módulo proprietário:** Minerador (o cadastro nasce nele). Consumidores com
  mudança: Arquiteto (obedece à trava; "Processar arquitetura" respeita o
  plano), MCP/catálogo (`AGENTS.md` §17.1). Radar, Redator e Publicações só
  leem o que já leem (`ArticleDNA.subject.phrase`, `promise`).
- **Data e aprovação:** 2026-10-13, dono do produto. Palavras do dono
  (resumidas): "começar por um card de cadastro único com a cor do grupo e, por
  artigo, o Assunto/tema (título), uma keyword atrelada e os detalhes"; "o
  assunto nunca mais ficaria sozinho: desde o cadastro ele está por trás de uma
  keyword, mesmo que essa keyword não preste; é a keyword que passa pelos
  processos normais e carrega o assunto"; "keyword com volume medido entra
  travada como principal; sem volume entra livre; eu posso trocar a trava
  manualmente"; "vai ser só reconhecer se a keyword está livre para ser trocada
  ou não, e essa keyword é um Silo ou um artigo que já tem um assunto dentro, e
  ela já teria a sua tag também".
- **Tipo:** estrutural (contrato do Assunto, regra de aprovação/formação, porta
  de entrada) → esta SDD (`AGENTS.md` §4). Campos novos só aditivos em jsonb.

## 2. Contrato atual (verificado no código em 2026-10-13)

| # | Onde | Hoje |
|---|---|---|
| A1 | `lib/minerador/keyword-subject.ts` | O Assunto é uma **keyword própria**: `analise_semantica.keyword_subject = { declared, note, destinationUrl, destinationCheck, plan? }`; a frase do Assunto É o texto da linha. |
| A2 | `lib/minerador/declared-plan.ts` | `keyword_subject.plan = { groupId, planVersion, order, role, scope, declaredPrincipal }`; `.strict()`. |
| A3 | idem + `keyword-subject.ts` | A principal declarada é **outra linha**, com a marca recíproca `keyword_declared_principal = { subjectKeywordId, groupId, planVersion }`. |
| A4 | ADR-022 D1-bis | A principal declarada é **fixa**, mesmo sem volume; o Assunto só é a própria principal com Volume validado (Q7). |
| A5 | Duas portas | "Colar Assuntos"/"Importar CSV de Assuntos" no Processador (`discovery-source-controls.tsx` → `POST …/subjects/import` → `importSubjectsWithCore`) e "Importar plano do Silo" (`declared-plan-import-dialog.tsx` → `POST …/plans/import` → `importDeclaredPlanWithCore`). A Pesquisa por Assunto também declara a frase pesquisada pela rota `…/subjects/import`. |
| A6 | MCP | `declare_subjects` (Assunto solto, `importSubjectsWithCore`), `declare_silo_plan` (plano), `import_subject_keywords` (sustentações da Pesquisa por Assunto). |
| A7 | Arquiteto | `readArchitectSubjectStanding` lê do pacote aprovado: `phrase` = texto da linha; `heldOutOfFormation` = Assunto sem volume; `plan`/`declaredPrincipal`. A formação (`planSiloArticleFormation`/`reservePriorityArticleGroups`), a portaria (`DECLARED_PLAN_PRESERVED`, `SUBJECT_PRINCIPAL_REQUIRES_VOLUME`), a melhoria (`needsPrimary`, `enforceDeclaredPrincipals`), a guarda (`contradicts_declared`) e os selos tratam toda principal declarada como fixa. |
| A8 | "Processar arquitetura" | `buildArchitectureWorkingProposal` agrupa por afinidade léxica/DNA; não conhece o plano declarado — pode espalhar as keywords de um plano em Silos diferentes. |

## 3. Proposta

### 3.1 O cadastro (uma porta só)

**Card "Cadastrar Assuntos"** no Minerador (barra do topo, ao lado de "Colar
keywords" e "Importar CSV"; some com os grupos indisponíveis, 409):

- **Topo:** a **cor** (as 5 fixas, §9.1-A — `ensureEditorialGroupForColor` no
  `apply`) e o **destino**:
  - *Silo novo* — Nome, Slug, Objetivo;
  - *Silo existente* — um dos grupos com plano declarado (a cor vem do grupo);
    as linhas já gravadas aparecem (leitura compatível, §5) e as novas são
    acrescentadas;
  - *Artigo publicado* — a URL da página.
- **"Colar plano em texto"** — o mesmo formato de `parseDeclaredPlanText`
  (cabeçalho do Silo + "1. Título" + "Palavra-chave: …" + descrição; aceita
  também "Trava: travada|livre|automática") preenche o topo e as linhas.
- **Linhas:** `#` (ordem), Papel (Pilar/Suporte; no Silo novo a 1ª é Pilar),
  **Assunto (título)**, **Keyword**, **Detalhes** (até 1.200, uma linha), **Trava**
  (Automática pelo volume · Travada · Livre).
- **Prévia → Aplicar → releitura** (a mesma disciplina de hoje:
  `importRequestId` por prévia, `canApply`, sucesso só depois da releitura).

As portas antigas saem: o select "Esta lista é → Assunto" do Processador some
(o colar/CSV do Processador volta a ser só keyword), o botão "Importar plano do
Silo" vira o card, a Pesquisa por Assunto não declara mais a frase pesquisada
(importa as sustentações SEM vínculo quando a frase não é Assunto cadastrado, e
diz isso), a rota `POST …/subjects/import` responde `410 SUBJECT_ENTRY_MOVED` e
a ferramenta MCP `declare_subjects` sai (o `declare_silo_plan` é o cadastro).

### 3.2 O modelo: o Assunto dentro da keyword

Na linha da keyword K (a "keyword atrelada"), no mesmo `analise_semantica`:

```ts
keyword_subject = {
  declared: true, note: null, destinationUrl: null, destinationCheck: null,
  /** NOVO, opcional: o Assunto cadastrado DENTRO da keyword. */
  entry?: { title: string /* 1..300, uma linha */; source: "cadastro"; details?: string /* só no destino publicado */ },
  plan?: {
    groupId, planVersion, order, role, scope /* = os detalhes */,
    declaredPrincipal: { keywordId: K, phrase: K.keyword },   // a própria K
    /** NOVO, opcional: trava MANUAL. Ausente = automática. */
    lock?: "locked" | "free",
  },
}
keyword_declared_principal = { subjectKeywordId: K, groupId, planVersion }   // recíproca de si mesma
group_id = o grupo da cor
```

- **Nenhuma linha "Assunto" nova.** O título é texto do cadastro, não keyword.
- **Origem do cadastro:** `entry.source = "cadastro"`, `keyword_subject_origin =
  "import"`, ator e data (`keyword_subject_actor/_at`), histórico append-only, e
  o bloco `subject_import` com o canal MCP quando veio do MCP.
- **Frase do Assunto no Arquiteto:** `entry.title` quando existe; senão o texto
  da linha (dados anteriores). É o que vira `ArticleDNA.subject.phrase`.
- **Detalhes:** `plan.scope` (vira a `promise` do ArticleDNA, D8) — no destino
  publicado, `entry.details`.

### 3.3 A trava (D1-ter — revisão da D1/D1-bis)

Função única `declaredPrincipalLock(plan, { subjectKeywordId, volume })`
(`lib/minerador/declared-plan.ts`), usada pela prévia do Minerador e pelo
Arquiteto:

| Situação | Trava efetiva | Origem |
|---|---|---|
| `plan.lock` gravado | o valor gravado | `manual` |
| Assunto na própria keyword (`declaredPrincipal.keywordId === subjectKeywordId`), sem `lock` | **travada** se o Volume está validado e > 0; **livre** se não | `volume` |
| Plano anterior ao cadastro (Assunto e principal em linhas separadas), sem `lock` | **travada** | `declarada` (D1-bis, decisão humana já confirmada — `AGENTS.md` §9) |
| Sem principal declarada | — | — |

- **Medir volume atualiza a trava sozinha**, sem escrita nova: a trava
  automática é derivada do Volume do pacote aprovado. Medir é por clique do dono
  (botão "Volume", pago, com prévia); nada mede automaticamente.
- **Travada** = a principal fixa de hoje (D1-bis): `suggestPrincipal` não roda,
  a melhoria não troca, a guarda recusa `contradicts_declared`.
- **Livre** = a formação e a melhoria podem propor outra principal pela SERP/
  volume (as sustentações com volume da lista do Assunto); sem candidata melhor,
  a própria keyword livre continua principal. O Assunto (K), o papel e a ordem
  continuam presos ao artigo; trocar é proposta na prévia, decisão humana, nova
  versão e histórico (como toda melhoria). Quando outra keyword assume, K fica
  como o tronco do artigo (`subject`), fora das seis keywords (ADR-022).
- **Q7 revista:** a keyword que carrega o Assunto pode ser a principal do
  próprio artigo sem volume (é keyword, não frase de título). A portaria
  `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` continua valendo para o Assunto antigo
  (frase própria) sem volume.
- **Aprovação (D2/D2-bis):** inalterada — K tem Assunto declarado e a marca de
  principal declarada, então aprova só com a Lógica.

### 3.4 Destinos

- **Silo novo / Silo existente** — o plano declarado de sempre (grupo + Silo
  planejado em `editorial_groups.plan`). **Semântica de acréscimo:** as linhas
  enviadas são casadas com os artigos já gravados do grupo (pela keyword, pelo
  Assunto anterior ou pela principal anterior); casadas e iguais ficam como
  estão (sem regravar, sem voltar a "Em revisão"); mudadas e novas são gravadas
  com a versão nova do plano; **nenhum artigo sai** pelo card (tirar é "Tirar do
  plano"). "Silo novo" numa cor cujo grupo já tem OUTRO Silo é recusado ("use
  Silo existente ou outra cor"); o mesmo Silo (mesmo nome) é aceito.
- **Artigo publicado (URL)** — a URL é conferida no domínio da marca e ligada à
  keyword publicada (Vínculo/`site_origin`). O Assunto (título e detalhes) é
  declarado NA keyword publicada — o "Assunto declarado numa página publicada"
  do ADR-022, sem mudar URL, slug, canonical nem principal (`AGENTS.md` §11); as
  keywords das linhas entram como sustentações desse Assunto pelo núcleo da
  Pesquisa por Assunto (`importSubjectDiscoveryWithCore`, origem nova
  `cadastro`), com a cor. O Arquiteto as recebe pelo caminho de sempre: a
  formação põe a sustentação primeiro na página publicada (passo 1a) e "Melhorar
  publicados" trata a página como alvo publicado. Trava não se aplica (a
  principal do publicado é protegida).

### 3.5 Arquiteto obedece à trava

- `readArchitectSubjectStanding`: `phrase` = título; `planLock`; `heldOutOfFormation`
  falso quando o Assunto mora na própria keyword; `principalAllowedWithoutVolume`.
- Formação: âncora do plano com `free` — principal = `suggestPrincipal` entre a
  keyword livre (se tiver volume) e as sustentações com volume da lista do
  Assunto; sem candidata, a keyword livre. Travada: como hoje.
- Portaria `DECLARED_PLAN_PRESERVED` e guarda `contradicts_declared`: só a
  principal **travada** é conferida; papel e lista do Assunto continuam
  conferidos sempre.
- Melhoria: `declaredPrincipalId` só com trava; a keyword livre é a principal
  atual quando o artigo ainda não existe; D2(a) (parecer pelas sustentações)
  vale para a keyword do plano, travada ou livre.
- Selos: "Principal declarada · travada (volume|manual|declarada)" e "Keyword
  livre · o Arquiteto pode propor outra"; "Principal ≠ declarada" só com trava.
- **"Processar arquitetura" não reorganiza o plano:** keywords de grupo com
  plano declarado (o grupo dos Assuntos com plano no pacote aprovado) saem da
  análise automática e são atribuídas, juntas, ao Silo do plano (o já ligado ao
  grupo, o existente com o mesmo slug, ou um candidato novo com nome/slug do
  plano), com o motivo "segue o plano declarado do grupo <cor>"; a tela diz
  isso no painel da arquitetura.

## 4. Emenda ao ADR-022 (D1-ter)

Ver o ADR (seção "Emenda D1-ter"). Em resumo: o Assunto cadastrado mora na
keyword; a principal do plano é travada pelo volume medido ou à mão, livre sem
volume; a principal livre pode ser trocada pela formação/melhoria com decisão
humana, mantendo o Assunto, o papel e a ordem; a keyword que carrega o Assunto
pode ser principal sem volume (Q7 revista só para ela); planos anteriores
continuam travados até o dono mudar.

## 5. Compatibilidade e os dados da WifiConecta

- **Leitores aceitam os dois formatos** (Assunto em linha própria, com a
  principal em outra linha; e Assunto dentro da keyword). Nenhum dado gravado
  muda de significado: planos anteriores ficam **travados** (`declarada`).
- **Conversão do Silo 1 (grupo laranja, "Planos e contratação") — pela leitura
  compatível, sem reprocessar nem pagar:** o card, com destino "Silo existente →
  Laranja", lê o plano gravado e mostra os 8 artigos já no formato novo (título =
  frase do Assunto anterior, keyword = principal declarada, detalhes = escopo,
  papel, ordem, trava "Travada · declarada antes do cadastro único"). Nada é
  regravado só por abrir. Se o dono mudar algo numa linha (por exemplo destravar
  o artigo 3), o card grava NESSA linha (o Assunto anterior continua na linha
  dele; a principal continua com a marca) — sem criar linha nova, sem mexer nos
  ArticleDNA (o Arquiteto vê a mudança pelo pacote reaprovado, "Atualização
  disponível").
- **Silo 2 ("Wi-Fi e fibra óptica")** entra pelo card com outra cor (ex.: Azul):
  7 keywords novas (bruto) com o Assunto dentro, nenhuma linha de título,
  Pilar = artigo 9.
- **Rollback de código** abaixo desta entrega: os leitores antigos leem o plano
  com `lock`/`entry` como malformado (`safeParse` → sem plano), sem 503 — o
  plano gravado pelo card fica inerte e volta ao reimplantar. Por isso a
  **ordem de deploy** é a de sempre: esta entrega inteira num deploy só (os
  leitores e o card juntos); nenhuma escrita acontece antes do deploy.

## 6. Migration

**Nenhuma.** Tudo é jsonb aditivo em `analise_semantica`; `editorial_groups`
(M1) já existe; a origem nova da Pesquisa por Assunto é valor de lista em jsonb
(leitores antigos a descartam por `normalizeSubjectDiscoveryOrigins`).

## 7. Consumidores

| Consumidor | Efeito | Proteção |
|---|---|---|
| Minerador: aprovação (D2/D2-bis), envio ao Arquiteto | nenhum (K é Assunto e principal declarada) | testes da aprovação |
| `KeywordDna` (`.strict()`) | `subject.entry?`, `subject.plan.lock?` | teste com pacote antigo e novo |
| Formação / `declared-plan-formation.ts` | âncora livre; trava | testes com fixture do Silo 2 e da WifiConecta |
| Portarias `DECLARED_PLAN_PRESERVED`, `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` | só travada; carregada pela keyword isenta | testes |
| Melhoria (`article-improvement.ts` + servidor) | `declaredPrincipalId` só travada; D2(a) para a keyword do plano | testes |
| Guarda (`declared-plan-rework.ts`, servidor) | `contradicts_declared` só travada | testes |
| Selos do plano | rótulos da trava | testes |
| Silo / `silo-declared-plan.ts` | casa pelo Assunto primeiro (sem mudança) | regressão |
| "Processar arquitetura" | plano fora da análise automática | teste do domínio |
| Radar / Redator / Publicações | `subject.phrase` = título | sem mudança de contrato |
| MCP `declare_silo_plan` | destino e trava; mesmo núcleo do card | `test:agent` |
| MCP `declare_subjects` | sai (porta paralela) | `test:agent`, `test:redator:mcp` |
| Catálogo | operação "Cadastrar Assuntos", regras da trava | `test:agent` |
| Pesquisa por Assunto | não declara a frase | testes estruturais |

## 8. Riscos

- **R1 · Troca da principal livre** — só por proposta na prévia, com decisão
  humana; o Assunto nunca sai do artigo.
- **R2 · Reaprovação** — mudar a trava ou os detalhes muda o pacote; volta a "Em
  revisão" só a linha mudada; a reaprovação só pede a Lógica.
- **R3 · Dois formatos convivendo** — leitura única (`declaredPrincipalLock`,
  `subjectPhraseOf`), testes dos dois.
- **R4 · Rollback** — §5.

## 9. Testes (fixtures, sem chamada paga)

`tests/minerador-cadastro-assunto-na-keyword.test.mts` (modelo, trava, parser
com "Trava:", prévia/aplicar/releitura com o Silo 2, acréscimo em Silo existente,
recusa "Silo novo" em cor com outro Silo, destino publicado, leitura compatível
do Silo 1, isolamento por marca), `tests/arquiteto-trava-da-keyword.test.mts`
(standing, formação travada/livre, portarias, melhoria, guarda, selos,
"Processar arquitetura"), ajustes declarados nos testes do plano, do MCP e do
catálogo. Suítes: `test:arquiteto`, `test:arquiteto:servidor`,
`test:arquiteto:lentes`, `test:radar`, `test:redator`, `test:redator:mcp`,
`test:agent`, `test:editorial`, Minerador por glob, `tsc`.

## 10. Fases

1. **C1 · Leitores** — contrato aditivo, trava, frase do Assunto, compatibilidade.
2. **C2 · Núcleo e rota** — cadastro (Silo novo/existente/publicado), leitura
   compatível, recusas.
3. **C3 · Card** — tela única; portas antigas fora.
4. **C4 · Arquiteto obedece** — formação, portarias, melhoria, guarda, selos.
5. **C5 · Processar arquitetura** respeita o plano.
6. **C6 · MCP e catálogo**.

As seis vão no mesmo pacote de código (um deploy); ver §11 para o andamento.

## 11. Andamento

| Fase | Estado em 2026-10-13 |
|---|---|
| C1 Leitores | feito: `plan.lock`, `keyword_subject.entry`, `declaredPrincipalLock`, `subjectPhraseOf`, `KeywordDna.subject.entry` |
| C2 Núcleo e rota | feito: `importDeclaredPlanWithCore` com destino e acréscimo; `readDeclaredPlanCardRows`; `GET/POST …/plans/import`; `subjects/import` → 410 |
| C3 Card | feito: `modules/minerador/subject-cadastro-card.tsx`; diálogo antigo removido; Processador sem "Esta lista é: Assunto"; Pesquisa por Assunto sem declarar a frase |
| C4 Arquiteto | feito: standing, formação livre/travada, portarias, melhoria, guarda, selos |
| C5 Processar arquitetura | feito: `declaredPlanGroups` na proposta + aviso no painel |
| C6 MCP e catálogo | feito: `declare_silo_plan` com `destination` e `lock`; `declare_subjects` removida; catálogo e playbooks |

Suítes (antes → depois, mesma árvore com o trabalho paralelo): `test:arquiteto` 2868 → 2876 (0 falha);
`test:arquiteto:servidor` 122 → 122; `test:arquiteto:lentes` 90 → 90; `test:radar` 3509 (3508 + 1 pulado, 0
falha; a base desta sessão tinha 48 falhas DOM da frente paralela, já resolvidas por ela); `test:redator` 361;
`test:redator:mcp` 150 → 150; `test:agent` 88 → 88; `test:editorial` 182 com as MESMAS 4 falhas antigas;
Minerador por glob 1236 → 1245 com as MESMAS 28 falhas antigas (comparadas por nome); `tsc` 0; eslint dos
arquivos novos/tocados sem erro; `git diff --check` limpo. **Validado manualmente: não** (homologação do dono).
Nenhuma migration; nenhuma escrita no banco; nenhuma chamada paga.

### 11.1 C7 · O Assunto sai do Vínculo (pedido do dono, 2026-10-13, mesma autorização)

Palavras do dono: "apagar essa questão do Assunto/tema do Vínculo, tanto da coluna como dos seletores, porque na
planilha já não vai mais existir assuntos, só keywords e dentro dessas keywords estão os assuntos"; "falta colocar
no painel do DNA das keywords o assunto/tema e essas keywords têm que ser tratadas como qualquer keyword".

| Item | Estado em 2026-10-13 |
|---|---|
| Vínculo sem Assunto (Revisão Humana, lote, coluna, resumo "Livre · Artigo · potencial") | feito |
| `subject_declare`/`subject_withdraw` recusados (`SUBJECT_ENTRY_MOVED` no domínio; `subject_entry_moved` no MCP `set_keyword_vinculo`) | feito |
| `subject_withdraw` | **removido de todas as portas**: o "Assunto: Não" apagou o Assunto (título e plano) das 7 keywords do Silo azul da WifiConecta e deixou a marca de principal órfã. Tirar do plano = "Tirar do plano". Assunto anterior sem plano: sem porta de retirada até a decisão da conversão |
| Bloco só leitura "Assunto deste artigo" no painel do DNA (`resolveSubjectArticleView`, `SubjectArticleBlock`), com "Buscar sustentação" | feito |
| Keyword que carrega Assunto = qualquer keyword (KGR, Posto, KGR em grupo, MCP do KGR) | feito; **exceção mínima mantida na aprovação**: D2-bis (marca de principal do plano) aprova só com a Lógica, para a keyword livre chegar ao Arquiteto; D2 restrita ao Assunto anterior (sem `entry`), para não recusar aprovações já feitas |
| Conversão do Assunto antigo da WifiConecta (laranja) | **SDD própria aprovada e implementada em 2026-10-13**: `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` ("Converter formato anterior" no card; "Conversões pendentes do Assunto" no Arquiteto; MCP `convert_legacy_subjects`/`update_article_subject`). A linha-título NÃO vai para a lixeira (que, para keyword não publicada, apaga de vez): fica arquivada por derivação. Execução real pelo dono (runbook §18) |
| Catálogo MCP | feito (`test:agent` verde) |

Consumidores conferidos: `approved-package.ts` (portão e handoff, mesma função), `keyword-dna.ts` (sem mudança: o
`subject` continua no KeywordDNA), Arquiteto (sem mudança: as regras do Arquiteto sobre Assunto sem volume — Q7,
`published-primary-swap`, sugestões — continuam como na C4), Radar/Redator (sem mudança).

Suítes da C7 (antes → depois, mesma árvore): Minerador por glob 1249 → 1251 com as MESMAS 28 falhas antigas
(comparadas por nome, TAP); `test:agent` 88 → 88; `test:arquiteto` 2876 → 2876; `test:arquiteto:servidor` 122;
`test:radar` 3509 (1 pulado, 0 falha); `test:redator:mcp` 150 → 150; `test:minerador:dom` 4; `test:editorial`
182 com as 4 falhas antigas; `tsc` 0; eslint dos arquivos tocados sem erro novo; `git diff --check` limpo.
Leitura remota só por SELECT. **Validado manualmente: não.**

### 11.2 C8 · O Posto de principal da não publicada é a trava; o Assunto no cabeçalho e na linha (pedido do dono, 2026-10-13, mesma autorização)

Palavras do dono: "no minerador eu coloco como [Travado ao slug] e ele não aceita"; "assuntos não estão no cabeçalho
no painel, lá no minerador". Dois conceitos com o mesmo papel (o posto da publicada e a trava do plano) viram um select
só, com o modo da keyword. Sem mudança de contrato do Arquiteto, sem migration.

| Item | Estado em 2026-10-13 |
|---|---|
| Não publicada que carrega o plano (Assunto na keyword, ou principal do formato anterior pela marca recíproca): "Posto de principal" = Travada · Livre · Automática, com o valor efetivo e o porquê (`keyword-plan-lock.ts` sobre `declaredPrincipalLock`) | feito |
| Gravar pelo MESMO núcleo: `POST …/plans/lock` → `setKeywordPlanLockWithCore` → `importDeclaredPlanWithCore` (Silo existente, linha igual, só a trava): nova versão do plano, marca recíproca, releitura | feito |
| Recusa por item: sem plano ("Para travar, cadastre o artigo em Cadastrar Assuntos."), marca órfã, publicada, impedimento do plano, outra marca | feito |
| Lote: mesma regra por item, recusa nomeada, uma trava por artigo; coluna "Travada · Artigo · declarado" | feito |
| Publicada: Travado ao slug · Livre como antes (tela); fora do MCP | inalterado |
| Cabeçalho do Perfil e linha da planilha com o Assunto (título, papel/posição, cor); marca órfã numa linha de aviso | feito |
| MCP `set_keyword_vinculo` `kind: 'plan_lock'` (prévia, aceite, hash, `platform.decide`); catálogo | feito |
| Efeito no Arquiteto: a trava está no pacote aprovado → reaprovar (só a Lógica) e reenviar para ele ler; a tela diz isso | documentado na tela e no catálogo |

Leitura remota (SELECT, 2026-10-13): o Silo azul da WifiConecta tem o plano v1 (7 artigos) e as 7 keywords com a marca
de principal **órfã** (sem Assunto) — a trava é recusada com o caminho "Cadastrar Assuntos → Silo existente". Suítes:
ver `docs/03-minerador/estado-atual.md`. **Validado manualmente: não.**

### 11.3 Adendo C9 · O Assunto nunca se perde (ordem do dono, 2026-10-13)

Palavras do dono, literais: "não podem perder o assunto de jeito nenhum". Caso real (SELECT, 2026-10-13): as 7
keywords do grupo azul (`07fec332-…`, plano v1) ficaram com `keyword_subject = null` — 6 pelo antigo "Vínculo das
selecionadas → Assunto: Não" (origem `batch`, 13/10 05:35 UTC) e 1 pela Revisão Humana (origem `review`, 05:33). O
histórico guardou `entryTitle` e o resumo do plano (grupo, ordem, papel, keyword), **sem o escopo**; a marca
`keyword_declared_principal` ficou. Nenhuma outra cópia do escopo existe no banco (conferido: grupo, eventos, artefatos,
itens de workflow). Esta seção é estrutural (workflow e banco) e foi pedida pelo dono com a migration.

| # | Garantia | Onde |
|---|---|---|
| G1 | **Marcador de liberação** `analise_semantica.keyword_subject_release = { requestId, reason, actorId, at, via }`, com `via` ∈ `tirar_do_plano` · `conversao` · `excluir_cor` (este último **reservado**, sem código hoje). Só uma escrita que traz um marcador **novo** (diferente do gravado) pode tirar o Assunto, desdeclará-lo ou tirar o `plan`/`entry` que ele tinha. | `lib/minerador/keyword-subject.ts` |
| G2 | **Guarda no código** (antes do banco): `setKeywordSubject` com `plan: null`/`entry: null` e `withdrawKeywordSubject` exigem o marcador (`SUBJECT_RELEASE_REQUIRED`); `guardKeywordSemanticWrite` em todo escritor que grava o objeto inteiro: cópia sem a chave **leva** o Assunto (merge, não replace); remoção explícita sem marcador é **recusada com o motivo** ("só Tirar do plano o libera"); o histórico do Assunto é append-only. | tela (`minerador-workspace.tsx`: Lógica, Vínculo, KGR, Revisão, Posto, Potencial), servidor (Lógica e aprovação em `minerador-keyword-decision-core.ts`), MCP (`persistSemanticDecision`) |
| G3 | **Garantia no banco** (migration `20261015120000_assunto_nunca_se_perde.sql`, aplicada pelo dono): gatilho BEFORE UPDATE `minerador_keywords_preserva_assunto` repõe o Assunto que uma escrita apaga sem marcador novo e anota a tentativa no histórico (`preservedBy: "database"`, com o que foi tentado e o plano com o escopo); mantém o histórico append-only; nunca derruba a escrita. Gatilho BEFORE DELETE / UPDATE OF `deleted_at` `minerador_keywords_recusa_exclusao_com_assunto` recusa apagar keyword com Assunto do plano (ou título não liberado) com `KEYWORD_DELETE_SUBJECT_PROTECTED`. | migration + rollback; `lib/server/minerador-keyword-lifecycle.ts` (mensagem) |
| G4 | **Quem libera (lista fechada):** "Tirar do plano" (`declared-plan-withdraw-core.ts`, as duas escritas com `plan: null` levam o marcador; a cadeia `declared-plan-withdraw-chain*.ts` passa por ele). A conversão do formato anterior **não retira** o Assunto da linha-título hoje ("a linha-título não é tocada"), então não grava marcador; a `via: "conversao"` fica disponível para quando retirar. `withdrawKeywordSubject` continua sem chamador. | `tests/minerador-assunto-nunca-se-perde.test.mts` |
| G5 | **Restaurar sem redigitar:** card "Cadastrar Assuntos → Silo existente → <cor>": `readDeclaredPlanCardRows` acrescenta as linhas recuperadas do histórico (última linha do histórico que mexeu no plano, com `plan.groupId` do grupo e a própria keyword como principal; não recupera o que saiu por "Tirar do plano"), com o selo "Recuperado do histórico — confira os detalhes"; detalhes vazios quando o histórico é antigo (sem escopo). "Colar plano em texto" casa pela keyword (ou título) e **só preenche o que falta**. "Cadastrar" grava pelo MESMO núcleo (`importDeclaredPlanWithCore`). Daqui em diante o histórico guarda o escopo (`plan.scope`), e a recuperação traz os detalhes também. | `lib/minerador/subject-recovery.ts`, `declared-plan-import-core.ts`, `subject-cadastro-card.tsx` |
| G6 | **Painel:** "Assunto deste artigo" da marca órfã diz "Assunto retirado em <data> (UTC) por <origem>. Restaurar: Cadastrar Assuntos → Silo existente → <cor> (as linhas já vêm do histórico)". | `subject-article-view.ts` |

**Exclusão futura "Excluir tudo da cor X" (outra SDD, não feita):** encaixa sem mudar a trava — dentro da mesma operação
confirmada (uma transação/RPC do ciclo de vida), primeiro o UPDATE que tira o `plan` com o marcador `via: "excluir_cor"`
(o gatilho G3 aceita e o histórico guarda o que saiu), depois o DELETE (o gatilho de exclusão vê o plano fora e o
marcador `excluir_cor` e deixa passar). Os contratos globais de exclusão (publicada só pela janela de 24 h,
descendentes, confirmação com nome digitado) continuam nas funções de ciclo de vida. Até lá, nenhum código grava
`excluir_cor` (teste de lista fechada).

**Ordem de deploy:** o código desta seção não depende da migration (sem ela, a guarda do código e o marcador já valem);
a migration pode ser aplicada antes ou depois do deploy. Aplicar a migration **antes** do deploy só tem um efeito: o
"Tirar do plano" do código antigo (sem marcador) passa a ter o plano reposto pelo banco e a releitura acusa
"WRITE_NOT_CONFIRMED" — por isso a recomendação é **deploy primeiro, migration depois** (ou ambos sem uso de "Tirar do
plano" no intervalo). **Rollback:** código anterior (o marcador gravado fica inerte; leitores antigos ignoram a chave);
`supabase/rollback/20261015120000_assunto_nunca_se_perde.rollback.sql` tira só os gatilhos.

**Limites:** a marca de principal (`keyword_declared_principal`) não é protegida pelo banco (só o Assunto); o formato
anterior (Assunto numa linha, principal noutra) não é recuperado pelo card; os detalhes das 7 keywords do azul precisam do
plano colado (não estão em nenhum lugar do banco). **Validado manualmente: não.**

### 11.4 Adendo C10 · Consolidar, não reformar — o Arquiteto obedece ao que veio mastigado (pedido do dono, 2026-10-14, noite)

Palavras do dono, literais, depois de testar com a WifiConecta azul: "ele não reconhece o volume [Volume de outra fonte ·
medir no Minerador] … as keywords já estavam formadas no minerador mas [Aguardando formação] … Não entendi por que trocar as
principais [Trocar principal (7)] por que só uma keyword é livre, o resto já estava travado, já tem silo, já tem a sua
ubicação dentro do silo, os slug também já é fácil porque só é o principal. Mas o Arquiteto não viu nada disso, ele querendo
formar tudo de novo querendo fazer novas leituras, querendo refazer e desfazer, e o grupo entrou no Arquiteto bem mastigado,
com tudo pronto era só olhar e consolidar, alertar né, vai ser isso mesmo, e consolida, depois vê o que está faltando as
keywords de suporte, depois fazer as coletas de acordo as principais, processar elas… Aí ele só vê se já tem o silo, cria
ele, consolida/valida tudo e vai em frente para os links internos. Não é complicado. Para que ter duas listas, dois painéis,
uma quantidade de botões que são para fazer e desfazer… para o user tudo isso é muito ruído… Olha, primeira coisa que tem que
olhar é o volume: se já está definido, não pode trocar mesmo que só tenha 10 de volume; e depois tem que olhar se essa
keyword é livre ou já está travada: travado não muda, livre pode procurar por outra similar e trocar… tem que olhar que as
keywords têm dados nos seus DNAs… por que no arquiteto tem duas planilhas?". E, na mesma noite: "apaga este painel de
[Detalhes técnicos], não serve pra nada mesmo"; "só tem que ter uma tabela"; "tem 9 botões no painel do topo, e em distintas
posições, tudo confuso". Autorização do dono pela coordenação (mesma frente; sem migration).

| # | Decisão | Onde |
|---|---|---|
| R1 | **Volume do DNA é volume.** Qualquer volume validado no DNA conta como medido: o botão Volume do Minerador ou a média do Google Ads gravada pela Pesquisa por Assunto com recibo (`origin: subject_search`, `measurementKind: keyword_ideas`). A mesa também lê a linha que remonta do ArticleDNA (sem `volume_source` nem semântica, só `demandEvidence.googleAds`) — era aí que aparecia "Volume de outra fonte". O texto mostra o número e a origem curta ("5.400 · medido em 13/10/2026 · Google Ads" / "· Pesquisa por Assunto"). "Sem média no Google Ads" continua sem volume; outro provider é "Sem volume medido". | `readPlanRowVolume` em `lib/arquiteto/plan-article-sheet.ts` |
| R2 | **A regra da principal.** Volume definido → principal fixa (mesmo 10, mesmo com a trava Livre gravada); sem volume, a trava decide: travada nunca muda; livre pode procurar outra (só na linha dela, decisão humana, nova versão). A trava gravada no Minerador não muda (o Arquiteto só lê). Na linha: um selo curto "Travada"/"Livre" com o porquê no `title`; "Procurar outra principal" só na linha sem volume e Livre; nada de troca em lote. A regra única (`planPrincipalSwapCandidates`) é a mesma na tela e no servidor. | `planSheetLockOf`/`lockView`, `PlanRowActions` |
| R3 | **Chegou com plano = consolidar.** Um botão por etapa: "Consolidar o Silo do plano" (prévia grátis + uma confirmação). O núcleo (`POST /api/arquiteto/plan-silo/consolidate`, exige `arquiteto:approve`) confirma/cria o Silo do plano — primeiro o Silo onde as keywords do plano JÁ estão (na WifiConecta o grupo apontava para um território que não existe mais), senão a regra do envio — e grava o ArticleDNA v1 de cada artigo do plano sem DNA pela MESMA montagem e gravação da melhoria (`makeGroup`, `deterministicArticleDnaPayload`, Assunto, `applyDeclaredPlanToArticleDna`, PATCH da mesa, `appendArquitetoArtifact`, marcador, releitura): principal = a keyword do plano (consolidar nunca troca), secundárias = sustentações já ligadas no Minerador (lista do Assunto, com volume, intenção, no Silo, sem publicada e sem outro artigo), papel e escopo do plano, slug da principal. **Sem parecer de SERP e sem IA**; a decisão humana fica escrita no DNA ("Consolidado do plano do Minerador (decisão humana de <ator> em <data>)…"). O que falta é ALERTA ("sem volume — livre, pode trocar", "SERP das principais na etapa 2"), não bloqueio: a linha sem volume e livre também consolida (D2-bis). Recusa só a linha presa em outro artigo ou cuja principal não chegou. Uma linha por chamada com o MESMO `decisionHash` (a confirmação é uma só; o hash não muda quando a linha aceita vira "já formada" com a mesma composição). Depois das linhas, a tela grava o SiloDNA + SiloPage com o Pilar e a ordem do plano pela consolidação canônica de sempre (`writeSiloPairFromArticles`, o mesmo trecho do fechamento canônico, extraído). | `lib/arquiteto/plan-consolidation.ts`, `lib/server/arquiteto-plan-consolidation.ts`, `writePlanArticleFromPlan` em `lib/server/arquiteto-article-improvement.ts`, rota nova |
| R4 | **Exceção da SERP, estreita.** `articleApprovalRevalidationIssues` ganhou a opção aditiva `declaredPlanConsolidation`; só o escritor da consolidação a passa e só vale com a marca da decisão humana no DNA e Assunto do plano. A rota `/api/arquiteto/artifacts` e todo outro caminho continuam exigindo `serpAssessmentRef`; o Radar continua exigindo a SERP antes de receber. | `lib/arquiteto/article-approval-revalidation.ts` |
| R5 | **Etapas na mesma barra.** 1 · Consolidar o Silo do plano (enquanto houver linha sem DNA ou o Silo sem o par canônico) → 2 · Completar sustentações e SERP (primeiro a SERP das principais com volume sem as 4 lentes, custo antes; com a SERP no cache, a melhoria grava a versão nova com o parecer — o consolidado sem SERP volta a ficar "pronto" — e com as sustentações da lista que faltam) → 3 · Links internos (leva à aba). Só o botão da etapa atual, em destaque, sem contador; "Melhorar publicados…" discreto só com publicados; uma linha curta com o que a etapa faz. | `planFlowSteps`, `planStepTwoAction`, `ArticlesFormationBar` |
| R6 | **Uma tabela, poucos botões.** Saíram da aba Artigos: o cartão "Próximo passo", "Ir para Artigos do plano", "Marcar toda a cor", "Validar SERP"/"Trocar principal"/"Concluir formação" em lote e por linha, os "Concluir formação (N)" duplicados, a planilha separada (`PlanArticleSheet`, que só restava para testes) e o painel "Detalhes técnicos" inteiro (para todas as marcas). O artigo do plano entra na tabela pela cor do PLANO (um vínculo de grupo perdido não o esconde — o caso "jogos online") e a linha do plano só cede o lugar a um artigo que está na tabela. Uma versão de plano só: a linha não mostra "v1/v2/v3". Marca sem plano (ou "Todos" com mais de um plano): a barra de sempre (Processar artigos · Concluir formação · Melhorar publicados…). | `arquiteto-workspace.tsx`, `plan-article-sheet.tsx`, `declared-plan-seals.ts` |

**Consumidores conferidos:** melhoria (o consolidado sem SERP vira `declaredPlanPending`; a v2 com parecer tira a marca), fechamento canônico (mesmo trecho, agora função), Radar/Redator (sem mudança de contrato; o gate de SERP do Radar continua), MCP (catálogo atualizado; a consolidação é operação de tela, sem ferramenta nova), `materializeDeclaredPlanSilo` (passo 3 extraído para `assignPlanGroupKeywordsToTerritory`, sem mudança de comportamento). **Migration: nenhuma.** **Rollback:** código anterior; os ArticleDNA consolidados ficam válidos (aprovados, com a marca), e sem esta versão a melhoria os trata como artigo sem parecer (a gravação seguinte pede SERP como sempre).

**Limites:** a consolidação de um Silo que JÁ tem o par canônico e ganha artigo novo depende do caminho de edição de sempre (`consolidateSilos` recusa cópia de trabalho só-leitura; "Aplicar o plano declarado ao Silo" segue valendo); artigo sem volume e Livre sem sustentação com volume fica sem parecer de SERP (a etapa 3 avisa; o Radar pede a SERP); o vínculo `editorial_groups.silo_id` velho da WifiConecta não é reescrito (a store recusa trocar Silo ligado; a consolidação acha o Silo pelas keywords). **Validado manualmente: não** (homologação do dono).

**Continuação (2026-10-15, mesma frente, sem migration):** o "corpo estranho" (jogos online fora da tabela) vinha da entidade central do território gravada a partir da 1ª keyword do grupo pelo "Processar arquitetura" (semente do Silo proposto do plano) e da reserva da SiloPage sobre ela; artigo do plano nunca é mais reservado e o Silo proposto do plano não tem semente. O tema do SiloDNA/SiloPage do plano nunca é o de um suporte nem leva pendência em frase: "Consolidar o Silo do plano" oferece "Corrigir a página do Silo (vN+1)" pelo núcleo de "Aplicar o plano declarado ao Silo", na mesma confirmação. O limite acima do `silo_id` velho caiu: a store religa quando o Silo antigo não existe mais (sem território, SiloDNA ou SiloPage) e continua recusando trocar Silo vivo. "Processar arquitetura" reconhece o Silo do plano consolidado (nada de "Silo proposto"). Detalhe em `docs/04-arquiteto/estado-atual.md`.

## 12. Decisões pendentes do dono

- Volume medido **= 0** conta como "sem volume" (livre). Recomendação: sim
  (aplicado).
- Planos anteriores (Silo 1) ficam **travados** até você destravar no card.
  Recomendação: sim (aplicado; §9 do AGENTS — decisão confirmada não muda
  sozinha).
