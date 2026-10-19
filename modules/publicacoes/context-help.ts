import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * TUTORIAL DE PUBLICAÇÕES no "?" global (dono, 2026-10-18: "escreve toda a
 * usabilidade no ícone de informações no ícone do global, como se fosse um
 * tutorial da usabilidade em cada área ou etapa").
 *
 * "Como funciona esta área" e um tópico por etapa, na ordem da linha. Todo
 * botão entre aspas curvas duplas é o rótulo exato da tela, conferido por
 * `tests/context-help.test.mts`; exemplo e botão de outra área usam aspas
 * simples. Mudou um botão ou uma etapa, muda na mesma entrega o InfoHint,
 * este tutorial e o catálogo `lib/agent/platform-catalog.ts`.
 */

const TUTORIAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "como-funciona",
    title: "Como funciona esta área",
    summary: "Publicações recebe os artigos finalizados no Redator, organiza a fila, exporta o arquivo e registra a URL onde o artigo foi publicado.",
    description: "Esta é a última etapa da linha. Publicações não escreve e não publica sozinha no site: você exporta o arquivo, publica no seu site e volta aqui para registrar a URL final. Um artigo publicado fica protegido: URL, slug e canonical não mudam por aqui.",
    sections: [
      { heading: "As abas do topo", body: "“Biblioteca” mostra os documentos e onde cada um está. “Fila” é o que falta exportar e publicar. “Publicados” são os que já têm URL registrada. “Atualizações” são os publicados com pedido de atualização." },
      { heading: "O que é gravado e quando", body: "Cada ação da linha (colocar na fila, exportar, registrar a URL) grava na hora do clique e entra no histórico do artigo." },
    ],
    howToUse: [
      "Confira na “Biblioteca” o que chegou do Redator.",
      "Na “Fila”, clique em “Colocar na fila”.",
      "Exporte o arquivo (“Markdown” ou “JSON”) e publique no seu site.",
      "Registre o destino e a URL final (“Registrar URL”).",
      "Para mudar um publicado, use “Solicitar atualização” ou “Reeditar”.",
    ],
    keywords: ["publicações", "tutorial", "como funciona", "passo a passo", "publicar", "fila", "url"],
  },
  {
    id: "etapa-biblioteca",
    title: "1 · Ver o que chegou do Redator",
    summary: "A Biblioteca lista os documentos da marca com dois selos: o estado no Redator e o estado em Publicações.",
    description: "Só entra em Publicações o documento que o Redator enviou (‘Enviar a Publicações’, no Redator). Finalizar no Redator não entrega sozinho.",
    sections: [
      { heading: "Quando usar", body: "Para saber o que já foi entregue, o que está pronto e o que ainda está no Redator." },
      { heading: "O que acontece", body: "Só leitura. Os filtros “Entregues”, “Recebidos”, “Publicados” e “Ainda no Redator” mudam a lista. “Abrir no Redator” leva ao mesmo documento." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Ninguém decide aqui: é a fotografia do momento." },
      { heading: "Depois", body: "O que foi recebido já aparece na aba “Fila”, pronto para exportar." },
      { heading: "Situações comuns", body: "Documento que aparece em “Ainda no Redator” precisa ser enviado no Redator. O filtro de cor (a etiqueta ao lado do sino) mostra só os da cor escolhida." },
    ],
    howToUse: [
      "Abra a aba “Biblioteca”.",
      "Use os filtros “Recebidos” ou “Ainda no Redator” para achar o que procura.",
      "Clique em “Abrir no Redator” se precisar mexer no texto.",
    ],
    keywords: ["biblioteca", "recebidos", "entregues", "ainda no redator", "abrir no redator", "estado"],
  },
  {
    id: "etapa-fila",
    title: "2 · Colocar na fila",
    summary: "Marca o artigo recebido como próximo a exportar e publicar.",
    description: "A fila mantém a ordem do trabalho de publicação. Ela só avança em ordem: um artigo sai da fila quando é exportado e publicado.",
    sections: [
      { heading: "Quando usar", body: "Quando um artigo recebido está pronto para ser publicado." },
      { heading: "O que acontece", body: "O estado do artigo passa a ‘na fila’ e o clique entra no histórico." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "Exporte o arquivo (etapa 3)." },
      { heading: "Situações comuns", body: "Desde 18/10, o artigo enviado pelo Redator (‘Enviar a Publicações’) chega à “Fila” pronto para exportar, com o botão “Colocar na fila”. Um artigo que foi enviado antes e ficou parado em rascunho chega à Fila quando é enviado de novo no Redator; nada é duplicado." },
    ],
    howToUse: [
      "Abra a aba “Fila”.",
      "Na linha do artigo, clique em “Colocar na fila”.",
    ],
    keywords: ["fila", "colocar na fila", "ordem", "próximo"],
  },
  {
    id: "etapa-exportar",
    title: "3 · Exportar o arquivo",
    summary: "Baixa o artigo pronto para levar ao seu site: Markdown ou JSON. O manifesto CSV lista tudo o que está nesta área.",
    description: "A plataforma não publica direto no site. O arquivo exportado é o que você cola ou importa no seu sistema de publicação.",
    sections: [
      { heading: "Quando usar", body: "Com o artigo na fila." },
      { heading: "O que acontece", body: "“Markdown” ou “JSON”, na linha do artigo, baixa o arquivo e registra a exportação. No topo, “CSV” baixa o manifesto da área e “Exportar” baixa a visão filtrada da planilha." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você escolhe o formato." },
      { heading: "Depois", body: "Publique no seu site e registre a URL final (etapa 4)." },
    ],
    howToUse: [
      "Na aba “Fila”, clique em “Markdown” ou “JSON” na linha do artigo.",
      "Publique o conteúdo no seu site.",
    ],
    keywords: ["exportar", "markdown", "json", "csv", "manifesto", "arquivo", "baixar"],
  },
  {
    id: "etapa-registrar-url",
    title: "4 · Registrar a URL publicada",
    summary: "Grava onde o artigo foi publicado: o destino e a URL final. A partir daí ele é um publicado protegido.",
    description: "Depois de publicar no site, volte aqui e registre. A URL precisa ser completa (começando por https://). A plataforma não inventa nem troca a URL.",
    sections: [
      { heading: "Quando usar", body: "Logo depois de publicar o artigo exportado." },
      { heading: "O que acontece", body: "O artigo passa a Publicado e vai para a aba “Publicados”. URL, slug e canonical ficam protegidos em toda a plataforma." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você informa o destino e a URL." },
      { heading: "Depois", body: "O artigo publicado pode ser melhorado depois pelo Arquiteto (reforço) e atualizado aqui (etapa 5)." },
    ],
    howToUse: [
      "Na linha do artigo exportado, preencha o “Destino” e a URL final.",
      "Clique em “Registrar URL”.",
    ],
    keywords: ["registrar url", "url final", "destino", "publicado", "publicar", "protegido"],
  },
  {
    id: "etapa-atualizar",
    title: "5 · Atualizar um artigo publicado",
    summary: "Pede uma atualização do publicado ou reabre o texto no Redator, sem mudar a URL, o slug nem o canonical.",
    description: "O publicado continua no ar enquanto é atualizado. A atualização segue a mesma linha: reeditar no Redator, exportar a atualização e registrar de novo.",
    sections: [
      { heading: "Quando usar", body: "Quando um artigo publicado precisa de texto novo (por exemplo, depois de um reforço do Arquiteto)." },
      { heading: "O que acontece", body: "“Solicitar atualização” marca o pedido e o artigo aparece em “Atualizações”. “Reeditar” abre o mesmo documento no Redator. Com a atualização pronta, “Exportar atualização” baixa o arquivo e “Registrar atualização” grava." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você." },
      { heading: "Depois", body: "O artigo volta a “Publicados” com o histórico da atualização." },
    ],
    howToUse: [
      "Na aba “Publicados”, clique em “Solicitar atualização” ou “Reeditar”.",
      "Na aba “Atualizações”, clique em “Exportar atualização” e publique no site.",
      "Clique em “Registrar atualização”.",
    ],
    keywords: ["atualização", "solicitar atualização", "reeditar", "exportar atualização", "registrar atualização", "publicado"],
  },
];

const REFERENCE_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "historico-da-publicacao",
    title: "Histórico de cada artigo",
    summary: "Abra a linha para ver o destino, a URL final, a última exportação e o histórico de ações.",
    description: "Cada clique da linha de Publicações (fila, exportação, registro, atualização) fica registrado com a data. O histórico serve para conferir o que foi feito e quando.",
    keywords: ["histórico", "eventos", "última exportação", "conferir"],
  },
];

export const PUBLICACOES_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "publicacoes",
  title: "Publicações",
  topics: [...TUTORIAL_TOPICS, ...REFERENCE_TOPICS],
};
