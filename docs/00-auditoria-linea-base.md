# 0. Auditoría de línea base

Fecha: 5 de agosto de 2026 · Alcance: sólo lectura y verificación · Versión del proyecto: `0.1.0`

Este documento no propone nada. Registra qué existe, verificado abriendo archivos. Cada afirmación lleva su cita. Donde no pude confirmar algo, está declarado en la última sección.

Tres marcas, en el sentido estricto: **[CONSTRUIDO]** hay código que corre y está probado · **[DECLARADO]** existe el tipo, el nombre o la tabla, sin implementación detrás · **[AUSENTE]** no existe.

---

## 1. Hallazgos críticos

**1. No hay secretos expuestos.** `git ls-files` devuelve 96 archivos y el único `.env` versionado es `.env.example`; la historia completa (`git log --all --diff-filter=A`) nunca incorporó un `.env`. Lo único parecido a una credencial en el código es la contraseña literal `'comercial-de-prueba'` en `packages/sales/src/scripts/demo.ts:79`, que el script usa para crear un usuario real con rol Comercial. Si ese script se corre contra producción, deja una cuenta con credencial conocida y pública.

**2. El puente hacia Tango no existe como código: existe como prosa y una variable.** La única evidencia en todo el repositorio es `.env.example:129` (`NCI_BRIDGE_SHARED_SECRET`) y la sección `docs/08-technical-architecture.md:175-194`. No hay interfaz, adaptador, tipo ni contrato de dominio. Lo que se rompe: no hay nada que reemplazar si Tango no está on-premise, pero tampoco hay nada que proteja al dominio cuando se escriba — el primer archivo que se cree define la frontera, y hoy no hay ninguna.

**3. El motor de autorización no filtra por dueño, y la interfaz sí — en un solo widget.** La decisión de acceso combina capacidad y clasificación (`packages/core/src/authorization/actor.ts:89-97`); ninguna consulta de lectura del motor usa `owner_id`. El único filtro por dueño de todo el sistema está en `apps/web/src/lib/workspace.ts:55`. Consecuencia verificable: el widget "Mis presupuestos" muestra los propios, pero `search()` (`packages/core/src/search.ts:109-122`) y `getEntityBySlug()` (`packages/core/src/graph/entities.ts:137-149`) devuelven los de cualquiera al mismo usuario.

**4. La búsqueda semántica está cableada de punta a punta salvo la punta que escribe.** El índice HNSW existe (`packages/db/sql/99-search.sql:108-110`), la consulta pondera el término semántico (`packages/core/src/search.ts:70-91`) y un trigger invalida el embedding cuando cambia el texto (`packages/db/sql/99-search.sql:58-64`). No existe una sola línea que escriba en `entities.embedding`: la búsqueda del grep sobre `packages/` y `apps/` no devuelve ningún `insert`/`update` sobre esa columna. La cola de indexación (`99-search.sql:113-115`) se llena y nadie la consume.

**5. El AI Engine está construido y desconectado.** `grep -rn "@nci/ai" apps/web/src` no devuelve ninguna importación. El paquete tiene 26 pruebas y un contrato impuesto por esquema (`packages/ai/src/contract.ts:65-129`), pero ninguna ruta, componente ni acción de la aplicación lo invoca. Nadie dentro de la empresa puede usarlo.

---

## 2. Inventario verificado (Parte A)

### 2.1 Paquetes

| Paquete | Responsabilidad | Estado |
|---|---|---|
| `@nci/domain` | El lenguaje oficial: dominios, tipos de entidad, capacidades, relaciones, roles. Sin infraestructura. | [CONSTRUIDO] |
| `@nci/db` | Esquema Drizzle, migraciones SQL, cliente de conexión, base embebida de desarrollo. | [CONSTRUIDO] |
| `@nci/core` | Autorización, `Scope`, sesiones, grafo, actividad, auditoría, búsqueda universal. | [CONSTRUIDO] |
| `@nci/design` | El PDL en código: `Metric`, `describeStatus()`, `checkVoice()`. | [CONSTRUIDO] |
| `@nci/ai` | Contrato de respuesta, personalidad, recuperación por `Scope`, cliente de Claude. | [CONSTRUIDO], sin consumir |
| `@nci/sales` | El presupuesto: ciclo de vida, versiones, aritmética en centavos. | [CONSTRUIDO] |
| `apps/web` | Next.js 15: Workspace, ingreso, búsqueda, ficha de entidad, Command Palette. | [CONSTRUIDO], sólo lectura |

`packages/ai/package.json:20-24` no declara `@nci/db`, `drizzle-orm` ni `postgres`, y `packages/ai/src/boundaries.test.ts:70-99` rompe el build si alguien los agrega.

### 2.2 Dominios

Los doce están en `packages/domain/src/domains.ts:11-24`.

