# Spec — Radar

## Consolidação canônica de integrações e abertura da fase — 2026-08-25

`PLATFORM_INTEGRATION_FOUNDATION = READY` e
`READY_FOR_RADAR_DEVELOPMENT = YES`. O Radar é consumidor da infraestrutura
SERP compartilhada DataForSEO; não possui Connection, credential, provider,
grant ou quota próprios. A Connection `READY` não substitui smoke autenticado,
persistência remota ou revisão humana.

DataForSEO atende investigação/compatibilidade por capabilities explícitas.
DeepSeek, Google Cloud Speech/Storage, YouTube Data API e Telegram são também
infraestruturas compartilhadas da Plataforma. O Radar não cria variantes como
`radar.dataforseo`, `radar.telegram`, `radar.youtube`, `radar.speech` ou
`radar.deepseek`.

O próximo fluxo aprovado é `ArticleDNA + KeywordDNA + SiloDNA + SERP/DataForSEO
→ lacunas/perguntas → revisão humana → ExpertBrief → Telegram →
ExpertContribution → transcrição/extração → ExpertEvidence →
RadarEvidencePackage`. A experiência editorial de contribuições e a validação
inbound Telegram continuam tarefas/gates próprios.

## Arquitetura e rota

O overview do módulo está em `/{brandRef}/radar`; o detalhe de um artigo está em `/{brandRef}/radar/{articleId}` e é autorizado novamente pelo servidor. A implementação funcional pertence a `modules/radar`; APIs editoriais server-side ficam em `app/api/editorial/**`. O contexto e snapshots são brand-scoped, preservam ArticleDNA/KeywordDNA/SiloDNA recebidos e não usam a página monolítica histórica.

O transporte opcional do Arquiteto pode carregar `arquitetoStrategyContext.unit`, `unitPurpose`, `serpStrategy` e `intent`. Esses campos explicam tipo, finalidade, ciclo, competição e perfil resolvidos no Arquiteto; não autorizam regrouping, nova classificação KGR, troca de principal ou alteração de URL/canonical. O Radar somente interpreta a estratégia recebida e mantém a decisão humana separada da coleta SERP.

## Consumo da formação do Arquiteto

O Radar recebe ArticleDNA já formado e pode exibir principal, apoios, volume combinado, condição KGR, coerência de slug, proteção de publicado e racional. Não pode reagrupar, remover, adicionar ou trocar principal, slug, canonical ou aprovação.

## Propósito

Receber unidades editoriais aprovadas, pesquisar a SERP real da keyword principal e organizar evidências antes do Planejador.

## Responsabilidades

- Importar ArticleDNA/SiloPage elegíveis e manter a planilha operacional.
- Resolver a keyword principal por texto hidratado, nunca por identificador técnico. O import pode carregar um snapshot textual aditivo com `keyword`, `canonicalKeywordId`, `sourceKeywordId`, aliases, `siloId` e `siloName`.
- Reconciliar itens antigos sem snapshot de hidratação durante o reload, preservando identidade, estado, lock e DNA já persistidos.
- Reconhecer aliases publicados como `pub-k-<id>` somente como referências de transporte; a coleta usa o texto canônico obtido dentro da marca autorizada.
- Separar UUID canônico, alias publicado, ID de origem e texto. Apenas UUIDs validados podem entrar em consultas de colunas UUID; alias sem UUID canônico comprovado usa o snapshot de hidratação local ou bloqueia com segurança.
- Coletar e normalizar SERP via DataForSEO compartilhado em uma fronteira server-side.
- Preservar snapshots imutáveis, proveniência, hash e histórico por versão.
- Exibir diagnóstico determinístico e submeter a pesquisa à decisão humana.
- Transferir ao Planejador somente itens aprovados; uma SERP só é evidência quando aprovada separadamente.

## Fora de responsabilidade

Radar não gera ArticleDNA/SiloDNA, não redige o documento final e não faz scraping direto do Google. A coleta não aprova automaticamente artigo, keyword, silo ou snapshot.

## Entidades e estados

- `RadarItem`: unidade de workflow importada do Arquiteto.
- `SerpCollectionRecord`: envelope editorial compatível com o fluxo existente.
- `SerpResearchSnapshot`: resultado normalizado da coleta real, com query, localização, país, idioma, device, provider, versão, hash, resultados orgânicos, PAA, related searches, Knowledge Graph e diagnóstico.
- `SerpReview`: decisão humana `approved` ou `rejected` para um snapshot.
- `RadarHydrationSnapshot`: captura local, por artigo e marca, dos vínculos de keyword e silo usados para renderização e recuperação. Não substitui KeywordDNA, ArticleDNA ou SiloDNA.
- `RadarSerpResolutionEnvelope`: contrato de transferência efêmera e versionada entre a hidratação do Arquiteto no navegador e o Route Handler do Radar. Contém a keyword principal textual, seus IDs/aliases, referência do artigo e silo, origem da transferência e hash canônico; não substitui os DNAs persistidos.

O snapshot real nasce em `needs_review`. `origin: real`, `isMock: false`,
`provider: dataforseo` e `humanDecisionRequired: true` são obrigatórios. O
mock continua separado, explícito e não pode ser aprovado como evidência real.

## Contrato HTTP

`POST /api/editorial/serp` aceita `action: collect` ou `action: review`.

