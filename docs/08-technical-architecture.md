# 8. Technical Architecture

Versión: 1.0 · Estado: Draft

Los siete documentos anteriores definen **qué** es NewConcret Intelligence. Este define **cómo** se construye, y por qué cada decisión técnica responde a un principio de producto y no a una preferencia.

---

## Filosofía de la arquitectura técnica

Una regla que sólo vive en un documento se erosiona. En el tercer sprint, con una fecha encima, alguien va a mostrar un número sin contexto o va a dejar que la IA lea algo que el usuario no puede ver — no por mala fe, sino porque el sistema se lo permitió.

Por eso la decisión que ordena todo lo demás es ésta: **los principios se codifican como restricciones, no como convenciones.**

| Principio del producto | Cómo lo impone el código |
|---|---|
| Una única fuente de verdad | `@nci/domain` define cada entidad una vez. Un test rompe el build si dos conceptos comparten nombre. |
| La IA respeta permisos | El motor de IA no puede consultar la base: sólo recibe un `Scope`, que lleva el Actor adentro. No hay camino alternativo. |
| El contexto sobre el dato | El tipo `Metric` no se construye sin al menos una línea de contexto. Un número solo no compila. |
| El estado se explica | `describeStatus()` lanza si falta la etiqueta o la explicación. Un punto de color solo no se puede renderizar. |
| Una acción importante no es irreversible | Las entidades se archivan, nunca se borran. Movimientos y auditoría son inmutables por trigger de base de datos. |
| El error enseña | Todo error del sistema lleva `message`, `reason` y `actions` como campos obligatorios. |
| La plataforma habla como un profesional | `checkVoice()` detecta emojis, exclamaciones y felicitaciones. Los tests lo aplican a los textos del sistema. |

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript | Un solo lenguaje del modelo de dominio al navegador. El "lenguaje oficial" del documento 4 existe como tipos que el compilador verifica en todas las capas. |
| Base de datos | PostgreSQL 16+ | Un motor cubre las cuatro necesidades: relacional, grafo (CTEs recursivas), texto completo (tsvector) y semántica (pgvector). Cada pieza extra es un sistema más que mantener durante diez años. |
| ORM | Drizzle | El esquema es TypeScript; las migraciones son SQL legible y versionado. Sin capa de abstracción que oculte lo que corre. |
| Aplicación | Next.js 15 (App Router) | Una aplicación web adaptable, no una app. Los componentes de servidor consultan el motor directamente, sin una capa de API intermedia que duplique las reglas de permisos. |
| IA | Claude (`claude-opus-5`) | Razonamiento profundo, ventana de contexto amplia y salidas estructuradas — el contrato de respuesta se valida contra un esquema, no contra el prompt. |

### Por qué PostgreSQL y no una base de grafos

El documento 4 pide un grafo de conocimiento. La tentación es Neo4j.

Pero el grafo es *una* de las cosas que hace la plataforma. También lleva stock con integridad transaccional, órdenes de compra con estados, y auditoría inmutable. Una base de grafos obligaría a mantener dos motores sincronizados — y la sincronización entre dos fuentes de verdad contradice el Principio 1.

PostgreSQL con una tabla de nodos y una de aristas resuelve el grafo con índices normales; a la escala de NewConcret, y aun triplicándola, la diferencia de rendimiento es irrelevante. Si algún día deja de serlo, el motor de grafo está aislado en `@nci/core/graph` y se reemplaza sin tocar los dominios.

---

## Estructura del repositorio

```
newconcret-intelligence/
├── packages/
│   ├── domain/    El lenguaje oficial. Sin dependencias de infraestructura.
│   ├── db/        Esquema del grafo sobre PostgreSQL.
│   ├── core/      Autorización, grafo, actividad, auditoría, búsqueda.
│   ├── design/    El PDL en código: tokens y reglas de comportamiento.
│   └── ai/        El AI Engine.
├── apps/
│   └── web/       La aplicación.
└── docs/          Esta serie.
```

Las dependencias van en una sola dirección:

```
domain  →  (nada)
db      →  domain
core    →  domain, db
ai      →  domain, core          ← nunca db
design  →  (nada)
web     →  todos
```

**`ai` no depende de `db`.** Es la decisión de arquitectura más importante del sistema: el motor de IA no tiene forma de consultar la base. Recibe un `Scope` y usa las mismas funciones que la interfaz. La promesa del documento 5 —"la IA nunca podrá acceder a información que el usuario no pueda consultar manualmente"— no depende de que nadie se equivoque.

