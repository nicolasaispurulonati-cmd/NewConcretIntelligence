-- Búsqueda universal e índices que Drizzle no expresa.
-- Se aplica después de las migraciones. Es idempotente: puede correrse siempre.

-- ─────────────────────────────────────────────────────────────────────────
-- unaccent() en versión indexable.
--
-- `unaccent(text)` es STABLE, no IMMUTABLE, porque depende del diccionario
-- activo. PostgreSQL rechaza funciones no inmutables en expresiones de índice,
-- así que usarla directamente hace fallar la creación del índice trigram.
--
-- La forma de dos argumentos sí es inmutable: fija el diccionario y elimina la
-- dependencia del entorno. Envolverla es la manera estándar de resolverlo.
--
-- Importante: las consultas tienen que usar esta misma función, no `unaccent`
-- a secas. Si no coinciden, el índice existe pero el planificador no lo usa.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nci_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Configuración de búsqueda en español, insensible a acentos.
-- "diagnostico" tiene que encontrar "diagnóstico".
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'nci_es') THEN
    CREATE TEXT SEARCH CONFIGURATION nci_es (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION nci_es
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- El vector de búsqueda de cada nodo.
--
-- Los pesos ordenan el resultado: el nombre pesa más que el subtítulo, y el
-- subtítulo más que el cuerpo. Escribir "Concret D" devuelve el producto
-- primero y los documentos que lo mencionan después.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION entities_build_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('nci_es', coalesce(NEW.display_name, '')), 'A')
   || setweight(to_tsvector('nci_es', coalesce(NEW.subtitle, '')), 'B')
   || setweight(to_tsvector('nci_es', coalesce(NEW.searchable_text, '')), 'C');

  -- Si cambió el texto, el embedding que había dejó de describir al nodo.
  -- Se invalida acá para que el indexador semántico lo vuelva a calcular y
  -- la IA nunca recupere un nodo por lo que decía antes.
  IF TG_OP = 'UPDATE' AND (
       NEW.display_name IS DISTINCT FROM OLD.display_name
    OR NEW.subtitle IS DISTINCT FROM OLD.subtitle
    OR NEW.searchable_text IS DISTINCT FROM OLD.searchable_text
  ) THEN
    NEW.embedded_at := NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS entities_search_vector_trigger ON entities;
CREATE TRIGGER entities_search_vector_trigger
  BEFORE INSERT OR UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION entities_build_search_vector();

-- ─────────────────────────────────────────────────────────────────────────
-- Marcar la fecha de modificación sin depender de que la aplicación se acuerde.
-- Principio 10 del PDL: el tiempo es visible.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS entities_touch_updated_at ON entities;
CREATE TRIGGER entities_touch_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Coincidencia parcial y tolerante a errores de tipeo sobre el nombre.
-- El Command Palette escribe mientras el usuario tipea: tiene que responder
-- con dos letras y sin acentos.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS entities_display_name_trgm_idx
  ON entities USING gin (lower(nci_unaccent(display_name)) gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────
-- Búsqueda semántica.
--
-- HNSW sobre distancia coseno. Se crea en modo parcial: sólo indexa nodos que
-- ya tienen embedding, para que los que esperan indexación no ocupen el índice.
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS entities_embedding_idx
  ON entities USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Cola de indexación semántica: los nodos cuyo texto cambió y esperan embedding.
CREATE INDEX IF NOT EXISTS entities_pending_embedding_idx
  ON entities (updated_at)
  WHERE embedded_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- La auditoría no se modifica ni se borra. Nunca.
--
-- No alcanza con no escribir el UPDATE en el código: la regla se impone en la
-- base, donde ningún desarrollo futuro ni ninguna consola pueda saltearla.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'La tabla % es inmutable: sus registros no se modifican ni se eliminan.', TG_TABLE_NAME
    USING HINT = 'Para corregir un dato, registrá un nuevo asiento que lo compense.';
END
$$;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
