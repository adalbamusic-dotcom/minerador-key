# SDD — Radar: diretriz editorial guiada pela SERP, com a voz do especialista — 2026-10-02

**Status:** APROVADA pelo dono em 2026-10-02: D1 = F1 já; D2 = F2 em seguida; D3 = o parecer do
"Eu mesmo" entra já aceito; D4 = os três itens de vídeo (SERP, biblioteca da marca, YouTube vira roteiro).<br>
**Módulo proprietário:** Radar. Consumidores preservados: Redator (lê o dossiê) e o CSV "para escrever".<br>
**Origem:** primeiro artigo real fechado pelo Radar ("instagram não traz pacientes", 2026-10-02). O CSV
trouxe pesquisa aproveitável, mas a diretriz de escrita saiu errada: um redator que obedecesse ao
arquivo escreveria sobre recursos genéricos do Instagram, abrindo com influenciadores de IA.

## 1. Pedido do dono

- A SERP manda: ela tem a última palavra sobre intenção, funil e o que o artigo precisa cobrir para
  competir pela posição. Do Arquiteto ao Radar, tudo se apoia em evidência real.
- O Radar junta o que há de bom (SERP nas 4 lentes, perguntas, AI Overview, concorrentes, ArticleDNA,
  especialista) numa direção clara, para competir no Google.
- Fundamentos obrigatórios em todo artigo: termos semânticos (LSI) e linguagem natural (PNL), leitura
  do BERT (responder a pergunta com clareza, no contexto), autoridade E-E-A-T e cuidado YMYL.
- A voz do especialista é parte importante do artigo, principalmente na última virada e no CTA.
- O CSV leva os prompts das imagens (capa e respiros), com ALT e legenda.

## 2. Diagnóstico (verificado no código)

| Sintoma no CSV | Causa |
|---|---|
| Seções "O que considerar sobre 2. Aproveite os recursos do Instagram?" | Candidatos a seção são H2 crus dos concorrentes (`semantic-concept-model.ts:457`, `:578`). Nenhuma normalização tira numeração de lista ("2.", "7.", "10 principais"). O molde de último recurso é `editorial-article-model.ts:458`, e a escada de regex (`:385-472`) falha porque o número vem antes. |
| Qualquer listicle genérico vira seção | "Alinhado" = compartilhar uma raiz com o território (`editorial-article-model.ts:310-319`, `:1316-1327`). A palavra "instagram" basta. Não há teste de aderência à intenção nem à entidade central. |
| Abertura: "10 principais influencers de IA do Instagram…" | `perguntaDeAberturaDe` (`portable-writing-export.ts:1096`) pega a unidade CORE com mais páginas. A recorrência é inflada pela fusão por faceta (`semantic-concept-model.ts:511`, "porque" → CAUSE em `:157`), e o desempate alfabético põe o dígito na frente (`ai-discovery-context.ts:877`). |
| H1 "Como o que considerar sobre 2. Aproveite…" | O H1 cola "Como" sobre o cabeçalho já moldado (`editorial-article-model.ts:1537-1593`, `nucleoDeAcao` em `:724`). |
| Promessa genérica | Sem função editorial reconhecida, tudo vira COVERAGE e a promessa é "encontra respondido o que foi procurar" (`:1633-1645`). |
| Fechamento e CTA sobre "2. Aproveite os recursos" | Derivam do mesmo cabeçalho (`:1678-1688`). O especialista nunca é roteado para lá: o tipo do parecer (FECHAMENTO, CTA, DIRETRIZ) não atravessa (`portable-annex-context.ts:164-177`). |
| "Sustentar X como diferencial" para temas raros e fora do assunto | Diferencial = conceito ancorado abaixo do limiar de recorrência, mesmo de 1 página (`competitive-observed-model.ts:793-815`), sem filtro de relevância; o CSV nem checa `foraDoEscopo` (`portable-writing-export.ts:1125`). |
| Especialista: "sem contribuição aceita" | O parecer chegou e está aguardando aceite (conferido no banco: tipo FECHAMENTO, status RECEIVED). O CSV só mostra aceitos e esconde o pendente (`portable-writing-export.ts:1366`). |
| Plano visual sem prompt, ALT e legenda | Estrutural: o gerador usa promessa, objetivo e cabeçalhos (`portable-identity.ts:337-449`), e o filtro do CSV descarta exatamente esses textos como "moldura" (`portable-writing-export.ts:1428-1467`). |
| L1 "destino não resolvido" | O Pilar ainda não está publicado (`article-formation:…`); o Radar não lê o slug planejado (`suggestedSlug` existe no Arquiteto). |
| "Fontes verificadas: nenhuma" | `buildRadarFactualEvidence` (`source-authority.ts:358`) não tem chamador em produção. |
| LSI/PNL/BERT ausentes; YMYL "nenhuma" | O Radar só tem termos de cabeçalho (`semantic-concept-model.ts:27` diz "não é densidade LSI"); o enriquecimento semântico está desligado (`:737`). YMYL é regex sobre palavras de saúde (`editorial-policy.ts:39-92`). |

