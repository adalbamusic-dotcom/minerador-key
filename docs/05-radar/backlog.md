# Backlog — Radar

## Assunto declarado — F3 e export F4.3 — 2026-09-24

Fonte: [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md). Registro em `estado-atual.md`, mesma data.

- [x] Contexto de pesquisa com `article.subject` (só com Assunto) e linha `article.subject` no `RADAR_FOUNDATION_USAGE_MAP`.
- [x] Consultas Google sem mudança; YouTube com `DECLARED_SUBJECT` dentro do teto de 6, tomando o lugar da última da fila.
- [x] Especialista: pedido de aprofundar o Assunto e a virada; pauta garantida no domínio (`radarR7SubjectTopic`), sujeita à revisão humana.
- [x] Leitura lexical da amostra (`observed.declaredSubject`), alerta com o critério em `limitations`, sem bloquear o FINALIZE.
- [x] Seção exigida da virada no modelo editorial, inclusive sintética com 0 páginas; nunca H2 por decreto; congelada em `blueprint.sections` sem mudar o schema do bundle; `subject` fora do bundle.
- [x] Direção do CTA para o destino ao lado da chamada observada.
- [x] Export "Para escrever": linhas do Assunto em `artigo`, `promessa_e_leitor` e `titulo_e_seo`; virada marcada em `estrutura` pelo motivo do modelo; sem Assunto, as 13 colunas e o J idênticos.
- [x] **Levar ao Redator a virada sugerida** (segunda rodada): no envio, só com Assunto, linhas curtas em `importedContext.editorialContext` (`radarWriterSubjectTurnLines`, `lib/redator/radar-subject-turn.ts`): Tronco, Virada, Seção da virada, Direção do H1, Destino da chamada e Alerta, com o mesmo texto do CSV. Dossiê e bundle sem mudança; sem Assunto, `editorialContext: []` e documento igual ao do HEAD (snapshot sha `8b366688…`). Exposto no `get_writer_brief` e nos fundamentos (registro do Redator).
- [x] **Gravar a proibição do Assunto no envio** (segunda rodada): recibo (`radar-writer-send.ts`) e documento (`radarWriterDossierOf`) usam `radarWriterMayNotFor` com o `subject` do ArticleDNA da identidade.
- [x] **Especialista, fora do domínio** (segunda rodada): `SYSTEM_PROMPT` intacto e linhas do Assunto juntadas por `buildSystemPrompt` (`radarExpertTopicsSubjectPromptLines`); Telegram com "Assunto (tronco)" e "Pedido" depois de "Tema:", sem nota nem destino; bloco `radar-specialist-subject` no painel do especialista. O texto do Telegram e do painel foi substituído na terceira rodada (abaixo).
- [x] **Telas** (segunda rodada): rótulo "Exigida pelo Assunto" no workbench ("Ver candidatos observados · N · 1 exigida pelo Assunto"), no r3-blueprint (virada sem número) e no artigo-modelo; bloco do Assunto com "Onde virar", "H1", contagem e alerta; "Destino da chamada" na Conclusão. Sem Assunto, markup igual ao do HEAD.
- [x] Textos da revisão: `sampleLabel` e rótulos do modelo com "palavras do Assunto"; sem principal, "levar o leitor da keyword principal a …" no CSV e no Redator.
- [ ] **Aprovar o adendo técnico à SDD F4.1/F4.4 (dono), antes do commit.** A virada chega ao Redator por `importedContext.editorialContext`, gravado no envio, e não pelo dossiê; o Redator ganhou leituras estreitas (Guardião: `g_articleDnaRef` e `payload->subject` < 1 kB; fundamentos e material: `c_editorialContext` < 2 kB, só com Assunto). O conteúdo proposto está resumido em `docs/07-redator/estado-atual.md` (mesma data); a SDD não foi editada.
- [ ] **Homologar (gate F3 e F4, usuário), depois da F2 fase B:**
  - investigar um artigo com Assunto e um sem; conferir a seção da virada, a posição sugerida, o complemento do H1 e o alerta;
  - no r3, conferir o contador "Ver candidatos observados", a virada sem número com "Exigida pelo Assunto" no blueprint, o selo e o bloco do Assunto no artigo-modelo e o "Destino da chamada";
  - abrir o painel do especialista e conferir o bloco do Assunto; enviar uma pauta de teste pelo Telegram (chamada real, feita pelo usuário) e conferir "Tema a aprofundar" e "Pergunta" (ou só "Tema a aprofundar", quando a pergunta já está numerada), sem tronco, virada nem ArticleDNA. Aprovar sem editar a pauta do Assunto que o r7 acrescenta e conferir que ela chega em linguagem simples;
  - finalizar e conferir a virada em `blueprint.sections` e o alerta em `limitations`;
  - exportar o CSV "Para escrever" dos dois e conferir as linhas novas e a célula idêntica no artigo sem Assunto;
  - enviar os dois ao Redator e conferir no documento `editorialContext` e `writerMayNot` (vazio e lista de sempre no artigo sem Assunto). No painel do Redator, conferir o bloco do Assunto só no artigo que tem Assunto.
- [ ] **Leitura semântica, não só lexical, de onde o Assunto cabe na SERP (melhoria da F3).** Hoje o critério é por raízes de palavras (`radarSemanticStems`). Ler por sentido: entidades, perguntas observadas, proximidade entre temas, sem provider pago. Exige SDD ou adendo, porque muda o critério do alerta, da posição e do H1.
- [x] **Texto ao especialista em linguagem simples** (terceira rodada):
  - Telegram e painel do especialista com "Tema a aprofundar" (`RADAR_EXPERT_SUBJECT_LABEL`) e "Pergunta" (`RADAR_EXPERT_SUBJECT_QUESTION_LABEL`, `radarExpertSubjectQuestion`, campo `question`), sem tronco, virada, ArticleDNA nem "Pedido:";
  - pergunta repetida some do cabeçalho quando já está numerada;
  - a pauta do r7 usa a pergunta simples (`radarSubjectReaderQuestionText`);
  - o prompt das pautas manda escrever o `text` em linguagem simples;
  - o `request` da SDD fica só no prompt interno;
  - sem Assunto, mensagem e prompt ficam iguais ao HEAD.
- [ ] **Adendo à SDD F3.1 (dono), antes do commit:** registrar que o texto ao especialista externo deixou de usar "Assunto (tronco)" e "Pedido: Aprofundar o Assunto e a virada…". Telegram e painel dizem "Tema a aprofundar" e "Pergunta", a pauta do r7 usa a pergunta simples e o `request` fica só no prompt interno. A SDD não foi editada.
- [x] **Assunto no painel e na semeadura do Redator** (terceira rodada): as linhas de `importedContext.editorialContext` chegam ao painel dos fundamentos e a roteiro e carrossel pela projeção única `radarFoundationsOf`. Registro em `docs/07-redator/`.
- [ ] **Pautas com 6 itens:** o r7 acrescenta a pauta do Assunto quando nenhuma cobre a frase; com 5 da IA, a lista chega a 6. Conferir a tela e o fluxo com 6.
- [ ] Pautas persistidas antes da F3 não têm `article.subject` em `radarContext`: a mensagem segue sem a linha do Assunto até a pauta ser salva de novo pelo painel. Decidir se vale reler o contexto no envio.
- [ ] **Teste de coerência blueprint × modelo:** no blueprint a cobertura observada é medida pelo `workingTitle`; no modelo, pelas raízes do grupo. Os dois podem divergir.
- [ ] **Investigação finalizada sem páginas:** o transporte compacto leva a leitura a `NO_PAGES`; decidir se a leitura do Assunto deve ser congelada no FINALIZE (exigiria campo no bundle: fora do escopo da SDD).
- [ ] **Adendo à SDD, texto do motivo:** `RADAR_SUBJECT_MUST_COVER_REASON` repete "ArticleDNA" na marcação do CSV e diz "a arquitetura decide onde", o que tensiona com "quem redige decide". Proposta: "O Assunto é o tronco deste artigo: a virada para ele precisa aparecer; o lugar é decisão de quem redige." Mantido até decisão, porque a SDD fixa o texto.
- [ ] Destino com parâmetro de campanha: a limpeza do CSV tira `utm_*` e similares também do destino do Assunto. Decidir se o destino declarado é exceção.

## Export "Para escrever" — 2026-09-23

- [x] Formato "Para escrever" com 13 colunas, linha de topo Silo/Marca, veredito `pode_escrever`, limpeza e limites; o formato técnico ficou byte a byte igual.
- [x] Card "Exportar para escrever": duas opções, um botão e "Avançado (auditoria)" fechado com o técnico e a planilha.
- [ ] **Homologar o card:**
  - abrir e fechar com Esc;
  - Tab nos rádios, no botão e no Avançado;
  - foco de volta ao botão depois do download;
  - largura de 360px;
  - contraste do botão no tema claro.
- [ ] **Voz, tom, autor e revisor do BrandDNA** na linha de topo. É o dado indispensável que mais falta para escrever fora da plataforma. Exige leitura nova do módulo Marca: autorização.
- [ ] **Homologar** com um artigo novo de ponta a ponta:
  - exportar o Silo;
  - colar o CSV numa IA externa;
  - conferir se o texto sai sem pedir dado que faltou.
- [ ] Bateria de mutantes das correções da revisão: as 11 asserções novas cobrem cada ramo, mas os mortos não foram medidos.
- [ ] "Copiar para IA" por artigo (opcional no desenho): não implementado.

## 4 lentes, tela e export — 2026-09-23

- [x] R1 standing congelado e trava; R2 4 lentes com cache primeiro; R3 a R5 lentes congeladas, auxiliar e apoio; tela das lentes; lentes congeladas no export; export com leitura por artigo (−31%).
- [ ] **Homologar:**
  - aba SERP de um artigo: "Lentes da SERP", "Recoletar agora (pago)" com confirmação, e "sem mudança" ao repetir;
  - finalizar uma investigação e conferir a frase com o hash gravado;
  - exportar o Silo e ver `serp_lenses_md` com o pacote congelado.
- [ ] **D6 — ledger e quota:** o gasto de DataForSEO do Radar é descartado do registro de uso porque falta a capability `dataforseo.serp_compatibility`. O SQL e o rollback estão no [adendo R1](propostas/adendo-r1-standing-congelado-e-ledger-2026-09-23.md); o usuário executa.
- [ ] "Recoletar agora (pago)" só existe na aba SERP da rota do artigo, e o Workbench não linka para ela. Levar ao Workbench exige um handler novo no contrato congelado pelo Gate 15.3: decisão.
- [ ] Egress do export: cortar as releituras de autoridades (R2, −10,85 MB) e da camada de vídeo (R3, −1,64 MB). Chegaria a ~3,8 MB (−84%). A de autoridades pede decisão sobre corrida antiga fora do contrato. Envios ao Planejador e ao Redator e volta à aba continuam na E4.
- [ ] **D11:** com o cache indisponível, pagar as 4 lentes (hoje) ou só a canônica.
- [ ] **D8:** medir device/os no YouTube e na Amazon (1 a 4 chamadas autorizadas) antes de adotar lentes.
- [ ] Apoio Google de YouTube e Amazon: confirmação com o teto de chamadas antes de pagar.
- [ ] Aviso "standing não avaliado" em bundle anterior a 2026-09-23 (D3).
- [ ] Regra de suficiência do modelo observado alinhada com a D2 congelada: hoje o dossiê tem duas leituras de standing.
- [ ] `app/api/editorial/documents/route.ts`: a aprovação do documento deve considerar as divergências bloqueantes do Redator (`checkOpenBlockingWriterDivergence`).
- [ ] O Minerador deve mostrar `collectedBy` na proveniência da Qualificação quando a SERP veio do Radar (D9).

## Export portátil com SERP, paridade com o Redator e export por silo — 2026-09-23

Feito (verificado no código e confirmado por teste; sem homologação):

- [x] Colunas `serp_observed_md/_json` com a SERP que o dossiê referencia, curadoria só na SERP principal, SERPs auxiliares das secundárias, trechos de terceiro em até 300 caracteres e marcados, e aviso de coleta posterior.
- [x] Colunas `serp_lenses_md/_json` com o cache de SERP da marca nas quatro lentes, numa leitura `observation` por lote; falha de leitura vira aviso na coluna.
- [x] Colunas `research_status_md`, `authority_requirements_md` e `competitors_structure_json` (prontidão pela regra do Redator, datas, autoridade, descoberta por IA, estrutura e posições dos concorrentes).
- [x] Proibições do Redator que faltavam ("reconfigurar o Silo", "substituir a composição de secundárias") nas regras de `writer_context_md` e `writer_brief_md`, sem repetição.
- [x] Resumo "SERP OBSERVADA" em `writer_context_md`, sem trecho de terceiro.
- [x] `groupBy: "silo"` na rota: um CSV por silo, na ordem do silo, `-parcial` com os faltantes pelo título, "sem silo" em arquivo próprio.
- [x] Menu `Exportar ▾` com "Silos completos · um CSV por silo" (Recomendado) em primeiro; 1 silo → CSV, 2+ → um `.zip` sem compressão montado no navegador.
- [x] `refused` do export avulso mostrado pelo título; recomendação do silo completo quando um silo foi selecionado só em parte.
- [x] Revisão adversarial, corrigido e preso por teste (24 mutantes numa cópia da árvore, 24 mortos):
  - CSV do lote fora da resposta por silo (a mesma linha saía duas vezes);
  - chave das lentes igual à do cache (acento mantido, espaço colapsado nos dois lados);
  - códigos do alvo da keyword na leitura das lentes (A8);
  - data de congelamento da SERP de apoio;
  - revisão "não se aplica" na SERP de apoio;
  - curadoria só "registrada" com decisão real;
  - motivo neutro para a coleta auxiliar que falhou (invariante 43);
  - coleta posterior avisada também em `research_status_md`;
  - `radarPortableExportRows` com o plano real;
  - recusas nomeadas no aviso por silo;
  - faixa do aviso pela severidade;
  - teto de 500 conferido antes do pedido.

Pendente:

- [ ] Homologação do usuário: baixar um silo, vários silos (zip) e um silo parcial; abrir o `.zip` no Explorador do Windows; conferir o aviso e as colunas numa planilha real.
- [ ] Coleta do Radar ainda no modo `regular`, sem PAA nem citações do AI Overview: as colunas declaram a limitação, mas o dado não existe. Decidir o `advanced` na coleta do Radar exige custo e gate próprios.
- [ ] E4 da SDD de egress: o export ainda lê o item do Radar e reidrata as corridas por artigo (estado + autoridades). Desenho próprio, fora desta tarefa.
- [ ] SiloPage sem dossiê do Radar: hoje entra só como contexto do silo, pela dica da hidratação. Ler as versões `silo_page` ou dar dossiê à SiloPage é mudança estrutural (SDD).
- [ ] A versão do ArticleDNA na rota de export (e no envio ao Redator) ainda é escolhida por `.find` sem ordem; com mais de uma versão, pode vir a antiga e derrubar a curadoria do `observed`.
- [ ] Medir o tamanho real das células com dados de produção (o teto de 24 mil caracteres por célula foi provado com a maior coleta de fixture) e o egress da leitura das lentes em lotes grandes.
- [x] Teto do corpo de resposta, levantado na revisão adversarial:
  - A linha completa passou de ~59 KB para ~133 KB.
  - Mesmo sem a duplicação, "Silos completos" sem seleção manda todos os silos num pedido só.
  - O limite de 4,5 MB da Vercel foi conferido na documentação dela (413 `FUNCTION_PAYLOAD_TOO_LARGE`): o teto seria ~31 artigos.
  - **Feito em 2026-09-23:** a resposta de sucesso sai em fluxo (`lib/radar/portable-export-response.ts`), o caminho que a Vercel indica sem esse teto. Continua uma leitura da marca por lote. Um pedido por silo foi descartado porque relê artefatos e snapshots a cada silo.
- [ ] Homologar o fluxo no deploy: exportar uma marca com mais de ~35 artigos finalizados e confirmar que o arquivo chega (a documentação da Vercel diz que fluxo não tem o teto; não foi testado no deploy).
- [ ] Paridade com o Redator ainda parcial. Registrar a decisão ou fechar cada item:
  - links internos de ENTRADA saem só como contagem;
  - fontes externas saem só como candidatas a evidência, sem `observedLinks`, `recurrentDomains`, `conceptAlignments`, padrões, links comerciais nem limitações;
  - `observed.evidence.semantic/structural` fica de fora;
  - o slug diverge: o CSV usa o publicado; a importação do Redator, `suggestedSlug`.
- [ ] Alinhar a leitura das lentes do export com a do Redator (`writer-evidence-sources.ts`, em andamento em outra sessão). Pontos que divergem:
  - chave pela consulta da Qualificação × alvo A8;
  - vencida legível com rótulo × "venceu a validade" (hoje `lookupSerpCache` não devolve a observação vencida);
  - reforços narrativos lidos × não lidos.
- [ ] Quando o snapshot do Radar ganhar `lensSet` e `payloadDepth` (trabalho paralelo, ainda não integrado):
  - preferir `snapshot.lensSet` às lentes do cache vivo em `serp_lenses_*`;
  - usar `payloadDepth` na frase de ausência de bloco.
- [ ] Egress do escopo "silo inteiro":
  - Os irmãos não finalizados passam pelo laço E4 só para serem recusados (payload inteiro e depois as autoridades).
  - Proposta: recusar antes das autoridades quando `radarPrimaryProfileOfAnalysis(corrente.payload)` for nulo, porque a recusa é a mesma e o silo do recusado vem da composição.
  - Alternativa: a tela mandar esses irmãos só como membros.
- [ ] `listReviews(brandId)` lê todas as revisões da marca a cada export. O export só usa `snapshotId`, `status` e `reviewedAt` dos artigos pedidos. Estreitar a leitura por `article_id` do lote (prioridade baixa).
- [ ] Teto de célula para o contexto do silo:
  - `silo_context_md/_json` crescem com o silo (~150 a 200 caracteres por membro). Com ~150 membros, passam de 32.767 caracteres, e o Excel trunca sem aviso.
  - Aplicar o mesmo corte declarado das outras colunas e `membersOmitted` no JSON.
- [ ] Rótulos da recusa:
  - Toda recusa vira "não finalizado" no plano do silo e no `headline` do avulso, inclusive "ArticleDNA não encontrado" e "pacote indisponível".
  - O aviso já mostra o motivo; falta um `statusLabel` próprio para a recusa que não é de finalização.
- [ ] Colunas novas no meio da linha: `research_status_md` e `silo_context_md` vêm depois de `must_cover`. Se aparecer consumidor que lê o CSV por posição, levá-las para o fim.

## Egress Supabase — auditoria de 2026-09-23

- [x] Conferir por leitura remota as migrations/views de 21/09, o volume das corridas separadas e a pressão de egress mostrada nas capturas.
- [x] Filtrar no código local os tipos realmente consumidos por `ArtifactRepository.list`, preservando saída e consumidores.
- [x] Ler no painel autenticado a composição de 19–22/09: PostgREST responde por 93,8–97,4% dos dias amostrados.
- [x] Consultar *Top Paths* no Logs Explorer: no plano Free só há um dia de retenção; a consulta mostrou frequência por rota, sem bytes nem dados dos dias de pico.
- [ ] Publicar manualmente o filtro e acompanhar o egress diário/por serviço após o reset de 26/09; a taxa futura segue não verificada.
- [ ] Preparar SDD da leitura enxuta de `ContentDocument` no workspace, com hidratação por documento, F5, readback, isolamento por marca e regressão do Redator.
- [ ] Preparar SDD da hidratação seletiva de corridas em `findByArticle`, consumidor por consumidor.
- [ ] Medir bytes dos endpoints de polling por área antes de mudar o intervalo.

Relatório: [auditoria-egress-supabase-2026-09-23.md](auditoria-egress-supabase-2026-09-23.md).

## Dívidas abertas — fonte única — 2026-09-17

Esta seção é a **resposta canônica** para "o que continua aberto no Radar".
Tudo abaixo dela é histórico datado e append-only: as seções seguintes
registram o que aconteceu, não o que falta. Quem for planejar trabalho novo
lê só esta seção.

### 1. Aceitação manual — do USER, não do desenvolvimento

```text
GOOGLE_PHASE_1        HOMOLOGADA em runtime real — 2026-09-11
YOUTUBE               implementado · aguardando smoke real
AMAZON                implementado · aguardando smoke real
PORTABLE_EXPORT       implementado · aguardando aceitação visual
ENTREGA_AO_REDATOR    implementada · aguardando envio real do USER
VIDEO/SPECIALIST      no dossiê · aguardando envio real com as camadas
```

Homologação é ato do USER. Nenhum documento pode declará-la a partir de teste
verde.

### 2. `RADAR_ANALYSIS_VERSION_STORAGE` — dívida de armazenamento

`analysisVersions` continua sendo o mecanismo de versionamento da investigação.
É dívida conhecida de armazenamento, **não migrar agora**: a decisão depende de
volume real em produção, e migrar antes disso trocaria um problema medido por
um problema suposto.

### 3. `RADAR_BATCH_ELIGIBILITY_VIEW` — critério da tela

A UI pode usar critério mais simples do que o servidor ao oferecer ações em
lote. O **servidor continua sendo a autoridade de prontidão**
(`radarPlannerHandoffReadiness`), e a tela que oferecer o botão a mais encontra
a recusa correta do lado de lá. Alinhar a leitura da tela é melhoria de
interface, não correção de domínio.

### 4. Frentes de outros módulos

- **Especialista — envio real.** O Radar prepara requisitos e pautas;
  `PREPARED != SENT` continua valendo. O envio por Telegram e o ciclo de
  contribuição são frente própria.
- **Redator — consumir o dossiê canônico.** Desde 2026-09-17 o Radar entrega
  direto ao Redator (`sendRadarToWriter`), e o documento nasce com a estrutura
  inteira dentro. O que falta é do módulo Redator: usar o dossiê na fase de
  planejamento e na escrita.
- **Planejador — fora do fluxo operacional.** Não é etapa, gate nem destino. A
  rota e os dados históricos permanecem para leitura; nenhum artigo é movido
  automaticamente. Não reabrir como pendência.
- **`YOUTUBE_SEARCH_2`.** Transcript de concorrente, hook e roteiro derivados de
  conteúdo assistido continuam fora do escopo: a SERP de vídeo não observa
  conteúdo interno.

### 5. Deixado pelo `RADAR_MULTI_PROFILE_HANDOFF_1` — 2026-09-19

- **Apoio do Google para YouTube e Amazon.** No banco, o artigo de YouTube tem
  `serpSnapshotId` sem `deepResearch`/extrações/`supportResearch`; o de Amazon
  não tem nada do Google. "Processado no Google" só pode aparecer depois de o
  fluxo de apoio rodar — providers autorizados, clique do USER.
- **Amazon TOP_BEST com `productClass` literal.** `lib/radar/amazon-eligibility.ts`
  exige o termo da classe no título; com `skincare`, 0/48 candidatos passam.
  Defeito de desenho: classe de produto não é token obrigatório de título.
- **"Enviar ao Redator" para o artigo focado.** A barra de lote só aparece com
  checkbox marcado. Melhoria de interface.

### Fechado — não reabrir como pendência

Os itens abaixo aparecem em seções históricas deste arquivo e **não são mais
dívida**. Reintroduzi-los seria reabrir discussão encerrada:

```text
SQL FASE 0                          fechado
locale da Amazon (pt_BR/2076)       fechado
apoio do Google                     fechado
paridade de keyword                 fechado
paridade de vídeo e especialista    fechado
export portátil                     fechado
higiene do dossiê portátil          fechado
destino do handoff (Redator)        fechado
```

---

## Pesquisa Google Fase 1 — fechada — 2026-09-11

```text
PESQUISA GOOGLE — FASE 1 = DONE / HOMOLOGADA
```

Fecha as pendências que este backlog mantinha abertas desde 2026-08-25:
homologação final DataForSEO, coleta real autenticada, persistência remota da
investigação, consolidação de evidências e handoff canônico para o Planejador.

Detalhe do que existe: [estado atual](estado-atual.md). Regras permanentes:
[spec](spec.md). Números da rodada de homologação:
[relatório datado](../00-produto/auditorias/relatorio-radar-google-fase1-homologacao-2026-09-11.md).

### Próximos eixos — registro de 2026-09-11 — A, C e D já superados

Cada eixo é um gate próprio. O registro abaixo é o de 2026-09-11.
Os eixos A, C e D foram fechados depois disso; a leitura vigente é a seção
**Dívidas abertas** no topo deste arquivo.

**A. Vídeos — `Gate 0 = auditoria de persistência/infra`**

Hoje existe a área, existem `VideoBriefs`, o USER pode registrar referência ou
material, e nenhuma SERP ocorre. A engine de transcrição/extração **não** está
implementada e nenhum provider YouTube é chamado pela área.

Próxima fase planejada: ingestão deliberada de múltiplas fontes → texto ou
transcrição original → segmentação → correspondência contra os `VideoBriefs` →
trechos relevantes → tradução somente quando necessária → `VideoEvidence`.

Decisão arquitetural planejada sobre tradução — registrada agora para não ser
decidida por omissão na implementação: **não traduzir o material inteiro antes
da análise**. A ordem preferida é fonte → transcrição ORIGINAL → segmentos →
correspondência contra os briefs → trechos relevantes → tradução PT-BR somente
dos trechos necessários → `VideoEvidence`. O original nunca é substituído pela
tradução.

**Superado pelos gates de vídeo (2026-09-14 a 2026-09-17).** A ingestão
deliberada, o texto ou transcrição original, a segmentação, a correspondência
contra os `VideoBriefs` e o trecho ancorado no tempo existem, e a camada
`RadarVideoEvidenceLayer` viaja no dossiê entregue ao Planejador desde
2026-09-17. A decisão sobre tradução registrada acima **permanece vigente**: o
original nunca é substituído pela tradução.

**Ainda não homologado em produção** — depende do envio real do USER com a
camada preenchida.

**B. Especialista — workflow real**

Envio real, Telegram e contribuição. Hoje o Radar prepara requisitos e pautas e
**não** envia nada: `PREPARED != SENT`.

**C. Pesquisa YouTube — engine competitiva própria**

~~Hoje o modo é reconhecido pela casca e a engine está declarada como `partial`
em `RADAR_SEARCH_MODE_ENGINE`: universo, separação e modelo de vídeo existem, e
a coleta usa o bloco de vídeos da SERP do Google. Não homologada. Gate próprio.~~

**Superado pelos gates YOUTUBE_SEARCH_1 e 1.1 (2026-09-14).** A engine é
`available` e a coleta é a SERP do próprio YouTube
(`/v3/serp/youtube/organic/live/advanced`), não mais o bloco de vídeos do
Google. Fechados: plano multi-consulta, coleta com `block_depth` 20, dedupe por
`videoId`, universo em quatro classes com long-form e Shorts separados,
sinal competitivo e curadoria humana persistida.

**Ainda não homologado em produção** — depende do smoke real do USER num artigo
novo. Transcript de concorrente, hook, roteiro e Competitive Blueprint são o
YOUTUBE_SEARCH_2.

**D. Pesquisa Amazon — `ProductEvidence` / engine de avaliações**

~~Modo reconhecido pela casca, engine `planned`. Não implementada.~~

**Superado pelos gates da Amazon (2026-09-15 a 2026-09-17).** A engine está
implementada: intenção editorial declarada antes da coleta e separada do alvo,
camadas `RAW_UNIVERSE → ELIGIBLE_CANDIDATES → EDITORIAL_SHORTLIST`, ASIN como
identidade canônica, blueprint comercial e link promocional com
`relPolicy = sponsored nofollow` sem tag de afiliado. A Merchant Brasil usa
`language_code = pt_BR` e `location_code = 2076`.

**Ainda não homologada em produção** — depende do smoke real do USER.

**E. Planejador — consumir `PlannerHandoff v3`**

~~O envelope existe e inclui o Blueprint. O consumo pelo Planejador é frente do
módulo Planejador.~~

