/**
 * Arweave GraphQL Client
 * 
 * Queries Arweave transactions using the GraphQL endpoint.
 * Supports filtering by IDs, owners, recipients, tags, and block heights.
 * Handles cursor-based pagination transparently.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface QueryParams {
  ids?: string[];
  owners?: string[];
  recipients?: string[];
  tags?: { name: string; values: string[] }[];
  blockMin?: number;
  blockMax?: number;
  sort?: 'HEIGHT_DESC' | 'HEIGHT_ASC';
  limit?: number; // Default: 10, pass 0 for all
  endpointOverride?: string;
}

export interface Transaction {
  id: string;
  owner: { address: string; key: string };
  recipient: string;
  fee: { winston: string; ar: string };
  quantity: { winston: string; ar: string };
  data: { size: string; type: string };
  tags: { name: string; value: string }[];
  block?: { id: string; timestamp: number; height: number; previous: string };
}

interface GraphQLResponse {
  data?: {
    transactions?: {
      edges: {
        node: Transaction;
        cursor: string;
      }[];
      pageInfo: {
        hasNextPage: boolean;
      };
    };
  };
  errors?: { message: string }[];
}

// ============================================================================
// Constants
// ============================================================================

const GRAPHQL_ENDPOINTS = [
  'https://arweave.net/graphql',
  'https://arweave-search.goldsky.com/graphql',
  'https://arweave.net/graphql'
];
const PAGE_SIZE = 100; // GraphQL returns max 100 per page
const DEFAULT_LIMIT = 10;
const SAFETY_MAX_LIMIT = 10000;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds per request

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Builds a GraphQL query string from query parameters.
 */
