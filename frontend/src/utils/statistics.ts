// Statistical computation utilities for selection analysis

export interface FieldStats {
  field: string;
  type: 'boolean' | 'numeric' | 'categorical';

  // Boolean fields
  trueCount?: number;
  falseCount?: number;
  truePercent?: number;
  falsePercent?: number;

  // Numeric fields
  min?: number;
  max?: number;
  mean?: number;

  // Categorical fields
  categories?: Array<{
    value: string;
    count: number;
    percent: number;
  }>;
}

/**
 * Infer field type from sample values
 */
function inferFieldType(values: (string | number | boolean)[]): 'boolean' | 'numeric' | 'categorical' {
  // Check first non-null value
  for (const val of values) {
    if (val !== null && val !== undefined) {
      if (typeof val === 'boolean') return 'boolean';
      if (typeof val === 'number') return 'numeric';
      return 'categorical';
    }
  }
  return 'categorical'; // Default fallback
}

/**
 * Compute statistics for a boolean field
 */
function computeBooleanStats(field: string, values: boolean[]): FieldStats {
  const trueCount = values.filter(v => v === true).length;
  const falseCount = values.filter(v => v === false).length;
  const total = trueCount + falseCount;

  return {
    field,
    type: 'boolean',
    trueCount,
    falseCount,
    truePercent: total > 0 ? Math.round((trueCount / total) * 100) : 0,
    falsePercent: total > 0 ? Math.round((falseCount / total) * 100) : 0,
  };
}

/**
 * Compute statistics for a numeric field
 */
function computeNumericStats(field: string, values: number[]): FieldStats {
  const validValues = values.filter(v => typeof v === 'number' && !isNaN(v));

  if (validValues.length === 0) {
    return {
      field,
      type: 'numeric',
      min: 0,
      max: 0,
      mean: 0,
    };
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const sum = validValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / validValues.length;

  return {
    field,
    type: 'numeric',
    min,
    max,
    mean,
  };
}

/**
 * Compute statistics for a categorical field
 */
function computeCategoricalStats(field: string, values: (string | number)[]): FieldStats {
  const counts = new Map<string, number>();

  for (const val of values) {
    const key = String(val);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const total = values.length;
  const categories = Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      count,
      percent: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count); // Sort by count descending

  return {
    field,
    type: 'categorical',
    categories,
  };
}

/**
 * Compute statistics for all metadata fields in the selected subset
 */
export function computeSelectionStats(
  metadata: Record<string, (string | number | boolean)[]>,
  selectedIndices: Set<number>
): FieldStats[] {
  if (selectedIndices.size === 0) {
    return [];
  }

  const stats: FieldStats[] = [];

  for (const [field, allValues] of Object.entries(metadata)) {
    // Extract values for selected indices only
    const selectedValues = Array.from(selectedIndices)
      .map(idx => allValues[idx])
      .filter(v => v !== null && v !== undefined);

    if (selectedValues.length === 0) continue;

    // Infer type and compute appropriate stats
    const type = inferFieldType(selectedValues);

    if (type === 'boolean') {
      stats.push(computeBooleanStats(field, selectedValues as boolean[]));
    } else if (type === 'numeric') {
      stats.push(computeNumericStats(field, selectedValues as number[]));
    } else {
      stats.push(computeCategoricalStats(field, selectedValues as (string | number)[]));
    }
  }

  return stats;
}
