---
name: spa-builder
description: Build Single Page Applications using Scout Atoms + json-render + onhyper deployment stack. Creates Vite-based React apps with SSE streaming, component catalogs, and one-command deployment to onhyper.io. Triggers: (1) Creating new SPAs with AI-powered content generation, (2) Building component catalogs with atom schemas, (3) Deploying single-file HTML apps to onhyper.io, (4) Setting up Scout API integration with proxy layer, (5) Working with SSE streaming patterns.
---

# SPA Builder

An end-to-end toolchain for building Single Page Applications powered by Scout Atoms API. Generate structured content with AI, render it through a component catalog, and deploy as a single HTML file to onhyper.io.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SPA Builder Stack                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Scout Atoms API ────────▶ Component Catalog ────────▶ json-render     │
│   (AI content gen)          (component schemas)          (React render) │
│                                                                          │
│                              ▼                                           │
│                         Vite Build                                       │
│                     (single HTML output)                                 │
│                              ▼                                           │
│                        onhyper.io                                        │
│                    (deployment + secrets)                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Scout Atoms Integration**: SSE-streaming API for AI-powered content generation
- **Component Catalog**: Zod-validated component schemas with prop definitions
- **json-render**: Declarative JSON-to-React rendering engine
- **Proxy Layer**: Development vs production API routing (no hardcoded keys in prod!)
- **Single-File Build**: Outputs one HTML file with all assets inlined
- **onhyper Deployment**: One-command deploy with server-side secret management

## Quick Start

```bash
# Create a new SPA project
spa-builder create my-app

# Navigate to project
cd my-app

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production (outputs single HTML)
npm run build

# Deploy to onhyper.io
spa-builder deploy my-app
```

## Commands

### `spa-builder create <project-name>`

Create a new SPA project from the Vite template.

**Arguments:**
- `project-name` - Name for the new project directory

**Options:**
- `--path <dir>` - Target directory (default: current directory)

**Example:**
```bash
# Create in current directory
spa-builder create my-crm

# Create in specific location
spa-builder create my-crm --path ~/projects/

# This creates:
# my-crm/
# ├── src/
# │   ├── components/      # Component catalog + implementations
# │   ├── schemas/         # Atom type definitions
# │   ├── services/        # Scout API + proxy layer
# │   └── App.tsx          # Main app with render registry
# ├── package.json
# ├── vite.config.ts       # Configured for single-file output
# └── .env.example
```

---

### `spa-builder add component <name>`

Add a new component to the catalog.

**Arguments:**
- `name` - Component name (PascalCase)

**Options:**
- `--props <schema>` - JSON schema for props (or interactive prompts)

**Example:**
```bash
# Add a Button component
spa-builder add component Button

# Add with props definition
spa-builder add component Badge --props '{"text":"string","variant":"primary|secondary"}'

# This creates:
# - src/components/catalog.ts (updated with new schema)
# - src/components/catalog-components.tsx (updated with implementation)
```

---

### `spa-builder add schema <name>`

Add a new atom schema definition.

**Arguments:**
- `name` - Schema/atom type name (camelCase)

**Example:**
```bash
# Add a Note atom schema
spa-builder add schema note

# This updates:
# - src/schemas/index.ts (with NoteAtom interface + mapping)
# - src/components/catalog.ts (with NoteItem component schema)
```

---

### `spa-builder build`

Build the SPA to a single HTML file.

**Options:**
- `--out <file>` - Output filename (default: `dist/index.html`)
- `--minify` - Minify output (default: true)

**Example:**
```bash
# Build to dist/index.html
spa-builder build

# Or use npm script
npm run build
```

---

### `spa-builder deploy <app-slug>`

Deploy the built SPA to onhyper.io.

**Arguments:**
- `app-slug` - URL slug for the deployed app (e.g., `my-app` → `my-app.onhyper.io`)

**Prerequisites:**
1. Built the project (`spa-builder build`)
2. Set `ONHYPER_EMAIL` and `ONHYPER_PASSWORD` environment variables

**Example:**
```bash
# Deploy to my-app.onhyper.io
spa-builder deploy my-app

# With explicit auth
ONHYPER_EMAIL=user@example.com ONHYPER_PASSWORD=secret spa-builder deploy my-app
```

## onhyper.io Deployment Details

### Authentication

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}

# Response:
{
  "token": "jwt-token-here",
  "user": { ... }
}
```

Store the JWT token for subsequent requests.

### Create App

```bash
POST /api/apps
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "slug": "my-app",
  "name": "My Awesome App",
  "html": "<html>...</html>",
  "css": "/* styles */",
  "js": "// scripts"
}
```

### Store Secrets

```bash
POST /api/secrets
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "appId": "<app-id>",
  "name": "scout-atoms",    # This name is used by the proxy
  "value": "scout-api-key-here"
}
```

The proxy endpoint reads this secret server-side and injects it into requests to Scout API.

### Publish App

```bash
POST /api/apps/:id/publish
Authorization: Bearer <jwt-token>
```

App becomes available at `https://<slug>.onhyper.io`

## Proxy Layer Architecture

The SPA uses environment-aware routing for API calls:

```
Development Mode:
┌─────────────┐
│  Frontend   │────── Scout API ──────▶ api.scoutos.com
│  (browser)  │        (with API key from VITE_SCOUT_API_KEY)
└─────────────┘

Production Mode:
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Frontend   │────▶│    onhyper.io   │────▶│  Scout Atoms    │
│  (browser)  │     │  /proxy/scout   │     │  api.scoutos.com│
└─────────────┘     └─────────────────┘     └─────────────────┘
                            │
                     Injects API key
                     from stored secret
```

**Key Security Feature**: No API keys in the production bundle! The key is stored on onhyper and injected server-side.

### Template Files

The skill includes a complete Vite template in `templates/vite-template/`:

| File | Purpose |
|------|---------|
| `src/services/proxy.ts` | Environment-aware API routing |
| `src/services/scout.ts` | SSE streaming client for Scout API |
| `src/schemas/index.ts` | Atom type definitions (Contact, Task, etc.) |
| `src/components/catalog.ts` | json-render component schemas |
| `src/components/catalog-components.tsx` | React component implementations |
| `vite.config.ts` | Configured with `vite-plugin-singlefile` |

### Environment Variables

| Variable | Mode | Description |
|----------|------|-------------|
| `VITE_SCOUT_API_KEY` | Development | Direct Scout API key |
| `ONHYPER_EMAIL` | Deployment | onhyper account email |
| `ONHYPER_PASSWORD` | Deployment | onhyper account password |

## Component Catalog

Components are defined with Zod schemas and map to Scout atom types:

```typescript
// catalog.ts
export const catalog = schema.createCatalog({
  components: {
    ContactCard: {
      props: ContactCardPropsSchema,
      description: 'Displays contact info from Scout Contact atoms',
    },
    TaskItem: {
      props: TaskItemPropsSchema,
      description: 'Displays task info from Scout Task atoms',
    },
  },
})
```

The schema-to-atom mapping ensures type-safe rendering:

| Atom Type | Component | Mapping |
|-----------|-----------|---------|
| `ContactAtom` | `ContactCard` | `toContactCardProps(atom)` |
| `TaskAtom` | `TaskItem` | `toTaskItemProps(atom)` |

## References

- `templates/vite-template/` - Complete project template
- `templates/vite-template/src/services/proxy.ts` - Proxy implementation
- `templates/vite-template/src/schemas/index.ts` - Atom schema definitions