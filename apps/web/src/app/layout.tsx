/**
 * El armazón de la plataforma.
 *
 * "La navegación debe ser extremadamente simple. Inicio. Buscar. Actividad.
 *  Espacios. Administración. Nada más. Los dominios aparecen únicamente cuando
 *  son necesarios."
 */

import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { CommandPalette } from '@/components/command-palette';
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

const NAVIGATION = [
  { href: '/', label: 'Inicio', icon: 'home', dataPath: 'inicio' },
  { href: '/buscar', label: 'Buscar', icon: 'search', dataPath: 'buscar' },
  { href: '/actividad', label: 'Actividad', icon: 'insights', dataPath: 'actividad' },
  { href: '/espacios', label: 'Espacios', icon: 'hub', dataPath: 'espacios' },
] as const;

const ADMIN_NAV = {
  href: '/administracion',
  label: 'Administración',
  icon: 'settings_input_component',
  dataPath: 'administracion',
} as const;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const scope = await getScope();

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700&family=Inter:wght@400&family=JetBrains+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background font-body-md text-on-background">
        <aside className="fixed left-0 top-0 h-full w-[220px] bg-surface-container-lowest border-r border-surface-container-highest z-50 flex flex-col py-4">
          <div className="px-4 mb-4 flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-container flex items-center justify-center rounded-md flex-shrink-0">
              <span className="material-symbols-outlined text-on-primary-container text-[14px]">
                security
              </span>
            </div>
            <span className="font-headline-md tracking-tight uppercase text-on-surface text-[11px] font-bold">
              NewConcret
            </span>
          </div>

          <nav className="flex-1 px-2 space-y-0.5">
            {NAVIGATION.map((item, index) => {
              const isActive = index === 0;
              return (
                <Link
                  key={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center px-3 py-2 rounded-lg transition-all group text-xs ${
                    isActive
                      ? 'bg-primary-container text-on-primary-container shadow-[0_0_8px_rgba(227,30,36,0.15)]'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                  data-path={item.dataPath}
                  href={item.href}
                >
                  <span className="material-symbols-outlined mr-2 text-[18px]">{item.icon}</span>
                  <span className="font-label-caps tracking-widest">{item.label}</span>
                </Link>
              );
            })}

            <div className="pt-3 mt-3 border-t border-surface-container-highest">
              <Link
                className="flex items-center px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all group text-xs"
                data-path={ADMIN_NAV.dataPath}
                href={ADMIN_NAV.href}
              >
                <span className="material-symbols-outlined mr-2 text-[18px]">{ADMIN_NAV.icon}</span>
                <span className="font-label-caps tracking-widest">{ADMIN_NAV.label}</span>
              </Link>
            </div>
          </nav>

          <div className="px-2 mt-auto">
            <div className="p-2 bg-surface-container rounded-lg border border-surface-container-highest">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse flex-shrink-0"></div>
                <span className="text-[9px] font-label-caps text-on-surface-variant uppercase tracking-wider">
                  System Status: Optimal
                </span>
              </div>
              <div className="h-0.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-primary-container w-3/4"></div>
              </div>
            </div>
          </div>
        </aside>

        <div className="pl-[220px]">
          <header className="fixed top-0 left-[220px] right-0 h-12 bg-surface/80 backdrop-blur-xl border-b border-surface-container-highest z-40 flex items-center justify-between px-5">
            <div className="flex-1 max-w-sm">
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[16px]">
                  search
                </span>
                <input
                  className="w-full bg-surface-container-lowest border border-surface-container-highest rounded-lg py-1.5 pl-9 pr-3 text-[12px] focus:outline-none focus:border-primary-container transition-all placeholder:text-on-tertiary-fixed-variant text-on-surface"
                  placeholder="Command search..."
                  type="text"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                aria-label="Notificaciones"
                className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
              </button>
              <div className="h-6 w-px bg-surface-container-highest"></div>
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className="text-right hidden sm:block">
                  <div className="font-label-caps text-[10px] text-on-surface group-hover:text-primary transition-colors tracking-wider">
                    {scope?.actor?.fullName ? scope.actor.fullName.toUpperCase() : 'INTEL_OPERATOR_01'}
                  </div>
                  <div className="text-[9px] font-data-mono text-on-tertiary-fixed-variant uppercase">
                    Level 4 Access
                  </div>
                </div>
                <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center border border-primary">
                  <span className="material-symbols-outlined text-on-primary-container text-[16px]">
                    person
                  </span>
                </div>
              </div>
            </div>
          </header>

          <main className="relative pt-12 bg-background min-h-screen">{children}</main>
        </div>

        {scope && <CommandPalette />}
      </body>
    </html>
  );
}