**Superado pelo `RADAR_TO_WRITER_HANDOFF_1` (2026-09-17).** O Planejador saiu
do fluxo operacional. O dossiê canônico passou a ser entregue ao REDATOR por
`sendRadarToWriter`, e o consumo é do módulo Redator. Dados históricos do
Planejador permanecem; nenhum artigo é movido automaticamente.

### Correção pós-homologação

`OperationalDataGrid`: a área clicável do expansor da linha foi ampliada — o
botão ocupava 12% da célula e o restante do alvo aparente apenas selecionava a
linha. É correção de interface, não regra de domínio, e não vira invariante
editorial. Registrada em
[operational-grid](../compartilhado/operational-grid.md).

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

- [x] Consolidar um único script administrativo, substituindo os dois anteriores.
- [x] Fixar o alvo e validar a identidade da marca antes de remover.
- [x] Lista explícita dos registros, com condições positivas para `architect` e
  `radar` no lugar de `stage <> 'architect'`.
- [x] Mapear dependências por FK **e dentro dos payloads**; Planejador, Redator,
  Publicações ou outra marca abortam mostrando os identificadores.
- [x] Backup DISPENSADO por decisão explícita: descarte definitivo, declarado
  no cabeçalho. O manifesto é impresso na simulação.
- [x] Uma transação, dependentes antes das origens, sem anular referência.
- [x] Gatilhos: estado real lido de `pg_trigger.tgenabled` e reposto tal como
  estava (O/D/R/A), verificado — sem remover função, FK ou validação.
- [x] Verificação de conjunto zerado, preservação por hash de ids e ausência de
  órfãos, com rollback integral em qualquer divergência.
- [x] Modo `:simular` para ensaio e para provar idempotência sobre estado vazio.

### Abertas — execução

- [ ] Rodar com `v_simular := true` e conferir o manifesto impresso.
- [ ] Executar a purga e registrar o resultado por tabela.
- [ ] Conferir Arquiteto e Radar vazios **nas duas sessões**, pelo servidor.
- [ ] Confirmar que recuperação local não repovoou o servidor.
- [ ] Reexecutar em simulação sobre o estado vazio (idempotência).
- [ ] Validar o script em ambiente isolado: dependência externa, falha
  intermediária e execução repetida.

### Correção funcional separada

- [ ] **Aba Silos sem seleção e sem exclusão.** Registrado como defeito próprio;
  não é motivo desta purga nem é resolvido por ela.

## Continuidade entre sessões — base validada — 2026-09-06

- [x] Isolar os leitores por linha para que um registro incompatível não esconda
  os demais (`safeParse` em workflow, artefatos e eventos).
- [x] Isolar os oito repositórios do `GET` do workspace, nomeando a seção que
  falha em vez de devolver a marca como vazia.
- [x] Separar dado persistido inválido (502 `persisted_data_invalid`) de entrada
  inválida (400 `invalid_brand_id`).
- [x] Distinguir os cinco desfechos da leitura: completo, parcial, vazio
  confirmado, acesso negado e falha.
- [x] `requestId` rastreável em toda resposta e no log, sem segredos.
- [x] Falha da escrita remota deixa de ser reportada como importação concluída.
- [x] Validar recuperação entre duas sessões após limpeza de cache — Care Glow.

### Abertas

- [ ] **Unificar os indicadores da investigação corrente.** "Análise reaberta"
  não pode coexistir com um indicador que apresente a mesma investigação como
  concluída.
- [ ] **Mostrar a aprovação histórica separada da revisão atual.**
- [ ] Homologar nova importação, nova aprovação e entrega ao Planejador.
- [ ] Readback por artigo na importação: o POST devolver os `RadarItem`
  canônicos relidos, e o cliente aplicar só os confirmados.
- [ ] Reconstruir a investigação SERP a partir dos dois snapshots já existentes
  da máscara, **sem nova coleta paga**.
- [ ] Criar `test:radar`: 36 dos 38 arquivos de teste do Radar não rodam em
  suíte nenhuma, e dois falham por fixture desatualizada.
- [ ] Decidir os dois campos de contrato escritos e nunca lidos
  (`arquitetoSerpProvenance`, `arquitetoInternalLinks`).
- [ ] Decidir as duas autoridades de aprovação: o Workbench aprova localmente e
  não cria versão remota nem envia ao Planejador.

### Preservar como regressão

- [ ] Carregamento do workspace com um repositório falhando: os demais precisam
  continuar chegando, com a seção nomeada.
- [ ] Isolamento por marca na leitura e na importação.
- [ ] Recuperação entre sessões após limpeza de cache.

### Fora do escopo do Radar

- Fechamento humano e aprovação em lote do Arquiteto seguem no escopo próprio.
- A fundação global permanece congelada; reabrir só com defeito reproduzido,
  evidência do ponto de falha e escopo delimitado.

## Correção funcional — aprovação SERP pós-F5 — 2026-08-27

- [x] Substituir a confirmação global/fallback local por readback remoto
  estreito, autenticado e identificado por marca, artigo, ArticleDNA e
  snapshot, sem escrever nova revisão.
- [x] Preservar aprovações append-only no histórico e liberar somente a
  aprovação cujo fingerprint de curadoria ainda é o atual.
- [x] Cobrir concorrência de readback/write, troca de snapshot, mudança de
  curadoria e aprovação histórica sem fingerprint com testes direcionados.
- [x] Validar sessão autenticada após F5: a Revisão mostra `SERP aprovada`
  para o snapshot v3 e seleção atual da Care Glow.
- [ ] Executar uma nova coleta DataForSEO somente em gate próprio e com
  autorização explícita; esta correção não executou provider nem criou
  snapshot novo.

## Regressão funcional — identidade do Radar e SERP real — 2026-08-26

- [x] Separar a identidade técnica `row.id` da identidade editorial
  `row.articleId` na seleção, foco, fila, estado local, SERP, snapshots e
  ações do Workbench, preservando `row.id` somente nos adaptadores que exigem
  a linha de workflow.
- [x] Corrigir o falso conflito entre o UUID remoto do workflow e o alias
  local legado do `RadarItem`, mantendo bloqueio para marca, artigo ou
  `articleDnaVersionId` divergentes.
- [x] Adicionar regressões para o transporte de `articleDnaVersionId`,
  compatibilidade de identidade e ausência de provider durante o render.
- [ ] Executar uma única coleta manual autenticada DataForSEO e confirmar
  request/status/IDs, normalização, INSERT compatível, readback, reload sem
  nova chamada, histórico e revisão humana sem aprovação automática.
- [ ] Retomar o ExpertBrief somente após o gate do smoke SERP e a existência
  de especialista/binding reais; não criar especialista nesta correção.

## Gate estrutural fechado e abertura funcional — 2026-08-26

- [x] Registrar `RADAR_STRUCTURAL_PREREQUISITES=READY`.
- [x] Registrar `RADAR_SERP_FOUNDATION=READY` com novas coletas limitadas a
  DataForSEO e snapshots históricos Serper somente para leitura/proveniência.
- [x] Registrar `RADAR_TELEGRAM_FOUNDATION=READY` após verificação remota da
  fundação, RLS, claim/lease/retry/backoff, writeback e isolamento cross-brand.
- [x] Registrar `RADAR_PLANNER_HANDOFF=READY`, `RADAR_PLANNER_HANDOFF_V2=PASS`
  e `HANDOFF_DATABASE_CHANGE_REQUIRED=NO`.
- [x] Abrir a fase funcional `Radar → Especialista / ExpertBrief /
  ExpertContribution / Evidence`.
- [ ] Executar inbound Telegram real, texto/áudio E2E e Speech real em smoke
  manual próprio; esses gates não são promovidos por este registro.
- [ ] Validar no navegador o handoff real aprovado, readback/reload e decisão
  humana do primeiro ContentPlan, sem alterar a fronteira do Planejador.

## Handoff canônico Radar → Planejador — 2026-08-26

- [x] Criar envelope v2 aprovado, versionado, hashado e tenant-safe sem
  duplicar ArticleDNA ou transformar evidência em ContentPlan.
- [x] Adaptar a importação explícita para transportar o envelope no
  `PlannerItem` sem quebrar itens históricos.
- [x] Permitir handoff de pacote histórico Serper válido/aprovado, preservando
  a provenance; novas coletas continuam restritas a DataForSEO.
- [ ] Validar com SERP DataForSEO real, aprovação humana, persistência remota,
  reload e isolamento entre marcas.
- [x] Aplicar e auditar manualmente a fundação Telegram antes do E2E real;
  a verificação remota e o smoke JWT cross-brand foram concluídos. Não
  executar migration novamente.

## Consolidação canônica e abertura da fase — 2026-08-25

- [x] Registrar `READY_FOR_RADAR_DEVELOPMENT = YES` e a infraestrutura SERP
  compartilhada DataForSEO como contrato do Radar.
- [x] Preservar a fronteira: Radar investiga ArticleDNA recebido, não forma
  artigo, não troca principal/slug/canonical e não envia direto ao Redator.
- [x] Registrar `ExpertBrief`, `ExpertContribution`, camadas original/
  transcrição/organização e Local Worker como contratos compartilhados.
- [ ] Executar coleta DataForSEO autenticada, readback/reload/persistência e
  validação visual em tarefa própria; nenhuma chamada paga foi feita aqui.
- [ ] Configurar webhook e validar inbound Telegram E2E; Bot global e
  `getMe = PASS` não equivalem a webhook pronto.

> Itens datados anteriores a esta consolidação que citam o provider SERP
> legado são históricos/supersedidos. Permanecem para proveniência e não
> autorizam restauração, fallback ou provider próprio do Radar.

## ExpertBrief / ExpertContribution — 2026-08-25

- [x] Preparar contratos compartilhados, persistência de brief/contribuição e adapter de leitura para futuro consumidor Radar.
- [x] Preservar original, proveniência, transcript e organização em campos separados; sem aprovação automática ou alteração de ArticleDNA.
- [ ] Aplicar migration e validar contribuição Telegram real com um brief, depois desenvolver a experiência editorial do Radar em tarefa própria.

## Consumo somente leitura da formação — 2026-07-21

- O contexto estratégico do Arquiteto permanece opcional e compatível com itens antigos.
- Pendente: validação manual autenticada da leitura no navegador; nenhuma SERP real ou escrita remota foi executada.

## Agora

> Seção histórica. Superada pela seção **Dívidas abertas** no topo: os itens
> abaixo foram resolvidos nos gates de 2026-08 e 2026-09. Mantida por
> proveniência, não como pendência.

- Validar manualmente a hidratação do artigo publicado existente: texto da keyword, `KeywordDNA`, `ArticleDNA`, `SiloDNA`, nome do silo, SERP `Não pesquisada` e botão de coleta habilitado.
- Não aplicar `supabase/migrations/0003_radar_serp_snapshots.sql`; o ambiente remoto já possui as relações do schema canônico `0027`.
- Executar uma única coleta manual autenticada com keyword real e confirmar DataForSEO, INSERT compatível, readback, reload, histórico e revisão.
- Fazer validação visual da planilha, detalhe expandido, revisão humana e integração com o Planejador.

## Depois

> Seção histórica. É uma lista de desejos de 2026-07, não um compromisso
> assumido. A leitura vigente do que está aberto é a seção **Dívidas abertas**
> no topo. Mantida por proveniência.

- Integrar provider de fontes externas e sinalização de originalidade, mantendo proveniência e revisão humana.
- Evoluir classificação manual de resultado sem substituir o diagnóstico determinístico histórico.
- Avaliar rate limit/observabilidade operacional para consultas pagas, com política de custo explícita.

## Histórico supersedido — provider SERP legado — 2026-07-20

- Provider SERP legado server-side com configuração lazy, timeout, normalização e erros explícitos.
- Fallback local para coleta real quando a persistência editorial/migration remota está indisponível, preservando `origin: real`, `isMock: false` e `needs_review`.
- Erros estruturados de configuração, migration, conexão, autenticação, permissão e provider.
- Separação explícita entre UUID canônico, alias `pub-k-*`, ID de origem e texto; nenhum alias é enviado para colunas UUID.
- Ação `Abrir no Radar`, painel expandido e ação separada `Ver no Arquiteto`, sem loop de deep-link.
- Rota autenticada de coleta/revisão com bloqueio de keyword técnica e verificação de marca.
- Snapshots versionados, hash SHA-256, PAA, related searches, Knowledge Graph e diagnóstico.
- Persistência remota append-only preparada e fallback local identificável.
- UI real separada do mock e evidência real condicionada à aprovação humana.
- Integração do snapshot aprovado como referência opcional no plano do Planejador.
- Fixtures do provider e regressões editoriais/operacionais passando.
- Snapshot aditivo de hidratação no item Radar, reconciliação segura de registros antigos e resolução de aliases `pub-k-*` no cliente e no servidor.
- Inclusão de keywords sem `lista_id` no snapshot editorial quando pertencem ao conjunto de silos autorizado; nenhum conteúdo do Arquiteto é recriado ou alterado.
- Envelope editorial versionado e hashado na transferência cliente→Radar, com validação server-side, bloqueio de conflitos antes do provedor e registro de `resolutionMode`/`canonicalRemoteVerified`.

## Fora do MVP

- Scraping direto do Google.
- Retry, polling, coleta em lote implícita ou aprovação automática.
- Execução de migration remota e consulta paga automática durante testes.
## Novos itens - 2026-07-20

- Validar manualmente a pagina `/radar/[articleId]`: abas, curadoria, extracao controlada, aprovacao e recovery apos reload.
- Confirmar no Planejador a visualizacao do pacote Radar aprovado e decidir humanamente entre manter o plano atual ou criar sucessora.
- Integrar fontes externas e originalidade sem transformar observacao em aprovacao automatica.
- Validar manualmente a navegação tenantizada do Radar em artigo real: `Abrir no Radar`, retorno ao Radar, deep-link do Arquiteto e link do Planejador em Adalba e Lindisse.
- Adicionar sincronizacao posterior do recovery local sem nova coleta ou extracao.

## Correção estrutural de evidência — 2026-07-20

- Validar manualmente que a URL canônica usa `articleDnaVersionId` limpo e que `/radar/radar%3Apub-k-*` redireciona uma única vez.
- Confirmar os nove resultados no Resumo, SERP e Concorrentes após reload com remoto parcial e recovery local completo.
- Confirmar estados específicos para PAA, relacionadas, Knowledge Graph, extração não iniciada, amostra insuficiente e conflito de hash.
- Confirmar no Planejador que `RadarEvidencePackage` aparece como evidência e que ContentPlan existente não é sobrescrito.

## Validacao manual da correcao de hidratacao — 2026-07-20

- Abrir uma linha real pela planilha e confirmar que a URL usa `RadarItem.id`; abrir também uma URL antiga `pub-k-*` e confirmar redirecionamento canônico com `?tab=serp` preservado.
- Confirmar nas sete abas o mesmo snapshot SERP v1, seus resultados orgânicos/PAA/relacionados/Knowledge Graph, ArticleDNA, KeywordDNA, SiloDNA e revisão legada.
- Recarregar a página e confirmar recovery local/servidor sem nova chamada ao provider SERP legado, sem perda de resultados e sem substituição por estado vazio.
- Só após essa conferência, iniciar a análise uma vez e confirmar que ela referencia o mesmo snapshot, sem duplicar coleta ou versão por duplo clique/reload.

## Identidade e proteção — implementado em 2026-07-20

- Identidade editorial, proteção de publicados, DNAs, silo, comparação DNA x SERP e orientação por próxima ação.
- Justificativa de keyword exigida somente para conflito que encaminha revisão ao Arquiteto.
- Validar manualmente selo `Publicado e protegido`, URL publicada em nova aba, proveniência recolhida e campos preservados em artigo publicado e novo.

## Fechamento operacional — implementado em 2026-07-21

- Estados separados de investigação, publicação e transferência, com progresso real condicionado à revisão da SERP orgânica.
- Registro versionado de transferência ao Planejador, com distinção entre corrente, aprovada, enviada e atualização disponível, sem duplicar artigo ou `ContentPlan`.
- Mensagens canônicas para dado não recebido nesta etapa, proteção compreensível de publicados e orientação de artigos novos para o Arquiteto.
- Benchmark limitado a artigos editoriais completos e semântica com categorias de ruído e recuperação explícita.
- Cobertura automatizada de formatos, semântica, estados, transferência e chaves React duplicadas em `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.

## Validação manual restante

- Conferir um artigo novo e um publicado, preservando identidade, canonical, URL estrutural e controles somente leitura.
- Conferir uma SERP com itens orgânicos pendentes e outra com todos revisados, verificando a diferença real no progresso e na próxima ação.
- Aprovar e enviar uma versão; criar uma sucessora; confirmar que a atualização é indicada sem duplicar artigo ou plano.
- Executar uma coleta DataForSEO real somente por ação manual autenticada, com uma keyword, após confirmar configuração e persistência autorizadas. As referências anteriores ao provider SERP legado permanecem históricas.

## Contexto KGR e identidade estratégica — implementado em 2026-07-21

- Exibir no Resumo a estratégia KGR recebida, origem, principal, score, volumes, composição, limite, papéis, hierarquia, slug e situação de publicação.
- Preservar classificação recebida; sugerir KGR leve sem recalcular classificação pela SERP; manter ausência como estado explícito.
- Comparar principal e slug sem alteração automática; encaminhar artigo novo desalinhado ao Arquiteto e proteger publicado historicamente desalinhado.
- Transportar `kgrStrategy` de forma aditiva no `RadarEvidencePackage`, com aviso de sobreposição e sem metas finais de ContentPlan.
- Manter referências acima de seis visíveis em recovery/fixture e bloquear somente a consolidação de novo pacote até revisão no Arquiteto.

## Validação manual KGR restante

- Cenário A: artigo KGR novo, slug alinhado, até seis keywords, sugestão KGR leve e primeiro envio ao Planejador.
- Cenário B: artigo KGR publicado com slug desalinhado, campos protegidos e oportunidade de atualização sem troca de URL.
- Cenário C: artigo não KGR, sugestão competitiva completa, composição preservada e nenhuma classificação inventada.
- Cenário D: artigo com mais de seis referências em recovery/fixture, conflito visível, nenhuma referência apagada e revisão indicada no Arquiteto.
- Cenário E: KGR ausente, estado honesto e escolha humana de profundidade.

## Relatorio competitivo - pendencias

- Validar manualmente a leitura do relatorio em artigo completo, amostra pequena, video/formato e SERP ausente, sem recolher dados durante o teste.
- Confirmar no Planejador que o `RadarEvidencePackage.competitiveReport` aparece como contexto e nao preenche outline ou metas automaticamente.
- Evoluir a extracao somente com contrato aprovado quando houver necessidade de frequencia por title/H1/intro/headings, fontes detalhadas de links, comentarios ou fontes externas; hoje esses campos ficam explicitamente indisponiveis.
- Avaliar em tarefa propria uma aba dedicada para o relatorio se o volume do Resumo deixar de ser suficiente; esta rodada manteve a composicao existente e adicionou a leitura consolidada sem alterar a navegacao dos consumidores.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/radar; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.


## Fluxo por modo — validação manual restante

- Abrir um artigo KGR publicado e um artigo KGR novo em Adalba e Lindisse; confirmar sugestão KGR leve, motivo humano, proteção da identidade e isolamento entre marcas.
- Abrir um artigo sem KGR; confirmar sugestão competitiva completa, estado honesto de KGR ausente e ausência de classificação inventada.
- Na seleção, conferir todos os resultados orgânicos, artigo próprio, vídeos/redes sociais, PAA, relacionadas e Knowledge Graph; confirmar que somente páginas externas selecionadas podem ser analisadas.
- Validar amostra KGR com uma a três referências e amostra competitiva com três a cinco páginas quando disponíveis; confirmar benchmark sem vídeo, social, parcial ou artigo próprio.
- Conferir semântica em caso de repetição, termo central, navegação, legal, plataforma e termo pontual; recuperar manualmente um termo ignorado e verificar nova versão de evidência.
- Conferir a ordem das cinco áreas, a próxima ação única, estados de carregamento/erro/desabilitado, foco de teclado e legibilidade em 360, 768, 1024 e 1440 px, em light e dark.
- Aprovar e enviar ao Planejador; confirmar pacote como contexto, sem criação automática de outline, metas ou nova entidade.

## Seleção e relatório — pendências após a correção localizada

- Validar manualmente a troca de função de um resultado entre principal, apoio, formato, próprio e excluído, confirmando que apenas uma função fica visível por vez.
- Validar manualmente a permanência das decisões após recarregar a aba e a não reextração de uma URL já analisada.
- Confirmar em navegador uma prévia com uma página comparável, incluindo limitação explícita e ausência de média de mercado, e uma prévia com duas ou mais páginas, incluindo média/mediana/mínimo/máximo.
- Confirmar que apoio, formato e conteúdo próprio são exibidos no relatório sem contaminar a leitura principal do benchmark.
- Completar smoke test DataForSEO autenticado e persistência remota; esta rodada não acionou provider real nem alterou storage remoto.

## Lote Radar R2 — implementação concluída localmente — 2026-08-25

- Workbench com navegação direta por etapa e preservação de tenant/artigo; SERP usa a aba canônica `serp` e aliases legados continuam resolvidos.
- Tela SERP avançada, curadoria de Referências com filtros e Análise SERP com sinais de necessidades, lacunas, conflitos, oportunidades e fontes.
- Evidências adicionais com navegação interna e fixture local; atividade compacta no Workbench; Perfil expandido com links para as áreas detalhadas.
- Testes automatizados R2 e direcionados passam; build permanece pendente por indisponibilidade do Google Fonts; validação visual autenticada permanece pendente por ausência de sessão no navegador local.
- Telegram real continua bloqueado por `DATABASE_CHANGE_REQUIRED=YES` e `PLANNER_GERAL_REQUIRED=YES`; não criar schema, migration ou conexão nesta frente.

## Lote Radar R3 — implementação concluída localmente — 2026-08-25

- Workbench reorganizado em quatro áreas expansíveis: SERP, Amazon, Conteúdo e Especialista, com relatório consolidado abaixo.
- Tabela e Perfil usam o mesmo read model R3; Amazon é opcional/local e a fixture do Especialista não representa Telegram real.
- Validar manualmente a viewport 1024 px, tema claro e aprovação/transferência no navegador autenticado; as quatro expansões, o Perfil, a tabela e as viewports 360/768/1440 px no tema escuro já foram conferidos.
- Não iniciar provider Amazon, integração Telegram, migration ou mudança de schema nesta frente.

## Lote Radar R3.1 — refinamento do Workbench — 2026-08-25

- Remover ações globais e superfícies redundantes do Workbench: `Detalhe compatível` e a faixa `Área ativa`.
- Manter aprofundamentos dentro de SERP, Amazon, Conteúdo, Especialista e Relatório, sem navegação global obrigatória.
- Exibir no Conteúdo os dados editoriais primeiro e recolher IDs, snapshots, version IDs e hashes em `Proveniência / detalhes técnicos`.
- Validado no tema escuro em sessão autenticada nos breakpoints 768/1024/1440 px: 4 cards, expansões, Perfil, tabela, ausência de overflow e detalhes técnicos recolhidos. Tema claro e aprovação/transferência por interação permanecem pendentes; deep links e não criação de versão seguem cobertos por código/testes.

## Lote Radar R3.2 — fila sequencial — implementado localmente — 2026-08-25

- [x] Exigir seleção explícita da planilha; sem artigo, manter Workbench compacto, cards desabilitados e mensagem `Selecione um artigo para trabalhar`.
- [x] Fazer o Workbench inteiro acompanhar um único artigo selecionado, preservando isolamento de SERP, Amazon, Conteúdo, Especialista, relatório, próxima ação e ArticleDNA.
- [x] Manter SERP → Amazon → Conteúdo → Especialista em cards compactos, com no máximo uma expansão e Amazon explicitamente não aplicável sem provider.
- [x] Recolher o relatório em faixa compacta e deixar a planilha ocupar o restante flexível da viewport, sem altura rígida no Workbench fechado.
- [x] Cobrir seleção, troca de contexto, estado vazio, relatório e não criação de versão/provider com testes direcionados.
- [x] Validar render autenticado em tema escuro nos breakpoints 1440/1024/768/360 px; tema claro, aprovação/transferência e smoke remoto continuam pendentes.

## Lote Radar R4 — fila sequencial — implementação local — 2026-08-25

- [x] Workbench fechado compacto, sem relatório/metadados redundantes, com quatro cards fixas e planilha dominante.
- [x] Separar `focusedArticleId` de `selectedArticleIds[]`; checkbox não muda obrigatoriamente o foco.
- [x] Manter estado local independente por artigo para SERP, tópicos, especialista e relatório, sem vazamento ao trocar o foco.
- [x] Transformar a barra inferior em Bulk Operations Bar com elegibilidade `eligible / alreadyDone / blocked` por operação.
- [x] Criar fila SERP local sequencial, estados por artigo, revisão pendente e navegação anterior/próxima pendente.
- [x] Preparar tópicos e aprovação em lote localmente com gate humano e sem envio automático.
- [x] Preparar estados do especialista, avisos de sessão e status processuais específicos na planilha.
- [x] Auditar `external_processing_jobs`/Local Worker: reuso parcial; não criar queue/table/migration paralela.
- [ ] Validar execução real de lote, readback/reload remoto e worker genérico após gate do Planner Geral.
- [ ] Validar navegador autenticado no estado sem seleção, com foco, seleção múltipla e artigos em estágios A/B/C/D; validar tema claro.
- [ ] Integrar Telegram/contribuição real somente após migration, contrato e autorização estrutural.

## Lote Radar R4.1 — fechamento local da fila sequencial — 2026-08-26

- [x] Separar foco operacional e seleção coletiva, mantendo o Workbench inteiro no artigo focado.
- [x] Exibir elegibilidade por processo com `eligible`, `alreadyDone`, `blocked` e `notApplicable`.
- [x] Manter fila SERP sequencial local com revisão e aprovação explícitas, sem provider ao selecionar ou abrir artigo.
- [x] Representar Amazon aplicável/não aplicável/pendente/revisada sem chamada externa.
- [x] Montar contexto local do especialista e permitir edição, remoção, adição e reordenação de tópicos antes do envio.
- [x] Manter relatório, avisos e estados processuais como estado de sessão, sem nova entidade remota.
- [ ] Validar tema claro por screenshot, lote real, persistência/readback remoto e aprovação/transferência autenticadas.
- [ ] Evoluir jobs genéricos, Telegram, DeepSeek, STT, Storage e worker somente após `DATABASE_CHANGE_REQUIRED=YES` e gate do Planner Geral.

## RADAR R5 — fila sequencial e especialista — 2026-08-26

- [x] Auditar artigos reais, elegibilidade, snapshots existentes e estágios sem criar dados de teste; Care Glow apresentou 1 artigo real elegível e 0 snapshots SERP reais nesta sessão.
- [x] Usar o handler canônico existente para lote SERP sequencial, com estados por artigo, continuidade após falha e retry individual.
- [x] Bloquear reprocessamento implícito; disponibilizar refresh somente como ação explícita.
- [x] Recuperar `WAITING_REVIEW`/`COMPLETED` de snapshots e revisões existentes após reload, sem criar fila remota paralela.
- [x] Conectar a revisão individual ao `pipeline.reviewSerp` e manter anterior/próximo no contexto do artigo correto.
- [x] Exibir progresso compacto somente enquanto a fila estiver ativa, com foco de pendentes e falhas.
- [x] Preparar contexto real disponível para pautas, chamar o consumidor canônico DeepSeek somente por ação explícita e manter resposta como cópia de trabalho local.
- [x] Implementar fila de revisão individual das pautas, gate coletivo, edição, remoção, adição, reordenação, desfazer e refazer.
- [ ] Executar smoke autenticado de lote SERP, retry, revisão individual, reload/readback remoto e DeepSeek; nenhum provider foi acionado nesta rodada.
- [x] Auditar a fundação remota, incluindo `external_processing_jobs`, RLS,
  claim/lease/retry/backoff e isolamento cross-brand. O gate estrutural foi
  fechado em 2026-08-26; a idempotência de envio real ainda é smoke separado.
- [ ] Executar texto Telegram end-to-end manual antes de qualquer áudio/STT; áudio permanece fora do escopo executável até o texto ser comprovado.

## RADAR R6 — contexto real, revisão de pautas e relatório consolidado — 2026-08-26

- [x] Congelar o Workbench, as quatro cards, a planilha, o foco/seleção e a Bulk Operations Bar do R5.
- [x] Consolidar estados independentes de SERP, Amazon, Especialista e Relatório, sem status global substituto.
- [x] Criar `buildExpertTopicContext(articleId)` com ArticleDNA, KeywordDNA, SiloDNA, SERP, referências, necessidades, lacunas, conflitos, Amazon, conteúdo existente e proveniência real.
- [x] Integrar o consumer canônico DeepSeek por ação explícita, exigir 3–5 perguntas e manter o retorno em `TOPICS_READY_FOR_REVIEW` local.
- [x] Exibir proveniência, origem combinada, necessidade, motivo, referência e material complementar sem inventar IDs ou transformar perguntas em evidência.
- [x] Implementar revisão sequencial individual, edição, adição, remoção, reordenação, restauração e gate coletivo de pautas.
- [x] Implementar o modelo local de relatório consolidado e separar `REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED`, incluindo os caminhos sem especialista e aguardando especialista.
- [x] Manter o relatório recolhido/compacto, sincronizar o Dossiê Conteúdo somente como leitura e validar a continuidade visual do Workbench.
- [x] Auditar o handoff Radar → Planejador: `PLANNER_HANDOFF_CONTRACT=STRUCTURAL_CHANGE_REQUIRED`; registrar `BLOQUEADO — PLANNER GERAL` sem alterar o Planejador.
- [x] Registrar entradas locais de YouTube/podcast/vídeo/áudio/documento nos três estados permitidos, sem download; confirmar prontidão contratual de áudio sem implementar STT.
- [ ] Executar smoke real DeepSeek somente com autorização explícita; estado atual `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- [x] Confirmar remotamente as oito relações Telegram, ExpertBrief/binding e
  o routing cross-brand antes do E2E; `TELEGRAM_REMOTE_FOUNDATION=READY`.
  Texto e contribuição real permanecem pendentes.
