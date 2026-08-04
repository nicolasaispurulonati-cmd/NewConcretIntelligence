-- Extensiones que el esquema necesita antes de existir.
-- Se aplican antes que las migraciones porque la tabla `entities` declara
-- columnas de tipo `vector`, que no existe sin pgvector.

-- Búsqueda semántica.
CREATE EXTENSION IF NOT EXISTS vector;

-- Búsqueda por coincidencia parcial y tolerante a errores de tipeo.
-- La búsqueda universal tiene que encontrar "Concret D" escribiendo "concretd".
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalización de acentos: "diagnostico" debe encontrar "diagnóstico".
CREATE EXTENSION IF NOT EXISTS unaccent;
