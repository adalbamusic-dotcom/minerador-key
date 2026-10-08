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

## Adendo D — Artigo-modelo dentro da SERP e finalização automática (2026-10-02) — DECIDIDO PELO DONO, IMPLEMENTADO EM CÓDIGO

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

### D.3 Implementação (2026-10-02) — verificado no código e confirmado por teste

- **D7:** o artigo-modelo recebe o esqueleto da SERP com ids (`M…`) e organiza só ele; schema e limites
  compactos, fatias da voz por assunto em vez da Skill inteira, `thinkingMode` desligado e 1 nova tentativa
  quando a resposta vem cortada ou inválida. Congelar (Google, YouTube ou Amazon) encadeia a organização. O
  encadeamento manda `ifMissing`: se o MESMO `bundleHash` já tem versão (aprovada primeiro), ela é devolvida
  ANTES de resolver o provider — acrescentar YouTube ou Amazon a um artigo do Google não paga a IA de novo. O
  botão "Organizar de novo (IA)" não manda a opção.
- **D8:** o export lê, por lote, a aprovada do pacote vigente, senão a proposta mais nova do mesmo pacote, com
  a marca `PROPOSTA DA IA — aguardando aprovação no Radar`. O Redator segue só com a aprovada.
- **D9:** `radarGoogleAutoFinalizeDecision` (Google) e `radarProfileAutoFinalizeDecision` (YouTube e Amazon)
  decidem; a tela usa as MESMAS ações dos botões. Pendência para e diz o motivo e o botão manual
  (`radarProfileManualStepLabel`). Os botões de coleta dizem "· e finaliza (+ 1 chamada de IA)"; o de
  finalizar, "· inclui 1 chamada de IA".
- **Defeito encontrado na homologação (corrigido):** a cópia de leitura esvaziava TODA corrida quando
  QUALQUER fotografia existia. Com o Google finalizado, a coleta viva do YouTube (51 vídeos gravados) sumia da
  tela depois de recarregar ("Nenhuma coleta ainda") e o botão de finalizar não aparecia — o automático nunca
  teria em que agir. Agora cada corrida só sai quando a fotografia DO SEU perfil existe:
  `compactRadarResearchForRead` (TS) e a função `editorial_radar_versao_compactada` (migration
  `20261002130000_compactacao_por_perfil.sql`, rollback em `supabase/rollback/`), com teste de paridade.
  A migration é aplicada pelo dono; sem ela, o servidor Next já corrige a compactação dele, mas a view continua
  entregando a cópia antiga à listagem.
- **Pendente de decisão do dono:** o clique manual em "Analisar" na Amazon continua encadeando o congelamento
  quando não há pendência (hoje: sim, pela mesma função do automático).

## Decisões pendentes do Adendo

- **D5:** APROVADO pelo dono em 2026-10-02 — botão "Gerar artigo-modelo (IA)" depois de finalizar, 1
  chamada por artigo com custo mostrado; revisão, edição e aprovação humana; só o aprovado vai ao CSV e ao
  Redator. Começa primeiro. (Substituído em parte por D7 e D8: organiza ao finalizar, e o CSV leva a
  proposta marcada até a aprovação; o Redator continua só com o aprovado.)
- **D6:** APROVADO pelo dono em 2026-10-02 — modos de uso dos vídeos com migration aditiva, depois do
  artigo-modelo.

## Adendo E — Reparar o congelamento, cirúrgico e por perfil (2026-10-02) — APROVADO PELO DONO, IMPLEMENTADO EM CÓDIGO

### E.1 Problema (diagnóstico do artigo do Instagram, só leitura)

O pacote congelado do Google é de 2026-10-02 02:44Z. Depois dele, a limpeza de cabeçalhos de concorrentes
(`radarCleanCompetitorHeading`) mudou os ids dos conceitos lidos das MESMAS extrações: o dossiê de hoje tem
outros conceitos e 12 afirmações a sustentar contra 13 no congelado. A divergência é real e bloqueia o
Redator e o CSV. Refinalizar não grava (`finalizeRadarDeepResearch` recusa investigação já finalizada); o
único caminho era o reset, que descarta extrações e obriga coleta paga. O mesmo pode acontecer com o YouTube
e a Amazon sempre que a leitura (blueprint) mudar depois do congelamento.