- `collect` exige sessão, acesso à marca, permissão `radar:edit`, ArticleDNA coerente e keyword principal resolvida por vínculo canônico/alias e silo pertencente à marca. A Connection/capability DataForSEO permanece server-side.
- `review` exige sessão, acesso à marca, permissão `radar:review` e snapshot real pertencente ao artigo/marca.
- Erros de configuração, migration/tabela, conexão, autenticação, permissão, timeout, resposta HTTP e resposta inválida são retornados com códigos distintos, sem fallback silencioso para mock.
- `collect` e `review` exigem `RadarSerpResolutionEnvelope` hashado. A rota valida o envelope antes de resolver ou chamar o provider; uma keyword remota canônica, quando disponível, vence a transferência local. Se a resolução canônica não estiver disponível, o envelope pode fornecer a keyword textual para recuperação local, desde que marca, artigo, versão, silo, vínculo principal e permissões coincidam. Conflitos bloqueiam antes da chamada DataForSEO.

## Persistência e recuperação

O armazenamento remoto usa as tabelas append-only alinhadas ao schema canônico de `supabase/migrations/0027_editorial_artifacts_workflow_serp.sql`. A migration `0003_radar_serp_snapshots.sql` é histórica e não deve ser aplicada. A aplicação tolera indisponibilidade do repositório: nesse caso o resultado real permanece no workspace local e é marcado `local_fallback`, nunca como persistência remota confirmada. Snapshots e revisões entram na recuperação local por marca. Se também não for possível salvar o recovery local, a ação falha sem declarar conclusão.

## Navegação do item

`Abrir no Radar` expande o próprio item e mostra o detalhe da pesquisa, histórico e decisão humana. `Ver no Arquiteto` é a navegação externa explícita. O deep-link recebido pelo Arquiteto é idempotente: resolve uma vez, não cria novos `Set` quando o estado já está correto e remove o identificador da URL após a resolução.

## Integração com o Planejador

O contexto editorial envia referências de snapshot (`artifactType: serp_snapshot`) somente para pesquisas reais aprovadas. Sem essa aprovação, o plano mantém a pendência humana explícita.

## Limites e segurança

Resultados padrão: 10, limitados a 100. Timeout padrão: 30 segundos, limitado entre 1 e 120 segundos. Não há retry, polling ou coleta em lote implícita. Testes usam fixtures e não fazem chamadas pagas.

## Critérios de aceite

Uma coleta válida aparece como real, normalizada, versionada e revisável; não expõe a chave; não envia ID técnico como query; não perde dados locais durante reload; não trata mock como evidência; e não transfere ao Planejador um item não aprovado.

## Arquivos do módulo e consumidores autorizados

Radar possui `app/(brand)/[brandRef]/radar/page.tsx`, `app/api/editorial/serp/route.ts`, `lib/radar/**`, `tests/radar-dataforseo-serp.test.mts`, `tests/radar-hydration.test.mts` e esta documentação. Os consumidores compartilhados atuais são `components/editorial-pipeline-context.tsx`, `lib/editorial/contracts.ts`, `lib/editorial/persistence-contracts.ts`, `lib/editorial/operational-flow.ts`, `lib/server/editorial-repositories.ts` e `app/api/editorial/workspace/route.ts`; `components/product/operational-pages.tsx` é referência histórica da extração. A página do Arquiteto somente envia snapshot aditivo de hidratação; nenhum ArticleDNA, SiloDNA, keyword, slug ou publicado é recriado ou alterado.
## Analise versionada e pagina propria

O Radar possui a rota `radar/[articleId]` com as abas estáveis `Resumo`, `SERP`, `Concorrentes`, `Estrutura observada`, `Semântica observada`, `Curadoria` e `Histórico`. A planilha continua sendo o overview operacional; `Abrir no Radar` navega para a página própria.

Cada analise e imutavel e registra modo (`kgr_light` ou `competitive_full`), recomendacao automatica, escolha humana, motivo opcional, usuario, data, hash e referencia da SERP. A recomendacao usa apenas a regra KGR estrita existente: KGR menor que 0,25 e volume menor ou igual a 250 sugere KGR leve. A escolha humana sempre prevalece.

A curadoria SERP e granular para resultados organicos, PAA, pesquisas relacionadas e Knowledge Graph. Itens nao selecionados continuam visiveis; selecao controla apenas acoes. Concorrentes so podem ser extraidos por acao explicita a partir de URLs organicas ja marcadas como `included`.

O extrator server-side aplica allowlist HTTP(S), bloqueio de localhost/IPs privados ou reservados, validacao DNS, redirects limitados, timeout, limite de bytes e content-type. A falha de uma pagina nao cancela as demais. Nenhuma URL externa e usada nos testes.

KGR leve produz benchmark consultivo. Competitivo completo produz media, mediana, min/max, faixa, outliers, distribuicao, decisoes estruturais com enforcement requerido e classificacao indicativa de competitividade. Nenhum benchmark vira meta rigida automaticamente.

O pacote aprovado para o Planejador preserva snapshot, hashes, itens incluidos, requisitos, recomendacoes, observado e decisoes humanas. Ele e aditivo ao ContentPlan e nao substitui uma versao existente sem nova acao humana. Campos futuros do Guardiao sao apenas preparatorios e nao alteram seu scoring.

## Regra de hidratacao e roteamento

`SerpSnapshot` e `SerpReview` podem existir antes de `RadarAnalysis` e devem ser exibidos independentemente dela. A pagina propria nao pode bloquear a visualizacao da SERP porque a analise ainda nao foi iniciada.