- [ ] Auditar/alterar o contrato do Planejador somente em frente estrutural autorizada; não criar adapter especulativo para Amazon/ExpertEvidence.

## RADAR R7 — evidência, fixtures e relatório — 2026-08-26

- [x] Formalizar matriz SERP/Amazon/Conteúdo/Especialista/Relatório com distinção entre dado real derivado, persistência, reconstrução, estado local e fixture.
- [x] Validar contexto real por artigo/marca/versão e impedir que fixture médica contamine artigo de marketing; fixture visual exige modo de teste explícito.
- [x] Validar resposta DeepSeek localmente em 3–5 pautas, duplicidade, proveniência ausente, necessidade relacionada, truncamento, schema inválido e origem fora do escopo.
- [x] Preservar tópicos válidos existentes quando uma tentativa de IA falhar; somente o estado da tentativa recebe retry local.
- [x] Separar `NEED`, `QUESTION`, `CONTRIBUTION` e `ExpertEvidence` no Dossiê Conteúdo, mantendo origem, estado e proveniência visíveis.
- [x] Cobrir relatório sem especialista, especialista pendente, `ExpertEvidence` revisada e Amazon pendente; manter gerar/atualizar, revisar e aprovar como ações distintas.
- [x] Impedir que evidência nova apareça silenciosamente em relatório local já aprovado; fingerprint exige nova geração/revisão.
- [x] Preparar fixtures locais de texto/áudio com original, transcrição e organização separados; preservar faixa temporal na evidência local sem STT/Storage real.
- [x] Auditar Local Worker, `original_asset_uri`, claim/lease/retry/backoff e estados sem alterar schema ou writeback remoto não comprovado.
- [x] Auditar Radar → Planner: campos aceitos, campos faltantes, proveniência e decisões; classificar `PLANNER_CONTRACT_AUDIT=STRUCTURAL_CHANGE_REQUIRED` e `PLANNER_ADAPTER=BLOCKED_BY_PLANNER_GERAL`.
- [ ] Executar smoke real DeepSeek somente com autorização explícita; estado atual `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- [x] Confirmar remotamente as oito relações Telegram, RLS, worker, writeback
  `originalAssetUri` e isolamento; `TELEGRAM_REMOTE_FOUNDATION=READY`.
  Inbound/texto/áudio E2E permanecem pendentes.
- [ ] Validar visualmente R7 em sessão autenticada nos temas claro/escuro e nos breakpoints 360/768/1024/1440 px; não propagar redesign do Workbench congelado.

## RADAR — Fase funcional 1: Especialista / ExpertBrief — 2026-08-26

- [x] Listar especialistas reais e utilizáveis da Marca por `brandId`, sem
  criar especialista silenciosamente e sem expor identificadores Telegram.
- [x] Filtrar briefs pela combinação exata de Marca, artigo, versão do
  ArticleDNA e especialista, preservando histórico/múltiplas pautas sem
  assumir o último registro.
- [x] Integrar seleção de especialista, binding informativo, necessidades,
  lacunas, perguntas editáveis e contexto do artigo no Workbench e no detalhe
  canônico.
- [x] Diferenciar `Criar pauta`, `Salvar pauta`, revisão humana, contribuição
  recebida e `ExpertEvidence`; editar uma pauta existente usa PATCH e não
  duplica o registro.
- [x] Persistir em `expert_briefs` usando o status remoto já existente e
  exigir confirmação/readback compatível antes de informar sucesso.
- [x] Permitir `Gerar sugestões` somente por ação explícita e manter a saída
  de IA como cópia revisável, sem aprovação ou envio automático.
- [x] Retirar a fixture médica da rota real do artigo; mantê-la apenas no modo
  explícito de teste.
- [x] Cobrir contexto, isolamento, status, readback, criação/atualização e
  transporte pendente em testes direcionados.
- [ ] Executar smoke autenticado autorizado de leitura, criação, atualização,
  readback, F5 e negativo cross-tenant em uma única Marca; o smoke parcial de
  2026-08-26 confirmou a sessão e a leitura contextual, mas retornou
  `EXPERT_LIST_REMOTE=PASS_EMPTY` para Care Glow e parou antes de qualquer
  escrita.
- [ ] Implementar/homologar envio Telegram explícito após pauta salva, revisada
  e binding válido; não transformar esse item em envio automático.
- [ ] Validar screenshots desta fase em tema claro/escuro e nos breakpoints
  360/768/1024/1440 px sem alterar a planilha dominante ou o Workbench R3/R7.

## Fase funcional real — ExpertBrief, Telegram, contribuição e áudio — 2026-08-26

- [x] Implementar criação/atualização/readback de ExpertBrief e envio Telegram
  somente por ação explícita, com claim, contexto exato e idempotência.
- [x] Roteiar inbound pelo binding e `selected_brief_id`, rejeitando brief não
  enviado e evitando heurística de última pauta.
- [x] Persistir contribuição original e transição `awaiting_review` sem
  converter automaticamente contribuição em `ExpertEvidence`.
- [x] Implementar projeção/revisão humana de ExpertEvidence, separando
  solicitação, original, transcrição e organização; preservar IDs apenas em
  proveniência técnica recolhida.
- [x] Implementar writeback do asset original, transcrição fiel e organização
  DeepSeek em camadas distintas sobre o schema já existente.
- [x] Implementar worker local de um ciclo com claim, lease/heartbeat,
  retry/backoff, follow-ups de áudio e comando operacional
  `local-worker:once`.
- [x] Bloquear relatório/handoff quando a leitura remota estiver pendente,
  ilegível ou divergente do fingerprint aprovado; nova evidência exige nova
  revisão humana.
- [ ] Executar gates reais G1–G11 com especialista ativo, binding válido e
  interação humana Telegram; o último smoke autenticado encontrou a lista de
  especialistas Care Glow vazia e nenhum provider foi chamado nesta
  continuidade.
- [ ] Validar visualmente o fluxo completo em tema claro/escuro e confirmar
  readback remoto, GCS, STT, transcript fidelity e Planejador sem criar dados
  artificiais ou migrations.

## Correção funcional imediata — SERP unificada no Workbench — 2026-08-26

- [x] Auditar a curadoria legada e transportar para a expansão SERP a coleta,
  resultados orgânicos, seleção, exclusão, classificação, análise, revisão,
  aprovação e histórico necessários ao fluxo normal.
- [x] Usar `RadarAnalysisVersion.payload.serpDecisions` como fonte única,
  preservar as chaves históricas e vincular toda projeção ao snapshot atual;
  impedir que análise antiga seja aplicada a snapshot novo.
- [x] Persistir decisões como sucessoras da análise existente, exigir
  readback remoto antes de sucesso e atualizar a recuperação local sem chamar
  provider ao abrir, selecionar ou analisar.
- [x] Analisar somente concorrentes/referências selecionados; manter PAA,
  relacionadas e Knowledge Graph como evidências complementares recolhíveis.
- [x] Remover `Curadoria detalhada` do fluxo normal sem apagar a rota legada;
  manter deep links, histórico, relatório detalhado e evidências adicionais
  compatíveis.
- [x] Cobrir seleção estável em rerender, troca de snapshot, análise somente
  da seleção e bloqueio de aprovação stale em testes direcionados.
- [x] Manter PAA, relacionadas e Knowledge Graph como contexto complementar
  recolhível sem transformar suas linhas legadas pendentes em bloqueio da
  aprovação dos resultados orgânicos.
- [ ] Executar smoke autenticado com snapshot SERP real: seleção A/B/C,
  write/readback, F5, análise, revisão e aprovação. Requer snapshot disponível
  e autorização imediatamente antes de qualquer escrita/provider.
- [x] Corrigir o readback específico da análise Radar, normalizar timestamps
  remotos e distinguir `row.id` do identificador lógico do payload; o caminho
  local foi validado em 63 testes e o reload não chama provider.
- [ ] Retomar o gate remoto somente com confirmação imediata: selecionar e
  persistir A/B/C, analisar a seleção, aprovar uma vez, atualizar uma única
  vez via DataForSEO e registrar screenshots/readback sem declarar PASS antes
  de cada evidência.

## Bug prioritário — seleção SERP visível versus ação desabilitada — 2026-08-26

- [x] Unificar checkbox, contagem, referências, análise e aprovação na
  projeção canônica `buildRadarSerpSelectionProjection`.
- [x] Preservar o contrato histórico de decisão e manter a chave visual
  ligada ao snapshot/URL, sem misturar artigo ou snapshot anterior.
- [x] Bloquear readback concorrente/obsoleto com revisão de request, writes em
  andamento, fingerprint local e `lockVersion` monotônico.
- [x] Cobrir troca de artigo/snapshot, rerender, reabertura e dez ciclos de
  seleção em fixtures imutáveis sem chamadas externas.
- [ ] Homologar no navegador autenticado dez ciclos A/B/C sem F5 ou restart,
  confirmando no DOM `VISIBLE_SELECTED_COUNT = CANONICAL_SELECTED_COUNT`;
  requer autorização imediatamente antes do write/readback remoto.
- [ ] Somente após `SERP_SELECTION_STABILITY=PASS`, retomar smoke remoto de
  seleção, readback, análise, aprovação e atualização única DataForSEO.

## Correção urgente — foco da linha versus seleção coletiva — 2026-08-27

- [x] Separar semanticamente `focusedArticleId` e `selectedArticleIds`,
  preservando `articleId` no estado editorial e `row.id` somente como
  identidade técnica da linha do grid.
- [x] Fazer clique normal de linha focar somente o artigo; fazer checkbox de
  linha/cabeçalho controlar somente seleção em lote; bloquear propagação de
  `pointerdown`/`click` nos controles e no chevron.
- [x] Fazer Workbench depender do foco e Bulk Bar depender exclusivamente das
  linhas selecionadas pelo checkbox.
- [x] Diferenciar visualmente foco e lote com borda/indicador contextual e
  tokens semânticos, preservando defaults dos consumidores existentes do grid.
- [x] Cobrir o contrato de identidade, eventos e visual em testes direcionados;
  lint, guardião visual oficial e `git diff --check` passaram.
- [ ] Executar os seis cenários físicos no navegador autenticado, incluindo
  centro do checkbox, texto, área vazia e chevron, sem reload/restart. O
  conector de navegador/Chrome não está disponível nesta continuidade.

## Correção do modelo de seleção da planilha — 2026-08-27

- [x] Unificar `selectedArticleIds[]` e `activeArticleId` em transições locais
  que impedem check sem Workbench e Workbench em artigo desmarcado.
- [x] Fazer checkbox e clique normal selecionar e ativar a mesma linha;
  preservar multiseleção e a contagem integral da Bulk Operations Bar.
- [x] Cobrir seleção de cabeçalho, fallback ao desmarcar ativo, limpeza do
  último artigo e os dois estados impossíveis em teste unitário.
- [ ] Homologar os sete passos no navegador autenticado sem reload/restart,
  verificando checkbox, rótulo `Em foco`, Workbench e contagem coletiva. Não
  requer provider nem escrita remota.

## SERP — subnavegação contextual do processo — 2026-08-27

- [x] Organizar a expansão SERP em Coleta, Concorrentes, Análise, Evidências,
  Revisão e Histórico sem criar rota, nova página ou alteração de Workbench.
- [x] Centralizar a sugestão de etapa em nextSerpStep, preservar a curadoria
  como fonte exclusiva dos concorrentes e rebaixar Anterior/Próxima para
  Revisão.
- [x] Preparar Evidências com separação explícita entre SerpEvidence,
  ExternalEvidence, ExpertEvidence e ProductEvidence sem novo schema.
- [ ] Validar no navegador autenticado o percurso completo, a análise reaberta
  após alteração de concorrente e o retorno a Concorrentes sem reload.

## Gate remoto da aprovação SERP — 2026-08-27

- [x] Homologar a curadoria delegada das posições 6, 8, 9 e 10 com motivos
  específicos e confirmar visualmente a seleção reidratada após F5.
- [x] Confirmar análise explícita com somente os quatro concorrentes humanos
  selecionados.
- [ ] Corrigir ou diagnosticar com readback remoto verificável por que a
  aprovação aparece no Histórico após F5, mas a Revisão permanece em
  `local_fallback`. Não criar schema/migration/RLS nem repetir a aprovação
  append-only sem necessidade técnica comprovada.
- [ ] Somente após `SERP_APPROVAL_RELOAD=PASS`, executar uma única atualização
  DataForSEO autorizada, com snapshot, readback, histórico e reload; manter
  `SERPER_CALLS=0`.
- [ ] Somente após `RADAR_SERP_OPERATIONAL=PASS`, iniciar ExternalEvidence
  conforme o contrato já aprovado.


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

## Coerência entre título e guia das pautas audiovisuais — registrado em 2026-09-13

Regra para a GERAÇÃO FUTURA de VideoBrief (VIDEOS_3.4 · §10). Nada retroativo:
bundle congelado permanece como está.

- `whatToLookFor` deve ser semanticamente coerente com o `title` da pauta. Hoje a
  guia sai do tipo do conceito e da presença de especialista, enquanto o título sai
  do rótulo do bloco — e os dois podem discordar.
- Discordância real no bundle `bundle:2be6e384`: a pauta "O que causa acne?" recebeu
  a guia do ramo do especialista (ressalva do profissional, exceção à regra, erro
  comum). Nenhum desses três pede CAUSA, que é o que o título promete.
- Guia correta para uma pauta causal: fatores que contribuem; mecanismos mencionados;
  causas diferenciadas de agravantes; ressalvas do profissional.
- A geração deve validar TITLE_INTENT ↔ WHAT_TO_LOOK_FOR antes de congelar.
- Efeito hoje: o casamento (m4) usa o TÍTULO como contrato e não deixa a guia
  compensá-lo, então a incoerência aparece como pauta NOT_FOUND — não como
  evidência errada. A pauta continua nascendo torta; só não contamina mais o
  resultado.
- Ponto no código: `razaoDeVideo`, em `lib/radar/editorial-blueprint.ts`.

## SPECIALIST_2.1 — dívidas abertas da consulta externa

Registradas em 2026-09-13, ao liberar a consulta Telegram sem cadastro manual.
Nenhuma delas bloqueia o smoke; todas bloqueiam produção multi-marca.

### P1 — MULTI-MARCA: uma pessoa, uma marca só

Os índices `uq_telegram_binding_active_user` e `uq_telegram_binding_active_chat`,
criados em `20260825150000_telegram_expert_contribution_platform_foundation.sql`,
são únicos por `(bot_key, telegram_user_id)` e `(bot_key, telegram_chat_id)`
entre TODAS as marcas. Consequência concreta: uma pessoa vinculada à marca A que
abrir o link da marca B recebe `23505` e o webhook responde
`TELEGRAM_BINDING_ALREADY_EXISTS` — um erro que ela não causou e não consegue
resolver.

O efeito é duplo: `findActiveTelegramBinding` (`lib/server/telegram/persistence.ts`)
busca por `telegram_user_id` SEM `brandId` e usa `maybeSingle()`. Mesmo depois de
afrouxar o índice, o roteamento precisaria decidir a qual consulta uma mensagem
pertence — hoje ele depende de só existir uma.

Corrigir ANTES de liberar o fluxo para mais de uma marca em produção. Exige
migration (identidade Telegram global, participação N:N) e reescrita do
roteamento de binding.

### P1 — MAIS DE 8 PAUTAS SÃO TRUNCADAS EM SILÊNCIO

`sendBriefSelection`, em `lib/server/telegram/webhook.ts`, monta o teclado com
`briefs.slice(0, 8)`. Da nona pauta em diante o especialista não vê a opção e não
recebe aviso nenhum — ele simplesmente não consegue responder àquele ponto.

Nunca truncar pauta em silêncio: ou pagina, ou diz quantas ficaram de fora.

### BACKLOG FUTURO — canal de e-mail

Não implementado neste gate por decisão explícita do SPECIALIST_2.1 §9. O link
copiado já pode ser colado num e-mail escrito por uma pessoa.

- `EMAIL_OUTBOUND` — enviar o convite por e-mail a partir do Radar, com o mesmo
  token one-time. Exige provider transacional e registro de entrega.
- `EMAIL_INBOUND_WEBHOOK` — receber a contribuição por resposta de e-mail.
  Exige dedupe por Message-ID equivalente ao de `external_update_id`, e uma
  decisão sobre anexos (o pipeline de mídia hoje só conhece `telegram_file_id`).

### P1 — DUAS DECISÕES SIMULTÂNEAS NA MESMA PAUTA PODEM PERDER UMA

Registrado no SPECIALIST_3.

A decisão humana sobre uma contribuição é gravada em
`expert_briefs.radar_context.contributionReviews`, por
`app/api/editorial/expert-contributions/review/route.ts`. A rota LÊ o contexto,
mescla a decisão e ESCREVE o objeto inteiro de volta — sem trava otimista.

Duas pessoas decidindo sobre contribuições DIFERENTES da mesma pauta, dentro da
mesma janela de leitura-escrita, produzem last-write-wins: a segunda gravação
apaga a primeira. O readback confirma a decisão de quem escreveu por último, e
nada acusa a perda.

Na prática o risco é baixo — uma pauta costuma ter poucas contribuições e um
revisor —, e a alternativa exige `If-Match` sobre `updated_at` ou uma coluna de
decisão por contribuição. As duas exigem migration, que este gate não autorizou.

Corrigir antes de mais de um revisor operar a mesma marca em paralelo.

### DÍVIDA ASSUMIDA — decisões anteriores ao SPECIALIST_3 não foram migradas

Antes deste gate, aceitar/rejeitar era gravado em `localStorage`, na chave
`radar:expert-evidence-review:<marca>:<artigo>:<versão>`. Aquilo nunca saiu do
navegador: não havia como o servidor lê-lo, e portanto não há migração possível
a partir do servidor.

No runtime homologado não havia decisão nenhuma tomada — a única contribuição
estava em "Contribuição a revisar" quando o gate começou. Se alguma existir em
outro navegador, ela precisa ser tomada de novo, uma vez, e passa a ser remota.

### P1 — A CAMADA DE ESPECIALISTA EXISTE NO CONTRATO E NÃO TEM CAMINHO DE RUNTIME

Registrado no SPECIALIST_3 (§9 e §10).

`RadarEvidenceBundle.specialist` foi criada, validada e provada no round-trip do
`RadarPlannerHandoffV3` — inclusive a recusa de uma camada amarrada a outra
versão do ArticleDNA. O que ela ainda NÃO tem é quem a construa em produção:
`buildRadarEvidenceBundle` e `buildRadarPlannerEvidenceHandoff` não são chamados
por nenhum arquivo de `app/`, `lib/` ou `modules/` — só por teste. O contrato v3
inteiro está pronto e desligado, e isso é anterior a este gate.

O que o Planejador recebe HOJE é o handoff v2, montado em `report-approval.ts`,
com `expertEvidence: RadarExpertEvidence[]`. Depois deste gate ele já chega com
a DECISÃO HUMANA REMOTA — antes ela vinha do `localStorage` de quem aprovou. Mas
o contrato v2 não tem onde carregar:

- `requirementId` — a necessidade que originou a consulta
- a pergunta efetivamente enviada
- a classificação editorial
- a distinção entre `SUPPORT_ONLY` e `QUOTE_CANDIDATE`, que
  `RadarExpertEvidenceSchema.humanDecision` colapsa em `accepted`

NÃO foi criada uma terceira representação da mesma evidência para contornar
isso: duas verdades envelhecendo em ritmos diferentes é exatamente o que o
módulo de dossiê existe para impedir. A ligação certa é ligar o v3, não
remendar o v2.

Fazer junto com o gate que ligar o `RadarEvidenceBundle` v3 ao runtime.

### P2 — O SERVIDOR AINDA LÊ O TRANSCRIPT INTEIRO PARA DESCARTÁ-LO

Registrado no RADAR_LIVE_UX_2.2 (§8).

A listagem da área Vídeos deixou de MANDAR `transcript_text` e `segments` ao
navegador: 420,7 KB por leitura viraram 23,3 KB, medido no acervo real. O corte
acontece em `lerTextos`, que projeta `radarVideoTextSummary` antes de responder.

O que ele ainda não corta é o salto ANTERIOR: o `select` continua trazendo o
texto inteiro do Postgres para a função, que o resume e joga fora. Esse trecho é
Supabase → Vercel, na mesma região, e não é o que a pessoa espera na tela — mas
é trabalho pago a cada revalidação da área, que este gate tornou automática.

Resolver exige uma das duas, e as duas pedem migration:

- colunas geradas em `radar_video_source_texts` (`segment_count`,
  `character_count`, `preview`, `start_ms`, `end_ms`), lidas direto no `select`;
- ou uma função no Postgres devolvendo o resumo, chamada por RPC.

Nenhuma migration foi aberta neste gate. Fazer junto da próxima que tocar essa
tabela.

### P2 — A COLETA DE YOUTUBE É SEQUENCIAL, E ISSO É ESCOLHA

Registrado no YOUTUBE_SEARCH_1 (§4).

A rota executa as consultas UMA A UMA. Não é descuido: com seis chamadas num
único `Promise.all`, uma falha de rede no meio derrubaria o lote inteiro, e a
pessoa pagaria o START de novo para recuperar as cinco que já tinham resposta.
Sequencial, cada consulta falha sozinha, `provenance.failures` diz qual foi e o
universo é montado com o que chegou.

O preço é tempo de parede: seis idas ao provider em série. Enquanto o teto for
`RADAR_YOUTUBE_MAX_QUERIES = 6` isso cabe no START, que já é uma ação explícita
com feedback de "Coletando…". Se o teto subir, o desenho certo é paralelo com
isolamento por consulta (`allSettled`), não `all`.

Rever quando o teto mudar, ou quando a medição de tempo real pedir.

### P2 — O CUSTO GRAVADO É POR CONSULTA, NÃO O QUE O PROVIDER COBROU

Registrado no YOUTUBE_SEARCH_1 (§12).

`recordIntegrationUsage` recebe `units: executadas.length` — quantas consultas
saíram. O DataForSEO devolve `cost` na própria resposta, por tarefa, e esse
número é o que a fatura vai conferir. O normalizador não o lê.

Contar consultas não mente sobre o volume, mas não reconcilia com a cobrança: se
o provider mudar o preço de uma operação, o painel de consumo continuará
mostrando "6 unidades" para um gasto diferente.

Fazer junto do gate que tocar a contabilidade de integrações — a correção é a
mesma para a SERP do Google, que tem o mesmo buraco.

### DECLARADO, NÃO DÍVIDA — O QUE ESTE ENDPOINT NÃO ENTREGA

O `/v3/serp/youtube/organic/live/advanced` não traz inscritos do canal, legenda,
capítulos nem engajamento. Não é limitação do Radar: é o que a SERP do YouTube
expõe. Transcript de concorrente, hook e roteiro são o YOUTUBE_SEARCH_2 e vão
precisar de outra fonte — a decisão de qual é daquele gate, não deste.

### P1 — A TRAVA DE MODO ÚNICO VIVE NA TELA, NÃO NO SERVIDOR

Registrado no YOUTUBE_SEARCH_1.1 (§1).

`radarPrimaryModeCommitment` é domínio puro e os dois STARTs da página o
consultam antes de gastar: um artigo com investigação do Google fechada não
inicia YouTube, e o inverso também não. Provado nos dois sentidos.

O que a rota `POST /api/editorial/radar-youtube-search` NÃO sabe é disso. Ela
confere `radar:edit` e o hash de cada consulta, e coleta. Um POST direto — sem
passar pela tela — pagaria a coleta de um artigo já comprometido com o Google.

A escrita continua protegida: quem grava é a versão da análise, e a corrida
entraria como campo aditivo sem tocar `deepResearch`. O prejuízo é DINHEIRO
gasto numa pergunta que a tela recusaria, não corrupção de estado.

Fechar exige a rota ler a versão corrente da análise antes de coletar — uma ida
ao banco que ela hoje não faz. Fazer junto do gate que precisar da rota lendo
estado, para não pagar a leitura duas vezes.

### P2 — O `cost` DO PROVIDER AGORA CHEGA, E AINDA NÃO É USADO

Atualiza a dívida registrada no YOUTUBE_SEARCH_1 (§12).

O normalizador passou a ler `cost` da resposta e a devolvê-lo em
`RadarYoutubeQuerySearchMetadata`. Ele ainda não é persistido nem enviado ao
`recordIntegrationUsage`, que continua contando CONSULTAS.

A correção ficou menor do que era: o número já está na mão de quem grava. Falta
decidir onde ele mora — proveniência da corrida ou metadata do ledger — e a
decisão vale igual para a SERP do Google, que tem o mesmo buraco.

### FECHADA — a trava de modo saiu da tela e virou autoridade do servidor

Registrada como P1 no YOUTUBE_SEARCH_1.1 e fechada no 1.2.

`assertRadarResearchModeAllowed` é a regra única; `assertRadarPrimaryModeForRequest`
resolve o modo corrente lendo a análise canônica e recusa a troca com HTTP 409 e
código `RADAR_PRIMARY_MODE_CONFLICT`. As duas rotas pagas — a coleta de YouTube
e a SERP do Google — chamam a MESMA função antes de qualquer gasto, incluindo a
resolução de configuração do provider, que já reserva cota. Nenhuma das duas
aceita `mode` vindo do cliente.

### P2 — O CONTÊINER NEUTRO NASCE NO CLIENTE

Registrado no YOUTUBE_SEARCH_1.3 (§3).

`createRadarAnalysisContext` é domínio puro e a tela o chama quando o artigo
ainda não tem versão de análise. A rota de coleta NÃO o cria: ela apenas resolve
o modo (que dá `null`, e libera) e coleta.

Consequência: um POST direto coletaria sem contêiner, e a corrida só existiria
se o chamador gravasse depois. Não corrompe estado — a escrita continua sendo a
versão da análise, append-only — mas a coleta paga aconteceria sem o vaso que a
guardaria.

Fechar exige a rota criar o contêiner antes de coletar, o que a obriga a
escrever. Hoje ela é deliberadamente somente-leitura: uma segunda porta de
escrita sobre o mesmo artigo criaria duas autoridades. Decidir junto do gate que
mover a persistência da investigação para o servidor.

### DECLARADO — `mode: "kgr_light"` no contêiner neutro

O contêiner precisa de um modo de análise porque o campo é obrigatório no
contrato. `kgr_light` é a profundidade MÍNIMA: ela não exige extração nem
concorrentes, que é exatamente o estado de um contêiner sem investigação.

Não é uma escolha sobre o Google e não sobrevive a uma investigação real: o
START do Google sucede o contêiner com o modo que `suggestRadarAnalysisMode`
recomendar a partir do KGR. O único efeito de carregá-lo antes disso é não criar
pendências de aprovação para trabalho que ninguém começou.

### FECHADA — o contêiner neutro deixou de depender do navegador

Registrada como P2 no YOUTUBE_SEARCH_1.3 e fechada no 1.4.

`startRadarYoutubeRun` faz, no servidor: valida o ArticleDNA canônico, garante
o contêiner neutro (idempotente, com retry só na disputa de trava), resolve o
modo do que está gravado, recusa a troca, grava a corrida `COLLECTING` e a relê.
Só então a rota resolve cota e chama o provider. Se qualquer passo falhar,
PROVIDER_CALLS = 0.

O resultado também passou a ser gravado pelo servidor: antes, uma coleta paga
podia se perder se a aba fechasse entre a resposta e a gravação do navegador.

### P2 — A LEITURA DO ArticleDNA CARREGA TODOS OS ARTEFATOS DA MARCA

Registrado no YOUTUBE_SEARCH_1.4 (§1, passo 2).

`radarStartPorts.loadArticle` usa `ArtifactRepository.list(brandId)` e filtra
pelo artigo — o mesmo caminho que a rota da SERP do Google já usa. Ele traz
artigos, silos e planos da marca inteira para responder uma pergunta sobre UM
artigo.

Funciona e é consistente com o que existe; o custo é de banco e de memória no
servidor, e cresce com o acervo da marca. A correção é uma leitura por
`article_id`, que não existe hoje no repositório.

Fazer junto do gate que tocar o repositório de artefatos — e vale para os dois
caminhos, não só para o do YouTube.

### DECLARADO — a assimetria com o Google é deliberada

O §8 do 1.4 é explícito: não refatorar o pipeline do Google além da guarda de
modo. Então o YouTube tem START atômico no servidor e o Google não: lá, a rota
grava o snapshot e a VERSÃO DA ANÁLISE continua nascendo no navegador.

Isso não é dívida do YouTube — é o estado do Google. Migrá-lo para
`ensureRadarAnalysisContext` é possível (as portas são neutras de modo, de
propósito) e é decisão de um gate próprio, com regressão do caminho homologado.

### P2 — O BLUEPRINT NÃO CHEGA AO PLANEJADOR AINDA

Registrado no YOUTUBE_SEARCH_2 (§13).

`projectRadarYoutubeEvidence` existe, é tipado e separa `observedEvidence` de
`recommendedStrategy`. O que ainda não existe é o consumidor: o handoff v2 que o
Planejador recebe não tem campo para pesquisa de YouTube, e o `RadarEvidenceBundle`
v3 continua sem builder de runtime — a mesma dívida registrada no SPECIALIST_3.

Não foi criada uma terceira representação para contornar isso. Duas verdades
envelhecendo em ritmos diferentes é exatamente o que o módulo de dossiê existe
para impedir.

Fazer junto do gate que ligar o v3 ao runtime: `research.youtube` entra como
mais uma camada, do mesmo jeito que a do Especialista entrou.

### DECLARADO — o vocabulário de padrões de título é PT-BR e é uma escolha

Os marcadores de `RADAR_YOUTUBE_TITLE_PATTERNS` são termos em português. Numa
SERP majoritariamente em inglês, os padrões seriam subcontados e o blueprint
diria "nenhum padrão recorrente" onde há vários.

Isso não é defeito silencioso: a coorte declara quantos títulos sustentam cada
padrão, e uma contagem baixa aparece. Mas quem operar uma marca internacional
precisa saber que o vocabulário é o gargalo, não a SERP.

Ampliar exige decidir se o vocabulário é por marca, por idioma do ArticleDNA ou
global — decisão de produto, não de implementação.

### FECHADA — a trava "um alvo = uma SERP" era restritiva demais

Substituída no YOUTUBE_SEARCH_2.1 (Parte B).

O modelo antigo confundia duas perguntas: o que vamos PRODUZIR e de onde vem a
LEITURA. Ele impedia o caso legítimo de coletar a SERP do Google como apoio de
um artigo cujo destino é vídeo — e, se a coleta passasse, convertia o artigo
para WEB e bloqueava o YouTube em seguida.

Agora `researchTarget.primaryTarget` é gravado explicitamente e é imutável; as
fontes (`WEB_SERP`, `YOUTUBE_SERP`, `AMAZON_SERP`) são aditivas e nunca mudam o
alvo. Artigos anteriores ao gate continuam sendo lidos pela inferência legada.

### P1 — A CAUSA DO ZERO RESULTS NÃO ESTÁ PROVADA, SÓ CORRIGIDA

Registrado no YOUTUBE_SEARCH_2.1 (§5).

Duas divergências concretas entre o nosso pedido e a chamada que o usuário
confirmou à mão foram corrigidas:

- `depth` → `block_depth` (o primeiro é o parâmetro do endpoint do Google, e
  estava copiado de `dataforseo-serp-operation.ts`);
- `pt-br` → `pt-BR` (a configuração canônica minusculiza tudo porque nasceu
  para o Google; a chamada boa usou BCP-47).

Qual das duas causava o zero — ou se era a soma — NÃO foi provado: prová-lo
exige a chamada real, que é decisão do usuário. `pnpm run youtube:smoke`
executa UMA consulta e imprime a trilha inteira.

Fechar esta dívida é rodar o smoke e anotar o resultado aqui.

### DECLARADO — a instrumentação vive na proveniência, não na tela

`RadarYoutubeQueryDiagnostics` carrega status da tarefa, `items_count`
declarado, itens crus, vídeos crus, normalizados e o motivo de cada descarte.
O §1 é explícito: isso não vai para a visão normal.

Hoje ela é devolvida pela normalização e consumida pelo `assertRadarYoutubeReadable`
e pelo smoke. Persistir por consulta na corrida — ao lado de `checkUrl` e
`seResultsCount` — é o passo natural quando houver um caso que peça auditoria
depois do fato, e não antes.

### P1 — O BLUEPRINT MULTIFORMATO AINDA NÃO TEM TELA NEM CONGELAMENTO

Registrado no RADAR_MULTIMODAL_1.

`buildRadarMultimodalBlueprint` existe, é testado contra as duas SERPs reais e
decide a saída editorial com o raciocínio junto. O que falta:

- exibi-lo no painel (hoje a tela mostra só o blueprint de YouTube);
- congelá-lo no FINALIZE, ao lado do `youtubeFrozenInvestigation`;
- e ligar `editorialOutput` ao handoff do Planejador.

Ele foi construído como domínio puro justamente para que essas três ligações
sejam decisões separadas — cada uma com a sua regressão. Não foi exposto pela
metade: uma tela que mostrasse recomendação de pacote sem congelamento faria a
leitura mudar sozinha entre duas aberturas.

### DECLARADO — `editorialOutput` não substitui `primaryTarget`

O RADAR_MULTIMODAL_1 introduziu a saída editorial (ARTICLE, YOUTUBE_VIDEO,
ARTICLE_WITH_VIDEO, SHORTS, PRODUCT_SECTION, MULTIFORMAT_PACKAGE) porque a SERP
real provou que a resposta certa pode ser um PACOTE, e não uma peça.

`primaryTarget` continua existindo e continua imutável: ele diz onde a peça
PRINCIPAL vive e é o que impede uma investigação paga de ser jogada fora ao
trocar de modo. O que deixou de ser verdade é que ele determina o formato da
entrega.

São três eixos, não dois: SAÍDA EDITORIAL (o que produzir), ALVO PRIMÁRIO (onde
a peça principal vive) e FONTES DE PESQUISA (de onde veio a leitura).

## RADAR_MULTIMODAL_1.1 — runtime, UI e freeze do blueprint multiformato

### FECHADO — as três ligações que o 1 deixou abertas

O P1 acima pedia três coisas: tela, congelamento e handoff. Duas fecharam aqui.

- **Tela**: `BlueprintMultiformato` no painel, com OBSERVADO e RECOMENDADO
  separados visualmente. Sem essa separação, uma recomendação nossa ganha na
  leitura a mesma autoridade de uma contagem de vídeos que a SERP entregou.
- **Congelamento**: `youtubeFrozenInvestigation.multimodal` guarda blueprint,
  fontes coletadas e saída editorial. O congelado tem PRECEDÊNCIA na tela sobre
  o vivo — depois do FINALIZE, uma coleta nova não pode alterar o que já está
  sob o carimbo.
- **Handoff do Planejador**: continua aberto, agora como item próprio abaixo.

### FECHADO — as fontes se somam, e o papel é derivado

`radarResearchPlanOfAnalysis` passou a contar `serpSnapshotId` como `WEB_SERP`,
não só `deepResearch`. Uma leitura de APOIO produz snapshot e não investigação
profunda: olhar só o segundo fazia a tela oferecer "adicionar Google" para algo
já coletado, e a pessoa pagaria a mesma consulta duas vezes.

O `sourceStatus` devolve as TRÊS fontes sempre, cada uma com `collected`,
`required` e `role` derivado do alvo. Sem alvo declarado nenhuma fonte é apoio:
o artigo ainda não decidiu o que produz, e chamar a primeira coleta de "apoio"
inventaria uma hierarquia que ninguém escolheu.

### P1 — `editorialOutput` ainda não chega ao Planejador

A saída editorial é decidida, exibida e congelada, mas o handoff continua
entregando o blueprint de YouTube. Enquanto isso não fecha, um
`MULTIFORMAT_PACKAGE` reconhecido no Radar vira uma pauta única no Planejador —
e os Shorts derivados das perguntas observadas se perdem no caminho.

Reservado para o RADAR_FINAL, junto com o `RadarEvidenceBundle` v3.

### DECLARADO — a camada multiformato é ADITIVA na fotografia

`multimodal` é `.nullable().default(null)`. Uma investigação congelada antes
deste gate continua legível e devolve `null` ali — isso é a VERDADE sobre ela,
não uma lacuna a preencher. Preencher retroativamente daria a uma fotografia
antiga uma leitura de SERP que ninguém fez naquele dia.

O mesmo vale para `serpSnapshot.serpFeatures`: snapshot coletado antes do
RADAR_MULTIMODAL_1 não ganha perguntas e entidades fabricadas. O blueprint sai
só com o YouTube e DIZ o que faltou.

### DECLARADO — o blueprint não coleta

Montar o blueprint é cálculo sobre dado que já existe no artigo. Se abrir a aba
disparasse coleta, a leitura passaria a custar dinheiro por abertura. O botão
"Adicionar leitura Google" reusa o START canônico da SERP, atrás de clique
humano — não há caminho novo até o provider.

## RADAR_RESEARCH_PROFILES_1 — perfis canônicos e START único

### CORRIGIDO — o apoio do Google nunca tinha coletado nada

O runtime respondia "este snapshot não possui payload canônico completo para
iniciar a curadoria" depois de clicar em [Adicionar leitura Google]. A causa não
era o guard: era o botão.

`onAddGoogleSupport` chamava `startSerpAnalysis`, que é INICIAR CURADORIA — o
caminho da investigação Google PRINCIPAL, que exige snapshot canônico, seleção
de concorrentes e FINALIZE próprio. O apoio entrava por uma porta que não era a
dele e batia na primeira trava.

O guard continua de pé, e está certo onde está: o perfil Google precisa mesmo
de payload canônico para abrir curadoria. O que mudou foi o apoio parar de
passar por ali. Ele agora COLETA e para (§5): produz snapshot com
`serpFeatures`, alimenta a Feature Intelligence, entra no Cross-SERP — e não
abre curadoria, não pede os dez concorrentes, não cria um segundo FINALIZE.

### FECHADO — a chavinha escolhe RADIOGRAFIA, não fonte

Três perfis canônicos, um START cada:

- GOOGLE: `WEB_SERP` principal, sem apoio — ele já É a pesquisa inteira.
- YOUTUBE: `YOUTUBE_SERP` principal + `WEB_SERP` como `SEO_SUPPORT`.
- AMAZON: `AMAZON_SERP` principal + `WEB_SERP` como `SEO_COMMERCIAL_SUPPORT`.

O papel fica GRAVADO em `supportResearch`, não só exibido. Sem isso, meses
depois ninguém distingue "o Google foi a radiografia principal deste artigo" de
"o Google sustentou um vídeo": os dois produzem o mesmo snapshot.

O apoio é UMA leitura, sobre a keyword principal. Repeti-lo para as três
consultas do YouTube triplicaria o custo para responder três vezes a mesma
pergunta — como a busca geral formula esta intenção.

### FECHADO — a lista de fontes com botão saiu

O 1.1 mostrava as três fontes lado a lado com [Adicionar leitura Google]. Somar
leitura deixou de ser decisão de clique porque o perfil já responde. No lugar,
o pacote: principal, apoio, estado composto.

`PARTIAL_SUPPORT_FAILED` existe por uma razão só: o apoio falhar não pode apagar
a coleta principal. Sem esse estado, o pacote teria de escolher entre mentir
("pronta") e jogar fora uma coleta paga ("falhou"). O retry alcança SÓ o apoio —
refazer a principal cobraria de novo as consultas do YouTube para corrigir uma
leitura do Google que custou uma.

### DECLARADO — uma porta só até a SERP do Google

`coletarSerpDoProvider` é o único ponto de chamada, e passaram a usá-lo dois
fluxos com propósitos diferentes: a investigação Google principal e o apoio.
Duas chamadas seriam duas políticas — uma delas acabaria sem o bloqueio de
duplo clique, sem a localidade da marca ou sem o vínculo do ArticleDNA, e a
divergência só apareceria na fatura.

### MEDIDO — a corrente de Shorts está íntegra; o zero era do provider

Uma coleta real devolveu 47 vídeos e 0 Shorts, e a mesma busca à mão estava
cheia deles. A auditoria contra o payload real de `skin care noturno`:

    RAW is_shorts=true         14
    NORMALIZED isShorts=true   14
    UNIVERSE COMPARABLE_SHORT  14

Nenhum Short se perde entre o provider e o universo. Então "0 Short(s)" naquela
coleta foi o que aquele provider devolveu naquela chamada — não perda nossa.

O que estava faltando era a tela conseguir dizer isso sozinha. A contagem passou
a viajar na proveniência (`providerShortsCount`, `normalizedShortsCount`), e a
frase muda conforme os números: "o YouTube não marcou nenhum" é resposta dele;
"marcou N e nenhum chegou ao universo" é defeito nosso. Corrida gravada antes
deste gate devolve `null`, que significa "não foi medido" — e é diferente de
zero.

Falta a homologação: a próxima coleta real responde qual dos dois casos é,
com os parâmetros daquela chamada ao lado.

### P1 — AMAZON tem perfil e papel, e não tem coletor

`RADAR_RESEARCH_PROFILE_PLANS.AMAZON` existe, o apoio dela está declarado como
`SEO_COMMERCIAL_SUPPORT` e o pacote já a monta. O que falta é a coleta.

O perfil entrou antes do coletor de propósito: é o que impede que a Amazon
chegue exigindo um segundo desenho de pacote. Enquanto não houver coleta, o
pacote se declara `COLLECTING` em vez de fingir que está pronto.

### P1 — `editorialOutput` ainda não chega ao Planejador

Continua aberto, como no RADAR_MULTIMODAL_1.1. Reservado ao RADAR_FINAL junto do
`RadarEvidenceBundle` v3.

### CORRIGIDO — `optimistic_conflict` ao gravar o apoio no mesmo START

`HTTP 409 · optimistic_conflict` no meio da coleta, em `coletarApoioDoGoogle`.

A causa é de sequência, não de concorrência: o START chama a rota, e a ROTA
grava a corrida. Daí em diante o `RadarItem` que o render capturou descreve o
passado — ele não conhece a versão que acabou de nascer. Suceder a partir dele
colide com um banco que já está à frente.

Recarregar o estado não resolvia, e é o detalhe que torna o defeito fácil de
repetir: a função assíncrona em curso continua segurando o MESMO objeto, porque
o React só entrega o novo no próximo render — que ainda não aconteceu.

`versaoCorrenteNoServidor` lê a análise remota e devolve VALOR, e valor
atravessa o await. Os três caminhos do apoio (snapshot reaproveitado, coleta
nova, falha) partem dela.

O mesmo erro estava na frase final: `pacoteDePesquisa(target)` teria dito
"0 consulta(s) · 0 resultado(s)" logo depois de uma coleta com dezenas de
vídeos. O aviso passou a ser montado da corrida que o servidor confirmou e do
registro de apoio que a própria função gravou.

Regra geral que fica: **quem escreve depois de o servidor ter escrito na mesma
função não pode usar o que o render capturou.**

## RADAR_RESEARCH_PROFILES_1.1 — uma autoridade de estado da pesquisa

### CORRIGIDO — a tela dizia "não iniciada" e "finalizada" ao mesmo tempo

Um artigo com investigação de YouTube congelada — 3 consultas, 38 vídeos, apoio
do Google coletado, FINALIZE confirmado, sobrevivendo ao F5 — mostrava quatro
leituras simultâneas da mesma investigação. Cada uma, isolada, era defensável.
A soma dizia que a investigação não tinha começado e estava finalizada.

Eram quatro cálculos independentes:

1. o card lia `deepResearch`, que é o read-model do GOOGLE e nasce vazio num
   artigo de vídeo — daí "0 consulta(s) · 0 referência(s) · Não iniciado";
2. a tabela e a próxima ação liam a mesma coisa, pela mesma razão;
3. `radarResearchPackageState` não tinha `NOT_STARTED`: ausência de corrida caía
   em `COLLECTING`, e "nunca começou" virava "coletando";
4. nenhum dos quatro olhava `youtubeFrozenInvestigation`. A fotografia existia
   no banco e não tinha voz na projeção.

`radarResearchProfileStateOfAnalysis` passou a ser a autoridade única: card,
corpo, tabela, próxima ação, relatório e botões leem dela.

### DECLARADO — a fotografia tem precedência, e os números saem dela

Existindo `youtubeFrozenInvestigation`, o estado é `FINALIZED` e nenhum campo
transitório faz a tela recuar. As contagens vêm da fotografia, não da corrida
viva: a corrida é recalculável, e foi por isso que ela foi congelada. Uma coleta
posterior que esvaziasse a corrida não encolhe o que já foi congelado.

O `supportResearch` pendente continua GRAVADO — o histórico não se apaga. O que
ele perde é o poder de puxar o pacote inteiro para `COLLECTING`.

### DECLARADO — o perfil GOOGLE devolve a mão

`ownedByGooglePipeline` existe para isto: aquele pipeline tem seis etapas com
nomes próprios (coleta, curadoria, análise, modelo, relatório, revisão), e
traduzi-lo para os seis estados do perfil perderia informação pelo caminho.
Todo consumidor testa a flag antes de usar `state`.

### CORRIGIDO — FINALIZE era reescrevível

`[Refinalizar (nova fotografia)]` oferecia, como ação corriqueira, reescrever o
que "congelado" promete não reescrever. E `[Nova coleta]` continuava lá, capaz
de trocar o universo sob um carimbo já dado, em silêncio.

Depois do freeze o painel mostra o estado e uma ação explícita —
`[Reabrir / zerar investigação]`. O FINALIZE passou a consultar
`radarYoutubeFinalizeDecision` antes de montar a fotografia: repetido, responde
"já estava finalizada" e não cria versão nova.

### CORRIGIDO — o Relatório não reconhecia investigação de vídeo

"Pesquisa pronta?" respondia contando PÁGINAS comparáveis extraídas. Num artigo
de vídeo esse número é zero por construção, e o relatório declarava pendente uma
investigação congelada.

`radarYoutubeReportEvidence` entrega só o que a fotografia sustenta: consultas,
universo e a presença do blueprint multiformato. Links, fontes verificadas e
especialista continuam falando de páginas extraídas e NÃO são preenchidos a
partir dali — um check verde sem lastro é pior do que um check pendente.

### P1 — a auditoria remota do §2 não foi executada por mim

O conector Supabase desta máquina lista outra organização, então não tenho
leitura do registro real. A consulta READ-ONLY está preparada e precisa ser
rodada pelo usuário para confirmar quais campos o artigo carrega hoje.

A correção não dependeu dela: a localização foi feita no código, e a projeção é
função pura do payload — ela produz o estado certo para qualquer combinação de
campos, inclusive as legadas.

## RADAR_RESEARCH_PROFILES_1.2 — o lock de finalização

### CORRIGIDO — dado finalizado, produto não

O 1.1 pôs o ESTADO numa autoridade só e a tela continuou dividida. Sobre um
artigo com investigação congelada, apoio coletado e F5 preservando tudo:

- badge da área: "Não iniciada";
- coluna Status da tabela: "Não iniciado";
- próxima ação: "Iniciar Pesquisa YouTube";
- barra recolhida oferecendo START e "Recuperar pesquisa já paga";
- Google e Amazon ainda clicáveis no seletor;
- nenhuma porta para o blueprint;
- 38 vídeos abertos como conteúdo principal.

A causa é a mesma nos sete: cada um derivava por conta própria do pipeline do
GOOGLE, que num artigo de vídeo nunca começou. `ownedByGooglePipeline` já
existia; faltava cada consumidor perguntar antes de assumir o comando.

### DECLARADO — as travas de UI moram na projeção

`profileLocked`, `canStart`, `showBlueprint` e `sampleDefaultExpanded` saíram da
tela e entraram no contrato. Uma tela que PERGUNTA "posso começar?" e recebe
`false` não tem como discordar das outras; uma que decide sozinha, sim — foi
exatamente assim que sete leituras divergiram da mesma investigação.

`lockReason` viaja junto porque o motivo precisa ser legível sem passar o mouse:
quem usa toque nunca vê um `title`.

### DECLARADO — status do ARTIGO ≠ status da PESQUISA

Pesquisa congelada não quer dizer Radar concluído: o relatório ainda espera
revisão. "Finalizado" na coluna Status prometeria um trabalho que não terminou;
"Não iniciado" nega um que terminou. `READY` é a resposta honesta.

E a correção é estreita de propósito: a pesquisa congelada só vence o estado
`NOT_STARTED` do pipeline do Google. Qualquer outro estado dele descreve
trabalho real e continua valendo — atropelá-lo trocaria "analisando" por
"pronto" e esconderia a etapa em curso.

### DECLARADO — o apoio do Google não destrava o seletor

Ele é camada da investigação de vídeo, não alternativa a ela. Se destravasse, um
clique em "Google" trocaria o universo sob uma fotografia já assinada.

### CORRIGIDO — a amostra cedeu o lugar à recomendação

Antes de congelar, os 38 vídeos SÃO o trabalho: é neles que se cura. Depois, o
trabalho é ler o blueprint — e os cards o empurravam para fora da tela. A
amostra passou a nascer recolhida, com a contagem no rótulo, e as duas versões
(aberta e recolhida) renderizam a MESMA construção: duas divergiriam com o
tempo.

`[Ver blueprint]` entrou como ação principal, e `[Reabrir / zerar]` passou a
declarar a consequência antes do clique — inclusive a parte que ninguém lembra
depois: uma coleta nova custa de novo.

### P1 — homologação de tela continua pendente

A projeção é função pura do payload e as travas atravessam F5 e sessão nova por
construção. Clicar é do usuário.

## RADAR_BLUEPRINT_CANONICAL_1 — contrato único e freeze compacto

### CORRIGIDO — 88% da fotografia era matéria-prima repetida

A auditoria do banco mediu, no artigo real de `skin care noturno`:

    youtubeSearch                     126.656 bytes
    youtubeFrozenInvestigation        144.440 bytes
    youtubeFrozenInvestigation.run    126.656 bytes
    youtubeSearch == frozen.run       TRUE

A corrida estava sendo copiada verbatim para dentro do freeze, byte a byte,
dentro da MESMA versão da análise.

FOTOGRAFIA DAS CONCLUSÕES ≠ CÓPIA DA MATÉRIA-PRIMA. O que a imutabilidade
exige é que as CONCLUSÕES não mudem; a corrida já é append-only e tem
identidade própria. `runRef` guarda `runId` + assinatura do fingerprint +
quatro contagens, e custa 243 bytes.

Medido: **144.440 → 17.784 bytes no artigo real (−87,7%)**.

Corrigido por CONTRATO, sem migration.

### DECLARADO — referência quebrada é erro, nunca silêncio

`resolveRadarFrozenRun` confere identidade E assinatura. `runId` igual com
assinatura diferente significa corrida refeita sob o mesmo nome, e a fotografia
passaria a descrever uma amostra que não é a dela.

Devolver `null` faria a tela dizer "nenhum vídeo" sobre uma investigação
finalizada, e ninguém saberia que o elo se perdeu.

### DECLARADO — fotografias legadas não foram migradas

`frozen.run` continua no schema, `.nullable()`, e é lido quando não há `runRef`.
A ordem importa: a referência responde primeiro, porque é a forma corrente.
Nenhum dado histórico foi reescrito.

### DECLARADO — o grau de cada afirmação está no contrato

`OBSERVED_SERP` · `BUYER_PERCEPTION` · `DERIVED`.

`BUYER_PERCEPTION` existe antes de a Amazon chegar porque a tentação de ler
avaliação como especificação é enorme: "não hidrata o suficiente" é experiência
de uma pele, não medição de um produto.

E `assertRadarBlueprintSeparation` recusa um sinal `DERIVED` dentro de
`observed` — uma conclusão nossa apresentada como leitura da busca.

### DECLARADO — não existe campo para "gancho observado"

A SERP do YouTube devolve TÍTULO, canal, duração, posição, views e data. Ela não
abre vídeo nenhum. O gancho vive em `recommended`, carrega `sourceSignal`, e o
contrato não tem onde guardá-lo como observação — o erro ficou impossível de
escrever sem perceber.

### DECLARADO — preço exato nunca é recomendação

`RadarObservedPrice` guarda valor + data + proveniência. `priceBandDirection`
só aceita ECONOMICO/INTERMEDIARIO/PREMIUM. Um valor na recomendação faria o
artigo envelhecer no dia seguinte prometendo um preço que a loja já mudou.

### P1/P2 — RADAR_ANALYSIS_VERSION_STORAGE

`analysisVersions` continua sendo um array append-only dentro de
`editorial_workflow_items.payload`, e há uma linha de **9,77 MB** registrada no
código. Cada gravação reescreve o payload inteiro.

Este gate NÃO tocou nisso: encolher o freeze é correção de contrato; mover o
histórico é reforma de persistência, e misturar as duas transformaria uma
correção mensurável numa migração de risco. Fica registrado para avaliação
própria.

### P1 — AMAZON tem contrato, e não tem coletor

O envelope aceita o perfil, os campos de oferta/review/estrutura comercial
existem e são testados. Falta a coleta. A UI canônica recebe a projeção sem
mudar de forma.

### P1 — o perfil GOOGLE ainda não passa pela projeção canônica

Ele mantém a autoridade do pipeline dele — que é a REFERÊNCIA visual deste gate,
não o que estava sendo trocado. Converter o Google é gate próprio, e
`radarCompetitiveBlueprintViewOfAnalysis` já devolve a mão para ele
explicitamente.

## RADAR_BLUEPRINT_CANONICAL_1.1 — o adapter do Google

### FECHADO — os três perfis falam a mesma gramática

O gate 1 deixou o Google fora do envelope. Ele mantinha a autoridade do
pipeline dele, e a leitura editorial simplesmente não existia: Google e YouTube
respondiam línguas diferentes para a mesma pergunta — "o que eu escrevo?".

`googleCompetitiveBlueprintOfAnalysis` traduz o que o pipeline JÁ observou para
`CompetitiveBlueprintEnvelope<GOOGLE>`. É função pura: não coleta, não decide
etapa, não persiste, não importa nada do servidor.

### DECLARADO — duas autoridades, e elas não se misturam

`radarGooglePipelineState` continua sendo a autoridade OPERACIONAL, com as seis
etapas: coleta, curadoria, análise, modelo, relatório, revisão. O blueprint é
autoridade EDITORIAL. O segundo consome o primeiro; nunca o substitui.

A trava está testada pelo lado que importa: a vista do pipeline é comparada
antes e depois de rodar o adapter, e precisa vir idêntica.

### DECLARADO — a pergunta não entra no heading

Na amostra real a pergunta canônica É o H2 de 12 de 12 concorrentes: "Como
identificar a pele oleosa?". Reproduzi-la em `headingDirection` devolveria o
heading alheio vestido de recomendação.

Ela vive em `answersQuestion`, declarada como observação, e a direção manda
formular o heading com as palavras do leitor. A regra é de LUGAR, não de
proibir a string — proibi-la tornaria o blueprint inútil.

### DECLARADO — o domínio citado é observação, nunca recomendação

"Quatro páginas citam a American Academy of Dermatology" descreve o mercado.
`sourceTypeNeeded` fala em TIPO de fonte — institucional, acadêmica, primária.
Recomendar o domínio endossaria uma fonte que o Radar nunca avaliou, e o
endosso viajaria até o Redator como se fosse critério.

### DECLARADO — a saída editorial do Google é derivada

`ARTICLE` por padrão; `ARTICLE_WITH_VIDEO` só quando a amostra mostra sinal
audiovisual. Prometer pacote multiformato sem evidência daria ao Planejador
trabalho que a investigação não justifica.

### NOTA — a amostra real não exercita três ramos

"Skincare para pele oleosa" com 12 páginas equivalentes não produz YMYL,
diferencial nem link de saída. Os três ramos do adapter são testados com o
modelo REAL acrescido só das linhas que eles consomem — sem isso, o ramo do §8
(onde o erro custa caro) ficaria sem prova.

### P1 — a UI do Google continua com dois níveis de leitura

O blueprint canônico entrou ACIMA dos resumos operacionais, que não foram
apagados: quem opera o pipeline ainda precisa deles. Unificar os dois é decisão
de produto, não de contrato, e depende de a leitura editorial provar que
substitui o resumo — o que só a homologação diz.

## AMAZON_SEARCH_0 — o que a SERP da Amazon realmente entrega

### MEDIDO — endpoint, custo e a correção de duas premissas

Uma chamada paga, US$ 0,0033, keyword `protetor solar facial`, Brasil/`pt_BR`.

Duas premissas caíram antes de custar dinheiro:

1. **A doc diz task-based; a conta diz live.** A página de `task_post` sugere
   postar → esperar → buscar. O catálogo `price.merchant.amazon.products` da
   própria conta expõe `live`, e é ele que vale: existe
   `/v3/merchant/amazon/products/live/advanced`, síncrono. O START da Amazon
   pode ser uma chamada só, como o do YouTube — sem estado "aguardando".

2. **`pt-BR` é recusado.** A Merchant API usa underscore: `pt_BR`. A primeira
   chamada voltou `40501 · Invalid Field: 'language_code'` com custo ZERO,
   porque a guarda lia o status da TAREFA e não o HTTP 200 — a lição do
   YouTube 2.1 se pagou aqui.

São TRÊS convenções para o mesmo idioma no Radar: `pt-br` (config canônica),
`pt-BR` (YouTube, BCP-47) e `pt_BR` (Merchant). Cada adapter precisa da sua.

### DECLARADO — a SERP de produtos NÃO tem texto de avaliação

`rating` traz `value`, `votes_count` e `rating_max`. Nada mais. Não há elogio
recorrente, reclamação recorrente nem expectativa frustrada — nada disso é
derivável de uma nota e uma contagem.

Texto exige `merchant.reviews`, que é **outro endpoint, sem variante live, com
custo próprio e fluxo task-based**.

Consequência de produto: o card da Amazon NÃO pode se chamar "Reviews e
objeções". Sustentado só por estrelas, ele deve se chamar algo como
**"Reputação e sinais de compra"** até existir fonte textual.

### DECLARADO — o que a SERP não entrega

Ausentes no payload real: `brand`, `seller`, `description`, `attributes`,
`category`, `variation`, `is_sponsored`, `prime`, `discount`, `original_price`,
`refinements`, `filters`, `breadcrumb`, galeria e vídeo.

`labels` existe e chega SEMPRE null. `price_to` idem. `categories` no nível do
resultado veio null. `delivery_info.delivery_price` nunca preenchido — o que há
é `delivery_message`, frase em português para humano.

### DECLARADO — identidade, patrocínio e preço

- **Identidade:** `data_asin`, presente em 100%. A URL carrega `crid`/`qid`/`dib`
  que mudam a cada coleta — deduplicar por URL contaria o mesmo produto duas
  vezes entre duas consultas.
- **Patrocínio:** é o TIPO do item (`amazon_paid` × `amazon_serp`), não um
  booleano. Os dois carregam campos idênticos. Misturá-los faria "esta marca
  domina a categoria" descrever quem pagou mais.
- **Preço:** só `price_from` + `currency`. `special_offers` é array de STRING
  (`["R$ 10,00","off"]`) — não é número, não é percentual, e o preço anterior
  não existe.

### P1 — o contrato canônico da Amazon presumiu mais do que a fonte entrega

`CompetitiveBlueprintEnvelope<AMAZON>` foi escrito antes desta chamada. Campos
sem lastro nesta SERP: `brands`, `categories`, `attributes`, `benefitPatterns`,
`complaintPatterns`, `objectionPatterns`, `frustratedExpectations`,
`buyingCriteria`.

NÃO corrigi o contrato neste gate: o cabeçalho do gate proíbe alterar o
Blueprint Canônico e o §20 proíbe implementar, enquanto o §16 manda corrigir.
Diante do conflito, deixei o contrato intacto e a lista exata registrada — a
correção é decisão do próximo gate.

## AMAZON_SEARCH_1 — o coletor primário da Amazon

### FECHADO — coletor, identidade, guardas e START atômico

Endpoint `/v3/merchant/amazon/products/live/advanced`, síncrono, `pt_BR`.
Identidade por `data_asin`. Orgânico e patrocinado separados pelo TIPO do item.
START atômico com readback antes de qualquer gasto, e disputa que para em 409.

### DECLARADO — três grafias do mesmo idioma, uma autoridade

`pt-br` (config) · `pt-BR` (YouTube/BCP-47) · `pt_BR` (Merchant). A tradução
virou `radarProviderLocale(locale, provider)` em vez de um `.replace()` dentro
de cada adapter — foi assim que a regra existiu em dois lugares sem nenhum
saber do outro, e custou uma chamada recusada para reaparecer.

O adapter TRADUZ e CONFERE: traduzir sem conferir deixaria passar entrada já
errada; conferir sem traduzir exigiria que todo chamador soubesse a convenção.

### MEDIDO — o mesmo ASIN ranqueia E compra anúncio

Na amostra real de `protetor solar facial`: 53 itens orgânicos + 2 patrocinados
= 55 itens de página, mas **51 produtos**. Os DOIS patrocinados são o mesmo
ASIN, e esse ASIN também aparece organicamente.

Contar itens diria "2 patrocinados" e descreveria slots de anúncio. O universo
conta produto: 1 patrocinado, comprando dois espaços na busca em que já
ranqueia — sinal comercial que nenhuma das metades diz sozinha.

### CORRIGIDO — o contrato da Amazon perdeu o que a fonte não entrega

Saíram de `AmazonObserved`: `brands`, `categories`, `attributes`,
`benefitPatterns`, `complaintPatterns`, `objectionPatterns`,
`frustratedExpectations`, `buyingCriteria`. E de `AmazonRecommended`:
`reviewStructure`.

Manter "nullable, para depois" seria pior do que remover: um contrato com lugar
vazio é convite a preenchê-lo com heurística, e heurística chega ao Planejador
com a mesma aparência de coleta.

O que ficou: `products`, `placementSignals`, `priceSignals`, `ratingSignals`,
`purchaseSignals`, `offerTextSignals`, `relatedSearchSignals`, `priceBands`.

### DECLARADO — o que NÃO foi implementado

- **UI do perfil Amazon (§22–§24).** A casca canônica existe e o contrato está
  pronto, mas os quatro cards da Amazon e o START na tela NÃO foram
  construídos neste gate. O perfil ainda não é operável pela interface.
- **Apoio do Google automático (§17).** O contrato do pacote o prevê e a rota
  deliberadamente não o dispara; falta a orquestração de um clique na página,
  como foi feito no YouTube.
- Consequentemente §18 (ResearchPackage completo) e §19 (PARTIAL_SUPPORT_FAILED
  no fluxo real) estão no domínio e não no runtime.

### P1 — AMAZON_PRODUCT_ENRICHMENT

`merchant.reviews` (task-based, sem live) e `merchant.amazon.asin` (live,
US$ 0,005) são as fontes de texto de avaliação, atributos e benefícios. Cada
uma com custo e fluxo próprios. O card de reputação continua se chamando
"Reputação e sinais de compra" até isso existir.

## AMAZON_SEARCH_1.1 — a tela da Amazon, o apoio server-side e o pacote no runtime

### O que fechou o que o gate 1 declarou em aberto

O perfil Amazon passou a ser operável pela interface. Os três itens do bloco
"DECLARADO — o que NÃO foi implementado" acima estão cumpridos: os quatro cards
existem, o START está na tela e o apoio do Google é disparado automaticamente.

### O apoio saiu do navegador — §3

No YouTube o apoio é encadeado pelo cliente: a rota devolve a coleta e a página
chama o Google em seguida. Isso faz dado PAGO depender de a aba sobreviver
entre duas requisições — fechá-la no meio deixava a coleta principal cobrada e
o apoio nunca feito.

Na Amazon existe **uma chamada**. `collectRadarGoogleSupport` roda dentro da
mesma requisição, no servidor, e o pacote é gravado com as duas coletas
amarradas ao mesmo `packageRunId`. A pendência recuperável (`retry-support`)
alcança SÓ o apoio: refazer a primária para corrigir o apoio cobraria de novo a
coleta cara para arrumar a barata.

### Produto não é posição — e agora a tela diz isso

A frase do pacote, sobre a amostra real: `51 produto(s) comparável(is) · 1
patrocinado(s) em 2 posições · apoio Google coletado`.

O card de Modelo Competitivo repete a distinção. "2 patrocinados" seria falso
sobre esta busca: descreveria espaços comprados, não concorrentes.

### O pacote virou a autoridade da projeção — §16

`radarResearchProfileStateOfAnalysis` lê `researchPackage` antes dos campos
soltos, e o status gravado vira estado de tela por uma tabela única
(`LEITURA_DO_PACOTE`). Os campos soltos continuam respondendo por quem ainda
não grava pacote — o perfil YouTube.

O caso que prova de onde o número sai é o pacote SEM a corrida ao lado: com as
duas presentes as contagens coincidem, porque o universo já vem deduplicado por
ASIN, e um recálculo passaria despercebido.

### O seletor ganhou a terceira trava — §15

`view.state` é o pipeline do Google, NOT_STARTED por construção num artigo de
produto. Trocar de perfil no meio de uma coleta paga da Amazon continuava
clicável, e trocava o universo sob ela em silêncio. A condição `emCurso` fecha
isso; as duas travas anteriores (freeze e pipeline do Google) continuam.

### DECLARADO — o que NÃO foi implementado

- **Blueprint da Amazon.** Os quatro cards mostram síntese OBSERVADA. A
  recomendação editorial — o Blueprint canônico com separação
  observado/derivado — é o AMAZON_SEARCH_2. A tela diz isso em texto, e a
  seção se chama "O que a pesquisa encontrou".
- **"Analisar pesquisa Amazon" não leva ao gate 2.** O botão existe porque §19
  pede a continuação declarada; hoje ele avisa que a análise entra no próximo
  gate e que a coleta gravada não precisa ser refeita.
- **FINALIZE / fotografia congelada** do perfil Amazon. O freeze e o
  `RadarEvidenceBundle` da Amazon não foram construídos.
- **Homologação manual.** `MANUAL_UI_VALIDATED` continua com o usuário: nenhuma
  tela foi clicada no fluxo real neste gate.

## AMAZON_SEARCH_2 — o blueprint competitivo da Amazon e o FINALIZE

### Analisar não custa nada — e é isso que permite repetir

`analyze` e `finalize` derivam e congelam o que já foi coletado. ANALYSIS_PROVIDER_CALLS = 0:
abrir o artigo, dar F5, revisar e finalizar não chamam Amazon, Google, reviews
nem PDP. Ler o snapshot do apoio no armazenamento não é chamada de provider —
é o mesmo dado que a coleta gravou, buscado onde ele mora.

A análise é **determinística**: a mesma coleta produz o mesmo blueprint, e ele é
**gravado**. É isso que faz F5 e outra sessão mostrarem a mesma página; recalcular
a cada abertura deixaria uma melhoria no vocabulário de faixas mudar a
recomendação sob quem já leu.

### §23 · a decisão sobre apoio ausente: analisar parcialmente

Entre bloquear a análise e permitir análise parcial, este gate permite — e
**declara**: `supportState = SUPPORT_MISSING`, uma limitação visível, e nenhuma
recomendação dependente do Google sobrevive (multimídia vazia, aplicação SEO
vazia, nenhum `GOOGLE_SUPPORT_CRITERION`).

Bloquear cobraria da pessoa a falha de uma leitura barata sobre uma coleta cara
que já está paga. Calar sobre a ausência seria pior: um blueprint sem Google,
mudo sobre o motivo, é indistinguível de um cujo Google não achou nada.

### O que a fonte NÃO sustenta continua sem sustentação

A SERP de produtos entrega posição, preço, nota, votos, selo, compras
declaradas, entrega e texto de oferta. Não entrega review, atributo, benefício,
marca canônica nem categoria.

Os eixos de comparação são uma **lista fechada** por isso: uma lista aberta
ressuscitaria `buyingCriteria` por outro nome, e "hidratação" voltaria a aparecer
como critério observado numa investigação que nunca abriu um PDP.
`GOOGLE_SUPPORT_CRITERION` é a única porta para critério externo, e exige a SERP
do Google.

As lacunas viram `requiresEnrichment` — declaradas, não bloqueantes.

### Nota não é qualidade. Selo não é endosso.

Todo eixo reputacional ou comercial carrega `caveat`, e a tela o imprime colado
ao eixo. Uma coluna "4,7" sem a frase ao lado é lida como veredito.

A saída **agrupa** (econômico / intermediário / premium; alta reputação; alta
visibilidade) e nunca ordena por mérito. "1º melhor" a partir de nota e preço
seria veredito de qualidade tirado de sinal comercial.

### §26 · RUN_DUPLICATED_IN_FREEZE = NO, desde o primeiro freeze

A fotografia da Amazon nasce por referência: `runRef` com `runId` + assinatura,
`supportRefs` com o id do snapshot, resumo observado em oito números, o blueprint
e as limitações. Nenhum `universe`, nenhum `results`, nenhum payload cru, nenhum
snapshot do Google — conferido no **serializado**, que é a forma em que isso
chega ao banco.

Referência quebrada é erro com código (`amazon_run_ref_missing` / `_mismatch` /
`_fingerprint`), nunca reconstrução. `runId` igual com assinatura diferente é o
caso perigoso: a corrida foi refeita sob o mesmo nome, e a fotografia passaria a
descrever outra amostra.

No FINALIZE o blueprint vivo é anulado: guardar os dois deixaria a mesma leitura
gravada duas vezes na mesma versão.

### §24 · coleta e análise deixaram de ser a mesma coisa

`READY` diz que a pesquisa está pronta; `READY_TO_FINALIZE` diz que a análise já
foi feita. Sem o segundo, a tela ofereceria congelar uma coleta que ninguém
analisou.

Em `READY_TO_FINALIZE` o START some — um START ali recoletaria a prateleira e
jogaria fora a análise que a pessoa está revisando.

### DECLARADO — o que NÃO foi implementado

- **`merchant.reviews` e `merchant.amazon.asin` (PDP).** Fora do escopo por §36.
  Enquanto não existirem, `REVIEW_TEXT`, `PDP_ATTRIBUTES`, `PRODUCT_BENEFITS`,
  `BRAND_IDENTITY` e `CATEGORY_TAXONOMY` seguem como lacuna declarada.
- **Planner handoff v3.** O `editorialOutput` viaja na fotografia, mas o
  handoff ao Planejador é o RADAR_FINAL.
- **`analysisVersions` migration** e qualquer migração: MIGRATIONS = 0.
- **Homologação manual.** `MANUAL_UI_VALIDATED` continua com o usuário: nenhuma
  tela foi clicada no fluxo real neste gate.

## RADAR_FINAL_1 — o dossiê V3 no runtime e a fronteira com o Planejador

### A auditoria do §0, antes de qualquer código

```
V3_SCHEMA_FILE          lib/radar/planner-handoff.ts (RadarPlannerHandoffV3, contractVersion 3)
CURRENT_RUNTIME_BUILDER NENHUM — buildRadarPlannerEvidenceHandoff tinha ZERO chamadas fora de teste
CURRENT_PLANNER_HANDOFF pipeline.importApprovedToPlanner: estado local + workflow command,
                        sem bundle, sem readback, sem identidade de evidência
