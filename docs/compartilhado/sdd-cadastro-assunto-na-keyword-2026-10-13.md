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

## 12. Decisões pendentes do dono

- Volume medido **= 0** conta como "sem volume" (livre). Recomendação: sim
  (aplicado).
- Planos anteriores (Silo 1) ficam **travados** até você destravar no card.
  Recomendação: sim (aplicado; §9 do AGENTS — decisão confirmada não muda
  sozinha).
