## Barra de progresso nos Links internos — 2026-09-30 (noite)

**Verificado no código, confirmado por teste e visto na tela local (carregamento, só leitura).**

- O cartão “Links internos · fase final da passada” dizia só “Há uma operação em curso.”. Agora
  mostra a barra de progresso da plataforma com o nome do que está em curso: “Carregando o grafo
  do Silo”, “Processando links: esqueleto do Silo e âncoras da IA” ou “Salvando e conferindo na
  releitura”. A barra vem com o tempo decorrido e fica pulsando enquanto não há total.
- O componente foi extraído para `modules/arquiteto/operation-progress.tsx` (`OperationProgress`)
  e a “Melhorar publicados” passou a usar o mesmo: um visual só.
- **Testes:** `test:arquiteto` 2703, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas.

## Links internos não decide artigo — 2026-09-30 (noite)

**Verificado no código, confirmado por teste e conferido na tela local (só leitura).**

- Pedido do dono: em Links internos, a linha aberta mostrava o painel antigo (Lógica · SERP · IA
  · Revisão). Ele repetia decisões de composição e de tipo da unidade e tinha um “Fechamento do
  artigo” com conta própria, que acusava “Tipo de unidade: falta decisão humana”.
- Agora, em Links, a linha mostra só o que é de Links: “Hierarquia no Silo” e os links do artigo
  no grafo. Mostra também um aviso (`architect-links-article-readonly`) com o botão “Abrir na aba
  Artigos”. Toda decisão do artigo fica na aba Artigos.
- **Testes:** `test:arquiteto` 2702, sem falhas.

## Tipo da unidade no candidato — 2026-09-30 (noite)

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- No candidato ainda sem ArticleDNA, a revisão cobrava “Registrar decisão” do tipo da unidade. O
  botão devolvia “Gere a definição do artigo antes de classificar o tipo da unidade.”: um beco
  sem saída, porque o tipo mora no ArticleDNA, que só nasce no “Concluir formação”.
- Agora o candidato mostra o tipo como “… · definido ao concluir a formação”, e o controle não
  aparece. Se o tipo ainda for ambíguo depois da conclusão, a decisão aparece no artigo formado,
  onde o botão funciona.
- **Testes:** `test:arquiteto` 2702, sem falhas.

## Silo fechado aparecia duas vezes na aba Silos — 2026-09-30 (noite)

**Verificado no código, confirmado por teste e conferido na tela local (só leitura).**

- “Estruturas existentes · 3” (Captação, Crescimento e Estratégia, com “0 keyword · 0 artigo”)
  não eram Silos a apagar: eram os SiloDNA dos três Silos fechados. Apareciam soltos porque a
  paisagem só ancorava estrutura em território por `existingSiloRef`, e o fechamento grava o
  vínculo em `consolidation.siloId` e em `SiloDNA.territoryRef`.
- `territorial-landscape.ts` passa a ancorar pelas duas fontes, e `territorial-surface.ts` não
  repete a estrutura já ancorada num território.
- Tela conferida: “SILOS · 4”. Leads está Confirmado, e Captação, Crescimento e Estratégia estão
  Consolidados. Nenhuma estrutura solta.
- **Testes:** `test:arquiteto` 2701, sem falhas.

## “Confirmar propostas novas” não desmonta artigo; a aba Silos diz como o Silo fecha — 2026-09-30 (noite)

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- A confirmação na aba Silos foi recusada por inteiro porque a análise propunha mover “como
  atrair clientes pelo whatsapp” de Captação (fechado) para Leads. A mesma proposta também
  deixava “sem Silo” keywords que o dono pôs nos artigos de Leads.
- Agora `sairiaDoSilo` preserva as keywords de ArticleDNA aprovado, de formação concluída ou
  decidida pela pessoa e de Silo fechado. Elas ficam onde estão, com aviso, e o resto do plano
  segue. Isso vale no plano da trava de impacto e nas decisões gravadas.
- A aba Silos mostra “Fechamento dos Silos” (`architect-silo-closure-status-silos`), com o que
  falta e o caminho: aba Artigos → “Concluir formação”.
- **Testes:** `test:arquiteto` 2700 e `test:agent` 65, sem falhas. `tsc` limpo.

## “Concluir formação” fecha tudo o que está selecionado — 2026-09-30 (noite)

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Pedido do dono: não havia botão claro para fechar “como captar um cliente” e “como atrair um
cliente”. O “Manter composição” só libera com motivo digitado, artigo por artigo, e o
“Concluir formação” deveria bastar.

- Antes da portaria, o Concluir levanta nos selecionados o que precisa de decisão: SERP
  divergente esperando decisão, par que disputa o tema (os dois lados na seleção) e fronteira
  contestada. Mostra a lista numa confirmação só (`architect-conclusion-keep-dialog`).
- “Concluir e manter N” grava para cada um a mesma decisão do “Manter composição”:
  `accept_current_composition` pela rota `/api/arquiteto/serp-resolution`, conferida na
  releitura. Depois a conclusão continua sozinha (`keepConfirmed`) e o fechamento do Silo vem
  em seguida.
- A decisão que não voltar na releitura mantém o artigo de fora, com aviso.
- **Testes:** `test:arquiteto` 2699, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas. `tsc` limpo.

## Mesa e aba Silos depois da recuperação — 2026-09-30 (noite)

**Verificado no código, confirmado por teste e conferido na tela local (só leitura). Validado
manualmente pelo dono: não.**

- O dono rodou a recuperação. Releitura: 0 keywords nos duplicados; Captação, Crescimento e
  Estratégia consolidados; Leads e limpeza de pele confirmados; whatsapp → `8bcd8ff3`.
- **Tela conferida:** nos três Silos fechados, todas as linhas mostram Papel no Silo
  (PILAR/SUPORTE), “Consolidado” e “Aprovado”. “leads qualificados” aparece como “Formação
  concluída · Aguardando consolidação do Silo”.
- **Correções:**
  - “Conclusão desatualizada” compara a composição DO ARTIGO (Principal e keywords), não o hash
    do lote inteiro (`readFormationConclusionState.currentComposition`).
  - A linha liga ao ArticleDNA pelo vínculo gravado no marcador (`explicitLinks` em
    `partitionMaterializedArticles`, no mesmo Silo). “marketing digital para dentistas” voltou a
    mostrar o artigo aprovado.
  - Na aba Silos, Silo fechado aparece como “fechado · SiloDNA e SiloPage aprovados” e o Pilar
    vira texto fixo. O painel de contestação usa a mesma lista do fechamento.
  - Silo desfeito nunca é destino da proposta, e o “Confirmar” deixa as keywords dele sem Silo.
- **Testes:** `test:arquiteto` 2698, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas. `tsc` limpo.
- **Falta (dono):** Leads sem Tráfego Pago, com “Manter composição” e “Concluir” em “como captar
  um cliente” e “como atrair um cliente”.

## Silos fechados, e a duplicação que veio depois — 2026-09-30 (noite)

**Verificado no banco (leitura), no código e por teste. Validado manualmente: não.**

- **Fechamento feito:** Crescimento de Clínicas e Estratégia de Negócios às 11:37, Captação de
  Pacientes às 11:56. Cada um tem SiloDNA e SiloPage aprovados v1, e os ArticleDNA dos três
  receberam o `siloId` (sucessoras).
- **Defeito 1 (Reprocessar arquitetura):** às 11:57 a adoção de Silo publicado não reconheceu
  os três Silos consolidados, porque a proposta só conhece candidatos e confirmados. Ela criou
  DUPLICATAS (`d0fa7569`, `c295b112`, `7cde53f0`) e moveu para elas as 19 keywords das páginas
  publicadas. Também recriou como candidatos “botox para o rosto” e “tratamento estético para o
  rosto”, que o dono tinha desfeito. O “Restaurar” da tela é recusado, porque Silo consolidado
  não recebe keyword.
  - Correção: `existingTerritoryForProposedSilo` faz o mesmo endereço ser o mesmo Silo
    (consolidado incluído) e impede recriar um Silo desfeito pela pessoa.
  - Recuperação: `supabase/manual/20260930-recuperar-silos-adalbapro.sql`, a ser executada pelo
    dono. Numa transação com guardas, ela devolve as 19 keywords ao Silo de origem (o mesmo do
    ArticleDNA delas), rejeita as 3 duplicatas (com `supersededByTerritoryRef`) e os 2
    candidatos, e religa o whatsapp ao artigo original.
- **Defeito 2 (Concluir formação):** reconcluir usava o `candidateRef` como identidade e criou
  `article-formation:62ade5c4…` duplicando “como atrair clientes pelo whatsapp” (`8bcd8ff3…`).
  Agora reconcluir sucede o MESMO ArticleDNA, e publicado nunca é reescrito pelo “Concluir”
  (vai pelo “Reforçar publicados”). A duplicata segue no acervo, fora do SiloDNA. Ela não sai
  sozinha: as versões são append-only e não há jornada para aposentar artigo.
- **Papel no Silo:** a coluna aparece em Artigos e em Links, lida do SiloDNA aprovado de todo
  Silo fechado (`siloRoleByArticleId`).
- **Testes:** `test:arquiteto` 2695, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas. `tsc` limpo.

## Correção do dano do Concluir e fechamento sem contagem própria — 2026-09-30 (fim da tarde)

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Homologação: o F5 criou as working copies, mas a consolidação recusou por contestar
“como atrair clientes pelo whatsapp”, um artigo já concluído. O “Concluir formação” seguinte
entregou fragmentos órfãos como candidatos. A leitura remota confirmou o dano no marcador:
- `7e497890` virou “como captar pacientes” em Leads, sem ArticleDNA. O artigo real é o ArticleDNA
  `611c5a96` em Captação, intacto.
- `62ade5c4` (whatsapp) perdeu o vínculo com o ArticleDNA `8bcd8ff3`. A composição é a mesma e o
  ArticleDNA está intacto.

Correções:
- Contestação de artigo já concluído não barra consolidação, leitura nem gatilho
  (`openSiloChallenges`).
- O gatilho depois do “Concluir” usa `closureFormationsForSilo`, a mesma leitura do fechamento, e
  limpa `closureResumptionAttempted` para a retomada tentar de novo.
- Fragmento órfão não entra no “Concluir formação”. Isso evita o dano acima, a SERP repetida e o
  “ficou de fora” duplicado.
- Publicado protegido (`PUBLISHED_COLLISION`) não aparece como “ficou de fora” nem como bloqueio.
- Reconcluir preserva o `materializedArticleId` anterior.
- `closureFormationsForSilo` religa a formação sem vínculo ao ArticleDNA aprovado da mesma
  Principal no Silo. Nunca materializa um segundo artigo (isso resolve o whatsapp sem escrita).
- **Reparo autorizado pelo dono e feito (2026-09-30):** a entrada `7e497890` do marcador foi restaurada a partir do ArticleDNA `611c5a96` (Captação, 3 keywords, slug `como-atrair-clientes-para-consultorio`), e o `62ade5c4` foi religado ao ArticleDNA `8bcd8ff3`. A gravação usou a rota do marcador e foi conferida na releitura: 22 entradas, nenhuma outra alterada.
- Testes: `test:arquiteto` 2692, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas. `tsc` limpo.

## Fechamento dos Silos destravado sem mexer em artigo — 2026-09-30 (tarde)

**Verificado no código, confirmado por teste e por leitura do estado real (diagnóstico só de
leitura). Validado manualmente: não.**

O dono não quer tirar keyword de nenhum artigo. A leitura real do fechamento mostrou que os
artigos aprovados estavam íntegros e que o impasse vinha de quatro defeitos, nenhum editorial:

1. **Ponteiro órfão.** Cinco keywords que saíram de artigos ou mudaram de Silo guardavam o
   ponteiro de uma formação concluída em outro Silo: “seo para google meu negócio”, “marketing
   para clinica”, “marketing para clinicas”, “como atrair pacientes” e “como captar pacientes”.
   A mesa montava fragmentos que nunca podiam ser concluídos (`FORMATIONS_PENDING` eterno).
   `closureFormationsForSilo` não os conta como ativos.
2. **Publicado aprovado sem “Concluir formação”.** “como captar clientes para clínica de
   estética” ganhou o ArticleDNA pelo “Reforçar publicados”. Agora entra no fechamento pelo
   próprio ArticleDNA, com a composição e os papéis dele, sem reescrever.
3. **Pilar pelo ref da formação.** O fechamento gravava `article-formation:…` como Pilar. O
   Pilar agora é o `articleId` do ArticleDNA (`pilarArticleId`).
4. **Contestação da marca inteira na consolidação.** `consolidateSilos` recusava todos os Silos
   por uma contestação em Leads. Agora só contam as contestações dos Silos em consolidação.

- **Manter composição:** a decisão humana que já era gravada (aceitar a composição atual, com
  o hash, e releitura) passa a resolver também o par que disputa o tema, quando os dois lados
  forem mantidos ou a SERP separar os dois (`KEEP_SEPARATE`), e a fronteira contestada do
  artigo mantido. A revisão lista o que “Manter” decide antes do clique
  (`architect-serp-keep-also-decides`).
- **Continuação do Concluir:** a continuação depois da SERP relê a seleção da mesa. Antes, ela
  parava em “aguarda a releitura” para sempre.
- **Estado observado (leitura remota):** Crescimento, Estratégia e Captação ficaram prontos
  para fechar sem criar artigo (Pilares: “harmonização fácial preço”, “plano de marketing” e
  “como atrair pacientes para consultório odontológico”, pela cobertura). A tela do dono já
  gravou as 3 working copies do Silo com Pilar e Suportes. SiloDNA e SiloPage ainda não foram
  gravados, porque o defeito 4 recusou. Leads espera “Manter composição” e “Concluir” nos três
  candidatos.
- **Testes:** `test:arquiteto` 2690, `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65,
  todos sem falhas. `tsc` limpo.

## Fechamento dos Silos: o que barra é do próprio Silo; tirar candidato do Silo — 2026-09-30

**Verificado no código e confirmado por teste. Validado manualmente: não.**

A aba Links internos dizia “Nenhum par SiloDNA + SiloPage disponível”, e “Papel no Silo”
estava vazio. A leitura remota (só leitura) mostrou 21 formações concluídas e 22 ArticleDNA,
mas 0 SiloDNA e 0 SiloPage. Estratégia de Negócios, Crescimento de Clínicas e Captação de
Pacientes estavam com todas as formações concluídas e materializadas, e mesmo assim nenhum
fechou.

- **Causa:** o fechamento de cada Silo recebia os pares de canibalização e as contestações de
  fronteira da marca inteira. O par “como captar um cliente” × “como atrair um cliente” (Leads
  sem Tráfego Pago) barrava os quatro Silos.
- **Correção:** `closureGuardsForSilo` (`lib/arquiteto/silo-closure-readiness.ts`) passa só o
  que é do Silo. Um par cujos dois lados já foram concluídos não barra mais. Vale nos dois
  pontos: a retomada automática e o gatilho depois de “Concluir formação”.
- **Leitura única:** `siloClosureReadings` (memo) é a leitura de onde a retomada e a tela leem.
  Links internos ganhou “Fechamento dos Silos” (`describeSiloClosureReading`), que diz por Silo
  se ele fechou, se fecha sozinho ou o que falta.
- **Pilar e Suportes:** nascem no fechamento (cobertura de buscas; empate pelo volume da
  Principal), como já era a regra. Estavam vazios porque o fechamento nunca aconteceu.
- **Tirar este artigo do Silo:** fica na revisão do candidato. As keywords voltam para “sem
  Silo” pela decisão de Silo que já existe (`applySiloDecisionsInBatch`, alvo `unassigned`),
  com confirmação e releitura. Nada é apagado e não há contrato novo. Só vale para candidato
  não concluído e não publicado. É a saída para os três candidatos de Leads que o dono não vai
  usar.
- **Atenção:** a retomada automática grava SiloDNA e SiloPage no banco ao abrir o Arquiteto
  (regra que já existia, sem botão). Com esta correção, os três Silos completos devem fechar na
  próxima abertura.
- **Testes:** 4 novos em `tests/arquiteto-retomada-fechamento.test.mts`. `test:arquiteto` 2685,
  `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65, todos sem falhas. `tsc` limpo.

## Concluir formação conclui os prontos, pede a SERP que falta; Descartar sobras — 2026-09-30

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Pedido do dono: “Concluir formação” não concluía nada. A portaria olhava o lote inteiro, e um
único artigo com pendência barrava os outros. As pendências eram: três candidatos novos em
Leads sem Tráfego Pago (o par “como captar um cliente” × “como atrair um cliente” e um artigo
acima do teto) e três publicados sem as 4 lentes.

- **SERP ao concluir:** o clique pede a SERP dos selecionados sem parecer vigente pelo mesmo
  caminho do Processar (`confirmSerpValidation`): cache primeiro, e só as lentes que faltam
  entram no plano de pagamento, com a escolha da pessoa. Depois do render com os pareceres, a
  conclusão continua sozinha (`pendingHumanConclusion`), uma vez por clique.
- **Os prontos seguem:** `readyConclusionSubset` (`lib/arquiteto/article-formation-confirmation.ts`)
  atribui cada impedimento ao artigo que o carrega. Os motivos são: teto, SERP faltando, decisão
  da SERP, os dois lados do par, duplicidade, Silo cruzado, Principal e Assunto sem Volume. Esses
  artigos ficam de fora e continuam candidatos. O resto passa pela MESMA portaria, relida sobre
  ele. A notificação nomeia quem ficou de fora e o motivo. Só vale no clique humano; a conclusão
  automática do Assunto mantém a regra dela.
- **Descartar sobras:** o botão no painel Sobras tira as oportunidades da tela. É preferência de
  navegador, por Marca. Nenhuma keyword é apagada nem movida: elas seguem em Keywords não
  agrupadas. Uma sobra nova traz o painel de volta, e “Mostrar de novo” desfaz.
- **Silos novos que não serão usados:** saem pelo botão que já existia, “Desfazer os Silos
  sugeridos”, na aba Silos. O Silo fica guardado como rejeitado e as keywords voltam para “sem
  Silo”.
- **Testes:** 4 novos em `tests/arquiteto-candidatos-guards.test.mts`. 4 estruturais foram
  ajustados à regra nova (concluir agora pede a SERP que falta). Suítes: `test:arquiteto` 2681,
  `:dom` 17, `:servidor` 98, `:lentes` 69 e `test:agent` 65, todas sem falhas. `tsc` limpo.
- **Não verificado:** o clique real. Ele grava no banco de produção e é da homologação do dono.

## “Como captar clientes para clínica de estética”: o Google diz que é outro assunto — 2026-09-30

Leitura remota, só diagnóstico: a página ganhou volume 10 e, com ele, a SERP própria. No parecer
da composição, a página × “como captar clientes / um cliente / novos clientes” ficou baixa ou
nenhuma nas 4 lentes. Já as três genéricas formam um grupo forte entre si. Pela hierarquia (SERP
acima da lógica e da IA), elas não reforçam a página: são o artigo novo “como captar um cliente”
das Sobras. A recusa estava certa; o texto é que dizia só “incompleta ou diverge”. Agora a linha
diz que o Google trata essas keywords como outro assunto e aponta as Sobras (teste no servidor).

## Ajustes após a homologação: captar, busca local e artigos aprovados fora do Silo — 2026-09-30

**Verificado no código e confirmado por teste. Validado manualmente: não.** Leitura remota
somente para diagnóstico; nada foi escrito.

- **Captar:** a IA escolheu “como captar um cliente” e “como captar mais clientes”, e o Google
  separou as duas. A composição menor não rodava, porque a âncora era a própria página (sem volume
  e sem SERP). Agora a âncora é a entrada de maior volume. A IA também passa a ser completada pela
  leitura da lista (“como captar clientes”, 390). A leitura da lista exige a palavra de ação do slug
  escrita na keyword.
- **Busca local:** “agência de marketing em são paulo” entrou em “agência de marketing para
  clínica de estética”. `localSearchOf` recusa cidade, zona ou “perto de mim” que não esteja no
  alvo. A que já foi gravada continua no artigo, até revisão humana.
- **5 ArticleDNAs fora do cenário:** um lote de “Decisão humana de silo na aba Silos” (05:23 e
  01:32 de 2026-09-30) levou 14 membros aprovados de “Crescimento de Clínicas” para “Leads sem
  Tráfego Pago”. As melhorias gravadas depois carregaram esses membros deslocados. Agora
  `applySiloDecisionsInBatch` calcula o impacto nos aprovados e recusa a keyword que quebraria um
  artigo aprovado; devolver continua permitido. O estado atual se conserta com “Restaurar”, na aba
  Silos.
- Testes: `arquiteto-melhoria-leitura-ia` (completar, busca local), servidor (âncora),
  `arquiteto-restaurar-working-copy` (lote de Silo).

## Leitura da lista pelo código, par pelo verbo do slug e composição menor — 2026-09-30

```text
ORIGEM = dono, 3 publicados ainda sem melhoria (captar × atrair clínica de estética; campanhas … sem anúncios) · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · LEITURA_REMOTA = diagnóstico somente leitura da execução · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Diagnóstico (leitura da última execução no banco):
- a IA deu “como captar clientes” e “como captar um cliente” (390) aos dois publicados, captar e
  atrair; a trava de canibalização barrou os dois. “Como atrair clientes / o cliente / os
  clientes / um cliente” (720 cada) estavam livres na lista, e a IA não as escolheu;
- “campanhas … sem anúncios”: a composição “campanhas de marketing” + “melhores / três /
  digital de sucesso” teve parecer DIVERGENCE: os pares ficaram “nenhuma” ou “baixa” em
  quase todas as lentes.

Mudanças:
- **Leitura da lista pelo código (`list_core`, “Lista · núcleo do slug”)** — em
  `planArticleImprovements`, depois da IA e da trava. Quem ficou sem proposta pronta recebe até 3
  keywords livres, com volume, que são o núcleo do slug (com sinônimos), sem outro ângulo, e que
  levam uma palavra literal do slug (`slugCoreListPicks`). O passo 1 do prepare roda com
  `listReading: false`, para a IA continuar lendo primeiro.
- **Par pelo verbo do slug (`ownSlugWordsDiffer`)** — a trava agora é `guardCannibalPairs`. Dois
  publicados que disputam o mesmo assunto passam quando cada lado que muda recebe só keywords com a
  palavra própria do seu slug e sem o verbo do outro. Dar “captar” à página de “atrair” continua
  barrado.
- **Composição menor** — quando o parecer da composição diverge, o servidor refaz a composição uma
  vez, pelo cache e sem custo, só com a principal e as keywords com par forte ou parcial em 2 ou
  mais lentes (`serpSupportedMembers`). A linha diz quem saiu.
- A origem `list_core` passa pelas mesmas travas da IA no servidor (`isListReading`): o parecer da
  composição é obrigatório, e sem lente o passo 2 é obrigatório.
- **Sobras** — a caixinha guardava as marcadas do primeiro render, então keyword que entrava no grupo
  depois aparecia desmarcada. Agora guarda só as desmarcadas pela pessoa.
- Catálogo MCP, InfoHint “Como funciona” e ajuda do Arquiteto atualizados.
- Testes: caso real captar × atrair e `serpSupportedMembers` em
  `tests/arquiteto-melhoria-leitura-ia.test.mts`; composição menor em
  `tests/arquiteto-article-improvement-server.test.mts`.

## Divergência de SERP explicada e Ajuda do Arquiteto — 2026-09-30

```text
ORIGEM = dono, "vai ter muitos user inexperientes em SEO mexendo" · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- **Alerta da divergência de SERP:** cada divergência ganhou `plain`
  (`plainSerpDivergence` em `lib/arquiteto/serp-formation-verdict.ts`, campo
  opcional e aditivo). O cartão da aba SERP abre com o aviso “Atenção: …”, que diz
  o que houve (páginas diferentes no Google, sinais mistos, canibalização ou
  principal melhor), por que importa, o que fazem “Manter no artigo” e “Aplicar
  recomendação” e como decidir na dúvida. Os dados técnicos ficam abaixo, como
  antes. A pendência na Revisão do artigo usa o mesmo texto.
- **A divergência se resolve no painel da aba Artigos:** o painel da formação
  (`article-formation-review.tsx`) substituiu as abas do artigo, e o botão “Abrir
  a divergência na aba SERP” só existia na aba Links internos. Em “Decisões
  pendentes”, a divergência agora mostra o aviso e os botões “Manter no artigo” e
  “Aplicar recomendação”, que chamam o mesmo `handleSerpRecommendationDecision`
  de antes. As outras pendências ganharam a linha “Por quê”. Campos novos da prop
  `pendingDecisions` (`why`, `serpDivergence`) são opcionais.
- **Limitação já existente, não mudada:** a decisão da divergência é gravada por
  `persistSerpState` → `writeBrowserArtifact` (neste navegador), não no banco. Em
  outro navegador a pendência volta. Na fase 1 ela não bloqueia “Concluir
  formação” (`PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION = false`).
- **Ajuda desta área (Arquiteto):** `modules/arquiteto/context-help.ts`,
  registrado em `lib/context-help-registry.ts`. Os tópicos cobrem conceitos
  (Silo, principal, Travado/Livre, Assunto, volume, mesmo assunto no Google,
  custos), a jornada de melhoria (Próximo passo, 1/2/3, IA, canibalização, Sobras,
  keywords sem artigo, Processar artigos, Detalhes técnicos), Silos, a Revisão
  (divergência, parecer, KGR, tipo, IA, estados) e as etapas finais. Antes a área
  mostrava “Ajuda desta área ainda não disponível.”
- Consumidores preservados: `article-review-checklist` (texto das pendências
  mais rico, mesmo formato) e a aba SERP do artigo.
- Testes: `tests/arquiteto-serp-human-verdict.test.mts` (alerta) e
  `tests/context-help.test.mts` (catálogo do Arquiteto).

## Melhorar publicados: aproveitar melhor a lista — 2026-09-30

```text
ORIGEM = dono, "acertar o melhor aproveitamento das listas de keywords" · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- **Secundárias da lista aceitas pela IA:** as regras de principal (entidade do
  slug, núcleo, intenção conclusiva) saíram da barreira das secundárias e ficaram
  em `editorialAiPrincipalBlock`. A secundária passa quando leva o núcleo inteiro
  (com os sinônimos atrair/conquistar/conseguir/ganhar → captar, paciente → cliente)
  ou uma palavra do assunto além do público. Continuam barradas: sem volume,
  publicada, de outro dono, cabeça genérica e restrição editorial.
- **A IA lê primeiro os artigos com menos keywords**, até 12 por rodada.
- **Publicados canibalizados que recebem keywords próprias:** quando dois
  publicados disputam o mesmo assunto ("como captar clientes…" × "como atrair
  pacientes…"), os dois deixam de ser barrados se cada um receber da lista uma
  principal própria. A principal não pode ser sinônimo da outra (mesmas palavras
  depois dos sinônimos), e os dois não podem ter keyword em comum. Cada um grava a
  exclusão recíproca ("não cobrir …"). Trocar só o sinônimo continua barrado.
- Testes: `tests/arquiteto-article-improvement.test.mts` (caso real captar ×
  atrair) e `tests/arquiteto-melhoria-leitura-ia.test.mts` (secundárias do caso
  real). Suítes: test:arquiteto 2670, servidor 98, lentes 66, dom 17, agent 58,
  tsc limpo.

## Melhorar publicados: leitura da IA — correções da revisão (corretor) — 2026-09-30

```text
ORIGEM = duas revisões da entrega logo abaixo · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 (IA e Google Ads simulados) · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

Corrigido:

- **Uma escolha malformada não derruba a leitura:** a camada de IA confere só o
  envelope `{ picks: [...] }` (`ImprovementAiResponseSchema` deixou de ser
  estrito por item); `validateImprovementAiPicks` confere cada escolha
  sozinha. Papel com acento ("Secundária") é normalizado; motivo acima de 240
  caracteres é encurtado; papel inexistente, motivo vazio ou item sem campos é
  recusado ("fora do formato") e as boas seguem.
- **Tamanho da chamada:** até 12 alvos por chamada (era 30) e teto de saída de
  2.000 tokens (era 3.000); motivo de até 12 palavras. Com 30 alvos a resposta
  passava do teto e saía truncada. Quem passar de 12 fica com as regras e a
  busca gratuita, com um aviso.
- **Prazo da requisição:** depois de 90 s desde o início do prepare (ou do
  passo do collect), nenhuma composição nova começa a ser conferida; a que
  sobra vira "Precisa validar no Google (passo 2)" com o motivo "Faltou tempo
  nesta etapa…" (nada pago, nada gravado). Os pares da SERP são conferidos
  antes das composições da IA, e os pareceres são lidos uma vez só (antes, uma
  leitura completa por composição).
- **MCP e tela avisam que o prepare usa a IA:** descrição e
  `human_confirmation_required` de `improve_articles`
  (`lib/server/platform-mcp-tools.ts`), requisito e passo do playbook no
  catálogo, frase do cartão ("O Google Ads é grátis; a leitura da IA usa a
  Connection DeepSeek da marca.") e "Como funciona". O rótulo do botão
  "1 · Buscar keywords (grátis)" ficou (testes e catálogo o citam).
- **Principal mais ampla que o slug no caminho da IA:** a linha escreve o
  mesmo aviso do caminho da SERP (`broaderPrincipalReason`). No caso real,
  "como atrair clientes" (720) para "como atrair clientes para consultório".
- **Assunto sem papel "principal" da IA:** vence a escolha que leva o núcleo
  do assunto, com mais volume e menos palavras ("como atrair clientes" antes de
  "como atrair os clientes"); empate, a ordem da IA.
- **Núcleo do assunto exige as duas palavras** (`every`, era `some`):
  "plano de saúde para clínica" não passa para um checklist de plano de
  marketing. Sinônimos atrair/captar e paciente/cliente continuam.
- **Recusas visíveis:** a recusa guarda o texto da keyword e do alvo; o painel
  mostra "Sugestões da IA recusadas pelas regras (N)" recolhido, com keyword →
  alvo → motivo. O aviso lista todas as barreiras.
- **Origem por linha:** "Origem: Pares da SERP", "SERP da candidata", "Leitura
  da IA — confira" ou "Busca nova no Google Ads".
- **Sugestão da IA derrubada pela SERP:** a linha ganha "A IA sugeriu esta
  composição, mas a SERP dela não confirmou: nada entra." e, na lista "sem
  melhoria possível", o rótulo e o motivo da IA continuam à vista.
- **Falha da IA como texto fixo:** `editorialAi.message` é "A IA excedeu o
  tempo limite.", "A resposta da IA veio fora do formato.", "A Connection
  DeepSeek da marca não está disponível." ou "A IA está indisponível." — nunca
  a mensagem crua do provider.
- **Texto do relatório anterior:** a linha "precisa validar" tem a caixa
  DESABILITADA (não "sem caixa"); corrigido abaixo e no comentário do painel.

Registrado (não revertido):

- **`broaderCore` no passo 1 (pares da SERP):** no working tree,
  `planArticleImprovements` aceita pelo caminho da SERP a candidata sem ajuste
  editorial quando o publicado é Livre, sem volume e ela leva o núcleo do slug
  (`carriesSlugCore`; cabeça de 2 palavras acima de 5.000 fica fora), e o
  fallback também. Essa regra não é da leitura da IA: vem de outra decisão do
  dono do mesmo dia (principal mais ampla), já está coberta por
  `tests/arquiteto-article-improvement.test.mts` ("decisão 2026-09-30…") e não
  tinha registro. A frase "o caminho da SERP não mudou", na seção abaixo, vale
  só para a leitura da IA.

Limitações:

- Alvo que a SERP deixa pronto e o parecer da composição rebaixa no
  `refreshPlan` fica sem leitura da IA nesta execução (os alvos da IA saem do
  primeiro plano). Registrado no backlog.
- A busca gratuita checa o orçamento entre alvos: um pedido ao Google Ads em
  andamento pode passar alguns segundos do orçamento. O prazo de 90 s das
  composições absorve isso, mas o tempo real não foi medido.
- Composição adiada por prazo com todas as lentes já no cache fica com custo 0:
  não há passo 2 pago para ela; "Buscar de novo" refaz a preparação (e a
  leitura da IA).

Arquivos: `lib/arquiteto/article-improvement-ai.ts`,
`lib/arquiteto/article-improvement.ts`, `lib/arquiteto/article-improvement-next-step.ts`,
`lib/server/arquiteto-article-improvement.ts`,
`lib/server/arquiteto-differentiation-runtime.ts`,
`lib/server/platform-mcp-tools.ts` (só textos da ferramenta; contrato igual),
`lib/agent/platform-catalog.ts`, `modules/arquiteto/article-improvement-panel.tsx`,
SDD (adendo). Consumidores preservados: rota e ferramenta MCP com o mesmo
schema de pedido; execuções antigas sem `keyword`/`theme` nas recusas
continuam legíveis (a tela cai para o id).

Testes: `tests/arquiteto-melhoria-leitura-ia.test.mts` (+3 e 2 ajustados:
escolha malformada, núcleo com palavra ambígua, limite de 12 alvos; Assunto
sem papel; aviso de principal mais ampla; nicho com núcleo inteiro),
`tests/arquiteto-article-improvement-server.test.mts` (+3: prazo da etapa,
falha como texto fixo, escolha malformada no prepare),
`tests/arquiteto-article-improvement-dom.test.mts` (+1: origem, recusas,
sugestão derrubada). Suítes: `test:arquiteto` 2666/2666,
`test:arquiteto:servidor` 98/98, `test:arquiteto:lentes` 65/65,
`test:arquiteto:dom` 16/16, `test:agent` 58/58, `tsc --noEmit` e eslint
dos tocados limpos, `git diff --check` limpo.

## Melhorar publicados: leitura editorial da IA na lista existente — 2026-09-30

```text
DECISÃO = dono, 2026-09-30, "Sim, lista primeiro" · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 (IA e Google Ads simulados) · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**
Adendo na SDD: `docs/04-arquiteto/sdd-melhoria-artigos-assuntos-2026-09-29.md`.

- **Ordem do prepare:** 1 pares da SERP no cache (regra anterior) → 2 leitura
  editorial da IA na lista existente, só para quem ficou sem proposta pronta →
  3 busca nova no Google Ads (`discover`) só para quem ainda ficou sem nada. O
  tempo da IA sai do orçamento da busca gratuita (até 60 s somados a partir do
  início do prepare; a busca nunca fica com menos de 5 s nem mais de 35 s).
- **A chamada:** uma só, em lote, pela Connection DeepSeek canônica da marca
  (`proposeArticleImprovementAiPicks` em
  `lib/server/arquiteto-differentiation-runtime.ts` → `generateStructuredAI`,
  sem Thinking, limite de 40 s, até 12 alvos — eram 30 antes da revisão — e 200 keywords). O pedido usa
  apelidos curtos (A1, K1) que o código traduz de volta; a IA nunca vê os ids
  reais. A resposta fica em `run.editorialAi` e é reaproveitada no `collect`;
  a IA não é chamada de novo na mesma execução nem no `apply`.
- **A lista:** keywords da marca já no Arquiteto, com volume do Google Ads
  validado, sem publicação, sem dono (ArticleDNA aprovado ou formação decidida)
  e fora das propostas prontas. Ideia nova do Google Ads nunca entra.
- **A IA tem a menor autoridade** (`editorialAiBarrier`,
  `editorialAiPrincipalBlock` e `validateImprovementAiPicks`): apelido fora do
  pedido é id inventado; até 3 por alvo e 6 por artigo; uma keyword vai para um
  alvo só (`allocateReinforcementChoices` com a preferência da IA como score);
  barreiras: publicada, sem volume validado, de outro artigo, já no artigo,
  contradiz o slug, restrição "sem tráfego pago/sem anúncios", DNA com público
  ou intenção conclusiva divergente, cabeça genérica de até 2 palavras acima de
  5.000, outro nicho ("para …") e ausência do núcleo do assunto. Principal nova
  só com Posto Livre, principal atual sem volume, página que não ranqueia
  (leitura do cache; sem leitura, fica) e candidata com o núcleo do slug; senão
  entra como secundária, com o motivo. A proposta pronta da SERP vence.
- **Na tela:** `evidenceBasis = "editorial_ai"`; o motivo de cada keyword
  aparece na linha sob "Leitura da IA — confira". Sem as quatro lentes da
  composição no cache, a linha fica "Precisa validar no Google (passo 2)"
  (`needsValidation`, caixa desabilitada) e a composição entra no plano pago do
  passo 2; depois da validação volta a "Pronto para aplicar".
- **Gravar:** igual a antes — o parecer da SERP da composição final sai do
  cache (`cacheOnly`) no `refreshPlan` e no `apply`; nada é gravado sem o
  clique do dono.
- **Falhas:** IA desligada (runtime sem IA), erro, resposta fora do contrato ou
  tempo esgotado geram um aviso único e a jornada segue pelas regras.
- **Catálogo MCP** (`lib/agent/platform-catalog.ts`): nota da operação
  `arquiteto.article_improvement` e passo no playbook
  `reforcar_publicado_pela_serp`.

Arquivos: `lib/arquiteto/article-improvement.ts` (aditivo: tipos, barreiras,
passo da IA no plano; `slugWords` exportado), `lib/arquiteto/article-improvement-ai.ts`
(novo), `lib/server/arquiteto-article-improvement.ts`,
`lib/server/arquiteto-differentiation-runtime.ts` (função nova; a dos ângulos
não mudou), `modules/arquiteto/article-improvement-panel.tsx`,
`lib/agent/platform-catalog.ts`, `package.json` (teste novo no
`test:arquiteto`). Consumidores preservados: a rota
`/api/arquiteto/article-improvement` e a ferramenta MCP `improve_articles`
usam `improvementRuntime`, que agora injeta a IA; execuções antigas sem
`editorialAi` continuam legíveis; o caminho da SERP não mudou por esta entrega (a regra `broaderCore` do passo 1 é de outra decisão do dia; ver a seção de correções acima).

Testes: `tests/arquiteto-melhoria-leitura-ia.test.mts` (novo, 10: casos bons e
ruins reais da AdalbaPro, ids inventados e apelidos, barreiras, Posto e
ranqueamento, alocação, ordem SERP → IA, pedido em lote);
`tests/arquiteto-article-improvement-server.test.mts` (+5: proposta pronta
`editorial_ai` e gravação sem custo, recusa de id inventado, falha sem derrubar
e ordem lista → busca nova, tempo esgotado, "precisa validar" e collect sem
nova chamada à IA); `tests/arquiteto-article-improvement-dom.test.mts` (+1).
Suítes: `test:arquiteto` 2663/2663, `test:arquiteto:servidor` 98/98,
`test:arquiteto:lentes` 62/62, `test:arquiteto:dom` 15/15, `test:agent`
58/58, `tsc --noEmit` e eslint dos tocados limpos, `git diff --check` limpo.

Limitações: a qualidade da leitura depende da resposta real da DeepSeek, que
não foi chamada no desenvolvimento; o tempo real da chamada com a lista da
AdalbaPro (~87 keywords) não foi medido.

## Desfazer Silo e aba Artigos: correções da revisão (corretor) — 2026-09-30

```text
ORIGEM = duas revisões da entrega logo abaixo · MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.** Esta
seção corrige a de baixo onde as duas divergem.

- **Cartão "Próximo passo" nunca manda para um lugar vazio.** O painel recebe
  `hasLeftovers` (a mesma condição com que `LeftoverOpportunitiesPanel` aparece).
  Com Sobras: "Nada a fazer nos publicados agora. Veja artigos novos em Sobras."
  ("Ver Sobras"). Sem Sobras: "Nada a fazer nos publicados nem nas Sobras agora.
  Para formar artigos novos, use “Processar artigos” logo abaixo." ("Ir para
  Artigos novos", que rola até a barra `#architect-articles-new`).
- **Linhas prontas desmarcadas** não caem mais em "nada a fazer": estado novo
  `select` ("N melhoria(s) pronta(s). Marque na tabela abaixo as que quer
  gravar."), botão desabilitado com o motivo.
- **Execução em andamento no servidor** (lease): o botão diz "Ver andamento" (só
  lê o estado); "Continuar" ficou só para o que retoma trabalho.
- **Números só no cartão:** na fileira do painel os outros atos aparecem sem
  número; com a validação pendente, gravar direto aparece como "Gravar sem
  validar (N)". O parágrafo dos três passos foi para "Como funciona" (fechado);
  fica uma linha: "URL, slug e canonical nunca mudam."
- **Desfazer Silo:** a confirmação diz "O Silo sai da aba Silos (fica guardado
  como rejeitado; nada é apagado). As keywords dele voltam para “sem Silo” e
  continuam na mesa."; o diálogo fica aberto durante o lote com "Desfazendo i de
  N…" (`role=status`) e só fecha depois da releitura; Esc fecha (fora do
  andamento) e o foco abre no "Cancelar". Pela metade sem keyword restante, a
  frase diz "as keywords já saíram do Silo; falta marcar o Silo como desfeito.
  Tente de novo." (antes: "0 keyword(s) ainda no Silo").
- **Servidor do desfazer lê o envelope legado:** ArticleDNA aprovado e
  SiloDNA/SiloPage são lidos no corpo plano (`payload.x`) e no envelope
  (`payload.payload.x`), como `global-workflow-canonical.ts`. Os SiloDNA/SiloPage
  da marca são lidos em páginas e filtrados pelo território depois (o filtro no
  banco por `payload->>territoryRef` não enxergava o envelope).
- **Mudanças do painel que a seção de baixo não registrava** (presentes na cópia
  de trabalho; agora registradas e testadas): resposta que não é JSON (tempo
  esgotado da plataforma) vira `TEMPO_ESGOTADO` e, durante a validação, o painel
  consulta o andamento e continua sozinho (até 3 vezes seguidas); a tabela mostra
  só as linhas que podem mudar (ou já têm resultado) e as demais ficam num
  `<details>` fechado "N sem melhoria possível agora"; a confirmação abre logo
  abaixo dos botões, com rolagem até ela.
- **Não mudou:** o tempo esgotado no PRIMEIRO passo de uma ação continua
  mostrando o aviso "toque de novo no mesmo botão" (o andamento está salvo).
- Arquivos: `lib/arquiteto/article-improvement-next-step.ts`,
  `modules/arquiteto/article-improvement-panel.tsx`,
  `modules/arquiteto/arquiteto-workspace.tsx`, `lib/server/arquiteto-territory-undo.ts`,
  `lib/agent/platform-catalog.ts` (textos de tela), testes
  `tests/arquiteto-artigos-simples.test.mts`, `tests/arquiteto-article-improvement-dom.test.mts`,
  `tests/arquiteto-desfazer-silo.test.mts`, `tests/arquiteto-desfazer-silo-servidor.test.mts`
  (recusa `KEYWORD_NOT_EDITABLE` sem escrita; envelope legado de ArticleDNA e de
  SiloDNA recusa; SiloDNA de outro território não).
- Suítes: `test:arquiteto` 2652/2652, `test:arquiteto:servidor` 98/98,
  `test:arquiteto:lentes` 57/57, `test:arquiteto:dom` 14/14, `test:agent` 58/58,
  `test:arquiteto-backup-roundtrip` 8/8, `test:editorial` 170/174 (as 4 falhas
  antigas), `tsc` 0 erros, ESLint limpo nos tocados (`arquiteto-workspace.tsx`
  com os mesmos 41 erros e 77 avisos antigos), `git diff --check` limpo.

## Desfazer Silo sugerido e aba Artigos simples — 2026-09-30

```text
PEDIDO = dono ("quero ativos só os silos publicados; tem que ter uma forma de desfazer os silos novos sugeridos" · "esse painel é muito confuso")
MODULO_PROPRIETARIO = Arquiteto · MINERADOR = não tocado
CONTRATO = aditivo no PATCH /api/arquiteto/workspace (territoryUndos: ref + lock) · sem coluna, sem migration
MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 (TerritoryCandidate inalterado) · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste (domínio, rota com banco simulado, tela renderizada do painel). Validado manualmente: não.**

### A · Desfazer Silo sugerido (aba Silos)

- **Botão "Desfazer Silo"** na linha de cada Silo candidato/confirmado SEM
  endereço publicado (sem `publishedSlug`/`publishedCanonical`, sem proteção
  de publicado, sem página do site). Silo publicado não mostra o botão.
- **Confirmação** diz o que acontece antes de qualquer escrita: "O Silo passa a
  rejeitado. Nada é apagado. As keywords voltam para “sem Silo” e continuam na
  mesa", com o número de keywords de cada Silo; Silo com motivo de recusa
  aparece com o motivo e fica fora do botão.
- **Lote:** "Desfazer os Silos sugeridos (N)" no título da seção Silos, com uma
  confirmação só; um Silo por requisição (lock de cada um) e UMA releitura no
  fim.
- **Servidor (autoridade):** `territoryUndos` no PATCH canônico do workspace. O
  plano (`lib/server/arquiteto-territory-undo.ts`) lê do banco, filtrado pela
  marca, o território, as keywords que apontam para ele, os ArticleDNA
  aprovados e os SiloDNA/SiloPage do território, e recusa (409, motivo por
  extenso) ANTES da primeira escrita: endereço publicado, consolidado ou com
  `existingSiloRef`, SiloDNA/SiloPage aprovado ou SiloPage publicada, ArticleDNA
  aprovado com keyword do Silo (ou que declara o território), keyword publicada
  no Silo, keyword fora da etapa, lock vencido, Silo já desfeito.
- **Gravação:** cada keyword volta para "sem Silo" pelo MESMO writer da decisão
  de Silo (`payload.territoryRef = null` + `territoryAssignment` humano
  `unassigned`, fábrica única `humanSiloDecision`), com o lock dela; por último
  o território vai para `rejected`/`rejected` pelo writer territorial, com o
  lock dele. Ator (`updated_by`) e hora são do servidor; o motivo com o ator
  fica nos `reasons` do Silo. Nenhuma linha é apagada.
- **Releitura:** sucesso só para o Silo que voltou `rejected` e sem nenhuma
  keyword apontando para ele (`resolveTerritoryUndoOutcome`); pela metade diz
  quantas ficaram e o Silo continua na tela para tentar de novo.
- **Trava nova:** a edição genérica (`territoryUpdates`) não rejeita Silo; ela
  manda usar "Desfazer Silo".
- **Mesa e contagens:** Silo `rejected` sem keyword some da mesa e da contagem
  de Silos (`territorial-surface.ts`); rejeitado que ainda segura keyword
  continua visível (keyword nenhuma some). A formação de artigos já ignorava
  `rejected` (`siloIsHumanDecided`).
- **Catálogo MCP:** `arquiteto.undo_suggested_silo`, `access: "ui"`,
  `decision: "human"`, sem ferramenta MCP.

### B · Aba Artigos na ordem do trabalho

- **Na frente, nesta ordem:** (1) cartão "Próximo passo" com UMA frase e UM
  botão, no topo do painel "Melhorar publicados e formar Assuntos"
  (`resolveImprovementNextStep`): sem análise → "1 · Buscar keywords
  (grátis)"; validação pendente → "2 · Validar no Google (… US$ x)"; linhas
  prontas → "3 · Gravar melhorias (N)"; execução parada → "Continuar"; nada
  pendente → "Nada a fazer nos publicados agora. Veja artigos novos em
  Sobras." ("Ver Sobras"). O botão do cartão faz o mesmo ato do botão da
  fileira, que sai da fileira para não aparecer duas vezes. (2) o painel de
  melhoria; uma barra "Artigos novos" com "Processar/Reprocessar artigos" e
  "Concluir formação" (mesmos handlers e travas do painel de formação); (3) a
  mesa; (4) Sobras.
- **"Detalhes técnicos"** (`<details>` fechado, no fim): a grade inteira do
  Workbench — painel de formação (Análise dos artigos, Leitura do lote,
  métricas), Processo ativo, Ações humanas e o mapa, Reservadas para Silo,
  Assuntos, Keywords sem artigo, Objetivo do lote e reforço de outro Silo,
  Análise por keyword (avançado), Diferenciar (avançado), Keywords não
  agrupadas, Candidatas provisórias. Nas abas Silos e Links a grade continua
  abrindo a tela, como antes (`workbenchGrid`, uma const só).
- Nenhum comportamento mudou e nenhuma função saiu da tela.

- Arquivos: `lib/arquiteto/territory-undo.ts` (novo), `lib/server/arquiteto-territory-undo.ts`
  (novo), `lib/arquiteto/article-improvement-next-step.ts` (novo),
  `lib/arquiteto/silo-assignment.ts` (`humanSiloDecision`, mesma forma),
  `lib/arquiteto/territorial-surface.ts`, `lib/arquiteto/canonical-workspace.ts`
  (`undoRemoteSiloCandidate`), `lib/server/arquiteto-territory-store.ts`
  (`readTerritoryWorkflowItem`), `lib/server/arquiteto-workspace-http.ts`
  (`territoryUndos`, writer da keyword extraído sem mudar regra),
  `lib/agent/platform-catalog.ts`, `modules/arquiteto/arquiteto-workspace.tsx`,
  `modules/arquiteto/territorial-workspace-rows.tsx`,
  `modules/arquiteto/article-improvement-panel.tsx`, `package.json`.
- Consumidores preservados: o PATCH sem `territoryUndos` grava igual (mesmo
  writer da keyword, extraído para uma função); `arquiteto-article-improvement`
  continua mandando só `updates`. Os dublês dos testes de rota das lentes
  ganharam as duas exportações novas.
- Testes: `tests/arquiteto-desfazer-silo.test.mts`,
  `tests/arquiteto-desfazer-silo-servidor.test.mts` (rota real, banco em
  memória, recusas sem escrita), `tests/arquiteto-artigos-simples.test.mts`,
  cartão no `tests/arquiteto-article-improvement-dom.test.mts`.
- Suítes: `test:arquiteto` 2648/2648, `test:arquiteto:servidor` 95/95,
  `test:arquiteto:lentes` 57/57, `test:arquiteto:dom` 9/9, `test:agent` 58/58,
  `test:arquiteto-backup-roundtrip` 8/8, `test:editorial` 170/174 (as 4 falhas
  antigas), `tsc` 0 erros, ESLint limpo nos tocados (`arquiteto-workspace.tsx`
  igual ao antes: 41 erros e 77 avisos antigos), `git diff --check` limpo.
- Pendências: homologação do dono na AdalbaPro (desfazer "botox para o rosto",
  "limpeza de pele com peeling" e "tratamento estético para o rosto"; conferir
  no banco os três `rejected` e as keywords com `territoryRef` nulo); "Processar
  arquitetura" pode voltar a propor os mesmos Silos novos (proposta, que só vale
  com confirmação); o mapa dentro de "Detalhes técnicos" mede o tamanho quando
  o bloco abre.

## Reforçar publicados: correções da revisão (corretor) — 2026-09-28

```text
SDD = docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md §15 (adendo)
MODULO_PROPRIETARIO = Arquiteto · MINERADOR = só leitura
MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · DEV_SERVER = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Simulado com dados reais (leitura SELECT, sem custo). Validado manualmente: não.**

- **Slug = último segmento:** a pasta do Silo não conta como slug na régua da
  troca (a mesa e o servidor passam o caminho inteiro). Slug com dois
  complementos não recusa a keyword com a mesma entidade central.
- **Portaria do servidor:** o ArticleDNA só é aprovado com parecer que tenha as
  mesmas keywords, a mesma principal, os mesmos papéis nas consultadas, as 4
  lentes e ainda vigente; o motivo é dito. Real: 18 de 21 DNAs vigentes são
  descritos pelo próprio parecer; "tráfego pago vs orgânico" (outros papéis),
  "como atrair pacientes para clínica" e "como atrair pacientes sem redes
  sociais" (outra composição) pedem o "Processar artigos" (as 4 lentes estão no
  cache dos 21 pareceres: sem custo).
- **Troca confirmada que contradiz o slug** ("para o consultório" em
  /como-atrair-pacientes-para-clinica): a mesa não é alinhada a ela; a prévia e o
  cartão avisam; "Aceitar a troca" (desmarcada) oferece "como atrair pacientes"
  (cabe no slug, 7 páginas, volume 20). A página segue sendo o artigo.
  **Não aplicar a PARTE C de `reforco-reparo.sql`.**
- **Troca que espera o ArticleDNA:** a mesa grava a troca com o marcador do
  Reforçar e a reconhece (sem o conflito "publicada e não é a principal"); a
  confirmação seguinte a aplica sem a caixinha. Formação da Revisão humana com
  outra principal não vira troca implícita.
- **Tela:** "Mesa gravada · falta o ArticleDNA" (aviso, próximo passo, fora da
  conta do botão); a mesa é relida depois de qualquer gravação; total novo depois
  de gravar; "sem volume" em vez de 0; frases mais curtas; selo repetido tirado;
  o total do servidor na confirmação quando difere.
- **Contagem:** 25 keywords com Vínculo publicado = 21 artigos + 4 páginas de
  Silo (leitor exato do Vínculo); a mesa conta os 21 artigos.
- Suítes: `test:arquiteto` 2613/2613, `test:arquiteto:servidor` 85/85,
  `test:arquiteto:lentes` 43/43, `test:arquiteto:dom` 3/3, `test:agent` 56/56,
  `test:editorial` 170/174 (as 4 falhas antigas), Minerador por glob 1156/1184
  (as mesmas 28 antigas), `tsc` 0 erros, ESLint limpo nos tocados
  (`arquiteto-workspace.tsx` igual ao HEAD: 41 erros e 77 avisos antigos),
  `git diff --check` limpo.
- Pendências: homologação do dono; o botão "Processar artigos" na própria linha
  adiada (hoje o próximo passo é dito na linha); uma confirmação só para mesa e
  ArticleDNA precisaria de SDD própria.

## Reforçar publicados: a tabela única — 2026-09-28

```text
SDD = docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md §14 (adendo)
PEDIDO = dono ("não notei nenhuma diferença, e não está claro como reforçar")
MODULO_PROPRIETARIO = Arquiteto · NUCLEO = o do §13, sem mudança de contrato
ARQUIVO_NOVO = tests/arquiteto-reforcar-publicados-tabela-dom.test.mts (script test:arquiteto:dom)
MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · DEV_SERVER = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste (modelo, estrutura e a tabela renderizada com `react-dom/server`). Validado manualmente: não.**

- **Uma tabela no lugar da grade de cartões** do painel "Mesmo assunto no
  Google": uma linha por publicado e Assunto; colunas "Publicado ou Assunto",
  "Principal atual" (volume; página indicada depois da troca; "Aceitar a
  troca" opt-in), "Keywords sugeridas" (caixinha, nível, volume, páginas em
  comum, Silo de origem; as da busca em lote na linha do publicado), "Volume
  somado" (keywords e volume antes → depois) e "Estado".
- **Frase no topo:** "Reforço só vale com keywords do mesmo assunto no Google;
  keywords de volume alto de outro assunto viram artigo novo em Sobras."
- **Pré-marcação:** Forte de qualquer Silo (fora de outro artigo, até as vagas)
  marcada; Provável desmarcada. Uma keyword aparece num publicado só (o de mais
  páginas em comum); a linha do outro diz onde ela está.
- **Um botão:** "Gravar reforços (N)" → a confirmação do servidor, por artigo,
  com a mudança de Silo e o total depois. Ele manda também os já gravados sem
  nada marcado: o servidor diz se falta alinhar a troca já confirmada ou levar o
  parecer da composição (antes o pedido os pulava, e o alinhamento do §13 ficava
  sem caminho na tela); os "Sem mudança (N)" vêm numa linha. Assunto:
  "Aplicar no Assunto (N)".
- **Depois de gravar:** "Gravado e relido agora" e o total do ArticleDNA relido
  na linha; ela continua no filtro "Pedem decisão".
- **Cartão = detalhe:** "Ver a evidência" abre o cartão na própria linha (atos
  do dilema e páginas em comum), sem sugestões nem botão de gravar próprio. A
  Revisão do artigo continua com o cartão inteiro.
- **Frases:** "Gravar reforços" (na tabela "Reforçar publicados") nas mensagens
  do Processar, da busca em lote, do próximo passo do parecer e do cartão.
  Catálogo do agente atualizado (§17.1).
- Aditivos compartilhados (opcionais): `SerpSubjectCardView.articleKeywordIds`
  e `articlePrincipalKeywordId`, `SuggestionRowView.siloLabel` e
  `inOtherArticle`, `SerpSubjectCard.asDetail`, `usePublishedReinforcement({ cards })`.
  Consumidores preservados: Revisão do artigo e "Aceitar em grupo".
- Suítes: `test:arquiteto` 2604/2604, `test:arquiteto:servidor` 84/84,
  `test:arquiteto:lentes` 43/43, `test:agent` 56/56, `test:arquiteto:dom` 3/3
  (nova), `test:editorial` 170/174 (as 4 antigas), Minerador por glob
  1156/1184 (as mesmas 28), `tsc --noEmit` limpo, ESLint limpo nos tocados (a mesa: 41 erros/77 avisos,
  iguais ao HEAD, só deslocados de linha), `git diff --check` limpo.
- Pendente: a validação manual da tabela (homologação do dono): largura em
  celular (a tabela rola na horizontal), leitura das caixinhas marcadas, a
  confirmação e o total depois da releitura.

## Reforçar publicados: os quatro defeitos de produção — 2026-09-28

```text
SDD = docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md §13 (adendo)
MODULO_PROPRIETARIO = Arquiteto · MINERADOR = só lido
ARQUIVOS_NOVOS = lib/arquiteto/published-formation-serp.ts · lib/arquiteto/published-slug-fit.ts
MIGRATION = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · DEV_SERVER = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Simulado com os dados reais (SELECT, sem custo). Validado manualmente: não.**

- **Publicado é a página.** A mesa marcava cada membro de artigo publicado como
  publicado (21 → 27). Só a referência da página carrega URL e canonical; o
  membro diz "Slug do artigo publicado de "…"". Simulação: 21 ArticleDNA, 27
  referências; a projeção nova reconhece 21 páginas e 6 membros. O artigo
  trocado continua identificado pela página (c937661d); a nova principal
  (236e5d03) não vira publicado.
- **Troca pelo slug.** Substituta: cabe no slug → Forte/Provável → páginas →
  volume; "para o consultório" num slug "-para-clinica" não é proposta; âncora
  de outro publicado ou membro de outro artigo é recusada; sobra de outro Silo
  com SERP Forte entra (mudança de Silo anunciada). Simulação com a SERP real:
  "como atrair pacientes" (7 páginas, cabe no slug) vence "como atrair pacientes
  para o consultório" (7 páginas, troca a entidade).
- **Gate SERP do Reforçar.** A mesa acha o parecer da página para a formação
  humana dela; o hash decide (simulação: 19 vigentes; b1e61059 e c937661d
  desatualizados). O DNA só é aprovado com o parecer DESTA composição; sem ele, a
  confirmação grava a mesa e o DNA espera o "Processar artigos" (cache
  primeiro). DNA com parecer de outra composição: a confirmação alinha os papéis
  da troca na mesa e, depois do Processar, grava a sucessora só com o parecer.
- **Busca em lote.** Funil por página gravado na rodada e frase com o motivo real.
  Produção de 28/09: "O Google Ads devolveu só a própria frase (2 ideias em 2
  sementes)" nas 4 páginas — não é "outro assunto" nem falha do token. Erro do
  Google Ads aparece como erro (página `ads_error`; rodada inteira 503).
- Catálogo do agente atualizado (troca, publicado = página, duas confirmações,
  funil); `test:agent` 56/56.
- Suítes: `test:arquiteto` 2600/2600, `test:arquiteto:servidor` 84/84,
  `test:arquiteto:lentes` 43/43, `test:agent` 56/56, `test:editorial` 170/174
  (as 4 antigas), Minerador por glob 1156/1184 (as mesmas 28), `tsc` limpo,
  ESLint limpo nos tocados (a mesa: 41 erros/77 avisos, iguais ao HEAD),
  `git diff --check` limpo.
- Pendência de dado: `reforco-reparo.sql` (scratchpad da sessão) ficou opcional —
  a confirmação do Reforçar alinha os papéis de c937661d/236e5d03 pela rota da mesa.

## Reforçar publicados: correções da revisão — 2026-09-28

Verificado no código e confirmado por teste (fixtures, sem rede, sem custo).
Nada executado no banco remoto; homologação manual é do dono.

- **Aprovação com a mesma portaria da rota de artefatos.** O ArticleDNA do
  "Reforçar publicados" sai `approved` com `architectureStatus =
  architecture_confirmed` e o `serpAssessmentRef` do parecer de SERP do artigo
  gravado pelo "Processar artigos" (`withHumanArticleApproval`), e o núcleo roda
  `articleApprovalRevalidationIssues` antes de gravar. Sem parecer, a prévia
  recusa a página com o motivo. O Posto do publicado não é travado.
- **Decisão humana preservada.** Reforço narrativo decidido na formação continua
  reforço no ArticleDNA; quem já está na formação do publicado não é regravado;
  só as keywords que entram agora mudam de Silo.
- **Uma keyword, um artigo.** Formação do publicado com outra principal decidida,
  membro ou escolhida já no ArticleDNA de outro artigo, e keyword do Minerador em
  outro estado no Arquiteto são recusadas com o motivo.
- **A confirmação não trava mais por keyword repetida.** Marcada em mais de um
  publicado, ela entra só no de mais páginas em comum (membro da formação ou
  substituta da troca vencem) e a frase diz onde entrou e de onde saiu. Com os
  dados reais: 4 keywords repetidas ("como atrair pacientes para o
  consultório" em 4 publicados, "como atrair mais pacientes" em 3, …) vão para
  "como atrair pacientes para clínica" (7/6/4 páginas); os 25 publicados seguem
  para a prévia, 12 keywords sem repetição, maior artigo com 6.
- **Desfecho honesto.** Parada: o publicado que falhou diz o que já ficou gravado
  (Minerador, composição) e os não tentados são nomeados; keyword nova sem volume
  fica no Minerador e é dita; sucessora igual à vigente não grava versão.
- **Releitura reforçada**: composição (ref, papel, Silo) e ArticleDNA
  (`versionId` e `contentHash` gravados).
- **Permissões do Minerador** só quando a prévia confirmada tem keyword nova;
  chamadas em processo levam só a sessão e o `content-type`; a prévia MCP usa o
  mesmo schema e as mesmas leituras (`lib/server/arquiteto-published-reinforcement-deps.ts`).
- **Busca em lote**: rodada paga que para no meio marca a prévia e não roda de
  novo com outro id (teto por rodada); a próxima exige prévia e confirmação novas.
- **Tela**: a barra separa "com reforço proposto ainda não gravado" de "só ganham
  o ArticleDNA"; "Pedem decisão" mostra o "Reforço proposto" não gravado; o cartão
  devolvido pela busca diz "A busca em lote achou N keywords…" e perde o "Buscar
  reforço"; "Aceitar em grupo" diz que mudar de Silo grava só o Silo; o
  Processar nunca sai SUCCESS (grava só o parecer) e diz onde fica o botão.
- **Tabela da mesa**: teste com a composição gravada pelo Reforçar mostra o
  candidato do publicado com as 3 keywords (universo da formação). A tela real
  continua a conferir na homologação.
- Suítes: `test:arquiteto` 2593/2593, `test:arquiteto:servidor` 82/82,
  `test:arquiteto:lentes` 43/43, `test:agent` 56/56, `test:editorial` 170/174
  (as 4 antigas), Minerador por glob 1156/1184 (as 28 antigas, mesmos nomes),
  `tsc --noEmit` limpo, ESLint limpo nos arquivos tocados, `git diff --check` limpo.
- Deploy: uma fase só, sem migration, ArticleDNA sem campo novo.

## Reforçar publicados: a tela, a busca em lote e as mensagens simples — 2026-09-28

```text
SDD = docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md (aprovada pelo dono em 2026-09-28, teto US$ 1,00)
MODULO_PROPRIETARIO = Arquiteto · NUCLEO = a entrega anterior (rotas preview/apply e search/plan|run, sem mudança de contrato)
ARQUIVOS_NOVOS = modules/arquiteto/published-reinforcement-model.ts · published-reinforcement-panel.tsx · use-published-reinforcement.ts · lib/arquiteto/plain-run-messages.ts · tests/arquiteto-reforcar-publicados-tela.test.mts
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · DEV_SERVER = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não (a homologação é do dono).**

- **"Reforçar publicados"** (painel "Mesmo assunto no Google", no topo, e
  "Reforçar este publicado" em cada cartão de publicado). Abre UMA confirmação
  com a prévia do servidor (grátis): por artigo, "Cria o ArticleDNA (v1)",
  "Nova versão (vN)", "Nada muda" ou "Não será gravado", as frases do núcleo
  (troca, reforços, keywords novas "importadas e aprovadas por você no
  Minerador", o que fica de fora e por quê) e "Custo para gravar: zero". Tirar
  um publicado ou aceitar/desfazer a troca refaz a prévia (o hash acompanha).
  Com keyword nova, "Gravar e reler (N)" só libera com "Eu aprovo estas
  keywords novas no Minerador." marcado, e o aceite vale só para a prévia vista
  (prévia nova pede de novo). 409 "estado mudou" mostra a prévia nova e não
  grava. O desfecho diz o que foi gravado e relido e o que não foi, por artigo.
  Depois de gravar, a mesa relê o acervo e o cache de SERP.
- **Cartões mais simples.** Sem ArticleDNA (ou sem a substituta nele),
  "Aplicar troca" fica ativo e abre a confirmação com a troca marcada. Acabou
  o "conclua a formação e volte aqui" (troca, diferenciação e Revisão do
  artigo). Publicado com proposta não gravada diz "Reforço proposto" e
  "sem ArticleDNA ainda: 'Reforçar publicados' grava". As sugestões do cartão
  de publicado usam a seleção do hook (a mesma na Revisão do artigo) e vão para
  o Reforçar; o Assunto continua com "Aplicar selecionadas". "Par com intenção
  diferente" ficou curto ("… mas a intenção é outra. Só entra se você decidir.").
- **"Sem par no lote" numa linha só**, com "Buscar keywords para os publicados
  sem par (até US$ 1,00)": prévia grátis (`search/plan`), UMA confirmação do
  custo ("Confirmar US$ x a y"; "Cancelar (nada é pago)"), progresso e, depois,
  quem ganhou sugestão volta a ser cartão com "Keywords da busca em lote"
  (Forte marcada, Provável desmarcada, "nova no Minerador"); quem ficou sem
  nada fica na linha, com o motivo. Os que disputam o mesmo assunto entre si
  aparecem com o aviso da diferenciação. Rodada já paga é relida sem custo ao
  abrir a aba; "Nova busca" só por pedido explícito. A confirmação do custo usa
  o mesmo diálogo da diferenciação (mesmo núcleo, faixa e teto por rodada), não
  o `SerpPaidPlanDialog`, que descreve lentes e não candidatas.
- **Mensagens em português simples** (`lib/arquiteto/plain-run-messages.ts`).
  Processar/Reprocessar: "21 artigos analisados pelo cache, sem custo. Nada foi
  gravado ainda. Para gravar os 21 publicados: 'Reforçar publicados'." (INFO,
  nunca SUCCESS sem gravação); com parecer gravado, diz quantos e que as
  keywords dos artigos ainda não foram gravadas; novos prontos vão para
  "Concluir formação". Os códigos do §4 (`ARTICLES_PROCESSED`…) saíram da
  notificação e continuam no domínio. Allintitle: medido e gravado × já medido
  (nada novo) × sem volume. "Trazidas de outro Silo": "Gravado: só o Silo
  delas. Elas ainda não estão no artigo nem no ArticleDNA: para gravar,
  'Reforçar publicados'." (INFO). A notificação ganhou a severidade INFO.
- **Catálogo das IAs** (AGENTS §17.1): os rótulos da tela ("Reforçar este
  publicado", "Aceitar a troca", o aceite, "Gravar e reler (N)", a linha dos
  sem par, "Cancelar (nada é pago)", "Nova busca…") e as mensagens novas.
- Consumidores preservados: a troca pronta (ArticleDNA com a substituta)
  continua pela porta de versão da mesa; "Aceitar em grupo" continua, com a
  troca sem ArticleDNA apontada para o Reforçar; a diferenciação e a Pesquisa
  por Assunto dos Assuntos não mudaram.
- Suítes: `test:arquiteto` 2592/2592 (inclui o teste de tela novo, 16 casos),
  `test:arquiteto:servidor` 77/77, `test:arquiteto:lentes` 43/43,
  `test:agent` 56/56, `test:editorial` 170/174 (as 4 falhas antigas),
  Minerador por glob 1156/1184 (as 28 falhas antigas, mesmos nomes),
  `tsc --noEmit` limpo, ESLint sem erro novo nos arquivos tocados (a mesa já
  tinha 41 erros antigos, nenhum nas linhas alteradas), `git diff --check` limpo.

Pendências: homologação manual do dono na AdalbaPro (Reforçar "como atrair
pacientes para clínica", a busca em lote dos sem par e uma keyword nova até o
artigo; PASS só com o traço no banco); a tabela da mesa pode continuar contando
"1 keyword" para um publicado cuja composição gravada difere do candidato (a
partição exige o mesmo conjunto) — conferir na homologação; registrar o
publicado em `concludedFormations` do marcador (fechamento do Silo).

## Reforçar publicados, busca em lote e o par de 7 páginas (núcleo) — 2026-09-28

```text
SDD = docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md (aprovada pelo dono em 2026-09-28, teto US$ 1,00)
ROTAS_NOVAS = POST /api/arquiteto/published-reinforcement (preview|apply) · POST /api/arquiteto/published-reinforcement/search/plan · .../search/run
MCP = preview_published_reinforcement (só prévia, platform.read) · catálogo com 3 operações novas e D2.3.1
NUCLEOS_EXTRAIDOS = lib/server/minerador-keyword-decision-core.ts (Lógica e aprovação do MCP) · executePublishedSearchRound (rodada paga comum à diferenciação)
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · MANUAL_UI_VALIDATED = NO · TELA = outra frente
```

**Verificado no código e confirmado por teste. Validado manualmente: não. Tela: não faz parte desta entrega.**

- **D2.3.1 (defeito do par de 7 páginas).** `serpObservedBarrier`/`serpObservedWarning`
  (`lib/arquiteto/serp-subject-convergence.ts`): com 3+ páginas em comum, a
  intenção/funil OBSERVADOS diferentes viram aviso; com 2 ou menos (ou sem SERP),
  continuam barrando. Na leitura real, "como atrair pacientes para clínica" ganha
  "como atrair pacientes", "como atrair pacientes para o consultório" e "como
  atrair mais pacientes" (7 páginas) e "como atrair mais pacientes para o
  consultorio" (6) e "como atrair pacientes particulares" (4) como Forte, com o
  aviso; "como captar pacientes" (2 páginas) continua barrada. O teste antigo
  que fixava a barreira com 7 páginas foi trocado.
- **Reforçar publicados.** `lib/arquiteto/published-reinforcement.ts` (plano por
  página, primeiro ArticleDNA do publicado pelo construtor determinístico com
  `publishedAnchorId` + guarda do publicado + pai no estágio INITIAL,
  sucessora que só acrescenta, troca pelos gravadores da mesa, releitura,
  frase do desfecho) e `lib/server/arquiteto-published-reinforcement.ts`
  (prévia com `decisionHash`; aplicar na ordem keyword nova → composição → DNA,
  parando no primeiro erro com o motivo). ArticleDNA sai `approved` (a
  confirmação é a aprovação humana). A prévia já monta o primeiro DNA e recusa
  a página que o construtor recusaria.
- **Busca em lote.** `lib/arquiteto/published-reinforcement-search.ts` e
  `lib/server/arquiteto-published-reinforcement-search.ts`: dois modos (quem
  disputa o mesmo assunto com outro publicado vai à diferenciação), plano
  `published-reinforcement-plan-v1` com teto de US$ 1,00 no servidor, rodada
  pelo núcleo comum, Forte/Provável pela SERP, cada candidata num publicado só.
- **Núcleo da diferenciação refatorado sem mudar comportamento**:
  `fitPublishedSearchPagesToCap`, `authorizePublishedSearchPlan`,
  `acquirePublishedSearchLock`, `executePublishedSearchRound`; proposta com
  `subjectType` opcional no store. Suítes da diferenciação verdes.
- **Simulação com os dados reais (sem custo, 25 publicados do export):** 8 com
  reforço por páginas já no lote; 17 sem par; destes, 11 disputam o mesmo
  assunto (3 grupos → diferenciação) e 6 vão à busca em lote (US$ 0,00 a 0,42);
  os 14 do dono, se fossem todos à busca, dariam US$ 0,00 a 0,98, sem corte.
- Suítes: `test:arquiteto` 2576/2576, `test:arquiteto:servidor` 77/77,
  `test:arquiteto:lentes` 43/43, `test:agent` 56/56, `test:editorial` 170/174
  (as 4 falhas antigas), Minerador por glob 1156/1184 (as 28 falhas antigas,
  mesmos nomes), `tsc --noEmit` limpo, ESLint limpo, `git diff --check` limpo.

Pendências: a tela (botão "Reforçar publicados", a confirmação com as frases
`lines` e o `approvalText`, a linha "Sem par no lote" com a busca em lote, as
mensagens simples do Processar); registrar o publicado em `concludedFormations`
do marcador (fechamento do Silo); homologação manual do dono na AdalbaPro.

## Correções do corretor sobre as frentes de 2026-09-28 — 2026-09-28

```text
ORIGEM = revisão das frentes A1-A5 e D2 da SDD sdd-serp-no-artigo-e-kgr-opcional-2026-09-28
VERSIONAMENTO = medir/recalcular o allintitle sem "Aplicar KGR" não abre sucessora do ArticleDNA · identidade KGR antiga da canônica é mantida ao reformar
ALLINTITLE_SERVIDOR = Principal sem volume nunca é medida (lacuna, nada pago) · item fora da etapa vira lacuna, sem derrubar o bloco
PRIMEIRA_COLETA = inclui a cabeça da SiloPage com volume ("todas as keywords com volume do lote")
PRINCIPAL_SEM_VOLUME_NO_PARECER = sem mudança (SDD §13, decisão do dono pendente)
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · CAMPO_NOVO_EM_STRICT = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- **Sucessora sem decisão editorial (corrigido).** A rota do allintitle grava a
  medição em `kgrIdentity` da cópia de trabalho; a formação levava essa
  identidade para o payload, e `articleEditorialDiff` comparava a identidade
  inteira, então medir ou "Recalcular" abria ArticleDNA vN+1 sem decisão. Agora
  o diff compara `kgrIdentity` pela guarda `articleKgrIdentityChangedMaterially`
  (Principal, "Aplicar KGR" humano, vínculo confirmado e, só com KGR aplicado, a
  medição). A data da decisão humana virou carimbo: repetir a mesma escolha não
  é revisão.
- **Identidade antiga trocada em silêncio (corrigido).** Sem identidade na cópia
  de trabalho, a derivação nova (que não cria identidade por score) trocava
  "Sim · regra antiga", vínculo confirmado ou "PENDING_HUMAN_DECISION" da
  canônica por "Não aplicável". `reconcileArticleKgrIdentityWithCanonical`
  (novo, `lib/arquiteto/article-kgr-decision.ts`) mantém a decisão da canônica
  quando a cópia não traz decisão (humana ou vínculo confirmado) e só junta a
  medição nova às evidências; Principal trocada não herda a identidade antiga. A
  conclusão da formação e o preparo (`prepareSelectedLogicalArticleDnas`) usam a
  reconciliação antes de comparar.
- **Rota do allintitle.** O servidor confere `volume_search` da linha da marca
  e não mede Principal sem volume, nem numa chamada direta. Item fora de
  `architect/received` ou Principal fora do acervo viram lacuna (`gaps`) no
  plano e na execução, e os outros artigos do bloco seguem.
- **Primeira coleta.** A cabeça da SiloPage com volume entra no lote: ela não
  forma artigo, mas a SERP dela alimenta o índice "mesmo assunto" (artigo
  competindo com a página do Silo) e a SiloPage no Radar, pela mesma chave de
  cache.
- **Diálogo do plano pago.** Para o allintitle, o diálogo diz "consulta" e "uma
  por artigo" em vez de "lente principal"/"lentes extras", e o custo aparece
  como estimado até o primeiro registro no ledger.
- Comentários de `lib/arquiteto/article-batch-serp.ts`: o predicado lê a coluna
  `volume_search` (não a origem) e o teto da rota é de 12 keywords por pedido.
- Planejador (rótulo, outro módulo, só texto): "Não classificado como KGR" →
  "KGR não aplicável"; sem identidade, "KGR não aplicável (padrão)".
- Catálogo (`arquiteto.validate_serp`): cabeça da SiloPage no lote, guardas do
  servidor do allintitle e versionamento.
- Testes: `tests/arquiteto-serp-no-artigo.test.mts` (+5 casos de correção),
  `tests/arquiteto-serp-no-artigo-rota.test.mts` (+1),
  `tests/arquiteto-article-parent-reading.test.mts` ajustado.
- Suítes: `test:arquiteto` 2561/2561, `test:arquiteto:servidor` 70/70,
  `test:arquiteto:lentes` 43/43, `test:agent` 56/56.

Recusado nesta correção, com motivo: tirar do parecer a Principal sem volume.
A SDD §13 deixa esse caso para o dono e recomenda concluir o artigo "sem SERP",
o que muda o portão de conclusão e o envio ao Radar (workflow, exige adendo).
Até a decisão, a Principal sem volume continua consultada no parecer (paga se
faltar no cache).

Pendências: guarda de volume no servidor de `/api/arquiteto/serp` (hoje confia
no `volume_search` enviado) e de `keyword-serp`; a finalização automática do
Assunto não faz a primeira coleta (a próxima "Processar artigos" manual cobre o
Silo); quando a coleta paga algo, o parecer fica para o segundo clique.

## Integração das frentes de 2026-09-28 (catálogo MCP e scripts) — 2026-09-28

```text
INTEGRACAO = frentes M (M1-M4), D (D1-D2), A (A1-A5) e R (R1-R3) da SDD sdd-serp-no-artigo-e-kgr-opcional-2026-09-28
CATALOGO_MCP = lib/agent/platform-catalog.ts atualizado na mesma entrega (AGENTS §17.1) · npm run test:agent = 56/56
ROTA_NOVA_NO_CATALOGO = /api/arquiteto/article-allintitle (em arquiteto.validate_serp)
MIGRATION = 0 · SQL = 0 · ESCRITA_REMOTA = 0 · CHAMADA_PAGA = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

- Catálogo: `arquiteto.validate_serp` passa a "Primeira coleta da SERP do lote
  e parecer por artigo", com a rota `/api/arquiteto/article-allintitle`, a regra
  de keyword sem volume, o allintitle da Principal e a fase Silos como ação
  manual. `arquiteto.form_architecture` ganhou a nota do KGR do artigo (padrão
  "Não aplicável", "Aplicar KGR" humano). A diferenciação de publicados diz
  que as keywords novas vêm do Google Ads e cita `DIFFERENTIATION_PLAN_OUTDATED`.
- `package.json`: `tests/arquiteto-serp-no-artigo.test.mts` entrou em
  `test:arquiteto` e `tests/arquiteto-serp-no-artigo-rota.test.mts` em
  `test:arquiteto:lentes`.
- Suítes: `test:arquiteto` 2556/2556, `test:arquiteto:servidor` 70/70,
  `test:arquiteto:lentes` 42/42, `tsc --noEmit` sem erros.

## SERP no artigo e KGR opcional: primeira coleta na aba Artigos, allintitle da principal e "Aplicar KGR" (fatias A1 a A5) — 2026-09-28

```text
DECISAO = dono do produto, 2026-09-28 ("vamos aplicar"), item 4 e item 2 (KGR)
SDD = docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md (§3.3, fatias A1 a A5)
PRIMEIRA_COLETA_SERP = aba Artigos, em Processar artigos, ANTES da formação · 4 lentes · só keywords com volume (Google Ads > 0) · cache primeiro (30 dias) · uma confirmação
SEM_VOLUME = nunca coletada (lote, parecer e SERP por keyword da fase Silos) · no parecer sai como notObserved com motivo próprio
ALLINTITLE = 1 consulta por artigo, só da Principal com volume · reaproveita Arquiteto ou Minerador de até 30 dias · Recalcular pago com confirmação
KGR_DO_ARTIGO = padrão "Não aplicável" · "Aplicar KGR" Sim/Não para qualquer artigo · contrato article-kgr-decision-v2 · faixa 150–550 só informativa
CAMPO_NOVO_STRICT = 0 · VALOR_NOVO_DE_ENUM = 0 · migration = 0 · SQL = 0 · ESCRITA_REMOTA = 0
ESCRITA_EM_minerador_keywords = 0 (a linha do Minerador só é lida)
CHAMADAS_PAGAS_EM_TESTE = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**
A homologação na tela é do usuário.

### A1 · KGR do artigo com padrão "não aplicável"

- `lib/arquiteto/article-kgr-decision.ts` — `readArticleKgrDecision` passa à
  matriz v2:
  1. "Aplicar KGR" escolhido pelo humano (Sim/Não, `HUMAN_DECISION`);
  2. vínculo confirmado (`CONFIRMED_KGR_BINDING`);
  3. identidade gravada pela regra antiga (`FULL_KGR_RULE` persistida), lida
     como está: "Sim · regra antiga (KGR pleno automático)";
  4. no resto, `NO` com fonte `KEYWORD_APPLICABILITY_RULE`, rótulo
     "Não aplicável".
- Score abaixo de 0,25 e volume na faixa 150–550 viram informação
  (`scoreInFullRange`, `volumeInInterestRange`), nunca decisão.
- `requiresHumanDecision` fica sempre `false`: o KGR não pende para formar nem
  para aprovar. O campo continua no tipo para os consumidores.
- O score do ARTIGO (`readArticleKgrScore`) segue esta ordem:
  - allintitle medido pelo Arquiteto em `kgrIdentity.evidence` (mesma
    Principal) ÷ volume da Principal;
  - `kgr_score` da linha do Minerador;
  - `results_allintitle` ÷ `volume_search` do Minerador;
  - `kgrValue` já gravado.
  Ausência nunca vira zero.
- `deriveArticleKgrIdentity` (`strategic-context.ts`) não cria mais identidade
  KGR por score. Artigo novo sem decisão fica sem identidade. Com a Principal
  trocada e histórico de decisão, nasce a identidade padrão v2 levando o
  histórico.
- Fechamento (`article-classification-closure.ts`): campo aditivo opcional
  `articleAppliesKgr` em `ClassificationEvidence` (tipo TS, fora de schema).
  - Com ele, a mesa e o ArticleDNA fecham igual: sem "Aplicar KGR", `kgr` e
    `kgrApplicability` = `NOT_APPLICABLE` com `source: article_decision`.
  - Com Sim e sem allintitle, `KGR_APPLICABLE_WITHOUT_METRIC` bloqueia até
    medir, inclusive por decisão humana.
  - Sem o campo, a leitura anterior fica igual (testes antigos verdes).
- `PATCH /api/arquiteto/workspace`:
  - aceita `articleKgrDecision` YES/NO sempre (antes recusava com 409 sem
    decisão pendente ou sem score);
  - grava `decisionContractVersion: "article-kgr-decision-v2"` e o motivo
    "Decisão humana: Aplicar KGR neste artigo." (ou "não aplicar");
  - o score vem de `kgrIdentity`, com a linha do Minerador como reserva;
  - nada é escrito no Minerador.
- `article-review-checklist.ts`: o item "KGR do artigo" só fica pendente
  quando o artigo aplica o KGR sem allintitle. `article-consolidation.ts` não
  bloqueia mais por "A decidir" gravado pela regra antiga.
- **Guarda de versionamento:** `articleKgrIdentityChangedMaterially`
  substitui a comparação por JSON em `prepareSelectedLogicalArticleDnas`. A
  sucessora do ArticleDNA só nasce com:
  - troca da Principal;
  - "Aplicar KGR" do humano;
  - vínculo confirmado;
  - medição de allintitle, só com o KGR aplicado.

  A troca da regra (v1 → v2) não abre sucessora.
- Tela: o seletor "Aplicar KGR" (padrão "Não (padrão)") aparece sempre no item
  "KGR do artigo" da Revisão. Junto dele aparecem:
  - allintitle da Principal, KGR do artigo e volume, com "na faixa de
    interesse" quando está entre 150 e 550;
  - a origem da medição;
  - o botão "Medir allintitle (pago)" ou "Recalcular allintitle (pago)".
- A leitura da mesa junta a medição mais nova da cópia de trabalho à
  identidade do ArticleDNA (`mergeArticleAllintitleEvidence`), só para o
  score. A decisão continua a do ArticleDNA.

### A2 · primeira coleta da SERP do lote

- `lib/arquiteto/article-batch-serp.ts` (novo) monta o lote:
  - entram as keywords dos Silos em formação, menos as cabeças de SiloPage;
  - o predicado de volume é único: `hasSearchVolume`, média do Google Ads
    finita e maior que zero;
  - keyword do mesmo texto é consultada uma vez;
  - os blocos têm 6 keywords (24 consultas por pedido).
- `Processar artigos` (`arquiteto-workspace.tsx`) roda a coleta ANTES do
  marcador e da formação (`collectArticleBatchSerp`). Ela usa o núcleo da rota
  `keyword-serp`:
  - keyword × lente, cache primeiro;
  - a canônica com profundidade 20 e corpo;
  - `runPaidSerpBlocks`, com um plano somado e uma confirmação;
  - nunca a opção "só a principal".
- Resultado da coleta:
  - se pagou algo: relê o índice "mesmo assunto" (`serpSubjectReload`) e para,
    pedindo um novo clique para o parecer, que sai pelo cache e sem custo;
  - se estava tudo no cache: segue direto;
  - se a pessoa cancelou o pagamento: segue com o que houver no cache, como
    antes.
  A finalização automática do Assunto não coleta aqui.
- Keyword que chega sem SERP do Minerador é o caminho normal: ela entra no lote.

### A3 · keyword sem volume no parecer

- `app/api/arquiteto/serp/route.ts`: secundária e reforço sem volume ficam
  fora dos slots do plano, da leitura de corpos, da coleta e das lentes
  extras.
  - Saem como `notObserved`, com o motivo `NO_VOLUME_NOT_OBSERVED_REASON`
    (`article-serp-interpretation.ts`).
  - Não entram em `missing` e não travam `articleSerpLensesComplete`.
- A Principal continua sempre consultada: o parecer depende dela. Principal
  sem volume segue a regra de hoje até o dono confirmar (SDD §13).

### A4 · allintitle da Principal

- `lib/arquiteto/article-allintitle.ts` (novo) + rota nova
  `POST /api/arquiteto/article-allintitle` (`plan`/`execute`, até 20 artigos
  por pedido, `recollect` para "Recalcular").
  - Cache primeiro: a medição do Arquiteto em `kgrIdentity.evidence` e depois
    a do Minerador (`results_allintitle` + `allintitle_measurement.measuredAt`,
    lidos por coluna estreita), as duas com validade de 30 dias.
  - O plano usa o mesmo formato, a mesma autorização (`authorizeSerpPaidPlan`)
    e o mesmo diálogo da SERP. O preço é a faixa de outra lente, US$ 0,002 a
    0,0035 por consulta (**ESTIMADO**, SDD §7.1).
  - Medição paga pelo mesmo núcleo do Minerador
    (`measureDataForSeoAllintitle`): `allintitle:` sem aspas, desktop,
    profundidade 10.
  - A medição é gravada em `kgrIdentity` do item de workflow da Principal
    (`resultCount`, `kgrValue`, `primaryVolume`, `evaluatedAt`, `evaluatedBy`,
    `evidence`, com as 5 mais novas). Tudo são campos que já existem.
  - O ledger registra `module_operation`/`arquiteto` com
    `operationKind: "article_allintitle"`.
  - Nunca escreve em `minerador_keywords`. Medir não decide "Aplicar KGR".
- `Processar artigos` mede o allintitle das Principais do escopo depois do
  parecer (etapa 4), com plano e confirmação. Principal sem volume não é
  medida: sem volume não há KGR.

### A5 · fase Silos

- "Consultar nas 4 lentes" (SERP por keyword do território) continua como
  ação manual e opcional, com o plano pago, e passa a coletar só as keywords
  com volume.
- A SERP territorial (texto da entidade central) não mudou: já era ação
  manual, com plano e confirmação.

### Compatibilidade e deploy

- Pacotes aprovados, `SERVER_APPROVAL_GATE_SINCE` e assinaturas não mudam.
- ArticleDNA aprovado continua imutável. Identidades `FULL_KGR_RULE`,
  `HUMAN_DECISION` e `CONFIRMED_KGR_BINDING` gravadas são lidas como estão.
  Identidade confirmada mantém a trava de slug e principal e o perfil
  `kgr_light` (`identity-context.ts` não mudou).
- Nenhum campo novo nem valor novo de enum em schema `.strict()`:
  - `decisionContractVersion` é string livre;
  - `evidence` é um array de registros livres;
  - `notObserved` já existia.

  O leitor antigo aceita tudo o que o código novo grava.
- **Ordem de deploy:** monólito único, junto ou antes de M1 (SDD §6.5). Sem
  isso, keywords aprovadas sem SERP chegam a um Arquiteto que não coleta o
  lote.
- **Rollback abaixo desta entrega:**
  - o código antigo volta a mostrar "Sim · KGR pleno" automático para score
    abaixo de 0,25;
  - o PATCH antigo volta a recusar "Aplicar KGR" sem decisão pendente;
  - medições v2 gravadas continuam legíveis.

### Consumidores preservados

- Aba Silos: a SERP territorial e a leitura "mesmo assunto".
- Radar: mesmo cache, sem código tocado.
- `article-phase.ts`: `kgrDecisionPending` passa a ser sempre falso.
- `article-dna-projection.ts` e `article-expanded-panel.ts`.
- Diferenciação de publicados (fatia D2, outra entrega).
- Rota `keyword-serp`: não foi editada, só reutilizada.

### Arquivos

- Alterados:
  - `lib/arquiteto/article-kgr-decision.ts` (misto; o único CRLF foi
    preservado);
  - `article-classification-closure.ts`, `strategic-context.ts`,
    `article-review-checklist.ts` e `article-consolidation.ts` (CRLF);
  - `article-serp-interpretation.ts`;
  - `app/api/arquiteto/serp/route.ts` e `app/api/arquiteto/workspace/route.ts`;
  - `modules/arquiteto/arquiteto-workspace.tsx`.
- Novos:
  - `lib/arquiteto/article-batch-serp.ts`;
  - `lib/arquiteto/article-allintitle.ts`;
  - `app/api/arquiteto/article-allintitle/route.ts`.

### Testes

Fixtures e `fetch` falso.

- Novos:
  - `tests/arquiteto-serp-no-artigo.test.mts`: 17 testes, domínio e leitura
    estrutural. Quatro mutantes (filtro de volume da rota e do lote,
    Recalcular e guarda de versão) morreram com a suíte verde;
  - `tests/arquiteto-serp-no-artigo-rota.test.mts`: 7 testes. Executam de
    verdade as rotas `serp`, `keyword-serp`, `article-allintitle` e o PATCH,
    com banco em memória.
- Ajustados ao padrão novo:
  - `arquiteto-article-kgr-decision` (reescrito, 15 testes);
  - `arquiteto-keyword-dna-readonly`;
  - `arquiteto-article-expanded-panel`: rótulo "Não aplicável" do leitor
    único do Minerador;
  - `arquiteto-article-serp-interpretation`;
  - `arquiteto-serp-cache-formacao`.
- Resultados:
  - `test:arquiteto`: 2539/2539;
  - `test:arquiteto:servidor`: 70/70;
  - `test:arquiteto:lentes`: 35/35.
- Os dois arquivos novos ainda não estão nos scripts do `package.json`; o
  integrador inclui.
- TypeScript sem erro nos arquivos desta entrega. O lint direcionado não
  acusa erro novo: os 41 erros de `arquiteto-workspace.tsx` já existiam, fora
  das linhas alteradas.

### Pendências

- O dono precisa confirmar a regra para Principal sem volume, como o
  publicado com Posto Livre (SDD §13).
- O servidor de `keyword-serp` não filtra volume; o filtro está no lote do
  cliente e na rota do parecer. Guarda no servidor exige editar a rota que a
  fatia R1 do Radar está ajustando.
- Leitura "só cache" automática na fase Silos: a coleta paga já é manual. Um
  modo `cacheOnly` na rota `keyword-serp` fica para depois da fatia R1.
- Preço do allintitle sozinho ainda não medido: a faixa é estimada até o
  primeiro evento real no ledger.
- Catálogo das IAs (`lib/agent/platform-catalog.ts`) e ferramentas MCP da
  rota nova ficam com o integrador.

## Diferenciar publicados: keywords novas só do Google Ads (fatia D2) — 2026-09-28

```text
DECISAO = dono do produto, 2026-09-28 ("vamos aplicar"), item 3
SDD = docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md (§3.3, fatia D2)
PLANO = published-differentiation-plan-v2 · page.labs = [] · page.ads = keyword_seed [+ url_seed com a URL]
CUSTO_DA_PREVIA = só a SERP de até 5 candidatas por página nas 4 lentes (0 a 0,014 cada) · par: US$ 0,00 a 0,14 (antes 0,072 a 0,284)
PREVIA_V1_PLANNED = recusada antes de reservar (409 DIFFERENTIATION_PLAN_OUTDATED), nada pago
RODADAS_V1_PAGAS = legíveis e aceitáveis (labsFailures, origens labs_*)
PERSISTENCIA_NOVA = nenhuma (payload JSON aditivo: page.ads, plan.adsTargeting, run.adsFailures) · migration = 0 · SQL = 0 · ESCRITA_REMOTA = 0
CHAMADAS_PAGAS_EM_TESTE = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste. Validado manualmente: não.**

O que mudou:

- **Plano** (`lib/arquiteto/published-differentiation-run.ts`).
  - `DIFFERENTIATION_PLAN_VERSION` passa a `published-differentiation-plan-v2`;
    o v1 fica como `DIFFERENTIATION_LEGACY_PLAN_VERSION`.
  - Por página, `labs` fica vazio e entra `ads`:
    - `keyword_seed` com `[ideasSeed, relatedSeed]`, sem repetir;
    - com a URL no Vínculo, `url_seed` com `[ideasSeed]` e a URL.
  - O targeting das ideias é o canônico da plataforma
    (`DIFFERENTIATION_ADS_TARGETING`: português, Brasil, só Pesquisa, sem
    adulto), gravado em `plan.adsTargeting`.
  - Sementes, URL e targeting entram no `planHash`. Um plano v1 continua com o
    hash dele, porque os campos novos só entram quando existem.
  - Custo: só a SERP. O mínimo passa a US$ 0 (tudo no cache); o máximo é
    candidatas × 0,014.
  - Saiu o corte "Sem pesquisas relacionadas". Os cortes que ficam são os de
    candidatas (5 → 3 → 2) e o de páginas. Até 7 páginas cabem no teto de
    US$ 0,50 sem corte, e as 4 famílias da AdalbaPro (14 páginas) somam até
    US$ 0,98 (antes ~US$ 2).
  - Página sem URL: "o Google Ads recebe só as sementes do ângulo, sem a
    página".
- **Rodada:**
  - a porta `openExecution` pega `googleAdsIdeas` e `recordGoogleAdsUsage` no
    lugar de `runLabs`. As ideias vêm grátis e fora do orçamento, 100 por
    semente, com uma chave de uso por página e semente (`keyword_seed:p2`) no
    módulo `arquiteto`;
  - origens `ads_keyword_seed` e `ads_url_seed`;
  - o volume que decide continua sendo a média do Google Ads pelas métricas
    históricas (a coluna Volume do Minerador), para as até 60 de maior média
    na ideia por página. A média da ideia só vale para quem ficou sem a
    métrica histórica: fora das 60, ou com a consulta falhando, e aí o aviso é
    "valeu a média mensal das ideias do Google Ads";
  - semente que falha conta em `adsFailures` (campo novo, opcional) e segue;
  - `labsFailures` vem vazio nas rodadas novas;
  - `runPublishedDifferentiation` recusa um plano que não seja v2 antes de
    qualquer chamada.
- **Mudança de comportamento (registrada):**
  - sem `ranked_keywords`, `rankedByUrl` fica falso nas rodadas novas: a
    semente por URL do Google Ads NÃO é "o Google ranqueia a página";
  - a faixa "ranked" e as referências `daUrl` da avaliação só valem para
    rodadas antigas;
  - espera-se mais "Diferenciação fraca" e "Sem saída pelo provider" quando o
    slug e a SERP não bastam.
- **Servidor** (`lib/server/arquiteto-differentiation.ts`):
  - prévia v1 em `planned` responde 409 `DIFFERENTIATION_PLAN_OUTDATED` ("Esta
    prévia é de antes da troca para o Google Ads. Planeje o grupo de novo;
    nada foi pago."), antes do hash, da reserva e do provider;
  - `runData` devolve `adsFailures` (aditivo). "Planejar" de novo grava uma
    prévia v2.
- **Aceite** (`published-differentiation-apply.ts`): a origem padrão de uma
  escolha sem origem passa de `labs_category` a `ads_keyword_seed`. As
  escolhas antigas mantêm as origens `labs_*`, aceitas pelo import.
- **Tela** (`modules/arquiteto/published-differentiation-model.ts` e `-panel.tsx`):
  - a confirmação diz "As keywords novas vêm do Google Ads, sem custo. A parte
    paga é a SERP das candidatas (DataForSEO)…";
  - a faixa aparece como "US$ 0,00 a 0,14";
  - mensagem para `DIFFERENTIATION_PLAN_OUTDATED`;
  - as frases do Labs e da estimativa só aparecem numa rodada antiga.
- **Rota** `cannibalization/run`: só o comentário. As portas continuam
  `buildSubjectDiscoveryPorts({ usage: { module: "arquiteto", collectedBy: "arquiteto" } })`,
  abertas com o DataForSEO (a SERP é paga).

Arquivos alterados:

- `lib/arquiteto/published-differentiation-run.ts`,
  `published-differentiation-apply.ts` e `published-differentiation.ts` (só o
  comentário das sementes);
- `lib/server/arquiteto-differentiation.ts`;
- `app/api/arquiteto/cannibalization/run/route.ts` (comentário);
- `modules/arquiteto/published-differentiation-model.ts` e
  `published-differentiation-panel.tsx`.

Compartilhados, pela fatia D1 do Minerador:

- `lib/minerador/google-ads-discovery-usage.ts`: sufixo por página e `module`,
  aditivos;
- `lib/minerador/subject-discovery-search.ts`: o tipo do sufixo e `runLabs`
  fora das portas;
- `lib/server/subject-discovery-runtime.ts`: `openExecution` com opção.

Fim de linha: todos em LF (conferido pelo Node).

Consumidores preservados:

- as rotas `cannibalization/plan`, `run` e `apply`;
- `resume` das propostas gravadas;
- `planDifferentiationApply`, que não chama provider;
- o envio ao Minerador pelo import da Pesquisa por Assunto (5 origens);
- as ferramentas MCP da diferenciação: detectar e prever; pagar e aplicar
  continuam fora da MCP.

Testes, sem rede:

- `arquiteto-diferenciacao-publicados` 20. Novos: plano v2 com sementes e URL,
  custo 0 a 0,14, 5 páginas sem corte, 8 páginas cortando só candidatas,
  adulteração de semente, URL e targeting, rodada com o Google Ads falso,
  chaves por página, prévia v1 recusada sem chamada, semente que falha e
  métricas fora;
- `arquiteto-diferenciacao-publicados-servidor` 12 (novo: prévia v1 `planned`
  recusada sem reservar nem abrir o provider; planejar de novo grava v2);
- `arquiteto-diferenciacao-publicados-tela` 15 (novo: avisos da rodada de hoje
  e da antiga; mensagem do plano desatualizado).

Suítes: `test:arquiteto` 2539/2539 e `test:arquiteto:servidor` 70/70.

Pendências:

- **Integrador:** `lib/agent/platform-catalog.ts` (diferenciação: fonte das
  keywords novas, custo só da SERP, sai o corte das relacionadas) e
  `lib/agent/silo-plan.ts:209`.
- **Adendo** na `sdd-diferenciacao-publicados-canibalizados-2026-09-27.md`
  (§3.3 a §3.5).
- **Homologação manual (usuário):** "Planejar diferenciação" do par atrair ×
  captar mostra US$ 0,00 a 0,14; "Buscar e validar" traz candidatas do Google
  Ads; uma prévia antiga (se houver no banco) é recusada sem pagar.

## Diferenciar publicados — correções da revisão — 2026-09-27

Revisão das entregas de núcleo e tela abaixo. **Verificado no código e confirmado por testes locais** (fixtures, banco em memória, portas falsas e a leitura real do cache da AdalbaPro; sem rede, sem crédito). **Não validado manualmente.** Nenhuma escrita remota, SQL, migration, chamada paga, servidor, build ou git com mudança de estado. O schema do ArticleDNA não mudou: não há regra de deploy nova.

- **A prévia vale UMA rodada paga.** A rodada reserva a proposta antes de abrir o provider (`planned` → `running`, trava por `lock_version`) e grava `proposed` no fim. Outra rodada na mesma prévia (outra aba, outro membro, outro `operationRequestId`) volta 409 sem pagar: `DIFFERENTIATION_ALREADY_RUN` ou `OPERATION_IN_PROGRESS`. A MESMA rodada repetida (resposta perdida) devolve o resultado gravado, sem pagar (`replayed: true`). Recusa antes de pagar (provider, ledger, hash) devolve a prévia a `planned`. Reserva parada há mais de 30 minutos pode ser substituída por "Planejar nova rodada". Antes: um id novo com o mesmo plano pagava tudo de novo (sonda: Labs 6 → 12, SERP 8 → 16).
- **Nova prévia não apaga a avaliação paga nem desfaz "Manter como está".** Com avaliação gravada, a prévia é recusada (`DIFFERENTIATION_EVALUATION_PENDING`); só `replaceEvaluation`, pedido na tela por "Planejar nova rodada", a substitui, e a anterior vai a `payload.history` (até 10, com hash, custos e o resumo da avaliação). Grupo mantido com a mesma SERP é recusado (`DIFFERENTIATION_GROUP_KEPT`). O MCP `plan_published_differentiation` em `preview` nunca manda esses pedidos: é recusado nos dois casos. `resume: true` relê a prévia e a avaliação gravadas sem regravar (permissão de ver).
- **A detecção devolve o resumo da proposta por grupo** (`proposal: { state, hasRun, executedAt, runningSince }`), numa leitura estreita (`readDifferentiationProposalSummaries`, que também traz o "Manter"). Na tela, "Planejar diferenciação" de um grupo já buscado reabre o resultado gravado, sem custo.
- **Separação conta a principal que a irmã mantém.** A keyword proposta para uma página divide no máximo 1 página com cada irmã: a principal que ela mantém (Travado, ranqueando, sem Posto, fora da rodada ou Livre sem troca) mais as propostas dela. As passadas refazem a escolha até ninguém mais perder a troca. O "depois" também conta a principal mantida. Caso real da revisão: "x captar" dividia 3 páginas com "como atrair pacientes…" (Travado) e saía "Diferenciado" com 6 → 0; agora captar fica "fraca" e o grupo mostra 6 → 6. A antiga principal de quem troca vira secundária (nenhuma keyword some), mas não é mais o alvo da página e não entra na conta — senão nenhum grupo com duas principais antigas poderia sair "Diferenciado".
- **"Diferenciação fraca" não propõe keyword.** A melhor possível fica só como evidência (`bestEffort`) e precisa caber no slug (entidade, URL que já ranqueia ou 2+ páginas com a página). `secondaries` fica vazia. "Aceitar grupo" leva, por padrão, só as páginas "Diferenciado"; fraca ou sem saída entra só se a pessoa marcar "Incluir no aceite", e recebe só a nota do ângulo (nenhuma keyword, nenhuma troca). Sem página Diferenciada e sem marca: 409 `NOTHING_TO_APPLY`. Avaliação gravada antes desta correção também é tratada assim.
- **Q3 relido no aceite:** o ranqueamento é relido do cache na hora de gravar, como o Posto. Página que passou a aparecer no Google não troca a principal; se a SERP não puder ser relida, a troca fica para "Aceitar de novo".
- **Rodada confere os publicados:** membro que saiu do Vínculo (ou foi excluído) desde a prévia → 409 `PLAN_STALE`, nada pago.
- **Sementes pagas com o tema da página:** o `keyword_ideas` usa as palavras da keyword publicada e as que só o slug tem ("atrair pacientes consultório odontológico", "modelos campanha clínica estética"), não mais só "odontológico" ou "clínica".
- **Entidade de uma palavra** ("clínica", "consultório") precisa de mais uma palavra da página para caber no slug: "clínica veterinária" não cabe em "como atrair pacientes para clínica". Com mais de uma palavra, vale o núcleo (a regra do dono: "clínica de estética" ou "estética").
- **IA dos ângulos** resolve a Connection DeepSeek com o cliente da sessão, como `/api/arquiteto/article-dna`.
- **Tela:** "Manter como está" pede confirmação; "Aceitar de novo" completa a troca com a mesma avaliação (nada é pago de novo; o texto antigo mandava buscar de novo); "Planejar nova rodada" é o único caminho para outra rodada paga; "Buscar e validar" fica inativo para grupo já buscado; "Tentar de novo" reusa o id quando a resposta não chegou ou a mesma rodada ainda roda, e recebe o resultado gravado.
- **Catálogo (§17.1) e MCP:** o texto não promete mais que "repetir não paga" só pelo ledger; diz a reserva, a rodada única por prévia, a recusa da prévia pelo MCP, a fraca sem keyword, o Q3 relido e que a nota chega ao Redator depois que a versão nova do ArticleDNA for aprovada e o Radar reenviar o artigo.
- **Recusado, com motivo:** (1) contar a antiga principal de uma página que troca como parte dela na separação — a SDD manda a antiga virar secundária, e contá-la tornaria impossível diferenciar qualquer par; (2) exigir a entidade inteira em entidade de várias palavras — contraria o exemplo do dono ("estética" basta); (3) gravar evento de status a mais no aceite — o writer canônico grava a versão com `status = proposed` e a mesa, relida depois do aceite, deriva o mesmo evento, como na troca feita pela mesa.
- **Testes:** domínio 18 (novos: separação com a principal mantida, fraca sem keyword, aceite padrão só com Diferenciado, Q3 relido, sementes, entidade de uma palavra, Redator com a nota no `editorialContext`, com e sem Assunto), servidor 11 (novos: rodada única, mesma rodada relida, reserva contra outra aba, prévia recusada com avaliação e com "Manter", nova rodada com histórico, publicado que saiu, nada a aceitar), tela 14. Suítes na seção "Validação" do relatório da revisão: `test:arquiteto` 2.532/2.532, `test:arquiteto:servidor` 68/68, `test:arquiteto:lentes` 35/35, `test:agent` 56/56, `test:redator` 358/358, `test:editorial` 170/174 (as 4 antigas), Minerador por glob 1.142/1.170 (as mesmas 28), `tsc` limpo.

## Diferenciar publicados que disputam o mesmo assunto (tela) — 2026-09-27

SDD aprovada: [sdd-diferenciacao-publicados-canibalizados-2026-09-27](sdd-diferenciacao-publicados-canibalizados-2026-09-27.md). Módulo proprietário: Arquiteto. Usa o núcleo da seção abaixo, sem reescrever nada dele.
**Estado desta entrega (tela e docs):** verificado no código e confirmado por testes locais (modelo com a leitura real do cache da AdalbaPro e o plano de verdade do núcleo; estrutura do painel, do hook e da fiação; sem rede). **Não validado manualmente** na tela real: a homologação é do usuário. Não houve escrita remota, SQL, migration, chamada paga, servidor, build nem git com mudança de estado.

- **Painel "Publicados que disputam o mesmo assunto"** (`modules/arquiteto/published-differentiation-panel.tsx`, novo), na aba Artigos, depois do painel de mesmo assunto:
  - uma linha por grupo, com checkbox: os publicados (keyword, volume, Posto, "Ranqueia em Nº" / "Pode ranquear" / "Não ranqueia", "sem DNA do artigo") e "N páginas em comum no top 10" ("até N" quando há mais de um par);
  - "Planejar diferenciação (grátis)" para os marcados: o ângulo de cada página com a fonte, a faixa de custo, o teto e os cortes. A opção "Pedir ângulos à IA (menor autoridade)" começa desmarcada;
  - "Buscar e validar (US$ x a y)" soma as faixas dos marcados e só fica ativo com todos planejados e dentro do teto. Uma confirmação vale para todos; cada grupo mostra "Na fila", "Buscando e validando…", "Pronto" ou "Falhou";
  - resultado por página: estado (Diferenciado / Diferenciação fraca / Sem saída pelo provider) e motivo, ângulo, principal nova com volume, secundárias com volume ou estimativa, páginas em comum com cada irmã antes → depois, aviso de Posto Travado ou de página que ranqueia, e o gasto;
  - "Aceitar grupo" abre a confirmação com o que muda. A mensagem de sucesso só aparece quando a releitura confirma cada versão; página não confirmada é dita como tal;
  - "Manter como está" registra a decisão; o grupo some até a SERP dele mudar.
- **Passos seguintes do aceite:** "Enviar ao Minerador" manda as keywords novas ao Processador pelo import da Pesquisa por Assunto (mesmo contrato `.strict()`, `importRequestId` novo, sem métrica). "Colocar no artigo" grava as que já estão no Minerador pelo writer da formação (`planAddKeywordsToCandidate` + `applyFormationPlan`, com lock e releitura). A tela avisa que a troca da principal só completa com "Aceitar de novo" (a mesma avaliação, sem nova rodada paga; corrigido na revisão acima).
- **Chamadas** (`modules/arquiteto/use-published-differentiation.ts`, novo): detectar uma vez por marca ao abrir a aba (e em "Reler"); planejar e buscar só por clique. Cada rodada gera um `operationRequestId` novo por grupo; "Tentar de novo" só reusa o id quando a resposta não chegou. O aceite leva o `evaluationHash`. Nada vai para localStorage, sessionStorage ou IndexedDB.
- **Modelo** (`modules/arquiteto/published-differentiation-model.ts`, novo, puro): rótulos, faixa de custo (mínimo arredondado para baixo e máximo para cima), prontidão da rodada, corpo pago com o hash e o custo confirmados (limitado a US$ 0,50), visão da avaliação e do aceite, frases dos erros do servidor.
- **Workspace** (`arquiteto-workspace.tsx`): só a fiação: o painel na aba Artigos, `addDifferentiationKeywordsToArticle` e a releitura da mesa depois de gravar.
- **Ajuste mínimo no núcleo:** `compactDifferentiationGroup` passou para o domínio (`lib/arquiteto/published-differentiation.ts`, com o tipo `CompactDifferentiationGroup`); o servidor reexporta. Mesma forma e mesmos consumidores.
- **Catálogo (§17.1):** os dois `howOnScreen` usam os rótulos reais: "Planejar diferenciação (grátis)", "Buscar e validar (US$ x a y)", "Aceitar grupo", "Manter como está", "Enviar ao Minerador" e "Colocar no artigo".
- **Sistema visual:** tokens e classes de botão da mesa, texto de 14px ou mais, keyword em `text-keyword`, estado com texto e cor, diálogo com foco preso e Escape, checkbox com `label`. `findVisualViolations` limpo nos três arquivos novos.
- **Testes:** `tests/arquiteto-diferenciacao-publicados-tela.test.mts` (12, em `test:arquiteto`). `test:arquiteto` 2.527/2.527, `test:arquiteto:servidor` 62/62, `test:arquiteto:lentes` 35/35, `test:agent` 56/56, `test:editorial` 170/174 (as 4 falhas antigas: rotas oficiais, `ArticleDnaSummary` no workspace, layout Admin e Marca/Conta), Minerador por glob 1.142/1.170 (as mesmas 28 da base), `tsc --noEmit` limpo (config sem `.next/dev`), ESLint limpo nos arquivos novos, workspace com os mesmos 118 problemas antigos e nenhum nas linhas novas, `git diff --check` limpo.
- **Limitações:** nada foi clicado na tela real. "Colocar no artigo" só acha o artigo quando o publicado está num Silo confirmado da mesa. (Corrigidos na revisão acima: planejar de novo não descarta mais a avaliação, e a rodada cuja resposta se perdeu é relida da proposta.)

## Diferenciar publicados que disputam o mesmo assunto (núcleo) — 2026-09-27

SDD aprovada: [sdd-diferenciacao-publicados-canibalizados-2026-09-27](sdd-diferenciacao-publicados-canibalizados-2026-09-27.md) (Q1 IA com a menor autoridade; Q2 teto de US$ 0,50 por grupo e uma confirmação por rodada; Q3 página que ranqueia não troca a principal). Módulo proprietário: Arquiteto.
**Estado desta entrega (núcleo: domínio, servidor, rotas, persistência, MCP e testes):** verificado no código e confirmado por testes locais com fixtures e portas falsas (sem rede, sem crédito) e por simulação com a leitura real do cache da AdalbaPro (sem custo). **Não validado manualmente**; a tela é outra entrega. Não houve escrita remota, SQL, migration, chamada paga, servidor nem build.

- **Detecção grátis** (`lib/arquiteto/published-differentiation.ts`): grupos por componente conexo de pares Fortes (3+ páginas em comum, a régua D2.2), Prováveis (2 páginas com palavras, a régua D2.1) anotados; Posto, volume, artigo e "ranqueia" (URL do publicado no top 10, com posição; canônica só com domínio segura a troca). "Manter como está" guarda a impressão da SERP e o grupo volta quando ela muda.
- **Ângulos**: palavras que só aquele slug tem, entidade do slug (DNA ou o que vem depois de "para"), DNA; IA opcional validada (id inventado recusado, 3 a 5 sementes), nunca decide.
- **Plano e rodada** (`published-differentiation-run.ts`): faixa de custo com os preços do código, teto de US$ 0,50 aplicado no servidor com cortes explicados, `planHash` SHA-256; rodada pelo MESMO núcleo da Pesquisa por Assunto (`SubjectDiscoveryExecutionPorts`, orçamento, junção, pedido de SERP nas 4 lentes, chave do ledger), cache primeiro, volume do Google Ads (métricas históricas, grátis, não gravado no Minerador). Filtro D2.3, separação (≤1 página com as irmãs) e encaixe (≥2 com a própria página); principal nova pela régua da troca (`proposePublishedPrimarySwap`).
- **Aplicar** (`published-differentiation-apply.ts`): nova versão do ArticleDNA em revisão pelos gravadores da troca (`decidePublishedPrimarySwap` + `buildPublishedSwapArticlePayload`) e pelo writer canônico (`appendArquitetoArtifact`), com readback. **Nenhum campo novo no ArticleDNA**: a nota vai em `differentiation` (prefixo `Diferenciação: `), o ângulo das irmãs em `excludedSubjects`, o link em `internalLinks` (prefixo `Link interno sugerido: `), as irmãs em `nearbyArticleIds`. Sem regra de deploy nova (schema `.strict()` intacto).
- **Persistência**: `editorial_workflow_items`, `subject_type = differentiation_proposal`, `stage = architect` (o CHECK do banco não aceita "arquiteto"), `marca_id`, trava por `lock_version`; payload com grupo, ângulos, plano e hash, rodada (candidatas com origem, pegadas, custos, avaliação e hash da avaliação) e decisões com ator. Sem migration.
- **Rotas**: `POST /api/arquiteto/cannibalization/plan` (grátis; sem `groupId` só lê, com `groupId` grava a prévia), `/run` (pago, exige `authorizedPlan` e `operationRequestId`; grupo mudou → `PLAN_STALE`, nada pago), `/apply` (`accept` com o hash da avaliação; `keep`). Marca e ator do contexto do servidor.
- **Redator**: `lib/redator/radar-import.ts` acrescenta ao `editorialContext` as linhas `Diferenciação: ` do ArticleDNA fixado (aditivo; sem nota, o documento é o mesmo). `lib/server/radar-writer-send.ts` passa o campo.
- **Compartilhado (aditivo)**: `buildSubjectDiscoveryPorts` aceita `usage` (módulo do ledger e coletor do cache; padrão `minerador`) e `input` só com `operationRequestId`. Consumidores preservados: rota e MCP da Pesquisa por Assunto.
- **MCP (§17.1)**: ferramenta `plan_published_differentiation` (`detect` com platform.read; `preview` com arquiteto.write); pagar e aplicar ficam na tela. Catálogo: `arquiteto.published_differentiation_detect` e `arquiteto.published_differentiation`.
- **Simulação com o cache real (sem custo)**: 25 publicados medidos, 4 grupos, 13 pares Fortes — plano de marketing (4 páginas, até 7 em comum, US$ 0,144 a 0,498 com corte de candidatas), atrair × captar em estética (2, 6 em comum, US$ 0,072 a 0,284), atrair em consultório/clínica/odontológico (3, até 5, US$ 0,108 a 0,426), campanhas/marketing/agência/modelos/promoções (5, até 4, US$ 0,144 a 0,498 com cortes). Ranqueiam só "campanhas … sem anúncios" (4º, mobile) e "modelos de campanha…" (7º): sem troca de principal. Máximo das 4 famílias: US$ 1,71.
- **Testes**: `tests/arquiteto-diferenciacao-publicados.test.mts` (15) e `tests/arquiteto-diferenciacao-publicados-servidor.test.mts` (5); `tests/agent-platform-mcp.test.mts` teste 33.

## D2.3 — volume primeiro e sugestões que o dono só confirma — 2026-09-27

Pedido do dono (2026-09-27): "se não tem volume, não presta"; "se for fazer manualmente eu consigo formar os grupos, reforçar os meus artigos com essas mesmas keywords ... só que isso me levaria muito tempo". Regras: D2.1, D2.2 e a nova D2.3 de [regras da SERP e dos Assuntos](../compartilhado/regras-serp-e-assuntos-2026-09-26.md). Módulo proprietário: Arquiteto.
**Estado desta entrega:** verificado no código e confirmado por testes locais (sem rede, fixture da leitura real) e por simulação com os dados reais da AdalbaPro (159 keywords, 25 publicados, top 10 do cache; sem custo). **Não validado manualmente** na tela real — a homologação é do usuário. Não houve escrita remota, SQL, migration, chamada paga, servidor nem build.

- **Correção da revisão (corretor, 2026-09-27)** — verificado no código, confirmado por teste e pela simulação refeita; **não validado manualmente**:
  - **A troca exige páginas em comum (D2.1).** `proposePublishedPrimarySwap` aceita só a Forte (3+ páginas) ou a Provável de 2 páginas confirmadas pelas palavras (`measureAnchorConvergence` = `serp_and_words`). Sites em comum e "mesma entidade e problema no DNA" continuam sugerindo reforço, nunca a troca. Sem SERP no cache, a recusa volta a ser `serp_unknown`; 2 páginas sem palavras dão `serp_support`. O título do cartão e o rótulo de "Aceitar em grupo" dizem "(Provável)", e a troca Provável fica fora de "Marcar todas as disponíveis".
  - **A Provável pelo DNA só vale sem SERP.** Se a SERP mediu o par (0 ou 1 página, menos de 3 sites), é outro assunto e não vira sugestão (D2.2/A2); a frase "nenhuma keyword deste lote trata do mesmo assunto no Google" volta a aparecer nesse caso. Numa Provável por sites, o aviso da Lógica diz "Sem páginas em comum, confira antes de aplicar".
  - **Demanda igual à do Minerador.** "Tema sem demanda no Google" conta por `subjectDiscoveryHasVolume` (média do Google Ads ou estimativa maior que zero). `SubjectVolumeFields` ganhou `dataForSeoEstimate` opcional (alargamento compatível; consumidores do Minerador preservados).
  - **MCP.** `compactSubjectCandidate` expõe `hasVolume` e, quando maior que zero, `estimate` (aditivos; `volume` continua só o Google Ads). Catálogo alinhado: troca, régua e demanda.
  - **"Aplicar selecionadas".** Conta o que o plano gravou e a releitura confirmou. A recusa do plano (teto, outro Silo, publicada) aparece com o motivo dela. O artigo do Assunto só nasce com o vínculo montado, e o vínculo é conferido na releitura. "Confirmado na releitura" só aparece quando algo foi confirmado.
  - **"Keywords não agrupadas pela formação".** Fica recolhida quando há o painel de Sobras; aberta, vem por volume, com as sem volume no fim. Nenhuma some.
  - **Simulação refeita (mesmos dados, sem custo):** trocas 5 → 3. Saem "como atrair pacientes sem redes sociais → marketing para clinica" (0 página, 4 sites) e "agência de marketing para cosméticos → seo para google meu negócio" (2 páginas sem palavras). Ficam "como atrair clientes para consultório → como atrair pacientes particulares" (Forte, 3), "como atrair pacientes para clínica → como atrair pacientes" (Forte, 7) e "tráfego pago vs orgânico para clínica de estética → tráfego pago e orgânico" (Provável, 2 páginas com palavras). Estados: 3 Troca proposta, 3 Sugestões para confirmar, 2 Reforçado, 1 Sem SERP, 17 Sem par no lote. Sugestões (7 publicados) e sobras (120 em 49 temas) sem mudança.
  - **Testes:** `test:arquiteto` 2.500/2.500, `test:arquiteto:servidor` 57/57, `test:arquiteto:lentes` 35/35, `test:agent` 55/55, Minerador por glob 1.159/1.184 (as mesmas 25 falhas da base, nenhuma nova), `tsc` limpo (config sem `.next/dev`), ESLint limpo nos arquivos alterados, `git diff --check` limpo.
- **Nível das sugestões** (`lib/arquiteto/serp-subject-suggestions.ts`, novo): Forte = 3+ páginas em comum no top 10; Provável = 2 páginas, ou 3+ sites em comum que distinguem assunto, ou mesma entidade e mesmo problema no DNA (DNA inconclusivo não conta; o DNA só conta quando a SERP não mede o par). Rede social e portal (lista fixa `SERP_GENERIC_DOMAINS`, e no lote de 50+ keywords os sites presentes em mais de 15% das SERPs) não contam como site em comum: na AdalbaPro, instagram.com está em 65 das 158 SERPs e sozinho fazia 239 pares "Provável"; sem os genéricos, 51. A medida ganhou `sharedDistinctiveDomains` e `genericDomains()` (aditivo, `serp-subject-overlap.ts`).
- **Sem volume não reforça** (`hasSearchVolume`: nulo, zero ou inválido = sem volume): nunca é sugestão, sustentação nem nova principal. Com a SERP da mesa lida, a formação também não põe keyword sem volume em publicado ou Assunto (`article-formation-priority.ts`); ela fica nas sobras com o motivo "sem volume: não reforça nem forma artigo". Sem índice de SERP, a formação é a de antes.
- **A intenção que barra é a da SERP** (`serpAwareDnaBarrier`, `serpObservedDnaContradiction`, `logicDnaDivergence` em `serp-subject-convergence.ts`): intenção ou funil observados na SERP (`evidencia_serp` conclusiva) diferentes barram; a Lógica que diverge vira aviso quando a SERP mede o par ("Aviso: intenção da Lógica diferente (Comercial × Informativo); quem barra é a intenção da SERP…"). Sem SERP para medir o par, a Lógica ainda segura a entrada automática. `formationDnaContradiction` não mudou (continua valendo sem índice e nos artigos novos).
- **Sugestões por publicado e por Assunto** (`suggestAnchorReinforcements`, campo aditivo `suggestions` em `AnchorSerpDiagnosis`): só com volume, por volume, com nível, volume e motivo curto ("7 páginas em comum no top 10"). Forte fora de artigo no mesmo Silo vem marcada até as vagas; Provável vem desmarcada; keyword em outro artigo e par em outro Silo entram desmarcados, como proposta. Publicada, Assunto declarado e keyword com decisão humana de formação noutro artigo nunca são sugeridos. Estado novo `suggestions_available` ("Sugestões para confirmar"): antes de "Par em outro Silo" quando há sugestão no próprio Silo fora de artigo; senão, antes de "Sem SERP", "Sem demanda" e "Sem par".
- **Aplicar selecionadas** (`serp-subject-panels.tsx`): lista no cartão com checkbox, nível, volume, motivo e aviso; "Ver todas"; diálogo de confirmação com a prévia (`suggestionApplyPreview`: o que entra, o que sai de outro artigo, o que muda de Silo antes; teto de 6 barra o botão). Grava pelo MESMO writer da formação (`applyFormationPlan`, lock e releitura) com o planejador novo `planAddKeywordsToCandidate` (`article-formation-editing.ts`, operação "move"); o par de outro Silo muda de Silo pela mesma decisão de Silo (`applySiloDecisionsInBatch`) e depois aparece na lista para entrar. Assunto sem artigo: `planNewArticleFromKeywords` cria o artigo com as marcadas (principal = maior Volume validado) e o vínculo do Assunto vai na mesma escrita (`planWorkingSubjectAnchorWrites`). O desfecho só conta o que a releitura confirmou (`describeSuggestionOutcome`).
- **Publicado com composição decidida por humano continua com cartão**: com a SERP lida, `planSiloArticleFormation` devolve em `anchors` o publicado com `humanFormationRef` (campo aditivo `humanDecided`); a formação não mexe nele e as propostas entre Silos não o usam como destino automático. Sem isso, aplicar sugestões sumiria com o cartão.
- **Troca da principal (Posto Livre)**: a substituta pode ser Forte (3+ páginas) ou Provável só com 2 páginas confirmadas pelas palavras (D2.1; sites em comum, o DNA e a SERP desconhecida nunca propõem troca), sempre com volume maior que o da atual; a Forte tem prioridade, a Provável só é proposta sem Forte e vem com aviso ("Nível Provável … confira a evidência"); `substitute.level` e `alternatives[].level` (aditivos). A substituta também pode vir das sugestões fora de artigo no mesmo Silo.
- **Sobras como oportunidades** (`groupLeftoverOpportunities`, painel novo `modules/arquiteto/leftover-opportunities-panel.tsx`): por Silo, a de maior volume abre o grupo e chama as do mesmo assunto (SERP forte, ou 2 páginas com palavras; sem SERP, só palavras; SERP de 0 ou 1 página separa), até 6; nome = keyword de maior volume; ordem pelo volume somado. "Criar artigo novo com este grupo" é explícita: checkbox por membro, confirmação e gravação por `planNewArticleFromKeywords` + `applyFormationPlan` (releitura). Sobra já marcada como reforço Forte fica com o publicado (D1). Sem volume: recolhida no fim (`<details>`), com a contagem.
- **Motivos curtos**: a sobra do modo melhorar diz "sem par com publicado ou Assunto deste Silo; formaria tema com outras N: "<maior keyword>"" — sem o rótulo da Lógica ("Precisa avaliar a adequação de … ao contexto …").
- **Catálogo das IAs** (`lib/agent/platform-catalog.ts`, AGENTS §17.1): operação "Reforçar publicados e Assuntos pela SERP" e o guia `reforcar_publicado_pela_serp` com D2.3 (volume, níveis, intenção da SERP, "Aplicar selecionadas", oportunidades, troca por Forte ou Provável de 2 páginas com palavras).
- **Simulação com os dados reais (AdalbaPro, sem custo; um Silo com as 159, porque a leitura não traz o Silo de cada keyword — limite superior):** 7 dos 25 publicados ganham sugestões com volume (Forte/Provável): "como atrair clientes para consultório" 4/5, "marketing digital para dentistas" 6/0 (artigo no teto: nenhuma marcada), "como atrair pacientes para consultório odontológico" 2/4, "como atrair pacientes sem redes sociais" 1/6, "captação de pacientes" 0/6, "como atrair pacientes para clínica" 1/3, "agência de marketing para cosméticos" 0/1. "como atrair pacientes" (7 páginas com "como atrair pacientes para clínica") deixou de ficar fora pela Lógica: entra no artigo, com aviso, e vira a troca proposta (Posto Livre). Trocas: 2 antes → 5 nesta entrega (2 Forte, 3 Provável) → 3 depois da correção da revisão (2 Forte, 1 Provável). Sobras: 120, em 49 temas (26 com mais de uma keyword); maiores: "agência de marketing" (6 keywords, soma 31.800), "botox para o rosto" (2, 29.600), "trafego pago como funciona" (5, 12.970), "tráfego pago instagram" (5.400), "botox capilar profissional" (4.400), "estética facial" (3, 3.830), "como atrair clientes" (6, 3.180), "limpeza de pele com peeling" (4, 2.880), "tráfego orgânico" (5, 1.960), "leads qualificados" (6, 1.300). Nenhuma sobra sem volume nesse lote.
- Arquivos: novos `lib/arquiteto/serp-subject-suggestions.ts`, `modules/arquiteto/leftover-opportunities-panel.tsx`; alterados `lib/arquiteto/serp-subject-overlap.ts`, `serp-subject-convergence.ts`, `serp-subject-diagnosis.ts`, `published-primary-swap.ts`, `article-formation-priority.ts`, `article-formation-editing.ts`, `modules/arquiteto/serp-subject-model.ts`, `serp-subject-panels.tsx`, `arquiteto-workspace.tsx`, `lib/agent/platform-catalog.ts` (compartilhado, aditivo); testes `tests/arquiteto-serp-mesmo-assunto.test.mts`, `tests/arquiteto-serp-mesmo-assunto-tela.test.mts`, `tests/arquiteto-precedencia-formacao.test.mts`. Consumidores preservados: sem índice de SERP, formação, convergência, troca e propostas entre Silos são as de antes; contratos só ganharam campos opcionais; nenhum schema, rota ou persistência nova.
- Testes: `test:arquiteto` 2.498/2.498 (13 novos; 5 antigos atualizados para a D2.3: Lógica vira aviso, Provável na troca, motivo curto da sobra, resumo com sugestões), `test:arquiteto:servidor` 57/57, `test:arquiteto:lentes` 35/35, `test:agent` 54/54, Minerador por glob 1.142/1.170 (28 falhas, nenhuma nova pelo nome frente à base desta sessão; a frente do Minerador está sendo alterada em paralelo), `tsc --noEmit` limpo (config sem `.next/dev`), ESLint limpo nos arquivos alterados (o workspace tem 118 problemas antigos, nenhum nas linhas desta entrega), `git diff --check` limpo.
- Limitações: (corrigido na revisão: a Provável só por sites em comum não propõe mais troca.) Aplicar sugestão em artigo que já tem ArticleDNA muda a composição da formação como o "Mover para…" de hoje (a Definição precisa ser concluída de novo). O par de outro Silo entra em dois passos (muda de Silo; depois entra pela lista).

## Mesmo assunto pela SERP — correção dos dilemas (revisão da entrega) — 2026-09-27

Pedido do dono: trocar a principal Livre dos publicados por uma keyword com volume que divide a SERP, sem mexer no slug travado, e "caprichar essa resposta do sistema a estes dilemas". Regras: Parte D (D1.3, D2.1, D2.2) de [regras da SERP e dos Assuntos](../compartilhado/regras-serp-e-assuntos-2026-09-26.md).
**Estado desta correção:** verificado no código e confirmado por testes locais com a fixture da leitura real e por simulação da medida completa da AdalbaPro (159 keywords, 25 publicados, top 10 do cache; sem rede) nos três Postos. **Não validado manualmente** na tela real — a homologação é do usuário. Não houve escrita remota, SQL, migration, chamada paga, servidor, build nem git com mudança de estado.

- **Par em outro artigo** (estado novo `pair_in_other_article`, rótulo "Par em outro artigo"): quando o par real do publicado (ou do Assunto) está no MESMO Silo, mas já em outro artigo, o cartão deixou de dizer "nenhuma keyword deste lote trata do mesmo assunto no Google" (era falso). Agora diz qual keyword, em que artigo, quantas páginas divide com cada lado, avisa quando dois publicados disputam o mesmo assunto (canibalização) e oferece "Abrir o artigo …", que abre o artigo na mesa (o mesmo nó do mapa); lá, "Mover para…" leva a keyword com prévia do efeito. Abrir não move nada. Na AdalbaPro: "como atrair pacientes para consultório odontológico" e "como atrair pacientes sem redes sociais" (antes "Sem par no lote").
- **Volume entre os pares fortes (D1.3)**: entre as keywords que o Google junta (3+ páginas), entra primeiro a de maior volume; com o mesmo volume, mais páginas; palavras só desempatam (`strongSerpVolumeWeight` em `serp-subject-convergence.ts`; a faixa forte continua entre 1 e 2, acima de apoio e de palavras). Em "marketing digital para dentistas", "marketing para dentistas" (210, 3 páginas) e "marketing dentista" (70) entram no lugar de keywords de volume 10 com 4 páginas, e a troca proposta passa a ser aplicável.
- **Substituta que não cabe**: a troca só é proposta com uma substituta que já está no artigo ou que cabe nele. Se a melhor está fora de um artigo cheio, o cartão diz qual é (`substituteOutsideFullArticle`) e oferece "Abrir este artigo para liberar uma vaga" — nunca mais um "Aplicar troca" inativo sem saída.
- **Posto Livre sem substituta** vem no título do cartão, com "Buscar reforço". Uma keyword só na vizinhança do Google (2 páginas) é dita como tal ("na vizinhança do Google") no título e na recusa (`serp_support`: "serve para reforçar, mas assumir a principal exige 3 ou mais"); o título não diz mais "divide a SERP" dela.
- **Posto não declarado**: o cartão diz "Posto: não declarado (o Minerador mostra 'Travado ao slug' por padrão, mas ninguém declarou)" e mostra qual seria a troca se o dono declarasse "Livre" (`swapIfDeclaredFree`, só informação). Nada é proposto nem bloqueado sem declaração (AGENTS §11).
- **SERP vencida × nunca coletada**: a leitura devolve `collectedAt` na lente que existe mas não serve (aditivo em `missingLenses`); `serpGapsFromMissingLenses` separa `stale`, `never` e `unusable`, e o cartão diz "A SERP de … venceu (coletada há N dias; validade de 30)" com "Coletar de novo (pago, com plano)", ou "nunca teve a SERP coletada".
- **Posto relido na hora de gravar**: "Aplicar troca" relê `primary_keyword_policy` das publicadas no Minerador (só essa coluna, marca ativa, RLS) antes de decidir; travado, não declarado ou diferente do que a mesa mostrou recusa a troca com o motivo (`freshPublishedPostOf`, `freshPostRefusal`).
- **Métricas da nova principal**: a nova versão do ArticleDNA leva `primaryKeywordMetrics`, `volumeStrategy` (principal e secundárias; combinado igual, pois o conjunto não muda), `keywordStrategy` (DNA, volume, status KGR, narrativa) e `kgrIdentity` (principal, volume, KGR; confirmada volta a candidata, slug publicado igual) da nova principal. Métrica desconhecida vira `null`, nunca o número da antiga. Só campos que o schema já aceita.
- **Leitura do cache na sessão**: a resposta fica no `sessionStorage` da aba, por marca, com a assinatura do conjunto e a hora; reabrir a aba ou recarregar em até 20 minutos reaproveita sem consulta nova, e o painel diz isso. "Reler o cache de SERP" sempre relê.
- Simulação real (AdalbaPro, sem rede): Posto Livre → 3 trocas propostas ("como atrair clientes para consultório" → "como atrair pacientes para o consultório", vol 20, 5 páginas; "marketing digital para dentistas" → "marketing para dentistas", vol 210, 3 páginas; "como atrair pacientes para clínica" → "como atrair clientes para clinica medica", vol 10, 4 páginas, Comercial), 2 reforçados, 2 pares em outro artigo, 1 sem SERP, 18 sem par no lote; nenhuma keyword duplicada ou sumida; teto de 6 respeitado. Travado e não declarado: nenhuma troca.
- Arquivos: `lib/arquiteto/serp-subject-convergence.ts`, `serp-subject-diagnosis.ts`, `published-primary-swap.ts`, `lib/server/arquiteto-serp-subject-store.ts` (aditivo), `modules/arquiteto/serp-subject-model.ts`, `serp-subject-panels.tsx`, `arquiteto-workspace.tsx`, `lib/agent/platform-catalog.ts`, testes `tests/arquiteto-serp-mesmo-assunto.test.mts` (+6) e `-tela.test.mts` (+5).
- Testes: `test:arquiteto` 2.485/2.485, `test:arquiteto:servidor` 57/57, `test:arquiteto:lentes` 35/35, `test:agent` 54/54, Minerador por glob 1.137/1.165 (28 falhas, todas da base; nenhuma nova), `tsc --noEmit` limpo no código (ver a limitação do arquivo gerado), `git diff --check` limpo.
- Limitações: "Manter" continua só no navegador (decisão do dono pendente). O servidor ainda não bloqueia, por conta própria, a gravação de `principalKeywordId` diferente em ArticleDNA publicado sem decisão confirmada e Posto Livre (a tela relê o Posto antes; o bloqueio no servidor é mudança de persistência e pede SDD). A formação ainda ancora o candidato na publicada depois da troca aplicada. O `tsc` do projeto inteiro esbarrou em `.next/dev/types/routes.d.ts` truncado pelo `next dev` em execução (arquivo gerado, fora desta entrega).

## Mesmo assunto pela SERP — a tela dos dilemas (publicados e Assuntos) — 2026-09-26

Pedido do dono: "caprichar essa resposta do sistema a estes dilemas, que vai ter muito". Regras: Parte D (D1, D2, D2.1, D2.2) de [regras da SERP e dos Assuntos](../compartilhado/regras-serp-e-assuntos-2026-09-26.md).
**Estado desta entrega:** verificado no código e confirmado por testes locais (sem rede, fixture da leitura real). **Não validado manualmente** na tela real — a homologação é do usuário. Não houve escrita remota, SQL, migration, chamada paga, servidor nem build.

- **Leitura da SERP da mesa** (`arquiteto-workspace.tsx`): com a aba Artigos aberta, a mesa pede `POST /api/arquiteto/serp-subject` uma vez por marca e por conjunto de keywords dos Silos confirmados (publicados e Assuntos primeiro, lotes de até 600, `planSerpSubjectRead`), monta `buildSerpSubjectIndex` e o entrega a `planSiloArticleFormation`, `proposeCrossSiloReinforcements` e às três chamadas de `suggestSubjectSupport`. O painel mostra o custo de leitura (egress: consultas, entradas, KB) e diz "Nenhuma chamada paga ao provider". Sem leitura (ou com falha), a formação é a de antes e o painel diz isso. "Reler o cache de SERP" relê.
- **Painel "Mesmo assunto no Google · publicados e Assuntos"** (`serp-subject-panels.tsx`, modelo puro em `serp-subject-model.ts`): resumo do lote (Reforçados, Trocas sugeridas, Pares em outros Silos, Sem par no lote, Sem demanda no Google, e os demais), filtro por estado (padrão "Pedem decisão") e um cartão por publicado e Assunto com frase curta e o ato:
  - Reforçado: "Reforçado com N keywords que dividem a SERP[ e M só por palavras]. Cabem mais K." (Assunto: "Assunto sustentado por…"); Posto Livre sem substituta oferece "Buscar reforço".
  - Troca proposta: "Troca da principal sugerida: <nova> (volume X, Y páginas em comum). URL e slug continuam." com "Aplicar troca" / "Manter".
  - Par em outro Silo: "O par está no Silo <X>: trazer?" com "Trazer para este artigo" (a mesma decisão de Silo da aba Silos, com lock e releitura).
  - Sem par no lote: "Nenhuma keyword deste lote trata do mesmo assunto no Google." com "Buscar reforço".
  - Tema sem demanda no Google: quando a busca de reforço já rodou e nenhuma candidata tem volume do Google Ads (lido da lista local da Pesquisa por Assunto, só leitura, nada apagado).
  - Par com intenção diferente, Par sem volume e Sem SERP no cache, com "Revisar a intenção no Minerador", "Medir volume no Minerador" ou "Coletar SERP (pago, com plano)" (o caminho pago que já existe, com plano e confirmação; depois a mesa relê o cache).
  - Posto não declarado em publicado (AGENTS §11): o cartão diz e oferece "Declarar o Posto no Minerador". Só `primary_keyword_policy` gravado conta como declaração; o padrão "Travado" do Minerador não é tratado como decisão.
  - "Ver a evidência": as páginas em comum no top 10 com as lentes em que cada uma aparece dos dois lados, a lente que falta no cache, e os detalhes do domínio (canibalização entre publicados, barradas pelo DNA, pares já em outro artigo, recusas da substituta).
- **Aplicar troca (D2.1)**: grava NOVA versão do ArticleDNA do artigo publicado, em revisão, pela porta de versão existente (`persistArticleSubjectVersion`), com `decidePublishedPrimarySwap` (ator autenticado e hora) e `buildPublishedSwapArticlePayload`: nova principal, antiga como secundária, reforço narrativo preservado, `primaryKeywordCandidates`/`primaryKeywordDecision` confirmados, histórico no `primaryKeywordPolicyContext` (Posto inalterado), alerta; URL, slug, canonical, marca e identidade copiados. Passa pelo `ArticleDNASchema` de hoje (nenhum campo novo; rollback seguro acima da F2·A). Sucesso só depois da releitura (`loadCanonicalArquitetoWorkspace`). O botão só fica ativo com Posto Livre, ArticleDNA existente e a substituta dentro dele; senão diz o que falta.
- **Reconciliação** (`reconciliationPrincipalKeywordId`): o ArticleDNA com troca confirmada de uma principal publicada se reconcilia com o candidato da mesa pela publicada anterior — sem isso ele iria ao acervo como "outra principal". Muda só esse caso.
- **Manter**: não grava versão (nova versão só com mudança real); fica em `localStorage` por marca, como estado de apresentação, e volta se a substituta mudar. "Rever a sugestão" desfaz.
- **Aceitar em grupo**: marca trocas e reforços de outro Silo, confirma num diálogo (foco preso, Escape, rótulos) e anuncia só o que a releitura confirmou (`describeSerpSubjectBatchOutcome`).
- **Artigo selecionado**: `ArticleFormationPanel` ganhou a prop opcional `selectedCandidateSerp` e mostra o mesmo cartão.
- **Minerador — Buscar reforço de publicado**: `?modo=assunto&reforco=<id>` (`parseReinforcementSearchLink`, `reinforcementSearchFields`, `use-reinforcement-link.ts`): lê só a keyword, na marca da rota, com colunas estreitas (`id,keyword,status,site_origin,primary_keyword_policy`), e preenche tema = principal publicada, página de destino = URL do artigo e nota. Nada é pesquisado sozinho. `parseSubjectSearchLink` e o link de Assunto (`&assunto=<id>`) não mudaram.
- Arquivos: novos `modules/arquiteto/serp-subject-model.ts`, `modules/arquiteto/serp-subject-panels.tsx`, `modules/minerador/discovery/use-reinforcement-link.ts`, `tests/arquiteto-serp-mesmo-assunto-tela.test.mts`; alterados `arquiteto-workspace.tsx`, `article-formation-panel.tsx` (prop opcional), `subject-panels.tsx` (exporta `useSubjectDialogFocus`), `subject-search-model.ts` e `discovery-keywords-page.tsx` (aditivos), `platform-catalog.ts`, `package.json` (teste novo em `test:arquiteto`).
- Testes: `test:arquiteto` 2.474/2.474 (16 novos da tela), `test:arquiteto:servidor` 57/57, `test:arquiteto:lentes` 35/35, `test:agent` 44/44, Minerador por glob com as mesmas 29 falhas da base desta sessão (nenhuma nova), `tsc --noEmit`, ESLint dos arquivos novos e alterados menores, `git diff --check`. ESLint do workspace monolítico só roda com heap maior (12 GB): 118 problemas antigos (41 erros, 77 avisos), nenhum nas linhas desta entrega.
- Limitações: a formação ainda ancora o artigo publicado na keyword publicada; depois da troca aplicada, o candidato da mesa continua mostrando a publicada como "P" enquanto o ArticleDNA (em revisão) já tem a nova principal — o cartão diz "Troca aplicada". "Manter" é local ao navegador. A busca de reforço de publicado casa pela frase e pela URL de destino da lista local (sem campo novo no registro).

## Mesmo assunto pela SERP: reforço, troca da principal Livre e dilemas (domínio e servidor) — 2026-09-26

Regras do dono: Parte D de [regras da SERP e dos Assuntos](../compartilhado/regras-serp-e-assuntos-2026-09-26.md) (D1, D2, D2.1, D2.2).
**Estado desta entrega:** verificado no código e confirmado por testes locais com
fixture da leitura real (`test:arquiteto` 2.458/2.458; `test:arquiteto:servidor`
57/57; `test:arquiteto:lentes` 35/35; `test:agent` 44/44; Minerador por glob com
as mesmas 31 falhas antigas da base, nenhuma nova; `tsc --noEmit`; `git diff
--check`). A tela (consumo do índice e do diagnóstico) é outra parte da entrega
e não está aqui. Não houve escrita remota, SQL, migration nem chamada paga.

- **Medida de mesmo assunto** (`lib/arquiteto/serp-subject-overlap.ts`): páginas
  em comum no top 10, união das 4 lentes, do cache já pago. Régua nomeada e
  calibrada em 12.561 pares reais da AdalbaPro: 3+ páginas forte, 2 apoio, 1
  ruído, 0 nenhuma; sem páginas no cache é `unknown`, nunca zero.
- **Convergência com a âncora** (`serp-subject-convergence.ts`): SERP forte
  entra mesmo com poucas palavras; apoio só com palavras; fraca ou nenhuma barra
  palavras parecidas; sem SERP volta às palavras, dizendo isso. Contradição de
  DNA continua barrando. Sem índice, a formação é byte a byte a de antes.
- **Formação** (`article-formation-priority.ts`, `published-silo-membership.ts`):
  `serpSubject` opcional em `planSiloArticleFormation`, `reservePriorityArticleGroups`
  e `proposeCrossSiloReinforcements`; reforço de publicado, sustentação de
  Assunto (medida também contra a frase declarada) e propostas entre Silos
  usam a SERP como critério principal, com teto de 6 e publicado antes de
  Assunto. `suggestSubjectSupport` ganhou o sinal `serp_shared_pages`.
- **Troca da principal (D2.1)** (`published-primary-swap.ts`): Posto Livre
  propõe a substituta com Volume validado maior, mesma intenção e SERP forte;
  Travado ao slug nunca propõe; Posto não declarado não libera nem bloqueia.
  `decidePublishedPrimarySwap` aplica só com ator e hora, confere Posto atual,
  principal vigente e teto, mantém URL/slug/canonical e rebaixa a antiga a
  secundária; devolve `primaryKeywordCandidates`/`primaryKeywordDecision` que o
  ArticleDNA já aceita (nenhum formato novo; rollback seguro acima da F2·A).
- **Diagnóstico** (`serp-subject-diagnosis.ts`): um estado por publicado e por
  Assunto — Troca proposta, Reforçado, Par em outro Silo, Par sem volume, Par
  com intenção diferente, Sem SERP no cache, Tema sem demanda no Google, Sem
  par no lote (Buscar reforço) — com frase, detalhes (canibalização entre
  publicados, barrados pelo DNA, pares já em outro artigo) e ações.
- **Servidor**: `POST /api/arquiteto/serp-subject` (só leitura, permissão
  `arquiteto:view`) com `readSerpSubjectFootprints`: meta, 10 URLs do digest e
  domínios da observação por caminho JSON, lotes de 100, filtro de marca;
  ~1,5 KB por keyword × lente, custo lido devolvido em `egress`. O corpo da
  lente canônica não é lido (entra pelos domínios).
- Catálogo MCP: operação `arquiteto.serp_subject_dilemmas`, duas regras de SEO
  e o playbook `reforcar_publicado_pela_serp`.

## Formação automática a partir de Assuntos — 2026-09-26

SDD autorizada: [formação automática](sdd-automatizacao-assuntos-2026-09-26.md).
**Estado desta entrega:** verificado no código e confirmado por testes locais
(`test:arquiteto` 2.402/2.402; `test:agent` 44/44; `tsc --noEmit`; build de
produção Next.js 16; ESLint dos quatro arquivos auxiliares alterados). A
homologação real da marca permanece pendente do deploy do usuário. O ESLint do
arquivo monolítico `arquiteto-workspace.tsx` ainda retorna 124 erros em várias
áreas; essa dívida ampla não foi tratada nesta correção. Não houve escrita no
Supabase remoto nem chamada paga de SERP nesta entrega.

- A frase do Assunto agora participa do pareamento lexical; também entram nota,
  pesquisa por Assunto, entidade, lista, intenção e funil. A elegibilidade
  exige evidência suficiente, e os dados continuam limitados a pacotes
  aprovados já recebidos pela marca ativa.
- Um início de lote agrupa por Silo confirmado e intenção, reserva uma
  principal com Volume validado e divide em artigos de até seis keywords.
  Sustentações sem principal possível ficam sem agrupamento e recebem um
  motivo; não se perdem nem viram principal sem volume.
- O vínculo do Assunto e as decisões da cópia de trabalho são gravados pelo
  writer canônico e confirmados por readback. O Arquiteto segue para a SERP e,
  depois do readback e dos gates, materializa ArticleDNA e fecha os Silos
  elegíveis sem confirmação por artigo.
- Conteúdo publicado, slug, URL, canonical, marca e outros Assuntos presos
  continuam protegidos. Divergência, canibalização, classificação pendente,
  colisão de slug ou evidência incompleta interrompem apenas o candidato
  afetado. O plano de custo ainda exige aceite único quando a SERP precisar de
  chamadas pagas; cache válido não gera nova chamada.
- Catálogo e playbook MCP atualizados. O começo do lote continua sendo uma
  ação na interface; Claude pelo MCP consegue orientar para a tela e retomar a
  leitura, mas ainda não tem ferramenta para disparar essa formação. O MCP
  também não recebe autorização de custo por essa rota nem substitui decisões
  humanas nos candidatos bloqueados.

## Silo publicado com o endereço do site e conflitos ditos (correção da revalidação dos publicados) — 2026-09-25

```text
SLUG_DO_SILO_PUBLICADO = caminho da URL declarada no Vínculo (canônico primeiro) · antes: texto da keyword ("cuidados com cabelos" em /cabelos virava /cuidados-com-cabelos)
TERRITORIO_DO_SILO_PUBLICADO = nasce protected, publishedSlug + publishedCanonical da declaração, sem slug proposto · antes: unpublished, publishedSlug null
SILO_PUBLICADO_JA_NO_ACERVO = casa pelo endereço (sem caixa nem barra final) ou pela primária do território · atrai os artigos pela URL mesmo sem a cabeça no lote
CONFLITO_DE_ENDERECO = motivo real na linha ("Conflito para decisão humana: …") · antes: "fora de Silo"
PUBLICADA_EM_TERRITORIO_SEM_SILO_NA_URL = membership vigente preservada ("já estava") · antes: falha em todo Confirmar
REVISAO_HUMANA_COM_PUBLICADA = conflito dito no candidato (publicada não principal / duas publicadas) · a decisão humana não é trocada
IA_DOS_SILOS = todos os tetos por dúvida conferidos no cliente com a régua da rota (TERRITORIAL_AI_QUESTION_LIMITS)
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · FORMATO_ARTICLEDNA_SILODNA = inalterado · Validado manualmente: NÃO
```

Correção de revisão sobre as duas seções abaixo. O ponto central do pedido do dono — "não pode mudar o canonical dos silos nem dos artigos" — não valia para o Silo: a cabeça publicada recebia o slug do TEXTO da keyword, e `processArchitecture` criava o território com `manualSiloCandidateDraft` (proteção `unpublished`, slug proposto do texto). A SiloPage seria proposta noutro endereço, os artigos novos das livres ganhariam slug sob a raiz errada (`raiz = publishedSlug || confirmed || proposals[0]`), o patrimônio do site filtrado por `structuralRootPath === raiz` deixaria de ser reconhecido, e um território já existente com o endereço certo não seria reaproveitado.

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.**

- **Slug = caminho publicado.** `publishedPageIdentityOf` (em `lib/arquiteto/published-silo-membership.ts`) lê o caminho do canônico declarado (a URL só na falta dele), sem query, fragmento nem barra final e sem trocar a caixa; home e endereço sem host devolvem `null`. `buildArchitectureWorkingProposal` usa esse caminho como `slug` da cabeça publicada e carrega `publishedIdentity` (aditivo, só em Silo publicado). Sem URL absoluta declarada, o slug continua saindo do texto e o motivo diz isso.
- **Território protegido desde a criação.** `publishedSiloCandidateDraft` (novo, em `lib/arquiteto/silo-assignment.ts`) cria o candidato como `planSiteStructurePromotion` já fazia para estrutura publicada: `publicationProtection: "protected"`, `publishedSlug`/`publishedCanonical` da declaração, nenhum slug proposto, `territoryKind: "existing"`, `architecturalOrigin: "discovered"`. A rota de criação aceita (valida com `TerritoryCandidateSchema`; só a primária publicada nasce na criação, como antes). Consequências já existentes do `protected`: SERP não troca a primária (`serpPrimaryOriginRefusal`), split/merge destrutivo recusado; associar keyword continua permitido.
- **Sem Silo duplicado.** A cabeça publicada casa com o território existente pelo endereço (`publishedPathKey`: minúsculas, uma barra inicial, sem barra final) e, na falta dele, pela primária do território (`ExistingSilo.primaryKeywordId`, aditivo) — o Silo criado antes desta correção com o slug do texto continua sendo o mesmo Silo (o slug gravado nele não é reescrito aqui; ver backlog).
- **Silo publicado que só está no acervo.** `resolvePublishedSiloMembership` aceita `territorySilos` (territórios `protected` com `publishedCanonical`): o artigo publicado entra pelo endereço mesmo sem a cabeça no lote. A cabeça do lote tem precedência sobre o território de mesmo endereço (sem conflito falso).
- **Conflito com o motivo real.** `publishedSiloConflicts` (aditivo) leva à proposta os conflitos do endereço (dois Silos com o mesmo endereço, publicada sem URL absoluta); a linha diz "Conflito para decisão humana: …" em vez de "fora de Silo". O motivo genérico passou a dizer "fora de Silo reconhecido" e sugere importar a cabeça.
- **Membership vigente preservada.** `planSiloDecisionBatch`: publicada com território atual, sem destino declarado pelo site e proposta "sem Silo" vira "já estava" — nem escrita, nem falha. Livre continua podendo sair do Silo.
- **Revisão humana com publicada.** `buildArticleFormationUniverse` (compartilhado, mudança aditiva): no grupo de revisão humana, publicada que não é a principal, ou duas publicadas juntas, geram conflito no candidato; a principal escolhida pela pessoa não é trocada.
- **IA dos silos.** `TERRITORIAL_AI_QUESTION_LIMITS` (em `lib/arquiteto/serp-blocks.ts`) é a régua única: a rota a importa para os seis tetos por lista, e `splitTerritorialAiQuestions` devolve `overflow` com a lista que estourou ("logicFacts 612/500"); a mesa nomeia a dúvida e a lista em vez de o bloco inteiro voltar 400.
- **Teste estrutural do handler de IA** (`tests/arquiteto-territorial-ai.test.mts`) delimita `reviewTerritorialWithAi` pela âncora seguinte, não por 5400 caracteres.

Arquivos: `lib/arquiteto/published-silo-membership.ts`, `lib/arquiteto/architecture-working-proposal.ts`, `lib/arquiteto/silo-assignment.ts`, `lib/arquiteto/silo-decision-batch.ts`, `lib/arquiteto/article-formation.ts`, `lib/arquiteto/serp-blocks.ts`, `app/api/arquiteto/territorial-ai/route.ts`, `modules/arquiteto/arquiteto-workspace.tsx` (criação do território, entrada da proposta e da membership, aviso da IA), `tests/arquiteto-publicados-revalidacao.test.mts` (23/23), `tests/arquiteto-serp-em-blocos.test.mts` (15/15), `tests/arquiteto-territorial-ai.test.mts`.

Consumidores preservados: chamadores de `buildArchitectureWorkingProposal` sem as entradas novas recebem a proposta de antes; Silo não publicado continua com o slug do texto e `manualSiloCandidateDraft`; `resolvePublishedSiloMembership` sem `territorySilos` devolve o mesmo resultado (mais o campo `territoryHeads`, vazio); `splitTerritorialAiQuestions` mantém `blocks` e `oversized`. Suítes por nome contra a base: nenhuma falha nova (ver backlog).

## Publicados revalidados: Vínculo, Silo pela URL e remontagem (partes 1 a 3 da revalidação dos publicados) — 2026-09-25

```text
PUBLICADA = status legado OU publicação declarada no Vínculo (resolver do Minerador, pacote aprovado) · Validado manualmente: NÃO
SILO_DO_ARTIGO_PUBLICADO = pela URL canônica (prefixo de caminho no mesmo host, marca ativa) · antes: afinidade léxica
PUBLICADA_SEM_SILO_NA_URL = fora de Silo, com motivo · nunca semente de Silo novo
REMONTAR = livre com afinidade de canibalização entra no artigo publicado (teto 6) · a publicada continua principal
IDENTIDADE_PUBLICADA = URL, slug, canonical e marca intocados · a trava do PATCH cobre o Vínculo
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · FORMATO_ARTICLEDNA_SILODNA = inalterado
```

Cenário do dono: ~200 keywords no Arquiteto — 4 Silos publicados, 21 artigos publicados (URL, Vínculo declarado, aprovados no Minerador) e ~130 livres. A arquitetura publicada já foi formada e comprovada; o Arquiteto só revalida e remonta, sem mudar canonical de Silo nem de artigo, e reconhece pelo link qual artigo é de qual Silo.

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.**

- **(1) Publicada = Vínculo ou status legado.** Antes, `isPublished` só era verdadeiro com `status = "publicado"`; a publicada declarada pelo Vínculo chegava como `aprovado` e perdia artigo próprio, principal preferida e a trava do PATCH. `lib/arquiteto/published-identity.ts` (novo) responde pela autoridade do Minerador (`readArchitectKeywordVinculo` → `resolveKeywordVinculo`, a partir do pacote aprovado do item; `site_origin` em texto JSON continua lido). `buildCanonicalWorkflowWorkspaceItems` usa essa resposta; a publicada pelo Vínculo traz `publishedUrl` e `canonical` só para leitura e **não** herda `lista_id` como Silo (o legado continua como era). Com isso passam a valer para ela: artigo próprio na formação, principal preferida (`suggestPrincipal`), slug não sugerido e a trava do PATCH. A rota `PATCH /api/arquiteto/workspace` pergunta com o pacote aprovado que o próprio item carrega (nenhuma leitura nova do banco) e recusa os campos de `PUBLISHED_IDENTITY_ASSIGNMENT_KEYS`, a lista única que a mesa também usa: `persistWorkingCopyAssignments` não envia esses campos para publicada (`withoutPublishedIdentityKeys`), e decisão KGR, hierarquia e `workingArticleId` continuam gravando. `territoryRef` não é identidade e continua passando.
- **(2) Membro de Silo pela URL.** `lib/arquiteto/published-silo-membership.ts` (novo): `resolvePublishedSiloMembership` põe cada artigo publicado no Silo publicado da marca ativa cuja URL canônica é prefixo do caminho dele no mesmo host (protocolo, `www.`, barra final, query, fragmento e caixa normalizados; vence o Silo mais profundo; `/skincare-facial` não está sob `/skincare`; a home nunca é Silo). Dois Silos com o mesmo endereço viram conflito, não palpite; artigo sem Silo acima dele fica fora. `buildArchitectureWorkingProposal` ganhou duas entradas opcionais (`publishedKeywordIds`, `publishedSiloHeadByArticle`): a cabeça publicada continua sendo o Silo, com a primária declarada; o artigo pela URL entra nele com `declaredBy: "published_url"` e o motivo "Membro declarado pelo site"; a publicada sem Silo na URL vai para "Sem silo" com o motivo dito; a publicada nunca é semente léxica nem termo guarda-chuva. `declaredBy` fica fora do `proposalHash`. Sem as entradas novas, a proposta é a de antes (teste).
- **Confirmar arquitetura.** A decisão que vem de `declaredBy` sobe com `declaredBySite`; `planSiloDecisionBatch` passa `declaredTerritoryRef` ao mesmo `planSiloAssignment`, que admite a publicada **só** nesse destino (continua `PUBLISHED_KEYWORD_PROTECTED` para qualquer outro). Publicada já fora de Silo e mantida fora vira "já estava", sem escrita e sem falha. O que sobe é só `territoryRef` + `territoryAssignment`.
- **(3) Revalidar e remontar.** Na proposta, o grupo léxico que tem artigo publicado de um Silo vai para esse Silo: as livres se reagrupam em torno do que está no ar, sem Silo novo. Na formação de artigos (`articleFormation`), `regroupFreeAroundPublished` põe no artigo publicado a livre que pede o mesmo conteúdo (afinidade no piso de canibalização, `CANNIBAL_FLOOR`), até o teto de seis; a publicada continua principal, duas publicadas nunca se fundem, decisão humana de formação e Assunto retido não são tocados, e o núcleo que perdeu a principal elege outra. O porquê aparece no painel de núcleo ("Remontada em torno do artigo publicado …").

Arquivos: `lib/arquiteto/published-identity.ts` (novo), `lib/arquiteto/published-silo-membership.ts` (novo), `lib/arquiteto/canonical-workspace.ts`, `lib/arquiteto/architecture-working-proposal.ts`, `lib/arquiteto/silo-assignment.ts`, `lib/arquiteto/silo-decision-batch.ts`, `app/api/arquiteto/workspace/route.ts`, `modules/arquiteto/arquiteto-workspace.tsx` (gravação da cópia de trabalho, formação, entrada da proposta e Confirmar), `tests/arquiteto-publicados-revalidacao.test.mts` (novo, 15/15) e `package.json` (o teste novo no `test:arquiteto`). Compartilhado consumido sem mudança: `lib/minerador/editorial-status.ts` (`isLegacyPublishedStatus`) e o resolver do Vínculo.

Consumidores preservados: chamadores de `buildArchitectureWorkingProposal`, `planSiloAssignment` e `planSiloDecisionBatch` sem os campos novos recebem o resultado de antes; keyword livre não ganha campo novo na projeção; o legado `publicado` segue com `lista_id` como Silo protegido.

Testes (fixture sintética de 4 Silos + 21 publicados + 130 livres, sem rede): publicada pelo Vínculo, pelo pacote aprovado e pelo status legado; candidata não conta; projeção canônica; endereço normalizado; 20 de 21 artigos no Silo certo e 1 fora, inclusive o de léxico enganoso e o aninhado; outra marca ignorada; endereço duplicado vira conflito; proposta cobrindo as 155 keywords sem Silo semeado por publicada; livres atraídas pelo Silo do artigo publicado; membership só no destino declarado; remontagem com teto e decisão humana preservada. Suítes: `test:arquiteto` 2381/2383 (só as 2 falhas da base; numa rodada intermediária apareceu `o provider nunca aparece na interface`, de `reviewTerritorialWithAi`, que a parte 4 alterava em paralelo e que voltou a passar), `test:arquiteto:servidor` 52/52, `test:arquiteto:lentes` 31/31, `test:arquiteto-backup-roundtrip` 8/8, `test:editorial` 170/174 (as 4 da base), Minerador por glob 1134/1161 (27 falhas, todas da base). `tsc --noEmit` limpo; lint sem aviso novo nas faixas alteradas.

Limites: homologação manual do usuário pendente; o encaixe pela URL depende de a cabeça do Silo publicado estar no lote (ou já existir como território com o mesmo slug) — Silo que só existe no acervo, sem a cabeça no lote, não atrai pela URL; o território criado para um Silo publicado continua nascendo com `publicationProtection: "unpublished"` e sem `publishedSlug` (a primária leva URL e canonical); publicada que já tinha sido posta por afinidade em outro Silo antes desta mudança é recusada ao Confirmar e conta como falha até decisão humana; landing e página de serviço publicadas não entram em Silo pela URL (só `article`).

## Blocos em sequência e leitura paginada (parte 4 da revalidação dos publicados) — 2026-09-25

```text
BLOCOS = no código · Validado manualmente: NÃO · homologação do usuário pendente
PROCESSAR_ARTIGOS_SERP = blocos de até 20 artigos (e 20 candidatas a Silo) · plano de todos antes · UMA confirmação com a soma · cada bloco paga o número do plano dele
SERP_DOS_SILOS = todas as dúvidas, em blocos de 10 (antes: slice(0, 10) em silêncio)
IA_DOS_SILOS = todas as dúvidas prontas, em blocos de 6 (antes: só as 6 primeiras) · knownKeywordIds = escopo aberto da dúvida (antes: a mesa inteira)
LEITURA_DE_VERSOES = paginada de 1000 em 1000 (antes: cortada em max_rows = 1000, perdendo as mais novas)
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · FORMATO_ARTICLEDNA_SILODNA = inalterado
```

Cenário do dono: ~200 keywords no Arquiteto (4 Silos publicados, 21 artigos publicados e ~130 livres). As rotas têm teto por pedido e o cliente mandava tudo de uma vez: acima do teto, a rota devolvia 400 e nada era processado; onde o cliente cortava antes (`slice`), o resto ficava sem SERP e sem aviso.

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.**

- **Helper puro `lib/arquiteto/serp-blocks.ts` (novo).** `splitFormationSerpBlocks` divide os artigos em blocos equilibrados de até 20; as candidatas a Silo vão em fatias de até 20, uma por bloco (todo bloco leva ao menos um artigo, como a rota exige); a candidata que não cabe volta em `leftoverSiloCandidates` e a mesa a nomeia. `planPaidSerpBlocks` lê o plano (modo `plan`, sem pagar) de todos os blocos e soma com `mergeSerpPaidPlans`; `executePaidSerpBlocks` executa bloco a bloco com `choiceForSerpBlock` (a opção escolhida sobre a soma aplicada ao plano de cada bloco: tudo, só a principal ou recoleta). Exceção de um bloco vira falha dos itens dele e o próximo segue; o bloco nunca é repetido. Com um bloco só, falha do plano sobe como antes. `formatSerpBlockProgress` escreve "bloco N de M · faltam R" e, no fim, "Concluído: X ok, Y com falha" (`lib/ui/batch-progress.ts`, reutilizado sem mudança).
- **Processar artigos / Validar SERP (`confirmSerpValidation`).** O pedido de antes virou `serpRequestBase` e cada bloco manda os seus `groups` e `siloCandidates`. O plano de todos vem primeiro, `askSerpPaidPlan` pergunta uma vez (o título diz quantos artigos em quantos blocos), e só então os artigos entram em "processando". O resultado dos blocos é juntado no mesmo formato de antes, então a mescla, a gravação local, a releitura do remoto (`loadCanonicalArquitetoWorkspace`) e os avisos não mudaram. O bloco que caiu inteiro nomeia os artigos dele (`SERP_BLOCK_FAILED`, "Bloco N de M: motivo"). Orçamento: cada pedido leva o `authorizedPaidQueries` do plano do bloco e o servidor continua com `createPaidQueryBudget` por pedido. A rota `/api/arquiteto/serp` **não mudou**.
- **SERP dos silos (`validateTerritorialSerp`).** Todas as dúvidas, em blocos de 10, com a mesma regra de plano, confirmação única e autorização por bloco. Cada bloco entra na mesa assim que volta; falha de consulta continua sem apagar parecer válido anterior. A rota não mudou.
- **IA dos silos (`reviewTerritorialWithAi`).** Todas as dúvidas prontas, em blocos de 6, pelo `runProgressiveBatch`. `knownKeywordIds` passa a ser o escopo aberto da dúvida (`territorialAiKeywordScope`: as keywords do Silo da dúvida, as do Silo comparado e as que a hipótese da lógica cita), não a mesa inteira. Rota `/api/arquiteto/territorial-ai`: tetos por dúvida subiram de 80/40/200 para 520/500/500 (`TERRITORIAL_AI_KEYWORD_LIMIT = 500`), porque um Silo real passa de 74 keywords associadas e de 40 hipóteses e o pedido inteiro voltava 400. O teto de 6 dúvidas por pedido ficou. Dúvida acima de 500 keywords não é enviada cortada: a mesa a nomeia. Os fatos enviados são os mesmos de antes, então o `baseHash` da proposta não muda.
- **Andamento na mesa.** Estado `serpBlockProgress`: no modo Artigos o texto entra em `serpProgress` ("SERP em andamento · bloco 2 de 4 · faltam 32"); no modo Silos, no `progress` dos botões SERP e IA. Com um bloco só, nada muda na tela. Sem cor, componente ou tamanho novo.
- **Leitura paginada (`lib/server/pipeline-repositories.ts`, compartilhado).** `ArtifactVersionRepository.list` pede páginas de 1000 (`ARTIFACT_VERSION_PAGE_SIZE`, igual a `max_rows`) com desempate estável por `version_id` e `range`, até a página vir incompleta; página repetida não duplica linha e há teto de 100 páginas. Filtros de marca, entidade e tipo seguem em cada página. Consumidores preservados: `listArquitetoArtifacts` e os validadores de append de `lib/server/arquiteto-persistence.ts`. Egress: o mesmo total que a mesa já precisava; só deixa de perder as linhas acima de 1000. Dublê de teste sem `range` lê uma página, como antes.

Arquivos: `lib/arquiteto/serp-blocks.ts` (novo), `modules/arquiteto/arquiteto-workspace.tsx` (handlers de SERP da formação, SERP dos silos, IA dos silos e o andamento), `app/api/arquiteto/territorial-ai/route.ts` (tetos por dúvida), `lib/server/pipeline-repositories.ts` (paginação), `tests/arquiteto-serp-em-blocos.test.mts` (novo, 14/14) e `package.json` (o teste novo no `test:arquiteto`).

Testes (fixtures e `fetch` falso, nenhuma chamada paga): blocos do cenário do dono sem perder nem duplicar artigo; uma confirmação com a soma e pagamento igual ao confirmado; plano de todos antes de executar; falha de um bloco sem parar os outros; cancelar sem executar; escopo da IA; paginação de 2500 versões com a mais nova de volta. Limites: validação manual, 360/768/1024/1440 px e temas não feitos; tempo real de uma rodada com 4 blocos não medido.

## Assunto declarado: fase B da F2 (o Arquiteto grava `subject`) — 2026-09-24

```text
F2_FASE_B = no código · Validado manualmente: NÃO · homologação do usuário pendente
GRAVA_SUBJECT = ArticleDNA (qualquer unidade), SiloDNA sem SiloPage e par SiloDNA+SiloPage da consolidação · só por ato humano
GUARDA_SERVIDOR = writer de ArticleDNA/SiloDNA, par do Silo, consolidação do Silo e PATCH da cópia de trabalho · só quando o subject é novo ou mudou
VINCULO_FORMACAO = gravado em articleSubjectAnchor, no item da principal · sobrevive ao recarregar
DIFF_VERSAO = subject é decisão editorial · attachedBy e attachedAt são carimbos
CONSERVACAO = um predicado (isAnchoredSubject) e uma lista de troncos em todos os cálculos da F2.3
GATE_Q7 = SUBJECT_PRINCIPAL_REQUIRES_VOLUME na conclusão e SUBJECT_PRINCIPAL_WITHOUT_VOLUME no servidor · Assunto sem Volume validado nunca é principal nem dá slug
SUGESTOES = determinísticas, só sobre keywords já recebidas · subject_discovery primeiro
IA_PEDIR_PROPOSTA = NÃO implementada (precisa de adendo)
DEPLOY = só DEPOIS da fase A no ar e conferida · ROLLBACK = nunca abaixo da fase A
MIGRATIONS_ADDED = 0 · LEITURAS_NOVAS = só estreitas, no servidor · CHAMADAS_PAGAS = 0 · MANUAL_UI_VALIDATED = NO
```

Fonte: [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), seção F2 (F2.1 a F2.6, com a emenda da F2.4 que põe `subject_discovery.subjectKeywordIds` como primeiro sinal), seções 6, 7 e 11, e o [ADR-022](../00-produto/decisoes/ADR-022-assunto-tronco-editorial.md). Contrato em [spec.md](spec.md) §33. A fase A (entrada abaixo) só aceitava o campo; nesta fase o Arquiteto passa a gravá-lo. Os itens 6 a 9 são a segunda rodada do mesmo dia: fecham as pendências de servidor, de vínculo, de Silo e de diff que a primeira rodada deixou.

**Verificado no código e confirmado por teste. Validado manualmente: NÃO.**

**1. Gravar o Assunto (`lib/arquiteto/declared-subject.ts`, novo).**

- O `subject` é montado a partir do pacote aprovado, lido só pelo resolver do Minerador (`keywordDnaFromPackage`, `resolveKeywordSubject`, `readApprovedPackageRef`). `planSubjectAttachment` recusa com código: `ACTOR_REQUIRED`, `NOT_RECEIVED`, `NO_APPROVED_PACKAGE`, `CROSS_BRAND`, `NOT_DECLARED`, `SUPPORT_ROLE`, `PRINCIPAL_WITHOUT_VOLUME`, `EXCLUDED_SUBJECT` e `INVALID_SUBJECT`.
- `attachedBy` é o humano (`auth.users.id`); `deepseek` e `local-user` são recusados. `attachedAt` vem de quem chama. O servidor confere o mesmo na gravação (item 6).
- Prender e soltar são funções puras no ArticleDNA, no SiloDNA e no artigo da cópia de trabalho (`subjectKeywordId`, separado de `clusterId`). Prender o mesmo Assunto do mesmo pacote devolve `changed: false`. Prender outro Assunto numa unidade que já tem um é recusado com `ANOTHER_SUBJECT_ATTACHED`; nada troca em silêncio. O mesmo Assunto com pacote aprovado novo é aceito como atualização.
- Vale para qualquer unidade do ArticleDNA, inclusive `landing_page` e `service_page`. `centralEntity` do SiloDNA não é tocado.
- Se o Minerador retirar a declaração ou reaprovar o pacote, `resolveAttachedSubjectStanding` devolve `withdrawn`, `update_available`, `in_review` ou `not_in_mesa` com um aviso. O artigo segue com o último pacote aprovado e nada é trocado.

**2. Conservação (`AGENTS.md` §10).** Um predicado único, `isAnchoredSubject`, e uma lista só de troncos, usada pela formação, pela mesa, pelo filtro, pelo Vínculo, pelo motor e pela proposta:

- servidor (`lib/server/arquiteto-workspace.ts:279` e `:533`): "incorporada" e elegibilidade usam `articleDnaIncorporatedKeywordIds`, que inclui `subject.keywordId`;
- cenário (`lib/arquiteto/architecture-scenario.ts`): `ArticleScenarioSchema.subjectKeywordId` opcional; o tronco conta como coberto e não gera `DUPLICATE_KEYWORD` nem `KEYWORD_MISSING_FROM_COMPLETE_SCENARIO`;
- formação (`lib/arquiteto/article-formation.ts`): sobras separadas em `anchoredSubjectKeywordIds` e `awaitingSupportSubjectKeywordIds`, presentes só quando há; `automaticFormationHoldouts` tira da formação automática o Assunto sem Volume, o tronco gravado numa Definição e o tronco preso na formação, salvo quando é a principal do próprio candidato ou tem formação humana;
- motor legado (`lib/arquiteto/engine.ts`): `heldOutKeywordIds` e `anchoredKeywordIds` opcionais, com saída `anchoredSubjects`;
- território (`lib/arquiteto/territory-working-copy.ts`) e proposta (`lib/arquiteto/architecture-working-proposal.ts`): o tronco ancorado sai de `unassigned` e aparece em `anchoredSubjectKeywordIds` / `anchoredSubjects`;
- conclusão (`lib/arquiteto/article-formation-confirmation.ts`): só membros contam, então o tronco fica fora de `NO_DUPLICATED_KEYWORD` e do teto de 6;
- mesa (`modules/arquiteto/arquiteto-workspace.tsx`): "Keywords não agrupadas" sai de `splitUngroupedBySubjectAnchor`. O tronco ancorado vai para o bloco "Assuntos como tronco", com o selo "Assunto · tronco de N artigo(s)". O Assunto sem artigo continua em não agrupadas com o selo "Assunto · aguardando sustentação". A contagem "sem grupo" usa a mesma lista.

Um Assunto que é a principal de alguma unidade não é tronco solto (`trunkAnchoredKeywordIds`) e continua na formação. Uma Definição gravada fora do cenário atual também conta como tronco e aparece em "Preso em" com "Soltar Assunto".

**3. Formação e gate Q7.**

- Assunto sem Volume validado sai de `disponiveis` e nunca é principal, nem com papel humano de principal. Entra como membro só por decisão humana; um grupo humano formado só por ele não vira artigo e volta às sobras.
- Gate novo `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` em `validateFormationConclusion`: só aparece quando algum artigo do lote tem Assunto preso e usa `subjectVolumeValidated`. Sem a informação, a portaria trata o Assunto-principal como sem Volume e barra o lote (lado seguro). O servidor repete a regra na gravação (item 6).
- O slug é sempre da principal eleita entre as sustentações. O Assunto nunca dá slug nem `fullPath`.
- Assunto preso como secundária ou reforço do mesmo artigo vira conflito, e o artigo não é gravado.
- O texto da trava `NO_UNRESOLVED_CANNIBALIZATION` passou para "disputam o mesmo tema" (`:501-502`).

**4. Sugestões de sustentação (`suggestSubjectSupport`).** Determinísticas, só sobre keywords já recebidas pelo Arquiteto com pacote aprovado. Ordem dos sinais: `subject_discovery.subjectKeywordIds` ("veio da Pesquisa por Assunto"), a mesma frase da pesquisa, a mesma entidade central da Lógica, a mesma lista, intenção e funil compatíveis (funil vizinho aceito) e os termos em comum com a nota. Cada sugestão traz motivo, evidência curta e a marca "já em artigo". Ficam de fora: outra marca, keyword não recebida, bloqueada ou devolvida, outro Assunto sem Volume e keyword sem sinal.

**5. Tela (`modules/arquiteto/**`).**

- "Assunto · declarado" no diálogo de importação e na linha "Vínculo:" da mesa, lido por `readArchitectKeywordVinculo` (campos opcionais `subjectLabel`, `subjectNote` e `subjectDestinationUrl` em `lib/arquiteto/editorial-unit-declaration.ts`, presentes só com declaração). O selo "aguardando sustentação" aparece na linha Vínculo só quando a keyword está de fato em não agrupadas.
- Painel "Assuntos" na aba Artigos, que funciona como filtro: cada Assunto com quantos artigos sustenta.
- "Prender Assunto", "Soltar Assunto" e "Confirmar Assunto do Silo" (`modules/arquiteto/subject-panels.tsx` e `modules/arquiteto/subject-workspace-model.ts`, novos). Com a Definição já gravada, cada ação cria uma versão `proposed` pelo gravador existente (`persistArquitetoArtifact`, ação `edit`) e a tela usa a versão que o servidor devolve. Sem Definição, o vínculo é gravado na cópia de trabalho (item 7) e vai ao ArticleDNA ao "Concluir formação".
- O vínculo só vale com candidato vivo. Quando a formação muda, `migrateWorkingSubjectAnchors` o leva ao ref que recebe a maioria dos membros (no empate, o da principal), na mesma escrita da formação (item 7). Se não houver destino, o Assunto volta a "aguardando sustentação", nunca vira tronco sem artigo.
- Silo: o Assunto do SiloDNA vira sugestão aos artigos do mesmo território (`siloSubjectTerritories`), e cada artigo confirma. Silo que já tem SiloPage é recusado, com o motivo explicado, na tela e no servidor (item 6).
- Diálogo de sustentação: mostra motivo, sinais, evidência, elegibilidade e o Silo de cada keyword, sem seleção manual por checkbox. **A ação única inicia agrupamento por intenção/Silo e processamento automático**; cada artigo tem até seis keywords, principal com Volume validado, Assunto preso como tronco e slug da principal. O fluxo grava a cópia de trabalho com readback, executa SERP se necessário, e conclui cada ArticleDNA/Silo que passar nos gates. A seção inicial deste arquivo e o SDD 2026-09-26 registram as limitações e a homologação pendente.
- Texto: a SERP da frase é opcional e se mede em Resultados, no Processador do Minerador; não há botão pago no Arquiteto (P7).
- Diálogos com foco que entra, Tab contido, Escape que fecha e foco que volta a quem abriu. Nos botões repetidos, `aria-label` distinto. Texto com pelo menos 14px e tokens.

**6. Guarda do Assunto no servidor (`lib/arquiteto/declared-subject-guard.ts`, domínio puro, e `lib/server/arquiteto-subject-guard.ts`, server-only; novos).**

- Onde roda:
  - no writer, `appendArquitetoArtifact` (`lib/server/arquiteto-persistence.ts`), para `article_dna` e `silo_dna`. Cobre a rota de artefatos, as rotas de IA, a de silos e a restauração de backup;
  - em `persistSiloPairAtomic`, com o par SiloDNA+SiloPage;
  - na consolidação canônica do Silo (`POST /api/arquiteto/silo-consolidation`): `lib/server/arquiteto-silo-consolidation-adapter.ts` chama `assertConsolidatedSiloSubject` depois de `refuseStatusEscalation` e antes da RPC `persist_silo_from_working_copy_atomic`;
  - no PATCH `/api/arquiteto/workspace`: `assertWorkingSubjectAnchorAssignment` roda antes de `repository.update` (item 7).
- Quando roda: só quando o `subject` é novo ou mudou em relação à versão vigente, que é a última versão da entidade (a mesma que `repository.append` usa). A comparação é campo a campo nos 7 campos, inclusive `attachedBy` e `attachedAt` (`sameSubjectRecord`), porque o JSONB não guarda a ordem das chaves. Subject igual passa sem ler a keyword, então quem reconclui carrega o Assunto que outra pessoa prendeu.
- O que confere:
  - `attachedBy` é o `auth.users.id` do ator da requisição; IA, e-mail e `local-user` são recusados;
  - a keyword existe, está viva, é da mesma marca e chegou ao Arquiteto;
  - o pacote aprovado a declara Assunto;
  - `approvedPackageRef`, `phrase`, `note` e `destinationUrl` batem com esse pacote;
  - Q7: o Assunto como a própria principal só passa com Volume validado. Vale também quando o subject chega igual e a nova principal passa a ser a keyword do Assunto (`subjectPrincipalRequiresCheck` e `verifySubjectAsPrincipal`); se a versão anterior já tinha o Assunto como principal, não há releitura.
- Silo:
  - versão avulsa de SiloDNA com Assunto novo num Silo que já tem SiloPage é recusada com `SUBJECT_SILO_PAGE_BOUND`, porque desalinharia o `siloDnaRef` da página. O par gravado junto (`persistSiloPairAtomic` e consolidação) não recebe essa recusa;
  - a consolidação que chega sem o Assunto da versão vigente é recusada com `SUBJECT_DROPPED` (409): recarregar a mesa e consolidar de novo; soltar o Assunto é ação própria, não efeito da consolidação.
- Restauração de backup (`lib/server/arquiteto-backup-restore.ts`): passa `{ subjectActor: "restored" }`. O autor gravado precisa ser um `auth.users.id`, não necessariamente quem restaura; keyword, marca, declaração e pacote são conferidos igual, e IA continua recusada.
- Recusas (`SubjectWriteRefusedError`): `SUBJECT_ACTOR_MISMATCH`, `SUBJECT_KEYWORD_NOT_FOUND`, `SUBJECT_CROSS_BRAND`, `SUBJECT_NOT_RECEIVED`, `SUBJECT_NO_APPROVED_PACKAGE`, `SUBJECT_NOT_DECLARED`, `SUBJECT_PACKAGE_MISMATCH`, `SUBJECT_PRINCIPAL_WITHOUT_VOLUME`, `SUBJECT_SILO_PAGE_BOUND`, `SUBJECT_DROPPED` e `SUBJECT_INVALID`. Status 403 para ator e outra marca, 409 para o resto. Falha de leitura fecha a gravação com 503, sem escrever. A resposta de erro (`pipelineArtifactErrorResponse`) ganhou o campo aditivo `subjectCode`.

**7. Vínculo da formação persistido (`app/api/arquiteto/workspace/route.ts` e `modules/arquiteto/arquiteto-workspace.tsx`).**

- Campo opcional `articleSubjectAnchor` (`WorkingSubjectAnchorSchema`: `candidateRef`, `subjectKeywordId`, `attachedBy`, `attachedAt`) no `AssignmentSchema` da rota PATCH. Ele fica gravado no item de workflow da principal da formação, chaveado por `candidateRef`, no mesmo payload jsonb: nenhuma coluna, nenhuma migration.
- Soltar (`null`) sempre passa. Prender ou trocar passa pela guarda de ator e marca (`verifyWorkingSubjectAnchorWrite`). Vínculo igual ao gravado, soltar ou atribuição sem o campo não geram leitura.
- A tela lê os vínculos gravados pelo payload dos itens que a mesa já carrega (`persistedWorkingSubjectAnchors`), grava ao prender e ao soltar e só confirma depois do readback (`planWorkingSubjectAnchorWrites`). No artigo novo formado pelas sugestões, o vínculo vai na mesma escrita da formação. Quando um plano de formação muda o ref do artigo, o vínculo vai na mesma escrita para a principal do ref novo e sai do item antigo (`workingSubjectAnchorMigrationAssignments`).
- O estado da sessão é só espelho do que o servidor já confirmou, até a mesa recarregar. Vínculo cujo candidato não existe mais não ancora nada (`liveWorkingSubjectAnchors`).
- Texto da tela (`SUBJECT_WORKING_ANCHOR_NOTE`): "Preso na formação e gravado na cópia de trabalho", e vai para a Definição quando a formação for concluída.
- Sem Assunto, o campo não é enviado, e o payload e o hash do item não mudam.

**8. Silo consolidado com Assunto (`lib/arquiteto/silo-consolidation.ts`).** A consolidação já carregava o `subject` pelo spread da versão anterior, porque o `copy.id` é o `existingSiloId`; a primeira rodada registrou o contrário, por engano. Agora o carregamento é explícito e coberto por teste: o `subject` vem junto, a `centralEntity` não muda, a SiloPage nasce apontando para a versão nova e não lê o Assunto. Sem Assunto, 40 de 40 fixtures saem idênticas ao HEAD em bytes e hash.

**9. Diff de versão (`lib/arquiteto/article-editorial-diff.ts`, CRLF preservado).** `subject` entrou em `EDITORIAL_DECISION_FIELDS`, e `attachedAt` e `attachedBy` passaram a ser carimbos. Prender, soltar e pacote novo são revisão; autor e data sozinhos não são. `scripts/arquiteto-audit-version-diff.mts` (CRLF preservado) usa a mesma lista (`CAMPOS_ARTICLE = EDITORIAL_DECISION_FIELDS`). Sem Assunto, o diff sai idêntico ao do HEAD em 36 de 36 casos.

**Sem Assunto, nada muda.** Formação, plano, portaria e motor saem byte a byte iguais. Os hashes dourados foram capturados rodando as versões do HEAD sobre as mesmas fixtures; na portaria, a única diferença é "assunto" → "tema". No writer, sem Assunto não há leitura nova, e a sequência de chamadas é a de antes (o teste prova). A exceção é a consolidação do Silo, que agora sempre lê a versão vigente do SiloDNA (item "Egress"); artefatos e hashes não mudam.

**Arquivos.**

- Novos na primeira rodada: `lib/arquiteto/declared-subject.ts`, `modules/arquiteto/subject-workspace-model.ts`, `modules/arquiteto/subject-panels.tsx`, `tests/arquiteto-assunto-fase-b.test.mts`, `tests/arquiteto-assunto-fixtures.mts` e `tests/arquiteto-assunto-tela.test.mts`.
- Novos na segunda rodada: `lib/arquiteto/declared-subject-guard.ts`, `lib/server/arquiteto-subject-guard.ts`, `tests/arquiteto-assunto-guarda.test.mts` e `tests/arquiteto-assunto-guarda-servidor.test.mts`.
- Alterados na primeira rodada: `lib/arquiteto/article-formation.ts` (CRLF preservado), `lib/arquiteto/article-formation-confirmation.ts` (CRLF preservado), `lib/arquiteto/architecture-scenario.ts`, `lib/arquiteto/engine.ts`, `lib/arquiteto/territory-working-copy.ts`, `lib/arquiteto/architecture-working-proposal.ts`, `lib/arquiteto/editorial-unit-declaration.ts`, `lib/server/arquiteto-workspace.ts`, `modules/arquiteto/arquiteto-workspace.tsx` e `modules/arquiteto/territorial-workspace-rows.tsx` (`KeywordVinculoLine.subject` opcional).
- Alterados na segunda rodada: `lib/server/arquiteto-persistence.ts` (5º parâmetro opcional `{ subjectActor }` em `appendArquitetoArtifact`), `lib/server/arquiteto-backup-restore.ts`, `lib/server/arquiteto-silo-consolidation-adapter.ts` (CRLF preservado), `app/api/arquiteto/workspace/route.ts`, `lib/arquiteto/article-editorial-diff.ts`, `scripts/arquiteto-audit-version-diff.mts`, `lib/arquiteto/silo-consolidation.ts`, `modules/arquiteto/arquiteto-workspace.tsx`, `modules/arquiteto/subject-workspace-model.ts`, `tests/arquiteto-assunto-tela.test.mts` (3 asserções estruturais ajustadas ao vínculo gravado) e `package.json`.
- Compartilhados e consumidores preservados: todas as extensões são opcionais e, sem elas, o resultado é o de antes. `articleSubjectAnchor` e `subjectCode` são campos opcionais e aditivos de payload de rota. Nenhum formato novo de ArticleDNA ou SiloDNA além do schema da fase A. `package.json` só ganhou arquivos no fim de scripts existentes. O Radar e o Redator não foram tocados; F3 e F4 correm em outra frente.

**Testes (fixtures, sem rede: `fetch` trocado por uma função que falha o teste, 0 chamadas).**

- Reexecutados em 2026-09-24 na redação desta entrada: `tests/arquiteto-assunto-guarda.test.mts` 19/19, `tests/arquiteto-assunto-fase-b.test.mts` 37/37, `tests/arquiteto-assunto-tela.test.mts` 24/24 e `tests/arquiteto-assunto-schema.test.mts` 16/16 (96/96); `npm run -s test:arquiteto:servidor` 52/52, com `tests/arquiteto-assunto-guarda-servidor.test.mts` 23/23.
- Os quatro primeiros estão em `test:arquiteto`; `arquiteto-assunto-guarda-servidor` está em `test:arquiteto:servidor`, que já tem `--conditions=react-server` e o registro de TS. `test:arquiteto:lentes` não roda os testes do Assunto, mas carrega a rota PATCH, que importa a guarda.
- A primeira rodada cobre os itens da F2.6: gravação e recusas, Q7, cada cálculo da conservação com fixture própria, sugestões ("SEO para clínicas" com três sustentações sem palavra em comum), slug, isolamento de marca e as ligações da tela.
- `arquiteto-assunto-guarda` (domínio): humano aceito; IA, `local-user` e e-mail recusados; outro humano recusado na sessão e aceito na restauração; outra marca, não declarado, inexistente, excluída, não recebida e sem pacote recusados; pacote divergente (versão, hash, frase, nota, destino); Q7; subject igual sem conferência, inclusive com outra ordem de chave; vínculo no item da principal, troca de dono, soltar e recarregar; migração do vínculo na mesma escrita; consolidação carregando o subject; diff; auditoria com a mesma lista (teste estrutural sem comentários).
- `arquiteto-assunto-guarda-servidor` (banco em memória): gravação com leitura estreita (colunas e filtros conferidos); recusas sem insert; subject igual grava sem ler a keyword; sem Assunto, só as 2 chamadas de antes; restauração; SiloDNA com e sem página; par da consolidação; `subjectCode`; guarda do vínculo; Q7 aceito, recusado e sem releitura; consolidação recusando IA, outro ator, outra marca (sem ler o pacote dela), não declarado e pacote divergente; `SUBJECT_DROPPED`; ordem da chamada no adaptador e na rota (estruturais, sem comentários).
- Mutantes manuais: 27 na primeira rodada e 14 na segunda (10 na guarda e no vínculo, 4 na correção), todos mortos com a suíte verde; arquivos restaurados e conferidos por md5.
- Comparação com o HEAD, em cópias temporárias já apagadas: consolidação sem Assunto 40/40 idêntica em bytes e hash; diff sem Assunto 36/36 idêntico.
- Suítes, segundo o relatório da segunda rodada: `test:arquiteto` 2352/2354 (as 2 falhas de base); `test:arquiteto:servidor` 52/52; `test:arquiteto:lentes` 31/31; `test:editorial` 170/174 (as 4 de base); Minerador 1023/1051 (as 28 de base); `test:arquiteto-backup-roundtrip` 8/8, com a restauração passando pela guarda; `test:visual-system` 5 falhas, `test:operational` 10 e `test:authz` 2, todas de base. Nenhuma falha nova por nome. `npx tsc --noEmit` limpo; ESLint nos arquivos de código novos ou alterados fora da tela sem problemas; `git diff --check` limpo.
- `tests/arquiteto-canonical-persistence.test.mts` (fora de qualquer script) não carrega por um erro antigo no próprio arquivo (propriedade de parâmetro TS, que o `node --test` recusa). Não é regressão desta fase.

**Egress e custo.**

- Tela: nenhuma leitura nova. Sugestões e selos usam só as keywords recebidas, cuja linha inteira a mesa já carrega; o índice continua sem `analise_semantica` (E8). O vínculo gravado vem do payload dos itens que a mesa já lê.
- Servidor, só com Assunto novo ou alterado, todas estreitas:
  - versão vigente: `version_id`, `payload->subject` e `payload->principalKeywordId`, filtrada por marca, entidade e tipo;
  - keyword pelo id: `id,brand_id,keyword,deleted_at`, sem filtro de marca, para a recusa dizer "outra marca" em vez de "não existe";
  - item de workflow da keyword: `state` e `payload->approvedDna`, só quando a marca confere; o pacote de outra marca nunca é lido;
  - existência de SiloPage (`version_id`, uma linha), só para SiloDNA avulso.
- Consolidação do Silo: uma leitura estreita da versão vigente do SiloDNA em toda consolidação, inclusive sem Assunto, para recusar a perda do Assunto. A consolidação é rara e já fazia várias leituras.
- Escrita: cada prender ou soltar numa Definição gravada é uma versão nova do ArticleDNA (~0,7 kB a mais por versão com Assunto, SDD F2.5). Numa formação sem Definição, é uma atualização do item de workflow da principal.
- Custo de CPU no cliente: `keywordDnaFromPackage` roda por keyword recebida. A tela memoriza com `useMemo`.
- Chamadas pagas: zero.

**Limites conhecidos e pendências.**

- **Restauração: o autor é conferido só pelo formato.** Com `subjectActor: "restored"`, `attachedBy` só precisa ter o formato de `auth.users.id` (UUID). Não se confere se o usuário existe nem se tem acesso à marca, então um backup forjado pode atribuir o Assunto a outra pessoa ou a um UUID inexistente. Mitigações atuais: IA, e-mail e `local-user` recusados; keyword, marca, declaração e pacote conferidos igual; restaurar exige permissão de edição da marca. Fechar isso exige reproduzir a autorização canônica (memberships, owner, agência e admin global); caminho sugerido: adendo que reuse `lib/server/canonical-authorization.ts`.
- **Rotas de IA perdem o Assunto em silêncio.** `app/api/arquiteto/article-dna` e `app/api/arquiteto/silo-dna` montam a versão sem `subject`. Chamadas sobre uma entidade que já tem Assunto, a versão nova o perde. Hoje elas criam a versão 1 de grupos novos. Recusar exigiria ler a versão vigente em toda gravação sem Assunto no writer, o que muda a sequência de leituras que o teste fixa.
- **Silo com SiloPage.** Prender Assunto novo continua recusado, na tela e no servidor. Falta decidir como o humano escolhe um Assunto novo para um Silo com página; caminho sugerido: a consolidação aceitar um subject escolhido e versionar o par junto. Soltar o Assunto de um Silo com página é recusado só na tela: no writer avulso, o servidor não confere remoção (na consolidação, a perda é recusada com `SUBJECT_DROPPED`).
- **Restauração aplica e só depois recusa.** A guarda roda na aplicação, não no plano. Um backup com Assunto cuja keyword não está mais declarada, ou de outra marca, é recusado no meio da aplicação, e o que já foi aplicado fica, como com qualquer recusa do writer. O plano de restauração poderia conferir antes.
- **Vínculo órfão.** Se o ref do artigo muda por um caminho em que o item antigo não está no plano, o vínculo antigo fica no payload sem efeito (`liveWorkingSubjectAnchors` o ignora). Se um candidato calculado com o mesmo ref reaparecer, ele volta a valer.
- **Ainda não verificado:** como o código da fase A se comporta com um item de workflow que já tem `articleSubjectAnchor` no payload, num rollback. O cliente da fase A não envia o campo, e o PATCH espalha o payload atual, então o esperado é o campo ficar inerte; não há teste disso.
- Prender numa Definição aprovada cria uma versão `proposed`. A aprovada continua canônica até a formação ser concluída de novo.
- Na materialização, se o Assunto preso não passa mais em `planSubjectAttachment` (retirado, sem pacote, fora da mesa), aquele artigo não é concluído e a tela avisa. É um bloqueio conservador.
- O contorno `assuntoMudou`/`sameDeclaredSubject` da materialização (`modules/arquiteto/arquiteto-workspace.tsx`) ficou redundante com o diff novo e permanece; um teste da tela o fixa. Pode sair junto com essa asserção.
- No diálogo de importação, "Assunto · declarado" aparece só nas keywords já recebidas ou com `keywordDetail=full`, porque o índice não lê `analise_semantica`.
- `deriveTerritorialWorkingView` não tem consumidor na tela, então a opção `anchoredKeywordIds` do território não está ligada.
- `loadCanonicalArquitetoWorkspace` filtra ArticleDNA só pelas referências. Um artigo cujo único vínculo com as recebidas fosse o tronco não entraria na mesa; hoje não acontece, porque todo artigo tem principal recebida.
- Com um Assunto D2 no lote, os núcleos automáticos mudam, porque ele sai da formação. É o esperado pela F2.3.
- "Formar artigo" pelas sugestões tira as marcadas de candidatos calculados vizinhos; as que já estão em artigo decidido ficam bloqueadas.
- **F2.4 passo 5 ("Pedir proposta" da IA) não foi implementado.** A revisão de IA existente (`lib/arquiteto/article-ai-review.ts`) só propõe membership. Pôr o Assunto no payload estratégico (`lib/arquiteto/ai-strategic-payload.ts`) muda `ARTICLE_AI_REVIEW_PROJECTION` e deixa as revisões antigas desatualizadas. Precisa de adendo.
- Dívidas herdadas: `react-hooks/preserve-manual-memoization` em `arquiteto-workspace.tsx` subiu de 54 (HEAD) para 65 na primeira rodada; a segunda manteve o perfil (65, e `exhaustive-deps` 26). O guard visual estrito do arquivo foi de 108 para 107, e os arquivos novos têm 0. Os botões do filtro "Assuntos" (`modules/arquiteto/subject-panels.tsx`) usam `min-h-8`, como `ARCHITECT_UI.toolbarButton`. O `WorkflowImportDialog` compartilhado segue com texto de 9 a 10px fora do selo.

**Deploy e rollback, obrigatórios (SDD seção 6).**

- A F2·B só vai ao ar **depois** da fase A no ar e conferida pela homologação do usuário.
- Depois que um ArticleDNA ou SiloDNA for gravado com `subject`, o rollback do código só pode voltar até a fase A, **nunca abaixo dela**. Nenhum formato novo de ArticleDNA ou SiloDNA além do schema da fase A. Pacote sem Assunto não muda o parse nem o hash.
- O Radar (F3) e o Redator (F4) só usam o campo depois da F2·B homologada.

**Homologação (usuário).**

1. Formar dois artigos e uma landing page em torno de "SEO para clínicas". Conferir o slug da principal e a SERP das sustentações.
2. Conferir o Assunto fora das não agrupadas quando ancorado, e dentro delas com o selo quando sem artigo.
3. Prender e soltar numa Definição real e conferir no banco a versão `proposed` com `subject`. Concluir a formação e conferir o `subject` no ArticleDNA aprovado.
4. Prender o Assunto numa formação sem Definição, recarregar e conferir que continua preso; conferir no banco `articleSubjectAnchor` no item da principal.
5. Formar pelas sugestões e recarregar. Mover ou trocar a principal e conferir que o vínculo acompanha, ou que o Assunto volta a "aguardando".
6. Prender num Silo sem página e conferir a sugestão nos artigos dele. Consolidar um Silo com Assunto e conferir o `subject` na versão nova do SiloDNA e o `siloDnaRef` da SiloPage.
7. Tentar gravar pela rota com `attachedBy` de outra pessoa e esperar 403 `SUBJECT_ACTOR_MISMATCH`; tentar prender num Silo com página e esperar 409 `SUBJECT_SILO_PAGE_BOUND`.
8. Verificar teclado e leitor de tela nos dois diálogos, em 360, 768, 1024 e 1440 px, nos temas claro e escuro.

A F2·B só passa a PASS depois do readback no banco.

## Assunto declarado: fase A da F2 e trava no envio — 2026-09-24

```text
SUBJECT_NO_CONTRATO = DeclaredSubjectSchema opcional em ArticleDNA e SiloDNA · nenhum caminho grava
F2_FASE_A = no código · deploy e homologação pendentes (usuário)
F2_FASE_B = PLANEJADA · só começa depois da fase A no ar e homologada
ROLLBACK_ABAIXO_DA_FASE_A = PROIBIDO depois do deploy dela
HANDOFF = trava de aprovação (F1.7) + destino do Assunto conferido no servidor · 409 no lote
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · MANUAL_UI_VALIDATED = NO
```

Fonte: [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), aprovada pelo dono do produto em 2026-09-24, e o [ADR-022](../00-produto/decisoes/ADR-022-assunto-tronco-editorial.md). O Assunto é a frase que o humano declara no Minerador como tronco do artigo, mesmo sem busca. A principal continua dona do slug, do KGR e do H1 (D1).

**Fase A: o contrato só aceita o campo.** Verificado no código e confirmado por teste.

- `DeclaredSubjectSchema` (`lib/arquiteto/contracts.ts:84`), `.strict()`. Obrigatórios: `keywordId`, `approvedPackageRef` (o `ApprovedPackageRefSchema` que já existia, `:62`), `phrase`, `attachedBy` e `attachedAt`. `note` tem de 1 a 280 caracteres ou é `null`; `destinationUrl` é URL ou `null`.
- `subject` entrou como campo **opcional** no `ArticleDNASchema` (`:1013`) e no `SiloDNASchema` (`:1174`).
- O `superRefine` do ArticleDNA ganhou duas regras, que só olham o próprio artigo (`:1098-1110`):
  - `subject.keywordId` não pode ser secundária nem reforço (erro em `subject.keywordId`);
  - `subject.phrase` não pode coincidir com um item de `excludedSubjects`, comparando por keyword normalizada (erro em `subject.phrase`).
- A normalização é uma cópia local da `normalizeKeyword` do Minerador (`normalizeSubjectKeyword`, `:104`), para o contrato não depender do núcleo de import. O teste confere que as duas dão o mesmo resultado.
- **O schema não decide** se o Assunto pode ser a própria principal: ele aceita esse caso, e a regra "só com Volume validado" (Q7) fica para o gate de conclusão da fase B. Também não impede o mesmo Assunto em vários artigos (D3).
- O Assunto fica fora de `keywordReferences` e do teto de 6. Nenhum enum mudou. `centralEntity` do SiloDNA não recebe a frase.
- **Nenhum caminho grava `subject`.** `DeclaredSubjectSchema` só aparece em `lib/arquiteto/contracts.ts` e em `tests/arquiteto-assunto-schema.test.mts`. Adapters, formação, persistência, telas, Radar e Redator não foram tocados.
- **Compatibilidade:** os hashes de um ArticleDNA e de um SiloDNA sem `subject` foram capturados antes da mudança e fixados no teste. Depois dela, o parse devolve a mesma saída, sem chave `subject`, e os hashes são iguais no payload cru, no lido e no envelope versionado. Os hashes dourados do Radar seguem verdes.

**Regra de rollback, obrigatória (SDD seção 6, item 1).** Depois do deploy da fase A, **nenhum rollback de código volta para antes dela**. O ArticleDNA é lido com `.strict()`: um único artefato gravado com `subject` faria a leitura canônica do Arquiteto da marca inteira lançar `INVALID_ARTIFACT` 503 (`lib/server/arquiteto-persistence.ts:216-231`) e tiraria o artigo do Radar, que o manda para `incompatible` (`lib/server/editorial-repositories.ts:96-100`). Versões consolidadas são imutáveis (invariante 9): não dá para tirar o campo dos registros. Rollback permitido: até a fase A, nunca abaixo.

**Trava no envio ao Arquiteto (F1 do Minerador, no servidor do Arquiteto).** Verificado no código e confirmado por teste.

- `prepareCanonicalHandoff` (`lib/server/arquiteto-workspace.ts`) aplica `resolveHandoffApprovalGate`, o mesmo veredito do gate da tela. Aprovação registrada a partir de `SERVER_APPROVAL_GATE_SINCE = 2026-09-24T00:00:00-03:00` (`lib/minerador/approved-package.ts:132`) sem Lógica, Volume, Resultados ou KGR (no Assunto declarado, sem Lógica) recusa o **lote inteiro** com 409, sem gravar nada.
- Passam com alerta: aprovação sem registro de data, aprovação registrada antes da constante (inclusive a do backfill) e keyword já recebida, que não sai do Arquiteto (`AGENTS.md` §10). Um registro do backfill com data igual ou posterior à constante cai na regra normal.
- A página de destino do Assunto é conferida de novo contra o `marcas.site_url` atual, com uma leitura estreita (`marcas.select("site_url")`) só quando alguma elegível tem destino. O `destinationCheck` gravado pelo navegador não vale como garantia. Fora do domínio, sem https ou marca sem site com destino gravado: 409 no lote. Já recebida: alerta com `scope: "destination"`.
- A resposta ganhou `approvalAlerts`, de forma aditiva. **Limite:** o `HandoffResponseSchema` de `lib/arquiteto/canonical-workspace.ts` não tem o campo e o descarta no parse; a tela do Minerador mostra só os alertas que ela mesma calcula (pendência no backlog).
- Custo de leitura da trava: zero, porque `analise_semantica` já vinha na linha das keywords pedidas. A conferência do destino lê uma linha de `marcas`.

**Testes (fixtures, sem rede e sem chamada paga):**

- `tests/arquiteto-assunto-schema.test.mts` 16/16, reexecutado em 2026-09-24 na redação desta entrada;
- `tests/arquiteto-assunto-trava-servidor.test.mts` 11/11, reexecutado na mesma data; `test:arquiteto:servidor` 29/29, segundo o relatório da implementação;
- `test:arquiteto` 2272/2274, com as mesmas 2 falhas de base; `test:arquiteto:lentes` 31/31; `test:radar` 2616/2616, com os hashes dourados; `test:redator` 335/335; `npx tsc --noEmit` limpo. Estes números são do relatório da implementação.

**Não feito nesta data: fase B (Planejado aqui; entrou no código depois, na entrada da F2·B acima).** Gate de conclusão com a principal igual ao Assunto só com Volume validado; `subjectKeywordId` na cópia de trabalho e `isAnchoredSubject` nos cálculos de conservação; Assunto sem Volume validado fora da formação automática; selos, filtro "Assuntos" e listas; sugestões de sustentação; prender o Assunto em artigo e Silo; o texto "disputam o mesmo assunto" da trava de canibalização (`lib/arquiteto/article-formation-confirmation.ts:476`) continua como está. Radar (F3) e Redator (F4) ignoram o campo.

**Validado manualmente: NÃO.** A homologação é do usuário: deploy da fase A sozinha; abrir o Arquiteto e o Radar das marcas e conferir que carregam normalmente; enviar ao Arquiteto uma aprovada depois da ativação sem processo (espera-se 409), uma aprovada antes (passa) e um Assunto com destino fora do site (409). A F1b (Pesquisa por Assunto) é do Minerador e não faz parte desta entrada.

## As 4 lentes no Arquiteto — 2026-09-23

```text
FORMACAO_E_TERRITORIAL = 4 lentes (canônica em corpo, extras pelo digest) · voto por lente · marcador de lentes no parecer
PLANO_ANTES_DE_PAGAR = SIM · "Validar SERP", "Validar SERP dos silos" e "Consultar nas 4 lentes" mostram N chamadas e só pagam confirmadas
CANONICA_GRAVADA_EM = depth 20 (o Minerador não paga de novo)
KGR_LEVE = secundária sem consulta fica "não observada" (não vira "de fora")
PRIMARIA_DO_SILO_PELA_SERP = proposta, gravada só com aceite humano · só na origem "lista nova"
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste.** A autorização foi a diretriz do usuário de 2026-09-23 ("4 lentes em todas as áreas"; "pode continuar em todas"). Documentos:
- [adendo das 4 lentes](propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md);
- [SDD do veredito de artigo de uma keyword](propostas/sdd-veredito-artigo-uma-keyword-2026-09-23.md), proposta ainda não implementada.

- **A1 — KGR leve:** `splitArticleSerpMembers` passa a separar as buscas sem SERP como "não observadas". Antes, o parecer saía DIVERGENCE/SPLIT_RECOMMENDED; agora sai INCONCLUSIVE, com a busca citada pelo nome. `articleSerpParecerFromAssessment` também deixou de lançar TypeError em registro sem `interpretation`.
- **A2 — profundidade:** toda coleta da lente desktop-windows pelo Arquiteto (formação, territorial, SERP por keyword) grava 20 resultados e recorta o corpo antes de normalizar. O parecer não muda. A contrapartida: uma falta da canônica paga pelo Arquiteto sobe de ~US$ 0,002 (NÃO MEDIDO) para US$ 0,0035, e a CALL 3 do Minerador deixa de pagar e regravar. As consultas territoriais são por texto e também gravam 20.
- **A3/A4/A5 — lentes nos pareceres:**
  - **Formação:** um par só converge com sobreposição em 2 lentes ou mais; é "de fora" só sem sobreposição em todas e com intenção divergente na maioria.
  - **Territorial:** "alta" só com a maioria das lentes; lentes em desacordo viram fronteira para decisão humana.
  - **Nos dois pareceres:** linha "SERP · K de 4 lentes · concordância x/y". As extras só são lidas ou pagas onde há par.
- **A6 — plano de chamadas:** nada é pago no clique. A prévia mostra:
  - "Até N chamada(s) paga(s)", com o custo em faixa;
  - uma tabela por lente;
  - os botões "Pagar só a lente principal", "Recoletar as lentes antigas (pago)" e "Pagar N chamada(s) e validar".

  A rota recusa pagar além do autorizado (`SERP_PAID_NOT_AUTHORIZED`).
- **A7 — SERP por keyword:** as lentes extras deixam de gravar corpo. `aiOverviewDomains` e `relatedSearches` saem à parte e opcionais; `competitorDomains` continua sendo orgânicos mais citados (D5). A concordância só conta em dobro com pelo menos 3 lentes observadas (`MIN_LENSES_FOR_DIVERGENCE_CREDIT = 3`, restringe a regra de 2026-09-20; D4 pendente de confirmação).
- **A8 — datas e targeting:** lentes com mais de 7 dias de diferença ficam marcadas, e a recoleta é só manual. O cache usa os códigos de local e idioma do Minerador (`lib/arquiteto/serp-lens-targeting.ts`).
- **A9 — primária do Silo pela SERP (Silos › Revisão):** o painel "Primária do Silo · proposta da SERP" aparece. "Aceitar como primária do Silo" grava só a primária, com ator e hora do servidor, e só depois do readback mostra sucesso. A primária humana ou publicada nunca é trocada por essa porta. A porta genérica de território recusa criar, trocar ou apagar primária de SERP sem aceite.
- **A10 — tela:** as lentes que o Minerador envia no handoff aparecem no KeywordDNA do Arquiteto.
- **Testes:**
  - `test:arquiteto` 2256/2258, com as mesmas 2 falhas de base;
  - `test:arquiteto:lentes` (novo) 31/31;
  - `test:arquiteto:servidor` 18/18;
  - `test:serp-cache` 34/34.

  As lentes extras são testadas com fixtures sintéticas: faltam 3 SERPs reais (D7).

## Leitura estreita das keywords da marca — 2026-09-23

```text
MONTAGEM = índice sem analise_semantica para todas + linha inteira só das recebidas
HANDOFF = só os ids pedidos, nas duas passagens · PATCH = só os itens editados
VALVULA = ?keywordDetail=full reproduz a leitura antiga (só a recuperação usa)
MIGRATIONS_ADDED = 0 · MANUAL_UI_VALIDATED = NO
```

**Verificado no código e confirmado por teste** (`test:arquiteto:servidor`, 18/18; `test:arquiteto` com as mesmas 2 falhas da base).

- **Montagem** (`loadCanonicalArquitetoWorkspace`, `lib/server/arquiteto-workspace.ts`): o índice de todas as keywords vivas leva as colunas de `minerador_keywords` menos `analise_semantica` e alimenta `availableKeywords` e `importEligibility`. A linha inteira vai só para as recebidas, por `.in("id")` em lotes de 100. MEDIDO: 441 → 328 kB na Care Glow (29 recebidas), 712 → 29 kB e 738 → 67 kB nas marcas sem aprovadas. O 409 continua igual para a recebida apagada, de outra marca ou com id fora do formato.
- **Handoff** (`prepareCanonicalHandoff`): lê só os ids pedidos e mantém o 403.
- **PATCH** (`app/api/arquiteto/workspace/route.ts`, `readArchitectPatchKeywords`): lê `id,status` dos itens editados, e `kgr_score`/`analise_semantica` só de quem tem decisão de KGR. Isso era ~430 a 690 kB da marca inteira por chamada; agora são ~1,6 kB para 10 itens.
- **Consumidores:** `setKeywordImportPool` e a elegibilidade usam campos do índice. `buildCanonicalWorkflowWorkspaceItems` recebe a linha inteira das recebidas. A recuperação (`readArchitectDatabaseSources`) pede `keywordDetail=full`. A coluna `content_hash` que a elegibilidade lia não existe em `minerador_keywords`: sempre foi null.
- **Qualificação vigente:** o handoff se beneficia da leitura nova do store do Minerador (só a vigente).

## Cache temporário de SERP nas rotas do Arquiteto — 2026-09-23

```text
SERP_CACHE = ligado em formação, territorial e SERP por keyword
CHAVE = keyword × localidade × idioma × lente explícita × endpoint · validade 30 dias
REAPROVEITA_O_MINERADOR = SIM (desktop-windows, advanced, 20 atende pedido de 10)
FORMACAO_E_TERRITORIAL = regular → advanced, com os explícito (MUDANÇA DE COMPORTAMENTO)
REGISTRO_POR_ESCOPO_keyword_serp_observations = REMOVIDO · o cache é a persistência
MIGRATIONS_ADDED = 0 · CHAMADAS_PAGAS_EM_TESTE = 0
MANUAL_UI_VALIDATED = NO — homologação do usuário
```

**Verificado no código e confirmado por teste.** Contrato, medições e passos de
homologação na SDD [cache temporário de SERP](../compartilhado/sdd-cache-serp-temporario-2026-09-23.md), seção 8.

- **Uma SERP paga serve todos os módulos da marca por 30 dias.** As três
  rotas do Arquiteto consultam o cache antes de credencial e quota, pagam só o
  que falta e gravam o que pagaram. A qualificação do Minerador já deixa a
  lente canônica desktop-windows gravada; a formação e a territorial a
  reaproveitam.
- **As 4 lentes.** A SERP por keyword grava e relê as quatro
  (desktop-windows, desktop-macos, mobile-android, mobile-ios); a lente faz
  parte da chave, então nenhuma serve pela outra.
- **Quem agrupa lê só a observação** (~1 KB: domínios, blocos, perguntas,
  citações do AI Overview), nunca o corpo. A formação lê o corpo só de quem vai
  normalizar, em lote.
- **Formação e territorial mudaram de endpoint** — `regular` → `advanced`. O
  parecer passa a receber o People Also Ask e as citações do AI Overview;
  vereditos podem mudar em relação a pareceres antigos. Detalhes na SDD §8.2.
- **SERP por keyword:** `lib/server/arquiteto-keyword-serp-store.ts` removido;
  `lib/arquiteto/keyword-serp-record.ts` reexporta as lentes do cache. A mescla
  dos lotes de 6 passou da rota para o cliente (por keyword + lente: lente que
  falha não apaga o que já foi visto). O painel diz quantas lentes vieram do
  cache e quantas foram pagas agora; o botão passou a "Consultar de novo nas 4
  lentes", porque o clique repetido reaproveita o que está válido. Lente paga e
  recusada pelo provider vira lacuna com o código e a mensagem da task (um
  40501 diz que o defeito foi o pedido).
- **Formação — quota das faltas:** `createFormationSerpQuotaLedger` reavalia a
  quota quando um acerto degrada em falta (entrada sumiu, leitura do corpo
  falhou), antes de pagar — nunca com 1 unidade fixa.

**Corrige o registro anterior desta mesma data** (seção abaixo): a rota
`keyword-serp` não mescla mais os lotes (o cliente mescla), o store
`arquiteto-keyword-serp-store.ts` não existe mais, e `lib/minerador/` passou a
ter dois arquivos alterados, aditivos: `dataforseo-serp-core.ts`
(`readDataForSeoTargetCodes`) e `keyword-semantic-qualification.ts`
(`repeatsCurrentSemanticQualification`).

**Arquivos compartilhados novos:** `lib/editorial/serp-cache.ts` (puro),
`lib/server/serp-cache.ts`, `lib/server/serp-cache-store.ts`,
`lib/server/serp-cache-observation.ts`. Consumidores preservados: o Radar não
foi tocado (suíte 2.313/2.313). O núcleo e o store têm teste que os **executa**
(`npm run test:serp-cache`, 14 casos, banco em memória e `fetch` falso),
incluído no `npm test`.

**Limitações:** ver backlog de 2026-09-23 (cache de SERP).

## Aba Silos: lógica primeiro, Vínculo do Minerador e listas de ~200 — 2026-09-23

```text
VINCULO_AUTORIDADE = resolveKeywordVinculo (Minerador) · leitura paralela REMOVIDA
KEYWORD_PAGE_TYPE_CONSUMIDO = SIM · SITE_ORIGIN_TEXTO_JSON = LIDO
LOGICA_SEPARA_SILO_ARTIGO = SIM, pela declaração · SEM_DECLARACAO = léxico, inalterado
PRIMEIRA_ETAPA_PROVIDER_CALLS = 0 · Processar não chama mais a SERP
CONFIRMAR_EM_LOTE = SIM · 200 keywords → 8 gravações + 1 releitura
SERP_POR_KEYWORD = em lotes de 6, mesclados por Silo · sem corte em 12
PIPELINE_LOGICO_200_KEYWORDS ≈ 28 ms · 400 ≈ 47 ms (linear)
MANUAL_UI_VALIDATED = NO — homologação do usuário
MIGRATIONS_ADDED = 0
```

**Verificado no código e confirmado por teste.** Nada aqui foi validado na
interface real; a homologação é do usuário.

- **O Vínculo passou a ter uma autoridade só.** `lib/arquiteto/editorial-unit-declaration.ts`
  deixou de ler nomes paralelos (`siteRole` solto, `editorialUnitPotential`,
  `potencialUnidade`) que o Minerador nunca grava, e agora pergunta a
  `resolveKeywordVinculo` (`lib/minerador/keyword-vinculo.ts`). Dois efeitos
  silenciosos da leitura antiga, auditados contra o código do Minerador:
  o `keyword_page_type` marcado pelo humano **não chegava** ao Arquiteto, e
  `site_origin` gravado como **texto JSON** (caso real, registrado no próprio
  Minerador em 2026-09-21) derrubava a declaração de publicado. O DNA lido é o
  do pacote aprovado; a linha viva só entra sem pacote.
- **O padrão `article` não é declaração.** O Minerador põe `article` em toda
  keyword que ninguém marcou (`determined: false`). Tratar isso como decisão
  humana faria o acervo inteiro parecer declarado.
- **A lógica separa Silo × Artigo pela declaração, antes do léxico**
  (`lib/arquiteto/architecture-working-proposal.ts`). Declarada Silo — publicada
  ou potencial — vira cabeça do próprio Silo; publicada traz a primária pela
  declaração, potencial deixa a primária provisória para a SERP confirmar.
  Declarada Artigo/Landing/Serviço nunca vira semente de Silo. Os vizinhos de
  grupo de um Silo declarado vão para ele. Grupo inteiro declarado não-Silo não
  inventa Silo. Silo declarado com slug já existente no acervo se junta a ele.
  **Lote sem declaração produz exatamente a proposta de antes** (teste N6).
- **A primeira etapa não chama provider.** `processArchitecture` chamava
  `validateTerritorialSerp(true)` antes de materializar — revertendo o §5
  anterior por decisão do produto. Medido no código: `architectureProposal` não
  depende de estado da SERP, então aquela chamada gastava crédito sem mudar a
  proposta daquele mesmo clique. A SERP segue como etapa explícita.
- **Confirmar em lote** (`lib/arquiteto/silo-decision-batch.ts`). O Confirmar
  fazia, por keyword, uma gravação e uma recarga **completa** do workspace como
  releitura. Agora: o mesmo `planSiloAssignment`, lock por item, lotes de 25 por
  requisição, e **uma** releitura decide o desfecho de cada keyword pelo mesmo
  `resolveSiloAssignmentOutcome`. O servidor aplica item a item sem transação;
  um lote que falha é reenviado item a item, e quem já gravou é recusado pelo
  lock — nada é sobrescrito.
- **Coleta de SERP por keyword sem corte.** O cliente mandava `slice(0, 12)`:
  num Silo de 20, oito ficavam sem coleta, em silêncio. Agora vai o Silo
  inteiro em lotes de 6, e a rota `keyword-serp` mescla cada lote com os
  anteriores do mesmo escopo.
- **A mesa mostra o Vínculo** em cada linha de keyword da aba Silos, na frase
  do próprio Minerador (`Livre · Silo · potencial`, `Travado ao slug · Artigo ·
  declarado`), com destaque para quem lidera Silo.

**Também desta rodada, antes não registrado (2026-09-20 → 09-21):**

- Eleição da primária do Silo por origem — `lib/arquiteto/silo-primary-keyword.ts`,
  `TerritoryPrimaryKeywordSchema` em `territory.ts`; primária visível no painel
  de revisão.
- Matriz de quatro lentes e SERP por keyword — rota `app/api/arquiteto/keyword-serp`,
  registro `lib/arquiteto/keyword-serp-record.ts`, store
  `lib/server/arquiteto-keyword-serp-store.ts`, painel
  `modules/arquiteto/published-serp-panel.tsx`, smoke pago
  `npm run arquiteto:lentes-smoke`. Medido no provider: o `os` precisa ir no
  corpo do pedido; `/live/regular` anuncia `people_also_ask` e não entrega (0
  perguntas contra 4 no `advanced`).
- Reforço de publicado e troca de primária como **pendência**, nunca aplicada —
  `lib/arquiteto/primary-substitution.ts`, `published-keyword-readout.ts`.
- Mesa sem keyword sumida: decisão apontando para silo fora da leitura volta a
  "Sem silo" com o motivo (`territorial-landscape.ts`); silo consolidado,
  rejeitado ou arquivado volta a ter grupo (`territorial-surface.ts`).

**Arquivos compartilhados, todos aditivos:**

- `lib/server/dataforseo-serp-operation.ts` e `lib/radar/serp/contracts.ts`
  (Radar): `operatingSystem` e `payloadDepth` opcionais; sem eles o pedido é o
  de antes. Suíte do Radar verde.
- `lib/server/dataforseo-serp-normalizer.ts`: `related_searches` lido de
  `items[]`; `operatingSystem` no snapshot e no hash.
- `lib/minerador/*`: **nenhum arquivo alterado** — só importado.
- `lib/arquiteto/contracts.ts`: potencial aceita `landing_page` e `service_page`.

**Limitações e pendências:** ver backlog de 2026-09-23.

## Homologação remota preparada e KeywordDNA de produção — 2026-09-13

```text
CROSS_BRAND_REMAP = IMPLEMENTADO · identidade reemitida de forma determinística
FINGERPRINT_POR_TIPO = IMPLEMENTADO
HOMOLOGATION_RUNNER = scripts/arquiteto-backup-homologation.mts
ROUNDTRIP_EQUIVALENT_REMOTE = NO (não executado contra o banco)
EDITORIAL_KEYWORD_DNA_CSV = IMPLEMENTADO · EDITORIAL_ARTICLE_CSV = INALTERADO
BACKUP_RESTORABLE_V1 = NO · MIGRATIONS_ADDED = 0
```

- **Troca de Brand virou decisão explícita.** `allowCrossBrand` no plano, na
  rota e no runner. Sem ela o plano é `BLOCKED` com `CROSS_BRAND_RESTORE`. Com
  ela, `localizeBackupForBrand` reescreve a Brand no payload, **reemite toda
  identidade de versão** de forma determinística — derivada de (Brand de
  destino, id de origem), nunca sorteada, senão a segunda restauração deixaria
  de ser idempotente — e recalcula os hashes de conteúdo num laço de ponto
  fixo, porque o hash da SiloPage depende do hash do SiloDNA e o do grafo
  depende dos dois. O mapa de identidade é achatado no fim: sem isso um
  consumidor pararia no salto intermediário.
- **Fingerprint semântico por tipo de artefato**, com `ignoreEnvironment` para
  `brandId`/`marca_id` — os únicos campos documentados como
  environment-specific, ignorados apenas quando a comparação atravessa Brands.
- **Runner de homologação remota:** `npm run arquiteto:backup-homologation --
  --source <brandId> --target <brandId>`. Não depende de DELETE, recusa Brand
  de destino com qualquer artefato do Arquiteto, executa export → preview →
  restore → readback → fingerprint A × B → conferência de relações → segunda
  restauração, e imprime o relatório com todos os flags. `--dry-run` para no
  preview.
- **Ainda NÃO executado contra o banco.** Escrita remota e validação de
  navegador são execução do usuário; enquanto não rodarem,
  `ROUNDTRIP_EQUIVALENT_REMOTE = NO` e `BACKUP_RESTORABLE_V1 = NO`.
- **`keywords-dna.csv`** (`lib/arquiteto/editorial-keyword-dna-export.ts`):
  uma linha por keyword membro dos ArticleDNA exportados. O papel
  PRINCIPAL/SECUNDÁRIA/REFORÇO vem da composição canônica do ArticleDNA; os
  sinais semânticos vêm do KeywordDNA **daquela** keyword, nunca copiados da
  Principal; a aplicabilidade do KGR é a decisão do Minerador por keyword.
  Ausência vira vazio ou `A confirmar`. Nenhum UUID, hash, version id ou lock
  version. O `artigos.csv` seguiu inalterado, com os agregados.
- **Menu:** `Dados editoriais / Produção` baixa os dois arquivos; abaixo dele,
  `Só Artigos` e `Só KeywordDNA dos artigos`.
- **Confirmado por teste:** 19 casos no contrato e 8 no roundtrip, incluindo
  troca de Brand com e sem decisão explícita e segunda restauração toda NO_OP
  na Brand nova. TypeScript limpo; ESLint do workspace na baseline.

## Restauração canônica do backup — implementação local — 2026-09-13

```text
BACKUP_EXPORT_COMPLETE = YES
BACKUP_IMPORT_PREVIEW_COMPLETE = YES
BACKUP_REMOTE_RESTORE_COMPLETE = IMPLEMENTED_NOT_EXECUTED_AGAINST_DATABASE
BACKUP_REMOTE_READBACK_COMPLETE = IMPLEMENTED_NOT_EXECUTED_AGAINST_DATABASE
RESTORE_IDEMPOTENT = YES
ROUNDTRIP_EQUIVALENT = YES_AGAINST_SIMULATED_DRIVER · NO_AGAINST_DATABASE
EDITORIAL_EXPORT_UNCHANGED = YES · MIGRATIONS_ADDED = 0 · MANUAL_UI_VALIDATED = NO
RADAR/PLANNER/REDATOR/PUBLICACOES_FILES_CHANGED = 0
```

- **A auditoria anterior estava errada e foi corrigida.** Ela dizia que
  faltava writer canônico para território, working copy e pareceres; os
  `lib/server/arquiteto-*-store.ts` já expunham autoridade tipada para cada
  um. A restauração reutiliza esses writers — nenhum INSERT genérico em
  tabela, e há teste que recusa esse padrão no código-fonte.
- **Cobertura:** os quinze tipos do backup restauram por caminho canônico —
  ArticleDNA, SiloDNA, SiloPage, revisão de IA, território, working copy de
  Silo, pareceres de SERP territorial e de formação, proposta de IA
  territorial, os dois marcadores, membership de keyword, grafo aprovado,
  working copy do grafo e status operacional do estágio `architect`.
- **Duas etapas:** `parse + preview` e, após confirmação humana, `restore`. O
  preview roda no servidor contra o estado real e classifica cada registro
  como `CREATE`, `NO_OP`, `REMAP`, `CONFLICT` ou `BLOCKED`. Conflito ou
  bloqueio recusa o lote inteiro.
- **Identidade:** território e working copy têm identificador emitido pelo
  servidor. Voltam com id novo, que entra no mapa `antigo → restaurado`, e
  todas as referências são religadas antes da escrita. O teste confirma que o
  id antigo não aparece no destino.
- **Idempotência:** a segunda restauração do mesmo arquivo é toda `NO_OP` e
  não cria sucessora nem duplicata, verificado contando as linhas de versão.
- **Readback:** depois da escrita o servidor relê e compara semanticamente,
  ignorando só identidade remapeada e carimbo novo. Um teste adultera a linha
  depois da mutation e confirma que a restauração não se declara bem-sucedida.
- **O que a prova NÃO cobre:** o driver de banco é simulado. Ele substitui o
  driver, não a regra — writers, schemas e validações são os de produção —
  mas as duas stored procedures do grafo e da working copy de Silo não são
  emuladas, por decisão: inventar o comportamento de um procedimento que não
  está no repositório enfraqueceria a prova. E o ciclo nunca rodou contra o
  banco real, que segue bloqueado pelo `GRANT DELETE` ausente.
- **Confirmado por teste:** `tests/arquiteto-backup-roundtrip.test.mts` (5
  casos, roda a autoridade real) e
  `tests/arquiteto-backup-e-export-editorial.test.mts` (14 casos). Scripts
  `test:arquiteto-backup` e `test:arquiteto-backup-roundtrip`.
- **EDITORIAL_EXPORT_V1 não foi alterado.**

## Dois contratos de exportação e o importador de backup — implementação local — 2026-09-13

```text
BACKUP_CONTRACT = BACKUP_RESTORABLE_V1 · BACKUP_EXPORT = IMPLEMENTED
BACKUP_IMPORT_PREVIEW = IMPLEMENTED · BACKUP_RESTORE_WRITE = NOT_ENABLED
BACKUP_RESTORE_PROVEN = NO
EDITORIAL_EXPORT = EDITORIAL_EXPORT_V1 · ONE_WAY = YES
EDITORIAL_EXPORT_IS_IMPORTABLE = NO
MIGRATIONS = 0 · REMOTE_WRITES = 0 · RADAR/PLANNER_FILES_CHANGED = 0
```

- **A separação nasceu de uma evidência.** O CSV técnico de Links tinha 14
  linhas e 51 colunas de UUID, hash, version id e proveniência: bom para
  auditoria, ruim para quem quer pegar o ArticleDNA e escrever em outra
  ferramenta. As três exportações por área foram substituídas por dois
  produtos com finalidades declaradas.
- **Auditoria antes do restore**, como exigido:
  `docs/04-arquiteto/auditoria-backup-restauravel-2026-09-13.md` enumera os
  artefatos do Arquiteto, o caminho de leitura e de escrita de cada um e as
  quatro lacunas que impedem declarar o backup restaurável hoje.
- **`BACKUP_RESTORABLE_V1`** (`lib/arquiteto/backup-contract.ts`,
  `backup-export.ts`): o arquivo se declara no cabeçalho
  (`minekey_export_type = ARQUITETO_BACKUP`, `schema_version = 1`, Brand, data,
  contagem, tipos) e usa uma linha por artefato com `record_type`,
  `record_key`, `record_version`, `status`, `content_hash`, `parent_ref` e
  `payload_json` canônico completo. `record_key` é a identidade do artefato,
  nunca o id de uma linha do banco.
- **Importador** (`backup-restore.ts`): preview antes de qualquer escrita, com
  validação de formato, integridade de referências, hashes, Brand e conflitos.
  Mesmo hash é no-op; identidade divergente sobre artefato canônico ou
  publicado vira conflito e trava o plano inteiro; restaurar entre Brands
  exige decisão explícita. As referências são religadas por mapa
  `id antigo → id restaurado`, sem despejar UUID de outro banco.
- **`EDITORIAL_EXPORT_V1`** (`editorial-export.ts`): uma linha por ArticleDNA,
  com Silo, papel, composição, contexto do KeywordDNA congelado, SERP vigente
  e links **agregados na linha do artigo**. Nenhum UUID, hash, version id,
  lock version, id de nó ou de aresta. Contrato one-way: o importador só
  aceita arquivo que se declara `ARQUITETO_BACKUP`.
- **UI:** `Exportar` virou menu com `Backup restaurável`,
  `Dados editoriais / Produção` e `Restaurar backup`.
  `Importar do Minerador` continua separado e segue significando KeywordDNA da
  etapa anterior. A prévia da restauração é um diálogo próprio.
- **A gravação da restauração está deliberadamente fechada.** O ciclo
  `export → limpeza controlada → import` nunca rodou contra o banco — o reset
  de homologação segue bloqueado por `GRANT DELETE` ausente. A prévia diz isso
  na tela em vez de oferecer um botão que ninguém viu funcionar.
- **Confirmado por teste:** `tests/arquiteto-backup-e-export-editorial.test.mts`,
  17 casos. TypeScript limpo; ESLint do workspace idêntico à baseline.
- **Ainda não validado:** o ciclo real de restauração, a abertura dos dois
  arquivos no Excel PT-BR e o comportamento com acervo grande.

## Exportação CSV das três fases — superada em 2026-09-13

```text
EXPORT_SILOS_CSV = PASS · EXPORT_ARTICLES_CSV = PASS · EXPORT_LINKS_CSV = PASS
LINK_EXPORT_ROW_COUNT = GRAPH_EDGE_COUNT
LINK_EXPORT_ROLE_SOURCE = SILODNA
LINK_EXPORT_RELATIONS_SOURCE = INTERNAL_LINK_GRAPH
EXPORT_DOES_NOT_REQUIRE_SELECTION = PASS · EXPORT_DOES_NOT_WRITE_REMOTE_STATE = PASS
CSV_ESCAPING = PASS · UTF8_BOM = PASS
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0 · MIGRATIONS = 0
```

- **O botão anunciava e não entregava.** `Exportar` chamava
  `showNotification("success", "Exportação iniciada...")` e terminava ali:
  nenhum arquivo era montado. O fluxo real de download entrou em
  `handleExportCurrentArea`, e o sucesso só é anunciado depois do `Blob` e do
  clique no anchor, com a contagem do que realmente saiu. Falha declara o
  motivo.
- **Implementado localmente:** `lib/arquiteto/export-csv.ts` é domínio puro
  (sem React, sem rede, sem storage) e monta as três tabelas a partir dos
  read-models canônicos: SiloDNA/SiloPage, ArticleDNA e InternalLinkGraph. A
  área corrente define o arquivo; a seleção e os filtros da mesa não estreitam
  o conjunto.
- **Links sem perda de informação:** uma linha por aresta, com identidade do
  Silo/SiloPage, versão/hash/estado/base do grafo, as duas pontas com tipo,
  papel, keyword e slug, relação, âncoras, reason, priority, origem,
  proveniência, contadores in/out e aprovação/status das pontas. `SILO_PAGE`
  preenche os campos equivalentes e deixa vazios os exclusivos de ArticleDNA.
  Pilar/Suporte vem de `resolveSiloHierarchyView` sobre o SiloDNA — o teste
  prova isso declarando `OUTRO` nos nós do grafo e exigindo `PILAR`/`SUPORTE`
  no CSV.
- **CSV:** UTF-8 com BOM, delimitador `;`, CRLF, escape RFC 4180 para aspas,
  delimitador, vírgula e quebra de linha, datas ISO 8601, ids e hashes
  completos, arrays em `valor 1 | valor 2` e nenhum `[object Object]`.
- **Somente leitura:** o módulo não contém `fetch`, writer, provider ou
  criação de versão. A única leitura remota do handler são os GET do grafo
  (`loadInternalLinkGraphs` e `loadInternalLinkGraphWorkingCopy`), e apenas na
  área de Links. A working copy é a autoridade de topologia; a versão aprovada
  responde quando não existe cópia em edição.
- **Confirmado por teste:** `tests/arquiteto-export-csv.test.mts`, 15 casos,
  todos passando. `tests/visual-foundation.test.mts` foi atualizado para o
  novo contrato do botão.
- **TypeScript e ESLint:** sem erro novo. O arquivo do workspace mantém
  exatamente a mesma contagem do ESLint da baseline.
- **Ainda não validado:** abertura real no Excel PT-BR, Silo sem SiloPage,
  Silo sem grafo e grafo grande na UI com marca real.

## Reset da homologação e fluxo básico — 2026-09-08

```text
ARQUITETO_RESET_TO_ZERO = BLOQUEADO (falta GRANT DELETE ao service_role)
ARQUITETO_ARTIFACTS_AFTER_RESET = 130  (nada foi apagado)
ADVANCED_MANUAL_CONTROLS_VISIBLE = NO
ARTICLE_FOOTER_ACTIONS = CONTAGEM | LIMPAR_SELECAO
ARTICLE_DNA_FINAL_ACTION = CONCLUIR_FORMACAO
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **O reset existe, foi ensaiado e NÃO pôde ser executado.** O
  `service_role` não tem `DELETE` em nenhuma das dez tabelas do escopo —
  `42501` em todas. A sonda roda um delete que casa com NADA antes de qualquer
  escrita, então o ensaio prova a permissão sem apagar uma linha. Nada foi
  removido: 280 versões, 60 itens de workflow, 6 grafos e 9 snapshots seguem
  como estavam.
- **A trava que importa não é a confirmação, é o ESCOPO.**
  `editorial_artifact_versions` guarda, sob a mesma marca, 150 linhas que não
  são do Arquiteto: 83 `keyword_semantic_qualification`, 66
  `keyword_contextual_presentation` e 1 `brand_skill`. Um delete por
  `marca_id` teria destruído o trabalho do Minerador junto com os 130
  artefatos da mesa. O filtro é por TIPO, sempre.
- **Fora do escopo por decisão:** os 4 itens de workflow com `stage=radar`.
  Eles referenciam artigos que deixariam de existir, mas são mesa do Radar —
  esta operação não decide por ela. Ficam órfãos e precisam de um corte próprio.
- **Rodapé da fase 1 enxugado** (§5/§6): saíram "Reabrir revisão de N",
  "Mover selecionados para Silo" e "Excluir". Ficaram a contagem da seleção,
  "Limpar seleção" e o "Enviar ao Radar" da aba Links. Reprocessar e Concluir
  continuam no painel da fase, com `resolveFormationSelectionScope` como
  autoridade única.
- **Ajustes manuais fora da tela**: `advancedOpen` virou constante `false`.
  Tornar principal, trocar papel, separar, remover, mover e juntar continuam
  implementados e testados — trocar a constante por estado devolve todos.
- **Fresh saiu da UI** (§3): o reinício virou operação administrativa. A rota,
  o domínio e as travas continuam existindo e sob teste.
- **Validação:** `test:arquiteto` 1633/1634 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Fronteira da rodada de homologação — 2026-09-06

```text
FRESH_HAS_ACTIVE_ROUND_BOUNDARY = YES
FRESH_HISTORY_PRESERVED = YES
OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT = NO (provado por teste; remoto ainda sem rodada)
SERP_HISTORY_REUSABLE_ACROSS_ROUNDS = YES · SERP_REUSE_REQUIRES_BASEHASH_MATCH = YES
CANONICAL_ARTIFACT_STATE_CROSSES_ROUNDS = NO
BRAND_DNA_PRESERVED = YES · KEYWORD_DNA_PRESERVED = YES
SAFE_TO_EXECUTE_FRESH_REMOTE = YES (nada foi executado neste corte)
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **O risco era real.** Limpar a cópia de trabalho não bastaria:
  `canonical-version-authority` resolve "a última aprovada" e encontraria o
  SiloDNA e o ArticleDNA da rodada anterior, apresentando-os como cenário
  corrente. A cópia estaria limpa e o cenário, não.
- **`homologation-round.ts`** declara a fronteira. O marcador
  `arquiteto_homologation_round` guarda `roundId`, `startedAt`, `startedBy`,
  `reason: FRESH` e `previousRoundId`; a rodada ativa é a de `startedAt` mais
  recente. Nenhum schema físico mudou — `editorial_workflow_items` já
  comporta o marcador.
- **A regra de autoridade NÃO mudou** (§6). `canonical-version-authority`
  continua sendo "a última aprovada". O que a fronteira faz é restringir o
  UNIVERSO sobre o qual ela responde, e só em homologação: sem modo e sem
  rodada, `bounded = false` e tudo passa, como no produto de hoje.
- **Aplicada na ENTRADA**, no carregamento canônico, e não dentro de cada read
  model — assim continua havendo uma leitura só. Vale para ArticleDNA, SiloDNA,
  SiloPage e InternalLinkGraph aprovado.
- **A rodada é lida antes de qualquer carga**, a cada troca de marca.
  Hidratá-la só ao abrir o preview faria a fronteira valer apenas naquela
  sessão: depois de um F5 os artefatos antigos voltariam como correntes.
- **O marcador é gravado DEPOIS da limpeza** e é preservado por ele mesmo: se a
  limpeza falhar, não existe rodada nova para declarar.
- **A exceção intencional é a SERP** (§8): parecer histórico atravessa rodadas,
  mas só por identidade forte — `formationBaseHash` idêntico. Estado canônico
  não atravessa; evidência sim. BrandDNA e KeywordDNA também atravessam: são
  entradas canônicas, não estado de trabalho desta fase.
- **`npm run audit:rodada`** responde `ACTIVE_HOMOLOGATION_ROUND_ID`, os
  contadores ativos × históricos e
  `OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT`. Leitura de hoje: nenhuma rodada
  declarada, 10 ArticleDNA e 3 SiloDNA aprovados no histórico, 9 pareceres SERP.
- **Validação:** `test:arquiteto` 1632/1633 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Reiniciar homologação — 2026-09-06

```text
HOMOLOGATION_FRESH_AVAILABLE = YES
HOMOLOGATION_FRESH_VISIBLE_IN_PRODUCTION = NO
FRESH_CLEARS_WORKING_COPY = YES
FRESH_DELETES_APPROVED_HISTORY = NO · FRESH_DELETES_SERP_HISTORY = NO
FRESH_IS_SEPARATE_FROM_REPROCESS = YES · NORMAL_REPROCESS_IS_INCREMENTAL = YES
APPROVED_ARTIFACTS_DELETED = 0
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **Três operações, três semânticas.** `Reprocessar` é incremental e preserva a
  estrutura corrente. `Restaurar` conserta em direção ao ArticleDNA aprovado.
  `Reiniciar homologação` recomeça a cópia de trabalho da rodada. Elas não
  compartilham botão nem código.
- **`homologation-fresh.ts` é lista de PERMISSÃO.** Limpa `keyword`,
  `architecture_analysis`, `article_formation_analysis`, `silo_working_copy` e
  `territory` — cada um com o motivo declarado. Qualquer `subject_type` fora da
  lista é preservado por omissão: o erro caro aqui é apagar demais.
- **Preservados por regra**, não por acidente: `article_formation_serp_assessment`,
  `territorial_serp_assessment` e `territorial_ai_review`. Evidência órfã é
  inofensiva — e é ela que permite testar o reaproveitamento por
  `formationBaseHash` na rodada seguinte (§12).
- **Nenhum artefato versionado é apagado.** `editorial_artifact_versions` e
  `minerador_keywords` não aparecem na rota; há teste que falha se aparecerem.
  Proposta no-op continua no banco e simplesmente não é autoridade — quem
  resolve isso é `canonical-version-authority`, não um DELETE.
- **Três travas, nenhuma vinda do cliente:** o modo é lido de
  `ARQUITETO_HOMOLOGATION_MODE` (server-only); a marca vem de
  `resolvePipelineContext`; e a frase de confirmação é derivada do TAMANHO do
  plano recalculado no servidor — plano diferente do que a pessoa viu produz
  frase diferente e a rota recusa com 409. A variável pública
  `NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE` controla só a visibilidade do
  botão; ligar apenas ela mostra o controle e a rota recusa.
- **Preview obrigatório:** o primeiro clique busca o plano e mostra o que some
  e o que fica, lado a lado. O segundo confirma. O resumo final vem do
  **readback**, não do que foi pedido.
- **O estado local some junto** — seleção, previews pendentes, rascunhos e
  working copy de links. Deixar a tela mostrando a rodada anterior sobre um
  remoto já limpo seria pior que não limpar.
- **Nada foi executado.** A rota existe, é testada e nunca foi chamada contra o
  remoto neste corte.
- **Validação:** `test:arquiteto` 1623/1624 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Restaurar a cópia de trabalho a partir do aprovado — 2026-09-06

```text
NORMAL_REPROCESS_IS_INCREMENTAL = YES · NORMAL_REPROCESS_IS_FRESH = NO
RESTORE_WORKING_COPY_AVAILABLE = YES
RESTORE_BASELINE = CANONICAL_APPROVED_ARTIFACTS
RESTORE_PROVIDER_CALLS = 0 · RESTORE_IS_ATOMIC = YES
REPROCESS_RESULT_IS_EXPLAINABLE = YES
ARTICLE_SELECTION_AUTHORITIES = 1
FRESH_FORMATION_AVAILABLE = NO (próximo corte)
SAFE_TO_PROCESS_LINKS = NO
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **Por que `Confirmar arquitetura` mostrava "0 Silos · 6 atribuições (sem
  mudança)".** O plano dela nasce da ANÁLISE do cenário corrente; sobre um
  drift antigo a cópia de trabalho já concorda consigo mesma, e a análise não
  tem com o que discordar. `Reprocessar` tem o mesmo limite por desenho: ele é
  incremental e preserva a estrutura corrente. Nenhum dos dois consegue
  reparar — e insistir neles era o caminho errado.
- **`working-copy-restore.ts`** tem outro baseline: o **ArticleDNA aprovado**.
  Ele pergunta só "onde a keyword deveria estar, segundo o artefato aprovado?"
  e devolve a diferença, agrupada por Article, no formato `1/3 → 3/3`.
- **O que a restauração não faz:** não edita ArticleDNA, não cria sucessora,
  não aprova, não chama provider, não reagrupa por similaridade. Há teste que
  falha se `persistArquitetoArtifact`, `createVersionEnvelope`,
  `confirmSerpValidation` ou `fetch(` aparecerem no módulo.
- **Atômica de verdade:** falha em qualquer atribuição desfaz as anteriores
  pelo mesmo writer e declara a operação inteira como falha —
  `applied: 0`. O que não pôde ser desfeito é NOMEADO, não silenciado.
- **Preview obrigatório:** primeiro clique mostra `ARTICLES_AFETADOS` e
  `KEYWORDS_A_RESTAURAR` com origem → destino por keyword; nada é gravado.
- **§15 — a seleção ainda tinha caminho antigo.** `CALL_SITES` da recusa: os
  dois handlers já usavam a autoridade única, mas o **painel da fase** lia
  `selectedCandidateRefs.size` e escrevia "Selecione pelo menos um artigo" nos
  títulos e no contador — com a linha já selecionada. Ele passou a receber
  `scopeReason` pronto; `applyClosingToSelection` também.
- **§14 — `Reprocessar` fecha a conta:** "Processamento concluído: N Article(s)
  analisado(s). SERP reaproveitada para X/Y · Z sem evidência vigente.
  A sustentado(s) · B divergente(s) · C inconclusivo(s). D pronto(s) para
  concluir."
- **Validação:** `test:arquiteto` 1609/1610 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Processamento automático fecha a formação — 2026-09-06

```text
SERP_DISPLAY_AUTHORITIES = 1
ARTICLE_SINGLE_KEYWORD_PRINCIPAL_AUTOMATIC = YES
ARTICLE_SINGLE_KEYWORD_COMPATIBILITY_TERMINAL = YES (NOT_APPLICABLE)
CURRENT_INCONCLUSIVE_REQUIRES_MICRO_HUMAN_DECISION = NO
AMBIGUITY_IS_TERMINAL_RESULT = YES · INDETERMINATE_IS_TERMINAL_RESULT = YES
STRUCTURAL_BASELINE_PRESERVED_FALLBACK = YES
ARTICLES_CAN_MOVE_KEYWORD_BETWEEN_SILOS = NO
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **A contradição da SERP tinha duas chaves.** O badge lia `serpAssessments`
  por `articleId`; o gate lia `remoteArticleSerp` por `candidateRef`. Para
  `skin care rosto`, cujo parecer está gravado sob o `candidateRef`, o badge
  não achava nada e dizia "não executada" enquanto o painel exibia o parecer
  inteiro ao lado. `articleSerpVerdictFor` passou a resolver pela chave do
  gate primeiro; o acervo por `articleId` só responde quando não há registro.
- **Auditado antes de mexer** (`audit:formation`): `skin care rosto` ·
  `article-formation:8f8ccb38…` · base `serpbase:762ab4a2983a8d82` ·
  assessment **v3** com base **idêntica** · verdict INCONCLUSIVE ·
  `SERP_CANONICAL_STATE = CURRENT_INCONCLUSIVE_UNRESOLVED` ·
  `SERP_DISPLAY_SOURCE = CURRENT_ASSESSMENT`. A evidência existia, era vigente,
  e o badge é que mentia.
- **`formation-phase-policy.ts`** declara `PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION
  = false`. O gate ganhou `unresolvedBlocksConclusion` com **padrão `true`**:
  quem não declara nada continua sendo cobrado. Evidência vigente e indecisa
  passa a preservar o baseline (`humanFormationRef`, `humanRole`, Principal
  vigente) e registra `STRUCTURAL_BASELINE_PRESERVED` como resultado terminal.
- **O que continua bloqueando:** SERP ausente, falhada ou desatualizada. Ali
  não há evidência sobre esta composição, e a hipótese da lógica não substitui
  o mercado.
- **Artigo de uma keyword** fecha com `compatibility = NOT_APPLICABLE` —
  "Não aplicável", não "Ambígua". Ambígua diz que faltou base; num artigo de
  uma keyword não falta base, a pergunta não se aplica. Composição com
  secundária não avaliada continua AMBÍGUA.
- **Efeito medido:** `HUMAN_RESOLUTION_REQUIRED` foi de 7 NO + 1 YES para
  **8 NO**, e o candidato indeciso passou a registrar
  `DECISION_BASIS = STRUCTURAL_BASELINE_PRESERVED`.
- **As auditorias acompanham a política** — `audit:formation` importa a mesma
  constante, para não ser mais severa que a portaria real.
- **Validação:** `test:arquiteto` 1597/1598 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Fase 1: processamento fecha, humano confirma o resultado — 2026-09-06

```text
ARTICLE_SELECTION_AUTHORITIES = 1
SEPARATE_SEND_FOR_APPROVAL_STEP = NO · SEPARATE_APPROVE_ARTICLEDNA_STEP = NO
ARTICLE_DNA_FINAL_ACTION = CONCLUIR_FORMACAO
ADVANCED_MANUAL_CONTROLS_DEFERRED = YES
SILO_MEMBERSHIP_OWNER = SILOS · ARTICLE_FORMATION_OWNER = ARTIGOS
RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **O bug do print, explicado.** O rodapé contava `selectedArticleIds` (linhas
  selecionadas) e as ações contavam `selectedCandidateRefs` (só as linhas que
  são candidatas do cenário corrente). Uma linha selecionada sem
  `candidateRef` somava no primeiro e sumia no segundo: a tela dizia "1 artigo
  selecionado" e o botão respondia "Selecione pelo menos um artigo" — uma
  recusa que nenhum clique resolve.
- **`resolveFormationSelectionScope`** é a autoridade única: devolve
  `selectedCount`, `candidateRefs`, `excluded` e uma recusa que **nomeia** quem
  ficou de fora e o que resolve. Reprocessar e Concluir leem o mesmo objeto.
  O nome evita colisão com o `resolveArticleProcessScope` que já existia em
  `article-process-scope.ts` e responde outra pergunta (keywords do lote da IA).
- **A etapa intermediária saiu** (§13). O rodapé tinha "Enviar para aprovação",
  que não gravava sucessora — só movia de fila. A fase 1 tem dois atos,
  `Reprocessar artigos` e `Concluir formação`, e um desfazer:
  `Reabrir revisão`.
- **O rótulo parou de anunciar ato que não houve** (§9). "Formação concluída"
  aparecia assim que existia ArticleDNA, mesmo com a versão `proposed` e o
  botão de concluir ainda por clicar. Agora: *ArticleDNA aprovado* ·
  *Formação processada · falta concluir* · *Formação em processamento*.
- **Ajustes manuais atrás de uma porta** (§7). Tornar principal, trocar papel,
  separar, remover e mover continuam existindo — sob "Ajustes avançados", fora
  do caminho crítico. Nada foi apagado, e um teste falha se alguém remover.
- **Validação:** `test:arquiteto` 1587/1588 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo, lint limpo.

## Confirmar arquitetura: preview obrigatório — 2026-09-06

```text
SILO_PHASE_FINAL_ACTION = CONFIRMAR_ARQUITETURA
SILO_PHASE_CLOSED       = NO   (depende do clique humano; nada foi gravado)
SILO_DNA_APPROVED       = 3/3
SILO_PAGE_APPROVAL_READY = 3/3 (preflight, com a identidade que a confirmação grava)
SILO_PAGE_APPROVED      = 0/3
APPROVED_ARTICLES_EXACT_MATCH = 6/8 · DRIFTED = 2/8 · LOCAL_ASSIGNMENTS_TO_RESTORE = 3
SAFE_TO_REPROCESS_ARTICLES = NO · SAFE_TO_PROCESS_LINKS = NO
PROVIDER_CALLS = 0 · REMOTE_WRITES = 0
```

- **O primeiro clique agora é preview SEMPRE.** O preview de impacto existia,
  mas só disparava quando o plano mexia em estrutura aprovada; plano limpo
  gravava direto, e a pessoa nunca via quais Silos seriam confirmados nem
  quantas keywords mudariam de território. "Não quebra nada" não é o mesmo que
  "já pode ir".
- **A confirmação é amarrada ao plano previsto** por assinatura
  (`confirmTerritoryRefs` + `keywordId->territoryRef`, ordenados). Se o lote
  mudar entre os dois cliques, volta a ser preview em vez de aplicar o que
  ninguém olhou.
- **A tela do preview** mostra os Silos do plano, a contagem de atribuições e,
  por Silo, o estado da SiloPage vindo do MESMO preflight da fase — canonical
  confirmado ou planejado, publicação, e `SILO_PAGE_APPROVAL_READY = NO` quando
  for o caso. O bloco de impacto continua nomeando o Article afetado no formato
  `1/3 → 3/3`.
- **Invariantes preservadas:** `BREAKS_APPROVED_STRUCTURE` e
  `PARTIAL_RESTORATION` continuam recusa, não aviso — e agora limpam o preview
  pendente para que ninguém "confirme de novo" sobre um plano bloqueado.
- **A restauração não reagrupa.** O baseline continua sendo
  `humanFormationRef`/`humanRole` persistidos em cada keyword; nenhuma
  heurística de similaridade participa. Travado por teste.
- **`audit:drift` já ignorava proposta no-op:** ele compara contra a versão
  APROVADA de maior número. `skin care principia` aparece `[v10] MATCH` mesmo
  com a v17 `proposed` no acervo.
- **Estado do drift medido agora:** `skin care pele oleosa [v5]` perdeu
  `skin care pele oleosa` e `skin care para peles oleosas` para
  *Pele Oleosa e Acne (candidate)*; `retinol creamy antes e depois [v6]` perdeu
  `retinol da creamy` para o *Anti-idade e Retinol (candidate)* duplicado. Três
  atribuições, dois Articles.
- **SERP do lote, para a etapa seguinte** (`audit:formation`): 8 candidatos —
  2 `CURRENT_SUPPORTED`, 2 `CURRENT_DIVERGENCE_RESOLVED`,
  3 `CURRENT_INCONCLUSIVE_RESOLVED`, 1 `CURRENT_INCONCLUSIVE_UNRESOLVED`.
- **Validação:** `test:arquiteto` 1579/1580 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo.

## Sucessora só nasce de decisão editorial — 2026-09-06

```text
ARTICLE_CONCLUSION_CREATES_NOOP_SUCCESSOR = NO
SKIN_CARE_PRINCIPIA_ALREADY_CANONICAL_APPROVED = YES (v10)
SAFE_TO_USE_SKIN_CARE_PRINCIPIA_AS_NOOP_SMOKE = NO
RESTORE_LOCAL_DRIFT_BEFORE_LINKS = YES
PROVIDER_CALLS = 0 · REMOTE_WRITES = 0 · RADAR_FILES_CHANGED = 0
```

- **Por que o `UNCHANGED` do writer nunca salvava.** Ele compara
  `contentHash`, e `confirmedArticlePayload` carimba data e acrescenta alerta a
  cada chamada: o hash SEMPRE muda. Cada clique em `Concluir formação` criava
  uma sucessora idêntica — e, até o corte anterior, essa proposta ainda escondia
  a versão aprovada na tela.
- **`article-editorial-diff.ts`** compara a proposta contra a CANÔNICA aprovada
  por lista de decisões (Principal, composição, papéis, Silo, território, slug,
  classificação, KGR, evidência SERP, identidade publicada), com carimbos
  removidos em profundidade — `confirmedAt`, `decidedAt`, `actorId`, `history`
  e equivalentes. `alerts` e `humanPendingDecisions` ficam fora: são registro
  do processo, não a decisão.
- **A guarda roda ANTES da escrita**, dentro de `materializeApprovedArticleDnas`.
  Sem diferença substantiva: `NO_NEW_VERSION`, e a mesa diz "O ArticleDNA
  aprovado já representa esta formação. Nenhuma nova versão foi necessária." —
  no-op é resultado, não silêncio, senão a pessoa clica de novo achando que
  falhou.
- **A auditoria usa a MESMA autoridade.** `audit:versoes` passou a reportar
  `CAMPOS_EDITORIAIS_ALTERADOS` e `CONCLUIR_FORMACAO_CRIARIA_SUCESSORA`, para
  que o relatório e a tela nunca discordem sobre o que é revisão.
- **Medido durante este corte:** `skin care principia` estava em v16 quando
  comecei e apareceu em **v17** ao final — outro no-op criado por um clique
  entre as duas execuções. Canônica continua `v10 approved`;
  `CAMPOS_EDITORIAIS_ALTERADOS = nenhum`.
- **Validação:** `test:arquiteto` 1572/1573 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo.

## Primeira passada sobre arquitetura planejada — 2026-09-06

```text
CURRENT_SCENARIO_HAS_PUBLISHED_CONTENT = NO
PUBLISHED_VERIFICATION_REQUIRED_NOW    = NO   (declarado em publication-scenario.ts)
SITEMAP_VERIFICATION_REQUIRED_NOW      = NO
PUBLISHED_STRUCTURE_RECONCILIATION_DEFERRED = YES
READY_FOR_RADAR_REQUIRES_PUBLISHED_PAGE = NO
LINKS_MODIFIES_ARTICLE_DNA = NO · LINKS_OUTPUT = INTERNAL_LINK_GRAPH
PROVIDER_CALLS = 0 · REMOTE_WRITES = 0 · RADAR_FILES_CHANGED = 0
```

- **O cenário é declarado, não escondido.** `publication-scenario.ts` publica
  `CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION = false` com o porquê e o
  que volta a valer depois. `resolveSiloPageApprovalReadiness` ganhou
  `publishedVerificationRequired`, **padrão `true`**: quem não declara nada
  continua sendo cobrado exatamente como antes.
- **A bandeira é aplicada no SERVIDOR**, no adapter da consolidação, lendo a
  constante do código. Aceitá-la no corpo da requisição deixaria a tela relaxar
  o próprio portão — a rota não a conhece.
- **Identidade contraditória continua bloqueando.** Canonical divergente entre
  o artefato e o catálogo não é "falta verificar a publicação": são dois
  endereços declarados para a mesma página. Nem o cenário planejado aprova isso.
- **Nada foi apagado.** Sitemap, catálogo do site, `SiteCatalogObservation`,
  `plannedSiloPageCanonical`, `canonical_mismatch` e os bloqueios
  `PUBLICATION_UNVERIFIED`, `PUBLISHED_URL_MISSING` e
  `PUBLISHED_IDENTITY_MUTATED` continuam implementados e sob teste.
- **Efeito medido** (`npm run audit:silopage`, read-only): com o cenário
  declarado, `rotina-skincare-facial` e `anti-idade-e-retinol` já ficam
  `READY` como estão gravadas; `skin-care-para-peles-oleosas` fica `READY` com
  o canonical planejado que a confirmação transporta. **3/3.**
- **A própria auditoria tinha o defeito da canônica.** `audit:arquiteto` pegava
  a versão mais nova e depois exigia `approved`: uma proposta escondia a
  entidade inteira. Corrigido — o corte agora é da última APROVADA, e
  `CURRENT_ARTICLES` passou de 9 para **10** (`skin care principia` reapareceu
  com sua v10 aprovada).
- **Ponto de partida do smoke** (`skin care principia`, `article-formation:16b09488…`):
  canônica `v10 approved`; território `territory:6d8facce…` → Silo
  `working-silo:2`; SERP `REUSABLE_CURRENT`, `state=resolved`, baseHash do
  acervo idêntico ao do DNA, decisão humana registrada; classificações
  resolvidas pela regra. Nenhuma chamada de provider seria necessária.
- **Validação:** `test:arquiteto` 1556/1557 (falha restante pré-existente do
  Minerador), `test:redator` 3/3, TypeScript sem erro novo.

## Preflight da SiloPage antes da confirmação — 2026-09-06

```text
SILO_PAGE_PUBLICATION_IDENTITY_AUTHORITY = lib/arquiteto/silo-page-publication-identity.ts
CONFIRM_ARCHITECTURE_USES_IT             = YES
SILO_PAGE_PREFLIGHT_VISIBLE              = YES
SILO_PAGE_APPROVAL_AUTHORITIES           = 1 (Confirmar arquitetura)
APPROVAL_READY_COM_IDENTIDADE            = 3/3
PROVIDER_CALLS = 0 · NEW_MIGRATION = 0 · REMOTE_WRITES = 0
```

- **A autoridade já existia e já é consumida.** `resolveSiloPagePublicationIdentity`
  resolve canonical confirmado pelo catálogo, canonical PLANEJADO a partir da
  origem declarada pela Brand e `canonical_mismatch` quando o artefato e o
  catálogo declaram endereços diferentes. A consolidação a chama e **grava** o
  resultado no payload (`canonical`, `publicationStatus`, `publishedUrl`,
  `publicationVerification`). Nenhuma autoridade nova foi criada.
- **Por que as três estavam bloqueadas.** As v1 gravadas são anteriores a esse
  transporte: o artefato nunca recebeu o que a varredura do site já tinha
  observado. Medido com `npm run audit:silopage` (read-only, zero provider):
  as três ficam `APPROVAL_READY = YES` assim que a identidade resolvida entra
  no payload — que é exatamente o que `Confirmar arquitetura` faz hoje.
- **`siloPageApprovalPreflight`** é a mesma `resolveSiloPageApprovalReadiness`
  chamada com uma decisão sintética que casa com a versão em mãos, para que
  sobrem só os impedimentos ESTRUTURAIS. Ela não aprova e não persiste nada:
  existe para que "falta decisão humana" não apareça como impedimento numa tela
  cujo objetivo é informar quem vai decidir.
- **Preflight visível na aba Silos:** por Silo, SiloDNA · SiloPage · Canonical ·
  Publicação · pronto para confirmar, com o código do bloqueio quando existe.
- **Aprovado ≠ publicado.** Página nova aprova com canonical planejado e
  `published = NO`; página existente aprova com canonical confirmado e
  `published = YES`. Evidência fraca do catálogo (`discovered`, `redirect`,
  `noindex`) não confirma identidade publicada, e divergência entre o declarado
  e o observado bloqueia sem escolher lado.
- **Validação:** `test:arquiteto` 1550/1551 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo. Testes A–G em
  `tests/arquiteto-silopage-preflight.test.mts`.

## Artefato canônico aprovado × proposta em edição — 2026-09-06

```text
CANONICAL_APPROVED_AND_WORKING_PROPOSAL_ARE_DISTINCT = YES
PROPOSED_VERSION_CAN_DEMOTE_APPROVED                 = NO
ARTICLE_UNIT_TYPE_IS_HUMAN_DECISION                  = NO (derivado)
SILO_PAGE_NEVER_APPROVED                             = 3/3
NEW_MIGRATION = 0 · REMOTE_WRITES = 0 · RADAR_FILES_CHANGED = 0
```

- **A proposta rebaixava a aprovada.** `listArquitetoArtifacts` devolve TODAS as
  versões em ordem crescente de `version_number`; a mesa as colapsava com
  `Object.fromEntries` por `articleId`, e sobrava a mais nova — aprovada ou
  não. Bastava nascer um `proposed` para o artigo aparecer "Aguardando
  aprovação" com a aprovação anterior intacta no acervo.
- **`canonical-version-authority.ts`** separa os dois fatos: `canonical` é a
  última aprovada, `workingProposal` é a revisão acima dela, `latest` continua
  sendo a base de qualquer sucessora — numerar a partir da canônica colidiria
  de versão. `canonicalRevisionState` acrescenta `workingProposalExists` e
  `canonicalIsStale` como perguntas SEPARADAS: invalidar exige motivo
  declarado, nunca "existe versão mais nova".
- **O provider compartilhado não mudou.** A lista completa vive em estado local
  do Arquiteto (`canonicalArticleVersions`, `canonicalSiloPageVersions`) e a
  autoridade é derivada dela somada ao mapa do provider — assim uma sucessora
  recém-gravada entra na conta sem esperar o F5.
- **Tipo de unidade virou fato derivado** (`editorialUnitTypeIsDerived`).
  Confirmar que um Article é um Article não decidia nada e gravava sucessora
  `proposed`, rebaixando o artigo. Decisão humana continua onde há ambiguidade
  real: `unknown`, `conflict` ou o balde `other`.
- **Medido no acervo** (`npm run audit:versoes`, read-only): das 33 entidades da
  marca, **uma** tem proposta acima da aprovada — `article-formation:16b09488…`
  (slug `principia`), v10 aprovada e v16 `proposed`. O diff campo a campo entre
  as duas é **um campo**: `unitClassification`, e nele só o carimbo
  `confirmedAt` mudou (22:45:42 → 22:57:15). Mesmo `type`, mesmo `status`,
  mesma `source`. Seis versões de puro no-op.
- **SiloPage 0/3 = NEVER_APPROVED.** As três estão em v1 `proposed`, versão
  única: não há aprovada mascarada nem aprovada stale. `Confirmar arquitetura`
  já pede `siloPage: "approved"`, e a recusa é nomeada:
  `SILO_PAGE_APPROVAL_PUBLICATION_UNVERIFIED: not_applicable` (Skincare Facial e
  Anti-idade e Retinol, publicadas e sem verificação de identidade) e
  `SILO_PAGE_APPROVAL_CANONICAL_MISSING` (Skin care para peles oleosas, nova e
  sem canonical planejado). Nada disso é bug de fluxo — são duas pendências
  reais, e a tela ainda não as mostra antes do clique.
- **Validação:** `test:arquiteto` 1538/1539 (falha restante pré-existente do
  Minerador), TypeScript sem erro novo.

## Ownership das fases e autoridade única do ArticleDNA — 2026-09-06

```text
ARTICLE_DNA_APPROVAL_OWNER    = ARTICLES_TAB
ARTICLE_DNA_FINAL_ACTION      = CONCLUIR_FORMACAO (confirmArticleFormation)
ARTICLE_DNA_APPROVAL_AUTHORITIES = 1
SILO_CONFLICT_OWNER           = SILOS_TAB
LINKS_CAN_APPROVE_ARTICLEDNA  = NO
LINKS_CONSUMES_APPROVED_ARTICLEDNA = YES
NEW_MIGRATION = 0 · REMOTE_WRITES = 0 · RADAR_FILES_CHANGED = 0 · PLANNER_FILES_CHANGED = 0
```

- **Conflito territorial vazando para o artigo.** `articleConflictsFor` só usava
  o cenário revisado dentro da aba Artigos; fora dela caía em
  `detectArchitectureConflicts`, que compara `suggestedSiloId` no agrupamento
  PROVISÓRIO do engine e emite `fronteira_de_silo` — conflito de nível `silo`.
  Resultado: na aba Links internos, um artigo com Silo já confirmado exibia
  "Temas semanticamente proximos foram direcionados a silos diferentes" como
  decisão humana pendente DELE, sobre um agrupamento que a revisão substituiu.
  O fallback foi removido: a autoridade é o cenário revisado em qualquer aba, e
  sem candidato correspondente a resposta é vazia.
- **Segunda autoridade de aprovação, e mais fraca.**
  `consolidateArticleArchitecture` (via `Aprovar ArticleDNA`, o seletor de
  status e o atalho do painel) gravava `status: "approved"` por
  `confirmArticleArchitecture` + `consolidationIssuesFor` — sem passar por
  `validateFormationConclusion`. Ela não cobrava o gate SERP do lote, as
  classificações não resolvidas, a keyword atravessando dois Silos nem o teto de
  composição. Os três controles foram removidos; quem aprova é
  `Concluir formação`. A porta de persistência do fechamento recusa a ação
  `approve` por escrito, para que uma reintrodução falhe em vez de abrir um
  segundo caminho de escrita.
- **Links dizia o estado da tela no lugar do que falta fazer.** A fase agora
  nomeia a dependência upstream — quais artigos do Silo ainda não foram
  concluídos — antes de qualquer estado interno. E `linksSaveState` era um
  latch: etapas marcavam `saving` e um `return` no meio deixava o estado preso,
  fazendo a fase recusar tudo com "Há uma operação em curso" sem operação
  alguma. `processarLinks` libera o latch ao sair.
- **Não corrigido de propósito:** registrar "Tipo de unidade"
  (`handleEditorialUnitDecision`) grava a sucessora SEM status, e a rota aplica
  `proposed` — rebaixando um ArticleDNA já aprovado para "Aguardando
  aprovação". É o que explica a coluna Aprovação nos prints de homologação.
  Mudar isso é decisão editorial (a classificação reabre ou não a aprovação?) e
  está reportada ao Planejador.
- **Validação:** `test:arquiteto` 1528/1529 (falha restante pré-existente do
  Minerador), `test:redator` 3/3, TypeScript sem erro novo. `test:operational`
  (9) e `test:editorial` (4) seguem falhando por deriva pré-existente.

## Fechamento humano do Article e ações por aba — 2026-09-06

```text
CLOSING_AUTHORITY        = lib/arquiteto/article-closing-service.ts (individual e lote)
STATUS_SELECTOR          = rodapé da aba Artigos · enviar para aprovação · aprovar · reabrir revisão
SERVER_REVALIDATION      = POST /api/arquiteto/artifacts (extensão aditiva, 422)
LEGACY_STATUS_PATH       = REMOVIDO (changeSelectedArticleStatus)
TAB_BOUNDARY             = mover para Silo em Artigos · enviar ao Radar em Links internos
NEW_DDL = 0 · NEW_MIGRATION = 0 · REMOTE_WRITES = 0 · RADAR_FILES_CHANGED = 0
```

- **Proposta:** `docs/04-arquiteto/propostas/sdd-fechamento-humano-e-aprovacao-em-lote-2026-09-06.md`,
  com a distribuição de ações por aba.
- **Uma autoridade para os dois caminhos** (`article-closing-service.ts`): o botão
  individual e o seletor em lote entram por `closeArticleRevision`. O lote é um
  laço sobre o mesmo ato. Cada artigo devolve `approved` · `already_approved` ·
  `blocked` · `failed` · `pending_confirmation`, com motivo e identidade da
  versão. Falha de um não apaga o que já foi confirmado; bloqueados continuam
  selecionados.
- **`changeSelectedArticleStatus` foi removido, não reconectado.** Ele "aprovava"
  acrescentando evento local — sem validação, sem persistência, sem readback — e
  estava sem chamador desde que o seletor antigo saiu da barra. Ligá-lo ao novo
  seletor daria a aparência de aprovação até o F5 desfazer tudo.
- **Reaprovar o que já está aprovado não cria versão.** `confirmedArticlePayload`
  carimba data e acrescenta alerta a cada chamada: o hash sempre muda e comparar
  conteúdo não responde nada. A pergunta passou a ser se resta decisão a
  registrar — versão aprovada, arquitetura confirmada e mesma Principal
  significa que não resta.
- **Reabrir revisão sucede, não rebaixa.** A aprovação pertence à versão que a
  recebeu; a reabertura cria uma sucessora em `proposed`. O readback dela é o
  desta operação — `readbackConfirmedArticleDnas` exige `approved` e recusaria
  justamente o que se acabou de gravar.
- **Readback inconclusivo manda reler.** O writer não é transacional: sem
  confirmação a tela não mexe no estado local e o resultado é
  `pending_confirmation`, nunca falha nem sucesso.
- **A SERP do fechamento vem do gate** (`serpEvidenceFromGate`). Recalcular a
  partir dos registros crus fazia evidência *sustentada* — que não tem
  `humanResolution` porque não precisa de uma — aparecer bloqueada aqui e
  liberada lá. Evidência vigente e indecisa passou a ter bloqueio próprio
  (`SERP_AWAITS_DECISION`): mandar coletar de novo não resolveria nada.
- **Revalidação no servidor** (`article-approval-revalidation.ts`): a rota já
  resolvia a marca autorizada e validava contrato, mas aceitava
  `status: "approved"` para qualquer ArticleDNA que passasse no schema. Agora o
  caminho de aprovação confere marca autorizada, Principal única e coerente com
  as referências, arquitetura confirmada e presença de evidência SERP — 422 com
  os motivos. Proposta e rascunho continuam podendo ser gravados incompletos.
- **Fronteira entre abas corrigida:** as condições estavam invertidas. O seletor
  "Mover selecionados para Silo" aparecia fora da aba Artigos e "Enviar ao
  Radar" aparecia dentro dela — dava para trocar o Silo de um artigo na aba de
  âncoras, e a transferência se oferecia no meio da formação.
- **Grafo aprovado envelhece com o artigo** (`internal-link-graph-staleness.ts`):
  uma sucessora na fase Artigos não invalida o grafo, mas ele passa a descrever
  uma composição anterior. A fase Links agora diz isso e nomeia os artigos; o
  gate do Radar já recusava a base nova pela comparação de `versionId`.
- **Validação:** `test:arquiteto` 1524/1525 (a falha restante é a pré-existente
  do Minerador, `Processar lógica`), `test:redator` 3/3, TypeScript sem erro
  novo. `test:operational` (9) e `test:authz` (1) seguem falhando por deriva
  pré-existente — asserções sobre uma geração anterior da tela, ausentes também
  em HEAD. Interface não validada manualmente.

## Fase 2C — consolidação de Silo a partir de Território confirmado — 2026-09-03

```text
SILO_WORKING_COPY_AUTHORITY   = REMOTE (buildCopy só origina proposta inicial)
SILO_PAGE_APPROVAL_GATE       = PRESENT (decisão própria, independente do SiloDNA)
CONSOLIDATION_PATH            = POST /api/arquiteto/silo-consolidation -> persist_silo_from_working_copy_atomic
RETRY_ENVELOPE_OWNER          = silo-consolidation-operation.ts (envelope congelado)
SILO_PAGE_APPROVAL_UI         = MISSING (gate existe; falta a tela que monta a decisão)
NEW_DDL = 0 · NEW_MIGRATION = 0 · PROVIDER_CALLS = 0
```

- **Relatório completo:** `docs/04-arquiteto/relatorio-fase-2c-silo-first.md` —
  o que foi feito, por quê, as invariantes que passaram a valer e como continuar.
- **Autoridade remota da working copy** (`silo-working-copy-bridge.ts`): a linha
  remota vence o estado local. Pilar, Suportes e exclusões persistem com o
  `expectedLock` da cópia carregada; sucesso é o readback, não o `setState`.
  `STALE_WORKING_COPY` recarrega e informa o conflito sem sobrescrever e sem
  retry automático; `WORKING_COPY_ALREADY_CONSUMED` deixa a tela somente-leitura.
- **Gate próprio da SiloPage** (`silo-page-approval.ts`): SiloDNA aprovado não
  aprova SiloPage. A decisão carrega ator, momento, motivo e a versão/hash sobre
  a qual decidiu. IA não aprova. `refuseStatusEscalation` consome a readiness já
  resolvida em vez de recalcular — recalcular criaria duas autoridades.
- **Envelope de retry** (`silo-consolidation-operation.ts`): o envelope é
  construído uma vez e reenviado byte a byte. Reconstruí-lo geraria
  `versionId`/`createdAt` novos e a RPC não reconheceria o replay. Falha
  indeterminada guarda a operação; só o readback encerra.
- **Caminho canônico único:** a interface ainda chamava `persistArquitetoSiloPair`,
  travado em draft-only desde a 2C.4.6 — na prática a consolidação estava
  quebrada na tela. Agora vai pela rota canônica, partindo do snapshot remoto.
- **Narrativa territorial preservada:** `SiloDNA.territoryNarrative` é cópia fiel
  de `Territory.narrative`, comparada como snapshot exato. Ausência tem código
  próprio (`TERRITORY_NARRATIVE_MISSING`), separado de divergência.
- **Recuperação do `territory.ts`:** reconstruído a partir do JS transpilado após
  um script de faixa de linhas apagar 814 linhas de um arquivo untracked. 1.032
  linhas, 61 exports conferidos. Scripts de splice por faixa ficam proibidos.
- **Validação:** `test:arquiteto` 735/734/1 (falha restante pré-existente),
  `test:marca` 81/81, `test:redator` 3/3. TypeScript 5 pré-existentes e 0 novos,
  lint limpo nos 7 módulos novos e alterados, `git diff --check` limpo.
  `test:operational` (9) e `test:authz` (2) seguem falhando por deriva
  pré-existente em trechos não tocados. Interface não validada manualmente;
  smoke em `docs/04-arquiteto/smoke-silo-consolidacao-2c.md` pendente.

## SERP: reexecução, versionamento e vigente x tentativa — 2026-08-29

```text
SERP_LOGICAL_ID = articleId (estável entre execuções)
SERP_VERSION_ID = serp-formation:{brandId}:{articleId}:v{N}
SERP_CURRENT_SELECTOR = currentSerpAssessments / latestActiveSerpFormationAssessment
CURRENT_VERSION_COUNT = 1 por Article · HISTORY_VERSION_COUNT = N-1 (imutável)
REFRESH_FAILURE_INVALIDATES_CURRENT = NO
```

- **Registro canônico** (`lib/arquiteto/serp-assessment-registry.ts`): uma única
  avaliação vigente por Article, histórico preservado como `outdated`, resposta
  repetida para o mesmo Article resolvida pela última, e reexecução com conteúdo
  idêntico mantendo a versão vigente sem duplicar nem gerar falso erro.
- **Readback por versão nova:** a confirmação passou a comparar apenas o que
  acabou de ser escrito (`confirmTargets`), não o histórico com a mesma
  identidade lógica — origem do erro "Não confirmados: group-tsxaq3,
  group-tsxaq3".
- **Projeção sem revalidação:** mover a versão anterior para o histórico não
  reprocessa o schema; uma avaliação antiga gravada em formato anterior não
  derruba mais uma atualização válida.
- **Seleção deduplicada:** o mesmo Article não é enviado duas vezes na mesma
  execução, o que criava duas avaliações vigentes concorrentes.
- **Vigente x tentativa:** `CURRENT_SERP_STATE` e `LAST_REFRESH_ATTEMPT` são
  estados distintos. Com avaliação vigente, uma atualização que falha mostra
  "Última atualização da SERP falhou" + `[Repetir atualização]`, mantendo o
  processo em `Concluída`. Só sem avaliação vigente o Article fica em
  `SERP · Erro`. O gate da IA continua olhando a avaliação vigente.
- **Validação:** `test:arquiteto` 281 testes, 280 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## SERP: veredito humano único e readback por assessment — 2026-08-29

```text
SERP_HUMAN_VERDICT_SOURCE = resolveSerpFormationVerdict (COMPATIBLE | INCONCLUSIVE | DIVERGENCE)
COMPATIBLE_HUMAN_DECISION_REQUIRED = NO
INCONCLUSIVE_HUMAN_DECISION_REQUIRED = NO
DIVERGENCE_HUMAN_DECISION_REQUIRED = YES
READBACK_EXPECTATION_BEFORE = confirmed.assessments.length === assessments.length
READBACK_EXPECTATION_AFTER  = confirmação por assessment (id + hash + snapshots + recomendações)
```

- **Veredito único:** o estado que governa a decisão humana passou a ser só o
  veredito canônico. Campos técnicos legados (`Conclusão arquitetural: Revisar`,
  `Com conflito observado`, cards `PENDING`, `Seguir recomendação`/`Ignorar`)
  saíram da superfície humana quando o veredito é compatível ou inconclusivo:
  ficam preservados dentro de `Detalhes técnicos da SERP` e foram relabelados
  como sinais, não conflitos. Nada foi apagado do histórico.
- **Observações da SERP:** com veredito não divergente, os fatos por keyword
  aparecem como observação — intenção upstream, comportamento observado,
  sobreposição, página dominante, força da evidência e impacto arquitetural
  `Nenhum` — sem ações obrigatórias.
- **Conflito técnico deixou de contaminar gates:** indicador da planilha,
  status de aprovação e gate do Radar só tratam `assessment.conflicts` como
  pendência quando o veredito é `DIVERGENCE`.
- **Causa raiz do readback:** ao reexecutar, o mesmo `assessmentId` voltava e a
  lista guardava a versão anterior marcada como desatualizada junto com a nova;
  o mapa de readback (indexado por id) devolvia só a nova e a comparação por
  hash acusava perda inexistente. Correção: a versão anterior de mesmo id sai da
  lista, e a confirmação passou a ser por assessment, informando exatamente
  quais artigos não confirmaram.
- **Mensagem legada removida:** "a execução da SERP é atômica hoje" não existe
  mais; o contrato vigente é `PARTIAL_BY_ARTICLE`.
- **Validação:** `test:arquiteto` 271 testes, 270 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## SERP de formação com sucesso parcial por Article — 2026-08-29

```text
SERP_BATCH_POLICY_BEFORE = ALL_OR_NOTHING (Promise.all)
SERP_BATCH_POLICY_AFTER  = PARTIAL_BY_ARTICLE (Promise.allSettled)
```

- **Isolamento:** cada Article vira um assessment independente. Falha de uma
  unidade não apaga as demais; o route devolve `assessments`, `failures[]`
  (articleId, principalKeywordId, stage, code, message, retryable) e `summary`
  (requested/completed/failed), tudo aditivo.
- **Erro global x específico:** `DataForSeoCanonicalError` (conexão, credencial,
  capability) e `IntegrationRuntimeError` (quota) continuam encerrando o lote;
  falha de provider, normalização, snapshot, refs ou assessment de uma unidade
  vira `failure` daquele Article. A classificação usa estágio e código reais do
  diagnóstico, sem categoria inventada.
- **Persistência:** apenas assessments válidos são gravados e passam pelo
  readback; falha nunca é persistida como avaliação concluída. A validação de
  integridade passou a ser por Article — um assessment incompleto vira falha da
  unidade em vez de invalidar o lote.
- **UI:** toast informa `SERP concluída: 5 de 5` ou
  `SERP parcial: 4 de 5 · 1 com erro` com o motivo de cada falha; o artigo com
  erro mostra estágio, código, motivo e o botão `Repetir SERP deste artigo`,
  que reexecuta somente aquela unidade.
- **IA:** o gate ficou por Article — artigos com SERP válida seguem para a
  revisão com IA e os sem SERP ficam de fora com aviso explícito. Nenhuma
  chamada automática: SERP e IA continuam saindo de ação humana.
- **Validação:** `test:arquiteto` 261 testes, 260 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo, `git diff --check`
  limpo. Interface não validada manualmente.

## Gate de importação simplificado: aprovado é suficiente — 2026-08-29

```text
IMPORT_GATE = status canônico Aprovado + Brand correta + lifecycle + sem duplicação
SEMANTIC_GATE = REMOVIDO
INCONCLUSIVO = informação, nunca bloqueio
```

- **Regra vigente:** se a keyword está canonicamente **Aprovada** no Minerador,
  ela está apta a ser importada. O Arquiteto não adiciona um segundo juiz
  semântico depois que o humano aprovou.
- **Deixaram de bloquear:** `semanticQualification.semanticState`, intenção
  ambígua/indeterminada, funil indefinido, nicho indeterminado, evidência SERP
  insuficiente ou inconclusiva, estado da IA do Minerador, ausência de
  Apresentação Contextual, KGR e aplicabilidade. Nada disso é erro: são
  resultados legítimos da análise.
- **Continuam bloqueando:** status diferente de aprovado, cross-brand,
  workflow remoto incompatível, keyword já recebida ou já incorporada em
  ArticleDNA.
- **Qualificação Semântica** segue transportada integralmente no handoff como
  informação somente leitura, incluindo o estado `non_conclusive`.
- **Linguagem corrigida:** o painel do Arquiteto mostra
  `Minerador · Aprovado` e, quando houver dimensões sem conclusão, apenas
  "Algumas dimensões permanecem indeterminadas pela evidência disponível".
  `Dados upstream incompletos` foi removido como diagnóstico de erro.
- **Apresentação Contextual:** permanece `OPTIONAL` e `NON_BLOCKING`; nenhuma
  decisão sobre removê-la foi tomada nesta frente.
- **Validação:** `test:arquiteto` 243 testes, 242 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## IA do Arquiteto: execução visível e contadores separados — 2026-08-29

```text
AI_STATE_AFTER_EXECUTION = COMPLETED_NO_PROPOSALS | COMPLETED_WITH_PROPOSALS
AI_TAB_STATE = espelha o read-model (nunca "Não executada" após execução real)
TOAST_COUNT_SOURCE = classificação final (propostas materiais)
```

- **Causa raiz:** a execução da IA só era percebida pela existência de proposta
  material. Com a classificação de no-op (correta), um artigo de uma keyword
  cuja IA devolveu `manter_no_artigo` ficava com `pendingProposalCount = 0`,
  sem anotação aplicada, e o read-model caía em `NOT_RUN` — enquanto o toast
  anunciava a contagem bruta do provider. Dois números, duas fontes.
- **Correção:** o read-model recebe `aiCompletedWithoutProposals` quando existe
  decisão da IA para o artigo e nenhuma é material; o toast passou a anunciar a
  classificação final (`Revisão arquitetural concluída. Nenhuma alteração
  estrutural foi recomendada.`).
- **Leitura da aba** (`lib/arquiteto/article-ai-readout.ts`): separa
  `Propostas da IA` de `Decisões pendentes do artigo`, explica quando a
  diferença existe, mostra o resumo do no-op (uma única keyword, formação
  mantida, SERP considerada, nenhuma mutação) e, para proposta material,
  keyword, estado atual, proposta, motivo, evidência considerada e impacto.
  A leitura é filtrada pelas keywords do próprio artigo.
- **Validação:** `test:arquiteto` 242 testes, 241 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## Fronteira de aprovação do Article e ficha do ArticleDNA — 2026-08-29

```text
ARTICLE_APPROVAL_CREATES_RADAR = NO
ARTICLE_APPROVAL_REQUIRES_SILO = NO
READY_FOR_SILOS != READY_FOR_RADAR
RADAR_HANDOFF_REQUIRES_SILO = YES
RADAR_HANDOFF_REQUIRES_INTERNAL_LINK_GRAPH = YES
ARTICLE_FULL_DEFINITION_LAYOUT = ficha vertical por tópicos
ARTICLE_FULL_DEFINITION_READONLY = YES
```

- **Causa do crash:** `handleConfirmArticleArchitecture` e
  `confirmSelectedArchitectures` agendavam `pendingRadarSmoke`, e um efeito
  chamava `importApprovedToRadar` logo após o evento `approved`. Com o gate
  novo (artigo aprova sem Silo), `RadarItemSchema` recebia `siloId: null` e
  lançava ZodError. O acoplamento — não o schema — era o defeito.
- **Fronteira corrigida:** aprovar consolida, persiste, faz readback, marca
  aprovado e `Pronto para Silos`. Não cria RadarItem, PlannerItem nem
  PublicationItem. O handoff ao Radar continua sendo ação explícita e agora
  alimenta o readback do envio.
- **Nullable revertido:** `RadarItemSchema`, `PlannerItemSchema` e
  `OperationalPublicationSchema` voltaram a exigir `siloId: string`.
  `importArticlesToRadar` ignora versão sem Silo, então nenhuma unidade
  incompleta chega ao Radar mesmo por caminho indireto.
- **Dois derivadores distintos:** `resolveArticleSiloReadiness`
  (`READY_FOR_SILOS`) e `resolveArticleRadarReadiness` (`READY_FOR_RADAR`,
  exigindo Silo com SiloDNA/SiloPage aprovados, InternalLinkGraph aprovado e
  SERP íntegra). O gate `articleRadarGateIssues` ganhou as duas checagens.
- **Ficha do ArticleDNA:** `lib/arquiteto/article-dna-projection.ts` +
  `components/editorial/article-dna-readonly-panel.tsx` substituem o resumo
  anterior, no mesmo padrão do KeywordDNA: resumo compacto fechado e ficha
  vertical com Identidade, Arquitetura, Semântica, KGR, SERP, IA, Revisão,
  Proteções, Silo, Links e Proveniência técnica. Tudo somente leitura; os
  controles humanos continuam na aba Revisão.
- **Nota legada:** promessa, CTA e enriquecimento aparecem em "Notas e alertas"
  da ficha, explicitamente não bloqueantes.
- **Validação:** `test:arquiteto` 235 testes, 234 passando; `test:operational`
  50/41; `test:editorial` 20/16 — falhas restantes pré-existentes. TypeScript
  sem erros novos, lint limpo, `check:visual-system` exit 0. Interface não
  validada manualmente.

## Fechamento funcional da fase Artigos — 2026-08-29

```text
KEYWORD_FULL_PROFILE = ficha vertical por tópicos (sem grade ampla)
SERP_VERDICT = COMPATIBLE | INCONCLUSIVE | DIVERGENCE
ARTICLE_REVIEW = checklist único de decisões humanas
ARTICLE_APPROVAL_CTA = [Aprovar ArticleDNA] na aba Revisão
ARTICLE_STATUS_FLOW = Em formação → Aguardando revisão humana → Pronto para aprovação → Aprovado → Pronto para Silos
```

- **Perfil da keyword:** o resumo horizontal permanece; o accordion virou ficha
  vertical por tópicos (Identidade, Leitura lógica, Demanda, Competição SEO,
  Qualificação Semântica, KGR, Revisão upstream, Publicação, Apresentação
  Contextual e Proveniência técnica). `Revisão Minerador` saiu do resumo: é
  proveniência upstream, não decisão do Arquiteto. Legado incompleto abre com
  o aviso de que foi recebido antes do gate atual.
- **SERP (`lib/arquiteto/serp-formation-verdict.ts`):** evidência insuficiente
  passa a ser `Inconclusivo` — sem conflito bloqueante, sem decisão humana,
  estrutura mantida e botão `Atualizar SERP`. Divergência só existe com
  evidência suficiente e mostra keyword, papel atual, fato upstream, evidência
  observada, sobreposição, página dominante, força, recomendação, motivo e
  impacto, com as ações `Manter no artigo` e `Aplicar recomendação`. Artigo com
  uma única keyword nunca recebe conflito de agrupamento.
- **IA:** a aba explicita a função — segunda leitura arquitetural
  (pertencimento, Principal, papéis, canibalização, coerência com a SERP).
  Execução sem mutação continua concluída sem pendência.
- **Revisão humana (`lib/arquiteto/article-review-checklist.ts`):** painel
  único com todas as decisões obrigatórias (KGR do artigo, tipo de unidade,
  divergências SERP, propostas da IA, conflitos), cada uma respondendo o que
  falta, por quê e como resolver. Linguagem passou a ser "decisão pendente".
- **Aprovação explícita:** com zero pendências o artigo fica `Pronto para
  aprovação` e a aba exibe `[Aprovar ArticleDNA]`, que consolida, persiste e
  faz readback antes de virar `Aprovado`. O gate não exige Silo, categoria,
  CTA, promessa nem briefing do Planejador.
- **Tipo de unidade:** `Página de categoria` saiu da fase Artigos (é decisão de
  cluster/SiloPage); o rótulo canônico continua no contrato para publicados.
- **Validação:** `test:arquiteto` 227 testes, 226 passando (falha restante é
  pré-existente, em `modules/minerador/minerador-workspace.tsx`). TypeScript
  sem erros; lint limpo. Interface não validada manualmente.

## Perfil completo da KeywordDNA no Arquiteto — somente leitura e sem perda — 2026-08-29

```text
KEYWORD_PROFILE_MODE = READ_ONLY
KEYWORD_FULL_PROFILE_LOSSLESS = YES
MUTATION_CONTROLS = 0
ARTICLE_KGR_SEPARATE = YES
```

- **Correção do lote anterior:** `READ_ONLY` não significa parcial. A projeção
  passou a entregar resumo horizontal denso sempre visível (Volume, Resultados,
  Intenção, Funil, KGR, Aplicabilidade na primeira linha; CPC, KD, Tendência,
  Entidade, Confiança e Revisão Minerador na segunda) e todo o restante do DNA
  recebido dentro de `Ver perfil completo da keyword`.
- **Seções do perfil completo:** Identidade, Leitura lógica, Demanda · Google
  Ads, Competição SEO · DataForSEO, Qualificação Semântica do Minerador, KGR da
  keyword, Revisão humana do Minerador e Publicação/proteção. Seção sem dado
  recebido aparece com a explicação, em vez de sumir.
- **Losslessness:** qualquer chave de `analise_semantica` sem seção própria, a
  referência da versão, o payload do handoff e os estados de processo ficam
  acessíveis no subaccordion `Proveniência técnica`. Campo recebido não
  desaparece.
- **Apresentação Contextual restaurada:** o snapshot canônico do Arquiteto
  passou a transportar a apresentação persistida (`keywordPresentations`,
  aditivo e retrocompatível). O painel mostra texto integral, "Voz da Marca
  aplicada", versão, hash, provider/modelo e origem. Sem apresentação no
  handoff: "Não disponível para esta versão da KeywordDNA", sem IA e sem
  fallback.
- **Empilhamento:** Principal, Secundárias e Reforços usam o mesmo componente
  readonly, um abaixo do outro. O único controle do bloco é o select de papel
  no artigo, injetado pelo painel do artigo (`headerExtra`) — decisão de
  ArticleDNA, não de KeywordDNA.
- **Sem mutação:** o componente não tem input, textarea, select próprio,
  onChange, onClick nem ação de revisão upstream. KGR da keyword (score e
  aplicabilidade) e KGR do artigo continuam camadas distintas.
- **Validação:** `test:arquiteto` 216 testes, 215 passando (falha restante é
  pré-existente, em `modules/minerador/minerador-workspace.tsx`). TypeScript
  sem erros de código; lint limpo. Interface não validada manualmente.

## Gates de entrada e saída da fase Artigos — 2026-08-29

```text
IMPORT_ELIGIBILITY_SOURCE = resolveCanonicalMineradorArquitetoImportEligibility + semanticQualification.semanticState
INCOMPLETE_KEYWORD_IMPORT_FIXED = YES
ARTICLE_CONFIRM_REQUIRES_SILO = NO
READY_FOR_SILOS_DERIVER = resolveArticleSiloReadiness (lib/arquiteto/article-phase.ts)
AI_NOOP_PROPOSAL_BEHAVIOR = COMPLETED_NO_PROPOSALS (sem pendência humana)
LEGACY_EDITORIAL_GATE_FIELDS = promessa/CTA/enriquecimento → alerta informativo
```

- **Gate Minerador → Arquiteto:** a importabilidade canônica passou a exigir
  KeywordDNA consolidada. A fonte é a Qualificação Semântica persistida
  (`semanticQualification.semanticState === "conclusive"`), não rótulos da
  interface. Keyword aprovada sem qualificação conclusiva recebe
  `KEYWORD_DNA_NOT_READY`, aparece desabilitada com motivo legível e é
  recusada no writer canônico (`409`). Publicado protegido continua entrando
  pela identidade já existente; a importação segue seletiva e idempotente.
- **Sem requalificação no Arquiteto:** intenção, funil e fatos de KGR
  permanecem fatos upstream. A SERP do Arquiteto valida compatibilidade
  arquitetural e não completa KeywordDNA incompleta.
- **Article não depende de Silo:** `articleApprovalIssues` não exige mais
  `siloId` nem hierarquia Pilar/Suporte — ambos pertencem à etapa Silos,
  posterior a Artigos. A dependência circular (artigo não fechava sem Silo,
  Silo só nasce depois do ArticleDNA aprovado) foi removida.
- **Pronto para Silos:** derivador único `resolveArticleSiloReadiness` exige
  ArticleDNA consolidado, revisão humana resolvida, conflitos obrigatórios
  resolvidos, aprovação concluída e decisão KGR resolvida quando exigida. Os
  três pontos da interface (coluna Silo, resumo e seção Silo) passaram a ler o
  mesmo derivador, eliminando o estado incoerente
  "Em revisão + Com conflitos + Pronto para Silos".
- **IA sem mutação:** proposta `manter_no_artigo` + `manter_silo` + mesmo papel
  + sem ponto de decisão + sem conflito é registrada como execução sem
  alteração estrutural (`structuralChange: false`, `reviewState: reviewed`) e
  não gera pendência humana artificial. Propostas com mutação real continuam
  gerando revisão.
- **Campos editoriais fora do gate:** "Estratégia, promessa, CTA e fronteira"
  saiu de `humanPendingDecisions` do ArticleDNA-base e permanece como alerta
  informativo; ownership é do Planejador/Redator. Nada foi apagado do legado.
- **Consequência conhecida:** enquanto a decisão KGR do artigo não tiver campo
  canônico, um artigo não pleno com Principal aplicável permanece bloqueado
  para Silos por `kgrDecisionPending`. Ver
  `propostas/2026-08-28-pedido-estrutural-decisao-kgr-do-artigo.md`.
- **Validação:** `test:arquiteto` 204 testes, 203 passando; `test:operational`
  e `test:editorial` mantêm apenas falhas pré-existentes de asserções sobre
  arquivos em refatoração fora desta tarefa. TypeScript sem erros de código,
  lint sem novos problemas. Interface não validada manualmente.

## Regra final de KGR do artigo — 2026-08-28

```text
KEYWORD_KGR_SCORE = minerador_keywords.kgr_score / kgr (KeywordDNA.kgrScore) — lido, nunca recalculado
KEYWORD_KGR_APPLICABILITY = analise_semantica.kgr_aplicabilidade (readKgrApplicability) — lida, nunca sobrescrita
ARTICLE_KGR_DECISION = YES | NO | PENDING_HUMAN_DECISION | PENDING_APPLICABILITY | ABSENT
ARTICLE_KGR_DECISION_SOURCE = FULL_KGR_RULE | HUMAN_DECISION | CONFIRMED_KGR_BINDING | KEYWORD_APPLICABILITY_RULE | AWAITING_HUMAN_DECISION | AWAITING_KEYWORD_APPLICABILITY | MISSING_KGR_SCORE
FULL_KGR_THRESHOLD = 0.25 (estritamente kgr < 0.25)
ARTICLE_KGR_DECISION_UI = IMPLEMENTED_LOCAL
ARTICLE_KGR_DECISION_PERSISTENCE = WORKING_COPY_PAYLOAD_LOCAL
STRUCTURAL_KGR_DECISION_REQUIRED = NO
```

- **Regra vigente** (`lib/arquiteto/article-kgr-decision.ts`), sempre a partir da
  Principal aprovada: decisão humana já registrada no contrato canônico
  prevalece; score válido `>= 0` e `< 0.25` é **KGR pleno** (`Sim · KGR pleno`,
  token verde, sem pedir decisão humana); `0.25` exato não é pleno; `>= 0.25`
  com aplicabilidade `Aplicável` fica `A decidir` para o humano; `>= 0.25` com
  `Não aplicável` é `Não`; `>= 0.25` com aplicabilidade pendente permanece
  `Pendente`; score ausente permanece `—` e nunca vira zero.
- **Proveniência preservada:** `KEYWORD_KGR_SCORE`,
  `KEYWORD_KGR_APPLICABILITY`, `ARTICLE_KGR_DECISION` e
  `ARTICLE_KGR_DECISION_SOURCE` são fatos distintos. Secundárias e reforços
  mantêm score e aplicabilidade próprios; não há média, maioria nem contagem
  que classifique o artigo — a contagem de secundárias aplicáveis existe apenas
  como evidência para eventual proposta de revisão da Principal.
- **UI:** o resumo do artigo exibe a classificação do artigo com tom próprio; as
  keywords exibem `Aplicável / Não aplicável / Pendente`; o score decimal segue
  exclusivo do perfil completo da KeywordDNA. Na Revisão, o select
  `A decidir / Sim / Não` é decisão do Article e não reutiliza o select de
  aplicabilidade do KeywordDNA.
- **SERP:** para artigo não pleno com Principal aplicável, a aba mostra KGR da
  Principal, aplicabilidade upstream, competição observada, força da evidência
  e recomendação `Favorável / Desfavorável / Inconclusiva` quando derivável do
  assessment ativo. A SERP não altera score nem aplicabilidade upstream.

- **Persistência e versão:** a decisão humana usa o `payload` durável de
  `editorial_workflow_items`, validado server-side por Brand e `lock_version`.
  O envelope aditivo guarda estado, source, Principal/KeywordDNA (id, versão e
  hash quando disponíveis), score, aplicabilidade, ator, data e histórico. Uma
  mudança material da decisão ou da Principal cria sucessora do `ArticleDNA`;
  a versão aprovada anterior permanece imutável.
- **Gates:** `PENDING_HUMAN_DECISION` bloqueia a aprovação estrutural e o
  handoff real ao Radar. O Radar recebe `ArticleDNA.kgrIdentity` e não
  recalcula score ou aplicabilidade.
## SERP como evidência prioritária no Arquiteto — 2026-08-27

- **Evidência atual:** testes locais concluídos; homologação autenticada,
  persistência remota e F5 continuam pendentes de smoke manual. Não houve
  migration, DDL, DML administrativo ou chamada de provider nesta etapa.

- **Implementado localmente:** assessment ativo com cobertura completa,
  snapshots observáveis, recomendação e observação por KeywordDNA recebe
  precedência de recomendação na UI. A prioridade explica que Lógica é
  hipótese, IA interpreta e humano consolida; ela não aciona handler de
  regrouping, principal, slug ou aprovação.
- **Explicabilidade:** o painel mantém objeto/hipótese, intenção esperada e
  observada, compatibilidade, sobreposição, página dominante, competição,
  conflito, recomendação, motivo e insuficiência nas evidências já recebidas.
  Slug atual/provisório é exibido sem inventar recomendação SERP ausente.
- **Dependência estrutural registrada:**
  `propostas/2026-08-27-pedido-estrutural-serp-slug-structural-review.md`
  descreve a persistência de recomendação de slug e de
  `STRUCTURAL_REVIEW_REQUIRED` downstream. Radar, Planejador e Redator não
  foram alterados.
- **Validação:** testes SERP focados 32/32 passaram. Provider real, Chrome,
# Estado atual — Arquiteto

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

```text
STATUS            = SCRIPT PRONTO, NAO EXECUTADO
AUTORIZACAO       = responsavel pela marca, explicita, registrada nesta entrada
MARCA ALVO        = 09762023-d0d4-4c24-b34e-d0fdfd43f891 (Care Glow)
ESCOPO            = stage IN ('architect','radar') + artefatos article_dna/silo_dna/silo_page
PRESERVADO        = Marca, Minerador, Planejador, Redator, Publicacoes,
                    usuarios, permissoes, integracoes e TODAS as outras marcas
SQL_EXECUTADO_POR_MIM = 0
```

**Natureza.** Não é saneamento de defeito. A auditoria de 2026-09-06 provou os
registros íntegros e a continuidade validada. Isto é **descarte deliberado de
trabalho**, decidido pelo responsável pela marca. A regra "proibido limpar dados
para corrigir problema de interface" **permanece válida** e não é revogada por
esta operação — ela não se aplica porque não há problema de interface a corrigir.

**Levantamento inicial informado** (a conferir na execução): 115 versões de
ArticleDNA, 9 revisões de arquitetura por IA, 21 registros de trabalho do
Arquiteto, 4 artigos do Radar, 10 eventos de importação, 9 snapshots e 6
revisões SERP. Zero SiloDNA/SiloPage e zero grafos de links.

### O script — arquivo único

`supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql`

**SQL PostgreSQL puro**, para copiar e colar no editor do Supabase. Sem
`\set`, sem placeholder, sem substituição manual — a marca já está fixa no
próprio script. Tudo dentro de um `DO` block, que é uma transação implícita:
qualquer exceção desfaz tudo, inclusive o estado dos gatilhos.

**Backup dispensado por decisão explícita.** Este é descarte DEFINITIVO, sem
restauração. Está escrito no cabeçalho do script para ninguém supor o
contrário depois.

Executar **duas vezes**: primeiro com `v_simular := true` (percorre tudo,
imprime o manifesto e aborta de propósito), depois com `false`. Uma terceira,
de volta em `true` sobre o estado já vazio, prova idempotência.

### Garantias embutidas no script

- **Identidade validada** antes de qualquer remoção; marca inexistente aborta.
- **Condições positivas** para `architect` e `radar` — `stage <> 'architect'`
  foi eliminado, porque excluir pelo complemento apagaria estágio futuro que
  ninguém revisou.
- **Dependências abortam com os ids à vista:** Planejador, ContentPlan que cite o
  artigo no payload, Redator, Publicações, e entidade que apareça em outra marca.
- **Uma transação**, com `lock_timeout` e `statement_timeout`; dependentes
  removidos antes das origens; nenhum `UPDATE` anulando referência para
  contornar validação.
- **Gatilhos append-only nomeados um a um** (`editorial_artifact_versions`,
  `version_status_events`, `decision_events`, `serp_snapshots`,
  `serp_reviews`), **desabilitados e reabilitados na mesma transação**, com
  verificação de restauração. Nenhuma função, FK ou validação é removida.
- **Preservação comprovada por hash de ids**, não só contagem — Minerador, outras
  marcas e outros artefatos.
- **Órfãos verificados** em `version_status_events` e `decision_events`.
- **Qualquer divergência levanta exceção** e desfaz tudo.
- **`:simular = true`** roda o caminho inteiro e aborta de propósito no fim.

### O que o script NÃO faz — é seu

1. **Rodar a exportação antes.** Sem ela a purga é irreversível.
2. **Conferir Arquiteto e Radar vazios nas duas sessões**, pelo servidor. Se vier
   conteúdo, é recuperação local — não dado remoto.
3. **Não limpar `localStorage` indiscriminadamente.** Confirmar que recuperação
   local antiga não repovoou o servidor.
4. **Reexecutar com `:simular = true`** sobre o estado já vazio, provando
   idempotência.
5. Registrar aqui o resultado por tabela e a validação nas duas sessões.

### Pendência separada

A **ausência de seleção e exclusão na aba Silos** fica registrada como correção
funcional própria, no backlog. Não é motivo desta purga nem é resolvida por ela.

## Fundação InternalLinkGraph e atomicidade do par — estado vigente 2026-08-27

```text
INTERNAL_LINK_GRAPH_LOCAL = IMPLEMENTED
SILO_PAIR_ATOMICITY_LOCAL = IMPLEMENTED
MIGRATIONS_LOCAL = READY
ROLLBACK_LOCAL = READY_NOT_AUTOMATIC
REMOTE_MIGRATIONS = APPLIED_MANUALLY
REMOTE_PREFLIGHT = PASS_PRE_APPLY_READ_ONLY
REMOTE_POST_APPLY_READBACK = PASS
REMOTE_TRANSACTIONAL_SMOKE = PASS_ROLLED_BACK
REMOTE_CROSS_BRAND_SMOKE = PASS_ROLLED_BACK
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

- **InternalLinkGraph:** o contrato compartilhado e o domínio local agora
  preservam um grafo por `brandId = public.marcas.id` e Silo, com versões-base
  de SiloDNA/SiloPage, ArticleDNAs participantes, nós tipados, arestas
  dirigidas, hashes determinísticos, stale, propostas separadas e aprovação
  humana. KeywordDNA não é nó; SiloPage não é Pilar.
- **Persistência local preparada:**
  `20260826225145_internal_link_graph_foundation.sql` cria as quatro tabelas,
  constraints/FKs `RESTRICT`, seis guards SQL, nove triggers, RLS, policies e
  a RPC server-side do grafo. `20260826225154_silo_pair_atomicity.sql` cria a
  RPC transacional do par sem fundir as entidades.
- **Código consumidor:** a consolidação humana usa
  `persistArquitetoSiloPair()` → `/api/arquiteto/silo-pair` →
  `persist_silo_pair_atomic(...)`, com readback das duas entidades. O graph
  possui rotas server-side de leitura, persistência e propostas. O handoff do
  Radar recebeu apenas `internalLinkGraphRef` opcional e retrocompatível.
- **Limite explícito:** a atualização de catálogo de listas e o workflow não
  fazem parte da transação do par de artefatos. React Flow, localStorage e
  IndexedDB continuam projeções/recuperação e não são fonte canônica.
- **Evidência:** o readback remoto pós-aplicação e o smoke transacional do
  InternalLinkGraph passaram; o smoke terminou com rollback e não deixou
  fixtures, membership ou Brand temporária. A fundação foi aplicada
  manualmente em `20260827044408_internal_link_graph_integrity_guards.sql`;
  nenhuma chamada paga foi realizada.
- **Silo Pair:** o smoke transacional passou com readback de SiloDNA e SiloPage,
  rollback forçado e rejeição de versão obsoleta. A fixture técnica usou o
  owner `postgres` porque `service_role` não possui `UPDATE` em
  `editorial_artifact_versions`; isso permanece uma nota operacional, sem
  alteração de grants.
- **Próxima frente:** implementar e validar a experiência funcional da aba
  Links Internos sobre o contrato persistente. React Flow continua sendo
  projeção, não fonte de verdade. Rollbacks estão em `supabase/rollback/` e
  não são automáticos.

## Consolidação canônica de integrações — 2026-08-25

- **DataForSEO:** Connection compartilhada `READY` para compatibilidade SERP;
  o Arquiteto não possui capability, grant, binding, quota ou provider de SERP
  próprio.
- **DeepSeek:** Connection compartilhada e modelo permitido são resolvidos por
  operação/capability; o módulo não administra segredo.
- **Fronteira:** Radar recebe ArticleDNA formado e investiga pela infraestrutura
  compartilhada; não há restauração de provider SERP legado.

As entradas históricas abaixo preservam decisões e evidências anteriores; o
bloco acima é o estado vigente desta consolidação.

## Correção do ciclo da GlobalTopbar e validação visual — 2026-08-14

- **Causa confirmada no código:** o Arquiteto reconstruía `globalTopbarControls` quando handlers locais eram recriados. O efeito de registro dependia do objeto inteiro; cada nova identidade executava cleanup, `unregisterControls` e novo `setControls` no provider, que re-renderizava a árvore e podia terminar em `Maximum update depth exceeded`.
- **Correção local:** `GlobalTopbarControlsProvider` mantém callbacks estáveis, ignora registros com a mesma identidade e expõe atualização separada por `moduleId`. O Arquiteto guarda handlers mutáveis em `topbarHandlersRef`, registra uma vez por montagem/troca de módulo e atualiza somente o valor dos controles. O cleanup valida o módulo antes de remover o registro, protegendo contra cleanup obsoleto.
- **Preservação:** busca, filtros, histórico, undo/redo, processamento lógico, importação, criação de silo, exportação, navegação entre módulos, seleção, persistência, workflow, contratos e dados não foram redesenhados nem alterados por esta correção.
- **Histórico visual:** o botão global agora identifica seu módulo. O `HistoryControls` recebeu variante semântica opt-in usada somente pelo Arquiteto; o popover é ancorado no botão da GlobalTopbar, abre abaixo dele e fecha por clique externo, Escape ou botão de fechar. O consumidor legado permanece disponível para os demais módulos.
- **Tokens:** o conteúdo ativo do Arquiteto usa superfícies/divisores/estados semânticos e não contém classes roxo/violeta/índigo, hex ou `bg-black`/`text-white`/`border-white`. A GlobalTopbar foi preservada visualmente.
- **Verificado por testes:** testes direcionados do ciclo/visual/seleção `30/30` (4 topbar, 9 seleção, 17 fundação visual), `test:arquiteto` `101/101` e `check:visual-system = PASS`.
- **Validado manualmente no Chrome:** rota Arquiteto, topbar, workspace vazio, busca, filtros, histórico ancorado, fechamento externo, modal de silo sem submissão, modal de importação vazio, exportação e navegação foram exercitados. Após recarga limpa, não houve erro novo durante essas interações.
- **Limitação real:** a Brand ativa retornou `0 artigos` no workspace canônico. Não foram criadas keywords, importações ou escritas remotas para fabricar dados; estados carregado, selecionado, expandido, conflito, revisável, ArticleDNA/SiloDNA e teste físico de pintura em linhas reais continuam pendentes. As capturas dessa validação ficaram fora do repositório e não são referências operacionais.
- **Bloqueios do checkout:** `pnpm run build` compilou o código, mas falhou no type-check por três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts` (flags regex ES2018). `test:operational` mantém quatro asserções antigas incompatíveis com o código atual, fora da causa desta tarefa. O lint amplo mantém erros legados de `any`/imports na página; não foi usado para declarar a correção como inválida.

## Fase 2 — preflight da limpeza estrutural — 2026-08-12

- **Preparado localmente:** `supabase/scripts/structural-cleanup-preflight-read-only.sql` executa uma única consulta read-only para os candidatos exclusivos de 0030 e `tenant_0016_agency_role_rollback`.
- **Cobertura:** existência, contagens, FKs de entrada/saída e `ON DELETE`, `pg_depend`, views/materialized views, funções/procedures, referências de source, índices, constraints, RLS, policies, ACL, owner e trigger real dos execution events.
- **Preservação explícita:** `pipeline_editorial_protect_append_only()` e seus consumidores canônicos 0027/0028 permanecem fora do conjunto de remoção.
- **Classificação local esperada:** 0030 (duas tabelas, helper e trigger exclusivo) e 0016 rollback são `DROP_CANDIDATE`; a confirmação `DROP_SAFE` depende do catálogo remoto e de zero linhas/dependências externas.
- **Numeração registrada na preparação:** migrations locais chegavam a `0030`; `0031` não pode ser reutilizada; `0032` foi o próximo número sucessor preparado.
- **Estado naquele gate:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`; a aplicação e o post-verifier da 0032 estão registrados nas seções posteriores deste documento.

## Fase 1 — zero legacy runtime do recovery histórico — 2026-08-12

- **Removido localmente após auditoria de consumidores:** `lib/arquiteto/legacy-handoff-reconciliation.ts`, `app/api/arquiteto/handoff/preview/route.ts` e `app/api/arquiteto/handoff/rebaseline/route.ts`.
- **Removidos junto:** schemas/clientes de prévia, modal sem disparador, tipos, planos, mensagens e testes exclusivos do rebaseline histórico.
- **Handoff normal preservado:** `POST /api/arquiteto/handoff` agora usa somente `prepareCanonicalHandoff()` e `createMineradorArquitetoHandoff()`. Ele aceita `aprovado`/`publicado`, cria apenas `keyword/architect/received`, confirma o readback e trata workflow remoto não-`received` como conflito; não converte marcador histórico em `received`.
- **Preservado por consumidor ativo:** `resolvePipelineContext()`, `editorial_workflow_items`, `pipeline-repositories.ts`, `editorial-repositories.ts`, `/api/arquiteto/workspace`, `/api/arquiteto/artifacts`, `/api/editorial/*`, `browser-artifact-store.ts`, `briefings_artigos`, `/api/editorial/workspace`, adapters atuais e recovery local do Arquiteto/Redator.
- **Preservado por consumidor ativo:** `lib/legacy-routing.ts` continua importado por `proxy.ts` e coberto pelos testes de tenant/routing; não foi removido por não satisfazer `RUNTIME_CONSUMERS = 0`.
- **Não tocado:** banco, migrations, 0030, `tenant_0016_agency_role_rollback`, `minerador_google_ads_connections`, localStorage e IndexedDB.
- **Estado:** `REMOVED_RUNTIME_LEGACY`; `ZERO_RUNTIME_CONSUMERS = PASS` para o conjunto removido e `FAIL` para `lib/legacy-routing.ts`/recovery local ativo. Nenhuma operação remota foi executada.

## Correção do read-model do handoff canônico — 2026-08-12

- **Verificado no código:** o POST de `Importar do Minerador` chama `POST /api/arquiteto/handoff`, resolve `brandId` e `actorUserId` no servidor por `resolvePipelineContext()`, lê `keywords_kgr` da mesma Brand, grava `editorial_workflow_items` como `keyword/architect/received` e confirma o readback antes de responder `PERSISTED` ou `UNCHANGED`.
- **Corrigido localmente:** o merge do workspace removia todos os itens com origem `CANONICAL_REMOTE`, inclusive handoffs `received` sem ArticleDNA. O read-model agora preserva o handoff canônico até que um ArticleDNA da mesma keyword o substitua por identidade técnica.
- **Preservado como histórico fora do runtime normal:** eventual guard `historical_import_protected` não é lido nem convertido pelo handoff normal; nenhum recovery, backfill, storage local, migration ou RPC excepcional foi alterado.
- **Diagnóstico preparado:** `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql` conta somente metadados por `brandId` canônico informado manualmente; não usa nome, slug, owner ou conteúdo editorial.
- **Validado manualmente pelo usuário:** `SMOKE_NOVO_PIPELINE_PERSISTENCE = PASS`. Em dois navegadores, uma keyword nova aprovada gerou workflow remoto, formou ArticleDNA e o artefato permaneceu após F5, reinício da aplicação e retorno ao outro navegador.

## Correção da autoridade de importabilidade entre navegadores — 2026-08-12

- **Causa confirmada no código:** `architectImportedKeywordIds` é um campo legado de recovery salvo no `localStorage`, sob a chave `minerador-pro:workflow-recovery:${actorUserId}:${brandId}`. O modal o tratava como bloqueio definitivo; por isso navegadores com snapshots locais diferentes exibiam elegibilidade diferente para a mesma Brand.
- **Corrigido localmente:** `GET /api/arquiteto/workspace` agora calcula a importabilidade no servidor a partir de `keywords_kgr`, de todos os workflows `keyword/architect` da Brand e das referências de ArticleDNA canônicas. O cliente recebe essa classificação e não usa `localStorage`, IndexedDB ou marcador transitório para habilitar ou desabilitar a importação.
- **Decisão canônica atual:** workflow remoto `received`, outro workflow remoto incompatível ou keyword já referenciada por ArticleDNA determinam a elegibilidade. `publicado` recebe a classificação de proteção editorial, mas permanece elegível para reconstrução conforme o handoff normal; marcadores e guards históricos não são consultados pelo runtime.
- **Storage preservado:** nenhuma chave foi apagada. `architectImportedKeywordIds`, artefatos de recovery em IndexedDB e cópias legadas em `localStorage` permanecem somente como material de recovery/auditoria; não são autoridade de elegibilidade.
- **Pendente de validação manual:** abrir `Importar do Minerador` nos navegadores A e B, mesma conta e Brand, comparar as mesmas keywords e repetir logout/login, confirmando a mesma decisão canônica e a permanência do ArticleDNA. Nenhuma conclusão operacional é declarada antes dessa comparação.

## Histórico arquivado — Historical Import Guard do handoff legado (2026-08-12)

O runtime de recovery/rebaseline histórico foi abandonado na Fase 1. Esta
seção preserva o contexto documental, mas não descreve uma superfície ativa.
Não há writer, rota de recovery, criação de `historical_import_protected`,
backfill ou operação remota autorizada por este registro. O handoff normal usa
somente o caminho canônico descrito no bloco da Fase 1 acima.

> **Estado documental vigente — 2026-07-27:** a rota atual é `app/(brand)/[brandRef]/arquiteto/page.tsx`; a referência posterior a `/{brandUserId}/arquiteto` é alias histórico. O reparo de leitura/recovery continua sem reagrupamento automático e a conclusão operacional ainda depende de validação manual com snapshot, localização e isolamento por marca.

## Planilha operacional — padrão visual do Minerador (2026-07-31)

- **Referência verificada no código:** `modules/minerador/minerador-workspace.tsx` usa barra operacional compacta, `table-fixed`, `border-collapse`, `min-w-[110rem]`, overflow horizontal no container da planilha, cabeçalho escuro fixo, células com separadores `border-slate-800/60`, linhas neutras, hover cinza e seleção índigo discreta.
- **Aplicação local no Arquiteto:** `modules/arquiteto/arquiteto-workspace.tsx` agora reutiliza essa geometria para barra superior e inferior, container, tabela, cabeçalho, colunas técnicas, linhas de artigo, badges, selects e checkbox. A keyword principal é a única coluna textual elástica; silos continuam linhas agrupadoras compactas e preservam somente seu indicador semântico lateral.
- **Preservação:** nenhuma alteração em contratos, persistência, dados, filtros, ordenação, handlers, ArticleDNA, SiloDNA, SERP ou no controlador `article-selection.ts`. Clique, Ctrl/Cmd, Shift, pintura por arraste, teclado e ações em lote permanecem fora desta alteração.
- **Ainda pendente:** comparação manual autenticada Minerador × Arquiteto em 360/768/1024/1440px, inclusive hover, seleção, foco, disabled e scrollbar. Nenhuma equivalência visual é declarada antes dessa verificação.

## Histórico de segurança como popover (2026-07-31)

- **Correção local:** o Arquiteto passa `presentation="popover"` para `HistoryControls`; o histórico deixa de abrir como drawer lateral e aparece abaixo do botão Histórico, antes da planilha.
- **Interação preservada:** o popover fecha por clique fora, `Escape` ou botão de fechar. A ancoragem compartilhada foi corrigida de forma retrocompatível para alinhar a borda esquerda ao botão disparador e respeitar a viewport; o Minerador, único outro consumidor do modo popover, preserva seus handlers e passa a receber o mesmo alinhamento correto.

## Entrada sem recarga duplicada da planilha (2026-07-31)

- **Causa confirmada:** após autenticar/entrar no Arquiteto, a sincronização de sessão e o efeito da assinatura de importação chamavam `fetchMasterList` em paralelo, reapresentando a mesma planilha duas vezes.
- **Correção:** a sincronização de sessão agora atualiza somente os silos; a assinatura `importedKeywordSignature` continua como fonte única do carregamento inicial e de recargas por alteração efetiva de importação. Recargas explícitas após salvar, importar ou usar `Tentar novamente` foram preservadas.

## Superfície operacional sem barra de recovery e sem refresh visível (2026-07-31)

- **Removido da interface:** a barra `Recuperação segura`, `Resetar não-publicados` e o contador passivo de conflitos lógicos. Nenhum artefato, snapshot, função de recovery ou regra de integridade foi apagado.
- **Refresh:** quando a planilha já possui itens recuperados ou carregados, a atualização de silos ocorre em segundo plano e não substitui a tabela por um spinner. O spinner permanece reservado ao primeiro carregamento sem itens.

## Regra compartilhada de formação — 2026-07-21

Implementados localmente o gate de uma principal/até cinco apoios, a estratégia aditiva do ArticleDNA (`keywordStrategy`) e sinais de hierarquia do SiloDNA. Volume ausente permanece parcial/indisponível; score, slug ou similaridade não confirmam KGR. Artigos publicados permanecem protegidos e o Radar recebe somente contexto de leitura.

## Correção do avaliador SERP, intenção e KGR leve (2026-07-21)

- **Implementado:** `intentProfile` no ArticleDNA, normalização determinística de intenção com preservação do rótulo original e compatibilidade individual das secundárias/reforços; CTA e hierarquia não alteram a intenção central.
- **Implementado:** sanitização proprietária no Arquiteto para eliminar falsos conflitos de labels equivalentes, hierarquia comparada como formato e ausência em snippets. A evidência fraca aparece como limitação e não gera separação.
- **Implementado:** `validationProfile` com `kgr_light`; principal obrigatória, secundárias condicionais à ambiguidade, referências integrais preservadas e `queriedKeywordDnaIds` explícitos. Confiança baixa/inconclusiva impede ações destrutivas.
- **Implementado:** ingestão aditiva preserva URL publicada, canonical, slug e status; ArticleDNA exibe intenção/origem, arquitetura, KGR, publicação e identidade URL/canonical quando recebidos.
- **Implementado:** assessment anterior permanece no histórico e é marcado `Desatualizado por correção do avaliador`; nova execução explícita gera v2.
- **Verificado em fixtures:** `test:arquiteto` 70/70. Nenhuma chamada real Serper, escrita remota, migration, limpeza de armazenamento ou validação browser autenticada foi executada.
- **Limitações:** ainda pendem validação manual autenticada do preview/URL/reload/troca de marca e confirmação do schema remoto/RLS. O Radar não foi alterado.
- **Correção de deep-link (2026-07-20):** a seleção externa Radar → Arquiteto agora usa solicitação consumível por marca, compara expansão/seleção antes de chamar setters e remove `articleId` da URL após encontrar o artigo. O artigo publicado continua sendo apenas selecionado; não é recriado nem reimportado.
- **Reparo de integridade (2026-07-20):** a leitura do workspace voltou a incluir keywords aprovadas cujo ID está no índice de importação, sem deixar de preservar linhas já renderizadas. A leitura continua sem reagrupar automaticamente e uma falha de leitura não marca a assinatura como carregada.
- **Evidências do reparo:** `test:arquiteto` (48/48), `test:operational` (49/49), `npm run build` e `git diff --check` passaram.
- **Limitações:** a validação visual autenticada do deep-link e do snapshot ainda não foi repetida nesta execução; lint amplo do monólito pode continuar exibindo avisos legados, mas o lint do escopo alterado e o build passam.
- **Critério ainda aberto:** não marcar a tarefa como concluída enquanto a validação manual com snapshot não confirmar localização, recuperação e isolamento por marca.
- **Última auditoria:** 2026-07-20, leitura de código e testes de domínio/fluxo.
- **Funcionando:** agrupamento lógico, agrupamento por IA, ArticleDNA, SiloDNA, anotações, proteção de publicados e envio ao Radar existem no código. **Verificado no código; regras principais confirmadas por teste.**
- **Parcial:** SiloPage possui contrato e rota; hidratação/persistência no workspace ainda não foi confirmada como completa.
- **Simulado:** parte do pipeline pode usar fallback/local; não confundir com persistência server-side.
- **Local:** recovery por marca em `localStorage`; artefatos do Arquiteto em IndexedDB. **Verificado no código.**
- **Persistido:** ArticleDNA/SiloDNA e eventos possuem repositórios/migration previstos; execução remota não verificada.
- **Corrigido em código:** o loop `Maximum update depth exceeded` no recebimento de navegação externa; a busca continua dependente de `masterList`, mas a solicitação já consumida não reaplica estado.
- **Regressões/bugs:** a correção visual ainda aguarda reprodução manual autenticada; os testes cobrem resolução, idempotência, IDs ausentes, Sets já corretos e mudança para outro artigo.
- **Arquivos centrais:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`.
- **Testes:** `tests/arquiteto-domain.test.mts`, `tests/operational-flow.test.mts` cobrem contratos, published guard, recovery e preflight.
- **Última validação manual:** ainda não verificada nesta sprint.
- **Diferença spec/implementação:** não marcar como concluído; integridade de importação/hidratação é pré-requisito aberto.

## Implementação SERP e identidade publicada (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-serp-formacao-identidade-publicada.md`, contratos opcionais de snapshot integral da KeywordDNA, assessment SERP versionado, decisões por keyword, identidade publicada coerente/divergente/ausente e verificação server-side.
- **Interface:** botão `Validar agrupamento pela SERP` imediatamente depois de `Detectar viés SiloDNA (IA)`, preview com custo/consultas, recomendações `Seguir recomendação`/`Ignorar`, link publicado com `noopener noreferrer` e coluna independente `APROVAÇÃO`.
- **Persistência:** assessments, snapshots, decisões, histórico e verificações são armazenados por marca no artefato IndexedDB existente, com fallback local já identificado; a UI só anuncia sucesso após a escrita.
- **Transferência:** itens aprovados enviados ao Radar carregam referências KeywordDNA e assessment de formação de modo aditivo; UI e workflow Radar não foram alterados.
- **Verificado em código/testes:** `test:arquiteto` 54/54, `test:operational` 49/49, `tsc --noEmit` e `git diff --check` passaram. Nenhuma chamada real Serper, escrita remota ou validação browser autenticada foi executada.
- **Limitações abertas:** o build atual compilou e terminou TypeScript, mas falhou na prerenderização fora do escopo em `/admin/marcas` com `Invariant: Expected workStore to be initialized`; ainda é necessária validação manual autenticada do preview, uma coleta explícita, reload/troca de marca, link e verificação online.

## Correção de visibilidade SERP por keyword (2026-07-21)

- **Causa confirmada:** o assessment era persistido no artefato IndexedDB brand-scoped, mas a planilha só o mostrava como uma lista solta dentro do artigo expandido; não havia indicador na linha, abertura automática após confirmação nem vínculo visual obrigatório com cada keyword.
- **Correção:** cada linha de artigo exibe `SERP não analisada`, `SERP processando`, `SERP pronta · vN`, `SERP com conflito`, `SERP desatualizada` ou `SERP com erro`. Após persistência bem-sucedida, o artigo é expandido, a aba de suporte é aberta e a linha recebe foco sem reload.
- **Associação:** a renderização usa `articleId`, `keywordId` e `keywordDnaVersionId` contra as referências do assessment. Recomendações não associadas ou com versão divergente aparecem explicitamente com `KeywordDNA` e `ArticleDNA`; nunca são descartadas silenciosamente.
- **Preservação:** falhas e assessments incompletos não substituem o assessment anterior válido; ações em publicados continuam protegidas e as recomendações permanecem sujeitas a decisão humana.
- **Verificado:** `test:arquiteto` 56/56, `test:operational` 49/49, `tsc --noEmit` e `git diff --check`. O build compilou o código, mas a geração estática falhou em `/admin/marcas`, fora do Arquiteto. Ainda pendem validação browser autenticada e uma coleta real explícita.

## Separação SERP de formação e fortalecimento (2026-07-21)

- **Causa:** o assessment anterior possuía somente o modo de coleta `keyword_individual`; o domínio não recebia o estado editorial publicado e aplicava semântica de formação ao principal protegido.
- **Correção:** assessments novos recebem `assessmentMode: formacao|fortalecimento`. Publicados usam `SERP de fortalecimento`, com a principal como âncora e recomendações de intenção/conteúdo ao redor da identidade existente.
- **Proteções:** `tornar_principal`, `separar_artigo` e `retirar_do_artigo` continuam bloqueados para a principal publicada no domínio. A interface não oferece `Seguir recomendação` para ela; oferece registro de proposta de atualização ou ignorar.
- **Secundárias:** podem receber manutenção, remoção ou proposta complementar na cópia de trabalho, sem alterar principal, slug, canonical ou URL.
- **Codificação:** corrigidas as duas strings corrompidas da UI; o teste agora rejeita mojibake no arquivo da planilha.
- **Pendente:** validação manual autenticada com artigo novo e publicado, sem provider real nos testes.

## Contexto rico de URL, arquitetura e KGR (2026-07-21)

- **Implementado:** contratos opcionais para relação keyword↔URL, situação arquitetural e `ArticleKgrIdentity`, com aliases português/legado normalizados no consumidor do Arquiteto.
- **ArticleDNA:** referências preservam relação/evidência; o payload preserva situação arquitetural, designação KGR, principal KeywordDNA, slug vinculado e proveniência. Score KGR ou coincidência textual não confirmam vínculo.
- **SERP:** resolução determinística em `formacao`, `arquitetura_publicado` e `fortalecimento`; publicados sem confirmação não entram automaticamente em fortalecimento.
- **Proteções:** publicado sempre protege URL, slug, canonical e marca; principal só quando arquitetura/principal estão confirmadas ou KGR está explicitamente confirmado. KGR confirmado também protege o par principal+slug fora da publicação.
- **Transferência:** Radar recebe campos opcionais aditivos; UI/workflow do Radar não foram alterados.
- **Verificado em código/testes:** fixtures cobrem aliases, três modos, candidata editável, KGR protegido, nova versão na confirmação arquitetural e preservação ao Radar; `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram. Validação browser/authenticated e provider real permanecem pendentes.

## ArticleDNA estratégico de KGR, volume e hierarquia (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md` e projeções aditivas `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose` no ArticleDNA.
- **Implementado:** referências individuais preservam papel, volume conhecido/desconhecido, contribuição e propósito. `null` não é convertido em volume zero; reforços narrativos não recebem volume incremental artificial.
- **Implementado:** KGR explícito nasce candidato com slug derivado da principal, divergência vira conflito e confirmação arquitetural humana cria sucessora com o par principal–slug confirmado.
- **Implementado:** `ArticleControlContext` concentra intenção herdada, KGR, volume, hierarquia, propósito e ações protegidas. Radar recebe essa projeção em campo opcional único; nenhuma UI/workflow de consumidor foi alterada.
- **Implementado:** painel expandido do Arquiteto exibe propósito, volume, score/racional de hierarquia e contribuição por KeywordDNA.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, `tsc --noEmit`, lint focado e `npm run build` passaram. Nenhuma chamada real de IA/Serper, escrita remota, migration, limpeza de storage ou validação browser autenticada foi executada.
- **Limitações:** provider real, SERP real, navegador autenticado e schema remoto/RLS permanecem não verificados; mudanças de consumidores continuam limitadas ao transporte opcional.

## Perfis estratégicos de unidades e SERP (2026-07-22)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-perfis-unidades-kgr-nao-kgr-serp.md` e ADR-015. ArticleDNA e `ArticleControlContext` receberam campos opcionais para classificação da unidade, propósito e estratégia SERP.
- **Tipos:** artigo, página de serviço, landing page, página de categoria e outro; landing mantém finalidade SEO, campanha, híbrida ou desconhecida. Sugestões mostram evidências e não equivalem a confirmação.
- **Estratégia:** ciclo, competição e perfil SERP são resolvidos em dimensões independentes. KGR confirmado usa `kgr_light`; não KGR explícito usa `competitive`; ausência/candidato/conflito usa `unknown`.
- **Interface:** painel expandido permite confirmar, alterar, marcar conflito ou manter desconhecido. A decisão cria sucessora humana do ArticleDNA, preserva identidade publicada e marca assessments anteriores como desatualizados sem apagar histórico.
- **Transporte:** o Radar recebe a projeção opcional pelo `ArticleControlContext`; sua UI/workflow não foram alterados. `EditorialUnitType` operacional permanece `article|silo_page`.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript após a implementação. Ainda pendem `test:operational`, build, validação browser autenticada, provider/SERP real e schema remoto/RLS.

## Criador manual de SiloDNA e SiloPage (2026-07-21)

> Registro histórico supersedido pela simplificação de 2026-08-24. O fluxo básico atual não cria SiloDNA/SiloPage e não solicita keyword ou entidade central.

## Consumo da política da principal do Minerador — 2026-07-22

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md` e ADR-016 registram o consumo aditivo de `primary_keyword_policy` e seu contexto humano.
- **Campos recebidos:** o adaptador reconhece política, principal publicada original/atual, ator, data, versão, motivo, histórico, `kgr_decisao`/`kgr_aplicabilidade`, intenção, volume, resultados, score, URL, slug, canonical, relação e evidências; snapshots integrais continuam no `KeywordDnaProvenanceSnapshot`.
- **Resolução:** `locked`/confirmação consolidada usa `fortalecimento`; `reviewable` usa `arquitetura_publicado`; unidade nova usa `formacao`; publicado sem política fica `unknown`. `not_applicable` explícito usa competição `competitive`; KGR confirmado usa `kgr_light`; ausência/candidato fica `unknown`.
- **Proteções:** URL, slug, canonical e marca publicados são independentes da proteção da principal. Principal revisável permanece editável; principal travada não pode ser substituída por recomendação estrutural.
- **ArticleDNA/Contexto:** política efetiva, origem/histórico, métricas, candidatas, decisão e `protectionReason` são opcionais e retrocompatíveis. A confirmação humana cria sucessora e recalcula a próxima SERP para fortalecimento sem alterar a identidade publicada.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e `npm run build` passaram. O lint da página completa mantém apenas dívida legada; reload autenticado e provider real permanecem validações manuais separadas desta etapa.

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-criador-manual-silo-silopage.md` e decisão `docs/00-produto/decisoes/ADR-014-criacao-manual-silo-silopage.md`.
- **Modal:** removido `Nicho (opcional)`. O formulário agora exige nome do silo e keyword/entidade central, sem transformar a entidade automaticamente em principal de artigo.
- **SiloDNA:** criação manual pode iniciar sem artigos, preserva marca, nome, entidade central, origem manual e referência real opcional de KeywordDNA.
- **SiloPage:** criação opcional com slug, situação `Novo`/`Publicado`, URL publicada obrigatória em publicado e verificação inicial `not_applicable`/`not_checked`. A URL é preservada e publicada não significa verificada.
- **Proteções:** slug inválido/conflitante e URL fora do domínio da marca ativa são rejeitados; canonical permanece separado; nenhum artigo, grupo ou KeywordDNA existente é alterado.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build com 50 páginas. Nenhuma verificação online real foi executada.
- **Limitações:** reload autenticado, conferência online, schema remoto/RLS e persistência remota ponta a ponta permanecem pendentes.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/arquiteto; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/arquiteto`; nenhum contrato interno de formação foi refeito.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa compartilhada confirmada: o cliente browser não propagava corretamente o token da sessão Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também filtra `keywords_kgr` por `brand_id`.
- O erro de carregamento agora preserva código, tabela, operação, status e mensagem no log interno, sem tokens. RLS, grants e regras editoriais permanecem intactos; smoke test autenticado segue pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- Arquiteto e Minerador usam a mesma factory dinâmica; consultas revalidam a sessão, aplicam margem de 60 segundos e preservam `marca_id`/`brand_id`.
- Erros registram somente operação, tabela, código, status, diagnóstico seguro e `tokenExpired`; a UI reserva “sessão expirada” para expiração efetiva ou falha de refresh, sem expor JWT ou refresh token.
- SELECT do ecossistema pode repetir uma vez após JWT expirado; escritas não recebem retry automático. Smoke test autenticado e Google OAuth real seguem pendentes.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Arquiteto compartilha o mesmo resultado estruturado e os mesmos códigos seguros do Minerador.
- SELECTs tenantizados só prosseguem com `SUPABASE_SESSION_READY`; ausência de sessão, troca Google, token, claims e refresh são diferenciados sem fallback anon.
- A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Arquiteto quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

## Refinamento visual do Arquiteto — 2026-07-27

- **Verificado no código:** a rota tenantizada `app/(brand)/[brandRef]/arquiteto/page.tsx` continua fina e a implementação proprietária permanece em `modules/arquiteto/arquiteto-workspace.tsx`; nenhuma regra, contrato, handler, persistência ou workflow foi alterado.
- **Diagnóstico visual:** a tela usava `font-mono` como fonte global, controles e informações essenciais abaixo de 14px, barra superior sem grupos funcionais, estados com baixo contraste/áreas clicáveis pequenas e expansão com caixas concorrentes.
- **Ajustes visuais:** barra superior agrupada em inspeção, processamento/importação e operações secundárias; tabela com cabeçalho, linha, seleção, foco, keyword principal e URL mais legíveis; resumo expandido reorganizado visualmente para intenção, política, KGR, publicação, propósito, unidade, ArticleDNA, SERP, abas e recomendações; recuperação, badges e ações receberam variantes com foco visível e áreas maiores.
- **Componentes/tokens reutilizados:** `WorkflowStatusBadge`, `HistoryControls`, `ArticleDnaSummary`, `ArchitectRecoveryPanel`, tokens `background`/`foreground` e escala Tailwind existente; foi adicionada apenas a prop visual aditiva `density` ao badge/histórico compartilhados, sem alterar o padrão dos consumidores atuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` e `git diff --check`; o build gerou 47 páginas estáticas. O lint direcionado reproduz a dívida legada da página consolidada.
- **Ainda não verificado:** navegador autenticado, light/dark real, 360/768/1024/1366/1440px, teclado, hover, loading, erro e conflito. O lint da página consolidada mantém dívida legada já existente; não foi corrigida nesta tarefa visual.

## Correção da regressão visual e densidade operacional — 2026-07-27

- **Relatado e confirmado no código:** o refinamento anterior elevou o topo para `min-h-16`, aplicou badges confortáveis nas linhas, manteve a tabela em `min-w-[1360px]` sem rolagem horizontal própria, comprimiu a keyword em uma única linha e deixou o rodapé com ações em `text-[9px]`.
- **Correção visual aplicada:** topo em 48px com controles compactos; recuperação como barra secundária; linhas e cabeçalho com densidade controlada; keyword separada em principal + identidade técnica; rodapé com controles de 32px e texto legível; superfícies, bordas e sombras suavizadas.
- **Scroll:** rolagem horizontal ficou confinada ao container da tabela e o scroll vertical ao canvas do Arquiteto. Foi criado estilo de scrollbar escopado `.architect-scrollbar`, usando `--foreground`, sem alterar outros módulos.
- **Preservação:** nenhum handler, estado, contrato, entidade, seleção, filtro, rota, API, persistência, hidratação ou regra editorial foi alterado. O scrollbar e as classes são exclusivamente visuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` com 47 páginas e `git diff --check`.
- **Ainda não verificado:** navegador autenticado real em 100% nos tamanhos 1366×768, 1440×900 e 1920×1080, além de light/dark, estados de interação e ausência de truncamento em dados reais.

## Diagnóstico do contrato de readback canônico — 2026-08-11

- **Causa confirmada do erro:** no caminho idempotente, `ArtifactVersionRepository` consultava apenas `version_id`, `version_number` e `content_hash` para produzir `UNCHANGED`. O mapeador server-side exigia o envelope completo (`entity_id`, origem, timestamps, autor, payload e demais campos), portanto a validação do `Versioned*Schema` falhava antes de a resposta chegar ao cliente.
- **Correção local:** a leitura da versão mais recente agora usa a linha completa; `PERSISTED` e `UNCHANGED` passam pelo mesmo mapeamento canônico. A rota traduz explicitamente `status` do repositório para `persistence` no contrato HTTP consumido pelo cliente.
- **Diagnóstico seguro:** falhas de forma registram somente tipos/presença de campos e caminhos de validação, sem payload, UUID, token, sessão ou segredo; a mensagem pública continua genérica.
- **Fonte atual da tela:** `MIXED`: a hidratação canônica usa `/api/arquiteto/artifacts`, enquanto o contexto editorial legado ainda lê `/api/editorial/workspace` e os mecanismos de recovery local/IndexedDB continuam preservados. Isso não é prova de readback remoto exclusivo.
- **Verificado localmente:** contrato canônico 6/6, `test:arquiteto` 89/89, runtime do pipeline 7/7, TypeScript, ESLint direcionado e `git diff --check` passaram.
- **Pendente:** smoke autenticado de leitura/persistência contra o schema remoto já aplicado. Nenhuma operação remota, chamada de IA/SERP ou aprovação artificial de ArticleDNA foi executada.

## Fresh-origin readback canônico — 2026-08-12

- **Reprodução:** na origem `s-smoke`, com a mesma identidade e Brand ativa, o GET canônico retornou uma linha `article_dna` e falhou no mapper por `createdAt` em formato de timestamp do banco incompatível com o `z.string().datetime()` estrito. O diagnóstico foi sanitizado por linha; nenhum payload editorial foi impresso.
- **Correção:** o mapper server-side normaliza somente timestamps de banco reconhecíveis para ISO UTC antes do schema parser. Formatos realmente inválidos continuam falhando explicitamente com `rowIndex`, `artifactType`, `versionNumber`, `payloadType`, schema, path e código sanitizados.
- **Invariantes:** o GET agora confirma também `marca_id`, `payload.brandId` e a correspondência entre `entity_id` e a identidade do payload. Não há fallback de recovery para mascarar erro canônico.
- **Resultado observado:** após reload em `s-smoke`, a mensagem de artifact inválido desapareceu; o parser atual aceitou o retorno canônico. A UI ainda exibe estado vazio porque sua reconstrução visual depende da lista editorial, o que não invalida o readback do artifact.
- **Fonte:** `CANONICAL_REMOTE` no readback do artifact; `LOCAL_RECOVERY` não foi usado como prova nem inspecionado/limpo. O workspace de `localhost` permanece uma superfície `MIXED` e não é baseline do smoke.
- **Estado:** `ARQUITETO_CANONICAL_READBACK_CONTRACT_FIXED`; nenhum artifact foi criado, apagado ou alterado remotamente. IA/SERP permanecem indisponíveis.

## Histórico arquivado — Rebase canônico do patrimônio Minerador → Arquiteto — 2026-08-12

O rebaseline histórico, seu bootstrap e seus preflights permanecem apenas
como contexto/artefatos arquivados. Não existe mais rota runtime de
`rebaseline`, não existe transição automática de `historical_import_protected`
para `received` e nenhum writer ou backfill deve ser criado nesta Fase 1.
O fluxo vigente é o handoff normal server-side e idempotente descrito no
registro da Fase 1.

## Inventário e preparação do reset downstream da Adalba — 2026-08-12

- **Escopo preservado:** `listas_kgr`, `keywords_kgr`, status de keyword, evidências de URL/canonical do Minerador, identidades, marcas e Agências ficam fora de qualquer manifesto de reset. Publicações/briefings com status publicado ou URL/canonical não podem ser selecionados.
- **Inventário preparado:** `supabase/scripts/adalba-editorial-downstream-inventory-read-only.sql` usa a Brand fixa Adalba, uma única tabela sanitizada e somente leitura. As contagens e a classificação real continuam **PENDENTES DE CONFIRMAÇÃO NO CATÁLOGO REMOTO**.
- **Ordem e bloqueio técnico:** `editorial_artifact_versions`, `content_document_versions`, `editorial_serp_snapshots` e `editorial_serp_reviews` são append-only pelas migrations 0027/0028. O SQL proposto se recusa a tocar esses objetos; não existe reset canônico completo sem decisão estrutural futura. Somente workflow selecionado, estado por usuário, view salva, documento sem versão, PublicationRecord não publicado e briefing legado não publicado podem sequer entrar na proposta atual, sempre por manifesto explícito e revisado.
- **Estado:** nenhum SQL remoto, dado, migration, 0031, recovery histórico, provider ou limpeza de storage foi executado.

## Reset de dados de desenvolvimento e nova época canônica — 2026-08-12

- **Scripts de reset locais:** `supabase/scripts/development-data-reset-dry-run.sql` é agora uma única consulta CTE/`VALUES` 100% read-only, sem transação auxiliar, temporárias ou objetos de sessão. Retorna um único result set sanitizado com manifesto, FKs, ordem, self-FKs, proteções, Admin, ambiente, contagens e veredicto final. `supabase/scripts/development-data-reset-real.sql` mantém `BEGIN`/`COMMIT` na própria execução e usa somente arrays, records e variáveis locais para o manifesto, snapshot das proteções e contagens; nenhuma relação auxiliar é criada. Falha em qualquer gate provoca `RAISE` e rollback transacional automático. `supabase/scripts/development-data-reset-verifier-read-only.sql` continua somente leitura e sem temporárias.
- **Correção de preflight:** dry-run v6, reset-real v7 e verifier v4 consideram `O`, `R` e `A` como modos de trigger habilitados e somente bloqueiam `D`/ausência. O `FK_ORDER_GATE` considera apenas FKs entre tabelas diferentes; o `SELF_FK_GATE` inventaria cada self-FK em tabela do manifesto e só aprova reset integral. Os quatro self-FKs reportados no catálogo remoto ficam cobertos como `SAFE_FULL_TABLE_RESET`. O ciclo cruzado `content_documents.current_version_id`/`content_document_versions.document_id` continua tratado pelo `UPDATE` do ponteiro antes das exclusões. A abordagem anterior com `_development_reset_manifest` e `_development_reset_gate_results` foi abandonada após falhas repetidas de lifecycle no SQL Editor.
- **FK gate endurecido:** o primeiro reset real foi revertido integralmente antes do `COMMIT` por `tenant_0016_agency_role_rollback.membership_id → agency_memberships.id ON DELETE RESTRICT`. A tabela é captura histórica da transição 0016, não fonte de verdade do runtime canônico; suas linhas de homologação entram no reset antes de `agency_memberships`. O manifesto agora cobre dependências conhecidas e o catálogo reprova, em uma única execução, qualquer FK filha externa ao plano ou ordem topológica inválida. A única aresta cíclica explicitamente neutralizada é `content_documents.current_version_id → content_document_versions`, anulada na mesma transação antes de apagar as versões e o documento.
- **Dados propostos para limpeza:** Discovery/Minerador, editorial canônico, comunicação/onboarding, dados de Agency/Brand, conexões de integração não-plataforma, uso de integrações e dados excepcionais 0030. O script bloqueia se houver dependência catalogada fora do conjunto revisado ou tabela de activity/notification ainda não classificada.
- **Append-only:** as proteções de publicado, DiscoveryRun, artifacts, SERP, versões de documento, usage events e execution events 0030 são capturadas, desabilitadas apenas durante a transação e verificadas como restauradas antes do resultado. Falha em qualquer etapa reverte a transação inteira.
- **Guards de mutação:** o catálogo/migrations foi auditado para 45 triggers não internos de `UPDATE`/`DELETE` nas 60 tabelas: 23 `SUSPEND_DURING_DEV_RESET` e 22 `SAFE_TO_KEEP_ENABLED`, sem classificação `INVESTIGATE` conhecida localmente. A trigger real `public.brand_memberships.trg_tenant_0005_protect_last_owner`, função `public.tenant_0005_protect_last_owner()`, é suspensa somente durante a mesma transação e entra no snapshot/restauração. O `MUTATION_TRIGGER_GATE` reprova qualquer trigger adicional, divergente ou sem classificação exata; os guards diferidos da 0021 (`agencies`/`agency_memberships`) e os append-only legados e canônicos também fazem parte do registro.
- **Legado para limpeza posterior ao smoke:** `historical_import_protected`/0030 e `architectImportedKeywordIds` não voltam a autorizar bloqueio normal; recovery em navegador (`architect-recovery`, `browser-artifact-store` e rascunho local do Redator) fica **INVESTIGAR**; `/api/editorial/workspace`, `briefings_artigos` e consumidores legados ficam **REMOVER APÓS SMOKE** ou **INVESTIGAR** conforme o inventário remoto. Os resolvedores server-side canônicos e `resolvePipelineContext()` ficam **MANTER**.
- **Gate de reimportação:** **PASS_WITH_MANUAL_REBUILD**. A ausência de `Silo`/`Lista` no CSV não é blocker: após recriar a Brand, o usuário recria manualmente cada lista/grupo, seleciona-a como destino e importa o CSV correspondente. A ausência de `site_origin/site_origins`, URL e canonical também é deliberada: o CSV separado de `publicado` preserva o dado-fonte e o mecanismo atual do Minerador será executado novamente para reconstruir/comprovar evidência de Site/Sitemap, URL e canonical. Não há restauração de IDs, lista antiga, `brand_id`, markers do Arquiteto ou qualquer outro estado histórico.
- **Pendente:** executar manualmente somente o dry-run v6 e revisar `MANIFEST_COUNT = PASS`, `FK_DEPENDENCY_GATE = PASS`, `FK_ORDER_GATE = PASS`, `SELF_FK_GATE = PASS`, `PROTECTION_GATE = PASS`, `ADMIN_GATE = PASS`, `VERDICT_FINAL = PASS` e zero `FAIL` antes de qualquer novo reset real. O reset e o verifier continuam operações manuais; a reconstrução posterior deve ocorrer somente pelos fluxos correntes do produto.
- **Correção do reset real v7:** após o abort por `42702` no `MUTATION_TRIGGER_GATE`, todas as agregações sobre FKs/self-FKs/triggers e todas as leituras de `jsonb_to_recordset` foram revisadas com aliases explícitos (`l`, `fc`, `sfc`, `mi`, `x`), sem alterar o dry-run v6, o manifesto ou os gates. A validação local confirmou uma transação `BEGIN`/`COMMIT`, sem `TEMP`/`pg_temp`, e o reset real fica liberado diretamente para nova execução manual, sujeito ao acknowledgment e aos gates remotos.

## Seleção livre, intervalos e arraste na planilha (2026-07-29)

- **Implementado no Arquiteto:** `selectedArticleIds` continua sendo o único conjunto de seleção. Clique comum e Ctrl/Cmd alternam somente a linha e atualizam `lastSelectionAnchorId`; Shift usa a ordem visual filtrada e agrupada; Ctrl/Cmd+Shift adiciona o intervalo.
- **Arraste:** Pointer Events iniciados exclusivamente no checkbox de artigo usam tolerância de 5px, modo de marcar/desmarcar definido pela linha inicial, processamento idempotente por ID e encerramento por `pointerup`, `pointercancel`, perda de captura e `blur`. O clique final não duplica o gesto.
- **Cabeçalho e filtros:** o checkbox do cabeçalho usa somente artigos visíveis, possui estado indeterminado e preserva seleções ocultas. A contagem distingue total e visíveis; filtros, busca, ordenação, agrupamento e troca de marca não reutilizam seleção de outro contexto.
- **Acessibilidade:** os checkboxes nativos preservam Tab, foco, Space, `aria-label` e `aria-checked`; a mudança visual ficou restrita ao estado indeterminado e ao contador solicitado.
- **Verificado:** teste direcionado `tests/arquiteto-selection.test.mts` 8/8, `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, lint dos arquivos novos, build com 47 rotas e `git diff --check` passaram.
- **Limites:** lint da página consolidada ainda reproduz a dívida legada de `any`/hooks; nenhuma API, persistência, storage, migration, chamada paga, Minerador ou outro módulo foi alterado. Arraste e teclado ainda aguardam validação manual real no navegador autenticado.

## Correção do arraste por coordenadas (2026-07-29)

- **Causa confirmada no código:** o gesto dependia de `pointerenter` nos checkboxes e não capturava o ponteiro inicial; ao sair do primeiro controle, o navegador podia continuar a seleção nativa de texto sem processar as linhas atravessadas.
- **Correção:** o checkbox inicial usa `setPointerCapture`; as `<tr>` visíveis são registradas por ID, seus limites vêm de `getBoundingClientRect()` e `clientY` resolve a linha atual. A aplicação percorre os índices intermediários da ordem visual, sem depender de `event.target` ou `pointerenter`.
- **Proteção:** após 5px, o gesto chama `preventDefault()`, aplica `user-select: none` temporário no `body`, bloqueia o clique posterior, libera a captura e restaura o estilo original. Clique sem deslocamento continua sendo clique normal.
- **Verificado no código/teste:** `tests/arquiteto-selection.test.mts` 8/8, incluindo faixa nos dois sentidos, `getBoundingClientRect`, captura/liberação e ausência de `pointerenter`. Validação manual no Chrome ainda precisa ser repetida pelo usuário; não declaro o arraste manualmente validado nesta etapa.

## Pintura por snapshot durante o arraste (2026-07-30)

- **Correção:** a pintura agora congela `initialSelectedIds`, `anchorId` e `mode` no `pointerdown`. Cada `pointermove` usa `document.elementFromPoint(clientX, clientY)` e `data-article-selection-id` para localizar a checkbox atual.
- **Comportamento:** `applySelectionPaint` recalcula imediatamente o intervalo inclusivo desde a âncora; avançar amplia a pintura e voltar reduz o intervalo, restaurando a seleção inicial fora dele. Seleções ocultas permanecem preservadas.
- **Proteções:** a tolerância passou a 4px; somente após ultrapassá-la ocorre `preventDefault`, bloqueio temporário de seleção de texto e atualização de `selectedArticleIds`. `pointerup`/`pointercancel` apenas encerram e suprimem o clique sintético.
- **Verificado:** testes direcionados 9/9 cobrem pintura para frente, retorno, modo desmarcar e seleção oculta. No Chrome autenticado, o caminho de mouse foi validado para avanço, retorno e ausência de seleção nativa de texto; touchpad físico específico permanece pendente.
## Métricas Ads e KGR opcional — 2026-08-03

- **Verificado no código:** o contrato do Arquiteto aceita `demandEvidence` opcional, com KGR histórico, métricas Ads normalizadas, séries mensais, CPC/competição Ads, tendência/sazonalidade, close variants e referência de snapshot.
- **Verificado no código:** ausência e `null` permanecem indisponíveis; zero recebido continua zero. KGR ausente não impede a formação.
- **Verificado no código:** ArticleDNA e ArticleControlContext transportam a evidência sem alterar o limite de uma principal e até cinco apoios; snapshot de proveniência remove identificadores de conta e payload bruto.
- **Verificado no código:** o Arquiteto não chama Google Ads e não altera o Minerador; Serper permanece independente.
- **Verificado por teste:** KGR opcional, preservação de null/zero, separação Ads, close variants, snapshot e não escolha por volume.
- **Ainda não verificado:** importação autenticada de uma keyword realmente enriquecida no Minerador e persistência remota da medição. Nenhuma chamada paga ou migration foi executada.

## Reconciliação do KeywordDNA enriquecido — 2026-08-24

- **Causa confirmada:** o Minerador grava a medição Google Ads atual em `analise_semantica.volume_measurement`, mas o normalizador do Arquiteto consultava apenas `google_ads_measurement`; isso podia omitir silenciosamente a evidência enriquecida.
- **Correção local:** o Arquiteto aceita prioritariamente um `volume_measurement` válido e usa `google_ads_measurement` somente como fallback legado. Envelope ausente ou inválido continua sem `googleAds` em `demandEvidence`, sem bloquear a KeywordDNA.
- **Campos preservados:** média mensal (`averageMonthlySearches`), série (`monthlySearchVolumes`), `metricStatus`/elegibilidade, `measuredAt`, provider/version, targeting, `currencyCode`, `timeZone`, keyword canônica do provider, keywords correspondentes, close variants, tendência/sazonalidade, picos, crescimento recente, cobertura histórica, competição/CPC/lances e referência segura do snapshot.
- **Proveniência:** `ArticleKeywordReference` continua carregando `demandEvidence` e o bootstrap canônico agora hidrata essa evidência no read-model da planilha. `sourceKeywordSnapshot`, IDs, hash, URL/slug/canonical e decisões humanas permanecem intactos; identificadores de conta e payload bruto continuam sanitizados.
- **Fronteiras preservadas:** nenhum código do Minerador, DataForSEO, DeepSeek, SERP, persistência remota, layout ou módulo vizinho foi alterado.
- **Verificado localmente:** testes direcionados cobrem precedência atual/legado, zero, null, aliases reais, evidência temporal e hidratação canônica. Smoke autenticado com dado real do Minerador e readback remoto continuam pendentes.
- **Persistência canônica do primeiro consumidor — 2026-08-11:** ArticleDNA, SiloDNA e SiloPage agora passam por `resolvePipelineContext()` e pelo `ArtifactVersionRepository` server-side, com `brandId` explícito, actor Supabase SSR, append-only, hash idempotente e confirmação `PERSISTED`/`UNCHANGED` antes do sucesso.
- **SiloPage:** a persistência exige `source_version_id` de SiloDNA canônico da mesma Brand; referências locais ausentes não são convertidas em sucesso remoto.
- **Leitura:** `/api/arquiteto/artifacts` reconcilia os artefatos canônicos por Brand. Recuperação local/IndexedDB continua preservada como compatibilidade e não substitui uma falha remota.
- **Escopo:** `sendWorkflowCommand()`, Radar, Minerador, migrations, schema e handoffs não foram alterados. A tabela de status-events prevista no legado ainda não faz parte de 0027; a UI reconstrói o status atual do artefato somente para leitura.
- **Verificado localmente:** teste canônico 6/6, `test:arquiteto` 89/89, runtime 7/7, TypeScript, ESLint dos arquivos novos/rotas e `git diff --check`. Nenhum smoke remoto foi executado.
- **Estado:** `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `REMOTE_SMOKE_PENDING`; próximo gate: `READY_FOR_ARQUITETO_CANONICAL_PERSISTENCE_REMOTE_SMOKE`.

## Bootstrap canônico do workspace em fresh origin — 2026-08-11

- **Cadeia anterior:** as linhas exibidas nascem em `masterList`, montada por `fetchMasterList()` a partir de `listas_kgr`, `keywords_kgr` e `briefings_artigos`; o contexto editorial também continua consumindo `/api/editorial/workspace` e recovery local como superfície legada/mista. O GET `/api/arquiteto/artifacts` apenas preenchia os mapas `acceptedArticleDnas`, `acceptedSiloDnas` e `acceptedSiloPages`.
- **Causa confirmada:** o readback `CANONICAL_REMOTE` era válido, mas não havia adapter entre `VersionEnvelope<ArticleDNA>` e as linhas mínimas que `articlesList` deriva de `masterList`; por isso a tela podia ficar vazia mesmo com ArticleDNA remoto aceito.
- **Implementação local:** `lib/arquiteto/canonical-bootstrap.ts` materializa somente campos já presentes no contrato. A keyword é lida do snapshot sanitizado `keywordDnaSnapshot.sourceKeywordSnapshot.keyword`; slug, hierarquia, intenção, métricas, silo, Brand e entidade vêm do próprio payload/envelope. Sem esse snapshot, o resultado é `INVALID_ARTIFACT`/contract gap explícito, sem defaults editoriais.
- **Precedência:** `CANONICAL_REMOTE` substitui cópia equivalente usando somente `keywordId` ou identidade de entidade (`entityId`/cluster); `LOCAL_RECOVERY` exclusivo é preservado; itens legados recebem `LEGACY_REMOTE`. Não há comparação por nome, slug, owner ou e-mail, e o adapter ignora outra Brand.
- **Erros:** a rota mantém `NO_DATA` como lista vazia; `QUERY_FAILURE`, `SCHEMA_MISSING`, `NOT_AUTHORIZED` e `INVALID_ARTIFACT` preservam código e não são convertidos em empty state. Readback estrutural inválido agora usa `INVALID_ARTIFACT` com diagnóstico sanitizado.
- **Verificado localmente:** fresh-origin, precedência, recovery-only, não duplicação, isolamento de Brand, contract gap e `NO_DATA` estão cobertos; persistência/readback canônico 11/11, `test:arquiteto` 89/89, pipeline runtime 7/7, TypeScript, ESLint dos arquivos afetados e `git diff --check` passaram.
- **Validação manual:** a sessão autenticada abriu `s-smoke`, mas o servidor local ficou preso em `Failed to fetch` de uma chamada legada e não permitiu concluir o smoke visual. Nenhum storage foi inspecionado, limpo ou promovido; nenhuma escrita remota, IA ou SERP foi executada.
- **Estado:** `READY_FOR_ARQUITETO_FRESH_ORIGIN_SMOKE`; não declarar homologação total. O handoff Minerador → Arquiteto e SiloDNA/SiloPage continuam fora desta etapa.

## Regressão do bootstrap após nova sessão — 2026-08-11

- **Causa confirmada:** o efeito de bootstrap dependia de comandos recriados pelo `EditorialPipelineContext`; os próprios setters do bootstrap atualizavam esse contexto e disparavam novas leituras canônicas em ciclo. O loading da origem legada também não podia governar a renderização canônica.
- **Correção local:** `modules/arquiteto/arquiteto-workspace.tsx` agora mantém estado explícito `LOADING`/`LOADED`/`EMPTY`/`ERROR`, finaliza sucesso, erro e cancelamento, materializa o remoto sem exigir `masterList` legado e mantém legacy/recovery como fontes complementares. Nenhuma nova importação, persistência ou operação remota foi adicionada.
- **Validação manual autenticada:** após reload/restart, o workspace exibiu 2 artigos sem spinner nem erro canônico, mesmo com a chamada legada `/api/editorial/workspace` falhando. IA, SERP, escrita remota e limpeza de storage não foram executadas.
- **Estado:** `READY_FOR_ARQUITETO_BOOTSTRAP_REGRESSION_SMOKE`; homologação remota e o handoff Minerador → Arquiteto continuam fora desta etapa.

## Handoff canonico Minerador -> Arquiteto - implementacao local - 2026-08-11

- **Entrada protegida:** `POST /api/arquiteto/handoff` recebe `brandId` e IDs de keywords; `resolvePipelineContext({ brandId, module: "arquiteto", action: "create" })` resolve actor, sessao e autorizacao no servidor.
- **Ledger:** cada keyword valida da mesma Brand gera, quando necessario, um `editorial_workflow_items` com `subject_type = keyword`, `stage = architect`, `source_entity_id` igual ao ID canonico da keyword, origem `MINERADOR` e estado `received`. Nao ha copia do conteudo de `keywords_kgr`.
- **Idempotencia:** a unicidade de Brand, tipo, subject e etapa evita duplicacao; a rota retorna `PERSISTED` ou `UNCHANGED` depois da operacao remota.
- **Workspace:** `GET /api/arquiteto/workspace?brandId=...` monta o read model a partir do ledger, das keywords referenciadas e dos ultimos ArticleDNA/SiloDNA/SiloPage relacionados. Keyword sem ArticleDNA permanece visivel sem agrupamento.
- **Precedencia:** `CANONICAL_REMOTE` e a origem operacional. `/api/editorial/workspace`, localStorage e IndexedDB continuam apenas como legado/recovery e nao determinam o `masterList` novo.
- **Ainda nao verificado:** smoke autenticado remoto, repeticao idempotente, isolamento entre duas Brands e leitura apos nova sessao. IA, SERP, schema, migration e providers nao foram tocados.

## Diagnostico da divergencia do handoff canonico - 2026-08-12

- **Marcador do modal:** `effectiveImportedKeywordIdsForUi` nao e uma leitura direta do ledger. Sua precedencia e recovery plan/audit em memoria, `masterList` renderizada e, como fallback, `architectImportedKeywordIds` do contexto editorial.
- **Persistencia do marcador:** `architectImportedKeywordIds` e recuperado e salvo em `localStorage` por actor + Brand. Portanto, o rotulo `Ja importado no Arquiteto` pode ser `LOCAL_STORAGE`/`IN_MEMORY`, mesmo sem workflow canônico remoto.
- **Fonte do workspace:** `GET /api/arquiteto/workspace` filtra `editorial_workflow_items` por `marca_id` e `stage = architect`; a projecao aceita somente `subject_type = keyword` cujo `subject_id` resolve para `keywords_kgr` da mesma Brand. `state`, `source_entity_id`, `source_version_id` e payload sao carregados, mas nao filtram a entrada atual.
- **Estado:** divergencia relatada pelo usuario e confirmada no contrato local. O diagnostico remoto read-only foi preparado; nao houve repair, reimportacao forcada, backfill, limpeza de storage ou operacao remota.

## Limpeza estrutural sucessora 0032 — 2026-08-12

- **Evidência remota relatada:** o targeted preflight read-only classificou como `DROP_SAFE` as tabelas vazias e o helper exclusivos do recovery histórico 0016/0030; não foram encontrados consumidores runtime locais ou dependências externas bloqueadoras.
- **Preservação:** `public.pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos — `content_document_versions_append_only_trg`, `editorial_artifact_versions_append_only_trg`, `editorial_serp_reviews_append_only_trg` e `editorial_serp_snapshots_append_only_trg` — permanecem fora do manifesto de remoção.
- **Preparação local:** SDD curta, migration sucessora 0032, preflight read-only, post-verifier read-only e rollback local/documental foram preparados. O nome real truncado da trigger 0030 é `brand_exceptional_operation_execution_events_append_only_trg_00`.
- **Estado de preparação:** `0030 runtime/schema = REMOVAL_PREPARED`, `0016 rollback table = REMOVAL_PREPARED`, `STRUCTURAL_CLEANUP_0032 = READY_FOR_MANUAL_APPLY`. 0031 continua reservada/abandonada; o resultado de aplicação está registrado abaixo.

## Resultado remoto da limpeza estrutural 0032 — 2026-08-12

- **Aplicação:** o usuário informou `MIGRATION_0032 = APPLIED` com sucesso.
- **Remoção:** helper 0030, três tabelas candidatas e trigger exclusiva foram confirmados ausentes pelo post-verifier.
- **Preservação:** 12/12 tabelas não-alvo, RLS/ACL/policies reportadas, `pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos passaram; `TARGET_REMOVAL = PASS`, `PRESERVED_OBJECT_CHECKS = PASS` e `SHARED_APPEND_ONLY = PASS`.
- **Lacuna:** nenhum artefato pré-aplicação com o fingerprint do mesmo conjunto `public/non-target-catalog` foi encontrado localmente. `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`; o hash pós-aplicação não será usado como baseline retroativo.
- **Verifier local:** `supabase/scripts/structural-cleanup-0032-post-verification-read-only.sql` está na versão v3; relações/função removidas são verificadas somente por catálogo, e o placeholder continua como `EVIDENCE_GAP`, sem falso FAIL estrutural.
- **Estado:** `STRUCTURAL_CLEANUP_0032 = PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP`. Não reaplicar 0032, não restaurar objetos e não alterar o schema por causa desta lacuna documental.

## Simplificação da criação manual de silo — 2026-08-24

- **Contrato confirmado:** `minerador_keyword_lists` representa o registro operacional do silo e aceita uma lista sem keywords; `SiloDNA` continua sendo o contrato estratégico posterior e exige entidade central/contexto válido.
- **Correção local:** o modal agora exige somente `NOME DO SILO` e `SLUG`. O slug reaproveita a validação existente, exige `/` na entrada e é persistido normalizado no catálogo legado `marcas.silos_existentes`.
- **Proteções:** foram removidos do modal o campo de keyword/entidade central, a criação opcional de SiloPage, situação de publicação e URL publicada. O nome e o slug não são convertidos em entidade, KeywordDNA, principal ou ID sintético.
- **Persistência/workflow:** a criação manual grava apenas o silo operacional vazio. Nenhuma keyword é associada, nenhum `SiloDNA` ou `SiloPage` é criado e a formação posterior continua dependente dos processos do Arquiteto.
- **Verificado no código:** o handler mantém o escopo da marca ativa, a lista começa sem keywords e a documentação registra a regra permanente: “Criação manual de silo exige apenas nome e slug. KeywordDNAs e entidade central são definidos posteriormente pelo processo arquitetural.”
- **Ainda não verificado:** criação autenticada, readback remoto, isolamento entre duas marcas, reload e inspeção visual no Chrome; nenhum SQL, migration, provider, IA ou módulo vizinho foi alterado nesta etapa.

## Correção da regra do criador manual — gate estrutural (2026-08-24)

- **Auditoria:** a simplificação anterior removeu indevidamente a criação pareada de `SiloDNA` e `SiloPage`. O comportamento correto exige somente nome e slug na UI, mas cria os dois artefatos canônicos: SiloDNA em formação e SiloPage `Novo`.
- **Bloqueio confirmado:** o `SiloDNASchema` atual exige `centralEntity` e contexto estratégico completo; não existe estado draft/em formação válido. O `SiloPageSchema` também exige conteúdo derivado do SiloDNA. Usar o nome do silo, `A confirmar` ou qualquer placeholder como entidade violaria a regra de não criar entidade artificial.
- **Persistência:** `minerador_keyword_lists` e `marcas.silos_existentes` são registros operacionais/índice legado e não substituem SiloDNA/SiloPage. O endpoint canônico atual valida schemas estritos e não fornece criação atômica dos dois artefatos.
- **Ação:** criada a SDD `docs/04-arquiteto/propostas/2026-08-24-silo-draft-pareado-silopage-novo.md`. Nenhum código ou persistência foi alterado nesta etapa bloqueada.
- **Próximo gate:** aprovar a extensão estrutural do estado de formação, do esqueleto inicial da SiloPage, da normalização canônica do slug e da persistência pareada antes de implementar.

## Fechamento do fluxo mínimo até o Radar — 2026-08-24

- **Implementado no Arquiteto:** a criação manual usa somente nome + slug e
  chama `POST /api/arquiteto/silos`, que grava o catálogo operacional e cria o
  par canônico `SiloDNA draft` + `SiloPage new`, sem KeywordDNA, entidade,
  principal, intenção, conteúdo ou publicação inventados.
- **Contrato:** `SiloDNASchema` e `SiloPageSchema` receberam
  `formationStatus = "draft"` de forma aditiva. Artefatos formados continuam
  sujeitos às validações estritas; o slug é normalizado para `/segmento` e
  conflitos na mesma Brand são explícitos.
- **Cópia de trabalho:** atribuição de silo, desanexação, slug, hierarquia,
  agrupamento lógico, revisão IA, recomendação SERP seguida e undo/redo usam o
  PATCH canônico de `editorial_workflow_items`, com lock otimista e proteção de
  identidade publicada. A seleção continua sendo estado de ação, não fonte de
  dados.
- **Edição manual de papéis:** em artigos novos, a expansão permite definir cada
  keyword como `Principal`, `Secundária` ou `Reforço`; tornar uma keyword principal
  rebaixa a anterior, grava `role` no mesmo payload da cópia de trabalho e é
  reaplicado no readback. Publicados permanecem bloqueados também contra troca de
  papel ou reagrupamento.
- **Entrada da IA:** cada candidato enviado à revisão DeepSeek conserva um
  `keywordDnaSnapshot` com o objeto enriquecido recebido do Minerador; SERP
  normalizada, silos e proteções publicadas entram no mesmo envelope de contexto.
- **Fluxo visível:** a barra contextual ficou reduzida a `Validar SERP`,
  `Revisar com IA`, `Confirmar arquitetura`, `Enviar ao Radar` e `Limpar
  seleção`. A confirmação é a única consolidação do ArticleDNA e o envio ao
  Radar continua dependente de status aprovado.
- **Providers:** o endpoint `/api/arquiteto/serp` não usa Serper/RapidAPI;
  solicita somente a Connection global DataForSEO já disponível para uma
  consulta SERP normal. A revisão opcional usa a conexão oficial DeepSeek já
  existente, sem OpenRouter ou fallback.
- **Entrada sem recarga duplicada:** o carregamento do catálogo de silos é
  protegido por Brand durante a sessão e só é repetido por troca de Brand ou
  ação explícita de criação. O handler de criação não chama mais
  `refreshBrands()`.
- **Limite:** a criação pareada é `READBACK_GUARDED_SEQUENTIAL`, não uma
  transação atômica. Em falha posterior, o endpoint informa par incompleto e
  não mascara sucesso; nenhuma migration/RPC, escrita manual, provider real ou
  rollback destrutivo foi executado pelo agente.
- **Verificação local:** testes puros DataForSEO `2/2` e cópia de trabalho
  `4/4`; `test:arquiteto` mantém `108/109`, com uma falha estática preexistente
  em asserção do Minerador;
  TypeScript mantém somente os erros preexistentes registrados no handoff.
  Chrome autenticado, Supabase readback remoto, DataForSEO/DeepSeek reais e
  touchpad ainda aguardam validação manual autorizada.

### Ajuste do gate de quantidade do ArticleDNA

- **Regra vigente:** uma keyword principal é suficiente para confirmar um
  ArticleDNA; podem existir até cinco secundárias/reforços; seis é teto, não
  meta. Nenhuma keyword é inventada para completar o artigo.
- **Implementação:** `MIN_KEYWORDS_PER_APPROVED_ARTICLE = 1` e
  `articleApprovalIssues` agora validam 1–6, mantendo exatamente uma principal,
  silo, hierarquia, slug e aprovação humana como gates independentes.
- **Compatibilidade:** ArticleDNAs existentes com 2–6 keywords permanecem
  válidos; não houve migration, regravação de dados ou alteração interna do
  Radar.
- **SDD:** [`propostas/2026-08-24-article-dna-uma-a-seis-keywords.md`](propostas/2026-08-24-article-dna-uma-a-seis-keywords.md).

## DataForSEO SERP compartilhada — correção do consumidor — 2026-08-25

- **Auditoria do contrato DataForSEO:** o runtime canônico efetivamente
  confirmado no baseline expõe `dataforseo.allintitle` como caminho disponível
  para resolver a Connection global. Esse metadado não define a consulta do
  Arquiteto: o adapter monta SERP orgânica normal, sem o prefixo
  `allintitle:"<keyword>"`, porque allintitle não é SERP geral.
- **Correção local:** o consumidor deixou de depender da ausência/presença de
  `dataforseo.serp_compatibility`. `Validar SERP` chama o resolvedor canônico
  já existente para localizar a Connection global DataForSEO READY no contexto
  autorizado de Brand; não há uma Connection ou capability específica de SERP
  do Arquiteto. A Connection continua compartilhada com o Minerador.
- **Operação compartilhada:** o executor server-side DataForSEO usa
  `POST /v3/serp/google/organic/live/regular` com a keyword normal, normaliza
  organic/PAA/related em `SerpResearchSnapshot`, registra `module_operation`
  no ledger como `serp_validation` e uma unidade por consulta. A operação não
  é executada no mount, em testes ou automaticamente.
- **Limitação explícita:** falha de autorização, Connection, secret ou
  provider retorna erro sanitizado e não aplica assessment parcial; o estado
  de trabalho anterior permanece. `allintitle` não é usado como SERP, não há
  Serper/RapidAPI/fallback e o Radar poderá reutilizar a infraestrutura sem
  receber decisões de agrupamento do Arquiteto.
- **Validação remota pendente:** executar um smoke autenticado explícito e
  confirmar a coleta e o diagnóstico; nenhuma chamada paga foi executada pelo
  agente.
- **Contrato DeepSeek:** `Revisar com IA` usa
  `resolveDeepSeekCanonicalConfig` + `generateStructuredAI`, com o model,
  endpoint, JSON mode e thinking definidos pela Connection global. A revisão
  explicita `maxTokens = 4000` e `thinkingMode = disabled` somente nesta
  operação, mantém o snapshot completo do KeywordDNA, assessments SERP, silos
  e proteções de publicados; o endpoint rejeita o lote sem um assessment SERP
  ativo por artigo. O diagnóstico server-side separa resolução, request,
  conteúdo vazio/reasoning-only, truncamento, JSON, Zod e validação da proposta;
  falhas não aplicam estado parcial.
- **Verificado no código/testes:** não há chamada ativa a OpenRouter, Serper,
  RapidAPI ou capability SERP inventada dentro do Arquiteto. A extensão da
  fundação compartilhada foi aditiva; nenhuma alteração remota ou operação de
  schema foi executada nesta correção.
- **Ainda não verificado:** catálogo remoto/Connection real, smoke autenticado
  DataForSEO/DeepSeek e browser real; nenhum provider pago foi chamado pelo
  agente.

## Experiência funcional sem infraestrutura — 2026-08-24

- **Implementado no frontend do Arquiteto:** removidas dos títulos, subtítulo,
  aviso e ação do preview SERP as referências a DataForSEO, crédito, retry e
  consulta técnica. O fluxo agora apresenta `Validar SERP` e contexto editorial.
- **Implementado na revisão IA:** o botão e os estados visíveis usam somente
  `Revisar com IA`; títulos não expõem modelo, provider, Connection, tokens,
  thinking, quota ou custo.
- **Falhas traduzidas:** respostas de SERP usam
  `Validação SERP indisponível no momento.`; respostas das operações de IA usam
  `Não foi possível concluir a revisão com IA.`. A rota continua preservando
  código e detalhe técnico internamente, sem renderizá-los na área.
- **Controles manuais preservados:** a correção não altera seleção, movimento
  de artigos/silos, papéis de keywords, hierarquia, confirmação manual ou envio
  ao Radar.
- **Fronteira:** nenhuma API global, provider, Connection, capability, quota,
  Usage, migration, schema, persistência remota ou módulo vizinho foi alterado.
- **Verificado localmente:** teste `arquiteto-global-providers` passou 4/4;
  validação de browser real e chamada de provider continuam pendentes.

## Seleção individual e readback de silos — 2026-08-25

- **Seleção:** cada linha usa `workingArticleId`, `articleId` ou outro ID
  persistente da cópia de trabalho, resolvido em
  `resolveWorkingArticleId`; `clusterId`, silo, keyword principal, array de
  keywords e índice visual não participam da seleção. Quando a cópia ainda não
  possui artigo, o fallback é o ID persistente do workflow; ao formar um artigo
  provisório, um `workingArticleId` é atribuído uma vez e enviado no payload da
  cópia de trabalho.
- **Controles distintos:** o checkbox da linha possui `data-article-selection-id`;
  o checkbox do cabeçalho possui `data-article-group-selection-id` e atua
  somente sobre artigos visíveis daquele grupo. O checkbox da Página do Silo
  possui `data-silo-page-selection-id` e permanece separado.
- **Sem Silo:** continua sendo `siloId = null` na cópia de trabalho e somente
  uma seção visual `ARTIGOS SEM SILO`. O seletor canônico rejeita IDs sentinela
  como `sem-silo`; nenhum SiloDNA, SiloPage ou slug de fallback é criado.
- **Silos reais:** o seletor é hidratado pelo readback de SiloDNA/SiloPage
  canônicos. Quando um SiloDNA legado não contém `name`, a etiqueta é derivada
  somente de breadcrumb, H1 ou slug da SiloPage já persistida. A criação manual
  atualiza a opção imediatamente e dispara uma única confirmação canônica,
  sem recarga duplicada na entrada da Brand.
- **Arraste:** o pointerdown permanece candidato a clique; somente após 6px o
  listener chama `preventDefault`, aplica `user-select: none` e faz
  `setPointerCapture`. A linha é localizada por `elementFromPoint` +
  `data-article-selection-id`; a pintura recalcula o intervalo a cada mudança
  de linha e ignora movimentos repetidos ou Sets semanticamente iguais.
- **IA:** `Revisar com IA` usa o resolver global DeepSeek, força `disabled`
  apenas na chamada estruturada e limita a resposta a 4.000 tokens. Uma
  resposta válida fica como proposta pendente; nenhum movimento, seleção,
  troca de silo, principal ou confirmação de ArticleDNA acontece sem ação
  humana explícita.
- **Verificação:** testes focados de seleção, cópia canônica e providers
  passaram `24/24`; o typecheck mantém somente os quatro erros preexistentes do
  Minerador/testes de regex. Chrome autenticado, mouse/touchpad e logs reais
  do endpoint ainda aguardam validação manual porque a sessão disponível estava
  na tela de login.

## Verificação final da correção de seleção e DeepSeek — 2026-08-25

- **Suite oficial do Arquiteto:** `120/121` testes passaram. O único erro é o
  teste estático legado de `tests/arquiteto-domain.test.mts` que ainda procura
  a marcação antiga do botão `Processar lógica` no componente do Minerador;
  não é causado por este módulo.
- **Suite focada da alteração:** `24/24` testes passaram, cobrindo identidade
  persistente, F5/readback, clique, Ctrl/Cmd, Shift, grupos, silos, pintura,
  propagação e diagnóstico sanitizado da IA.
- **TypeScript:** permanecem os quatro erros já existentes: um erro de
  nulabilidade em `lib/minerador/keyword-qualification.ts` e três flags de
  regex ES2018 no teste interno da plataforma. Nenhum erro novo do Arquiteto
  foi introduzido.
- **Limitação de ambiente:** o teste de persistência canônica isolado não pode
  ser executado diretamente pelo Node 24 em modo strip-only porque o fixture
  usa parameter properties; o script oficial do módulo não inclui esse arquivo.
- **Validação ainda pendente:** Chrome autenticado com mouse e touchpad e
  leitura dos valores reais do diagnóstico de `/api/revalidate-structure`.
  Nenhuma API paga, provider real, gravação remota ou infraestrutura global foi
  acionada pelo agente.

## Latência da seleção — 2026-08-25

- **Causa localizada no caminho de renderização:** `setSelectedArticleIds`
  atualizava o estado no componente da planilha, e o componente pai reconstruía
  cada linha e seu conteúdo pesado a cada toggle. A seleção também não pode
  participar de dados derivados, persistência, readback ou bootstrap.
- **Correção local:** a linha agora é `MemoizedArticleRow`, a célula do
  checkbox é `MemoizedArticleSelectionCell` e as células/paineis caros usam
  `MemoizedArticleSubtree`. A comparação recebe somente `selected` e uma
  revisão dos dados da tabela; `selectedArticleIds` não integra essa revisão.
  Assim, o checkbox e a classe visual da linha alterada atualizam, enquanto
  linhas não afetadas e células pesadas permanecem memoizadas.
- **Handlers estáveis:** clique, Ctrl/Cmd, Shift e pintura consultam refs
  atualizadas no efeito, evitando que cada mudança de seleção recrie handlers
  ou inclua o `Set` inteiro nos props. A pintura continua recalculando o
  intervalo imediatamente e usando comparação semântica de `Set`.
- **Fronteira preservada:** o toggle não chama persistência da cópia de
  trabalho, fetch/readback canônico, refresh, agrupamento, ordenação, SERP ou
  IA. O rodapé, contadores, indeterminate e a seleção de grupo continuam
  podendo renderizar porque dependem legitimamente da seleção.
- **Verificado no código/testes:** o teste focado da seleção passou `15/15`,
  incluindo regressão que verifica a memoização e a ausência de persistência
  no handler do clique. TypeScript não acusa erro no Arquiteto.
- **Medição pendente:** não foi possível coletar os tempos reais A/B/C/D com
  `performance.now()` no Chrome autenticado porque nenhum backend Chrome estava
  disponível nesta sessão. Portanto não há números reais antes/depois
  declarados aqui.
- **Validação manual pendente:** mouse e touchpad em Chrome autenticado,
  incluindo clique simples, Ctrl/Cmd, Shift, pintura e retorno no arraste.

## Histórico — Consolidação canônica A1–A20 — 2026-08-25

### IMPLEMENTADO / verificado no código

- O conceito do Arquiteto foi consolidado em três áreas: Artigos, Silos e
  Links Internos. A planilha continua como mesa operacional e não foi
  redesenhada nesta fila.
- Artigos possuem working copy, grupos, papéis manuais, ArticleDNA,
  referências KeywordDNA, hashes, versões, SERP de formação e revisão IA como
  proposta pendente.
- Silos possuem assignments, SiloDNA draft, SiloPage distinta, Pilar/Suportes
  no contrato e criação manual pareada com readback guardado.
- A UI ativa do Arquiteto não solicita Serper, RapidAPI ou OpenRouter; não foi
  criada infraestrutura de provider no módulo.
- A seleção permanece efêmera e não dispara persistência editorial.
- Não foi alterado nenhum módulo vizinho, provider global, Connection,
  capability, quota, schema, RLS, migration ou contrato compartilhado
  estrutural.

### VALIDADO LOCALMENTE / auditoria estática

- Foram confrontados docs canônicos, ADRs, contratos, adapters, workspace,
  routes, repositories, migrations locais e testes.
- O código possui `ArticleDNA.internalLinks`, `SiloDNA.linkMap`,
  `ContentPlanInternalLink` e `InternalLinkAssignment`, mas não possui
  `InternalLinkGraph`, repository, artifact type ou route canônico.
- A criação de Silo atual é `READBACK_GUARDED_SEQUENTIAL`, não transacional.
- O schema atual de Silo formado ainda aceita `pillarArticleId` nulo; a regra
  de produto consolidada exige exatamente um Pilar e precisa de gate local no
  lote de Silos.
- O Arquiteto usa contexto básico de Brand (id/nome/nicho); o Brand Context
  Pack selecionado e o gabarito final de docs/skills ainda não existem no
  caminho do módulo.
- A resolução DataForSEO e a execução SERP usam adapter global/compartilhado;
  smoke autenticado e contrato global em runtime não foram verificados.
- A regressão automatizada do módulo executada após a consolidação passou
  `120/121`; a única falha é uma asserção estática legada do teste do Minerador
  sobre a marcação antiga do botão `Processar lógica`.
- O relatório histórico consolidado está em
  `docs/_arquivo/2026-08-documentacao-legada/arquiteto-auditoria-consolidacao-canonica-2026-08-25.md`.

### VALIDADO MANUALMENTE

- Nenhuma validação manual Chrome, provider real, Supabase remoto ou
  persistência remota foi executada nesta fila documental.
- O histórico manual registrado anteriormente continua separado e não é
  reutilizado como evidência de validação desta consolidação.

### PLANEJADO

- Fechar proveniência/working copy e estados independentes de lógica, SERP, IA
  e revisão.
- Formalizar candidata a Silo sem promoção automática.
- Reforçar o gate de exatamente um Pilar antes de Silo formado.
- Fechar verticalidade e regras locais de slug sem alterar publicados.
- Implementar SERP/IA como evidência/proposta em lotes locais.
- Implementar o InternalLinkGraph somente depois de decisão estrutural.
- Implementar React Flow somente como projeção depois do grafo.
- Definir Brand Context Pack e docs/skills em decisão própria de Marca/Planner
  Geral.

### BLOQUEADO POR PLATAFORMA

- `InternalLinkGraph` canônico: faltam contrato compartilhado, persistência,
  tenant/RLS, versionamento, readback e handoffs.
- Handoff completo de Links ao Planejador/Redator/Publicações depende do grafo.
- Brand Context Pack formal depende de contrato entre Marca e Planner Geral.
- Atomicidade transacional do pair SiloDNA/SiloPage permanece uma dívida; uma
  garantia forte requer boundary da Plataforma.

### DÍVIDA E DIVERGÊNCIAS

- A UI ainda não expõe três áreas operacionais explícitas; o conceito foi
  documentado sem iniciar redesign.
- `SiloDNA.linkMap` é uma relação mínima de suporte/Pilar, não o grafo
  completo.
- `InternalLinkAssignment` pertence ao fluxo operacional/ContentPlan e não
  deve ser promovido silenciosamente a grafo.
- Entradas antigas do backlog descrevendo criação catalogue-only ou ausência de
  pair são históricas; o código atual cria drafts pareados com readback.
- A presença remota de migrations downstream, tabelas e RLS não foi confirmada
  nesta fila, pois não houve SQL nem consulta remota.

### Documentos desta consolidação

- `docs/04-arquiteto/visao-canonica-artigos-silos-links.md`;
- `docs/_arquivo/2026-08-documentacao-legada/` para auditoria, plano e pedido;
- `docs/04-arquiteto/links-internos-estado-e-contrato.md` para o contrato atual.

## Lote 1 — proveniência KeywordDNA → ArticleDNA — 2026-08-25

### IMPLEMENTADO / verificado no código

- A working copy do Arquiteto passa a carregar um snapshot de proveniência do
  KeywordDNA recebido, sem reconstruí-lo a partir de texto ou reduzi-lo a
  keyword e volume.
- A referência individual do ArticleDNA reutiliza o `keywordDnaRef` e o
  snapshot íntegro quando disponíveis; o payload compatível legado fica
  separado da fonte bruta recebida.
- `null` permanece `null`, zero real permanece zero e campos ausentes não são
  inventados. Identidade, brand, demanda, competição, comercial, KGR,
  publicação, decisão humana, histórico e refs ficam preservados no snapshot
  de origem, com sanitização apenas de material privado.
- O bootstrap/F5 local projeta novamente `keywordDnaRef` e o snapshot; o
  handoff preserva `source_version_id` e `content_hash` quando o Minerador os
  fornece.
- A cópia de trabalho não perde slug, hierarquia ou papel já recebido quando
  não existe assignment explícito; assignment explícito continua tendo
  precedência.
- Não houve mudança de regra de agrupamento, schema, migration, RLS,
  provider, API global, Minerador ou Radar.

### CAMPOS EVIDENCIADOS

- Identidade: `keywordId`, texto original/normalizado, versão/hash explícitos,
  origem e `brandId`.
- Lógica: intenção, intenção canônica, entidade, modificadores, nicho,
  funil, confiança, ambiguidade, maturidade e decisão humana presentes no
  registro de origem.
- Demanda/competição/comercial/KGR: volume, status, tendência, sazonalidade,
  picos, histórico/ref, targeting, medição/provider, resultados, KD,
  backlinks, CPC, competição Ads, índice, bids/currency e campos KGR quando
  presentes; ausência continua ausência.
- Publicação/humano/proveniência: status, URL, slug, canonical, política da
  principal, revisão/aprovação/decisão, snapshots e refs de provider.

### VALIDADO LOCALMENTE

- Testes focados de workspace, bootstrap, ArticleDNA, readback local e
  handoff: `19/19`.
- Testes focados de evidência de demanda e handoff: `21/21`.
- `test:arquiteto`: `122/123`; a única falha é a asserção estática legada do
  teste do Minerador sobre a marcação antiga de `Processar lógica`, fora do
  módulo proprietário e sem correção nesta tarefa.
- ESLint direcionado: `0` erros; os dois arquivos de teste são ignorados pela
  configuração global. TypeScript continua com os erros preexistentes em
  `lib/minerador/keyword-qualification.ts` e no teste de regex TS1501, sem
  erro novo nos arquivos alterados. `git diff --check` passou.

### NÃO VERIFICADO / LIMITAÇÕES

- Não houve Supabase remoto, F5 autenticado no Chrome, persistência remota,
  provider real ou chamada paga. O readback comprovado neste lote é local e
  baseado em fixtures.
- O teste isolado da persistência canônica não executou por limitação já
  existente do runner Node/TypeScript com resolução de imports `.ts`; isso não
  foi contornado com alteração estrutural.

### PEDIDO ESTRUTURAL PARA O PLANNER GERAL

- O repositório ativo não expõe um artifact/repository canônico separado de
  KeywordDNA no caminho de persistência do Arquiteto. Quando a linha recebida
  não fornece versão/hash explícitos, o adaptador usa referência de
  compatibilidade `legacy:` e preserva o registro bruto, mas isso não é prova
  de uma versão canônica persistida. Se a identidade versionada for
  obrigatória para toda keyword, é necessário contrato/fundação estrutural do
  Planner Geral. Nenhuma migration, schema, RLS ou escrita remota foi feita.

## Lote 2 — baseline operacional da working copy — 2026-08-25

### IMPLEMENTADO / verificado no código

- A seleção continua sendo estado efêmero de `workingArticleId` e seus
  handlers não chamam persistência, fetch, readback, rebuild de ArticleDNA ou
  SiloDNA, SERP, IA, hash, recovery ou regrouping.
- A causa observável da falha visual foi corrigida: o clique normal cancelava o
  comportamento nativo do checkbox com `preventDefault()`. A linha e o estado
  já mudavam, mas o checkbox permanecia visualmente desmarcado. O bloqueio
  nativo continua somente no ramo de supressão após pintura por arraste.
- A medição temporária dev-only `architect.selection.click-to-commit` registra
  o intervalo entre a interação e o commit visual via `useLayoutEffect`, sem
  persistir ou transmitir dados.
- Clique individual, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura, grupos,
  indeterminate, filtros e seleção oculta continuam usando o controlador
  existente e não foram substituídos por uma regra nova.
- `Validar SERP` agora executa diretamente `confirmSerpValidation(groups)`;
  o modal intermediário foi removido. O status permanece inline na planilha,
  com `SERP processando` e o botão desabilitado enquanto a ação está em curso.
  Executor, adapter DataForSEO e persistência funcional não foram alterados.

### MEDIÇÃO REAL NO CHROME

- No workspace Care Glow, com quatro artigos, dez ciclos consecutivos de
  marcar/desmarcar por mouse mediram `11,10–23,20 ms` de click-to-commit.
- Shift mediu `23,80 ms`; Ctrl/Cmd aditivo mediu `34,60 ms`; pintura contínua
  mediu `35,40–37,70 ms`. O feedback visual foi imediato nos ciclos observados.
- O gesto contínuo de ponteiro foi validado por arraste; hardware de touchpad
  não esteve disponível para uma medição física separada.
- Foram conferidos também seleção de cabeçalho, seleção múltipla, estados
  checked/unchecked e responsividade em larguras `360`, `768`, `1024` e
  `1440` pixels.

### TESTES E LIMITAÇÕES

- Testes focados de seleção e fluxo global: `20/20`.
- `test:arquiteto`: `122/123`; a única falha é a asserção estática legada do
  teste do Minerador sobre a marcação antiga de `Processar lógica`, fora do
  módulo proprietário.
- TypeScript continua bloqueado pelos quatro erros preexistentes em
  `lib/minerador/keyword-qualification.ts` e nos testes de regex `TS1501`;
  nenhum erro novo foi identificado nos arquivos alterados.
- ESLint direcionado não passou no componente existente do Arquiteto, com
  regras React de refs já presentes no arquivo; testes são ignorados pela
  configuração. Não foi feita limpeza fora do escopo.
- `git diff --check` passou.
- O clique manual de `Validar SERP` não abriu confirmação secundária e exibiu
  processamento inline. A execução permaneceu em processamento durante a
  janela observada; não há prova de conclusão do provider, persistência remota
  ou readback, e nenhum provider real foi declarado como homologado.

### NÃO ALTERADO

- Nenhuma lógica SERP, IA, provider, adapter, Minerador, Radar, schema,
  migration, RLS, RPC ou API global foi alterada.

### PRÓXIMO LOTE

- O pacote do Lote 3 foi recebido e implementado na seção seguinte. O pacote
  do Lote 4 também foi recebido e está registrado na seção posterior.

## Lote 3 — lógica canônica de artigos e candidata a Silo — 2026-08-25

### IMPLEMENTADO / verificado no código

- O Arquiteto possui uma primeira leitura determinística separada de SERP e
  IA. A análise considera, nesta ordem, volume/demanda, resultados e
  competitividade, intenção, entidade/coerência, KGR, sinais comerciais
  secundários e demais evidências disponíveis.
- Volume alto não cria candidata sozinho. A hipótese exige liderança relativa
  no universo, termo curto/abrangente, capacidade de sustentar cobertura e
  evidência competitiva ou KGR; necessidade específica bloqueia a reserva por
  volume isolado.
- A oportunidade KGR só é marcada quando volume é `>= 120` e resultados são
  menores que o volume. `null` permanece desconhecido, zero permanece zero,
  KGR não aprova e não define Pilar automaticamente.
- Grupos provisórios recebem `groupingReasons` estruturadas com mesma intenção,
  mesma entidade, mesma necessidade, variação semântica, possível separação,
  ambiguidade ou conflito. O resultado continua sendo hipótese revisável.
- Candidatas fortes recebem `siloCandidate` com status, origem, score, sinais e
  razões; ficam reservadas na working copy, fora dos grupos usados para formar
  artigos, sem criar SiloDNA, SiloPage ou ArticleDNA.
- A interface expõe as candidatas provisórias, permite remover a marcação ou
  transformá-las em artigo provisório. A decisão humana recebe `origin:
  human` e não é sobrescrita por novo processamento determinístico.
- A reserva atravessa o payload existente da working copy, o readback do
  workspace canônico e o overlay de recovery local. A extensão é aditiva; não
  houve migration, schema SQL, RLS, RPC ou nova entidade persistida.

### VALIDADO LOCALMENTE

- Suíte específica do Lote 3: `9/9`.
- Suíte focada de regressão do Arquiteto: `81/82`; a única falha é a asserção
  estática legada do Minerador sobre a marcação antiga de `Processar lógica`.
- `test:arquiteto`: `122/123`, com a mesma falha estática fora do módulo.
- TypeScript não acusa erros novos em Arquiteto, contratos, rota ou testes;
  permanecem quatro erros preexistentes fora do escopo.
- ESLint dos arquivos de domínio, contrato, recovery, rota e teste passou sem
  erros. O componente completo mantém a dívida preexistente de `69` erros e
  `27` avisos.
- `git diff --check` permanece obrigatório na conferência final deste lote.

### VALIDADO NO CHROME / LIMITAÇÃO OPERACIONAL

- A rota tenantizada do Arquiteto carregou em Chrome com a planilha existente
  e quatro artigos após a hidratação.
- A ação `Processar lógica` não foi clicada no workspace autenticado: ela
  persiste a working copy remota. O estado candidato específico foi validado
  por fixtures e testes locais, sem escrita remota, SERP ou IA.

### NÃO ALTERADO

- Nenhuma chamada SERP, provider, IA, Radar, Minerador ou regra de agrupamento
  baseada em SERP foi adicionada. Nenhum ArticleDNA consolidado é produzido
  pelo Lote 3.

### PRÓXIMA FRENTE

- O pacote do Lote 4 foi recebido e implementado na seção seguinte. IA e
  revisão continuam aguardando o pacote operacional do Lote 5.

## Lote 4 — SERP de formação dos artigos — 2026-08-25

### IMPLEMENTADO / verificado no código

- O assessment SERP mantém `formationEvidence` por `keywordId` e
  `keywordDnaVersionId`, com compatibilidade observada, sobreposição,
  intenção observada, tipo dominante de página, competição, conflito,
  canibalização provável, necessidade de separar, possibilidade de juntar,
  principal possivelmente inadequada e evidência insuficiente.
- A sobreposição usa URLs e domínios observados nos snapshots e permanece
  vinculada por IDs estáveis; texto, ordem ou índice não são identidade.
- As diretrizes persistidas deixam explícito que SERP observa e não move,
  divide, junta, troca principal, cria Silo ou consolida ArticleDNA. A ausência
  de resultados permanece insuficiência, nunca conflito automático.
- Candidatas a Silo podem ser consultadas pelo mesmo fluxo DataForSEO e recebem
  `SerpSiloCandidateAssessment` separado, com KeywordDNA integral e evidência
  de categoria/hub, amplitude e múltiplas necessidades. Nenhuma candidata é
  promovida e nenhum Silo é criado.
- O readback local valida hash, quantidade de snapshots/recomendações e a
  evidência das candidatas. Falha de nova consulta não substitui assessment ou
  snapshot válido anterior.
- A planilha continua visível, os resultados são inline e a ação `Validar
  SERP` não reintroduz modal intermediário.

### VALIDADO LOCALMENTE

- `tests/arquiteto-serp-formation.test.mts`: `31/31`.
- `test:arquiteto`: `126/127`; a única falha é a asserção estática legada do
  Minerador sobre a marcação antiga de `Processar lógica`, fora deste lote.
- TypeScript não acusa erros novos no Arquiteto, rota ou contratos; permanecem
  os quatro erros preexistentes já registrados fora do escopo.
- ESLint dos arquivos de domínio e rota passou sem erros. O componente de
  workspace mantém a dívida preexistente do compilador React/ESLint.
- `git diff --check` foi executado após a implementação.

### LIMITAÇÕES / NÃO VERIFICADO

- Nenhum provider real, chamada paga, persistência Supabase, readback remoto ou
  reload autenticado foi executado. A persistência verificada neste lote é o
  artefato local do workspace.
- A validação manual Chrome de dez cliques, touchpad, Shift e drag permanece a
  evidência operacional do Lote 2; não foi repetida nem ampliada por este lote.
- Não houve migration, SQL, schema remoto, RLS, RPC, provider, Minerador,
  Radar ou mudança de infraestrutura.

### ARQUIVOS PRINCIPAIS

- `lib/arquiteto/serp-formation.ts`
- `app/api/arquiteto/serp/route.ts`
- `modules/arquiteto/arquiteto-workspace.tsx`
- `tests/arquiteto-serp-formation.test.mts`
- `docs/04-arquiteto/estado-atual.md`
- `docs/04-arquiteto/backlog.md`

### PRÓXIMO LOTE

- O pacote do Lote 5 foi recebido e implementado na seção seguinte. A SERP
  continua apenas como evidência para a revisão da IA.

## Lote 5 — IA de arquitetura dos artigos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `Revisar com IA` mantém lotes compactos e explicita as subtarefas internas
  `diagnosticar_grupos`, `revisar_pertencimento`, `revisar_papeis`,
  `revisar_canibalizacao` e `consolidar_proposta`.
- O plano A–E é derivado dos grupos, catálogo, pré-análise lógica e assessment
  SERP recebidos. Ele marca insuficiência de evidência e não inventa fatos.
- A Marca envia somente o contexto já disponível e pertinente: `id`, nome,
  nicho e `dna_diretrizes` como `guidelines`. Não foi criada persistência nova.
- A saída é compacta por IDs, com `proposalId`, `approvalStatus:
  pending_human`, rastreio das etapas e diff. O KeywordDNA integral permanece
  na entrada e não é repetido na resposta.
- A proposta não altera versão consolidada, ArticleDNA, SiloDNA ou aprovação.
  A aplicação gera `AIReviewAnnotation` em `pending_fine_review`, mantém undo
  e aguarda confirmação do salvamento antes do sucesso.
- A revisão humana pode rejeitar decisões individualmente antes da aplicação.
  Resposta incompleta não chega à UI como proposta: o lote inteiro precisa
  passar pela validação.
- Proteções de publicado permanecem no route e no aplicador; URL, slug,
  canonical e política não são alterados pela IA.

### VALIDADO LOCALMENTE

- `test:arquiteto`: `127/128`; a única falha é a asserção estática legada do
  Minerador sobre a marcação antiga de `Processar lógica`.
- Teste novo confirma as cinco etapas, diff por IDs, ausência de KeywordDNA na
  resposta enriquecida e estado `pending_human`.
- ESLint focado dos contratos, domínio, rota e novo módulo passou sem erros. O
  lint completo do workspace mantém a dívida preexistente (`68` erros e `28`
  avisos no componente `arquiteto-workspace.tsx`).
- TypeScript foi executado pelo binário local; permanecem apenas os quatro
  erros preexistentes já conhecidos em Minerador/testes de infraestrutura.
- `git diff --check` passou. Nenhum provider real, chamada paga, Supabase,
  persistência remota ou reload autenticado foi executado.

### GAPS / GOVERNANÇA

- Não houve necessidade de Plataforma, Supabase, schema, RLS, RPC ou provider;
  nenhum pedido estrutural foi aberto ao Planner Geral neste lote.
- A validação manual Chrome da revisão com IA, rejeição parcial e undo permanece
  não verificada por exigir sessão autenticada e chamada DeepSeek real.

### PRÓXIMO LOTE

- O pacote do Lote 6 foi recebido e implementado na seção seguinte. A área
  ARTIGOS agora possui gate de consolidação e handoff controlado.

## Lote 6 — consolidação ArticleDNA e publicados — 2026-08-25

### IMPLEMENTADO / verificado no código

- A confirmação exige principal definida, de 1 a 6 refs individuais, papéis
  válidos, cobertura exata das refs, evidência SERP referenciada, ausência de
  decisões IA pendentes e ausência de conflitos associados ao artigo.
- A confirmação cria sucessora humana e persiste status `approved`; nenhuma
  versão consolidada é sobrescrita diretamente.
- O gate preserva `brandId`, URL publicada, slug e canonical. `locked` e
  `unknown` não permitem troca silenciosa da principal; `reviewable/revisable`
  permite sucessora com a identidade publicada protegida.
- Após persistir, o Arquiteto consulta novamente o workspace canônico e
  compara `versionId`, hash, marca, principal, slug, canonical e status
  `approved` antes de liberar o handoff.
- O ArticleDNA recém-confirmado dispara o primeiro smoke pelo handoff já
  existente para o Radar. O readback local confere versão, hash e o conjunto
  de refs individuais KeywordDNA. O Radar não foi alterado e
  `InternalLinkGraph` não é requisito deste lote.
- A geração de ArticleDNA passa a anexar a ref versionada do assessment SERP
  ativo quando ele existe; sem essa evidência a confirmação é fail-closed.

### VALIDADO LOCALMENTE

- Teste focado novo: `4/4`.
- Boundary global do Arquiteto: `11/11`.
- `test:arquiteto`: a nova cobertura passa; permanece a falha estática legada
  do Minerador sobre a marcação antiga de `Processar lógica`.
- ESLint do novo módulo passou. O lint do workspace continua com a dívida
  preexistente do componente grande `arquiteto-workspace.tsx`.
- TypeScript foi executado pelo binário local; os erros retornados são os
  conhecidos fora deste lote em Minerador e fixtures de testes.
- `git diff --check` passou; os avisos exibidos são apenas normalização de
  finais de linha do checkout.

### GAPS / GOVERNANÇA

- O readback implementado é canônico no fluxo, mas não foi executado contra
  sessão Supabase autenticada nem por reload Chrome nesta rodada.
- Nenhum provider real, chamada paga, SQL, migration, schema, RLS, RPC,
  alteração no Radar, Minerador ou infraestrutura foi executado.
- Não houve necessidade de Plataforma/Supabase/schema/RLS/RPC; nenhum pedido
  estrutural foi aberto ao Planner Geral.

### PRÓXIMO LOTE

- Lote 7 — aguardando pacote operacional próprio; não foi inferido escopo.

## Lote 7 — formação canônica dos Silos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `lib/arquiteto/silo-formation.ts` forma uma working copy determinística a
  partir de ArticleDNAs já confirmados, mantendo para cada artigo a versão,
  hash e refs compactas individuais de KeywordDNA.
- A formação considera entidade, intenção, proximidade semântica, centralidade,
  amplitude, capacidade de suportes, competitividade e risco de colisão. Volume
  é sinal de demanda e não vence sozinho; `null` permanece desconhecido.
- Silo existente semanticamente equivalente é fortalecido na hipótese. Novo
  Silo só é marcado como candidato quando há arquitetura mínima para
  verticalização; grupo insuficiente permanece visível e rastreado.
- Cada working copy mantém exatamente um candidato provisório a Pilar e
  separa explicitamente os Suportes. KGR aparece como evidência secundária e
  não promove Pilar automaticamente.
- SiloPage fica representada como universo/categoria independente do Pilar,
  com detecção de slug coincidente e colisão com outra SiloPage. Novos nomes e
  slugs são curtos, limitados a dois termos e não repetitivos.
- Publicados não são alterados: a projeção marca proteção de brand, URL, slug
  e canonical. A UI permite revisar o Pilar provisório sem criar versão
  consolidada.
- A ação `Formar Silos` é local e reversível. Não chama SERP, IA, provider,
  fetch, Supabase, migration, schema, RLS, RPC ou persistência de SiloDNA/
  SiloPage.

### VALIDADO LOCALMENTE

- Teste focado do Lote 7: `6/6`.
- `test:arquiteto`: `139/140`; a única falha permanece a asserção estática
  legada do Minerador sobre a marcação antiga de `Processar lógica`, sem falha
  nos testes de Silos.
- `pnpm exec tsc --noEmit` e ESLint direcionado não puderam ser executados:
  os binários não estão disponíveis neste checkout/ambiente.
- Não houve provider real, chamada paga, sessão Chrome autenticada, F5,
  persistência Supabase remota ou readback remoto neste lote.
- `git diff --check` foi executado e passou; os avisos exibidos são apenas de
  normalização LF/CRLF. O checkout já contém alterações preexistentes extensas
  e não foi limpo.

### GAPS / GOVERNANÇA

- A working copy de Silos desta etapa é projeção local em memória. Persistência
  canônica, nova entidade, transação pareada SiloDNA/SiloPage e RLS continuam
  fora do escopo; não houve necessidade de abrir pedido estrutural ao Planner
  Geral neste lote.
- SERP e IA ainda precisam revisar a hipótese antes de qualquer consolidação.

### PRÓXIMO LOTE

- Lote 8 — validação e consolidação dos Silos implementado abaixo.

## Lote 8 — validação e consolidação dos Silos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `lib/arquiteto/silo-consolidation.ts` fecha o gate humano da working copy:
  exatamente um Pilar, Suportes correspondentes, refs individuais de
  ArticleDNA, Brand correta, ArticleDNAs aprovados e conflitos/colisões
  resolvidos antes da formação.
- Diretrizes SERP são compactas e reaproveitam a `serpAssessmentRef` do
  ArticleDNA ou o assessment ativo existente. Esta etapa não cria consulta,
  snapshot ou movimento estrutural novo.
- `app/api/arquiteto/silo-review/route.ts` usa o DeepSeek canônico somente para
  produzir uma proposta por IDs. A proposta aceita juntar, dividir, mover,
  eliminar hipótese rasa, sugerir nome/slug, revisar Pilar/Suportes e avaliar
  verticalidade; não grava, não aprova e não repete o KeywordDNA inteiro.
- A UI mantém a proposta inteira pendente, permite rejeição parcial e aplica
  apenas à working copy. A última aplicação possui desfazer local; SiloDNA e
  SiloPage consolidados não são alterados pela IA.
- A confirmação humana gera sucessoras independentes: SiloDNA com status
  `approved` e SiloPage com status `proposed`. Publicados preservam
  `brandId`, URL, slug e canonical.
- A persistência usa o mecanismo canônico existente em sequência:
  SiloDNA → readback → SiloPage → readback. Uma falha da segunda gravação é
  reportada como par parcial; nenhuma atomicidade falsa foi criada.

### VALIDADO LOCALMENTE

- Teste focado do Lote 8: `7/7`.
- Boundary global relacionado + teste do Lote 8: `14/14`.
- `test:arquiteto`: `146/147` na execução final; a única falha é uma
  asserção estática legada fora do Lote 8 sobre a marcação antiga do Minerador.
  A cobertura própria do Arquiteto passa.
- `pnpm exec tsc --noEmit --pretty false` não executou: `tsc` não foi
  reconhecido neste checkout/ambiente. ESLint direcionado também permanece
  não verificável pelo mesmo motivo.
- `git diff --check` e testes sem provider real foram mantidos como próximos
  gates. Não houve chamada paga, escrita Supabase ou readback remoto nesta
  sessão.

### GAPS / GOVERNANÇA

- O readback remoto está implementado no fluxo da UI, mas não foi executado
  com sessão autenticada nem validado por reload Chrome nesta rodada.
- A persistência pareada ainda não é transacional; o mecanismo atual é
  `READBACK_GUARDED_SEQUENTIAL`. Uma transação compartilhada nova continua
  dependência do Planner Geral, mas não foi necessária para o código deste
  lote e nenhum pedido estrutural foi aberto.
- O grafo estrutural de links internos ainda não está disponível. Não foi
  implementado nem usado para bloquear a consolidação dos Silos.

### PRÓXIMO LOTE

- Parar antes do Lote 9 até que o InternalLinkGraph estrutural esteja
  disponível e autorizado pelo Planner Geral.

## Rodada de homologação dos Lotes 1–8 — 2026-08-25

### ESCOPO E LIMITES

- Rodada somente de validação, sem nova funcionalidade, provider real, chamada
  paga, escrita Supabase, migration, schema, RLS, RPC ou alteração em Radar.
- Código, testes automatizados, Chrome, provider, persistência remota,
  readback e handoff foram avaliados separadamente.
- O pedido estrutural do `InternalLinkGraph` continua proposto, não aprovado e
  não implementado. O Lote 9 não foi iniciado.

### RESULTADOS DOS GATES

- **H1 — parcial:** no Chrome real, 10 alternâncias individuais responderam
  imediatamente; Ctrl/Cmd, Shift, pintura por arraste e seleção oculta sob filtro
  foram preservados. A telemetria observada ficou entre `8,7 ms` e `66,1 ms`.
  Touchpad físico não foi comprovado pelo ambiente automatizado, portanto o gate
  não é PASS integral.
- **H2 — bloqueado por readback:** antes do F5 havia assessment SERP e refs
  visíveis; após o F5 permaneceram keywords, papéis, slugs e ArticleDNA v2
  human de `marketing online`, mas os assessments desapareceram e voltaram a
  `SERP não analisada`. Esperado: working copy integral após F5. Observado:
  hidratação parcial. Causa ainda não conclusiva; não houve erro de console.
  Módulo proprietário: Arquiteto.
- **H3 — não homologado:** o estado real não oferece sequência completa pronta
  para confirmação: três artigos estão `Em processo`/`SERP não analisada` e o
  quarto é `Importado no Radar`; não foi disparada IA nem confirmação humana
  nesta rodada. Não é evidência suficiente para declarar ArticleDNA novo
  consolidado.
- **H4 — parcial:** o Radar recebeu `marketing online` com ArticleDNA v2,
  principal e versão visíveis antes do reload, sem reconstrução observável.
  Após F5, o Radar retornou `Marca sem dados`; readback remoto/autenticado não
  ficou comprovado. Módulo proprietário do handoff: Arquiteto; consumidor:
  Radar.
- **H5 — bloqueado por pré-condição:** todos os quatro artigos permaneceram
  `Sem silo`; não havia SiloDNA/SiloPage real disponível para validar. `Revisar
  Silos com IA` e `Consolidar Silos` ficaram desabilitados. Nenhuma formação ou
  consolidação foi fabricada durante a homologação.

### TESTES E PENDÊNCIAS

- Suíte focada executada: `105/106` testes passaram. O único não executado foi
  `arquiteto-canonical-persistence.test.mts`, por limitação do runner Node em
  TypeScript strip-only (`parameter property` no fixture); isso não foi tratado
  como falha funcional nem corrigido nesta rodada.
- `git diff --check` executado; os avisos existentes são de LF/CRLF. Não foram
  executados providers reais.
- Não houve correção automática: os achados de F5 foram registrados como
  comportamento esperado versus observado, causa ainda não conclusiva e
  proprietário Arquiteto. Próxima ação é diagnosticar a hidratação/readback e
  repetir somente H2/H4 após correção autorizada.

### PRÓXIMO GATE

- Manter o Lote 9 parado até homologação estrutural do pedido do
  `InternalLinkGraph` pelo Planner Geral.

## Próxima fila — integridade de F5 e workspace único — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- O readback local do assessment SERP agora exige sessão `authenticated`,
  `actorUserId` e `brandId` canônico. O efeito não lê nem grava durante o
  estado intermediário da sessão e não usa mais a chave `anonymous`.
- O mesmo gate foi aplicado às recuperações locais de ArticleDNA, SiloDNA,
  revisão da working copy e à reconciliação do handoff usado pelo Radar.
- O bootstrap visual do Radar aguarda o snapshot enquanto a marca canônica
  está carregando; `Marca sem dados` só aparece quando o bootstrap termina sem
  snapshot e com erro. Não foi criado fallback por slug, owner ou marca
  anônima.
- O Arquiteto passou a expor uma única página operacional com o workbench
  contextual `Artigos`, `Silos` e `Links internos`. A seleção continua
  efêmera; IDs de SiloPage usam o namespace `silo-page:` separado dos artigos.
- Artigos mantêm a planilha existente e suas expansões de identidade,
  demanda, lógica, SERP, IA/humano e proveniência. Silos ganharam a mesma
  superfície contextual com expansão de SiloDNA, SiloPage, working copy e
  proteção de publicação. A busca global filtra os dois contextos.
- `Links internos` é somente uma superfície bloqueada, informando a ausência
  de fundação do `InternalLinkGraph`; nenhum grafo falso, React Flow ou contrato
  estrutural foi criado.
- Projeções visuais de volume/KGR preservam `null` como desconhecido e não
  materializam zero quando a métrica não existe.

### TESTADO / VISUAL / F5

- `tests/arquiteto-f5-integrity.test.mts` e
  `tests/radar-f5-brand-bootstrap.test.mts` usam os helpers de produção para
  cobrir identidade autenticada, ausência de fallback anônimo e espera do
  bootstrap.
- Suíte focada do bloco: `57/58`; a falha é o fixture legado de
  `tests/radar-hydration.test.mts`, que não preenche `score` e componentes
  exigidos por `fallbackHierarchyStrategy`. Os testes de Arquiteto e o teste
  de handoff que preserva ArticleDNA/brandId passaram.
- `test:visual-system`: `20/20` e `check:visual-system`: PASS.
- Chrome autenticado: após F5 do Arquiteto, os quatro artigos, versões, slugs
  e assessments `SERP com conflito` permaneceram visíveis; a tab Silos abriu
  sem inventar SiloDNA e a tab Links exibiu bloqueio explícito. Após F5 do
  Radar, `marketing online · v2` permaneceu visível e não apareceu `Marca sem
  dados`.
- TypeScript global continua bloqueado por erros prévios em
  `lib/minerador/keyword-qualification.ts` e três regex de fixtures
  (`TS1501`). Nenhum erro novo foi emitido para os arquivos adicionados pelo
  bloco. ESLint dos arquivos novos passou; o workspace legado ainda possui
  erros anteriores.
- Não houve provider real, chamada paga, escrita Supabase, migration, SQL,
  RLS, RPC ou readback remoto. O readback comprovado nesta fila é local e o
  Chrome é uma validação operacional autenticada, não prova de persistência
  remota.

### PENDÊNCIAS

- Corrigir o fixture/contrato do teste Radar sem ampliar o escopo do Arquiteto.
- Validar persistência remota e readback remoto em execução autorizada.
- Manter o Lote 9 parado até o Planner Geral homologar a fundação do
  `InternalLinkGraph`.

## Workbench de processos e tabs na GlobalTopbar — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- As áreas `Artigos`, `Silos` e `Links internos` agora são tabs registradas
  na `GlobalTopbar`; o workbench abaixo da barra ficou dedicado aos processos
  da área ativa.
- `Lógica`, `SERP`, `IA` e `Revisão` são controles acionáveis que reutilizam os
  handlers existentes do Arquiteto. Não foram criados providers, endpoints,
  filas, jobs ou regras editoriais novas.
- Estados visuais distinguem disponível (neutro), processando (accent com
  progresso), concluído (sucesso), aguardando humano, parcial/conflito, erro e
  bloqueado. A IA continua sendo proposta e a confirmação continua humana.
- A área contextual atual ficou recolhível, com resumo do processo ativo e
  limite visual de aproximadamente um terço da altura útil. A planilha,
  seleção, busca, filtros, expansão, histórico e working copy não foram
  reconstruídos.
- As ações de processo foram retiradas do rodapé para evitar duplicação. O
  rodapé mantém apenas ferramentas de seleção e o handoff final para o Radar,
  quando há artigos selecionados.

### TESTADO / LIMITAÇÕES

- `tests/arquiteto-workbench.test.mts`: `3/3` testes focados passaram,
  cobrindo tabs na GlobalTopbar, os quatro controles, estados semânticos,
  área contextual e ausência de duplicação no rodapé.
- `test:arquiteto`: `147/148` passaram nesta execução. Permanece uma falha
  legada fora do escopo: uma asserção do Minerador sobre o rótulo antigo de
  `Processar lógica`; nenhuma falha envolve provider, persistência ou contrato
  estrutural do novo workbench.
- TypeScript continua com os mesmos quatro erros prévios em
  `lib/minerador/keyword-qualification.ts` e regex de fixtures `TS1501`;
  nenhum erro novo foi emitido para o workbench.
- Lint direcionado do workspace continua contaminado por erros legados do
  arquivo monolítico; o componente novo não introduz alteração estrutural.
- Não foi executado Chrome nesta implementação, nem provider real, escrita
  Supabase, migration, SQL, RLS, RPC ou readback remoto.

### PRÓXIMA FILA

- Fazer validação manual no Chrome da troca de tabs, abertura/fechamento do
  contexto e acionamento dos quatro processos, preservando a visibilidade da
  planilha.
- Se necessário, planejar posteriormente fila/job/worker para progresso
  persistente; isso é dependência estrutural e não foi implementado neste
  lote.
- Manter o Lote 9 bloqueado até homologação estrutural do `InternalLinkGraph`.

## Mapa comparativo de arquitetura — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- O Workbench expandido agora separa processo, progresso, diagnóstico,
  comparativo e ações humanas à esquerda de uma única projeção visual limpa à
  direita, mantendo a planilha visível e a área contextual limitada a
  aproximadamente `33vh`.
- O mapa alterna os cenários `Atual`, `Lógica`, `SERP` e `IA`. A troca é
  efêmera e não chama persistência, provider, SERP, IA ou reconstrução de
  DNA.
- A projeção de Artigos mostra grupos, keywords, principal destacada e lista
  simples de secundárias, com apenas indicadores mínimos de candidata,
  conflito e publicado. Não exibe métricas, hashes, versões ou proveniência
  extensa.
- A projeção de Silos mostra SiloPage → Pilar → Suportes; cada ArticleDNA usa
  principal e secundárias resumidas, e as edges representam apenas
  hierarquia/membership, nunca o `InternalLinkGraph`.
- A comparação explicita ganhos, perdas e movimentos na coluna esquerda. Não
  foi criado score SEO global nem regra editorial nova.
- O detalhe e as ações humanas ficam na coluna esquerda. Os selects de keyword
  → grupo e ArticleDNA → Silo são limitados à working copy e delegam aos
  handlers canônicos, mantendo proteção de publicados e readback existente.
- Alterações manuais refletem a working copy e suas projeções; fotografias de
  Lógica, SERP e IA são capturadas em memória quando produzidas e não são
  recalculadas depois da edição humana.
- No modo Silos, a movimentação pelo mapa sincroniza o `SiloWorkingCopy` local;
  quando o destino ainda é provisório, permanece uma alteração reversível sem
  fingir consolidação remota.
- A tab Links internos continua apenas como bloqueio visual. Nenhum
  InternalLinkGraph, nó persistido, edge ou anchor foi criado.

### TESTADO / LIMITAÇÕES

- `tests/arquiteto-workbench.test.mts`: `7/7` testes passaram, incluindo
  React Flow derivado dos snapshots, cenários controlados, comparação à
  esquerda, bloqueio de grafo em Links internos, instância única e vínculo ao
  handler canônico de seleção/movimentação.
- Os testes focados de formação/consolidação de Silos executados junto ao
  workbench passaram: `17/17`.
- TypeScript continua bloqueado pelos quatro erros prévios: um em
  `lib/minerador/keyword-qualification.ts` e três `TS1501` em fixture de
  agência. Nenhum erro novo foi emitido nos arquivos do mapa.
- O lint isolado de `modules/arquiteto/arquiteto-workbench.tsx` e do teste
  focado passou. O lint do workspace monolítico continua com falhas legadas
  fora do trecho alterado.
- O mapa usa `@xyflow/react` `12.11.5`, já presente no contrato de dependências.
  Nodes/edges são projeções derivadas dos snapshots; nodes não são arrastáveis
  nem conectáveis, e não há `onConnect`, `onNodesChange` ou persistência local
  do canvas.
- A antiga descrição de SVG deste bloco foi superada por esta implementação:
  a fotografia de Artigos usa grupos compactos com principal e keywords
  relacionadas; Silos usam SiloPage → Pilar → Suportes; Links internos não
  renderiza React Flow.
- O Chrome conectado pelo agente confirmou mapa normal/expandido, divisão
  desktop em duas colunas de aproximadamente 50%, quatro cenários, comparação
  à esquerda, uma tabela e estado vazio de Silos sem inventar dados. Isso é
  validação local do agente, não homologação manual do usuário.
- Provider real, escrita Supabase e readback remoto não fazem parte desta
  implementação e permanecem não verificados.

### PRÓXIMA FILA

- Validar no Chrome a troca dos quatro cenários, comparação, foco de nós,
  movimentação manual, proteção de publicados e responsividade.
- Manter o Lote 9 bloqueado até a fundação estrutural do `InternalLinkGraph`
  ser homologada pelo Planner Geral.

## Planilha única nos três modos — 2026-08-26

### VERIFICADO NO CÓDIGO

- A página do Arquiteto mantém uma única composição da planilha principal de
  artigos. O mesmo conjunto `filteredArticles`/`groupedArticles` continua
  montado em `Artigos`, `Silos` e `Links internos`.
- A troca de modo altera o Workbench e o contexto operacional, mas não troca a
  entidade central, não monta uma segunda tabela e não desmonta a planilha por
  ausência de `SiloDNA` ou pela fundação pendente do `InternalLinkGraph`.
- Artigos sem Silo permanecem visíveis como `ARTIGOS SEM SILO`; controles de
  Silo e Página do Silo continuam na mesma planilha quando aplicáveis.
- A seleção de artigos, a seleção explícita de Página do Silo e a expansão
  usam o estado do workspace e não um estado criado por tab. `selectedCount`
  agrega os itens selecionados na mesma superfície.
- O bloqueio de `Links internos` continua somente no Workbench. Nenhum
  `InternalLinkGraph`, link local substituto ou contrato estrutural foi criado.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: composição única da planilha, ausência
  de substituição por `Silos`/`Links internos`, dataset compartilhado e estados
  de seleção/expansão cobertos; `7/7` testes focados passaram.
- A arquitetura de renderização da planilha não foi alterada neste refinamento;
  React Flow foi ajustado somente como projeção acima dela.

### OBSERVADO NO CHROME, SEM HOMOLOGAÇÃO FINAL

- Em execução local autenticada, a troca `Artigos → Silos → Links internos →
  Artigos` manteve `1` tabela, os quatro artigos, a seleção de `marketing
  online` e o DNA expandido. O Workbench mostrou o bloqueio do
  `InternalLinkGraph` em Links internos sem substituir a planilha.
- Essa observação foi feita pelo agente no Chrome e não substitui a conferência
  manual do usuário nem comprova persistência remota.

### PENDENTE DE VALIDAÇÃO MANUAL NO CHROME

- Usuário deve abrir `Artigos`, selecionar e expandir uma linha, alternar para
  `Silos`, depois `Links internos` e retornar a `Artigos`, confirmando os mesmos
  artigos, seleção, expansão e working copy.
- Persistência remota/readback remoto e provider real não fazem parte desta
  implementação e permanecem não verificados.

## Refinamento visual do Workbench e React Flow — 2026-08-26

### VERIFICADO NO CÓDIGO

- A área contextual normal mantém o mapa visível; ao expandir, continua
  limitada a `max-h-[33vh]`. A grade desktop começa no topo do Workbench e
  divide o espaço em duas colunas equivalentes: processo/decisão à esquerda e
  mapa à direita.
- `Atual`, `Lógica`, `SERP` e `IA` são um seletor vertical no canto superior
  direito do canvas. O botão `Comparar com Atual` vive no painel esquerdo e não
  disputa espaço com os cenários.
- `Mostrar/Ocultar contexto` foi removido. O contexto e as decisões ficam
  permanentemente na coluna esquerda; não há estado de contexto concorrente.
- `buildArchitectFlowProjection` deriva a projeção exclusivamente do snapshot
  do cenário. A edição visual do canvas não altera working copy, ArticleDNA,
  SiloDNA, persistência ou contratos.
- No mapa de Artigos, cada grupo é somente um frame visual e cada KeywordDNA é
  um node próprio: há exatamente uma Principal visível e keywords relacionadas
  conectadas apenas à Principal. Não existe node de ArticleDNA, placeholder ou
  edge entre grupos; grupo com uma keyword não recebe edge artificial. Métricas,
  hashes, versões e proveniência extensa continuam fora do mapa.
- A projeção de Artigos segue a visibilidade e a seleção da planilha: sem
  seleção mostra todos os grupos visíveis; com uma ou várias linhas mantém
  todos os grupos visíveis, destacando os selecionados e deixando os demais
  como fantasmas, sempre separados. Silos usam builder distinto, com
  ArticleDNA como nodes e hierarquia SiloPage → Pilar → Suportes.
- `Links internos` permanece bloqueado e retorna projeção vazia; não há edges,
  anchors, estado substituto ou persistência fake.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` testes focados passaram,
  cobrindo derivação por snapshot, seletor controlado, preservação histórica,
  bloqueio de mutação via React Flow, planilha única, layout normal/expandido
  e ausência de grafo em Links internos.
- `pnpm check:visual-system`: passou (`VISUAL_SYSTEM_GUARD = PASS`).
- Lint isolado do componente do Workbench e do teste focado passou.
- `git diff --check` passou nos arquivos alterados deste lote.

### VALIDADO LOCALMENTE PELO CODEX NO CHROME

- A página local autenticada exibiu `1` `.react-flow` e `1` tabela em Artigos;
  o mapa permaneceu visível no estado normal e exibiu `Controls`/`MiniMap` no
  estado expandido.
- A grade desktop medida no viewport `1920×953` apresentou `906px` para cada
  coluna. A alternância `Atual → Lógica → SERP → IA` manteve um React Flow e
  uma tabela, e o comparativo apareceu na coluna esquerda.
- Silos sem dados exibiu vazio somente no canvas, sem criar Silo; Links internos
  exibiu bloqueio sem montar `.react-flow`.

### PENDENTE DE HOMOLOGAÇÃO MANUAL

- O usuário ainda deve conferir no Chrome mouse/touchpad, pan, zoom, foco,
  contraste em tema claro/escuro e larguras `360/768/1024/1440px`.
- A validação local não comprova provider real, escrita Supabase, readback
  remoto nem consolidação editorial. O Lote 9 continua bloqueado.

## Correção semântica do mapa de Artigos — 2026-08-26

### VERIFICADO NO CÓDIGO

- `buildArchitectFlowProjection` não cria mais um node de ArticleDNA no modo
  `Artigos`. Ele cria um frame visual por grupo e nodes de KeywordDNA com
  `Keyword principal`, `Keyword secundária N` ou `Keyword reforço N`.
- A Principal é escolhida de forma determinística; cada keyword relacionada
  recebe uma edge visual da Principal para si. Não há edge entre grupos, cadeia
  por numeração ou construção de InternalLinkGraph.
- `visibleArticleIds` define o conjunto que aparece no mapa na mesma ordem da
  planilha filtrada. `selectedArticleIds` apenas dá destaque: sem seleção todos
  os grupos ficam normais; com seleção, artigos não selecionados continuam
  visíveis como fantasmas, sem filtrar a working copy.
- Keywords e nomes de grupos usam quebra de linha integral; não há `truncate`
  nem `line-clamp`, nem métricas, hashes, versões ou proveniência extensa no
  mapa.
- Os grupos de Artigos são empilhados verticalmente com posições determinísticas
  e espaçamento independente. O React Flow não cria conexões manuais, não move
  nodes e não conecta grupos. A moldura compacta mantém uma área interna
  navegável. Em Artigos o `fitView` automático fica desativado para preservar
  escala natural e topo da lista; o controle de fit continua disponível no
  estado expandido.
- Clique em node do mapa apenas seleciona/foca o artigo. A expansão do DNA
  continua exclusiva da planilha e requer o controle explícito de chevron do
  mapa; expandir aumenta o canvas e libera `Controls`/`MiniMap` sem alterar
  cenário, seleção ou arquitetura.
- A grade `lg:grid-cols-2` envolve o Workbench desde o topo: processos,
  contexto, comparativo e ações humanas ficam à esquerda; canvas, cenários e
  exploração mínima ficam à direita. A planilha canônica continua única e
  abaixo da composição.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` testes focados passaram,
  incluindo keyword completa sem truncamento, ordem vertical, ghosting,
  seleção sem expansão, chevron explícito, área interna navegável e Controls
  restritos à expansão, ausência de mutação por React Flow, snapshots
  históricos, builder distinto de Silos, planilha única e bloqueio de Links
  internos.
- `pnpm test:visual-system`: `20/20` passou após alinhar o contrato visual à
  remoção definitiva de `contextExpanded`. `pnpm test:arquiteto` terminou com
  `155/156`: a única falha é a asserção legada do Minerador em
  `tests/arquiteto-domain.test.mts:307`; nenhum teste do Arquiteto falhou.
- ESLint isolado do Workbench e do teste focado passou; o guard do sistema
  visual passou para o novo componente.

### VALIDADO LOCALMENTE PELO CODEX NO CHROME

- A fixture local autenticada exibiu uma planilha e um React Flow com quatro
  grupos, doze nodes e edges apenas dentro do respectivo grupo. A ordem do DOM
  foi `unhas de gel decoradas` → `alongamento de unhas` → `manicure perto de
  mim a domicílio` → `marketing online`; a Principal foi a origem das edges.
- O canvas normal mediu `176px`, com área interna navegável de `1020px` e
  escala inicial `1`; Controls/MiniMap ficaram ausentes. Após selecionar um ou
  dois artigos, todos os grupos continuaram presentes, os selecionados ficaram
  sólidos e os demais receberam ghosting; o clique em keyword manteve as cinco
  linhas da tabela sem abrir DNA.
- O filtro `Pilar` reduziu a projeção ao único grupo visível correspondente. A
  troca para `IA` manteve a ordem e a seleção. O chevron alternou `176px` ↔
  `240px`, preservou a seleção e mostrou Controls/MiniMap somente expandido.
- Silos manteve uma única planilha e projeção separada; Links internos manteve
  a planilha, sem React Flow, com o bloqueio estrutural visível.

### LIMITES

- A implementação removeu a expansão acionada pelo clique do mapa e a seleção
  filtrada do canvas. A homologação física do usuário (mouse, touchpad, drag,
  pan/zoom, responsividade e temas) e F5/readback remoto continuam pendentes.
- O TypeScript continua com quatro erros fora do Arquiteto (`keyword-qualification`
  e três fixtures de agência); o lint do workspace monolítico continua com
  débitos legados fora deste refinamento.
- Não houve provider real, escrita Supabase, migration, alteração de schema,
  RLS, RPC ou mudança em Radar. InternalLinkGraph permanece bloqueado pelo
  gate estrutural do Planner Geral.

## Ajuste horizontal do mapa do Arquiteto — 2026-08-26

### VERIFICADO NO CÓDIGO

- O mapa de Artigos usa a largura para expressar a relação editorial:
  Principal à esquerda e cada Secundária/Reforço diretamente à direita. Não há
  cadeia entre keywords relacionadas nem elementos artificiais para grupos de
  uma única keyword.
- Cada grupo de Artigos permanece uma faixa horizontal independente; as faixas
  seguem a ordem recebida da planilha e são empilhadas verticalmente com altura
  calculada pelo número de keywords. A Principal fica centralizada em relação
  às relacionadas, sem reduzir ou ocultar o texto.
- Grupos com uma única keyword usam moldura e largura compactas; grupos com até
  seis keywords têm cinco posições relacionadas distribuídas sem sobreposição.
- O mapa de Silos agora usa colunas fixas `SiloPage → Pilar → Suportes`. Os
  Suportes são distribuídos verticalmente somente dentro do mesmo Silo; cada
  novo Silo começa após a altura real do conjunto anterior. As edges continuam
  sendo projeções de hierarquia/membership, não `InternalLinkGraph`.
- Nodes continuam não arrastáveis/não conectáveis, e nenhuma alteração foi feita
  na planilha única, na working copy, nos handlers canônicos, na persistência,
  nos contratos ou no domínio editorial.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` passou, cobrindo colunas
  Principal/relacionadas, edges diretas, ausência de cadeia secundária,
  empilhamento determinístico, grupo unitário compacto, limite de seis
  keywords, ordem da planilha, ghosting, expansão e orientação horizontal dos
  Silos.
- ESLint direcionado de `arquiteto-workbench.tsx` e do teste focado passou.
- Não houve mudança em schema, migration, RLS, RPC, provider ou Radar.

### PENDÊNCIAS DE VALIDAÇÃO

- O Chrome, a conferência manual de mouse/touchpad, pan/zoom, responsividade,
  temas e F5/readback remoto devem ser repetidos pelo gate correspondente após
  esta alteração. Nenhuma execução de provider real ou escrita remota foi
  realizada.
- O Lote 9 continua bloqueado até a fundação estrutural do `InternalLinkGraph`
  ser homologada pelo Planner Geral.

## Links Internos funcional / working copy real — 2026-08-27

### VERIFICADO NO CÓDIGO


## Passos 2 e 3 — Silos, identidade de URL e Links Internos — 2026-08-27

Módulo proprietário: Arquiteto. A implementação reutiliza SiloDNA, SiloPage,
InternalLinkGraph e seus writers canônicos existentes. Não houve migration,
schema, RLS, provider, API global ou escrita remota nesta rodada.

### IMPLEMENTADO

- A aba Silos mantém os três caminhos explícitos: criação manual via `+ Silo`,
  formação a partir de candidatas reservadas na working copy e fortalecimento
  de Silo existente somente quando ArticleDNA/SiloDNA/SiloPage reais o sustentam.
  Nenhum desses caminhos é acionado pela aba Artigos.
- SiloPage continua entidade de página distinta de SiloDNA e do Pilar; seu
  DNA preserva slug/canonical, publicação, versão e identidade sem transformá-la
  em ArticleDNA.
- Links mantém somente IA e Revisão como processos; não cria Lógica/SERP. Seus
  nodes têm exclusivamente refs `SILO_PAGE` ou `ARTICLE_DNA`.
- O mapa de Links agora resolve slug e canonical a partir das versões
  referenciadas, apenas como identificação visual. Nenhum valor é inferido
  quando o canonical não foi recebido.
- Ao criar uma edge humana, `anchorConcepts` recebe sugestões editáveis do
  contexto do destino: intenção, entidade, secundárias/reforços, SiloPage e
  seções. A principal não é copiada como âncora final.

### TESTED

- Testes locais focados: 29/29, incluindo formação de Silos, contrato do
  grafo, projeção do Workbench e sugestões de âncora.
- TypeScript: não houve erro novo do lote; permanecem quatro erros externos
  conhecidos em Minerador e fixture de Agência.

### PENDENTE

- Chrome autenticado, F5/readback remoto, criação/aprovação real do par
  SiloDNA/SiloPage e do Graph permanecem pendentes. Não foram chamados SERP,
  IA ou providers pagos.

```text
SILO_SLUG_SOURCE = SiloPage canônica ou rascunho manual validado
ARTICLE_SLUG_SOURCE = ArticleDNA suggestedSlug ou identidade publicada protegida
INTERNAL_LINK_CANONICAL_RESOLUTION = somente referência recebida; nunca inventada
ANCHOR_CONCEPTS_FROM_KEYWORD_CONTEXT = SIM; editável; não é âncora final
REMOTE_SCHEMA_CHANGES = 0
NEW_MIGRATIONS = 0
MANUAL_UI_VALIDATION = PENDING
REMOTE_FLOW_VALIDATION = PENDING
- O gate recebido para este lote é `INTERNAL_LINK_GRAPH_REMOTE_FOUNDATION =
  READY`, com isolamento por Brand e suporte a working copy, `lock_version`,
  aprovação append-only e referência downstream. Nenhuma migration, schema,
  RLS, grant ou provider foi alterado neste lote.
- A aba `Links internos` deixou de exibir o bloqueio antigo e usa somente os
  processos canônicos `IA` e `Revisão`; a IA permanece explicitamente
  desabilitada e não há chamada DeepSeek, SERP ou provider.
- A planilha de Artigos continua única nos três modos. Links trabalha com o
  contexto de `SiloDNA + SiloPage + ArticleDNA` já aprovado e não cria tabela,
  dataset ou grafo paralelo.
- A entrada da aba lê a Brand ativa, lista os Graphs aprovados e carrega a
  working copy persistente por `graphId`. Sem working copy, a UI abre uma base
  nova a partir das referências canônicas; com Graph aprovado, cria sucessora
  sem editar a versão anterior.
- `InternalLinkGraph` é projetado no React Flow com apenas nodes `SILO_PAGE` e
  `ARTICLE_DNA`, edges dirigidas com seta, distinção visual de SiloPage/Pilar/
  Suporte e layout horizontal. A versão aprovada é somente leitura; arraste e
  conexão ficam disponíveis apenas na working copy. Posição, zoom, viewport e
  seleção ficam somente na camada visual e não participam do hash ou da versão.
- Criação, edição e remoção de edge passam pelo domínio e pela working copy.
  Self-link e duplicata dirigida são rejeitados; `reason`, `priority` e
  `anchorConcepts` são editáveis na coluna esquerda. Âncoras são conceitos
  semânticos, não frases HTML nem split mecânico.
- O salvamento usa `PATCH` com o `lock_version` confirmado. A rota/repository
  existentes fazem readback canônico antes de a UI mostrar `Salvo`; stale
  permanece como conflito e oferece recarregar, sem merge automático. A
  aprovação cria nova versão imutável e a edição futura parte de uma sucessora.
- O retorno de persistência preserva o `InternalLinkGraphRef` opcional para
  consumidores downstream. O Radar não foi alterado nem recebeu bypass; a
  integração existente continua disponível pela rota canônica de referência.

### CONFIRMADO POR TESTE LOCAL

- Testes focados do grafo, Workbench e guard de provider passaram: `28/28` no
  conjunto executado nesta rodada.
- `test:visual-system`: `20/20`; `check:visual-system`:
  `VISUAL_SYSTEM_GUARD = PASS`.
- O TypeScript não introduziu erro nos arquivos do lote. A execução global
  ainda acusa quatro erros preexistentes fora deste escopo:
  `lib/minerador/keyword-qualification.ts:157` e três regexes `TS1501` em
  `tests/agency-adalba-platform-internal.test.mts`.
- `test:arquiteto` ainda possui a falha preexistente do Minerador na asserção
  de `Processar lógica`; os testes do Arquiteto e do InternalLinkGraph
  passaram. A expectativa antiga do teste de providers foi ajustada para
  escopar a independência do fluxo de ArticleDNA, sem rejeitar a nova aba de
  Links.

### AINDA NÃO VERIFICADO

- Chrome/manual: criação de working copy, conexão A→B/B→A, edição dos campos,
  stale, F5, aprovação, sucessora, dark mode e expansão ainda aguardam
  execução manual autenticada. A expansão foi ajustada para aproximadamente
  `48vh` no desktop.
- Persistência remota real/readback autenticado do Graph e conferência do
  `InternalLinkGraphRef` no handoff do Radar não foram executados nesta rodada.
  O código está conectado às rotas canônicas, mas isso não é prova remota.
- Não houve chamada real de DataForSEO, DeepSeek ou qualquer provider pago.
- A IA de Links Internos permanece para o próximo lote; nenhuma Proposal foi
  criada ou aplicada.

## Correção de integridade da fase Artigos — 2026-08-27

Módulo proprietário: Arquiteto. Esta rodada corrigiu a fronteira entre a
formação de artigos e a formação posterior de Silos, sem iniciar um novo lote
editorial nem alterar Radar, Links Internos, providers ou a infraestrutura
remota.

```text
ARTICLES_BOUNDARY_FIXED = SIM (código local)
PROCESS_STATUS_SEMANTICS_FIXED = SIM (código/helper local)
SERP_PRESENTATION_FIXED = SIM (execução separada de diagnóstico)
ARTICLE_DNA_GATE_FIXED = SIM (gate local + readback no fluxo existente)
SILO_PREMATURE_CREATION_FIXED = SIM (criação explícita somente em Silos)
```

### AUDITORIA DOS RÓTULOS E CONTROLES

- `Silo sem nome`: fallback do read model de `groupedArticles` e do handler de
  exclusão de grupo, restrito ao modo Silos. Classificação:
  `READ_MODEL_DERIVED` / `LEGACY_UI`; não há literal persistido identificado.
- `/silo-sem-nome`: não existe como literal no código; seria derivado por
  `toSlug` a partir do fallback anterior. Classificação:
  `READ_MODEL_DERIVED` / `LEGACY_UI`.
- `PILAR` e `SUPORTE 1`: projeções de hierarquia da tabela de Silos. Não são
  decisões operacionais da tabela de Artigos; o contrato do grafo de Links
  Internos permanece separado e congelado.
- `ARTIGOS SEM SILO`: rótulo derivado da projeção do modo Silos, não exibido na
  formação plana de Artigos.
- `+ Silo`: controle React que abre a criação manual e só é renderizado no modo
  Silos. O submit continua protegido pela rota canônica existente; nenhum
  submit remoto foi executado nesta rodada.
- `SILO_SEM_NOME_SOURCE = fallback de read model em groupedArticles/handler de exclusão`.
- `SILO_SEM_NOME_PERSISTED = NÃO VERIFICADO (remote read não executado)`.
- `SILO_SEM_NOME_CREATED_BY = não comprovado; nenhum criador persistente foi identificado no código auditado`.
- `SILO_SEM_NOME_SAFE_REMEDIATION = manter dados intactos, remover apenas a projeção operacional na fase Artigos e tratar eventual ocorrência remota em auditoria/readback autorizado; nenhuma limpeza foi executada`.

### FRONTEIRA IMPLEMENTADA

- A fase Artigos trabalha com grupos planos de ArticleDNA em formação, roles,
  lógica, evidência SERP, proposta de IA, revisão humana e consolidação.
- Novas keywords não recebem `siloId`, `silo_id` ou `siloName` na working copy
  dessa fase; proteção de Silo já existente em conteúdo publicado é mantida.
- O bootstrap do handoff canônico não converte mais `lista_id` do Minerador em
  atribuição de Silo para keyword nova; `lista_id` continua disponível como
  proveniência. O vínculo legado só é recuperado para identidade publicada ou
  por assignment explícito da working copy.
- A lógica aguarda a confirmação do writer canônico da working copy antes de
  expor o resultado. A proposta de IA de “criar artigo” não materializa
  `tmp-ai-silo-*`; fica registrada como proposta/proveniência reversível.
- Não há criação de SiloDNA, SiloPage, slug, Pilar ou Suporte na fase Artigos.
  A criação explícita de Silo e a formação de SiloPage continuam exclusivas do
  modo Silos.
- A planilha permanece única e compartilhada pelos três modos. Artigos usa a
  projeção plana em ordem canônica; Silos usa a projeção agrupada. A troca de
  modo não cria Silo automaticamente.
- Em Artigos, a coluna de hierarquia é neutra (`Pendente para Silos`) e o
  controle de criação de Silo não é operacional. O painel legado foi ocultado
  dessa experiência e permanece disponível como `Briefing legado` no modo
  Silos, com seus consumidores e dados preservados.

### ESTADOS E GATES

- Lógica concluída significa execução e resultado da hipótese determinística;
  não significa ArticleDNA aprovado, revisão terminada, Silo criado ou Radar
  liberado.
- SERP separa execução de diagnóstico: 3/3 consultas com conflito continuam
  execução completa e exibem conflito; parcial significa consulta, snapshot ou
  recomendação obrigatória ausente/falha. SERP não movimenta a working copy.
- IA concluída significa proposta gerada; a revisão humana permanece pendente.
  IA não aprova.
- ArticleDNA é “ainda não consolidado” antes da confirmação e o gate do Radar
  exige ArticleDNA aprovado, sem pendências/conflitos, refs preservadas e
  readback do contrato aplicável.
- ArticleDNA aprovado deixa a área pronta para a etapa Silos, mas não cria um
  Silo. A regra de exatamente um Pilar por Silo continua pertencendo ao modo
  Silos.

### MATRIZ DE EXECUÇÃO

| Gate | Resultado | Evidência | Problema encontrado | Próxima ação |
| --- | --- | --- | --- | --- |
| Artigos → ArticleDNA | Corrigido localmente | Código e testes focados | Antes, projeções de Silo contaminavam a leitura da fase | Homologar fluxo H3 no Chrome |
| Artigos → Silos | Separação aplicada | Modo, guards e projeções derivados | Readback remoto de eventual legado não executado | Auditar remoto somente com autorização |
| SERP | Preservada como evidência | Handler não altera working copy | Provider real não chamado | Validar manualmente com fixture/conta autorizada |
| IA | Proposta reversível | IDs/anotações, sem aprovação | Provider real não chamado | Revisão humana manual |
| Radar | Gate mais estrito | `articleRadarGateIssues` | Handoff remoto não comprovado | Executar H4 após ArticleDNA real |
| Links Internos | Não iniciado nesta rodada | Código não alterado | Gate estrutural/escopo fora do lote | Permanecer congelado |

### VALIDAÇÃO E LIMITES

- `tests/arquiteto-article-phase.test.mts` e `tests/arquiteto-article-logic.test.mts`:
  17/17 testes focados passaram; com `tests/arquiteto-canonical-workspace.test.mts`,
  a verificação focada da fronteira/bootstrapping ficou em 24/24. Incluindo as
  regressões relacionadas de seleção e Silo, o conjunto final executado ficou
  em 39/39.
- Testes visuais anteriores do sistema: 20/20; testes focados anteriores do
  Arquiteto/Graph: 28/28. A suíte `test:arquiteto` ainda conserva uma falha
  preexistente do teste do Minerador que espera o texto antigo de `Processar
  lógica`; ela não foi alterada nesta correção.
- Lint direcionado dos helpers, bootstrap/projeções e regressões passou pelo
  binário local do ESLint.
  O lint do workspace/componente continua com falhas preexistentes e não foi
  tratado como bloqueio desta correção localizada.
- TypeScript global foi executado pelo binário local e manteve somente quatro
  erros preexistentes: `lib/minerador/keyword-qualification.ts:157` e três
  expressões regulares em `tests/agency-adalba-platform-internal.test.mts`.
  Não restou erro novo nos arquivos desta correção.
- `git diff --check` passou (somente avisos de conversão LF/CRLF do checkout).
  Chrome, provider real, `REMOTE_WRITE` e `REMOTE_READ` não foram executados/
  realizados. Não houve migration, mudança de schema/RLS/RPC, limpeza de dados
  ou chamada paga.

### CAMPOS DE RELATÓRIO

```text
ARTICLES_CREATED_SILO_BEFORE = não há evidência de criação persistente; havia projeções derivadas/legadas
ARTICLES_CREATED_SILO_AFTER = 0 no fluxo de Artigos
ARTICLES_TABLE_PROJECTION = grupos planos de Artigos em formação / ArticleDNAs
SILOS_TABLE_PROJECTION = grupos de Silos, SiloPage, Pilar e Suportes somente no modo Silos
SAME_GRID_PRESERVED = SIM
LOGIC_EXECUTION_STATUS = execução concluída somente após confirmação do writer da working copy
LOGIC_OUTPUT = grupos provisórios, roles e candidatas a Silo reservadas; sem criação de Silo
SERP_EXECUTION_STATUS = helper separa completo de parcial por cobertura obrigatória
SERP_DIAGNOSTIC_STATUS = avaliação/evidência com conflito explícito quando aplicável
SERP_ASSESSMENT_SOURCE = artefato local da operação/assessment existente
SERP_SNAPSHOT_SOURCE = snapshot existente ou fixture/local fallback; origem remota não comprovada
SERP_REMOTE_PERSISTENCE_PROVEN = NÃO
AI_EXECUTION_STATUS = proposta gerada não equivale a aprovação
HUMAN_REVIEW_STATUS = pendente até confirmação humana real
ARTICLE_DNA_LEGACY_PANEL = briefing legado de briefings_artigos; oculto em Artigos, preservado em Silos
FIELDS_CANONICAL_TO_ARCHITECT = principal, secundárias, reforços, intenção, refs KeywordDNA, ArticleDNA, decisões e proveniência
FIELDS_BELONG_TO_PLANNER = briefing/plano editorial derivado após o handoff, conforme contrato do módulo
FIELDS_BELONG_TO_WRITER = execução textual, ângulo/CTA final e conteúdo de publicação, conforme contrato do módulo
FIELDS_WITHOUT_ACTIVE_OWNER = não identificado nesta auditoria; campos legados permanecem preservados até confirmação do consumidor
ARTICLE_DNA_CONSOLIDATION_GATE = principal, até 6 keywords, papéis/conflitos resolvidos, decisão humana, persistência/readback
READY_FOR_SILOS_GATE = ArticleDNA consolidado sem pendências; pronto para propor, não para criar automaticamente
RADAR_HANDOFF_GATE = bloqueado enquanto ArticleDNA não estiver consolidado/aprovado
TESTS = focados 24/24 (article-phase/logic: 17/17), 39/39 com seleção relacionada; test:arquiteto 181/182 com 1 falha preexistente do Minerador
VISUAL_TESTS = test:visual-system 20/20 e guard visual PASS; Chrome desta correção pendente
LINT = helper e regressão direcionados PASS; workspace/componente possui falhas preexistentes
TYPESCRIPT = executado; quatro erros preexistentes fora da correção
NEW_TYPESCRIPT_ERRORS = 0
PREEXISTING_TYPESCRIPT_ERRORS = quatro erros já conhecidos em Minerador/fixture de agência
GIT_DIFF_CHECK = PASS (avisos LF/CRLF somente)
REMOTE_SCHEMA_CHANGES = 0
NEW_MIGRATIONS = 0
PAID_PROVIDER_CALLS = 0
MANUAL_UI_VALIDATION = PENDING
```

## Painel expandido da linha do artigo — 2026-08-27

Módulo proprietário: Arquiteto. Esta alteração reorganiza exclusivamente o
painel aberto pelo chevron de uma linha de artigo; a planilha principal, a
working copy, persistência, contratos, Radar e a formação de Silos não foram
alterados.

### VERIFICADO NO CÓDIGO

- O painel exibe um resumo superior próprio com Volume, Resultados, Intenção,
  Funil, KGR, proteção e contexto de Silo. Soma e média são explicitamente
  derivadas para comparação arquitetural; `null` continua exibido como dado
  ausente e zero real é preservado.
- A composição responsiva divide o detalhe em duas metades: à esquerda,
  definição/fatos acumulados e perfis completos das keywords em accordions; à
  direita, uma única etapa selecionada entre Lógica, SERP, IA e Revisão.
- SERP permanece observacional; IA permanece proposta reversível; revisão
  humana não é inferida como aprovação. A mudança de papel usa o handler
  canônico da working copy e respeita publicação protegida.
- O contexto de Silo e de Links Internos só aparece quando já há referências
  reais. O painel não cria Silo, SiloPage ou grafo.
- Campos legados de briefing deixaram de integrar o detalhe de Artigos. Não
  foram apagados nem promovidos a definição canônica do artigo; ownership
  definitivo continua pendente de confirmação com Planejador/Redator.

### CONFIRMADO POR TESTE LOCAL

- `tests/arquiteto-article-expanded-panel.test.mts` e
  `tests/arquiteto-article-phase.test.mts`: 10/10, cobrindo métricas derivadas,
  `null`, zero real, conflitos de intenção, funil, KGR individual, duas
  metades, accordions e os quatro processos.
- Lint direcionado do helper e da regressão nova passou.
- TypeScript global manteve apenas os quatro erros preexistentes de Minerador e
  fixtures de Agência; não restou erro novo do painel.

### LIMITES

- O lint de `arquiteto-workspace.tsx` continua com dívida preexistente de um
  componente grande e não foi corrigido neste lote visual.
- Validação manual em Chrome, temas e larguras 360/768/1024/1440 permanece
  pendente. Não houve provider real, escrita remota ou readback remoto.

```text
ARTICLE_EXPANDED_PANEL = IMPLEMENTADO_LOCALMENTE
ARTICLE_SUMMARY = IMPLEMENTADO_COM_DADOS_DERIVADOS_ROTULADOS
ARTICLE_DNA_SECTION = IMPLEMENTADO_EM_ACCORDION
PRIMARY_KEYWORD_SECTION = IMPLEMENTADO
SUPPORT_KEYWORDS_SECTION = IMPLEMENTADO
KEYWORD_DNA_ACCORDION = IMPLEMENTADO
LOGIC_PANEL = IMPLEMENTADO
SERP_PANEL = IMPLEMENTADO
AI_PANEL = IMPLEMENTADO
HUMAN_REVIEW_PANEL = IMPLEMENTADO
SILO_CONTEXT_SECTION = CONDICIONAL_A_REFERENCIA_REAL
INTERNAL_LINK_CONTEXT_SECTION = CONDICIONAL_A_GRAFO_REAL
LEGACY_ARTICLE_FIELDS_AUDIT = NAO_CANONICOS_NO_ARTIGOS; DADOS_PRESERVADOS
MANUAL_UI_VALIDATION = PENDING
```

## Planilha principal de Artigos — padronização operacional — 2026-08-27

- A única planilha do workspace agora apresenta, após `#`, seleção e chevron:
  `Artigo`, `Keyword principal`, `Quantidade de keywords`, `Revisão IA`,
  `Definição do artigo`, `Silo`, `Ações`, `Aprovação` e `Status`.
- A numeração é ordinal visual. Checkbox seleciona sem expandir; chevron abre
  sem selecionar. A linha expandida recebe superfície elevada, preservando a
  seleção como estado independente.
- Em Artigos, não há cabeçalho de grupo/Silo e a coluna Silo mostra somente
  `Não iniciado` ou `Pronto para Silos`; a troca de modo não cria SiloDNA,
  SiloPage, Pilar ou Suporte.
- Em Silos/Links, a mesma tabela pode exibir o Silo existente e sua hierarquia
  real. `Silo sem nome` permanece apenas fallback legado dessa projeção; não
  há literal persistido identificado e nenhum dado foi apagado.
- O painel expandido continua sendo inserido abaixo da linha pelo mesmo
  `expandedIds`; não houve mudança de contrato, schema, persistência, Radar ou
  InternalLinkGraph.

```text
PREMATURE_SILO_SOURCE = groupedArticles read-model fallback

## Planilha principal de Artigos — padronização operacional — 2026-08-27

- A única planilha apresenta, após `#`, seleção e chevron: `Artigo`, `Keyword principal`, `Quantidade de keywords`, `Revisão IA`, `Definição do artigo`, `Silo`, `Ações`, `Aprovação` e `Status`.
- A numeração é ordinal visual. Checkbox seleciona sem expandir; chevron abre sem selecionar. A linha expandida recebe superfície elevada, preservando a seleção como estado independente.
- Em Artigos, não há cabeçalho de grupo/Silo e a coluna Silo mostra somente `Não iniciado` ou `Pronto para Silos`; a troca de modo não cria SiloDNA, SiloPage, Pilar ou Suporte.
- Em Silos/Links, a mesma tabela pode exibir o Silo existente e sua hierarquia real. `Silo sem nome` permanece fallback legado dessa projeção; não há literal persistido identificado e nenhum dado foi apagado.
- O painel expandido continua abaixo da linha pelo mesmo `expandedIds`; não houve mudança de contrato, schema, persistência, Radar ou InternalLinkGraph.

```text
PREMATURE_SILO_SOURCE = groupedArticles read-model fallback
PREMATURE_SILO_PERSISTED = NOT_VERIFIED
PREMATURE_SILO_UI_DERIVED = YES; only outside Articles mode
MANUAL_UI_VALIDATION = PENDING
```

## Correção final de Artigos — escopo dos processos e painel expandido — 2026-08-27

- **Lógica:** no modo Artigos, exige seleção explícita. A entrada do algoritmo contém somente KeywordDNAs dos artigos selecionados; keywords e grupos não selecionados são preservados ao recompor a working copy. Não há fallback de seleção vazia para todo o workspace.
- **SERP e IA:** os controles já recebiam grupos selecionados; o resumo do Workbench agora deriva somente desses artigos. A coluna de IA permanece por artigo e a tab distingue `IA concluída` de `revisão humana pendente`.
- **Tabs internas:** a causa de não navegar era a memoização do subtree sem a tab ativa. `processTab` entrou apenas na chave de renderização local; clique continua sendo leitura/navegação, sem provider, persistência ou mutação.
- **SERP:** cabeçalho separa execução, conclusão arquitetural e força da evidência; conflito e evidência fraca são dimensões diagnósticas distintas. A ausência de recomendação de slug continua explícita e compacta.
- **Visual:** keyword e slug provisório usam accent semântico; publicado usa o tratamento contextual existente. Linha expandida recebe rail própria e chevron destacado, independente de checkbox/seleção.
- **Validação local:** 13/13 regressões de fase/escopo/tabs passaram. Chrome, provider real, persistência remota e readback permanecem pendentes.

## Correção crítica — mutation scope de Artigos e diagnóstico IA — 2026-08-27

- **Causa raiz comprovada:** o executor recebia o recorte selecionado, mas recompunha o workspace inteiro e passava todas as rows ao writer canônico; por isso write/payload e a mensagem podiam parecer globais.
- **Correção:** o escopo é capturado no entrypoint da Topbar, a composição preserva objetos não selecionados na mesma ordem e o writer recebe somente `mutationItems`.
- **Mensagem:** separa artigos processados do total confirmado na working copy; não chama o total do workspace de processado.
- **IA:** aplicação de proposta também é limitada ao `mutationKeywordIds` registrado ao gerar a proposta. O cliente preserva `HTTP`, `code` e `failureStage` sanitizados devolvidos pela rota, em vez de apagar o diagnóstico com mensagem genérica.
- **Prova local:** fixture A/B/C/D, com apenas D selecionado, preserva A/B/C por identidade estrutural e permite alteração somente em D. Teste focal passou (`7/7`).
- **Limites:** nenhum provider foi chamado; não há log histórico do clique real disponível neste ambiente. Chrome, F5 remoto e a classificação factual do erro anterior de IA continuam pendentes.
- **Escopo:** sem migration, schema, RLS, alterações de Silos/Links/Radar ou chamada paga.

## Correção pontual — Revisão com IA — 2026-08-27

- O pós-provider agora completa a fotografia da proposta com `mutationArticleIds` e `mutationKeywordIds`; o tipo `PendingKeywordReview` volta a ser satisfeito e a proposta válida chega à revisão humana sem mutar a working copy.
- O catálogo de destinos enviado à IA é limitado aos grupos selecionados no lote. Artigos externos não recebem proposta de mutação.
- Diagnósticos sanitizados de truncamento/formato agora exibem mensagens específicas no cliente; não há logs ou chamada real desta rodada para atribuir a falha histórica a um estágio do DeepSeek.
- Testes locais cobriram fixture válida, fixture truncada, rota/configuração por contrato e regressão direta de escopo. Não houve chamada de provider, persistência remota ou readback remoto.
- A proposta pendente ainda é estado de sessão até a aplicação humana; persistência independente de proposta antes da decisão não existe no contrato atual e exige avaliação estrutural antes de ser criada.

## Correção pontual — painel de processos do Artigo — 2026-08-27

- A linha `Revisão IA`, o Workbench para a seleção atual e as abas internas agora derivam o estado de um único read model por artigo: Lógica, SERP, IA e Revisão. A tab continua estado local de navegação e não executa processo, provider ou persistência.
- A IA separa `NOT_RUN`, processamento, conclusão sem propostas, conclusão com propostas e erro; a revisão separa não necessária, pendente, em revisão e concluída. Três propostas significam IA concluída e três pendências humanas, não três execuções.
- Proposta ainda na fila e proposta aplicada à working copy permanecem visíveis na aba Revisão. `Aplicar proposta para revisar` não aprova ArticleDNA; somente o pente-fino humano encerra a pendência.
- A projeção da SERP conserva o resumo explicável existente e passa a expor o estado por artigo, sem tratar conflito ou evidência fraca como execução parcial.
- Auditoria dos erros relatados: a mensagem de workflow nasce do update otimista por `id`, `marca_id` e `lock_version`; sem log da tentativa não é possível distinguir lock obsoleto de identidade incompatível. A mensagem de working copy nasce do retorno `false` do writer; o handler retorna imediatamente, portanto não há sucesso na mesma tentativa de aplicação.
- Validação local: 17/17 testes focados passaram. `test:arquiteto` ficou 182/183 por teste estático preexistente do Minerador que espera o label antigo `Processar lógica`. TypeScript não apontou erro novo do Arquiteto; permanecem 4 falhas preexistentes (1 em Minerador e 3 regex TS1501). Chrome, provider real, persistência remota e readback remoto não foram executados.

## Revisão IA do artigo persistida no artefato canônico — 2026-08-29

- **Decisão do Planner:** reutilizar `editorial_artifact_versions` com o tipo
  `article_architecture_ai_review`, escopo `marca_id + artifact_type +
  entity_id(articleId)`. Nenhuma tabela nova.
- **O que passou a sobreviver ao F5:** execução, NO_OP, propostas materiais com
  `proposalId` estável e a decisão humana por proposta. Antes o resultado vivia
  só no estado de sessão e o artigo voltava para "IA · Não executada".
- **Base revisada:** `articleId` + `baseArticleContentHash` (+ versão do
  ArticleDNA quando consolidado). O hash da base entra no `contentHash` do
  artefato, então mesma base com mesmo resultado devolve `UNCHANGED` e base
  alterada gera versão nova mesmo com resultado idêntico.
- **STALE:** revisão de base antiga vira histórico, não vigente. A aba IA avisa
  que a estrutura mudou e sugere reexecutar; a aprovação do ArticleDNA continua
  liberada.
- **Decisão humana:** aceitar/rejeitar grava sucessora do próprio artefato, sem
  reescrever o resultado da IA. Aceitar proposta continua distinto de aprovar o
  ArticleDNA.
- **Readback obrigatório:** só existe SUCCESS depois de reler os artefatos
  canônicos e conferir `versionId`/`contentHash` de cada revisão gravada.
- **Schema:** somente ampliação do CHECK de `artifact_type`, na migration
  `20260829120000_article_architecture_ai_review_artifact.sql`. Aplicação
  remota e smoke A–F são do produto.
- **Validação local:** 15/15 testes novos de persistência; `test:arquiteto`
  310/311, com a única falha sendo a asserção estática preexistente do
  Minerador. TypeScript mantém os cinco erros preexistentes fora deste lote.

## IA por Article: payload estratégico, 413 e durabilidade — 2026-08-29

- **Unidade de execução:** a revisão com IA passou a ser por Article
  (`buildArticleReviewBatches`). Antes o lote era uma fração de artigo — até 4
  keywords por request —, então um artigo de 6 keywords virava dois requests e
  qualquer falha derrubava a execução inteira. Agora cinco artigos selecionados
  produzem cinco execuções independentes, sequenciais (concurrency = 1).
- **Causa do HTTP 413:** o payload carregava o registro cru da keyword
  (`keywordDnaSnapshot: { ...keyword }`), os snapshots completos da SERP
  (`organicResults`, `peopleAlsoAsk`, `knowledgeGraph`) e todos os SiloDNAs
  inteiros. Em fixture de um artigo com 6 keywords isso dava 418 409 caracteres,
  acima do limite de 250 000 do provider — daí o `AI_REQUEST_INVALID` ao rodar
  vários artigos e o sucesso ao rodar um pequeno. O limite não foi aumentado.
- **Projeção estratégica:** `lib/arquiteto/ai-strategic-payload.ts` projeta
  keyword, SERP e Silo para o que decide arquitetura — entidade, intenção,
  funil, modificadores, público, volume, resultados, KGR e aplicabilidade, CPC,
  KD, tendência, competição Ads, política da principal e status upstream; e, na
  SERP, veredito, competição, tipos dominantes, recomendações e observações. O
  mesmo fixture caiu para 11 679 caracteres (−97,2%). A UI somente leitura da
  KeywordDNA continua lossless: a redução é do payload, não da leitura humana.
- **Guard determinístico:** `measureStrategicPayload` mede o contexto antes da
  chamada. Exceder o limite vira erro daquele Article, com bytes e maiores
  contribuintes na mensagem, e a fila segue para o próximo artigo.
- **Isolamento:** falha de um artigo não cancela os demais. O lote reporta
  `IA · Parcial N/M artigo(s)` e lista, por artigo, o motivo real; as propostas
  válidas dos outros permanecem.
- **Contador:** bancada e aba do artigo passaram a contar propostas materiais
  pelo mesmo classificador (`materialKeywordArticleDecisions`). Uma decisão
  bruta que apenas confirma o estado atual não aparece mais como
  "1 proposta gerada" enquanto o artigo mostra zero.
- **Durabilidade:** não existe storage canônico para a revisão da IA. A cópia de
  trabalho canônica (`AssignmentSchema`, `.strict()`) não tem campo para
  execução, proposta ou NO_OP; a única continuidade é a recuperação local do
  navegador, que preserva a anotação já aplicada e não é canônica. Nada foi
  criado para simular durabilidade: o pedido estrutural está em
  `propostas/2026-08-29-pedido-estrutural-persistencia-revisao-ia.md` com
  `STRUCTURAL_AI_REVIEW_PERSISTENCE_REQUIRED = YES`.
- **Validação local:** 15/15 testes novos e `test:arquiteto` 295/296 — a única
  falha é a asserção estática preexistente do Minerador. TypeScript mantém os
  cinco erros preexistentes fora deste lote; `git diff --check` passou. Sem
  provider real, sem chamada paga, sem validação em Chrome.

## Ajuste pontual — resumo de intenção, funil e KGR — 2026-08-27

- O resumo e os cards do painel expandido agora projetam a intenção e o funil canônicos da KeywordDNA Principal. Uma secundária ou reforço divergente não substitui esses fatos.
- A divergência de intenção e/ou funil aparece em `Compatibilidade` como conflito por keyword de apoio; a mudança é somente de leitura e não altera Lógica, SERP, IA, consolidação ou persistência.
- O resumo exibe KGR apenas como `Sim`/`Não` quando a aplicabilidade humana upstream está definida; ausência permanece `—`. O valor decimal é preservado no perfil completo da KeywordDNA.
- Validação local: 4/4 testes focados e guard visual PASS. `test:arquiteto` ficou 182/183 por asserção estática preexistente do Minerador; TypeScript mantém quatro erros preexistentes fora deste ajuste. Chrome, provider real, persistência remota e readback remoto não foram executados.

## Bug pontual — tabs internas do painel expandido — 2026-08-27

- **Causa raiz:** `MemoizedArticleRow` ignorava a tab ativa no comparador. O clique atualizava `expandedProcessTabs`, mas a row memorizada bloqueava a renderização antes de `MemoizedArticleSubtree` receber o novo `processTab`.
- **Correção:** a tab ativa passou a ser prop e dependência explícita de `MemoizedArticleRow`; o handler local usa `selectArticlePanelProcessTab`, que apenas atualiza o estado visual por `articleId`.
- **Limites preservados:** sem provider, processo editorial, mutação de working copy, alteração de read-model, SERP, IA ou Revisão.
- **Prova:** reprodução no Chrome mostrou botão no topo da pilha com `pointer-events: auto`, mas conteúdo/`aria-selected` congelados; após o ajuste e recarga do bundle, Lógica → SERP → IA → Revisão → Lógica trocou tab ativa e conteúdo. O contexto transitório original de processos não foi reidratado após a recarga, portanto a validação manual completa com aqueles artefatos permanece pendente.
- **Validação local:** 15/15 testes focados passaram. TypeScript mantém quatro erros preexistentes fora do Arquiteto; `git diff --check` passou.
## Exclusao selecionada pelo lifecycle canonico - 2026-08-28

- A acao Excluir voltou ao rodape da planilha somente quando ha artigos selecionados no modo Artigos. Ela resolve apenas Principal e secundarias desses artigos, sem selecionar clusters, artigos ou Keywords de fora.
- A pre-visualizacao e a execucao reutilizam os endpoints existentes do Minerador: `POST /api/minerador/marcas/{brandId}/keywords/delete/preview` e `POST /api/minerador/marcas/{brandId}/keywords/delete`. Nenhum endpoint, RPC, schema, migration ou RLS foi criado pelo Arquiteto.
- O dialogo compartilhado `DeleteConfirmation` trata KeywordDNAs nao publicadas; `PublishedDeleteConfirmation` trata selecao publicada ou mista pelo fluxo recuperavel de 24 horas. Versoes, eventos, publicacao, URL, canonical e proveniencia continuam sob o lifecycle canonico.
- A grade somente remove a projecao apos resposta transacional completa e `loadCanonicalArquitetoWorkspace` confirmar que nenhum ID da selecao continua ativo. Falha de preview, transacao parcial ou readback preserva a working copy e a selecao.
- Prova local: 7/7 testes novos de selecao, preview, mistura publicada, falhas, resultado completo, readback e entrypoint; mais 6/6 testes existentes do lifecycle do Minerador. Nao houve chamada remota destrutiva, provider, limpeza de browser storage ou validacao manual em Chrome.
- TypeScript nao reportou erro no adaptador novo. O comando segue bloqueado por erros preexistentes em `components/editorial/dna-panels.tsx`, `lib/minerador/keyword-qualification.ts` e tres fixtures TS1501. O lint e o guard visual tambem reportam divida preexistente ampla em `arquiteto-workspace.tsx`; este lote reutiliza tokens e os dialogs compartilhados, sem novo componente visual.

## Identidade estrutural da revisão IA: Silo fora da base — 2026-09-02

- **Regra permanente:** atribuir ou alterar o Silo de um Article **não** invalida a
  revisão arquitetural por IA. Silo pertence à etapa posterior — Artigos vêm antes
  de Silos — e não integra a identidade estrutural revisada.
- **`baseArticleContentHash` inclui:** identidade do Article, `principalKeywordId`,
  o conjunto de keywords e o papel arquitetural canônico de cada uma. Quando existe
  ArticleDNA consolidado, a base é o `contentHash` dele.
- **`baseArticleContentHash` NÃO inclui:** `siloId`, SiloDNA, SiloPage,
  InternalLinkGraph, `reviewRole` transitório, estado visual, seleção de UI,
  timestamps ou evidência contextual. A referência da SERP continua registrada como
  proveniência em `serpAssessmentId/Version/ContentHash`, fora do hash da base.
- **Papéis:** `principalKeywordId` é a única autoridade da Principal —
  `canonicalArticleKeywordRole` impede duas Principais no hash. A distinção
  Secundária × Reforço narrativo é estrutural e continua alterando o hash.
- **STALE:** estrutura realmente diferente mantém a revisão como histórico
  explícito (`IA · Desatualizada`), nunca como `NOT_RUN`. STALE não bloqueia a
  aprovação do Article, não aplica proposta antiga e tem pendência ativa zero;
  a reexecução é sempre explícita.
- **Histórico:** revisões gravadas com a fórmula anterior permanecem imutáveis.
  Elas aparecem como desatualizadas até o usuário reexecutar a IA; nenhum hash,
  payload ou versão foi reescrito, e não houve migration de conteúdo.
- **Validação local:** 18/18 testes de base/STALE, incluindo a regressão real de
  `group-ogg12k` e o caso de pipeline Artigos → Silos. `test:arquiteto` 355/356,
  com a única falha sendo a asserção estática preexistente do Minerador.

## Revisão Humana operacional: edição estrutural da working copy — 2026-09-02

- **Regra permanente:** a Revisão Humana é a superfície canônica para decisões
  estruturais manuais da working copy do Article. Lógica forma a hipótese, SERP
  observa, IA propõe — o humano decide e altera.
- **Ações disponíveis por keyword, na aba Revisão:** definir como Principal,
  alternar Secundária × Reforço narrativo, mover para outro artigo, retirar do
  artigo (volta para Keywords não agrupadas) e criar um artigo novo. Ações de
  maior impacto pedem confirmação curta com antes, depois e impacto.
- **Invariante:** `WORKING_ARTICLE_EFFECTIVE_PRINCIPAL_COUNT = 1`. Mover ou
  retirar a Principal exige eleger a nova Principal da origem na mesma operação;
  nenhum caminho humano deixa duas Principais nem artigo sem Principal.
- **KeywordDNA continua somente leitura:** as operações mexem apenas em
  pertencimento, papel e composição. Nenhum fato upstream — keyword, volume,
  resultados, CPC, KD, intenção, funil, KGR, qualificação semântica ou
  apresentação contextual — é alterado.
- **Mudanças estruturais invalidam a atualidade de SERP e IA sem apagar
  histórico:** trocar a Principal, mover keyword ou alterar Secundária × Reforço
  muda a base revisada, então a revisão IA anterior fica `STALE` e o assessment
  SERP anterior deixa de governar a formação atual. Nada é reexecutado
  automaticamente; a mensagem pede atualização explícita.
- **Silo não pertence a esta edição.** A aba Revisão não cria SiloDNA, SiloPage,
  Pilar, Suporte nem InternalLinkGraph, e atribuir Silo continua sem desatualizar
  a revisão IA.
- **Publicado protegido:** artigo publicado não aceita troca de Principal, troca
  de papel, movimentação, retirada nem separação de keyword pela Revisão.
- **Persistência:** toda ação passa por `persistWorkingCopyAssignments` →
  `persistArchitectWorkingCopy`, o mesmo contrato canônico já usado pelas demais
  mutações da working copy. Nenhuma tabela, migration ou `localStorage` novo.
- **Read-model único:** cada ação atualiza `masterList` e `provisionalGroups`, de
  onde planilha, painel expandido, abas e mapa derivam. Não existe estado manual
  paralelo dentro da aba.
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE. **Smoke manual do usuário:
  PENDENTE** — não considerar homologado antes disso.

## Fiação da Revisão Humana: controles operacionais de fato — 2026-09-02

- **Correção:** o primeiro smoke manual mostrou os controles como enfeite —
  escolher o destino em "Mover para outro artigo" não abria confirmação e nada
  acontecia. Causa: o painel expandido é renderizado dentro de
  `MemoizedArticleSubtree`, memoizado por `articleTableRenderRevision`, e o
  estado da confirmação não fazia parte dessa revisão. O `onChange` disparava e
  o estado mudava, mas o subtree nunca re-renderizava.
- **Fiação extraída:** `lib/arquiteto/manual-architecture-interaction.ts` contém
  intenção (`requestManualArchitecture`), execução (`resolveManualArchitecture`)
  e confirmação da gravação (`commitManualArchitecture`). O componente só liga
  os controles a essas funções — a etapa que quebrou passou a ser exercitável
  sem navegador.
- **Regra:** destino cheio, artigo publicado e Principal sem sucessora são
  recusados **antes** da confirmação, com motivo. Sucesso só é anunciado depois
  de `persistWorkingCopyAssignments` confirmar; falha de gravação mantém a
  confirmação aberta e não mente sobre persistência.
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE (12 testes de fiação com estado
  real e persistência injetada, além dos 20 de domínio). **Smoke manual do
  usuário: PENDENTE.** A camada DOM em si não tem teste automatizado — o
  repositório não tem renderer de componentes — então o clique real continua
  sendo a única prova de ponta a ponta.

## Cenários arquiteturais — Fase 1: contrato, invariantes e diff — 2026-09-02

- **Entregue:** `lib/arquiteto/architecture-scenario.ts` — contrato comum
  `ArchitectureScenario` para os cinco cenários (base, logic, serp, ai, human,
  current), validador estruturado, normalizador determinístico e diff derivado.
  Domínio puro: sem storage, sem artifact, sem UI, sem provider.
- **Um contrato só.** Não existem `LogicScenarioModel`/`SerpScenarioModel`
  independentes: Lógica, SERP, IA, Humano e Atual usam a mesma forma, o mesmo
  validador e o mesmo diff.
- **Universo declarado:** todo cenário carrega `universe { keywordIds[], contentHash }`
  com IDs ordenados e sem duplicata. Cenários de universos diferentes não são
  comparáveis — o diff devolve `comparable: false` e o validador reporta
  `UNIVERSE_HASH_MISMATCH`. Impede comparar silenciosamente 10 keywords com 12.
- **Capability:** `complete` particiona todo o universo; `partial` representa só o
  que a fonte histórica reconstrói. Lacuna continua lacuna explícita — nada é
  preenchido por inferência.
- **Identidade do Article:** `articleRef` estável, na mesma política de
  `articleKeyOf` (`provisionalGroupId || clusterId || id`). Nunca label, slug
  provisório ou índice visual.
- **Proveniência múltipla:** `sourceRefs` é lista — um cenário SERP futuro será
  sustentado por vários assessments.
- **Política Principal × papel:** a troca de Principal gera um único
  `PRINCIPAL_CHANGED`; as duas keywords envolvidas não geram `ROLE_CHANGED`, para
  não duplicar o mesmo fato na contagem.
- **Split/merge por membership, não por contagem de Articles:** exigem 2+ keywords
  materiais em cada lado. Uma keyword que muda de Article é `KEYWORD_MOVED`.
- **Limites desta fase:** `NEW_CURRENT_ARTIFACT = PROIBIDO`,
  `SERP_ARTIFACT_CREATED = NO`, `AI_ENUM_CHANGED = NO`. `scenarioType: "current"`
  existe no read-model, sem storage. Um teste trava esses limites.
- **Validação local:** 20/20 testes novos; `test:arquiteto` 412/413, com a única
  falha sendo a asserção estática preexistente do Minerador.
- **Não entregue:** materialização de qualquer cenário, mapa, trilho, ganhos/perdas,
  adoção de candidato e confirmação de Atual. Fases 2 a 6.

## Auditoria Silo-first — Fase 0, sem implementação — 2026-09-02

- **Natureza da entrega:** `ARCHITECTURE_AUDITED` + `SDD_READY_FOR_APPROVAL`.
  Nenhum arquivo de produto foi alterado; nenhuma migration, SQL, DDL, operação
  remota ou chamada paga foi executada.
- **Fluxo atual verificado no código (Article-first):**
  `buildDeterministicArticleArchitecture` (`engine.ts:441`) recebe todas as
  keywords da Brand, reserva candidatas a Silo e agrupa o resto em Articles;
  `formSiloWorkingCopies` (`silo-formation.ts:279`) só depois recebe
  `articleVersions`. `normalizeArticleWorkingCopyKeyword` (`article-phase.ts:31`)
  zera `siloId`/`siloName`/`hierarquia` de toda keyword não publicada.
  `resolveArticleSiloReadiness` (`article-phase.ts:162`) devolve `not_started`
  enquanto não houver ArticleDNA. `articleApprovalIssues`
  (`operational-flow.ts:104`) documenta a dependência circular que Silo-first
  resolve na origem.
- **Working copy do Arquiteto:** linhas de `editorial_workflow_items`
  (`subject_type='keyword'`, `stage='architect'`, `state='received'`), payload com
  a atribuição e `lock_version` por item. A tabela `editorial_architect_work_copy`
  citada na SDD anterior **não existe**.
- **Working copy de Silos:** não persistida — `useState<SiloWorkingCopy[]>`
  (`arquiteto-workspace.tsx:510`). Não sobrevive ao F5 e não está em
  `architect-recovery.ts`. A proposta de IA de Silos (`/api/arquiteto/silo-review`)
  também não é persistida.
- **Identidade do Silo:** `siloId = minerador_keyword_lists.id`
  (`app/api/arquiteto/silos/route.ts`). Criar Silo manual hoje grava linha no
  Minerador + SiloDNA draft + SiloPage draft + entrada em `marcas.silos_existentes`.
- **Cenários:** `lib/arquiteto/architecture-scenario.ts` (Fase 1 da SDD anterior)
  está implementado e é Article-only. A SDD Silo-first o estende de forma aditiva
  com `level: "silo" | "article"`, sem alterar teste existente.
- **Persistência disponível sem DDL:** `editorial_workflow_items.subject_type` é
  texto livre (`CHECK char_length BETWEEN 1 AND 80`), `stage='architect'` já é
  aceito, RLS deriva de `editorial_stage_module(stage)`, `lock_version` já tem
  trigger e existe `UNIQUE (marca_id, subject_type, subject_id, stage)`.
  `editorial_artifact_versions.artifact_type` continua sendo o único ponto com
  CHECK — DDL só na Fase 6.
- **Baseline medida nesta auditoria:** `test:arquiteto` 413 testes, 412 pass,
  1 falha pré-existente (asserção estática do Minerador em
  `arquiteto-domain.test.mts:307`). TypeScript: 5 erros pré-existentes, nenhum no
  Arquiteto. ESLint em `lib/arquiteto` + `app/api/arquiteto`: limpo; 96 problemas
  pré-existentes concentrados em `modules/arquiteto/arquiteto-workspace.tsx`.
  `git diff --check`: 0 problemas reais.
- **Documento:** `propostas/2026-09-02-sdd-arquitetura-silo-first.md`.
  `SDD_STATUS = PROPOSED_AWAITING_APPROVAL`. A implementação da Fase 1 depende de
  aprovação explícita do usuário e das quatro decisões devolvidas ao Planner
  Geral (C1–C4).

## Silo-first — SDD revisão 2, ainda sem implementação — 2026-09-02

- **Natureza da entrega:** documentação. `PRODUCT_IMPLEMENTATION = NOT_STARTED`.
  Nenhum arquivo de produto alterado; `DDL = 0`, `MIGRATION = 0`,
  `REMOTE_MUTATIONS = 0`, `PAID_PROVIDER_CALLS = 0`.
- **Decisões do Planner incorporadas:** C1 `EXTEND_ADDITIVELY` do
  `ArchitectureScenario` já em `main`; C2 `LEGACY_CREATION_PATH` congelado para
  `POST /api/arquiteto/silos`; C3 `relatedKeywordCount >= 2` rebaixado a
  `LEGACY_SIGNAL`; C4 separação definitiva `territoryRef` × `siloId` × `lista_id`.
- **Fonte canônica da membership:** o item de workflow da **keyword**
  (`territoryRef` + `territoryAssignment`). `territory.keywordRefs` não é
  persistido — projeção derivada na leitura. Motivo verificado no código: o
  `PATCH /api/arquiteto/workspace` percorre o lote em laço, sem transação; com a
  fonte no lado da keyword, uma falha parcial mantém cada keyword em exatamente
  um lugar e nunca viola a partição, nem transitoriamente.
- **Identidade territorial:** `territoryRef = "territory:" + uuid`, opaco, gerado
  no servidor, estável a renome/fronteira/slug/moves. Split preserva a ref da
  origem e cria refs novas para as partes; merge preserva a ref do sobrevivente e
  marca os absorvidos `superseded`; rejeitado preserva ref e histórico. Na
  consolidação a ref é **referenciada**, nunca reaproveitada como `siloId`.
- **Consolidação de território novo:** cunha `siloId` canônico próprio, **sem**
  criar linha em `minerador_keyword_lists`. Verificado que
  `editorial_artifact_versions.entity_id` é `text` sem FK e que
  `canonicalSiloOptions` monta o seletor somente a partir de SiloDNA/SiloPage
  versionados — um Silo novo sem lista aparece corretamente.
- **`silo_architecture_scenario`:** retirado da proposta. Volta a hipótese, a ser
  provada apenas na fase da SERP territorial.
- **Documento:** `propostas/2026-09-02-sdd-arquitetura-silo-first.md`,
  `SDD_REVISION = 2`, `SDD_READY_FOR_FINAL_APPROVAL = YES`,
  `SDD_APPROVED = NO`. A SDD anterior ficou marcada como
  `SUPERSEDE_ON_NEW_SDD_APPROVAL`, com Fase 1 `PRESERVE_AND_EXTEND` e Fases 2–6
  canceladas na aprovação.
- **Baseline reconfirmada após a edição documental:** `test:arquiteto` 413 testes,
  412 pass, 1 falha pré-existente (`arquiteto-domain.test.mts:307`).
  `git diff --check` sem problemas reais.

## Silo-first — Fase 1: fundação de contratos de território e cenário — 2026-09-02

```
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED
SILO_FIRST_ARCHITECTURE        = NOT_COMPLETE  (Fases 2 a 13 pendentes)
```

- **Entregue:** `lib/arquiteto/territory.ts` — contrato, lifecycle, identidade,
  linhagem, semântica de membership, consistência e readiness do território; e a
  extensão aditiva de `lib/arquiteto/architecture-scenario.ts` com o
  discriminador `level`. Domínio puro: sem persistência, sem API, sem UI, sem
  React Flow, sem provider, sem DDL, sem SQL.
- **`level` obrigatório (C1):** `ArchitectureScenarioSchema` virou união
  discriminada `article | silo`. `safeParseArchitectureScenario` recusa payload
  sem nível com `LEVEL_REQUIRED`; `deriveArchitectureScenarioDiff` recusa níveis
  diferentes com `incomparableReason: "LEVEL_MISMATCH"` e devolve zero entradas.
  O default de nível existe em **um único lugar**, a borda
  `parseArchitectureScenarioWithLegacyLevel`, e um teste trava essa contagem em 1.
- **Payloads semanticamente distintos:** o cenário de Silo usa
  `territories[] + unassignedKeywords[]`; nunca `articles[] + ungroupedKeywordIds[]`.
  Validador, normalizador e diff atendem os dois níveis com códigos próprios
  (`DUPLICATE_TERRITORY_KEY`, `TERRITORY_CREATED/REMOVED/SPLIT/MERGED`,
  `KEYWORD_TERRITORY_MOVED/ASSIGNED/UNASSIGNED`, `BOUNDARY_CHANGED`,
  `SLUG_PROPOSAL_CHANGED`).
- **Identidade (C4):** `territoryRef = "territory:<uuid>"`, opaco.
  `territoryIdentityIssues` recusa `territoryRef` derivado de `siloId` ou de
  `lista_id`. Nenhum ponto do módulo cita `minerador_keyword_lists`,
  `createCanonicalManualSilo`, persistência ou provider — há teste travando isso.
- **Membership:** fonte única no item da keyword
  (`KeywordTerritoryAssignment`); `projectTerritoryMembership` é projeção
  derivada. `TerritoryCandidate` **não** guarda `keywordRefs`.
- **E1 — operação parcial:** `pendingOperation: MembershipOperation | null` no
  payload do território, `status` derivado (`applied | in_progress | partial`).
  `partial` emite `PARTIAL_MEMBERSHIP_OPERATION`, bloqueia
  `resolveTerritoryConfirmationReadiness` e bloqueia
  `resolveArticleFormationReadiness`. Nenhuma keyword é corrigida
  automaticamente; nenhuma tabela nova.
- **E2 — split:** `planTerritorySplit` exige `continuingPartId` declarado. Sem
  ele, recusa `SPLIT_CONTINUATION_NOT_DECLARED` — posição, tamanho, volume, SERP
  e IA não escolhem. A origem mantém a ref e registra
  `lineage.splitIntoTerritoryRefs`; cada parte criada registra
  `lineage.splitFromTerritoryRef`. Também recusa `SPLIT_KEYWORD_LOST` e
  `SPLIT_DUPLICATE_KEYWORD`.
- **E3 — merge:** `planTerritoryMerge` exige `survivingTerritoryRef` declarado.
  Sem ele, recusa `MERGE_SURVIVOR_NOT_DECLARED`. Absorvidos recebem
  `supersededByTerritoryRef`; o sobrevivente registra `absorbedTerritoryRefs`.
  Duas âncoras `existingSiloRef` distintas → `MERGE_OF_TWO_EXISTING_ANCHORS`.
  Absorver um território publicado → `PUBLISHED_PROTECTION_VIOLATION`.
- **`EMPTY_TERRITORY` decidido, não generalizado:** diagnóstico em `candidate`
  para qualquer origem — um `MANUAL_STRATEGIC` pode ser declarado antes de
  reservar keywords e um split esvazia um lado por um instante — e **bloqueador
  na porta `candidate → confirmed`**, porque confirmar é o que libera a formação
  de Article.
- **Gate de Article:** `resolveArticleFormationReadiness` só libera com
  `lifecycleStatus='confirmed'`, `decisionState='confirmed'`, sem bloqueadores e
  com keywords que pertencem ao território. `consolidated` recusa com
  `SUCCESSOR_REQUIRED`; `candidate`, `rejected` e `superseded` recusam com
  `TERRITORY_NOT_CONFIRMED`; keyword de fora recusa com
  `KEYWORD_OUTSIDE_TERRITORY`.
- **Validação local:** 46 testes nos dois arquivos da frente (26 novos em
  `tests/arquiteto-territory.test.mts` + 20 preservados). `test:arquiteto` passou
  de 413 para 439 testes, 438 pass, com a única falha sendo a asserção estática
  pré-existente do Minerador. TypeScript: 5 erros, exatamente os mesmos de antes
  do lote — zero erro novo. ESLint em `lib/arquiteto/territory.ts` e
  `lib/arquiteto/architecture-scenario.ts`: limpo. `git diff --check`: limpo.
- **Alteração em teste existente, declarada:** o fixture de
  `tests/arquiteto-architecture-scenario.test.mts` ganhou `level: "article"` e
  passou a ser tipado como `ArticleArchitectureScenario`. Nenhuma asserção foi
  alterada, removida ou enfraquecida; os 20 testes continuam passando.
- **Não entregue (fora do escopo da Fase 1):** persistência do território,
  APIs, UI, React Flow, Lógica territorial, SERP, IA, consolidação
  SiloDNA/SiloPage, formação de Article escopada, migration e SQL.
- **Smoke manual do usuário:** não se aplica — a Fase 1 não tem superfície de
  interface.

## Silo-first — Fase 1 estendida (Etapa 0) e BLOQUEIO da Fase 2 — 2026-09-02

```
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED
TERRITORIAL_BASE_CONTRACT      = IMPLEMENTED
TERRITORIAL_BASE_READ_MODEL    = BLOCKED  (ver bloqueio abaixo)
MARCA_SITE_INTEGRATION         = BLOCKED  (não há fonte canônica reutilizável)
SILO_FIRST_ARCHITECTURE        = NOT_COMPLETE
```

- **Entregue nesta rodada:** `lib/arquiteto/territorial-base.ts` (Base
  Territorial, `PublishedStructureEvidence`, estados de reconciliação,
  divergência site × banco, promoção humana, afinidade territorial, resíduo e
  ordem operacional dos processos) e a extensão de `lib/arquiteto/territory.ts`
  com `narrative` e `discovery`. Domínio puro.
- **Evidência nunca vira território:** `planTerritoryPromotion` recusa sem
  decisão humana declarada (`PROMOTION_REQUIRES_HUMAN_DECISION`), recusa entrada
  ignorada, já promovida ou de outra Brand. `classifyUrlStructuralHint` devolve
  apenas pista (`editorial_candidate | technical | unknown`) e não decide nada.
- **Autoridade de publicação:** `PublicationRecord`/estado editorial é autoridade
  interna; sitemap é inventário externo. Divergências viram
  `PUBLISHED_UNRESOLVED`, `DATABASE_ONLY` e `CANONICAL_CONFLICT` — nenhuma
  correção automática.
- **`SERP_CAN_CREATE_KEYWORDDNA = NO`** provado por
  `suggestionUsableAsKeywordId`, que só devolve id depois do retorno do Minerador.
- **`NEW_TERRITORY = EXCEPTION_REQUIRING_JUSTIFICATION`:**
  `resolveTerritorialResidue` só considera `no_match`, `ambiguous` e
  `conflicting`; universo inteiramente absorvido não pede território novo.
- **Validação:** `test:arquiteto` 453 testes, 452 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript: 5 erros, os mesmos de antes.
  Lint dos três módulos: limpo. `git diff --check`: limpo.

### BLOQUEIO da Fase 2 — auditoria da aba Site da Marca

Regra de parada §41 acionada. Fatos verificados no código:

- **`BRAND_SITE_UI_FILE`** = `modules/marca/site-sitemap-panel.tsx` (61 KB).
- **`BRAND_SITE_CONTRACT`** = `lib/marca/site-contracts.ts` —
  `BrandSiteWorkspaceSchema` com sitemaps, syncRuns, catalog, verifications,
  candidates, importBatches e events.
- **`BRAND_SITE_STORAGE`** = `lib/marca/site-store.ts` → **browser artifact
  store** (IndexedDB/localStorage), chave
  `minerador-pro:site-workspace:${actorUserId}:${brandId}`, com
  `persistenceMode` gravado sempre como `"local_fallback"`.
- **`BRAND_SITEMAP_STORAGE`** = o mesmo workspace de navegador. Não há tabela
  remota em uso.
- **`BRAND_SITE_READ_PATH`** = `loadBrandSiteWorkspace(actorUserId, brandId)` —
  leitura do navegador do próprio ator, indisponível no servidor.
- **`BRAND_SITE_SYNC_PATH`** = `POST /api/marca/site/sitemap/sync` →
  `crawlAuthorizedSitemap()` — **stateless**: baixa o sitemap ao vivo, devolve as
  URLs e **não persiste nada**.
- **`BRAND_SITE_EXISTING_REPOSITORY`** = **não existe**. `grep` por `brand_site_`
  em `lib/`, `app/`, `modules/` e `components/` retorna zero ocorrências.
- **`BRAND_SITE_EXISTING_API`** = `sitemap/test`, `sitemap/sync`, `page/verify`,
  `lists`, `import/keywords`, `import/keywords/preview` — todas sem persistência
  do catálogo.
- **`supabase/migrations/0004_brand_site_catalog.sql`** declara
  `brand_site_sitemaps`, `brand_site_catalog_entries`, `brand_site_sync_runs`,
  `brand_site_page_verifications`, `brand_site_keyword_candidates`,
  `brand_site_import_batches`, `brand_site_import_items` e `brand_site_events`,
  mas o cabeçalho diz **"PROPOSTA PARA APLICAÇÃO MANUAL. NÃO APLICADA PELO
  CODEX"** e o corpo referencia `listas_kgr`, renomeada pela 0036 para
  `minerador_keyword_lists` — não aplicaria como está.

**Conclusão:** a única fonte canônica remota do site é `marcas.site_url`. O
catálogo de URLs do sitemap só existe no navegador do usuário, por ator, o que
`AGENTS.md` §10 proíbe tratar como fonte canônica. Consumir sitemap no servidor
hoje exigiria nova coleta externa, vetada por `SITEMAP_EXTERNAL_FETCH_FROM_ARCHITECT = 0`.

Fase 2 **não foi iniciada** para a fonte site/sitemap. As demais fontes da Base
(SiloDNA, SiloPage, ArticleDNA, PublicationRecord, `marcas.silos_existentes`,
BrandDNA, workflow items) **são** canônicas e legíveis no servidor — o read-model
parcial é viável, mas depende de decisão do Planner Geral.

## Silo-first — Delta Etapa 0 concluído (SDD revisão 4) — 2026-09-02

```
PHASE_1_CORE          = PASS
PHASE_1_ETAPA_0_DELTA = PASS
PHASE_2               = NÃO INICIADA — regra de parada §30 acionada
```

- **Correção de defeito próprio:** a revisão 3 tinha um `reconciliationState` de
  oito valores que ainda misturava decisão (`confirmed_existing`), origem
  (`published_legacy`, `strategic_declared`) e lifecycle (`candidate`). A
  revisão 4 separa cinco eixos ortogonais — `observationState`, `decisionState`,
  `architecturalOrigin`, `ingestionOrigin`, `publicationState` — e os
  vocabulários de observação e decisão passaram a ter interseção vazia, travada
  por teste. Os quatro recortes da Base são derivados por `resolveBaseBucket`
  com precedência declarada e total, nunca lidos de um campo único.
- **Ausência continua ausência:** `PublishedStructureEvidenceSchema` recusa
  `site_only` com `publicationRef` e recusa `database_only` com `url` ou
  `sitemapRef`. O contrato impede fabricar o que não foi observado.
- **`StrategicDeclaration`:** contrato próprio, com `keywordDnaIds: []` como
  estado legítimo. Declaração estratégica entra na Base como `decisionState:
  "pending"` e `territoryRef: null` — não é território confirmado e não cria
  lista, SiloDNA, SiloPage, publicação, URL ou canonical.
- **Campos acrescentados à evidência:** `normalizedUrl`, `normalizedCanonical`,
  `observedAt` e `provenance { collectedBy, collectedAt, sourceRef }`. A
  deduplicação usa identidade normalizada, nunca substring.
- **Validação:** `test:arquiteto` 460 testes, 459 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript: 5 erros, os mesmos de antes do
  lote. Lint dos três módulos: limpo. `git diff --check`: limpo.
- **Rastreamento Git:** `lib/arquiteto/architecture-scenario.ts`,
  `lib/arquiteto/territory.ts`, `lib/arquiteto/territorial-base.ts` e os testes
  correspondentes estão **untracked** no repositório, apesar de já serem
  consumidos por `test:arquiteto`. Não são código consolidado até o usuário
  executar o Git.

## Silo-first — Fase 2A: working copy territorial e readiness — 2026-09-02

```
PHASE_2A = IMPLEMENTED (domínio + fiação de persistência)
UI = NÃO TOCADA · ArticleDNA/SiloDNA/SiloPage/graph = NÃO TOCADOS
NEW_DDL = 0 · NEW_MIGRATION = 0 · PROVIDER_CALLS = 0
```

- **Auditoria da membership atual:** os working items são linhas de
  `editorial_workflow_items` (`subject_type='keyword'`, `stage='architect'`,
  `state='received'`), lidas por `loadCanonicalArquitetoWorkspace` e gravadas por
  `PATCH /api/arquiteto/workspace` com `expectedLock`. O `AssignmentSchema`
  `.strict()` guardava `workingArticleId`, `clusterId`, `provisionalGroupId`,
  `siloId`/`silo_id`, `siloName`, `computedSlug`, `computedHierarquia`, `role`,
  `principalKeywordId`, `siloCandidate`, `articleKgrDecision`, `manualEdit` —
  e **nenhum** `territoryRef`. Membership paralela na UI: `masterList`,
  `provisionalGroups` e `siloWorkingCopies`, todas em React state.
- **Persistência classificada:** REMOTE + API_REAL (`editorial_workflow_items.payload`,
  jsonb, com lock por item). `architect-recovery.ts` é recuperação LOCAL e
  explicitamente não canônica. Como `payload` é jsonb, os dois campos novos são
  aditivos: **zero DDL, zero migration**.
- **Fonte canônica única:** `territoryRef` + `territoryAssignment` no payload da
  própria keyword. `TerritoryProjection.keywordRefs` é derivada em
  `deriveTerritorialWorkingView` e não existe no contrato persistido —
  há teste lendo `territory.ts` para garantir que não há como persistí-la.
- **Operações** em `lib/arquiteto/territory-working-copy.ts`: `planMembershipChange`
  (atribuir, desatribuir, mover, multi-keyword), `settleMembershipOperation`,
  `attachPendingOperation`, `deriveTerritorialWorkingView`,
  `resolveLegacyArticleReconciliation`, `listaIdIsNeverTerritory`. Split e merge
  seguem em `territory.ts`, com escolha humana obrigatória. Funções puras que
  devolvem PLANO; quem persiste é a rota canônica que já existia.
- **Gate de operação parcial:** um lote incompleto vira `MembershipOperation`
  `partial`, é anexado aos territórios participantes e bloqueia confirmação **e**
  formação de Article. A resposta declara `appliedKeywordIds` e
  `failedKeywordIds` — nenhuma autocorreção.
- **Readiness separada:** `resolveTerritoryConfirmationReadiness` passou a exigir
  também conteúdo — `TERRITORY_WITHOUT_CENTRAL_ENTITY`,
  `TERRITORY_WITHOUT_MACRO_INTENT`, `TERRITORY_WITHOUT_BOUNDARY` e
  `TERRITORY_NARRATIVE_UNRESOLVED`. Similaridade lexical não sustenta território:
  `continuity`/`brandAlignment` em `unknown` bloqueiam.
  `resolveArticleFormationReadiness` continua exigindo território `confirmed`.
- **`DEFERRED_EXTERNAL_EVIDENCE`:** a conferência contra o catálogo publicado da
  Marca ainda não existe em runtime. Territórios ancorados em Silo existente
  recebem o marcador de adiamento — que **não bloqueia** e **não é simulado**.
- **Legado preservado:** `lista_id` nunca vira território (guard + teste);
  ArticleDNA sem Silo vira `LEGACY_NEEDS_RECONCILIATION` sem inferir destino;
  âncoras publicadas continuam âncoras.
- **Ajuste declarado num teste da Fase 1:** "MANUAL_STRATEGIC com uma única
  keyword" usava narrativa vazia e passou a ser bloqueado pela readiness nova. A
  fixture ganhou narrativa resolvida — a intenção original (contagem não é
  autoridade) foi preservada, e o teste ganhou a asserção complementar de que o
  bloqueio vem da descrição ausente, não da quantidade.
- **Validação:** `test:arquiteto` 475 testes, 474 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 erros pré-existentes, 0 novos.
  Lint limpo nos três arquivos tocados. `git diff --check` limpo.
- **Hold externo:** `readBrandSiteSnapshot`, catálogo Site/Sitemap remoto e
  `publishedConfirmed` da Etapa 0 continuam fora. A A1 da Marca está APPLIED
  (materialização remota PASS); o que falta são A2, repositories, runtime real
  de sync e leitura remota — Fases 3 a 6 daquela frente.


## Fase 2A.1 — fechamento de persistência e autoridade territorial — 2026-09-02

- **Defeito próprio corrigido:** `territoryAssignment` era
  `KeywordTerritoryAssignmentSchema.omit({ keywordId, brandId })` e continuava
  carregando `territoryRef` dentro de si. Duas referências no mesmo payload,
  capazes de divergir, sem regra de desempate. O shape persistido agora é
  `KeywordTerritoryDecisionSchema` = `{ state, reason, source, decidedAt }`.
  `payload.territoryRef` é o único ponteiro de membership.
- **UNASSIGNED != UNADDRESSED aprovado e implementado** como projeção derivada:
  `resolveKeywordTerritoryState` lê o par (`territoryRef`, `territoryAssignment`)
  e devolve `assigned | explicit_unassigned | unaddressed | incoherent`.
  `projectKeywordTerritoryStates` recalcula os baldes a cada leitura — nenhum
  array é persistido. Estado incoerente é RECUSADO, nunca normalizado.
- **Autoridade remota do território — antes inexistente.** A auditoria provou que
  `subject_type = "territory"` não era lido nem escrito em lugar nenhum: a 2A
  tinha persistido a membership da keyword e deixado o objeto territorial sem
  dono. Resolvido sem DDL: um item de `editorial_workflow_items` por território,
  `subject_type='territory'`, `stage='architect'`, `subject_id=territoryRef`,
  `state` espelhando `lifecycleStatus`, `payload.territory` = TerritoryCandidate.
  A UNIQUE `(marca_id, subject_type, subject_id, stage)` que já existe passa a
  garantir um único registro por território por Brand.
- **Operação parcial:** vive em `payload.territory.pendingOperation`, no mesmo
  registro e sob o mesmo `lock_version`. Não é replicada nas keywords.
- **`territoryRef` passa a ser emitido pelo servidor.** Antes: `NOT_IMPLEMENTED`
  — `buildTerritoryRef` existia e nenhuma rota o chamava. Agora o store impõe
  `territoryRef` e `brandId` depois do draft, e a rota recusa um draft de criação
  que já traga `territoryRef`.
- **Retrocompatibilidade provada:** payload legado sem os dois campos parseia,
  resolve `unaddressed` e não é reescrito na leitura. `siloId`, `lista_id`,
  `clusterId` e `workingArticleId` não são convertidos em território.
- **Next.js:** `route.md` e `15-route-handlers.md` consultados. Route Handlers
  não são cacheados por padrão e `PATCH` nunca é cacheável; o `GET` já era
  dinâmico por ler `searchParams`. Nenhuma regressão de contrato.
- **Validação:** `test:arquiteto` 488 testes, 487 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 erros pré-existentes, 0 novos.
  Lint sem erros. `git diff --check` limpo. `NEW_DDL = 0`, `NEW_MIGRATION = 0`.

## Fase 2A.2 — gate de contrato do registro territorial remoto — 2026-09-02

- **`state` auditado:** o CHECK no banco é de COMPRIMENTO (1..80), não de
  vocabulário. `stage` é o único com enum fechado, e `architect` já está nele.
  A coluna já carrega vocabulários diferentes por tipo de sujeito: `radar`/
  `planner` guardam lifecycle de domínio (`imported`, `approved`, ...), e o
  item de keyword do Arquiteto guarda `received`. Espelhar `lifecycleStatus`
  segue o contrato estabelecido em vez de reinterpretá-lo.
  `CAN_STATE_DIRECTLY_MIRROR_TERRITORY_LIFECYCLE = YES`.
- **Consumers de `state` verificados um a um.** O único com vocabulário fechado
  é `allowed[item.state]` em `operational-flow.ts` (lookup indexado — chave
  ausente lançaria TypeError), e ele só recebe `RadarItem`, que nasce de
  `stage=radar`. Toda leitura da tabela é estreitada por stage ou
  subject_type; a única sem estreitamento é a `list()` de pipeline-repositories,
  que não tem chamador — e um teste impede que ganhe um.
- **`source_entity_id` CORRIGIDO.** A 2A.1 usava `existingSiloRef.siloId` com
  fallback para o ref. Duas descobertas derrubaram isso: (1) as RPCs de purga
  0046/0047 apagam itens de workflow por `source_entity_id = keyword.id::text`,
  e em 0047 esse DELETE NÃO filtra por `subject_type`; (2) `siloId` pode
  originar-se de `lista_id` (engine.ts), que é UUID cru — exatamente o formato
  que colide com aquele predicado. Agora é SEMPRE `territoryRef`, cujo prefixo
  torna a colisão estruturalmente impossível. NULL não era alternativa: a
  coluna é NOT NULL com CHECK de comprimento > 0.
- **Identidade duplicada sob invariante rígida:** `subject_id` e
  `payload.territory.territoryRef` guardam o mesmo valor. CREATE emite no
  servidor e grava nos dois; UPDATE toma a identidade da linha; READ recusa a
  divergência (`SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD`) em vez de escolher um lado.
  Mesma disciplina para `marca_id` × `payload.territory.brandId`
  (`CROSS_BRAND_RECORD`), sem fallback.
- **Classificação honesta:** `TERRITORY_REMOTE_CODE_PATH = IMPLEMENTED`,
  `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN_UNTIL_USER_SMOKE`. O round-trip por
  JSON prova serialização, não persistência: não exercita RLS, CHECK, UNIQUE,
  o gatilho de `lock_version` nem o readback real. Dois testes que se chamavam
  "sobrevive ao reload/readback" foram renomeados, e um teste impede que este
  arquivo passe a falar com o banco ou a se declarar smoke.
- **Validação:** `test:arquiteto` 495 testes, 494 pass, 1 falha pré-existente.
  TypeScript 5 pré-existentes, 0 novos. Lint sem erros. `NEW_DDL = 0`,
  `NEW_MIGRATION = 0`, zero mutação remota executada.

## Fase 2B — formação de Article dentro de território confirmado — 2026-09-02

### Auditoria do modelo de Article (antes de tocar em código)

- **Working copy:** `ProvisionalArticleGroup` no domínio + `payload.workingArticleId`
  no item de workflow da keyword — este é REMOTO e canônico, gravado pela rota
  `PATCH /api/arquiteto/workspace`. `provisionalGroups`/`siloWorkingCopies` em
  React state NÃO são autoridade.
- **ArticleDNA canônico:** `editorial_artifact_versions`, `artifact_type =
  'article_dna'` (já no CHECK), payload jsonb, versionado e imutável, via
  `lib/server/arquiteto-persistence.ts`. Persistência REMOTE + API_REAL.
- **Campos:** articleId · brandId · principalKeywordId · secondaryKeywordIds
  (max 5) · narrativeReinforcementIds · keywordReferences (min 1, max 6, com
  role principal/secundaria/reforco_narrativo) · siloId · hierarchy ·
  suggestedSlug · canonical · mainIntent · publishedIdentityRef ·
  architectureStatus · humanPendingDecisions · kgrIdentity.
- **Reaproveitado sem reescrever:** `inspectArticleFormation`,
  `assertArticleFormation`, `MAX_SECONDARY_KEYWORDS`, `enforceAssignedKeywordLimit`,
  `resolveArticleFormationReadiness` (já existia da 2A) e o envelope de cenário.

### territoryRef no Article — não era blocker

`ArticleDNASchema` é `.strict()` e não tinha onde guardar o território. Mas o
artefato mora em `payload` jsonb com `artifact_type` já permitido: acrescentar um
campo OPCIONAL é aditivo, sem DDL e sem migration — o mesmo padrão já aprovado
para a membership da keyword. Ausência do campo significa
LEGACY_NEEDS_RECONCILIATION, nunca "sem território por decisão".

Para evitar ciclo de import (`territory.ts` já importa `contracts.ts`), o
primitivo de identidade foi extraído para `lib/arquiteto/territory-ref.ts`.
`territory.ts` reexporta tudo — nenhum consumidor existente mudou.

### O que a fase entregou

- `planArticleFormationForTerritory` — separa proposals · preserved · conflicts ·
  unallocatedKeywords · issues. Não muta persistência.
- `resolveArticleConfirmationReadiness` — SEPARADA da formação. FORMATION
  responde "podemos propor?"; CONFIRMATION responde "está resolvido a ponto de
  consolidar?". 11 bloqueadores, incluindo definição incompleta e operação
  territorial parcial.
- `confirmArticleStructure` — só `actor: "human"` fecha. IA, Lógica e SERP são
  recusadas por contrato (`ONLY_HUMAN_MAY_APPROVE`), não por convenção.
- Teto de 6 é TETO: um Article de 1 keyword é confirmável; nada completa a lista.
- Cobertura garantida: toda keyword endereçada está alocada OU listada em
  `unallocatedKeywords` com motivo — e `NOT_ADDRESSED` continua distinto de
  `EXPLICITLY_UNASSIGNED` até o fim do plano.

- **Validação:** `test:arquiteto` 517 testes, 516 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 pré-existentes, 0 novos. Lint
  sem erros. `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`.
- **Territory remote smoke:** PENDING FUTURE INTEGRATION VALIDATION. Não bloqueou
  a 2B — o roteiro está em `smoke-territory-record-2a3.md`.

## Fase 2B.1 — fechamento de invariantes — 2026-09-02

### Correção do diff cross-level

O código já RETORNAVA `LEVEL_MISMATCH` antes de `UNIVERSE_HASH_MISMATCH` — a
precedência do resultado estava certa. O defeito era de ordem de AVALIAÇÃO:
`sameScenarioUniverse` era chamado antes do teste de nível, então um par
cross-level com universo ausente lançava exceção em vez de recusar por nível.
Agora o nível é decidido sem tocar no universo, e `universeMatch` no relatório
de uma recusa por nível é apenas informativo.

### Dois defeitos reais no teto de keywords

A auditoria do §5 encontrou o teto TOTAL correto (1 principal + 5 adicionais,
soma <= 6) mas a coerência de PAPÉIS quebrada:

- a mesma keyword em `secondaryKeywordIds` E `narrativeReinforcementIds` era
  ACEITA — o `Set` colapsava a duplicata e o teto era medido sobre o conjunto
  deduplicado, escondendo a incoerência;
- a principal repetida entre as secundárias também era ACEITA, porque o filtro
  `id !== principalKeywordId` a removia silenciosamente.

`ArticleDNASchema.superRefine` passou a exigir que os papéis não se repitam.

### territoryRef: leitura legada x consolidação nova

`ArticleDNASchema.territoryRef` continua OPCIONAL — obrigatoriedade global
quebraria a leitura de todo o histórico anterior à 2B. A exigência mora no gate
`planArticleDnaConsolidation`: todo ArticleDNA NOVO do fluxo Silo-first precisa
de território, brand compatível e todas as keywords dentro do mesmo território.
`NEW_SILO_FIRST_ARTICLE_WITHOUT_TERRITORY` é recusa explícita.

Território de versão consolidada é identidade: trocar exige
`TERRITORY_CHANGE_REQUIRES_SUCCESSOR`, nunca update in-place.

### Proteção unknown — defeito meu da 2B, corrigido

A 2B tratava "a principal não mudou" como decisão suficiente. Não é: descreve o
estado, não a decisão. `resolveUnknownProtectionState` resolve os quatro estados
do contrato — HUMAN_DECISION_REQUIRED, PROTECTION_CONFLICT, RESOLVED_PRESERVED e
STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR — e exige um registro humano explícito
(ator, momento, motivo), seguindo o precedente do KGR do artigo em vez de um
booleano paralelo.

### Working membership x composição consolidada

No momento da consolidação, `payload.workingArticleId` e a composição gravada
precisam coincidir nos DOIS sentidos: nada da composição fora da working copy, e
nada da working copy fora da composição. Depois disso o ArticleDNA não acompanha
alteração silenciosa do workingArticleId — mudança real vira sucessora.

### Validação

- `test:arquiteto` 532 testes, 531 pass, 1 falha pré-existente do Minerador.
- Suítes mais amplas rodadas por causa da mudança em `contracts.ts`:
  `test:editorial` 20/16/4 e `test:authz` 25/23/2 são IDÊNTICAS com o
  `contracts.ts` revertido para HEAD; `test:operational` 50/41/9 é IDÊNTICA com e
  sem a checagem de papéis. Todas pré-existentes. `test:redator` 3/3/0.
- TypeScript 5 pré-existentes, 0 novos. Lint sem erros. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`.

### Classificação honesta da persistência

`ARTICLE_REMOTE_PERSISTENCE_EXISTING_PATH = REAL` (editorial_artifact_versions).
`NEW_TERRITORY_REF_PERSISTENCE_PATH = IMPLEMENTED_BY_PAYLOAD_CONTRACT` — nenhum
Article territorial novo foi persistido remotamente ainda. Não é smoke validado.

## Fase 2C.2 — contratos e invariantes de consolidacao de Silo — 2026-09-02

### territoryRef nos contratos de Silo

`SiloDNASchema.territoryRef` e `SiloPageSchema.territoryRef` sao OPCIONAIS, pelo
mesmo motivo do ArticleDNA: todo Silo anterior a 2C nao tem territorio, e
obrigatoriedade no schema base quebraria a leitura do historico. A exigencia
vive no gate de NOVA consolidacao, que recusa territoryRef ausente e recusa
divergencia entre SiloDNA, SiloPage e Territory.

### Tres defeitos da auditoria 2C.0, corrigidos no dominio

O `SiloDNASchema.superRefine` aceita hoje — e continua aceitando, por
compatibilidade — Silo `formed` sem Pilar, `formed` com zero Articles e o mesmo
Article como Pilar e Suporte. `planTerritorialSiloComposition` recusa os tres na
consolidacao Silo-first, junto com Suporte duplicado, referencia incoerente,
Article de outro territorio e Article sem versao consolidada de ArticleDNA.

### Cobertura e exclusao explicita

Todo Article termina em EXATAMENTE um de `pillar`, `support` ou
`explicitly_excluded`. Article que nao aparece em nenhum dos tres e
`ARTICLE_COVERAGE_GAP`, nao silencio. A exclusao exige ator, momento e motivo.
`explicitly_excluded` NAO e papel de ArticleDNA — e decisao da consolidacao; um
teste varre contracts.ts e prova que o termo nao existe la.

### READY_FOR_SILO_CONSOLIDATION

`resolveSiloConsolidationReadiness` — separada de confirmacao de Territorio, de
formacao de Article, de confirmacao de Article e da aprovacao do Silo. 16
bloqueadores. Evidencia de estrutura publicada que depende da Etapa 0 da Marca
vira `DEFERRED_EXTERNAL_EVIDENCE`: adiada, nao falha e nao fabricada.

`confirmSiloConsolidation` so aceita `actor: human`, e exige que a decisao
descreva a MESMA arquitetura que sera consolidada — aprovar uma composicao e
gravar outra e o defeito que esse gate impede.

### SiloWorkingCopy — autoridade NONE

`SILO_WORKING_COPY_AUTHORITY = NONE`. `formSiloWorkingCopies` e
`chooseSiloWorkingCopyPillar` sao funcoes puras; nenhuma rota persiste o
resultado e `siloWorkingCopies` nao existe no codigo. Reload perde Pilar,
Suportes e exclusoes. React state NAO e canonico.

`editorial_workflow_items` comporta a persistencia aditivamente
(`subject_type=silo_working_copy`), sem DDL — contrato PROPOSTO, nao
implementado, conforme o gate.

### Validacao

- `test:arquiteto` 562 testes, 561 pass, 1 falha pre-existente do Minerador.
- `contracts.ts` mudou: rodadas as suites consumidoras. `test:editorial` 20/16/4,
  `test:operational` 50/41/9, `test:authz` 25/23/2, `test:redator` 3/3/0 —
  numeros IDENTICOS ao baseline da 2B.1. Nenhuma regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint sem erros nem avisos.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`, `RPC_INTEGRATED = NO`.

### Estado de validacao remota — nada declarado E2E

- 2C.1 materializacao remota: PASS (probe de assinatura/grants).
- 2C.1 behavioral smoke: PENDING.
- Territory remote smoke: PENDING.
- Article territorial remote smoke: PENDING.
- Marca Site/Sitemap: HOLD.

## Fase 2C.3 — working copy remota de Silo + Pilar automatico removido — 2026-09-02

### Autoridade

`SILO_WORKING_COPY_AUTHORITY = REMOTE`. Um item de `editorial_workflow_items`
por working copy: `subject_type=silo_working_copy`, `stage=architect`,
`subject_id=source_entity_id=silo-working-copy:<uuid>`, `article_id` nulo,
`state` espelhando `formationStatus`. Zero DDL, zero migration, zero indice novo.

Identidade propria porque `SiloWorkingCopy.id` nao serve: para copias novas e
`working-silo:<n>` derivado da POSICAO no laco de formacao, e para existentes e
o `siloId`, que pode ser UUID cru vindo de `lista_id`. O prefixo tambem protege
`source_entity_id` do predicado de purga da 0047.

React state passa a ser projecao. O GET do workspace devolve `siloWorkingCopies`
do remoto; recuperacao local segue sendo recuperacao e nao e lida pelo store.

### Pilar automatico

Dois caminhos escolhiam Pilar sozinhos:

- `silo-consolidation.ts:373` usava `selectedIds[0]` — Pilar por ordem do array,
  numa proposta de IA. CORRIGIDO: a copia nova nasce sem Pilar e sem Suportes.
- `silo-formation.ts` `buildCopy` usa `scores[0]?.articleId` — Pilar pelo maior
  `pillarScore`. NAO alterado: e a formacao legada em memoria, sem autoridade.

A imunidade e contratual: `pillarSuggestionArticleId` e sugestao,
`pillarSelection` e decisao humana com ator, momento, motivo e a composicao
sobre a qual se decidiu. A consolidacao le a selecao. Decisao de ator nao-humano
e decisao obsoleta sao recusadas.

### Pos-consolidacao

Territorio `consolidated` recusa escrita com `WORKING_COPY_ALREADY_CONSUMED`;
`rejected`/`superseded`/`archived` recusam com `TERRITORY_NOT_EDITABLE`. A copia
vira historico pre-consolidacao, imutavel.

### Validacao

- `test:arquiteto` 592 testes, 591 pass, 1 falha pre-existente do Minerador.
- Suites consumidoras: `test:editorial` 20/16/4, `test:operational` 50/41/9,
  `test:authz` 25/23/2, `test:redator` 3/3/0 — baseline identico as rodadas
  anteriores. Nenhuma regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- Next.js: `route.md` e `15-route-handlers.md` consultados antes de alterar a
  rota. PATCH nao e cacheavel; o GET ja era dinamico por ler searchParams.

### Estado de validacao remota

- 2C.1 materializacao remota: PASS · 2C.1 behavioral smoke: PENDING
- 2C.2 dominio: CLOSED_FOR_DEVELOPMENT
- Territory remote smoke: PENDING · Article territorial remote smoke: PENDING
- Marca Site/Sitemap: HOLD
- RPC 2C.1 NAO integrada: nenhum arquivo desta fase a referencia (teste prova).

## Fase 2C.3A — identidade derivada e idempotencia da working copy — 2026-09-02

- **Defeito da 2C.3 corrigido:** ref aleatorio nao dava idempotencia logica.
  Agora `workingCopyRef = silo-working-copy:<territoryRef>`, deterministico e
  server-side, para que duas criacoes do mesmo territorio colidam na UNIQUE
  `editorial_workflow_items_subject_stage_unique` que ja existe.
- **Limites auditados:** `subject_id` e `source_entity_id` sao `text` com CHECK
  apenas de `> 0`, sem maximo. O ref tem 64 caracteres. Nada truncado.
- **Quatro lugares de identidade** precisam concordar na leitura; divergencia da
  derivacao e `REF_NOT_DERIVED_FROM_TERRITORY`.
- **Create idempotente:** SELECT antes do INSERT, sem sobrescrever; corrida vira
  releitura e `idempotentReplay`. Somente SQLSTATE 23505 com o nome da constraint
  canonica vira replay — qualquer outro erro propaga.
- **Validacao:** `test:arquiteto` 604 testes, 603 pass, 1 falha pre-existente.
  12 testes novos de identidade e idempotencia (42 no arquivo). TypeScript 5
  pre-existentes, 0 novos. Lint limpo. `NEW_DDL = 0`, `NEW_MIGRATION = 0`.

## Fase 2C.4.2 — writers transacionais e proveniencia da working copy — 2026-09-02

### Proveniencia no SiloDNA

`workingCopyRef` + `workingCopyLockVersion`, aditivos e OPCIONAIS. Legado sem os
dois continua parseando; o par pela metade e RECUSADO por superRefine — meia
proveniencia nao diz de qual versao da working copy o Silo veio, descreve a
metade que sobrou. NAO foram para a SiloPage: ela ja referencia o SiloDNA por
`siloDnaRef`, e duplicar criaria dois lugares para divergir.

### Migration

`20260902150000_silo_working_copy_transactional_writers.sql` — DUAS funcoes,
`STORAGE_SCHEMA_DDL = 0`. As historicas `20260826225154` e `20260902140000` nao
foram tocadas.

- `persist_silo_working_copy_atomic` — writer canonico da WC, create e update.
  Trava o Territorio, prova editabilidade NA MESMA TRANSACAO, trava a WC.
  Create nunca vira update: mesmo estado material devolve replay sem escrever;
  estado diferente e `WORKING_COPY_ALREADY_EXISTS`.
- `persist_silo_from_working_copy_atomic` — ENTRYPOINT CANONICO. Trava
  Territorio, deriva o workingCopyRef, trava a WC, valida snapshot e
  proveniencia, e COMPOE a 2C.1 sem copiar seu corpo.

Ordem global de locks: Territory -> SiloWorkingCopy -> advisory -> artifacts.
Nenhum writer canonico pega a WC antes do Territorio.

A consolidacao NAO fencea a working copy: nao muda state, nao incrementa lock,
nao grava `consumed`. A protecao pos-consolidacao vem da RPC B, que trava o
Territorio, ve `consolidated` e recusa.

### Honestidade sobre o que foi provado

Sem Postgres neste ambiente, as regras foram implementadas TAMBEM como espelho
de dominio (`lib/arquiteto/silo-consolidation-provenance.ts`) e testadas
COMPORTAMENTALMENTE em TypeScript: stale working copy, mismatch de ref, mismatch
de lock, replay independente do expectedLock, create replay x conflito, ordem de
locks. As asserções sobre o arquivo SQL sao ESTATICAS e estao rotuladas como
tais no proprio teste: provam que o SQL foi escrito conforme o desenho, NAO que
o PostgreSQL se comporta assim. Isso depende de smoke, ainda pendente.

### Validacao

- `test:arquiteto` 622 testes, 621 pass, 1 falha pre-existente do Minerador.
- `contracts.ts` mudou: `test:editorial` 20/16/4, `test:operational` 50/41/9,
  `test:authz` 25/23/2, `test:redator` 3/3/0 — baseline identico. Zero regressao.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `REMOTE_MUTATIONS = 0`, `SQL_EXECUTED = 0`.

### O que ainda NAO esta resolvido no runtime

`OLD_DIRECT_WC_WRITER_STILL_PRESENT = YES`. `updateSiloWorkingCopy` e
`createSiloWorkingCopy` continuam escrevendo pelo store, em transacoes
separadas. As duas corridas seguem abertas no runtime ate a migracao completa
dos callers. `RUNTIME_RACES_FULLY_ELIMINATED = NO`.

## Fase 2C.4 funcional — callers migrados para as RPCs — 2026-09-02

### Writers canonicos

`createSiloWorkingCopy` e `updateSiloWorkingCopy` passam por
`persist_silo_working_copy_atomic`. O writer PostgREST antigo foi REMOVIDO, nao
desativado: `readTerritoryGuard`, `assertWritable`, `isCanonicalUniqueViolation`,
`findByRef` e o INSERT direto sairam do arquivo. O store nao tem mais nenhuma
escrita PostgREST — so leitura.

Consolidacao entra por `POST /api/arquiteto/silo-consolidation` →
`persist_silo_from_working_copy_atomic`. A 2C.1 e a primitiva do par nao sao
chamadas pelo caminho canonico (teste 25 prova nos dois arquivos).

### Pilar automatico removido

`silo-formation.ts` `buildCopy` nao elege mais Pilar: `scores[0]?.articleId`
virou `null`. A consequencia tambem foi corrigida — `supportArticleIds` nasce
VAZIO e nenhum `articleReferences` recebe papel estrutural. Antes, marcar todos
como `support` era a outra metade do mesmo defeito: presumia a estrutura porque
um deles tinha sido eleito automaticamente.

`pillarScores` continua produzindo candidatos ordenados e justificados — e o que
a heuristica tem direito de fazer. `siloWorkingCopyIssues` passou a dizer que a
pendencia e decisao humana.

### Erros preservados

14 codigos de dominio (`STALE_WORKING_COPY`, `WORKING_COPY_ALREADY_CONSUMED`,
`PROVENANCE_MISMATCH`, ...) sao extraidos da mensagem da RPC e mapeados
individualmente. Erro sem codigo propaga como falha real. Nada colapsa em
`PERSISTENCE_FAILED`.

### Estabilidade do envelope — risco tratado

`createVersionEnvelope` gera `versionId` e `createdAt` novos a cada invocacao.
Se o adapter fabricasse o envelope, um retry produziria outra identidade e o
replay idempotente nao reconheceria a operacao. Por isso o adapter e a rota
RECEBEM os envelopes prontos e os repassam sem reconstruir — provado por teste
nos dois arquivos. Repetir a operacao significa repetir o mesmo envelope.

### Validacao

- `test:arquiteto` 658 testes, 657 pass, 1 falha pre-existente do Minerador.
- 36 testes novos de migracao de callers; 5 testes da 2C.3/2C.3A reapontados
  para o caminho canonico novo (fixavam a implementacao que o gate mandou remover);
  5 testes de formacao/consolidacao ajustados porque fixavam o Pilar automatico.
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`, `REMOTE_MUTATIONS = 0`.
- Next.js: `route.md` e `15-route-handlers.md` consultados antes da rota nova.

### Estado de validacao remota

- 2C.4.2 materializacao remota: PASS · behavioral smoke: PENDING
- Territory remote smoke: PENDING · Article territorial remote smoke: PENDING
- Marca Site/Sitemap: HOLD
- LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY: RESOLVIDO

## Fase 2C.4.6 — binding semantico server-side + bypass manual fechado — 2026-09-02

### O buraco que o gate 2C.4.5 encontrou

O adapter validava APENAS proveniencia: `workingCopyRef` e `workingCopyLockVersion`.
Os dois sao legiveis pelo GET do workspace, entao qualquer chamador com esses
valores podia enviar OUTRO Pilar, outros Suportes ou artigos excluidos de volta
como Suporte, e a consolidacao acontecia. Readiness e decisao humana nao rodavam
no servidor.

### O que passou a existir

`lib/arquiteto/silo-dna-binding.ts` — dominio puro. DERIVA a expectativa da
decisao ja registrada e compara; nao recalcula arquitetura, nao usa IA, nao
escolhe Pilar e nao corrige o envelope recebido.

O adapter agora carrega, do REMOTO: o Territorio canonico com todos os guards, a
working copy INTEIRA parseada pelo contrato, e os ArticleDNA versionados pelas
referencias que a working copy registrou. Sobre esse snapshot roda
`resolveSiloConsolidationReadiness` e `confirmSiloConsolidation` — que existiam
desde a 2C.2 e nunca tinham sido ligados.

Ordem dos gates, toda ANTES da RPC A: territorio → working copy → versoes de
ArticleDNA → decisao de Pilar → readiness → confirmacao humana → binding do
SiloDNA → binding da SiloPage → escalonamento de status.

### O que e comparado, e o que NAO e

Comparado: brandId, territoryRef, workingCopyRef, workingCopyLockVersion, ancora
de Silo existente, Pilar, Suportes (por conjunto), cobertura completa,
referencias versionadas com hash, papeis, articleRoles.

NAO comparado: centralEntity, objective, boundary textual, dominantIntent. A
working copy nao decide esses campos; exigir igualdade neles seria inventar uma
autoridade que ela nao tem.

### Status

`SiloDNA approved` exige decisao humana de consolidacao confirmada.
`SiloPage approved` e FAIL-CLOSED: `siloPageApprovalIssues` existe em
`operational-flow.ts`, mas exige eventos de status de uma versao ja persistida —
nao serve como gate desta rota. `SILO_PAGE_APPROVAL_SERVER_GATE = MISSING`.

### Rotas manuais

`/api/arquiteto/silos` = LEGACY_MANUAL_STRATEGIC_DRAFT_PATH. So produz rascunho.

`/api/arquiteto/silo-pair` = LEGACY_DRAFT_ONLY. Aceitava `approved` e
materializava par final sem Territorio, working copy, Pilar humano nem
proveniencia. A recusa foi posta em DOIS lugares — no route handler e no proprio
helper `persistArquitetoSiloPair` — porque confiar so no guard da rota deixaria
um import futuro reabrir a porta lateral.

### Validacao

- `test:arquiteto` 688 testes, 687 pass, 1 falha pre-existente do Minerador.
- 30 testes novos de binding (comportamentais, no dominio) + 5 da rodada anterior
  reapontados: eles fixavam o adapter fraco.
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- Next.js: `15-route-handlers.md` consultado antes de alterar as rotas.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `REMOTE_MUTATIONS = 0`, `PROVIDER_CALLS = 0`.

## Fase 2C.4.6A — binding Territory -> SiloDNA — 2026-09-02

### Correcao conceitual aceita

Nao usar a working copy como autoridade de `centralEntity`, `macroIntent` e
fronteira estava certo. Concluir dai que sao LIVRES estava errado: no Silo-first
eles pertencem ao TERRITORIO confirmado, que o SiloDNA consolida.

### Mapa de equivalencia REAL

```
Territory.centralEntity      -> SiloDNA.centralEntity     (string, direta)
Territory.macroIntent        -> SiloDNA.dominantIntent    (string, direta)
Territory.boundary.includes  -> SiloDNA.includedTopics    (conjunto)
Territory.boundary.excludes  -> SiloDNA.excludedTopics    (conjunto)
```

SEM equivalencia canonica, portanto NAO comparados:

- `SiloDNA.boundary` e prosa livre; `Territory.boundary` e o par includes/excludes.
- `Territory.narrative` (statement, continuity, brandAlignment, rationale) nao tem
  campo correspondente no SiloDNA. `narrativeOrder` e ordem de artigos, nao
  narrativa territorial — igualar os dois seria inventar equivalencia.

### Ordem dos gates

O gate territorial roda ANTES do de composicao, e os dois antes da RPC A. Um
SiloDNA que traz entidade induzida pelos ArticleDNAs e recusado com
`TERRITORY_STRUCTURE_MISMATCH` mesmo com proveniencia e composicao impecaveis.
Mudanca real desses campos volta a revisao territorial, nao consolida.

### Validacao

- `test:arquiteto` 699 testes, 698 pass, 1 falha pre-existente do Minerador.
- 11 testes novos de binding territorial (41 no arquivo).
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `REMOTE_MUTATIONS = 0`, `PROVIDER_CALLS = 0`.

### Fechamento da Fase 2C

`SILOPAGE_APPROVAL_SERVER_GATE = MISSING`, `approved` fail-closed.
`FULL_PHASE_2C_COMPLETION_BLOCKER = YES` ate existir aprovacao propria da SiloPage.


## Descarte administrativo executado — 2026-09-08

Proprietário da operação: Arquiteto; participação do Radar explicitamente autorizada.
Projeto hjjlntdpdgvpnazdztqw; marca Care Glow (09762023-d0d4-4c24-b34e-d0fdfd43f891).
Descarte definitivo de testes autorizado pelo usuário, com backup dispensado.
Executado via Supabase CLI 2.111.0, db query --linked, em transação única.

- Confirmado no banco: removidos 21 workflows do Arquiteto e 4 do Radar; 115 ArticleDNA; 9 article_architecture_ai_review; 114 eventos de status; 10 eventos de decisão; 9 snapshots e 6 revisões SERP. Silos e tabelas do grafo já estavam vazios.
- Preservados: 29 keywords, 3 listas, 83 qualificações semânticas, 66 apresentações contextuais e 1 brand_skill. Comparação de conteúdo integral dos registros preservados nas 17 tabelas do script passou.
- Cinco triggers append-only restaurados exatamente ao estado O; nenhuma função, FK ou migration removida/aplicada.
- Primeiro ensaio detectou text versus uuid em version_id e desfez a transação. Script corrigido para text[], inclusão das revisões IA, exclusão por folhas de previous_version_id/source_version_id e previous_snapshot_id, locks e comparação de conteúdo preservado.
- Ensaio corrigido: PASS com rollback intencional. Execução definitiva: PASS. Readback SQL independente: PASS. Reexecução em simulação sobre vazio: PASS com rollback intencional. O erro P0001 SIMULACAO CONCLUIDA é deliberado, não falha da purga.
- Validação nas duas sessões da interface: AINDA NÃO VERIFICADA nesta execução. Cache local não foi apagado. Não declarar sincronização visual homologada com base apenas neste SQL.
- Script: supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql. Mantido em simulação por padrão. Ele aborta se grafos reaparecerem: não é reset universal para qualquer acervo futuro.
- Nenhum commit, push ou deploy executado nesta entrega.

## Artefatos filtrados na consulta — 2026-09-23

**Confirmado por teste; ainda não verificado manualmente.**

`listArquitetoArtifacts` baixava **todas** as versões de
`editorial_artifact_versions` da marca — inclusive as do Minerador — e montava
só quatro tipos. É a mesma classe de defeito já corrigida em
`ArtifactRepository.list` (regra R7 da SDD de
[uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md)).

- **Correção:** parâmetro opcional `artifactTypes` em
  `ArtifactVersionRepository.list` (`lib/server/pipeline-repositories.ts`) —
  ausente ou vazio, a consulta é idêntica à anterior — e a constante
  `ARQUITETO_LISTED_ARTIFACT_TYPES` em `lib/server/arquiteto-persistence.ts`
  com os quatro tipos que o laço consome (`article_dna`, `silo_dna`,
  `silo_page`, revisão de IA), verificada contra o tipo com `satisfies`.
- **Economia por chamada:** ~825 kB na Care Glow (−81%), ~1,55 MB e ~212 kB
  nas outras duas marcas. O handoff e o POST de silos chamam duas vezes cada.
- **Consumidores preservados:** chamadas sem argumento e com
  `(entityId, artifactType)` fazem a mesma consulta de antes; workspace,
  artefatos, silos e handoff recebem o mesmo retorno.
- **Efeito colateral declarado:** a numeração `row=N` nas mensagens de
  diagnóstico do readback canônico passa a contar só as linhas dos quatro
  tipos. Muda mensagem, não comportamento.
- **Atenção para o futuro:** tipo novo tratado no laço precisa entrar na
  constante, ou nunca chegará do banco. O teste
  `tests/arquiteto-artefatos-filtrados-na-consulta.test.mts` acusa isso,
  desde que a comparação seja escrita como `type === ...`. Registrado em
  `test:arquiteto`.
## Incidente AdalbaPro: confirmação de Silos e cabeças publicadas — 2026-09-26

**Verificado na interface remota antes da correção:** 159 keywords, 154 associadas a sete Silos candidatos, 25 linhas na aba Artigos (incluindo as quatro SiloPages publicadas) e formação bloqueada por ausência de Silo confirmado. O Vínculo mostrava corretamente as cabeças publicadas como `Silo · declarado` e os artigos publicados como `Artigo · declarado`; o defeito estava na passagem do cenário para a confirmação e na reserva das cabeças para a aba Artigos. Nenhum dado remoto foi alterado nesta revisão.

**Verificado no código e confirmado por teste local:** `reservedSiloHeadIds` consulta `readEditorialUnitDeclaration` antes de qualquer hipótese lexical ou estado de confirmação; a aba Artigos local passou de 25 para **21** artigos, com seis keywords reservadas para páginas de Silo (quatro publicadas e duas candidatas). `Confirmar arquitetura` considera as memberships do próprio plano para superar somente `EMPTY_TERRITORY`; depois do lote, exige membro efetivamente aplicado ou já presente antes de confirmar cada Silo. Falha de gravação entra em `failedCount`, sem marcador falso de confirmação completa. Foram preservados os bloqueios de narrativa, consistência, decisão e isolamento. A formação de Article ainda depende de Silo confirmado.

**Ainda não verificado:** confirmação e formação após deploy com o lote real, agrupamento semântico final das livres, revisão da SERP e persistência remota de ArticleDNA/SiloDNA. O teste local cobriu 61 casos focados e a aba Artigos; não executou `Confirmar arquitetura` nem chamadas pagas no banco da marca. Arquivos: `lib/arquiteto/territory.ts`, `modules/arquiteto/arquiteto-workspace.tsx`, `tests/arquiteto-territory.test.mts`; consumidores preservados: confirmação de Silos sem previsão, formação de artigos por Silo e proteção de URL/slug/canonical publicados. Sem migration.

### Correção do gate de publicados, após esclarecimento do dono

**Verificado no código e confirmado por teste local:** o bloqueio acima estava errado para o patrimônio publicado. A declaração `Silo · declarado`/`Artigo · declarado` no Vínculo aprovado e a URL/canonical do site são decisões prévias. `Processar arquitetura` agora separa fatos de propostas: efetiva a membership da cabeça e dos artigos publicados, verifica a gravação por readback e confirma o território publicado protegido no mesmo processamento. O candidato publicado legado é reaproveitado; não nasce segundo Silo. A fronteira escrita para um Silo publicado novo usa somente membros declarados pelo site. O botão `Continuar para Artigos` usa Silos efetivamente confirmados no snapshot, inclusive após F5, sem depender do clique manual em `Confirmar arquitetura`. Propostas de keywords livres e Silos potenciais não recebem aprovação automática. `planPublishedArchitectureRecognition` recusa marca ou endereço divergente e relação de URL ambígua. O catálogo do MCP foi atualizado na mesma entrega. SDD: [efetivação de publicados](sdd-efetivacao-publicados-no-processamento-2026-09-26.md).

**Limite de validação:** teste focado de publicados 26/26, `test:agent` 41/41, `tsc --noEmit` e build de produção passaram. `test:arquiteto`: 2.392/2.394; as duas falhas são as mesmas já registradas na base (teste do Minerador e cabeçalho antigo da aba Silos). Lint direcionado dos arquivos menores passou; o arquivo grande da mesa conserva débitos de lint anteriores. O fluxo real após deploy, o readback remoto da AdalbaPro, a formação dos artigos e a atribuição Pilar/Suporte ainda não foram homologados. Nenhuma escrita remota, migration, chamada paga, commit ou deploy foi executado nesta correção. Arquivos alterados nesta etapa: `lib/arquiteto/published-architecture-recognition.ts`, `lib/arquiteto/silo-decision-batch.ts`, `modules/arquiteto/arquiteto-workspace.tsx`, `modules/arquiteto/architecture-panel.tsx`, teste de publicados e catálogo MCP. Consumidores preservados: confirmação manual de Silos novos, formação por território, proteção de publicados, isolamento da marca e guia MCP.

### Workbench rolável e validação atual — 2026-09-26

- **Verificado no código:** o painel do Workbench tem altura delimitada por estado e rolagem vertical no painel esquerdo, com `min-h-0`/`overflow-y-auto`. A barra usa o CSS global de `app/globals.css`; não há scrollbar local nem `scrollbar-gutter`. O modal usa `bg-background/80` do sistema visual.
- **Confirmado por teste local:** `test:arquiteto` passou 2.396/2.396; a checagem focada do Workbench e publicados passou 75/75; `test:agent` 44/44; `test:redator` 358/358; `test:minerador:dom` 4/4. TypeScript e lint direcionado dos núcleos MCP passaram.
- **Ainda não validado:** renderização visual após deploy e leitura/escrita real dos sete Silos e 21 artigos. `test:visual-system` e `check:visual-system` ainda reportam falhas em áreas preexistentes fora deste ajuste, incluindo cores do Radar e dívida visual de Redator/Publicações; a validação específica do Workbench passou. Nenhuma gravação remota, migration, chamada paga ou deploy foi feito.

### Ação de artigos publicados e erro na verificação — 2026-09-26

- **Corrigido no código:** a coluna Ações não oferece mais `Verificar identidade` para artigo já declarado como publicado. Ela informa `URL, slug e Silo preservados`; o texto acessível explica que o canonical também fica protegido, que keywords continuam seguindo o Vínculo e que não há nova confirmação manual.
- **Causa do erro reportado:** a rota `/api/arquiteto/publication/verify` respondia com `entityType`, `siloPageId` e `siloPageVersionId`, enquanto `SerpPublicationVerificationSchema` era estrito e não reconhecia esses campos. A validação falhava antes de persistir a evidência. O schema agora aceita esses metadados opcionais, preservando registros antigos.
- **Confirmado por fixture local:** a resposta com os metadados da rota passa no schema; teste da tela verifica o texto e a ausência do botão para artigos publicados. A checagem online continua diagnóstica e não é gate para reconhecer o artigo/Silo. Verificação manual no navegador após deploy: pendente.
- **Arquivos:** `modules/arquiteto/arquiteto-workspace.tsx`, `lib/arquiteto/serp-formation.ts`, `tests/arquiteto-serp-formation.test.mts`, `docs/04-arquiteto/spec.md`. Consumidores preservados: dados de verificação SERP antigos, verificação da SiloPage e processamento de identidade já publicada.

### Explicação da seleção de artigos publicados — 2026-09-26

- **Corrigido no código:** quando a seleção contém somente artigos publicados, a recusa informa que eles já são patrimônio/âncoras e não precisam de confirmação novamente. Também orienta a selecionar as linhas de candidatos que representam keywords livres; se agrupadas sob um artigo publicado, a identidade da publicação continua protegida.
- **Comportamento preservado:** artigos publicados sem `candidateRef` continuam fora do escopo de formação de novos `ArticleDNA`. O ajuste altera a explicação exibida, não publica, reagrupa, confirma nem grava dados remotos.
- **Confirmado por teste local:** fixture de dois artigos publicados selecionados verifica a mensagem e preservação explícita de URL, slug, canonical e Silo. A homologação da seleção real após deploy continua pendente.
## Precedência publicados → Assuntos → novos candidatos — 2026-09-26

**Verificado no código e por fixtures locais; homologação da AdalbaPro ainda não verificada.** [SDD](sdd-precedencia-publicados-assuntos-2026-09-26.md). A mesa lê os sinais do KeywordDNA aprovado e, por Silo confirmado, reserva primeiro as páginas publicadas. Depois reserva sustentações com evidência suficiente para os Assuntos declarados, exigindo principal com Volume validado; o tronco não entra no teto. Só as livres remanescentes formam novos núcleos — e, desde a correção da D1 abaixo, só em lote todo novo ou pela ação explícita do dono. Quando dois Assuntos disputam uma keyword, ela aguarda revisão sem atribuição arbitrária. Decisões humanas anteriores e identidades publicadas continuam protegidas.

Um candidato automático admite até seis keywords; o excedente permanece visível em `Keywords não agrupadas` e não entra no pedido de SERP. A projeção da tabela agora usa a composição do candidato também para a publicada. `Compatibilidade: Não aplicável` de uma composição com uma única keyword usa tom neutro: não é reprovação editorial. A contagem `SERP coletada agora` usa apenas assessments devolvidos e confirmados no readback; falha ou cancelamento não anuncia coleta. A rota de SERP e os artefatos não mudaram de contrato. O catálogo MCP foi atualizado; não ganhou ferramenta nova. Sem SQL, escrita remota ou chamada paga nesta revisão.

Verificação local: `test:arquiteto` 2402/2402, fixtures novas de precedência e 27 keywords 5/5, `test:agent` 44/44, TypeScript e build Next.js 16 passaram. ESLint dos arquivos de domínio e catálogo alterados passou; o monólito `arquiteto-workspace.tsx` mantém 124 erros e 78 avisos anteriores no lint integral. Limite conhecido: KeywordDNA fornece os sinais de entrada; a SERP específica do artigo ainda depende de avaliação nas quatro lentes pelo cache compartilhado ou por plano de custo autorizado. A existência de SERP no pacote da keyword, sozinha, não constitui assessment de ArticleDNA.
## Parecer do artigo a partir da SERP em cache — 2026-09-26

**Verificado no código e confirmado por teste local; ainda não validado na marca remota.** A tela distingue a SERP já coletada por keyword do parecer por artigo. No caso observado em localhost, havia 108 leituras canônicas e 73–74 leituras por lente extra no cache, mas zero pareceres de 55 artigos porque o usuário cancelou o plano de até seis chamadas pagas. As 26 formações “para revisão” eram possíveis sobreposições da proposta lógica, não 26 falhas da SERP.

O plano da formação agora nomeia keyword, lente e motivo de cada falta. A opção **Analisar com o cache · US$ 0** gera pareceres somente com dados existentes e deixa falha individual para artigo sem lente canônica útil; jamais aciona provider nesse modo. Lentes extras ausentes são declaradas no parecer, sem presumir aprovação. O plano pago e seu teto continuam disponíveis. Se a leitura da metadata falhar, a coleta não fica proibida (D6): o plano volta com o custo máximo e o aviso, e a tela oferece coletar, ler de novo ou cancelar; só a análise gratuita devolve `SERP_CACHE_UNAVAILABLE` (ver a entrada seguinte). A ausência de parecer vigente ainda exige processar o artigo, mesmo quando a SERP de cada keyword já está no cache. Sem readback remoto, o artigo não é anunciado como validado.

Arquivos: `app/api/arquiteto/serp/route.ts`, `lib/arquiteto/serp-lens-plan.ts`, `lib/arquiteto/serp-blocks.ts`, `modules/arquiteto/serp-paid-plan-dialog.tsx`, `modules/arquiteto/arquiteto-workspace.tsx`, testes e catálogo MCP. Mudanças nos helpers compartilhados são aditivas e preservam as escolhas pagas da SERP territorial e por keyword. Testes e limites de homologação: [SDD](sdd-validacao-serp-cache-parcial-2026-09-26.md).

Artigos de uma keyword agora também consultam as quatro lentes do cache; faltas entram no plano antes de qualquer pagamento. Parecer parcial permanece consultável, mas o gate de formação fica **incompleto · faltam lentes** e impede a conclusão e o envio ao Radar. Pareceres legados sem marcador de lentes permanecem com cobertura desconhecida para esta checagem, sem inferir quatro lentes. A análise gratuita não transforma lente ausente em evidência.

Verificação local desta entrega: `test:arquiteto` 2404/2404; `test:arquiteto:lentes` 35/35; `test:agent` 44/44; TypeScript, build, lint direcionado dos arquivos de domínio/UI menores e `git diff --check` passaram. O lint integral de `arquiteto-workspace.tsx` ainda aponta 124 erros e 79 avisos preexistentes. `check:visual-system` falha em dívida de Redator/Publicações fora do ajuste. Nenhuma chamada paga, escrita remota ou deploy nesta entrega.
## O lote diz o objetivo: melhorar publicados e Assuntos — 2026-09-26

**Verificado no código e confirmado por teste local (fixtures); ainda não validado na AdalbaPro, que depende do deploy do usuário.** Fonte: Parte D de `docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md` (D1 a D8) e [SDD de precedência](sdd-precedencia-publicados-assuntos-2026-09-26.md). Corrige o que o dono viu no deploy 339a754: 0 publicados reconhecidos, publicados e Assuntos sozinhos com "Não aplicável", candidato de 27 keywords e 55 artigos bloqueados depois de cancelar o pagamento.

- **Objetivo do lote (D1):** o lote é o que a marca ativa entregou ao Arquiteto. Com página publicada (artigo ou Silo, pelo Vínculo) ou Assunto declarado, a mesa mostra "Objetivo do lote · melhorar publicados e Assuntos": as livres reforçam publicados e Assuntos por semântica e importância, até seis keywords por artigo, e a sobra sem encaixe fica em "Keywords não agrupadas pela formação" com o motivo. Nenhum artigo novo nasce sozinho, nem em Silo sem âncora. O botão "Formar artigos novos com as sobras" é a ação explícita do dono (estado da sessão, por marca; nada é gravado antes da confirmação na mesa), e "Voltar a só melhorar publicados e Assuntos" desfaz. Lote todo novo continua formando artigos desde o início.
- **Assunto vira artigo bom (D3):** além das sustentações sugeridas pelo Minerador, o Assunto sem Volume recebe as livres do Silo que convergem com a frase dele; a principal sai entre elas, com Volume validado, e o Assunto fica tronco sugerido (nunca membro, principal ou slug).
- **Reforço entre Silos só por proposta (D8):** a sobra que reforçaria publicado ou Assunto de outro Silo aparece em "Reforçar publicado ou Assunto de outro Silo", com origem, destino, convergência e motivo. "Mover para …" e "Mover todas para o Silo do destino" usam a mesma decisão humana de Silo da aba Silos (lock por item, uma releitura) e recarregam a mesa; o anúncio conta só o que a releitura confirmou. Na AdalbaPro, é o caminho para os publicados e Assuntos de Captação e Crescimento receberem as livres confirmadas em "Leads sem Tráfego Pago".
- **Tema do Silo sem os membros:** a fronteira gravada como lista das frases dos membros (107 no Silo Leads) deixou de entrar nos tokens do tema na formação; eles descontavam de toda convergência as palavras de cada artigo. Na fase de Silos, a hipótese territorial ignora essas frases como fronteira e soma a convergência com uma página publicada do território ("Reforça o artigo publicado …"). A hipótese só vale para keywords ainda não endereçadas.
- **SERP (D6):** o diálogo do plano não oferece "analisar com o cache (US$ 0)" quando o cache está ilegível; ficam coletar com o custo máximo, ler de novo ou cancelar. O readout da execução diz na própria linha que `SERP_COLLECTED` e `SERP_REUSED` contam pareceres de artigo confirmados no acervo, não entradas de cache por keyword. Corrigido o acesso a `lookup.subjectId` sem `?.` no modo `plan` da rota.

Arquivos: `lib/arquiteto/article-formation-priority.ts` (objetivo, Assunto sem Volume, oferta por importância, sobras, `proposeCrossSiloReinforcements`), `lib/arquiteto/article-formation.ts` (`siloThemeTokens` com `memberPhrases`, aditivo), `lib/arquiteto/territorial-logic.ts`, `lib/arquiteto/process-observability.ts` (legenda do readout, aditiva), `modules/arquiteto/arquiteto-workspace.tsx`, `modules/arquiteto/serp-paid-plan-dialog.tsx`, `app/api/arquiteto/serp/route.ts`, `lib/agent/platform-catalog.ts` e `package.json` (a suíte de precedência entrou em `test:arquiteto`). Consumidores preservados: chamadas sem os campos novos mantêm o comportamento anterior. Sem schema, migration, escrita remota, chamada paga ou mudança de rota.

Verificação local: `test:arquiteto` 2.427/2.427 (inclui `arquiteto-precedencia-formacao` 22/22 e a atração territorial), `test:arquiteto:servidor` 52/52, `test:arquiteto:lentes` 35/35, `test:agent` 44/44, TypeScript e `git diff --check`. ESLint dos arquivos de domínio, rota, diálogo e catálogo sem erro; o lint integral de `arquiteto-workspace.tsx` continua com 41 erros preexistentes, nenhum nas linhas desta entrega. **Ainda não verificado:** a tela no navegador e a marca real. Pendências no backlog.

## Um artigo por Assunto e nenhuma penalidade a publicado ou Assunto — 2026-09-26

**Verificado no código e confirmado por teste local (fixtures e sondas da revisão). A AdalbaPro ainda não foi validada: isso depende do deploy, que é do usuário.** Complementa a entrada anterior; ver o adendo da [SDD de precedência](sdd-precedencia-publicados-assuntos-2026-09-26.md).

- **Um artigo por Assunto (D1/D4/D7):** a reserva do Assunto formava um artigo novo para cada sustentação que não convergia com a primeira Principal. Era o padrão dos candidatos de uma keyword só com o mesmo Assunto; doze sustentações também viravam dois artigos concorrentes. Agora o Assunto forma um artigo. O resto volta a ser livre, é oferecido a publicados e Assuntos com vaga e, sem encaixe, fica em "Keywords não agrupadas pela formação", com o motivo "um artigo por Assunto". Esse resto entra nas propostas entre Silos. Nem a ação "Formar artigos novos com as sobras" cria um artigo que canibalize o do Assunto.
- **Artigo do Assunto nunca "Sem convergência" nem "Não aplicável" (D3):** o candidato com Assunto preso ou sugerido pela formação leva `carriesSubject`. Sozinho, a auditoria o classifica como "Assunto · aguardando sustentação". A mesa passa o Assunto do artigo à classificação na linha, nos bloqueios, na conclusão e no legado.
- **Publicado sozinho nunca "isolado" (D2):** a conclusão da revisão do candidato diz "artigo publicado · aguarda reforço".
- **Selo do Assunto:** o Assunto que a formação já pôs como tronco sugerido mostra "Assunto · artigo sugerido na formação, aguarda confirmação", não "aguardando sustentação". A formação e a mesa dão a mesma resposta.
- **Sustentação que esperava Principal:** entra primeiro no artigo do próprio Assunto sem Volume. Sem esse artigo, é oferecida às âncoras e, sem encaixe, fica com o motivo e pode virar proposta para outro Silo.
- **D8:** toda keyword do universo fora de artigo tem motivo, inclusive a do grupo humano sem Principal elegível.
- **Quatro lentes no artigo unitário:** o parecer antigo "sem par" fica "incompleta · faltam lentes" e bloqueia a conclusão até as extras serem coletadas. O plano de custo agora avisa isso ao dono.
- **Números reais (leitura remota só de leitura):** AdalbaPro com 159 itens: 21 artigos publicados, 4 cabeças de Silo e 134 livres. Em "Leads sem Tráfego Pago", 5 artigos publicados e 101 livres: no máximo 25 livres reforçam esses publicados. Pelo menos 76 ficam em Keywords não agrupadas, com motivo, ou viram propostas de reforço para outros Silos.
- **Fins de linha:** as linhas acrescentadas com LF em `lib/arquiteto/article-serp-gate.ts`, `tests/arquiteto-article-formation-phase.test.mts`, `backlog.md`, `estado-atual.md` e `spec.md` foram normalizadas para CRLF. As linhas LF que sobram nos três documentos estão em trechos que esta entrega não alterou, e a mistura é anterior a ela.

Arquivos: `lib/arquiteto/article-formation-priority.ts`, `lib/arquiteto/article-formation.ts` (`carriesSubject`, `suggestedTrunkSubjectKeywordIds`, motivos, auditoria), `lib/arquiteto/declared-subject.ts` (selo e parâmetro opcional), `modules/arquiteto/arquiteto-workspace.tsx`, `modules/arquiteto/serp-paid-plan-dialog.tsx`, `lib/agent/platform-catalog.ts` e `tests/arquiteto-precedencia-formacao.test.mts`. Mudanças aditivas: consumidores sem os campos novos leem o contrato anterior. Sem schema, migration, escrita remota, chamada paga ou mudança de rota.

Verificação local: `test:arquiteto` 2.435/2.435 (precedência 30/30, com as sondas Z, H e C), `test:arquiteto:servidor` 52/52, `test:arquiteto:lentes` 35/35, `test:agent` 44/44, `tsc --noEmit` sem erros e `git diff --check` limpo. O ESLint dos arquivos de domínio, do diálogo e do catálogo não aponta erro. `arquiteto-workspace.tsx` mantém os 41 erros anteriores, nenhum nas linhas desta entrega. **Ainda não verificado:** a tela no navegador e a marca real.