MISSING_RUNTIME_FIELDS  primaryResearchProfile · research.google/youtube/amazon ·
                        competitiveBlueprint · crossSerp · editorialOutput ·
                        identidade própria do dossiê
```

O contrato V3 existia desde o Gate 16 e nunca foi montado. Pior: o núcleo dele
era a fotografia do pipeline do **Google** — `observed` é o
`RadarCompetitiveObservedModel`, e a prontidão exigia `RadarFrozenEvidenceBundle`.
Um artigo de vídeo ou de produto nunca teve nenhum dos dois, e por isso não
tinha handoff possível sem fabricar um snapshot do Google.

### A correção: perfil + camadas no lugar da fotografia do Google

`observed` passou a ser opcional e `research.{google,youtube,amazon}` passou a
ser o núcleo. Cada camada declara `role: PRIMARY | SUPPORT` — e o contrato
recusa duas primárias. Num artigo de vídeo, o Google lido uma vez entra como
`SUPPORT`: marcá-lo primário faria o Planejador acreditar que houve investigação
competitiva de páginas sobre dez links azuis que ninguém curou.

O congelado do Google continua **obrigatório quando o perfil primário é GOOGLE**
— ali ele é a autoridade canônica. Para os outros dois, exigi-lo seria o
fallback fabricado que §17 proíbe.

### Identidade de conteúdo, e é ela que torna o envio idempotente

O dossiê carrega `bundleId`/`bundleHash` calculados sobre o conteúdo inteiro,
com a própria identidade fora da conta. Mesmo dossiê, mesma entrega — e a
resposta diz isso sem gravar nada. Dossiê diferente, versão sobe, referenciando
a anterior.

O readback é **remoto e revalidado**: relê do servidor e recalcula o hash. Uma
checagem de forma aceitaria um pacote com os campos certos e o conteúdo trocado.

### O tamanho medido — §15

```
corrida da Amazon     132.751 bytes
fotografia             17.555 bytes
BUNDLE V3              18.890 bytes
```

O dossiê inteiro pesa 14% da coleta que ele descreve. Nenhum `universe`, nenhum
`results`, nenhum `organicResults`, nenhum `peopleAlsoAsk`, nenhum transcript —
conferido no serializado, que é a forma em que ele chega ao banco.

### DECLARADO — o que NÃO foi implementado

- **`buildRadarPlannerEvidenceHandoff` continua sem runtime.** O envio grava o
  DOSSIÊ (`plannerBundle`), não o envelope `RadarPlannerHandoffV3`. O envelope
  acrescenta `channels`, `areas` e `plannerMayNot` sobre o mesmo dossiê e segue
  disponível; ligá-lo ao runtime é trabalho do RADAR_FINAL_2.
- **`importApprovedToPlanner` continua existindo**, movendo o item na esteira.
  Os dois caminhos convivem: o legado move o item, o novo entrega a evidência.
  Unificá-los exige mexer no `editorial-pipeline-context`, que este gate não
  tocou.
- **ContentPlan, cronograma, roteiro e redação** seguem fora (§28).
- **Homologação manual.** `MANUAL_UI_VALIDATED` continua com o usuário.

## RADAR_FINAL_1.1 — a autoridade única do handoff

### Duas metades viraram uma

Antes: a rota gravava o dossiê e `importApprovedToPlanner` movia a esteira a
partir do React. Quem clicava uma vez disparava metade da fronteira, e a outra
metade dependia de um caminho que a tela controlava sozinha.

`sendRadarToPlanner` conclui o handoff inteiro, nesta ordem — e a ordem é a
garantia:

```
VALIDAR → MONTAR → GRAVAR DOSSIÊ → RELER DOSSIÊ
→ REVALIDAR IDENTIDADE → TRANSICIONAR → RELER DESTINO → SUCESSO
```

A esteira só se move sobre evidência que o servidor confirmou ter gravado.
Invertê-la moveria o artigo apostando numa escrita que pode não ter acontecido.

### §6 · a decisão canônica: o envelope foi depreciado

`RadarPlannerHandoffV3` não se sustentou por duas razões concretas:

1. `frozen` é **obrigatório** e é o congelado do pipeline do Google.
   Materializá-lo reintroduziria a exigência que o RADAR_FINAL_1 removeu, ou
   obrigaria a fabricar um snapshot.
2. Ele carrega `frozen` **e** `dossier` — as duas camadas descrevendo a mesma
   rodada. Entregá-las juntas multiplicaria os 18.890 bytes por nada.

O contrato runtime é **`RadarEvidenceBundleV3` + identidade do ArticleDNA**.

O que valia no envelope foi **conectado**: `plannerMayNot` viaja agora dentro do
registro gravado — era governança declarada e nunca entregue. `channels` e
`areas` foram substituídos por evidência real: as camadas
`research.{google,youtube,amazon}` e `video`/`specialist` dizem o mesmo com
procedência.

### §4 e §5 · a falha parcial é recuperável, não mentida

A matriz completa:

| dossiê | destino | desfecho |
|---|---|---|
| ausente | ausente | `CREATED` — grava e transiciona |
| gravado | ausente | `TRANSITION_COMPLETED` — completa só a esteira, sem regravar |
| gravado | presente | `ALREADY_IMPORTED` — nenhuma escrita |
| ausente | presente | **inconsistência explícita**, nunca sucesso silencioso |

Transição que falha devolve ERRO com o dossiê intacto. A repetição reconhece o
dossiê e completa o que falta.

### §14 · a revalidação antes de mover

São duas idas ao banco com uma escrita no meio. O fundamento é relido antes da
transição: se o ArticleDNA mudou, `BLOCKED_STALE_HANDOFF`. Mover um pacote stale
faria o Planejador receber evidência de uma investigação para um artigo que já é
outro.

### §12 · a autoridade é remota, e são duas provas

`sent` exige `plannerBundle` gravado **e** o item em `sent_planner`. O dossiê
sozinho não prova importação — foi exatamente esse o estado que uma transição
falha deixava. Sem `localStorage` em lugar nenhum.

### DECLARADO — o que NÃO foi implementado

- **`importApprovedToPlanner` continua existindo** para a operação em LOTE da
  planilha. O botão da investigação não passa mais por ele. Migrar o lote para
  a mesma autoridade exige mexer no `editorial-pipeline-context` e na seleção
  múltipla — trabalho próprio, não deste gate.
- **`buildRadarPlannerEvidenceHandoff` e `RadarPlannerHandoffV3`** seguem
  exportados e marcados `@deprecated`, exercitados pelos testes de contrato do
  Gate 16. Nenhuma chamada runtime os monta.
- **ContentPlan e a lógica editorial do Planejador** seguem fora (§19).
- **Homologação manual.** `MANUAL_UI_VALIDATED` continua com o usuário.

## RADAR_FINAL_1.2 — o lote passa pela mesma autoridade

### A auditoria do §1, antes de qualquer alteração

```
BATCH_CAN_MOVE_RADAR_ITEM         = YES
BATCH_WRITES_SENT_PLANNER         = YES (import_planner no servidor + estado React otimista)
BATCH_REQUIRES_PLANNER_BUNDLE     = NO
BATCH_CALLS_SEND_RADAR_TO_PLANNER = NO
```

A elegibilidade do lote era o fallthrough de `getRadarR4BulkEligibility`:
elegível se `reportApproved`. Nenhuma prontidão, nenhuma identidade de
ArticleDNA, nenhum dossiê. Um artigo que saísse por ali chegava ao Planejador
**sem evidência atrás**, e o item aparecia lá como qualquer outro.

A auditoria achou um terceiro caminho que o 1.1 não tinha registrado:
`radar-analysis-page.tsx` chamava `importApprovedToPlanner` para um item só e
gravava o recibo `plannerTransfer` por conta própria.

### A correção: uma porta, três chamadores

`lib/radar/planner-handoff-client.ts` é a única porta da tela para a fronteira.
O lote **repete** essa porta, um artigo por vez — ele não monta dossiê, não
grava dossiê, não decide prontidão e não toca no Planejador.

Sequencial de propósito: cada handoff escreve uma versão nova da análise sob
trava otimista. Em paralelo, N escritas disputariam o mesmo lock e a metade
perdedora falharia por concorrência — não por não estar pronta, que é a única
recusa que interessa a quem opera.

### §5 · o desfecho é por artigo

`IMPORTED · ALREADY_IMPORTED · TRANSITION_COMPLETED · BLOCKED_NOT_READY ·
BLOCKED_STALE · FAILED`

Um artigo que falha não aborta o lote nem fabrica sucesso nos outros. O resumo
carrega as três contagens porque as três pedem ação diferente: `8 enviado(s) ·
2 já enviado(s) · 1 bloqueado(s)`.

`BLOCKED_STALE` é separado de `BLOCKED_NOT_READY` de propósito — um exige
refazer a investigação sobre o ArticleDNA novo, o outro exige terminar a que
existe.

### §2 · `importApprovedToPlanner` foi REMOVIDO

Depois que os três chamadores passaram pela autoridade única, ele ficou sem uso.
Um caminho morto que ainda funciona é uma arma carregada: alguém o encontraria e
voltaria a usá-lo. Saiu da interface e da implementação do
`editorial-pipeline-context` — deleção cirúrgica de código morto, não a
refatoração ampla que o gate proibiu.

O comando `import_planner` continua no contrato de workflow: ele é a operação da
ESTEIRA, e quem a aciona agora é o serviço, no servidor.

### DECLARADO — o que NÃO foi implementado

- **A elegibilidade do lote (`r4-queue.ts`) continua sendo `reportApproved`.**
  Ela decide o que a planilha OFERECE; quem decide o que passa é a autoridade,
  e um artigo oferecido mas não pronto volta `BLOCKED_NOT_READY` com a frase do
  servidor. Alinhar a oferta à prontidão real exigiria o read-model do dossiê
  dentro do `r4-queue`, que é trabalho próprio.
- **ContentPlan e a lógica editorial do Planejador** seguem fora (§9).
- **Homologação manual.** `MANUAL_UI_VALIDATED` continua com o usuário.

## RADAR_FINAL_2 — payload, lazy, caminhos mortos

### §1 e §23 · a medição, antes de mexer

Uma versão de análise de um artigo **Amazon finalizado**, medida sobre a coleta
real de `protetor solar facial`:

```
 63,2 KB   MATÉRIA-PRIMA   amazonSearch.results (55 itens de página)
 65,2 KB   MATÉRIA-PRIMA   amazonSearch.universe (51 produtos)