O identificador canonico da rota e `RadarItem.id`. Aliases publicados como `pub-k-*`, IDs de keyword e referencias de hidratacao sao compativeis apenas quando resolvem um unico item; nesse caso a pagina redireciona para a chave canonica e preserva a aba. Alias ambiguo nao pode escolher silenciosamente um artigo.

Recovery local valido e versoes de analise nao podem ser descartados por uma resposta remota vazia ou por um `RadarItem` remoto sem suas versoes locais. Iniciar analise deve ser idempotente e reutilizar o snapshot existente.

## Fronteira permanente de evidência

O Radar explica o que existe na busca. O Planejador decide como o artigo será construído. O Redator executa essa decisão. O Guardião verifica se o documento executou o ContentPlan aprovado.

Radar pode observar resultados, formatos, intenção, concorrentes, domínio próprio, estruturas, termos, entidades, lacunas, conflitos e força da SERP. Radar não define faixa final de palavras, quantidade de H2/H3, outline, tópicos obrigatórios, CTA, links internos ou metas cobradas pelo Guardião.

As abas da página própria usam os nomes `Estrutura observada`, `Semântica observada` e `Curadoria`. O pacote aditivo `RadarEvidencePackage` transporta observações, curadoria, proveniência, versão e hash para o Planejador; requisitos finais e ContentPlan permanecem responsabilidade do Planejador.

## Identidade editorial e proteção compreensível

O Radar mostra a identidade recebida do Arquiteto com marca, artigo, keyword principal, slug, canonical, publicação, silo, função, ArticleDNA, SiloDNA, SiloPage, transferência e versão das evidências. IDs técnicos ficam recolhidos em proveniência.

Conteúdo publicado exibe `Publicado e protegido`. Keyword principal, slug, canonical, marca e URL estrutural são somente leitura e preservados; o Radar pode recomendar atualização editorial sem alterar a identidade. Artigos novos também são somente leitura no Radar e apontam a revisão para o Arquiteto.

A comparação `Estratégia recebida x busca observada` normaliza `informativo`/`informacional`, não trata ausência em snippet como conflito definitivo e não compara função `Pilar`/`Suporte` com formato SERP. A aprovação não exige nota para keywords sem conflito; revisão no Arquiteto exige justificativa.

## Fechamento de usabilidade e coerência dos estados

Investigação, publicação da versão e transferência ao Planejador são estados independentes. A investigação só fica concluída quando não existem itens orgânicos pendentes, a amostra de concorrentes foi avaliada e as evidências estão organizadas. O envio anterior ao Planejador não conclui automaticamente a versão corrente.

O payload versionado pode registrar `plannerTransfer` com a versão de evidência enviada, data e ator. Uma atualização posterior deve ser exibida como disponível para envio e não pode duplicar artigo ou `ContentPlan`.

Benchmark estrutural compara apenas extrações editoriais completas de artigos. Vídeos, páginas parciais e formatos não comparáveis permanecem visíveis, mas ficam fora de média, faixa, outliers e decisões estruturais.

Termos semânticos de navegação, legal e plataforma são classificados como ruído contextual, sem desaparecer. A pessoa pode recuperar um termo explicitamente como tópico de conteúdo ou ignorá-lo; somente termos relevantes ou recuperados entram no pacote primário.

Quando uma etapa não recebeu um dado, a interface informa `Não recebido nesta etapa` e aponta a origem correta. O Radar não inventa URL, canonical ou confirmação de publicação.

## Contexto estratégico KGR recebido

O agrupamento e a validação das keywords acontecem no Arquiteto. O Radar recebe o artigo formado, utiliza o ArticleDNA como contrato e não reorganiza as keywords, remove KeywordDNA ou altera a keyword principal.

Quando existir classificação KGR recebida no KeywordDNA/ArticleDNA, o Radar preserva a classificação e sua origem, mostra o score e os volumes disponíveis e sugere `KGR leve` sem recalcular silenciosamente outro resultado pela SERP. Competição observada é evidência externa, não nova classificação.

Em artigos KGR, a principal forma o núcleo do artigo e as secundárias ampliam cobertura, demanda potencial e narrativa semântica. A composição recebida aparece com papéis, volumes individuais, soma bruta e limite estratégico de seis referências. A soma bruta sempre recebe aviso de sobreposição e não é apresentada como previsão direta de tráfego.

O Radar compara a principal com o slug sem alterá-los. Em artigo novo, desalinhamento registra `Revisar identidade no Arquiteto`; em publicado, registra `Identidade histórica publicada preservada`, não bloqueia a investigação e mantém principal, slug, canonical, marca e URL estrutural protegidos.

A hierarquia do silo é recebida do Arquiteto e exibida como Pilar/Suporte, ordem, silo e Pilar relacionado quando disponíveis. O Radar não recalcula hierarquia e não compara Pilar/Suporte com formato SERP.

O pacote aditivo `RadarEvidencePackage.kgrStrategy` carrega classificação, origem, principal, volume, KGR, alinhamento, composição, volumes declarados, aviso de sobreposição, hierarquia, proteção de publicação e papéis recebidos. Não carrega outline final, metas obrigatórias, CTA, densidade ou alteração dos DNAs.

## Relatorio competitivo e contexto do Planejador

O Radar pode consolidar um `RadarCompetitiveReport` versionado dentro do payload da analise e do `RadarEvidencePackage`, sem nova tabela ou migration. O relatorio referencia explicitamente RadarItem, ArticleDNA, SiloDNA, SerpSnapshot e a versao da analise; seu hash e proveniencia participam do pacote aprovado.

