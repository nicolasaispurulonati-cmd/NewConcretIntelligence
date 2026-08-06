# 10. Registro de decisiones

Decisiones de arquitectura y de producto de NewConcret Intelligence, en orden cronológico.

**Ninguna entrada se borra ni se edita para cambiar lo que dice.** Si una decisión se revierte, se agrega una entrada nueva que la supersede y la anterior se marca como tal. El valor del registro está en poder leer por qué se decidió algo cuando ya nadie se acuerda, incluso —sobre todo— cuando la decisión resultó equivocada.

---

## D-001 · Tango es la fuente de verdad de stock, precios y contabilidad

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** Tango es dueño del stock, de los precios y de la contabilidad. NCI nunca escribe en Tango y nunca es dueño de un dato que Tango ya posee: lo lee, lo muestra con su fecha, y lo deja envejecer a la vista. NCI es dueño de la relación comercial —oportunidades, presupuestos, conversaciones, trazabilidad— que Tango no modela.

**Motivo:** integrar antes que reemplazar. La alternativa descartada era que NCI llevara su propio stock y su propia lista de precios y los sincronizara con Tango. Eso produce dos fuentes de verdad y, con el tiempo, dos verdades distintas: el momento en que difieren nadie lo detecta, y la plataforma pasa a ser el sistema en el que no se puede confiar.

**Consecuencias:** habilita que NCI crezca sin pedirle permiso al sistema contable y sin poder romperlo. Cierra la posibilidad de corregir en NCI un dato equivocado de Tango: si el stock físico no coincide, NCI sólo puede mostrarlo con su fecha. Revertirla implica asumir la sincronización bidireccional completa, que es el problema que esta decisión existe para no tener.

**Evidencia:** no hay una sola línea de código de integración; la decisión vive hoy en `docs/08-technical-architecture.md:175-194` y en `.env.example:126-129`. Lo único ya comprometido en el código es el vocabulario: `activity.source` admite `'integration'` (`packages/db/src/schema/graph.ts:179`), igual que la auditoría (`packages/core/src/audit.ts:70`), y la interfaz distingue visualmente un evento que llegó de una integración (`apps/web/src/app/e/[type]/[slug]/page.tsx:113`).

---

## D-002 · El motor de IA no puede alcanzar la base de datos

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** `@nci/ai` accede a datos únicamente a través de `@nci/core`, con un `Scope` que lleva el `Actor` adentro. No declara ni puede declarar la base, el ORM ni el driver. La regla no es una convención de equipo: es una restricción que rompe el build.

**Motivo:** la promesa central del producto es que la IA nunca ve lo que la persona no podría ver. Sostener eso con una instrucción en el prompt o con disciplina del equipo es sostenerlo hasta el primer sprint con fecha encima. La alternativa descartada era filtrar el contexto después de recuperarlo: funciona hasta que alguien agrega una consulta que se olvida del filtro, y ese olvido no se ve en ninguna revisión.

**Consecuencias:** habilita que cualquier cambio en el modelo de permisos lo herede la IA sin configuración aparte. Cuesta que el motor de IA no pueda optimizar sus propias consultas ni acceder a datos agregados que `@nci/core` no exponga. Revertirla es barato en código y caro en garantía: se pierde lo único que hace verificable la promesa.

**Mecanismo de garantía, en tres capas:**

| Capa | Dónde |
|---|---|
| El paquete no declara la base, el ORM ni el driver | `packages/ai/package.json:20-24`, verificado en `packages/ai/src/boundaries.test.ts:70-83` |
| Ningún archivo de producción los importa | `packages/ai/src/boundaries.test.ts:85-99` |
| Sin capacidad, el rechazo ocurre antes de cualquier consulta | `packages/ai/src/boundaries.test.ts:159-171`, con un doble de base que lanza si alguien la toca |

**Evidencia:** `packages/ai/src/retrieval.ts:11-16` importa `getEntityUniverse`, `search` y `Scope` de `@nci/core` y nada más. El `Scope` es el único objeto con el que se opera sobre datos (`packages/core/src/authorization/resolve.ts:85-90`).

---

## D-003 · Un presupuesto tiene una sola moneda

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** la moneda es un atributo del presupuesto, no del renglón. Un presupuesto no puede mezclar monedas. La conversión entre monedas no es responsabilidad de NCI: si hace falta, la resuelve Tango, que es dueño de los precios por D-001. NCI no tiene ni va a tener tabla de tipo de cambio.

**Motivo:** hasta hoy esto era cierto por omisión —`quote_items` no tiene columna `currency` y `LineInput` no tiene el campo—, y lo que es cierto por omisión se pierde el día que alguien agrega la columna creyendo que suma flexibilidad. La alternativa descartada era permitir moneda por renglón y convertir al totalizar: exige un tipo de cambio con su fecha, y un presupuesto es una promesa fechada, no un cálculo que se recalcula. Reimplementar un motor de cambio dentro de NCI contradice D-001.

