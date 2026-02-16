import { useState, useEffect } from 'react'
import './App.css'
import { defineRegistry, Renderer, type Spec } from '@json-render/react'
import { catalog } from './components/catalog'
import { Card, Metric, Button, ContactCard, TaskItem } from './components/catalog-components'
import type { 
  SupportedAtom
} from './schemas'
import { 
  isContactAtom, 
  isTaskAtom,
  toContactCardProps,
  toTaskItemProps
} from './schemas'
import { 
  fetchDemoAtoms, 
  createDemoAtoms 
} from './services/scout'

// ============================================================================
// COMPONENT REGISTRY
// ============================================================================

const { registry } = defineRegistry(catalog, {
  components: {
    Card: ({ props, children }) => (
      <Card title={props.title}>{children}</Card>
    ),
    Metric: ({ props }) => (
      <Metric 
        label={props.label} 
        value={props.value} 
        format={props.format} 
      />
    ),
    Button: ({ props }) => (
      <Button 
        label={props.label} 
        action={props.action} 
      />
    ),
    // Scout Atom components
    ContactCard: ({ props }) => (
      <ContactCard 
        name={props.name}
        email={props.email}
        company={props.company}
        status={props.status}
        avatar={props.avatar}
      />
    ),
    TaskItem: ({ props }) => (
      <TaskItem 
        title={props.title}
        dueDate={props.dueDate}
        priority={props.priority}
        completed={props.completed}
        assignee={props.assignee}
      />
    ),
  },
})

// ============================================================================
// ATOM TO SPEC TRANSFORMER
// ============================================================================

/**
 * Convert Scout atoms to a JSON-Render Spec
 * Creates element definitions for each atom
 */
function atomsToSpec(atoms: SupportedAtom[]): Spec {
  const elements: Spec['elements'] = {}
  
  // Group atoms by type
  const contactAtoms = atoms.filter(isContactAtom)
  const taskAtoms = atoms.filter(isTaskAtom)
  
  // Create container cards for contacts and tasks
  let children: string[] = []
  
  // Add contacts section
  if (contactAtoms.length > 0) {
    const contactIds = contactAtoms.map((atom, i) => {
      const id = `contact-${i}`
      elements[id] = {
        type: 'ContactCard',
        props: toContactCardProps(atom) as unknown as Record<string, unknown>,
      }
      return id
    })
    
    elements['contacts-card'] = {
      type: 'Card',
      props: { title: `Contacts (${contactAtoms.length})` },
      children: contactIds,
    }
    children.push('contacts-card')
  }
  
  // Add tasks section
  if (taskAtoms.length > 0) {
    const taskIds = taskAtoms.map((atom, i) => {
      const id = `task-${i}`
      elements[id] = {
        type: 'TaskItem',
        props: toTaskItemProps(atom) as unknown as Record<string, unknown>,
      }
      return id
    })
    
    elements['tasks-card'] = {
      type: 'Card',
      props: { title: `Tasks (${taskAtoms.length})` },
      children: taskIds,
    }
    children.push('tasks-card')
  }
  
  return {
    root: 'main-container',
    elements: {
      'main-container': {
        type: 'Card',
        props: { title: 'Scout Atoms Demo' },
        children,
      },
      ...elements,
    },
  }
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App() {
  const [atoms, setAtoms] = useState<SupportedAtom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [useApi, setUseApi] = useState(false)

  // Load atoms on mount
  useEffect(() => {
    loadAtoms()
  }, [])

  async function loadAtoms() {
    setLoading(true)
    setError(null)
    try {
      const fetchedAtoms = useApi 
        ? await fetchDemoAtoms() 
        : createDemoAtoms()
      setAtoms(fetchedAtoms)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load atoms')
      // Fallback to demo data
      setAtoms(createDemoAtoms())
    } finally {
      setLoading(false)
    }
  }

  // Generate spec from atoms
  const spec = atoms.length > 0 ? atomsToSpec(atoms) : null

  // Separate atoms for display
  const contacts = atoms.filter(isContactAtom)
  const tasks = atoms.filter(isTaskAtom)

  return (
    <div className="app">
      <header className="app-header">
        <h1>SPA Builder - Scout Atoms</h1>
        <p className="subtitle">
          JSON-Render components integrated with Scout atom schemas
        </p>
      </header>

      <div className="controls">
        <button 
          className="refresh-btn"
          onClick={loadAtoms}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Data'}
        </button>
        
        <label className="api-toggle">
          <input 
            type="checkbox" 
            checked={useApi}
            onChange={(e) => {
              setUseApi(e.target.checked)
              setTimeout(loadAtoms, 0)
            }}
          />
          Use Scout API
        </label>
        
        {loading && <span className="loading-indicator">⟳ Loading...</span>}
        {error && <span className="error-indicator">⚠ {error}</span>}
      </div>

      <div className="demo-container">
        {/* JSON-Render output */}
        {spec && (
          <div className="render-section">
            <h2>JSON-Render Output</h2>
            <div className="render-output">
              <Renderer spec={spec} registry={registry} />
            </div>
          </div>
        )}

        {/* Direct component rendering */}
        <div className="direct-section">
          <h2>Direct Component Rendering</h2>
          
          {/* Contacts */}
          <div className="section">
            <h3>Contacts ({contacts.length})</h3>
            <div className="contact-grid">
              {contacts.map((atom) => (
                <ContactCard 
                  key={atom.id}
                  {...toContactCardProps(atom)} 
                />
              ))}
            </div>
          </div>
          
          {/* Tasks */}
          <div className="section">
            <h3>Tasks ({tasks.length})</h3>
            <div className="task-list">
              {tasks.map((atom) => (
                <TaskItem 
                  key={atom.id}
                  {...toTaskItemProps(atom)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Raw atom data */}
        <details className="raw-data">
          <summary>Raw Atom Data</summary>
          <pre>{JSON.stringify(atoms, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}

export default App