---

## El modelo de datos

### Los nodos

Una tabla `entities` para los treinta tipos del modelo de dominio. Todos comparten identidad, presentación, propiedad, clasificación y tiempo; los datos propios de cada tipo viven en `data` (JSONB), validados contra `@nci/domain` al escribir.

Que sea una sola tabla es lo que permite escribir la búsqueda universal, la línea de tiempo, los permisos y la recuperación de la IA **una vez** y que sirvan para todo. Un dominio nuevo no reimplementa nada de eso.

> **Camino de maduración.** A medida que un dominio crece, sus campos más consultados se promueven de `data` a columnas reales o a una tabla de detalle con sus restricciones. Eso no cambia nada de lo que está construido: el nodo sigue siendo el mismo. Empezar con JSONB es velocidad al inicio, no una renuncia a la integridad.

### Las aristas

`entity_relations` guarda una fila por relación y la recorre en los dos sentidos, cada uno con su propia etiqueta. Cada tipo de arista declara qué entidades puede unir, y se valida antes de insertar.

Esa validación es lo que separa un grafo de un montón de líneas. Sin ella, "todo conectado con todo" degenera en ruido y la IA pierde la capacidad de explicar por qué relacionó dos cosas — que es exactamente lo que el producto promete.

Cada arista registra si la afirmó una persona, el sistema o la IA. Una relación inferida nunca se confunde con una verificada.

### Tiempo, en dos tablas distintas

| | `activity` | `audit_log` |
|---|---|---|
| Para quién | Una persona que lo lee | La empresa que debe demostrarlo |
| Contenido | Frases redactadas | Quién, qué, cuándo, desde dónde, con qué permiso |
| Incluye denegaciones | No | Sí |
| Mutable | Sí | **Nunca** — un trigger de base rechaza `UPDATE` y `DELETE` |

Separarlas evita el compromiso habitual: un registro legible pero incompleto, o uno completo pero ilegible.

---

## Permisos

Una capacidad es `dominio.recurso.acción` y se lee como una frase del negocio: `procurement.purchase_order.approve` es "Puede aprobar compras".

**Tres reglas, en orden:**

1. Un nivel concedido arrastra los inferiores del mismo recurso. Quien administra stock puede consultarlo.
2. Las concesiones individuales suman sobre lo que dan los roles.
3. Las revocaciones restan y siempre ganan.

La implicación se resuelve al evaluar, nunca al guardar. Cambiar un rol rige en la petición siguiente, sin permisos huérfanos esperando en una tabla.

**Un rol es un atajo, no una jaula.** La autoridad vive en las capacidades. Por eso incorporar distribuidores, franquicias o auditores no exige modificar el sistema: es un rol nuevo con capacidades existentes.

### La clasificación del dato

Además del permiso sobre el recurso, cada entidad declara su clasificación. `financial` exige `executive.financials.read`.

Es lo que produce el caso del documento 5: un usuario de Marketing con acceso completo a productos sigue sin poder ver rentabilidad, y la IA responde *"No posee permisos para consultar información financiera"* — porque el motor genera esa frase desde la capacidad que falta, no desde una regla escrita en el prompt.

---

## El AI Engine

### El contrato de respuesta

El documento 7 exige: primero responder, después explicar, después justificar, recién entonces proponer acciones. Y que toda respuesta sea verificable.

Eso no se pide en el prompt. Se impone con un esquema JSON que la API valida: la respuesta **sólo puede** tener esa forma. Una respuesta sin justificación o sin fuentes no es improbable — es imposible.

```
answer              La respuesta directa.
explanation         Qué significa en contexto.
justification       Con qué información concreta se llegó.
proposedActions     Qué se puede hacer. Nunca obligatorio.
sources             Qué elementos se usaron, con su fecha.
confidence          alta | media | baja
missingInformation  Qué falta para responder mejor. Nunca "no encontré nada".
```

### La recuperación

Tres caminos combinados en un solo resultado: léxico con pesos por campo, difuso (tolerante a errores de tipeo y acentos, para que el Command Palette responda con dos letras) y semántico por embeddings.

Los tres parten del mismo `Scope`, así que los tres respetan los mismos permisos.