| Dominio | Tipos | Tablas propias | Código de dominio | Estado |
|---|---|---|---|---|
| identity | 1 | 7 (`identity.ts:23,46,65,77,99,121,149`) | `core/authorization/*` | **[CONSTRUIDO]** |
| crm | 4 | 3 (`crm.ts:38,82,110`) | ninguno | **[DECLARADO]** |
| sales | 2 | 2 (`sales.ts:45,118`) | `packages/sales/src/quotes.ts` | **[CONSTRUIDO]** |
| products | 3 | 0 | ninguno | **[DECLARADO]** |
| knowledge | 5 | 0 | ninguno | **[DECLARADO]** |
| inventory | 3 | 0 | ninguno | **[DECLARADO]** |
| procurement | 3 | 0 | ninguno | **[DECLARADO]** |
| support | 3 | 0 | ninguno | **[DECLARADO]** |
| academy | 2 | 0 | ninguno | **[DECLARADO]** |
| marketing | 2 | 0 | ninguno | **[DECLARADO]** |
| executive | 0 | 0 | ninguno | **[DECLARADO]** (sólo capacidades) |
| ai | 2 | 0 | `packages/ai/src/*` | **[CONSTRUIDO]**, sin consumir |

CRM queda **[DECLARADO]** y no [CONSTRUIDO] con criterio explícito: tiene tablas y tipos, pero no existe paquete `@nci/crm` ni ninguna función que cree, valide o actualice un cliente. La única escritura sobre `customers` en todo el repositorio está en el script de demostración (`packages/sales/src/scripts/demo.ts`).

### 2.3 Tipos de entidad

30 tipos en `packages/domain/src/entity-types.ts:13-54`. Todos pueden existir como fila de `entities` — la tabla es polimórfica. **Cinco** tienen además una tabla de detalle propia:

| Tipo | Tabla de detalle |
|---|---|
| `user` | `users` (`identity.ts:23`) |
| `customer` | `customers` (`crm.ts:38`) |
| `contact` | `contacts` (`crm.ts:82`) |
| `opportunity` | `opportunities` (`crm.ts:110`) |
| `quote` | `quotes` (`sales.ts:45`) |

Los otros 25 — `supplier`, `sale`, `project`, `product`, `category`, `variant`, `warehouse`, `stock`, `movement`, `purchase_order`, `goods_receipt`, `document`, `procedure`, `technical_case`, `video`, `faq`, `ticket`, `diagnosis`, `warranty`, `course`, `certification`, `campaign`, `content_asset`, `conversation`, `recommendation` — existen sólo como definición de tipo. **[DECLARADO]**.

### 2.4 Tablas

19 tablas, todas verificadas contra las migraciones (ver 2.7).

| Tabla | Relaciones principales |
|---|---|
| `entities` | Nodo del grafo. `owner_id`, `created_by`, `updated_by`, `archived_by` → `users` (`graph.ts:78,90,92,98`) |
| `entity_relations` | Aristas. `from_id`, `to_id` → `entities`, únicas por `(type, from, to)` (`graph.ts:131-136,150`) |
| `activity` | `entity_id`, `related_entity_id` → `entities`; `actor_id` → `users` (`graph.ts:169-183`) |
| `users`, `roles`, `role_capabilities`, `user_roles`, `user_capabilities`, `sessions`, `audit_log` | Identidad y permisos (`identity.ts`) |
| `customers`, `contacts`, `opportunities` | `entity_id` es la PK y apunta a `entities` (`crm.ts:39,85,113`) |
| `quotes` | `entity_id` PK → `entities`; `owner_id` → `users` (`sales.ts:48,97`) |
| `quote_items` | `quote_id` → `quotes`; `variant_id` → `entities`, nulo permitido (`sales.ts:122,131`) |
| `workspace_widgets`, `user_trail`, `notifications`, `system_metrics` | Workspace (`workspace.ts:29,58,87,122`) |

Decisión estructural verificada: las relaciones de negocio **no** se duplican como claves foráneas. `crm.ts:8-12` lo declara y `quotes.ts:154` lo cumple — el vínculo presupuesto–cliente se crea con `relate(...'quoted_to')`, no con una columna.

### 2.5 Rutas de la aplicación

| Ruta | Archivo | Lectura | Escritura |
|---|---|---|---|
| `/` | `app/page.tsx` | Sí | No |
| `/ingresar` | `app/ingresar/page.tsx` | Sí | **Sí** — `signInAction`, línea 17 |
| `/buscar` | `app/buscar/page.tsx` | Sí | No |
| `/e/[type]/[slug]` | `app/e/[type]/[slug]/page.tsx` | Sí | No |
| `/api/buscar` | `app/api/buscar/route.ts:15` | Sí (GET) | No |
| `/api/salud` | `app/api/salud/route.ts:70` | Sí (GET) | No |
| (componente global) | `components/session-bar.tsx:21` | — | **Sí** — `signOutAction` |

No hay ningún `POST`, `PUT`, `PATCH` ni `DELETE`: el grep sobre `apps/web/src` devuelve dos `export async function GET` y nada más. Las únicas dos escrituras de toda la aplicación son iniciar y cerrar sesión. **La aplicación es de sólo lectura sobre los datos de negocio.**

### 2.6 Pruebas

110 en total, todas en verde, ninguna salteada.

