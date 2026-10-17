/*
 * 2026-10-16 · O TEXTO QUE O DONO COLOU no cadastro de uma lista nova
 * ("ele perdeu a capacidade de se adaptar e autopreencher"): blocos separados
 * por linha em branco, o papel sozinho na 1ª linha ("Silo", "Pilar",
 * "Suporte"), e em cada bloco o título, a keyword, o slug e a descrição SEM
 * rótulo. Usado EXATAMENTE como veio (fixture do dono), sem rede e sem custo.
 */
export const PLANO_EM_BLOCOS_DO_DONO = `Silo
Keyword: Planos e contratação
Slug: /planos-de-internet/

Pilar
Como escolher um plano de internet residencial sem cair em uma oferta ruim
como escolher plano de internet residencial
/planos-de-internet/como-escolher-plano-internet-residencial/
Escolha de plano: cobertura, necessidade de uso, custo total, tecnologia, contrato e encaminhamento

Suporte
Internet residencial barata: o que comparar além da mensalidade
internet residencial barata
/planos-de-internet/internet-residencial-barata/
Diferença entre preço promocional e custo real; reajuste, multa, instalação e serviços adicionais

Suporte
Claro, Vivo ou TIM para casa: como comparar onde você mora
claro vivo ou tim internet residencial
/planos-de-internet/claro-vivo-tim-internet-residencial/
Critérios condicionais por endereço, tecnologia, atendimento e contrato; provedores regionais

Suporte
Como saber quais operadoras de internet atendem minha rua e meu CEP
internet no meu cep
/planos-de-internet/operadoras-internet-no-meu-cep/
Diferença entre CEP e endereço completo, prédio, porta disponível e viabilidade técnica

Suporte
300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?
quantos mega de internet preciso
/planos-de-internet/quantos-mega-de-internet-preciso/
Dimensionamento por pessoas, dispositivos simultâneos e atividades; upload e Wi-Fi

Suporte
Combo de internet e celular vale a pena? Veja o que entra na conta
combo internet e celular
/planos-de-internet/combo-internet-e-celular-vale-a-pena/
Comparar combo vs contratos separados, franquia, portabilidade, desconto e permanência

Suporte
Internet, TV Box e streaming: quando compensa contratar tudo junto?
combo internet tv streaming
/planos-de-internet/combo-internet-tv-streaming-vale-a-pena/
Acesso a aplicativos, modalidade, telas, canais, duração dos benefícios e titularidade

Suporte
Instalação de internet: taxas, prazo e quando chega a primeira fatura
instalação de internet residencial
/planos-de-internet/instalacao-internet-primeira-fatura/
Instalação, agendamento, viabilidade, cobrança inicial e fidelidade`;

/** O que o leitor tem de devolver para o texto acima (ordem, papel, Assunto, keyword, slug, detalhes). */
export const PLANO_EM_BLOCOS_ESPERADO = [
  { order: 1, role: "Pilar", subject: "Como escolher um plano de internet residencial sem cair em uma oferta ruim", principal: "como escolher plano de internet residencial", slug: "como-escolher-plano-internet-residencial", scope: "Escolha de plano: cobertura, necessidade de uso, custo total, tecnologia, contrato e encaminhamento" },
  { order: 2, role: "Suporte", subject: "Internet residencial barata: o que comparar além da mensalidade", principal: "internet residencial barata", slug: "internet-residencial-barata", scope: "Diferença entre preço promocional e custo real; reajuste, multa, instalação e serviços adicionais" },
  { order: 3, role: "Suporte", subject: "Claro, Vivo ou TIM para casa: como comparar onde você mora", principal: "claro vivo ou tim internet residencial", slug: "claro-vivo-tim-internet-residencial", scope: "Critérios condicionais por endereço, tecnologia, atendimento e contrato; provedores regionais" },
  { order: 4, role: "Suporte", subject: "Como saber quais operadoras de internet atendem minha rua e meu CEP", principal: "internet no meu cep", slug: "operadoras-internet-no-meu-cep", scope: "Diferença entre CEP e endereço completo, prédio, porta disponível e viabilidade técnica" },
  { order: 5, role: "Suporte", subject: "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", principal: "quantos mega de internet preciso", slug: "quantos-mega-de-internet-preciso", scope: "Dimensionamento por pessoas, dispositivos simultâneos e atividades; upload e Wi-Fi" },
  { order: 6, role: "Suporte", subject: "Combo de internet e celular vale a pena? Veja o que entra na conta", principal: "combo internet e celular", slug: "combo-internet-e-celular-vale-a-pena", scope: "Comparar combo vs contratos separados, franquia, portabilidade, desconto e permanência" },
  { order: 7, role: "Suporte", subject: "Internet, TV Box e streaming: quando compensa contratar tudo junto?", principal: "combo internet tv streaming", slug: "combo-internet-tv-streaming-vale-a-pena", scope: "Acesso a aplicativos, modalidade, telas, canais, duração dos benefícios e titularidade" },
  { order: 8, role: "Suporte", subject: "Instalação de internet: taxas, prazo e quando chega a primeira fatura", principal: "instalação de internet residencial", slug: "instalacao-internet-primeira-fatura", scope: "Instalação, agendamento, viabilidade, cobrança inicial e fidelidade" },
] as const;
