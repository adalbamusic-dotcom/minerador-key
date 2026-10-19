# SDD — A linha única do Arquiteto — 2026-10-16

> **Status: APROVADA pelo dono em 2026-10-16 ("segue as recomendações").** Decisões D1–D5 conforme as recomendações do §13: D1 formação pelo caminho de sempre (navegador → Concluir → gravador), o plan_sheet deixa de formar linha sem DNA; D2 candidatas da principal Livre sem volume: núcleo do slug/lista do Assunto → páginas em comum → lentes → volume; D3 o que o dono confirma após a prévia fica aprovado (§35.4/§37.7 viram SUBSTITUÍDO na fase); D4 Silo sem migration se der, senão a migration é preparada para o dono executar; D5 rotas legadas aposentadas e ferramenta MCP da formação só na F7. Autoriza as fases na ordem, uma por vez, começando pela F0 (só testes).
> **2026-10-17 (noite) · F2 FEITA, com um desvio declarado de D1** (§11.3 e §15.7): pelo pedido do dono no amarelo ("3 botões já é suficiente… na mesma linha de processo"), a linha do plano é gravada pelo gravador da melhoria (`origin: "plan_sheet"`, que revalida e relê e é o único que incorpora as keywords novas pelos núcleos do Minerador), não por `confirmArticleFormation`; o Silo do plano fecha no mesmo ato do Concluir. Manter o desvio ou voltar a D1 ao pé da letra é decisão do dono.
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
- **Feito em 2026-10-17 (noite, F2; §15.7):** "Processar artigos" das linhas do
  plano = a leitura da melhoria (`prepare` com `discover: true`, grátis: plano,
  DNAs, lista da marca e Google Ads) → UMA confirmação de custo da SERP que
  falta (`collect`) → o parecer da composição. Cópia de trabalho por linha;
  nenhum artefato gravado. SUBSTITUI o "Validar SERP" só de coleta.

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
    **SUBSTITUÍDO em 2026-10-17 (noite), desvio declarado (§15.7):** o
    "Concluir formação" das linhas do plano grava pelo `apply` da melhoria
    (`origin: "plan_sheet"`; revalida, grava `approved` e relê), com o
    checklist na prévia, e o Silo do plano fecha no mesmo ato;
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
2. **Pode trocar:** só **Livre e sem volume definido** — e, desde 2026-10-17, **fora da identidade** (a principal que está no título ou de onde o slug declarado/publicado foi feito fica; §15.5). A troca é sempre:
   - proposta e decisão humana na prévia;
   - versão nova, com `primaryKeywordDecision` confirmada (ator e hora);
   - a antiga vira secundária — salvo quando ela é a keyword que carrega o
     Assunto (artigo do plano, cadastro único): aí ela fica como a âncora do
     Assunto, fora das keywords (§15.2, 2026-10-17);
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
| spec §8, 1º parágrafo | "`Processar lógica`, `Validar SERP`, `Revisar com IA`, `Confirmar arquitetura` e `Enviar ao Radar`" | Os botões da linha (§6). O 2º parágrafo, "cópia de trabalho editável", fica e passa a citar `AGENTS.md` §0.4. | F2 — **marcado em 2026-10-17 (noite)**, spec §43 |
| spec §32 (Silo do plano, 2026-10-15), itens 5 e 6 | "As linhas do plano marcadas: 'Processar artigos' = Validar SERP; 'Concluir formação' forma a linha sem ArticleDNA [pela melhoria do plano]"; "(§ regra R2 do adendo C10)" | E3 e E4: a mesma formação e o mesmo parecer. R1 (§8.1) generaliza o R2 do C10. | F2, F3 e F4 — item 5 **marcado em 2026-10-17 (noite)**, spec §43 (o item 6 já foi marcado pela §41) |
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

> **FEITA em 2026-10-17 (noite), com desvio declarado** — ver §15.7. Do "Sai"
> abaixo, saiu o desvio de rótulo ("Validar SERP") e a recusa da linha já
> formada no Concluir; o `origin: "plan_sheet"` **ficou** como o gravador da
> linha do plano (o único que incorpora as keywords novas pelos núcleos do
> Minerador na mesma confirmação). Do "Entra", entrou o Silo do plano fechado
> no mesmo ato (pela tela, `writeSiloPairFromArticles` →
> `linkDeclaredPlanGroupToSilo`, depois da releitura dos DNAs); não entrou a
> linha do plano em `articleFormationUniverses`/`confirmArticleFormation`. O
> Assunto sem plano segue pelo painel do artigo, como antes.

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
- Decisão, data e aprovador: aprovada pelo dono em 2026-10-16 ("segue as recomendações"), fases na ordem a partir da F0.

## 15. Roteiro do grupo com plano: primeiro os dados, depois o trabalho (dono, 2026-10-16)

O dono, literal: "não tem problema de pagar, o problema é procurar à toa, sem
propósito real, sem ideia, sem sentido lógico… a lista que eu introduzi não
tinha nenhum problema, tudo estava bem claro aí, é só olhar nela para entender
e só depois trabalhar… desde os Silos até os links internos ele não está
olhando para os dados já existentes… OLHA OS DADOS!"

Este roteiro é a regra permanente do Arquiteto para um grupo que chega com
plano. Cada passo diz o que lê, para que serve e quanto custa. Nenhum passo
busca ou paga sem uma semente tirada do plano ou do DNA.

| # | Passo | Lê (dados que já existem) | Faz | Custo e propósito |
|---|---|---|---|---|
| 1 | Ler o plano | Silo (nome, slug); por artigo: ordem, papel, Assunto, keyword, slug, detalhes, trava, volume medido (o KeywordDNA) | Monta a cópia de trabalho do Silo e dos artigos exatamente como o plano diz | Grátis. Nada é gravado. |
| 2 | Silo | Nome e slug do plano | Reusa ou confirma o Silo do plano. Nunca propõe outro nem converte artigo em Silo | Grátis |
| 3a | Artigo com principal Travada ou com volume | Keyword, volume, trava | A principal é fixa. Se a SERP da principal não está no cache, coleta (4 lentes) e forma o artigo | Pago só a SERP da principal (custo antes). Propósito: base de evidência do artigo |
| 3b | Artigo com principal Livre e SEM volume | Assunto, slug, detalhes, DNA (entidade, problema, resultado) | **Exceção de 2026-10-17 (noite, dono: "Pilar troca, Suportes ficam"; §15.9 F):** o PILAR Livre sem volume, mesmo de identidade, recebe a proposta do termo-cabeça com volume que leva o núcleo do slug (a antiga fica como o Assunto). **SUBSTITUÍDO em 2026-10-17 (§15.5, "Principal de identidade"):** se a principal está no título ou no slug declarado (identidade), ela FICA; as buscas mais amplas entram como secundárias (passo 4), o parecer vem das secundárias (D2a) e o artigo forma sem troca (**17/10, tarde, §15.6:** a SERP da principal de identidade é a da primeira coleta e, coletada, o parecer usa ela); "Procurar outra principal" continua a decisão do dono. Só FORA da identidade vale o texto abaixo. ~~Procura uma principal substituta com essas sementes (ideias do Google Ads); a candidata precisa ter a mesma entidade e a mesma intenção e ter volume. Propõe a troca~~ (fora da identidade: primeiro a que leva o núcleo do slug com a entidade do DNA, depois a que mantém a intenção; ~~a antiga vira secundária~~ **SUBSTITUÍDO em 2026-10-17, §15.2:** a antiga, que carrega o Assunto, fica como a âncora do Assunto, fora das keywords; Assunto, título e slug do plano ficam). Decisão humana. Depois coleta a SERP da nova principal e forma | Google Ads grátis; identidade: ~~SERP só da secundária de mais volume (custo antes)~~ **SUBSTITUÍDO em 2026-10-17 (tarde, §15.6):** SERP da própria principal de identidade (4 lentes, até US$ 0,014, custo e propósito antes); troca: SERP só da principal escolhida (custo antes) |
| 4 | Reforço (todos os artigos) | Assunto, slug, detalhes, DNA e a SERP JÁ em cache da principal (relacionadas, "as pessoas também perguntam", títulos e entidades do top 10) | Busca secundárias com essas sementes (Google Ads), escolhe pelo encaixe semântico com evidência na SERP do artigo, até 6 por artigo, sem duas no mesmo par entre artigos do Silo; a mais fraca sai só por uma melhor. Prévia → decisão humana → nova versão | Google Ads grátis. SERP extra por candidata só se o dono pedir evidência a mais |
| 5 | Fechar o Silo | Pilar e ordem do plano, artigos formados | SiloDNA e SiloPage com o tema do Silo e o Pilar do plano | Grátis |
| 6 | Links internos | Papel e ordem do plano (Pilar↔Suportes; Suportes entre si) e o grafo do Silo interligado | Malha proposta pela regra do Silo interligado (SDD `sdd-silo-interligado-seo-semantico-2026-10-14.md`) | Grátis |