129,7 KB   MATÉRIA-PRIMA   amazonSearch (corrida inteira)
 17,2 KB   CONCLUSÃO       amazonFrozenInvestigation (fotografia)
 18,5 KB   CONCLUSÃO       RadarEvidenceBundleV3
──────────
146,9 KB   uma versão de análise finalizada

Matéria-prima: 88,3%   Conclusões: 11,7%
```

O custo não é linear no trabalho feito — é linear no número de **cliques que
gravaram uma versão**.

### A correção: a poda de leitura envelheceu

`pruneRadarAnalysisHistory` já existia e já estava no lugar certo (a leitura do
repositório). A lista de campos pesados dela foi escrita quando só existia o
pipeline do Google: `extractions` e `competitiveReport`. YouTube e Amazon
chegaram depois e trouxeram a própria matéria-prima **sem entrar nela**.

Entraram agora `youtubeSearch` e `amazonSearch`. E o readback por artigo, que
não podava, passou a podar — ele remontava o histórico inteiro no navegador a
cada gravação, desfazendo a poda para aquele artigo.

```
BEFORE   735,0 KB   (5 versões da mesma investigação)
AFTER    346,2 KB
DELTA    388,8 KB
REDUÇÃO  52,9%
```

### §24 · a invariante que torna a poda segura

Toda gravação monta a sucessora a partir da versão **corrente**, espalhando o
payload dela. Se a corrente chegasse podada ao navegador, a gravação seguinte
persistiria `amazonSearch: null` — e a coleta paga sumiria do banco sem aviso.

A poda preserva a corrente e a última aprovada. Há teste dedicado a isso: ele
existe para impedir que alguém "simplifique" a regra para podar tudo menos a
última.

E nenhuma **conclusão** entra na poda: fotografia, blueprint e dossiê sobrevivem
em todas as versões. Uma versão podada continua legível pela projeção de estado,
porque a fotografia responde sozinha por `runRef`.

### §23 · os três maiores payloads restantes

```
1.  129,7 KB   amazonSearch da versão CORRENTE     não podável: toda gravação a sucede
2.   16,3 KB   competitiveBlueprint na fotografia  é CONCLUSÃO — podá-la perde semântica
3.   18,5 KB   RadarEvidenceBundleV3 gravado       o dossiê entregue ao Planejador
```

### §2 · RADAR_ANALYSIS_VERSION_STORAGE — backlog formal

**Problema.** Todas as versões de análise vivem num único JSONB do item de
workflow. A corrida da versão corrente (129,7 KB) não é podável, porque é dela
que a próxima gravação nasce.

**Impacto.** O payload cresce por clique, não por trabalho. A poda cortou 52,9%
do histórico; o piso continua sendo 1 corrida completa por artigo ativo.

**Evidência medida.** 146,9 KB por versão · 88,3% matéria-prima · linha de 9,77
MB medida na FASE 0 do BLUEPRINT_CANONICAL.

**Risco.** Cresce com o uso, não com a base. Um artigo muito trabalhado fica
mais caro que cem artigos parados.

**Solução futura possível.** Mover as corridas para armazenamento próprio,
endereçadas por `runId` — a fotografia já aponta para elas por referência, então
o contrato de leitura não muda. Exige DDL e migração de histórico: **fora deste
gate por §18**.

### §25 · RADAR_BATCH_ELIGIBILITY_VIEW — refinamento registrado

A planilha oferece o envio em lote por `reportApproved`; a autoridade recusa o
que não está pronto com `BLOCKED_NOT_READY`. É aceitável — a oferta é da
planilha, a decisão é do servidor. Alinhar as duas exigiria o read-model do
dossiê dentro do `r4-queue`.

### §11 · a auditoria de caminhos mortos

```
importApprovedToPlanner            REMOVIDO no 1.2
buildRadarPlannerEvidenceHandoff   TEST_ONLY — @deprecated, zero runtime
RadarPlannerHandoffV3              TEST_ONLY — @deprecated, Gate 16 o exercita
```

Nenhum outro caminho morto alcançável foi encontrado nas telas do Radar.

### DECLARADO — o que este gate NÃO fecha

Tudo em §17 a §22 — smokes de runtime, matriz de F5, cross-session e auditoria
de rede — **exige a tela real** e continua com o usuário. Este gate mediu o
payload que o CÓDIGO produz e provou as invariantes por teste; ele não abriu o
navegador.

## RADAR_FINAL_2.1 — o read model compacto da versão corrente

### O que faltava

O RADAR_FINAL_2 podou o histórico. Sobrava a versão **corrente**: 129,7 KB de
`amazonSearch` atravessando a rede para alimentar um disclosure fechado.

Disclosure fechado não é lazy loading se os bytes já chegaram — o clique só
decidia se eles seriam pintados, não se seriam transportados.

### A medida

```
BEFORE_21_INITIAL_BYTES   150.482   147,0 KB
AFTER_21_INITIAL_BYTES     17.733    17,3 KB
REDUCTION_21                88,2%

