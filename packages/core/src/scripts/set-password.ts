/**
 * Define la contraseña de un usuario y lo activa.
 *
 * El primer administrador nace invitado y sin contraseña — un script de siembra
 * que crea una clave por defecto es una clave publicada. Este comando cierra
 * ese paso.
 *
 *   npm run user:password -- correo@ejemplo.com
 *
 * La contraseña se pide por consola y no se muestra mientras se escribe, para
 * que no quede en el historial del terminal ni a la vista de nadie.
 */

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

import { eq } from 'drizzle-orm';

import { getDatabase, users } from '@nci/db';

import { acceptInvitation, revokeAllSessions } from '../authorization/session.js';

async function promptHidden(question: string): Promise<string> {
  // Con `NCI_PASSWORD` definida el comando corre sin intervención, para
  // automatizaciones. En uso normal se pide por consola.
  const fromEnv = process.env['NCI_PASSWORD'];
  if (fromEnv) return fromEnv;

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });

  return new Promise((resolve) => {
    const muted = { active: false };
    const write = stdout.write.bind(stdout);

    // Se intercepta la escritura en lugar de apagar el eco: funciona igual en
    // la consola de Windows, donde el modo crudo se comporta distinto.
    (stdout as unknown as { write: typeof write }).write = ((chunk: string, ...rest: unknown[]) =>
      muted.active && !String(chunk).includes('\n')
        ? true
        : write(chunk, ...(rest as []))) as typeof write;

    rl.question(question, (answer) => {
      (stdout as unknown as { write: typeof write }).write = write;
      stdout.write('\n');
      rl.close();
      resolve(answer);
    });

    muted.active = true;
  });
}

async function main(): Promise<void> {
  const db = getDatabase();
  try {
    await run(db);
  } finally {
    // Una conexión que no se cierra deja al servidor local esperando a un
    // cliente que ya terminó, y la ejecución siguiente no puede conectarse.
    await db.$client.end();
  }
}

async function run(db: ReturnType<typeof getDatabase>): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Falta el correo del usuario.\n\n  npm run user:password -- correo@ejemplo.com');
    process.exitCode = 1;
    return;
  }

  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    console.error(
      `No existe ningún usuario con el correo ${email}.\n\n` +
        'Los usuarios se crean desde Administración, o con la siembra inicial:\n' +
        '  NCI_ADMIN_EMAIL=... npm run db:seed',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Usuario: ${user.fullName} (${email}) — estado actual: ${user.status}`);

  const password = await promptHidden('Contraseña nueva (mínimo 12 caracteres): ');
  const confirmation = process.env['NCI_PASSWORD']
    ? password
    : await promptHidden('Repetir la contraseña: ');

  if (password !== confirmation) {
    console.error('\nLas contraseñas no coinciden. No se cambió nada.');
    process.exitCode = 1;
    return;
  }

  await acceptInvitation(db, { userId: user.id, password });

  // Cambiar la contraseña tiene que cerrar las sesiones abiertas: si el motivo
  // del cambio es que alguien más la conocía, dejarlas vivas no resuelve nada.
  await revokeAllSessions(db, user.id);

  console.log('\nContraseña actualizada. El usuario quedó activo.');
  console.log('Las sesiones que estuvieran abiertas se cerraron.');
}

await main();