### E.2 Decisão do dono (2026-10-02)

"Recongelar com a leitura atual" como botão cirúrgico, no espírito do "Diagnosticar e reparar" do Arquiteto
(`docs/04-arquiteto/sdd-reparo-pontual-do-artigo-2026-10-01.md`): arruma o defeito sem mexer no resto. Um
botão POR PERFIL — Google, YouTube e Amazon, cada um separado —, com as duas saídas incorporadas:

1. **Recongelar com a leitura atual (grátis):** quando o material já coletado basta, a fotografia é refeita
   com o código de hoje sobre ele. Nenhuma chamada ao provider.
2. **Zerar e coletar de novo (pago):** quando o material gravado não basta (fundamento mudou, corrida ausente
   ou que não confere, amostra que não sustenta congelar), o botão zera SÓ aquele perfil e começa a coleta de
   novo — chamada paga, confirmada antes.

Salvaguardas para as situações a que se destina.

### E.3 Desenho

- **Diagnóstico é leitura.** O clique abre a prévia: relê a versão corrente do servidor (cheia), projeta a
  investigação reaberta, recalcula a fotografia com o código de hoje e compara com a congelada. Saídas:
  - *Nada a reparar*: a fotografia já corresponde à leitura atual — nenhuma escrita.
  - *Recongelar (grátis)*: diz O QUE divergiu (conceitos, afirmações, links, amostra; partes do blueprint).
  - *Zerar e coletar (pago)*: diz por que o material gravado não basta.
  - *Não finalizada*: o botão não se aplica (use Finalizar).
- **Google (grátis):** o ensaio roda `finalizeRadarDeepResearch` e `freezeRadarEvidenceBundle` sobre a
  projeção reaberta; só se os dois passam, grava (1) a versão reaberta — que a trava de escrita já aceita
  (`radarGoogleResearchWriteLock`: próxima sem `finalizedBundle`) — e (2) o congelamento pela MESMA rotina do
  botão "Finalizar pesquisa" (carimbo de standing e lentes no servidor, readback, artigo-modelo). Nenhuma
  mudança de servidor.
- **YouTube (grátis):** confere a corrida gravada contra a referência da fotografia
  (`resolveRadarFrozenRun`), monta a fotografia pela MESMA função do botão Finalizar e grava numa escrita.
- **Amazon (grátis):** nova ação aditiva `refreeze` na rota (`dryRun` para a prévia): analisa a coleta gravada
  sem a fotografia e congela numa única versão sucessora. Sem provider.
- **Pago:** o reset JÁ EXISTENTE do perfil e, confirmado o reset pelo readback, o início da coleta pelo MESMO
  handler do botão de iniciar. O Google zera só o Google; YouTube e Amazon, só o seu perfil.

### E.4 Salvaguardas

1. O botão só aparece com o perfil finalizado e sem outra ação em curso no artigo.
2. Nada é gravado no diagnóstico; "nada a reparar" não grava.
3. Confirmação explícita, com as consequências ditas antes: nova versão (a anterior fica no histórico,
   append-only); o pacote muda de hash, então o artigo-modelo da SERP é organizado de novo (1 chamada de IA,
   +1 se cortar) e precisa de nova aprovação; se o pacote já foi ao Redator, ele mostra "Atualização
   disponível"; URL, slug, canonical, keyword, papel e Silo não mudam.
4. O caminho pago diz o custo antes e só começa a coleta depois de o reset ser confirmado pelo servidor.
5. Google em duas escritas: o ensaio prévio garante que o congelamento passaria; se a segunda escrita falhar
   mesmo assim, a investigação fica reaberta (não perdida) e "Finalizar pesquisa" conclui — a frase diz isso.
6. Sem ferramenta MCP: decisão humana na tela (catálogo registra a etapa).

### E.5 Compatibilidade, riscos, rollback e testes

