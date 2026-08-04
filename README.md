# NewConcret Intelligence

> Toda la inteligencia de NewConcret, en un solo lugar.

La plataforma central de operación e inteligencia de NewConcret. No es un CRM, no es un ERP y no es un chatbot: es un grafo de conocimiento empresarial donde el centro son las entidades, no las pantallas.

## Documentación

Los documentos de producto (`0.` a `7.`, en formato Word) definen qué es la plataforma. Su versión en texto plano, para consultar desde el código, está en [`docs/product/`](docs/product/).

La arquitectura técnica que los traduce a código está en [`docs/08-technical-architecture.md`](docs/08-technical-architecture.md) — empezá por ahí.

## Estructura

| Paquete | Qué contiene |
|---|---|
| [`packages/domain`](packages/domain) | El lenguaje oficial: dominios, entidades, relaciones, capacidades, roles. Sin dependencias de infraestructura. |
| [`packages/db`](packages/db) | El esquema del grafo sobre PostgreSQL. |
| [`packages/core`](packages/core) | Autorización, grafo, actividad, auditoría, búsqueda universal, sesiones. |
| [`packages/design`](packages/design) | El Product Design Language en código: tokens y reglas de comportamiento. |
| [`packages/ai`](packages/ai) | El AI Engine. No puede consultar la base sin un `Scope`. |
| [`apps/web`](apps/web) | La aplicación: Workspace, búsqueda universal, Command Palette, vista de entidad. |

## Puesta en marcha

Requiere Node 22+ y PostgreSQL 16+ con las extensiones `vector`, `pg_trgm` y `unaccent`.

```bash
npm install
```

Copiá `.env.example` a `.env` — va en la raíz del proyecto, no dentro de cada paquete. Los valores que trae ya apuntan a la base local; sólo falta generar `NCI_SESSION_SECRET` y, si vas a usar el asistente, cargar `ANTHROPIC_API_KEY`.

### La base de datos

En desarrollo no hace falta instalar nada. `npm run db:local` levanta PostgreSQL 18 con pgvector, `pg_trgm` y `unaccent`, compilado a WebAssembly y corriendo dentro del propio Node. Los datos quedan en `.data/`, que no se versiona.

```bash
npm run db:local
```

Dejá esa terminal abierta mientras trabajes. Se expone por el protocolo de PostgreSQL, así que el resto del sistema no la distingue de un servidor real: mismo driver, mismas migraciones, mismas consultas. Al pasar a producción sólo cambia `DATABASE_URL`.

Tiene dos límites que conviene conocer, ambos propios del servidor embebido y ninguno del código de la plataforma:

- **Atiende un cliente por vez.** Con la aplicación corriendo, los comandos `db:migrate`, `db:seed` y `user:password` no pueden conectarse. Detené la aplicación, corré el comando, y volvé a levantarla.
- **Hay que cerrarla con Ctrl+C.** Si el proceso muere de golpe, el servidor queda con la conexión tomada y rechaza las siguientes: se resuelve reiniciándolo. Si además el directorio de datos quedó a medio escribir, borrá `.data/` y volvé a migrar.

Si esa fricción molesta, `docker-compose.yml` levanta PostgreSQL 17 con pgvector y no tiene ninguno de los dos límites. Requiere instalar Docker Desktop.

```bash
docker compose up -d --wait
```

Para producción sirve cualquier PostgreSQL gestionado que ofrezca `vector`. Reemplazá `DATABASE_URL` por su cadena de conexión y borrá `NCI_DB_POOL_MAX` y `NCI_DB_IDLE_TIMEOUT` del `.env`: existen sólo para acomodar los límites de la base embebida.

Antes de migrar, verificá que se llega a la base y que están las extensiones. Si algo falta, el diagnóstico dice qué y por qué.

```bash
npm run db:check
```

```bash
npm run db:migrate
```

Sembrá los roles del sistema y creá el primer administrador. Queda invitado y define su contraseña al ingresar — el script nunca crea una contraseña por defecto.

```bash
NCI_ADMIN_EMAIL=tu@correo.com NCI_ADMIN_NAME="Tu Nombre" npm run db:seed
```

```bash
npm run dev
```

## Verificación

Los principios de producto están escritos como pruebas: si alguien viola uno, el build falla.

```bash
npm test
```

```bash
npm run typecheck
```
