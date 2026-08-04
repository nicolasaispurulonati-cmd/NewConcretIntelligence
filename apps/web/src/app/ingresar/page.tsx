/**
 * Ingreso.
 *
 * Ante credenciales incorrectas se responde siempre lo mismo, sin distinguir si
 * el correo existe: la diferencia sería información útil para quien ataca.
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { isNciError, signIn } from '@nci/core';
import { getDatabase } from '@nci/db';

import { Notice } from '@/components/notice';
import { SESSION_COOKIE } from '@/lib/session';

async function signInAction(formData: FormData): Promise<void> {
  'use server';

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    const session = await signIn(getDatabase(), { email, password });
    (await cookies()).set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });
  } catch (error) {
    if (isNciError(error)) redirect('/ingresar?error=credenciales');
    throw error;
  }

  redirect('/');
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}): Promise<React.ReactElement> {
  const { error } = await searchParams;

  return (
    <>
      <h1 className="page__greeting">Ingresar</h1>
      <p className="page__lede">Toda la inteligencia de NewConcret, en un solo lugar.</p>

      {error === 'credenciales' && (
        <div style={{ marginBottom: 'var(--nci-space-5)' }}>
          <Notice
            title="No fue posible ingresar"
            reason="La combinación de correo y contraseña no coincide con ninguna cuenta activa."
            actions={[{ label: 'Escribir de nuevo' }]}
          />
        </div>
      )}

      <form
        action={signInAction}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nci-space-4)',
          maxWidth: '24rem',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nci-space-2)' }}>
          <span style={{ fontSize: 'var(--nci-text-sm)', color: 'var(--nci-text-muted)' }}>
            Correo
          </span>
          <input
            className="palette__input"
            style={{
              border: '1px solid var(--nci-border-strong)',
              borderRadius: 'var(--nci-radius-sm)',
              fontSize: 'var(--nci-text-base)',
              padding: 'var(--nci-space-3)',
            }}
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nci-space-2)' }}>
          <span style={{ fontSize: 'var(--nci-text-sm)', color: 'var(--nci-text-muted)' }}>
            Contraseña
          </span>
          <input
            className="palette__input"
            style={{
              border: '1px solid var(--nci-border-strong)',
              borderRadius: 'var(--nci-radius-sm)',
              fontSize: 'var(--nci-text-base)',
              padding: 'var(--nci-space-3)',
            }}
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </label>

        <button className="button button--primary" type="submit" style={{ alignSelf: 'flex-start' }}>
          Ingresar
        </button>
      </form>
    </>
  );
}
