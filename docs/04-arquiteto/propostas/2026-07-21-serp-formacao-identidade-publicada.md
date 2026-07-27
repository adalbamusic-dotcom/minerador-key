# SDD — SERP para formação de artigos e identidade publicada

## Status

Proposta aprovada para implementação nesta tarefa. A mudança pertence ao módulo Arquiteto; alterações aditivas em contratos compartilhados são limitadas aos consumidores explicitamente mapeados abaixo.

## Problema

O Arquiteto forma artigos a partir do agrupamento local, mas não possui uma ação explícita para validar a compatibilidade do grupo pela SERP. O ArticleDNA também guarda apenas uma referência resumida dos papéis das keywords, o que impede auditoria posterior da KeywordDNA e dos campos de origem usados na decisão. Identidade publicada e verificação online ainda não têm uma representação compatível com o fluxo atual.

## Decisões de produto

1. A SERP de formação é uma ação explícita da tela do Arquiteto, iniciada pelo botão `Validar agrupamento pela SERP`, imediatamente depois de `Detectar viés SiloDNA (IA)`. Não haverá coleta em carregamento, importação, seleção, geração de ArticleDNA/SiloDNA ou recarga.
2. Antes da chamada, a interface exibe artigos, keywords, consultas previstas, modo de coleta e aviso de crédito. O resultado só é considerado sucesso depois de a resposta ser validada e persistida.
3. A SERP de formação cria um assessment versionado por artigo, contendo as referências completas das KeywordDNAs, snapshots individuais, compatibilidade de intenção, competição, tipos de resultado, recomendações, conflitos, notas e hash de conteúdo.
4. Recomendações são sugestões, não aprovação. Cada keyword pode ser marcada como `Seguir recomendação` ou `Ignorar`. Ambas as decisões são humanas, versionadas, brand-scoped e persistidas. Seguir altera somente a keyword correspondente na cópia de trabalho; não cria artigo automaticamente e não apaga keyword.
5. Artigos publicados permanecem protegidos. A SERP pode alertar sobre principal, slug, canonical, URL, marca e estrutura, mas não os altera. Troca automática de principal fica bloqueada.
6. A aprovação usa o workflow já existente (`draft`, `awaiting_approval`, `approved`, `blocked`/`conflicts`). Será adicionada a coluna visual `APROVAÇÃO`; publicação, envio ao Radar e aprovação permanecem independentes.
7. O Radar continua dono da SERP profunda do artigo já formado. Ele recebe, de forma aditiva, a evidência de formação quando houver transferência aprovada; sua UI e workflow não serão alterados.

## Contratos

### Preservação KeywordDNA

`ArticleKeywordReference` continuará contendo os campos atuais e receberá um campo opcional de snapshot/proveniência da origem. O snapshot conterá:

- `brandId`, `keywordId`, referência de versão/hash e momento da captura;
- a `KeywordDNA` sem achatamento;
- uma cópia não destrutiva dos campos da keyword de origem, inclusive campos desconhecidos já recebidos pelo Arquiteto.

ArticleDNA antigo, sem o campo novo, continuará válido. Nenhum parser poderá remover campos desconhecidos de payloads legados.

### ArticleDNA e publicação

ArticleDNA receberá apenas referências opcionais e aditivas:

- `serpAssessmentRef`, apontando para o assessment versionado da formação;
- extensão de `publishedIdentityRef` já existente para `source`, IDs das KeywordDNAs de origem e estado/checks de verificação.

Não será criado um segundo campo `canonicalUrl`: o campo canônico existente continua sendo a fonte única e será documentado como URL canonical. `publishedUrl`, slug e canonical só serão preenchidos quando vierem de uma fonte coerente, sem inferir domínio ou URL a partir de slug.

Regras de identidade:

- uma URL coerente: anexar a referência, preservar a origem e marcar como não verificada até checagem online;
- URLs divergentes: registrar conflito, listar URL e KeywordDNA de cada fonte e bloquear confirmação automática;
- sem URL: exibir ausência e manter nulo;
- link publicado usa a URL real, `target="_blank"` e `rel="noopener noreferrer"`.

### Assessment e decisões SERP

O novo contrato Arquiteto terá entidade versionada com ID determinístico por marca/artigo/versão de trabalho, `previousVersionId`, `contentHash`, snapshots por keyword e recomendações por keyword. Cada recomendação terá status `pending`, `followed`, `ignored` ou `superseded`, referência aos snapshots e à KeywordDNA, razão, papel sugerido e histórico humano (`actorId`, data, versão da cópia de trabalho e decisão).

O contrato incluirá conflitos de identidade/publicação, incompatibilidade de intenção, competição, tipos dominantes de resultado, recomendações e notas. A recomendação não poderá inventar IDs: IDs de keyword, KeywordDNA e snapshots virão dos objetos de entrada ou dos snapshots retornados pelo provider.

### Transferência para Radar

`RadarItem` e `importArticlesToRadar` receberão campos opcionais para as referências completas de KeywordDNA e o assessment de formação. A API do contexto receberá esses dados como argumento opcional. A alteração é aditiva, mantém itens Radar antigos válidos, não altera tela/workflow Radar e será coberta por teste de transferência.

## Fluxo técnico

