/**
 * Scout Atoms API Service
 * 
 * Handles communication with the Scout Atoms API.
 * Uses Server-Sent Events (SSE) for streaming atom responses.
 * 
 * Architecture:
 * - Development: Direct calls to api.scoutos.com with API key from env
 * - Production: Proxied through onhyper.io (API key managed server-side)
 * 
 * API Documentation:
 * - Endpoint: https://api.scoutos.com/atoms (dev) or https://onhyper.io/proxy/scout-atoms/atoms (prod)
 * - Method: POST
 * - Response: SSE stream with atom, cache_complete, done, and error events
 * 
 * Usage:
 * ```typescript
 * // Initialize app slug in production
 * import { setAppSlug } from './proxy'
 * setAppSlug('your-app-slug')
 * 
 * const atoms = await fetchAtoms(`
 *   Show me a contact named John Doe
 *   Create a task to review the proposal
 * `)
 * ```
 */

import type { 
  SupportedAtom,
  ScoutEventType 
} from '../schemas'

import {
  getProxyConfig,
  isProxyMode,
  type ProxyConfig,
} from './proxy'

// ============================================================================
// SSE PARSER
// ============================================================================

/**
 * Parse SSE text into events
 * Handles multi-line data and event type prefixes
 */
function parseSSE(text: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = []
  let currentEvent: { event: string; data: string } | null = null

  const lines = text.split('\n')
  
  for (const line of lines) {
    if (line.startsWith('event:')) {
      // Start a new event
      if (currentEvent) {
        events.push(currentEvent)
      }
      currentEvent = {
        event: line.substring(6).trim(),
        data: '',
      }
    } else if (line.startsWith('data:')) {
      // Add data to current event
      if (currentEvent) {
        const dataLine = line.substring(5).trim()
        currentEvent.data = currentEvent.data 
          ? currentEvent.data + '\n' + dataLine 
          : dataLine
      } else {
        // Event without explicit event type
        currentEvent = {
          event: 'message',
          data: line.substring(5).trim(),
        }
      }
    } else if (line === '' && currentEvent) {
      // Empty line signals end of event
      events.push(currentEvent)
      currentEvent = null
    }
  }

  // Don't forget the last event if text doesn't end with newline
  if (currentEvent) {
    events.push(currentEvent)
  }

  return events
}

// ============================================================================
// API CLIENT
// ============================================================================

/**
 * Options for fetchAtoms
 */
export interface FetchAtomsOptions {
  /** Prompt describing what atoms to generate */
  prompt: string
  
  /** Optional timeout in milliseconds */
  timeout?: number
  
  /** Callback for each atom received (enables streaming) */
  onAtom?: (atom: SupportedAtom) => void
  
  /** Callback for cache_complete event */
  onCacheComplete?: () => void
  
  /** Callback for errors */
  onError?: (error: Error) => void
  
  /** Optional proxy config override (for testing) */
  proxyConfig?: ProxyConfig
}

/**
 * Fetch atoms from Scout API
 * 
 * Routes through the proxy layer which handles:
 * - Development: Direct API calls with key from VITE_SCOUT_API_KEY
 * - Production: Proxy through onhyper.io with server-side key injection
 * 
 * Returns a promise that resolves when the SSE stream completes.
 * Supports both batch and streaming modes via callbacks.
 * 
 * @example
 * // Batch mode - get all atoms at once
 * const atoms = await fetchAtoms('Create 2 contacts')
 * 
 * @example
 * // Streaming mode - process atoms as they arrive
 * await fetchAtoms({
 *   prompt: 'Create a contact',
 *   onAtom: (atom) => console.log('Got atom:', atom)
 * })
 */
export async function fetchAtoms(
  promptOrOptions: string | FetchAtomsOptions
): Promise<SupportedAtom[]> {
  const options: FetchAtomsOptions = typeof promptOrOptions === 'string'
    ? { prompt: promptOrOptions }
    : promptOrOptions

  const { prompt, onAtom, onCacheComplete, onError, proxyConfig } = options

  // Get proxy config (uses env variables in dev, onhyper in prod)
  const config = proxyConfig || getProxyConfig()
  
  if (isProxyMode() && !config.headers['X-App-Slug']) {
    console.warn(
      '[Scout API] Running in production mode without X-App-Slug header. ' +
      'Make sure to call setAppSlug() during app initialization.'
    )
  }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        prompt,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw new Error(
        `Scout API error: ${response.status} ${response.statusText} - ${errorText}`
      )
    }

    // Parse SSE stream
    const text = await response.text()
    const events = parseSSE(text)
    
    const atoms: SupportedAtom[] = []

    for (const { event, data } of events) {
      switch (event as ScoutEventType) {
        case 'atom':
          try {
            const parsed = JSON.parse(data)
            const atom = parsed.atom || parsed
            
            // Validate atom structure
            if (atom.id && atom.type) {
              if (atom.type === 'contact' || atom.type === 'task') {
                const typedAtom = atom as SupportedAtom
                atoms.push(typedAtom)
                onAtom?.(typedAtom)
              }
            }
          } catch (e) {
            console.warn('Failed to parse atom data:', data, e)
          }
          break
          
        case 'cache_complete':
          onCacheComplete?.()
          break
          
        case 'done':
          // Stream complete
          break
          
        case 'error':
          const errorMsg = data || 'Unknown error from Scout API'
          const error = new Error(errorMsg)
          onError?.(error)
          throw error
          
        default:
          // Ignore unknown events
          break
      }
    }

    return atoms
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    onError?.(err)
    throw err
  }
}

/**
 * Create demo atoms for testing
 * These simulate what Scout API would return
 */
export function createDemoAtoms(): SupportedAtom[] {
  return [
    {
      id: 'contact-1',
      type: 'contact',
      data: {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        company: 'Acme Corp',
        status: 'active',
        avatar: undefined,
      },
      created_at: new Date().toISOString(),
    },
    {
      id: 'contact-2',
      type: 'contact',
      data: {
        name: 'Bob Smith',
        email: 'bob.smith@techstart.io',
        company: 'TechStart Inc',
        status: 'pending',
      },
      created_at: new Date().toISOString(),
    },
    {
      id: 'task-1',
      type: 'task',
      data: {
        title: 'Review Q1 budget proposal',
        dueDate: '2024-02-20',
        priority: 'high',
        completed: false,
        assignee: 'Alice Johnson',
      },
      created_at: new Date().toISOString(),
    },
    {
      id: 'task-2',
      type: 'task',
      data: {
        title: 'Schedule team sync meeting',
        dueDate: '2024-02-18',
        priority: 'medium',
        completed: true,
      },
      created_at: new Date().toISOString(),
    },
    {
      id: 'task-3',
      type: 'task',
      data: {
        title: 'Update documentation',
        dueDate: '2024-02-25',
        priority: 'low',
        completed: false,
        assignee: 'Bob Smith',
      },
      created_at: new Date().toISOString(),
    },
  ]
}

/**
 * Fetch demo atoms from Scout API with a sample prompt
 * Falls back to local demo data if API fails
 */
export async function fetchDemoAtoms(): Promise<SupportedAtom[]> {
  try {
    const atoms = await fetchAtoms(
      'Generate 2 sample contacts and 3 sample tasks for a CRM demo'
    )
    return atoms.length > 0 ? atoms : createDemoAtoms()
  } catch (error) {
    console.warn('Scout API unavailable, using demo data:', error)
    return createDemoAtoms()
  }
}

// Re-export proxy utilities for convenience
export { setAppSlug, getProxyConfig, isProxyMode } from './proxy'