- Sem migration e sem mudança de schema. Rota Amazon: ação nova, aditiva; as demais intactas.
- Rollback: reverter o código; os dados são versões append-only — a versão anterior continua no histórico.
- Testes: domínio do diagnóstico (Google, YouTube, comparação sem carimbos de tempo), servidor Amazon
  (`dryRun` sem escrita, nada a reparar sem escrita, recongelar numa escrita, recusa sem fotografia), regras
  estruturais da tela (prévia antes da escrita, ensaio antes de reabrir, pago só depois do readback do reset).

## D10 — O entregável sai concluído (decisão do dono, 2026-10-02) — IMPLEMENTADO EM CÓDIGO

Pedido do dono: "em tudo que tenha a ver com o entregável, CSV, e o que vai para o Redator e MCP, eles não
podem receber algo inconcluso, nem com esse aviso de precisa de aprovação. Então coloca tudo concluído, o
prompt já finalizado, ou fechado." **Substitui D8** e a parte de D5 que exigia aprovação para o artigo-modelo
valer. É uma exceção do dono, para o artigo-modelo, à regra "IA aplicada não significa aprovada" (AGENTS §9):
a decisão humana passa a ser **editar** (cada edição vira a versão vigente) ou **organizar de novo**.

- Organizar grava a versão já concluída (`state = APPROVED`, com autor e momento; o CHECK do banco já aceita,
  sem migration). Com pendência na conferência (origem M de outro assunto, afirmação absoluta, seções quase
  iguais, abertura de outro assunto), UMA chamada a mais devolve a planta corrigida; a conferência fecha o que
  dá sem IA (a origem errada sai). O resto fica registrado na versão (painel), nunca no entregável.
- Editar grava outra versão concluída. "Concluir esta versão" só aparece para rascunho antigo.
- CSV para escrever, CSV de vídeo, Redator e MCP: sem "PROPOSTA DA IA", "aguardando aprovação", pendência ou
  "rascunho para revisão"; seção sem origem na SERP sai como "proposta editorial do artigo"; o prompt sai
  fechado.
- Testes: `tests/radar-artigo-modelo-concluido.test.mts` e os testes de marcação reescritos para provar a
  ausência das marcas.

## Adendo F — Revisão dos entregáveis (2026-10-08) — AUTORIZADO PELO DONO, IMPLEMENTADO EM CÓDIGO

**Status:** verificado no código e confirmado por teste (fixtures, sem provider nem IA); validado
manualmente: não — a homologação é do dono. Detalhe, arquivos, consumidores preservados, limites e
contagens em `docs/05-radar/estado-atual.md` ("Revisão dos entregáveis", 2026-10-08) e, para o Redator, em
`docs/07-redator/estado-atual.md` (2026-10-08).

### F.1 Pedido e origem

Dono no chat (2026-10-08): "pode fazer os seus ajustes, e rodadas, depois documenta, tudo para deixar tudo
otimizado com todas estes reajustes para todas as demais operações". Origem: os dois CSVs reais de 08/10 do
artigo "como atrair clientes pelo instagram" (slug publicado `instagram-nao-traz-pacientes`), cujo
artigo-modelo foi montado antes de 2026-10-02. Módulo proprietário: Radar; Redator e catálogo MCP com
mudanças aditivas (AGENTS §4), com uma exceção de valor registrada em F.2.8.

### F.2 Decisões

1. **A página publicada entra no gerador e grava o mapa da atualização (`publishedMap`).** No artigo
   publicado com URL, a organização lê o H1 e os H2 de hoje com o MESMO leitor do export (só GET, até 10 s;
   falha, tempo esgotado ou página vazia seguem sem ela; reaproveitar a versão do pacote por `ifMissing` não
   lê nada). A página publicada é atualização: o que ela já cobre dentro do escopo e a amostra não cobre é
   diferencial e fica na planta. A IA devolve, para cada H2 de hoje, `{ current, section, reason }` — `section`
   é a seção da planta (1-based) que o absorve; só `null` explícito quer dizer "sai", com motivo. A conferência
   renumera o mapa para a ordem da planta e casa pelo título o que a IA omitiu ou numerou errado
   (`origin: "match"`); sem par, o H2 fica como seção própria. **Nada sai da página sem decisão.** Na planta
   antiga, sem mapa gravado, o export faz o casamento determinístico com os H2 lidos no ar: a complementar que
   a planta põe numa seção leva para ela o H2 publicado que a contém, e o H2 sem par nunca vai antes da 1ª
   seção. O CSV "Para escrever" troca "leve-a como pendência" por esse mapa, com frase concluída por H2.
