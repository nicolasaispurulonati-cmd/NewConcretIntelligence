'use client';

/**
 * La navegación lateral.
 *
 * "La navegación debe ser extremadamente simple. Inicio. Buscar. Actividad.
 *  Espacios. Administración. Nada más."
 *
 * Es cliente por una sola razón: marcar dónde está parada la persona. Antes
 * la entrada activa era siempre la primera, así que el menú afirmaba "estás
 * en Inicio" desde cualquier pantalla — justo lo contrario del Principio 11.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icono, type IconoId } from '@/components/icono';

export interface EntradaDeNavegacion {
  readonly href: string;
  readonly label: string;
  readonly icono: IconoId;
}

export function Navegacion({
  entradas,
  administracion,
}: {
  entradas: readonly EntradaDeNavegacion[];
  /** Sólo llega si la persona puede administrar la plataforma. */
  administracion?: EntradaDeNavegacion | undefined;
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="nav" aria-label="Secciones de la plataforma">
      {entradas.map((entrada) => (
        <Entrada key={entrada.href} entrada={entrada} pathname={pathname} />
      ))}

      {administracion && (
        <div className="nav__group">
          <Entrada entrada={administracion} pathname={pathname} />
        </div>
      )}
    </nav>
  );
}

function Entrada({
  entrada,
  pathname,
}: {
  entrada: EntradaDeNavegacion;
  pathname: string;
}): React.ReactElement {
  return (
    <Link
      className="nav__item"
      href={entrada.href}
      aria-current={esActiva(pathname, entrada.href) ? 'page' : undefined}
    >
      <Icono id={entrada.icono} />
      <span>{entrada.label}</span>
    </Link>
  );
}

/**
 * Inicio sólo está activo en la raíz; el resto también sobre sus subpáginas.
 *
 * Sin la primera condición, "/" sería prefijo de todo y la plataforma diría
 * siempre que estás en el escritorio.
 */
function esActiva(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