| Archivo | Pruebas | Naturaleza |
|---|---|---|
| `packages/domain/src/invariants.test.ts` | 24 | Lógica de negocio — invariantes del lenguaje oficial |
| `packages/design/src/pdl.test.ts` | 16 | Lógica de negocio — principios del PDL |
| `packages/sales/src/money.test.ts` | 13 | Lógica de negocio — aritmética de dinero |
| `packages/sales/src/quotes.integration.test.ts` | 6 | Lógica de negocio contra base real |
| `packages/core/src/authorization/authorization.test.ts` | 13 | Lógica de negocio — capacidades y clasificación |
| `packages/core/src/graph/universe.integration.test.ts` | 3 | Lógica de negocio contra base real |
| `packages/ai/src/contract.test.ts` | 15 | Lógica de negocio — contrato de respuesta |
| `packages/ai/src/boundaries.test.ts` | 11 | Infraestructura — límites del paquete |
| `packages/db/src/client.test.ts` | 9 | Infraestructura — cadena de conexión |

Reparto: **90 de lógica de negocio, 20 de infraestructura**. Cobertura por paquete: domain 24, ai 26, sales 19, core 16, design 16, db 9.

**Sin ninguna prueba:** `apps/web` en su totalidad — no tiene script `test` en `apps/web/package.json:5-10`.

### 2.7 Migraciones

Dos: `packages/db/migrations/0000_init.sql` y `0001_comercial.sql`.

Comparé tabla por tabla y columna por columna las 19 tablas del esquema Drizzle contra el DDL de las migraciones. **No hay diferencias.** El esquema en código coincide exactamente con las migraciones. Verificado con extracción y `diff` de ambos conjuntos.

Lo que Drizzle no expresa vive en `packages/db/sql/99-search.sql` y se aplica después (`packages/db/src/migrate.ts:41-53`): función `nci_unaccent`, configuración `nci_es`, trigger de `search_vector`, índice trigram, índice HNSW y trigger de inmutabilidad de `audit_log`.

### 2.8 Cobertura real por dominio

| Dominio | Tipos | Tablas | Endpoints lectura | Endpoints escritura | Pruebas |
|---|---|---|---|---|---|
| identity | 1 | 7 | 1 (`/ingresar`) | 2 (ingresar, salir) | 13 |
| crm | 4 | 3 | vía `/e/[type]/[slug]` y `/buscar` | 0 | 0 |
| sales | 2 | 2 | vía `/e/[type]/[slug]` y `/buscar` | 0 | 19 |
| products | 3 | 0 | 0 | 0 | 0 |
| knowledge | 5 | 0 | 0 | 0 | 0 |
| inventory | 3 | 0 | 0 | 0 | 0 |
| procurement | 3 | 0 | 0 | 0 | 0 |
| support | 3 | 0 | 0 | 0 | 0 |
| academy | 2 | 0 | 0 | 0 | 0 |
| marketing | 2 | 0 | 0 | 0 | 0 |
| executive | 0 | 0 | 0 | 0 | 0 |
| ai | 2 | 0 | 0 | 0 | 26 |

Los endpoints de lectura de CRM y sales son genéricos: la ficha de entidad sirve cualquier tipo sin conocer el dominio. No hay ninguna ruta específica de ningún dominio de negocio.

---

## 3. Las seis preguntas (Parte B)

### B1 · Tango

**Todo lo que existe sobre Tango en el repositorio:**

| Ubicación | Qué es |
|---|---|
| `.env.example:126-129` | Comentario y variable `NCI_BRIDGE_SHARED_SECRET`, vacía |
| `docs/08-technical-architecture.md:175-194` | Diseño del puente, en prosa y un diagrama |
| `packages/db/src/schema/graph.ts:178` | El literal `'integration'` como valor posible de `activity.source` |
| `packages/core/src/audit.ts:70` | El mismo literal en el tipo de `AuditEntry.source` |
| `apps/web/src/app/e/[type]/[slug]/page.tsx:113` | La interfaz distingue visualmente un evento con `source === 'integration'` |

**No hay:** interfaz, adaptador, cliente, tipo de dato de Tango, ni ninguna función. Estado: **[AUSENTE]** como código; **[DECLARADO]** como decisión de arquitectura.

**Si Tango estuviera en la nube de Axoft**, hoy habría que tocar exactamente dos archivos, y ninguno de los dos es código: `.env.example:126-129` y `docs/08-technical-architecture.md:175-194`. **La topología no se filtró al dominio, por la razón trivial de que todavía no entró a ningún lado.** No es una frontera bien diseñada: es una frontera que no existe.

Lo único que ya está comprometido con la idea de integración es el vocabulario: `'integration'` como origen de actividad y auditoría, y su tratamiento en la interfaz. Eso es independiente del transporte y sobrevive a cualquier topología.

**Contrato de dominio del estilo "dame productos / precios / listas / stock / cliente":** **[AUSENTE]**. No existe ninguna interfaz que exprese esas operaciones. El acceso a datos hoy tiene una sola forma — las funciones de `@nci/core` sobre el grafo — y nada dice de dónde vienen los datos ni contempla que puedan venir de otro sistema.

