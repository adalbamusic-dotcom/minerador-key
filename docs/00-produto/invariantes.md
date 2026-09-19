# Invariantes do produto

13. Site observa, Minerador qualifica, Arquiteto forma e Radar valida somente o ArticleDNA formado; KGR, volume, resultados e intenção não podem ser promovidos por inferência de URL ou slug.

1. DNAs permanecem rastreáveis por identidade, versão, hash e proveniência.
2. IA aplicada não significa aprovado.
3. Publicados mantêm slug, canonical, keyword principal, marca e URL estrutural protegidos.
4. Importação é seletiva, idempotente e limitada à marca correta.
5. Seleção não controla renderização.
6. Estado vazio não sobrescreve estado válido.
7. Toda keyword importada possui localização conhecida ou é bloqueada para reconciliação.
8. SiloDNA e SiloPage são entidades diferentes.
9. Versões consolidadas são imutáveis; uma alteração cria sucessora.
10. Operações estruturais exigem snapshot, rollback definido e regressão executada.
11. Sucesso só aparece após salvamento confirmado pelo meio de persistência aplicável.
12. Dados de marcas diferentes nunca se misturam.
13. Tenant de URL, body de API e cache local deve resolver para a mesma marca; divergência é recusada no servidor.
14. Preferência local de marca não concede acesso nem substitui contexto canônico de rota.
15. `brandId` é `public.marcas.id`; `brandRef` é somente referência pública, e owner, membro e ator são identidades distintas.
16. `keywords_kgr.brand_id` é obrigatório e `lista_id` é opcional; uma keyword sem lista permanece válida e vinculada à marca.
17. `keywords_kgr.lista_id → listas_kgr.id` usa `ON DELETE RESTRICT`; excluir uma lista nunca apaga keywords.
18. Histórico de undo/redo e operações recentes da interface é `SESSION_HISTORY`, local ou de sessão, e nunca substitui versionamento, auditoria, proveniência ou proteção contra exclusão.
19. `isPublished(subject)` é resolvido server-side por publicação formal ou linhagem canônica real; status visual, ArticleDNA, workflow, aprovação, handoff, DNA e métricas isolados não promovem publicação.
20. Entidade não publicada pode seguir para hard delete transacional após impacto, confirmação digitada pelo nome exato e readback; entidade publicada usa a mesma confirmação, tombstone recuperável por 24 horas, restore dentro da janela e purge server-side após o vencimento. História canônica append-only permanece preservada.
21. `InternalLinkGraph` é a fonte canônica das relações estruturais de links
    internos. Ele é tenantizado por `brandId`, versionado append-only e
    referencia versões de SiloDNA, SiloPage e ArticleDNA; React Flow, estado
    local e propostas de IA não substituem o grafo consolidado.
22. SiloDNA e SiloPage permanecem entidades, versionamentos e aprovações
    distintos. A consolidação pareada deve persistir os dois na mesma
    transação, sem apresentar o par como uma entidade única.

## Infraestrutura compartilhada e entradas externas — 2026-08-25

- A Plataforma/Admin governa providers, Connections, capabilities, grants,
  bindings, quotas e uso. A Agência recebe disponibilidade conforme plano,
  período e política; a Marca consome o que sua Agência disponibiliza. Os
  módulos são consumidores e não possuem provider, Connection, credential,
  grant, binding ou quota próprios.
- Google Ads é infraestrutura fixa da Plataforma, com configuração server-side
  e rotação do OAuth Refresh Token pelo Admin global. DataForSEO é a
  infraestrutura compartilhada de SERP/orgânico; DeepSeek é a IA canônica
  compartilhada. Nenhum desses recursos vira autorização por módulo.
- Google Cloud Speech-to-Text, Cloud Storage e YouTube Data API são operações
  compartilhadas. Speech produz transcrição, Storage distingue original de
  processamento temporário e YouTube fornece somente metadata; nenhum deles
  toma decisão editorial.
- Telegram usa um único Bot global da Plataforma, webhook único e routing por
  `TelegramExpertBinding(brandId, expertId, telegramUserId, telegramChatId)`.
  Sem binding e `briefId` explícitos, não existe contribuição editorial. Não
  há resolução de Marca por username, nome, telefone, e-mail ou última pauta.
