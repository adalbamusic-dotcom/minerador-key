import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * TUTORIAL DO RADAR no "?" global (dono, 2026-10-18: "escreve toda a
 * usabilidade no ícone de informações no ícone do global, como se fosse um
 * tutorial da usabilidade em cada área ou etapa").
 *
 * "Como funciona esta área" e um tópico por etapa, na ordem da linha da tela
 * principal do Radar (a planilha com a área do artigo aberto). Todo botão
 * entre aspas curvas duplas é o rótulo exato da tela, conferido por
 * `tests/context-help.test.mts`; exemplo, sufixo de custo e botão de outra
 * área usam aspas simples. Mudou um botão ou uma etapa, muda na mesma entrega
 * o InfoHint, este tutorial e o catálogo `lib/agent/platform-catalog.ts`.
 *
 * 2026-10-18 · em andamento (outro agente): os botões da barra de lote
 * "Organizar o artigo-modelo (N)" e "… do Silo (N)" estão sendo absorvidos por
 * "Pesquisar e finalizar"; por isso o tutorial não os cita.
 */

const TUTORIAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "como-funciona",
    title: "Como funciona esta área",
    summary: "O Radar investiga o que o Google mostra para cada artigo, monta o artigo-modelo da SERP (a planta do texto) e entrega tudo ao Redator.",
    description: "O Radar recebe do Arquiteto os artigos aprovados, com as keywords e a principal já decididas. Ele não muda keyword, principal, Assunto, slug nem URL: se achar um problema de estrutura, avisa e a decisão volta ao Arquiteto. O Google é a base de todo artigo; YouTube e Amazon são acréscimos opcionais.",
    sections: [
      { heading: "Onde fica cada coisa", body: "A “Planilha” lista os artigos. Clique numa linha para abrir a área do artigo, com quatro cartões: “Pesquisa”, “Vídeos”, “Especialista” e “Relatório”. A linha do processo está em “Pesquisa”." },
      { heading: "O que é gravado e quando", body: "A pesquisa, a análise e o congelamento da investigação são gravados a cada botão. Finalizar congela a investigação (a fotografia que vai ao Redator) e a IA organiza o artigo-modelo logo em seguida." },
      { heading: "Custo", body: "A SERP é lida primeiro do que já foi coletado (guardado por 30 dias, nas 4 lentes): só o que falta é pago no DataForSEO. Cada artigo-modelo usa até 2 chamadas de IA (cota da marca). O botão diz o teto antes do clique." },
      { heading: "Relatório", body: "O cartão “Relatório” é só informativo: mostra o estado SEO do artigo. Ele não pede aprovação e não trava o envio." },
    ],
    howToUse: [
      "Traga os artigos do Arquiteto (“Importar do Arquiteto”).",
      "Abra o artigo e faça a pesquisa no Google (“Iniciar Pesquisa Google”).",
      "Analise a concorrência e finalize (“Analisar concorrência”).",
      "Confira o artigo-modelo da SERP.",
      "Se quiser, traga o parecer do especialista (“Especialista”).",
      "Se o artigo também vira vídeo ou review, acrescente YouTube ou Amazon.",
      "Envie ao Redator (“Enviar ao Redator”) ou exporte o CSV.",
    ],
    keywords: ["radar", "tutorial", "como funciona", "passo a passo", "investigar", "serp", "pesquisa", "ordem"],
  },
  {
    id: "etapa-receber",
    title: "1 · Receber os artigos do Arquiteto",
    summary: "Traz para o Radar os artigos aprovados no Arquiteto. Quando o Arquiteto aprova uma versão nova, o Radar mostra e você adota.",
    description: "O normal é o Arquiteto enviar (‘Enviar ao Radar’, lá). Aqui, “Importar do Arquiteto” lista os aprovados que ainda não chegaram. Quando um artigo que já está no Radar ganha versão nova no Arquiteto, aparece a faixa “Atualização disponível do Arquiteto”.",
    sections: [
      { heading: "Quando usar", body: "Quando a planilha não mostra um artigo aprovado no Arquiteto, ou quando a faixa de atualização aparecer." },
      { heading: "O que acontece", body: "A janela “Importar artigos aprovados” lista por Silo; ao confirmar, os artigos entram na planilha. Na atualização, “Ver e adotar” mostra o que mudou, o que continua valendo e o que precisa refazer; “Adotar a versão nova” grava. O Arquiteto nunca reenvia." },
      { heading: "Custo", body: "Grátis para artigo ainda não finalizado: adotar não chama IA nem provider. Artigo já finalizado: a prévia diz em “Custo” o máximo do DataForSEO (só as keywords novas, cache primeiro) e até 2 chamadas de IA do artigo-modelo." },
      { heading: "Quem decide", body: "Você escolhe o que importar e o que adotar." },
      { heading: "Depois", body: "Abra o artigo e pesquise no Google (etapa 2)." },
      { heading: "Situações comuns", body: "Artigo já finalizado (enviado ou não ao Redator) com a principal igual: “Adotar a versão nova” leva o artigo à versão nova e, na mesma confirmação, pesquisa só as keywords novas, finaliza de novo e organiza o artigo-modelo; a investigação antiga fica no histórico. Se já foi ao Redator, o documento de lá não muda: reenviar mostra “Atualização disponível”. Com a principal ou o slug novo, o artigo segue na versão enviada. Links novos do Silo são adotados sem refazer a pesquisa (“Adotar os links novos”)." },
    ],
    howToUse: [
      "Clique em “Importar do Arquiteto”, marque os artigos (ou “Selecionar o silo inteiro”) e confirme.",
      "Se aparecer “Atualização disponível do Arquiteto”, clique em “Ver e adotar”, confira e clique em “Adotar a versão nova”.",
    ],
    keywords: ["importar do arquiteto", "receber", "atualização disponível", "adotar", "versão nova", "links novos"],
  },
  {
    id: "etapa-pesquisa-google",
    title: "2 · Pesquisar no Google",
    summary: "Coleta a SERP do artigo — as páginas que o Google mostra para a principal e as keywords — nas 4 lentes (computador e celular).",
    description: "Abra o artigo na planilha e o cartão “Pesquisa”, aba “Google · base”. O botão de começar é “Iniciar Pesquisa Google”. A SERP que o Arquiteto já coletou é reaproveitada sem custo.",
    sections: [
      { heading: "Quando usar", body: "Em todo artigo, antes de qualquer outra coisa: o Google é a base do pacote que vai ao Redator." },
      { heading: "O que acontece", body: "A investigação começa: a SERP principal e as consultas de apoio são coletadas e gravadas. Se só faltam consultas de apoio, o botão vira “Completar Pesquisa”. Keyword de apoio sem volume não vira consulta: fica como contexto." },
      { heading: "Custo", body: "Pago no DataForSEO, só o que não está guardado (cache de 30 dias primeiro, 4 lentes). O botão não abre confirmação; o custo está explicado na informação ao lado dele." },
      { heading: "Quem decide", body: "Você inicia." },
      { heading: "Depois", body: "Analise a concorrência e finalize (etapa 3)." },
      { heading: "Situações comuns", body: "Se a pesquisa já foi paga e a tela não mostra, “Recuperar pesquisa já paga” relê sem pagar de novo. Para vários artigos de uma vez, marque-os e use “Pesquisar e finalizar” na barra de lote: a prévia diz o teto antes e nada roda sem “Confirmar e pesquisar”." },
    ],
    howToUse: [
      "Clique no artigo na “Planilha” e abra “Pesquisa”.",
      "Na aba “Google · base”, clique em “Iniciar Pesquisa Google”.",
    ],
    keywords: ["pesquisa google", "iniciar pesquisa", "serp", "quatro lentes", "concorrentes", "cache", "dataforseo", "pesquisar e finalizar", "lote"],
  },
  {
    id: "etapa-analisar-e-finalizar",
    title: "3 · Analisar a concorrência e finalizar",
    summary: "Lê as páginas dos concorrentes, grava a análise e finaliza a investigação. Em seguida a IA organiza o artigo-modelo da SERP.",
    description: "O botão “Analisar concorrência” (com ‘· e finaliza (+ até 2 chamadas de IA)’) faz tudo de uma vez. Para finalizar à mão, use “Finalizar pesquisa”.",
    sections: [
      { heading: "Quando usar", body: "Logo depois da pesquisa do Google." },
      { heading: "O que acontece", body: "As páginas são lidas no servidor, a análise é gravada e a investigação é congelada. Página que não abre ou consulta que falhou vira uma limitação registrada, sem parar. Só para quando a intenção da SERP conflita com a declarada ou nenhuma página abre: a frase diz o motivo e o botão." },
      { heading: "Custo", body: "Ler as páginas é grátis. Organizar o artigo-modelo usa até 2 chamadas de IA (cota da marca), dito no botão." },
      { heading: "Quem decide", body: "Você clica; a regra de finalizar é a mesma em todo artigo." },
      { heading: "Depois", body: "Confira o artigo-modelo (etapa 4)." },
      { heading: "Situações comuns", body: "Investigação já finalizada com algo errado: “Reparar congelamento” mostra o diagnóstico sem gravar e oferece “Recongelar com a leitura atual” (grátis). “Zerar investigação” descarta a investigação do artigo e não pede confirmação: use com cuidado." },
    ],
    howToUse: [
      "Clique em “Analisar concorrência” e aguarde.",
      "Se a tela pedir, revise e clique em “Finalizar pesquisa”.",
    ],
    keywords: ["analisar concorrência", "finalizar", "finalizar pesquisa", "congelar", "investigação", "limitação", "reparar congelamento", "zerar investigação"],
  },
  {
    id: "etapa-artigo-modelo",
    title: "4 · Artigo-modelo da SERP",
    summary: "É a planta do artigo que a SERP pede: título, SEO, seções com a pergunta do leitor, links internos, fechamento e plano de imagens.",
    description: "O esqueleto vem dos concorrentes; a IA só ordena, nomeia e liga às evidências, na voz da Skill da marca. Ele já sai concluído ao finalizar. Fica em “Pesquisa”, no painel “Artigo-modelo da SERP”.",
    sections: [
      { heading: "Quando usar", body: "Depois de finalizar, para conferir a planta antes de enviar." },
      { heading: "O que acontece", body: "Sem nenhuma versão, “Organizar o artigo-modelo da SERP (IA)”; com versão, “Organizar de novo (IA)” refaz. A confirmação diz o custo e só roda com “Confirmar e organizar”. “Editar” abre a planta; “Salvar como nova versão” grava; “Concluir esta versão” conclui um rascunho. Cada versão fica guardada." },
      { heading: "Custo", body: "Organizar: até 2 chamadas de IA por artigo. Editar e concluir: grátis." },
      { heading: "Quem decide", body: "Você confere e, se quiser, edita." },
      { heading: "Depois", body: "Envie ao Redator (etapa 7). Sem a planta concluída, nada sai: nem o envio nem o CSV." },
      { heading: "Situações comuns", body: "“Conferir links do Silo” mostra quais links da malha ativar e o que falta nas páginas publicadas, sem editar nada." },
    ],
    howToUse: [
      "Abra o painel “Artigo-modelo da SERP”, em “Pesquisa”.",
      "Se não houver planta, clique em “Organizar o artigo-modelo da SERP (IA)” e depois em “Confirmar e organizar”.",
      "Para mudar algo, clique em “Editar” e em “Salvar como nova versão”.",
    ],
    keywords: ["artigo-modelo", "planta", "estrutura", "organizar", "seções", "h1", "seo title", "plano visual", "links do silo"],
  },
  {
    id: "etapa-especialista",
    title: "5 · Especialista (autoridade do artigo)",
    summary: "Pede ao especialista da marca um parecer sobre os pontos do artigo e decide o que entra no pacote. Dá autoridade (E-E-A-T).",
    description: "No cartão “Especialista”, cada ponto de revisão tem o próximo passo: “Criar consulta”, “Gerar link do convite”, “Aprovar pauta para envio” e “Enviar pedido ao especialista” (pelo Telegram). Quem tem acesso pode escrever direto em “Escrever o parecer aqui”.",
    sections: [
      { heading: "Quando usar", body: "Quando o artigo trata de tema que pede quem entende (saúde, dinheiro, técnica) ou quando a marca quer a voz do especialista no fechamento." },
      { heading: "O que acontece", body: "A resposta chega e você decide: “Aceitar como evidência”, “Usar como apoio”, “Marcar citação literal” ou “Rejeitar”. Só o aceito vai ao pacote. O parecer escrito pelo próprio especialista logado (“Eu mesmo”) entra já aceito." },
      { heading: "Custo", body: "Grátis. “Sugestões por IA” para as perguntas da pauta usa a IA da marca." },
      { heading: "Quem decide", body: "Você aceita ou rejeita cada resposta." },
      { heading: "Depois", body: "Siga para os acréscimos opcionais (etapa 6) ou envie ao Redator (etapa 7). Acrescentar depois de enviar gera pacote novo, e o Redator mostra a atualização." },
    ],
    howToUse: [
      "Abra o cartão “Especialista”.",
      "Siga o próximo passo de cada ponto até “Enviar pedido ao especialista”.",
      "Quando a resposta chegar, escolha “Aceitar como evidência” ou outra decisão.",
    ],
    keywords: ["especialista", "e-e-a-t", "parecer", "telegram", "pauta", "autoridade", "aceitar como evidência"],
  },
  {
    id: "etapa-acrescimos",
    title: "6 · Acréscimos opcionais: YouTube, Amazon e vídeos",
    summary: "Quando o artigo também vira vídeo ou review, acrescente a pesquisa do YouTube ou da Amazon. Eles só liberam depois do Google finalizado.",
    description: "As abas “+ YouTube (vídeo)” e “+ Amazon (review)” ficam ao lado de “Google · base”. Elas nunca substituem o Google: entram no pacote como camada de apoio. No cartão “Vídeos”, os vídeos escolhidos podem virar contexto, citação ou pauta.",
    sections: [
      { heading: "Quando usar", body: "Só quando o artigo também vai virar vídeo (YouTube) ou review de produto (Amazon)." },
      { heading: "O que acontece", body: "YouTube: “Iniciar pesquisa no YouTube” coleta, analisa e finaliza sozinho. Amazon: escolha o tipo de review, “Localizar produto na Amazon”, depois “Iniciar Pesquisa Amazon”; finaliza sozinho. “Finalizar investigação” é o botão manual. Em “Vídeos”: “Registrar fontes”, “Processar selecionados” e “Casar pautas com o conteúdo” (só sugere; vale o seu clique)." },
      { heading: "Custo", body: "Pago no DataForSEO (YouTube ou Amazon) e até 2 chamadas de IA ao finalizar, dito no botão. “Localizar produto na Amazon” também é uma consulta paga, sem aviso no botão." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "Com a Amazon congelada depois da planta, o artigo-modelo precisa ser organizado de novo para o bloco de review entrar (etapa 4)." },
    ],
    howToUse: [
      "Com o Google finalizado, abra “+ YouTube (vídeo)” ou “+ Amazon (review)”.",
      "Clique em “Iniciar pesquisa no YouTube” ou, na Amazon, em “Localizar produto na Amazon” e depois em “Iniciar Pesquisa Amazon”.",
    ],
    keywords: ["youtube", "amazon", "review", "vídeo", "acréscimo", "opcional", "vídeos", "registrar fontes"],
  },
  {
    id: "etapa-enviar",
    title: "7 · Enviar ao Redator (ou exportar)",
    summary: "Entrega o pacote finalizado ao Redator, com a investigação e o artigo-modelo. Ou exporta o CSV para escrever fora da plataforma.",
    description: "O botão fica em “Pesquisa”, depois do artigo-modelo, com o cartão aberto. Sem a planta concluída, ele vira “Organizar o artigo-modelo e enviar” (‘+ até 2 chamadas de IA’), com confirmação.",
    sections: [
      { heading: "Quando usar", body: "Com a investigação finalizada e o artigo-modelo conferido." },
      { heading: "O que acontece", body: "Cria o documento no Redator com o dossiê inteiro. Repetir não duplica. Para vários artigos, marque-os e use “Enviar ao Redator” na barra de lote. “Exportar” abre “Exportar para escrever”: “Silo completo” ou “Só os artigos selecionados” → “Exportar CSV”; há também o “CSV para vídeo e redes sociais”." },
      { heading: "Custo", body: "Enviar e exportar são grátis. Organizar a planta que falta: até 2 chamadas de IA por artigo, dito antes." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "O artigo aparece no Redator para escrever." },
      { heading: "Situações comuns", body: "O envio em lote recusa o artigo sem planta e diz o motivo no aviso. O Radar não apaga artigos: nesta área não há botão de excluir." },
    ],
    howToUse: [
      "Abra “Pesquisa” no artigo finalizado.",
      "Clique em “Enviar ao Redator” (ou em “Organizar o artigo-modelo e enviar” e confirme).",
      "Para escrever fora: “Exportar” → escolha o escopo → “Exportar CSV”.",
    ],
    keywords: ["enviar ao redator", "exportar", "csv", "para escrever", "vídeo e redes sociais", "entregar", "pacote"],
  },
];

