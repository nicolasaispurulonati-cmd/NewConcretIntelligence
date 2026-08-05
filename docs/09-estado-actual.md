# 9. Índice de la documentación

Este archivo describía el estado del sistema. Ya no: llegó a acumular siete afirmaciones que el código había dejado atrás — contaba 72 pruebas cuando había 110, decía que no existía control de versiones cuando el repositorio ya estaba en GitHub, y describía un defecto del motor de IA que se había corregido tres commits antes.

No fue por descuido. **Un documento de estado mantenido a mano se desactualiza siempre**, porque describe algo que cambia todos los días y él sólo cambia cuando alguien se acuerda. La versión que peor envejece es además la más peligrosa: la que sigue siendo verosímil.

> **Ningún documento de este repositorio describe el estado actual del código.**
>
> El estado del código lo describe el código. Lo que se documenta acá son **decisiones** y **hallazgos**, y los dos llevan fecha: valen por lo que se sabía y se decidió ese día, no por seguir siendo ciertos hoy.

## Qué hay

| Documento | Qué contiene |
|---|---|
| [`00-auditoria-linea-base.md`](00-auditoria-linea-base.md) | Auditoría de sólo lectura del 5 de agosto de 2026: qué existía, verificado archivo por archivo, distinguiendo construido de declarado de ausente. Es una foto fechada, no un estado vigente. |
| [`08-technical-architecture.md`](08-technical-architecture.md) | Por qué cada decisión técnica responde a un principio de producto: el grafo sobre PostgreSQL, el modelo de permisos, el contrato de la IA, la topología de la integración con Tango. |
| [`10-decisiones.md`](10-decisiones.md) | El registro de decisiones de arquitectura y producto. Ninguna entrada se borra: si una se revierte, otra la supersede. Es lo más cercano a un documento vivo que hay acá, y lo es porque sólo crece. |
| [`11-propuesta-acceso-entidades.md`](11-propuesta-acceso-entidades.md) | El diseño de la puerta única de acceso a entidades, con su inventario de sitios, su orden de migración y las decisiones que faltan. Propuesta, no implementación. |

## Cómo saber qué hay construido hoy

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:integracion
```

Lo que compila y pasa existe. Lo que no aparece en ninguna prueba, conviene tratarlo como si no estuviera. El README explica cómo levantar el entorno que las pruebas de integración exigen.