- `telegram_inbound_updates` é um ledger global de pré-routing: não é entidade
  editorial tenantizada, não recebe `brand_id` artificial, não é acessível por
  `authenticated` e só promove contexto depois de binding, `brandId`,
  `expertId` e `briefId/articleDnaVersionId` explícitos.
- `service_role` pode acessar infraestrutura server-side, mas não ignora
  tenantização. Não existe segundo caminho de persistência que promova inbound
  para entidade editorial sem os guards canônicos de binding e contexto.
- Especialista é identidade de domínio da Marca e não é automaticamente um
  usuário Auth. `ExpertBrief` é uma pauta de um especialista para um artigo e
  versão específicos; múltiplas pautas permanecem independentes. Original,
  transcrição/extração e organização editorial são camadas distintas e
  rastreáveis.
- Vercel trata entrada, webhook, administração e estado; o Local Worker do
  Minerador Key trata processamento pesado, podendo retomar jobs quando voltar
  a estar online. O webhook não executa processamento pesado.
- O Radar investiga e organiza evidências do ArticleDNA recebido, usando a
  infraestrutura SERP compartilhada e preparando o `PlannerHandoff v3` para o
  Planejador. Não forma ArticleDNA, troca principal, altera slug/canonical,
  modifica SiloDNA nem envia conteúdo diretamente ao Redator.

```text
PLATFORM_INTEGRATION_FOUNDATION = READY
READY_FOR_RADAR_DEVELOPMENT = YES
TELEGRAM_BOT_READY != TELEGRAM_WEBHOOK_READY
TELEGRAM_WEBHOOK = NOT_CONFIGURED
TELEGRAM_INBOUND_E2E = PENDING
```

## Radar — investigação competitiva — 2026-09-11

23. O Radar não redefine o ArticleDNA. Ele acrescenta evidência amarrada a
    `articleId + articleDnaVersionId + articleDnaContentHash`; o dossiê de
    trabalho é `ArticleDNA + RadarEvidenceBundle`, e ao finalizar
    `RadarFrozenEvidenceBundle + ArticleDNA` formam o `PlannerHandoff v3`.
24. Modo de pesquisa não é área. `Pesquisa → YouTube` é motor de descoberta
    competitiva — consulta a plataforma, cria universo, produz modelo próprio.
    A área `Vídeos` é ingestão deliberada: o USER fornece as fontes, não existe
    SERP e a fonte não vira concorrente automaticamente. Os dois papéis não
    compartilham identidade semântica; um mesmo vídeo só existe nos dois após
    decisão humana explícita.
25. Nenhum passo do lifecycle da pesquisa ocorre automaticamente por `mount`,
    F5, troca de área ou expansão de painel. `START`, `ANALYZE`, `FINALIZE` e
    `RESET` são ações explícitas do USER.
26. A intenção declarada do artigo vem do fundamento aprovado, nunca da SERP.
    `unknown`, `ambiguous` e `indeterminate` não são declarações conclusivas, e
    só existe conflito entre dois valores conclusivos que realmente divergem. A
    ordem das fontes e o tratamento dos sentinelas são centralizados; nenhuma
    projeção monta a própria ordem.
27. A SERP vigente e suficiente é evidência principal sobre a realidade
    competitiva e **não** prova verdade factual. Fontes primárias e
    qualificadas prevalecem sobre recorrência de mercado em matéria de fato, e
    o conflito fica escrito dos dois lados em vez de ser resolvido em silêncio.
28. Estrutura de links internos é do Arquiteto; aplicação evidencial é do
    Radar; integração no `ContentPlan` é do Planejador. Relação `REQUIRED` sem
    contexto sustentado vira
    `applicationStatus = REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT` com
    `recommendedOccurrences = 0`; zero ocorrências não remove a relação.
29. Necessidade preparada não é pedido enviado: `PREPARED != SENT`. O Radar
    prepara `SpecialistBriefs` e não dispara contribuição por Telegram
    automaticamente.
30. `FINALIZE` é ação do USER e não chama provider. Depois do congelamento,
    nenhuma leitura pode reconstruir silenciosamente conclusões diferentes das
    que o bundle registrou.