2. **A abertura responde à busca.** A abertura e a 1ª seção respondem à intenção da keyword principal
   (principal "como …" pede a 1ª seção prática); a tese ou o contraponto da marca vem depois, sem negar o
   assunto do artigo. A conferência anota (só no painel) a 1ª seção que abre pelo diagnóstico; na planta
   antiga, o export dá a "Ordem de leitura" como instrução concluída.
3. **Trava de fonte por sentido, em todos os entregáveis.** Uma régua só, pura e por frase
   (`radarSentenceNeedsSource`, a mesma porta do CSV de vídeo), lê o SENTIDO: efeito comercial ou conversão,
   comportamento do público e afirmação sobre plataforma sem fonte do pacote. A polaridade fica: a tese que
   nega o efeito ("o Instagram, sozinho, não enche a agenda"), a orientação (imperativo, "deve", orientar
   contra), o modal ("pode ampliar") e a frase coberta por fonte do pacote passam. Onde vale:
   - CSV "Para escrever": "(precisa de fonte: <motivo>)", a marca da regra geral 5, mais a linha concluída
     "Afirmações que só entram com fonte do pacote ou delimitadas (regra geral 5): …" — também no H1, SEO
     title, meta description, próximo passo, ALT e legenda;
   - CSV de vídeo: sai do texto publicável, fica como fala delimitada na produção e entra na lista "Fica fora"
     com o motivo; a afirmação absoluta (regra universal) entra na lista e fica fora também da fala, como
     decidido em 2026-10-02;
   - Redator e MCP: `needsSource` por frase, no topo e por seção; o texto da planta não muda e o motivo nunca vai
     ao texto.

   O link externo sem fonte do pacote deixa de ser link: a afirmação sai delimitada. Nenhum motivo diz "fonte a
   obter".
4. **Nomes atuais de produto.** "Google Meu Negócio" e "Google My Business" viram "Perfil da Empresa no
   Google" por normalização determinística na conferência e na leitura para o export e o Redator, o que vale
   também para artigo-modelo antigo. Ficam a keyword que traz o nome antigo, a menção "antigo …"/"ex-…", o H2
   atual da página, os ids e as evidências. O pedido à IA ganhou a regra "use os nomes atuais".
5. **Marcador de relato substituído (D10 + voz da marca).** "[RELATO DA MARCA — preencher]" saiu do CSV "Para
   escrever". Sem material próprio da marca, o artigo é escrito sem relato e sem inventá-lo — o que a própria
   Skill de voz da marca manda para o artigo explicativo sem caso próprio. É decisão desta rodada.
6. **Links planejados como instrução condicional.** O destino ainda não publicado vira instrução concluída: o
   link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; se este artigo for
   ao ar primeiro, a âncora fica como texto simples, sem link (nunca link quebrado). O caminho planejado não é
   endereço publicado. A ordem de publicação é decisão do dono; nada acrescenta o link depois sozinho nesta
   rodada.
7. **Versão das regras do artigo-modelo.** `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION = "2026-10-08"` é gravado em
   `payload.rulesVersion` e preservado na edição; mudou regra do pedido ou da conferência, muda a data. A tela
   do Radar (operacional, não entregável) avisa a versão montada antes das regras atuais e aponta o
   "Organizar de novo (IA)" que já existe — sem botão novo e sem regerar sozinho (pago). Até regerar, o export
   protege a planta antiga. No Redator, `WRITER_BLUEPRINT_READING_RULES` ("2026-10-08") entra no etag da fatia
   `radar.blueprint` e do manifesto.