O relatorio organiza workflow, respostas e perguntas observadas, concorrentes diretos/parciais/por formato, perfil comparavel, metricas min/max/media/mediana, semantica, entidades, ruido, links, elementos visuais e necessidades competitivas. Paginas editoriais completas sao a unica amostra do benchmark; videos, parciais e formatos incompativeis permanecem visiveis e fora da media. Frequencia de keyword so e registrada quando sustentada pelo payload e nunca vira meta de densidade.

A sintese de resposta e curta, rastreavel e nao e copy. Necessidades e observacoes chegam ao Planejador como contexto; o Planejador continua decidindo outline, metas, CTA, links, estilo visual e ContentPlan. Aprovar o Radar consolida o relatorio na versao imutavel; qualquer mudanca posterior exige sucessora.

## Recebimento da SERP de formação do Arquiteto

Na importação de um ArticleDNA aprovado, o Radar pode receber `arquitetoKeywordDnaReferences`, `arquitetoKeywordUrlRelations`, `arquitetoArchitectureStatus`, `arquitetoKgrIdentity` e `arquitetoSerpAssessment` opcionais. Eles preservam a evidência de compatibilidade, relação keyword↔URL, arquitetura e identidade KGR recebidas do Arquiteto; não substituem a coleta/profundidade do Radar. A UI e o workflow do Radar não tomam decisão automática a partir deles.


## Fluxo organizado por modo — 2026-07-29

O detalhe do Radar apresenta cinco áreas canônicas: Resumo, Selecionar referências, Análise da amostra, Relatório e Histórico. Os antigos recortes de SERP, concorrentes, estrutura, semântica e curadoria permanecem como responsabilidades dentro dessas áreas, sem criar novas entidades ou alterar o contrato de persistência.

O modo é mostrado antes da investigação. KGR recebido sugere KGR leve; classificação não-KGR sugere Competitivo completo; ausência de KGR permanece explícita. A pessoa pode substituir a sugestão, registrar o motivo e iniciar a investigação usando o snapshot disponível. Abrir o Radar não coleta SERP automaticamente.

No KGR leve, a seleção é uma amostra leve de referências e não exige concorrente direto. No Competitivo completo, a seleção prioriza concorrentes diretos e amostra de três a cinco páginas comparáveis quando disponíveis. O artigo próprio pode aparecer como estado atual, mas nunca entra como concorrente ou benchmark; vídeos, redes sociais e formatos não editoriais aparecem como referências de formato e ficam fora da média estrutural.

O fluxo comum é: SERP coletada → Referências selecionadas → Páginas analisadas → Relatório gerado → Relatório aprovado → Enviado ao Planejador. Cada resultado orgânico possui uma única função: referência principal, apoio, formato, conteúdo próprio ou excluído. `Usar como referência` e `Usar como apoio` entram automaticamente na fila; a extração ocorre somente pela ação coletiva `Analisar referências selecionadas (N)`, e páginas já analisadas não são reprocessadas sem decisão explícita de atualização. A próxima ação é única e deriva do estado real.

Termos centrais recebidos do ArticleDNA/SiloDNA são exibidos como confirmados. Termos observados só aparecem para decisão quando há repetição, relevância, lacuna ou relação com a estratégia. Navegação, legal, plataforma e baixa recorrência ficam em Termos ignorados automaticamente, com recuperação manual. A interface usa Aguardando decisão, Considerar, Usar como apoio e Ignorar, sem expor pending como estado de usuário.

## Workbench operacional contextual — R3.2 — 2026-08-25

O Workbench operacional é governado pelo artigo selecionado na planilha. Sem artigo selecionado, permanece compacto, mostra `Selecione um artigo para trabalhar` e mantém SERP, Amazon, Conteúdo e Especialista desabilitados; não escolhe automaticamente a primeira linha. Com artigo selecionado, exibe claramente a identidade do artigo, a próxima ação e somente os dados daquele `RadarItem`, preservando `brandId`, `articleId` e `articleDnaVersionId`.

O estado de investigação, dados, expansão e próxima ação é independente por artigo. Trocar a linha ativa troca o modelo inteiro do Workbench e não mistura SERP, relatório, conteúdo ou especialista de artigos diferentes. As quatro áreas são cards compactos com resumo e status; no máximo uma fica expandida. Amazon pode permanecer `Não aplicável` e não cria provider, chamada externa ou `ProductEvidence` nesta etapa.

O relatório consolidado fica recolhido por padrão em uma faixa compacta e só exibe prévia, aprovação, transferência e ações compatíveis quando aberto. A planilha permanece como a superfície dominante da viewport; o Workbench fechado não usa altura rígida e deve ocupar aproximadamente um terço da área útil em desktop. Seleção, expansão e troca de contexto não criam versão, não chamam provider e não persistem remotamente.

## Fila sequencial e foco contextual — R4 — 2026-08-25

O Workbench operacional é contextual ao `focusedArticleId`, enquanto `selectedArticleIds[]` controla somente ações coletivas. Sem foco, o Workbench mostra apenas a instrução de seleção e quatro cards neutras/desabilitadas; com foco, mostra o título e os dados exclusivos daquele artigo. A planilha é a superfície dominante e permanece imediatamente abaixo do Workbench.

