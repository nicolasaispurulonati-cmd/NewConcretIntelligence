-- Emitir y enviar dejan de ser el mismo hecho.
--
-- Hasta aca el presupuesto pasaba de borrador a enviado en un solo acto, y ese
-- acto hacia dos cosas a la vez: cerraba el documento y se lo hacia llegar al
-- cliente. Son dos hechos distintos y ocurren en momentos distintos: se cierra
-- un presupuesto para revisarlo, se manda despues, y a veces por un medio que
-- todavia no esta decidido.
--
-- La alternativa era renombrar `enviado` a `emitido` y dejar que sent_at y
-- sent_via quedaran nulos en un presupuesto que el sistema llama enviado. Eso
-- es un campo prometiendo algo que no ocurrio. Se separa, no se renombra.
--
-- issued_at es lo que congela el presupuesto. sent_at sigue registrando que
-- salio, y ahora depende del primero. Ver D-016.
--
-- Reversion: 0004_emision.down.sql
ALTER TABLE "quotes" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
-- Los presupuestos ya enviados se emitieron en el momento en que se enviaron:
-- bajo el modelo anterior no habia otro instante posible. Sin esto la
-- restriccion siguiente rechaza toda fila que tenga sent_at cargado.
UPDATE "quotes" SET "issued_at" = "sent_at" WHERE "sent_at" is not null;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sent_requires_issued" CHECK ("quotes"."sent_at" is null or "quotes"."issued_at" is not null);
