import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * Ajuda do Arquiteto para quem não conhece SEO (dono, 2026-09-30: "vai ter
 * muitos user inexperientes em SEO mexendo, e o sistema tem que dar suporte
 * nas infos"). Cada texto descreve o que a tela faz hoje; quando um processo
 * ou botão mudar, este arquivo muda na mesma entrega, junto do catálogo das
 * IAs (lib/agent/platform-catalog.ts).
 */

const GENERAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "sobre-o-arquiteto",
    title: "Para que serve o Arquiteto",
    summary: "Organiza as keywords aprovadas em artigos e Silos, melhora os artigos já publicados e prepara cada artigo para o Radar.",
    description: "O Arquiteto recebe do Minerador as keywords aprovadas e decide onde cada uma trabalha melhor: em um artigo já publicado, em um Assunto declarado ou em um artigo novo. Ele não escreve texto e não publica nada; ele define a estrutura que as próximas etapas vão seguir.",
    sections: [
      { heading: "O que ele entrega", body: "A definição de cada artigo (ArticleDNA: principal, secundárias e papéis), a organização em Silos (SiloDNA e a página do Silo) e o mapa de links internos." },
      { heading: "O que ele nunca faz sozinho", body: "Não troca a URL, o slug nem o canonical de uma página publicada, não move keyword sem a sua confirmação e não aprova nada no seu lugar. A IA sugere; você decide." },
    ],
    howToUse: [
      "Comece pelo cartão “Próximo passo”, no topo da aba Artigos: ele mostra uma frase e um botão só.",
      "Siga os botões numerados (1, 2, 3) e confira a tabela antes de gravar.",
      "Use “Detalhes técnicos” apenas quando quiser ver a análise completa.",
    ],
    keywords: ["arquiteto", "artigos", "silos", "estrutura", "articledna", "silodna", "o que faz"],
  },
  {
    id: "ordem-recomendada",
    title: "Ordem recomendada de trabalho",
    summary: "As três abas no topo seguem a ordem do trabalho: Silos → Artigos → Links internos. No fim, os aprovados vão ao Radar.",
    description: "Cada etapa usa o resultado da anterior. Primeiro o Arquiteto reconhece os Silos dos artigos publicados; depois melhora os publicados e forma os artigos novos; por fim liga os artigos entre si e envia os aprovados ao Radar.",
    howToUse: [
      "Importar do Minerador: traga as keywords aprovadas (botão no topo).",
      "Silos: “Processar arquitetura”, confira e use “Confirmar propostas novas”; desfaça os Silos sugeridos que não quer; depois “Continuar para Artigos”.",
      "Artigos: siga o cartão “Próximo passo” para melhorar os publicados; depois “Processar artigos” e “Concluir formação” para os artigos novos, ou crie a partir das Sobras.",
      "Links internos: “Processar links”, revise e “Confirmar links internos”; selecione os artigos prontos e use “Enviar ao Radar” no rodapé.",
    ],
    keywords: ["ordem", "fluxo", "etapas", "passo a passo", "por onde começar", "sequência"],
  },
  {
    id: "conceitos-basicos",
    title: "Silo, artigo, principal e secundária",
    summary: "Silo é um grupo de artigos do mesmo tema; cada artigo tem uma keyword principal e até cinco de apoio.",
    description: "Pense no site como uma biblioteca. O Silo é a estante de um tema; cada artigo é um livro dessa estante; a página do Silo é a placa que apresenta a estante e aponta para os livros.",
    sections: [
      { heading: "Principal", body: "A busca mais importante do artigo. Ela dá nome ao artigo, orienta o título (H1) e, em artigo novo, o slug." },
      { heading: "Secundária", body: "Outra busca que pede o mesmo conteúdo. Ela reforça o artigo e soma volume." },
      { heading: "Reforço narrativo", body: "Uma busca vizinha que ajuda a contar a história do artigo, sem disputar o título." },
      { heading: "Limite", body: "No máximo seis keywords por artigo: uma principal e até cinco de apoio. Uma ou duas boas bastam; não é preciso encher." },
    ],
    keywords: ["silo", "artigo", "principal", "secundária", "reforço narrativo", "página do silo", "silopage", "seis keywords", "h1", "slug"],
  },
  {
    id: "publicado-travado-livre",
    title: "Artigo publicado: Travado ou Livre",
    summary: "Página publicada nunca muda de endereço. Travada mantém a principal; Livre pode ganhar uma principal com mais volume.",
    description: "O Posto de cada página publicada é declarado no Minerador. Travado ao slug: a principal fica, o artigo só recebe keywords de apoio. Livre: se a principal atual não tem volume, o Arquiteto pode propor uma principal com volume que leve o núcleo do slug; a antiga vira secundária.",
    sections: [
      { heading: "Sempre preservado", body: "URL, slug, canonical, marca e o Silo da página. Nada é apagado, redirecionado ou fundido." },
      { heading: "Posto não declarado", body: "O Arquiteto não troca a principal: só entram keywords de apoio até você declarar o Posto no Minerador." },
      { heading: "Página que já ranqueia", body: "Se a página já aparece no Google para a principal, a principal não é trocada; ela só recebe apoio." },
    ],
    keywords: ["publicado", "travado", "livre", "posto", "url", "slug", "canonical", "trocar principal", "ranqueia"],
  },
  {
    id: "assunto-declarado",
    title: "Assunto declarado",
    summary: "Assunto é o tema que você quer cobrir. Ele fica como fundamento do artigo, fora das seis keywords.",
    description: "Um Assunto pode não ter volume no Google; ele serve de tronco. O Arquiteto busca keywords com volume que sustentem esse tema e forma o artigo com elas. Um Assunto sozinho aparece como “Assunto · aguardando sustentação”, que é um estado normal.",
    keywords: ["assunto", "tronco", "sustentação", "aguardando sustentação", "tema"],
  },
  {
    id: "volume-primeiro",
    title: "Por que keyword sem volume fica de fora",
    summary: "Keyword sem volume no Google Ads não é sugerida: ninguém a procura, então ela não traz visitas.",
    description: "Volume é quantas vezes por mês a busca é feita, segundo o Google Ads. Uma keyword sem volume não entra como apoio, nem como principal nova, nem na coleta paga da SERP. Ela continua visível, recolhida em “Sem volume”, e nada é apagado. O Assunto é a única exceção: ele é o tema, não uma busca.",
    keywords: ["volume", "sem volume", "google ads", "demanda", "zero", "por que não aparece"],
  },
  {
    id: "mesmo-assunto-no-google",
    title: "Como o Arquiteto sabe que duas buscas são o mesmo assunto",
    summary: "Ele compara as 10 primeiras páginas do Google das duas buscas: 3 ou mais páginas em comum é forte; 2 é provável; 0 ou 1, outro assunto.",
    description: "SERP é a página de resultados do Google. Se o Google mostra as mesmas páginas para duas buscas, ele entende que elas pedem o mesmo conteúdo, e um só artigo pode ranquear para as duas. Se mostra páginas diferentes, cada busca merece o seu artigo.",
    sections: [
      { heading: "Quatro lentes", body: "A SERP é lida em quatro aparelhos: computador Windows, computador Mac, celular Android e iPhone. Diferença entre eles é um sinal, não um erro; faltando uma lente, a SERP fica incompleta e a tela diz isso." },
      { heading: "Cache", body: "Toda SERP coletada fica guardada por 30 dias e é reaproveitada sem custo. Só se paga o que ainda não está guardado." },
      { heading: "Autoridade", body: "O que o Google mostra vale mais do que a leitura por palavras e do que a IA." },
    ],
    keywords: ["serp", "mesmo assunto", "páginas em comum", "top 10", "quatro lentes", "4 lentes", "cache", "forte", "provável"],
  },
  {
    id: "custos",
    title: "O que é grátis e o que é pago",
    summary: "Buscar ideias no Google Ads e ler o cache é grátis. Coletar SERP e medir allintitle é pago, sempre com o custo mostrado antes.",
    description: "Nenhuma ação paga acontece sem uma confirmação sua com o valor máximo. O que já foi pago fica guardado e não é cobrado de novo, mesmo se a tela parar no meio.",
    sections: [
      { heading: "Grátis", body: "Buscar keywords no Google Ads (usa a cota do Google Ads), ler a SERP guardada, gravar melhorias, desfazer Silo, aprovar artigos e montar links internos." },
      { heading: "Pago", body: "“Validar no Google” (SERP nova), “Processar artigos” quando falta SERP, “Medir allintitle (pago)” e as buscas em lote com teto de US$ 1,00." },
      { heading: "IA", body: "A leitura da IA usa a conexão de IA configurada para a marca." },
    ],
    keywords: ["custo", "pago", "grátis", "preço", "us$", "dólar", "cobrança", "cota", "google ads", "dataforseo"],
  },
];

