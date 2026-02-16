/**
 * Proxy Configuration for onhyper.io
 * 
 * This module provides a proxy layer that routes API calls through onhyper.io
 * to the Scout Atoms API. In production, this abstracts the API key away from
 * the frontend bundle - the key is stored as a secret in onhyper and injected
 * server-side.
 * 
 * Architecture:
 * ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
 * │  Frontend   │────▶│    onhyper.io   │────▶│  Scout Atoms    │
 * │  (browser)  │     │  /proxy/scout   │     │  api.scoutos.com│
 * └─────────────┘     └─────────────────┘     └─────────────────┘
 *                            │
 *                     Injects API key
 *                     from stored secret
 * 
 * Environment Modes:
 * - Development: Direct API calls with VITE_SCOUT_API_KEY
 * - Production: Proxy through onhyper.io (API key managed server-side)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Check if running in development mode
 * Vite sets import.meta.env.DEV during development
 */
const IS_DEV = import.meta.env.DEV

/**
 * Scout API endpoints
 */
const SCOUT_DIRECT_ENDPOINT = 'https://api.scoutos.com/atoms'

/**
 * onhyper proxy configuration
 * The proxy endpoint forwards requests to Scout with the stored API key
 */
const ONHYPER_PROXY_CONFIG = {
  /** Base URL for onhyper proxy */
  baseUrl: 'https://onhyper.io',
  
  /** Proxy path for Scout Atoms API */
  proxyPath: '/proxy/scout-atoms',
  
  /** Full proxy endpoint URL */
  get endpoint() {
    return `${this.baseUrl}${this.proxyPath}`
  }
} as const

/**
 * API key for development mode
 * In production, this should be undefined (key is managed by onhyper)
 */
const DEV_API_KEY = import.meta.env.VITE_SCOUT_API_KEY

/**
 * App slug for X-App-Slug header
 * Set via setAppSlug() before making API calls in production
 */
let appSlug: string | null = null

// ============================================================================
// PROXY CONFIGURATION TYPE
// ============================================================================

/**
 * Configuration returned by getProxyConfig()
 */
export interface ProxyConfig {
  /** The endpoint URL to use */
  endpoint: string
  
  /** Headers to include in the request */
  headers: Record<string, string>
  
  /** Whether using direct API or proxy */
  mode: 'direct' | 'proxy'
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Set the app slug for proxy requests
 * Required when running in production mode
 * 
 * @param slug - The app slug from onhyper deployment
 * 
 * @example
 * // Call this once when your app initializes
 * setAppSlug('my-awesome-app')
 */
export function setAppSlug(slug: string): void {
  appSlug = slug
}

/**
 * Get the current app slug
 */
export function getAppSlug(): string | null {
  return appSlug
}

/**
 * Check if using proxy mode
 * Returns true in production, false in development
 */
export function isProxyMode(): boolean {
  return !IS_DEV
}

/**
 * Get proxy configuration for the current environment
 * 
 * In development:
 * - Returns direct Scout endpoint with Authorization header (API key from env)
 * 
 * In production:
 * - Returns onhyper proxy endpoint with X-App-Slug header
 * - API key is NOT included (onhyper adds it server-side)
 * 
 * @throws Error if in production mode and app slug is not set
 */
export function getProxyConfig(): ProxyConfig {
  if (IS_DEV) {
    // Development mode: direct API calls with key from environment
    return {
      endpoint: SCOUT_DIRECT_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEV_API_KEY || ''}`,
      },
      mode: 'direct',
    }
  }
  
  // Production mode: proxy through onhyper
  if (!appSlug) {
    console.warn(
      'App slug not set. Call setAppSlug() with your onhyper app slug ' +
      'before making API calls in production.'
    )
  }
  
  return {
    endpoint: ONHYPER_PROXY_CONFIG.endpoint,
    headers: {
      'Content-Type': 'application/json',
      // X-App-Slug header tells onhyper which app's secret to use
      ...(appSlug ? { 'X-App-Slug': appSlug } : {}),
    },
    mode: 'proxy',
  }
}

/**
 * Build full proxy URL for a given path
 * Useful for constructing URLs for different Scout endpoints
 * 
 * @param path - Path to append to the proxy base (e.g., '/atoms')
 * @returns Full URL through the proxy
 * 
 * @example
 * const url = buildProxyUrl('/atoms')
 * // Production: 'https://onhyper.io/proxy/scout-atoms/atoms'
 * // Development: 'https://api.scoutos.com/atoms'
 */
export function buildProxyUrl(path: string = '/atoms'): string {
  if (IS_DEV) {
    return `${SCOUT_DIRECT_ENDPOINT}${path !== '/atoms' ? path : ''}`
  }
  return `${ONHYPER_PROXY_CONFIG.endpoint}${path}`
}

/**
 * Create headers for Scout API request
 * Convenience function that wraps getProxyConfig().headers
 * 
 * @returns Headers object for fetch()
 */
export function createProxyHeaders(): Record<string, string> {
  return getProxyConfig().headers
}

// ============================================================================
// ENVIRONMENT HELPERS
// ============================================================================

/**
 * Get the Scout API key (development only)
 * Returns undefined in production mode
 * 
 * @deprecated Use getProxyConfig() instead
 */
export function getDevApiKey(): string | undefined {
  if (IS_DEV) {
    return DEV_API_KEY
  }
  return undefined
}

/**
 * Check if a development API key is configured
 */
export function hasDevApiKey(): boolean {
  return IS_DEV && !!DEV_API_KEY
}

// ============================================================================
// ROUTES MAP (for documentation/reference)
// ============================================================================

/**
 * Route definitions for Scout API through onhyper proxy
 * 
 * These routes are mapped by onhyper to forward requests:
 * 
 * Frontend Request              →  Scout API Destination
 * ────────────────────────────────────────────────────────────
 * /proxy/scout-atoms/atoms      →  https://api.scoutos.com/atoms
 * /proxy/scout-atoms/atoms/:id  →  https://api.scoutos.com/atoms/:id
 * 
 * The proxy injects these headers before forwarding:
 * - Authorization: Bearer <stored-api-key>
 * 
 * The frontend sends:
 * - X-App-Slug: <app-slug> (to identify which secret to use)
 */
export const PROXY_ROUTES = {
  /** Main atoms endpoint */
  atoms: '/proxy/scout-atoms/atoms',
  
  /** Single atom by ID */
  atomById: (id: string) => `/proxy/scout-atoms/atoms/${id}`,
  
  /** Direct Scout endpoint (for reference) */
  directEndpoint: 'https://api.scoutos.com/atoms',
  
  /** onhyper proxy base */
  proxyBase: ONHYPER_PROXY_CONFIG.baseUrl,
} as const

// ============================================================================
// LEGACY EXPORT (compatibility)
// ============================================================================

/**
 * Direct API endpoint for backward compatibility
 * @deprecated Use getProxyConfig().endpoint instead
 */
export const SCOUT_ENDPOINT = IS_DEV 
  ? SCOUT_DIRECT_ENDPOINT 
  : ONHYPER_PROXY_CONFIG.endpoint