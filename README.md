# NewConcret Intelligence

> Toda la inteligencia de NewConcret, en un solo lugar.

La plataforma central de operación e inteligencia de NewConcret. No es un CRM, no es un ERP y no es un chatbot: es un grafo de conocimiento empresarial donde el centro son las entidades y no las pantallas. Un producto, un cliente o un procedimiento son nodos con la misma forma, conectados por relaciones explícitas, de modo que abrir cualquiera de ellos muestra todo su universo sin importar desde qué área se entró. Sobre esa base, los permisos se asignan por capacidad y no por pantalla, y la inteligencia artificial asiste dentro de cada dominio sin poder ver jamás lo que la persona no podría ver por sí misma.

## Requisitos previos

| | |
|---|---|
| **Node.js 22 o superior** | El proyecto usa `process.loadEnvFile`, disponible desde la 20.12. Se verifica con `node -v`. |
| **npm 10 o superior** | Viene con Node. El monorepo usa workspaces de npm; no hace falta pnpm ni yarn. |
| **Docker Desktop** | Corre la base de datos de desarrollo. `winget install Docker.DockerDesktop`, reiniciar, y abrirlo una vez para que arranque el motor. Hay una alternativa sin instalar nada, más limitada: ver el paso 3. |

## Puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Variables de entorno

Copiá `.env.example` a `.env`, en la raíz del proyecto y no dentro de cada paquete. Cada variable está documentada ahí con su propósito y si es obligatoria.

Para empezar alcanza con una sola línea:

```
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
```

Ese valor sirve tal cual para las dos bases de desarrollo. Las credenciales coinciden a propósito: cambiar de una a otra no obliga a editar nada.

### 3. La base de datos

```bash
npm run db:local
```

Levanta PostgreSQL 17 con pgvector en Docker y espera a que acepte conexiones antes de devolver el control, así que el comando siguiente nunca llega temprano. Los datos viven en un volumen que sobrevive a `db:down`.

| Comando | Qué hace |
|---|---|
| `npm run db:local` | Levantar y esperar |
| `npm run db:down` | Detener, conservando los datos |
| `npm run db:reset` | Detener y borrar los datos |
| `npm run db:logs` | Ver la salida del servidor |

Hubo una alternativa embebida en WebAssembly que no requería Docker. Se retiró: corría PostgreSQL 18 mientras producción usa la 17, y devolvía resultados incorrectos bajo carga. El motivo completo está en [D-010](docs/10-decisiones.md).

#### Producción