### B2 · El motor de autorización

**El modelo.** Una capacidad es `dominio.recurso.acción` (`packages/domain/src/capabilities.ts:1-29`) con cinco niveles ordenados: `read` 1, `create` 2, `update` 3, `approve` 4, `admin` 5 (`capabilities.ts:18-24`). Hay 36 recursos repartidos en los doce dominios. Los nueve roles (`packages/domain/src/roles.ts:16-26`) son atajos: agrupan capacidades y declaran además qué **no** tocan (`neverModifies`), invariante que se verifica en `packages/domain/src/invariants.test.ts:218`.

La resolución de capacidades aplica tres reglas en orden (`packages/core/src/authorization/actor.ts:151-169`): el nivel concedido arrastra los inferiores, las concesiones individuales suman, las revocaciones restan y ganan siempre. Se calcula al usarlo, nunca se materializa (`packages/core/src/authorization/resolve.ts:18-75`).

**Una decisión de lectura combina dos cosas** (`actor.ts:89-97`): que el actor tenga `recurso.acción`, y que pueda ver la clasificación del dato. La clasificación se traduce a capacidad en `capabilities.ts:383-388`: `financial` exige `executive.financials.read`; `public` e `internal` no exigen nada extra; `restricted` delega en el permiso del recurso.

**`owner_id` existe en dos tablas:** `entities.owner_id` (`graph.ts:78`, con índice en `graph.ts:104`) y `quotes.owner_id` (`sales.ts:97`, índice en `sales.ts:101`). Se completa al crear: `entities.ts:84` y `quotes.ts:148,424`.

**Consultas de lectura que lo usan para filtrar: una sola, y está en la interfaz.** `apps/web/src/lib/workspace.ts:55` — el widget "Mis presupuestos". Ninguna función de `@nci/core` ni de `@nci/sales` filtra por dueño. Los otros tres filtros por usuario que existen en `workspace.ts` (líneas 165, 189, 221) son sobre `activity.actor_id`, `notifications.user_id` y `workspace_widgets.user_id`: son datos que pertenecen a la persona por naturaleza, no filtros de autoridad.

**Para que un usuario viera sólo lo suyo habría que pasar por 21 lugares.** Los conté uno por uno:

*El motor (10 sitios de consulta):* `entities.ts:121` (`getEntity`), `entities.ts:140` (`getEntityBySlug`), `entities.ts:257` (`getEntities`), `relations.ts:148` (`getRelated`), `relations.ts:227` (`loadEndpoint`), `universe.ts:75` (línea de tiempo), `universe.ts:159` y `universe.ts:168` (los dos conteos de `restrictedCount`), `search.ts:94` (búsqueda universal), más el propio `Actor`, que hoy no tiene ningún concepto de alcance por fila (`actor.ts:48-137`).

*Sales (6 sitios):* `quotes.ts:107`, `quotes.ts:171`, `quotes.ts:262`, `quotes.ts:466`, `quotes.ts:475`, `quotes.ts:514`.

*Workspace (4 sitios):* `workspace.ts:43`, `100`, `135`, `183`.

Total: **20 sitios de consulta más el `Actor`**. La recuperación de contexto de la IA no entra en la cuenta, y esa es la parte buena: `packages/ai/src/retrieval.ts:56-124` no consulta la base, sólo llama a `getEntityUniverse` y `search`. Arreglar el motor arregla la IA sin tocar `@nci/ai`.

**¿El motor tiene algún concepto de filtro por fila, aunque esté sin usar?** No. Lo que tiene es filtro por **tipo** (`actor.ts:133-137`, `readableEntityTypes()`) y por **clasificación** (`actor.ts:127-130`, `visibleClassifications()`), y ambos se aplican en SQL. La fila nunca entra en la decisión. **[AUSENTE]**.

**Camino de autorización de la IA:** el mismo que la interfaz, sin excepción. `retrieval.ts:11-16` importa `getEntityUniverse`, `search` y `Scope` de `@nci/core` y nada más. La garantía no es una convención: `packages/ai/src/boundaries.test.ts:143-171` verifica que un actor sin `ai.assistant.read` sea rechazado **antes** de cualquier consulta, usando un doble de base que lanza si alguien la toca.

### B3 · El contrato de respuesta de la IA

**Definido en un solo lugar:** `packages/ai/src/contract.ts:65-129`. El tipo `AiAnswer` (`contract.ts:33-57`) y el esquema JSON son el mismo archivo. La única otra mención del contrato en código es su uso en `assistant.ts:83` y su verificación en `contract.test.ts`. **No está duplicado.**

El esquema cierra las tres puertas que hacen que un output estructurado sirva: `required` con los siete campos (`contract.ts:119-127`), `additionalProperties: false` en la raíz (`contract.ts:128`) y en cada fuente (`contract.ts:109`), y `confidence` como enum cerrado (`contract.ts:112`).

**Componente de interfaz que lo consuma: ninguno.** `grep -rn "@nci/ai" apps/web/src` no devuelve resultados. El asistente está **[CONSTRUIDO] y sin conectar**.

