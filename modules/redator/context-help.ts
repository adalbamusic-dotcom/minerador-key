import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * TUTORIAL DO REDATOR no "?" global (dono, 2026-10-18: "escreve toda a
 * usabilidade no ícone de informações no ícone do global, como se fosse um
 * tutorial da usabilidade em cada área ou etapa").
 *
 * "Como funciona esta área" e um tópico por etapa, na ordem da linha. Todo
 * botão entre aspas curvas duplas é o rótulo exato da tela, conferido por
 * `tests/context-help.test.mts`; exemplo e citação que não são botão usam
 * aspas simples. Mudou um botão ou uma etapa, muda na mesma entrega o
 * InfoHint, este tutorial e o catálogo `lib/agent/platform-catalog.ts`.
 */

const TUTORIAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "como-funciona",
    title: "Como funciona esta área",
    summary: "O Redator escreve o artigo a partir do que o Radar investigou, confere com o Guardião, finaliza e envia a Publicações.",
    description: "O Redator recebe do Radar o artigo com a investigação e o artigo-modelo da SERP (a planta: título, seções, links e imagens). Aqui o texto é escrito, por você ou com a ajuda da IA, as imagens são registradas e o Guardião confere o rascunho. Ele não muda as keywords, a principal nem a investigação: isso é do Arquiteto e do Radar.",
    sections: [
      { heading: "As abas do topo", body: "“Artigo” é o texto principal. “Roteiro e storyboard” e “Carrossel” são versões derivadas do mesmo artigo, opcionais." },
      { heading: "O que é salvo e quando", body: "O texto se salva sozinho enquanto você escreve (como rascunho). A versão do artigo só é registrada quando você clica em “Finalizar artigo”, e o envio a Publicações só acontece no clique do envio." },
      { heading: "A IA aqui", body: "A IA propõe; nada entra no texto sem o seu clique em “Aplicar como texto editável” ou “Aplicar melhoria”. Uma IA conectada à agência (Claude ou ChatGPT) também pode escrever o rascunho pela conexão; a aprovação continua sendo sua." },
    ],
    howToUse: [
      "Receba o artigo do Radar (“Importar do Radar”).",
      "Abra o documento e leia os “Fundamentos do Radar”.",
      "Escreva o artigo no editor, se quiser com a IA.",
      "Registre as imagens em “Imagem por posição”.",
      "Confira com o Guardião e preencha os metadados.",
      "Clique em “Finalizar artigo”.",
      "Se precisar, monte o roteiro ou o carrossel (opcional).",
      "Clique em “Enviar a Publicações”.",
    ],
    keywords: ["redator", "tutorial", "como funciona", "passo a passo", "escrever", "artigo", "ordem", "fluxo"],
  },
  {
    id: "etapa-receber",
    title: "1 · Receber o artigo do Radar",
    summary: "Traz para o Redator os artigos que o Radar terminou de investigar. Cada artigo vira um documento para escrever.",
    description: "O caminho normal é o Radar enviar (‘Enviar ao Redator’, lá no Radar). Aqui no Redator, “Importar do Radar” faz o mesmo para os artigos que já estão prontos no Radar e ainda não chegaram.",
    sections: [
      { heading: "Quando usar", body: "Quando a lista da esquerda não mostra um artigo que você sabe que o Radar já finalizou." },
      { heading: "O que acontece", body: "A janela lista os artigos prontos do Radar. Ao confirmar, cada um vira um documento do Redator. Repetir não duplica: o documento que já existe continua o mesmo." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você escolhe quais artigos importar." },
      { heading: "Depois", body: "O documento aparece na lista “Rascunhos e fundamentos”, à esquerda. Clique nele para abrir." },
      { heading: "Situações comuns", body: "Artigo sem o artigo-modelo da SERP não pode vir: organize o artigo-modelo no Radar e importe de novo. O filtro de cor (a etiqueta ao lado do sino) mostra só os documentos daquela cor." },
    ],
    howToUse: [
      "Clique em “Importar do Radar”, no fim da coluna da esquerda.",
      "Marque os artigos que quer trazer.",
      "Clique em “Importar” e aguarde a lista atualizar.",
    ],
    keywords: ["importar do radar", "receber", "documento", "lista", "radar", "enviar ao redator"],
  },
  {
    id: "etapa-fundamentos",
    title: "2 · Ler os fundamentos do Radar",
    summary: "Mostra o que o Radar juntou para este artigo: a planta da SERP, as keywords, o Assunto, as fontes e os links que o texto precisa ter.",
    description: "Antes de escrever, leia os fundamentos. Eles dizem o título sugerido, as seções que o Google espera, a pergunta de cada seção, os links internos e o plano de imagens. Seguir a planta é o que faz o artigo competir na SERP.",
    sections: [
      { heading: "Quando usar", body: "Sempre que abrir um documento novo, e de novo antes de escrever cada seção." },
      { heading: "O que acontece", body: "Só leitura: nada é gravado. O painel fica à direita, em “Fundamentos do Radar”." },
      { heading: "Custo", body: "Grátis para ler. Se a planta estiver faltando, o link “Organizar o artigo-modelo no Radar” leva ao Radar, onde organizar custa até 2 chamadas de IA por artigo (o Radar diz antes)." },
      { heading: "Quem decide", body: "Você, como redator: a estrutura é a da planta e a redação é sua." },
      { heading: "Depois", body: "Comece a escrever no editor (etapa 3)." },
      { heading: "Situações comuns", body: "Com Assunto declarado, o painel mostra o Assunto, onde fazer a virada para ele e o destino do link. O Guardião avisa se o Assunto não aparecer no texto." },
    ],
    howToUse: [
      "Clique no documento na lista “Rascunhos e fundamentos”.",
      "Leia o painel “Fundamentos do Radar”, à direita.",
      "Se aparecer “Organizar o artigo-modelo no Radar”, organize a planta no Radar antes de escrever.",
    ],
    keywords: ["fundamentos", "dossiê", "artigo-modelo", "planta", "estrutura", "seções", "links", "assunto"],
  },
  {
    id: "etapa-escrever",
    title: "3 · Escrever o artigo",
    summary: "Escreva o texto no editor. A IA pode propor uma seção ou melhorar um trecho; nada entra sem o seu clique.",
    description: "O editor salva sozinho enquanto você digita. Para pedir ajuda à IA: o ícone “Propor escrita para esta seção” fica ao lado de cada título da coluna da esquerda (Outline); “Melhorar trecho” fica na barra de ferramentas, para o texto selecionado.",
    sections: [
      { heading: "Quando usar", body: "Depois de ler os fundamentos, seção por seção." },
      { heading: "O que acontece", body: "O texto vai sendo salvo como rascunho. A proposta da IA aparece numa caixa no topo (“Proposta de seção — revisão humana” ou “Melhoria de trecho — revisão humana”): “Aplicar como texto editável” ou “Aplicar melhoria” leva para o texto; “Descartar” desiste. “Salvar rascunho”, no topo, salva na hora." },
      { heading: "Custo", body: "Escrever é grátis. “Propor escrita para esta seção” e “Melhorar trecho” usam IA paga: até 2 chamadas de IA (IA da plataforma, cota da marca). A caixa de instrução diz o custo antes; confirmar (mesmo com a instrução em branco) faz a chamada, e Cancelar não chama a IA." },
      { heading: "Quem decide", body: "Você. A IA só propõe; aplicar ou descartar é seu." },
      { heading: "Depois", body: "Registre as imagens (etapa 4)." },
      { heading: "Situações comuns", body: "Os blocos ‘Produto’, ‘CTA’ e ‘Briefing de imagem’ da barra entram com texto a completar; o Guardião marca esse texto até você preencher. Uma IA conectada à agência (Claude ou ChatGPT) pode salvar o rascunho pela conexão: você vê o texto aqui e decide." },
    ],
    howToUse: [
      "Escreva no editor, seguindo as seções da planta.",
      "Para ajuda numa seção, clique no ícone “Propor escrita para esta seção” ao lado do título dela.",
      "Para reescrever um pedaço, selecione o texto e clique em “Melhorar trecho”.",
      "Leia a proposta e clique em “Aplicar como texto editável” (ou “Aplicar melhoria”), ou em “Descartar”.",
    ],
    keywords: ["escrever", "editor", "rascunho", "ia", "propor escrita", "melhorar trecho", "aplicar", "descartar", "salvar rascunho"],
  },
  {
    id: "etapa-imagens",
    title: "4 · Imagens do artigo",
    summary: "Registra o briefing de cada imagem (capa e respiros) e anexa a imagem real, na posição certa do texto.",
    description: "O padrão é uma capa e dois ou três respiros ao longo do texto. O plano de imagens vem da planta do Radar. Em “Imagem por posição”, escolha a posição e registre o que a imagem deve mostrar (o briefing), depois anexe o arquivo gerado.",
    sections: [
      { heading: "Quando usar", body: "Depois de o texto estar com as seções no lugar." },
      { heading: "O que acontece", body: "“Registrar briefing” grava o pedido da imagem. “Anexar imagem” guarda o arquivo e liga à posição; “Substituir imagem” troca e a anterior fica guardada por 48 horas. “Editar alt text” grava o texto alternativo." },
      { heading: "Custo", body: "Grátis. O briefing não gera a imagem: ele registra o pedido. A imagem é gerada fora e anexada aqui." },
      { heading: "Quem decide", body: "Você escolhe e anexa cada imagem." },
      { heading: "Depois", body: "Confira o texto com o Guardião (etapa 5)." },
    ],
    howToUse: [
      "Em “Imagem por posição”, escolha a “Posição”.",
      "Clique em “Registrar briefing” para gravar o pedido da imagem.",
      "Clique em “Anexar imagem” e escolha o arquivo (ou “Substituir imagem” para trocar).",
      "Use “Ver imagem” para conferir e “Editar alt text” para o texto alternativo.",
    ],
    keywords: ["imagem", "mídia", "briefing", "capa", "respiro", "anexar", "substituir", "alt text", "posição"],
  },
  {
    id: "etapa-guardiao",
    title: "5 · Conferir com o Guardião e os metadados",
    summary: "O Guardião lê o rascunho e aponta o que falta: títulos, seções, repetição, fontes, links e metadados. Ele não aprova.",
    description: "O Guardião é uma conferência automática, sem IA. Os achados aparecem por seção; os críticos impedem finalizar. Os metadados (slug, keyword principal, meta title, meta description, título e descrição social, canonical) ficam no painel da direita.",
    sections: [
      { heading: "Quando usar", body: "Antes de finalizar, e sempre que mudar bastante o texto." },
      { heading: "O que acontece", body: "O ícone “Analisar documento”, no cabeçalho do Guardião, refaz a conferência. Os achados aparecem em “Achados por seção”; clicar num achado leva ao trecho. Nada é gravado pela conferência; os metadados se salvam junto com o rascunho." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você corrige o texto. O Guardião só aponta." },
      { heading: "Depois", body: "Sem achado crítico, finalize o artigo (etapa 6)." },
      { heading: "Situações comuns", body: "Em artigo publicado, slug e canonical são os da página no ar: não mude." },
    ],
    howToUse: [
      "Clique no ícone “Analisar documento”, no painel do Guardião.",
      "Abra cada achado em “Achados por seção” e corrija o texto.",
      "Confira os metadados no painel da direita.",
    ],
    keywords: ["guardião", "analisar documento", "achados", "conferir", "metadados", "meta title", "meta description", "slug", "canonical"],
  },
  {
    id: "etapa-finalizar",
    title: "6 · Finalizar o artigo",
    summary: "Registra a versão final do texto. Só funciona sem achado crítico do Guardião.",
    description: "Finalizar é a aprovação do texto. O botão “Finalizar artigo” fica no topo e, depois do clique, vira “Artigo finalizado”.",
    sections: [
      { heading: "Quando usar", body: "Quando o texto, as imagens e os metadados estiverem prontos e o Guardião não tiver achado crítico." },
      { heading: "O que acontece", body: "O artigo ganha uma versão registrada e o estado passa a Aprovado. Com achado crítico, a tela diz quantos faltam e nada muda." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você. A IA nunca finaliza sozinha." },
      { heading: "Depois", body: "Envie a Publicações (etapa 8). Se mexer no texto depois de finalizar, o artigo volta a rascunho e precisa ser finalizado de novo." },
    ],
    howToUse: [
      "Resolva os achados críticos do Guardião.",
      "Clique em “Finalizar artigo”, no topo.",
      "Confira que o botão passou a “Artigo finalizado”.",
    ],
    keywords: ["finalizar artigo", "aprovar", "artigo finalizado", "versão", "aprovado"],
  },
  {
    id: "etapa-roteiro-carrossel",
    title: "7 · Roteiro e carrossel (opcional)",
    summary: "Monta o roteiro de vídeo ou o carrossel a partir do mesmo artigo, com cenas ou slides.",
    description: "Use as abas “Roteiro e storyboard” e “Carrossel” do topo. Eles partem do mesmo dossiê do Radar e não mudam o artigo.",
    sections: [
      { heading: "Quando usar", body: "Quando o artigo também vai virar vídeo ou post de rede social." },
      { heading: "O que acontece", body: "O botão que cria a partir do contexto monta as cenas ou os slides com a IA; “Começar manualmente” abre em branco. “Salvar rascunho” grava; “Finalizar roteiro” ou “Finalizar carrossel” registra a versão; “Reabrir para edição” volta a editar." },
      { heading: "Custo", body: "Criar a partir do contexto usa IA paga: até 2 chamadas de IA (IA da plataforma, cota da marca), dito na confirmação antes da chamada; Cancelar não chama a IA. O resto é grátis." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "O artigo finalizado segue para Publicações (etapa 8). Finalizar com alteração ainda não salva grava primeiro o rascunho e finaliza o que foi salvo; se salvar falhar, nada é finalizado e o que você digitou fica na tela." },
    ],
    howToUse: [
      "Abra a aba “Roteiro e storyboard” ou “Carrossel”.",
      "Crie a partir do contexto ou clique em “Começar manualmente”.",
      "Edite as cenas ou os slides e clique em “Salvar rascunho”.",
      "Clique em “Finalizar roteiro” ou “Finalizar carrossel”.",
    ],
    keywords: ["roteiro", "storyboard", "carrossel", "vídeo", "cenas", "slides", "redes sociais", "finalizar roteiro", "finalizar carrossel"],
  },
  {
    id: "etapa-enviar",
    title: "8 · Enviar a Publicações",
    summary: "Entrega o artigo finalizado a Publicações, onde o registro da publicação é feito.",
    description: "O botão aparece no topo do painel da direita quando o artigo está finalizado. Nas abas de roteiro e carrossel, o mesmo envio aparece como “Enviar artigo a Publicações”.",
    sections: [
      { heading: "Quando usar", body: "Depois de “Finalizar artigo”." },
      { heading: "O que acontece", body: "Cria o registro do artigo em Publicações. Repetir não duplica. Não publica nada no site, não muda URL, slug nem canonical." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "Vá a Publicações para colocar na fila, exportar e registrar a URL final." },
    ],
    howToUse: [
      "Finalize o artigo.",
      "Clique em “Enviar a Publicações”, no topo do painel da direita.",
    ],
    keywords: ["enviar a publicações", "publicações", "entregar", "próxima etapa"],
  },
];

const REFERENCE_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "historico-e-desfazer",
    title: "Desfazer e histórico do documento",
    summary: "As setas do topo desfazem e refazem a edição; o histórico guarda os momentos desta sessão e permite restaurar.",
    description: "Use as setas para voltar uma alteração. No histórico, escolha um momento e restaure. O histórico é desta sessão do navegador; a versão oficial do artigo é a de “Finalizar artigo”. As setas valem só para o texto da aba “Artigo”: nas abas “Roteiro e storyboard” e “Carrossel” ficam desligadas e nunca mexem no artigo escondido.",
    keywords: ["desfazer", "refazer", "histórico", "restaurar", "voltar"],
  },
  {
    id: "grupos-por-cor",
    title: "Filtrar por cor (grupo)",
    summary: "A etiqueta ao lado do sino mostra só os documentos de uma cor. O grupo do documento vem do artigo, no Arquiteto ou no Radar.",
    description: "Escolha uma cor, “Todos os grupos” ou “Sem grupo”. A escolha vale só para o Redator e é lembrada neste navegador. Filtrar não muda nada no documento.",
    keywords: ["grupo", "cor", "filtro", "etiqueta", "todos os grupos", "sem grupo"],
  },
];

export const REDATOR_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "redator",
  title: "Redator",
  topics: [...TUTORIAL_TOPICS, ...REFERENCE_TOPICS],
};
