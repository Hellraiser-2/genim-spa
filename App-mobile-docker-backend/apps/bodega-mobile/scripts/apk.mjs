// Genera el APK de la app de bodega.
//
//   npm run apk                                      la app pide la IP del servidor al abrirse
//   npm run apk -- --servidor=http://10.0.0.5:3000   parte con esa dirección
//   npm run apk -- --demo                            sin servidor: arranca en modo demostración
//
// En un teléfono, la IP del equipo servidor cambia con la red (la del local o la zona Wi-Fi
// de un celular), por eso por defecto no se fija al compilar: la app la pide, la recuerda y
// la vuelve a pedir si deja de responder. Requiere un JDK 21 y el SDK de Android (ver README).

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const requerir = createRequire(import.meta.url);
const binario = (paquete, ruta) => join(dirname(requerir.resolve(`${paquete}/package.json`)), ruta);

function ejecutar(titulo, comando, argumentos, opciones = {}) {
  console.log(`\n== ${titulo} ==`);
  const { status } = spawnSync(comando, argumentos, { cwd: RAIZ, stdio: 'inherit', ...opciones });
  if (status !== 0) {
    console.error(`\nFalló: ${titulo}`);
    process.exit(status ?? 1);
  }
}

const argumentos = process.argv.slice(2);
const pedido = argumentos.find((argumento) => argumento.startsWith('--servidor='))?.slice('--servidor='.length);
const demo = argumentos.includes('--demo');
const servidor = demo ? '' : (pedido ?? '').replace(/\/+$/, '');
if (demo) {
  console.log('La app arrancará en modo demostración, sin servidor.');
} else {
  console.log(servidor ? `Servidor inicial de la app: ${servidor}` : 'La app pedirá la IP del servidor al abrirse.');
}

ejecutar('Compilando la app', process.execPath, [
  binario('@angular/cli', 'bin/ng.js'),
  'build',
  '--define',
  `SERVIDOR_API=${JSON.stringify(servidor)}`,
  '--define',
  `MODO_DEMO=${demo}`,
]);
ejecutar('Copiando la app al proyecto Android', process.execPath, [binario('@capacitor/cli', 'bin/capacitor'), 'sync', 'android']);

const windows = process.platform === 'win32';
// Con la ruta relativa explícita: el intérprete de Windows puede estar configurado para no buscar en la carpeta actual.
ejecutar('Compilando el APK', windows ? '.\\gradlew.bat' : './gradlew', ['assembleDebug', '--console=plain', '--quiet'], {
  cwd: join(RAIZ, 'android'),
  // Un archivo .bat solo se puede lanzar a través del intérprete de comandos.
  shell: windows,
});

const origen = join(RAIZ, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const destino = join(RAIZ, 'apk', 'rockstar-bodega.apk');
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log(`\nAPK listo (${(statSync(destino).size / 1024 / 1024).toFixed(1)} MB): ${destino}`);
