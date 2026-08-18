# Spec — Arquiteto

## Regra compartilhada de formação — 2026-07-21

O Arquiteto é proprietário da formação: exatamente uma principal e até cinco keywords de apoio, com no máximo seis referências. A principal herda a intenção dominante e orienta slug candidato, KGR, volume e limites do ArticleDNA; secundárias exigem compatibilidade editorial e não substituem a principal. KGR só é qualificado quando há evidência real do Minerador e vínculo principal–slug compatível.

## 26. Intenção editorial, formato SERP e perfil KGR

Novos ArticleDNAs carregam `intentProfile`: a intenção principal é herdada da KeywordDNA da principal, com valor canônico e rótulo original preservado. Intenções de secundárias/reforços são sinais individuais e não sobrescrevem `mainIntent`; CTA não muda a intenção editorial. `Pilar`, `Suporte` e `Reforço Narrativo` são hierarquia, nunca formato SERP. Formato só é comparado quando explicitamente informado como formato editorial; caso contrário, permanece não definido.

O avaliador do Arquiteto trata snippets como evidência parcial. Ausência textual vira limitação `Cobertura não observada nos snippets`/`Evidência insuficiente`, nunca separação automática. `validationProfile` pode ser `standard`, `kgr_light`, `published_architecture` ou `published_strengthening`. KGR confirmado consulta a principal primeiro, amplia somente diante de ambiguidade e registra `queriedKeywordDnaIds` sem remover referências KeywordDNA. Confiança baixa ou inconclusiva bloqueia recomendações destrutivas. Assessment novo preserva a versão anterior e marca-a como `Desatualizado por correção do avaliador`.
## 1. Propósito
Transformar keywords em arquitetura editorial rastreável.
## 2. Responsabilidades
Agrupamento lógico e por IA, revisão de keywords, ArticleDNA, SiloDNA, SiloPage, anotações, proteção de publicados e envio ao Radar.
## 3. Fora de responsabilidade
Não coleta SERP real, não aprova automaticamente nem publica.
## 4. Entidades
KeywordDNA, ArticleDNA, SiloDNA, SiloPage, versão, evento, anotação, snapshot e conflito.
## 5. Jornada
Importar keywords localizadas, agrupar, revisar, gerar propostas, validar gates humanos e transferir Articles aprovados ao Radar.
## 6. Regras de negócio
ArticleDNA usa 2–6 keywords; IA não aprova; published guard bloqueia campos estruturais; SiloDNA e SiloPage são distintos. **Confirmado por teste.**
## 7. Estados
Rascunho, análise, conflitos, aguardando aprovação, aprovado, bloqueado e enviado ao Radar.
## 8. Ações
Agrupar, revisar, gerar DNAs/página, anotar, aprovar, recuperar, auditar e enviar.
## 9. Entradas
Keywords por marca, contexto da marca, grupos e decisões humanas.
## 10. Saídas
Envelopes versionados, eventos e itens elegíveis ao Radar.
## 11. Contratos com outros módulos
Consome Minerador; entrega ArticleDNA/SiloPage aprovados ao Radar; usa contratos editoriais compartilhados.
## 12. Proteções
Hash, proveniência, imutabilidade, limite de keywords, marca, published guard, IndexedDB para recuperação e rejeição de conclusão vazia. Consultas browser exigem sessão NextAuth autenticada e um JWT Supabase atual, validado com margem de 60 segundos; o cliente compartilhado usa `accessToken` dinâmico e resultado estruturado (`ok`, `token`, `reason`, `expiresAt`), e SELECT pode repetir uma vez após refresh. Falhas de troca Google, ausência de token, claims inválidos e expiração são estados distintos; apenas expiração efetiva ou falha de refresh após vencimento recebe mensagem de sessão expirada.
## 13. Casos de borda
Keyword sem localização, hidratação ausente, referência divergente, resposta parcial de IA e artefato órfão.
## 14. Arquitetura técnica atual aprovada
Página cliente, domínio em `lib/arquiteto`, APIs estruturadas e contexto editorial. A persistência final de SiloPage ainda é parcial.
## 15. Critérios de aceite
Nenhum artefato incompleto/sem marca chega a aprovado ou é transferido.
## 16. Fora do escopo atual
Nova execução de IA antes de reconciliação da integridade.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/arquiteto/page.tsx`, `app/api/arquiteto/**`, `lib/arquiteto/**`.
## 18. Arquivos compartilhados consumidos
`components/editorial-pipeline-context.tsx`, `lib/editorial/**`, `lib/server/structured-ai.ts`.
## 19. Arquivos proibidos sem autorização

## Integridade recebida do Minerador

O Arquiteto recebe keywords já tenantizadas por `brand_id`. `lista_id` pode ser nulo sem invalidar a keyword; quando houver lista, ela deve pertencer à mesma marca. O Arquiteto não exclui keywords por estarem sem lista e deve preservar a localização recuperável ou encaminhar a keyword para `Keywords não agrupadas`.

## Rebase canônico do patrimônio do Minerador

Keywords válidas `aprovado` e `publicado` da Brand podem entrar no fluxo canônico do Arquiteto uma única vez. `publicado` conserva seu status e todas as proteções de URL, slug, canonical, Brand e política da principal; ele não é convertido em `aprovado` para fins de entrada.

A elegibilidade é server-side e considera somente a mesma Brand, workflow `keyword/architect` operacional e referências de ArticleDNA canônico válido. Marcadores de `localStorage`, IndexedDB, `importedKeywordIds`, estado incorporado legado e qualquer marcador histórico não são autoridade de sucesso. O recovery/rebaseline histórico foi abandonado no runtime; workflow remoto não-`received` é conflito explícito e não é convertido automaticamente em `received`.

O read model distingue disponível, recebida, incorporada em ArticleDNA novo, publicada protegida e descartada/inválida. Estados de workflow remotos desconhecidos impedem o bootstrap até investigação. A operação em massa é server-side, autenticada, autorizada por Brand, idempotente e depende de preflight sanitizado e aprovação humana; não modifica dados estratégicos do Minerador.

## 20. Referencia de identidade publicada

`ArticleDNA` pode carregar `publishedIdentityRef` como referencia opcional e compacta da identidade publicada. Esse campo preserva a relacao com `PublicationRecord`/`OperationalPublication`, mas nao altera a imutabilidade do ArticleDNA nem substitui a fonte canonica de slug, canonical, URL, marca ou keyword principal. O Planejador deve bloquear divergencias conhecidas e manter a protecao conservadora.

## 21. SERP de formação do artigo

O Arquiteto possui a ação explícita `Validar agrupamento pela SERP`. Ela valida a compatibilidade do grupo selecionado antes da aprovação e não é executada em carregamento, importação, seleção ou geração de DNA. Cada keyword recebe snapshot e recomendação humana versionados; seguir altera somente a cópia de trabalho da keyword e ignorar registra a decisão sem alterar agrupamento. O Radar continua responsável pela SERP profunda do artigo já formado.

## 22. Identidade publicada e verificação

`publishedIdentityRef` pode carregar URL publicada e canonical vindos de uma fonte coerente de KeywordDNA, IDs de origem e verificação online. URL divergente vira conflito; sem URL o Arquiteto mostra ausência e não inventa destino. A verificação é explícita, server-side, brand-scoped e não sobrescreve identidade publicada.

## 24. Modos SERP por estado editorial

Assessments novos carregam `assessmentMode`: `formacao` para artigos sem publicação, `arquitetura_publicado` para publicados sem principal/arquitetura consolidadas e `fortalecimento` para principal confirmada com arquitetura confirmada ou vínculo KGR confirmado. A formação e a arquitetura do publicado podem sugerir mudanças na cópia de trabalho; o fortalecimento trabalha ao redor da identidade consolidada. Em todo publicado, URL, slug, canonical e marca são restrições de entrada. Secundárias e reforços continuam sujeitos a decisão humana, preservando KeywordDNA e exigindo nova aprovação quando a cópia de trabalho mudar.

## 25. Relação keyword/URL, arquitetura e KGR

O Arquiteto preserva `keywordUrlRelation`, `architectureStatus` e `kgrIdentity` quando recebidos do Minerador, sem misturar relação, arquitetura, publicação ou aprovação. `candidate_primary` e estados arquiteturais pendentes não protegem a principal. A principal só é estruturalmente protegida com `confirmed_primary` + `architecture_confirmed`, ou com KGR confirmado contendo principal KeywordDNA e slug vinculados. A coincidência textual entre keyword e slug não confirma KGR. O ArticleDNA mantém esses campos, as referências individuais, snapshots integrais, evidências, decisões e histórico versionado.

## 26. ArticleDNA como contexto estratégico

O ArticleDNA expõe, de forma aditiva e determinística, `intentProfile`, `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose`. A intenção do artigo é herdada da principal. Secundárias representam expansão compatível de alcance/volume; `reforco_narrativo` representa cobertura semântica e não recebe volume inventado. Volume desconhecido permanece `null`.

`ArticleControlContext` é derivado do ArticleDNA para IA, SERP e transferência operacional. Ele concentra identidade, intenção, KGR, volume, hierarquia, propósito e ações permitidas/protegidas/proibidas. Não é uma nova entidade persistida e não substitui os campos de origem.

KGR confirmado vincula principal e slug. KGR novo permanece candidato até confirmação arquitetural humana; slug divergente produz conflito. Publicado candidato protege URL, slug, canonical e marca, mas mantém a principal corrigível. Publicado com arquitetura/KGR confirmados protege também a principal.

O limite de formação permanece entre 2 e 6 KeywordDNAs, sem preenchimento artificial. A hierarquia considera volume, centralidade semântica, abrangência tópica, capacidade de ligação no silo e prioridade de negócio; volume não decide sozinho.

## 27. Criador manual de silo

O modal do Arquiteto não solicita `Nicho`. A marca ativa fornece o contexto de marca; o usuário informa o nome editorial do silo e sua keyword/entidade central. Essa entidade pertence ao SiloDNA e não é automaticamente uma keyword principal de artigo. Quando houver uma referência real de KeywordDNA, ela pode ser preservada; quando não houver, a entidade permanece manual sem ID falso.

A criação do SiloDNA é independente da SiloPage e pode ocorrer sem artigos. A criação da SiloPage é opcional e recebe slug próprio, situação `new` ou `published`, URL publicada somente em `published` e verificação separada. `published` significa identidade informada, não confirmação online, canonical, sitemap ou aprovação.

Slug, URL e canonical são identidades distintas. Slug é validado sem URL completa e sem espaços; URL publicada precisa pertencer ao domínio da marca ativa e é preservada exatamente como informada. A verificação inicial é `not_applicable` para página nova e `not_checked` para publicada. Divergências futuras geram evidência/conflito e não sobrescrevem identidade.

## 28. Perfis de unidade, propósito e estratégia SERP

O ArticleDNA pode carregar, de forma opcional, `unitClassification`, `unitPurpose` e `serpStrategy`. A classificação possui tipos `article`, `service_page`, `landing_page`, `category_page` e `other`, além de finalidade independente para landing (`seo`, `campaign`, `hybrid`, `unknown`). Sugestão é diferente de confirmação humana.

`serpStrategy` mantém separados `lifecycleMode`, `competitionStrategy` e `unitProfile`. KGR confirmado recebido com principal/slug vinculados resolve `kgr_light`; não KGR explícito resolve `competitive`; candidato, conflito ou ausência resolvem `unknown`. O Arquiteto não recalcula KGR e a intenção central permanece herdada da principal.

O `ArticleControlContext` projeta unidade, intenção, propósito e estratégia para os consumidores autorizados. Para ArticleDNA antigo, a projeção usa `other/unknown` quando não há evidência suficiente. A confirmação humana cria sucessora versionada; a SERP anterior permanece no histórico e fica desatualizada por mudança de perfil. Em publicados, URL, slug, canonical, marca e principal confirmada permanecem protegidos.

## 23. Visibilidade operacional da SERP

## 29. Política da keyword principal recebida do Minerador

O consumidor do Arquiteto lê a política aditiva gravada pelo Minerador em
`analise_semantica`: `primary_keyword_policy`,
`primary_keyword_published_original`, `primary_keyword_current`, ator, data,
versão, motivo, revisão necessária e histórico. O contrato do Arquiteto mantém
`reviewable` como alias de transporte e expõe a política efetiva como
`locked`, `revisable`, `free`, `conflict` ou `unknown`.

Publicado protege sempre URL, slug, canonical e marca. A principal só é
protegida por política `locked`, vínculo KGR confirmado ou arquitetura
confirmada. Publicado com política `reviewable` permanece com principal
candidata e usa `arquitetura_publicado`; publicado sem informação suficiente
fica `unknown`, sem travamento silencioso. Unidade nova usa `free` e
`formacao`.

`kgr_decisao`/`kgr_aplicabilidade` só são consumidos quando explícitos e
humanos: `NAO`/`not_applicable` vira não-KGR e estratégia competitiva; KGR
confirmado exige identidade principal–slug recebida/confirmada. Score, volume,
resultado, slug e similaridade não confirmam KGR.

ArticleDNA preserva política original/efetiva, contexto, intenção, volume,
resultados, URL, slug, canonical, publicação, relação keyword–URL, candidatas,
decisão humana, versão e snapshots integrais de KeywordDNA. A confirmação
humana cria sucessora, registra principal anterior e candidata escolhida,
confirma a relação, trava a nova principal e conduz a próxima SERP a
`fortalecimento` sem alterar a URL publicada.

O resultado SERP deve ser descobrível na linha do artigo e renderizado junto à keyword correspondente. O vínculo exige `articleId`, `keywordId` e a versão de KeywordDNA da referência; texto, ordem ou índice não são identidade. Após persistência, a UI fecha o preview, atualiza a linha, abre o suporte e mantém a recomendação visível. Assessment incompleto, conflito, erro, versão desatualizada ou recomendação sem hidratação devem ser estados explícitos e não podem substituir um assessment válido anterior.
Migrations, Minerador, componentes compartilhados e módulos consumidores.
## 27. Métricas Ads e KGR opcional

`allintitle` e `kgr` são evidências opcionais recebidas do Minerador. `null` significa indisponível ou não medido, nunca zero; sua ausência não bloqueia agrupamento, formação ou aprovação. KGR histórico permanece auxiliar e não é recalculado no Arquiteto.

O Arquiteto pode transportar, por keyword e referência ArticleDNA, um envelope normalizado de demanda Ads com média mensal, série temporal, CPC, competição Ads, close variants, tendência/sazonalidade e proveniência. CPC e competição Ads não representam dificuldade orgânica; close variants não decidem agrupamento; tendência e sazonalidade não aprovam calendário. Volume não escolhe sozinho a principal.

O Arquiteto não acessa Google Ads nem recebe credenciais, customerId, MCC ou resposta bruta. Serper continua responsável pela validação SERP. Atualização de métrica nunca substitui decisão humana, principal confirmada ou identidade publicada. Ver `docs/04-arquiteto/propostas/metricas-google-ads-kgr-opcional.md`.
