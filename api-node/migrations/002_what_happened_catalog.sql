-- Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
-- All rights reserved.
-- This file is a part of Klinok application

WITH catalog(id, sort_order) AS (
  SELECT item.id, item.ordinality::integer
  FROM unnest(ARRAY[
    'well.1',
    'well.2',
    'well.3',
    'well.4',
    'well.5',
    'well.6',
    'well.7',
    'well.8',
    'well.9',
    'problem.general.1',
    'problem.general.2',
    'problem.general.3',
    'problem.general.4',
    'problem.general.5',
    'problem.general.6',
    'problem.general.7',
    'problem.general.8',
    'problem.general.9',
    'problem.general.10',
    'problem.general.11',
    'problem.general.12',
    'problem.general.13',
    'problem.general.14',
    'problem.general.15',
    'problem.general.16',
    'problem.general.17',
    'problem.general.18',
    'problem.digestive.1',
    'problem.digestive.2',
    'problem.digestive.3',
    'problem.digestive.4',
    'problem.digestive.5',
    'problem.digestive.6',
    'problem.digestive.7',
    'problem.digestive.8',
    'problem.digestive.9',
    'problem.digestive.10',
    'problem.digestive.11',
    'problem.digestive.12',
    'problem.digestive.13',
    'problem.digestive.14',
    'problem.digestive.15',
    'problem.digestive.16',
    'problem.digestive.17',
    'problem.digestive.18',
    'problem.digestive.19',
    'problem.digestive.20',
    'problem.digestive.21',
    'problem.digestive.22',
    'problem.digestive.23',
    'problem.digestive.24',
    'problem.digestive.25',
    'problem.respiratory.1',
    'problem.respiratory.2',
    'problem.respiratory.3',
    'problem.respiratory.4',
    'problem.respiratory.5',
    'problem.skin.1',
    'problem.skin.2',
    'problem.skin.3',
    'problem.skin.4',
    'problem.skin.5',
    'problem.skin.6',
    'problem.skin.7',
    'problem.skin.8',
    'problem.skin.9',
    'problem.skin.10',
    'problem.skin.11',
    'problem.skin.12',
    'problem.skin.13',
    'problem.skin.14',
    'problem.skin.15',
    'problem.skin.16',
    'problem.skin.17',
    'problem.skin.18',
    'problem.skin.19',
    'problem.skin.20',
    'problem.skin.21',
    'problem.skin.22',
    'problem.skin.23',
    'problem.skin.24',
    'problem.urinary.1',
    'problem.urinary.2',
    'problem.urinary.3',
    'problem.urinary.4',
    'problem.urinary.5',
    'problem.urinary.6',
    'problem.urinary.7',
    'problem.urinary.8',
    'problem.urinary.9',
    'problem.urinary.10',
    'problem.urinary.11',
    'problem.urinary.12',
    'problem.urinary.13',
    'problem.eyes.1',
    'problem.eyes.12',
    'problem.eyes.2',
    'problem.eyes.3',
    'problem.eyes.4',
    'problem.eyes.5',
    'problem.eyes.6',
    'problem.eyes.7',
    'problem.eyes.8',
    'problem.eyes.9',
    'problem.eyes.10',
    'problem.musculoskeletal.1',
    'problem.musculoskeletal.2',
    'problem.musculoskeletal.3',
    'problem.musculoskeletal.4',
    'problem.musculoskeletal.5',
    'problem.musculoskeletal.6',
    'problem.musculoskeletal.7',
    'problem.musculoskeletal.8',
    'problem.musculoskeletal.9',
    'problem.musculoskeletal.10',
    'problem.musculoskeletal.11',
    'problem.musculoskeletal.12',
    'problem.musculoskeletal.13',
    'problem.musculoskeletal.14',
    'problem.laboratory.cbc.1',
    'problem.laboratory.cbc.2',
    'problem.laboratory.cbc.3',
    'problem.laboratory.cbc.4',
    'problem.laboratory.cbc.5',
    'problem.laboratory.cbc.6',
    'problem.laboratory.biochemistry.1',
    'problem.laboratory.biochemistry.2',
    'problem.laboratory.biochemistry.3',
    'problem.laboratory.biochemistry.4',
    'problem.laboratory.biochemistry.5',
    'problem.laboratory.biochemistry.6',
    'problem.laboratory.biochemistry.7',
    'problem.laboratory.biochemistry.8',
    'problem.laboratory.biochemistry.9',
    'problem.laboratory.biochemistry.10',
    'problem.laboratory.biochemistry.11',
    'problem.laboratory.urine.1',
    'problem.laboratory.urine.2',
    'problem.laboratory.urine.3',
    'problem.laboratory.urine.4',
    'problem.laboratory.urine.5',
    'problem.laboratory.urine.6',
    'problem.laboratory.urine.7',
    'problem.laboratory.urine.8',
    'problem.laboratory.urine.9',
    'problem.laboratory.urine.10',
    'problem.research.1',
    'problem.research.2',
    'problem.research.3',
    'problem.research.4',
    'problem.research.5',
    'problem.research.6',
    'critical.1',
    'critical.2',
    'critical.3',
    'critical.4',
    'critical.5',
    'critical.6',
    'critical.7'
  ]::text[]) WITH ORDINALITY AS item(id, ordinality)
),
source_records AS (
  SELECT
    record_id,
    sections,
    jsonb_typeof(sections #> '{what-happened,value,selectedIds}') = 'array' AS had_array,
    CASE
      WHEN jsonb_typeof(sections #> '{what-happened,value,selectedIds}') = 'array'
        THEN sections #> '{what-happened,value,selectedIds}'
      ELSE '[]'::jsonb
    END AS old_ids
  FROM medical_records
  WHERE jsonb_typeof(sections -> 'what-happened') = 'object'
    AND jsonb_typeof(sections #> '{what-happened,value}') = 'object'
),
expanded_ids AS (
  SELECT
    source.record_id,
    CASE
      WHEN old_id.value = 'problem.eyes.11' THEN 'problem.eyes.10'
      ELSE old_id.value
    END AS id
  FROM source_records AS source
  CROSS JOIN LATERAL jsonb_array_elements_text(source.old_ids) AS old_id(value)

  UNION ALL

  SELECT source.record_id, 'problem.eyes.12'
  FROM source_records AS source
  CROSS JOIN LATERAL jsonb_array_elements_text(source.old_ids) AS old_id(value)
  WHERE old_id.value = 'problem.eyes.1'
),
mapped_ids AS (
  SELECT expanded.record_id, catalog.id, catalog.sort_order
  FROM expanded_ids AS expanded
  JOIN catalog ON catalog.id = expanded.id
  GROUP BY expanded.record_id, catalog.id, catalog.sort_order
),
partially_cleaned_records AS (
  SELECT source.record_id
  FROM source_records AS source
  WHERE source.had_array IS DISTINCT FROM true

  UNION

  SELECT source.record_id
  FROM source_records AS source
  CROSS JOIN LATERAL jsonb_array_elements_text(source.old_ids) AS old_id(value)
  LEFT JOIN catalog ON catalog.id = CASE
    WHEN old_id.value = 'problem.eyes.11' THEN 'problem.eyes.10'
    ELSE old_id.value
  END
  GROUP BY source.record_id, CASE
    WHEN old_id.value = 'problem.eyes.11' THEN 'problem.eyes.10'
    ELSE old_id.value
  END
  HAVING count(*) > 1 OR count(catalog.id) = 0
),
migrated_records AS (
  SELECT
    source.record_id,
    COALESCE(
      (
        SELECT jsonb_agg(mapped.id ORDER BY mapped.sort_order)
        FROM mapped_ids AS mapped
        WHERE mapped.record_id = source.record_id
      ),
      '[]'::jsonb
    ) AS selected_ids
  FROM source_records AS source
),
updated_records AS (
  UPDATE medical_records AS record
  SET sections = jsonb_set(
    record.sections,
    '{what-happened,value,selectedIds}',
    migrated.selected_ids,
    true
  )
  FROM migrated_records AS migrated
  WHERE record.record_id = migrated.record_id
    AND record.sections #> '{what-happened,value,selectedIds}' IS DISTINCT FROM migrated.selected_ids
  RETURNING record.record_id
)
SELECT
  (SELECT count(*) FROM source_records) AS scanned_records,
  (SELECT count(*) FROM updated_records) AS changed_records,
  (SELECT count(DISTINCT record_id) FROM partially_cleaned_records) AS partially_cleaned_records;