**Consecuencias:** habilita que cualquier total de un presupuesto sea sumable sin preguntarse nada. Cierra la cotización mixta: un cliente que quiere una máquina en dólares y consumibles en pesos recibe dos presupuestos. Cuesta, si se revierte, agregar tipo de cambio con fecha a cada renglón y rehacer toda la aritmética de `money.ts`.

**Consecuencia inmediata ya aplicada:** ningún indicador suma monedas distintas. `openQuoteTotals` agrupa por moneda y devuelve una fila por cada una (`packages/sales/src/quotes.ts:537-566`); la presentación las muestra por separado cuando hay más de una (`apps/web/src/lib/workspace.ts:250`).

**Evidencia:** `packages/db/src/schema/sales.ts:64` (la moneda vive en `quotes`), `packages/db/src/schema/sales.ts:118-161` (`quote_items` no la tiene), `packages/sales/src/money.ts:27-35` (`LineInput` tampoco).

---

## D-004 · Autorización: capacidad amplia, vista angosta

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** los permisos de lectura son amplios y se otorgan por capacidad. La propiedad de un registro determina con qué se abre una pantalla por defecto, no qué puede leer una persona. Son dos conceptos distintos y no pueden convivir dentro de la misma consulta. La política vigente es transparencia total en lectura: los vendedores se ven entre sí.

**Motivo:** con tres vendedores, el aislamiento genera más fricción que protección y contradice que el conocimiento pertenece a la empresa. Pero un vendedor que abre su escritorio quiere ver su cartera, no las ochocientas de la empresa. La alternativa descartada era resolver las dos cosas con un filtro en la consulta, que es lo que había: parece aislamiento, no lo es —la misma información aparece por búsqueda o por URL— y confunde a quien lee el código sobre cuál es la regla real.

**Consecuencias:** habilita cambiar la política sin tocar consultas, y habilita casos que no tienen nada que ver con vendedores: un cliente que ve su historial, un alumno de Academy que ve sus cursos. Cuesta que el motor tenga que aprender a filtrar por fila aunque hoy la política no lo use. Revertirla hacia aislamiento real es una decisión de política, no de código, si el alcance por fila está construido.

**Condición que la revisaría:** si el esquema de comisiones hace competir a los vendedores de frente. Es una pregunta abierta del relevamiento comercial.

**Evidencia:** la decisión de lectura combina capacidad y clasificación, nunca propiedad (`packages/core/src/authorization/actor.ts:89-97`). El único filtro por dueño del sistema está en `apps/web/src/lib/workspace.ts:67`, y `search()` (`packages/core/src/search.ts:109-122`) y `getEntityBySlug()` (`packages/core/src/graph/entities.ts:137-149`) devuelven los registros de cualquiera al mismo usuario. `openQuoteTotals` toma el dueño como parámetro de vista y no como condición de permiso (`packages/sales/src/quotes.ts:537-540`).

---

## D-005 · La unidad física serializada entra al modelo, y entra antes que Products

**Fecha:** 2026-08-05 · **Estado:** vigente · **No implementada en esta sesión**

**Decisión:** el modelo de dominio incorpora un tipo de entidad para la unidad física individual —la máquina con número de serie que está en poder de un cliente— y lo hace antes de construir el dominio Products.

**Motivo:** la ausencia del tipo ya está produciendo relaciones equivocadas. `covers` va hoy de `warranty` a `product`, `variant` o `sale`: la garantía cubre un artículo de catálogo en lugar del equipo entregado. Eso no es un descuido, es lo único que se podía escribir con los tipos disponibles, y cada dominio nuevo construido sobre este modelo va a generar su propio `covers`. La alternativa descartada era construir Products primero y agregar la unidad después, que implica rehacer Products.

**Consecuencias:** habilita el parque instalado, la reposición proactiva y la garantía real. Cuesta postergar Products. Dos restricciones que el diseño debe respetar:

- **Historia de titularidad, no un `customer_id`.** Si NewConcret revende equipos usados o toma máquinas en parte de pago, aunque sea ocasionalmente, la unidad necesita historia de dueños. Es barato ahora e imposible después.
- **Reconstruible hacia atrás.** Buena parte del parque instalado ya existe, latente, en el historial de ventas de Tango. Si la entidad se diseña asumiendo carga manual de acá en adelante, arranca vacía y la reposición proactiva no sirve hasta dentro de un año. Tiene que admitir unidades inferidas del historial, con su certeza y su origen marcados.

La modelización de ciclos de consumo queda fuera: para eso hace falta el export de ventas de 24 meses. Se define la entidad, su ciclo de vida y sus relaciones; los consumos se agregan cuando lleguen los datos.

