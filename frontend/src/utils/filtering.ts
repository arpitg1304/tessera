// Metadata filtering utilities

export interface MetadataFilter {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number | boolean | (string | number)[];
}

/**
 * Evaluate a single filter against a value
 */
function evaluateFilter(
  value: string | number | boolean,
  filter: MetadataFilter
): boolean {
  const { operator, value: filterValue } = filter;

  switch (operator) {
    case 'equals':
      return value === filterValue;

    case 'not_equals':
      return value !== filterValue;

    case 'in':
      if (Array.isArray(filterValue)) {
        return filterValue.includes(value as string | number);
      }
      return false;

    case 'gt':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value > filterValue;
      }
      return false;

    case 'lt':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value < filterValue;
      }
      return false;

    case 'gte':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value >= filterValue;
      }
      return false;

    case 'lte':
      if (typeof value === 'number' && typeof filterValue === 'number') {
        return value <= filterValue;
      }
      return false;

    default:
      return true;
  }
}

/**
 * Apply all filters to metadata and return indices that pass
 * Returns Set of indices that pass ALL filters (AND logic)
 * Empty Set means no filtering (show all)
 */
export function applyFilters(
  metadata: Record<string, (string | number | boolean)[]>,
  filters: MetadataFilter[],
  episodeCount: number
): Set<number> {
  // No filters = no filtering
  if (filters.length === 0) {
    return new Set();
  }

  const passedIndices = new Set<number>();

  // Check each episode
  for (let idx = 0; idx < episodeCount; idx++) {
    let passesAll = true;

    // Episode must pass ALL filters (AND logic)
    for (const filter of filters) {
      const fieldValues = metadata[filter.field];
      if (!fieldValues) {
        passesAll = false;
        break;
      }

      const value = fieldValues[idx];
      if (value === null || value === undefined) {
        passesAll = false;
        break;
      }

      if (!evaluateFilter(value, filter)) {
        passesAll = false;
        break;
      }
    }

    if (passesAll) {
      passedIndices.add(idx);
    }
  }

  return passedIndices;
}

/**
 * Get available operators for a field type
 */
export function getOperatorsForType(fieldType: 'boolean' | 'numeric' | 'string'): MetadataFilter['operator'][] {
  switch (fieldType) {
    case 'boolean':
      return ['equals', 'not_equals'];
    case 'numeric':
      return ['equals', 'not_equals', 'gt', 'lt', 'gte', 'lte'];
    case 'string':
      return ['equals', 'not_equals', 'in'];
    default:
      return ['equals', 'not_equals'];
  }
}

/**
 * Infer field type from metadata values
 */
export function inferFieldType(values: (string | number | boolean)[]): 'boolean' | 'numeric' | 'string' {
  for (const val of values) {
    if (val !== null && val !== undefined) {
      if (typeof val === 'boolean') return 'boolean';
      if (typeof val === 'number') return 'numeric';
      return 'string';
    }
  }
  return 'string';
}
