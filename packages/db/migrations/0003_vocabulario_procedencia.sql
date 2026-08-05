-- Un solo vocabulario de procedencia para nodos, aristas y actividad.
--
-- Entra `integration`. Una maquina inferida del historial de Tango no la
-- infiere un usuario, ni la logica interna, ni la IA: la trae un sistema
-- externo, y `system` seria inexacto porque describiria a NCI afirmando algo
-- por su cuenta. Resuelve la tension anotada en D-007.
--
-- Y entran los dos campos que hacen aplicable D-001 a los datos inferidos:
-- de que sistema salio el dato y cuando se leyo. Sin la fecha de lectura no
-- se puede mostrar que envejecio.
--
-- activity no tenia ninguna restriccion sobre source: admitia cualquier
-- palabra. Era la tercera forma distinta del mismo vocabulario.
--
-- Reversion: 0003_vocabulario_procedencia.down.sql
ALTER TABLE "entities" DROP CONSTRAINT "entities_source_valid";--> statement-breakpoint
ALTER TABLE "entity_relations" DROP CONSTRAINT "entity_relations_source_valid";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "source_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "source_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD COLUMN "source_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_source_valid" CHECK (source in ('user','system','ai','integration'));--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_external_origin" CHECK (case when source = 'integration' then source_system is not null and source_read_at is not null else source_system is null and source_read_at is null end);--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_external_origin" CHECK (case when source = 'integration' then source_system is not null and source_read_at is not null else source_system is null and source_read_at is null end);--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_source_valid" CHECK (source in ('user','system','ai','integration'));--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_external_origin" CHECK (case when source = 'integration' then source_system is not null and source_read_at is not null else source_system is null and source_read_at is null end);--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_source_valid" CHECK (source in ('user','system','ai','integration'));