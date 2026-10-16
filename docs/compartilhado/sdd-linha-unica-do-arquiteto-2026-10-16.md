# SDD — A linha única do Arquiteto — 2026-10-16

> **Status: PROPOSTA — aguarda aprovação do dono.**
> Este documento não autoriza código, migration, SQL, escrita remota nem
> chamada paga. O dono aprova a SDD e a F0 antes de qualquer código. Cada fase
> seguinte é aprovada por vez (`AGENTS.md` §0.1, §4 e §15).
> Base lida: árvore de trabalho da branch `resgate/trabalho-nao-commitado-2026-09-05`
> sobre o HEAD `4ef696b`, depois da reorganização da aba Artigos de 16/10 (tarde).
> As linhas citadas são dessa árvore e foram conferidas em 2026-10-16. Toda
> afirmação sobre código abaixo é **Verificado no código**, salvo quando marcada
> **Ainda não verificado**.

## 0. Resumo para o dono

O Arquiteto faz as coisas certas, mas faz algumas delas por dois, três ou
quatro caminhos. O ArticleDNA tem dois montadores. O publicado tem três
gravadores. A troca da principal tem quatro réguas. O par SiloDNA + SiloPage
tem dois gravadores. Cada caminho resolveu um caso (plano, Assunto, publicado),
e os casos foram virando portas.

Esta SDD não cria tela, botão, etapa nem rota. Ela desenha a **linha única** que
já existe nos botões de sempre:

`Importar → Processar arquitetura → Processar artigos → Concluir formação → Melhorar publicados… → Fechar o Silo → Links internos → Enviar ao Radar`

Para cada etapa, a SDD diz três coisas:

- o que é **cópia de trabalho** (você forma e vê no navegador);
- o que o servidor **só calcula** (SERP, Google Ads, IA, com o custo dito antes);
- quem é o **único gravador** quando você confirma. Esse gravador revalida a
  aprovação, o plano, a trava, o retrabalho e a marca, e depois relê o que gravou.

Plano declarado, Assunto, publicado, keyword solta e Silo sem keyword deixam de
ter caminho próprio. Cada um vira um **caso** da mesma etapa.

Duas réguas suas ficam escritas como regra única:

- **R1, troca da principal:** volume definido ou travada = fixa (mesmo com
  volume 10). Livre sem volume = pode trocar, por decisão sua e com versão nova.
- **R2, status do publicado:** passou pela prévia e você confirmou = aprovado.

A entrega é em fases. A **F0** não muda nada no produto. Ela grava, em testes
automáticos, os cenários de ponta a ponta de hoje. Cada fase seguinte só
termina com esses cenários verdes (`AGENTS.md` §0.3).

## 1. Identificação

