/**
 * ===== ZIP SEM COMPRESSÃO — um pacote para vários CSVs de silo =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * O export por silo gera um CSV por silo. Com dois ou mais silos, vários
 * downloads seguidos fazem o navegador pedir permissão para "vários arquivos"
 * — e quem recusa sem perceber fica com metade do trabalho. Um arquivo só
 * resolve isso.
 *
 * Não existe dependência de zip no projeto (o `jszip` do lockfile é transitivo
 * do `mammoth` e não está no topo de `node_modules`), e instalar pacote é
 * decisão do usuário (AGENTS.md §15). O formato "store" — método 0, sem
 * compressão — cabe em cem linhas: cabeçalho local, os bytes, diretório
 * central e fim do diretório. CSV comprime bem, mas o ganho não paga uma
 * implementação de deflate mantida à mão.
 *
 * ==================== O QUE ELE GARANTE ====================
 *
 * - CRC32 correto em cada entrada: um leitor que confere (unzip -t, o
 *   Explorador do Windows) recusa o arquivo inteiro por um CRC errado;
 * - nomes em UTF-8 com o bit 11 ligado: sem ele, "silo-cuidados-com-a-pele"
 *   passa, mas um nome acentuado vira mojibake no Windows;
 * - data e hora DOS na hora local, que é como os leitores as interpretam;
 * - nada de `Buffer`: roda igual no navegador (onde o zip é montado) e no
 *   Node (onde é testado). `TextEncoder`, `DataView` e `Uint8Array` existem
 *   nos dois.
 *
 * ==================== O QUE ELE NÃO FAZ ====================
 *
 * Sem ZIP64: até 65.535 entradas e 4 GiB no total. Um lote de CSVs de silo
 * fica ordens de grandeza abaixo disso — e passar do limite é erro explícito,
 * nunca um arquivo corrompido em silêncio.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export type RadarStoredZipEntry = {
  /** Caminho dentro do zip, com barra normal. Um nome simples basta para CSV. */
  name: string;
  bytes: Uint8Array;
};

export type RadarStoredZipOptions = {
  /**
   * Instante gravado em todas as entradas. Quem monta o pacote passa o
   * instante do export, e o mesmo pedido gera o mesmo arquivo.
   */
  modifiedAt?: Date;
};

export const RADAR_STORED_ZIP_MIME = "application/zip";

/* ============================== CRC32 ============================== */

/*
 * A TABELA É CALCULADA UMA VEZ, na primeira chamada.
 *
 * Polinômio refletido 0xEDB88320 — o do zip, do PNG e do gzip. Um literal com
 * 256 números seria mais uma coisa para conferir à mão; o laço é a definição.
 */
let tabelaCrc: Uint32Array | null = null;

function tabela(): Uint32Array {
  if (tabelaCrc) return tabelaCrc;
  const nova = new Uint32Array(256);
  for (let indice = 0; indice < 256; indice += 1) {
    let valor = indice;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    }
    nova[indice] = valor >>> 0;
  }
  tabelaCrc = nova;
  return nova;
}