31. `RESET` limpa apenas a pesquisa corrente e preserva ArticleDNA, KeywordDNA,
    SiloDNA, SiloPage, InternalLinkGraph, o histórico append-only, os vídeos
    deliberadamente registrados e as contribuições reais do especialista.
    `RESET` não inicia pesquisa nova.
32. O `RadarEditorialBlueprint` é projeção editorial, não `ContentPlan`. Não
    fixa H2 final, título final, contagem de palavras nem ordem rígida; o
    `ContentPlan` continua sendo decisão do Planejador.
33. O cliente envia `sourceId` e não escolhe URL arbitrária; o servidor resolve
    o id contra o plano e as candidatas persistidas. Duas URLs do mesmo domínio
    são fontes distintas. Falha HTTP legítima vira limitação declarada;
    `SOURCE_UNKNOWN` para id produzido pelo próprio pipeline é defeito.


## Radar — fechamento da fase — 2026-09-17

34. Perfil de pesquisa não é saída editorial. `GOOGLE` produz blueprint
    editorial e artigo-modelo; `YOUTUBE` produz blueprint audiovisual e
    roteiro-modelo; `AMAZON` produz blueprint comercial. O perfil descreve como
    se investigou, nunca o que será publicado.
35. A hierarquia de evidência é a de `RADAR_EVIDENCE_HIERARCHY`, nesta ordem:
    `ARTICLE_INVARIANT`, `PRIMARY_FACTUAL_EVIDENCE`, `QUALIFIED_SPECIALIST`,
    `CURRENT_SUFFICIENT_SERP`, `OTHER_RADAR_EVIDENCE`, `ARTICLE_DNA_HYPOTHESIS`,
    `AI_INTERPRETATION`, `DETERMINISTIC_HEURISTIC`,
    `GENERIC_EDITORIAL_SUGGESTION`. SERP suficiente domina a leitura
    competitiva e **não** substitui fonte factual nem especialista em matéria
    de fato.
36. `YouTube Search` e Biblioteca de Vídeos são autoridades distintas. A
    primeira lê título, canal, duração, posição e data, e **nunca** afirma o
    conteúdo interno de um vídeo; a segunda carrega trecho ancorado no tempo de
    fonte que uma pessoa escolheu. Transcript não é exigido pela primeira e é a
    matéria-prima da segunda.
37. Na Amazon, a intenção editorial é declarada antes da coleta e é separada do
    alvo. As camadas são `RAW_UNIVERSE → ELIGIBLE_CANDIDATES →
    EDITORIAL_SHORTLIST`, o ASIN é a identidade canônica, `TOP_BEST` não é os
    primeiros N slots e `TOP_VALUE` não é o menor preço. A Merchant Brasil usa
    `language_code = pt_BR` e `location_code = 2076`; a grafia com underscore é
    dela e não é a do Google nem a do YouTube.
38. Link promocional nasce da shortlist editorial, com URL limpa
    `https://www.amazon.com.br/dp/{ASIN}`. O Radar **não** cria tag de afiliado:
    ele marca `affiliateReady`, fixa `relPolicy = sponsored nofollow` e exige a
    divulgação quando há link monetizado. A substituição por URL de afiliado é
    de etapa posterior e preserva o ASIN.
39. O dossiê canônico é resolvido uma vez —
    `loadRadarCanonicalAuthorities → resolveRadarCanonicalDossier` — e alimenta
    `sendRadarToPlanner` e o export portátil com o mesmo conteúdo semântico.
    `writer_brief_md`, `writer_context_md` e `competitive_radiography_md` são
    read models portáteis: não são autoridade factual e não viajam no handoff.
40. Todo `evidenceRef` usado pelo blueprint final resolve a partir do dossiê
    ENTREGUE ao Planejador, e não apenas a partir do export.
41. O papel e a composição das keywords vêm do ArticleDNA
    (`keywordReferences[].role`); o texto vem da hidratação amarrada ao mesmo
    `articleDnaVersionId`. Nunca resolver a keyword principal por título, slug,
    consulta da SERP, promessa ou hierarquia, e **nunca** promover uma
    secundária a principal. Texto não resolvido é `null` com
    `resolution = UNRESOLVED`.
