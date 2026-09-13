import { register } from "node:module";

/**
 * LIGA O RESOLVEDOR ANTES DE QUALQUER IMPORT DO ENTRYPOINT.
 *
 * `--import` roda este módulo no início do processo, e `register` instala o
 * hook para tudo que vier depois — inclusive o primeiro `import` estático do
 * worker, que é justamente onde o boot quebrava.
 *
 * Está separado do hook porque `register` precisa rodar no thread principal
 * enquanto os hooks rodam noutro: juntá-los num arquivo só faria o próprio
 * resolvedor tentar registrar a si mesmo.
 */
register("./node-ts-resolver.mjs", import.meta.url);