const IMPROVEMENT_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "proximo-passo",
    title: "Cartão “Próximo passo”",
    summary: "Mostra uma frase e um botão só: o que fazer agora para melhorar os publicados e os Assuntos.",
    description: "O cartão lê o estado do trabalho e oferece a próxima ação. Os botões numerados seguem a ordem 1 · Buscar keywords, 2 · Validar no Google e 3 · Gravar melhorias. Quando não há nada a fazer nos publicados, ele leva às Sobras ou aos artigos novos.",
    sections: [
      { heading: "Continuar", body: "Aparece quando a validação ou a gravação parou no meio (aba fechada, tempo esgotado). Continua de onde parou, sem cobrar de novo o que já foi pago." },
      { heading: "Ver andamento", body: "Aparece quando outra execução está rodando no servidor. Toque para atualizar." },
      { heading: "Barra de progresso", body: "Enquanto trabalha, o cartão mostra a barra, o contador (ex.: 3 de 12 grupos) e o tempo. Não feche a aba." },
    ],
    keywords: ["próximo passo", "cartão", "continuar", "ver andamento", "barra de progresso", "contador", "ver sobras"],
  },
  {
    id: "buscar-keywords",
    title: "1 · Buscar keywords (grátis)",
    summary: "Procura, para cada publicado e Assunto, keywords com volume: primeiro na sua lista, depois no Google Ads.",
    description: "A busca segue esta ordem: (1) keywords da lista que o Google já junta com o artigo, pela SERP guardada; (2) leitura da IA na sua lista, que escolhe de 1 a 3 keywords por artigo, com o papel e um motivo; (3) leitura da lista pelo código, para quem a IA não resolveu: keywords com volume que são o núcleo do slug e levam a palavra do próprio slug (“como atrair clientes” vai para a página de atrair, “como captar clientes” para a de captar); (4) só para quem ficou sem nada, uma busca nova no Google Ads. Nada é gravado neste passo.",
    sections: [
      { heading: "Buscar de novo", body: "Refaz a busca com a lista atual. Use depois de aprovar keywords novas no Minerador." },
      { heading: "Origem de cada linha", body: "A tabela diz de onde veio cada sugestão: Pares da SERP, Leitura da IA — confira, Lista · núcleo do slug ou Busca nova no Google Ads." },
      { heading: "Quando o Google separa parte do grupo", body: "Se o parecer da SERP mostra que algumas keywords não dividem páginas com a principal, elas saem e o grupo menor é conferido de novo pelo cache, sem custo. A linha diz quem saiu." },
      { heading: "Regras que a IA não pode furar", body: "Sem volume, publicada, de outro artigo aprovado, que troca a entidade do slug, de outro público ou cabeça genérica muito ampla (acima de 5.000 buscas com até duas palavras) ficam de fora. As recusas aparecem em “Sugestões da IA recusadas pelas regras”." },
    ],
    keywords: ["buscar keywords", "buscar de novo", "grátis", "google ads", "leitura da ia", "lista", "sugestões recusadas", "pares da serp"],
  },
  {
    id: "validar-no-google",
    title: "2 · Validar no Google",
    summary: "Confere na SERP se as keywords sugeridas pedem o mesmo conteúdo do artigo. Pode ser pago; o custo aparece antes.",
    description: "Antes de gravar, cada composição nova (principal + apoios) precisa do parecer da SERP. O botão mostra quantas consultas faltam e o valor máximo. O que já está guardado não é cobrado. A validação roda um grupo por vez, com barra de progresso.",
    sections: [
      { heading: "Precisa validar no Google", body: "Linha que ainda não tem o parecer da composição. Ela só pode ser gravada depois deste passo." },
      { heading: "Se parar no meio", body: "Use “Continuar”: o que já foi pago está guardado." },
    ],
    keywords: ["validar no google", "serp", "pago", "parecer", "precisa validar", "consultas", "custo"],
  },
  {
    id: "gravar-melhorias",
    title: "3 · Gravar melhorias",
    summary: "Grava as linhas marcadas na tabela: principal, keywords que entram e saem, com releitura de cada artigo.",
    description: "Marque na tabela as melhorias que quer. A confirmação aparece logo abaixo dos botões com o resumo; ao confirmar, o Arquiteto grava um artigo por vez e só diz que deu certo depois de reler o que ficou salvo. URL, slug e canonical nunca mudam.",
    sections: [
      { heading: "Se uma linha falhar", body: "As outras seguem. Tente de novo com “Continuar”. Se a mensagem disser que uma keyword mudou desde a prévia, use “Buscar de novo”." },
      { heading: "Depois de gravar", body: "O artigo ganha uma nova versão em revisão. A aprovação final continua sendo sua, na Revisão do artigo." },
    ],
    keywords: ["gravar melhorias", "confirmar", "aplicar", "marcar", "tabela", "versão nova", "falhou", "keyword mudou"],
  },
  {
    id: "leitura-da-ia",
    title: "Leitura da IA — confira",
    summary: "Sugestão da IA na sua lista de keywords. Ela tem a menor autoridade: o código confere cada escolha e você decide.",
    description: "A IA lê o artigo e a sua lista e aponta as keywords que melhor combinam, com o papel (principal ou secundária) e um motivo curto. Ela não inventa keyword: só escolhe entre as que você já tem com volume. Nada é gravado sem o seu clique.",
    keywords: ["ia", "inteligência artificial", "leitura da ia", "confira", "sugestão", "motivo", "autoridade"],
  },
  {
    id: "canibalizacao",
    title: "Publicados que disputam o mesmo assunto",
    summary: "Quando duas páginas suas falam do mesmo assunto, uma atrapalha a outra no Google. O Arquiteto dá a cada uma keywords próprias.",
    description: "Isso se chama canibalização. Exemplo: “como captar clientes para clínica de estética” e “como atrair pacientes para clínica de estética”. Trocar só um sinônimo não resolve. Os dois artigos só seguem quando cada um recebe uma principal própria (que não é sinônimo da outra) e nenhuma keyword em comum; cada um registra o que não deve cobrir. As páginas nunca são fundidas nem apagadas.",
    sections: [
      { heading: "Risco de canibalização", body: "Se aparecer este aviso, ainda falta uma diferença sustentada por dados. Busque keywords mais específicas para um dos dois." },
    ],
    keywords: ["canibalização", "mesmo assunto", "disputam", "sinônimo", "diferenciar", "exclusão", "não cobrir"],
  },
  {
    id: "sobras",
    title: "Sobras · oportunidades de artigo novo",
    summary: "Keywords com volume que não reforçam nenhum publicado. Elas são agrupadas por tema para virar artigos novos.",
    description: "Cada grupo leva o nome da keyword de maior volume e mostra o volume somado. “Criar artigo novo com este grupo” pede confirmação, grava e relê. A principal do artigo novo é a de maior volume. As sobras sem volume ficam recolhidas no fim.",
    keywords: ["sobras", "artigo novo", "criar artigo novo com este grupo", "oportunidades", "grupo", "tema"],
  },
  {
    id: "keywords-sem-artigo",
    title: "Keywords sem artigo",
    summary: "Toda keyword recebida está em um artigo ou nesta lista, com o motivo. Nenhuma some.",
    description: "Uma keyword fica sem artigo quando não combina com nenhum publicado, Assunto ou grupo novo, quando o artigo já está cheio ou quando não tem volume. As que têm volume também aparecem nas Sobras. “Reservar como candidata” guarda a keyword como candidata a Silo, para usar depois.",
    keywords: ["keywords sem artigo", "não agrupadas", "reservar como candidata", "sem grupo", "motivo", "sumiu", "onde está"],
  },
  {
    id: "processar-artigos",
    title: "Processar artigos",
    summary: "Monta os artigos novos e dá o parecer da SERP de cada um. Coleta a SERP que falta, com o custo mostrado antes. Não grava nada no artigo.",
    description: "Processar faz, nesta ordem: a primeira coleta da SERP das keywords com volume (só o que não está guardado), o parecer de cada artigo e o allintitle da principal. Cada passo pago abre o plano de custo antes. Se tudo já estiver no cache, segue sem custo.",
    sections: [
      { heading: "Plano de custo", body: "Mostra, por lente, o que está no cache e o que seria pago. Você pode pagar e validar, validar só com o que está guardado ou “Cancelar pagamento · analisar com o cache (US$ 0)”." },
      { heading: "Concluir formação", body: "É o botão que grava: transforma a proposta em ArticleDNA aprovado. Quando todos os artigos de um Silo ficam prontos, o Silo e a página dele são consolidados na mesma hora." },
    ],
    keywords: ["processar artigos", "reprocessar artigos", "concluir formação", "formar artigos", "artigos novos", "primeira coleta", "serp", "plano de custo", "cache", "aprovar artigo"],
  },
  {
    id: "assuntos-painel",
    title: "Painel de Assuntos",
    summary: "Lista os Assuntos declarados no Minerador. Tocar num Assunto filtra os artigos dele e mostra onde ele está preso.",
    description: "Cada Assunto mostra se tem volume, a nota, a página de destino e em quais artigos ou Silos está “Preso em”. “Prender Assunto” liga o Assunto a um artigo ou Silo; “Soltar Assunto” desfaz a ligação sem apagar nada; “Confirmar Assunto do Silo” aceita a sugestão do Silo. “Formar artigos automaticamente” forma artigos com as keywords que sustentam o Assunto, com confirmação antes.",
    keywords: ["assuntos", "prender assunto", "soltar assunto", "confirmar assunto do silo", "formar artigos automaticamente"],
  },
  {
    id: "objetivo-do-lote",
    title: "Objetivo do lote",
    summary: "Quando há publicados ou Assuntos no lote, o Arquiteto só melhora esses. Artigo novo com as sobras é escolha sua.",
    description: "“Formar artigos novos com as sobras” libera a formação de artigos novos; “Voltar a só melhorar publicados e Assuntos” volta atrás. Em “Reforçar publicado ou Assunto de outro Silo”, “Mover para …” leva a keyword ao Silo do destino (grava só o Silo; para entrar no artigo, use a melhoria ou o reforço).",
    keywords: ["objetivo do lote", "formar artigos novos com as sobras", "outro silo", "mover para", "mover todas para o silo do destino"],
  },
  {
    id: "detalhes-tecnicos",
    title: "Detalhes técnicos (avançado)",
    summary: "Guarda as análises completas: mesmo assunto no Google, reforço por publicado, diferenciação e objetivo do lote.",
    description: "Você não precisa abrir esta área para o trabalho do dia a dia: o cartão “Próximo passo” cobre o caminho principal. Abra quando quiser conferir a evidência de uma sugestão, gravar reforços um a um ou diferenciar publicados que disputam o mesmo assunto.",
    sections: [
      { heading: "Reforçar publicados", body: "Tabela por página publicada: Forte (3+ páginas em comum) vem marcada, Provável desmarcada. “Gravar reforços” grava numa confirmação." },
      { heading: "Buscar keywords para os publicados sem par", body: "Busca em lote no Google Ads e valida as melhores pela SERP, com teto de US$ 1,00 por rodada." },
      { heading: "Diferenciar publicados", body: "“Planejar diferenciação (grátis)” mostra o ângulo de cada página e o custo; “Buscar e validar” faz a rodada paga; “Aceitar grupo” grava." },
    ],
    keywords: ["detalhes técnicos", "avançado", "reforçar publicados", "gravar reforços", "publicados sem par", "planejar diferenciação", "aceitar grupo", "ver a evidência"],
  },
];

const SILO_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "silos-visao-geral",
    title: "Aba Silos",
    summary: "Mostra os Silos reconhecidos pelas páginas publicadas e os Silos novos sugeridos pelo Arquiteto.",
    description: "Silo publicado é reconhecido pela URL das páginas e fica ativo. Silo novo é só uma sugestão até você confirmar. Keywords publicadas ficam sempre no Silo da própria URL.",
    sections: [
      { heading: "Processar arquitetura", body: "Lê as keywords e as páginas do site e propõe os Silos. É grátis e não pede confirmação: publicados declarados já ficam no Silo da URL; o resto fica como proposta." },
      { heading: "Usar como Silo", body: "Transforma uma página do site (por exemplo, uma categoria) em Silo candidato." },
      { heading: "Botão “Silo” no topo", body: "Cria um Silo novo à mão, com nome e slug." },
      { heading: "Continuar para Artigos", body: "Só troca de aba." },
    ],
    howToUse: [
      "Use “Processar arquitetura” para o Arquiteto reconhecer e propor os Silos.",
      "Confira as propostas novas e confirme as que quer manter.",
      "Desfaça os Silos sugeridos que não fazem sentido.",
    ],
    keywords: ["silos", "processar arquitetura", "reprocessar arquitetura", "usar como silo", "criar silo", "continuar para artigos", "silo publicado", "silo sugerido"],
  },
  {
    id: "desfazer-silo",
    title: "Desfazer Silo",
    summary: "Tira de cena um Silo novo sugerido. Nada é apagado: o Silo fica guardado como rejeitado e as keywords voltam para “sem Silo”.",
    description: "Use quando o Arquiteto sugeriu um Silo que você não quer. “Desfazer os Silos sugeridos (N)” faz todos de uma vez, com uma confirmação só. Silo publicado, com artigo aprovado ou com página do Silo aprovada não pode ser desfeito por aqui; a tela diz o motivo.",
    keywords: ["desfazer silo", "rejeitar silo", "silo sugerido", "sem silo", "apagar silo", "remover silo"],
  },
  {
    id: "restaurar-keywords-no-silo",
    title: "Artigo aprovado com keyword no Silo errado",
    summary: "Na mesa, algumas keywords de um artigo aprovado estão em outro Silo. “Restaurar” devolve cada uma ao Silo do próprio artigo.",
    description: "Isso acontece quando uma keyword é movida na mesa depois de o artigo ser aprovado. Restaurar não muda o artigo, não cria versão nova e não cobra nada. “Ver quais keywords” mostra a lista antes.",
    keywords: ["restaurar", "silo errado", "ver quais keywords", "artigo aprovado", "mesa"],
  },
  {
    id: "confirmar-arquitetura",
    title: "Confirmar propostas novas",
    summary: "Grava os Silos novos e as keywords de cada um. O primeiro clique mostra a prévia; o segundo grava.",
    description: "A prévia lista todas as atribuições do plano. Se a mudança quebraria um artigo já aprovado, a confirmação fica bloqueada e a tela diz por quê (use “Restaurar”). Publicados já foram reconhecidos no processamento. A página do Silo é uma página publicável, com keyword e slug próprios: não é só um agrupador.",
    keywords: ["confirmar propostas novas", "confirmar arquitetura", "prévia", "confirmação bloqueada", "silodna", "silopage", "página do silo"],
  },
];

const REVIEW_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "revisao-do-artigo",
    title: "Revisão do artigo",
    summary: "Ao abrir um artigo na aba Artigos, o painel mostra o cenário atual, as evidências, o parecer da SERP e as decisões pendentes.",
    description: "Cenário atual: a composição do artigo (principal e apoios). Evidências: SERP (a principal), Lógica, IA e decisões humanas. Decisões pendentes: o que falta, por que importa e como resolver, com os botões ali mesmo. Aprovação anterior não resolve pendência nova: ela vale para a versão aprovada.",
    sections: [
      { heading: "Manter composição", body: "Quando a SERP diverge da composição inteira, você pode manter como está escrevendo o motivo. A decisão vale só para esta composição: se ela mudar, a SERP precisa ser refeita." },
      { heading: "Juntar com / Ver efeito", body: "Mostra, antes de gravar, o efeito de juntar este artigo com outro. “Aplicar ao cenário” leva a mudança para a cópia de trabalho; “Descartar proposta” desiste." },
    ],
    keywords: ["revisão", "revisão do artigo", "decisões pendentes", "cenário atual", "evidências", "manter composição", "juntar com", "ver efeito", "aplicar ao cenário", "fechamento do artigo"],
  },
  {
    id: "divergencia-serp",
    title: "Divergência de SERP",
    summary: "O Google mostra páginas diferentes para uma keyword do artigo e para a principal. Pode ser outro assunto. A decisão é sua.",
    description: "Não é um erro do sistema. O Google costuma mostrar uma página para cada assunto; se uma keyword do artigo traz resultados diferentes dos da principal, ela pode ocupar espaço sem ajudar e até enfraquecer a principal. Como a plataforma nunca move keyword sozinha, ela pede a sua decisão.",
    sections: [
      { heading: "Manter no artigo", body: "Você confirma que a keyword fala do mesmo assunto. Ela continua no artigo e a pendência some." },
      { heading: "Aplicar recomendação", body: "Você concorda com o Google. A pendência some, mas nada sai do artigo sozinho: para tirar ou trocar a keyword, ajuste a formação do artigo depois." },
      { heading: "Como decidir", body: "Pergunte: quem pesquisa esta keyword quer ler exatamente o que este artigo entrega? Se sim, mantenha. Se a pessoa procura outra coisa, siga a recomendação." },
      { heading: "Quando o aviso diz “pode representar melhor este artigo”", body: "O Google liga o artigo mais a outra keyword do que à principal atual. “Manter no artigo” deixa a principal como está; “Aplicar recomendação” registra que você quer trocar, e a troca é feita depois, na formação do artigo. Em artigo publicado, URL e slug não mudam." },
      { heading: "Onde a decisão fica", body: "Hoje a escolha fica registrada neste navegador. Ela não impede “Concluir formação”, mas vale decidir antes para o artigo seguir coerente." },
      { heading: "Páginas em comum", body: "“Sobreposição” diz quantas páginas do top 10 aparecem nas duas buscas: Baixa quer dizer que o Google trata como assuntos diferentes." },
    ],
    howToUse: [
      "Abra o artigo: a divergência aparece em “Decisões pendentes” com o aviso “Atenção”.",
      "Leia o aviso, que explica o caso em linguagem simples.",
      "Escolha “Manter no artigo” ou “Aplicar recomendação” ali mesmo.",
    ],
    keywords: ["divergência", "divergência serp", "revisar o pertencimento", "manter no artigo", "aplicar recomendação", "sobreposição", "pertence", "outro assunto"],
  },
  {
    id: "parecer-da-serp",
    title: "Parecer da SERP: compatível, inconclusivo ou divergente",
    summary: "Compatível: as keywords podem ficar juntas. Inconclusivo: o Google não confirma nem nega, e nada é bloqueado. Divergente: pede sua decisão.",
    description: "O parecer bruto responde se o Google confirma o agrupamento. A decisão operacional responde se isso impede aprovar. Evidência fraca pode ser inconclusiva e mesmo assim não impedir nada. Parecer com lente faltando impede aprovar até a coleta ser completada.",
    sections: [
      { heading: "Atualizar SERP", body: "Aparece quando o parecer está inconclusivo e uma nova coleta pode ajudar. Pode ter custo." },
      { heading: "Repetir SERP deste artigo", body: "Aparece quando a coleta deste artigo falhou. Os outros artigos mantêm os pareceres válidos." },
    ],
    keywords: ["parecer", "parecer bruto", "decisão operacional", "compatível", "inconclusivo", "divergente", "atualizar serp", "repetir serp"],
  },
  {
    id: "kgr-do-artigo",
    title: "KGR do artigo",
    summary: "KGR = allintitle ÷ volume da principal; bom abaixo de 0,25. É opcional: o padrão é Não aplicável e nunca bloqueia a aprovação.",
    description: "KGR ajuda a achar buscas com pouca concorrência. Allintitle é quantas páginas têm a busca inteira no título. Escolha “Sim” em Aplicar KGR só se quiser trabalhar essa estratégia; aí a conclusão espera a medição. A faixa de volume de 150 a 550 é só informativa.",
    sections: [
      { heading: "Medir allintitle (pago)", body: "Mede a concorrência da principal. Reaproveita medições de até 30 dias. “Recalcular allintitle (pago)” mede de novo." },
    ],
    keywords: ["kgr", "allintitle", "medir allintitle", "recalcular allintitle", "aplicar kgr", "0,25", "concorrência"],
  },
  {
    id: "tipo-de-unidade",
    title: "Tipo de unidade",
    summary: "Diz se a peça é artigo, landing page ou outro formato. Só pede decisão quando não dá para deduzir.",
    description: "O tipo orienta o Planejador e o Redator. Quando o sinal é claro, ele é definido sozinho; quando é ambíguo, escolha o tipo e use “Registrar decisão”, ou “Marcar conflito” se não souber. Página de categoria pertence à etapa Silos.",
    keywords: ["tipo de unidade", "artigo", "landing page", "registrar decisão", "marcar conflito"],
  },
  {
    id: "propostas-da-ia",
    title: "Propostas da IA e pente-fino",
    summary: "A IA pode propor ajustes na arquitetura; ela não aprova. Você aplica, descarta ou rejeita, e conclui o pente-fino.",
    description: "Uma proposta da IA aparece como “Proposta de repartição pronta para revisão humana” (Aplicar proposta para revisar, Descartar proposta, Rejeitar) ou, nos Silos, com “Aplicar na working copy”. Nada vale antes da sua decisão. “Concluir pente-fino humano” registra que você revisou as marcações da IA no artigo.",
    keywords: ["ia", "proposta da ia", "aplicar proposta para revisar", "descartar proposta", "rejeitar", "pente-fino", "concluir pente-fino humano", "working copy"],
  },
  {
    id: "estados-do-artigo",
    title: "Estados de um artigo",
    summary: "Colunas Aprovação e Status da tabela: o que já foi aprovado e em que ponto do caminho o artigo está. Publicado é outra informação.",
    description: "Aprovar não publica. Enviar ao Radar não muda a aprovação. Um artigo aprovado que recebe mudança real ganha versão nova (“Em revisão · vN”); a versão aprovada anterior (“Consolidado · vN”) fica guardada.",
    sections: [
      { heading: "Aprovação", body: "Bruto (ainda sem aprovação), Aprovado ou Rejeitado. Um traço quer dizer que o artigo ainda não tem definição gravada." },
      { heading: "Status", body: "Em processamento, Aguardando conclusão, Aguardando consolidação do Silo, Concluído, Pronto para Radar, Enviado ao Radar ou Publicado." },
      { heading: "Definição do artigo", body: "Consolidado · vN (aprovado), Em revisão · vN (versão nova esperando), Formação concluída, Pendente ou “Reprocessar e concluir de novo” quando a composição mudou." },
      { heading: "Publicado", body: "“ARTICLE · PUBLICADO” e “URL, slug e Silo preservados”: a página no ar é protegida." },
    ],
    keywords: ["estado", "status", "aprovação", "bruto", "aprovado", "rejeitado", "em revisão", "consolidado", "pronto para radar", "enviado ao radar", "publicado", "versão"],
  },
];

const FINAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "links-internos",
    title: "Links internos",
    summary: "Planeja os links entre os artigos do Silo e a página do Silo, com as âncoras. “Processar links” propõe; “Confirmar links internos” aprova.",
    description: "Links internos ajudam o Google e o leitor a entender quais páginas são do mesmo tema. “Processar links” monta a proposta e usa a IA para sugerir as âncoras (o texto do link); nada é aprovado nesse passo. Revise as relações e use “Confirmar links internos” para gravar o mapa aprovado.",
    sections: [
      { heading: "Selos do mapa", body: "Alterações não salvas, Salvando, Salvo · readback confirmado (gravado e conferido), Aprovado vN, Conflito de versão (alguém gravou antes: recarregue) ou Sem grafo." },
      { heading: "Artigo aberto nesta aba", body: "Mostra as abas Lógica, SERP, IA e Revisão do artigo, com os detalhes técnicos e as decisões de cada evidência." },
    ],
    keywords: ["links internos", "processar links", "confirmar links internos", "âncora", "internallinkgraph", "ligar artigos", "grafo"],
  },
  {
    id: "enviar-ao-radar",
    title: "Enviar ao Radar",
    summary: "Na aba Links internos, selecione os artigos prontos e use “Enviar ao Radar” no rodapé. Só artigos aprovados podem ir.",
    description: "O Radar recebe o artigo como está definido aqui e investiga a concorrência e as evidências. Ele não muda as keywords nem a principal; qualquer mudança de estrutura volta para o Arquiteto e precisa da sua decisão. Se algo impedir o envio, a tela diz “Radar bloqueado” com o motivo.",
    keywords: ["enviar ao radar", "radar", "radar bloqueado", "próxima etapa", "investigação", "aprovados", "rodapé"],
  },
  {
    id: "importar-exportar",
    title: "Importar do Minerador, Exportar e backup",
    summary: "“Importar do Minerador” traz as keywords aprovadas. “Exportar” baixa os dados e guarda um backup que pode ser restaurado.",
    description: "A importação é seletiva e não repete keyword já importada. Em Exportar há “Backup restaurável”, dados editoriais, só artigos e só o KeywordDNA dos artigos. “Restaurar backup” mostra a prévia antes e só grava depois da sua confirmação.",
    keywords: ["importar do minerador", "importar", "exportar", "backup", "backup restaurável", "restaurar backup", "csv"],
  },
  {
    id: "selecao-e-rodape",
    title: "Selecionar artigos e o rodapé",
    summary: "Ao selecionar linhas, o rodapé mostra as ações do lote: Excluir (Artigos), Aplicar status e Enviar ao Radar (Links internos).",
    description: "O menu “…” da tabela seleciona tudo, só os novos aprovados ou um grupo. “Excluir” mostra a prévia antes: keyword não publicada é excluída de vez; keyword publicada sai da operação e pode ser restaurada durante 24 horas. “Limpar seleção” desmarca tudo. Seleção controla as ações, não o que aparece na tela.",
    keywords: ["seleção", "selecionar", "rodapé", "excluir", "aplicar status", "limpar seleção", "remover do grupo"],
  },
  {
    id: "mapa-e-workbench",
    title: "Mapa do Arquiteto",
    summary: "Desenho dos Silos e artigos. Fica em “Detalhes técnicos” e só mostra: nada é gravado por ele.",
    description: "“Visão do mapa” troca o ponto de vista: Atual (o que está gravado), Lógica, SERP ou IA. “Comparar com Atual” destaca a diferença. Tocar num ponto do mapa oferece “Abrir na planilha”. Na aba Silos, “Visualização” alterna entre Arquitetura e Sitemap, e “Mostrar” filtra os Silos.",
    keywords: ["mapa", "workbench", "visão do mapa", "comparar com atual", "sitemap", "abrir na planilha", "expandir mapa"],
  },
  {
    id: "progresso-e-recuperacao",
    title: "Progresso, F5 e aba fechada",
    summary: "Processos longos mostram barra e contador. Se a página recarregar, o trabalho é recuperado do servidor.",
    description: "Validação e gravação rodam em etapas curtas. Se a aba fechar ou o tempo esgotar, o que já foi feito está salvo: volte e use “Continuar”. Sucesso só aparece depois que o Arquiteto relê o que foi gravado.",
    keywords: ["progresso", "barra", "contador", "f5", "recarregar", "tempo esgotado", "continuar", "parou"],
  },
];

export const ARQUITETO_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "arquiteto",
  title: "Arquiteto",
  topics: [...GENERAL_TOPICS, ...IMPROVEMENT_TOPICS, ...SILO_TOPICS, ...REVIEW_TOPICS, ...FINAL_TOPICS],
};
