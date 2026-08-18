# Spec — Radar

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
- Coletar e normalizar SERP via Serper.dev em uma fronteira server-side.
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

O snapshot real nasce em `needs_review`. `origin: real`, `isMock: false`, `provider: serper` e `humanDecisionRequired: true` são obrigatórios. O mock continua separado, explícito e não pode ser aprovado como evidência real.

## Contrato HTTP

`POST /api/editorial/serp` aceita `action: collect` ou `action: review`.

- `collect` exige sessão, acesso à marca, permissão `radar:edit`, ArticleDNA coerente e keyword principal resolvida por vínculo canônico/alias e silo pertencente à marca. A chave Serper permanece no servidor.
- `review` exige sessão, acesso à marca, permissão `radar:review` e snapshot real pertencente ao artigo/marca.
- Erros de configuração, migration/tabela, conexão, autenticação, permissão, timeout, resposta HTTP e resposta inválida são retornados com códigos distintos, sem fallback silencioso para mock.
- `collect` e `review` exigem `RadarSerpResolutionEnvelope` hashado. A rota valida o envelope antes de resolver ou chamar o provider; uma keyword remota canônica, quando disponível, vence a transferência local. Se a resolução canônica não estiver disponível, o envelope pode fornecer a keyword textual para recuperação local, desde que marca, artigo, versão, silo, vínculo principal e permissões coincidam. Conflitos bloqueiam antes da Serper.

## Persistência e recuperação

O armazenamento remoto usa as tabelas append-only previstas em `supabase/migrations/0003_radar_serp_snapshots.sql`. A aplicação tolera a ausência da migration: nesse caso o resultado real permanece no workspace local e é marcado `local_fallback`, nunca como persistência remota confirmada. Snapshots e revisões entram na recuperação local por marca. Se também não for possível salvar o recovery local, a ação falha sem declarar conclusão.

## Navegação do item

`Abrir no Radar` expande o próprio item e mostra o detalhe da pesquisa, histórico e decisão humana. `Ver no Arquiteto` é a navegação externa explícita. O deep-link recebido pelo Arquiteto é idempotente: resolve uma vez, não cria novos `Set` quando o estado já está correto e remove o identificador da URL após a resolução.

## Integração com o Planejador

O contexto editorial envia referências de snapshot (`artifactType: serp_snapshot`) somente para pesquisas reais aprovadas. Sem essa aprovação, o plano mantém a pendência humana explícita.

## Limites e segurança

Resultados padrão: 10, limitados a 100. Timeout padrão: 30 segundos, limitado entre 1 e 120 segundos. Não há retry, polling ou coleta em lote implícita. Testes usam fixtures e não fazem chamadas pagas.

## Critérios de aceite

Uma coleta válida aparece como real, normalizada, versionada e revisável; não expõe a chave; não envia ID técnico como query; não perde dados locais durante reload; não trata mock como evidência; e não transfere ao Planejador um item não aprovado.

## Arquivos do módulo e consumidores autorizados

Radar possui `app/(brand)/[brandRef]/radar/page.tsx`, `app/api/editorial/serp/route.ts`, `lib/radar/**`, `tests/radar-serper-provider.test.mts`, `tests/radar-hydration.test.mts` e esta documentação. Os consumidores compartilhados atuais são `components/editorial-pipeline-context.tsx`, `lib/editorial/contracts.ts`, `lib/editorial/persistence-contracts.ts`, `lib/editorial/operational-flow.ts`, `lib/server/editorial-repositories.ts` e `app/api/editorial/workspace/route.ts`; `components/product/operational-pages.tsx` é referência histórica da extração. A página do Arquiteto somente envia snapshot aditivo de hidratação; nenhum ArticleDNA, SiloDNA, keyword, slug ou publicado é recriado ou alterado.
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