1. A página constrói um resumo somente dos artigos selecionados e suas keywords atuais.
2. Após confirmação explícita, `POST /api/arquiteto/serp` autentica a sessão, autoriza `arquiteto:edit`, valida marca/grupo/limites e chama o provider Serper já existente uma vez por consulta textual.
3. A rota não expõe credenciais, não usa IDs técnicos como consulta, não faz retry pago e não retorna sucesso parcial. Falha ou resposta vazia não persiste assessment.
4. O servidor monta e valida o assessment determinístico. A página persiste o envelope brand-scoped no IndexedDB por `writeBrowserArtifact`, com fallback legado identificado como local.
5. A expansão de cada artigo mostra a recomendação junto à keyword. `Ignorar` persiste somente a decisão. `Seguir recomendação` cria snapshot da cópia de trabalho, modifica somente a keyword alvo quando permitido, registra histórico e persiste antes de informar sucesso. Mudança material gera successor/work copy; aprovação humana continua separada.
6. Novas avaliações tornam recomendações antigas `superseded`, sem apagar histórico nem snapshots.
7. A transferência aprovada para o Radar leva as referências e o assessment já persistidos. O Radar poderá aprofundar a SERP depois, sem substituir a evidência do Arquiteto.

## Verificação de URL e canonical

Será criada uma rota Arquiteto específica para `Verificar URL e canonical`, reutilizando as proteções e o site autorizado já existentes em Marca. A rota verificará, sob ação explícita e autorização Arquiteto:

- domínio permitido da marca;
- HTTP/status e URL final após redirects limitados;
- canonical declarado no HTML;
- divergência entre URL solicitada, final e canonical;
- presença no sitemap quando um sitemap configurado estiver disponível.

Sitemap é evidência separada e não altera ArticleDNA automaticamente. A rota reutilizará `fetchAuthorizedText`/parser/configuração de site; não haverá credencial, JavaScript ou corpo ilimitado. Redirects serão revalidados e localhost/redes privadas permanecerão bloqueados.

Para versões aprovadas/publicadas, a verificação será registrada como evidência separada brand-scoped ou em successor não aprovado; a versão consolidada não será mutada silenciosamente.

## Arquivos e consumidores

### Arquiteto

- `lib/arquiteto/contracts.ts`: extensões opcionais de snapshot, assessment e identidade publicada.
- `lib/arquiteto/serp-formation.ts`: contratos, hashes, construção de assessment, decisões e regras de proteção.
- `lib/arquiteto/adapters.ts`: snapshot integral da KeywordDNA ao formar ArticleDNA.
- `app/api/arquiteto/article-dna/route.ts`: aceita referência opcional do assessment e preserva snapshots.
- `app/api/arquiteto/serp/route.ts`: ação autenticada de formação.
- `app/api/arquiteto/publication/verify/route.ts`: verificação online explícita.
- `app/(brand)/[brandRef]/arquiteto/page.tsx` e `modules/arquiteto`: preview, ação, recomendações, URL/link/verificação e coluna `APROVAÇÃO`.
- testes Arquiteto e documentação deste módulo.

### Compartilhado/aditivo autorizado

- `lib/editorial/operational-flow.ts`: campos opcionais e passagem do assessment para Radar.
- `components/editorial-pipeline-context.tsx`: argumento opcional na importação aprovada.
- teste de fluxo/transferência correspondente.

Não serão alterados UI/workflow do Radar, Planejador, Redator, Publicações, Minerador, Conta, Admin, migrations ou recuperação do workspace.

## Persistência, compatibilidade e rollback

O armazenamento será um artefato IndexedDB por marca, com versão de schema e histórico. `localStorage` poderá ser fallback já existente, mas será identificado como recuperação local; não será fonte única nem haverá limpeza automática. Não haverá migração automática, escrita Supabase remota ou chamada paga em teste.

Rollback: remover a nova chave de assessment do workspace local, descartar successors não aprovados e manter versões aprovadas/publicadas e snapshots antigos. Como as extensões são opcionais e aditivas, versões legadas continuam parseáveis. O patch será validado sobre o checkout sujo sem reset/clean.

## Testes e aceite

Serão adicionados testes com fixtures/mocks para: preservação completa da KeywordDNA e roles; hash/versionamento; grupos com keywords não agrupadas; transferência para Radar; isolamento de marca; old ArticleDNA; seleção e ausência de chamada automática; recomendações follow/ignore/superseded; persistência/falha/resposta vazia; proteção publicada; URL única/divergente/ausente; verificação HTTP/redirect/canonical/sitemap e SSRF; separação da coluna de aprovação; e regressões Arquiteto/operational/editorial autorizadas.

Aceite manual pendente: sessão autenticada, preview sem chamada, uma coleta textual explícita, reload/brand switch, link publicado em nova aba, verificação online e transferência aprovada ao Radar. Nenhuma chamada real Serper será feita por esta implementação ou pelos testes.

## Correção de usabilidade pós-implementação

A auditoria posterior identificou que persistir o assessment não era suficiente: o resultado não era descobrível na linha da planilha nem estava visualmente anexado a cada keyword. A implementação foi complementada com indicadores de linha, foco/expansão pós-persistência e renderização por identidade estável (`articleId + keywordId + keywordDnaVersionId`). Associações ausentes, incompatíveis ou incompletas permanecem visíveis para revisão humana; não há fallback por texto, posição ou índice.

## Complemento: fortalecimento de publicados

O assessment também declara `assessmentMode`. O modo `formacao` permanece para artigos novos; o modo `fortalecimento` é usado quando o grupo possui âncora publicada. Nesse modo a principal publicada não é candidata: conflitos são traduzidos em oportunidades de intenção/conteúdo, secundárias podem ser revistas na cópia de trabalho e propostas complementares apenas registram decisão humana. A interface e `applySerpRecommendationToWorkCopy` rejeitam ações estruturais inesperadas contra a principal.
