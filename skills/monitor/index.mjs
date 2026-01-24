#!/usr/bin/env node

/**
 * AO Task Monitor CLI
 * A dependency-free executable Node.js CLI for the AO Task Monitor service.
 */

const DEFAULT_BASE_URL = 'https://ao-task-monitor.onrender.com';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

const HELP_TEXT = `AO Monitor (monitor)

Usage:
  monitor <command> [args] [options]

Commands:
  summary                      System overview (/v1/summary)
  task <taskId>                Task summary (/v1/summary/:taskId)
  alerts                       Current alerts (/v1/alerts)
  logs [taskId]                Logs (all or for one task) (/v1/logs[/taskId])
  docs                         API docs markdown (/v1/docs)
  request <endpoint> [method] [jsonData]
                               Generic API request (GET/POST/PUT)

Global Options:
  --base-url <url>             API base URL
                               (default: https://ao-task-monitor.onrender.com)
  --token <token>              Override auth token (else uses AO_MONITOR_KEY)
  --timeout-ms <ms>            Request timeout in ms (default: 30000)
  --help, -h                   Show help

Summary/Task/Alerts Options (query params):
  --period <1h|4h|8h|24h|48h>   Time window
  --include <csv>              Fields to include (comma-separated)
  --format <json|text>         Response format (default: json)

Logs Options (query params):
  --limit <n>                  Max results (default: 100, max: 1000)
  --offset <n>                 Pagination offset (default: 0)
  --status <success|failure|timeout>
                               Filter by run status
  --error-type <string>        Filter by error substring (maps to errorType)
  --since <isoTimestamp>        Only logs after this time
  --until <isoTimestamp>        Only logs before this time
  --task-id <taskId>           Filter logs by taskId when using \`logs\` (no arg)

Authentication:
  This API requires a Bearer token. Set it via:
    export AO_MONITOR_KEY="YOUR_KEY_HERE"
  Or pass --token for a one-off command.

Examples:
  monitor summary --period 8h --include counts,kpis,latency
  monitor summary --format text
  monitor task ao-token-info --include state,kpis,runs --period 24h
  monitor alerts --period 8h
  monitor logs --limit 50
  monitor logs ao-token-info --status timeout --since "2026-01-24T00:00:00Z"
  monitor request /v1/summary GET
  monitor request /v1/api/agent POST '{"task_id":"123","status":"running"}'`;

const MISSING_TOKEN_MESSAGE = `Error: AO_MONITOR_KEY is not set.

Set your monitor key in your shell config, then reload it:

  # zsh
  echo 'export AO_MONITOR_KEY="YOUR_KEY_HERE"' >> ~/.zshrc
  source ~/.zshrc

  # bash
  echo 'export AO_MONITOR_KEY="YOUR_KEY_HERE"' >> ~/.bashrc
  source ~/.bashrc

Then run the agent/command again. It will be able to use the key from its environment.`;

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    command: null,
    positional: [],
    options: {
      baseUrl: DEFAULT_BASE_URL,
      token: process.env.AO_MONITOR_KEY || null,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      help: false,
      period: null,
      include: null,
      format: 'json',
      limit: DEFAULT_LIMIT,
      offset: 0,
      status: null,
      errorType: null,
      since: null,
      until: null,
      taskId: null,
    },
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.options.help = true;
      i++;
    } else if (arg === '--base-url' && i + 1 < args.length) {
      result.options.baseUrl = args[i + 1];
      i += 2;
    } else if (arg === '--token' && i + 1 < args.length) {
      result.options.token = args[i + 1];
      i += 2;
    } else if (arg === '--timeout-ms' && i + 1 < args.length) {
      result.options.timeoutMs = parseInt(args[i + 1], 10) || DEFAULT_TIMEOUT_MS;
      i += 2;
    } else if (arg === '--period' && i + 1 < args.length) {
      result.options.period = args[i + 1];
      i += 2;
    } else if (arg === '--include' && i + 1 < args.length) {
      result.options.include = args[i + 1];
      i += 2;
    } else if (arg === '--format' && i + 1 < args.length) {
      result.options.format = args[i + 1];
      i += 2;
    } else if (arg === '--limit' && i + 1 < args.length) {
      let limit = parseInt(args[i + 1], 10) || DEFAULT_LIMIT;
      if (limit > MAX_LIMIT) limit = MAX_LIMIT;
      if (limit < 1) limit = 1;
      result.options.limit = limit;
      i += 2;
    } else if (arg === '--offset' && i + 1 < args.length) {
      result.options.offset = parseInt(args[i + 1], 10) || 0;
      i += 2;
    } else if (arg === '--status' && i + 1 < args.length) {
      result.options.status = args[i + 1];
      i += 2;
    } else if (arg === '--error-type' && i + 1 < args.length) {
      result.options.errorType = args[i + 1];
      i += 2;
    } else if (arg === '--since' && i + 1 < args.length) {
      result.options.since = args[i + 1];
      i += 2;
    } else if (arg === '--until' && i + 1 < args.length) {
      result.options.until = args[i + 1];
      i += 2;
    } else if (arg === '--task-id' && i + 1 < args.length) {
      result.options.taskId = args[i + 1];
      i += 2;
    } else if (!arg.startsWith('-')) {
      if (result.command === null) {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
      i++;
    } else {
      // Unknown flag, skip
      i++;
    }
  }

  return result;
}

