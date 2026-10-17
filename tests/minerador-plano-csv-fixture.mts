import { readFileSync } from "node:fs";

/*
 * 2026-10-16 · O CSV DE PLANEJAMENTO DO DONO ("pode reconhecer este tipo de CSV
 * também, reconhecer os campos e preencher"): o arquivo como veio
 * (`tests/fixtures/wificonecta-planejamento-editorial-15.csv`: UTF-8 com BOM,
 * CRLF, ";" e aspas com "" dentro), 15 artigos em DOIS Silos. Cabeçalho:
 * numero;silo;hierarquia;titulo_h1_sugerido;keyword_hipotese_a_validar;
 * slug_proposto;intencao_exclusiva;fora_do_escopo;pagina_comercial_destino;
 * cta_sugerido;links_direcionais_sugeridos. Do CSV o plano usa Silo, papel,
 * ordem, Assunto, keyword, slug e detalhes (decisão do dono, 16/10: "só os 4
 * campos… o resto pode ignorar"); as outras quatro colunas são ditas numa
 * linha. Sem rede e sem custo.
 */
const ARQUIVO = new URL("./fixtures/wificonecta-planejamento-editorial-15.csv", import.meta.url);

/** Os bytes do arquivo, como o navegador entrega ao abrir/arrastar. */
export const PLANEJAMENTO_CSV_BYTES = new Uint8Array(readFileSync(ARQUIVO));
/** O texto como o Node lê em UTF-8 (com o BOM no começo, como o colar de um editor pode trazer). */
export const PLANEJAMENTO_CSV_DO_DONO = readFileSync(ARQUIVO, "utf8");

export const COLUNAS_IGNORADAS_DO_CSV = ["fora_do_escopo", "pagina_comercial_destino", "cta_sugerido", "links_direcionais_sugeridos"] as const;

/** Silo 1 — "Planos e contratação" (artigos 1 a 8, /planos-de-internet/…). */
export const SILO_PLANOS_ESPERADO = [
  { order: 1, role: "Pilar", subject: "Como escolher um plano de internet residencial sem cair em uma oferta ruim", principal: "como escolher plano de internet residencial", slug: "como-escolher-plano-internet-residencial", scope: "Escolha de plano: cobertura, necessidade de uso, custo total, tecnologia, contrato e encaminhamento" },
  { order: 2, role: "Suporte", subject: "Internet residencial barata: o que comparar além da mensalidade", principal: "internet residencial barata", slug: "internet-residencial-barata-custo-total", scope: "Diferença entre preço promocional e custo real; reajuste, multa, instalação e serviços adicionais" },
  { order: 3, role: "Suporte", subject: "Claro, Vivo ou TIM para casa: como comparar onde você mora", principal: "claro vivo ou tim internet residencial", slug: "claro-vivo-tim-internet-residencial", scope: "Critérios condicionais por endereço, tecnologia, atendimento e contrato; provedores regionais" },
  { order: 4, role: "Suporte", subject: "Como saber quais operadoras de internet atendem minha rua e meu CEP", principal: "internet no meu cep", slug: "operadoras-internet-no-meu-cep", scope: "Diferença entre CEP e endereço completo, prédio, porta disponível e viabilidade técnica" },
  { order: 5, role: "Suporte", subject: "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", principal: "quantos mega de internet preciso", slug: "quantos-mega-de-internet-preciso", scope: "Dimensionamento por pessoas, dispositivos simultâneos e atividades; upload e Wi-Fi" },
  { order: 6, role: "Suporte", subject: "Combo de internet e celular vale a pena? Veja o que entra na conta", principal: "combo internet e celular", slug: "combo-internet-e-celular-vale-a-pena", scope: "Comparar combo vs contratos separados, franquia, portabilidade, desconto e permanência" },
  { order: 7, role: "Suporte", subject: "Internet, TV Box e streaming: quando compensa contratar tudo junto?", principal: "combo internet tv streaming", slug: "combo-internet-tv-streaming-vale-a-pena", scope: "Acesso a aplicativos, modalidade, telas, canais, duração dos benefícios e titularidade" },
  { order: 8, role: "Suporte", subject: "Instalação de internet: taxas, prazo e quando chega a primeira fatura", principal: "instalação de internet residencial", slug: "instalacao-internet-primeira-fatura", scope: "Instalação, agendamento, viabilidade, cobrança inicial e fidelidade" },
] as const;

/** Silo 2 — "Wi-Fi e fibra óptica" (artigos 9 a 15, /wifi-e-fibra/…; o Pilar é o 9). */
export const SILO_WIFI_ESPERADO = [
  { order: 9, role: "Pilar", subject: "Fibra óptica, cabo ou internet sem fio: entenda o que muda na sua conexão", principal: "diferença internet fibra óptica e cabo", slug: "fibra-optica-cabo-internet-sem-fio", scope: "Tipos de conexão até residência, trade-offs, infraestrutura, fibra até o imóvel vs HFC" },
  { order: 10, role: "Suporte", subject: "Internet e Wi-Fi são a mesma coisa? Por que seu sinal pode falhar", principal: "diferença entre internet e wifi", slug: "diferenca-internet-wifi", scope: "Separar contrato/conexão da rede Wi-Fi e dos equipamentos domésticos" },
  { order: 11, role: "Suporte", subject: "Wi-Fi lento: o que testar antes de trocar de plano", principal: "wifi lento", slug: "wifi-lento-como-melhorar", scope: "Roteador, distância, bandas, interferência, dispositivos, reinício e suporte" },
  { order: 12, role: "Suporte", subject: "Quantos Mega precisa para Netflix, YouTube e várias TVs em casa?", principal: "quantos mega para streaming", slug: "quantos-mega-netflix-youtube-streaming", scope: "Qualidade de vídeo, telas simultâneas, consumo, Wi-Fi; citar recomendações oficiais com data" },
  { order: 13, role: "Suporte", subject: "Internet para jogos online: ping e estabilidade importam mais que Mega?", principal: "melhor internet para jogos online", slug: "internet-para-jogos-ping-estabilidade", scope: "Latência, jitter, perda de pacotes, cabeamento, servidores e download de jogos" },
  { order: 14, role: "Suporte", subject: "Internet para home office: como evitar travamentos em videochamadas", principal: "internet para home office", slug: "internet-home-office-videochamadas", scope: "Upload, estabilidade, Wi-Fi no local de trabalho, videoconferência, conexão reserva" },
  { order: 15, role: "Suporte", subject: "Como interpretar um teste de velocidade da internet e achar o gargalo", principal: "como interpretar teste de velocidade da internet", slug: "interpretar-teste-velocidade-internet", scope: "Download, upload, ping, cabo vs Wi-Fi, repetição dos testes e evidências para suporte" },
] as const;

/** Trechos das colunas ignoradas: nunca podem aparecer no plano, no DNA nem na tela preenchida. */
export const TRECHOS_DAS_COLUNAS_IGNORADAS = ["Não listar promoções como se fossem atuais", "Consultar opções disponíveis para meu endereço", "1→2,3,4,5,6,7,8"] as const;