Regras do roteiro:
- Busca sem semente do plano ou do DNA não roda. Toda chamada paga diz, antes,
  quantas consultas, de quê, para qual artigo e por quê.
- A tela mostra, para cada artigo, só o que os dados dizem e o que falta ("Livre
  sem volume: procurar principal pelo Assunto e pelo slug"). Não mostra
  contagem interna nem texto sem ação.
- Cenário-ouro obrigatório (§0.3): o plano amarelo da WifiConecta (16/10).
  Dados reais: 8 artigos; Travados com volume: internet residencial barata
  (1.600), internet no meu cep (720), combo internet e celular (720),
  instalação de internet residencial (170); Livres sem volume (volume nulo no
  banco): como escolher plano de internet residencial (Pilar), claro vivo ou
  tim internet residencial, quantos mega de internet preciso, combo internet tv
  streaming. Esperado: 3a nos 4 Travados, 3b nos 4 Livres, 4 nos 8, 5 e 6
  depois.

### 15.1 Passo 4 com keyword nova — no código desde 2026-10-16 (noite)

Decisão do dono (16/10, noite): "TUDO QUE VEM DO MINERADOR NÃO PODE MEXER, SÓ
ANALISAR E TRABALHAR COM ISSO… PROCURA NOVOS, DIFERENTES DAS QUE JÁ ESTÃO NA
LISTA, PODE PROCESSAR ELES E INCORPORAR ELES".

- A keyword NOVA (que não existe na marca: chave normalizada do Minerador,
  qualquer lista e status) entra na MESMA confirmação dos passos 3b e 4:
  import da Pesquisa por Assunto (com a Lógica nas criadas), o Volume medido
  na prévia (sem consultar o Google Ads de novo), aprovação e envio ao
  Arquiteto, só nas linhas que esta confirmação cria; depois, o ArticleDNA.
  Exige o aceite explícito (`approveNewKeywords`) e as permissões do Minerador
  e do Arquiteto, conferidas antes de qualquer escrita. Vale na melhoria
  ("Melhorar publicados e formar Assuntos") e no "Reforçar publicados".
- A keyword que JÁ veio do Minerador é só lida: nunca importada, medida,
  processada, aprovada nem enviada pelo Arquiteto. Sem estar no Arquiteto, ela
  fica "Precisa do Minerador" (melhoria) ou de fora com o motivo (Reforçar).
- **SUBSTITUÍDO** em 2026-10-16: a F4 de 14/10
  (`sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 2), na parte em que
  a keyword nova ia só como "Sugestões do Arquiteto". As sugestões já gravadas
  continuam legíveis no Minerador; nada foi apagado.
- No código: a linha de copy (Assunto, slug, detalhes, DNA e a SERP da
  principal em cache) escolhe o reforço e a troca; a única SERP paga é a
  primeira da principal que ainda não tem; o parecer pelo cache usa a SERP da
  principal e deixa o apoio sem SERP "não observado". Cenário-ouro:
  `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts`.

### 15.2 A antiga principal fica como âncora do Assunto (dono, 2026-10-17)

> **2026-10-18 · SUBSTITUÍDO em parte** (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-d): no publicado com o Assunto declarado na página, a antiga **também** vira o Assunto (sai das keywords) — não continua secundária (D2.1). Sem Assunto na página, como abaixo.

- **O que vale agora:** na troca do passo 3b (Livre sem volume), a principal
  antiga do artigo do plano é a keyword que carrega o Assunto (cadastro
  único). Ela **não** vira secundária: sai das keywords do artigo e fica como
  a âncora do Assunto (`subject.keywordId`), com o título, o Assunto e o slug
  do plano. O motivo aparece na linha da prévia
  (`SUBJECT_KEYWORD_STAYS_SUBJECT_REASON`).
- **Por quê:** o contrato do ArticleDNA (`ArticleDNASchema`, `superRefine`)
  recusa o Assunto como secundária ou reforço; gravar "a antiga vira
  secundária" daria versão inválida. A keyword continua no artigo, como o
  Assunto dele — nada some.
- **SUBSTITUÍDO** em 2026-10-17: o "(a antiga vira secundária)" da linha 3b da
  tabela acima e o item 2 da R1 nesse caso. Vale para todo artigo cuja
  principal antiga é a keyword do Assunto (com ou sem plano). No publicado
  (D2.1), a antiga continua secundária, como antes.

### 15.3 Sem canibalização dentro do Silo (dono, 2026-10-17)

Tudo no MESMO alocador (`copyLineEdges` / `planArticleImprovements`), sem
motor novo:

- **(a) Variantes da mesma busca vão para UM artigo.** Variante = as mesmas
  palavras sem as de ligação, plural ou singular, qualquer ordem ("plano de
  internet residencial", "planos de internet residencial", "plano internet
  residencial"). Dono: o artigo cuja principal tem essas palavras; senão o que
  já tem uma secundária dessa variante; senão o que melhor as contém na
  principal, no slug e no Assunto (o Pilar desempata). ~~A variante da própria
  principal vale no máximo duas vezes no artigo.~~ **SUBSTITUÍDO em 2026-10-17
  (noite), §15.8:** toda variante da mesma busca (não só a da principal) entra
  no máximo duas vezes no artigo, as de maior volume; e o "melhor contém" olha
  primeiro as palavras que distinguem o artigo (fora do assunto comum do Silo).
- **(b) Busca com marca** (operadora, provedor — tirada dos domínios que a SERP
  da principal mostra, como `vivo.com.br`) só vai para o artigo cujo Assunto,
  slug ou principal nomeia aquela marca ou fala de operadoras. Nos outros,
  fica de fora. A mesma regra vale para as sementes da busca nova: relacionada
  com marca só semeia o artigo que nomeia a marca.
- **(c) Uma secundária nunca é a principal nem a secundária de outro artigo do
  mesmo Silo**, nem variante delas (dono da variante acima; keyword com dono
  fica com ele).
- **(d) Cabeça acima do volume da principal** (palavras da principal, menos que
  todas, com mais volume) só entra no Pilar. ~~No Suporte, ela fica de fora.~~
  **SUBSTITUÍDO em 2026-10-18, §15.10:** no Suporte, fica de fora só a cabeça do
  núcleo do Pilar/Silo (nenhuma palavra própria do Suporte); a cabeça da faceta do
  próprio Suporte entra como secundária de contexto, até 5.000 buscas.
- A secundária precisa levar ao menos uma palavra própria do artigo (da
  principal, do slug, do Assunto ou dos detalhes) que não seja o assunto comum
  do Silo ("internet residencial wifi" não reforça "internet residencial
  barata").
- Sementes da busca nova: palavra solta do DNA ("internet", "plano") não
  semeia — é cabeça genérica e não diz do que o artigo fala.
- Cenário-ouro: `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts`
  (variantes de "plano(s) de internet residencial" todas no Pilar; busca com
  marca só no artigo das operadoras; "barata" com "preço internet
  residencial" e parecidas). Testes do alocador em
  `tests/arquiteto-article-improvement.test.mts`.

### 15.4 Telas e diferenciação com a keyword nova (dono, 2026-10-17)

- Melhoria ("Melhorar publicados…"), "Artigos do plano" (Concluir formação) e
  "Reforçar publicados": a confirmação lista, por artigo, as keywords NOVAS com
  volume e fonte e diz que elas são importadas, processadas, aprovadas e
  enviadas nesta confirmação; o pedido leva `approveNewKeywords: true` só
  nesse caso. A keyword nova aparece marcada "nova" na linha.
- O passo pago chama-se **"Coletar a SERP no DataForSEO (pago: N consultas,
  até US$ X)"** — SUBSTITUI "Validar no Google" (2026-10-17), que parecia o
  Google Ads. O Google Ads aparece sempre como "grátis (cota do Google Ads)".
- Diferenciação de publicados ("Aceitar grupo"): a mesma regra. A keyword NOVA
  entra no Minerador no próprio aceite (import, Lógica, Volume, aprovação e
  envio ao Arquiteto), pelas MESMAS portas do "Reforçar publicados"
  (`mineradorPortsForNewKeywords`, agora em
  `lib/server/arquiteto-published-reinforcement-deps.ts`); a que já existe é só
  lida. Depois ela entra no artigo pelo "Colocar no artigo" de sempre.
  **SUBSTITUÍDO** em 2026-10-17: a F4 de 14/10 na diferenciação (a nova ia
  como "Sugestões do Arquiteto").

### 15.5 Principal de identidade (dono, 2026-10-17)

> **2026-10-18 · SUBSTITUÍDO como portão da troca** (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-b/c, aprovada): "identidade fica" e "Publicados" desta seção — vale a régua do volume (volume 0 → proposta no Pilar e no Suporte, publicado e novo; volume definido fica; desconhecido não decide) com a régua c. Continuam: o motivo, a SERP da principal de identidade e "as mais amplas reforçam o contexto" quando a principal fica.

O dono, literal: "Se o termo principal tem pouco volume, mas faz sentido
preservá-lo por ser a identidade do assunto/tema, principalmente nos
publicados mas também nos novos. As keywords mais amplas podem reforçar o
contexto."

- **Teste (dos dados, sem IA):** a principal é a identidade quando está no
  título do Assunto (todas as palavras de conteúdo dela, 2 ou mais) ou quando
  o slug foi feito dela (todas as palavras dela no slug, cobrindo ao menos
  metade dele; ou 3/4 das palavras do slug nela). Slug declarado no plano ou
  publicado; o slug sugerido do DNA (que sai da própria principal) não conta.
  Função única: `principalIsIdentity` / `targetPrincipalIsIdentity`
  (`lib/arquiteto/article-improvement.ts`).
- **Identidade fica** (Travada ou Livre, com pouco ou nenhum volume). As buscas
  mais amplas entram como secundárias pelo passo 4 e pelas regras do Silo
  (§15.3). A trava Livre não dispara troca. "Procurar outra principal" continua
  a decisão do dono na linha.
- **Troca só fora da identidade** (frase fora do título e do slug): no plano e
  no Assunto, primeiro a busca com volume que leva o núcleo do slug com a
  entidade do DNA (`subjectSlugCoreSwap`, a régua de 30/09 do publicado,
  estendida), depois a que mantém a intenção; no publicado, D2.1, principal
  mais ampla com o núcleo do slug, reserva da keyword mais próxima do slug e IA.
  Sempre proposta, decisão do dono, motivo escrito ("fora da identidade").
- **Formar sem trocar:** ~~a SERP da principal sem volume não é coletada; o
  parecer vem das secundárias com volume e 4 lentes no cache (D2a, estendida à
  keyword da própria página publicada). A coleta paga, quando falta, é a da
  secundária de mais volume (custo e propósito antes).~~ **SUBSTITUÍDO em
  2026-10-17 (tarde) pela §15.6:** a SERP da principal de identidade é coletada
  na primeira coleta do artigo e o parecer usa ela; a secundária de mais volume
  não é coletada por padrão; a D2a fica só enquanto a SERP dela não foi
  coletada (e, fora da identidade, como antes).
- **Publicados:** a mesma régua em `proposePublishedPrimarySwap` (mesa,
  "Reforçar publicados", diferenciação), `volumelessPrincipalSwap`,
  `editorialAiPrincipalBlock` e `validationGroups` (nenhuma SERP de candidata a
  principal é paga para identidade). A régua lê a principal ATUAL do DNA
  quando uma troca anterior já a mudou (`currentPrincipalKeyword`, aditivo).
- **SUBSTITUÍDO** em 2026-10-17: "Livre sem volume troca" como padrão (passo
  3b acima, R1 item 2, spec §35 item 3 e §32 item 6, catálogo item c). Vale
  agora: só fora da identidade.
- Cenário-ouro: `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts`
  (o Pilar fica com "como escolher plano de internet residencial" e recebe
  "planos de internet residencial" 6.600, "plano de internet residencial"
  2.900, ~~"plano internet residencial" 1.000~~ (**SUBSTITUÍDO em 2026-10-17,
  noite, §15.8:** é a terceira grafia da mesma busca; ficam as duas de maior
  volume), "melhores planos…" 480 e "melhor
  plano…" 260; os 3 Suportes Livres ficam com a principal e recebem o reforço
  da busca nova; a única SERP paga é a da secundária de mais volume de cada
  Livre — **SUBSTITUÍDO em 17/10, tarde:** é a da principal de identidade de
  cada Livre, §15.6); C6, C9, C9b e C10 (identidade × fora da identidade).

### 15.6 A régua única da coleta da SERP: sem volume, só a principal de identidade (dono, 2026-10-17, tarde)

Decisão do dono sobre a recomendação: "implementa a sua recomendação".

- **O que vale agora:** keyword SEM volume não tem a SERP coletada, EXCETO a
  principal de identidade do artigo (§15.5: no título do Assunto ou o slug
  declarado/publicado foi feito dela) — linha do plano, Assunto ou página
  publicada. A SERP dela é coletada na primeira coleta do artigo ("Processar
  artigos" de sempre e, na melhoria, a primeira coleta do artigo), 4 lentes,
  até US$ 0,014, com o propósito e o custo ditos antes, por artigo: "SERP da
  principal de identidade “…” (sem buscas no Google Ads): 4 consultas, até
  US$ X — para ver o que o Google mostra para a frase do artigo".
- **Por quê:** mostra o que o Google exibe para a frase exata do artigo
  (estrutura, concorrentes, base para o Radar). É barato e tem propósito.
- **Uma régua só:** `serpCollectionAllowed` (`lib/arquiteto/article-batch-serp.ts`),
  reconduzindo as que existiam: `planArticleBatchSerpLot` ("Processar artigos"),
  `planSheetSerpSelection` ("Validar SERP"), "Consultar nas 4 lentes", o
  `onlyMeasuredVolume` do `/api/arquiteto/keyword-serp`, o "a Principal sempre
  consultada" do `/api/arquiteto/serp` e a base da coleta da melhoria
  (`validationGroups`). A identidade é a função de sempre (`principalIsIdentity`),
  lida dos dados por `serpIdentityPrincipalCheck`.
- **O servidor confere de novo:** `readSerpIdentityPrincipals`
  (`lib/server/known-before-search.ts`) relê, em projeção estreita, o pacote
  aprovado que o Arquiteto recebeu (plano, título do Assunto, marca de principal
  declarada, Vínculo publicado), o status legado e o ArticleDNA vigente (só vale
  como principal). Recusa a coleta da que não é, com o motivo
  (`excludedByVolume` no keyword-serp; `refusedPrincipals` no plano do serp; a
  execução nunca a paga, nem nas lentes extras). Leitura que falha: nada pago.
- **Parecer:** com a SERP da principal de identidade no cache, o parecer usa ela
  (e as secundárias com SERP, se houver). D2a só enquanto ela não foi coletada.
- **A secundária de mais volume** não é mais coletada por padrão quando a
  principal de identidade tem a SERP (gasto duplo); continua opcional pelo
  artigo, para mais evidência.
- **Continua recusada** a keyword sem volume que não é a principal de
  identidade (secundária, reforço, a do Assunto que virou âncora numa troca,
  principal fora da identidade). No Minerador nada muda.
- **SUBSTITUÍDO** em 2026-10-17 (tarde): "keyword sem volume nunca é coletada"
  como regra sem exceção (spec §38 item 2, SDD SERP no artigo A3), "a Principal
  continua sempre consultada" (dúvida Q2, agora decidida: a fora da identidade
  não é paga) e o "formar sem trocar" da §15.5 (a coleta da secundária de mais
  volume). Spec §42.
- Cenário-ouro: `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts` (os
  4 Livres: 16 consultas, até US$ 0,056, só as principais de identidade; a
  secundária não; o parecer pela SERP da principal); servidor:
  `tests/arquiteto-quatro-lentes-rota.test.mts` ("régua única ·…": identidade
  conferida no pacote → paga; fora da identidade ou sem pacote → recusada, nada
  pago mesmo autorizado).

### 15.7 Os 3 botões em sequência e a F2 (dono, 2026-10-17, noite)

O dono, no amarelo da WifiConecta (marca `d4fa133a-…`), depois do deploy:
"o arquiteto ainda não está cumprindo o papel dele… ficou travado… Reprocessar
artigos, Concluir formação [sem estar habilitados]… cadê as keywords de
reforço?… 3 botões já é suficiente… na mesma linha de processo"; "tem 7 botões
totalmente inúteis"; "tem que ser sequencial"; o último botão "era como o botão
milagroso do refazedor". Regra permanente: spec §43.

- **Causas (verificado no código do HEAD `0dfa4bd`):**
  1. "Processar artigos" das linhas do plano era só "Validar SERP" (coleta das
     linhas com volume): não buscava reforço, e a busca nova no Google Ads era
     um botão à parte dentro do painel de melhoria;
  2. "Concluir formação" recusava a linha já formada (os 4 Travados com v1:
     "use Melhorar publicados…") e, para a Livre de identidade sem volume e sem
     candidata, a melhoria não via mudança (só a principal) e devolvia "sem
     evidência / use Procurar outra principal": nada a gravar nas 8 linhas;
  3. os dois botões ficavam desabilitados enquanto uma prévia do plano estava
     aberta ou trabalhando (`ocupado = busy || preview`), e o `title` não dizia
     por quê;
  4. a leitura dizia "Falta: nada" quando a busca nova ainda não tinha rodado;
  5. o Silo do plano não fechava no Concluir das linhas do plano (b2-12).
- **O que mudou (dentro da linha de sempre, sem rota, etapa nem núcleo novo):**
  - "Processar artigos" = `prepare` (`origin: "plan_sheet"`, `discover: true`)
    → custo da SERP que falta → `collect` (a única confirmação do Processar);
    o resultado é a cópia de trabalho de cada linha (`planSheetWorkingCopyLines`);
  - "Concluir formação" = a prévia (`planSheetPreviewLines`) com o checklist
    (`planSheetConclusionChecklist`: principal · reforço · SERP · plano · Silo)
    → `apply` com `approveNewKeywords` (as novas pelos núcleos do Minerador) →
    os DNAs relidos → o Silo do plano pelo fechamento canônico
    (`planGroupSiloClosure` decide; `writeSiloPairFromArticles` grava;
    `linkDeclaredPlanGroupToSilo` liga o grupo). A linha já formada entra (versão
    seguinte); a linha no Radar ou depois é recusada com o motivo;
  - a Livre de identidade sem candidata conta como mudança (`formaOPrimeiro`,
    `lib/arquiteto/article-improvement.ts`) e o alvo sem DNA pede a SERP dela
    (`lib/server/arquiteto-article-improvement.ts`);
  - "Melhorar publicados…" virou o refazedor (o mesmo painel e motor): abrir lê
    sozinho; prévia com só "Cancelar" e "Confirmar"; o motivo do refazer
    (`reworkOverride`) dentro da prévia;
  - a sequência (`planSheetSequence`; na barra, `passo`, `motivoConcluir`,
    `motivoMelhorar`): o passo atual destacado, o seguinte só com o anterior
    feito, o porquê no `title`; publicados com "Melhorar publicados…" sempre
    habilitado;
  - "Ações do Assunto" saiu da barra (prender/soltar no painel do artigo);
    "Formar artigos automaticamente" saiu do grupo com plano (fica no Assunto
    sem plano, dúvida Q4 do registro); textos sem ação saíram da tela.
- **Desvio de D1 (declarado):** D1 dizia "o plan_sheet deixa de formar linha
  sem DNA". O pedido de 17/10 exige que o Concluir grave numa confirmação as
  keywords novas pelos núcleos do Minerador, e o único gravador que faz isso,
  revalidando e relendo, é o `apply` da melhoria. Por isso a linha do plano é
  gravada por ele, e `confirmArticleFormation` continua só para os artigos de
  sempre. É um gravador por artefato (o ArticleDNA da linha do plano tem um).
  Voltar a D1 ao pé da letra exigiria levar a incorporação das novas para o
  `confirmArticleFormation` — outra entrega, se o dono quiser.
- **Sem migration e sem mudança incompatível de contrato:** os campos novos são
  só da tela e do domínio; o pedido ao servidor usa os campos que já existiam
  (`origin`, `discover`, `targetIds`, `approveNewKeywords`, `reworkOverride`).
- **Limite:** o fechamento do Silo roda no navegador, depois da releitura. É
  conferido por domínio (`planGroupSiloClosure` com os 8 DNAs gravados) e por
  teste estrutural, não de ponta a ponta no servidor. Nada validado na tela
  pelo dono.
- **Cenários:** `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts`
  ("OS 3 BOTÕES pela barra": 16 consultas, até US$ 0,056; 4 v2 + 4 v1; novas só
  pelos núcleos do Minerador; originais intactas; Silo pronto com o Pilar l1 e
  a ordem do plano; e "a Livre de IDENTIDADE sem nenhuma candidata…");
  `tests/arquiteto-cenarios-ouro-servidor-2026-10-16.test.mts` (C2/C3 com a
  regra nova); `tests/arquiteto-tres-botoes-dom-2026-10-17.test.mts` (a
  sequência (a)(b)(c) e os 3 botões contados na tela); a forma da linha em
  `tests/arquiteto-linha-de-processo-guarda.test.mts`.

### 15.8 Reforço equilibrado: a mesma busca, as entidades do Assunto e o "adequado" (teste no ar, 2026-10-17, noite)

O coordenador clicou "Processar artigos" no amarelo (marca `d4fa133a-…`, execução
`5afa893a`, nada gravado). Pilar, "barata", "cep", "quantos mega" e "combo
celular" bons; três defeitos de qualidade, todos no motor de sempre (linha de
copy, sementes e alocador da melhoria), sem rota, etapa, botão nem núcleo novo:

| Artigo | O que saiu | Causa (verificado no código e nos dados reais) |
|---|---|---|
| "Claro, Vivo ou TIM para casa" (identidade, sem volume) | 4 grafias da mesma busca da Vivo ("internet residencial vivo" 2.400, "vivo residencial internet" 1.600, "internet da vivo residencial" 1.300, "internet residencial da vivo" 170) | (1) a busca nova filtrava as ideias pela linha de copy SEM a régua de marca: "claro internet residencial" e "tim internet residencial" nem eram medidas (as da Vivo passavam pela linha de "internet residencial barata"); (2) as sementes eram só frases longas (13 ideias); (3) só a variante da principal tinha teto; (4) nada equilibrava as entidades; (5) as cabeças (22.200, 6.600) ocupavam vagas e saíam depois da alocação; (6) o vocabulário da SERP da principal de identidade (já coletada, §15.6) não era lido |
| "Instalação de internet: taxas, prazo e quando chega a primeira fatura" (Travada, 170) | "Já formado e adequado: nada a gravar", com 1 keyword | sementes = a principal e o slug inteiros (o Google Ads devolveu 6 ideias); "adequado" = principal com volume e nada mudou, mesmo com 5 vagas |
| "Internet, TV Box e streaming" (identidade, sem volume) | sem secundária | sementes longas (2 ideias); a linha só aceitava 3 das 4 palavras da principal; sem o vocabulário da SERP dela. A anticanibalização NÃO tirou dele o que era dele: "combo tv internet e celular" (320) leva a principal inteira do "combo internet e celular" e fica nele (decisão abaixo) |

O que vale agora (spec §44):

- **(a) A mesma busca no máximo 2 vezes por artigo**, as de maior volume
  (`sameSearchKey`; "melhor", "bom", "vale a pena" fazem outra busca).
  SUBSTITUI "a variante da própria principal vale no máximo duas vezes" (§15.3 a)
  e as cinco grafias do Pilar (§15.5, cenário). Complemento de 2026-10-18
  (§15.10): a mesma busca com o MESMO volume é a mesma linha do Google Ads e conta
  uma vez.
- **(b) Assunto que enumera entidades** (`assuntoEntityList`: a cabeça do título
  com vírgula, "ou" ou "vs"; lista com número não conta): carrega o artigo a
  candidata que nomeia uma entidade com o resto do artigo, ou duas comparadas;
  reforço por rodadas — a melhor de cada entidade e a comparação antes da
  segunda de qualquer uma, a busca nova antes da repetição; nenhuma passa da
  sua parte (`ceil(vagas / entidades)`); a parte vazia é dita ("Equilíbrio por
  entidade do Assunto: … sem keyword…").
- **(c) Palavra própria de outro artigo** (está na principal de um só artigo do
  Silo e fora da linha deste) indica o artigo dele, salvo quando a frase leva a
  principal inteira deste. Com os três serviços ("combo tv internet e
  celular"): fica no artigo 6, que tem a principal inteira dentro dela; do
  artigo 7 faltaria "streaming". TV + internet ("combo internet e tv",
  "internet e tv residencial") vai para o 7; celular + internet, para o 6.
- **(d) Afinidade da variante:** primeiro as palavras que distinguem (fora do
  assunto comum do Silo: o slug do Silo e as palavras de 2+ principais), depois
  a principal inteira, depois a régua de antes.
- **(e) Cabeça da principal de identidade (> 5.000) fora antes de alocar**, e a
  vaga da principal de identidade sem DNA reservada no alocador (antes o teto
  cortava depois a de menos volume — no artigo comparativo, a comparação).
- **(f) Sementes curtas do plano:** uma por entidade enumerada (a principal só
  com ela) e, com facetas depois dos dois-pontos, a cabeça e cada faceta
  ("taxas de instalação de internet", "prazo de instalação de internet",
  "primeira fatura internet"). A busca nova usa a régua de marca do alocador
  (`improvementSiloContext`); a ideia que leva o artigo com uma palavra fora da
  linha também é medida (grátis) — SUBSTITUI, nesse caso, "ideia fora da linha
  de copy nem é medida".
- **(g) Vocabulário da principal de identidade:** `principalVocabularyOf` lê do
  cache a SERP dela (coletada pela §15.6) — SUBSTITUI "só a principal com volume
  tem SERP".
- **(h) "Adequado" só com reforço suficiente:** com vaga e nada achado, a linha
  diz "Sem keyword de reforço encontrada" e o motivo (as que cabiam e por que
  ficaram fora, ou que nenhuma coube); status `adequate`, nada a gravar.

Com os dados reais (simulação no domínio, sem chamada): o pool da execução
`5afa893a` mais as ideias reais de "claro/tim internet residencial" e de TV da
execução `4bbcf025` dá ao artigo das operadoras "claro residencial internet"
(1.900), "internet residencial vivo" (2.400), "tim residencial internet" (480),
"tim claro ou vivo" (90) e "internet da claro residencial é boa" (210); ao de TV
"internet e tv residencial" (170), "plano de internet e tv residencial" (110) e
"tv box sem internet" (110), com "streaming" dito sem keyword; a instalação, sem
ideia real que caiba, diz "Sem keyword de reforço encontrada" e o motivo. As
ideias das sementes novas só existirão no próximo "Processar artigos" real.

Cenário-ouro: `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts` (as
sementes curtas pedidas; o Google Ads da fixture só devolve as relacionadas para
a semente curta; l2 com uma de cada operadora e as comparações; l4 com as de
streaming e, depois da coleta, as de TV; "combo tv internet e celular" no t2;
"combo tv e celular" fora; t4 com as facetas; e o teste novo "'adequado' só com
reforço suficiente"). Alocador: `tests/arquiteto-article-improvement.test.mts`.

### 15.9 Depois do Concluir: Silo do plano fechado, keywords no artigo, links pela cor, o refazedor que lê e o Pilar que troca (teste no ar e dono, 2026-10-17 noite / 2026-10-18)

O dono rodou Processar → Concluir no amarelo (marca `d4fa133a-…`): 8 ArticleDNA
aprovados (4 v1 + 4 v2), 32 keywords novas, SiloDNA v1 + SiloPage v1 do
`territory:2318febb` (consolidado, ligado ao grupo). Verificado pelo coordenador no
navegador e por SELECT. Tudo dentro da linha de sempre: nenhuma rota, etapa, barra,
botão nem núcleo novo; nada foi apagado nem gravado no banco por este trabalho.

| # | O que apareceu | Causa (verificado no código e no banco) | Conserto |
|---|---|---|---|
| A | `territory:c8c9ee94` "Planos e contratação", confirmado, vazio, às 01:10 UTC | Uma segunda confirmação (run `e5d5ec39`, 01:10–01:11) incorporou 5 keywords novas; o envio delas ao Arquiteto (`createMineradorArquitetoHandoff` → `materializeDeclaredPlanSilo` → `choosePlanSiloTerritory`) só via candidate/confirmed (`PLAN_SILO_ASSIGNABLE`): o 2318febb, já `consolidated` desde 00:57, era invisível → `create`. Na primeira confirmação (00:54–00:57) ele ainda estava `confirmed`, por isso não duplicou | `choosePlanSiloTerritory` acha o consolidado (ligado ou mesmo slug, o fechado antes; `PLAN_SILO_ALIVE`); `materializeDeclaredPlanSilo` não cria, não confirma nem põe membro no consolidado (a nova entra pelo artigo); "Recriar o Silo do plano" recusa o consolidado; o duplicado (grupo ligado a outro território vivo) deixa de ser "Silo do plano" no Desfazer (`planSiloDuplicateOf`), na tela e no servidor |
| B | "Keywords sem artigo · 32" | As 32 estão nos `keywordReferences` dos ArticleDNA vigentes, mas o item de workflow delas não tem `clusterId`/`workingArticleId`; a mesa sobrepõe a cópia de trabalho (nula) à projeção do ArticleDNA e as lista como "não agrupadas" (com "Reservar como candidata" a Silo) | `splitUngroupedBySubjectAnchor` recebe `inArticleKeywordIds` (`keywordIdsInArticleDnas` dos vigentes): saem de "sem artigo"; a contagem do pipeline também as conta como no artigo. Só leitura |
| C | Links internos: "Selecione o Silo do grafo antes de processar os links" com os 8 marcados | A escolha do Silo do grafo era o clique no mapa (saiu em 16/10); `linksSiloOfArticle` lia o id da cópia de trabalho ("workflow:…"), não o do ArticleDNA, e os 8 ficavam sem Silo; sem marcação, valia o primeiro Silo da lista (podia ser o azul) | `linksSiloOfArticle` lê o ArticleDNA pela chave da fase (`articleDnaEntryFor`); `resolveLinksSilo`: com a cor, o Silo da cor com o par; sem cor, o seletor de sempre ("Silo do grafo", agora `LinksSiloPicker`) com só os Silos com o par; marcados sem Silo achado não travam |
| D | Refazedor: só "Já feito… diga o motivo" e "4 Assunto(s) com lista… não entram na busca nova" | A tabela mostrava só as linhas que mudam (com 8 adequados, nada) e o aviso do refazer vinha aberto; o F5 de 12/10 tirava da busca nova o Assunto com lista da Pesquisa por Assunto — e as keywords que a própria confirmação incorporou levam o Assunto na lista (`subject_discovery`) | A tabela é a leitura de cada artigo (`improvementReadingLines`: tem · falta · proposta); o "já feito" e o motivo dentro de um recolhido que só abre quando a pessoa pede; o F5 foi **SUBSTITUÍDO** pela regra de 16/10 (§15 passo 4): a lista é lida primeiro e a busca nova roda para quem ainda pede reforço |
| D′ | (achado no SELECT) toda proposta PRONTA com as keywords novas (a troca do Pilar, por exemplo) viraria "Precisa do Minerador: a Lógica…" | A Lógica do Minerador já rodou nelas (`logicProcessedAt`) e deixou "Pendente" (ambígua); a melhoria pedia a Lógica de novo — laço | `mineradorIntentSettled` (prévia e gravador): Lógica que já rodou resolve; a intenção é da SERP (§40) |
| E | Finalizar | — | Depois de "Confirmar links internos", "Marcar Pronto para Radar e enviar os N artigos deste Silo" (o de sempre) aparece: os 8 agora resolvem o Silo do grafo |
| F | Decisão do dono: "Pilar troca, Suportes ficam" (**SUBSTITUÍDO em 2026-10-18** pela SDD do Assunto pela principal: o Suporte de volume 0 também troca, pela faceta dele) | A T12 (§15.5) segurava a principal de identidade também no Pilar sem volume | Exceção na MESMA régua: `pilarTrocaPelaCabeca` / `identityHoldsPrincipal` em `subjectSlugCoreSwap`, `copyLineEdges` e `planArticleImprovements`: o Pilar Livre sem volume recebe a proposta do termo-cabeça com volume que leva o núcleo do slug (no Pilar, cauda curta e mais volume entre as que levam o núcleo); a antiga fica como o Assunto (§15.2); a principal nova conta no teto da mesma busca (§15.8 a); sem termo-cabeça, a identidade fica. Travada e Suportes, como antes |

- **SUBSTITUÍDO** em 2026-10-18 (§0.5): "Assunto com lista da Pesquisa por Assunto
  do Minerador não entra na busca nova" (SDD do plano declarado, F5, 2026-10-12;
  catálogo, guarda de retrabalho); "a tabela do refazedor mostra só o que pode mudar";
  e, para o Pilar, o "identidade fica" da §15.5 (a linha 3b da tabela do §15 e o
  cenário da §15.5: o Pilar recebe a proposta do termo-cabeça; os 3 Suportes Livres
  ficam).
- **O que o dono clica:** (A) Arquiteto → aba Silos → na linha "Planos e contratação"
  que está **Confirmado** com 0 keywords (a outra, Consolidada, não tem o botão) →
  "Desfazer Silo" → confirmar na prévia. É seguro: nenhuma keyword aponta para ele,
  não tem SiloDNA nem SiloPage, nenhum ArticleDNA o usa; ele fica no banco como
  desfeito. (E) Links internos com a etiqueta amarela → "Processar links" → confirmar
  na prévia → revisar → "Confirmar links internos" → "Marcar Pronto para Radar e
  enviar os 8 artigos deste Silo" → confirmar.
- **Limites:** o Pilar já formado precisa da SERP do termo-cabeça (4 consultas, até
  US$ 0,014, custo dito antes) para gravar; a escolha do Silo do grafo é de tela
  (nada gravado). Nada validado na tela pelo dono.
- **Cenários:** `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts` (o Pilar
  troca no Processar/Concluir e no refazedor; "depois do Concluir" A, B, C, D);
  `tests/arquiteto-cenarios-ouro-2026-10-16.test.mts` (C17: a frase do Pilar);
  `tests/arquiteto-tres-botoes-dom-2026-10-17.test.mts` (a leitura do refazedor; o
  "já feito" só quando se pede; o Silo do grafo pela cor); alocador em
  `tests/arquiteto-article-improvement.test.mts`; servidor em
  `tests/arquiteto-article-improvement-server.test.mts` (o Assunto com lista entra na
  busca nova).

### 15.10 A cabeça do Pilar é a do núcleo do Pilar/Silo; a da faceta do Suporte reforça o contexto (teste no ar, 2026-10-18)

O coordenador abriu o refazedor ("Melhorar publicados…") no amarelo (marca
`d4fa133a-…`). O Suporte "Instalação de internet: taxas, prazo e quando chega a
primeira fatura" (principal Travada "instalação de internet residencial", 170; slug
`instalacao-internet-primeira-fatura`; detalhes "Instalação, agendamento,
viabilidade, cobrança inicial e fidelidade") ficou com 3 keywords: o motor recusava
"internet instalação" (880), "instalação internet" (880) e "instalação de internet"
(720) como "mais ampla que a principal (cabeça do Pilar)".

- **Causa (verificada no código):** a régua da cabeça no Suporte (§15.3 d:
  `cabecaDaPrincipal || headOverPrincipal`, em `copyLineEdges` e no filtro do Suporte
  de `planArticleImprovements`) comparava só com o volume da principal do Suporte.
  Com 170 buscas, toda busca mais ampla da MESMA faceta virava "cabeça do Pilar" —
  são a cabeça da faceta "instalação", não a do tema do Silo ("planos de internet
  residencial").
- **Conserto, no mesmo motor (`suporteReservaAoPilar`, `nucleoDoPilarESilo`):** no
  Suporte do plano, a busca mais ampla que a principal só fica com o Pilar quando
  nenhuma palavra dela é própria do Suporte — todas são do Pilar (principal, slug,
  entidade), do Silo (entidade, slug) ou do assunto comum dos artigos ("internet
  residencial", "plano de internet", "planos de internet residencial"). A que leva a
  palavra própria do Suporte é a cabeça da faceta dele e entra como secundária de
  contexto (§15.5: "as keywords mais amplas podem reforçar o contexto"), até
  `BROAD_HEAD_MAX_VOLUME` (5.000; acima, "é cabeça (mais de 5000 buscas): um Suporte
  não ranqueia nela"), com as regras do Silo de sempre (§15.3 a–c, §15.8 a–d). Sem o
  Pilar lido, a regra de antes (fecha para o lado seguro).
- **O Pilar fora da leitura:** o "Processar artigos" de algumas linhas e o refazedor
  de um artigo só não têm o Pilar entre os alvos. `readInputs` lê o Pilar do mesmo
  plano em todas as linhas do recorte, antes do filtro por `targetIds`, e o põe no
  alvo do Suporte (`ImprovementTarget.planPillar`, opcional; só leitura). Runs já
  gravados sem o campo usam o Pilar da leitura.
- **A mesma linha do Google Ads (§15.8 a, complemento):** "internet instalação" e
  "instalação internet" têm o mesmo volume (880): o Google Ads agrupa as grafias da
  mesma busca e repete o número — é um dado só. A primeira entra; a outra fica fora
  ("é a mesma linha do Google Ads de …") e não conta no teto de 2; a segunda vaga vai
  para a grafia de volume próprio ("instalação de internet", 720).
- **Resultado no amarelo (fixture com os números reais):** a instalação recebe
  "instalação de internet" e "internet instalação"; nenhuma cabeça do núcleo do Pilar
  entra em Suporte; o refazedor de um artigo só dá o mesmo resultado.
- **Botões:** "Processar artigos" e "Melhorar publicados…" — o mesmo
  `handleArticleImprovement` → `planArticleImprovements` (a mesma rota
  `/api/arquiteto/article-improvement`; o MCP chama o mesmo núcleo). Nenhuma rota,
  etapa, botão nem núcleo novo.
- **SUBSTITUÍDO (§0.5):** §15.3 (d) "No Suporte, ela fica de fora"; spec §39 item 7
  ("a cabeça acima do volume da principal só no Pilar"); catálogo (`article_improvement`,
  itens b e h); no cenário amarelo, "instalação de internet" (1.900, fixture) como
  "cabeça mais ampla de um Suporte".
- **Decisão do dono pendente:** a leitura "mesma busca + mesmo volume = um dado só"
  também muda "preço internet residencial" × "preço de internet residencial" (170 ×
  170, no artigo "barata"): entra só uma.
- **Cenários:** `tests/arquiteto-cenarios-ouro-amarelo-2026-10-16.test.mts` ("G: no
  refazedor…", novo; "§15 de ponta a ponta", "'adequado' só com reforço suficiente" e
  "depois do Concluir · D" atualizados); `tests/arquiteto-article-improvement.test.mts`
  ("2026-10-18 · a cabeça do Pilar é a do núcleo do Pilar/Silo…");
  `tests/arquiteto-tres-botoes-dom-2026-10-17.test.mts` ("refazedor · G…": a proposta
  sai do motor e a tela diz "Entram: …").

### 15.11 "Desfazer Silo" desmonta o Silo inteiro, em qualquer estado, e é o mesmo núcleo da exclusão do Minerador (dono, 2026-10-18)

**Decisões do dono, no mesmo dia, nesta ordem.**

1. Pergunta do coordenador: como apagar uma cor inteira cujo Silo já está
   consolidado (azul da WifiConecta, "Wi-Fi e fibra óptica",
   `territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc`, grupo
   `07fec332-4b0a-43cb-af19-cedfd9b24897`, 7 artigos, SiloDNA/SiloPage v2, plano do
   CSV). Escolha literal do dono: **"Manter em duas etapas"** — (1) no Arquiteto, o
   "Desfazer Silo" de sempre aceita o Silo consolidado e o do plano, **Pilar
   incluído**, retirando todos os artigos e desmontando o Silo sem apagar versão;
   (2) no Minerador, o "Excluir tudo da cor" de sempre exclui as keywords.
2. Depois, a decisão que amplia (literal): **"sobre apagar, tem que poder apagar sim
   não interessa qual seja o estado, isso está no contrato global, tudo tem que poder
   ser apagado e claro com instâncias de seleção e confirmação, e alerta falando o
   que está apagando. mas tem que poder apagar tudo sim"** (contrato global:
   `docs/compartilhado/sdd-lifecycle-global-plataforma-2026-08-20.md`, adendo de
   2026-10-18).

**O que vale agora (uma linha, os botões de sempre).**

- **"Desfazer Silo" (aba Silos)** aceita qualquer Silo candidato, confirmado ou
  consolidado. Só não tem o que desfazer o já desfeito, substituído ou arquivado.
  - *Silo sugerido* (sem artigo aprovado, sem par, fora do plano, nada publicado nem
    adiante): o de sempre — território `rejected`, keywords para "sem Silo", uma
    confirmação simples; continua no lote "Desfazer os Silos sugeridos (N)".
  - *Silo inteiro* (consolidado, do plano, com SiloDNA/SiloPage aprovado, com artigo
    aprovado, com algo publicado, com artigo adiante, ou o registro de um Silo
    anterior): um por vez, nunca pelo lote. O mesmo PATCH canônico
    (`/api/arquiteto/workspace`, `territoryUndos`) com `mode: "preview"` devolve a
    prévia (grátis, nada gravado) e, na confirmação, leva o `decisionHash` da prévia e
    o nome do Silo digitado (`typedConfirmationMatches`, a regra da plataforma); exige
    `arquiteto:approve` (rejeitar ArticleDNA é decisão sobre o artefato).
  - O que sai, pelos writers de sempre, nesta ordem: o evento `rejected` na versão
    vigente de cada ArticleDNA do Silo, Pilar incluído, e do SiloDNA e da SiloPage (o
    writer de "Retirar artigo do Silo", id determinístico); o item do artigo no
    Radar/Redator/Publicações passa a `withdrawn` (handler mínimo do Radar,
    `lib/server/radar-item-withdrawal.ts`; a investigação fica); as etiquetas da cor
    dos artigos retirados (`deleteArticleGroupRows`); as keywords editáveis voltam para
    "sem Silo" (a decisão de Silo de sempre); o grupo é desligado
    (`unlinkEditorialGroupSilo`; o plano do cadastro fica no Minerador); o território
    vira `rejected` (a consolidação sai do território e fica registrada nos `reasons`,
    porque o contrato só aceita `consolidation` em consolidated/superseded/archived). O
    grafo de links aprovado deixa de valer junto com o par em que foi feito
    (`findApprovedGraphForSilo`): nada é regravado (as versões do grafo são
    append-only e sem evento de status).
  - **Nada recusa pelo estado** (SUBSTITUI as recusas de 14/10 a 18/10, abaixo): o
    publicado sai de vigência no Arquiteto e a prévia diz que a página no site, a URL,
    o slug e o canonical não mudam (nada é despublicado; excluir a keyword publicada é
    no Minerador, na lixeira de 24 h); o artigo adiante sai com o item retirado da
    operação; o artigo aprovado de outro Silo que usa keyword deste fica como está; a
    keyword fora da etapa do Arquiteto fica como está. Tudo isso vira o **alerta** da
    prévia, por área, com os nomes.
  - A mesa aplica o evento `rejected` também no par (`releaseRejectedSiloPairs`, na
    leitura inteira e na releitura do que mudou): o Silo desfeito sai dos Silos ativos
    e do seletor de links; nada é apagado.
- **"Retirar artigo do Silo"**: as recusas ARTICLE_PUBLISHED e ARTICLE_IN_DOWNSTREAM
  viraram avisos (o item adiante sai da operação na mesma ação). O Pilar continua não
  saindo sozinho ("troque o Pilar antes, ou desfaça o Silo inteiro").
- **Minerador ("Excluir" e "Excluir tudo da cor")** — o MESMO núcleo:
  `planArchitectDismantleForKeywords` / `applyArchitectDismantle`
  (`lib/server/arquiteto-territory-undo.ts`), pela porta
  `lib/minerador/architect-dismantle.ts`. A keyword no ArticleDNA vigente deixa de
  ficar fora: cada artigo vigente que cita uma keyword que sai deixa de valer; o Silo
  dele sai inteiro quando todos os artigos dele (ou o Pilar) saem, ou quando é a cor
  inteira (o Silo ligado ao grupo); senão o artigo sai pela "Retirar artigo do Silo";
  o artigo sem Silo vivo recebe só o evento. A prévia do Minerador mostra isso por
  área (é o alerta) e entra no `decisionHash`; a confirmação forte é a de sempre (a
  cor e "apaga de vez"; a publicada com a marcação e o nome). O desmonte roda ANTES das
  keywords; se não fechar, nenhuma keyword é excluída e o resultado diz o que foi feito
  e o que não foi (`ARCHITECT_DISMANTLE_FAILED`). Só fica fora (`architect_unavailable`)
  quando o desmonte não pôde ser lido ou falta a permissão de aprovar no Arquiteto.

**Recusas SUBSTITUÍDAS (AGENTS.md §0.5).** No "Desfazer Silo": CONSOLIDATED ("Silo
consolidado não se desfaz por aqui"), DECLARED_PLAN_SILO ("Tirar do plano/Substituir o
plano no Minerador"), APPROVED_ARTICLE_DNA ("Desfaça ou refaça o artigo antes"),
APPROVED_SILO_ARTIFACT, PUBLISHED_ADDRESS ("Silo publicado continua ativo"),
EXISTING_SILO, PUBLISHED_KEYWORD, KEYWORD_NOT_EDITABLE (S7 e S12 do registro). No
Minerador: `architect_reference` ("O Arquiteto não exclui keyword (F4): retire o artigo
do Silo lá…") e o D8 "Radar, Redator e Publicações não mudam". Na "Retirar artigo do
Silo": ARTICLE_PUBLISHED e ARTICLE_IN_DOWNSTREAM.

**O que ainda depende do dono (migration).** A keyword com documento no Redator
continua fora: a recusa está no banco (`lifecycle_keyword_deletion_impact` devolve
`mode = 'blocked'` quando há `content_documents` do artigo, e
`lifecycle_delete_minerador_keywords` levanta `LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER`).
O código não muda essa regra sozinho (`AGENTS.md` §15); a migration proposta
(`20261018120000_documento_do_redator_nao_prende_a_keyword`, não escrita) muda só a
classificação do documento para histórico preservado (`behavior = 'preserve'`, sem
`mode = 'blocked'`). O texto do motivo já nomeia a migration.

**Rollback.** Nada novo no banco: eventos de status (append-only), estados de item de
esteira (texto livre), linhas de etiqueta e o `silo_id` do grupo. Reverter o código
volta às recusas; um Silo já desfeito volta por "Recriar o Silo do plano" (S6); o
artigo rejeitado continua no histórico (um novo evento `approved` o reativaria, sem
porta de tela hoje); o item `withdrawn` do Radar fica como histórico (o mesmo artigo
reenviado esbarra na unicidade da esteira — pendência registrada).

**Testes.** `tests/arquiteto-desfazer-silo.test.mts` (domínio: nada recusa pelo estado,
o alerta, o Silo inteiro do azul com Pilar + 6, os eventos determinísticos, o desfecho
da releitura, o par rejeitado fora da mesa); `tests/arquiteto-desfazer-silo-servidor.test.mts`
(o PATCH: prévia sem escrita, confirmação forte, permissão, 9 eventos, keywords,
etiquetas, grupo, território, retomada, Radar retirado, publicado e SiloPage publicada
com o alerta); `tests/arquiteto-desfazer-silo-dom-2026-10-18.test.mts` (o botão de
sempre → prévia → nome digitado → PATCH com a prévia → releitura);
`tests/arquiteto-cenarios-ouro-apagar-tudo-2026-10-18.test.mts` (cenários-ouro: (a) a
cor do plano consolidada numa confirmação só do Minerador, (b) em duas etapas, (c) o
artigo no Radar, (d) a publicada na lixeira de 24 h, e o desmonte que não fecha);
`tests/arquiteto-silo-retirada*.test.mts`, `tests/minerador-excluir-tudo-da-cor-2026-10-14.test.mts`,
`tests/radar-grupos-excluir-tudo-da-cor-dom-2026-10-14.test.mts` (o alerta por área no
diálogo de sempre) e `tests/minerador-exclusao-confirmacao-forte-dom.test.mts`
atualizados para a regra nova.
