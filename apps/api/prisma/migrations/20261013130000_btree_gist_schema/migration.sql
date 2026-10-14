-- Supabase recomienda no dejar extensiones en public (se exponen por su API).
-- La restricción de turnos superpuestos referencia las clases de operadores por OID,
-- así que mover la extensión no la afecta. En bases sin el esquema extensions no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
     AND EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
                 WHERE e.extname = 'btree_gist' AND n.nspname = 'public') THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END $$;