Cada artigo mantém estado independente para SERP, Amazon, Conteúdo, Especialista e Relatório. A fila SERP de lote é inicialmente local, sequencial e explicitamente iniciada por ação humana. Ela não dispara provider ao selecionar artigo ou abrir o Workbench e usa `QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE` e `FAILED_FINAL` por item.

Bulk Operations Bar calcula `eligible`, `alreadyDone` e `blocked` por operação sem misturar processos. Preparação de tópicos e relatório é local e revisável; aprovação de pautas é um gate humano obrigatório antes de qualquer envio. O estado do especialista pode avançar localmente até `READY_TO_SEND`, mas não representa Telegram persistido nem automação remota.

O Radar reutiliza o sistema de avisos da sessão e não cria tabela de notificações. A auditoria atual registra `BATCH_PROCESSING_CAN_REUSE_EXISTING_JOBS = PARTIAL`: os jobs/Local Worker existentes são específicos da fundação de contribuições externas e não autorizam uma nova fila SERP genérica. Qualquer alteração estrutural, migration, RLS, persistência Telegram, worker genérico ou contrato global é `BLOQUEADO — PLANNER GERAL` até decisão e autorização próprias.

## Refinamento R4.1 — fila sequencial e contexto por artigo — 2026-08-26

O `focusedArticleId` identifica o único artigo exibido no Workbench; `selectedArticleIds[]` não altera o foco e alimenta apenas operações coletivas. A planilha permanece a superfície principal. Sem foco, o Workbench fica compacto, informa `Selecione um artigo para trabalhar` e mantém as quatro áreas desabilitadas. Com foco, título, status, próxima ação, relatório e dados pertencem exclusivamente ao artigo ativo.

Cada operação coletiva calcula sua própria elegibilidade e não presume que o estágio de SERP, Amazon, tópicos, especialista ou relatório seja global. Os resultados possíveis são `eligible`, `alreadyDone`, `blocked` e `notApplicable`. A fila SERP local somente inicia por ação explícita, processa itens em sequência e separa coleta, revisão e aprovação humana. Selecionar, abrir, trocar artigo ou expandir card não chama provider.

Amazon permanece opcional e deve declarar um de `AMAZON_APPLICABLE`, `AMAZON_NOT_APPLICABLE`, `AMAZON_PENDING` ou `AMAZON_REVIEWED` no estado local quando houver essa informação. A preparação do especialista usa ArticleDNA, análise SERP, estado Amazon e material existente como contexto; seus tópicos são uma cópia de trabalho revisável e não alteram ArticleDNA, SiloDNA ou ContentPlan. O envio só pode ser habilitado após revisão humana local.

Enquanto não houver gate estrutural aprovado, estados de fila, relatório pronto para revisão, tópicos, avisos e respostas do especialista permanecem locais à sessão. Não criar tabela de notificações, job genérico, migration, RLS ou pipeline remoto paralelo; Telegram, DeepSeek, STT e Storage continuam dependências externas não verificadas.

## Seleção canônica da planilha — 2026-08-27

Esta regra substitui somente a separação de foco e seleção descrita nas seções R4/R4.1/R5. O Radar mantém duas projeções locais: `selectedArticleIds[]`, que identifica todos os artigos marcados para operações coletivas, e `activeArticleId`, que identifica o único artigo aberto no Workbench. Elas obedecem sempre a `activeArticleId === null || selectedArticleIds.includes(activeArticleId)` e, quando existe qualquer seleção, deve existir artigo ativo. Portanto não há linha marcada com Workbench vazio nem linha `Em foco` desmarcada.

Checkbox de uma linha seleciona e ativa esse artigo no mesmo evento; clique normal da linha também seleciona e ativa esse artigo. A seleção múltipla permanece: a última linha marcada torna-se ativa, enquanto a Bulk Operations Bar continua contando todas as marcadas. Ao desmarcar artigo não ativo, o Workbench permanece no artigo ativo; ao desmarcar o ativo, o último artigo ainda selecionado assume o contexto; ao desmarcar o último, seleção e Workbench voltam ao estado vazio. O checkbox do cabeçalho seleciona os artigos visíveis e preserva o ativo quando ainda selecionado; ao desmarcá-lo, limpa seleção e Workbench. O chevron continua sendo apenas expansão de perfil e não altera seleção ou contexto.

As transições são locais ao componente e não criam versões, não chamam provider, não persistem remotamente e não alteram ArticleDNA, SiloDNA, DataForSEO, ExpertBrief ou Telegram.

## Subnavegação contextual da SERP — 2026-08-27

A expansão SERP do Workbench contém as subabas Coleta, Concorrentes, Análise,
Evidências, Revisão e Histórico. Elas não criam rota, página, estado
persistido ou chamada externa. O artigo ativo fornece todo o contexto; ao
trocar de artigo, a montagem contextual escolhe a etapa sugerida mais
relevante sem carregar seleção, análise, evidência, revisão ou histórico do
artigo anterior.

nextSerpStep é a única projeção de etapa sugerida: sem snapshot sugere Coleta;
sem curadoria ou com decisões pendentes sugere Concorrentes; com amostra
pendente sugere Análise; com necessidades/evidências observadas sugere
Evidências; com preparação suficiente sugere Revisão; e após aprovação sugere
Histórico. A navegação continua livre: pré-requisitos bloqueiam apenas a ação
dependente, nunca a visualização da subaba.