INITIAL_CORE_BYTES         17.733    17,3 KB   fotografia + blueprint + estado
SAMPLE_LAZY_BYTES         132.821   129,7 KB   buscado ao abrir a amostra
PROVENANCE_LAZY_BYTES         640     0,6 KB   buscado ao abrir a proveniência
```

### O recorte: só investigação CONGELADA

A compactação não alcança investigação viva, e a razão é de **produto**, não de
performance: antes do freeze o universo é a superfície de trabalho — é nele que
a curadoria do YouTube acontece, e ele está aberto por construção. Tirá-lo dali
quebraria a curadoria para economizar bytes que a pessoa está olhando.

Depois do freeze a amostra é consulta, e a fotografia responde sozinha por
`runRef`.

### §9 · a trava que torna tudo isso seguro

Uma cópia compacta tem exatamente a **forma** de uma investigação sem coleta.
Sucedê-la gravaria `amazonSearch: null` sobre uma coleta paga — e o banco
aceitaria, porque nada no objeto denuncia a diferença.

O payload passou a declarar `researchTransport: FULL | COMPACT`, e
`createRadarAnalysisSuccessor` **recusa** uma base `COMPACT`. Perda silenciosa
virou erro alto.

E a compactação vive na **listagem**. O readback por artigo continua devolvendo
a versão corrente inteira — é dele que toda escrita do cliente nasce.

### §6 · uma rota, três perfis

`GET /api/editorial/radar-research-part?profile=&part=sample|provenance`.
Não existem `google-sample`, `youtube-sample` e `amazon-sample`: três endpoints
para a mesma pergunta divergiriam na primeira correção feita só num deles.

`PROVIDER_CALLS = 0` — a coleta foi paga uma vez e vive na versão corrente;
buscá-la no provider cobraria duas vezes pelo mesmo dado, e cobraria por um
clique de curiosidade.

### DECLARADO — o que NÃO foi feito

- **O painel do YouTube ainda não usa o lazy.** O contrato, a rota e o read
  model são genéricos e já respondem por `YOUTUBE`; o que falta é a fiação do
  `onToggle` naquele painel. A compactação já vale para ele no transporte — o
  que significa que, hoje, uma investigação de vídeo CONGELADA mostra a amostra
  vazia até essa fiação existir. **É trabalho imediato de um 2.2**, não um
  refinamento opcional.
- **O perfil Google** não tem amostra própria no read model: `sample` devolve
  `run: null` e a contagem sai de `deepResearch.observed.sample`. A amostra dele
  continua vindo pelo caminho do pipeline antigo.
- **Homologação manual** continua com o usuário.

## RADAR_FINAL_2.2 — a paridade de leitura do YouTube, e a auditoria do Google

### YouTube · o bloqueador que o 2.1 deixou aberto

O 2.1 compactou o transporte do YouTube sem ligar a fiação do disclosure: a
amostra ficava **vazia** depois do freeze. Este gate fechou isso pela mesma
autoridade genérica — sem endpoint nem cliente próprio.

```
YOUTUBE_INITIAL_BEFORE         33,9 KB   (38 vídeos)
YOUTUBE_INITIAL_AFTER           0,5 KB
REDUÇÃO                         98,7%
YOUTUBE_SAMPLE_LAZY_BYTES      33,5 KB
YOUTUBE_PROVENANCE_LAZY_BYTES   0,3 KB
```

Dois efeitos colaterais da compactação que a fiação também corrigiu, e que só
apareceriam depois do freeze:

- **"Reabrir / zerar investigação" sumia.** Ele lia só `run`; agora a fotografia
  também o autoriza. É a única ação que sobra depois do FINALIZE.
- **Coortes, seleção e proveniência** liam `run` direto. Passaram a ler a
  *corrida efetiva* — uma fonte só, para a tela não contar uma coisa no rótulo
  e outra nos cards.

### Google · a auditoria de §5, e a decisão de §8

```
GOOGLE_SAMPLE_AUTHORITY          payload.extractions (RadarExtractionPage[])
                                 + finalizedBundle.sample.extractionIds
GOOGLE_SAMPLE_CURRENT_BYTES      ~4,7 KB por página · 37,3 KB (8) · 84,0 KB (18)
GOOGLE_SAMPLE_IN_INITIAL_BEFORE  SIM — a versão corrente carrega `extractions`
GOOGLE_SAMPLE_REQUIRED_FOR_INITIAL_UI
                                 NÃO na tela principal do Radar (os cards leem
                                 `deepResearch.observed`), SIM na tela de análise
                                 legada e nos CAMINHOS DE ESCRITA do pipeline
```

**A decisão: PARAR e declarar, conforme §8.**

`extractions` alimenta escrita: a curadoria regrava as páginas retidas
(`retainedExtractions`) e a extração nova as mescla (`mergedExtractions`), lendo
`payload.extractions` do workspace. Não encontrei guarda que impeça esses
caminhos de rodar sobre uma investigação já congelada.

Compactá-las **não** perderia dado em silêncio — a trava do 2.1 recusa uma base
`COMPACT` —, mas quebraria o fluxo de extração de forma alta, e consertá-lo
significa mexer no pipeline do Google, que §17 exclui.

**O contrato que falta:** uma trava de FINALIZE nos caminhos de escrita do
Google, equivalente ao `profileLocked` dos outros dois perfis. Com ela, a
compactação do Google vira o mesmo recorte seguro de Amazon e YouTube.

**O que NÃO falta:** `finalizedBundle.sample.extractionIds` já amarra a amostra
à fotografia corrente — §8 é resolvível sem inventar associação. O lazy do
Google é trabalho de um gate próprio, não um contrato ausente.

### DECLARADO — o que NÃO foi feito

- **Google continua com o read-path antigo.** Nenhum endpoint artificial foi
  criado (§6/§7): sem poder compactar, um lazy do Google não teria ganho real.
- **A tela de análise legada** (`radar-analysis-page`) continua lendo
  `extractions` do workspace. Ela não foi tocada.
- **Homologação manual** continua com o usuário.

## RADAR_FINAL_2.3 — a fronteira de escrita do Google, e a amostra lazy

### §1 · a auditoria dos write paths, antes de qualquer alteração

| WRITE_PATH | CALL_SITE | ALCANÇÁVEL HOJE | GUARD ANTES | RODAVA APÓS FINALIZE |
|---|---|---|---|---|
| Extração em lote | `radar-page.tsx:~2860` → `radar-analysis/extract` + save | SIM (`onAnalyzeSerpSelection`) | nenhuma | SIM |
| Extração da tela legada | `radar-analysis-page.tsx:509` `patchAnalysis` | SIM | nenhuma | SIM |
| Curadoria da SERP | `radar-page.tsx:2738` `confirmSerpCuration` | **NÃO — handler órfão** | nenhuma | — |
| Curadoria da pesquisa | `radar-page.tsx:2697` `confirmResearchCuration` | **NÃO — handler órfão** | nenhuma | — |
| Persistência de todos acima | `POST /api/editorial/radar-analysis` | SIM | permissão e identidade | SIM |

**CORREÇÃO da primeira leitura desta auditoria:** os dois handlers de curadoria
foram listados como caminhos vivos. Eles não são. `radar-page.tsx:1186` declara
que o Gate 15.3 removeu o workflow legado da SUPERFÍCIE, não do repositório:
nenhum dos dois é passado ao Workbench, e um grep por nome no projeto inteiro
devolve só a definição e esse comentário. São caminhos LATENTES — escrevem sem
guard se alguém os religar.

**O achado que definiu o desenho:** todos convergem para a mesma rota de
gravação. A trava mora lá — não em quatro handlers que divergiriam. E é por
morar lá que os dois órfãos já nascem cobertos, no dia em que voltarem.

### A ordem importava

Primeiro a fronteira de escrita, provada no servidor; só depois a compactação.
Invertê-la faria a curadoria e a extração gravarem sobre uma lista vazia — alto,
graças à trava do 2.1, mas quebrado. Foi por isso que o 2.2 parou.

### A trava — `radarGoogleResearchWriteLock`

Uma autoridade, consultada pela rota. Ela compara **campos**, não botões: um
caminho novo que mexa em `extractions`, `selectedCompetitorIds`, `serpDecisions`,
`benchmark` ou `deepResearch` cai na trava sem precisar ser lembrado.

Três decisões que o desenho exigiu:

- **Comparar contra a versão GRAVADA**, lida do repositório. Comparar contra o
  payload recebido deixaria o cliente se destravar sozinho enviando um payload
  sem `finalizedBundle`.
- **A escrita que LIMPA a fotografia é o reabrir** — e ela passa. Bloqueá-la
  trancaria a investigação para sempre: a única saída exigiria a trava que a
  impede.
- **Só bloqueia quando um campo MUDA.** O próprio FINALIZE carrega `extractions`
  adiante sem alterá-las; marcar toda gravação que as *carrega* faria o
  congelamento se bloquear.

### §16 · a medição

```
--- 8 páginas ---                --- 18 páginas ---
BEFORE     37,7 KB               BEFORE     84,5 KB
AFTER       0,5 KB               AFTER       0,6 KB
REDUÇÃO     98,8%                REDUÇÃO     99,3%
SAMPLE_LAZY 37,4 KB              SAMPLE_LAZY 84,1 KB
PROV_LAZY    0,2 KB              PROV_LAZY    0,2 KB
```

### §11 e §12 · a fotografia manda, e a falta é dita

A amostra do Google é resolvida por `finalizedBundle.sample.extractionIds`. Com
18 extrações correntes e 8 ids congelados, ela mostra **exatamente as 8** — e o
rótulo conta 8, não 18.

Quando um id congelado não resolve, a amostra **não** é completada com outra
página: devolve `FROZEN_SAMPLE_REFERENCE_MISSING` com os ids que faltam. A
fotografia não pode mudar de significado em silêncio.

### §15 · a UI depois do freeze — e o buraco que ela tinha

O caso que a tela oferecia não era o óbvio. `radarDeepResearchState` decide
**STALE antes de olhar `finalizedAt`**, e a Fase 1 respondia STALE com
`START_RESEARCH` **habilitado**. Uma investigação assinada cujo ArticleDNA mudou
depois voltava a oferecer **"Refazer Pesquisa Google"** — e refazer recoleta a
SERP e reescreve a composição sob a fotografia.

A correção mora na autoridade da Fase 1, acima de STALE e de NOT_STARTED, e lê
**o mesmo sinal que o servidor**: a presença de `finalizedBundle`. Derivá-la de
um segundo sinal produziria uma tela que oferece o que a rota recusa com 409.

O resto de §15 já era verdade e foi travado por teste, não reescrito: o botão
primário só renderiza com `acao.id !== "NONE"`; zerar/reabrir continua oferecido;
o bundle congelado e o blueprint canônico são a leitura; proveniência e os quatro
resumos nascem **fechados** — nenhum `<details open>` na área.

### DECLARADO — o que NÃO foi feito

- **A área do Google não ganhou disclosure lazy PRÓPRIO** (§13). O read model, a
  rota genérica e a resolução por ids congelados estão prontos e testados, e a
  amostra do Google já responde por `finalizedBundle.sample.extractionIds` — o
  que não foi feito é trocar os `<details>` nativos da área por
  `loadRadarResearchSample`/`loadRadarResearchProvenance`. Esse corpo é o do
  pipeline antigo (`DeepResearch` no workbench), e reescrevê-lo é mexer no
  pipeline do Google, que §22 exclui. **Consequência prática:** um artigo Google
  FINALIZED tem o transporte compactado e a tela lê `deepResearch.observed`, que
  não é compactado — ela continua funcionando e continua fechada por padrão. O
  que falta é oferecer a amostra completa sob demanda.
- **Homologação manual** continua com o usuário.

## RADAR_FINAL_2.4 — a área Google ligada às autoridades lazy

O backend deste assunto tinha fechado no 2.3. Faltava a tela — e é na tela que
"lazy" deixa de ser promessa.

### O defeito que este gate encontrou no 2.3

`radarResearchSampleOfAnalysis` resolvia a amostra do Google casando os ids
congelados contra `extractions[].id`. Só que `freezeRadarEvidenceBundle` grava
**`observed.competitors[].url`** em `sample.extractionIds` — URLs —, enquanto
`page.id` em runtime é `competitor:<base64url>`.

**Consequência real:** em toda investigação Google finalizada, as 8 páginas
congeladas voltariam como ausentes e `FROZEN_SAMPLE_REFERENCE_MISSING`
dispararia sempre. A fixture do 2.3 usava a mesma chave nos dois lados e por
isso o teste passava.

A resolução passou a ser por **URL normalizada** — a mesma chave com que o
modelo observado casa referência e extração —, com `id` ainda aceito para
fotografias que o tenham gravado. Aceitar as duas identidades da MESMA página é
identidade, não substituição.

### A gramática, agora igual nos três perfis

```
4 cards · Blueprint
▸ Ver amostra competitiva · 8 páginas     ← lazy, fechado
▸ Proveniência e detalhes técnicos        ← lazy, fechado
```

Mesma rota (`/api/editorial/radar-research-part`), mesmo cliente
(`loadRadarResearchSample`/`loadRadarResearchProvenance`), mesmo estado em
`radar-page`. Nenhum `GoogleLazySample`, nenhum endpoint próprio: §6.

O que mudou de forma foi o estado da amostra, que passou a carregar `pages` e
`integrity` ao lado de `run` — Amazon e YouTube renderizam uma CORRIDA, o Google
renderiza PÁGINAS resolvidas pela fotografia.

### §5 · a proveniência do Google tinha outras fontes

Ela caía no ramo do YouTube e lia `youtubeSearch`, que num artigo de Google é
sempre nulo: respondia vazio sem dizer por quê. Agora responde pelo que o
Google realmente tem — `serpSnapshotId` como coleta, `foundationFingerprint`
como assinatura, o registro como início, o bundle como fotografia.

`provider` e `endpoint` ficam **nulos**: o payload da análise não os grava, e
escrever "dataforseo" ali seria inventar.

### §5 · os ids técnicos mudaram de lugar

`bundleId` e `bundleHash` saíram do card "Investigação congelada" e foram para a
proveniência recolhida. Não foram apagados — id técnico não fica fora do
disclosure, e no card competia com a decisão. O card ficou com o que a pessoa
decide olhando: quando congelou, que amostra, quantos links, quantos pontos de
especialista.

`tests/radar-gate15-2-despacho-dom.test.mts` foi atualizado para a nova verdade
(o hash NÃO está no card), mantendo a garantia que ele protege.

### §12 · a medição, com a chave real

```
--- 8 correntes · 8 congeladas ---     --- 18 correntes · 8 congeladas ---
BEFORE            38,2 KB              BEFORE            84,9 KB
AFTER              0,9 KB              AFTER              0,9 KB
REDUÇÃO           97,6%                REDUÇÃO           98,9%
SAMPLE_LAZY       37,4 KB              SAMPLE_LAZY       37,4 KB
PROVENANCE_LAZY    0,4 KB              PROVENANCE_LAZY    0,4 KB
SAMPLE_CONTENT_IN_INITIAL = NO         SAMPLE_CONTENT_IN_INITIAL = NO
RESOLVIDAS 8 de 8 · INTEGRIDADE OK     RESOLVIDAS 8 de 8 · INTEGRIDADE OK
```

A amostra lazy não cresce com as 18 correntes: ela é a fotografia, e a
fotografia tem 8.

### §7 · duplicação registrada, não refatorada

Os quatro `Resumo` operacionais do Google (modelo, links, autoridade,
descoberta) convivem com o Blueprint canônico acima deles. Há sobreposição
parcial — o Blueprint responde "o que eu escrevo" e os resumos respondem "o que
a investigação mediu" — e a leitura não é idêntica. **Fica registrado para
cleanup posterior; este gate não abriu essa refatoração.**

### DECLARADO

- **Homologação manual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_1 — o artigo-modelo, não o relatório

### §1 · a auditoria

| | |
|---|---|
| `EDITORIAL_BLUEPRINT_BUILDER` | `lib/radar/editorial-blueprint.ts` · `buildRadarEditorialBlueprint` |
| `EDITORIAL_BLOCK_SOURCE` | `discovery.answerableUnits` agrupadas por `unit.concept.id` |
| `SECTION_CANDIDATE_SOURCE` | um `RadarSectionCandidate` por CONCEITO — todos, sem filtro |
| `WHY_INCLUDED_SOURCE` | `unit.marketRecurrence.statement` ("7 de 10 páginas…") |
| `LINK_SOURCE` | `observed.internalLinkPlan.outgoing`, por afinidade de conceito |
| `SPECIALIST_SOURCE` | `unit.specialistRequirement.requirementId` |

**`ROOT_CAUSE_20_BLOCKS`:** não havia critério de promoção. Cada conceito com
uma `answerableUnit` virava bloco; `importance` (`CORE` / `SUPPORTING` /
`PERIPHERAL`, este último com `pages < 2`) só mudava o RÓTULO de prioridade, e
`PERIPHERAL` continuava entrando como "Opcional" **dentro do artigo-modelo**.

Vinte conceitos → vinte blocos. Pantenol, período menstrual, acne hormonal e
"cabelo virgem" apareciam como seção ao lado de "O que é pele oleosa?".

### A regra, invertida de volta

```
ArticleDNA           define o território editorial permitido
     ↓
Evidência do Radar   reforça · contradiz · amplia
     ↓
SÍNTESE              agrupa, deduplica e DECIDE
     ↓
Artigo-modelo
```

### As três decisões que fizeram a síntese funcionar

**1 · Agrupar pelo que DISTINGUE, não pelo assunto.** `pele` e `oleos` aparecem
em dezoito dos vinte candidatos: agrupar por raiz compartilhada colapsava o
artigo num bloco só — e o líder desse bloco passava a decidir a intenção de
todos, inclusive das ofertas comerciais, que herdavam a aprovação de "O que é a
pele oleosa?". O que separa uma necessidade da outra é o núcleo que ela
acrescenta ao assunto: cuidar, controlar, hidratar, escolher.

**2 · O que o DNA exige é o que ele ACRESCENTA.** "identificação da pele oleosa"
tem três raízes e duas são o assunto do artigo inteiro. Sem descontar as
genéricas, "Pantenol na pele oleosa" viraria "exigido pelo ArticleDNA".

**3 · Duas portas para promover, nunca uma.** Ou o DNA declara o assunto — e aí
recorrência baixa não impede (proteção solar entra com 1 de 10) —, ou a
evidência o sustenta DENTRO do território (piso de 2 de 10) e servindo à
intenção declarada.

### §20 · o fixture real, antes e depois

```
REAL_FIXTURE_BEFORE_SECTIONS = 20
REAL_FIXTURE_AFTER_SECTIONS  = 8

H2 — O que define a pele oleosa?                              [STRONG]
H2 — Como cuidar de pele oleosa no dia a dia?                 [STRONG]
H2 — Como controlar o brilho da pele oleosa no dia a dia?     [MODERATE]
H2 — Afinal, pele oleosa precisa de hidratação?               [STRONG]
H2 — O que explica a relação entre pele oleosa e acne?        [MODERATE] ⚠ fonte ⚠ especialista
H2 — Na prática, o que piora a oleosidade da pele?            [MODERATE]
H2 — Como escolher produtos para pele oleosa no dia a dia?    [MODERATE]
H2 — O que considerar sobre proteção solar para pele oleosa?  [DNA_REQUIRED]

NÃO ENTRARAM (8, todos com motivo e todos visíveis no disclosure):
  Pantenol · acne hormonal e período menstrual · cabelo virgem ·
  tipos de acne · dermatite seborreica · melhores ofertas · preços · onde comprar
```

### §10 · cabeçalho é direção, não cópia

`canonicalLabel` é a formulação MAIS FREQUENTE entre os concorrentes — ou seja,
literalmente o H2 de alguém. A sugestão é reescrita por padrão gramatical ("o
que é" → "O que define"; pergunta de sim/não ganha o "Afinal") e verificada
contra as variantes observadas. A diretiva ao lado nomeia a necessidade e
sobrevive quando o Redator preferir outra frase.

### DECISÕES DECLARADAS

- **Variante equivalente NÃO virou H3.** Rebaixar a duplicação um nível deixaria
  o artigo perguntando três vezes a mesma coisa. O que cada seção também
  responde fica no motivo, dentro do disclosure; `childSections` continua no
  contrato para subdivisão REAL, que esta rodada não teve como distinguir com
  segurança.
- **A fronteira do Planejador renderiza dentro da área Google** (§19) e a
  compartilhada some nesse caso — uma condição só (`areaGoogle`) decide as duas,
  para não haver duas fronteiras na mesma tela.
- **YouTube e Amazon não foram tocados.** §23/§24 valem, mas a aceitação visual
  do Google vem primeiro.
- **Homologação manual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_1.1 — artigo-modelo executivo e hierarquia

### §1 · a auditoria dos campos visíveis

| CAMPO | ANTES | DEPOIS |
|---|---|---|
| `titleDirection` | normal | **ESSENTIAL_NORMAL_VIEW** |
| `editorialAngle` | normal, descrevia o PROCESSO | ESSENTIAL — reescrito como direção editorial |
| `readerPromise` | normal | ESSENTIAL |
| `editorialObjective` | normal | **REDUNDANT** — repetia a promessa; saiu da tela |
| `articleIdentity.principal/intent` | normal | REDUNDANT na tela (a faixa do Article já diz) |
| `opening.hook / promise / initialAnswer` | normal | ESSENTIAL |
| `opening.transition` | normal | **REDUNDANT** — instrução genérica; só no contrato |
| `section.objective` | normal, era a CONTAGEM | ESSENTIAL — agora é função editorial |
| `section.readerQuestion` | normal | EVIDENCE_DISCLOSURE (virou `coveragePoints`) |
| `section.keyMessage` | normal, era boilerplate | ESSENTIAL **quando há conteúdo**; `null` quando não |
| `section.reason` | normal | EVIDENCE_DISCLOSURE |
| `section.evidenceStrength` | selo sempre | COMPACT_BADGE, só quando diz algo |
| candidatos rejeitados | normal | **evidência competitiva** |
| card "Investigação congelada" | normal | **proveniência técnica** |

`NORMAL_VIEW_FIELDS_BEFORE = 11 por seção + 6 no topo`
`NORMAL_VIEW_FIELDS_AFTER = 4 por seção + 3 no topo + status`

### O defeito de raiz do "objetivo"

`buildRadarEditorialBlueprint` grava `purpose: conceito.evidence` — literalmente
"Observado em 7 de 10 páginas, sob 9 formulações". Era isso que aparecia como
**Objetivo** de cada seção. Agora o objetivo vem da FUNÇÃO editorial
(definição, aplicação, explicação, critério, cobertura) e a contagem mora no
disclosure.

### §9 e §10 · a hierarquia, e a trava que ela precisou

`MUST_COVER ≠ MUST_BE_H2`. O ArticleDNA decide que o assunto entra; a
arquitetura decide onde. Três regras, nesta ordem:

1. **O eixo prático absorve as aplicações.** Entre as seções de aplicação e de
   escolha, a mais sustentada vira o eixo e as demais viram etapas dele.
2. **Tema próprio compartilhado agrupa.**
3. **Exigido pelo DNA com evidência fraca desce** para o eixo, com o motivo dito
   na própria seção.

**A trava que faltava:** `RANK` de função — fundamento (definição, explicação)
nunca desce para debaixo de aplicação. Sem ela, a explicação da relação entre
oleosidade e acne virava etapa da rotina porque as duas compartilham a palavra
"acne", e o artigo passava a explicar a causa no meio do passo a passo.

### §11 · o fixture real, agora hierárquico

```
H2_COUNT_BEFORE = 8    H2_COUNT_AFTER = 5    H3_COUNT_AFTER = 3

