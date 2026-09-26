# Estado atual — Redator

## MCP da plataforma — integração e fingerprint — 2026-09-26

- **Verificado no código local:** `/api/mcp/redator` expõe 31 ferramentas no
  transporte MCP: 14 do Redator e 17 operações de plataforma. Guia, catálogo,
  ferramentas e rotas são conferidos pelos testes do agente.
- **Alteração local desta revisão:** `/api/mcp/redator/health` inclui hash
  SHA-256 do catálogo, quantidade de tópicos e ferramentas catalogadas, para
  identificar a revisão implantada sem uma sessão autenticada.
- **Hash esperado no checkout validado:**
  `8600db73353959f2f015311fa3bfc7365372dff5424ad955a604bb6dee2f877e`;
  31 ferramentas catalogadas.
- **Confirmado por testes locais:** `test:redator:mcp` 117/117,
  `test:agent` 44/44, `test:mcp:runtime` 5/5, TypeScript e build de produção.
- **Verificado remotamente, somente leitura:** health, metadata do recurso e
  discovery OAuth retornam 200; inicialização anônima do MCP retorna 401 e
  aponta o metadata OAuth. A produção ainda mostra os identificadores legados
  (`minerador-key-redator-mcp`, `Minerador Key — Redator`) e não publica o hash
  do catálogo, portanto não está comprovado que o código local atual esteja
  implantado.
- **Pendente do usuário:** migration M9 (e M8 se ainda pendente), deploy,
  reconsentimento do Claude para escopos novos e chamada autenticada real. Isso
  ainda não comprova que Claude executou as ferramentas autorizadas.

## Assunto declarado nos fundamentos, no MCP e no Guardião (F4) — 2026-09-24

