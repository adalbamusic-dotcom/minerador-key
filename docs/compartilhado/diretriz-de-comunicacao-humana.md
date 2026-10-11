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

### H1 e SEO title: keyword no começo e gancho de contraste

- **O que é:** a keyword principal no começo; depois, o gancho de dor e contraste comercial que diferencia dos
  títulos do topo da SERP. Três opções (o H1 e duas alternativas); SEO title até ~60 caracteres.
- **Como aplicar:** leia os títulos do topo e as perguntas da SERP; se o topo promete dicas e guias, o título
  promete o contraste e a saída. Nunca isca genérica ("guia prático", "guia completo", "dicas", "o que é",
  "tudo sobre").
- **Bom:** "Como atrair um cliente sem depender de post e de anúncio que cai"
- **Ruim:** "Como atrair um cliente: guia prático para clínicas"

### Meta description que dá motivo para clicar

- **O que é:** dor, contraste, o que a leitora ganha e por que clicar mesmo com resposta de IA no topo
  (autoridade, serviço real, experiência de quem assina). Keyword nos primeiros 60 caracteres; até ~155.
- **Como aplicar:** sem "descubra", "aprenda", "dicas" e "guia prático".
- **Bom:** "Como atrair um cliente quando o feed não traz ninguém: o que muda com site, páginas de serviço e busca
  na sua região."
- **Ruim:** "Descubra como atrair um cliente com estratégias práticas e dicas."

### Keyword na primeira frase e no primeiro H2

- **O que é:** a primeira frase do corpo traz a keyword principal; o primeiro H2 traz a keyword ou um recorte
  forte dela (todas as palavras de conteúdo da principal).
- **Bom:** primeiro H2 "Como atrair clientes quando o post não traz ninguém". **Ruim:** "Contexto do mercado".

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
que sabe) → diagnóstico (o CTA único que já existe). A leitura seguinte, quando houver, vai no corpo.

### Capa obrigatória e imagem útil no corpo

Uma capa e ao menos uma imagem útil no corpo (o plano visual pede dois ou três respiros, cada um ligado a uma
seção). A imagem explica a ideia da seção; não prova resultado.

### Links internos reais

Só os links do plano, cada um para a URL canônica do destino, com a âncora natural (regra de 2026-10-11 em
`lib/radar/natural-anchor-rule.ts`; esta diretriz não a duplica).

## Decisão a confirmar com o dono: erro proposital

O dono pede "pequenos erros" como sinal humano. A diretriz entrega isso como **naturalidade de fala**
(oralidade, repetição intencional, frase quebrada, começo com "E" ou "Mas", palavras fortes) e **não** gera
erro de ortografia ou de concordância proposital no texto publicável: o Guardião de SEO e a autoria E-E-A-T
leem qualidade, e o erro proposital vira ruído na correção. A constante
`RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS = false` documenta o estado; ligá-la exige implementar a geração e uma nova
decisão registrada.