Cualquier PostgreSQL gestionado que ofrezca `vector`. Sólo cambia `DATABASE_URL`. El despliegue está armado sobre Neon: ver [Despliegue](#despliegue).

### 4. Verificar la conexión

Antes de migrar conviene comprobar que se llega a la base y que están las extensiones. Si falta algo, el diagnóstico dice qué y cómo resolverlo.

```bash
npm run db:check
```

### 5. Crear el esquema

```bash
npm run db:migrate
```

### 6. Sembrar roles y crear el primer usuario

Carga los nueve roles del sistema con sus capacidades y crea un administrador. Queda **invitado**, sin contraseña: la siembra nunca crea una por defecto.

```bash
NCI_ADMIN_EMAIL=tu@correo.com NCI_ADMIN_NAME="Tu Nombre" npm run db:seed
```

### 7. Definir la contraseña

Sin este paso no se puede ingresar. La pide por consola sin mostrarla mientras se escribe.

```bash
npm run user:password -- tu@correo.com
```

### 8. Levantar la aplicación

```bash
npm run dev
```

Queda en `http://localhost:3000`.

> El rol Administrador del sistema no accede a los datos del negocio por defecto: administra usuarios, permisos e integraciones. Es deliberado. Para recorrer la plataforma con datos, `npm run demo:comercial` crea un usuario con rol Comercial, tres clientes y presupuestos en distintos estados.

## Pruebas

Los principios de producto están escritos como pruebas. Si un cambio viola uno, el build falla, y eso es correcto: se arregla el cambio, no la prueba.

Son dos baterías con propósitos distintos.

```bash
npm test
```

Las unitarias. No necesitan base de datos, corren en paralelo y tardan segundos. Es lo que se corre mientras se trabaja.

```bash
npm run test:integracion
```

Las que tocan la base, contra PostgreSQL real. Antes de correr una sola prueba verifica cuatro cosas, y si alguna no coincide **falla diciendo qué esperaba, qué encontró y cómo levantar el entorno correcto**:

| Verifica | Por qué |
|---|---|
| Versión mayor de PostgreSQL | Una prueba contra otra versión valida otro sistema. Un PostgreSQL instalado en la máquina hace años puede tomar el puerto antes que el contenedor |
| pgvector, presencia y versión | El esquema declara una columna `vector(1024)` y un índice HNSW |
| Que no haya migraciones pendientes | Contra un esquema viejo, las pruebas fallan por columnas que no existen y esconden el defecto real |
| Que la base esté declarada como de pruebas | Las pruebas crean y borran datos. Contra una base con información real eso es destructivo y no se deshace |

Lo último es un parámetro del servidor, `nci.entorno = pruebas`, que pone [`docker-compose.yml`](docker-compose.yml). Es configuración y no un dato: sobrevive a `db:reset`, la aplicación no puede escribirlo, y un PostgreSQL gestionado no lo trae. Ponerlo en producción exige un acto deliberado, que es exactamente la diferencia que se busca contra el accidente.

Nada de esto se degrada a una alternativa. La degradación silenciosa es lo que hizo que este proyecto validara durante semanas contra un motor que no era el suyo.

```bash
npm run typecheck
```

Dos cosas que conviene saber sobre el tablero:

- **`npm test` falla si hay pruebas salteadas.** Una prueba que no corre no dice nada, y un tablero que la cuenta como verde miente. El guardián está en [`scripts/pruebas.mjs`](scripts/pruebas.mjs) y también verifica que la aritmética del resumen cierre.
- **`npm run typecheck` va antes que `npm test` en un clon limpio.** Compila los paquetes en el orden que impone el grafo de dependencias, y las pruebas de cada paquete importan a los demás por su `dist`.

## Despliegue

La plataforma corre en **Vercel**, con la base en **Neon**. Dos decisiones sostienen todo lo demás:

- El despliegue automático de Vercel sobre `main` está **apagado** ([`apps/web/vercel.json`](apps/web/vercel.json)). La única puerta a producción es la verificación de GitHub Actions.
- Lo que se despliega es exactamente lo que se verificó. El flujo construye con `vercel build` y sube con `vercel deploy --prebuilt`: Vercel no vuelve a compilar por su cuenta.

### 1. La base en Neon

Crear un proyecto con PostgreSQL 17 en la región más cercana. Para Argentina, `sa-east-1` (São Paulo). Neon ofrece `vector`, `pg_trgm` y `unaccent`; la migración las instala sola.

Del panel del proyecto salen **dos cadenas de conexión, y no son intercambiables**:

| Cadena | Host | Para qué |
|---|---|---|
| **Pooled** | contiene `-pooler` | La aplicación. Reparte muchas conexiones efímeras sobre pocas reales, que es lo que necesita el serverless. |
| **Direct** | sin `-pooler` | Las migraciones. Un pooler en modo transacción puede repartir cada sentencia en una sesión distinta, y una migración necesita que el lock que toma al empezar siga vivo cuando termina. |

Si la cadena copiada trae `channel_binding`, se puede dejar tal cual: el cliente lo quita antes de conectar. Sin eso, el servidor rechazaría la conexión entera con un error que señala al servidor y no a la cadena.

### 2. Crear el esquema por primera vez

Antes de que exista el proyecto en Vercel, desde cualquier máquina:

```bash
DATABASE_URL="LA_CADENA_DIRECTA" npm run db:check
```

```bash
DATABASE_URL="LA_CADENA_DIRECTA" npm run db:migrate
```

```bash
DATABASE_URL="LA_CADENA_DIRECTA" NCI_ADMIN_EMAIL="tu@correo.com" npm run db:seed
```

```bash
DATABASE_URL="LA_CADENA_DIRECTA" npm run user:password -- tu@correo.com
```

De acá en adelante las migraciones las aplica el flujo de despliegue.

### 3. El proyecto en Vercel

Importar el repositorio y cambiar **una sola cosa**:

> **Root Directory: `apps/web`**

Con eso Vercel detecta Next.js, instala desde la raíz del monorepo — donde están los workspaces — y compila con el `build` de `apps/web`, que construye los paquetes antes que la aplicación. Build Command y Output Directory se dejan como vienen.

Después, cargar las variables de entorno de la tabla de más abajo.

### 4. Conectar el despliegue a la verificación

En el repositorio de GitHub, en Settings → Secrets and variables → Actions:

| Secret | De dónde sale |
|---|---|
| `DATABASE_URL` | La cadena pooled de Neon |
| `DATABASE_URL_DIRECTA` | La cadena directa de Neon |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json`, tras correr `vercel link` |
| `VERCEL_PROJECT_ID` | El mismo archivo |

Y una variable, en la pestaña **Variables**:

| Variable | Valor |
|---|---|
| `DESPLIEGUE_AUTOMATICO` | `true` |

Hasta que esa variable exista, la verificación corre pero el despliegue no. Es deliberado: un repositorio todavía sin vincular no debería fallar en rojo en cada push. Mientras tanto se despliega a mano con `vercel --prod`.

### Variables de entorno en producción

Todo lo que no está acá tiene un valor por defecto correcto. [`.env.example`](.env.example) documenta cada una en detalle.

| Variable | Dónde va | Obligatoria | Qué es |
|---|---|---|---|
| `DATABASE_URL` | Vercel y GitHub | Sí | La cadena **pooled** de Neon |
| `DATABASE_URL_DIRECTA` | GitHub | Sí | La cadena **directa**. La aplicación no la lee nunca: sólo las migraciones |
| `ANTHROPIC_API_KEY` | Vercel | No | Sin ella la plataforma funciona completa salvo el asistente |
| `NCI_AI_MODEL` | Vercel | No | Por defecto `claude-opus-5` |
| `NCI_DB_POOL_MAX` | Vercel | No | Vacía. En Vercel el perfil serverless ya usa 1 conexión por instancia |
| `NCI_DB_IDLE_TIMEOUT` | Vercel | No | Vacía. En Vercel ya cierra a los 20 segundos |
| `NCI_DB_CONNECT_TIMEOUT` | Vercel | No | Vacía. Por defecto 10 segundos |
| `NCI_BRIDGE_SHARED_SECRET` | — | No | Reservada para el puente hacia Tango. Hoy ningún código la lee |

`NODE_ENV` no se define a mano: la fija Vercel.

### Cómo llega un cambio a producción

```
push a main
   ↓
typecheck · migraciones y siembra sobre un PostgreSQL efímero · pruebas · build
   ↓  (si algo falla, termina acá)
migrar la base de producción por la conexión directa
   ↓
vercel build  →  vercel deploy --prebuilt
```

El flujo está en [`.github/workflows/verificacion.yml`](.github/workflows/verificacion.yml). Las pruebas de integración corren contra un PostgreSQL con pgvector levantado como servicio del job: sin él se saltarían solas y el verde no significaría nada.

### Migraciones

Las aplica el despliegue, antes de subir el código nuevo. Eso deja unos segundos en los que el esquema nuevo atiende al código anterior, y de ahí sale la única regla:

> Una migración automática tiene que ser compatible con la versión de código que ya está corriendo.

Agregar una tabla, agregar una columna que admite nulos, agregar un índice: todo eso admite el solapamiento. Renombrar, borrar, cambiar un tipo o volver obligatoria una columna, no.

Para esas está [`.github/workflows/migracion.yml`](.github/workflows/migracion.yml), que se dispara a mano desde la pestaña Actions y pide escribir una confirmación. El orden es siempre el mismo: primero se despliega el código que ya no usa lo que se va a borrar, después se comprueba que nada lo usa, y recién entonces se corre la migración.

### Estado de la plataforma

```
GET /api/salud
```

Responde sin sesión, porque la consulta un monitoreo externo. Devuelve `200` con `estado: "operativa"`, o `503` con `estado: "degradada"` cuando la aplicación responde pero no llega a la base.

No dice nada más. Ni el host, ni la versión del servidor, ni el texto del error: un fallo de conexión mal contado es un mapa de la infraestructura publicado en internet. La causa queda en el log de la función, que es donde puede leerla quien corresponde.

## Estructura

| Paquete | Qué contiene |
|---|---|
| [`packages/domain`](packages/domain) | El lenguaje oficial del negocio: dominios, entidades, relaciones, capacidades y roles. Sin dependencias de infraestructura. |
| [`packages/db`](packages/db) | El esquema del grafo sobre PostgreSQL, las migraciones y la base local embebida. |
| [`packages/core`](packages/core) | El motor: autorización por capacidades, grafo de entidades, actividad, auditoría, búsqueda universal y sesiones. |
| [`packages/design`](packages/design) | El Product Design Language en código: tokens visuales y reglas de comportamiento verificables. |
| [`packages/ai`](packages/ai) | El AI Engine. Sólo accede a datos a través de `@nci/core` con un `Scope`, nunca a la base directamente. |
| [`packages/sales`](packages/sales) | El dominio comercial: el presupuesto como entidad, con estados, versiones y aritmética de dinero en centavos. |
| [`apps/web`](apps/web) | La aplicación: Workspace por rol, búsqueda universal, Command Palette y vista de entidad. |

## Arquitectura

[`docs/08-technical-architecture.md`](docs/08-technical-architecture.md) explica cómo cada decisión técnica responde a un principio de producto. Es el punto de entrada para entender por qué el código está organizado así.

[`docs/09-estado-actual.md`](docs/09-estado-actual.md) es el índice de la documentación y explica qué contiene cada documento. Ninguno describe el estado actual del código: eso lo describe el código, y lo que se documenta son decisiones y hallazgos fechados.

[`docs/10-decisiones.md`](docs/10-decisiones.md) es el registro de decisiones. Ninguna entrada se borra: si una se revierte, otra la supersede.

Los documentos de producto que definen la visión, el modelo de dominio y la arquitectura funcional se mantienen fuera del control de versiones.