Cuando la persona pregunta mirando una entidad, esa entidad y su universo pesan más que cualquier coincidencia de texto. Preguntar "¿conviene comprar?" con Concret D abierto no es lo mismo que preguntarlo en abstracto.

### Lo que la IA sabe que no puede ver

Cuando hay información relacionada fuera del alcance de la persona, la IA recibe el **número** y nunca el contenido. Le sirve para no afirmar que algo no existe cuando sólo no puede verlo. La interfaz hace lo mismo: *"Hay 3 elementos relacionados fuera de tu alcance de acceso."*

Saber que existe algo que no se puede ver es distinto de creer que no existe. Lo primero es honesto; lo segundo es una mentira del sistema.

---

## Infraestructura

### La nube

| Componente | Servicio | Notas |
|---|---|---|
| Aplicación | Vercel | Se alinea con Next.js sin infraestructura propia. |
| Base de datos | PostgreSQL gestionado con pgvector (Neon, Supabase o RDS) | Punto de recuperación por hora; retención 30 días. |
| Archivos | Almacenamiento de objetos con URLs firmadas | Los documentos nunca se sirven directo. |
| IA | API de Anthropic | Sin datos de entrenamiento sobre información de la empresa. |

### El puente hacia Tango

Tango corre en la red interna de NewConcret. La nube no puede alcanzarlo, y **no debe poder**.

La solución es un agente que corre adentro y sale hacia afuera:

```
   Red interna de NewConcret                    Nube
┌───────────────────────────────┐        ┌──────────────────────┐
│  Tango  ←──  Puente NCI       │───────▶│  NewConcret          │
│              (agente local)   │  TLS   │  Intelligence        │
└───────────────────────────────┘  saliente└────────────────────┘
```

- **El puente inicia todas las conexiones.** La nube nunca abre una sesión hacia adentro. No hay puerto expuesto, no hay VPN que mantener, y un compromiso de la nube no alcanza la red interna.
- Consulta cambios en Tango, los traduce al lenguaje del dominio y los envía firmados con un secreto compartido.
- Cada sincronización queda en `activity` con `source: 'integration'`, así que un dato que llegó de Tango se distingue siempre de uno cargado a mano.
- Si el puente se cae, la plataforma sigue funcionando con la última información conocida, marcada con su fecha. El Principio 10 en acción: el tiempo es visible, sobre todo cuando el dato envejece.

**Integrar antes que reemplazar.** Tango sigue siendo el sistema contable. La plataforma es el punto de integración, no el reemplazo.

---

## Plan de fases

**Fase 1 — Fundación** *(construida)*
Monorepo, modelo de dominio, esquema del grafo, motor de autorización, auditoría, búsqueda universal, AI Engine, PDL en código, armazón de la aplicación con Workspace y Command Palette.

**Fase 2 — El primer dominio de punta a punta: Products + Knowledge**
Son los dominios más usados y los que validan el grafo con el caso real: abrir Concret D y ver su universo. Knowledge es además donde la IA aporta valor desde el primer día.

**Fase 3 — Inventory + Procurement**
Es donde la IA deja de asistir y empieza a anticipar: qué comprar, cuánto y cuándo. Requiere que Products exista antes.

**Fase 4 — CRM + Sales**
Presupuestos como entidad, no como PDF. Conversaciones unificadas sin importar el canal.

**Fase 5 — Support + Academy + Marketing**
Cada caso técnico resuelto vuelve a Knowledge. Ahí el sistema empieza a aprender de sí mismo.

**Fase 6 — Executive Intelligence**
Va última a propósito: sólo puede responder sobre lo que existe. Construirla antes sería una pantalla bonita sobre nada.

**Transversal — El puente con Tango**
Se incorpora cuando el dominio que lo necesita entra en juego, no antes.

---

## Lo que este documento decide y lo que deja abierto

**Decidido:** el stack, la estructura del repositorio, el modelo de datos del grafo, el modelo de permisos, el contrato de la IA, la topología de la integración con Tango, el orden de las fases.

**Abierto, a resolver con cada dominio:** qué campos de cada entidad se promueven de JSONB a columnas; qué proveedor concreto de PostgreSQL; el modelo de embeddings; la estrategia de importación inicial desde los sistemas actuales.

**Deliberadamente fuera de alcance por ahora:** aplicación nativa (la web adaptable cubre el caso), multi-empresa, y todo lo que el documento 1 enumera bajo "Qué NO es".