**Evidencia:** `packages/domain/src/relations.ts:196` (`covers` apunta al catálogo). Ninguno de los 30 tipos de entidad representa una unidad serializada (`packages/domain/src/entity-types.ts:13-54`), y ninguna de las 19 tablas tiene columna de número de serie.

---

## D-006 · El `Actor` es la única vía de acceso a entidades

**Fecha:** 2026-08-05 · **Estado:** propuesta, pendiente de aprobación

**Decisión propuesta:** que sea imposible de compilar una consulta sobre entidades que se saltee la clasificación del dato o el alcance por fila. Hoy la autorización es opcional en el punto de uso: el `Actor` devuelve listas y cada sitio decide aplicarlas.

**Motivo:** una consulta nueva que omita el filtro compila, corre y devuelve datos financieros a quien no debería verlos. El precedente existe en el repositorio: `@nci/ai` no puede importar la base ni queriendo, y una prueba lo garantiza (D-002). Se busca el mismo nivel de garantía. La alternativa descartada es la revisión de código: funciona hasta que no.

**Consecuencias:** por definir en la propuesta. Se registra ahora para que quede constancia de que el problema está identificado y de que su solución todavía no está aprobada.

**Evidencia:** `packages/core/src/authorization/actor.ts:127-137` devuelve listas; los cuatro sitios que las aplican a mano son `packages/core/src/search.ts:111-112`, `packages/core/src/graph/relations.ts:173`, `packages/core/src/graph/universe.ts:177` y `packages/core/src/graph/entities.ts:259`. Diseño en `docs/11-propuesta-acceso-entidades.md`.

---

## D-007 · Procedencia en los nodos, con el vocabulario de las aristas