42. `bundle.video` e `bundle.specialist` são preenchidos pela autoridade
    canônica. A biblioteca de vídeos não leva id de worker, `gs://` nem id de
    job; o especialista não leva id de Telegram, de chat nem de ator. A omissão
    acontece na origem, ao montar a camada. Ausência é `null`, nunca camada
    vazia.
43. O export portátil é um dossiê editorial de escrita, não backup. Ele não
    carrega payload cru de provider, segredo, id privado, dump de banco, hash
    ou UUID como conteúdo editorial, nem endereço interno de evidência: a
    relação seção → evidência atravessa por rótulo legível.
44. `seoTitle`, `metaDescription`, Open Graph, Twitter, `robots` e schema podem
    permanecer não definidos na fase Radar. O Radar exporta direção e
    restrições, com os campos ausentes nomeados, e não inventa decisão do
    Planejador ou do Redator.
45. O plano visual canônico é uma capa e duas ou três imagens de respiro. FAQ
    não faz parte do padrão. Cada imagem declara função, seção e a origem da
    necessidade; sem estrutura editorial não há plano visual.
46. `sendRadarToPlanner` é a autoridade única de envio, com a ordem
    `validate → canonical resolve → write bundle → readback → identity/hash
    validation → workflow transition → destination readback → success`.
    `RadarEvidenceBundle` permanece V3; extensão é aditiva e opcional, nunca um
    envelope paralelo.

Estas regras são canônicas. Uma exceção exige proposta SDD aprovada e atualização desta documentação quando permanente.

## Pipeline — o Redator recebe do Radar — 2026-09-17

47. O pipeline operacional é `Marca → Minerador → Arquiteto → Radar → Redator →
    Publicações`. O Planejador **não** é etapa, gate, destino de botão, condição
    de prontidão nem parada de navegação, e desde 2026-09-18 está **removido do
    pipeline**: `PLANEJADOR_STAGE = NONE`. Nenhum documento pode descrever
    `Radar → Planejador → Redator` como fluxo vigente, e nenhum caminho de
    escrita nova pode passar por ele. A rota `/planejador` continua respondendo
    para leitura do histórico — remoção lógica não é apagar o passado.
48. O Redator planeja e escreve. Ele decide estrutura final de H2/H3, sequência
    narrativa, aplicação da evidência por seção, links, mídia, metadados de SEO
    finais, CTA e instruções de redação, e pode montar um `ContentPlan` interno
    antes de escrever. `ContentPlan` deixou de ser ETAPA; não deixou de existir.
49. O Redator **não** pode trocar a keyword principal, reconfigurar o Silo,
    remover cobertura obrigatória, alterar a intenção declarada, alterar slug ou
    canonical protegidos, nem substituir a composição de secundárias por decisão
    própria. A lista é `RADAR_WRITER_MAY_NOT` e viaja dentro do pacote entregue,
    não apenas na documentação.
50. O Radar não mudou de papel: ele continua dono da investigação, da evidência
    e do Blueprint. O que este gate trocou foi DESTINO e RESPONSABILIDADE, nunca
    pesquisa. Nenhum collector migra para o Redator.
51. `sendRadarToWriter` é a autoridade única de entrega, com a ordem
    `validate → canonical resolve → readiness → write receipt → readback →
    identity/hash → create document → destination readback → workflow
    transition`. O lote repete essa porta; ele não abre outra.

    **Dois gatilhos, uma autoridade — 2026-09-18.** A entrega pode ser disparada
    de duas pontas: pela ação no Radar e pelo botão "Importar do Radar" no
    Redator. O gatilho do Redator **não** constitui segunda autoridade: ele
    lista elegíveis — artigos da marca com `state = 'approved'` no estágio
    `radar` — e chama o mesmo serviço, sem validação, aprovação, montagem de
    documento ou escrita próprias. Não existe segunda aprovação entre Radar e
    Redator, e a idempotência continua garantida pelo id determinístico do
    documento.
52. O Redator recebe a ESTRUTURA canônica do dossiê, não markdown.
    `writer_context_md`, `writer_brief_md` e `competitive_radiography_md`
    continuam sendo read models portáteis do CSV e não substituem o dossiê no
    documento.
