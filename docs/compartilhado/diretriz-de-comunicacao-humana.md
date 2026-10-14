# Diretriz de comunicação humana guiada pela SERP — versão 2026-10-11

**Status:** pedido do dono (2026-10-11), implementado em código. Validado manualmente: não.<br>
**Fonte única em código:** `lib/radar/human-voice-guideline.ts` (`RADAR_HUMAN_VOICE_GUIDELINE_VERSION = "2026-10-11"`).<br>
**Contrato, precedência e testes:** Adendo G de `docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md`.<br>
**Teste:** `tests/radar-voz-humana-serp-2026-10-11.test.mts` (entra em `npm run test:radar`).

## Origem

Esta diretriz traduz, em regras operacionais, três materiais do dono:

- "Diretrizes de comunicação humana" (documento do dono, 2026-10-11);
- "Visão estratégica muito forte sobre a apatia dos conteúdos gerados por IA" (documento do dono, 2026-10-11);
- as observações do Guardião de SEO do site do dono (MiniWordPress) sobre um artigo de teste.

Palavras do dono no pedido: "isso tem que ser corroborado ou tem que acompanhar as coletas da SERP, a ideia
não é inventar algo novo e sim seguir os passos que a SERP mandar mas com essa inclinação de uma comunicação
mais humana, colocando no centro a semântica… com o diferencial de um tom de politicamente incorreto e no
começo no nível 3 e no final no nível 2 de compreensão do público alvo".

## Onde ela vale

O mesmo texto, montado pelas mesmas funções, chega a:

- pedido do artigo-modelo (regras 27 e 28) e conferência da planta nova;
- leitura compartilhada da planta gravada (CSV "Para escrever", CSV de vídeo, Redator e MCP);
- CSV "Para escrever": regra geral da linha "Silo"/"Marca", linha "Voz da marca", colunas `titulo_e_seo`,
  `estrutura`, `plano_visual` e `prompt`;
- CSV de vídeo: regras gerais da linha de topo, linha "Voz da marca", título, descrição e prompt do roteiro;
- Redator: prompts de escrita de seção e de melhoria de trecho, fundamentos e semente de roteiro e carrossel;
- MCP: catálogo da plataforma (`lib/agent/platform-catalog.ts`) e instruções de escrita do servidor.

## Precedência

1. **A SERP manda na substância.** Intenção, funil, tópicos, perguntas, cobertura, medidas e formato saem da
   investigação (SERP > lógica > IA). A diretriz manda na **voz**: como se diz, nunca o que se cobre.
2. **A Skill de voz da marca** (dado da Marca): onde ela suaviza o tom, vale esta diretriz (decisão mais
   recente do dono); onde protege fato, oferta, preço, credencial ou a dignidade da leitora, a Skill vale.
3. **A trava de fonte e o entregável concluído (D10) não mudam.**
4. **Keyword é substância de SEO, não tom** (2026-10-14, SDD silo interligado §7.1): onde a Skill protege a
   gramática e proíbe densidade artificial de repetição, a Skill vale. Fica corrigida a leitura que fazia a
   diretriz vencer a Skill nesse ponto.

## A voz

### A SERP manda no conteúdo; a voz manda na forma

- **O que é:** a investigação da SERP decide o que o artigo cobre; esta diretriz decide como se diz.
- **Como aplicar:** não crie seção, tópico, pergunta nem promessa por causa da voz. A dor e o gancho são as
  perguntas reais da SERP (Pessoas também perguntam, buscas relacionadas) e o contraste com os títulos e as
  promessas do topo.
- **Bom:** a SERP pergunta "qual o segredo para atrair clientes?" e a abertura responde: "Segredo? O que te
  venderam foi postar todo dia. E a agenda continua igual."
- **Ruim:** criar uma seção "o fim do Instagram" só porque soa provocativo, sem pergunta da SERP que a peça.

### Choque de realidade, sem eufemismo

- **O que é:** texto humano não suaviza; diz a situação como ela é. "Politicamente incorreto", no sentido do
  dono, é recusar o tom corporativo morno, a frase pronta e o texto certinho que cheira a robô.