/** CRC32 do zip, sem sinal. `radarCrc32("123456789")` é 0xCBF43926. */
export function radarCrc32(bytes: Uint8Array): number {
  const crcs = tabela();
  let crc = 0xffffffff;
  for (let indice = 0; indice < bytes.length; indice += 1) {
    crc = crcs[(crc ^ bytes[indice]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ============================ data DOS ============================ */

/**
 * ===== DATA E HORA NO FORMATO DO MS-DOS =====
 *
 * Dois campos de 16 bits: hora com resolução de 2 segundos, e data contada a
 * partir de 1980. Antes de 1980 não há representação — o piso é 1980-01-01,
 * em vez de um ano negativo que viraria 2107 em alguns leitores.
 *
 * Hora LOCAL, de propósito: o formato não tem fuso, e os leitores mostram o
 * valor como hora local. Gravar UTC faria o arquivo "nascer" três horas antes
 * para quem está no Brasil.
 */
export function radarDosDateTime(instante: Date): { time: number; date: number } {
  const valido = Number.isFinite(instante.getTime()) ? instante : new Date(1980, 0, 1);
  const ano = valido.getFullYear();
  if (ano < 1980) return { time: 0, date: (0 << 9) | (1 << 5) | 1 };
  const anoDos = Math.min(ano, 2107) - 1980;
  return {
    time: ((valido.getHours() & 0x1f) << 11) | ((valido.getMinutes() & 0x3f) << 5) | ((valido.getSeconds() >> 1) & 0x1f),
    date: ((anoDos & 0x7f) << 9) | (((valido.getMonth() + 1) & 0x0f) << 5) | (valido.getDate() & 0x1f),
  };
}

/* ============================ o pacote ============================ */

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;

/* 2.0: o mínimo que os leitores esperam para o bit de UTF-8 e para "store". */
const VERSAO = 20;
/* Bit 11: nome e comentário em UTF-8. */
const FLAG_UTF8 = 0x0800;
const METODO_STORE = 0;

const LIMITE_16 = 0xffff;
const LIMITE_32 = 0xffffffff;

/**
 * ===== O NOME PRECISA SER UM CAMINHO QUE NÃO ESCAPA =====
 *
 * Quem extrai confia no nome. Barra invertida vira separador no Windows e
 * literal no resto; ".." e caminho absoluto escrevem fora da pasta de destino.
 * Nada disso é necessário para um CSV de silo — e recusar é mais seguro do que
 * "corrigir" o nome sem que quem chamou saiba.
 */
function validarNome(nome: string): void {
  if (!nome || !nome.trim()) throw new Error("Entrada de zip sem nome.");
  if (nome.includes("\\")) throw new Error(`Nome de entrada com barra invertida: ${nome}`);
  if (nome.startsWith("/") || /^[A-Za-z]:/.test(nome)) throw new Error(`Nome de entrada absoluto: ${nome}`);
  if (nome.split("/").some(parte => parte === ".." || parte === ".")) throw new Error(`Nome de entrada com "." ou "..": ${nome}`);
  if (nome.includes("\u0000")) throw new Error("Nome de entrada com caractere nulo.");
}

/**
 * Monta um zip sem compressão com as entradas na ordem recebida.
 *
 * Nomes repetidos são recusados, sem diferenciar maiúsculas: extraídos no
 * Windows ou no macOS, o segundo sobrescreveria o primeiro sem aviso.
 */
export function radarStoredZip(entries: readonly RadarStoredZipEntry[], options: RadarStoredZipOptions = {}): Uint8Array {
  if (entries.length > LIMITE_16) throw new Error(`Um zip sem ZIP64 aceita até ${LIMITE_16} entradas.`);

  const codificador = new TextEncoder();
  const { time, date } = radarDosDateTime(options.modifiedAt ?? new Date());
  const vistos = new Set<string>();

  const preparadas = entries.map(entrada => {
    validarNome(entrada.name);
    const chave = entrada.name.normalize("NFC").toLowerCase();
    if (vistos.has(chave)) throw new Error(`Nome de entrada repetido no zip: ${entrada.name}`);
    vistos.add(chave);

    const nome = codificador.encode(entrada.name.normalize("NFC"));
    if (nome.length > LIMITE_16) throw new Error(`Nome de entrada longo demais: ${entrada.name}`);
    if (entrada.bytes.length > LIMITE_32) throw new Error(`Entrada grande demais para zip sem ZIP64: ${entrada.name}`);
    return { nome, bytes: entrada.bytes, crc: radarCrc32(entrada.bytes) };
  });

  const tamanhoLocais = preparadas.reduce((soma, item) => soma + 30 + item.nome.length + item.bytes.length, 0);
  const tamanhoCentral = preparadas.reduce((soma, item) => soma + 46 + item.nome.length, 0);
  const total = tamanhoLocais + tamanhoCentral + 22;
  if (tamanhoLocais > LIMITE_32 || tamanhoCentral > LIMITE_32) throw new Error("O pacote passa de 4 GiB, que é o limite de um zip sem ZIP64.");

  const saida = new Uint8Array(total);
  const vista = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
  let cursor = 0;

  const u16 = (valor: number) => { vista.setUint16(cursor, valor, true); cursor += 2; };
  const u32 = (valor: number) => { vista.setUint32(cursor, valor >>> 0, true); cursor += 4; };
  const bytes = (valor: Uint8Array) => { saida.set(valor, cursor); cursor += valor.length; };

  /* ---------------------- cabeçalhos locais e dados ---------------------- */

  const deslocamentos: number[] = [];
  for (const item of preparadas) {
    deslocamentos.push(cursor);
    u32(ASSINATURA_LOCAL);
    u16(VERSAO);
    u16(FLAG_UTF8);
    u16(METODO_STORE);
    u16(time);
    u16(date);
    u32(item.crc);
    u32(item.bytes.length); /* comprimido: igual ao original, porque é "store" */
    u32(item.bytes.length);
    u16(item.nome.length);
    u16(0); /* sem campo extra */
    bytes(item.nome);
    bytes(item.bytes);
  }

  /* -------------------------- diretório central -------------------------- */

  const inicioCentral = cursor;
  preparadas.forEach((item, indice) => {
    u32(ASSINATURA_CENTRAL);
    u16(VERSAO); /* feito por: MS-DOS, 2.0 — sem permissões Unix para inventar */
    u16(VERSAO);
    u16(FLAG_UTF8);
    u16(METODO_STORE);
    u16(time);
    u16(date);
    u32(item.crc);
    u32(item.bytes.length);
    u32(item.bytes.length);
    u16(item.nome.length);
    u16(0); /* extra */
    u16(0); /* comentário */
    u16(0); /* disco de início */
    u16(0); /* atributos internos */
    u32(0); /* atributos externos */
    u32(deslocamentos[indice]);
    bytes(item.nome);
  });

  /* ---------------------- fim do diretório central ---------------------- */

  u32(ASSINATURA_FIM);
  u16(0); /* este disco */
  u16(0); /* disco do diretório */
  u16(preparadas.length);
  u16(preparadas.length);
  /* O tamanho já é conhecido: medir pelo cursor aqui contaria os campos deste próprio registro. */
  u32(tamanhoCentral);
  u32(inicioCentral);
  u16(0); /* sem comentário */

  /* O tamanho foi calculado antes de escrever; se divergir, o arquivo está errado — melhor falhar aqui. */
  if (cursor !== total) throw new Error(`Zip montado com ${cursor} bytes, esperados ${total}.`);
  return saida;
}

/** Conveniência para o caso comum: textos (CSV) viram bytes UTF-8. */
export function radarStoredZipOfTexts(
  files: readonly { name: string; text: string }[],
  options: RadarStoredZipOptions = {},
): Uint8Array {
  const codificador = new TextEncoder();
  return radarStoredZip(files.map(file => ({ name: file.name, bytes: codificador.encode(file.text) })), options);
}