**Fecha:** 2026-08-05 · **Estado:** vigente, con dos correcciones · el vocabulario, por [D-009](#d-009--un-solo-vocabulario-de-procedencia-con-integration-adentro) · el motivo de serializar las pruebas, por [D-011](#d-011--las-pruebas-de-integración-se-serializan-porque-comparten-una-base)

**Decisión:** `entities` incorpora `source` y `confidence`, con el mismo vocabulario y la misma semántica que ya tenía `entity_relations`. `confidence` pasa de `text` a `numeric(3,2)` en las dos tablas, con rango validado en la base: nulo, o entre 0 y 1.

**Motivo:** las aristas sabían decir quién las afirmó y con cuánta certeza; los nodos no. Un nodo inferido —una máquina deducida del historial de ventas de Tango, que es lo que exige D-005— sólo podía declararlo enterrándolo en `data`, que es JSONB sin tipar ni validar. La alternativa descartada era exactamente esa: dejarlo en `data` y que cada dominio invente su clave.

Sobre el tipo de `confidence`, se descartaron dos:

| Alternativa | Por qué no |
|---|---|
| Seguir en `text` | Admitía `"alta"`, `"0,8"` o `"-3"` sin quejarse, y ordenar por certeza daba un orden alfabético: `"0.9"` antes que `"0.85"` |
| Entero de 0 a 100 | Exacto y barato, pero cambia el significado de todo valor ya escrito y del comentario que documenta el campo, a cambio de nada |

`numeric(3,2)` mantiene la semántica documentada de 0 a 1, es exacto —sin la deriva del punto flotante, que el proyecto ya rechazó para el dinero— y no cambia el camino de lectura: `getRelated` ya convertía con `Number()`.

**Consecuencias:** habilita cargar parque instalado inferido del historial sin perder de vista que es inferido. Cuesta una migración que cambia el tipo de una columna existente. Revertirla borra `entities.source` por completo: todo nodo inferido vuelve a ser indistinguible de uno afirmado por una persona, y eso no se recupera.

**Decisiones tomadas al implementarlo, que este registro deja asentadas:**

- **Las columnas se conectaron al código, no sólo al esquema.** `CreateEntityInput` acepta `source` y `confidence`, y `EntityNode` los expone. Una columna que ningún código puede escribir es exactamente el campo decorativo que D-003 existe para no tener.
- **La reversión vive en un archivo aparte**, `0002_procedencia.down.sql`, que el migrador no ejecuta —el journal no lo lista— y que se aplica a mano. Drizzle no genera migraciones de bajada y no había convención previa; el archivo documenta también qué no se recupera al revertir.
- **El valor por defecto es `user`.** Lo que existía antes de la migración lo creó una persona.
- **Las pruebas de `@nci/core` corren de a un archivo por vez.** Al agregar un segundo archivo de integración, los dos empezaron a competir por el único cliente que atiende la base embebida de desarrollo, y uno se salteaba sin avisar: `node --test` corre los archivos en paralelo. Con `--test-concurrency=1` el resultado es el mismo en todas las corridas. Contra un PostgreSQL real la concurrencia no molesta, pero una prueba que a veces no corre no es una prueba.

**Tensión conocida, sin resolver:** `activity.source` admite un cuarto valor, `'integration'`, que ni las aristas ni ahora los nodos aceptan. Un nodo inferido por el puente de Tango tendría que declararse como `'system'` o forzar la ampliación del vocabulario en las tres tablas. Se deja anotado porque el diseño de D-005 va a tener que decidirlo.

**Evidencia:** `packages/db/src/schema/graph.ts` (columnas y restricciones), `packages/db/migrations/0002_procedencia.sql`, `packages/core/src/graph/entities.ts`. Pruebas en `packages/core/src/graph/provenance.integration.test.ts`, que escriben SQL directo para verificar que la base rechaza el dato aunque nadie valide antes.

---

## D-008 · Un indicador se calcula en el dominio, nunca en el widget

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** todo agregado que se muestre como indicador se calcula en la base, sobre el conjunto completo, y vive en el paquete de dominio que lo entiende. Un widget puede listar y puede formatear; no puede derivar un número de las filas que muestra. Cuando un agregado incluye dinero, se agrupa por moneda y las monedas nunca se combinan.

**Motivo:** el widget de presupuestos sumaba los importes de las seis filas que alcanzaba a listar y presentaba el resultado como "Comprometido en presupuestos abiertos". El error era silencioso y no dependía de ninguna condición rara: alcanzaba con tener más de seis presupuestos abiertos. La alternativa —subir el límite de la lista— sólo mueve el umbral en el que el número empieza a mentir.

**Consecuencias:** habilita que el mismo agregado lo consuman la interfaz, la IA y un informe sin recalcularlo de tres maneras. Cuesta una consulta más por indicador. Como efecto lateral buscado, el agregado queda donde hay pruebas de integración contra base real, que es donde este tipo de defecto se detecta.

**Decisiones menores tomadas al implementarlo, que este registro deja asentadas:**

- El agregado se ubicó en `@nci/sales` y no en `apps/web`, porque "cuánto tengo comprometido" es una pregunta del dominio comercial y no de la presentación.
- Con más de una moneda, el rótulo pasa a "Comprometido en presupuestos abiertos, por moneda" y los importes se muestran separados por `·`. Se descartó mostrar un único número convertido, que exigiría un tipo de cambio inexistente, y también mostrar sólo la moneda principal, que oculta el resto.
- El límite de filas de los widgets pasó a la constante `LISTA_MAXIMA`, para que se lea como lo que es: un límite de presentación del que ningún cálculo puede depender.

**Evidencia:** `packages/sales/src/quotes.ts:512-566`, `apps/web/src/lib/workspace.ts:50-71` y `apps/web/src/lib/workspace.ts:244-266`. Pruebas en `packages/sales/src/quotes.integration.test.ts`, para conjunto mayor al límite de la lista y para más de una moneda.

---

## D-009 · Un solo vocabulario de procedencia, con `integration` adentro

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** el vocabulario de procedencia pasa a ser `user`, `system`, `ai` e `integration`, definido en un único lugar —`packages/domain/src/provenance.ts`— del que las tres tablas construyen su restricción. Un dato de procedencia externa está obligado a declarar de qué sistema vino y cuándo se leyó, y un dato que no es externo tiene prohibido declararlo.

**Motivo:** resuelve la tensión que [D-007](#d-007--procedencia-en-los-nodos-con-el-vocabulario-de-las-aristas) dejó anotada sin resolver. Ahí se copió el vocabulario de las aristas a los nodos —`user`, `system`, `ai`— porque era lo que existía, y quedó registrado que `activity` admitía además un cuarto valor, `integration`, y que un nodo inferido por el puente de Tango no tendría cómo declararse.

Una máquina deducida del historial de ventas de Tango no la infiere un usuario, ni la lógica interna, ni la IA: la trae un sistema externo. `system` sería inexacto, porque describiría a NCI afirmando algo por su cuenta.

Los dos campos nuevos son lo que hace aplicable D-001 a los datos inferidos. Ese principio dice que NCI muestra el dato de Tango con su fecha y deja visible que envejeció; sin la fecha de lectura, no alcanzaba a nada que la plataforma hubiera deducido.

La alternativa descartada era reutilizar `system` y guardar el origen en el `data` JSONB. Es lo que ya se había descartado en D-007 para la procedencia misma, por el mismo motivo: sin tipar ni validar, cada dominio inventa su clave.

**Consecuencias:** habilita importar parque instalado desde Tango sin perder de vista de dónde salió ni cuándo. Cierra la posibilidad de marcar un dato como externo a medias. Cuesta que revertir sea destructivo: volver a tres valores obliga a reasignar a `system` toda fila `integration`, y con eso se pierde la distinción que la migración existía para crear.

**Lo que había antes, y que esto corrige:** el mismo vocabulario estaba escrito de tres formas distintas. `entities` y `entity_relations` tenían cada una su copia del literal `('user','system','ai')`; `activity` no tenía **ninguna restricción** y admitía cualquier palabra; y los tipos de TypeScript lo repetían dos veces más, con listas que no coincidían entre sí.

**Evidencia:** `packages/domain/src/provenance.ts` es la única fuente; `packages/db/src/schema/graph.ts` genera las seis restricciones desde ahí. Migración en `packages/db/migrations/0003_vocabulario_procedencia.sql`, con su reversión al lado. Pruebas en `packages/core/src/graph/provenance.integration.test.ts`, incluida una que verifica que las tres definiciones de la base sean idénticas entre sí.

---

## D-010 · Se retira la base embebida; la integración corre contra PostgreSQL real

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** el proyecto deja de usar PGlite, la base PostgreSQL compilada a WebAssembly que servía como alternativa sin Docker. Las pruebas se separan en dos baterías: las unitarias no tocan la base y corren en cualquier máquina; las de integración corren contra PostgreSQL 17 con pgvector, la misma versión que producción, y **fallan** si ese motor no está disponible.

**Motivo:** tres cosas, y la tercera es la que decide.

1. **Corría otra versión.** PGlite es PostgreSQL 18.3; producción, CI y Docker usan la 17. Una prueba que corre contra otra versión valida otro sistema.
2. **Devolvía resultados incorrectos bajo carga.** Contra restricciones verificadas a mano en la base, las mismas pruebas dieron 8/1 y 5/4 en corridas consecutivas, y aparecieron errores de protocolo del tipo "bind message supplies 2 parameters, but prepared statement requires 0". Contra PostgreSQL 17, las mismas pruebas dan 9/0 tres veces seguidas.
3. **Era el mecanismo de una degradación silenciosa.** Escuchaba el mismo puerto con las mismas credenciales que la base de Docker — una decisión tomada para que cambiar de una a otra no obligara a editar el `.env`. El resultado fue que el mismo `DATABASE_URL` apuntaba a un motor o a otro según cuál estuviera levantado, sin ninguna señal. Ocurrió de verdad durante esta sesión: el tablero pasó de 125 en verde a 10 en rojo sin que cambiara una línea de código, porque el motor que respondía era otro.

La alternativa descartada era conservarla para las pruebas que manejaba bien. No se sostiene: lo que hacía mal no era una función concreta sino la confiabilidad, y una base que a veces miente no sirve ni siquiera para lo que parece manejar.

**Consecuencias:** habilita que un verde signifique algo, porque siempre se produjo contra el mismo motor que produce el rojo en producción. Cierra la posibilidad de correr integración sin Docker: es deliberado, y la corrida lo dice con un mensaje que explica cómo levantarlo. Cuesta que quien no tenga Docker sólo pueda correr las unitarias — 105 de las 125 — que es exactamente lo que puede validarse sin base.

**Consecuencia medida:** con paralelismo y contra PGlite, la batería llegó a 3 pruebas salteadas y 1 fallo espurio sobre 50. Contra PostgreSQL 17, paralelo y secuencial dan lo mismo en diez corridas: 125 y ninguna salteada. La serialización que se había agregado en `@nci/core` no era el arreglo, era el síntoma.

**Evidencia:** `scripts/integracion.mjs` verifica motor y versión antes de correr nada; `scripts/pruebas.mjs` falla si hay pruebas salteadas; `.github/workflows/verificacion.yml` corre las unitarias sin base y las de integración contra `pgvector/pgvector:pg17`.

---

## D-011 · Las pruebas de integración se serializan porque comparten una base

**Fecha:** 2026-08-06 · **Estado:** vigente · Supersede el motivo de la última decisión menor de [D-007](#d-007--procedencia-en-los-nodos-con-el-vocabulario-de-las-aristas), no la decisión.

**Decisión:** las pruebas de integración siguen corriendo de a un archivo por vez, con `--test-concurrency=1`. Lo que cambia es el fundamento, que estaba mal registrado.

**Motivo:** D-007 lo justificó como respuesta a la base embebida, que atendía un cliente por vez. Medido después contra PostgreSQL 17.10, ese motivo no se sostiene:

| Motor | Paralelo | Secuencial |
|---|---|---|
| PostgreSQL 17.10 | 125 en verde, 0 salteadas — cinco corridas | idéntico, cinco corridas |
| PGlite 18.3 | 46/1/3, 47/0/3, 50/0/0 | 50/0/0 — tres corridas |

Contra el motor real el delta es cero. La inestabilidad era de PGlite, que ya se retiró por [D-010](#d-010--se-retira-la-base-embebida-la-integración-corre-contra-postgresql-real). Serializar por ese motivo sería mantener el remedio de una enfermedad que ya no existe.

El fundamento real es otro y no depende del motor: **las pruebas de integración comparten una sola base**. Crean entidades, las borran al terminar, y varias miden diferencias contra un estado previo — `openQuoteTotals` y el conteo de seguimientos se verifican así porque la base de desarrollo tiene datos de otras corridas. Dos archivos en paralelo sobre la misma base se ven las escrituras entre sí, y una prueba que mide un delta contra un fondo que otro archivo está moviendo mide cualquier cosa.

**Consecuencias:** habilita escribir pruebas de integración que miden diferencias sin tener que aislar cada una. Cuesta tiempo de pared, que hoy es despreciable. Deja de hacer falta el día que cada archivo tenga su propia base — una por trabajador, creada y descartada por corrida—, que es la forma de recuperar el paralelismo sin perder la independencia.

**Por qué esta entrada y no una edición:** el registro dice que una entrada no se toca salvo para marcarla como supersedida. Es la primera vez que se usa el mecanismo. Se marca el alcance exacto: D-007 sigue vigente en lo que decidió —las columnas de procedencia y el tipo de `confidence`—, y lo que se corrige es el motivo de una de sus decisiones menores.

**Evidencia:** las mediciones de arriba; `packages/core/package.json` y `packages/sales/package.json`, que declaran el guion; y `docs/00-auditoria-linea-base.md`, que registró el síntoma original.

---

## D-012 · El catálogo entra por un puerto, y hoy lo cumple una semilla

**Fecha:** 2026-08-06 · **Estado:** vigente

**Decisión:** NCI le pide al catálogo tres cosas —buscar productos, obtener el precio según lista, consultar disponibilidad— a través de un puerto expresado en lenguaje de negocio, sin ninguna referencia a de dónde salen los datos. Hoy lo cumple un adaptador con datos ficticios. Cuando exista el puente con Tango se cambia una función y ninguna capa superior cambia una línea.

**Motivo:** Tango es la fuente de verdad de productos, precios, listas y stock (D-001), pero todavía no se sabe dónde corre ni cómo se integra — la auditoría lo dejó como el hallazgo que puede invalidar un pilar entero. Esperar esa respuesta bloquearía el camino de escritura, que es la brecha entre lo construido y que alguien lo use. La alternativa descartada era cotizar con renglones libres hasta que Tango esté: funciona, pero el día de la integración habría que rehacer el flujo entero en vez de reemplazar un adaptador.

**La regla que hace que esto sirva:** el resto del sistema **no puede distinguir un adaptador del otro**. No hay en el puerto ningún campo de procedencia, ninguna bandera, ningún método que sólo tenga sentido con uno de los dos, y `getCatalog()` no recibe parámetros. Si alguna capa pudiera saber que el catálogo es de semilla, escribiría una rama para ese caso — y esa rama sobreviviría a la integración, silenciosa y equivocada. Hay una prueba que lo verifica.

**Consecuencias:** habilita construir y probar el flujo comercial completo antes de resolver la integración. Cierra la posibilidad de que un dominio consulte el catálogo por su cuenta. Cuesta que la marca de "estos datos son ficticios" no pueda vivir en los datos: vive en el adaptador y en [`docs/12`](12-deuda-conocida.md), que es donde alguien la va a buscar.

**Una consecuencia menor, ya aplicada:** el tipo `Cents` se mudó de `@nci/sales` a `@nci/domain`. El catálogo cotiza y no puede depender de ventas — el modelo declara que ventas depende de productos, no al revés. Un mismo concepto nombrado dos veces es la puerta de entrada a que signifiquen dos cosas distintas.

**Evidencia:** `packages/catalog/src/port.ts` (el puerto), `packages/catalog/src/seed.ts` (el adaptador, con la advertencia arriba de todo), `packages/catalog/src/catalog.test.ts` (el contrato y la prueba de que la procedencia no se filtra).

---

## D-013 · La condición de pago bloquea la emisión, no el borrador

**Fecha:** 2026-08-06 · **Estado:** vigente

**Decisión:** un presupuesto se puede armar entero sin que el cliente tenga condición de pago cargada. Lo que no se puede es emitirlo. La compuerta se mueve de `createQuote` al momento de emitir, y el error que aparece ahí ofrece cargar el plazo sin salir de la pantalla.

**Motivo:** la regla nunca estuvo en discusión — un presupuesto sin condición de pago es un documento que promete algo que la administración no puede sostener. Lo que estaba mal era dónde se cobraba. Pedirla al crear el borrador hace que el primer acto del sistema, frente a un cliente nuevo que llamó por teléfono, sea negarse a empezar por un dato que quien atiende todavía no tiene. Ese es el momento exacto en que alguien vuelve al cuaderno, y el dato se pierde entero en vez de perderse a medias.

La alternativa descartada era volver opcional la condición de pago. No se sostiene: convierte una regla real de la administración en una preferencia, y el defecto reaparece más tarde y más caro, cuando ya hay presupuestos emitidos sin plazo.

**Recomendación aplicada encima:** el campo se ofrece igual en el alta, dentro de "Datos para facturar", sin obligar. Quien lo tiene a mano lo carga en el momento y nunca ve la compuerta. Quien no lo tiene avanza. Ofrecer sin exigir es distinto de no ofrecer.

**Consecuencias:** habilita cotizar contra un cliente incompleto, que es el caso normal cuando el cliente es nuevo. Cierra la posibilidad de emitir sin plazo. Cuesta que exista un estado intermedio real —borradores que no se pueden emitir— y ese estado tiene que ser visible: el error al emitir no puede ser la primera vez que alguien se entera.

**Una consecuencia que no era obvia:** al emitir, el plazo se relee del cliente y no se toma de la copia que el borrador guardó al crearse. Entre las dos cosas pueden haber pasado días y el plazo pudo cargarse en el medio; lo que se congela es lo que vale al emitir. Sin eso, mover la compuerta habría producido un presupuesto emitido con el plazo en nulo, que es peor que el bloqueo que esta decisión saca.

**Evidencia:** `issueQuote` en `packages/sales/src/quotes.ts` es donde se cobra; `createQuote` ya no la exige. La salida del error es `setPaymentTerms` (`packages/crm/src/customers.ts`), ofrecida como acción dentro del propio error y resuelta sin salir de la pantalla en `armar-presupuesto.tsx`. El bloque `La condición de pago bloquea la emisión, no el borrador` en `packages/sales/src/quotes.integration.test.ts` cubre los tres casos: que el borrador se cree igual, que emitir se rechace, y que el plazo se lea al emitir.

---

## D-014 · La unicidad del identificador es del grafo, no del negocio

**Fecha:** 2026-08-06 · **Estado:** vigente

**Decisión:** se registran dos cosas, y la distinción entre ellas es lo que importa.

1. **La unicidad del identificador legible por tipo de entidad es una restricción técnica del grafo, no una regla de negocio.** Ninguna decisión de producto declaró que no puedan existir dos entidades del mismo tipo con el mismo nombre. La restricción existe porque las URL de entidad son `/{tipo}/{identificador}` y un identificador tiene que resolver a una sola fila.
2. **Cuando esa restricción choca con un caso legítimo, la respuesta es desambiguar el identificador, nunca rechazar el alta.** El primero se queda con el identificador limpio, los siguientes llevan un número. El nombre visible no se toca.

**Motivo:** la restricción se descubrió porque chocó con la primera pantalla que escribe. `createEntity` hace `onConflictDoNothing` sobre `(type, slug)` y, cuando no inserta, lanza `Ya existe cliente con ese nombre` (`packages/core/src/graph/entities.ts`). Ese mensaje es el problema: **suena a política comercial y es una consecuencia de la clave única**. Alguien que lo lea va a creer que el negocio decidió no admitir clientes homónimos, cuando lo que pasó es que el grafo impuso una regla de identidad sobre los doce dominios a la vez sin que nadie la eligiera.

Y en clientes el caso legítimo es común: dos sucursales, dos razones sociales parecidas, el mismo nombre en dos ciudades. Bloquearlo es exactamente el bloqueo que la detección de duplicados existe para no hacer — se sugiere mientras se escribe, y la decisión es de quien carga, que sabe cosas que el sistema no.

**Por qué se registra la distinción y no sólo la solución:** sin ella, el próximo dominio que choque con lo mismo va a inventar su propia desambiguación, y el sistema va a tener tres formas distintas de resolver el mismo conflicto. Es la clase de divergencia que después nadie unifica porque cada una parece razonable en su lugar.

**Consecuencias:** habilita registrar homónimos sin perder la URL estable. Cuesta que el identificador y el nombre puedan diferir, así que **el identificador no se muestra como si fuera el nombre en ninguna parte**. Deja abierta la pregunta de si la política de identidad puede ser la misma para todos los tipos de entidad, que es [DT-006](12-deuda-conocida.md).

**Evidencia:** `slugDisponible` en `packages/crm/src/customers.ts`; la prueba `numera el identificador y deja el nombre intacto` en `packages/crm/src/customers.integration.test.ts`, que crea tres homónimos y verifica los tres identificadores.

---

## D-015 · La validación se parte por lo que necesita saber, no por dónde corre

**Fecha:** 2026-08-06 · **Estado:** vigente

**Decisión:** en `@nci/domain` va todo lo que se puede decidir mirando únicamente el dato que se tiene delante. En el paquete del dominio —`@nci/crm`, `@nci/sales`— va todo lo que requiere consultar el estado del mundo. El criterio es reutilizable y se aplica en cada dominio nuevo.

**Motivo:** `@nci/domain` es el único paquete que puede viajar al navegador sin arrastrar la base, así que es el único lugar desde donde el cliente y el servidor pueden ejecutar **literalmente las mismas reglas**, no dos copias que se parecen. Duplicar validación es una de las formas más comunes de que un sistema mienta: el navegador dice que sí a algo que el servidor rechaza, o al revés, y la diferencia aparece recién frente a un usuario. Poner las reglas puras en el único lugar compartido no lo hace improbable, lo hace imposible.

La partición no es "front y back". Es qué necesita saber la regla para responder. Que un nombre tenga al menos dos caracteres, que haga falta al menos un canal de contacto, que un plazo esté entre 0 y 365, que dos nombres se parezcan lo bastante como para sospechar: todo eso se responde con el dato. Si ya existe un cliente parecido, si el identificador está libre, si quien pregunta puede crear: nada de eso.

**La consecuencia que hay que sostener:** el servidor **vuelve a ejecutar** las reglas puras, no confía en que el navegador ya las corrió. La validación compartida es para que el usuario se entere antes, no para ahorrarse la comprobación. `createCustomer` llama a `validateCustomer` como primera cosa después de la capacidad.

**Consecuencias:** habilita que un cambio de regla llegue a las dos puntas en el mismo commit. Cierra la posibilidad de que una regla pura viva en un componente. Cuesta que `@nci/domain` no pueda importar nada con base — que es lo que la hace útil, y es la misma restricción que D-002 pone sobre `@nci/ai`, por la misma clase de motivo.

**Evidencia:** `packages/domain/src/customer.ts` (`validateCustomer`, `looksLikeSameCustomer`) con sus pruebas; `packages/crm/src/customers.ts` (`findSimilarCustomers`, `slugDisponible`); `apps/web/src/components/alta-de-cliente.tsx`, que importa las mismas funciones que ejecuta el servidor.

---

## D-016 · Emitido y enviado son dos estados, no uno con dos nombres

**Fecha:** 2026-08-06 · **Estado:** vigente

**Decisión:** el presupuesto recorre `borrador → emitido → enviado`. Emitir es el acto interno de cerrar el documento: congela los renglones y los importes, y es donde se cobra la condición de pago (D-013). Enviar es habérselo hecho llegar al cliente, por un medio y en un momento concretos. `sendQuote` pasa a ser la transición `emitido → enviado` y nada más.

**Motivo:** hasta acá el sistema hacía las dos cosas en un solo acto. Un presupuesto cerrado y todavía no mandado —se revisa antes de mandarlo, se espera a saber por qué medio, se emite el viernes y se manda el lunes— no se podía representar.

La alternativa que se propuso primero era renombrar `enviado` a `emitido`. Se rechazó: dejaría `sentAt` y `sentVia` en nulo dentro de un presupuesto que el sistema llama enviado, o peor, los llenaría con el instante de la emisión. Un campo que promete algo que el código no cumple es la familia exacta de defecto que este proyecto viene sacando del sistema hace varias sesiones. **Se separa, no se renombra.**

**Lo que esto habilita y que antes no existía:** que el escritorio distinga "falta que lo termines" de "falta que lo mandes". Son dos tareas distintas de la misma persona y hasta ahora se veían iguales.

**Consecuencias:** habilita construir la emisión completa sin haber resuelto por dónde sale el presupuesto — el envío real al cliente queda para la sección 3B, sin deuda pendiente en el modelo. Cierra la posibilidad de aceptar o rechazar un presupuesto que nadie mandó: desde `emitido` sólo se puede enviar o vencer, porque del otro lado no lo vio nadie. Cuesta un paso más en el flujo, que es el precio de que los dos hechos sean dos.

**En el conteo del escritorio los dos suman a "Sin enviar".** Son estados distintos porque son hechos distintos, pero le piden a quien mira la misma acción, y partir en dos una sola cosa por hacer sería exactitud sin utilidad.

**Evidencia:** `packages/db/migrations/0004_emision.sql` y su reversión; `TRANSITIONS` e `issueQuote` en `packages/sales/src/quotes.ts`; el bloque `Emitido y enviado son dos hechos distintos` en `packages/sales/src/quotes.integration.test.ts`.

---

## Cómo se agrega una entrada

Se numera con el siguiente `D-00N` disponible, se agrega al final, y no se toca ninguna de las anteriores salvo para marcarlas como supersedidas por la nueva. Una entrada puede quedar supersedida en parte: cuando pasa, se dice qué parte, para que nadie tenga que deducir si el resto sigue en pie.
