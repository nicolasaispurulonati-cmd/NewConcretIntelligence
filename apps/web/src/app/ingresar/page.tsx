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
    <div className="ingreso__marco">
      {/*
        La mitad de la identidad.
        Es decorativa, y por eso `aria-hidden`: no dice nada que no esté
        también del lado del formulario. Quien navega con lector de pantalla
        llega directo a lo único que hay que hacer acá, que es entrar.
      */}
      <aside className="ingreso__marca" aria-hidden="true">
        <div className="ingreso__marca-contenido">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ingreso__logo-marca" src="/newconcret.webp" alt="" />
          <p className="ingreso__frase">Toda la inteligencia de la empresa, en un solo lugar.</p>
        </div>
      </aside>

      <main className="ingreso__acceso">
        <div className="ingreso__columna">
          {/* El logotipo de este lado sólo aparece cuando el panel de la
              izquierda no entra. Con los dos visibles, la marca se diría dos
              veces en la misma pantalla. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ingreso__logo" src="/newconcret.webp" alt="NewConcret" />

          <header className="page__header">
            <h1 className="page__greeting">Ingresar</h1>
            <p className="page__lede">
              Cada persona ve una plataforma distinta, así que lo primero es saber quién sos.
            </p>
          </header>

          {error === 'credenciales' && (
            <Notice
              title="No fue posible ingresar"
              reason="La combinación de correo y contraseña no coincide con ninguna cuenta activa."
              actions={[{ label: 'Escribir de nuevo' }]}
            />
          )}

          <form className="ingreso" action={signInAction}>
            <label className="field">
              <span className="font-label-caps">Correo</span>
              <input type="email" name="email" required autoComplete="email" autoFocus />
            </label>

            <label className="field">
              <span className="font-label-caps">Contraseña</span>
              <input type="password" name="password" required autoComplete="current-password" />
            </label>

            <button className="button button--primary" type="submit">
              Ingresar
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