Concorrentes é a área operacional exclusiva da curadoria; Análise usa somente
a seleção canônica e só é recalculada por ação explícita. Evidências separa
SerpEvidence, ExternalEvidence, ExpertEvidence e ProductEvidence, não promove
URLs automaticamente e não cria persistência enquanto o contrato não suportar.
Revisão concentra a aprovação, que continua exigindo write e readback reais.
Anterior e Próxima pendente pertencem apenas à fila de Revisão. Histórico
mantém snapshots, provider, datas e revisão inline; Curadoria detalhada
permanece somente rota legada de diagnóstico.

## Contrato operacional R5 — fila sequencial por artigo

O Workbench continua sendo uma visão contextual do artigo focado; `selectedArticleIds[]` controla somente ações coletivas. O processamento padrão da SERP é `ELIGIBLE` somente quando não existe snapshot real para o artigo. Snapshot existente é `ALREADY_DONE` e só pode ser reprocessado por refresh explícito. Falta de keyword coerente, falha final ou ausência de contexto canônico resulta em `BLOCKED`.

O lote SERP usa o handler canônico existente e executa um artigo por vez. Cada item mantém `QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE` ou `FAILED_FINAL`. Uma falha não cancela os demais itens; retry é individual. Seleção, foco, abertura de card e reload não chamam provider automaticamente.

Snapshots e reviews já carregados pelo pipeline são a fonte para recuperar `WAITING_REVIEW` e `COMPLETED` após reload. A fila em andamento permanece local enquanto não houver job remoto autorizado para Radar; não criar `external_processing_jobs` genérico, migration ou RLS nesta etapa.

A revisão SERP é individual, vinculada ao snapshot real do artigo focado e registrada pelo consumidor canônico `reviewSerp`. A fila oferece anterior/próximo; aprovação coletiva de artigos não substitui revisão do snapshot. O progresso do lote só aparece enquanto houver item pendente ou falho.

Pautas do especialista são uma cópia de trabalho derivada do ArticleDNA, necessidades/lacunas SERP, referências aprovadas, estado Amazon e material existente disponível. DeepSeek é resolvido pela Connection/capability canônica server-side e retorna somente 3–5 pautas com origem, justificativa e necessidade. O resultado não cria artigo, versão, DNA, ContentPlan ou envio Telegram. Cada pauta passa por revisão humana individual antes do gate coletivo; edição, remoção, adição, reordenação e desfazer/refazer permanecem locais.

Telegram permanece fora da execução R5 enquanto a fundação remota, jobs, webhook/bot e idempotência não forem comprovados por autorização própria. O estado executável é `REAL_TELEGRAM_SEND=BLOCKED_BY_DATABASE`; áudio/STT só pode ser considerado depois de smoke de texto end-to-end.

## Contrato operacional R6 — contexto de especialista e relatório consolidado — 2026-08-26

O Workbench visual do R5 fica congelado. O Radar mantém quatro áreas compactas, planilha dominante e contexto de um único artigo focado. A seleção coletiva continua controlando somente ações de lote; não existe estado global que substitua os estados independentes de SERP, Amazon, Especialista e Relatório.

O builder canônico local `buildExpertTopicContext(articleId)` recebe somente o ArticleDNA correto e as referências já existentes de KeywordDNA, SiloDNA, SERP revisada, referências aprovadas, necessidades, lacunas, conflitos, Amazon e conteúdo existente do especialista. Toda proveniência deve apontar para envelope, snapshot, análise, evidência ou material real recebido. IDs de pautas são criados apenas depois da resposta e nunca servem como fonte enviada à IA.

O consumer de tópicos é o DeepSeek canônico server-side. A resposta exige de 3 a 5 perguntas objetivas, cada uma com origem, justificativa, necessidade/lacuna e referência. Perguntas repetidas ou já conhecidas pelo contexto são rejeitadas localmente. A resposta nasce como cópia de trabalho em `TOPICS_READY_FOR_REVIEW`; não cria artigo, altera ArticleDNA/SiloDNA/ContentPlan ou aprova envio.

Cada pauta mantém proveniência e revisão humana individual. Edição, adição, remoção, reordenação, desfazer/refazer e restauração são locais. O gate coletivo só aprova artigos cujas pautas foram revisadas individualmente; `Proposto pela IA` e `Aprovado para envio` são estados diferentes. No Dossiê Conteúdo, pauta é solicitação, nunca `ExpertEvidence`.

O modelo local `RadarR6ConsolidatedReport` reúne ArticleDNA, SERP Evidence, Amazon Evidence quando aplicável e ExpertEvidence quando existir. O relatório pode ser gerado como prévia sem especialista quando `NOT_REQUIRED`; se o especialista for necessário e ainda não houver contribuição revisada, a prévia exibe pendência e não é final. `REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED` são gates distintos. A aprovação exige SERP revisada, relatório revisado e ausência de contribuição pendente; persistência local não equivale a aprovação humana nem cria versão remota.

O handoff ao Planejador continua compatível para o pacote Radar já existente, mas o acréscimo de Amazon/ExpertEvidence do R6 exige mudança estrutural do contrato/consumidor atual. O Radar registra `PLANNER_HANDOFF_CONTRACT=STRUCTURAL_CHANGE_REQUIRED` e `BLOQUEADO — PLANNER GERAL`; não altera o Planejador nesta frente.