H2 — O que define a pele oleosa?                            [STRONG]
H2 — Como cuidar de pele oleosa no dia a dia?               [STRONG]
   H3 — Como controlar o brilho da pele oleosa no dia a dia?
   H3 — Como escolher produtos para pele oleosa no dia a dia?
   H3 — O que considerar sobre proteção solar para pele oleosa?   ← exigido pelo DNA, 1/10
H2 — Afinal, pele oleosa precisa de hidratação?             [STRONG]
H2 — O que explica a relação entre pele oleosa e acne?      [MODERATE] ⚠ fonte ⚠ especialista
H2 — Na prática, o que piora a oleosidade da pele?          [MODERATE]
```

### §4 · "Parcial" parou de acender sempre

Antes somava "evidência competitiva moderada em 5 seção(ões)" — e praticamente
todo artigo nascia Parcial, por um motivo que não impede ninguém de escrever.
Rótulo que sempre acende deixa de ser lido. O status agora conta só o que TRAVA:
`Parcial · 1 fonte(s) pendente(s) · 1 revisão(ões) profissional(is)`. Evidência
moderada continua dita — na seção, onde é acionável.

### DECISÕES DECLARADAS

- **Hidratação continua H2.** A ilustração do §10 a mostra como H3 da rotina; com
  5 de 10 páginas e função própria (é o contraintuitivo do tema), rebaixá-la
  esconderia um eixo real. §11 pede testar a hierarquia, não o número.
- **`keyMessage` fica vazio nesta amostra.** Só há mensagem quando existe
  diferenciação observada; inventar uma seria fabricar conteúdo (§8).
- **Dois níveis, nunca três.** Um filho não hospeda outro: H3 de H3 é sumário,
  não arquitetura.
- **YouTube e Amazon continuam intocados.**
- **Homologação manual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_1.2 — a fotocópia editorial

### §1 · a auditoria dos campos de topo

| CAMPO | ANTES | DEPOIS |
|---|---|---|
| `titleDirection` | visível · "Nomear a promessa sem repetir keyword" | **contrato** |
| `titleSuggestion` | não existia | **visível** · título utilizável |
| `titleAlternatives` | não existia | visível · uma ou duas outras direções |
| `editorialAngle` | "Fundamento primeiro, aplicação depois" | específico deste artigo |
| `readerPromise` | "Prometer ao leitor: cobrir com clareza o tema" | promessa concreta |
| `opening.transition` | visível | contrato |
| `conclusion.nextStep` | visível | contrato (ficam Objetivo e CTA) |
| `coveragePoints` | matéria-prima ("Definir antes de aprofundar: oleosa") | pontos editoriais |
| `mediaSummary` | não existia | uma linha; detalhe no disclosure |

### O bug do acento que escondia o fundamento

`funcaoEditorial` classificava por `^o que é\b` — e **`\b` não fecha depois de
acento**: a fronteira de palavra do JavaScript é ASCII, e entre "é" e o espaço
não há `\b`. A seção definicional era classificada como `COVERAGE`, e com ela
fora do lugar o título e a direção do artigo perdiam o fundamento que deveriam
nomear. Um caractere de regex custou a primeira frase do blueprint.

### §5 · quem hospeda um subtema

A primeira versão escolhia o anfitrião por EVIDÊNCIA — e a rotina, que absorveu
a variante "como cuidar da pele oleosa e com tendência a acne", herdou a palavra
`acne`. Resultado: a explicação da acne e os tipos de acne viravam etapas do
passo a passo, que é o exemplo que §5 proíbe.

Três critérios, nesta ordem:

1. **Rank de função** — quem define ou explica hospeda; quem aplica, não.
2. **Proporção do tema** — `acne` é metade das raízes da explicação e um quarto
   das da rotina: a explicação é *sobre* acne, a rotina só a menciona.
3. **Evidência**, por último.

E o eixo prático **nunca desce por tema**: ele compartilha palavras com quase
tudo, e enterrá-lo esconderia a parte que o leitor veio buscar.

Com o ArticleDNA declarando acne hormonal, a arquitetura fica:

```
H2 — O que explica a relação entre pele oleosa e acne?
   H3 — O que considerar sobre acne hormonal e período menstrual?
   H3 — O que explica os tipos de acne?
```

### §6 · o placement tem duas saídas, não uma

`MUST_COVER` não é `MUST_HEADING`. Quando o assunto pertence ao tema de uma
seção, vira H3 dela. Quando não pertence a tema nenhum — proteção solar com uma
página de dez — vira **ponto a cobrir** do eixo compatível: um H3 só para ele
daria a um item de rotina o peso de um bloco. Sem anfitrião compatível, ele
permanece como eixo: esconder cobertura exigida é pior do que uma lista longa.

### §8 · o destino do link quando não há nome

O plano devolve `slug || nodeId`. Sem slug, o "destino" saía como
`article:article-candidate:territory:<uuid>` — identificador técnico fora da
proveniência, exatamente o que §8 proíbe. Agora um teste de FORMA (não de
prefixo conhecido) detecta o identificador e mostra a **âncora**, que é o texto
que vai para a página.

### §20 · a aceitação

```
TÍTULO SUGERIDO: Como cuidar de pele oleosa no dia a dia: brilho, produtos e hidratação
OUTRAS DIREÇÕES: Como cuidar de pele oleosa no dia a dia · Skincare para pele oleosa: brilho, produtos e hidratação
DIREÇÃO: Explicar o que define a pele oleosa, transformar esse fundamento em cuidar
         de pele oleosa no dia a dia, cobrindo brilho, produtos e hidratação e
         contextualizar o que explica a relação entre pele oleosa e acne.
PROMESSA: Mostrar como cuidar de pele oleosa no dia a dia, com brilho, produtos e
          hidratação, e quando o que explica a relação entre pele oleosa e acne
          exige atenção.
PLANO VISUAL: 1 capa · 3 imagem(ns) de apoio
CTA: Levar o leitor a cuidar de pele oleosa no dia a dia.
```

### DECLARADO

- **Um mutante equivalente.** `podeHospedar` na regra de tema virou invariante
  defensiva: com o anfitrião escolhido pelo menor rank, a checagem não tem como
  disparar. Ela fica, com o comentário dizendo por quê — se a ordenação mudar, é
  ela que segura. Não inventei teste para matar mutante equivalente.
- **`keyMessage` continua vazio** nesta amostra: só há mensagem quando existe
  diferenciação observada.
- **YouTube e Amazon continuam intocados**, e fora da área Google os painéis de
  consulta seguem exatamente onde estavam.
- **Homologação manual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_1.3 — a fotografia como autoridade de runtime

### §1 · a auditoria, e por que 10 virou 0

| FIELD | CURRENT_SOURCE | FROZEN_SOURCE_AVAILABLE | COMPACT_DTO_SOURCE |
|---|---|---|---|
| `comparablePagesCount` | `pages.filter(isComparable).length` | `bundle.sample.comparablePages` | **vazio** |
| `sufficiency` | recalculada de `extractions` | `bundle.model.sufficiency` | **vazio** |
| competitive model status | `observed.sample` | idem acima | **vazio** |
| market denominator | `comparaveis.length` | `bundle.sample` | **vazio** |
| question recurrence | `comparaveis.length` | idem | **vazio** |
| authority / format | `structural` (das páginas) | parcial (`dominantFormat`) | persistido em `competitiveReport` |

**`ROOT_CAUSE_FROZEN_10_TO_0`:** `radar-page.tsx:1085` alimenta a projeção com
`analysis.payload.extractions` — e o DTO da lista passa por
`compactRadarResearchForRead`, que esvazia esse campo numa investigação
FINALIZADA. O modelo observado derivava a amostra CONTANDO essas páginas.

O "7 de 0" é a assinatura exata do defeito: **numerador congelado + denominador
do transporte**. As recorrências vêm das referências, que o compacto preserva; a
amostra vinha das extrações, que ele remove de propósito.

### A regra, agora em um lugar só

```
FROZEN > LIVE > TRANSPORTE
```

`amostraComparavel` é uma constante única no modelo observado. Espalhar
`comparaveis.length` por doze pontos foi o que permitiu metade deles continuar
certa e a outra metade virar zero no mesmo render.

A fotografia passou a responder por: `comparablePages`, `analyzedSuccess`,
`failedFinal`, o denominador de todo conceito/necessidade, e a suficiência.

### §3 · a varredura de denominador zero

`radarZeroDenominatorOffenders` percorre a PROJEÇÃO INTEIRA atrás de
`N de 0` com N > 0. Ela não esconde denominador — quem esconde transforma um erro
visível num erro silencioso. Uma frase nova com o mesmo defeito cai nela sem
precisar ser prevista.

### §7 a §9 · o título deixou de ser uma lista de radicais

"brilho, tipos e surge" eram tokens tirados do radical de cada seção. A faceta
agora é o NÚCLEO da necessidade sem o assunto grudado no fim — "controlar o
brilho", "escolher produtos" — com duas palavras substantivas no mínimo. Quando
a gramática entrega um complemento ("precisa de hidratação"), ele vem sozinho,
porque aí é substantivo por construção.

### §10 · "como surge" não é aplicação

`funcaoEditorial` classificava por `^como` e mandava "Como surge a acne
hormonal?" para APPLICATION — foi por isso que o runtime pendurou a causa dentro
do passo a passo. O verbo decide: surgir, funcionar, acontecer e formar-se
descrevem como algo ACONTECE.

### §12 a §14 · a superfície

- A telemetria vinha de `differentiation`, que carrega a evidência do modelo
  observado ("A busca evidencia a necessidade e apenas 3 de 10 páginas a
  cobrem"). Ela era a **mensagem-chave**. Agora um filtro recusa texto com
  contagem, e sem mensagem o campo fica vazio.
- A frase do ArticleDNA virou selo; o texto inteiro desceu para "Ver evidências".
- A caixa alta da SERP é normalizada no cabeçalho, nos pontos e na direção. O
  original continua intacto na evidência.

### §15 · a paridade, provada nos dois transportes

O teste monta a vista REAL duas vezes — com e sem extrações — e compara
contagens, suficiência, título, direção, promessa, prontidão, arquitetura e
padrões estruturais. A única diferença permitida é a matéria-prima pesada.

**O que tornou a paridade possível:** `competitiveReport.observedCompetitiveModel`
NÃO é compactado. A semântica das páginas fica gravada na versão, e é dela que a
síntese editorial continua saindo sob transporte compacto.

### DECLARADO

- **Padrões estruturais não são emitidos sob fotografia.** Eles contam páginas
  vivas; com o denominador congelado o numerador viria de hoje ("12 de 10").
  Emiti-los num transporte e não no outro quebraria a paridade.
- **Um mutante equivalente** segue declarado desde o 1.2 (`podeHospedar` na regra
  de tema).
- **Homologação visual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_1.4 — o briefing editorial

### §2 · o título encolheu, e é isso que o torna um título

Concatenar o eixo com três facetas produzia uma linha que ninguém lê inteira.
Duas facetas é o teto, e o recheio do cabeçalho — "no dia a dia" — não
atravessa: ele existe para dar corpo a um H2, não a um título.

```
ANTES:  Como cuidar de pele oleosa no dia a dia: controlar o brilho,
        escolher produtos e hidratação
DEPOIS: Como cuidar de pele oleosa: controlar o brilho e escolher produtos
```

### §3 · três linhas, três papéis

A versão anterior dizia a mesma coisa três vezes, cada uma mais longa. Agora:

- **Título** nomeia o que o artigo entrega.
- **Direção** explica a estratégia narrativa: o que abre, o que entra como
  contexto, o que o ArticleDNA obriga a cobrir, onde a dependência é dita.
- **Promessa** diz o que estará resolvido ao final — derivada das FUNÇÕES
  presentes na arquitetura, com teto de três resultados.

### §4 · ponto editorial, e o artefato de busca descartado

"Pele oleosa: o que pode ser" não é um ponto de pauta — é uma cauda longa de
SERP. Ela é **descartada** da lista, e a formulação original continua em "Ver
evidências". A pergunta de definição vira o substantivo que ela pede, com a
contração certa: "características **da** pele oleosa", não "de a".

### §5 · o pai precisa representar o território

Quando uma seção adota duas ou mais irmãs do mesmo tema, ela deixou de ser uma
necessidade: virou o BLOCO do artigo sobre aquele assunto. E aí o cabeçalho
dela mente — "O que causa acne?" com três filhas sobre acne diz que o bloco é
sobre causas, quando ele é sobre a relação inteira.

O guarda-chuva nasce com o nome do território e a necessidade original desce
para a primeira subseção, inteira:

```
H2 — Pele oleosa e acne
   H3 — Na prática, o que causa acne?
   H3 — O que explica a relação entre pele oleosa e acne?
   H3 — O que explica os tipos de acne?
   H3 — O que explica a acne hormonal?        ← MUST_COVER, sem virar eixo
```

**Dois detalhes que o runtime exigiu:** o rótulo usa a PALAVRA, não o radical
(senão o bloco se chamaria "pele oleosa e hidrat"), e o cabeçalho de uma causa
não pode herdar o template de aplicação ("Como surge a acne hormonal NO DIA A
DIA?" promete rotina e entrega explicação).

### §8 · um selo para a força

A seção exibia "✓ Evidência suficiente" e "Evidência moderada" lado a lado —
dois selos sobre a mesma pergunta. Agora a força tem uma apresentação só, e as
dependências (fonte, especialista) são selos separados porque são acionáveis.

### §9 · o que flutuava

"Amostra competitiva parcial" aparecia solta ao lado de "Zerar investigação",
depois do briefing inteiro, sem dizer a que se referia — era a manchete de
suficiência virando dica da ação finalizada. E a telemetria da coleta (keywords,
consultas, referências, páginas comparáveis, intenção, suficiência) ABRIA a
área, antes do artigo-modelo. As duas desceram para a evidência competitiva.

### DECLARADO — dois mutantes equivalentes

- **1.1 M4** e **1.2 M9** — ambos na regra de tema. Com o anfitrião escolhido
  pelo menor rank e o guarda-chuva adotando o bloco inteiro, nem a checagem de
  compatibilidade nem o critério de desempate mudam a saída: foi verificado
  empiricamente que a arquitetura resultante é idêntica. As duas linhas ficam
  como invariante defensiva, com o comentário dizendo por quê. Não inventei
  teste para matar mutante equivalente.
- **Homologação visual** continua com o usuário.

## RADAR_EDITORIAL_BLUEPRINT_PROFILES_2 — o template canônico nos três perfis

### O achado que definiu o tamanho do gate

§4 e §14 pedem contratos `EditorialVideoModel` e `EditorialCommercialModel`. A
auditoria mostrou que o **blueprint canônico já os tem**: direções de título,
gancho com sinal declarado, blocos de roteiro, Shorts, aplicação no artigo,
ângulo comercial, bandas de preço, estrutura de comparação, saída recomendada.

O que faltava não era contrato — era a **camada de leitura**. A superfície
principal dos dois perfis continuava sendo a evidência ("38 vídeos, mediana,
percentis"; "o que a pesquisa encontrou") e o produto editorial vinha depois,
misturado com ela. §22 é explícito: se o campo existe, reusar.

Resultado: um módulo de projeção (`editorial-profile-model.ts`), um componente
de casca (`radar-profile-blueprint.tsx`), zero contrato paralelo.

### A casca, igual nos três

```
Blueprint principal        ← ABERTO, é o produto
[Enviar ao Planejador]     ← a mesma fronteira, uma para os três
▸ Evidência competitiva    ← o blueprint competitivo desceu para cá
▸ Amostra competitiva
▸ Proveniência
```

A FORMA muda e a gramática não: título de trabalho original, promessa, blocos
com o que cobrir, selos acionáveis, e o resto atrás de um clique.

### §8 · MUST_COVER nos perfis

O tópico declarado pelo ArticleDNA é **coberto**, e o lugar é decisão da
síntese: quando um bloco já o cobre, ele é marcado ali; quando nenhum cobre,
vira ponto de cobertura do primeiro. Nunca um bloco novo por decreto —
`MUST_COVER ≠ MUST_VIDEO_BLOCK`.

### §15 a §18 · o que a Amazon NÃO pode afirmar

A coleta da prateleira não traz texto de avaliação, benefício de PDP, objeção
nem ficha de marca. A forma de obedecer não é lembrar de não escrever: é **não
ter de onde tirar**. Tudo no modelo comercial vem de `recommended`, que já nasce
com `sourceSignal`, e as limitações sobem para a leitura — não ficam de rodapé.

- **§16** · preço observado tem data e amostra e vive na evidência; o que o
  modelo recomenda é BANDA. Recomendar o valor exato transformaria a fotografia
  de uma terça-feira em regra editorial.
- **§17** · nota, volume, Amazon Choice e posição são **reputação e sinais de
  compra** — chamar de "opinião dos compradores" faria o Redator escrever elogio
  que ninguém disse.
- **§18** · um ASIN em três placements continua sendo um produto.

### §23 · a telemetria que não atravessa

Uma varredura de FORMA — contagem, mediana, percentil, rank, ASIN, id de coleta
— recusa qualquer texto com essa cara antes que ele chegue à leitura principal.
Um campo novo com o mesmo defeito cai nela sem precisar ser previsto.

### O teste que a arquitetura já tinha

O Gate 18.6 pegou o módulo novo lendo `article.mainIntent` direto em vez da
autoridade de intenção. Era exatamente o defeito que ele foi escrito para
impedir — e ele o pegou antes de qualquer tela.

### DECLARADO

- **O template do Google não foi tocado** — e um teste afirma isso, junto com a
  exigência de que os perfis REUSEM os ajudantes editoriais em vez de copiá-los.
- **Nenhuma coleta, nenhum contrato novo, nenhuma migration.** O handoff
  continua sendo o existente.
- **Homologação visual do YouTube e da Amazon** continua com o usuário, e
  `RADAR_GOVERNANCE_CLOSE` continua depois dela.

## RADAR_EDITORIAL_BLUEPRINT_PROFILES_2.1 — YouTube final polish + Amazon runtime unblock

**O diagnóstico de abertura estava errado, e isso importa.** O gate abriu dizendo
que a Amazon mandava `pt-BR` — a grafia do YouTube — e que faltava traduzir para
`pt_BR`. A tradução já existia, já era usada e já era conferida no adapter desde
o AMAZON_SEARCH_1.

O que a auditoria encontrou: `DATAFORSEO_LANGUAGE_CODE` não está definida, a
configuração canônica cai no padrão `"pt"` (`dataforseo-serp-core.ts:13`) e a
autoridade devolveu `"pt"` fazendo exatamente o que documenta — não inventar um
país que ninguém pediu. O Google aceita `pt`. O YouTube aceita `pt`. A Merchant
API recusa, e a recusa volta como `40501 · Invalid Field: 'language_code'`.

A região não era palpite: estava no `location_code` do mesmo pedido. A autoridade
ganhou `radarMerchantAmazonLocale(locale, locationCode)`, que completa a região a
partir do mercado declarado e ERRA antes da rede num mercado não mapeado.

**A contradição do YouTube** — "3 consultas · 38 vídeos · Finalizado" e "SERP do
YouTube · não coletada" na mesma tela — era a mesma classe de defeito do 1.3:
`compactRadarResearchForRead` zera as corridas depois do freeze, e o pacote lia
`analysis.youtubeSearch` direto. FROZEN > LIVE > TRANSPORTE passou a valer também
aqui (`radarResearchPrimaryCollection`), e `radarResearchPlanOfAnalysis` deixou de
perder a fonte pelo mesmo motivo — inclusive a Amazon, que nunca esteve na lista.

**O roteiro deixou de ser template.** "Skin care noturno: gancho e abertura"
nascia de montar o título com os nomes ESTRUTURAIS dos dois primeiros blocos.
Título, promessa, gancho e blocos passaram a sair das necessidades editoriais
(ArticleDNA + apoio do Google); o nome estrutural virou o PAPEL, que já tinha
campo próprio. O gancho do blueprint é preservado quando já é executável e
substituído quando é comentário sobre a SERP — a justificativa continua inteira
na evidência.

**Não declarado como feito:** a chamada real da Amazon (§7/§34) não foi executada.
É chamada paga a provider e homologação de fluxo real, que é do usuário.

TESTS = tests/radar-editorial-profiles-21.test.mts · 21 pass / 0 fail
MUTANTS = 23 · mortos 23 · verde antes e no fim: sim
REGRESSÃO = test:radar 1989 pass / 0 fail · tsc limpo · eslint 0 erros nos arquivos tocados

## AMAZON_EDITORIAL_TARGET_1 — intent + target + resolução de produto

**O runtime (§2) já tinha sido corrigido no PROFILES_2.1**, e o diagnóstico de
abertura dos dois gates estava errado do mesmo jeito: a Amazon não mandava
`pt-BR`. `DATAFORSEO_LANGUAGE_CODE` não está definida, a configuração canônica
cai no padrão `"pt"` (`dataforseo-serp-core.ts:13`) e a Merchant API recusa o
idioma sem região. A região vem do `location_code` do próprio pedido, via
`radarMerchantAmazonLocale`.

**O que este gate acrescentou.** `skin care nivea` cabe num review de um creme,
num Nivea contra Neutrogena, num top 10 de óleos e num guia de compra. Usar só a
keyword fazia a Amazon pesquisar uma prateleira sem saber qual objeto editorial
estava sendo avaliado — e a pessoa pagava a coleta para descobrir depois.

Dois contratos NOVOS e SEPARADOS, em `lib/radar/amazon-editorial-target.ts`:
`AmazonEditorialIntent` (o que produzir, 8 tipos) e `AmazonResearchTarget` (quais
produtos). Separados porque não se derivam um do outro: um `TOP_BEST` e um
`PRODUCT_COMPARISON` podem investigar os mesmos cinco produtos e produzir artigos
completamente diferentes.

**§23 e §25 são o coração.** "Top 10" não é `universe.slice(0, 10)` — a posição
orgânica da Amazon mede relevância comercial, não veredito editorial, e o slot
patrocinado mede quem pagou. "Custo-benefício" não é preço ascendente — sem
reputação do outro lado da divisão, o artigo recomendaria o item de R$ 12 com
nota 2,8. `amazon-candidate-selection.ts` pondera por critério declarado, tira
sinal ausente da conta em vez de zerá-lo, e diz quando a evidência NÃO sustenta a
palavra "melhores" (aí a recomendação vira "opções em destaque para comparar").

**ArticleDNA intacto:** o alvo vive no payload da análise do Radar
(`editorial_artifact_versions`, jsonb) — MIGRATIONS = 0, verificado por CLI.

**Não declarado como feito:** o smoke real (§34) não foi executado. É chamada
paga a provider e homologação de fluxo real, que é do usuário.

TESTS = tests/radar-amazon-editorial-target-1.test.mts · 25 pass / 0 fail (A–X)
MUTANTS = 27 · mortos 27 · verde antes e no fim: sim
REGRESSÃO = test:radar 2014 pass / 0 fail · tsc limpo · eslint 0 erros

## AMAZON_EDITORIAL_TARGET_1.1 — elegibilidade, shortlist e conserto do apoio Google

**As duas coletas reais provaram os dois defeitos.** Lidas do banco por CLI, sem
repetir chamada paga:

- `TOP_VALUE · "Serum Nivea" · 59 produtos` trazia Dove Sérum, Garnier Sérum, La
  Roche, Eucerin, Neutrogena — e Nivea creme de mãos, tônico facial e hidratante
  labial. O ranking de custo-benefício rodava sobre os 59.
- `TOP_BEST · "Nivea" · 56 produtos` misturava sabonete íntimo, hidratante
  labial, creme de mãos e sérum antissinais, prometendo "os 4 melhores".

**Três camadas, três nomes.** `RAW_UNIVERSE` (evidência, intacta) →
`ELIGIBLE_CANDIDATES` (compatível com o alvo) → `EDITORIAL_SHORTLIST` (o que
entra no artigo). Com a fixture real: **59 → 9 → 6**. A identidade
`rawUniverse === comparableProducts` era o gate inteiro.

`productClass` e `brandFilter` entraram no alvo porque um campo livre de consulta
não define universo comparável: buscar amplo e comparar estreito são decisões
diferentes. TOP_BEST/TOP_VALUE/BEST_FOR_USE_CASE passam a exigir o tipo de
produto — marca sozinha devolve `CONFIG_NEEDS_PRODUCT_CLASS`. Quem quer
brand-wide tem `BRAND_LINE_REVIEW`, que não promete ranking.

**O apoio do Google (§20) era pior do que "falhou".** `collectRadarGoogleSupport`
montava `snapshot: { query, resultCount }`, e o contrato exige um `SerpSnapshot`
do Arquiteto. O `parse` estourava TRÊS LINHAS DEPOIS da chamada paga e do
registro de uso — a SERP era coletada, cobrada e descartada, e o retry pagava de
novo. O erro real, lido do banco: `snapshot.schemaVersion Invalid input: expected
1`. A função correta existia dentro de `app/api/editorial/serp/route.ts`, sem
export; virou `lib/radar/serp-snapshot-summary.ts` e os dois caminhos a usam.

**Não declarado como feito:** nenhuma coleta nova foi executada (§1 e §30).

TESTS = tests/radar-amazon-editorial-target-11.test.mts · 18 pass / 0 fail
FIXTURE = tests/fixtures/radar-amazon-runs-reais.json (59 e 56, coletas reais)
MUTANTS = 24 · mortos 24 · verde antes e no fim: sim
REGRESSÃO = test:radar 2032 pass / 0 fail · tsc limpo · eslint 0 erros

## AMAZON_PROMOTION_LINK_PLAN_1 — plano de links de produto

**A autoridade é a shortlist, e isso é o addendum inteiro.** Gerar link do
universo bruto produziria 59 endereços de afiliado num artigo que apresenta 6
produtos — 53 deles apontando para coisas que o texto não menciona. Com a coleta
real: **59 observados → 9 compatíveis → 6 links**.

**A URL limpa é construída, não podada.** Cada produto da coleta real veio com
~700 caracteres de rastreamento de busca (`ref=sr_1_7?crid=…&dib=…&qid=…&sr=8-7`),
e 12 dos 59 nem são URLs de produto — são `sspa/click`, o redirecionador de
anúncio. Publicar isso amarraria o link do artigo à sessão que o encontrou: `qid`
é um timestamp e `sr=8-7` é a posição daquele dia. Como o ASIN já é a identidade
canônica, a URL é montada — `https://{host observado}/dp/{ASIN}` — em vez de
limpa parâmetro a parâmetro, o que exigiria saber quais são inócuos amanhã.

**O Radar não cria link de afiliado.** Ele guarda `amazonUrl` normal,
`affiliateReady: true` e `relPolicy: "sponsored nofollow"`. O Redator troca o
endereço; o ASIN atravessa a troca intacto, e é isso que torna a substituição
segura. Nenhuma tag mora no Radar.

O teto por forma existe onde a FORMA tem limite próprio: review 1, X vs Y 2, guia
de compra até 5. Os demais seguem a shortlist. O handoff v3 passou a carregar
`affiliateDisclosureRequired` — o Radar não redige o aviso nem escolhe a posição,
mas quem recebe o pacote precisa saber que ele será necessário.

TESTS = tests/radar-amazon-promotion-links-1.test.mts · 14 pass / 0 fail (A–K)
MUTANTS = 18 · mortos 18 · verde antes e no fim: sim
REGRESSÃO = test:radar 2046 pass / 0 fail · tsc limpo · eslint 0 erros

## AMAZON_EDITORIAL_TARGET_1.2 — fidelidade de intenção e polimento do blueprint

