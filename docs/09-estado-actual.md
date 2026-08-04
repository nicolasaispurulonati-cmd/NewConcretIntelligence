# 9. Estado actual del sistema

Fecha del relevamiento: 4 de agosto de 2026 · Versión del proyecto: `0.1.0`

Este documento no propone nada. Describe qué está construido, qué está construido a medias y qué decisiones quedan abiertas, para que la conducción técnica pueda dar dirección sobre datos y no sobre impresiones.

---

## Resumen en una página

**Lo que hay:** una fundación técnica completa y coherente con los documentos 1 a 8 — modelo de dominio, grafo sobre PostgreSQL, motor de autorización, auditoría inmutable, búsqueda universal, PDL en código y un AI Engine que estructuralmente no puede saltearse los permisos. Sobre eso, un primer dominio de negocio real (presupuestos) con su ciclo de vida y su aritmética probados.

**Lo que falta:** el sistema todavía no se usa. Es de sólo lectura desde la web, la IA no está enchufada a la aplicación, no hay control de versiones, no hay integración continua y no hay ningún entorno desplegado. Todo corre en una máquina.

**El riesgo más urgente no es técnico de arquitectura: es de custodia.** El proyecto no está bajo Git. Un borrado accidental de la carpeta pierde todo el trabajo.

| Indicador | Estado |
|---|---|
| Tests | 72, todos en verde |
| Typecheck | Limpio en los 7 workspaces |
| Paquetes | 6 + 1 aplicación |
| Migraciones de base | 2 |
| Tablas | 19 |
| Rutas de la aplicación | 5 |
| Control de versiones | **Ninguno** |
| CI / despliegue | **Ninguno** |

---

## Lo que está construido

### La fundación (Fase 1 del documento 8 — completa)

| Paquete | Contenido | Tests |
|---|---|---|
| `@nci/domain` | 12 dominios, 30 tipos de entidad, catálogo de capacidades, tipos de relación y roles. Sin dependencias de infraestructura. | 24 |
| `@nci/db` | Esquema Drizzle sobre PostgreSQL: 19 tablas, 2 migraciones SQL versionadas, funciones de búsqueda, PostgreSQL embebido en WebAssembly para desarrollo. | 0 |
| `@nci/core` | Actor y evaluación de capacidades, resolución de `Scope`, sesiones, auditoría, grafo (entidades, relaciones, universo) y búsqueda universal. | 13 |
| `@nci/design` | El PDL en código: tokens CSS, `Metric` (no compila sin contexto), `describeStatus()`, `checkVoice()`. | 16 |
| `@nci/ai` | Contrato de respuesta como JSON Schema, personalidad, recuperación por `Scope`, cliente de Claude (`claude-opus-5`). | 0 |
| `apps/web` | Next.js 15 App Router: Workspace, ingreso, búsqueda, ficha de entidad, Command Palette. | 0 |

Las restricciones estructurales que promete el documento 8 están efectivamente en el código, no sólo en la prosa:

- **`@nci/ai` no depende de `@nci/db`.** Verificado: el motor de IA sólo importa `@nci/core` y `@nci/domain`. No tiene forma de consultar la base sin un `Scope`.
- **El contrato de la IA se impone por esquema**, no por prompt: `answer`, `explanation`, `justification`, `proposedActions`, `sources`, `confidence`, `missingInformation`.
- **La IA sabe qué no puede ver.** `retrieveContext` devuelve `restrictedCount` y se le informa al modelo el número, nunca el contenido.
- **Los principios de producto son tests.** Roles que no concedan escritura sobre lo que declararon no tocar, acceso financiero limitado a Dirección y Administración, ausencia de emojis y exclamaciones en los textos del sistema: si alguien los viola, el build falla.

### El primer dominio de negocio: presupuestos (`@nci/sales`, 19 tests)

- Aritmética en centavos, con IVA, descuento por renglón y redondeo sin arrastre de error.
- Ciclo de vida completo: `borrador → enviado → aceptado | rechazado | vencido`, con transiciones validadas y estados finales cerrados.
- Versionado: una versión nueva copia los renglones y no toca la anterior.
- Reglas de negocio ya impuestas: no se emite a un cliente sin condición de pago, el rechazo exige un motivo.
- Tablas `customers`, `contacts`, `opportunities`, `quotes`, `quote_items`.

### La aplicación

Cinco rutas: `/` (Workspace), `/ingresar`, `/buscar`, `/api/buscar`, `/e/[type]/[slug]` (ficha de entidad con su universo). El Workspace arma widgets según los roles de la persona y declara explícitamente cuáles esperan un dominio todavía inexistente.

---

## Lo que está construido a medias

Ordenado por lo que más condiciona los próximos pasos.

### 1. La aplicación es de sólo lectura

Las únicas escrituras desde la web son iniciar y cerrar sesión. No hay ningún formulario para crear un cliente, un presupuesto ni ninguna entidad: la lógica de `@nci/sales` sólo se ejercita desde los tests y desde el script `npm run demo:comercial`.

Consecuencia visible: las Quick Actions del Command Palette apuntan a rutas que no existen (`/e/quote/nuevo`, `/e/customer/nuevo`, `/e/purchase_order/nuevo`, `/e/procedure/nuevo`, `/espacios/executive`), igual que el enlace "Ver toda la actividad" del Workspace (`/actividad`). Hoy son enlaces rotos.

### 2. La IA está construida pero desconectada

`@nci/ai` no se importa desde ningún lugar de `apps/web`. No hay endpoint, no hay componente, no hay punto de entrada. El asistente funciona sólo si se lo llama desde código propio. Nadie dentro de la empresa puede usarlo todavía.

