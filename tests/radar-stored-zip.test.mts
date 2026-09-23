import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_STORED_ZIP_MIME,
  radarCrc32,
  radarDosDateTime,
  radarStoredZip,
  radarStoredZipOfTexts,
} from "../lib/radar/stored-zip.ts";

/*
 * ===== O ZIP SEM COMPRESSÃO DO EXPORT POR SILO =====
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 * Dois ou mais silos saem num zip só, montado sem dependência nova. Um zip
 * errado não dá erro na hora de montar: ele abre "vazio", ou o Windows diz
 * que o arquivo está corrompido — para quem clicou em Exportar, muito depois.
 *
 * Por isso a prova é de IDA E VOLTA com um leitor escrito AQUI, independente
 * do escritor: ele confere as três assinaturas, o bit de UTF-8, o método
 * "store", os tamanhos, o CRC (por um cálculo bit a bit, não pela tabela do
 * módulo) e o conteúdo byte a byte.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ======================= o leitor mínimo e independente ======================= */

/* CRC32 bit a bit: mais lento, e por isso mesmo não compartilha a tabela do escritor. */
function crcBitABit(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type EntradaLida = { name: string; bytes: Uint8Array; time: number; date: number; flags: number };

function lerZip(zip: Uint8Array): EntradaLida[] {
  const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decodificador = new TextDecoder("utf-8", { fatal: true });

  /* O fim do diretório fica nos últimos 22 bytes quando não há comentário. */
  let fim = -1;
  for (let indice = zip.length - 22; indice >= 0; indice -= 1) {
    if (vista.getUint32(indice, true) === 0x06054b50) { fim = indice; break; }
  }
  assert.ok(fim >= 0, "o zip precisa ter o registro de fim do diretório central");
  assert.equal(fim, zip.length - 22, "sem comentário, o fim do diretório fecha o arquivo");

  const total = vista.getUint16(fim + 10, true);
  assert.equal(vista.getUint16(fim + 8, true), total, "entradas neste disco = entradas no total");
  const tamanhoCentral = vista.getUint32(fim + 12, true);
  const inicioCentral = vista.getUint32(fim + 16, true);
  assert.equal(inicioCentral + tamanhoCentral, fim, "o diretório central termina onde começa o registro de fim");

  const lidas: EntradaLida[] = [];
  let cursor = inicioCentral;
  for (let entrada = 0; entrada < total; entrada += 1) {
    assert.equal(vista.getUint32(cursor, true), 0x02014b50, "assinatura do diretório central");
    const flags = vista.getUint16(cursor + 8, true);
    const metodo = vista.getUint16(cursor + 10, true);
    const time = vista.getUint16(cursor + 12, true);
    const date = vista.getUint16(cursor + 14, true);
    const crc = vista.getUint32(cursor + 16, true);
    const comprimido = vista.getUint32(cursor + 20, true);
    const original = vista.getUint32(cursor + 24, true);
    const tamanhoNome = vista.getUint16(cursor + 28, true);
    const tamanhoExtra = vista.getUint16(cursor + 30, true);
    const tamanhoComentario = vista.getUint16(cursor + 32, true);
    const local = vista.getUint32(cursor + 42, true);
    const nome = decodificador.decode(zip.subarray(cursor + 46, cursor + 46 + tamanhoNome));

    assert.equal(flags & 0x0800, 0x0800, `bit 11 (UTF-8) ligado em ${nome}`);
    assert.equal(metodo, 0, `método "store" em ${nome}`);
    assert.equal(comprimido, original, `sem compressão, os dois tamanhos são iguais em ${nome}`);

    /* O cabeçalho local precisa repetir o que o diretório central diz. */
    assert.equal(vista.getUint32(local, true), 0x04034b50, `assinatura do cabeçalho local de ${nome}`);
    assert.equal(vista.getUint16(local + 6, true), flags);
    assert.equal(vista.getUint16(local + 8, true), 0);
    assert.equal(vista.getUint32(local + 14, true), crc);
    assert.equal(vista.getUint32(local + 18, true), comprimido);
    assert.equal(vista.getUint32(local + 22, true), original);
    const nomeLocal = vista.getUint16(local + 26, true);
    const extraLocal = vista.getUint16(local + 28, true);
    assert.equal(decodificador.decode(zip.subarray(local + 30, local + 30 + nomeLocal)), nome, "o nome local é o mesmo do diretório");

    const inicioDados = local + 30 + nomeLocal + extraLocal;
    const bytes = zip.slice(inicioDados, inicioDados + original);
    assert.equal(crcBitABit(bytes), crc, `CRC de ${nome}`);

    lidas.push({ name: nome, bytes, time, date, flags });
    cursor += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  assert.equal(cursor, fim, "o diretório central não tem sobra nem falta");
  return lidas;
}

const semComentarios = (codigo: string) => codigo
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ================================ CRC32 ================================ */

test("CRC32 · os vetores conhecidos do polinômio do zip", () => {
  const bytes = (valor: string) => new TextEncoder().encode(valor);
  assert.equal(radarCrc32(new Uint8Array()), 0);
  assert.equal(radarCrc32(bytes("123456789")), 0xcbf43926);
  assert.equal(radarCrc32(bytes("The quick brown fox jumps over the lazy dog")), 0x414fa339);

  /* E concorda com o cálculo bit a bit num texto acentuado e longo. */
  const longo = bytes("Pele sensível, ação e proteção. ".repeat(500));
  assert.equal(radarCrc32(longo), crcBitABit(longo));
});

/* ============================ ida e volta ============================ */

test("ida e volta · nomes acentuados em UTF-8, CSV com BOM, arquivo vazio", () => {
  const csvA = "\uFEFF\"título\",\"silo_context_md\"\r\n\"Sérum para pele oleosa\",\"# Contexto do silo\nOrdem: 1 de 3\"\r\n";
  const csvB = "\uFEFF\"título\"\r\n\"Proteção solar — ação diária\"\r\n";
  const arquivos = [
    { name: "radar-silo-cuidados-com-a-pele-2026-09-23-parcial.csv", text: csvA },
    { name: "Proteção — ação diária ç ã é.csv", text: csvB },
    { name: "pasta/vazio.csv", text: "" },
  ];

  const zip = radarStoredZipOfTexts(arquivos, { modifiedAt: new Date(2026, 8, 23, 14, 30, 58) });
  const lidas = lerZip(zip);

  assert.deepEqual(lidas.map(item => item.name), arquivos.map(item => item.name), "nomes e ordem preservados");
  const decodificador = new TextDecoder("utf-8");
  lidas.forEach((item, indice) => {
    /* `ignoreBOM` não existe no default: o decodificador tira o BOM, então comparo bytes. */
    assert.deepEqual([...item.bytes], [...new TextEncoder().encode(arquivos[indice].text)], `conteúdo de ${item.name}`);
  });
  assert.equal(decodificador.decode(lidas[1].bytes).includes("Proteção solar — ação diária"), true);
  assert.equal(lidas[0].bytes[0], 0xef, "o BOM do CSV atravessa o zip");
});

test("ida e volta · bytes arbitrários, sem transformar nada", () => {
  const binario = Uint8Array.from({ length: 1024 }, (_, indice) => (indice * 37 + 11) & 0xff);
  const lidas = lerZip(radarStoredZip([{ name: "dados.bin", bytes: binario }], { modifiedAt: new Date(2026, 0, 2, 3, 4, 6) }));
  assert.equal(lidas.length, 1);
  assert.deepEqual([...lidas[0].bytes], [...binario]);
});

test("zip sem entradas · só o registro de fim, e ainda assim válido", () => {
  const zip = radarStoredZip([]);
  assert.equal(zip.length, 22);
  assert.deepEqual(lerZip(zip), []);
});

/* ============================== data DOS ============================== */

test("data DOS · hora local com resolução de 2 segundos, piso em 1980", () => {
  const instante = new Date(2026, 8, 23, 14, 30, 58);
  const lidas = lerZip(radarStoredZip([{ name: "a.csv", bytes: new Uint8Array([1]) }], { modifiedAt: instante }));
  const { time, date } = lidas[0];
  assert.equal(time >> 11, 14, "hora");
  assert.equal((time >> 5) & 0x3f, 30, "minuto");
  assert.equal((time & 0x1f) * 2, 58, "segundo, em passos de 2");
  assert.equal((date >> 9) + 1980, 2026, "ano");
  assert.equal((date >> 5) & 0x0f, 9, "mês");
  assert.equal(date & 0x1f, 23, "dia");

  /* Antes de 1980 não há representação: vira 1980-01-01 00:00, não um ano negativo. */
  assert.deepEqual(radarDosDateTime(new Date(1970, 0, 1)), { time: 0, date: (1 << 5) | 1 });
  /* Data inválida não pode virar lixo no cabeçalho. */
  assert.deepEqual(radarDosDateTime(new Date(Number.NaN)), { time: 0, date: (1 << 5) | 1 });
});

/* ============================== recusas ============================== */

test("recusas · nome repetido (sem diferenciar maiúsculas), caminho que escapa, nome vazio", () => {
  const um = new Uint8Array([1]);
  assert.throws(() => radarStoredZip([{ name: "silo.csv", bytes: um }, { name: "SILO.csv", bytes: um }]), /repetido/);
  assert.throws(() => radarStoredZip([{ name: "../fora.csv", bytes: um }]), /"\.\."/);
  assert.throws(() => radarStoredZip([{ name: "pasta/./a.csv", bytes: um }]), /"\.\."/);
  assert.throws(() => radarStoredZip([{ name: "/absoluto.csv", bytes: um }]), /absoluto/);
  assert.throws(() => radarStoredZip([{ name: "C:/absoluto.csv", bytes: um }]), /absoluto/);
  assert.throws(() => radarStoredZip([{ name: "pasta\\a.csv", bytes: um }]), /barra invertida/);
  assert.throws(() => radarStoredZip([{ name: "  ", bytes: um }]), /sem nome/);
});

/* ======================== navegador e Node ======================== */

test("navegador · o módulo não depende de Buffer nem de módulo do Node", async () => {
  const fonte = semComentarios(await readFile(new URL("../lib/radar/stored-zip.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(fonte, /\bBuffer\b/, "Buffer não existe no navegador");
  assert.doesNotMatch(fonte, /from\s+["']node:/, "import de módulo do Node");
  assert.doesNotMatch(fonte, /\brequire\(/, "require não existe no navegador");
  assert.doesNotMatch(fonte, /^import\s/m, "o módulo não precisa de import nenhum");

  /* E a prova de comportamento: sem Buffer global, o zip sai igual. */
  const guardado = (globalThis as { Buffer?: unknown }).Buffer;
  const esperado = radarStoredZipOfTexts([{ name: "ação.csv", text: "olá" }], { modifiedAt: new Date(2026, 8, 23) });
  try {
    (globalThis as { Buffer?: unknown }).Buffer = undefined;
    const semBuffer = radarStoredZipOfTexts([{ name: "ação.csv", text: "olá" }], { modifiedAt: new Date(2026, 8, 23) });
    assert.deepEqual([...semBuffer], [...esperado]);
  } finally {
    (globalThis as { Buffer?: unknown }).Buffer = guardado;
  }
  assert.equal(RADAR_STORED_ZIP_MIME, "application/zip");
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