Telegram, ExpertBrief, binding, envio e webhook permanecem condicionados à fundação remota. O Radar não afirma `READY` sem prova remota autorizada. Conteúdo existente aceita YouTube, podcast, vídeo, áudio e documento nos estados `LINK_REGISTERED`, `AWAITING_FILE` e `IGNORED_FOR_ARTICLE`, sem download. O contrato de contribuição pode preservar asset original, referência de storage, transcrição e material organizado; STT permanece fora do R6.

## Contrato operacional R7 — fila sequencial, evidência e isolamento — 2026-08-26

O Workbench R6/R5/R4 fica congelado. O artigo selecionado continua governando o contexto inteiro; a planilha é a superfície dominante e não há estado global entre artigos. A matriz local do R7 classifica cada área como dado derivado de fonte real, persistido quando comprovado, reconstruível, local-only ou fixture. Um estado de sessão nunca pode receber texto visual que sugira persistência remota.

`buildExpertTopicContext(articleId)` é o único contexto permitido para preparar pautas. Ele deve carregar o ArticleDNA e a marca do artigo focado, as referências de KeywordDNA/SiloDNA, SERP e revisão corretas, necessidades/lacunas/conflitos, estado Amazon e material existente. A validação R7 exige 3–5 pautas, rejeita duplicidade, perguntas conhecidas, referência/origem ausente, necessidade não relacionada e qualquer origem fora da proveniência. Uma resposta truncada ou schema inválido falha fechada.

Pautas continuam sendo `QUESTION`/`NEED` e cópia de trabalho. `CONTRIBUTION` só existe quando uma entrada do especialista é recebida pelo caminho canônico; `ExpertEvidence` só existe depois de contribuição e revisão humana. Falha de IA não pode apagar uma fila válida anterior. Fixture de contribuição só pode ser renderizada sob flag explícita de teste; artigo real não recebe perguntas, material ou entidades do fixture.

O relatório local reúne ArticleDNA, SERP, Amazon e `ExpertEvidence`, mas não inventa conclusão quando uma evidência está ausente. `AMAZON_PENDING` e Amazon aplicável ainda não revisada permanecem pendências. As ações são `gerar/atualizar → revisar → aprovar`; aprovação local exige SERP revisada e ausência de pendências. O gate registra fingerprint das evidências; mudança de snapshot, referência, Amazon ou especialista torna a aprovação obsoleta e exige nova revisão. Nenhuma ação cria versão remota, envia Telegram ou aprova Planejador automaticamente.

Original, transcrição e organização são camadas independentes e imutáveis quando marcadas como origem. Fixtures locais podem provar o encadeamento Update → binding → brief → contribuição → Radar e preservar uma faixa temporal de áudio, mas não provam STT, Storage, Telegram, webhook, writeback ou `ExpertEvidence` remoto.

O Radar produz um relatório local rico, com ArticleDNA, SERP, Amazon/ExpertEvidence, proveniência e fingerprint de aprovação. O consumer atual do Planejador aceita o pacote `RadarEvidencePackage` com `schemaVersion`, `packageType`, identidade de marca/artigo/ArticleDNA, SERP, modo/análise, resultados curados, perguntas/entidades, estrutura/semântica/competitividade, observações de keyword, conflitos, notas humanas, versão, hash e proveniência. Ele não aceita os campos completos de Amazon/ExpertEvidence, camadas de contribuição ou o fingerprint R7. Portanto `PLANNER_CONTRACT_AUDIT=STRUCTURAL_CHANGE_REQUIRED` e `PLANNER_ADAPTER=BLOCKED_BY_PLANNER_GERAL`; qualquer evolução é frente do Planner Geral.

O Local Worker existente deve ser auditado apenas contra a fundação já aplicada: claim/lease, retry/backoff, estados, asset original e writeback. A ausência de prova de migration/RLS/readback remotos mantém `TELEGRAM_REMOTE_FOUNDATION=BLOCKED_BY_DATABASE`. Não criar migration, schema, RLS, fila genérica, adapter de Planner ou chamada real sem autorização própria.

## Fase funcional 1 — Especialista e ExpertBrief — 2026-08-26

O fluxo funcional do Especialista só é ativado para um artigo selecionado e
mantém o contexto exato de `brandId`, `articleId`, `articleDnaVersionId` e
`expertId`. A lista de especialistas vem de `brand_experts` em status
`active`; memberships, owner, nome, e-mail ou identidade Telegram não
substituem essa entidade. Sem especialista utilizável, o Radar informa a
ausência e encaminha o cadastro para Marca, sem criar entidade silenciosa.

O contexto da pauta é uma projeção do ArticleDNA, KeywordDNAs, SiloDNA, SERP e
referências já aprovadas, necessidades, lacunas, conflitos, estado Amazon e
material existente. `LACUNAS OBSERVADAS` e `PERGUNTAS AO ESPECIALISTA` são
superfícies distintas. Pergunta é cópia de trabalho; contribuição recebida,
revisão humana e `ExpertEvidence` continuam estados posteriores e não são
inventados pelo ExpertBrief.

`Criar pauta` abre uma cópia nova; `Salvar pauta` cria o registro remoto quando
ele ainda não existe e usa atualização quando há `briefId`. A API nunca cria
duplicata ao editar uma pauta existente. Toda criação/atualização exige
confirmação e readback do mesmo tenant, artigo, versão e especialista antes de
informar sucesso. O status usa os valores já aceitos por `expert_briefs`; a
revisão humana pode registrar `reviewed`. Hash ou versão adicional da pauta só
serão exibidos se existirem no contrato remoto, sem mecanismo inventado pelo
Radar.