### 3. La búsqueda semántica está a medio camino

La columna `embedding vector(1024)` existe, el término semántico participa del ranking y `search()` acepta un `queryEmbedding`. Pero **no hay nada que genere embeddings**: ni indexador, ni proveedor, ni modelo elegido. En la práctica hoy la búsqueda es léxica y difusa. El sistema está escrito para que eso no rompa nada — el término semántico simplemente aporta cero — pero la promesa de "encontrar por significado" todavía no está cumplida.

### 4. El orden de fases se apartó del plan

El documento 8 fija Fase 2 = **Products + Knowledge**, y explica por qué: son los dominios más usados, los que validan el grafo con el caso real y donde la IA aporta valor desde el primer día. Lo que efectivamente se construyó después de la fundación fue **CRM + Sales**, que el plan ubica en Fase 4.

No es necesariamente un error, pero tiene una consecuencia concreta: `sales` declara depender de `products`, y los renglones de presupuesto referencian un `variantId` de un dominio que todavía no existe. Los presupuestos hoy sólo pueden cotizar renglones libres. **Products, Knowledge, Inventory, Procurement, Support, Academy, Marketing y Executive no tienen esquema ni código.**

### 5. Cobertura de tests desigual

`domain`, `design`, `sales` y la parte de autorización de `core` están bien cubiertos, incluyendo un test de integración real contra la base. En cambio `@nci/db`, `@nci/ai` y **toda la aplicación web** tienen cero tests. La regla "los principios son tests" se cumple en el núcleo y no se cumple en los bordes.

---

## Lo que no existe

| Área | Estado |
|---|---|
| **Control de versiones** | El proyecto no es un repositorio Git. No hay historia, no hay ramas, no hay copia remota. |
| **Integración continua** | Ninguna. `npm test` y `npm run typecheck` se corren a mano. |
| **Despliegue** | Ningún entorno. No hay nada en Vercel ni en ningún lado. Todo corre en una máquina. |
| **Proveedor de base productiva** | Sin elegir (el documento 8 deja abierto entre Neon, Supabase o RDS). |
| **Gestión de secretos** | Un archivo `.env` en la raíz. Sin gestor de secretos, sin rotación, sin separación por entorno. |
| **Almacenamiento de archivos** | Sin implementar. Ninguna entidad puede tener documentos, fotos ni videos todavía. |
| **Puente hacia Tango** | Sólo diseñado. Cero líneas de código; existe la variable de entorno y nada más. |
| **Importación de datos actuales** | Sin estrategia definida. La base sólo tiene lo que crea el script de demostración. |

---

## Riesgos técnicos concretos

1. **Pérdida total del trabajo.** Sin Git, sin remoto y sin backup, el proyecto depende de un directorio en un escritorio. Es el único riesgo del que no se puede volver.
2. **Divergencia entre lo documentado y lo construido.** El documento 8 declara la Fase 1 "construida" y fija un orden de fases que ya no se está siguiendo. Si la documentación deja de describir el sistema, pierde el valor que hoy tiene.
3. **Deuda de acoplamiento al SDK de la IA.** `assistant.ts` usa campos beta de la API (`fallbacks`, `output_config`, `betas`) que todavía no están en los tipos publicados, y los pasa con un cast `as never`. El compilador no protege ese punto: una actualización del SDK o un cambio de la API rompen en ejecución, no en el build.
4. **Un dominio que depende de otro inexistente.** Presupuestos referencia variantes de producto que no tienen tabla. Cuanto más crezca `sales` antes de que exista `products`, más caro sale reconciliarlos.
5. **Fricción de la base embebida.** El PostgreSQL en WebAssembly atiende un cliente por vez: con la aplicación levantada no se puede migrar ni sembrar. Es tolerable para una persona y no escala a un equipo. `docker-compose.yml` ya está listo como alternativa.

---

## Preguntas para la conducción técnica

Ordenadas por cuánto condicionan lo que se hace la semana que viene.

1. **¿Ponemos el proyecto bajo Git y con un remoto ahora?** Es media hora de trabajo y elimina el único riesgo irreversible del proyecto. También define quién más puede ver el código y bajo qué política.

2. **¿Qué se construye después: escritura sobre lo que ya existe, o Products + Knowledge?**
   - *Escritura primero* (formularios de cliente y presupuesto, y el asistente enchufado a la aplicación): en pocas semanas hay algo que una persona del equipo comercial puede usar de verdad. Valida el producto contra un usuario real y no contra un test.
   - *Products + Knowledge primero*: respeta el plan del documento 8, resuelve la dependencia colgada de `sales` y le da a la IA el corpus donde realmente aporta valor. Pero posterga varios meses el primer usuario real.

3. **¿Cuándo entra el primer usuario real, y con qué dominio?** De la respuesta se desprende qué infraestructura hace falta y cuándo. Hoy no hay nada desplegado.

4. **¿Qué proveedor de PostgreSQL y qué hosting?** Condiciona la estrategia de backup, la latencia, el costo mensual y cuánto tarda el primer despliegue.

5. **¿Qué modelo de embeddings?** Hasta que se decida, la búsqueda semántica y la recuperación de la IA quedan a media potencia. El esquema ya fija 1024 dimensiones, así que la elección tiene una restricción concreta.

6. **¿Se congela el documento 8 o se actualiza el plan de fases?** Conviene resolverlo antes de construir el próximo dominio, no después.

---

## Cómo verificar este informe

```bash
npm install
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run db:local
```

```bash
npm run demo:comercial
```