**Distinción entre consulta trivial y consulta que amerita razonamiento: no existe.** El esquema se impone siempre, en la única llamada del paquete (`assistant.ts:76-95`), sin ninguna rama. Una pregunta de una palabra recibe la misma estructura de siete campos que un análisis de rentabilidad. Tampoco hay control de esfuerzo: `AssistantConfig` (`assistant.ts:21-25`) sólo admite `apiKey`, `model` y `maxTokens`.

**Si el modelo no encuentra fuentes:** no falla y no queda vacío. `sources` es un arreglo obligatorio, pero un arreglo vacío satisface el esquema — no hay `minItems` en `contract.ts:97-111`. El sistema empuja al modelo a no inventar por dos vías de prompt: `personality.ts:48-50` ("No inventás", "No respondés 'No encontré nada'") y `retrieval.ts:146-157`, que cuando el contexto viene vacío arma un texto explícito diciendo qué se buscó y qué no se encontró. **Es una barrera de prompt, no de esquema.** El único caso que devuelve una respuesta fabricada por código es el rechazo del clasificador (`assistant.ts:120-136`), donde la respuesta está escrita a mano en el archivo.

Un detalle verificable sobre la lectura: `assistant.ts:146` hace `JSON.parse(text.text) as AiAnswer` sin validar contra `ANSWER_SCHEMA`. La confianza está puesta enteramente en que la API respete el esquema que se le pasó.

### B4 · Distancia hasta crear un cliente y un presupuesto

**Cliente:**

| Tramo | Estado | Evidencia |
|---|---|---|
| Formulario | **[AUSENTE]** | No hay ruta `/e/customer/nuevo`; las rutas existentes son las seis de 2.5 |
| Validación | **[AUSENTE]** | Ninguna función valida un cliente |
| Capa de aplicación | **[AUSENTE]** | No existe paquete `@nci/crm` |
| Persistencia | **[CONSTRUIDO]** | Tabla `customers` (`crm.ts:38-79`) con su check de plazo de pago (`crm.ts:74-77`) |
| Confirmación | **[AUSENTE]** | — |

**Presupuesto:**

| Tramo | Estado | Evidencia |
|---|---|---|
| Formulario | **[AUSENTE]** | `QUICK_ACTIONS` ofrece `/e/quote/nuevo` (`command-palette.tsx:40`) y esa ruta no existe |
| Validación | **[CONSTRUIDO]** | En el servicio, ver reglas abajo |
| Capa de aplicación | **[CONSTRUIDO]** | `packages/sales/src/quotes.ts`, 551 líneas, 6 pruebas de integración |
| Persistencia | **[CONSTRUIDO]** | `quotes` y `quote_items` (`sales.ts:45,118`) |
| Confirmación | **[CONSTRUIDO]** en el dominio, **[AUSENTE]** en la interfaz | `recordActivity` en `quotes.ts:323,344,384,449` |

Lo que falta del presupuesto es exactamente el formulario y la acción que lo llame. Todo lo que va detrás está construido y probado.

**Reglas de negocio ya implementadas que condicionan la creación:**

| Regla | Ubicación |
|---|---|
| Se necesita `sales.quote.create` sobre el tipo, con su clasificación | `quotes.ts:96` |
| El destinatario tiene que ser un cliente | `quotes.ts:99-104` |
| El cliente debe tener condición de pago; si no, el error explica y ofrece la acción | `quotes.ts:112-126` |
| Las cantidades deben ser mayores que cero | `quotes.ts:201-207`, y en la base `sales.ts:154` |
| Un presupuesto que salió de borrador ya no se modifica | `quotes.ts:530-538` |
| Las transiciones de estado están cerradas | `quotes.ts:29-35`, `540-551` |
| No se puede enviar sin renglones | `quotes.ts:308-314` |
| Rechazar exige un motivo de al menos 3 caracteres | `quotes.ts:368-375` |
| Aceptar exige nivel `approve`, no `update` | `quotes.ts:334` |
| Una entidad inmutable no se modifica | `entities.ts:170-175` |
| Descuento entre 0 y 100, precio no negativo, totales no negativos, versión ≥ 1 | `sales.ts:103-107,155-159` |

**Versionado:** **[CONSTRUIDO]**, no sólo el tipo. `createNewVersion` (`quotes.ts:399-457`) crea una entidad nueva, copia los renglones (`quotes.ts:427-442`) y relaciona ambas con `supersedes` (`quotes.ts:444`). El original no se toca. El índice único `(number, version)` (`sales.ts:100`) lo sostiene en la base.

**Importes:** enteros en centavos, sin excepción. `type Cents = number` (`money.ts:14`), columnas `bigint` (`sales.ts:79-82,140,149`). El redondeo es comercial y simétrico para negativos (`money.ts:23-25`), se aplica una vez por concepto y nunca en cascada (`money.ts:54-61`), y el total se suma de los renglones ya redondeados (`money.ts:77-90`). **Hay moneda** como campo: `quotes.currency` con default `'ARS'` (`sales.ts:64`), `customers.currency` (`crm.ts:62`), `opportunities.currency` (`crm.ts:119`). **No hay tipo de cambio:** ninguna tabla, columna ni función lo menciona. Tampoco hay nada que impida sumar dos presupuestos de monedas distintas — `formatMoney` (`money.ts:98-104`) recibe la moneda como parámetro, pero `calculateQuote` (`money.ts:77`) no la conoce.

