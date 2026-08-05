/**
 * Levanta la base de datos local en Docker.
 *
 * Envuelve `docker compose up` para que las dos formas de fallar tengan una
 * explicación en lugar de un error del sistema operativo: que Docker no esté
 * instalado, y que esté instalado pero sin el motor corriendo. Principio 18
 * del PDL — el error enseña — vale también para quien desarrolla.
 */

import { spawnSync } from 'node:child_process';

const COMPOSE_UP = ['compose', 'up', '-d', '--wait'];

/**
 * Frases con las que cada intérprete anuncia que el comando no existe.
 *
 * En Windows hay que ejecutar a través del intérprete para que resuelva la
 * extensión `.exe`, y entonces un comando inexistente no llega como ENOENT
 * sino como un error del propio intérprete. Sin esta comprobación, "Docker no
 * está instalado" se confunde con "el motor está detenido", y el mensaje manda
 * a abrir un programa que nunca se instaló.
 */
const NO_EXISTE = /not recognized|no se reconoce|not found|no se encontr/i;

/** 'ok' | 'sin-docker' | 'motor-detenido' */
function estadoDeDocker() {
  const version = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (version.error?.code === 'ENOENT') return 'sin-docker';
  if (version.status === 0) return 'ok';

  const salida = `${version.stderr ?? ''}${version.stdout ?? ''}`;
  return NO_EXISTE.test(salida) ? 'sin-docker' : 'motor-detenido';
}

function explicarSinDocker() {
  console.error(
    [
      'Docker no está instalado en esta máquina.',
      '',
      'La base de datos de desarrollo corre en un contenedor. Para instalarlo:',
      '',
      '  winget install Docker.DockerDesktop',
      '',
      'Después de instalar hay que reiniciar la máquina y abrir Docker Desktop',
      'una vez, para que arranque el motor.',
      '',
      'Mientras tanto podés usar la base embebida, que no requiere instalar nada:',
      '',
      '  npm run db:embedded',
      '',
      'Atiende un cliente por vez: con la aplicación corriendo no vas a poder',
      'migrar sin detenerla antes.',
    ].join('\n'),
  );
}

function explicarMotorDetenido() {
  console.error(
    [
      'Docker está instalado pero el motor no responde.',
      '',
      'Suele ser que Docker Desktop no está abierto. Abrilo y esperá a que el',
      'ícono deje de indicar que está iniciando; después volvé a correr:',
      '',
      '  npm run db:local',
    ].join('\n'),
  );
}

const estado = estadoDeDocker();

if (estado === 'sin-docker') {
  explicarSinDocker();
  process.exit(1);
}

if (estado === 'motor-detenido') {
  explicarMotorDetenido();
  process.exit(1);
}

console.log('Levantando PostgreSQL y esperando a que acepte conexiones...');

const arranque = spawnSync('docker', COMPOSE_UP, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (arranque.status !== 0) {
  console.error(
    [
      '',
      'El contenedor no llegó a estar listo.',
      '',
      'Para ver por qué:',
      '',
      '  npm run db:logs',
      '',
      'Si el puerto 5432 está ocupado por otra base — por ejemplo la embebida —',
      'hay que detenerla primero: sólo una puede escuchar en ese puerto.',
    ].join('\n'),
  );
  process.exit(arranque.status ?? 1);
}

console.log('');
console.log('Base lista en 127.0.0.1:5432');
console.log('Siguiente paso: npm run db:migrate');
