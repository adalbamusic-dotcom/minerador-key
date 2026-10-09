/**
 * ===== 2026-10-09 · O PLANO DO VÍDEO DE BANCADA (o mesmo formato de `radarVideoPlan`) =====
 *
 * A semeadura do Redator recebe o plano que o CSV de vídeo monta
 * (`radarVideoPlan`, lib/radar/portable-video-export.ts): o formato decidido
 * pela amostra pertinente, o gancho, a premissa, os capítulos da planta, os
 * cortes pela utilidade e o que a trava tirou do texto publicável. Esta fixture
 * é um plano literal, sem rede e sem IA, para os testes do módulo puro da
 * semente (que rodam sem o carregador de `@/`). O plano REAL, montado pela
 * função do CSV, é provado em `radar-piloto-redator-roteiro-2026-10-09.test.mts`.
 */

import type { RadarVideoPlan } from "../lib/radar/portable-video-export.ts";

export const MOTIVO_LONGO = "os vídeos longos lideram a amostra pertinente (2 Short(s) × 9 vídeo(s) longo(s) pertinentes): o vídeo segue o artigo-modelo, em formato longo";
export const MOTIVO_CURTO = "os Shorts lideram a amostra pertinente (6 Short(s) × 2 vídeo(s) longo(s) pertinentes): o vídeo é o recorte da planta, um capítulo por vídeo curto";

const coorte = (videoCount: number) => ({ videoCount }) as never;

export function planoDeVideo(extra: Partial<RadarVideoPlan> = {}): RadarVideoPlan {
  return {
    status: "ready",
    formato: { curto: false, lider: "LONG_FORM", faixa: { min: 360, max: 720 }, faixas: { longos: { min: 360, max: 720 }, curtos: { min: 30, max: 55 } }, motivo: MOTIVO_LONGO },
    gancho: "Pele oleosa pede uma rotina curta: o primeiro passo é o sabonete certo.",
    premissa: "A rotina noturna para pele oleosa cabe em três passos.",
    capitulos: [
      { numero: 1, titulo: "Limpeza: o primeiro passo da noite", pergunta: "Qual sabonete usar à noite?", entregar: "O leitor escolhe o sabonete pelo tipo de pele.", explicar: ["Gel de limpeza tira o excesso de óleo sem ressecar."], falaDelimitada: [], mostrar: "o rótulo do sabonete em gel, lido de perto", antesDeAfirmar: null, demonstravel: true },
      { numero: 2, titulo: "Hidratação leve", pergunta: "Pele oleosa precisa de hidratante?", entregar: "O leitor entende por que hidratar.", explicar: ["Textura em gel-creme."], falaDelimitada: ["O hidratante certo reduz a oleosidade em uma semana."], mostrar: "a textura do gel-creme na mão", antesDeAfirmar: "fonte do pacote S1", demonstravel: true },
      { numero: 3, titulo: "Erros comuns à noite", pergunta: null, entregar: "O leitor evita os três erros mais comuns.", explicar: [], falaDelimitada: [], mostrar: "", antesDeAfirmar: null, demonstravel: false },
    ],
    cortes: [
      { numero: 1, capitulo: 1, titulo: "Limpeza: o primeiro passo da noite", utilidade: { pontos: 2, partes: ["pergunta com demanda", "demonstração da planta"] }, gancho: "Qual sabonete usar à noite?", ideia: "Gel de limpeza tira o excesso de óleo sem ressecar.", mostrar: "o rótulo do sabonete em gel", fonte: null, origem: "capítulo 1, pela demonstração da planta" },
    ],
    semCorte: [{ capitulo: 2, motivo: "a ideia única pede fonte" }, { capitulo: 3, motivo: "sem demonstração na planta" }],
    foraDoPublicavel: [{ onde: "Capítulo 2", frase: "O hidratante certo reduz a oleosidade em uma semana.", motivo: "afirmação sobre conversão do público sem fonte" }],
    amostra: { longos: { total: 12, coorte: coorte(9) }, curtos: { total: 4, coorte: coorte(2) }, foraDaConta: { FORA: 3, OUTRO: 1 }, formatos: [], lider: "LONG_FORM", faixa: { min: 360, max: 720 }, formato: "tutorial", ressalvas: [], videos: [] } as never,
    ...extra,
  };
}

/** O formato curto: a série de vídeos curtos são os cortes da planta. */
export function planoCurto(extra: Partial<RadarVideoPlan> = {}): RadarVideoPlan {
  const base = planoDeVideo();
  return planoDeVideo({
    formato: { curto: true, lider: "SHORTS", faixa: { min: 30, max: 55 }, faixas: base.formato.faixas, motivo: MOTIVO_CURTO },
    cortes: [...base.cortes, { ...base.cortes[0], numero: 2, capitulo: 3, titulo: "Erros comuns à noite", gancho: "Você comete este erro à noite?", ideia: "Dormir sem tirar a maquiagem entope os poros.", origem: "capítulo 3" }],
    ...extra,
  });
}