**Conclusão:** a pesquisa (SERP, 4 lentes, perguntas, AI Overview, concorrentes) é boa. A falha está na
**síntese editorial**, que é léxica e baseada em cabeçalhos de concorrentes. Corrigir regex por regex
melhora o pior, mas não produz promessa, H1, ângulo e fechamento competentes.

## 3. Proposta em fases

### F1 — Correções determinísticas (sem contrato novo; pode começar já)

1. **Especialista visível e roteado.**
   - CSV e Relatório mostram o parecer pendente ("1 parecer aguardando aceite no Radar: não entra no
     texto até ser aceito"), e o envio ao Redator avisa.
   - O tipo do parecer atravessa até o CSV: FECHAMENTO vira o **Fechamento**, CTA vira a **Chamada
     final**, DIRETRIZ entra nas regras do artigo. A voz do especialista passa a conduzir a última
     virada e o CTA (citada como fala dele, sem inventar credencial).
2. **Limpeza de cabeçalhos:** tirar numeração e contagem de listicle ("2.", "7.", "10 principais",
   "15 ideias") antes de qualquer uso como seção, pergunta ou termo.
3. **Aderência à intenção:** abertura, seção e diferencial exigem tocar a entidade central do artigo
   e a intenção (não só uma raiz como "instagram"); diferencial exige ao menos 2 páginas ou uma
   pergunta/PAA que o peça, e respeita `foraDoEscopo`.
4. **Link para Pilar não publicado:** usar a URL planejada (SiloPage + `suggestedSlug`) marcada "a
   publicar", em vez de "destino não resolvido".
5. **Plano visual com conteúdo:** prompt, ALT e legenda por imagem, montados a partir da pergunta da
   seção, do conceito e da entidade central, no tom visual da regra 8 do arquivo.

### F2 — Diretriz editorial sintetizada pela IA, revisada por humano (contrato novo)

- **Entrada:** a SERP congelada (4 lentes, orgânicos, PAA, AI Overview, buscas relacionadas, conceitos
  com cobertura, lacunas), o ArticleDNA (principal, complementares, Assunto, papel no Silo, destino), o
  parecer aceito do especialista e as regras da marca.
- **Saída estruturada (`editorialDirection`):** promessa concreta; leitor; abertura (pergunta que o
  leitor tem, respondida no 1º parágrafo); H1 e alternativas; seções H2 com a pergunta que cada uma
  responde, as evidências que a sustentam (ids do pacote) e os termos LSI/entidades a nomear;
  diferenciais justificados pela intenção; virada final e CTA **com a voz do especialista**; plano
  visual (capa e 2–3 respiros com prompt, ALT e legenda); sinais E-E-A-T e cuidado YMYL.
- **Validador do servidor recusa:** título ou frase copiados de concorrente, numeração, id inventado,
  seção fora da intenção, afirmação factual sem fonte do pacote.
- **Decisão humana:** "IA analisa → aplica na cópia → humano revisa e aprova" no Radar, antes de
  finalizar. Sem aprovação, nada vai ao pacote.
- **Pacote e CSV:** campo novo e opcional no dossiê (chave ausente fora do hash: dossiês antigos
  mantêm o hash). O CSV usa a diretriz aprovada quando existe; sem ela, a F1.
- **Custo:** 1 chamada de IA por artigo, mostrada antes, como as outras.

### F3 — Fontes verificadas (depois)

Ligar a verificação factual (`buildRadarFactualEvidence`) às afirmações que pedem fonte. Custo e escopo
em adendo próprio.

## 4. Compatibilidade, riscos e rollback

- **F1** muda só textos derivados; os testes que prendem os textos atuais serão reescritos. Dossiês
  já entregues não são recalculados.
- **F2** acrescenta um campo opcional; quem não o conhece ignora. Rollback: desligar a etapa; o CSV
  volta à F1.
- **Risco:** IA inventar. Mitigação: validador do servidor, ids conferidos contra o pacote, revisão
  humana obrigatória.

## 5. Testes

- F1: o caso real (instagram) vira fixture. Esperado: nenhuma seção com numeração ou fora da intenção;
  abertura aderente; especialista pendente visível; fechamento/CTA com o parecer quando aceito; plano
  visual com prompt, ALT e legenda; link do Pilar com URL planejada.
- F2: validador (cópia, numeração, id inventado, fora da intenção), revisão humana, hash dos dossiês
  antigos inalterado, CSV com e sem diretriz. Testes sem IA paga (fixtures).
- Suítes `test:radar`, `test:redator`, `test:agent` (catálogo atualizado), `tsc`.

## 6. Decisões do dono

- **D1:** aprovar a F1 (começa já, sem contrato novo).
- **D2:** aprovar a F2 (diretriz pela IA com revisão humana; campo novo no dossiê).
- **D3:** o parecer escrito por quem está logado ("Eu mesmo") entra já aceito, ou continua pela revisão
  (decisão D2 da SDD de 2026-09-30)?
- **D4:** vídeos — o que falta: (a) usar os vídeos que aparecem na SERP como sinal de formato e sugestão
  de embed; (b) a biblioteca de vídeos da marca no artigo; (c) o acréscimo YouTube virar roteiro no Redator.

---

## Adendo A — F2 ampliada: o "artigo-modelo" (2026-10-02) — PROPOSTA

### A.1 Pedido do dono

"A SERP teria que fornecer uma fotocópia de um artigo ideal para concorrer com os resultados: quantos H2,
H3, parágrafos, negritas, imagens de respiro e capa; resolver o que o Planejador fazia; juntar os dados com
ajuda da IA; dar sentido a todas as keywords; detalhar, com as evidências, em que partes vão os links
internos e quantos; e se precisa de links externos para reforçar alguma questão."

### A.2 Diagnóstico do CSV real (artigo do Instagram, export de 2026-10-02)

- A estrutura saiu com **um H2** e H1 malformado ("Como o que considerar sobre stories…"): o artigo-modelo
  determinístico depende de cabeçalhos de concorrente e a amostra é de lojas (Nuvemshop, Stone, Bagy), não
  de clínica. Regra fixa não transforma essa amostra num artigo para o leitor da marca — por isso a IA.
- O pacote está **bloqueado** ("dossiê diverge da investigação congelada"): o congelamento é anterior às
  correções da F1 e da hidratação. Refinalizar (grátis) já aplica a F1; não resolve a estrutura.
- Corrigido nesta data, sem contrato novo: pergunta retórica de concorrente não abre artigo; link não é
  posicionado em seção fora do escopo; diferencial do blueprint que contradiz "não cobrir" sai; orgânicos
  com URL limpa na SERP resumida.

### A.3 Proposta — `articleBlueprint` (artigo-modelo)

Uma chamada de IA estruturada (`generateStructuredAI`, Connection DeepSeek da plataforma, a mesma do
Arquiteto e das pautas do Radar), sobre o pacote CONGELADO. Saída validada por Zod:

1. **Sentido das keywords:** como a principal, as complementares e o Assunto se atendem juntos; onde cada
   uma entra (H1, H2, H3, corpo) e a intenção que a SERP mostra. Divergência entre principal e slug publicado
   vira alerta para o Arquiteto — nunca troca silenciosa.
2. **Leitor, promessa e ângulo** contra a SERP (o que a amostra cobre, o que falta, como superar), cada
   afirmação com o id da evidência do pacote (orgânico, PAA, conceito, lente, AI Overview).
3. **Título:** H1, SEO title (até ~60), meta description (até ~155); slug e canonical preservados.
4. **Medidas do artigo ideal:** faixa de palavras (P25–P75 dos concorrentes comparáveis), número de H2 e
   de H3, parágrafos por seção, negritos por seção (termo/entidade, nunca frase inteira), listas e tabelas
   quando a SERP usa.
5. **Seções H2** (cada uma): pergunta do leitor, resposta que abre a seção, H3, o que explicar, evidências
   (ids), termos LSI/entidades, uso do especialista e dos vídeos, entrega prática.
6. **Links internos:** quantos e onde — do grafo aprovado e dos membros do Silo (Pilar, SiloPage, irmãos),
   com âncora, destino resolvido (publicado, planejado ou não resolvido) e o motivo. Nenhum link fora do grafo.
7. **Links externos:** onde uma afirmação pede reforço, o tipo de fonte (oficial, estudo, órgão) e a
   afirmação que ela sustenta. Só fonte verificada vira URL; o resto sai como "fonte a obter".
8. **Abertura e fechamento:** abertura respondendo a dúvida do leitor; virada final e CTA na voz do
   especialista (parecer aceito); próximo passo no Silo.
9. **Plano visual:** capa e 2–3 respiros, cada um ligado a uma seção, com prompt, ALT e legenda.
10. **E-E-A-T/YMYL:** autoria, revisão, cuidado com promessa de resultado.

**Validador do servidor** (recusa e devolve o motivo): id de evidência inexistente; seção fora do escopo
ou "não cobrir"; link fora do grafo/Silo; URL externa sem fonte verificada; título copiado de concorrente;
FAQ; contagens incoerentes com a faixa da SERP.

**Decisão humana:** a IA gera uma cópia de trabalho; o dono revisa, edita e aprova. Só a versão aprovada
vai ao CSV e ao Redator. Versão aprovada é imutável; nova geração cria nova versão.

**Persistência:** versão própria, append-only, presa ao hash do pacote congelado (não refaz o
congelamento). Se o pacote for refinalizado, a versão anterior fica marcada como "de outro congelamento".
Campo opcional no que o export e o Redator leem; quem não conhece ignora.

**Custo:** 1 chamada de IA por artigo, por clique explícito, com o custo mostrado antes. Testes com fixtures.

**CSV:** com artigo-modelo aprovado, `estrutura`, `titulo_e_seo`, `promessa_e_leitor`, `links_internos` e
`plano_visual` saem dele; sem ele, como hoje (F1).

## Adendo B — Vídeos com modos de uso (2026-10-02) — APROVADO (D6), IMPLEMENTADO EM CÓDIGO

Hoje a aba Vídeos só tem "Casar pautas com o conteúdo". Como no Especialista, cada vídeo selecionado para o
artigo ganha um **modo de uso** escolhido pelo dono:

- **Contexto** — o redator lê o resumo do vídeo para entender o assunto (não cita);
- **Sugestão de pauta** — ideias do vídeo viram candidatas a seção/pergunta (passam pelo artigo-modelo);
- **Apoio (suporte)** — trecho com tempo sustenta um ponto do texto, atribuído ao vídeo;
- **Citação** — fala literal, atribuída, com tempo;
- **Incorporar (embed)** — o vídeo entra no artigo, na seção indicada;
- **Não usar**.

"Casar pautas" continua como está e passa a preencher o modo sugerido; o dono confirma ou troca.

**Contrato:** coluna aditiva e opcional `usage` em `radar_article_video_sources` (+ `usage_note`), migration
aplicada pelo dono (`db query -f` + `migration repair`). Rota da biblioteca ganha a ação `SET_USAGE`. O texto
extraído do vídeo entra no pacote conforme o modo (resumo para Contexto, trechos com tempo para Apoio e
Citação, URL e seção para Embed) e chega ao CSV de artigo, ao CSV de vídeo e ao artigo-modelo.

**Rollback:** coluna nula = comportamento de hoje.

## Adendo C — Voz da marca (Skill `brand_voice`) nos entregáveis (2026-10-02) — PEDIDO DO DONO, IMPLEMENTADO EM CÓDIGO

### C.1 Pedido do dono

"Puxar a skill da voz de marca que acabei de subir na aba Skills e prompts da Marca. Ela tem que ser lida e
pode extrair coisas para direcionar como adendo da marca ou diretrizes dentro do nosso entregável; acho que
pode entrar ao concluir os processos da SERP. Tem que estar inclusive para ser útil nos CTAs."

### C.2 Quando ela entra — leitura no uso, com a versão registrada

- A Skill é da **Marca**, versionada e aprovada lá (rascunho → aprovação → ativa). Ela muda por motivos que
  não têm nada a ver com a SERP de um artigo.
- **Não entra no congelamento da investigação.** Copiá-la para o pacote congelado mudaria o hash e obrigaria
  a refinalizar todos os artigos a cada ajuste de voz ("dossiê diverge").
- **Entra quando a SERP termina, no que nasce dela:** o artigo-modelo (IA) recebe a Skill inteira e grava qual
  versão usou; o CSV "para escrever", o CSV de vídeo e o Redator leem a versão corrente no momento da
  exportação e dizem qual versão foi usada e em que estado ela está.
- **Regra de seleção = a canônica da Marca** (spec da Marca §24, `resolveBrandSkill`, a mesma do Redator):
  vale a versão CORRENTE não arquivada — rascunho, aguardando aprovação ou ativa. A primeira versão desta
  proposta dizia "só a ativa"; o mapeamento do código mostrou que isso criaria uma terceira regra para a mesma
  pergunta, contra a spec, e foi corrigido em 2026-10-02. O entregável diz o estado ("em rascunho na Marca").

### C.3 Onde ela aparece

- **CSV "para escrever":** uma linha própria "Voz da marca", logo abaixo da linha de topo, com as seções da
  Skill distribuídas pelas colunas de mesmo assunto (leitor e oferta, título e abertura, estrutura e
  transição comercial, SERP e exclusões, fontes e autoridade, links, plano visual; voz, vocabulário e
  critérios no prompt). Seção sem assunto reconhecido vai inteira para o prompt. Cada artigo recebe a
  instrução de aplicar essa linha no CTA e na copy.
- **CSV de vídeo:** a mesma linha, nas colunas de público, roteiro, fontes e prompt.
- **Artigo-modelo (IA):** a Skill inteira entra no pedido; o CTA, a promessa, o H1 e os prompts de imagem
  seguem a voz; a página comercial do próprio domínio da marca citada na Skill vira candidata a link (só
  entra no texto se a IA a colocar no CTA e o dono aprovar). O payload registra a versão da Skill usada.
- **Redator:** lê a voz CORRENTE não arquivada (rascunho incluído, com o estado dito), ao vivo, nos fundamentos e
  fatias do MCP, na IA interna e na semeadura de roteiro e carrossel; o artigo-modelo aprovado do MESMO
  `bundleHash` também chega ao Redator ao vivo, sem entrar no envio nem mudar o hash.

### C.4 Contrato

Sem tabela nova: leitura server-side da versão ativa pelo repositório de Skills que já existe. Campos
aditivos e opcionais no lote do export e no payload do artigo-modelo (`brandVoice`). Sem Skill ativa, tudo
sai como hoje, com o aviso.

## Adendo D — Artigo-modelo dentro da SERP e finalização automática (2026-10-02) — DECIDIDO PELO DONO

### D.1 Artigo-modelo é dado da SERP

Na primeira geração real a resposta da IA veio cortada ("JSON inválido": a Skill inteira + todas as
evidências + uma planta longa estouraram a saída). O dono: "o artigo-modelo teria que ser parte dos dados da
SERP, não algo separado; a SERP faz o trabalho, a IA só ajuda a organizar". Decisões:

- **D7:** a IA organiza o esqueleto que a SERP já entrega (seções do modelo da SERP, perguntas, conceitos,
  lacunas, medidas, lentes, cada item com id) **ao finalizar a investigação**; o botão avisa a chamada de IA.
  Saída compacta, uma nova tentativa automática quando a resposta vem cortada.
- **D8:** enquanto o dono não aprova, o CSV já sai com a estrutura organizada, marcada "PROPOSTA DA IA —
  aguardando aprovação no Radar"; aprovada (ou editada e aprovada), a marca some. O Redator continua lendo só
  o aprovado.

### D.2 Finalização automática

O código tinha a regra "nada congela sozinho; só o clique" (`lib/radar/investigation-finalization.ts`) e
testes que a travavam; o dono acreditava que Google e Amazon finalizavam sozinhos e pediu o automático
também no YouTube. **D9 (dono, 2026-10-02): automático nos três** — Google, YouTube e Amazon congelam sozinhos
quando a coleta (e a análise/curadoria automática) termina sem pendência, e em seguida a IA organiza o
artigo-modelo. O botão manual continua. O botão que dispara a coleta passa a dizer que ela também finaliza e
chama a IA. Com pendência (amostra insuficiente, falha de coleta, curadoria que exige decisão), nada congela
e a tela diz por quê.

Defeitos do YouTube encontrados no mapeamento (corrigidos junto): a projeção ignorava o Google base como
apoio já coletado (ficava "Coletando" sem botão de finalizar); a gravação do apoio usava trava de versão velha
e engolia o 409; o gerador de consultas duplicava o prefixo ("como como …").

## Decisões pendentes do Adendo

- **D5:** APROVADO pelo dono em 2026-10-02 — botão "Gerar artigo-modelo (IA)" depois de finalizar, 1
  chamada por artigo com custo mostrado; revisão, edição e aprovação humana; só o aprovado vai ao CSV e ao
  Redator. Começa primeiro.
- **D6:** APROVADO pelo dono em 2026-10-02 — modos de uso dos vídeos com migration aditiva, depois do
  artigo-modelo.
