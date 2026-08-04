/**
 * El armazón de la plataforma.
 *
 * "La navegación debe ser extremadamente simple. Inicio. Buscar. Actividad.
 *  Espacios. Administración. Nada más. Los dominios aparecen únicamente cuando
 *  son necesarios."
 *
 * Cinco entradas, deliberadamente. No hay un menú de Ventas ni uno de Compras:
 * a un producto o a un cliente se llega buscándolo, no navegando hasta él.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { CommandPalette } from '@/components/command-palette';
import { SessionBar } from '@/components/session-bar';
import { getScope } from '@/lib/session';

import './globals.css';

export const metadata: Metadata = {
  title: 'NewConcret Intelligence',
  description: 'Toda la inteligencia de NewConcret, en un solo lugar.',
};

const NAVIGATION = [
  { href: '/', label: 'Inicio' },
  { href: '/buscar', label: 'Buscar' },
  { href: '/actividad', label: 'Actividad' },
  { href: '/espacios', label: 'Espacios' },
  { href: '/administracion', label: 'Administración' },
] as const;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const scope = await getScope();

  return (
    <html lang="es-AR">
      <body>
        <div className="shell">
          <nav className="shell__nav" aria-label="Navegación principal">
            <Link className="brand" href="/">
              <span className="brand__name">
                NewConcret <span className="brand__accent">Intelligence</span>
              </span>
              <span className="brand__tagline">Toda la inteligencia, en un solo lugar</span>
            </Link>

            {scope && (
              <ul className="nav">
                {NAVIGATION.map((item) => (
                  <li key={item.href}>
                    <Link className="nav__link" href={item.href}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {scope && (
              <p className="nav__hint">
                <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar o ejecutar cualquier acción.
              </p>
            )}

            {scope && <SessionBar actor={scope.actor} />}
          </nav>

          <main className="shell__main">{children}</main>
        </div>

        {scope && <CommandPalette />}
      </body>
    </html>
  );
}