**Validación:** vive en un solo lugar, el servicio de dominio (`quotes.ts`), y usa `ValidationError` de `@nci/core`. **No está duplicada entre cliente y servidor** — por la razón de que no hay validación de cliente, porque no hay formularios. Cuando aparezcan, hoy no existe ningún esquema compartido que puedan reutilizar: `packages/domain` define tipos, no validadores de entrada.

### B5 · El grafo y la búsqueda

**El grafo es una tabla de relaciones genérica y real.** `entity_relations` (`graph.ts:125-156`) con tipo, origen, destino, metadatos, procedencia (`user` | `system` | `ai`) y confianza. Tiene índices en ambos sentidos (`graph.ts:151-152`), unicidad por terna (`graph.ts:150`) y prohibición de auto-relación (`graph.ts:153`). Los 27 tipos de relación están tipados con sus extremos válidos en `packages/domain/src/relations.ts:105-230`.

**Se puede recorrer hoy, un salto.** `getRelated` (`relations.ts:135-197`) trae los vecinos en ambos sentidos con un `innerJoin` bidireccional y filtra por los tipos que el actor puede leer. `getEntityUniverse` (`universe.ts:64-101`) lo agrupa por dominio. Consultas que lo usan: `universe.ts:87`, `retrieval.ts:68`, `relations.ts:209`, `quotes.ts:514`, y la ficha de entidad de la aplicación.

**No hay recorrido de más de un salto.** El grep de `RECURSIVE` sobre todo `packages/` y `apps/` no devuelve ninguna coincidencia — la única aparición de la palabra es `mkdirSync(dataDir, { recursive: true })` en `local-server.ts:119`. `docs/08-technical-architecture.md:31` menciona "CTEs recursivas" como capacidad de PostgreSQL; no hay ninguna escrita.

**La columna de vectores:** dimensión 1024, fijada en una constante exportada (`graph.ts:39`) y usada en el tipo (`graph.ts:43`). **El índice existe:** HNSW con distancia coseno, parcial sobre los que ya tienen embedding (`99-search.sql:108-110`). Existe además un índice de cola para los pendientes (`99-search.sql:113-115`) y un trigger que anula `embedded_at` cuando cambia el texto (`99-search.sql:58-64`). **Código que escriba un vector: [AUSENTE].** Ninguna referencia a `entities.embedding` fuera de la lectura en `search.ts:72-73,119`.

**La búsqueda es híbrida y usa texto completo de verdad.** `search.ts:80-91` combina cuatro términos con pesos: exacta ×10, léxica ×4, difusa ×2, semántica ×3. La léxica usa `ts_rank` con `websearch_to_tsquery` sobre una configuración propia `nci_es` que copia la española y le agrega `unaccent` (`99-search.sql:27-36`), con `search_vector` mantenido por trigger y pesos A/B/C por campo (`99-search.sql:45-73`). La difusa usa `similarity()` de `pg_trgm` sobre `lower(nci_unaccent(display_name))`, que es exactamente la expresión indexada (`99-search.sql:99-100`) — el comentario de `search.ts:77-79` explica que usar `unaccent` a secas daría el mismo resultado recorriendo la tabla entera. **La semántica aporta cero hoy**, por construcción deliberada: sin `queryEmbedding` el término es la constante `0` (`search.ts:75`).

**Troceado de documentos: [AUSENTE].** No hay tabla de fragmentos, ni función que parta texto, ni columna que lo sugiera. El embedding es uno por entidad: `entities.embedding` es una sola columna en la tabla de nodos (`graph.ts:85`). El texto que alimentaría el embedding es `searchable_text` (`graph.ts:83`), también uno por nodo.

### B6 · Productos y lo que un cliente posee

**El dominio de productos está [DECLARADO].** Tres tipos definidos y ninguna tabla. La distinción entre los dos principales está escrita y es clara: `product` es "el conocimiento completo sobre un producto. No representa un artículo de stock" (`entity-types.ts:219-220`); `variant` es "una presentación concreta de un producto: medida, color, envase" (`entity-types.ts:244`), y es la que lleva `sku` como subtítulo (`entity-types.ts:246`). La relación `variant_of` (`relations.ts:131-133`) las une. **Es la separación correcta, sin nada detrás:** cero tablas, cero código.

Esa ausencia ya tiene una consecuencia colgada: `quote_items.variant_id` referencia `entities` (`sales.ts:131`) y la columna existe, pero no hay ninguna variante que crear. Los presupuestos hoy sólo pueden cotizar renglones libres.