/**
 * Build query string from params object
 */
function buildQueryString(params) {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `?${qs}`;
}

/**
 * Make HTTP request using fetch (Node 18+) with fallback to https module
 */
async function makeRequest(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      signal: controller.signal,
    };

    if (options.body) {
      fetchOptions.body = options.body;
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      text,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { timeout: true, timeoutMs };
    }
    throw err;
  }
}

/**
 * Format and print error response
 */
function printError(response, options) {
  const { status, text } = response;

  let errorMessage = '';
  let errorCode = '';

  // Try to parse JSON error
  try {
    const json = JSON.parse(text);
    if (json.error) {
      errorMessage = json.error;
    }
    if (json.code) {
      errorCode = json.code;
    }
  } catch {
    // Not JSON, use truncated text
    errorMessage = text.length > 2048 ? text.slice(0, 2048) + '...' : text;
  }

  console.error(`Error: HTTP ${status}`);
  if (errorCode) {
    console.error(`Code: ${errorCode}`);
  }
  if (errorMessage) {
    console.error(`Message: ${errorMessage}`);
  }

  // Hint for auth errors
  if (status === 401 || status === 403) {
    console.error('\nHint: Check that AO_MONITOR_KEY is set correctly, or pass --token.');
  }
}

/**
 * Print response based on format
 */
function printResponse(response, format) {
  const { text, contentType } = response;

  // For text format or non-JSON content, print raw
  if (format === 'text' || !contentType.includes('application/json')) {
    console.log(text);
    return;
  }

  // Pretty print JSON
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    // Fallback to raw text if JSON parse fails
    console.log(text);
  }
}

/**
 * Require token or exit with error message
 */
function requireToken(options) {
  if (!options.token) {
    console.error(MISSING_TOKEN_MESSAGE);
    process.exit(1);
  }
  return options.token;
}

/**
 * Execute API request
 */