O `TelegramExpertBinding` é apenas informativo no fluxo de criação e
salvamento. O Radar não exibe token, segredo, chat ou configuração do Bot, não
envia mensagem automaticamente e não transforma vínculo configurado em
contribuição recebida. O botão de envio permanece explicitamente pendente até
que uma tarefa própria implemente e homologue o envio explícito. Sugestões de
IA só são solicitadas pela ação humana `Gerar sugestões`; o retorno permanece
editável e não aprovado. A fixture médica continua limitada ao modo de teste
explícito e não é renderizada no detalhe real do artigo.

## Fase funcional real — ExpertBrief → Telegram → ExpertEvidence — 2026-08-26

O ExpertBrief continua pertencendo ao artigo, versão do ArticleDNA, Marca e
especialista exatos. `POST`/`PATCH` só informam sucesso após readback remoto
compatível. A gravação não envia Telegram. O envio é uma ação separada e
explícita: exige pauta revisada, binding ativo único, perguntas válidas e
contexto exato; reserva o brief antes do provider, persiste o estado canônico
após confirmação do Telegram e retorna readback sem expor `telegramChatId`,
`telegramUserId` ou `messageId` à interface.

O inbound Telegram é resolvido por `brandId`, binding e brief explicitamente
selecionado. Somente brief enviado pode receber contribuição. Texto é gravado
como original; voz/áudio/documento cria job de preservação. Duplicatas de
update/contribuição/job são tratadas por suas chaves existentes. Falta de
seleção ou ambiguidade produz pendência explícita e nunca escolhe a última
pauta.

O Dossiê deve manter quatro camadas distinguíveis: solicitação/pauta,
contribuição original, transcrição fiel e organização editorial. A contribuição
não é evidência aprovada. `ExpertEvidence` é uma projeção vinculada a
`brandId`, artigo, `articleDnaVersionId`, expert, brief, contribuição,
proveniência e decisão humana. Aceite, apoio, citação, rejeição,
classificação e relação com necessidade são decisões do Radar; não alteram
ArticleDNA, SiloDNA ou a fala original. Conteúdo ilegível ou decisão pendente
fica fora da evidência aprovada.

O worker local processa um job por ciclo, mantém claim/lease/heartbeat,
retry/backoff e follow-ups por contribuição. O asset original é gravado em
`original_asset_uri` quando o armazenamento retorna sucesso; a transcrição é
gravada em `transcript_text` e a organização em `organization_payload`, sem
sobrescrever camadas anteriores. Storage e Speech-to-Text são server-side. A
organização DeepSeek não pode inventar, corrigir editorialmente ou completar a
fala; citações temporais só podem aparecer quando fornecidas pelo provider.

Relatório aprovado e handoff Radar → Planejador devem carregar somente
ExpertEvidence revisada e preservam o handoff v2 existente. O detalhe reabre a
revisão quando a evidência atual diverge do conjunto usado na aprovação. O
Planejador continua fora do módulo proprietário: nenhuma alteração de contrato
ou consumidor é permitida nesta fase.

## Contrato operacional — SERP unificada no Workbench — 2026-08-26

A operação normal da SERP ocorre na expansão `SERP` do Workbench do artigo
selecionado, na ordem `Coleta → Concorrentes → Análise → Revisão → Aprovação`.
Abrir o Radar, selecionar o artigo ou expandir a área não chama DataForSEO. A
coleta é a única ação que pode atualizar o provider e continua explícita por
`Atualizar SERP`. O painel deve mostrar todos os resultados orgânicos do
snapshot, sem promover automaticamente os primeiros resultados a concorrentes.

As decisões de seleção, apoio, formato, exclusão e pendência usam o contrato
existente `RadarAnalysisVersion.payload.serpDecisions`. A chave histórica
`organic:<position>` é preservada por compatibilidade, mas nenhuma decisão é
projetada sem coincidência exata de marca, artigo, versão do ArticleDNA,
snapshot, versão do snapshot e hash. A identidade visual de uma linha também
inclui snapshot, posição e URL; troca de artigo, rerender, reload ou novo
snapshot não pode misturar decisões.

Cada decisão humana gera uma sucessora da análise e só é refletida como
persistida após o write existente e readback correspondente. Se a persistência
remota estiver indisponível, a recuperação local pode preservar a cópia de
trabalho, mas a interface deve declarar a limitação e não emitir sucesso remoto.
Revisão e aprovação usam a mesma seleção canônica, bloqueiam pendências dos
resultados orgânicos e respostas stale, e referenciam `brandId`, `articleId`,
`articleDnaVersionId` e snapshot exatos. PAA, related searches e Knowledge
Graph são evidências complementares somente leitura no fluxo normal: entram
como contexto da análise, permanecem recolhíveis e não exigem uma decisão de
concorrente para liberar a aprovação da SERP.

A análise de páginas recebe somente concorrentes/referências selecionados.
PAA, related searches e Knowledge Graph são contexto complementar recolhível;
não substituem páginas comparáveis. O resumo de revisão deve expor
concorrentes selecionados, referências aprovadas, necessidades, lacunas e
conflitos antes da aprovação.

A rota `radar/[articleId]` e os aliases antigos permanecem para deep links,
histórico, diagnóstico, relatório detalhado e evidências adicionais. Nenhuma
função necessária ao fluxo SERP normal pode exigir a navegação para essa rota;
isso não altera o contrato do Planejador, Arquiteto, ArticleDNA, schema,
migrations, RLS ou providers.