**Representación de una unidad física individual con número de serie en poder de un cliente: [AUSENTE]. Descartado con evidencia.** Revisé los 30 tipos de entidad (`entity-types.ts:13-54`): ninguno la representa. Revisé los 27 tipos de relación (`relations.ts:105-230`): no hay ninguna que vaya de un cliente a una unidad. La más cercana es `covers` (`relations.ts:196`), que va de `warranty` a `product`, `variant` o `sale` — cubre un artículo de catálogo o una operación, nunca una unidad. Tampoco hay ninguna columna `serial`, `serial_number` ni equivalente en las 19 tablas.

**Relación entre un producto y los consumibles que gasta: [AUSENTE].** Ningún tipo de relación la expresa. `belongs_to` es jerarquía de categorías (`relations.ts:123-130`), `variant_of` es presentación, `stocked_as` es inventario. No hay nada que diga "esta máquina consume estos insumos cada tantos metros cuadrados".

**Campos del cliente que probablemente pertenezcan a Tango** (`crm.ts:38-79`):

| Campo | Línea |
|---|---|
| `tax_id` — CUIT o documento | `crm.ts:47` |
| `payment_terms_days` — condición de pago | `crm.ts:57` |
| `price_list` — lista de precios asignada | `crm.ts:59` |
| `credit_limit` — tope de crédito | `crm.ts:61` |
| `currency` | `crm.ts:62` |
| `email`, `phone`, `address`, `city`, `province` | `crm.ts:65-69` |

Diez campos. Al menos los cinco primeros son datos que un sistema contable ya posee. Hoy no hay ninguna marca de procedencia en la tabla: nada distingue un valor que llegó de Tango de uno que cargó una persona. La distinción existe para la **actividad** (`activity.source`, `graph.ts:179`) y para la **auditoría** (`audit.ts:70`), pero no para el dato en sí.

---

## 4. Discrepancias y deuda (Parte C)

### 4.1 Documentación contra código

**`docs/09-estado-actual.md`** — desactualizado en siete afirmaciones verificables:

| Línea | Afirma | Realidad |
|---|---|---|
| 19 | "Tests 72" | 110 |
| 25 | "Control de versiones: **Ninguno**" | Repositorio Git con remoto en GitHub |
| 26 | "CI / despliegue: **Ninguno**" | `.github/workflows/verificacion.yml` y `migracion.yml` |
| 37 | "`@nci/db` … Tests 0" | 9 (`packages/db/src/client.test.ts`) |
| 40 | "`@nci/ai` … Tests 0" | 26 |
| 100 | "Despliegue: ningún entorno" | Vercel y Neon definidos y documentados en el README |
| 113 | "`assistant.ts` usa campos beta … con un cast `as never`" | Ya no: `assistant.ts:76-95` usa sólo API estable, y `boundaries.test.ts:101-116` rompe el build si vuelve |

**`docs/08-technical-architecture.md`** — dos discrepancias:

| Línea | Afirma | Realidad |
|---|---|---|
| 47-58 | El árbol del repositorio lista cinco paquetes: `domain`, `db`, `core`, `design`, `ai` | Hay seis: falta `sales`, que existe desde el commit de fundación |
| 156-162 | "La interfaz hace lo mismo: *Hay 3 elementos relacionados fuera de tu alcance de acceso*" | Esto **sí** está implementado (`apps/web/src/app/e/[type]/[slug]/page.tsx:91-95`). Se registra como coincidencia verificada, no como discrepancia |

`docs/08` línea 200 declara la Fase 1 construida y fija Fase 2 = Products + Knowledge. Lo construido después de la fundación fue CRM + Sales, que el mismo documento ubica en Fase 4 (`docs/08:198-219`). El plan de fases no describe lo que pasó.

### 4.2 Decisiones tomadas sin registro

Constantes y supuestos incrustados en el código que ningún documento registra como decisión:

| Decisión | Dónde | Nota |
|---|---|---|
| 1024 dimensiones de embedding | `graph.ts:39` | La única documentada, y sólo en el comentario del propio archivo. Restringe qué modelos se pueden elegir |
| IVA por defecto 21 | `sales.ts:146`, `quotes.ts:215,227` | Repetido en tres lugares: el default de la columna y dos defaults del servicio |
| Moneda por defecto `'ARS'` | `sales.ts:64`, `crm.ts:62`, `opportunities` `crm.ts:119`, `money.ts:98` | Cuatro lugares |
| Formato de número de presupuesto `P-AAAA-0000` | `quotes.ts:167-178` | El correlativo se calcula por orden alfabético del número; con más de 9999 presupuestos en un año el orden deja de ser el numérico |
| Umbral difuso 0.15 | `search.ts:118` y `search.ts:191` | El mismo número escrito dos veces; si uno cambia, `matchedBy` empieza a mentir |
| Pesos del ranking 10 / 4 / 2 / 3 | `search.ts:86-91` | Ordenan toda la búsqueda del producto. Sin registro en ningún documento |
| Tope de 24 elementos de contexto para la IA | `retrieval.ts:54` | Define cuánto ve el modelo |
| `maxTokens` 16000 | `assistant.ts:51` | — |
| Modelo `claude-opus-5` fijado en constante | `assistant.ts:41` | Con `NCI_AI_MODEL` como escape |
| Límite de 200 vecinos por nodo | `relations.ts:177` | Un nodo muy conectado se trunca en silencio |
| 25 eventos de línea de tiempo | `universe.ts:86` | — |
| Orden de las secciones del universo | `universe.ts:109-122` | Doce dominios ordenados a mano por criterio de uso |
| Plazo de pago admisible: 0 a 365 días | `crm.ts:74-77` | Check en la base |
| Espera máxima del chequeo de salud: 3 segundos | `apps/web/src/app/api/salud/route.ts:30` | — |
| Pool de conexiones 10 / 1 según entorno | `client.ts:51-55` | Documentado en `.env.example` |

