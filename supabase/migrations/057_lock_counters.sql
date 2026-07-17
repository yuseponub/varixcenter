-- Migration: 057_lock_counters.sql
-- Purpose: Cerrar los contadores de numeracion secuencial (anti-fraude).
--          Las tablas *_counter tenian GRANT UPDATE + politicas permisivas
--          (WITH CHECK (true)) para authenticated, permitiendo a cualquier
--          usuario autenticado alterar la numeracion gapless directamente.
--          Los RPC que generan numeros son SECURITY DEFINER y no necesitan
--          esos permisos: se revocan y se eliminan las politicas de UPDATE.
-- Depends on: 009, 015, 021, 024, 031, 033

DO $$
DECLARE
  v_table TEXT;
  v_policy RECORD;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'invoice_counter',
      'closing_counter',
      'venta_counter',
      'medias_cierre_counter',
      'purchase_counter',
      'medias_return_counter'
    ])
  LOOP
    -- Revocar UPDATE (e INSERT/DELETE por si acaso) a authenticated y anon
    EXECUTE format('REVOKE UPDATE, INSERT, DELETE ON public.%I FROM authenticated', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_table);

    -- Eliminar politicas de UPDATE/INSERT/DELETE sobre el contador
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND cmd IN ('UPDATE', 'INSERT', 'DELETE', 'ALL')
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_table);
      RAISE NOTICE 'Politica % eliminada de %', v_policy.policyname, v_table;
    END LOOP;
  END LOOP;
END $$;

-- Verificacion: ningun contador debe aceptar UPDATE de authenticated
DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOR v_table IN
    SELECT unnest(ARRAY[
      'invoice_counter', 'closing_counter', 'venta_counter',
      'medias_cierre_counter', 'purchase_counter', 'medias_return_counter'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND grantee = 'authenticated'
        AND privilege_type IN ('UPDATE', 'INSERT', 'DELETE')
    ) THEN
      RAISE EXCEPTION 'El contador % sigue teniendo permisos de escritura para authenticated', v_table;
    END IF;
  END LOOP;
  RAISE NOTICE 'Contadores asegurados correctamente';
END $$;
