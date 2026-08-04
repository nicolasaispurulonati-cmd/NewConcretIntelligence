/**
 * Sesiones y contraseñas.
 *
 * Principio 12: seguridad desde el diseño. Nada de esto es una funcionalidad
 * adicional — es la puerta por la que entra todo el resto.
 *
 * Sin dependencias externas: `node:crypto` provee scrypt, que es la primitiva
 * correcta para contraseñas (lento y con costo de memoria, por diseño).
 */

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { Database } from '@nci/db';
import { sessions, users } from '@nci/db';

import { NotAuthenticatedError, ValidationError } from '../errors.js';
import { Actor } from './actor.js';
import { resolveActor } from './resolve.js';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 14;

/** `scrypt$<salt hex>$<hash hex>`. El formato lleva su algoritmo para poder migrarlo. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new ValidationError({
      message: 'La contraseña es demasiado corta.',
      reason: 'Necesita al menos 12 caracteres para resistir un ataque por fuerza bruta.',
      field: 'password',
    });
  }

  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);

  // Comparación en tiempo constante: una comparación normal filtra información
  // sobre el hash a través de cuánto tarda en fallar.
  return timingSafeEqual(derived, expected);
}

export interface SessionToken {
  /** Se entrega al navegador. Nunca se guarda: en la base va sólo su hash. */
  readonly token: string;
  readonly expiresAt: Date;
}

function hashToken(token: string): string {
  // El token de sesión ya es aleatorio de 32 bytes, así que no necesita el
  // costo de scrypt: alcanza con que la base no guarde el valor utilizable.
  return createHash('sha256').update(token).digest('hex');
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Verifica credenciales y abre una sesión.
 *
 * Responde igual ante un correo inexistente y una contraseña incorrecta: la
 * diferencia le confirmaría a un atacante qué direcciones existen.
 */
export async function signIn(db: Database, input: SignInInput): Promise<SessionToken> {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase().trim()))
    .limit(1);

  if (!user || !user.passwordHash || user.status !== 'active') {
    // Se calcula igual un hash para que el tiempo de respuesta no revele si el
    // usuario existe.
    await scrypt(input.password, randomBytes(16), KEY_LENGTH);
    throw new NotAuthenticatedError();
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new NotAuthenticatedError();
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    expiresAt,
  });

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

  return { token, expiresAt };
}

/** Resuelve el Actor de una sesión activa. Lanza si venció o se revocó. */
export async function resolveSession(db: Database, token: string): Promise<Actor> {
  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) throw new NotAuthenticatedError();

  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id));

  return resolveActor(db, session.userId);
}

export async function signOut(db: Database, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

/** Cierra todas las sesiones de un usuario. Para suspensiones y cambios de contraseña. */
export async function revokeAllSessions(db: Database, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Define la contraseña de un usuario invitado y lo activa. */
export async function acceptInvitation(
  db: Database,
  params: { userId: string; password: string },
): Promise<void> {
  const passwordHash = await hashPassword(params.password);
  await db
    .update(users)
    .set({ passwordHash, status: 'active', updatedAt: new Date() })
    .where(eq(users.id, params.userId));
}
