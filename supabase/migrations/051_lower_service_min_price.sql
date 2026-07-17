-- Migration: 051_lower_service_min_price.sql
-- Purpose: Set precio_minimo = 50000 for all variable-price services so that
--          payments can be charged down to 50k (previously some services had a
--          higher floor, e.g. 100k, blocking smaller charges).

-- ============================================================================
-- 1. LOWER MINIMUM PRICE FOR VARIABLE SERVICES
-- ============================================================================
-- Only variable-price services use precio_minimo (fixed-price services keep it
-- NULL). The variable_price_in_range constraint requires precio_minimo <=
-- precio_base, so we only touch services whose base price is >= 50000. Any
-- variable service with base < 50000 already allows charging below 50k.

UPDATE public.services
SET
  precio_minimo = 50000,
  updated_at = now()
WHERE precio_variable = true
  AND precio_base >= 50000
  AND (precio_minimo IS DISTINCT FROM 50000);

-- ============================================================================
-- 2. REPORT SERVICES THAT COULD NOT BE LOWERED TO 50000
-- ============================================================================
-- Variable services with precio_base < 50000 cannot have a 50000 floor (it
-- would exceed the base price). They are logged for manual review; their
-- current minimum is already below 50000 so they are not blocking small charges.

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT nombre, precio_base, precio_minimo
    FROM public.services
    WHERE precio_variable = true
      AND precio_base < 50000
  LOOP
    RAISE NOTICE 'Servicio "%" no ajustado: precio_base=% < 50000 (minimo actual=%)',
      v_row.nombre, v_row.precio_base, v_row.precio_minimo;
  END LOOP;
END $$;