**O mesmo defeito, pela terceira vez.** `amazon-editorial.ts` gera INSTRUÇÕES —
`Incluir a coluna "Faixa de preço" na comparação.`, `Reservar seção comercial
explícita` — e o modelo comercial as colava como H2 do artigo e como faceta do
título, produzindo literalmente:

    Sérum nivea: incluir a coluna "faixa de preço" na comparação

É a mesma classe que o Google fechou no 1.1 (telemetria como Objetivo) e o
YouTube no 2.1 (nome de bloco no título): mostrar a engenharia da decisão no
lugar do produto dela. O critério virou metadado (`comparisonCriteria`), as
seções passaram a vir da INTENÇÃO (§11), e a instrução virou o OBJETIVO do bloco
— o campo onde instrução cabe.

**§7 · a análise não troca a forma do artigo.** `recommendedOutputs` vem da
leitura da prateleira, que não sabe qual artigo a pessoa pediu. Quando discorda,
manda a intenção declarada: um TOP_BEST não vira COMPARISON em silêncio.
`originalEditorialIntent` é congelado com a fotografia.

**§8 · a promessa recua, a forma não.** Sem reputação na maioria dos
selecionados, "os melhores" não é defensável e o título diz "para comparar" — e
o `editorialOutput` continua TOP_BEST.

**§5 · o servidor recusa.** ANALYZE de um ranking com zero candidatos
compatíveis para antes de gravar; sem isso o blueprint ficaria com a mesma
aparência de um completo, pronto para FINALIZE.

**§14 · o painel legado mentia por construção.** "O que esta pesquisa reuniu" lê
contadores do PIPELINE do Google — canônicas, auxiliares, referências curadas —
que são zero num perfil Amazon, onde o Google entra como apoio (uma consulta, sem
curadoria). A tela dizia "0 consultas · 0 referências" dentro da evidência de uma
investigação cujo apoio tinha acabado de funcionar. O bloco passou a ler TRABALHO
REALIZADO, não perfil.

**Um mutante revelou código morto:** o guarda contra gerar links sobre ranking
bloqueado era redundante — o plano nasce da shortlist, e BLOCKED só existe quando
ela está vazia. Removido em vez de protegido por teste.

TESTS = tests/radar-amazon-editorial-target-12.test.mts · 17 pass / 0 fail (A–J)
MUTANTS = 17 · mortos 17 · verde antes e no fim: sim
REGRESSÃO = test:radar 2063 pass / 0 fail · tsc limpo · eslint 0 erros

## AMAZON_BLUEPRINT_SURFACE_1.3 — a hierarquia da tela

A aba abria com "O que a pesquisa encontrou": quatro cards de evidência, as
recomendações derivadas da coleta e as buscas relacionadas — tudo aberto, tudo
ANTES do blueprint comercial. É o mesmo defeito que o Google fechou no
EDITORIAL_BLUEPRINT_1 e o YouTube no PROFILES_2.1: a evidência ocupando, como
superfície principal, o lugar do que se vai produzir.

Tudo desceu para `▸ Ver evidência competitiva`, junto do blueprint competitivo
antigo e dos painéis legados. **Nada foi removido** (§10).

**Um detalhe que a movimentação revelou:** a porta de evidência tinha uma
condição só de ANÁLISE. Com os cards soltos acima isso não importava — eles
apareciam por conta própria. Movidos para dentro, herdariam a condição e
sumiriam numa coleta ainda não analisada, que é justamente quando se quer olhar
a prateleira. A porta passou a abrir quando há o que mostrar.

**E o teste pegou uma violação de §8 que eu não tinha visto:** a amostra da
Amazon carregava `open={projecao.sampleDefaultExpanded && !analisado}`, herdado
do YouTube — onde os vídeos SÃO o trabalho, porque é neles que se cura. Na
Amazon não há curadoria por produto, e 59 cards abertos empurravam o blueprint
para fora da tela. Agora nasce fechada sempre, e três testes antigos passaram a
afirmar a condição mais forte (ausência do atributo).

§11 · um ranking sem candidato compatível deixou de atravessar a fronteira do
Planejador — a recusa do ANALYZE (1.2 · §5) impede a gravação; esta impede o
envio de algo que tenha escapado por outro caminho.

TESTS = tests/radar-amazon-blueprint-surface-13.test.mts · 10 pass / 0 fail
MUTANTS = 13 · mortos 13 · verde antes e no fim: sim
REGRESSÃO = test:radar 2073 pass / 0 fail · tsc limpo · eslint 0 erros

## RADAR_PORTABLE_EXPORT_1 — o dossiê sai do produto sem sair da autoridade

O Radar terminava fechado em si: tudo que a investigação apurou — ArticleDNA
canônico, dossiê de evidência, artigo-modelo, blueprint do perfil — só existia
dentro da tela e do envio ao Planejador. Quem quisesse escrever com outro modelo
de linguagem, fora do monólito, não tinha por onde levar isso.

O export entrega uma LINHA POR ARTIGO em CSV (RFC 4180, todas as células
citadas, CRLF, UTF-8 com BOM para o Excel não quebrar acento), com o
`writer_brief_md` pronto para colar e o `RADAR_EXTERNAL_WRITER_PROMPT` apontando
para ele — sem duplicar o conteúdo, para não existirem duas versões do briefing.

**A decisão que estrutura o gate: paridade ESTRUTURAL, não paridade afirmada.**
§16 exige que o dossiê exportado e o entregue ao Planejador tenham a mesma
identidade e o mesmo hash. Havia duas formas: escrever um teste que compara as
duas saídas, ou fazer as duas saírem do MESMO código. A segunda não pode falhar.
Um teste de paridade prova que hoje coincidem; um caminho único faz com que não
exista "os dois". `resolveRadarCanonicalDossier` virou módulo, e o envio passou a
chamá-lo em vez de refazer a cadeia blueprint → bundle → readiness por conta
própria. Um `observedAt` diferente já bastaria para o hash divergir, e ninguém
descobriria até um artigo chegar ao Redator com evidência de outra rodada.

**Recusa por artigo, nunca pelo lote:** a resolução devolve CÓDIGO em vez de
lançar. O artigo 7 de 100 sem investigação finalizada fica de fora com motivo, e
os outros 99 saem no arquivo. Um mutante que trocava a recusa por `throw`
confirmou que o lote inteiro cairia.

**PROVIDER_CALLS = 0 por construção:** cada artigo é leitura do que já foi pago
e congelado. Cem artigos custam cem leituras de estado.

**Dois sobreviventes viraram teste, e uma âncora mentiu.** O mutante que reduzia
as colunas às da primeira linha sobrevivia porque nenhum teste exportava um lote
com perfis diferentes — um lote Google + Amazon perde as colunas comerciais se o
Google vier primeiro. O mutante que devolvia o relógio ao envio sobrevivia
porque o teste de §16 olhava o resultado, não o caminho. A âncora do BOM não
casava porque o BOM está no arquivo como CARACTERE, não como escape escrito.

**A limpeza que o lint pegou:** quatro imports do envio ficaram órfãos quando a
cadeia saiu de lá. Removidos — se o envio não resolve mais o dossiê, não deve
nem conseguir.

TESTS = tests/radar-portable-export-1.test.mts · 22 pass / 0 fail (A–S + §16/§18)
MUTANTS = 22 · mortos 22 · verde antes e no fim: sim
REGRESSÃO = test:radar 2095 pass / 0 fail · tsc limpo · eslint 0 erros

## RADAR_PORTABLE_EXPORT_1.1 — dossiê editorial, não dump de banco

O CSV do 1.0 era tecnicamente fiel ao domínio e inútil para escrever: 68
colunas, o payload inteiro do ArticleDNA por artigo, `bundle_id`, `bundle_hash`,
`article_dna_version_id`, `article_dna_content_hash`, e a mesma estrutura de
seções repetida em três colunas com nomes diferentes. Ele passava em todos os
testes porque os testes perguntavam se o dado estava lá — e não se alguém
conseguiria escrever com ele.

O contrato virou **28 colunas comuns + 3 comerciais**, quase todas Markdown
pronto para colar: radiografia competitiva, estratégia para superar a SERP,
estrutura recomendada, requisitos de SEO, links internos, evidência e fontes,
plano visual, plano comercial, limitações e o brief. Quatro JSONs sobraram, e
todos são apoio de automação — nenhum é o produto.

**O defeito mais caro estava escondido atrás de uma coluna vazia.** Artigos do
Google exportavam `suggested_title`, `promise`, `sections` e `blueprint_json`
VAZIOS ao lado de uma tela que mostrava o Blueprint editorial inteiro. A causa
não era o export: `RadarCompetitiveObservedModel` só era construído dentro de
`radar-page.tsx`, então toda resolução de servidor recebia
`googleObserved: undefined` e devolvia `blueprint: null`. O adapter sempre fez
a coisa certa com a entrada errada. `radarGoogleReadModelOfAnalysis` passou a
executar a MESMA passagem do domínio no servidor, e devolve a vista inteira —
observed, blueprint e artigo-modelo — em vez de deixar a rota remontar cada
peça. A rota remontava o artigo-modelo com um argumento a mais no builder do
blueprint do que a tela usa, e um argumento a mais basta para duas leituras da
mesma investigação divergirem sem ninguém notar.

**A tautologia era do dado, e a trava é do read model.** "Skin care noturno:
skin care noturno" e "Ao final, o espectador sabe skin care noturno." saíram do
builder canônico quando um tópico do ArticleDNA é a própria keyword. §24 proíbe
mexer no builder — e proíbe com razão. `radarPortableUsableStatement` mede o
NÚCLEO INFORMATIVO da frase: o que sobra depois de tirar a moldura do template
e a keyword. Núcleo vazio não atravessa, o título cai para a próxima direção
utilizável, e quando não há nenhuma o brief DIZ que falta título em vez de
entregar moldura com cara de direção.

**A Amazon ganhou uma trava de coerência.** A fotografia congelada guarda as
conclusões, não o universo — então a shortlist precisa ser recalculada sobre a
corrida gravada. Se a configuração mudou depois do congelamento, a corrida
descreve outra investigação, e recalcular sobre ela colocaria produtos de um
alvo ao lado de um blueprint de outro. A assinatura da configuração material
responde isso, e quando ela não bate a lista sai vazia — porque vazia é a
verdade sobre o que pode ser afirmado.

**Dois sobreviventes revelaram testes que olhavam para o lugar errado.** O
mutante que esvaziava a radiografia sobrevivia porque o teste contava seções, e
as seções que vêm da RECOMENDAÇÃO sobreviveriam a uma radiografia sem leitura
nenhuma da amostra. O mutante que devolvia ids internos à evidência sobrevivia
porque só o perfil Google era conferido, e o Google não tem sinais derivados.

**Em aberto, e é do usuário decidir:** `sendRadarToPlanner` continua chamando
`resolveRadarCanonicalDossier` SEM a fotografia do Google, porque §24 põe o
handoff fora deste gate. O efeito é que um artigo Google entregue ao Planejador
ainda chega com `competitiveBlueprint: null` e `observed: null`, enquanto o
mesmo artigo exportado chega completo. O parâmetro já existe e é opcional; o
que falta é uma porta de snapshots no serviço de envio.

TESTS = tests/radar-portable-export-11.test.mts · 27 pass / 0 fail
        tests/radar-portable-export-1.test.mts · 17 pass / 0 fail (transporte e autoridade)
MUTANTS = 26 · mortos 26 · verde antes e no fim: sim
REGRESSÃO = test:radar 2117 pass / 0 fail · tsc limpo · eslint 0 erros

## RADAR_PORTABLE_EXPORT_1.2 + 1.2A — contexto completo de escrita

O 1.1 entregou a SÍNTESE: radiografia, estratégia, estrutura, brief. Quem
escrevia, ao topar com uma afirmação que não entendeu, não tinha para onde
olhar — a evidência que a sustentava tinha ficado no banco. O 1.2 acrescenta o
EVIDENCE PACK, e §1 é explícito: não se escolhe entre resumo e evidência.

O contrato foi de **28 para 52 colunas** no perfil comercial — 20 de Markdown e
17 de JSON. O teto de 30 do 1.1 caiu por decisão, não por descuido: ele existia
para cortar identidade técnica e DTO repetido, e cumpriu a função. O que cresceu
agora é evidência normalizada, e evidência não cabe numa síntese. A regra que
ficou é a mesma: cada coluna serve para ESCREVER ou para AUTOMATIZAR.

**Duas camadas do dossiê, e a diferença entre elas é guardada por teste.**
`writer_brief_md` é a decisão editorial condensada; `writer_context_md` é a
célula que se cola inteira em outra IA — identidade da página, metadados SEO,
ArticleDNA, DNA das keywords, blueprint, radiografia, evidência, evidência por
seção, fontes, links, plano visual, vídeos, especialista, comercial, limitações
e o que não pode ser afirmado. Um mutante que fazia o brief crescer até o
tamanho do contexto morre: seria o 1.1 desfeito sem ninguém perceber.

**Duas camadas que o dossiê nunca tinha carregado.** `bundle.video` e
`bundle.specialist` existem no contrato desde o Gate 16 e sempre chegaram
`null`: `buildRadarVideoEvidenceLayer` e `buildRadarSpecialistEvidenceLayer` não
tinham chamador de produção nenhum. A biblioteca de vídeos e as contribuições do
especialista só eram montadas dentro do React. `radar-portable-annexes.ts` passou
a lê-las das autoridades delas — o casamento gravado e a decisão humana gravada
— e a filtrar a privacidade na ORIGEM: `expertId`, `contributionId`,
`externalUpdateId`, `gs://` e checksum não são projetados, e um mutante que os
devolve à projeção morre.

**O defeito que o casamento por igualdade literal escondia.** A pauta de vídeo
guarda o título da seção COMO ELE ERA no congelamento — "Rotina de cuidados para
pele oleosa". O artigo-modelo reformula o cabeçalho para não copiar concorrente,
e vira "O que considerar sobre rotina de cuidados para pele oleosa?". Casar por
igualdade perdia TODO trecho de vídeo, em silêncio, com a seção declarando que
não há apoio audiovisual exatamente onde ele existe. O casamento passou a ser por
palavra de conteúdo — e exige uma palavra que DISTINGA: "pele oleosa" está em
todo cabeçalho deste artigo, e casar por ele penduraria qualquer contribuição na
primeira seção.

**O que o addendum NÃO produziu, e por quê.** `seoTitle`, `metaDescription`,
Open Graph, Twitter, `robots` e schema saem `null` com o nome deles listados em
`notDefinedAtThisStage`. Eles são decisão do Planejador e do Redator; preenchê-los
aqui faria a decisão chegar lá já tomada. O que o Radar tem — o H1 editorial, a
direção de titulação e o que a meta description precisa refletir — sai ao lado,
identificado como direção. §3 do addendum pede exatamente essa distinção, e um
mutante que colapsa H1 e SEO title morre.

**O plano visual é derivado, e cada imagem declara de onde veio.** Uma capa e
dois a três respiros, FAQ fora. A função de cada respiro sai da função editorial
da seção — DEFINIÇÃO pede identificação, EXPLICAÇÃO pede o mecanismo, APLICAÇÃO
pede a ordem, SELEÇÃO pede comparação —, e `evidenceBasis` diz se a necessidade
foi observada na amostra ou se é padrão do projeto. Sem estrutura editorial não
há plano: a ausência é declarada, não preenchida com "imagem genérica".

**Uma regra da casa quase foi quebrada sem querer:** `radarPortableKeywordsDna`
lia `normalizedIntent` direto, e o censo do Gate 18.6 pegou. A leitura passou
para `radarDeclaredKeywordIntent`, e o sentinela `unknown` deixou de vencer uma
qualificação semântica que já tinha concluído — que é o defeito original daquele
gate, reaparecendo num arquivo novo.

**Em aberto, e continua sendo do usuário:** `sendRadarToPlanner` continua sem a
fotografia do Google e sem os anexos. O export lê as três camadas; o handoff não.
O parâmetro já é opcional e os leitores existem; falta autorizar o toque no envio.

TESTS = tests/radar-portable-export-12.test.mts · 27 pass / 0 fail
        tests/radar-portable-export-11.test.mts · 27 pass / 0 fail
        tests/radar-portable-export-1.test.mts · 17 pass / 0 fail
MUTANTS = 27 · mortos 27 · verde antes e no fim: sim
REGRESSÃO = test:radar 2144 pass / 0 fail · tsc limpo · eslint 0 erros

## RADAR_CANONICAL_DOSSIER_PARITY_1 — o Planejador recebe o que o CSV levava

O export portátil tinha aprendido a ler a fotografia do pipeline do Google, a
biblioteca de vídeos e as contribuições do especialista. O envio ao Planejador
não. O mesmo artigo saía **completo num CSV que vai para FORA da plataforma** e
**incompleto no pacote que alimenta o módulo seguinte DELA**.

Pior do que a assimetria: o export tinha virado uma SEGUNDA AUTORIDADE. Ele
normalizava a resposta do especialista num formato só dele, e a partir dali
existiriam duas verdades sobre a mesma contribuição.

A ordem canônica ficou:

    autoridades do Radar
           ↓
    loadRadarCanonicalAuthorities   (I/O — uma vez)
           ↓
    resolveRadarCanonicalDossier    (puro — uma vez)
           ↓
      ├── sendRadarToPlanner   → grava o bundle V3
      └── portable export      → projeta Markdown e CSV

**Nenhum contrato novo foi preciso (§10).** `bundle.video` e `bundle.specialist`
são campos do V3 desde o Gate 16 e sempre chegaram nulos, porque
`buildRadarVideoEvidenceLayer` e `buildRadarSpecialistEvidenceLayer` não tinham
chamador de produção nenhum. Não faltava contrato: faltava alguém montar o que o
contrato já esperava.

**A privacidade passou a ser filtrada na ORIGEM.** `externalUpdateId` (a mensagem
no Telegram), `originalAssetUri` (o `gs://` do áudio) e o checksum entram nulos
na camada canônica. Filtrá-los só na saída do CSV deixaria a próxima projeção
levá-los junto sem ninguém notar — e a camada agora alimenta duas saídas.

**A decisão de ausência virou função pura.** `radarVideoLayerIsWorthDelivering` e
`radarSpecialistLayerIsWorthDelivering` decidem se existe evidência a entregar.
A distinção que elas guardam: uma camada com `items: []` e `notApproved: 3` diz
"houve resposta e ninguém decidiu" — informação de planejamento. Tudo zerado diz
"não houve", e aí `null`. Enquanto a regra vivia dentro do leitor de banco, só
era testável com stub de I/O, e regra escondida atrás de I/O é regra que ninguém
protege — dois mutantes sobreviveram exatamente por isso antes da extração.

**§6 · a alcançabilidade é por rótulo, e é deliberado.** O id do candidato é um
hash de `conceptId|rótulo` calculado dentro do blueprint editorial. Recalculá-lo
no resolvedor duplicaria a fórmula, que é a primeira coisa a divergir. O que
atravessa os dois lados é o `observedLabel`, que é o rótulo canônico do
conceito — e o conceito está dentro de `bundle.observed`, que é exatamente o que
o Planejador recebe.

**§8 · o DNA das keywords atravessa POR REFERÊNCIA.** Volume, KGR, intenção e
contribuição estratégica vivem no ArticleDNA, que o dossiê identifica por versão
e hash. Copiá-los para o bundle duplicaria o Minerador dentro do handoff.

**Em aberto, declarado e não resolvido:** o TEXTO da keyword principal só é
alcançável no bundle para o perfil GOOGLE (`observed.identity.principal`). Para
YouTube e Amazon ele chega ao Planejador pelo `PlannerItem` (título e slug do
artigo), que não é a keyword. Fechar isso exigiria campo novo no V3 — e §10 manda
PARAR e declarar antes de criar contrato. Está declarado.

TESTS = tests/radar-canonical-dossier-parity-1.test.mts · 16 pass / 0 fail
MUTANTS = 19 · mortos 19 · verde antes e no fim: sim
REGRESSÃO = test:radar 2160 pass / 0 fail · tsc limpo · eslint 0 erros

## RADAR_CANONICAL_KEYWORD_CONTEXT_1 — a keyword chega aos três perfis

O texto da keyword principal só era alcançável no dossiê por
`observed.identity.principal`, que é da fotografia do pipeline do Google. Num
artigo de vídeo ou de produto aquele campo nunca existiu, e o Planejador ficava
com o título e o slug — nenhum dos dois é a keyword. "Skincare para pele oleosa"
vira o slug `cuidados-pele-oleosa` e o título "Como cuidar da pele oleosa no dia
a dia": três textos, um fundamento. Planejar pelo título é planejar pela
formulação de quem escreveu o título.

`bundle.keywordContext` é **aditivo e opcional** — o contrato continua V3 (§1).
A chave ausente não entra na serialização canônica, então todo dossiê gravado
antes deste gate continua íntegro com o hash que já tinha.

**Onde a autoridade realmente mora, dito com precisão.** O PAPEL de cada keyword
— principal, secundária, reforço narrativo — é declaração do ArticleDNA
(`keywordReferences[].role`). O TEXTO **não está** no payload do ArticleDNA: nem
`KeywordDNA` nem `ArticleKeywordReference` têm campo de texto. Ele vive na
HIDRATAÇÃO, capturada no import do Arquiteto e amarrada ao mesmo
`articleDnaVersionId`. `RadarArticleResearchContext` é quem junta os dois, e é
por isso que ele é a entrada da resolução — não o payload cru.

**A substituição mais tentadora, e a mais cara.** Quando a hidratação não trouxe
o texto da principal, existe uma secundária ali do lado, com texto, do mesmo
artigo. Promovê-la parece conserto e é a mesma falha do título e do slug com
outro nome: o Planejador planejaria para um termo de APOIO como se fosse o termo
que a formação qualificou. `null` é a resposta, e `resolution: UNRESOLVED` diz
por quê. Dois mutantes sobreviveram à primeira bateria exatamente aqui — a
bancada só tinha artigo com principal resolvida.

**A chave só é gravada quando resolve.** Um contexto vazio no bundle diria "a
composição foi lida e está vazia", quando a verdade é que a hidratação não
trouxe o texto. A ausência deixa o leitor de §5 resolver pelo fundamento — e
mantém intacto o hash de todo pacote que não tem keyword resolvida.

TESTS = tests/radar-canonical-keyword-context-1.test.mts · 12 pass / 0 fail
MUTANTS = 15 · mortos 15 · verde antes e no fim: sim
REGRESSÃO = test:radar 2172 pass / 0 fail · tsc limpo · eslint 0 erros

## Radar — Aplicar a listagem de workflow sem corridas — 2026-09-21

1. ~~Aplicar `20260921060000`~~ — **FEITA**, aplicada e registrada.
2. ~~Medir view contra tabela~~ — **FEITO**: 10 MB → 3400 kB, corte de
   **67,9%**, com as 3 versões correntes intactas e nenhuma versão perdida.

### FEITA — compactar também a corrente congelada

`20260921070000_listagem_workflow_compacta_congelada.sql`. A trava de escrita
foi tratada: a view marca `researchTransport: "COMPACT"` junto com a perda, e
só quando há perda. Um teste deriva da própria função TS quais campos ela
compacta e exige que o SQL trate exatamente esses, mais os dois casos de
borda — não congelada, e congelada sem nada a perder.

O texto abaixo explica por que o cuidado era necessário.


As 3 versões correntes estão CONGELADAS, e 1061 kB dos seus 2037 kB é
exatamente o que `compactRadarResearchForRead` descarta logo depois do
download. Levar isso para a view baixaria de 3400 kB para ~2340 kB.

**Não foi feito, e o motivo é uma trava de escrita.** A compactação marca
`researchTransport: "COMPACT"`, e `analysis-contracts.ts:869` recusa construir
uma versão nova a partir de base com essa marca — é o que impede uma escrita
nascer de leitura incompleta. Reproduzir isso no SQL exige a condição exata
do TS: compacta só se congelada E se houver corrida ou amostra a tirar, e
marca junto.

Errar para um lado recusa escrita legítima; para o outro, deixa uma escrita
nascer de base lossy. Precisa de decisão explícita antes de mexer.

### EM ABERTO — o resto do objeto de versão

Dos 10,45 MB, ~1,46 MB não estão nos quatro campos pesados nem na
compactação: estão no resto de cada objeto de versão. Vale medir por dentro
antes de decidir se compensa outra rodada.

## Radar — Corridas brutas em tabela própria (arrumação estrutural) — 2026-09-21

O crescimento do payload é decisão de esquema, e o próprio código já dizia
isso em `appendRadarAnalysis`: *"Isto NÃO resolve o crescimento do payload —
só para de pagar duas vezes por ele."* Esta é a decisão.

**O problema, medido:** a maior linha de `editorial_workflow_items` tem
8032 kB; a média das três de estágio `radar`, 3528 kB. As views
(`20260921060000`, `20260921070000`) resolveram a LISTAGEM. O caminho de
escrita continua intacto: `appendRadarAnalysis` lê a linha inteira,
acrescenta uma versão e regrava tudo — ~8 MB de descida mais ~8 MB de subida
por análise nova, crescendo a cada rodada.

**O desenho:** os quatro campos pesados de cada versão saem para
`radar_analysis_runs`. São os MESMOS que `pruneRadarAnalysisHistory` já
trata como descartáveis — não é critério novo. O contrato em TS não muda de
forma; a reidratação acontece na fronteira do repositório, e os ~20 módulos
que leem `amazonSearch` e companhia seguem sem alteração.

### ETAPA 1 — FEITA (a aplicar)

`20260921080000_corridas_radar_em_tabela_propria.sql` cria a tabela e nada
mais: nada escreve nela, nada lê dela. **Não muda comportamento.**

Junto vêm `lib/radar/analysis-run-storage.ts` (separar/reidratar, com a
mesma semântica de vazio da poda) e 5 testes, incluindo o que amarra a lista
de campos à da poda.

### ETAPA 2 — CONCLUÍDA em 2026-09-21

1. Script de preenchimento: copiar as corridas das versões existentes para a
   tabela, com readback conferindo que a fusão devolve a versão idêntica.
2. `appendRadarAnalysis`: separar na escrita — INSERT da corrida, e o payload
   do workflow recebe só a versão leve. **É aqui que está o ganho**: a leitura
   e a regravação passam de ~8 MB para ~1,4 MB.
3. `findByArticle`: reidratar TODAS as versões por padrão. Conservador de
   propósito — nenhum consumidor muda, e o custo dessa rota continua igual ao
   de hoje. Trocar por hidratação seletiva é etapa 3, rota a rota.
4. Só então esvaziar as corridas do payload das linhas existentes.

### ETAPA 3 — mais tarde

Hidratação seletiva por rota (cada uma sabe de qual versão precisa), o que
transforma o readback de operação de ~8 MB em ~1,4 MB mais uma corrida.

## Egress — pendências do Radar — 2026-09-23

Ver SDD de [uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md).

1. **E3 — Realtime e polling** (estrutural). A publicação `supabase_realtime`
   tem **zero tabelas**; o sinal vira "ao vivo" por falso positivo e, por
   acaso, mantém o polling desligado. Não consertar o sinal antes de baratear
   o disparo (R12): ligaria um poll de 3 a 10 s com o custo atual.
2. **E4 — export e envios** (~24 MB por ação, reidratação tripla) e **volta à
   aba** (~8,5 MB por `visibilitychange`, sem coalescer). Correção proposta
   recusada pelo revisor; precisa de desenho.
3. **Outros consumidores de `findByArticle`** que ainda reidratam tudo:
   rota `serp` (`serp/route.ts:66`), `radar-canonical-authorities.ts:282`,
   envio ao Planejador e ao Redator, `radar-primary-mode`, início de coleta
   YouTube/Amazon. Migrar rota a rota para os métodos novos.
4. **Guardas antigas mais fracas do que parecem:** as regex de prefixo
   `/new WorkflowRepository\(\)\.findByArticle/` em
   `radar-checkpoint-gates-3-7.test.mts:594` e
   `radar-r10-2d-ponte-multi-query.test.mts:350` também casam com os métodos
   novos. O teste novo fixa o método exato de cada rota, o que cobre a lacuna.
