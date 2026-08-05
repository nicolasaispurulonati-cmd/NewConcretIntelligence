-- Procedencia y certeza en los nodos del grafo.
--
-- Las aristas ya sabían decir quién las afirmó y con cuánta certeza. Los nodos
-- no, y sin eso un nodo inferido —una máquina deducida del historial de ventas—
-- sólo podría declararlo enterrándolo en `data`, que no está tipado ni validado.
--
-- Al mismo tiempo `confidence` deja de ser texto: como texto admitía "alta",
-- "0,8" o "-3" sin que nada se quejara, y ordenar por certeza daba un orden
-- alfabético. Ver D-007.
--
-- Reversión: 0002_procedencia.down.sql, en esta misma carpeta.

-- El USING es obligatorio: PostgreSQL no convierte text a numeric por su
-- cuenta. Un valor que no sea un número hace fallar la migración acá, que es
-- donde corresponde enterarse.
ALTER TABLE "entity_relations" ALTER COLUMN "confidence" SET DATA TYPE numeric(3, 2) USING "confidence"::numeric(3, 2);--> statement-breakpoint
-- 'user' para todo lo que ya existe: lo que se creó hasta hoy lo creó una persona.
ALTER TABLE "entities" ADD COLUMN "source" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_source_valid" CHECK ("entities"."source" in ('user','system','ai'));--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_confidence_valid" CHECK ("entities"."confidence" is null or ("entities"."confidence" >= 0 and "entities"."confidence" <= 1));--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_confidence_valid" CHECK ("entity_relations"."confidence" is null or ("entity_relations"."confidence" >= 0 and "entity_relations"."confidence" <= 1));