### 4.3 Lo que se rompería

| Supuesto que cambia | Código que cae |
|---|---|
| **Tango no está on-premise** | Nada. Dos archivos de documentación y configuración (`.env.example:126-129`, `docs/08:175-194`). No hay código que dependa de la topología |
| **Hay que manejar más de una moneda** | El campo ya existe en tres tablas, pero la aritmética lo ignora: `money.ts:77-90` (`calculateQuote`) suma sin conocer la moneda, y no hay tabla ni columna de tipo de cambio en ninguna de las 19 tablas. Caen: `money.ts` entero, los cuatro defaults `'ARS'`, y los totales guardados en `quotes` (`sales.ts:79-82`) pasan a ser ambiguos. La conversión además necesita fecha, que hoy no se guarda en ningún lado |
| **Un usuario debe ver sólo lo suyo** | 20 sitios de consulta más el `Actor`, enumerados en B2. Toca `@nci/core` (grafo, universo, búsqueda), `@nci/sales` y los widgets del Workspace. No toca `@nci/ai`, que hereda el cambio por construcción |
| **Hay que representar una máquina serializada** | Un tipo de entidad nuevo en `entity-types.ts:13-54`, al menos dos tipos de relación nuevos en `relations.ts` (cliente↔unidad, unidad↔variante), un recurso de capacidades en `capabilities.ts`, una tabla de detalle, y la redefinición de `covers` (`relations.ts:196`), que hoy apunta al catálogo. Es alta del modelo de dominio, no un campo |

### 4.4 Configuración y secretos

**No hay secretos expuestos en el repositorio.** Verificado sobre los 96 archivos versionados y sobre la historia completa.

| Hallazgo | Ubicación | Naturaleza |
|---|---|---|
| `postgresql://postgres:postgres@127.0.0.1:5432/postgres` | `README.md:30` | Credencial de desarrollo local, deliberada y documentada |
| `postgresql://usuario:clave@localhost:5432/nci` | `packages/db/src/env.ts:41` | Valor centinela que el código detecta para dar un error útil |
| `'comercial-de-prueba'` | `packages/sales/src/scripts/demo.ts:79` | **Contraseña literal** que crea un usuario real con rol Comercial |
| `postgresql://usuario:clave@ep-ejemplo-pooler…` | `packages/db/src/client.test.ts:16-17` | Cadenas ficticias de prueba |

`.gitignore:30-32` ignora `.env` y `.env.*` y rescata sólo `.env.example`; `.gitignore:21` ignora `.vercel/`. `.env.example` no tiene ningún valor real: todas las variables están en cadena vacía.

---

## 5. Lo que no pude verificar

| Punto | Motivo |
|---|---|
| **Si el esquema en código coincide con lo aplicado en una base productiva** | Verifiqué código contra migraciones, que coinciden exactamente. No existe ninguna base productiva contra la cual comparar: el despliegue está definido y no ejecutado |
| **Comportamiento real del contrato de la IA contra la API** | Requiere `ANTHROPIC_API_KEY` y una llamada real. Las 26 pruebas de `@nci/ai` verifican el esquema y los límites del paquete, ninguna invoca el modelo. Lo que afirmo sobre `sources` vacío sale de leer el esquema, no de observar una respuesta |
| **Si `entities.embedding` alguna vez se escribió** | Verifiqué que no hay código que lo haga. No inspeccioné el contenido de la base de desarrollo para confirmar que la columna esté vacía en todas las filas |
| **Rendimiento del ranking de búsqueda** | Los pesos 10/4/2/3 (`search.ts:86-91`) no tienen ninguna prueba ni medición asociada. No hay forma de verificar desde el código si ordenan bien |
| **Contenido de los documentos de producto 1 a 7** | Están fuera del control de versiones por decisión registrada en `.gitignore:65-67`. Las citas de `docs/08` y `docs/09` a esos documentos no las pude contrastar contra la fuente |
| **Si los nueve roles corresponden a la realidad organizativa** | Es una pregunta de negocio. El código es consistente consigo mismo: `invariants.test.ts:218` verifica que ningún rol conceda lo que declaró no tocar |
| **Cobertura de línea de las pruebas** | No hay herramienta de cobertura configurada en ningún `package.json`. Conté pruebas y qué archivo ejercitan, no qué porcentaje del código recorren |
| **Comportamiento de `apps/web` bajo prueba** | No tiene script `test` (`apps/web/package.json:5-10`). Las seis rutas no tienen ninguna verificación automática |
