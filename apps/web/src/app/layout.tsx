/**
 * El armazón de la plataforma.
 *
 * "La navegación debe ser extremadamente simple. Inicio. Buscar. Actividad.
 *  Espacios. Administración. Nada más. Los dominios aparecen únicamente cuando
 *  son necesarios."
 *
 * Todo lo que se muestra acá sale de la sesión. La versión anterior dibujaba
 * un operador llamado INTEL_OPERATOR_01 con "Level 4 Access" y un indicador
 * de salud del sistema fijo en tres cuartos: cuatro afirmaciones sobre el
 * estado de la plataforma que nadie había medido. El Principio 20 dice que la
 * plataforma no supone y no inventa, y eso incluye lo que dice de sí misma.
 */

import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { AbrirPaleta } from '@/components/abrir-paleta';
import { CommandPalette } from '@/components/command-palette';
import { Navegacion, type EntradaDeNavegacion } from '@/components/navegacion';
import { SessionBar } from '@/components/session-bar';
import { getScope } from '@/lib/session';

import './globals.css';

export const metadata: Metadata = {
  title: 'NewConcret Intelligence',
  description: 'Toda la inteligencia de NewConcret, en un solo lugar.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const NAVIGATION: readonly EntradaDeNavegacion[] = [
  { href: '/', label: 'Inicio', icono: 'inicio' },
  { href: '/buscar', label: 'Buscar', icono: 'buscar' },
  { href: '/actividad', label: 'Actividad', icono: 'actividad' },
  { href: '/espacios', label: 'Espacios', icono: 'espacios' },
];

const ADMIN_NAV: EntradaDeNavegacion = {
  href: '/administracion',
  label: 'Administración',
  icono: 'administracion',
};

/**
 * Las fuentes.
 *
 * Se declaran una vez y se usan en los dos armazones. Si alguna no llega
 * —una planta sin salida a internet, por ejemplo— cada familia cae en la del
 * sistema, que es lo que declaran los tokens: la plataforma se ve más sobria
 * y se sigue leyendo igual.
 */
const FUENTES = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link
      href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@500&display=swap"
      rel="stylesheet"
    />
  </>
);

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const scope = await getScope();

  /**
   * Administración aparece si la persona puede administrar usuarios.
   *
   * Principio 6: la complejidad se descubre gradualmente. Una entrada que
   * lleva siempre a un aviso de permisos no enseña nada — enseña que el menú
   * miente.
   */
  const puedeAdministrar = scope?.actor.can('identity.user.admin') ?? false;

  /**
   * Sin sesión no hay armazón.
   *
   * La barra lateral y la cabecera existen para orientar a alguien dentro de
   * su trabajo, y todavía no se sabe de quién es el trabajo. Dibujarlas
   * vacías —un menú sin entradas al lado de un formulario de ingreso— es
   * mostrar los bordes del sistema en lugar de la puerta.
   */
  if (!scope) {
    return (
      <html lang="es">
        <head>{FUENTES}</head>
        {/* Sin `main` acá: cada pantalla previa a la sesión trae el suyo, y
            el ingreso lo necesita para ocupar sólo la mitad derecha. */}
        <body>
          <div className="afuera">{children}</div>
        </body>
      </html>
    );
  }

  return (
    <html lang="es">
      <head>{FUENTES}</head>
      <body>
        <a className="shell__skip" href="#contenido">
          Ir al contenido
        </a>

        <div className="shell">
          <aside className="shell__aside">
            {/* El logo es la marca; "Intelligence" es el producto, y por eso
                va escrito debajo y no dibujado dentro del logo. */}
            <Link className="brand" href="/" aria-label="NewConcret Intelligence, ir al inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand__logo" src="/newconcret.webp" alt="NewConcret" />
              <span className="brand__product">Intelligence</span>
            </Link>

            <Navegacion
              entradas={NAVIGATION}
              administracion={puedeAdministrar ? ADMIN_NAV : undefined}
            />
          </aside>

          <div className="shell__main">
            <header className="topbar">
              <AbrirPaleta />
              <SessionBar actor={scope.actor} />
            </header>

            <main className="shell__content" id="contenido">
              {children}
            </main>
          </div>
        </div>

        <CommandPalette />
      </body>
    </html>
  );
}