- **Fonte:** [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F4.1, F4.2 e F4.4. O Assunto é o tronco declarado pelo humano e fixado em `ArticleDNA.subject`. O Redator decide a estrutura final (invariante 48); o Guardião só avisa (Q6).
- **Verificado no código e confirmado por teste. Validado manualmente: NÃO.** Nenhum ArticleDNA real tem `subject` ainda: o comportamento só aparece quando o Arquiteto gravar o Assunto, na F2 fase B. **Sem Assunto, tudo byte a byte igual:** mesma projeção, mesma lista `writerMayNot` (mesma referência e mesmo hash sha256 `f5f59f87…`), Guardião igual, documento do envio igual ao do HEAD (snapshot sha `8b366688…`, medido com o `radar-import.ts` do HEAD em quatro variações), e fundamentos, briefing, material por seção e relatório do Guardião sem chave nova e sem consulta a mais. Na terceira rodada, também ficaram iguais aos do HEAD a projeção `radarFoundationsOf` (sha `104497fe9c85da5f`), o painel dos fundamentos (HTML renderizado, normal e compacto) e os prompts de roteiro e carrossel (sha `7b664c0588e00a4e`). A semeadura ganhou só um caminho na mesma consulta (2 B sem Assunto).
- **Três rodadas na mesma data.**
  - A primeira entregou o domínio: F4.1 nos fundamentos e F4.2 só no `runGuardian`.
  - A segunda levou a virada e a direção do H1 ao Redator, ligou o Guardião em produção e unificou `writerMayNot`. Uma revisão depois estreitou o egress e a exposição do `subject`.
  - A terceira levou o Assunto a quem redige pelo painel: o bloco do Assunto nos fundamentos, a mesma projeção para artigo, roteiro e carrossel, e o resumo do Guardião lido do servidor.

  Pedido do dono: o Assunto chega ao Redator validado, reforçado e com o contexto do YouTube e do especialista, e o artigo faz a virada.

  Situação:
  - Assunto, virada, direção do H1, destino e proibição chegam **pelo MCP, pela IA interna, pelo painel dos fundamentos e pela semeadura de roteiro e carrossel**.
  - O contexto do YouTube (consulta `DECLARED_SUBJECT`) e o do especialista (pauta do Assunto) seguem pelo dossiê de sempre, montado pela F3 no Radar, sem campo novo.
  - Nada disso foi visto com dado real.
- **F4.1 — fundamentos e MCP:**
  - `subject` em `WRITER_ARTICLE_DNA_FOUNDATION_FIELDS` (18 campos), lido pela mesma projeção por caminho (`a_subject:payload->subject`), validado inteiro por `DeclaredSubjectSchema` e **entregue reduzido a `{ phrase, note, destinationUrl }`** (`readWriterArticleProjection`, `lib/server/writer-evidence-sources.ts`): `keywordId`, `approvedPackageRef` e `attachedBy` não vão aos fundamentos, ao material nem ao pacote da IA; o objeto inteiro segue disponível na fatia `dna.article/<versionId>`. Ausente, não vira `null`;
  - teto `WRITER_ARTICLE_DNA_FOUNDATION_MAX_BYTES = 1_638`; com nota de 280 caracteres e destino longo, a projeção medida deu 1.571 B;
  - `writer-handoff`: `RADAR_WRITER_MAY_NOT_SUBJECT` ("trocar ou remover o Assunto declarado"), `radarWriterMayNotFor` e `radarWriterMayNotWithSubject` (remove duplicata);
  - MCP: a instrução manda fazer a virada da principal para o Assunto e levar ao destino, e aponta para `editorialContext` (fundamentos e `get_writer_brief`); as descrições de `get_writer_foundations` e `get_writer_brief` citam o Assunto e a sugestão do Radar. A ordem das ferramentas não mudou.
- **Virada e direção do H1 no Redator (segunda rodada):**
  - **não chegam pelo dossiê:** o bundle V3 (`.strict()`, com hash) não traz o artigo-modelo nem `blueprint.sections`, onde mora a seção sintética; por isso `WRITER_BUNDLE_KNOWN_PATHS` não lista `blueprint`. Dossiê e bundle não mudaram (invariante 78);
  - no envio, só com Assunto, `buildRadarDocument` grava em `importedContext.editorialContext` as linhas de `radarWriterSubjectTurnLines` (`lib/redator/radar-subject-turn.ts`): Tronco; Virada (onde virar, da principal ao Assunto, com o destino); Seção da virada (a sintética diz que o título é de trabalho do Radar e deve ser reescrito para o leitor; a observada diz "N de M página(s)"); Direção do H1, ou "Assunto em H2/H3 — o H1 é da principal.", ou `RADAR_WRITER_SUBJECT_H1_NO_SIGNAL`; Destino da chamada; Alerta do Radar;
  - origem: `authorities.google.articleModel.declaredSubject` e o `subject` do ArticleDNA fixado pela identidade do envio. A sugestão só vale se a frase do artigo-modelo for a mesma; sem fotografia do Google, ou com virada de outra frase, a linha diz "onde quem redige decidir (sem sinal na SERP)" e o H1 fica sem sinal, sem inventar lugar;
  - o texto é o mesmo do CSV "Para escrever" (teste linha a linha em três Assuntos). Diferença intencional: o destino vai como declarado, sem a limpeza de `utm_*` do CSV, porque é o endereço que o Guardião confere. Sem principal: "levar o leitor da keyword principal a …";
  - leitura: `get_writer_foundations` e o material por seção (que alimenta o pacote da IA interna) leem as linhas por `readWriterEditorialContext` (`WRITER_EDITORIAL_CONTEXT_SELECT = "c_editorialContext:payload->importedContext->editorialContext"`), um caminho, filtrado por `id` e `marca_id`, abaixo de 2 kB, **só quando o ArticleDNA fixado tem Assunto**. O cabeçalho comum (`WRITER_EVIDENCE_HEAD_SELECT`), o manifesto, as fatias do `read_writer_evidence` e as divergências ficaram como antes. `get_writer_brief` lê `r_editorialContext` no select que já fazia (`WRITER_BRIEF_SELECT`). A chave só aparece com lista não vazia.
- **`writerMayNot` unificado (segunda rodada):** com Assunto, a proibição é gravada no envio, no recibo (`lib/server/radar-writer-send.ts`) e no documento (`radarWriterDossierOf`), a partir do ArticleDNA da identidade (`radarWriterMayNotFor`). Em documentos enviados a partir de agora, fundamentos, material por seção, pacote, envelope do `read_writer_evidence` e briefing mostram a mesma lista.
- **F4.2 — Guardião ligado em produção (segunda rodada):** `runGuardian` com `context.subject = { phrase, destinationUrl }` emite dois avisos (`severity: "warning"`, `sectionId: "document"`), nunca bloqueio (`blockingCount` igual):
  - `coverage`: a frase inteira, ou todas as raízes dela no mesmo bloco (critério lexical do Radar, `radarSemanticStems`), não aparece em nenhum H2/H3 ou parágrafo. O H1 não conta;
  - `cta`: não há link para `destinationUrl` (texto, Markdown, `external_source` ou `internal_link`; ignora protocolo, `www`, fragmento e barra final);
  - leitura: `WRITER_GUARDIAN_SELECT` ganhou `g_articleDnaRef:payload->articleDnaRef` (~150 B) na mesma consulta; `readWriterGuardianContext(ctx, id, { articleDnaRef })` lê só `payload->subject` da versão fixada (`readWriterGuardianSubject`, pela `readWriterArticleProjection` com `["subject"]`), na Marca, abaixo de 1 kB. Referência ausente ou legada não gera leitura. Se a leitura falhar, sai `assunto_nao_lido (<código>)` em `notices`, sem vazar o driver, e o relatório segue sem os avisos do Assunto;
  - ligado no MCP (`get_writer_guardian`) e na rota do painel (`app/api/redator/guardian`, com `input.document.articleDnaRef` lido na Marca autorizada; referência de outra Marca não devolve nada);
  - `writer-publication-handoff` e `documents/route` seguem sem o Assunto de propósito: só usam `blockingCount`, e o Assunto nunca bloqueia (consumidores preservados);
  - o guarda "Fase 0 · o Guardião lê id, blocks e metadata numa consulta só" (`tests/redator-mcp-alvo-sem-payload.test.mts`) foi atualizado com a justificativa escrita no próprio teste.
- **Adendo técnico à SDD F4.1/F4.4 — proposto, aguarda aprovação do dono antes do commit (a SDD não foi editada):**
  - F4.1 dizia que a virada "chega pelo dossiê": chega por `importedContext.editorialContext`, gravado no envio a partir do artigo-modelo, fora do dossiê;
  - F4.4 dizia "nenhuma leitura nova": o Redator ganhou `g_articleDnaRef` (~150 B) e `payload->subject` (< 1 kB) no Guardião, `c_editorialContext` (< 2 kB, só com Assunto) nos fundamentos e no material, e `r_editorialContext` no briefing;
  - com Assunto, `writerMayNot` gravado ganha a proibição; nos fundamentos, `subject` sai reduzido.
  - terceira rodada: a semeadura de roteiro e carrossel lê `d_editorialContext:payload->importedContext->editorialContext` na mesma primeira consulta (2 B sem Assunto, < 2 kB com ele).
- **Painel, semeadura e Guardião do painel (terceira rodada). Verificado no código e confirmado por teste. Validado manualmente: NÃO** (nenhum ArticleDNA real tem `subject` ainda).
  - **Projeção única (invariante 78):**
    - `radarFoundationsOf` (`lib/redator/radar-foundations.ts`) lê `importedContext.editorialContext` do documento v2 com dossiê e o passa a `radarFoundationsOfDossier(dossier, { editorialContext })`. O segundo parâmetro é opcional.
    - A chave `editorialContext?: string[]` só é criada quando existe linha válida, e sempre no fim do objeto.
    - Sem Assunto, a projeção sai igual à do HEAD (sha `104497fe9c85da5f`, medido com uma cópia do código do HEAD fora do repositório e fixado em teste). Isso vale com a chave ausente, com `[]` e com lixo (`['']`, `[1, {}]`, string ou objeto).
    - Não há segunda projeção: painel, semeadura de roteiro e semeadura de carrossel leem a mesma.
  - **Leitura do Assunto para a tela:** `radarFoundationsSubjectOf(fundamentos)` é uma função pura. Ela separa as linhas pelos prefixos de `RADAR_WRITER_SUBJECT_LINE_PREFIXES`: frase, nota, virada, seção, H1, destino e alerta.
    - Linha desconhecida não some: vai para `others`, na ordem.
    - `sectionIsWorkingTitle` marca a seção sintética ("o título é de trabalho do Radar").
    - Sem a linha do tronco, a função devolve `null`. Assim, linhas antigas sem Assunto não aparecem como Assunto.
    - A linha do tronco não marca onde a frase acaba. Entre os travessões, vale o corte cuja frase a linha da Virada repete ("a <frase>." ou "a <frase>; destino: "). Sem Virada, ou sem casamento, vale o primeiro travessão.
  - **Painel** (`modules/redator/writer-radar-foundations-panel.tsx`, `WriterRadarFoundationsPanel`). Só com Assunto, o primeiro bloco depois do cabeçalho mostra:
    - "Assunto (tronco): <frase>" e a nota;
    - "Onde fazer a virada";
    - "Seção da virada". Se ela é sintética, aparece em `text-warning` o aviso "Esse título é de trabalho do Radar: reescreva-o para o leitor antes de usá-lo no artigo.";
    - "Direção do H1", "Destino da chamada" e "Alerta do Radar";
    - as linhas desconhecidas, numa lista;
    - a frase "Onde virar é sugestão do Radar; a decisão é de quem redige. …".

    O texto é 14px (`text-sm`), só com tokens existentes, e o guard visual estrito passa sem dívida. A cópia de listagem (sem bundle) também mostra o Assunto. Sem Assunto, o HTML do painel, normal e compacto, é igual ao do HEAD: os dois foram renderizados e comparados. O bloco ficou antes de "Keyword", e não depois, como o backlog planejava.
  - **Semeadura de roteiro e carrossel** (`lib/redator/deliverable-seed.ts`):
    - as linhas entram logo depois das keywords, sob `SEED_SUBJECT_SECTION_TITLE` ("Assunto (tronco) e virada — faça a virada da principal para o Assunto; onde virar é sugestão do Radar, a decisão é de quem redige; não troque nem remova o Assunto");
    - linhas sem tronco entram sob o cabeçalho neutro `SEED_EDITORIAL_CONTEXT_SECTION_TITLE`;
    - o prompt de sistema não mudou. Sem Assunto, os prompts de roteiro e carrossel são iguais aos do HEAD (sha `7b664c0588e00a4e`).
  - **Leitura da semeadura:**
    - a leitura estreita (`lib/redator/writer-document-reads.ts`) ganhou o caminho `d_editorialContext:payload->importedContext->editorialContext` na mesma primeira consulta;
    - o campo é validado pelo schema do dono (`ImportedRadarContextSchema.shape.editorialContext`). Uma lista fora do contrato torna o documento incompatível, como na leitura inteira;
    - `lib/server/writer-seed.ts` chama `radarFoundationsOfDossier(dossier, { editorialContext: head.editorialContext })`.
  - **Guardião no painel** (`components/editorial/professional-writer.tsx`, com o helper puro `lib/redator/guardian-panel-summary.ts`):
    - com relatório do servidor, o rótulo "Análise atual", as contagens de bloqueios e avisos e a cor vêm dele (`writerGuardianPanelSummary`), e não da prévia local, que não lê o Assunto. Com isso sai o "0 aviso(s)" que aparecia com os avisos listados logo abaixo;
    - os `notices` do servidor aparecem como frase (`writerGuardianNoticeText`), com o texto bruto no `title`. `assunto_nao_lido (...)` vira `WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE` ("Não foi possível ler o Assunto; a virada e o link para o destino não foram conferidos."). `migration_pendente:` e `divergencias_nao_lidas (X):` perdem o código;
    - sem relatório do servidor, o texto é o de antes: "Prévia local", as contagens locais e nenhum aviso;
    - o bloco do resumo passou a `text-sm` com tokens (`border-divider`, `text-danger`/`text-success`, `text-text-muted`, `text-warning`).
  - **Aprovação pelo painel:** `requestStatus` usa `writerGuardianApprovalBlockingCount`, o maior valor entre os bloqueios da prévia local e os do resumo exibido, com a mesma mensagem. Um bloqueio visto só pelo servidor também barra a aprovação.
    - Sem relatório do servidor, o número é o de antes.
    - `guardianReport` é zerado a cada edição e a cada troca de documento, então um relatório desatualizado não bloqueia.
  - **Dívida visual de `professional-writer.tsx`** (medida por `findVisualViolations`): HEAD 43, agora 41, e o teste trava em 41. O arquivo é LF (0 CRLF e 622 LF, contados com Node), e não CRLF.
  - **MCP:** não mudou nesta rodada. `get_writer_foundations` e o material por seção continuam somando `editorialContext` por fora de `radarFoundationsOfDossier` (ver a pendência abaixo).
- **Pendências (Planejado):**
  - resolvidas na terceira rodada: `radarFoundationsOf` e a semeadura leem `editorialContext`; o painel mostra o Assunto; o resumo do Guardião lê o relatório do servidor e mostra os `notices`. A homologação do gate F4 pelo painel já pode ser feita, depois da F2 fase B;
  - o MCP (`get_writer_foundations`) e o material por seção (`lib/server/writer-evidence-reader.ts`) somam `editorialContext` por fora de `radarFoundationsOfDossier`, com critério próprio: a presença vem do `subject` do ArticleDNA, e não da linha do tronco. Unificar muda o critério de presença e a leitura `readWriterEditorialContext` do contrato MCP, que tem goldens no `test:redator:mcp`. Fica para uma rodada própria, medida contra a base;
  - o resto do aside do Guardião continua em `text-[9px]` com `slate`/`amber`, abaixo do mínimo do sistema visual: título, botões e a lista "Achados por seção". Por isso os achados do Assunto (virada ausente, link ao destino ausente) aparecem em 9px. Subir só a lista deixaria o bloco inconsistente; fica para uma tarefa visual própria, que também baixa a dívida do arquivo;
  - quando a análise do servidor falha, o `catch` de `analyseGuardian` faz `setGuardianReport(localGuardian)`, e o painel mostra "Análise atual" com as contagens locais. É o comportamento de antes, agora explícito;
  - frase, nota e destino saem do texto das linhas, e não de campo estruturado: `{ phrase, note, destinationUrl }` não está em `radarFoundationsOf`. Um campo estruturado exigiria mudar o envio (`radar-import`);
  - sem `guardianReport`, o markup do resumo muda só nas classes (9px e `slate` viraram `text-sm` e tokens), e o texto é idêntico. É um desvio intencional nas linhas alteradas.
- **Arquivos:**
  - primeira rodada: `lib/redator/writer-handoff.ts`, `lib/redator/writer-evidence-catalog.ts`, `lib/redator/guardian.ts` (importa `lib/radar/semantic-concept-model.ts`: dependência nova do Redator sobre o Radar), `lib/server/writer-evidence-reader.ts`, `app/api/mcp/redator/route.ts`; testes `tests/writer-evidence-reader.test.mts` e `tests/radar-assunto-f4.test.mts`;
  - segunda rodada e revisão: novo `lib/redator/radar-subject-turn.ts`; alterados `lib/redator/radar-import.ts`, `writer-document-reads.ts`, `writer-section-evidence.ts`, `lib/server/writer-evidence-document.ts`, `writer-evidence-reader.ts`, `writer-evidence-sources.ts`, `writer-evidence-divergences.ts`, `app/api/mcp/redator/route.ts` e `app/api/redator/guardian/route.ts`; do Radar, `lib/server/radar-writer-send.ts` e `lib/radar/portable-writing-export.ts` (registro em `docs/05-radar/estado-atual.md`). Todos LF, preservado.
  - terceira rodada:
    - alterados: `lib/redator/radar-foundations.ts`, `deliverable-seed.ts` e `writer-document-reads.ts`; `lib/server/writer-seed.ts`; `modules/redator/writer-radar-foundations-panel.tsx`; `components/editorial/professional-writer.tsx` (um import, uma linha de cálculo, o bloco do resumo e a linha de `requestStatus`); `package.json` (testes novos nas suítes do Redator, edição mínima); `tests/redator-radar-foundations-1.test.mts` (a asserção O passa a exigir `{ editorialContext: head.editorialContext }`);
    - novos: `lib/redator/guardian-panel-summary.ts`, `tests/redator-assunto-painel.test.mts`, `tests/redator-assunto-painel-dom.test.mts`, `tests/redator-assunto-painel-fixtures.mts` e `tests/redator-guardiao-painel.test.mts`;
    - do Radar: o texto ao especialista (registro em `docs/05-radar/estado-atual.md`);
    - todos LF, preservado.
- **Testes:**
  - `radar-assunto-entrega-redator` 9/9 (novo, roda no `test:radar`): documento sem Assunto igual ao snapshot do HEAD; linhas vazias em toda forma de ausência; proibição uma vez, no fim, com dossiê e bundle iguais; linhas iguais às do CSV; seção da virada sintética e observada; sem sinal sem inventar lugar; abaixo de 2 kB; estrutural do envio; zero chamada a provider;
  - `radar-to-writer-handoff-1`: +1, pelo `sendRadarToWriter` real com portas (recibo e documento com a mesma lista; `editorialContext` igual às linhas da virada da F3; bundle sem artigo-modelo);
  - `redator-mcp-alvo-sem-payload`: guarda da Fase 0 atualizada; +2 (Guardião do MCP com e sem Assunto, com leitura na Marca abaixo de 1 kB, Assunto de outra Marca ignorado, avisos que somem com a virada e o link escritos, `assunto_nao_lido`; briefing com e sem `editorialContext`); +1 guarda nova (leitura de `editorialContext` só com Assunto);
  - `writer-evidence-reader`: +2 (mesma `writerMayNot` em todas as saídas; `editorialContext` nos fundamentos, no material e no pacote, com uma leitura cada, e nada pedido sem Assunto nem pelo manifesto e pela fatia; contexto do Guardião sem leitura para referência ausente ou legada, com Assunto abaixo de 1 kB e só na Marca); ajustados para o `subject` reduzido (o id de quem anexou não aparece);
  - `writer-evidence-divergencias`: regex estrutural da rota do painel com `{ articleDnaRef: input.document.articleDnaRef }`.
  - terceira rodada, `redator-assunto-painel` 15/15 (roda no `test:redator`):
    - sem linhas, a projeção tem o sha do HEAD e nenhuma chave nova, e lixo em `editorialContext` não muda nada;
    - com linhas, só entra `editorialContext`, na ordem do envio. A cópia de listagem leva as linhas, e v1 e v2 sem dossiê continuam `null`;
    - `radarFoundationsSubjectOf`: seção sintética marcada e observada não; sem virada, a decisão volta a quem redige; linha desconhecida vai para `others`; sem tronco, `null`; travessão na frase e na nota;
    - prompts de roteiro e carrossel: sem Assunto, com o sha do HEAD; com Assunto, as linhas logo depois das keywords;
    - a leitura estreita projeta o mesmo que o documento inteiro, e lista fora do contrato dá `null`;
    - estruturais sem comentários; zero rede;
  - terceira rodada, `redator-assunto-painel-dom` 5/5 (roda no `test:redator:dom`, com happy-dom):
    - o painel real mostra o bloco primeiro, com os textos exatos;
    - seção observada sai sem o aviso;
    - sem Assunto (ausente, `[]` ou linha sem tronco), o `innerHTML` é igual byte a byte;
    - a cópia de listagem mostra o Assunto;
  - terceira rodada, `redator-guardiao-painel` 8/8 (roda no `test:redator`):
    - resumo sem servidor igual ao de antes, e contagens do servidor;
    - notices traduzidos;
    - Guardião real com o Assunto não escrito;
    - aprovação barrada por bloqueio visto só pelo servidor;
    - estrutural sem comentários, bloco sem violação visual e teto de dívida 41;
  - terceira rodada, `redator-radar-foundations-1`: asserção estrutural O ajustada.
- **Suítes (segunda rodada, depois da revisão):** `test:redator` 335/335; `test:redator:mcp` 117/117 (112 antes); `test:redator:dom` 14/14; `test:radar` 2684/2684 (hashes dourados, J e 13 colunas verdes); `test:editorial` 170/174 com as 4 falhas de base por nome; `test:serp-cache` 34/34; `tsc --noEmit` exit 0; ESLint 0 erros nos arquivos de código; `git diff --check` limpo. Chamadas pagas em teste: 0.
- **Suítes (terceira rodada, contra a base):**
  - reexecutadas ao documentar: `test:redator` 358/358 (base 335), `test:redator:mcp` 117/117 e `test:redator:dom` 19/19 (14 + 5);
  - relatadas pela rodada de correção: `test:radar` 2685/2685 (+1 de ponta a ponta do Telegram); `test:editorial` 170/174 e `test:visual-system` 23/28, com as falhas de base pelo nome (4 e 5);
  - `tsc --noEmit` exit 0; ESLint sem erros nos arquivos de código; guard visual estrito PASS nos arquivos novos e alterados de `lib/` e `modules/`; `git diff --check` limpo;
  - chamadas pagas, rede e IA em teste: 0.
- **Limites:**
  - o Guardião usa critério lexical: um Assunto dito com outras palavras gera aviso falso; o texto diz o critério e nunca bloqueia;
  - documento enviado antes desta mudança, com ArticleDNA que já tinha `subject`, tem `writerMayNot` gravado sem a proibição e `editorialContext` vazio: fundamentos e material acrescentam a proibição pela projeção, mas o envelope do `read_writer_evidence` e o briefing mostram a lista gravada. Reenviar resolve;
  - persistência: só com Assunto o envio grava algo novo, dentro do documento (`importedContext.editorialContext` e a proibição em `writerMayNot`). Sem migration e sem tabela nova. Tudo validado com fixtures e PostgREST falso; nada real.
  - o painel e a semeadura só mostram e repassam as linhas gravadas no envio. Um documento enviado antes da segunda rodada tem `editorialContext` vazio e não mostra o Assunto no painel; reenviar resolve.

## Leitor de evidências, MCP com 14 ferramentas e divergências — 2026-09-23

- **Implementado e confirmado por teste. Validação manual pendente. Migration `20260923150000_writer_evidence_reader.sql` escrita e NÃO aplicada.** Registro completo na seção 9 do [adendo de decisões](propostas/adendo-leitor-evidencias-decisoes-2026-09-23.md) e na [SDD do leitor](propostas/sdd-leitor-evidencias-redator-2026-09-23.md).
- **A IA que escreve recebe:**
  - um índice de todas as fontes do artigo (manifesto ≤ 8 kB);
  - fundamentos ≤ 24 kB;
  - fatias sob demanda.

  As fontes são: SERP em 4 lentes (cache, snapshot, Arquiteto, Minerador), dossiê do Radar, especialista, vídeo e transcrições, YouTube, Amazon, DNAs, métricas, grafo, site e publicações. Dado posterior ao pacote sai rotulado e nunca substitui o congelado.
- **O que muda para o ChatGPT e o Claude:**
  - quatro ferramentas novas;
  - `get_writer_document` e `get_writer_brief` deixam de trazer o dossiê de 4,5 MB e passam a ~4 kB e ~3 kB;
  - a instrução proíbe FAQ e manda confrontar o dado com os DNAs e registrar a divergência.
- **IA interna (seção e melhoria):** pacote de até 24 kB montado no servidor, com os alertas virando divergências. Antes, a seção de documento vindo do Radar dava 400; agora funciona.
- **Divergências:** a IA só abre. Uma bloqueante barra o envio a Publicações, e o Guardião mostra os achados de intenção, evidência e canibalização. Sem a migration, tudo responde "migration pendente".
- **Fase 0:** o readback do salvamento cai de 4,5 MB para 1,2 kB, o Guardião para 1,8 kB e o seed para 75 kB. Uma sessão típica de escrita passa de ~58 MB para ~23 MB. O que resta é a leitura do documento antes de cada salvamento, que só a Fase 2 remove.
- **Testes:**
  - `test:redator` 335/335, `test:redator:mcp` 111/111, `test:redator:dom` 14/14;
  - `test:editorial` com as mesmas 4 falhas de base.

  Os testes novos (`writer-evidence-*`) rodam por import dentro dessas suítes.

## Documento sem dossiê na mesa (E1) e mesa sob demanda (E2) — 2026-09-23

- **Implementado e confirmado por teste; validação manual pendente.** Registro completo na seção 8 da [SDD de egress](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md).
- **E1 — listagem:** a listagem de documentos da mesa usa uma projeção sem `importedContext.dossier.bundle` (`lib/editorial/content-document-listing.ts`). O documento v2 com dossiê sai marcado como parcial. MEDIDO: 4.497.354 → 9.138 B por carga da mesa.
- **E1 — detalhe:** o completo vem de `GET /api/editorial/documents`, filtrado por id e marca, ao abrir o documento no Redator.
- **Duas garantias contra perda do dossiê:**
  - o PATCH sem dossiê preserva o dossiê gravado, lendo a linha verbatim, recalculando o hash e respeitando o lock;
  - o Redator só libera edição e autosave com o detalhe completo carregado.
  - A recuperação local só aplica o rascunho sobre o mesmo pacote do Radar; se o pacote for outro, avisa e não apaga o rascunho.
- **O que o usuário vê:**
  - ao abrir um documento do Radar, "Carregando o documento completo…" até o detalhe chegar, sem ações nem outline;
  - se falhar, "Tentar de novo";
  - a primeira exportação de um documento do Radar em Publicações demora um pouco mais.
  - Depois de um F5 sem conexão, não dá mais para editar um documento do Radar.
- **Limite medido (pré-requisito):** a projeção custa ~0,8 s de CPU no banco por documento v2 grande. Por volta de 8 a 9 documentos grandes, a lista de documentos da mesa estoura o `statement_timeout` de 8 s. Antes de ~5 documentos grandes, é preciso uma coluna gerada ou view da listagem (migration), ou tirar o dossiê do payload.
- **E2:** o provider da mesa continua na raiz, mas só lê quando o primeiro consumidor pede. Páginas sem mesa (Admin, Conta, Agências, Minerador, login) deixam de ler ~6,85 MB. Nas telas editoriais, a carga fria cai para ~2,36 MB com a E1.
- **Testes:** `tests/editorial-documento-sem-bundle.test.mts` 23/23 e `tests/editorial-mesa-rotas.test.mts` 33/33, em `test:editorial`; `test:redator:dom` 14/14 e `test:editorial:dom` 12/12, scripts novos no `npm test`. `test:redator` 296/296 e `test:redator:mcp` 51/51.
- **Proposta, aguardando autorização:** [leitor de evidências do Redator](propostas/sdd-leitor-evidencias-redator-2026-09-23.md). Toda a SERP (4 lentes), especialista, Amazon, YouTube e todos os DNAs ficam disponíveis para a IA que escreve, lidos sob demanda, com registro de divergência sem mudar DNA. Uma sessão MCP custa hoje ~58 MB por artigo.

## Fundamentos do Radar visíveis nos três ambientes — 2026-09-19

- **Implementado:** `radarFoundationsOf` (`lib/redator/radar-foundations.ts`)
  projeta `importedContext.dossier` para leitura humana; o painel
  `WriterRadarFoundationsPanel` aparece no artigo (lado direito) e, no roteiro
  e no carrossel, ocupa o painel direito enquanto nenhuma cena/slide está
  selecionado. Recomendação editorial, razões, pesquisa YouTube (consultas,
  vídeos, long-form × shorts), blueprint multimodal, SERP/evidências,
  limitações, `writerMayNot` e `mustAnswer/mustCover` quando existirem.
- **Fronteiras:** `editorialOutput` é recomendação, não gate; o dossiê não é
  duplicado no entregável; sem provider, IA ou migration.
- **Pendente:** homologação manual do USER (abrir o roteiro de "skin care
  noturno" e conferir o painel). Semear cenas a partir do blueprint fica fora
  deste corte. Relatório:
  `auditorias/relatorio-redator-dossier-surface-2026-09-19.md`.

## OAuth 2.1 para o MCP do Redator — fase 1 implementada localmente, 2026-09-19

- **SDD:** `propostas/sdd-oauth-mcp-redator-2026-09-19.md`, aprovada para
  implementação com D1 = grant multi-Marca. D2 a D5 seguem as recomendações da
  SDD (qualquer usuário com `redator:view` consente; bearer `mk_mcp_` só
  atrás de `MCP_ALLOW_REMOTE_BEARER`; hook de `aud` e painel da Agência ficam
  para a fase 4).
- **Verificado no código:** metadata RFC 9728 em
  `/.well-known/oauth-protected-resource[/api/mcp/redator]` (rewrite do
  `next.config.ts` para `app/api/oauth/protected-resource`); 401 do MCP com
  `WWW-Authenticate: Bearer resource_metadata=...` quando `MCP_OAUTH_ENABLED`;
  verificação de JWT do Supabase (`lib/server/mcp-oauth.ts`, `getClaims` +
  `iss` + `client_id`); principal único para bearer e OAuth
  (`lib/server/writer-mcp-principal.ts`); grants por (usuário, cliente, Marca)
  em `lib/server/writer-mcp-grants.ts`; página `/oauth/consent` com escolha
  de Marcas e escopos gravada antes de `approveAuthorization`; autoatendimento
  em `/conta` (seção Conexões de IA, `/api/oauth/grants`). As ferramentas
  passam a resolver a Marca pelo documento ou por `brandId`;
  `get_writer_connection_profile` lista as Marcas e devolve `consentUrl`
  quando não há grant.
- **Confirmado por teste:** `test:redator:mcp` 42/42 (token ES256 assinado no
  teste com JWKS injetado, sem rede; metadata; boundary HTTP com e sem OAuth;
  protocolo multi-Marca; preflight), `test:redator` 266/266, `test:mcp:runtime`
  5/5; TypeScript sem erros; ESLint limpo nos arquivos tocados.
- **Validado no dev server local (sem OAuth ligado):** `.well-known` responde
  JSON `oauth_disabled` 404 pelo rewrite, `/oauth/consent` 404, POST
  `initialize` sem token 401 com realm legado, `health` já expõe o issuer
  derivado de `NEXT_PUBLIC_SUPABASE_URL`.
- **Migration M7 aplicada remotamente em 2026-09-19** (`db query --linked -f` + `migration repair --status applied`; preflight 7/7 PASS, post-verifier 12/12 PASS, 0 grants, 6 eventos e 3 delegações preservados):
  `20260919120000_m7_writer_mcp_oauth_grants.sql` (tabela `writer_mcp_grants`,
  coluna `writer_mcp_call_events.grant_id`, CHECK de principal único), com
  preflight e post-verifier em `supabase/scripts/2026-09-19-m7-*` e rollback
  condicionado a tabela vazia em `supabase/rollback/`.
- **Fase 2 concluída em 2026-09-19 (REMOTE VERIFIED por GET público):** após redeploy na Vercel com `MCP_OAUTH_ENABLED=true` e `MCP_ALLOW_REMOTE_BEARER=false`, `/.well-known/oauth-protected-resource/api/mcp/redator` responde 200 com `authorization_servers` = issuer do Supabase, o 401 do MCP traz `resource_metadata`, e o `health` mostra `authMode: oauth_supabase`, `oauthEnabled: true`, `remoteBearerAllowed: false`. Preflight: os três checks do recurso passam; restam só os sete do servidor de autorização.
- **Fase 4 implementada localmente em 2026-09-19 (Verificado no código / Confirmado por teste):** painel "MCP do Redator" da Agência reescrito em `modules/conta/agency-mcp-panel.tsx`: estado medido `OAuth pronto / Pendente (motivo) / Desativado` a partir da discovery do Supabase (`readMcpOAuthReadiness`, cache 60 s), checklist da plataforma (HTTPS, metadata, servidor de autorização) com InfoHint, passo a passo para ChatGPT, Claude e outro cliente MCP com InfoHint nos termos, aplicativos registrados com `Conectado / Aguardando login / Aguardando OAuth / Removido`, tabela "Acessos autorizados" (grants) com revogar e reativar pela Agência, auditoria com origem OAuth ou bearer, e o bearer relegado a "Diagnóstico interno", oculto sem `MCP_ALLOW_REMOTE_BEARER` (a API responde `409 MCP_BEARER_DISABLED`). O consentimento passa a pré-marcar as permissões sugeridas pela Agência e liga o grant ao aplicativo registrado (`provider_connection_id`), tirando-o de `pending`. Testes: `test:redator:mcp` 46/46, `test:redator` 282/282. **Validado em produção em 2026-09-19 (leitura da página autenticada, Agência Somatec Blocking):** o painel deployado mostra `Pendente`, os dois checks do recurso (HTTPS e metadata) e a linha "OAuth Server do Supabase desligado. Ative em Authentication → OAuth Server" medida da discovery; a seção Conexões de IA em `/conta` renderiza com a Marca elegível; a troca de aba ChatGPT → Claude funciona (React hidratado, `aria-selected` alterna e os passos mudam). Não validado: hover do InfoHint, revogação/reativação de grant (sem grant ainda) e tela de consentimento (depende do OAuth Server).
- **Fase 0 concluída pelo usuário em 2026-09-19 (REMOTE VERIFIED por GET público):** OAuth Server do Supabase ligado, Site URL `https://minerador-key.vercel.app`, Authorization Path `/oauth/consent`, registro dinâmico ligado. A discovery anuncia `authorize`, `token`, `clients/register`, PKCE S256, escopos `openid profile email phone offline_access` e `token_endpoint_auth_methods` `none|client_secret_basic|client_secret_post`. Preflight: `oauthDiscovery = PASS`, zero bloqueadores (`MCP_OAUTH_DISCOVERY = PASS`). Chave ES256 ainda não promovida (recomendado).
- **Ainda não verificado:**
  revogação de grant pela Agência com `grant_required` na chamada seguinte
  (`MCP_GRANT_REVOCATION`), chave ES256 no Supabase, cliente Claude e validação do painel da Agência pelo usuário.
- **Fase 3 homologada em 2026-09-19 (REMOTE VERIFIED por readback SQL):** o ChatGPT registrou-se por DCR (1 `auth.oauth_clients`, 1 `auth.oauth_consents`), o usuário consentiu para a Care Glow com os três escopos e o grant ficou ligado ao aplicativo registrado (`provider_connection_id` preenchido; a connection `chatgpt` passou de `pending` a `ready` no mesmo segundo). Trilha em `writer_mcp_call_events` com `grant_id`: `list_writer_documents`, `get_writer_brief`, `get_writer_document` ×4, `save_writer_draft` (attempt → success) e readback. Documento "skincare para pele oleosa": `lock_version` 22 → 23, `content_hash` igual ao reportado pelo ChatGPT, conteúdo contém "Olá", `content_document_versions` = 0 (save não cria histórico, invariante M6).
  Marcadores: `MCP_OAUTH_DISCOVERY = PASS`, `CHATGPT_CONNECTION = PASS`, `AUTHENTICATED_READ_WRITE = PASS`, `MCP_GRANT_REVOCATION = PENDING`. `health.readiness.chatgptLoginReady` passa a `true` com OAuth ligado (registro documental desta homologação).
- **Pré-existente, fora deste corte:** `check:visual-system` falha em
  `modules/arquiteto/territorial-workspace-rows.tsx:181` (comentário com a
  palavra proibida); `test:authz` mantém as 2 falhas estáticas do
  `arquiteto-workspace.tsx` registradas na revisão de 2026-09-02.

## Biblioteca editorial unificada com Publicações — 2026-09-18

- **Defeito encontrado na auditoria:** `publications-workspace.tsx` montava as
  linhas de `operationalPublications` + briefings legados e **nunca lia
  `content_documents`**. Com 1 documento e 0 registros de publicação, a
  biblioteca ficava vazia enquanto o Redator mostrava o artigo — a lista de
  rascunhos do Redator virava uma biblioteca paralela implícita.
- **Correção — projeção, não cópia.** `lib/publicacoes/editorial-library.ts` é
  puro e devolve **uma linha por documento**, enriquecida pelo
  `PublicationRecord` quando ele existir. O `id` da linha é o `documentId`:
  duplicar é estruturalmente impossível. Nenhuma tabela nova, nenhuma cópia.
  Estados: `RASCUNHO` · `PRONTO` (`status='aprovado'`) · `PUBLICADO` (registro
  em `published`, que vence o estado do documento).
- **Publicações:** a aba Biblioteca projeta o documento e cada linha abre
  `/{brandRef}/redator?documentId=…` — a rota já aceitava o parâmetro. Fila,
  Publicados e Atualizações seguem lendo registros, intocadas.
- **Redator:** a barra global ficou com `actions: null` — estado, palavras, tela
  cheia e o atalho de Publicações saíram. Entrou a **toolbar do documento**
  abaixo das abas, com `[Status] · palavras · Salvo no servidor às HH:mm:ss ·
  [Tela cheia] [Salvar rascunho] [Finalizar artigo]`. O rodapé perdeu os dois
  controles concorrentes de aprovação e manteve `Enviar a Publicações`.
- **`Salvar rascunho`** reusa o autosave (flush imediato), não abre segundo
  caminho de gravação, e **não cria versão** — `createVersion` fica desligado em
  rascunho. O horário só aparece quando o servidor confirma.
- **`Finalizar artigo`** reusa `requestStatus("aprovado")` com o gate do
  Guardião: muda o estado do mesmo documento, não publica e não copia.
- **`documentUpdatedAt`** passou a ser guardado no contexto — o `updatedAt`
  remoto já vinha na leitura e era descartado.
- **Confirmado por teste:** `tests/redator-publicacoes-biblioteca.test.mts`
  14/14. `tsc` limpo; `test:redator` **60/60**; `test:radar` 2236/2236;
  `test:editorial` 60/64 e `operational-flow` 41/51 — **as mesmas falhas
  pré-existentes**, zero regressões. Duas asserções de UI em
  `operational-flow` foram atualizadas porque descreviam a barra antiga.
- **Pendente:** homologação manual — F5, segunda aba e segundo navegador.
  **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/biblioteca-editorial-unificada-2026-09-18.md`.

## M2 aplicada e verificada — 2026-09-18

- **`M2_DDL_APPLIED = YES`**, aplicada por
  `npx supabase db query --linked -f supabase/migrations/20260918190100_m2_writer_version_lifecycle.sql`
  e registrada por `migration repair`. **`db push` não pode ser usado neste
  projeto** — ver o achado de histórico abaixo.
- **Readback do schema efetivo:** as 7 colunas de lifecycle existem e são
  nuláveis; `writer_deliverables.current_version_id` com FK `RESTRICT`; os dois
  `previous_version_id` viraram `SET NULL`; os CHECKs exigem
  `purge_after = superseded_at + '48:00:00'`; a trigger retention-aware está
  **só** nas duas tabelas do Redator. `editorial_artifact_versions` e mais cinco
  tabelas de módulos anteriores seguem na função append-only **original e
  incondicional**. RLS e grants sem regressão. **Zero linha** ficou marcada como
  substituída pela aplicação.
- **Prova funcional com fixture isolada (nada persistiu):** artigo, roteiro e
  carrossel testados separadamente — segunda versão vira corrente, a primeira
  recebe `superseded_by`, `superseded_at` e `purge_after = superseded_at + 48h`;
  salvar conteúdo idêntico **não** cria versão nem move a janela; repetir a
  marcação é idempotente. Recusados: marcar a corrente
  (`retention_self_supersede`), sucessor que não é a corrente, e outra marca.
- **Autoridade da versão corrente de roteiro/carrossel passou a ser
  `writer_deliverables.current_version_id`**, e não mais `max(version_number)`.
  `writerRetentionAvailable()` detecta a coluna em até 60s, sem redeploy.
- **`REGRESSION_FROM_M2 = NO`:** `tsc` limpo, `test:redator` 46/46,
  `test:redator:mcp` 2/2, `test:editorial` 60/64 (as mesmas 4 pré-existentes),
  `test:radar` 2236/2236, `planejador-fora-do-pipeline` 16/16,
  `operational-flow` 41/51 (as mesmas 10), `radar-to-writer-handoff-1` 26/26.
- **Achado de infraestrutura:** o histórico remoto de migrations estava quase
  vazio — só 4 linhas, da fundação do Redator/MCP, gravadas pelo Studio sob
  timestamps próprios. **~76 migrations do projeto seguem aplicadas e não
  registradas.** M1 e M2 foram registradas por `migration repair`; as demais
  **não** — repará-las é decisão de infraestrutura maior e mascararia drift real.
- **`PURGE_IMPLEMENTED = NO` · `M3_APPLIED = NO`.** Nenhuma rota chama a purga e
  `pg_cron` não existe: nada é apagado, e esse é o estado seguro.
- **Pendente:** homologação manual. **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/m2-pos-aplicacao-2026-09-18.md`.

## M1 aplicada e verificada — 2026-09-18

- **`M1_DDL_APPLIED = YES`.** `20260918190000_m1_workflow_stage_sem_planner.sql`
  foi aplicada pelo usuário no SQL Editor.
- **Persistência remota, lida por mim:** o CHECK efetivo é
  `stage = ANY (ARRAY['minerador','architect','radar','writer','publications'])`
  — sem `'planner'`. As 28 linhas seguem intactas (25 `architect`, 3 `radar`),
  zero em `stage='planner'`, zero em `state='sent_planner'`, zero incompatíveis
  com o novo CHECK. Os 6 outros CHECKs, as 4 FKs, PK, UNIQUE, trigger, RLS e
  grants continuam idênticos ao lido antes da aplicação.
- **Confirmado por prova comportamental reversível:** `INSERT` sintético com
  `stage='planner'` recebeu `check_violation`; o mesmo `INSERT` com
  `stage='radar'` passou o CHECK e parou na FK. O controle prova que quem
  recusou foi a constraint. Nada persistiu — 28 linhas, zero fixtures.
- **`REGRESSION_FROM_M1 = NO`:** `tsc` limpo, `test:redator` 28/28,
  `test:editorial` 60/64 (as mesmas 4 falhas pré-existentes), `test:radar`
  2236/2236, `planejador-fora-do-pipeline` 16/16,
  `radar-to-writer-handoff-1` 26/26 com o loader. Todas idênticas ao baseline.
- **`M1_VERIFIED = YES` · `M2_APPLIED = NO` · `M3_APPLIED = NO`.**
- **Achado não bloqueante:** comentário órfão em
  `components/editorial-pipeline-context.tsx` (~258-278) descreve
  `preparePlannerItems`, já removido, e aponta para
  `POST /api/editorial/radar-planner-handoff`, rota apagada. É comentário, não
  comportamento; registrado para o próximo corte que tocar o arquivo.
- **Relatório:** `docs/00-produto/auditorias/m1-pos-aplicacao-2026-09-18.md`.

## Corte 2 — remoção funcional do Planejador — 2026-09-18

- **Verificado no código:** `import_planner`, `prepare_plan`, `approve_plan` e
  `start_writing` não existem mais no contrato de comando nem na rota ativa. A
  permissão `planejador:*` deixou de ser exigida em qualquer rota. As telas do
  Planejador ficaram somente leitura. O núcleo do pipeline não importa mais nada
  de `lib/planejador`.
- **Verificado no código:** o Redator ganhou **"Importar do Radar"**, que lista
  elegíveis e chama `postRadarWriterHandoffBatch` — a mesma autoridade
  `sendRadarToWriter` do botão do Radar. Não há segundo handoff.
- **Verificado no código:** `sendWriterToPublications` cria o registro a partir
  de ContentDocument v2 + origem Radar, com a ordem `validar marca → validar
  documento → validar origem → validar pendências e gates → persistir → reler →
  sucesso`. `documentId` é obrigatório no contrato, mesmo com a coluna nulável
  no banco. O cliente recusa resposta sem `readbackConfirmed`.
- **Confirmado por teste:** `tsc` limpo; `test:redator` 28/28;
  `test:editorial` 60/64 (as 4 falhas são pré-existentes, medidas antes e
  depois); `tests/operational-flow.test.mts` 41/51 com as **mesmas 10 falhas do
  baseline medido em HEAD** — zero regressões;
  `tests/planejador-fora-do-pipeline.test.mts` **16/16**; `test:radar`
  **2236/2236**; ESLint sem erros nos arquivos tocados.
- **Defeito encontrado e corrigido na mesma rodada:** `createWriterPublication`
  repassava `document.radarOrigin` inteiro a um objeto `.strict()` de dois
  campos. Virou projeção explícita.
- **Retenção 48h: não implementada.** Só as invariantes seguem registradas.
- **Bloqueado:** M1, M2 e M3 dependem dos blocos [2], [2b], [3], [3b] e [5] do
  preflight de catálogo.
- **Pendente:** homologação manual. **É do usuário.**
- **Relatório:** `docs/00-produto/auditorias/corte-2-remocao-funcional-planejador-2026-09-18.md`.

## Corte de remoção lógica do Planejador — 2026-09-18

- **Aplicado no working tree, sem commit:** documentação canônica passou a
  descrever `Marca → Minerador → Arquiteto → Radar → Redator → Publicações`;
  `MODULE_STAGE` declara `PLANEJADOR_STAGE = NONE`, `REDACTOR_STAGE = 6`,
  `PUBLICACOES_STAGE = 7`, `CONTA_STAGE = 8`, com a posição 5 declarada e não
  atribuída; o Planejador saiu do menu e do estado de pipeline sem que a rota
  fosse apagada (`historical: true`). **Verificado no código.**
- **Confirmado por teste:** `tests/planejador-fora-do-pipeline.test.mts` 8/8 com
  7 `todo` nomeando o que falta; `tests/radar-to-writer-handoff-1.test.mts`
  26/26 com o loader de integrações; TypeScript sem erros. `test:editorial`
  mede **44/48 antes e depois** — as 4 falhas são pré-existentes e não foram
  introduzidas por este corte.
- **Confirmado no banco remoto (somente leitura):** não há dado de ContentPlan
  ou PlannerItem a migrar. `artifact_type='content_plan'` = 0 de 531;
  `stage='planner'` = 0 de 28; `sent_planner` = 0; `content_plans` e
  `planner_items` não existem. Nenhuma compatibilidade fictícia foi criada.
- **Preparado e NÃO aplicado:** remoção de `import_planner`, `prepare_plan`,
  `approve_plan` e `start_writing`; migração de `publication-identity.ts` para
  `lib/publicacoes/`; serviço `sendWriterToPublications` com readback
  obrigatório; `documentId` obrigatório no contrato novo de Publicações;
  botão "Importar do Radar" chamando `sendRadarToWriter`. Diffs em
  `docs/00-produto/propostas/corte-remocao-planejador-diff-proposto-2026-09-18.md`.
- **Invariante atualizada:** a entrega Radar → Redator passa a admitir **dois
  gatilhos da mesma autoridade** — ação no Radar e botão no Redator. O gatilho
  do Redator lista elegíveis e chama o mesmo serviço; não é segunda autoridade.
- **Retenção:** nenhum purge foi implementado. As invariantes
  `PURGE_BY_AGE_ONLY = NO`, `ONLY_AFTER_CONFIRMED_REPLACEMENT = YES`,
  `RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H` e
  `DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE` estão registradas em
  `invariantes.md` §65-69 e na SDD.
- **Bloqueio ativo:** `publication_records` continua nascendo só por
  `start_writing`, que exige ContentPlan. Enquanto o serviço novo não existir,
  **o Redator ainda não entrega a Publicações**. `PENDENTE`.
- **Nenhuma migration foi escrita ou executada.** `MIGRATION_NECESSARIA` segue
  dependendo dos blocos [2], [2b], [3], [3b] e [5] do preflight.

## Revisão de produto do MCP — 2026-09-18

- **Decisão de destino:** a conexão MCP pertence à Agência, em Integrações. A aba `Conectar IA` do Redator e a emissão de bearer local são fundação de desenvolvimento, não a interface final de produto.
- **Divergência confirmada nas telas:** Roteiro e Carrossel estão apresentados como formulários de briefing (`Canal`, `Objetivo`, `Público`, `Duração`, `Abertura`, `Legenda`, `Chamada final`). O produto desejado é um documento de produção com texto, storyboard/slides, imagens, prompts, revisão e pacote para Publicações.
- **Regra nova:** não exigir nem exibir `channel` na produção. Campos auxiliares não podem bloquear a escrita. Os dados históricos permanecem legíveis durante a transição.
- **Pendente de implementação:** painel MCP na Agência; remoção da aba de conexão no Redator; redesenho dos ambientes; vínculo fino de imagens aos blocos; exportação DOCX/PDF; pacote para Publicações; OAuth remoto.
- **Documento de destino:** `docs/07-redator/propostas/sdd-redesign-redator-mcp-agencia-2026-09-18.md`.
- **Prompt de auditoria:** `docs/07-redator/prompts/auditoria-redator-mcp-2026-09-18.md`.

## Implementação multiformato e MCP local — 2026-09-18

- **Verificado no código:** áreas Artigo, Roteiro e storyboard, Carrossel e Conectar IA no Redator. Roteiros e carrosséis preservam cenas/slides, direção visual, prompts e vínculo ao hash do ContentDocument. Prompts visuais e arquivos anexados têm estados diferentes.
- **Banco remoto verificado:** as migrations `20260918050959`, `20260918051757`, `20260918053018` e `20260918061000` foram aplicadas no projeto `hjjlntdpdgvpnazdztqw`. `writer_save_deliverable` e `writer_save_article_draft` existem, o bucket `writer-media` é privado, e o documento preexistente continua presente (1).
- **Verificado no código:** MCP Streamable HTTP em `/api/mcp/redator`, com credencial delegada por ator/agência/marca, hash do token, expiração/revogação, escopos, autorização atual, auditoria e limite de chamadas. As ferramentas leem documentos e briefing, analisam com Guardião, salvam rascunhos com lock/readback e registram/anexam mídia. Não há ferramentas de aprovação/publicação/exclusão.
- **Confirmado por teste automatizado:** contratos de formato e restrições de ferramentas; TypeScript e lint direcionado passaram. A resposta 401 sem bearer foi observada no localhost. A interface carregou as quatro abas no navegador local, sem criar credencial ou alterar conteúdo editorial.
- **Confirmado por teste de protocolo local:** uma delegação sintética executou `initialize` e `tools/list` por Streamable HTTP; o servidor recusou escrita sem lock e ferramenta inexistente de publicação. Isto não prova autorização real nem leitura/gravação de documento por um cliente externo.
- **Bloqueio remoto medido:** a URL oficial de descoberta OAuth do projeto Supabase respondeu HTTP 404 `feature_disabled` em 2026-09-18. O bearer local não implementa o OAuth + PKCE exigido para o ChatGPT remoto. A ativação do OAuth Server e o consentimento por agência/marca são gates separados; nenhum deploy foi feito.
- **Validado no localhost com Supabase real:** uma delegação temporária `writer.read` executou `initialize`, `tools/list` (10 ferramentas), `get_writer_connection_profile`, `list_writer_documents` (1 documento) e `get_writer_brief` (dossiê presente). A delegação foi revogada; a mesma credencial passou a receber HTTP 401 `delegation_invalid`. O registro revogado e sua trilha de auditoria permaneceram no banco; nenhum artigo foi alterado.
- **Confirmado por teste transacional remoto:** uma cópia temporária do documento foi criada em `BEGIN`, salva via `writer_save_article_draft`, repetida com o mesmo hash e desafiada com lock antigo e conteúdo diferente. O bloco terminou com `ROLLBACK`: zero documentos/versões de fixture permaneceram e a marca ainda tem o documento original. O estado corrente e a versão imutável são atômicos. A função é executável por `service_role`, mas não por `authenticated` ou `anon`. A ferramenta MCP de escrita autenticada ainda requer teste ponta a ponta.
- **Ainda não verificado:** escrita MCP autenticada, criação de entregável e upload por UI seguidos de F5/segunda sessão; conexão ChatGPT/Claude.
- **Limite funcional:** a plataforma registra prompts e recebe imagens geradas pelo chat como arquivo; não chama modelo de imagem e não garante que o cliente MCP consiga retornar automaticamente a imagem criada na conversa. A aprovação editorial e publicação continuam atos explícitos.
- **Arquivos centrais:** `lib/redator/multiformat-contracts.ts`, `lib/server/writer-deliverables.ts`, `lib/server/writer-mcp-delegation.ts`, `app/api/mcp/redator/route.ts`, `modules/redator/writer-derived-environment.tsx`, `modules/redator/writer-mcp-connections.tsx` e as quatro migrations acima. O acréscimo compartilhado em `lib/server/authz.ts` resolve o perfil de um ator já validado; os consumidores existentes da sessão permanecem inalterados.

- **Última auditoria:** 2026-07-20.

## Integração MCP na Agência — implementação local 2026-09-19

- **Implementado no código:** `/agencias/{agencyRef}/integracoes` passou a ser
  a superfície de gestão do MCP do Redator. A Agência pode registrar ChatGPT,
  Claude, Gemini ou outro cliente MCP, visualizar o endpoint único
  `/api/mcp/redator`, selecionar escopos e emitir delegações por Marca.
- **Autoridade preservada:** o servidor MCP continua único e o token continua
  sendo uma delegação `writer_mcp_delegations` vinculada a agência, marca,
  ator, escopos, validade e hash. Administradores da Agência também podem
  revogar delegações criadas por outros administradores da mesma Agência.
- **Segurança:** o token completo aparece uma única vez; `integration_connections`
  recebe somente metadados sanitizados do cliente e permanece `pending` até a
  conexão externa ser configurada. Nenhum segredo bruto foi adicionado ao
  banco, React, localStorage ou payload editorial.
- **Migration local preparada:**
  `supabase/migrations/20260919035046_agency_mcp_provider_catalog.sql` adiciona
  os providers `chatgpt`, `claude`, `gemini` e `custom_mcp`. **Não aplicada
  remotamente nesta rodada.**
- **Validado:** TypeScript, lint direcionado, build, `test:redator` 204/204 e
  `test:redator:mcp` 2/2. A conexão ChatGPT/Claude/Gemini por OAuth remoto ainda
  não está homologada; o projeto Supabase continua sem discovery OAuth ativo.
- **Pendente manual:** aplicar a migration no projeto escolhido, registrar um
  cliente na página da Agência, emitir um bearer para uma Marca e conectar um
  cliente externo por HTTPS. A homologação da escrita no Redator continua
  separada e não foi simulada por esta alteração.
- **Funcionando:** Tiptap integrado, abertura direta por query, edição humana, blocos estruturados, proveniência por `blockId`, autosave com lock otimista e recovery local por marca/documento. **Verificado no código.**
- **Funcionando:** contratos/prompts do Redator, escrita assistida por seção, melhoria de trecho e análise determinística do Guardião possuem rotas server-side e aplicação explícita na cópia de trabalho. **Confirmado por TypeScript, lint e testes direcionados.**
- **Funcionando:** aprovação no cliente e no endpoint server-side rejeita documento com achados `blocked`; IA continua proposta e nunca aprovação. **Verificado no código.**
- **Parcial:** salvamento, criação de snapshots, reload e sincronização do registro de Publicações existem nos repositórios, mas não houve validação manual ponta a ponta com persistência remota.
- **Parcial:** escrita e melhoria reais dependem de provedor configurado; os testes usam fixtures e não chamam IA externa.
- **Simulado:** há criação mock de plano/documento no provider, distinguida por origem.
- **Local:** recovery de workflow e recovery de documento usam navegador; `localStorage` é fallback e não fonte única.
- **Persistido:** tabelas/repositórios de documento, versões, estado e comentários previstos na migration `0002`; remoto não verificado.
- **Bloqueado:** confirmação manual de persistência remota, conflito em navegador, aprovação e importação idempotente para Publicações.
- **Regressões/bugs:** nenhum confirmado nos testes direcionados desta tarefa. A validação manual continua pendente.
- **Arquivos centrais:** `components/editorial/professional-writer.tsx`, `lib/redator/contracts.ts`, `lib/redator/prompts.ts`, `lib/redator/guardian.ts`, `lib/server/editorial-repositories.ts`, `app/api/editorial/documents/route.ts`.
- **Testes:** `tests/redator-domain.test.mts`, `tests/editorial-pipeline.test.mts`, `tests/operational-flow.test.mts`, `tests/arquiteto-domain.test.mts`; TypeScript e lint direcionados passaram.
- **Última validação manual:** **Relatado pelo usuário:** primeiro documento abriu diretamente; Guardião, rotas de IA e transferência ainda não foram conferidos no navegador.
- **Diferença spec/implementação:** a estação editorial e seus gates locais/server-side estão implementados; persistência remota, provedor real e destino externo ainda não são evidência de conclusão.

### Atualização da governança MCP — 2026-09-19

- **Confirmado pelo responsável no Supabase remoto:** o catálogo contém
  `chatgpt`, `claude`, `gemini` e `custom_mcp` com status `active`. A migration
  `20260919035046_agency_mcp_provider_catalog.sql` foi aplicada fora desta
  sessão; ela não armazena credenciais.
- **Concluído no código:** a Agência é a única autoridade para emitir e
  revogar delegações MCP. A rota legada do Redator conserva somente `GET` de
  compatibilidade; `POST` e `DELETE` respondem `410
  MCP_DELEGATION_AGENCY_ONLY`.
- **Concluído no código:** a página de Integrações da Agência permite revogar
  uma conexão MCP e ler os 40 eventos operacionais mais recentes sem expor
  tokens ou conteúdo editorial.
- **Ainda pendente:** conexão externa real por OAuth/HTTPS, escrita MCP
  autenticada ponta a ponta em fixture isolada e homologação manual pelo
  usuário. `pending` não significa cliente conectado.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/redator; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/redator`; autosave e recovery local não foram alterados.

# Entrada direta Radar → Redator — 2026-09-17

- **Funcionando:** o documento editorial nasce do pacote canônico do Radar **sem
  `ContentPlan` e sem item no Planejador**. `ContentDocument` passou a ser união
  discriminada por `schemaVersion`: v1 mantém `contentPlanRef` obrigatório, v2
  carrega `radarOrigin` + `importedContext` e o `.strict()` **recusa** a chave
  `contentPlanRef` — ausência declarada em vez de id fictício. **Verificado por
  testes e TypeScript.**
- **Funcionando:** a transferência tem **autoridade única e ela é do Radar** — a
  ação chama-se "Enviar ao Redator" e existe em R3, R4 e na página de análise. O
  Redator recebe; não há segunda porta de importação nele. O botão do Planejador
  permanece como caminho histórico. **Verificado no código.**
- **Funcionando:** o estado `sent_writer` existe ao lado de `sent_planner` na
  máquina de estados (`lib/editorial/operational-flow.ts`), com transição
  `approved → sent_writer` e volta para `approved`. O envio ao Redator **não** é
  registrado como "enviado ao Planejador". **Verificado no código.**
- **Funcionando:** `Publicações` aceita origem Radar — `plannerItemId` e
  `contentPlanVersionId` são nuláveis e `radarOrigin` foi acrescentado. No lugar
  da obrigatoriedade perdida entrou uma invariante: **todo registro precisa
  declarar alguma origem**, plano editorial ou pacote do Radar. **Verificado por
  teste.**
- **Funcionando:** o dossiê canônico viaja **inteiro** dentro de
  `importedContext.dossier` (`RadarWriterDossier`), e não como resumo ou apenas
  markdown. O campo é aditivo (`.default(null)`), então documento v2 gravado
  antes deste gate continua legível. **Verificado por teste.**
- **Funcionando:** pendência viaja **como pendência**. Bloqueante impede aprovar
  e transferir como aprovado, **não** impede escrever e salvar; não existe campo
  nem botão local que a marque resolvida. **Verificado por teste.**
- **Parcial:** o serviço e a rota `radar-writer-handoff` implementam readback na
  origem e no destino (`radar_handoff_readback_failed`,
  `radar_handoff_destination_readback_failed`). O comportamento está coberto por
  teste, mas **o readback remoto real não foi homologado manualmente**.
- **Bloqueado:** homologação manual ponta a ponta — envio, recarga, segunda
  sessão/navegador, conferência de artigo, versão do ArticleDNA e hash,
  idempotência e lote misto. **É do usuário**, sem chamada paga de SERP ou IA.
- **Nenhuma migration foi necessária.** A verificação do schema efetivo mostrou
  `content_plan_version_id` e `article_dna_version_id` já nuláveis em
  `content_documents` e `publication_records`, e `planner_item_id` inexistente
  como coluna — a `0028` prevaleceu sobre a `0002`. O bloqueio era inteiramente
  de contrato Zod.
- **Arquivos centrais acrescentados:** `lib/redator/radar-import.ts`,
  `lib/redator/writer-handoff.ts`, `lib/server/radar-writer-send.ts`,
  `app/api/editorial/radar-writer-handoff/route.ts`,
  `lib/radar/writer-handoff-client.ts`.
- **Testes:** `tests/redator-entrada-radar.test.mts` (23/23) e
  `tests/radar-to-writer-handoff-1.test.mts` (25/25). As três falhas anteriores
  do primeiro eram do **fixture**, não do contrato: faltavam `bundleId` e
  `keywordContext.resolution`, exigidos desde que o dossiê passou a viajar
  dentro do documento; o teste de chaves ainda descrevia `importedContext` sem
  `dossier`. Corrigidos.
- **SDD:** `docs/07-redator/propostas/sdd-entrada-direta-radar-redator-2026-09-17.md`.
- **Diferença spec/implementação:** contrato, domínio, serviço e rota estão de
  pé e verdes. Interface de lote, painel de pendências e adaptador de
  `Publicações` no repositório ainda não foram entregues, e a validação manual
  segue pendente — nenhum dos dois é evidência de conclusão.

# Incidente resolvido — o documento existia e a tela dizia que não havia nada — 2026-09-18

- **Sintoma:** o Redator abria vazio e oferecia apenas "Importar do Planejador
  (histórico)", cujo modal dizia "Conclua a aprovação na etapa anterior
  primeiro" — uma instrução para uma etapa que o fluxo atual não atravessa.
- **O envio nunca falhou.** Verificado no banco, somente leitura:
  `editorial_workflow_items` tinha 1 artigo em `sent_writer`, e
  `content_documents` guardava o documento correspondente — v2, sem
  `content_plan_version_id`, com `importedContext.dossier` preenchido, gravado
  em 2026-09-18 03:51 UTC. O payload foi validado contra
  `ContentDocumentSchema`: **válido**.
- **Causa identificada:** formato de data. O PostgREST devolve `timestamptz`
  como `2026-09-18T03:51:49.236599+00:00`; `z.string().datetime()` só aceita
  `Z`. `PersistedDocumentSchema.updatedAt` lia `row.updated_at` **cru**, sem a
  normalização `isoDate()` que o `WorkflowRepository` sempre usou — e é por isso
  que o Radar continuava carregando enquanto o Redator não.
- **Por que só apareceu agora:** enquanto `content_documents` esteve vazia,
  `documents: []` passava em qualquer schema. O **primeiro documento real**
  derrubou a validação da mesa inteira em `PersistedEditorialWorkspaceSchema`.
  Verificado diretamente contra o PostgREST desta instalação.
- **Correção:** `isoDate()` aplicada aos **9** campos de data lidos de coluna em
  `lib/server/editorial-repositories.ts` (documento, estado de leitura,
  publicações, views salvas e convites). Como rede de segurança, os contratos
  desses campos passaram a aceitar deslocamento
  (`datetime({ offset: true })`) — a normalização continua sendo no leitor.
- **Teste:** `tests/editorial-timestamp-postgrest.test.mts` (7/7), registrado em
  `test:editorial`. Reproduzia o defeito antes da correção (5 falhas) e usa o
  valor **real** do PostgREST, porque um fixture escrito com "Z" na mão esconde
  exatamente este defeito.
- **Entrada da tela:** decisão do planejador — o caminho do Planejador saiu da
  barra principal e virou acesso secundário junto dos rascunhos; o estado vazio
  do diálogo parou de mandar aprovar plano e passou a nomear "Enviar ao
  Redator", no Radar. **Nenhuma segunda autoridade de importação foi criada no
  Redator** — a transferência continua partindo só do Radar.
- **Pendente:** homologação manual. **É do usuário.** Abrir o Redator, conferir
  que o documento aparece, recarregar, abrir em segunda sessão e repetir o envio
  para provar idempotência.

## Teste local do Redator e preparação MCP — 2026-09-18

- **Validado no navegador local:** documento v2 originado no Radar apareceu no
  Redator com artigo e versão de ArticleDNA identificáveis. Uma edição
  temporária foi salva no servidor, recuperada após F5, removida, salva e a
  remoção recuperada após novo F5. O Guardião server-side retornou findings.
  O estado operacional passou de `planejado` para `escrevendo` no teste; não
  houve aprovação, publicação nem geração de conteúdo final.
- **Bug corrigido:** a barra global podia consultar `canUndo`/`canRedo` com o
  editor Tiptap ainda nulo na inicialização e derrubar a página. Os controles
  agora consultam a referência atual e checam se o editor não foi destruído.
- **Limite da evidência:** não houve segunda sessão, teste de lote ou nova
  transferência a partir do Radar nesta rodada. Após F5, a tela mostra vazio
  antes de concluir a hidratação; isto não foi tratado como marca vazia.
- **Registro anterior ao corte MCP:** `importedContext.dossier` já estava no
  documento v2, mas a UI ainda exibia apenas origem e IDs naquele momento.
  O estado mais recente da implementação está no início deste documento.
- **Testes desta rodada:** `test:redator` 23/23, TypeScript sem erros,
  ESLint no arquivo do Redator sem erros (1 aviso preexistente de dependência
  do `useMemo`).

## Autosave e MCP param de devolver o documento inteiro — 2026-09-23

**Confirmado por teste; ainda não verificado manualmente.**

Duas leituras do `ContentDocument` completo (~4,48 MB, dos quais 99,8% é
`importedContext.dossier.bundle`) saíram de caminhos que não usavam o corpo.
Ver SDD de [uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md), regras R5 e R6.

### Autosave

`ContentDocumentRepository.save` fazia `update(...).select("*")`: cada pausa
de 1,2 s na digitação devolvia o documento inteiro. Agora devolve
`id,status,content_hash,lock_version,updated_at` — os únicos campos que a rota
`app/api/editorial/documents` lê do retorno. O `OptimisticLockError`
continua vindo de `data` nulo.

### MCP

`resolveTarget` em `app/api/mcp/redator/route.ts` lia o payload completo para
**toda** ferramenta com documento. Agora usa `documentOwner` (`id,marca_id`);
só `get_writer_document`, `get_writer_brief` e `get_writer_guardian` — as que
leem o corpo — pedem a linha completa, numa única ida ao banco.

- **Economia:** ~4,48 MB por chamada de `get_writer_deliverables`,
  `save_writer_draft`, `save_writer_deliverable`, `register_media_brief` e
  `attach_media_asset`; `save_writer_draft` cai de ~13,4 MB para ~9 MB.
- **Honestidade sobre o impacto:** houve **uma** chamada dessas ferramentas
  no ciclo inteiro. O ganho é preventivo, para quando clientes de IA usarem o
  MCP de verdade.
- **Troca aceita:** as cinco ferramentas de grant não validam mais o payload
  com `ContentDocumentSchema.parse` antes do trabalho. Todo escritor de
  `content_documents` valida antes de gravar, e `save_writer_draft` continua
  validando no `before` de `saveWriterArticleDraft`.
- **Isolamento:** documento fora do grant continua `document_not_found`, no
  mesmo ponto, e agora sem baixar o payload antes.
- **Teste:** `tests/redator-mcp-alvo-sem-payload.test.mts`, registrado em
  `test:redator:mcp` (51/51).

### PENDENTE

`lib/server/writer-deliverables.ts` ainda lê o documento completo duas vezes
em `save_writer_draft`: o `before` (exigido enquanto a RPC pede `p_payload`
inteiro) e o readback. Estreitar o readback para `payload->blocks` tiraria
mais ~4,48 MB, mas perde o `ContentDocumentSchema.parse` do payload relido —
é decisão a tomar, não a assumir.

# O MCP passa a cobrir a plataforma inteira — 2026-09-26

- **Verificado no código local:** após a ampliação seguinte, a mesma URL
  (`/api/mcp/redator`) registra 17 ferramentas da plataforma, além das 14 do
  Redator: guia, retrato da marca,
  busca de tema, keywords, próximos passos, validação de silo, declarar Assuntos,
  pesquisa por Assunto (plano grátis → execução paga), import ao Processador,
  envio ao Arquiteto e envio do Radar ao Redator. SDD:
  `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md`.
- **Verificado no código:** o nome anunciado do servidor passou de
  `minerador-key-redator` para `minerador-key`. Conexões existentes não
  precisam reconectar; para os escopos novos, precisam **reconsentir**.
- **Confirmado por teste:** `test:agent` 40/40; `test:redator:mcp` 117/117.
- **Pendente (usuário):** aplicar a migration m8 **antes** do deploy e homologar
  com um cliente real. Roteiro em `docs/compartilhado/agentes-mcp-backlog.md`.
## Auditoria das permissões MCP — 2026-09-26

- **Verificado em produção, somente leitura:** `/api/mcp/redator/health` e metadata OAuth respondem 200; pedido anônimo de ferramentas responde 401. O próprio health declara `verificationScope: runtime_configuration_only`, então não comprova uma sessão Claude.
- **Verificado no banco remoto, somente leitura:** a migration m8 aceita os oito escopos em grants e delegações. Há um grant ativo para ChatGPT apenas com os três escopos antigos do Redator; não foi encontrado grant ativo de Claude. A trilha dos últimos sete dias mostra somente chamadas ChatGPT às ferramentas do Redator, com último evento em 2026-09-20; não há exercício registrado das novas ferramentas da plataforma. Nenhuma permissão remota foi concedida nesta auditoria.
- **Defeito corrigido localmente:** `/api/oauth/consent` e `/api/oauth/grants` limitavam a seleção a três itens apesar de anunciar oito. O teto agora acompanha `WRITER_MCP_SCOPES.length`. O consentimento continua a validar a lista permitida e `provider.spend` continua desmarcado por padrão.
- **Verificado no código / teste local naquela revisão:** o invólucro de ferramenta transmite o mesmo `requestId` ao domínio e à auditoria; a declaração de Assunto via MCP registra `channel.kind`, `grantId` e `requestId` no bloco `subject_import`, sem mudar o ator canônico. Chamadores de importação pela tela mantêm o payload anterior. O `catalogHash` deriva de todos os tópicos do guia. Validação autenticada de Claude e fluxo editorial completo não foram realizados naquela revisão.
- **Estado funcional atualizado abaixo:** o MCP atual inclui ferramentas de decisão delegada; veja “Delegação explícita e finalização”. Medição paga, formação/confirmação de artigos e Silos no Arquiteto e investigação/finalização do Radar ainda não têm execução por ferramenta. O catálogo orienta a IA a usar a interface nessas etapas.
- **Arquivos desta correção:** `app/api/oauth/consent/route.ts`, `app/api/oauth/grants/route.ts`, `app/api/mcp/redator/route.ts`, `lib/server/platform-mcp-tools.ts`, `lib/agent/catalog-hash.ts`, `lib/minerador/keyword-import-core.ts`, `tests/agent-platform-mcp.test.mts`, `tests/minerador-assunto-import-core.test.mts`. Compartilhados preservados: importação pela tela, grants existentes e ferramentas anteriores do Redator. Sem migration, deploy ou escrita remota nesta revisão.

## Delegação explícita e finalização — implementação local de 2026-09-26

- **Verificado no código:** `platform.decide` foi adicionado como opt-in e excluído dos escopos pré-selecionados. `decide_keywords`, `set_kgr_applicability`, `set_keyword_vinculo`, `finalize_writer_document` e `send_writer_to_publications` exigem `preview → decisionHash vigente → userConfirmation`. O invólucro confere grant por Marca, escopo, permissões por Agência/Marca e registra o ator e o aceite no evento.
- **Núcleo compartilhado:** o PATCH da tela e `finalize_writer_document` usam `saveAndFinalizeWriterDocument`; a tela e o MCP não mantêm implementações concorrentes da gravação e versão final. `send_writer_to_publications` só cria o registro interno e relê o resultado; não publica URL.
- **Ainda pendente:** migration M9 e deploy pelo usuário, reconsentimento do Claude e teste autenticado remoto. Medição paga de Volume/Resultados, confirmação/formação no Arquiteto e investigação/finalização do Radar ainda não têm ferramenta MCP.

### Validação local da revisão — 2026-09-26

- **Confirmado por teste:** `test:redator` 358/358; `test:agent` 44/44; TypeScript sem erros. A rota PATCH do Redator e a ferramenta MCP compartilham o mesmo núcleo de guardião, optimistic lock, versionamento, readback e retenção.
- **Ainda não verificado:** grant e escopos no Supabase após M9, consentimento real do Claude, salvamento remoto do documento e fluxo MCP autenticado.