function buildGraphQLQuery(params: QueryParams, after?: string): string {
  const filters: string[] = [];

  // IDs filter
  if (params.ids && params.ids.length > 0) {
    const idsArray = params.ids.map(id => `"${id}"`).join(', ');
    filters.push(`ids: [${idsArray}]`);
  }

  // Owners filter
  if (params.owners && params.owners.length > 0) {
    const ownersArray = params.owners.map(owner => `"${owner}"`).join(', ');
    filters.push(`owners: [${ownersArray}]`);
  }

  // Recipients filter
  if (params.recipients && params.recipients.length > 0) {
    const recipientsArray = params.recipients.map(recipient => `"${recipient}"`).join(', ');
    filters.push(`recipients: [${recipientsArray}]`);
  }

  // Tags filter (AND logic)
  if (params.tags && params.tags.length > 0) {
    const tagsArray = params.tags.map(tag => {
      const valuesArray = tag.values.map(v => `"${v}"`).join(', ');
      return `{ name: "${tag.name}", values: [${valuesArray}] }`;
    }).join(', ');
    filters.push(`tags: [${tagsArray}]`);
  }

  // Block height range
  if (params.blockMin !== undefined || params.blockMax !== undefined) {
    const blockFilters: string[] = [];
    if (params.blockMin !== undefined) {
      blockFilters.push(`min: ${params.blockMin}`);
    }
    if (params.blockMax !== undefined) {
      blockFilters.push(`max: ${params.blockMax}`);
    }
    filters.push(`block: { ${blockFilters.join(', ')} }`);
  }

  // Sort order
  const sort = params.sort || 'HEIGHT_DESC';

  // Pagination cursor
  const afterClause = after ? `, after: "${after}"` : '';

  // Build the query
  const filtersClause = filters.length > 0 ? filters.join(', ') + ', ' : '';

  return `
    query {
      transactions(
        ${filtersClause}sort: ${sort},
        first: ${PAGE_SIZE}${afterClause}
      ) {
        edges {
          cursor
          node {
            id
            owner {
              address
              key
            }
            recipient
            fee {
              winston
              ar
            }
            quantity {
              winston
              ar
            }
            data {
              size
              type
            }
            tags {
              name
              value
            }
            block {
              id
              timestamp
              height
              previous
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;
}

// ============================================================================
// Network Utilities
// ============================================================================

/**
 * Wraps a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Executes a GraphQL query with automatic fallback across multiple endpoints.
 * 
 * @param query The GraphQL query string
 * @param endpointOverride Optional specific endpoint to use (bypasses fallback)
 * @returns The GraphQL response
 */
async function executeGraphQLQueryWithFallback(query: string, endpointOverride?: string): Promise<GraphQLResponse> {
  const endpoints = endpointOverride ? [endpointOverride] : GRAPHQL_ENDPOINTS;
  const errors: Array<{ endpoint: string; error: string }> = [];

  for (const endpoint of endpoints) {
    try {
      const response = await withTimeout(
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        }),
        REQUEST_TIMEOUT_MS,
        'GraphQL query'
      );

      if (!response.ok) {
        throw new Error(`GraphQL request failed: HTTP ${response.status} ${response.statusText}`);
      }

      const json: unknown = await response.json();

      // Validate response shape
      if (typeof json !== 'object' || json === null) {
        throw new Error('Invalid GraphQL response: expected object');
      }

      return json as GraphQLResponse;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ endpoint, error: errorMsg });
      // Continue to next endpoint
      continue;
    }
  }

  // All endpoints failed - include details from all attempts
  const errorSummary = errors.map(e => `${e.endpoint}: ${e.error}`).join('; ');
  throw new Error(`Failed to query Arweave GraphQL. Tried ${endpoints.length} endpoint(s): ${errorSummary}`);
}

// ============================================================================
// Main Query Function
// ============================================================================

/**
 * Queries Arweave transactions using the GraphQL endpoint.
 * 
 * Handles pagination transparently and shows progress to stderr.
 * 
 * @param params Query parameters (filters, sorting, limit)
 * @returns Array of transactions matching the query
 */
export async function queryTransactions(params: QueryParams): Promise<Transaction[]> {
  const results: Transaction[] = [];
  const limit = params.limit ?? DEFAULT_LIMIT;
  const fetchAll = limit === 0;
  const maxResults = fetchAll ? SAFETY_MAX_LIMIT : limit;

  let currentPage = 1;
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore && results.length < maxResults) {
    // Build and execute query
    const query = buildGraphQLQuery(params, cursor);
    const response = await executeGraphQLQueryWithFallback(query, params.endpointOverride);

    // Check for GraphQL errors
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors.map(e => e.message).join('; ');
      throw new Error(`GraphQL error: ${errorMessages}`);
    }

    // Validate response structure
    if (!response.data?.transactions) {
      throw new Error('Invalid GraphQL response: missing transactions data');
    }

    const { edges, pageInfo } = response.data.transactions;

    // Extract transactions from edges (filter out any null/undefined edges)
    const transactions = edges
      .filter((edge): edge is { node: Transaction; cursor: string } => 
        edge != null && edge.node != null
      )
      .map(edge => edge.node);

    // Add to results (respecting the limit)
    const remainingSlots = maxResults - results.length;
    const toAdd = transactions.slice(0, remainingSlots);
    results.push(...toAdd);

    // Progress feedback to stderr
    console.error(`Fetching page ${currentPage}... (found ${results.length} transactions so far)`);

    // Check if we should continue
    hasMore = pageInfo.hasNextPage && results.length < maxResults;

    if (hasMore && edges.length > 0) {
      // Update cursor for next page
      cursor = edges[edges.length - 1].cursor;
      currentPage++;
    } else {
      hasMore = false;
    }

    // Safety check: prevent infinite loops
    if (currentPage > 100) {
      console.error('Warning: Reached maximum page limit (100 pages). Stopping pagination.');
      break;
    }
  }

  // Final summary to stderr
  if (fetchAll && results.length === SAFETY_MAX_LIMIT) {
    console.error(`Reached safety limit of ${SAFETY_MAX_LIMIT} transactions.`);
  }

  return results;
}