async function executeRequest(endpoint, method, body, options, requireAuth = true) {
  const token = requireAuth ? requireToken(options) : options.token;

  const url = `${options.baseUrl}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await makeRequest(url, {
    method,
    headers,
    body,
  }, options.timeoutMs);

  if (response.timeout) {
    console.error(`Request timed out after ${response.timeoutMs}ms`);
    process.exit(1);
  }

  if (!response.ok) {
    printError(response, options);
    process.exit(1);
  }

  return response;
}

/**
 * Command: summary
 */
async function commandSummary(options) {
  const params = {};
  if (options.period) params.period = options.period;
  if (options.include) params.include = options.include;
  if (options.format) params.format = options.format;

  const endpoint = `/v1/summary${buildQueryString(params)}`;
  const response = await executeRequest(endpoint, 'GET', null, options);
  printResponse(response, options.format);
}

/**
 * Command: task <taskId>
 */
async function commandTask(taskId, options) {
  if (!taskId) {
    console.error('Error: task command requires a taskId argument');
    console.error('Usage: monitor task <taskId> [options]');
    process.exit(1);
  }

  const params = {};
  if (options.period) params.period = options.period;
  if (options.include) params.include = options.include;
  if (options.format) params.format = options.format;

  const endpoint = `/v1/summary/${encodeURIComponent(taskId)}${buildQueryString(params)}`;
  const response = await executeRequest(endpoint, 'GET', null, options);
  printResponse(response, options.format);
}

/**
 * Command: alerts
 */
async function commandAlerts(options) {
  const params = {};
  if (options.period) params.period = options.period;
  if (options.format) params.format = options.format;

  const endpoint = `/v1/alerts${buildQueryString(params)}`;
  const response = await executeRequest(endpoint, 'GET', null, options);
  printResponse(response, options.format);
}

/**
 * Command: logs [taskId]
 */
async function commandLogs(taskId, options) {
  const params = {};
  if (options.limit) params.limit = options.limit;
  if (options.offset) params.offset = options.offset;
  if (options.status) params.status = options.status;
  if (options.errorType) params.errorType = options.errorType;
  if (options.since) params.since = options.since;
  if (options.until) params.until = options.until;
  if (options.taskId && !taskId) params.taskId = options.taskId;

  let endpoint;
  if (taskId) {
    endpoint = `/v1/logs/${encodeURIComponent(taskId)}${buildQueryString(params)}`;
  } else {
    endpoint = `/v1/logs${buildQueryString(params)}`;
  }

  const response = await executeRequest(endpoint, 'GET', null, options);
  printResponse(response, options.format);
}

/**
 * Command: docs
 */
async function commandDocs(options) {
  const endpoint = '/v1/docs';
  const response = await executeRequest(endpoint, 'GET', null, options);
  // Print raw markdown
  console.log(response.text);
}

/**
 * Command: request <endpoint> [method] [jsonData]
 */
async function commandRequest(positional, options) {
  const [endpoint, method = 'GET', jsonData] = positional;

  if (!endpoint) {
    console.error('Error: request command requires an endpoint argument');
    console.error('Usage: monitor request <endpoint> [method] [jsonData]');
    process.exit(1);
  }

  const upperMethod = method.toUpperCase();
  if (!['GET', 'POST', 'PUT'].includes(upperMethod)) {
    console.error(`Error: Invalid method "${method}". Supported: GET, POST, PUT`);
    process.exit(1);
  }

  let body = null;
  if (upperMethod === 'POST' || upperMethod === 'PUT') {
    if (!jsonData) {
      console.error(`Error: ${upperMethod} requests require JSON data`);
      console.error(`Usage: monitor request <endpoint> ${upperMethod} '<json>'`);
      process.exit(1);
    }
    try {
      // Validate JSON
      JSON.parse(jsonData);
      body = jsonData;
    } catch {
      console.error('Error: Invalid JSON data');
      process.exit(1);
    }
  }

  // Normalize endpoint to start with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const response = await executeRequest(normalizedEndpoint, upperMethod, body, options);
  printResponse(response, options.format);
}

/**
 * Main entry point
 */
async function main() {
  const parsed = parseArgs(process.argv);
  const { command, positional, options } = parsed;

  // Handle help flag or no command
  if (options.help || !command) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'summary':
        await commandSummary(options);
        break;

      case 'task':
        await commandTask(positional[0], options);
        break;

      case 'alerts':
        await commandAlerts(options);
        break;

      case 'logs':
        await commandLogs(positional[0], options);
        break;

      case 'docs':
        await commandDocs(options);
        break;

      case 'request':
        await commandRequest(positional, options);
        break;

      default:
        console.error(`Error: Unknown command "${command}"`);
        console.error('Run "monitor --help" for usage information.');
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