53. `sendRadarToPlanner` é legado: sem rota, sem botão e sem transição. Ele
    permanece no repositório porque define o que `plannerBundle` e
    `sent_planner` significam nos registros já gravados. Dados históricos do
    Planejador são preservados e nenhum artigo é movido automaticamente.
54. A entrega ao Redator não exige migration. `editorial_workflow_items.stage`
    já aceita `writer`, `state` é texto livre e
    `content_documents.content_plan_version_id` é nulável na `0028`, que
    prevaleceu sobre a `0002` — documento de origem Radar nasce sem plano, e
    nenhum id de plano é fabricado para preencher a coluna.

## Correção — a esteira não é autoridade de finalização — 2026-09-17

55. `editorial_workflow_items.state` é o estado da ESTEIRA e **não** descreve a
    investigação. O fluxo operacional vigente — `START → ANALYZE → FINALIZE` —
    nunca o move: uma linha de Radar nasce `research_pending` e assim
    permanece. `approved` só existia no fluxo antigo por abas. Nenhuma decisão
    sobre prontidão editorial pode depender desse campo.
56. A autoridade de "investigação concluída" é a prontidão canônica do dossiê:
    perfil resolvido a partir da fotografia congelada, `RadarEvidenceBundle` V3
    íntegro e vínculo com o ArticleDNA corrente. Ela responde para a tela, para
    o lote e para o servidor — uma pergunta, uma resposta.
57. Não existe segunda aprovação entre o Radar e o Redator. Quem coletou,
    analisou e finalizou não precisa aprovar de novo, e artigo finalizado antes
    da mudança de destino é reconhecido sem refinalizar. Evidência congelada
    não é recriada para satisfazer um fluxo novo.
58. Fixtura que descreve um estado que o produto não produz não protege nada.
    Uma bancada precisa nascer no estado REAL do fluxo vigente — foi uma linha
    de esteira `approved`, impossível na prática, que escondeu esta recusa de
    dezessete mutantes.

## Remoção lógica do Planejador e árvore da plataforma — 2026-09-18

59. Os estágios são **identificadores declarados**, não índices de posição:
    `MODULE_STAGE` em `lib/editorial/navigation.ts` é a fonte. Vale
    `PLANEJADOR_STAGE = NONE`, `REDACTOR_STAGE = 6`, `PUBLICACOES_STAGE = 7` e
    `CONTA_STAGE = 8`. A posição 5 fica **declarada e não atribuída**: derivar o
    número de um índice obrigaria a existir algo ali, e alguém inventaria uma
    etapa só para preencher o buraco.
60. `PRODUCT_FLOW` é o pipeline editorial e por isso **não** inclui Conta, que é
    estágio da árvore da plataforma e não etapa de produção. Quem precisa do
    número lê `MODULE_STAGE`; quem precisa da esteira lê `PRODUCT_FLOW`.
61. Rota registrada e rota oferecida são coisas diferentes. `historical: true`
    em `PRODUCT_MODULES` marca o que continua **respondendo** e deixa de ser
    **oferecido**. O Planejador some do menu e da esteira sem que o caminho para
    os planos já aprovados seja apagado junto.
62. Não se cria compatibilidade fictícia para o Planejador. O banco real
    confirmou **zero** linhas de `ContentPlan`, `stage='planner'` e
    `sent_planner`, e as tabelas `content_plans`/`planner_items` **não existem**.
    Não há migração de conteúdo a fazer, e inventar uma seria trabalho sobre
    dado inexistente. O que a remoção precisa impedir é **escrita nova**.
63. Leitura de payload legado é preservada **apenas onde é necessária para parse
    ou compatibilidade**: `plannerItemId`, `contentPlanVersionId`,
    `contentPlanRef` e o valor `sent_planner` continuam legíveis. O que sai é a
    transição e a exigência, nunca o vocabulário de leitura.
64. Nenhum `ContentDocument` v1 novo é criado, e nenhum registro novo nasce por
    caminho de Planejador. Documento novo é v2, com `radarOrigin`.

## Retenção editorial — substituição confirmada, nunca idade — 2026-09-18

65. `PURGE_BY_AGE_ONLY = NO`. Idade não apaga nada. Nenhum artefato entra em
    janela de eliminação por ter envelhecido.