const REFERENCE_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "quatro-lentes",
    title: "As 4 lentes da SERP",
    summary: "A SERP é lida em quatro aparelhos: computador Windows, computador Mac, celular Android e iPhone. Diferença entre eles é um sinal, não um erro.",
    description: "A coleta paga só a lente que falta ou venceu. Faltando uma lente, a SERP fica incompleta e a tela diz isso. O que o Google mostra vale mais do que a leitura por palavras e do que a IA.",
    keywords: ["4 lentes", "quatro lentes", "serp", "desktop", "mobile", "cache", "30 dias"],
  },
  {
    id: "radar-nao-muda-estrutura",
    title: "O que o Radar não muda",
    summary: "O Radar não reagrupa keywords, não troca a principal, o Assunto, o slug nem a URL. Problema de estrutura volta ao Arquiteto.",
    description: "Quando a SERP mostra outra intenção ou outro formato, o Radar registra o conflito e a decisão é sua, no Arquiteto. A versão nova chega ao Radar pela adoção (“Ver e adotar”).",
    keywords: ["estrutura", "principal", "slug", "arquiteto", "conflito", "intenção da serp"],
  },
];

export const RADAR_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "radar",
  title: "Radar",
  topics: [...TUTORIAL_TOPICS, ...REFERENCE_TOPICS],
};
