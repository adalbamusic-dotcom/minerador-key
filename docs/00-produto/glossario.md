# Glossário

- **BrandDNA** — contexto editorial versionável de uma marca.
- **KeywordDNA** — classificação e contexto de uma keyword; no legado pode ser derivado de dados de keyword.
- **ArticleDNA** — identidade editorial de um artigo, com keyword principal, referências e regras.
- **SiloDNA** — regras e fronteiras de um silo editorial.
- **SiloPage** — página editorial de um silo; não é SiloDNA.
- **ContentPlan** — plano editorial versionado que orienta um documento.
- **ContentDocument** — documento de redação, incluindo conteúdo e proveniência compacta.
- **Keyword principal** — keyword que identifica o foco central do artigo.
- **Pilar** — unidade editorial ampla que organiza conteúdos de suporte.
- **Suporte** — conteúdo associado que aprofunda ou atende uma intenção específica.
- **Reforço** — keyword ou relação complementar usada para fortalecer cobertura sem trocar a principal.
- **ID · vN** — identidade estável de entidade seguida de sua versão numerada.
- **IA aplicada** — proposta ou alteração produzida por IA; não equivale a aprovação.
- **Publicado protegido** — conteúdo com campos estruturais que não podem mudar livremente.
- **workflow** — estados e transições operacionais entre módulos.
- **publicação** — registro e estado de saída de um documento para um destino.
- **transferência** — importação explícita e seletiva entre etapas.
- **snapshot** — cópia identificável para auditoria, recuperação ou rollback.
- **proveniência** — referências compactas às fontes, versões e decisões que originaram um artefato.
- **formação de artigo** — decisão do Arquiteto que fixa uma principal e até cinco keywords de apoio compatíveis dentro de um ArticleDNA.
- **cobertura de volume** — indicação `complete`, `partial` ou `unavailable` sobre quanto do volume das referências foi qualificado pelo Minerador.
- **coerência de slug** — evidência da convergência entre slug, H1 e title; não confirma KGR sozinha.
- **lock_version** — contador de concorrência otimista para impedir sobrescrita silenciosa.

## Radar — investigação competitiva

- **RadarEvidenceBundle** — camada versionada de evidência que o Radar acrescenta ao ArticleDNA aprovado, sem reescrevê-lo.
- **RadarFrozenEvidenceBundle** — o bundle congelado no `FINALIZE`, amarrado a `articleId`, versão e hash do ArticleDNA.
- **ArticleWorkingDossier** — leitura conceitual de `ArticleDNA + RadarEvidenceBundle`; é o que o Planejador consome.
- **PlannerHandoff v3** — envelope de entrega ao Planejador (`RADAR_PLANNER_CONTRACT_VERSION = 3`), que inclui o Blueprint diretamente.
- **modo de pesquisa** — universo competitivo de uma investigação: `Google`, `YouTube` ou `Amazon`. Seleção única, escolhida antes de começar e gravada na investigação. Modo não é área.
- **área Vídeos** — ingestão deliberada de fontes que o USER escolhe; não há SERP e a fonte não vira concorrente automaticamente. Não confundir com `Pesquisa → YouTube`.
- **RadarCompetitiveObservedModel** — autoridade única da observação competitiva: amostra, intenção, formatos, estrutura, conceitos, perguntas, entidades, lacunas, diferenciações, conflitos, concorrentes, suficiência e limitações.
- **SemanticConceptModel** — caminho de observações cruas preservadas → normalização → agrupamento → conceitos, perguntas e entidades. O vocabulário canônico é `semantic coverage`, `concepts`, `entities`, `relationships` e `questions`; "LSI" não é termo do produto.
- **AiDiscoveryContext** — unidades respondíveis, perguntas centrais, requisitos de definição, cobertura de entidades, suporte factual e conexões com o especialista. Não é score.
- **RadarEditorialBlueprint** — projeção editorial do Radar: objetivo, orientação de abertura e fechamento, blocos candidatos, perguntas, definições, entidades, estado factual, diferenciação, links internos, necessidades e proveniência. Não é ContentPlan.
- **SpecialistBrief** — pauta legível derivada de um requisito de revisão profissional. `PREPARED != SENT`.
- **VideoBrief** — pauta audiovisual derivada do Blueprint. Não é pesquisa YouTube.
- **intenção declarada** — a intenção do artigo segundo o fundamento aprovado; `unknown`, `ambiguous` e `indeterminate` não são declarações conclusivas.
- **intenção observada** — a intenção dominante que a pesquisa devolveu; comparável à declarada apenas quando as duas são conclusivas.
- **failed_final** — fonte cuja extração falhou em definitivo. Não é pendência: `SELECTED = ANALYZED_SUCCESS + FAILED_FINAL`.
- **source verification** — resolução server-side de um `sourceId` contra o plano e as candidatas persistidas; o cliente nunca escolhe URL arbitrária.

## Radar — fechamento da fase (2026-09-17)

- **perfil de pesquisa** — o mesmo que "modo de pesquisa" no vocabulário anterior: `Google`, `YouTube` ou `Amazon`. Descreve COMO se investigou, nunca o que será publicado.
- **saída editorial** — o que se produz a partir do perfil: blueprint editorial e artigo-modelo (Google), blueprint audiovisual e roteiro-modelo (YouTube), blueprint comercial (Amazon). Perfil ≠ saída.
- **RadarCanonicalAuthorities** — as autoridades do Radar lidas de uma vez: fotografia do pipeline do Google, biblioteca de vídeos casada, contribuições do especialista e contexto de pesquisa.
- **RadarCanonicalDossier** — o resultado de `resolveRadarCanonicalDossier`. Alimenta o envio ao Planejador e o export portátil com o mesmo conteúdo semântico.
- **keywordContext** — principal, secundárias e reforços narrativos. O papel vem do ArticleDNA; o texto, da hidratação amarrada ao mesmo `articleDnaVersionId`. Título, slug e consulta da SERP nunca substituem a keyword.
- **RadarVideoEvidenceLayer** — a biblioteca de vídeos casada com as pautas, com trecho ancorado no tempo. Não confundir com a SERP de vídeo.
- **RadarSpecialistEvidenceLayer** — as contribuições com decisão humana ativa, com a necessidade que cada uma responde.
- **AmazonEditorialIntent** — a intenção declarada antes da coleta: `PRODUCT_REVIEW`, `PRODUCT_VS_PRODUCT`, `PRODUCT_COMPARISON`, `TOP_BEST`, `TOP_VALUE`, `BEST_FOR_USE_CASE`, `BUYING_GUIDE`, `BRAND_LINE_REVIEW`.
- **AmazonResearchTarget** — o que pesquisar. Separado da intenção: a mesma prateleira serve a formas editoriais diferentes.
- **RAW_UNIVERSE → ELIGIBLE_CANDIDATES → EDITORIAL_SHORTLIST** — as três camadas da Amazon. Identidade é o ASIN, nunca a posição.
- **promotion link** — link de produto nascido da shortlist editorial, com URL limpa `/dp/{ASIN}`. O Radar marca `affiliateReady` e não cria tag de afiliado.
- **dossiê editorial portátil** — o CSV que leva o contexto de escrita para fora da plataforma. Não é backup, não é dump de banco e não carrega id interno.
- **writer_brief_md** — a decisão editorial condensada. Read model portátil, não autoridade factual.
- **writer_context_md** — o contexto completo de escrita, para colar inteiro em outra ferramenta. Read model portátil.