66. `ONLY_AFTER_CONFIRMED_REPLACEMENT = YES`. A janela só abre quando um
    sucessor foi **persistido e relido com sucesso**. Antes da substituição
    confirmada **não existe `purge_after`** — e a marcação é ato próprio,
    separado da gravação, porque o readback só existe depois do commit. Se o
    readback falhar ou o processo morrer, nada é marcado e nada é apagado: o
    modo de falha é guardar demais.
67. `RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H`, contada a partir de
    `superseded_at`, nunca de `created_at`. Durante a janela o predecessor é
    recuperável.
68. `DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE`. ArticleDNA, KeywordDNA, SiloDNA,
    SiloPage, InternalLinkGraph, evidências e snapshots do Radar, trilhas de
    auditoria e eventos MCP seguem a política do módulo dono e **não entram
    nesta reforma**, salvo dependência técnica comprovada e autorização
    posterior. Não é exceção à regra: é propriedade de outro módulo — sete
    tabelas de módulos anteriores dependem de `editorial_artifact_versions` por
    FK.
69. Substituição de mídia só conta quando o **sucessor está confirmado no mesmo
    anchor**. O vínculo (`anchor_kind` + `anchor_ref`) é transferido antes de o
    predecessor ganhar janela, na mesma transação — nunca existe instante em que
    o bloco ficou sem imagem enquanto o antigo já contava.

## Versionamento e fronteira Redator → Publicações — 2026-09-18

70. O ciclo de versão do Redator é:

    ```text
    Salvar rascunho              = NÃO cria versão histórica
    Finalizar pela primeira vez  = cria a versão final
    Refinalizar conteúdo alterado= cria sucessora
    ```

    Só **predecessora finalizada e substituída** entra na janela de 48h.
    **Autosaves intermediários não entram no lifecycle de retenção** — eles são
    estado corrente, não histórico. Guardar cada tecla digitada como versão
    encheria a retenção de ruído e esconderia as substituições que importam.
71. `ContentDocument.status = 'aprovado'` significa **finalizado no Redator** e
    **não** significa recebido em Publicações. A autoridade de entrada é
    `sendWriterToPublications → publication_record persistido → readback
    confirmado`. Sem o registro, o conteúdo não pertence operacionalmente a
    Publicações, por mais finalizado que esteja.
72. Os três eixos são distintos e nenhum deriva do outro por conveniência:
    **finalizado no Redator**, **recebido em Publicações** e **publicado
    externamente**. A biblioteca mostra os dois primeiros lado a lado; o
    terceiro vem do registro em `published`.
73. A biblioteca de Publicações é **read model**: uma linha por `documentId`,
    lendo `content_documents` para conteúdo e metadados e `PublicationRecord`
    para prova de entrega e destino. Nenhuma tabela nova, nenhuma cópia, nenhuma
    linha duplicada quando ambos existem.
74. Não existe caminho local-first para entrar em Publicações. Estado de tela
    gravado antes da confirmação do servidor não é entrada — é otimismo, e ele
    já apareceu duas vezes neste produto com nomes diferentes.
75. O escopo da **biblioteca de Publicações é a entrega**, não a produção. O
    recorte padrão é `ENTREGUES`, e todos os recortes oferecidos pertencem ao
    eixo de entrega. Estado do Redator — `RASCUNHO`, `FINALIZADO` — não pode ser
    recorte de Publicações: usado assim, ele traz para a lista, como item
    normal, documento que Publicações nunca recebeu. O eixo do Redator vive no
    selo da linha, ao lado do selo de entrega.
76. `NAO_ENTREGUE` **existe** no read model — a projeção não descarta documento
    algum, sob pena de recriar a biblioteca paralela do §73 — e é alcançável por
    um recorte que o nomeia. O que ele nunca faz é aparecer como item já
    recebido, nem compor a lista normal da biblioteca.
77. A navegação entre as áreas de um módulo **não pode depender de qual área
    está aberta**. Registrá-la dentro do render de uma superfície específica faz
    as outras desaparecerem quando aquela superfície não renderiza — foi assim
    que `Fila`, `Publicados` e `Atualizações` ficaram inalcançáveis a partir da
    Biblioteca, que é a área padrão de Publicações.