- **Como aplicar:** fale sem rodeio da situação, do mercado, das receitas prontas, da agência genérica de
  posts e anúncios e da vida refém do feed. "Desafio" vira problema; "pequenas diretrizes" vira barreira.
- **Bom:** "Postar todo dia e ver a agenda parada não é falta de esforço. É a receita errada."
- **Ruim:** "As redes sociais apresentam alguns desafios que podem impactar seus resultados."

### Emoção que a leitora reconhece

- **O que é:** cada trecho carrega uma emoção da rotina: cansaço, frustração, dinheiro perdido, raiva da
  receita que não funciona, alívio quando a saída aparece.
- **Como aplicar:** ligue a emoção a uma situação observável da clínica e, logo depois, a uma explicação útil.
  Não repita a mesma dor em todas as seções.
- **Bom:** "O atendimento termina. A cobrança por conteúdo continua."
- **Ruim:** "Sua clínica está invisível e vai morrer se não agir agora."

### Ironia, indireta e duplo sentido, com o alvo certo

- **O que é:** ironia, sarcasmo, indireta e duplo sentido estão liberados. O alvo é a situação, a receita, o
  mercado ou o "algoritmo"; a leitora é aliada, nunca o alvo.
- **Como aplicar:** ataque "o marketing que te venderam", a solução mágica, a promessa da agência comum de
  posts e anúncios; nunca a inteligência, a aparência ou a dignidade da profissional.
- **Bom:** "Por que o marketing que te venderam para clínicas de estética não funciona na vida real" (título
  de exemplo do dono).
- **Ruim:** "Você ainda não entendeu o básico do marketing?"

### Ritmo de fala, texto correto

- **O que é:** humano não escreve reto: frases curtas e longas, quebra, pergunta direta, repetição
  intencional, começo com "E" ou "Mas", palavras fortes e oralidade com moderação ("pra", "tá").
- **Como aplicar:** varie o ritmo dentro do parágrafo. A naturalidade vem da fala; o texto publicado sai sem
  erro de ortografia ou de concordância proposital (ver "Decisão a confirmar" abaixo).
- **Bom:** "E aí vem a parte que ninguém conta. Você posta. Posta de novo. E a mensagem que chega é de quem
  mora a 80 km."
- **Ruim:** escrever "agente vai" ou "os paciente" de propósito para parecer humano.

### Primeira pessoa de quem assina (E-E-A-T)