8. **Rótulo da voz em todo entregável (D10).** CSV "Para escrever", CSV de vídeo, semeadura do Redator e MCP
   dizem "ativa" ou "versão corrente na Marca"; o estado de tela ("em rascunho", "aguardando aprovação") fica
   nas telas da Marca e do Radar (`radarBrandVoiceLabel` preservado). No MCP, `brandVoice.statusLabel` mudou de
   valor — a única mudança de valor de campo existente nesta rodada; o estado técnico continua em
   `brandVoice.status`, e nenhum código decide pelo texto do rótulo (grep). O texto da Skill é transcrito como a
   Marca o escreveu e fica fora da varredura D10; mudá-lo é decisão do dono, na Marca.

Também nesta rodada, sem contrato novo (detalhe no estado atual): cabeçalhos dos concorrentes sem ruído;
"Como superar a SERP" sem costurar temas já cobertos; perguntas deste artigo × "Não cobrir" × outro do Silo;
medidas de parágrafos pela faixa de palavras; no CSV de vídeo, corte só com utilidade de 1 ponto ou mais, a
cena pela ideia e H3 só como passo quando é ação; as esperas antigas ("a definir", "conferir antes")
reescritas como instrução concluída.

### F.3 Compatibilidade, riscos e rollback

- **Campos opcionais e aditivos:** `blueprint.publishedMap?`, `publishedStructure?`, `rulesVersion?` e
  `measures.plan.paragraphsMin?`/`paragraphsMax?`/`wordsPerParagraph?` dentro de
  `radar_article_blueprints.payload` (`jsonb`): sem migration. Nenhum leitor faz parse `.strict()` do payload,
  e o Redator lê por caminho JSON. O payload antigo continua válido no código novo, e o novo no código antigo
  (os campos a mais são ignorados) — testes de compatibilidade antigo × novo nas colunas e no Redator.
- **Assinaturas:** só parâmetros opcionais novos (`readPublishedStructure?`, `keywords?` nas leituras,
  `RadarArticleBlueprintColumnsOptions`, `cortes?`/`fatoComFonte?` no prompt do vídeo); rotas intactas; nenhuma
  ferramenta MCP nova. O pacote congelado e o seu hash não mudam: o artigo-modelo e a voz continuam fora do
  congelamento (Adendo C).
- **Exceções registradas:** o valor de `brandVoice.statusLabel` no MCP (F.2.8) e o etag da fatia
  `radar.blueprint`, que muda uma vez (quem tiver o antigo só relê).
- **Riscos:** a régua lê palavras, não sentido de fato (falso positivo e falso negativo; limites declarados no
  estado atual); as notas novas da conferência fazem a passada de correção paga disparar com mais frequência;
  a rota de geração ficou perto do teto (≈ 280 s de 300 s no pior caso, não medido) — contido depois da
  revisão por um prazo único de 280 s (`RADAR_ARTICLE_BLUEPRINT_ROUTE_BUDGET_MS`): a nova tentativa e a
  passada de correção usam o que sobra e, sem 30 s, não são pedidas; a leitura da página na geração depende
  de rede, contida em 10 s.
- **Rollback:** reverter o código. Não há migration nem dado obrigatório novo; as plantas gravadas com os
  campos novos continuam legíveis depois do rollback, e as antigas continuam legíveis sem ele.

### F.4 Testes e validação

- Confirmado por teste: `npm run test:radar` 2.999 testes (2.998 pass, 0 fail, 1 skipped), `npm run
  test:redator` 357/357, `npm run test:redator:mcp` 144/144, `npm run test:redator:dom` 19/19, `npm run
  test:agent` 65/65; testes novos `tests/radar-fonte-por-sentido.test.mts`,
  `tests/radar-artigo-modelo-2026-10-08.test.mts`, `tests/radar-csv-escrever-2026-10-08.test.mts` e
  `tests/radar-csv-video-2026-10-08.test.mts`, com varredura D10 do arquivo inteiro; mutantes só em cópias no
  scratchpad, todos mortos.
- Validado manualmente: não. Fica com o dono: reexportar os dois CSVs do caso real pela tela, conferir a tela do
  artigo-modelo (aviso de regras anteriores, mapa, parágrafos) e ler `get_writer_foundations` pelo MCP; depois,
  regerar os artigos-modelo anteriores às regras de 2026-10-08 e decidir a ordem de publicação dos destinos
  planejados.