- **Módulo proprietário:** Arquiteto.
- **Consumidores:** Radar (portão da SERP do ArticleDNA aprovado), Minerador
  (só leitura do pacote aprovado, da trava e do volume; caixa "Sugestões do
  Arquiteto"), MCP (`lib/server/platform-mcp-tools.ts`), catálogo
  (`lib/agent/platform-catalog.ts`). Redator e Publicações não mudam: eles leem o
  ArticleDNA aprovado, que conserva o formato.
- **Data:** 2026-10-16. **Aprovação humana:** dono do produto.
- **Provider/capability:** nenhum novo. Nenhum custo novo.
- **Tipo de mudança:** estrutural de workflow (unifica gravadores, portões e
  réguas) — exige SDD e autorização (`AGENTS.md` §4). Só a F6 pode exigir
  migration (§11.7). Nenhuma fase muda o formato de ArticleDNA, SiloDNA, SiloPage
  ou InternalLinkGraph.
- **Fontes lidas:** `AGENTS.md` §0 (0.1 a 0.5), §9, §11 e §17.1;
  `docs/00-produto/invariantes.md` (topo); `docs/04-arquiteto/spec.md` (inteiro);
  `docs/04-arquiteto/estado-atual.md` (entradas de 16/10);
  `template-proposta-evolucao-modular.md`; SDD
  `sdd-plano-declarado-e-grupos-2026-10-12.md`, como modelo de formato.

## 2. Contexto e frases do dono

Origem (`AGENTS.md` §0): o Arquiteto "se perdeu por completo" entre 14 e 15/10.
Pedidos de corrigir erros e limpar botões viraram etapas, rotas e portas novas,
e a restauração de 16/10 trouxe de volta o fluxo de sempre (`estado-atual.md`,
"Restauração do fluxo de sempre — 2026-10-16").

As frases do dono, literais:

- 15/10, noite: "vocês não podem ficar mudando as funcionalidades".
- 15/10, noite: "toda arrumação tem que ser em cima dos processos e
  funcionalidades que já existem em cada área… nada pode ser criado outro em
  paralelo, nem para cada marca, nem para cada tipo de erro ou situação; todas
  têm que ser no mesmo, e essa mesma linha de processo vai se atualizando e
  melhorando".
- 16/10: "tudo tem que ser formado pelo navegador, e só quando confirmar ou
  finalizar que vai aplicado no servidor".
- 16/10: "todas as novas melhorias em todas as áreas têm que prevalecer por
  cima das antigas… e isso também tem que ser atualizado nos contratos e no SDD".

Recomendações aceitas pelo dono em 16/10 ("vamos seguir as suas recomendações"):

- SDD em fases. Cada fase unifica uma etapa e traz cenários de ponta a ponta que
  provam que nada do que funciona hoje se perdeu. O dono aprova a SDD e a 1ª fase
  antes de qualquer código.
- **R1** e **R2**, nos termos do §8.

## 3. Princípios aplicados ao Arquiteto

| Regra | No Arquiteto, nesta SDD |
|---|---|
| §0.1 Uma linha | Os botões de sempre ficam: "Processar arquitetura", "Confirmar propostas novas", "Processar artigos", "Concluir formação", "Melhorar publicados…", "Consolidar Silos", Links internos e "Enviar ao Radar". Nenhum botão novo, nenhum renomeado, nenhum some. O que muda é o que roda por trás: um núcleo por etapa, e cada caso entra nele. |
| §0.2 SEO semântico | Agrupar e reforçar seguem o DNA de cada keyword (entidade, intenção, problema, resultado), confirmado pela SERP nas 4 lentes, que tem a última palavra (spec §40). A régua R1 só decide *se* a principal pode trocar. *Qual* keyword assume continua com a SERP e o DNA. |
| §0.3 Não regressão | A F0 cria os cenários-ouro (§11.1) antes de qualquer mudança. Toda fase termina com eles verdes e atualiza, na mesma entrega, o cenário cuja regra mudou. |
| §0.4 Cópia de trabalho | Formar, agrupar, reforçar e propor acontece na cópia de trabalho. O servidor só lê ou calcula o que exige segredo ou provider. Grava artefato canônico só no confirmar, por um gravador por artefato, que revalida e relê (§4). |
| §0.5 A nova prevalece | Cada fase marca SUBSTITUÍDO, com data, o texto antigo da spec, desta e de outras SDDs e do catálogo (§10). O código antigo sai ou passa a chamar a regra nova. |

## 4. Vocabulário da linha: cópia de trabalho, cálculo e gravador

**Cópia de trabalho** é tudo o que a pessoa forma e pode desfazer antes de
confirmar. Ela pode estar no navegador ou **persistida** no servidor, desde que
não seja artefato editorial. A spec já prevê isso (§8: "a decisão é persistida
no workflow canônico"; working copy do Silo; working copy dos links). Hoje são
cópia de trabalho persistida:

- itens de workflow `keyword/architect` com `articleFormationRef`,
  `articleFormationDecision`, `articleSubjectAnchor` e `territoryRef`,
  gravados pelo PATCH de `/api/arquiteto/workspace`;
- o marcador de formação (`article-formation-marker`);
- território `candidate/pending` ("Processar arquitetura");
- a working copy do Silo e a do InternalLinkGraph.

**Cálculo do servidor** é o que exige segredo ou provider: coleta de SERP
(`collectAndCacheSerp`, `lib/server/serp-cache.ts:132`), parecer
(`handleArchitectFormationSerp`, `lib/server/arquiteto-serp-http.ts:347`),
allintitle, Google Ads e IA. O resultado volta como proposta, com o custo dito
antes. Cache de SERP, parecer, recibos de uso (`integration_usage_events`) e
registros de proposta não são artefato editorial.

**Gravador** é o único ponto que grava o artefato canônico (ArticleDNA, SiloDNA
com SiloPage, InternalLinkGraph, pacote do Radar), no confirmar. Ele:

1. confere a permissão do ato (`approve` para aprovado);
2. revalida contra o estado remoto, sem confiar em booleano do chamador:
   aprovação, plano declarado, trava, guarda de retrabalho, Assunto, identidade
   publicada e marca;
3. grava;
4. relê o que gravou.

O modelo já existe no próprio Arquiteto: a consolidação do Silo
(`lib/server/arquiteto-silo-consolidation-adapter.ts:205-240`) recebe o
envelope montado no navegador e revalida tudo sobre o snapshot remoto ("Nenhum
booleano do chamador é autoridade"). A linha única estende esse modelo ao
ArticleDNA.

### 4.1 O que o "run" da melhoria persiste hoje (reconciliação com §0.4)

`handleArticleImprovement` (`lib/server/arquiteto-article-improvement.ts:746`)
tem quatro ações: `prepare`, `collect`, `status` e `apply`.

| Ação | O que grava | Natureza |
|---|---|---|
| `prepare` | Registro `editorial_workflow_items` com `subject_type = article_improvement_run`, `stage = architect` (`:63`, `:866`), com alvos, propostas, custos, `decisionHash` e `inputsHash`. "Sugestões do Arquiteto" na caixa do Minerador (`:734`, `:865`). Recibos de IA e Google Ads (`:491`). | Proposta calculada persistida e recibos. **Não é artefato editorial.** |
| `collect` | Progresso do run (`saveRun`, com releitura, `:721`). Cache de SERP e parecer da composição (`serpOperation` `execute`, `:913`). | Cálculo pago autorizado, mais cache e parecer. Não é artefato editorial. |
| `apply` | Aceite humano do parecer (`humanResolution`, `:1353`, `:1439`). PATCH da cópia de trabalho (`:1456`). ArticleDNA `approved` (`:1457`, e `:1249` em "Atualizar o DNA com a SERP"). Marcador (`:1461`). Releitura (`:1462-1464`). | **Confirmar.** É o único ponto que grava artefato. |

Conclusão: o run é cópia de trabalho persistida, do mesmo tipo da working copy
do Silo e da dos links. O `prepare` nunca grava ArticleDNA, SiloDNA, SiloPage
nem grafo. Os dois únicos `appendArquitetoArtifact` do arquivo estão no caminho
do `apply`. Por isso o "prepare/apply" do servidor é compatível com §0.4, com
uma condição: **a montagem do artigo que a pessoa vê e edita é a da cópia de
trabalho**. Hoje a proposta do run só pode ser aceita ou recusada por alvo.
Para editar a composição, a pessoa muda a cópia de trabalho na tabela, e o run
fica velho (o `sourceHash` muda e o `apply` recusa, `:1285`). Isso fica. O que
a linha única corrige está no §6, etapas E4 e E5: o ArticleDNA de um artigo
**novo** é formado na cópia de trabalho de sempre ("Processar artigos" →
"Concluir formação"), e não montado no servidor por um caminho paralelo.

## 5. Contrato atual — os oito achados (verificado no código)

Abreviação: **ws** = `modules/arquiteto/arquiteto-workspace.tsx` (21.755 linhas
em 16/10).

**A1 · Formar e concluir artigo: dois montadores.**

- **(A) Navegador.** `processArticleFormation` (ws:14937) coleta e pede o
  parecer da SERP: `/api/arquiteto/serp`, `mode: "plan"` (ws:4126) e depois
  `"execute"` (ws:4169). O aceite humano vai por `/api/arquiteto/serp-resolution`
  (ws:13442, ws:14141, ws:16848).
- `confirmArticleFormation` (ws:16230) chama `materializeApprovedArticleDnas`
  (ws:15160). Ela monta o payload com `deterministicArticleDnaPayload`
  (ws:15304) e grava pelo `/api/arquiteto/artifacts` com `status: "approved"`
  (ws:15498). Depois roda o fechamento canônico (`runCanonicalSiloClosure`,
  ws:15722).
- **(B) Linhas do plano.** "Concluir formação" divide a seleção:
  `splitTableSelectionForPlan` (ws:13614-13628) manda as linhas do plano para
  `usePlanArticleSheet`. Ali, "Validar SERP" só coleta, por `/keyword-serp`,
  sem parecer (`modules/arquiteto/plan-article-sheet.tsx:319`). Formar chama
  `/api/arquiteto/article-improvement` com `origin: "plan_sheet"` (`:388`).
- No servidor, `applyTarget` (`lib/server/arquiteto-article-improvement.ts:1267`)
  **monta o DNA**: `deterministicArticleDnaPayload` (`:1365`) e
  `applyDeclaredPlanToArticleDna` (`:1386`). Aceita o parecer pelo
  `decisionHash` (`:1353`) e grava aprovado (`:1457`). **Não fecha o Silo.**
- O ramo `declaredPlan` de A (ws:15286-15288, lido pelo adapter em
  `lib/arquiteto/adapters.ts:252` e `:260`) está vivo no código, mas sem
  tráfego: as linhas do plano nunca chegam a A.

**A2 · Assunto sem plano: duas portas.**

- Uma porta é o painel do Assunto: `confirmSubjectSupport` (ws:13214), depois a
  automação, depois A.
- A outra é a melhoria com alvo `kind: "subject"` (B).
- Em B, a principal do Assunto troca pela candidata de maior volume **mesmo
  quando a atual tem volume**: `needsPrimary` (`lib/arquiteto/article-improvement.ts:399-401`,
  `!old?.volumeValidated || (candidates[0]?.volume ?? 0) > (old.volume ?? 0)`).
- A trava por volume (`livreComVolume`,
  `lib/server/arquiteto-article-improvement.ts:269-277`) só vale com plano.

**A3 · Publicado: três gravadores.**

| Gravador | Status gravado | Permissão | Revalidação |
|---|---|---|---|
| Melhoria (`applyTarget`, `:1457`) | `approved` | `approve` | Sim (`:1454`) |
| Reforço (`app/api/arquiteto/published-reinforcement/route.ts:39` e `:57`; `handlePublishedReinforcement`, `lib/server/arquiteto-published-reinforcement.ts:507`; `withReinforcementKeywords`, `:652`) | `approved` | **`edit`** | Sim (`:693`) |
| Diferenciação (`app/api/arquiteto/cannibalization/apply/route.ts:25` e `:30`; `handleDifferentiationApply`, `lib/server/arquiteto-differentiation.ts:490`) | `proposed` | `edit` | **Não**: sem revalidação, sem PATCH da cópia de trabalho e sem marcador |

- **Busca:** reforço e diferenciação usam `executePublishedSearchRound`
  (`lib/arquiteto/published-differentiation-run.ts:1013`, chamado em `:896` e em
  `lib/arquiteto/published-reinforcement-search.ts:489`). A melhoria tem um
  `discover` próprio de Google Ads (`lib/server/arquiteto-article-improvement.ts:616`).
- **Vínculo do parecer e marcador duplicados:** a melhoria (`:1435-1441`,
  `:1458-1461`) e o reforço (`lib/server/arquiteto-published-reinforcement-deps.ts:48-92`)
  fazem o mesmo trabalho em dois lugares.
- **Nomes:** a spec §39 chama de "Reforçar publicados". O catálogo e o botão
  chamam de "Melhorar publicados…" (`arquiteto.article_improvement`).

**A4 · Troca de principal: quatro réguas, dois gravadores.**

As quatro réguas:

1. **Mesa SERP-subject, reforço e diferenciação:** `proposePublishedPrimarySwap`
   e `decidePublishedPrimarySwap` (`lib/arquiteto/published-primary-swap.ts:170`
   e `:405`), com o payload `buildPublishedSwapArticlePayload`
   (`modules/arquiteto/serp-subject-model.ts:393`). A mesa grava `proposed`
   pelo navegador (ws:12662, depois `persistArticleSubjectVersion`, ws:12321 e
   ws:12337).
2. **Melhoria:** `needsPrimary`, mais `volumelessPrincipalSwap`
   (`lib/arquiteto/article-improvement.ts:613`), com o payload montado em linha
   (`lib/server/arquiteto-article-improvement.ts:1378`).
3. **Plano:** `planPrincipalSwapCandidates` (`lib/arquiteto/plan-article-sheet.ts:441`,
   trava em `lockView`, `:173`).
4. **Régua antiga:** `proposePrimarySubstitution` (`lib/arquiteto/primary-substitution.ts:104`,
   folga de 1,5x) ainda aparece como "Decisão pendente de confirmação humana"
   (`modules/arquiteto/published-serp-panel.tsx:123`, por
   `lib/arquiteto/published-keyword-readout.ts:127`). Ela é declarada superada
   em `published-primary-swap.ts:19-25`.

A formação tem ainda a eleição da âncora Livre (`suggestPrincipal`, em que "uma
melhor assume"; ver `estado-atual.md` de 2026-10-13). As réguas divergem em
quatro pontos: Livre com volume, exigência de SERP, ordem das candidatas e
status gravado.

**A5 · SERP.**

- A coleta é única (`collectAndCacheSerp`). O parecer é único
  (`handleArchitectFormationSerp`), mas roda em momentos diferentes: no
  Processar (A) e no `apply`, só com cache (B, `:1338`).
- Há dois aceites: `/serp-resolution` × `decisionHash`. Os dois gravam o mesmo
  `humanResolution` pelo mesmo núcleo `resolveArticleFormationSerpAssessment`.
- O parecer pelas sustentações (D2a, `lib/server/arquiteto-serp-http.ts:1090-1126`)
  só é usado pelo caminho B.
- **Formato de `serpAssessmentRef`:**
  - Os gravadores vivos usam `${id}:${formationBaseHash}` (ws:3848; servidor `:1432`).
  - O formato `${id}:v${version}` aparece em ws:7761 (`prepareSelectedLogicalArticleDnas`,
    **0 chamadores**) e em ws:4844 (`handleGenerateArticleDnas` → `/api/arquiteto/article-dna`,
    alcançado só por `handlePipelineStep`, **0 chamadores**). É código morto.
  - O portão do Radar (`lib/arquiteto/approved-article-serp-gate.ts:41`) só
    reconhece o primeiro formato. Com o segundo, devolve `null` e o portão da
    mesa decide: não é recusa.
  - Risco restante: DNA **já gravado** com `:v` (**Ainda não verificado** no
    banco; cenário C12 e SELECT do dono).

**A6 · Silo: dois gravadores do par.**

- **Canônico:** `consolidateSiloFromWorkingCopyCore`
  (`lib/server/arquiteto-silo-consolidation-adapter.ts:205`), pela RPC
  `persist_silo_from_working_copy_atomic` (`:330`). Trava o território e a
  working copy (`FOR UPDATE` e `lock_version`, migration `20260902150000`) e
  confere a prontidão no servidor. O envelope é montado no navegador.
- **"Aplicar o plano declarado ao Silo"** (`handleSiloDeclaredPlan`,
  `lib/server/arquiteto-silo-declared-plan.ts:124` e `:274`) e **"Retirar artigo
  do Silo"** (`lib/server/arquiteto-silo-article-withdrawal.ts:238`) usam
  `persistSiloPairAtomic` (`lib/server/arquiteto-persistence.ts:371`), pela RPC
  `persist_silo_pair_atomic`.
  - Essa RPC só tem o advisory lock do par (migration `20260826225154`, `:137`).
    Não trava o território nem a working copy e não passa pela prontidão da
    SiloPage.
  - `alignTerritory` roda fora da transação, e a falha é engolida (`:216-217`).
- O Pilar pode divergir entre a working copy e o plano.
- **Rotas legadas** sem chamador vivo, ainda no catálogo
  (`lib/agent/platform-catalog.ts:640-641`, `:859-860`):
  - `/silo-dna` e `/silo-page` (ws:4896 e ws:4985, alcançadas só por handlers
    sem chamador);
  - `/silos` (`createCanonicalManualSilo`, já substituída na UI);
  - `/silo-pair` (draft-only; `persistArquitetoSiloPair` está importada e não é usada).

**A7 · Gravação do ArticleDNA aprovado.**

- Todos os caminhos terminam em `appendArquitetoArtifact`
  (`lib/server/arquiteto-persistence.ts:289`). Ele já confere o Assunto e o
  plano declarado (`assertDeclaredSubjectWrite`, `assertArticleDnaAgainstDeclaredPlan`).
- Mas `articleApprovalRevalidationIssues` e a permissão `approve` **não estão
  dentro dele**:
  - a rota `/artifacts` revalida com `action: create|edit`;
  - o reforço revalida com `edit`;
  - a diferenciação não revalida.
- O navegador grava `article_dna` por `/artifacts` em sete pontos:
  - ws:3900 (`reopenArticleRevision`, proposed);
  - ws:3971 (`handleEditorialUnitDecision`);
  - ws:7742, ws:7748 e ws:7765 (mortos);
  - ws:12337 (`persistArticleSubjectVersion`, proposed);
  - ws:15498 (`materializeApprovedArticleDnas`, approved);
  - ws:15680 (`materializeLegacyArticleSiloIds`, approved).

**A8 · MCP.**

- `plan_published_differentiation` (`lib/server/platform-mcp-tools.ts:1347-1372`)
  monta o corpo à mão (`ai: false`), sem `DifferentiationPlanRequestSchema`
  (`lib/server/arquiteto-differentiation.ts:90`, que tem `resume` e `replaceEvaluation`).
- `validate_silo_plan` (`:808`) usa `SILO_ARTICLE_RANGE.min = 4`
  (`lib/agent/silo-plan.ts:42` e `:127`) e **bloqueia** Silo com menos de 4
  artigos. O cadastro aceita e só avisa (`DECLARED_PLAN_ARTICLES_MIN_FOR_SILO`,
  `lib/minerador/declared-plan.ts:52`).
- A descrição de `improve_articles` (`:1410`) está desatualizada.
- `arquiteto.published_reinforcement_preview` tem `routes: []` no catálogo
  (`:775`).
- A formação de sempre e o fechamento canônico não têm ferramenta MCP.

## 6. A linha única — contrato por etapa

Cada etapa tem um núcleo. Os casos são: **sem plano**, **plano declarado**,
**Assunto**, **publicado**, **keyword solta** e **Silo sem keyword**.

### E1 · Importar do Minerador

- **Cópia de trabalho:** a seleção e a lista leve por cor (navegador).
- **Servidor calcula:** nada pago. Lê o pacote aprovado pelo resolver do
  Minerador.
- **Único gravador:** o recebimento canônico (`/api/arquiteto/import`, o mesmo
  caminho do "Aprovar e enviar"; `estado-atual.md`, 2026-10-13). Idempotente e
  por `brandId`.
- **Casos:**
  - todos entram como item `keyword/architect` recebido;
  - plano: o grupo e `keyword_subject.plan` viajam no pacote;
  - publicado: o Vínculo viaja no pacote;
  - keyword do Silo: reservada como cabeça (spec §32.2).
- **Muda?** Não. Já é linha única.

### E2 · Processar arquitetura e Silos (aba Silos)

- **Cópia de trabalho:** a proposta territorial (território `candidate/pending`,
  persistido).
- **Servidor calcula:** a SERP territorial e a IA dos Silos, com o plano de custo
  antes (spec §21.1).
- **Único gravador:** "Confirmar propostas novas", que confirma o território, e
  "Recriar o Silo do plano", com prévia.
- **Casos:**
  - sem plano: a proposta léxica de sempre;
  - plano: reusa ou propõe o Silo do plano, sem semente (spec §32.3 e §32.4);
  - Silo sem keyword: o estado normal (§32.2);
  - publicado: o Silo pela URL (§34.3).
- **Muda?** Não, salvo a F6, para o par.

### E3 · Processar artigos

- **Cópia de trabalho:** os candidatos (composição, papéis, principal, âncora do
  Assunto), persistidos no workflow e no marcador; a pessoa edita na tabela
  (Tornar principal, Separar, Mover, Juntar).
- **Servidor calcula:** a coleta da SERP das keywords com volume e o
  **parecer** da composição (`/api/arquiteto/serp`, plano e depois execução, com
  custo antes); allintitle com "Aplicar KGR"; IA opcional, só como proposta.
  Inclui o parecer pelas sustentações (D2a) para a principal declarada sem volume.
- **Único gravador:** nenhum. Processar não grava artefato.
- **Casos:**
  - linha do plano = candidato da formação de sempre, com as restrições do plano
    (`declaredPlanFormationInputs`, ws:5734; papel e ordem do plano; principal
    travada intocada);
  - Assunto = âncora (`articleSubjectAnchor`);
  - publicado = âncora própria (§33.2, precedência);
  - keyword solta = livre para encaixe;
  - keyword do Silo = cabeça, fora da formação.
- **Hoje × linha:** a linha do plano tem "Validar SERP" só de coleta
  (`/keyword-serp`), sem parecer. Na linha única, ela recebe o mesmo parecer do
  mesmo Processar (F3).

### E4 · Concluir formação

- **Cópia de trabalho:** o candidato revisado (ArticleDNA previsto, mostrado na
  prévia da conclusão).
- **Servidor calcula:** nada pago. Relê o cache e o parecer vigente.
- **Único gravador:** o gravador do ArticleDNA (§4). Ele recebe o envelope
  formado na cópia de trabalho. No servidor:
  1. confere a permissão `approve`;
  2. revalida (`articleApprovalRevalidationIssues`, plano declarado, Assunto,
     trava R1, identidade publicada, retrabalho, marca) sobre o snapshot remoto;
  3. confere que o `serpAssessmentRef` é `${id}:${formationBaseHash}` da mesma
     composição, com o aceite humano gravado no mesmo confirmar;
  4. grava `approved` e relê.

  O fechamento canônico do Silo segue no mesmo ato, quando pronto
  (`runCanonicalSiloClosure`).
- **Casos:**
  - sem plano: como hoje;
  - plano: o mesmo `confirmArticleFormation`, com o portão do plano que já
    existe (`declaredPlanGateInputs`, ws:16429) e o adapter do plano;
  - Assunto: o mesmo, pelo painel ou pela automação já autorizada (spec §33.2);
  - publicado: **nunca** passa por aqui (§39.1) e vai para E5;
  - keyword solta: só se estiver num candidato.

### E5 · Melhorar publicados… (reforçar novos, plano, Assunto e publicados)

- **Cópia de trabalho:** o artigo vigente e o run da melhoria (proposta
  persistida, §4.1). A pessoa aceita ou recusa por alvo e edita a composição na
  tabela; o run velho é recusado e se prepara de novo.
- **Servidor calcula:**
  - `prepare`: leitura grátis, depois IA, medição e busca nova no Google Ads,
    só com autorização e custo antes;
  - `collect`: SERP paga, até o teto.

  Uma busca só para todos os casos (F5).
- **Único gravador:** o mesmo gravador do ArticleDNA de E4, chamado pelo
  `apply`. Antes, a cópia de trabalho é atualizada (PATCH). Status `approved` (R2).
- **Casos:**
  - artigo novo já formado, artigo do plano já formado e Assunto com DNA:
    reforço com a lista da marca, inclusive as keywords soltas (spec §32.6);
  - publicado: reforço, diferenciação (nota `differentiation` e
    `excludedSubjects`), troca da principal (R1) e "Atualizar o DNA com a SERP";
  - keyword solta: entra como secundária e, só para principal Livre sem volume,
    como principal.

  Formar artigo **sem** ArticleDNA não é caso de E5: é de E4.

### E6 · Fechar o Silo

- **Cópia de trabalho:** a working copy do Silo (Pilar humano, Suportes,
  exclusões), persistida com `lock_version`.
- **Servidor calcula:** a prontidão (`resolveSiloConsolidationReadiness`) sobre o
  snapshot remoto.
- **Único gravador:** `consolidateSiloFromWorkingCopyCore` →
  `persist_silo_from_working_copy_atomic`. O par vai na mesma transação, com a
  aprovação de cada um independente (invariante 22).
- **Casos:**
  - sem plano;
  - Silo do plano (`declaredCentralEntity`);
  - "Aplicar o plano declarado" e "Retirar artigo do Silo" passam a ser edições
    da working copy, consolidadas pelo mesmo gravador (F6);
  - Silo sem keyword (cabeça opcional).

### E7 · Links internos

- **Cópia de trabalho:** a working copy do grafo (`/internal-link-graph/working-copy`),
  propostas de âncora e de IA.
- **Servidor calcula:** a IA de âncoras, com custo antes.
- **Único gravador:** a consolidação versionada do InternalLinkGraph
  (`/internal-link-graph`).
- **Casos:** o Silo com e sem plano, pela composição vigente.
- **Muda?** Não.

### E8 · Enviar ao Radar

- **Cópia de trabalho:** a seleção.
- **Servidor calcula:** o portão (`resolveApprovedArticleSerpGate` e o portão da
  mesa).
- **Único gravador:** `/api/arquiteto/handoff`.
- **Casos:** todos, pelo ArticleDNA aprovado.
- **Muda?** Não. A F3 garante que todo DNA aprovado carregue o formato que o
  portão reconhece.

## 7. Tabela "hoje → linha única"

| # | Hoje | Linha única | Fase |
|---|---|---|---|
| A1 | Dois montadores: navegador (A) e `applyTarget` com `plan_sheet` (B, que não fecha o Silo) | A linha do plano é candidato da formação de sempre. Um gravador no servidor revalida e relê. O fechamento do Silo vem no mesmo ato. `splitTableSelectionForPlan` deixa de desviar para B. | F1 e F2 |
| A2 | Assunto sem plano por duas portas; em B troca a principal com volume | Formar = E4 (painel ou automação). Reforçar = E5. A troca segue R1. | F2 e F4 |
| A3 | Três gravadores do publicado, três status e duas permissões | Reforço e diferenciação viram casos da melhoria: um gravador, `approved` (R2), `approve`, revalidação, PATCH e marcador. Uma busca (o motor com teto e ledger). Um vínculo de parecer e marcador. | F5 |
| A4 | Quatro réguas e dois gravadores da troca | R1 numa função de domínio só, chamada pela formação, pela melhoria, pelo plano, pela mesa, pelo reforço e pela diferenciação. `proposePrimarySubstitution` sai. | F4 |
| A5 | Parecer em momentos diferentes, dois aceites, D2a só em B, dois formatos de ref | Parecer no Processar para todos (D2a incluído). Um aceite, gravado no confirmar. Um formato (`${id}:${formationBaseHash}`). O código morto `:v` sai. | F3 |
| A6 | Dois gravadores do par; plano e retirada sem trava do território nem prontidão | Um gravador: a consolidação canônica. Plano e retirada editam a working copy. `alignTerritory` entra na transação ou passa a ser dito quando falha. | F6 |
| A7 | Revalidação e `approve` fora do núcleo | Dentro de `appendArquitetoArtifact`, para `article_dna` aprovado, valendo para todas as portas. | F1 |
| A8 | MCP com régua e corpo próprios, rotas legadas no catálogo | O MCP chama os mesmos schemas e núcleos. As rotas sem chamador saem. O catálogo é atualizado. | F7 |

## 8. Réguas únicas

### 8.1 R1 — troca da principal (régua única do dono)

Vale para artigo novo já com DNA, plano, Assunto e publicado. Vale na formação
e na melhoria, na tela, no servidor e no MCP.

1. **Fixa:**
   - (a) **volume definido**: média do Google Ads maior que zero, gravada no
     Minerador para a principal atual, mesmo que seja 10;
   - (b) **travada**: trava da keyword no cadastro único (`planLockOfStanding`
     = `locked`), ou publicado com Posto "Travado ao slug" ou
     `primary_keyword_policy = locked`.

   As proteções que já travam hoje continuam valendo, sem nada novo: KGR
   confirmado vinculado ao slug e `confirmed_primary + architecture_confirmed`
   (spec §25 e §29).
2. **Pode trocar:** só **Livre e sem volume definido**. A troca é sempre:
   - proposta e decisão humana na prévia;
   - versão nova, com `primaryKeywordDecision` confirmada (ator e hora);
   - a antiga vira secundária;
   - histórico no contexto da política.
3. **Desconhecido:** publicado sem Posto, ou com política em conflito. Nada é
   proposto nem bloqueado em silêncio, e a principal fica (`AGENTS.md` §11).
4. **Publicado:** URL, slug, canonical e marca nunca mudam (`AGENTS.md` §11).
5. **Candidata:**
   - volume definido;
   - não publicada;
   - sem dono por decisão humana;
   - a intenção da SERP não contradiz;
   - cabe no teto de 6.

   A **ordem** entre as candidatas é a decisão pendente D2 (§13).
6. **Eleição não é troca.** A principal de um artigo novo, ainda sem DNA e sem
   principal declarada, continua eleita pela regra de formação de sempre ("volume
   não decide sozinho"). A R1 governa a troca de uma principal que já existe: no
   DNA vigente, declarada no plano ou publicada.

**O que muda em relação a hoje:** a Livre **com** volume deixa de ser trocada:

- no D2.1 do publicado (spec §35.3, §36.5 e §37.6;
  `published-primary-swap.ts:170`);
- no Assunto sem plano (`article-improvement.ts:399-401`);
- na âncora Livre da formação.

O plano já segue a R1 desde 15/10 (`livreComVolume`, `planSheetLockOf`).

### 8.2 R2 — status do publicado

**Regra:** toda operação sobre publicado passa pela prévia. O que o dono
confirma é gravado `approved` (status único), pelo gravador único, com
revalidação e releitura. Vale para melhoria, reforço, diferenciação, troca da
principal (pela mesa, pelo reforço ou pela melhoria) e "Atualizar o DNA com a
SERP".

**Conflito apontado:**

- spec §37.7 ("nova versão do ArticleDNA em revisão"; no código,
  `cannibalization/apply/route.ts:30`, `proposed`);
- spec §35.4 ("nova versão do ArticleDNA em revisão"; no código, a troca pela
  mesa grava `proposed`, ws:12337);
- contra a spec §39.1 ("A confirmação é a aprovação humana").

**Proposta:** vale R2 (decisão mais recente, 16/10, `AGENTS.md` §0.5). §35.4 e
§37.7 são marcadas SUBSTITUÍDO na F5.

**Onde a spec manda revisão humana adicional:** nesses casos nada vira
`proposed`. Ou a prévia não grava, ou ela espera:

- Posto desconhecido ou em conflito (`AGENTS.md` §11): não grava;
- "Aplicar KGR" Sim sem allintitle (§38.3): espera a medição;
- conflito de Silo da publicada (§34.7): decisão humana de Silo antes;
- SERP `DIVERGENCE` ou incompleta: não grava (como `applyTarget`, `:1352`);
- IA sem aceite: só proposta;
- "Manter como está": não gera versão.

**Consequência:** `approved` exige `serpAssessmentRef` da composição gravada.
Uma diferenciação que muda a composição (secundária nova, troca Livre) precisa,
no confirmar, do parecer dessa composição lido do cache. Sem parecer, aquela
página é recusada com o caminho, em vez de ser gravada "em revisão". Isso entra
na decisão D3.

## 9. Compatibilidade com dados já gravados (todas as fases)

- **Formato:** nenhum campo novo nem removido em ArticleDNA, SiloDNA, SiloPage ou
  grafo. Leitores `.strict()` não mudam (lição do Assunto, spec §33.3).
- **ArticleDNA gravado por B** ("Consolidado do plano do Minerador",
  `isDeclaredPlanConsolidation`, e os da "Linha editorial" revertida) fica como
  está. A leitura desses dados continua.
- **Versões `proposed`** da diferenciação e da troca pela mesa continuam legíveis
  e são mostradas como hoje. A próxima prévia da melhoria as trata como o
  artigo vigente e o confirmar grava vN+1 `approved`. **Ainda não verificado:**
  se `loadCanonicalArquitetoWorkspace` (`lib/server/arquiteto-workspace.ts:608`)
  devolve `proposed` entre os vigentes; o cenário C8 confere.
- **Runs, propostas de diferenciação, buscas em lote e "Manter como está"**
  continuam legíveis e não são apagados (`AGENTS.md` §10).
- **`serpAssessmentRef` com `:v`:** fica e é lido como hoje (o portão da mesa
  decide).
- Nenhuma fase limpa localStorage ou IndexedDB.

## 10. Texto a marcar SUBSTITUÍDO (§0.5), na fase que o implementa

| Onde | Texto antigo | O que vale | Fase |
|---|---|---|---|
| spec §8, 1º parágrafo | "`Processar lógica`, `Validar SERP`, `Revisar com IA`, `Confirmar arquitetura` e `Enviar ao Radar`" | Os botões da linha (§6). O 2º parágrafo, "cópia de trabalho editável", fica e passa a citar `AGENTS.md` §0.4. | F2 |
| spec §32 (Silo do plano, 2026-10-15), itens 5 e 6 | "As linhas do plano marcadas: 'Processar artigos' = Validar SERP; 'Concluir formação' forma a linha sem ArticleDNA [pela melhoria do plano]"; "(§ regra R2 do adendo C10)" | E3 e E4: a mesma formação e o mesmo parecer. R1 (§8.1) generaliza o R2 do C10. | F2, F3 e F4 |
| spec §35.3 | "'Livre' está ali para ser trocada: a substituta tem Volume validado maior" | R1: Livre com volume fica. | F4 |
| spec §35.4 | "nova versão do ArticleDNA em revisão" | R2: `approved` no confirmar. | F5 |
| spec §36.5 | "Troca da principal Livre: Forte (3+ páginas) ou Provável… sempre com volume maior" | R1, mais a ordem da D2. | F4 |
| spec §37.6 | "só Posto Livre troca a principal, pela régua da troca (D2.1)" | R1. | F4 |
| spec §37.7 | "nova versão do ArticleDNA em revisão" | R2. | F5 |
| spec §39.1 | "gravados por 'Reforçar publicados'" | Gravados pelo gravador único da melhoria ("Melhorar publicados…"). "Gravar reforços (N)" continua sendo o botão da tabela "Reforçar publicados" e chama o mesmo núcleo. | F5 |
| spec §39.2 | "Keyword nova no Reforçar passa pelo Minerador na mesma confirmação (import, Lógica, Volume…, aprovação e envio)" | Já substituído no código desde 2026-10-13 ("O Arquiteto só lê"): a keyword nova vai para "Sugestões do Arquiteto". | F5 (só texto) |
| `lib/arquiteto/article-improvement.ts:396` (comentário) | "O Assunto segue como antes: ganha a principal de maior volume." | R1. | F4 |
| catálogo `arquiteto.article_improvement`, `arquiteto.published_reinforcement_preview` (`routes: []`), diferenciação ("Esta operação não é ferramenta MCP"), rotas `/silo-dna`, `/silo-page`, `/silos`, `/silo-pair` | O que cada fase mudar | Nota datada em cada entrada tocada (`AGENTS.md` §17.1). | F5 e F7 |
| SDDs anteriores: `sdd-reforcar-publicados-2026-09-28.md`, `sdd-diferenciacao-publicados-canibalizados-2026-09-27.md`, `regras-serp-e-assuntos-2026-09-26.md` (D2.1), adendo C10 de `sdd-cadastro-assunto-na-keyword-2026-10-13.md` | Os pontos de gravador, status e régua acima | Nota de SUBSTITUIÇÃO apontando para esta SDD. | F4 e F5 |

Observação: a spec tem números de seção repetidos (§26, §27, §31 e §32 aparecem
duas vezes). As citações acima dizem o título. Renumerar não está no escopo.

## 11. Fases

Regras comuns a todas as fases:

- ordem fixa e uma fase por vez, cada uma aprovada pelo dono;
- a entrega só vale com a suíte de cenários (F0) verde, mais `test:arquiteto`,
  `test:arquiteto:servidor`, `test:arquiteto:lentes`, `test:arquiteto:dom`,
  `test:agent`, `test:radar`, `tsc --noEmit` e `git diff --check`;
- o cenário cuja regra mudou é atualizado na mesma entrega e diz a conclusão nova;
- `estado-atual.md`, `backlog.md`, spec e catálogo são atualizados na mesma
  entrega;
- sem chamada paga (só fixtures); commit, push, deploy, SQL e migration ficam
  com o dono.

### 11.1 F0 — Cenários-ouro do fluxo atual (antes de mexer)

- **Objetivo:** gravar em teste automático a conclusão que cada caso alcança
  **hoje**. Nada muda no produto. Onde a conclusão de hoje é a que a SDD vai
  mudar (R1, R2, fechamento do Silo em B), o cenário grava o estado atual com a
  marca "muda na Fn".
- **Como:**
  - arquivo novo `tests/arquiteto-cenarios-ouro-2026-10-16.test.mts`, com script
    próprio `test:arquiteto:cenarios` em `package.json` (o `test:arquiteto` já
    estoura a linha de comando do Windows);
  - reaproveita o harness da mesa (`tests/arquiteto-mesa-do-plano-harness.mts`)
    e o I/O simulado do servidor de `tests/arquiteto-article-improvement-server.test.mts`;
  - SERP, Google Ads e IA por fixture.
- **Os cenários** (entrada → passos → conclusão esperada):

| # | Entrada | Passos | Conclusão esperada |
|---|---|---|---|
| C1 Marca sem plano | 8 keywords aprovadas com volume, sem Assunto, plano ou publicado | Processar arquitetura → Confirmar propostas novas → Processar artigos (cache) → Concluir formação → fechamento canônico → Links (working copy → consolidar) → Enviar ao Radar | ArticleDNA `approved` com `serpAssessmentRef` = `${id}:${formationBaseHash}`; toda keyword em artigo ou em "Keywords não agrupadas"; SiloDNA e SiloPage v1 no mesmo ato; grafo v1; portão do Radar aprovado; 0 chamada paga |
| C2 Plano com keyword do Silo | Grupo com plano (nome, slug, 7 artigos Pilar e Suporte; principais travada, Livre com volume e Livre sem volume); keyword do Silo recebida | Processar arquitetura → Confirmar → Processar artigos → Concluir formação | Um Silo com nome e slug do plano; keyword do Silo como cabeça da SiloPage (nunca artigo nem não agrupada); 7 DNAs com hierarquia = papel e promessa = escopo; travada intacta; nenhuma porta paralela. Hoje: por B, sem fechamento do Silo ("muda na F2") |
| C3 Plano sem keyword do Silo | O mesmo, sem a keyword do Silo (0 volume) | Os mesmos | Silo do plano pelo nome e slug; nenhum erro nem pendência; nenhum artigo convertido em Silo |
| C4 Silo do plano desfeito e recriado | C2 concluído; o Silo desfeito por alguém | "Recriar o Silo do plano" (prévia → confirmar) | Mesmo nome e slug; artigos intactos; grupo religado só se o Silo antigo sumiu |
| C5 Assunto sem plano (painel) | Assunto sem volume e 5 sustentações com volume | "Formar em torno do Assunto" (automação) | Um artigo por Assunto; `subject` com `attachedBy` humano; principal com volume; Assunto fora das 6; sobra em não agrupadas com motivo |
| C6 Assunto sem plano (melhoria) | DNA do Assunto com principal de volume 10; candidata de 500 na lista | Melhorar → prepare → apply | Hoje: troca para a de 500. Muda na F4: fica (R1) |
| C7 Publicado: reforço | Publicado Travado com DNA; 2 keywords da lista com SERP Forte | Reforçar → prévia → Gravar reforços | vN+1 `approved`; URL, slug e canonical iguais; keywords adicionadas; parecer da composição nova. Hoje: grava com permissão `edit` ("muda na F1") |
| C8 Publicado: diferenciação | 2 publicados com 3+ páginas em comum | detect → preview (cache) → run (fixture) → aceitar | Nota `Diferenciação:` e `excludedSubjects`; nada some; URL intacta. Hoje: `proposed`, sem PATCH nem marcador. Muda na F5: `approved` (R2). Confere também o que a melhoria lê como vigente (§9) |
| C9 Troca Livre sem volume | Posto Livre, principal sem volume; keyword do artigo com volume e o núcleo do slug | Melhorar (e mesa SERP-subject) → confirmar | Nova principal; antiga secundária; `primaryKeywordDecision` confirmada; URL, slug e canonical intactos. Hoje: `approved` pela melhoria, `proposed` pela mesa ("muda na F5") |
| C9b Livre com volume | Posto Livre, principal de volume 10; candidata Forte de 500 | Mesa SERP-subject e Melhorar | Hoje: a mesa propõe a troca e a melhoria não. Muda na F4: nenhuma propõe |
| C10 Keyword solta | Solta (sem Assunto, grupo ou artigo) com volume | Melhorar no recorte do grupo | Entra como secundária; como principal só para Livre sem volume; Travada recebe só secundária |
| C11 Trava e volume | Linhas do plano: Travada sem volume, Livre com volume 10, Livre sem volume | "Procurar outra principal" e o servidor | Só a 3ª oferece a troca; o servidor recusa as outras duas com o motivo |
| C12 Formato do `serpAssessmentRef` | DNA gravado por cada gravador vivo; DNA de fixture com `:v1` | Portão do Radar | Os vivos: `${id}:${formationBaseHash}` reconhecido; `:v1`: o portão do DNA devolve `null` e a mesa decide (registra o de hoje). Para o dono: SELECT de leitura que conta os `:v` |
| C13 MCP × tela | As mesmas entradas de C6, C8 e C11, e um plano de 3 artigos | `improve_articles` com `userConfirmation`; `plan_published_differentiation` em preview; `validate_silo_plan` | O mesmo resultado e o mesmo hash da tela. Hoje: `validate_silo_plan` bloqueia 3 artigos e o cadastro aceita ("muda na F7") |
| C14 Forma da linha | O código | Guarda estrutural (estende `tests/arquiteto-linha-de-processo-guarda.test.mts`) | Cada botão da linha existe uma vez; nenhuma rota nova; depois da F1, nenhum `article_dna` `approved` fora do gravador (o teste limpa comentários antes do `doesNotMatch`) |
| C15 Gravação parcial | Falha depois do PATCH e antes do append (`applyTarget`, `:1456-1457`) | apply → retomada | Nenhuma versão duplicada; a mensagem diz a gravação parcial; nova prévia lê o estado real |

- **Consumidores:** só testes e `package.json`.
- **Compatibilidade:** nenhum efeito em dados.
- **Rollback:** apagar o arquivo de teste e o script.
- **O que o dono valida:** a lista e a conclusão de cada cenário, que valem como
  contrato da linha. Na tela, nada.

### 11.2 F1 — Gravador único do ArticleDNA, com revalidação

- **Sai:**
  - a revalidação espalhada (`/artifacts` em `route.ts:69-79`, reforço `:693`,
    melhoria `:1247` e `:1454`);
  - a gravação de `approved` com permissão `edit` (reforço `route.ts:39` e `:57`;
    `/artifacts` com `action: create|edit`).
- **Entra:** dentro de `appendArquitetoArtifact`
  (`lib/server/arquiteto-persistence.ts:289`), para `article_dna` com status
  `approved`:
  - a permissão `approve` do contexto;
  - `articleApprovalRevalidationIssues`;
  - as guardas que já estão lá (Assunto, plano declarado).

  A restauração de backup segue com a exceção que já tem (`subjectActor:
  "restored"`). A releitura canônica segue como está.
- **Consumidores:** `/artifacts` (ws:15498, ws:15680), melhoria, reforço,
  restauração de backup, MCP (`improve_articles` apply, que já pede `approve`).
- **Compatibilidade:** nenhum dado muda.
  - Colaborador com `edit` sem `approve` deixa de aprovar pelo reforço. Isso
    corrige a permissão, mas é mudança visível: a mensagem diz quem pode aprovar.
  - A diferenciação continua `proposed` até a F5 e não é afetada.
- **Rollback:** reverter o commit. Sem dado a desfazer.
- **Testes:** C1, C7 (com `approve`) e C14. Unitários da revalidação no núcleo.
  Recusa 403 com `edit`.
- **O dono valida na tela:** "Concluir formação" e "Gravar reforços" como de
  costume, com o usuário dono da marca. Nenhuma mudança visível para o owner.

### 11.3 F2 — Formação: plano e Assunto como casos da formação de sempre

- **Pré-requisito:** o parecer D2a no Processar (item da F3). A F2 só entra
  depois da F3, ou leva esse item junto (decisão de ordem na aprovação).
- **Sai:**
  - o desvio das linhas do plano em "Processar artigos" e "Concluir formação"
    (`splitTableSelectionForPlan`, ws:13614-13628; a "porta do plano" em
    `processArticleFormation`);
  - o uso de `origin: "plan_sheet"` para **formar** linha sem ArticleDNA
    (`plan-article-sheet.tsx:388`), com `prepare` e `apply` montando o DNA no
    servidor;
  - o alvo `kind: "subject"` sem DNA na melhoria.
- **Entra:**
  - a linha do plano entra em `articleFormationUniverses` como candidato, com as
    restrições do plano que já existem (`declaredPlanFormationInputs`,
    `declaredPlanGateInputs`, `declaredPlan` no adapter);
  - "Concluir formação" usa `confirmArticleFormation` → gravador (F1) →
    fechamento canônico;
  - o Assunto sem DNA forma pelo painel ou pela automação;
  - a melhoria trata só alvo **com** DNA (E5).
- **Ficam:** os selos e os alertas da linha do plano; "Procurar outra principal"
  (Livre sem volume, R1) e "Retirar artigo do Silo" na linha;
  `planSheetArticleConflict` como recusa por item, no portão da conclusão.
- **Consumidores:** `usePlanArticleSheet`, `PlanSheetOperations`, o catálogo
  `arquiteto.plan_articles_sheet`, o MCP `improve_articles` (alvos sem DNA
  passam a ser recusados com o caminho) e a automação do Assunto.
- **Compatibilidade:**
  - DNAs gravados por B ficam;
  - os runs `plan_sheet` em `applying` são retomados até o fim pela versão
    anterior do `apply` ou recusados com o caminho (decidir no teste C15);
  - o marcador continua o mesmo.
- **Rollback:** reverter o commit. Os DNAs gravados pela linha única são do
  mesmo formato e seguem legíveis pelo código anterior.
- **Testes:** C2, C3, C5 e C11 com a conclusão "muda na F2" atualizada (o Silo
  fecha no mesmo ato). C14 sem porta `plan_sheet` para formar.
- **O dono valida na tela (WifiConecta azul):**
  1. marcar as linhas do plano sem DNA → "Processar artigos" (custo antes) →
     "Concluir formação";
  2. ver os 7 artigos com papel e escopo do plano e a principal travada intacta;
  3. ver o Silo do plano fechado no mesmo ato.

### 11.4 F3 — SERP: o mesmo Processar e um aceite

- **Sai:**
  - o "Validar SERP" só de coleta para linhas do plano (`/keyword-serp` vindo de
    `plan-article-sheet.tsx:319`);
  - o aceite pelo `decisionHash` como porta própria;
  - o código morto que grava `:v` (ws:7705-7779 `prepareSelectedLogicalArticleDnas`,
    ws:4818-4862 `handleGenerateArticleDnas`, ws:4863-4910 `handleGenerateSiloDnas`,
    `handlePipelineStep` em ws:2709);
  - um dos dois vínculos de parecer e marcador duplicados.
- **Entra:**
  - o parecer de toda composição sai do mesmo `/api/arquiteto/serp` no
    Processar, inclusive D2a (`arquiteto-serp-http.ts:1090-1126`, hoje ativado
    só pelo caminho B);
  - um aceite: `resolveArticleFormationSerpAssessment`, gravado no confirmar (E4
    ou E5) pela mesma função;
  - uma função de vínculo do parecer e do marcador (a de
    `arquiteto-published-reinforcement-deps.ts:48-92` ou a da melhoria, a que
    passar nos cenários), usada pelos dois;
  - o gravador recusa `serpAssessmentRef` fora do formato `${id}:${formationBaseHash}`
    para `approved` novo.
- **Consumidores:** o Processar, a melhoria (`collect` e `apply`), o reforço, o
  portão do Radar (só leitura) e `/keyword-serp` (continua para o Minerador e
  para o que mais a chama).
- **Compatibilidade:** pareceres e aceites já gravados ficam. DNAs `:v` ficam e
  são lidos como hoje.
- **Rollback:** reverter o commit.
- **Testes:** C1, C2, C12 e C15. A paridade do parecer D2a no Processar contra o
  de B.
- **O dono valida na tela:** "Processar artigos" numa linha do plano mostra o
  parecer da SERP, como num artigo sem plano. "Concluir formação" não pede um
  segundo aceite.

### 11.5 F4 — Régua única da principal (R1)

- **Sai:**
  - `needsPrimary` com a regra própria do Assunto (`article-improvement.ts:399-401`);
  - a troca de Livre com volume no D2.1 (`published-primary-swap.ts:170`);
  - a âncora Livre "uma melhor assume" com volume definido;
  - `proposePrimarySubstitution` e a "Decisão pendente" que ela mostra
    (`primary-substitution.ts:104`, `published-keyword-readout.ts:127`,
    `published-serp-panel.tsx:123`).
- **Entra:** uma função de domínio pura em `lib/arquiteto`, ampliada da que já
  se declara vigente (`published-primary-swap.ts`). Ela diz *se* a principal pode
  trocar (R1, §8.1) e *quais* candidatas, na ordem da D2. É chamada por:
  - formação;
  - melhoria (`volumelessPrincipalSwap` passa a ser um caso dela);
  - plano (`planPrincipalSwapCandidates`);
  - mesa SERP-subject, reforço e diferenciação;
  - servidor (recusa candidata fora dela).

  O payload da troca passa a ser um só (`buildPublishedSwapArticlePayload`), e o
  payload em linha de `:1378` chama esse.
- **Consumidores:** os seis acima, o MCP `improve_articles` e o catálogo.
- **Compatibilidade:** trocas já gravadas ficam. Propostas abertas que a R1
  passa a proibir (Livre com volume) deixam de aparecer, com o motivo
  "Volume definido no DNA: a principal fica".
- **Rollback:** reverter o commit.
- **Testes:** C6, C9, C9b, C10 e C11 com a conclusão nova.
- **O dono valida na tela:**
  - um publicado Livre com volume 10: nenhuma troca sugerida, com o motivo;
  - um Livre sem volume: a troca aparece;
  - um Assunto sem plano com volume: a melhoria não troca.

### 11.6 F5 — Publicados: reforço e diferenciação como casos da melhoria

- **Sai:**
  - o gravador próprio do reforço (`route.ts:57` e o ramo de `apply` de
    `handlePublishedReinforcement`);
  - o gravador `proposed` da diferenciação (`cannibalization/apply/route.ts:30`);
  - a gravação `proposed` da troca pela mesa (ws:12662 → ws:12337);
  - o `discover` próprio da melhoria (`:616`), se a D-busca passar nos cenários.
- **Entra:**
  - "Gravar reforços (N)", "Aceitar grupo" e "Aceitar a troca" continuam os
    mesmos botões, nos mesmos painéis;
  - o confirmar de cada um chama o `apply` da melhoria com os alvos e o tipo do
    caso: reforço, diferenciação (nota e `excludedSubjects`) ou troca;
  - o `apply` revalida, faz o PATCH, grava `approved` (R2) com `approve`,
    atualiza o marcador e relê;
  - a prévia de cada painel continua sendo a dele (a detecção da diferenciação, a
    rodada paga com teto de US$ 0,50 por grupo, "Manter como está", "uma rodada
    por prévia");
  - uma busca: `executePublishedSearchRound` (teto, ledger e orçamento no
    servidor) para os três casos.
- **Consumidores:**
  - painéis "Mesmo assunto no Google", "Reforçar publicados", "Diferenciar
    publicados" e "Melhorar publicados…";
  - MCP `preview_published_reinforcement`, `plan_published_differentiation` e
    `improve_articles`;
  - catálogo; Redator (lê `differentiation` e `excludedSubjects` como hoje).
- **Compatibilidade:** propostas, avaliações pagas, decisões "Manter" e buscas em
  lote já gravadas continuam legíveis. Versões `proposed` ficam (§9).
- **Rollback:** reverter o commit. As versões `approved` gravadas têm o formato
  de sempre.
- **Testes:** C7, C8, C9 e C13 com a conclusão nova. A paridade de custo e
  recusa da rodada paga (fixtures).
- **O dono valida na tela:**
  - diferenciar dois publicados → aceitar → a versão nova aparece aprovada, com a
    nota;
  - reforçar → aprovada;
  - a troca pela mesa → aprovada;
  - URL, slug e canonical iguais nos três.

### 11.7 F6 — Silo: um gravador do par

- **Sai:** `persistSiloPairAtomic` como gravador de "Aplicar o plano declarado ao
  Silo" e de "Retirar artigo do Silo"; `alignTerritory` fora da transação, com a
  falha engolida.
- **Entra:** as duas operações editam a working copy do Silo (cópia de trabalho
  persistida, com `lock_version`) e consolidam pelo gravador canônico
  (`consolidateSiloFromWorkingCopyCore`). O Pilar passa a ser um só: o da working
  copy, preenchido pelo plano quando há plano.
- **Duas vias** (a escolher na aprovação da fase, D4):
  - **(a) Sem migration:** se a RPC canônica já aceita gravar a sucessora vN+1
    de um par consolidado a partir da working copy. **Ainda não verificado:** o
    adapter recebe o envelope do navegador e confere o lock, mas a regra de
    sucessora não foi lida nesta auditoria.
  - **(b) Com migration:** se não aceita, uma migration que estende
    `persist_silo_from_working_copy_atomic`, com rollback próprio. O dono executa
    (`AGENTS.md` §15; memória: nunca `supabase db push`).
- **Consumidores:** aba Silos, o MCP `apply_declared_plan_to_silo`, a cadeia de
  retirada do Minerador (`lib/server/declared-plan-withdraw-chain-runtime.ts:49-50`),
  o fechamento canônico e os links (`siloDnaRef`).
- **Compatibilidade:** pares gravados pelas duas RPCs ficam. A sucessora relê a
  versão vigente.
- **Rollback:**
  - via (a): reverter o commit;
  - via (b): o rollback da migration, aplicado pelo dono, depois de reverter o
    código.
- **Testes:** C2, C3 e C4. O tema da página do Silo corrigido por "Aplicar o
  plano declarado" (o caso do corpo estranho de 15/10). A retirada com a working
  copy concorrente (`STALE_WORKING_COPY`).
- **O dono valida na tela:** "Aplicar o plano declarado ao Silo" e "Retirar
  artigo do Silo" com prévia → confirmar → o par vN+1 aparece, com o tema certo,
  e a working copy em dia.

### 11.8 F7 — MCP alinhado e rotas legadas aposentadas

- **Sai:**
  - o corpo à mão em `plan_published_differentiation`;
  - a régua própria de `validate_silo_plan` (o bloqueio abaixo de 4 artigos);
  - as rotas sem chamador: `/api/arquiteto/silo-dna`, `/silo-page`, `/silos`,
    `/silo-pair` e `/article-dna`, com os helpers mortos
    (`persistArquitetoSiloPair`, `createCanonicalManualSilo`, se confirmados sem
    chamador);
  - as entradas dessas rotas no catálogo.
- **Entra:**
  - `plan_published_differentiation` usa `DifferentiationPlanRequestSchema`
    (`resume`, `replaceEvaluation`, `ai`);
  - `validate_silo_plan` usa a régua do cadastro (`lib/minerador/declared-plan.ts`:
    menos de 4 = aviso);
  - a descrição de `improve_articles` passa a seguir a linha;
  - `published_reinforcement_preview` ganha as rotas reais;
  - D5 decide se a formação de sempre e o fechamento canônico ganham ferramenta
    (mesmo núcleo, `platform.decide`, aceite humano no chat, §17.1).
- **Consumidores:** IAs conectadas pelo MCP; `npm run test:agent` (que falha se
  rota, ferramenta ou catálogo divergirem).
- **Compatibilidade:** ferramenta com o mesmo nome e entrada compatível. As rotas
  retiradas não têm chamador (confirmar por grep na entrega, incluindo `scripts/`).
- **Rollback:** reverter o commit.
- **Testes:** C13 e `test:agent`.
- **O dono valida:** numa conversa com a IA conectada, um plano de 3 artigos
  recebe aviso, e não bloqueio. A prévia da diferenciação retoma a avaliação
  paga em vez de recusar.

## 12. Riscos

1. **A F2 mexe no caminho que o dono homologa agora (WifiConecta azul).** A F0
   grava o estado de hoje antes, e a F2 só entra com C2, C3 e C11 verdes.
2. **D2a fora de B.** Se o parecer pelas sustentações não rodar no Processar, a
   principal declarada sem volume fica sem base. Por isso a F3 vem antes, ou junto.
3. **Permissão:** a F1 tira de colaborador com `edit` o poder de aprovar pelo
   reforço. Isso é correto, mas visível. A mensagem diz o motivo.
4. **R2 e o parecer:** a diferenciação que muda a composição passa a exigir o
   parecer da composição nova. Sem cache, a página é recusada em vez de ficar "em
   revisão" (D3).
5. **Gravação não atômica na melhoria** (PATCH antes do append, `:1456-1457`).
   Continua igual; o C15 guarda a recuperação. Tornar atômico ficaria para uma
   RPC própria, fora desta SDD.
6. **Bateria pesada:** o `test:arquiteto` já estoura a linha de comando do
   Windows. A F0 usa script próprio.
7. **Dev server:** mutantes e testes que compilam código mutado derrubam o `next
   dev` (memória). Avisar antes de rodar.
8. **Teste estrutural casa com o próprio comentário** (memória): o C14 limpa
   comentários antes do `doesNotMatch`.

## 13. Decisões pendentes do dono

- **D1 · Formação:** o caminho que fica é o da formação de sempre (navegador →
  "Concluir formação" → gravador do servidor). O `plan_sheet` deixa de formar
  linha sem DNA. Aprova?
- **D2 · Ordem das candidatas a principal (Livre sem volume):** proposta: 1)
  já no artigo ou na lista do Assunto e com o núcleo do slug; 2) mais páginas
  em comum na SERP (Forte antes de Provável); 3) mais lentes no cache; 4) mais
  volume. Aprova ou ajusta?
- **D3 · R2 na diferenciação e na troca pela mesa:** passam a gravar
  "aprovado". A página sem parecer da composição nova é recusada com o caminho,
  em vez de ficar "em revisão". As versões "em revisão" já gravadas ficam. Aprova?
- **D4 · Silo (F6):** tentar a via sem migration. Se a RPC canônica não aceitar
  sucessora, autoriza preparar uma migration, que você executa?
- **D5 · MCP (F7):** aposentar as rotas legadas sem chamador
  (`/silo-dna`, `/silo-page`, `/silos`, `/silo-pair`, `/article-dna`)? E dar
  ferramenta MCP à formação de sempre e ao fechamento canônico (mesmo núcleo,
  com o seu aceite no chat), ou deixar como operação só de tela?

## 14. Decisão

- [ ] aprovada para documentação somente
- [ ] aprovada para implementação da F0
- [ ] aprovada para implementação da fase ___
- [ ] bloqueada: decisão humana pendente (D1–D5)
- Decisão, data e aprovador:
