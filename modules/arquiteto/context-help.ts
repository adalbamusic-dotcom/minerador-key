import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * Ajuda do Arquiteto para quem não conhece SEO (dono, 2026-09-30: "vai ter
 * muitos user inexperientes em SEO mexendo, e o sistema tem que dar suporte
 * nas infos"). Cada texto descreve o que a tela faz hoje; quando um processo
 * ou botão mudar, este arquivo muda na mesma entrega, junto do InfoHint e do
 * catálogo das IAs (lib/agent/platform-catalog.ts).
 *
 * 2026-10-18 (dono): a ajuda abre com o TUTORIAL — "Como funciona esta área"
 * e um tópico por etapa da linha única do Arquiteto (SDD
 * `sdd-linha-unica-do-arquiteto-2026-10-16.md` §6 e §15.7: os 3 botões em
 * sequência). Todo botão entre aspas curvas duplas no tutorial é o rótulo
 * exato da tela, conferido por `tests/context-help.test.mts`; exemplo, sufixo
 * de custo e botão de outra área usam aspas simples. Os tópicos do painel de
 * melhoria numerado e do cartão de passo saíram em 2026-10-17 (noite): o
 * refazedor tem só "Cancelar" e "Confirmar".
 */

const TUTORIAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "como-funciona",
    title: "Como funciona esta área",
    summary: "O Arquiteto junta as keywords aprovadas em artigos e Silos, reforça os artigos (novos e publicados), liga os artigos entre si e envia os prontos ao Radar.",
    description: "Ele decide onde cada keyword trabalha melhor: num artigo publicado, num Assunto do plano ou num artigo novo, sempre pela SERP (o que o Google mostra). Não escreve texto e não publica. As três abas do topo seguem a ordem do trabalho: “Silos” → “Artigos” → “Links internos”.",
    sections: [
      { heading: "Onde ficam os botões da linha", body: "Na aba “Artigos”, os três botões em sequência ficam no topo de “Detalhes técnicos”: “Processar artigos” → “Concluir formação” → “Melhorar publicados…”. O passo atual fica destacado; o seguinte só habilita com o anterior feito (o motivo aparece ao passar o mouse). “Detalhes técnicos” abre sozinho quando há algo a fazer." },
      { heading: "O que é gravado e quando", body: "Processar forma a proposta na cópia de trabalho e não grava artigo nenhum. Só “Concluir formação” (e o “Confirmar” do refazedor) grava a definição do artigo, depois de reler o que ficou salvo. URL, slug e canonical de página publicada nunca mudam." },
      { heading: "Custo", body: "Ler o que já temos é grátis. Buscar ideias no Google Ads é grátis (gasta a cota do Google Ads). A SERP nova é paga no DataForSEO e a leitura da IA usa a IA da plataforma: o custo aparece antes, numa confirmação." },
    ],
    howToUse: [
      "Traga as keywords aprovadas: “Importar do Minerador”.",
      "Na aba “Silos”: “Processar arquitetura” e “Confirmar propostas novas”.",
      "Na aba “Artigos”, em “Detalhes técnicos”: “Processar artigos”.",
      "Confira a cópia de trabalho e clique em “Concluir formação”.",
      "Para publicados ou para refazer: “Melhorar publicados…”.",
      "Na aba “Links internos”: “Processar links” e “Confirmar links internos”.",
      "Envie os prontos ao Radar: “Marcar Pronto para Radar e enviar”.",
      "Para desfazer ou apagar: “Desfazer Silo” ou “Excluir no Minerador”.",
    ],
    keywords: ["arquiteto", "tutorial", "como funciona", "passo a passo", "ordem", "fluxo", "por onde começar", "três botões"],
  },
  {
    id: "etapa-importar",
    title: "1 · Importar do Minerador",
    summary: "Traz para o Arquiteto as keywords já aprovadas no Minerador, por cor ou marcando uma a uma.",
    description: "O Arquiteto não aprova keyword: a que ainda precisa de aprovação aparece com o caminho para o Minerador. Quando uma keyword é reaprovada lá depois do envio, aparece “Atualizar do Minerador”.",
    sections: [
      { heading: "Quando usar", body: "Depois do ‘Aprovar e enviar’ do Minerador, ou quando faltam keywords no Arquiteto." },
      { heading: "O que acontece", body: "A lista abre na cor da etiqueta. “Importar a cor” (ou importar as marcadas) mostra a prévia: “Já aprovadas, importar”, “Precisam aprovar no Minerador” e “Ficam fora”, com o motivo. Ao confirmar, cada keyword é recebida e conferida. Repetir não duplica." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você escolhe o que importar." },
      { heading: "Depois", body: "Organize os Silos (etapa 2). Com plano de Silo, o Silo do plano já chega pronto." },
      { heading: "Situações comuns", body: "“Aprovar no Minerador” abre o Minerador com essas keywords prontas para aprovar." },
    ],
    howToUse: [
      "Clique em “Importar do Minerador”, no topo.",
      "Escolha a cor ou marque as keywords e clique em “Importar a cor” (ou importar as marcadas).",
      "Confira a prévia e confirme.",
    ],
    keywords: ["importar do minerador", "importar", "receber keywords", "atualizar do minerador", "aprovar no minerador", "cor"],
  },
  {
    id: "etapa-silos",
    title: "2 · Silos: processar e confirmar",
    summary: "Reconhece os Silos das páginas publicadas e propõe os Silos novos. Você confirma os que quer manter.",
    description: "Silo é um grupo de artigos do mesmo tema, com uma página do Silo que apresenta os artigos. Silo publicado é reconhecido pela URL das páginas; Silo novo é só proposta até você confirmar. O Silo do plano do Minerador segue o plano.",
    sections: [
      { heading: "Quando usar", body: "Depois de importar, e de novo quando chegam keywords que podem formar outro tema." },
      { heading: "O que acontece", body: "“Processar arquitetura” lê as keywords e as páginas do site e grava a proposta. “Confirmar propostas novas” confirma os Silos novos e as keywords de cada um, de uma vez; se a mudança quebraria um artigo já aprovado, nada é gravado e a tela diz por quê. “Continuar para Artigos” só troca de aba." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você confirma os Silos novos. O Pilar do plano é decisão do cadastro no Minerador." },
      { heading: "Depois", body: "Na aba “Artigos”, processe os artigos (etapa 3)." },
      { heading: "Situações comuns", body: "Silo sugerido que você não quer: “Desfazer Silo” (etapa 8). Uma página do site pode virar Silo com “Usar como Silo”. Silo do plano desfeito por engano: o aviso do topo oferece “Recriar o Silo do plano”." },
    ],
    howToUse: [
      "Abra a aba “Silos” e clique em “Processar arquitetura”.",
      "Confira as propostas e clique em “Confirmar propostas novas”.",
      "Clique em “Continuar para Artigos”.",
    ],
    keywords: ["silos", "processar arquitetura", "confirmar propostas novas", "silo do plano", "silo publicado", "silo sugerido", "continuar para artigos"],
  },
  {
    id: "etapa-processar-artigos",
    title: "3 · Processar artigos",
    summary: "Monta os artigos na cópia de trabalho: escolhe a principal, busca o reforço e dá o parecer da SERP de cada um. Não grava artigo nenhum.",
    description: "Marque as linhas (sem marcação, vale o recorte da cor) e clique em “Processar artigos”, no topo de “Detalhes técnicos”. Nas linhas do plano do Minerador, ele lê o plano e o DNA de cada keyword, busca o reforço na lista da marca e no Google Ads e coleta a SERP que falta. Nos artigos sem plano, coleta a SERP do lote e dá o parecer de cada artigo.",
    sections: [
      { heading: "Quando usar", body: "Sempre antes de “Concluir formação”, e de novo quando a composição muda (o botão vira “Reprocessar artigos”)." },
      { heading: "O que acontece", body: "Se falta SERP paga, aparece UMA confirmação de custo antes: nas linhas do plano, ‘Autorizar N consulta(s) e coletar (até US$ X)’; nos artigos sem plano, ‘Pagar N chamada(s) e validar’ ou “Validar sem pagar”. Cancelar não paga nada. No fim, cada linha mostra a cópia de trabalho (principal, secundárias, o que falta) pronta para concluir." },
      { heading: "Custo", body: "Google Ads grátis (cota). SERP paga no DataForSEO só para a principal que ainda não tem (4 lentes, cache de 30 dias primeiro); a secundária usa a SERP da principal. “Cancelar pagamento · analisar com o cache (US$ 0)” segue só com o que está guardado." },
      { heading: "Quem decide", body: "Você autoriza o custo. A proposta é revisada por você antes de gravar." },
      { heading: "Depois", body: "Clique em “Concluir formação” (etapa 4)." },
      { heading: "Situações comuns", body: "Principal com volume fica fixa; Travada nunca muda. Principal Livre e sem volume: na linha, “Procurar outra principal” → “Ver prévia da troca (grátis)” → “Confirmar a troca”. Keyword presa em outro artigo: “Retirar artigo do Silo” na linha. Keyword sem volume não entra como apoio (fica recolhida em ‘Sem volume’)." },
    ],
    howToUse: [
      "Abra a aba “Artigos” e “Detalhes técnicos”.",
      "Marque as linhas (ou deixe a cor da etiqueta) e clique em “Processar artigos”.",
      "Se aparecer o custo, leia e autorize (ou cancele).",
    ],
    keywords: ["processar artigos", "reprocessar artigos", "formar artigos", "cópia de trabalho", "serp", "custo", "reforço", "procurar outra principal", "plano"],
  },
  {
    id: "etapa-concluir-formacao",
    title: "4 · Concluir formação",
    summary: "Grava a definição de cada artigo processado — principal, apoios e papéis — numa confirmação só. No plano, fecha o Silo e a página dele no mesmo ato.",
    description: "É o botão que grava. Ele usa a cópia de trabalho do “Processar artigos”, sem refazer a busca. Nas linhas do plano, a prévia mostra o checklist (principal · reforço · SERP · plano · Silo) e as keywords novas por artigo.",
    sections: [
      { heading: "Quando usar", body: "Depois do “Processar artigos”, com as linhas prontas." },
      { heading: "O que acontece", body: "Nas linhas do plano: “Confirmar e gravar” (ou “Confirmar e fechar o Silo”) importa no Minerador as keywords novas, grava cada artigo (a versão 1 do novo, a seguinte do já formado), fecha o Silo do plano e relê tudo. Nos artigos sem plano, quando a SERP diverge, a janela “Concluir formação” pede “Concluir e manter”. Se parar no meio, “Continuar a gravação” segue sem pagar de novo." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você confirma. A aprovação é sua; a IA nunca conclui sozinha." },
      { heading: "Depois", body: "Ligue os artigos em “Links internos” (etapa 6). Publicados não passam por aqui: use “Melhorar publicados…” (etapa 5)." },
      { heading: "Situações comuns", body: "Um artigo com problema (mais de 6 keywords, disputa com outro artigo, SERP pendente) fica fora com o motivo; os outros seguem. Artigo que já está no Radar não é regravado aqui: use o refazedor." },
    ],
    howToUse: [
      "Clique em “Concluir formação”.",
      "Confira a prévia (o checklist e as keywords novas).",
      "Clique em “Confirmar e gravar” (ou “Concluir e manter”, nos artigos sem plano).",
    ],
    keywords: ["concluir formação", "gravar", "aprovar artigo", "fechar o silo", "checklist", "keywords novas", "continuar a gravação"],
  },
  {
    id: "etapa-melhorar-publicados",
    title: "5 · Melhorar publicados… (o refazedor)",
    summary: "Reforça os artigos publicados e refaz os que já foram formados: lê sozinho e de graça o que cada um tem, o que falta e a proposta. Grava só no Confirmar.",
    description: "O mesmo botão abre e fecha. Ao abrir, lê os publicados e os artigos marcados, a lista da marca (inclusive keywords soltas), a SERP guardada e a busca nova no Google Ads. A prévia tem só “Cancelar” e “Confirmar”; o Confirmar faz o passo que falta, e o próprio botão diz o custo.",
    sections: [
      { heading: "Quando usar", body: "Para os artigos publicados (que não passam por “Concluir formação”), para reforçar um artigo já formado ou para refazer um que falhou." },
      { heading: "O que acontece", body: "Conforme o que falta, o Confirmar vira ‘Ler com IA e medir…’, ‘Autorizar … e coletar a SERP (até US$ X)’ ou ‘Confirmar e gravar’. A caixa “Gravar só as linhas prontas agora, sem coletar a SERP” grava o que já está pronto. Para refazer o que já foi feito com os mesmos dados, diga o motivo e clique em “Refazer com o motivo dito”." },
      { heading: "Custo", body: "Abrir e ler: grátis. IA da plataforma, Google Ads (cota) e SERP no DataForSEO só com o seu Confirmar, com o custo no botão. Teto de US$ 1 por rodada." },
      { heading: "Quem decide", body: "Você marca as linhas e confirma. A IA só sugere, com o motivo, e o código confere cada escolha." },
      { heading: "Depois", body: "O artigo ganha versão nova. Se ele já está no Radar, o Radar mostra a atualização e você adota lá." },
      { heading: "Situações comuns", body: "A principal segue o volume: com volume definido (mesmo 10) ela fica e o artigo só ganha apoio; com volume 0 (ou sem média no Google Ads) a prévia propõe uma principal com volume que leve o núcleo do slug e caiba no Assunto (sem trocar o público, sem preço do consumidor, sem contrariar a restrição como ‘sem tráfego pago’); com volume desconhecido, nada é proposto (meça no Minerador). Com o Assunto na página publicada, a página sai das secundárias e fica como o Assunto do artigo; a secundária que contradiz o Assunto sai para ‘Keywords não agrupadas’ (nunca some). URL, slug e canonical nunca mudam." },
      { heading: "O Assunto da página é a âncora (19/10)", body: "No publicado cujo Assunto é a keyword da página, a principal precisa ser o mesmo tema com volume e levar o que define o artigo: ‘sem tráfego pago’, ‘não traz’, ‘vs orgânico’, ‘para clínica de estética’. A principal antiga que não leva sai do posto (fica como secundária, sai para ‘Keywords não agrupadas’ ou vai para o artigo dela). Sem nenhuma que caiba, a prévia diz ‘Assunto como foco’: a página fica como a principal e a vaga com volume fica aberta." },
      { heading: "Keyword no artigo errado", body: "A prévia mostra ‘vai para o artigo …’ e ‘vem do artigo …’ quando uma keyword serve ao Assunto de outro artigo do grupo, e tira a mesma busca repetida em dois artigos. Marque as duas linhas juntas: o Confirmar grava as duas, a de origem primeiro." },
      { heading: "SERP ao refazer", body: "Ao refazer, vale a SERP na localidade da marca (a nacional antiga não decide). A coleta que falta é paga com o custo no botão e não é barrada pela guarda de retrabalho; o que já está no cache (30 dias) não é cobrado de novo. Publicados que disputam o mesmo assunto: veja ‘Diferenciar publicados (avançado)’." },
    ],
    howToUse: [
      "Clique em “Melhorar publicados…”.",
      "Leia a tabela de cada artigo e marque as linhas que quer.",
      "Clique em Confirmar (o botão diz o passo e o custo) ou em “Cancelar”.",
    ],
    keywords: ["melhorar publicados", "refazedor", "publicado", "reforço", "refazer", "confirmar e gravar", "ler com ia", "coletar a serp"],
  },
  {
    id: "etapa-links-internos",
    title: "6 · Links internos",
    summary: "Planeja os links entre os artigos do Silo e a página do Silo, com as âncoras. “Processar links” propõe; “Confirmar links internos” aprova.",
    description: "Links internos ajudam o Google e o leitor a entender quais páginas são do mesmo tema. Escolha o Silo pela etiqueta de cor ou pelo seletor “Silo do grafo”.",
    sections: [
      { heading: "Quando usar", body: "Depois de concluir os artigos do Silo." },
      { heading: "O que acontece", body: "“Processar links” abre a prévia: o que a malha do Silo acrescenta, as âncoras e o custo. “Confirmar e processar” monta a proposta, que você revisa. “Confirmar links internos” grava o mapa aprovado. Mapa já aprovado e incompleto: “Completar a malha do Silo” (só acrescenta)." },
      { heading: "Custo", body: "A sugestão das âncoras usa a IA da plataforma (o número de chamadas aparece na prévia). Aprovar é grátis." },
      { heading: "Quem decide", body: "Você revisa e aprova." },
      { heading: "Depois", body: "Envie os artigos prontos ao Radar (etapa 7)." },
    ],
    howToUse: [
      "Abra a aba “Links internos” e escolha o Silo.",
      "Clique em “Processar links”, confira a prévia e clique em “Confirmar e processar”.",
      "Revise e clique em “Confirmar links internos”.",
    ],
    keywords: ["links internos", "processar links", "confirmar links internos", "âncora", "malha", "silo do grafo", "completar a malha"],
  },
  {
    id: "etapa-enviar-ao-radar",
    title: "7 · Enviar ao Radar",
    summary: "Marca os artigos do Silo como Pronto para Radar e envia, numa prévia só. Só artigos aprovados podem ir.",
    description: "Na aba “Links internos”, com o mapa aprovado, aparece “Marcar Pronto para Radar e enviar” os artigos deste Silo. A prévia diz o que vai e o que não vai, com o motivo.",
    sections: [
      { heading: "Quando usar", body: "Com os artigos concluídos e os links internos aprovados." },
      { heading: "O que acontece", body: "“Confirmar: marcar e enviar” marca cada artigo como Pronto para Radar e envia, com releitura. O Radar recebe o artigo como está definido aqui e não muda keywords nem a principal. O rodapé das selecionadas também tem “Enviar ao Radar”, que envia na hora, sem prévia." },
      { heading: "Custo", body: "Grátis. Se a SERP de algum artigo venceu, a tela pode pedir a coleta (paga) antes, com o custo." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "Os artigos aparecem no Radar. Se algo impedir, a tela diz ‘Radar bloqueado’ com o motivo; “Diagnosticar e reparar”, no rodapé, mostra o que falta." },
    ],
    howToUse: [
      "Na aba “Links internos”, clique em “Marcar Pronto para Radar e enviar”.",
      "Confira a prévia e clique em “Confirmar: marcar e enviar”.",
    ],
    keywords: ["enviar ao radar", "pronto para radar", "marcar e enviar", "radar bloqueado", "próxima etapa"],
  },
  {
    id: "etapa-desfazer-e-excluir",
    title: "8 · Desfazer Silo e excluir",
    summary: "Desfaz um Silo que você não quer e tira keywords do trabalho, sempre com prévia e confirmação. Nada some sem você confirmar.",
    description: "Na aba “Silos”, “Desfazer Silo” tira de cena um Silo sugerido: ele fica guardado como rejeitado e as keywords voltam para ‘sem Silo’. Para todos os sugeridos: “Desfazer os Silos sugeridos”. Excluir keyword é feito no Minerador: “Excluir no Minerador”, no rodapé da aba “Artigos”, abre o Minerador com as keywords marcadas.",
    sections: [
      { heading: "Quando usar", body: "Quando um Silo sugerido não faz sentido, ou quando keywords devem sair do trabalho." },
      { heading: "O que acontece", body: "A confirmação diz o que acontece antes de gravar. Para o Silo inteiro (consolidado, com artigos aprovados e a página do Silo), a prévia lista tudo o que sai e pede o nome do Silo digitado: “Desfazer o Silo inteiro”. No Minerador, a exclusão mostra a prévia e pede a confirmação de sempre." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Só você. A IA nunca desfaz nem exclui." },
      { heading: "Depois", body: "A mesa é relida. As keywords de um Silo desfeito continuam na mesa, prontas para outro Silo." },
      { heading: "Situações comuns", body: "Regra nova do dono (entrando nesta versão): tudo pode ser apagado, em qualquer estado, com a prévia que avisa, a seleção e a confirmação forte; o que é publicado vai para a lixeira de 24 horas. Silo do plano desfeito por engano: “Recriar o Silo do plano”, no aviso do topo." },
    ],
    howToUse: [
      "Na aba “Silos”, clique em “Desfazer Silo” na linha do Silo (ou em “Desfazer os Silos sugeridos”).",
      "Leia a confirmação, digite o que ela pede e confirme.",
      "Para apagar keywords: marque os artigos e clique em “Excluir no Minerador”.",
    ],
    keywords: ["desfazer silo", "excluir", "apagar", "desfazer o silo inteiro", "silo sugerido", "excluir no minerador", "lixeira", "recriar o silo do plano"],
  },
];

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
      "Na aba Artigos, tudo começa em “Detalhes técnicos”, no topo: ali ficam os botões “Processar artigos”, “Concluir formação” e “Melhorar publicados…”, em sequência.",
      "Fora do painel ficam a tabela de artigos (abra a linha para a Revisão do artigo) e as Sobras.",
    ],
    keywords: ["arquiteto", "artigos", "silos", "estrutura", "articledna", "silodna", "o que faz"],
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
    description: "O Posto de cada página publicada é declarado no Minerador. Travado ao slug: a principal fica, o artigo só recebe keywords de apoio. Livre: se a principal atual não tem volume, o Arquiteto pode propor uma principal com volume que leve o núcleo do slug. Desde 18/10, com o Assunto na página e volume 0 (ou sem média), a principal fica livre mesmo Travada ao slug, a troca é proposta na prévia e a página vira o Assunto do artigo (não fica secundária).",
    sections: [
      { heading: "Sempre preservado", body: "URL, slug, canonical, marca e o Silo da página. Nada é apagado, redirecionado ou fundido." },
      { heading: "Posto não declarado", body: "O Arquiteto não troca a principal: só entram keywords de apoio até você declarar o Posto no Minerador." },
      { heading: "Página que já ranqueia", body: "Se a página já aparece no Google para a principal, a principal não é trocada; ela só recebe apoio. Com o Assunto na página de volume 0, isso vira só um aviso: a frase antiga continua no título e no slug como o Assunto." },
      { heading: "Assunto pela principal", body: "A principal segue o volume (SUBSTITUI, desde 18/10, ‘a principal de identidade fica’): volume definido fica; volume 0 recebe a proposta de uma principal com volume, no Pilar (o termo-cabeça) e no Suporte (a faceta dele); volume desconhecido não decide nada. Volume baixo (1 a 39) com o Assunto na página: ela é o Assunto e a principal, e só recebe reforço." },
    ],
    keywords: ["publicado", "travado", "livre", "posto", "url", "slug", "canonical", "trocar principal", "ranqueia", "identidade"],
  },
  {
    id: "assunto-declarado",
    title: "Assunto declarado",
    summary: "Assunto é o tema que você quer cobrir. Ele fica como fundamento do artigo, fora das seis keywords.",
    description: "Um Assunto pode não ter volume no Google; ele serve de tronco. O Arquiteto busca keywords com volume que sustentem esse tema e forma o artigo com elas. Um Assunto sozinho aparece como “Assunto · aguardando sustentação”, que é um estado normal. Na Revisão do artigo, o seletor “Assunto (prender ou soltar)” liga ou solta o Assunto do artigo.",
    keywords: ["assunto", "tronco", "sustentação", "aguardando sustentação", "tema", "prender assunto", "soltar assunto"],
  },
  {
    id: "volume-primeiro",
    title: "Por que keyword sem volume fica de fora",
    summary: "Keyword sem volume no Google Ads não é sugerida: ninguém a procura, então ela não traz visitas.",
    description: "Volume é quantas vezes por mês a busca é feita, segundo o Google Ads. Uma keyword sem volume não entra como apoio, nem como principal nova, nem na coleta paga da SERP. Ela continua visível, recolhida em “Sem volume”, e nada é apagado. As exceções são o Assunto (o tema, não uma busca) e a principal de identidade do artigo, cuja SERP é coletada para ver o que o Google mostra para a frase do artigo.",
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
    summary: "Buscar ideias no Google Ads e ler o cache é grátis. Coletar SERP nova e a leitura da IA custam, sempre com o valor mostrado antes.",
    description: "Nenhuma ação paga acontece sem uma confirmação sua com o valor máximo. O que já foi pago fica guardado e não é cobrado de novo, mesmo se a tela parar no meio.",
    sections: [
      { heading: "Grátis", body: "Buscar keywords no Google Ads (usa a cota do Google Ads), ler a SERP guardada, “Concluir formação”, desfazer Silo, aprovar links internos e enviar ao Radar." },
      { heading: "Pago", body: "A SERP nova no DataForSEO, autorizada no “Processar artigos” ou no Confirmar do “Melhorar publicados…” (o botão diz as consultas e o valor máximo), e as buscas em lote com teto de US$ 1,00." },
      { heading: "IA", body: "A leitura da IA no refazedor e a sugestão das âncoras dos links internos usam a IA da plataforma, com a quantidade de chamadas dita antes." },
    ],
    keywords: ["custo", "pago", "grátis", "preço", "us$", "dólar", "cobrança", "cota", "google ads", "dataforseo"],
  },
];

const IMPROVEMENT_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "leitura-da-ia",
    title: "Leitura da IA — confira",
    summary: "Sugestão da IA na sua lista de keywords. Ela tem a menor autoridade: o código confere cada escolha e você decide.",
    description: "No refazedor (“Melhorar publicados…”), a IA lê o artigo e a sua lista e aponta as keywords que melhor combinam, com o papel (principal ou secundária) e um motivo curto. Ela recebe o resumo do DNA de cada keyword (intenção, entidade, funil, público e problema) e não decide no escuro. Ela não inventa keyword. Só roda com o seu Confirmar, e nada é gravado sem o seu clique.",
    sections: [
      { heading: "Origem de cada linha", body: "A tabela diz de onde veio cada sugestão: Pares da SERP, Leitura da IA — confira, Lista · núcleo do slug ou Busca nova no Google Ads." },
      { heading: "Regras que a IA não pode furar", body: "Sem volume, publicada, de outro artigo aprovado, que troca a entidade do slug, de outro público ou cabeça genérica muito ampla ficam de fora. As recusas aparecem em “Sugestões da IA recusadas pelas regras”." },
    ],
    keywords: ["ia", "inteligência artificial", "leitura da ia", "confira", "sugestão", "motivo", "autoridade", "sugestões recusadas"],
  },
  {
    id: "canibalizacao",
    title: "Publicados que disputam o mesmo assunto",
    summary: "Quando duas páginas suas falam do mesmo assunto, uma atrapalha a outra no Google. O Arquiteto dá a cada uma keywords próprias.",
    description: "Isso se chama canibalização. Exemplo: ‘como captar clientes para clínica de estética’ e ‘como atrair pacientes para clínica de estética’. Trocar só um sinônimo não resolve. Os dois artigos só seguem quando cada um recebe uma principal própria e nenhuma keyword em comum; cada um registra o que não deve cobrir. As páginas nunca são fundidas nem apagadas.",
    sections: [
      { heading: "Risco de canibalização", body: "Se aparecer este aviso, ainda falta uma diferença sustentada por dados. Busque keywords mais específicas para um dos dois." },
      { heading: "Diferenciar publicados (avançado)", body: "Em “Detalhes técnicos”: “Planejar diferenciação” (grátis) mostra o ângulo de cada página e o custo; “Buscar e validar” faz a rodada paga; “Aceitar grupo” grava; “Manter como está” registra que fica como está." },
    ],
    keywords: ["canibalização", "mesmo assunto", "disputam", "sinônimo", "diferenciar", "exclusão", "não cobrir"],
  },
  {
    id: "sobras",
    title: "Sobras · oportunidades de artigo novo",
    summary: "Keywords com volume que não reforçam nenhum publicado. Elas são agrupadas por tema para virar artigos novos.",
    description: "Cada grupo leva o nome da keyword de maior volume e mostra o volume somado. “Criar artigo novo com este grupo” pede confirmação e cria o artigo na cópia de trabalho, em revisão. A principal do artigo novo é a de maior volume. As sobras sem volume ficam recolhidas no fim. “Descartar sobras” só esconde o painel (nada é apagado).",
    keywords: ["sobras", "artigo novo", "criar artigo novo com este grupo", "oportunidades", "grupo", "tema", "descartar sobras"],
  },
  {
    id: "keywords-sem-artigo",
    title: "Keywords sem artigo",
    summary: "Toda keyword recebida está em um artigo ou nesta lista, com o motivo. Nenhuma some.",
    description: "Uma keyword fica sem artigo quando não combina com nenhum publicado, Assunto ou grupo novo, quando o artigo já está cheio ou quando não tem volume. As que têm volume também aparecem nas Sobras. “Reservar como candidata” guarda a keyword como candidata a Silo, para usar depois.",
    keywords: ["keywords sem artigo", "não agrupadas", "reservar como candidata", "sem grupo", "motivo", "sumiu", "onde está"],
  },
  {
    id: "objetivo-do-lote",
    title: "Objetivo do lote",
    summary: "Quando há publicados ou Assuntos no lote, o Arquiteto só melhora esses. Artigo novo com as sobras é escolha sua.",
    description: "“Formar artigos novos com as sobras” libera a formação de artigos novos; “Voltar a só melhorar publicados e Assuntos” volta atrás. Em “Reforçar publicado ou Assunto de outro Silo”, “Mover para …” leva a keyword ao Silo do destino (grava só o Silo; para entrar no artigo, use o refazedor).",
    keywords: ["objetivo do lote", "formar artigos novos com as sobras", "outro silo", "mover para", "mover todas para o silo do destino"],
  },
  {
    id: "detalhes-tecnicos",
    title: "Detalhes técnicos",
    summary: "O painel do topo da aba Artigos: os 3 botões em sequência, o andamento, o refazedor e as funções avançadas da aba.",
    description: "No topo: “Processar artigos”, “Concluir formação” e “Melhorar publicados…”; logo abaixo, o andamento e a prévia das linhas do plano. Depois, os avisos que pedem ação e as funções avançadas: “Análise por keyword (avançado)” (mesmo assunto no Google, reforço por publicado), “Diferenciar publicados (avançado)” e o objetivo do lote. Abre sozinho quando há algo a fazer.",
    sections: [
      { heading: "Reforçar publicados (avançado)", body: "Tabela por página publicada: Forte (3+ páginas em comum) vem marcada, Provável desmarcada. “Gravar reforços” grava numa confirmação. Para os publicados sem par, “Buscar keywords para os publicados sem par” faz uma rodada com teto de US$ 1,00." },
    ],
    keywords: ["detalhes técnicos", "avançado", "reforçar publicados", "gravar reforços", "publicados sem par", "diferenciar publicados", "análise por keyword"],
  },
];

const SILO_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "silos-visao-geral",
    title: "Aba Silos",
    summary: "Mostra os Silos reconhecidos pelas páginas publicadas e os Silos novos sugeridos pelo Arquiteto.",
    description: "Silo publicado é reconhecido pela URL das páginas e fica ativo. Silo novo é só uma sugestão até você confirmar. Keywords publicadas ficam sempre no Silo da própria URL.",
    sections: [
      { heading: "Usar como Silo", body: "Transforma uma página do site (por exemplo, uma categoria) em Silo candidato." },
      { heading: "Botão “Silo” no topo", body: "Cria um Silo novo à mão, com nome e slug (a janela “Criar Novo Silo”). O Silo do plano não é criado por aqui: ele vem do cadastro no Minerador." },
      { heading: "Visualização", body: "“Visualização” alterna entre Arquitetura e Sitemap; “Mostrar” filtra os Silos." },
    ],
    keywords: ["silos", "processar arquitetura", "reprocessar arquitetura", "usar como silo", "criar silo", "continuar para artigos", "silo publicado", "silo sugerido"],
  },
  {
    id: "desfazer-silo",
    title: "Desfazer Silo",
    summary: "Tira de cena um Silo. Nada é apagado: o Silo fica guardado como rejeitado e as keywords voltam para “sem Silo”.",
    description: "Use quando o Arquiteto sugeriu um Silo que você não quer. “Desfazer os Silos sugeridos (N)” faz todos os sugeridos de uma vez, com uma confirmação só. O Silo inteiro (consolidado, com artigos aprovados e a página do Silo) passa pela prévia do servidor e pede o nome do Silo digitado. O Silo do plano segue o cadastro do Minerador.",
    keywords: ["desfazer silo", "rejeitar silo", "silo sugerido", "sem silo", "apagar silo", "remover silo", "desfazer o silo inteiro"],
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
    summary: "Grava os Silos novos e as keywords de cada um, num clique. O cenário processado é a prévia.",
    description: "Se a mudança quebraria um artigo já aprovado, a confirmação fica bloqueada e a tela diz por quê (use “Restaurar”). Sem nada a confirmar, o botão fica desabilitado com o motivo ao lado. Publicados já foram reconhecidos no processamento. A página do Silo é uma página publicável, com keyword e slug próprios, e é fechada junto com os artigos no “Concluir formação”.",
    keywords: ["confirmar propostas novas", "confirmar arquitetura", "confirmação bloqueada", "silodna", "silopage", "página do silo"],
  },
];

const REVIEW_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "revisao-do-artigo",
    title: "Revisão do artigo",
    summary: "Ao abrir uma linha na aba Artigos, o painel mostra o cenário atual, as evidências, o parecer da SERP e as decisões pendentes.",
    description: "Cenário atual: a composição do artigo (principal e apoios). Evidências: SERP (a principal), Lógica e decisões humanas. Decisões pendentes: o que falta, por que importa e como resolver, com os botões ali mesmo. Aprovação anterior não resolve pendência nova: ela vale para a versão aprovada.",
    sections: [
      { heading: "Manter composição", body: "Quando a SERP diverge da composição inteira, você pode manter como está escrevendo o motivo. A decisão vale só para esta composição: se ela mudar, a SERP precisa ser refeita." },
      { heading: "Juntar com / Ver efeito", body: "Mostra, antes de gravar, o efeito de juntar este artigo com outro. “Aplicar ao cenário” leva a mudança para a cópia de trabalho; “Descartar proposta” desiste." },
      { heading: "Tirar este artigo do Silo", body: "Para o artigo ainda sem definição gravada: tira do Silo, com confirmação." },
    ],
    keywords: ["revisão", "revisão do artigo", "decisões pendentes", "cenário atual", "evidências", "manter composição", "juntar com", "ver efeito", "aplicar ao cenário"],
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
      { heading: "Páginas em comum", body: "“Sobreposição” diz quantas páginas do top 10 aparecem nas duas buscas: Baixa quer dizer que o Google trata como assuntos diferentes." },
    ],
    howToUse: [
      "Abra a linha do artigo: a divergência aparece em “Decisões pendentes”.",
      "Leia o aviso, que explica o caso em linguagem simples.",
      "Escolha “Manter no artigo” ou “Aplicar recomendação” ali mesmo.",
    ],
    keywords: ["divergência", "divergência serp", "revisar o pertencimento", "manter no artigo", "aplicar recomendação", "sobreposição", "pertence", "outro assunto"],
  },
  {
    id: "parecer-da-serp",
    title: "Parecer da SERP: compatível, inconclusivo ou divergente",
    summary: "Compatível: as keywords podem ficar juntas. Inconclusivo: o Google não confirma nem nega, e nada é bloqueado. Divergente: pede sua decisão.",
    description: "O parecer bruto responde se o Google confirma o agrupamento. A decisão operacional responde se isso impede aprovar. Evidência fraca pode ser inconclusiva e mesmo assim não impedir nada. Parecer com lente faltando impede aprovar até a coleta ser completada, pelo “Processar artigos” (que coleta só o que falta, com o custo antes).",
    keywords: ["parecer", "parecer bruto", "decisão operacional", "compatível", "inconclusivo", "divergente", "lente faltando"],
  },
  {
    id: "kgr-do-artigo",
    title: "KGR do artigo",
    summary: "KGR = allintitle ÷ volume da principal; bom abaixo de 0,25. É opcional: o padrão é Não aplicável e nunca bloqueia a aprovação.",
    description: "KGR ajuda a achar buscas com pouca concorrência. Allintitle é quantas páginas têm a busca inteira no título. Com KGR aplicável, o “Processar artigos” mede o allintitle da principal (pago, com o custo antes). A faixa de volume de 150 a 550 é só informativa.",
    sections: [
      { heading: "Atenção (conferido em 18/10)", body: "A escolha ‘Aplicar KGR’ e os botões ‘Medir allintitle (pago)’ e ‘Recalcular allintitle (pago)’ estão no código, mas não aparecem na tela hoje: vale o padrão Não aplicável para todos os artigos." },
    ],
    keywords: ["kgr", "allintitle", "medir allintitle", "recalcular allintitle", "aplicar kgr", "0,25", "concorrência"],
  },
  {
    id: "tipo-de-unidade",
    title: "Tipo de unidade",
    summary: "Diz se a peça é artigo, landing page ou outro formato. Só pede decisão quando não dá para deduzir.",
    description: "O tipo orienta o Radar e o Redator. Quando o sinal é claro, ele é definido sozinho; quando é ambíguo, escolha o tipo na Revisão do artigo e use “Registrar tipo”. Página de categoria pertence à etapa Silos.",
    keywords: ["tipo de unidade", "artigo", "landing page", "registrar tipo"],
  },
  {
    id: "estados-do-artigo",
    title: "Estados de um artigo",
    summary: "Colunas Aprovação e Status da tabela: o que já foi aprovado e em que ponto do caminho o artigo está. Publicado é outra informação.",
    description: "Aprovar não publica. Enviar ao Radar não muda a aprovação. Um artigo aprovado que recebe mudança real ganha versão nova (“Em revisão · vN”); a versão aprovada anterior (“Consolidado · vN”) fica guardada.",
    sections: [
      { heading: "Aprovação", body: "Bruto (ainda sem aprovação), Aprovado ou Rejeitado. Um traço quer dizer que o artigo ainda não tem definição gravada." },
      { heading: "Status", body: "Em processamento, Aguardando conclusão, Aguardando consolidação do Silo, Concluído, Pronto para Radar, Enviado ao Radar ou Publicado." },
      { heading: "Definição do artigo", body: "Consolidado · vN (aprovado), Em revisão · vN (versão nova esperando), Formação concluída, Pendente ou “Reprocessar e concluir de novo” quando a composição mudou. No artigo do plano, o estado lido do plano: Formado · vN, Aguardando formação ou Pendente, com o porquê curto embaixo (e o Papel no Silo é o do plano: Pilar ou Suporte, com a posição)." },
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
    description: "Links internos ajudam o Google e o leitor a entender quais páginas são do mesmo tema. “Processar links” abre a prévia com o custo; “Confirmar e processar” monta a proposta e usa a IA para sugerir as âncoras (o texto do link); nada é aprovado nesse passo. Revise as relações e use “Confirmar links internos” para gravar o mapa aprovado.",
    sections: [
      { heading: "Selos do mapa", body: "Alterações não salvas, Salvando, Salvo · readback confirmado (gravado e conferido), Aprovado vN, Conflito de versão (alguém gravou antes: recarregue) ou Sem grafo." },
    ],
    keywords: ["links internos", "processar links", "confirmar links internos", "âncora", "internallinkgraph", "ligar artigos", "grafo"],
  },
  {
    id: "enviar-ao-radar",
    title: "Enviar ao Radar",
    summary: "Na aba Links internos, “Marcar Pronto para Radar e enviar” marca e envia os artigos do Silo numa prévia. Só artigos aprovados podem ir.",
    description: "O Radar recebe o artigo como está definido aqui e investiga a concorrência e as evidências. Ele não muda as keywords nem a principal; qualquer mudança de estrutura volta para o Arquiteto e precisa da sua decisão. Se algo impedir o envio, a tela diz “Radar bloqueado” com o motivo. O rodapé das selecionadas tem também “Enviar ao Radar” e “Aplicar status”.",
    keywords: ["enviar ao radar", "radar", "radar bloqueado", "próxima etapa", "investigação", "aprovados", "pronto para radar"],
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
    summary: "Ao selecionar linhas, o rodapé mostra as ações do lote: “Excluir no Minerador” e Grupo (Artigos); “Aplicar status”, “Diagnosticar e reparar” e “Enviar ao Radar” (Links internos).",
    description: "O menu “…” da tabela seleciona tudo, só os novos aprovados ou um grupo. “Excluir no Minerador” abre o Minerador com as keywords dos artigos marcadas: lá, a exclusão mostra a prévia e pede a confirmação de sempre (o Arquiteto não exclui). “Limpar seleção” desmarca tudo. Seleção controla as ações, não o que aparece na tela.",
    keywords: ["seleção", "selecionar", "rodapé", "excluir no minerador", "aplicar status", "limpar seleção", "diagnosticar e reparar"],
  },
  {
    id: "mapa-e-workbench",
    title: "Mapa do Arquiteto",
    summary: "Desenho dos links internos do Silo. Fica só na aba Links internos e, fora a working copy, só mostra.",
    description: "“Visão do mapa” alterna entre Aprovado e Working copy. Na working copy, arrastar de um nó para outro cria uma relação humana; tocar numa aresta abre a edição dela. As abas Silos e Artigos não têm mapa.",
    keywords: ["mapa", "visão do mapa", "aprovado", "working copy", "sitemap", "expandir mapa", "links internos"],
  },
  {
    id: "progresso-e-recuperacao",
    title: "Progresso, F5 e aba fechada",
    summary: "Processos longos mostram barra e contador. Se a página recarregar, o trabalho é recuperado do servidor.",
    description: "Coleta e gravação rodam em etapas curtas. Se a aba fechar ou o tempo esgotar, o que já foi feito está salvo: volte e use “Continuar a gravação”, logo abaixo da barra. O que já foi pago não é cobrado de novo. Sucesso só aparece depois que o Arquiteto relê o que foi gravado.",
    keywords: ["progresso", "barra", "contador", "f5", "recarregar", "tempo esgotado", "continuar a gravação", "parou"],
  },
];

export const ARQUITETO_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "arquiteto",
  title: "Arquiteto",
  topics: [...TUTORIAL_TOPICS, ...GENERAL_TOPICS, ...IMPROVEMENT_TOPICS, ...SILO_TOPICS, ...REVIEW_TOPICS, ...FINAL_TOPICS],
};