- **O que é:** quando quem assina é o especialista da aba Especialista, o texto pode falar na voz dele ("eu
  vejo…", "no consultório…"). A autoridade vem de quem estudou e pratica.
- **Como aplicar:** experiência só como relato delimitado do especialista (o parecer aceito, a fala dos
  vídeos da marca); nunca caso, número ou paciente inventado. Sem especialista definido, sem primeira pessoa
  de profissional.
- **Bom:** "Eu vejo isso toda semana: a clínica posta, o anúncio cai e o dinheiro some." (com o especialista
  que assina)
- **Ruim:** "Atendi 300 pacientes que dobraram o faturamento", sem parecer nem fonte.

### Fatos travados: a dificuldade, não a proibição

- **O que é:** a voz não destrava fato. Afirmação sobre plataforma, conversão ou comportamento do público só
  entra com fonte do pacote ou delimitada (a trava de fonte de sempre, `lib/radar/pending-claims.ts`).
- **Como aplicar:** sobre anúncio de saúde e estética no Google e na Meta, fale da dificuldade real (campanha
  reprovada, bloqueio na prática, banimento, conta caindo, dinheiro jogado fora), na voz e na experiência de
  quem assina, sem afirmar proibição universal como fato. O dono: "não vai falar que está proibido, o que tem
  que falar é mais da dificuldade".
- **Bom:** "Quem já tentou anunciar procedimento estético conhece a rotina: campanha reprovada, conta em
  análise, verba parada."
- **Ruim:** "O Google proíbe anúncios de estética."

### Gatilhos com dado real

- **O que é:** dor, perda, medo de perder e contraste estão liberados. Escassez e urgência só com dado real
  da clínica (agenda, vagas, prazo dito pela marca).
- **Como aplicar:** nunca invente escassez, prazo, vaga ou condição especial.
- **Bom:** "Cada mês sem aparecer na busca é paciente da sua região marcando com quem aparece."
- **Ruim:** "Últimas vagas! Só hoje!", sem dado da clínica.

### Começo no nível 3, fim no nível 2 de consciência

- **O que é:** nível 3 (abertura): a leitora já reconhece o problema e já tentou as receitas conhecidas
  (posts, feed, anúncio, agência). Nível 2 (virada e fechamento): ela ainda não entende a busca orgânica como
  solução.
- **Como aplicar:** a abertura fala com quem já tentou e mostra por que as receitas falham (choque de
  realidade). A virada e o fechamento explicam, sem sigla, a estrutura própria no Google: site, páginas de
  serviço, Perfil da Empresa no Google e artigos que respondem às perguntas reais de quem procura na região.
- **Bom:** abertura "Você já postou, já impulsionou, já pagou agência. E a agenda?"; fechamento "Quando alguém
  da sua região procura o procedimento no Google, aparece quem tem site e página explicando o serviço."
- **Ruim:** abrir com "O que é SEO local" ou fechar com "invista em E-E-A-T e silos".
- **Numeração:** o projeto descreve consciência por texto ("Consciente do problema ou tema", "Consciente das
  soluções", "Consciente da solução"; `lib/arquiteto/keyword-dna-engine.ts`), sem número. O documento do dono
  chama de "nível 2" quem "sabe que tem um problema, mas acha que a solução é a receita de bolo tradicional".
  Para não depender da numeração, a diretriz escreve cada nível por extenso, como acima; a ambiguidade está
  registrada no Adendo G.

## O que a SERP guia na página

> **2026-10-14 · regras de keyword e título `2026-10-14` (K1–K9).** SDD
> `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §7, decisões D4, D5 e D6
> (decididas pelo dono em 2026-10-14). A keyword deixou de ser prefixo: as três seções abaixo
> trocaram "keyword no começo", "keyword nos primeiros 60 da meta" e "keyword na primeira frase e no
> primeiro H2". Fonte em código: `RADAR_KEYWORD_RULES_VERSION` e as conferências V1–V7 de
> `lib/radar/human-voice-guideline.ts`. **Precedência:** keyword é substância de SEO, não tom; onde a
> Skill de voz da marca protege a gramática e proíbe densidade artificial de repetição, a Skill vale.
> No vídeo, as regras de keyword mudam na fase F6 da mesma SDD.

### H1 e SEO title: a principal natural uma vez e três ângulos

- **O que é:** a keyword principal, na forma natural (português correto, com a preposição e a flexão que a
  frase pede), aparece uma vez no H1 e uma vez no SEO title, em qualquer posição. O gancho pode vir
  primeiro, e a principal abre no máximo 1 das 3 opções (o H1 e duas alternativas). Cada opção tem um
  ângulo: dor → saída; contraste com o que o topo da SERP promete (as "dicas" e os números); diagnóstico ou
  decisão (fundo de funil). SEO title até ~60 caracteres, com a principal dentro dos primeiros 60.
- **Como aplicar:** leia os títulos do topo e as perguntas da SERP; se o topo promete dicas e guias, o título
  promete o contraste e a saída. Nunca isca genérica ("guia prático", "guia completo", "dicas", "o que é",
  "tudo sobre") nem marca de processo ("(precisa de fonte…)", colchetes de instrução, número de link,
  "TODO"): a afirmação que só entra com fonte sai do título e vira promessa delimitada pela marca.
- **Bom:** "A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com
  estrutura própria"
- **Ruim:** três opções que começam igual: "Captação de pacientes dentista sem anúncios: …", "Captação de
  pacientes dentista sem verba: …", "Captação de pacientes dentista no orgânico: …"

### Meta description natural que dá motivo para clicar

- **O que é:** dor ou contraste, o que a leitora ganha e por que clicar mesmo com resposta de IA no topo
  (autoridade, serviço real, experiência de quem assina). A principal ou uma variação próxima aparece uma
  vez, em qualquer posição; até ~155. As 3 opções seguem os ângulos do título.
- **Como aplicar:** sem "descubra", "aprenda", "dicas" e "guia prático" e sem marca de processo.
- **Bom:** "Post, anúncio e agência e a agenda ainda oscila? Veja como site, perfil no Google e respostas às
  perguntas da recepção ajudam a captação de pacientes para dentista."
- **Ruim:** "Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por
  onde começar a rotina."

### A abertura responde à busca; nenhum H2 abre pela keyword

- **O que é:** o primeiro parágrafo responde à busca com a principal (forma natural) ou uma variação próxima
  nas primeiras ~100 palavras, sem obrigar a primeira frase. Os H2 seguem os subtemas, as entidades e as
  perguntas reais da SERP: nenhum H2 começa pela principal nem por uma complementar; a principal entra em
  no máximo 1 H2; cada complementar entra dentro da seção que trata dela (num H2, só natural, fora do começo
  e em um H2 só); dois H2 não começam pelas mesmas 2 palavras de conteúdo.
- **Como aplicar:** no corpo, a forma natural da principal aparece no máximo 2 + palavras/600 vezes (cerca de
  7 em 3.000 palavras); o resto é variação semântica (sinônimos, entidades e buscas relacionadas que a SERP
  mostra).
- **Bom:** H2 "Por que a agenda sobe com o anúncio e cai quando ele para". **Ruim:** "Captação de pacientes
  dentista sem anúncios começa pelo orgânico" e "Tráfego orgânico como fazer para captar pacientes no dia a
  dia".
- **Planta gravada antes de 2026-10-14 (D6):** a leitura tira a marca de processo do título e da meta (sem
  IA, sem mudar o payload nem o hash) e o CSV diz, como instrução concluída, a forma natural, as opções e os
  H2 que abrem pela keyword, o teto e as variações. H2 reescritos e os 3 ângulos só com "Organizar de novo".

### De 3 a 6 H2 (Regra 8 do Guia)

- **O que é:** o artigo tem de 3 a 6 H2. A cobertura que a SERP pede além disso vira H3 dentro da seção mais
  próxima pelo sentido; nada da cobertura obrigatória some.
- **Planta gravada com mais de 6 H2:** a leitura não muda a planta; ela decide, sem IA, qual seção entra como
  H3 de qual e todo entregável diz isso (ver Adendo G, G.5).

### Sinais de autoridade local (2 ou 3 por artigo)

Escolha os que combinam com o trecho: o site como presença de captação local; as perguntas reais e a
experiência da clínica virando autoridade; o contraste com a vida refém do feed e de posts soltos; a diferença
para a agência comum de posts e anúncios. O método próprio (SEO local, silos, E-E-A-T, sinais locais, captação
própria) aparece como entrega concreta, sem sigla na frente de quem é leigo.

### Fechamento em 4 tempos, um CTA só

Dor → mudança para a estrutura própria no Google → facilidade (a marca faz; a profissional só contribui com o
que sabe) → diagnóstico (o CTA único). A leitura seguinte, quando houver, vai no corpo.

> **2026-10-14b · regras `2026-10-14b` (SDD silo interligado, F3; D7 e D8, decididas pelo dono).** Os 4 tempos
> viram **4 campos conferidos** no artigo-modelo novo (`closing.pain`, `closing.structureShift`, `closing.ease`,
> `closing.diagnosis`). O **diagnóstico é o CTA único**: uma verificação concreta da marca (verbo + o que ela
> olha) e uma chamada só. A **fala aprovada do especialista** alimenta a mudança e a facilidade, na voz dele, e
> **não substitui mais o diagnóstico** (muda o item 6 do Adendo F). A **oferta de diagnóstico** é dado da Marca:
> a seção "Oferta de diagnóstico" da Skill de voz (v2), escrita pelo dono; sem ela, o texto padrão neutro, e o
> painel da Marca mostra a proposta de texto para o dono aplicar (o agente não aplica). Fonte em código:
> `RADAR_CLOSING_RULES_VERSION`, `RADAR_CLOSING_SPECIALIST_RULE` (`lib/radar/human-voice-guideline.ts`),
> `lib/radar/brand-edge.ts` e `lib/marca/brand-diagnosis-offer.ts`.

- **Bom:** "Se a agenda depende do mês em que o anúncio roda, você está alugando a atenção do paciente. A saída é
  o consultório achável no Google: uma página por tratamento, o perfil coerente com o site e as perguntas da
  recepção respondidas. Eu pesquiso, escrevo e publico; você revisa o que é clínico. Quer saber por onde
  começar? Eu olho seu site, seu perfil no Google e as perguntas que mais chegam, e te digo o que falta."
- **Ruim:** fechar com três chamadas (agende, siga no Instagram, baixe o e-book), ou pôr a fala inteira do
  especialista ("Vamos planejar a presença orgânica da sua clínica?") no lugar do diagnóstico.

### Afirmação concreta, ressalva uma vez

- **O que é (regras `2026-10-14b`):** afirme de forma delimitada e concreta — o que a marca verifica, faz ou
  mede, com número e fonte quando o pacote os traz; a afirmação que precisa de cuidado leva a ressalva **uma
  vez**, onde ela está; nunca "pode", "não garante", "não significa" em série, seção após seção. Sem fonte nem
  experiência da marca, corte a afirmação em vez de empilhar ressalva.
- **Por quê:** o artigo do caso real (Suporte "captação de pacientes dentista") saiu com 52 "não", 45 "pode" e
  0 dado próprio: correto, mas genérico e cheio de ressalvas, sem informação nova.
- **Como aplicar:** troque a série de "pode" e "não garante" pelo que a marca verifica, faz ou mede. A trava de
  fonte continua (regra geral 5): o fato sem fonte sai ou vira o que a marca verifica.
- **Bom:** "Eu olho as perguntas que chegam na recepção e transformo as cinco mais repetidas em páginas."
- **Ruim:** "O orgânico pode ajudar, mas não garante resultado, não significa agenda cheia e pode levar tempo."

### Capa obrigatória e imagem útil no corpo

Uma capa e ao menos uma imagem útil no corpo (o plano visual pede dois ou três respiros, cada um ligado a uma
seção). A imagem explica a ideia da seção; não prova resultado.

### Links internos reais

Só os links do plano, cada um para a URL canônica do destino, com a âncora natural (regra de 2026-10-11 em
`lib/radar/natural-anchor-rule.ts`; esta diretriz não a duplica).

### Links externos de autoridade (regras `2026-10-14c`)

Autorização do dono (2026-10-14, SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md`
§16.2, Fase B): com fontes verificadas pelo Radar (id X: governo, conselho, ciência, Wikipédia, documentação do
Google), o corpo leva de 2 a 5 links externos, cada um na frase que ele sustenta, com âncora natural no nome
da entidade ("segundo o Ministério da Saúde", "a Wikipédia define…"); nunca uma URL fora das verificadas nem
link para concorrente comercial. Afirmação de saúde sem fonte verificada não é afirmada (o texto delimita ou
omite). A régua é a de `lib/radar/authority-sources-writing.ts` e a regra 7 do artigo-modelo; esta diretriz
não a duplica, e a voz continua a mesma: a fonte reforça a afirmação concreta, não vira ressalva em série.

## Decisão a confirmar com o dono: erro proposital

O dono pede "pequenos erros" como sinal humano. A diretriz entrega isso como **naturalidade de fala**
(oralidade, repetição intencional, frase quebrada, começo com "E" ou "Mas", palavras fortes) e **não** gera
erro de ortografia ou de concordância proposital no texto publicável: o Guardião de SEO e a autoria E-E-A-T
leem qualidade, e o erro proposital vira ruído na correção. A constante
`RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS = false` documenta o estado; ligá-la exige implementar a geração e uma nova
decisão registrada.
