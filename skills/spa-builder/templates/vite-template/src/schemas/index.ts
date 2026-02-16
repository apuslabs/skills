/**
 * Scout Atom Schema Definitions
 * 
 * These types define the structure of atoms returned by the Scout API.
 * Each atom type maps to a corresponding component in the catalog:
 * 
 * - Contact atom → ContactCard component
 * - Task atom → TaskItem component
 * 
 * The mapping is documented in code comments below each schema definition.
 */

// ============================================================================
// CONTACT SCHEMA
// ============================================================================

/**
 * Contact status enum - reflects the relationship status with a contact
 */
export type ContactStatus = 'active' | 'inactive' | 'pending' | 'archived'

/**
 * Contact Atom Schema
 * 
 * Represents a person/contact from Scout Atoms API.
 * Maps directly to ContactCard component props.
 * 
 * SCHEMA-TO-CATALOG MAPPING:
 * ─────────────────────────────────────────────────────────────────────────
 * | Atom Property | Component Prop | Description                       |
 * ─────────────────────────────────────────────────────────────────────────
 * | name          | name           | Full name of the contact          |
 * | email         | email          | Email address                     |
 * | company       | company        | Company/organization name         |
 * | status        | status         | Contact status (active/inactive)  |
 * | avatar        | avatar         | Optional avatar URL               |
 * ─────────────────────────────────────────────────────────────────────────
 */
export interface ContactAtom {
  /** Unique atom identifier from Scout */
  id: string
  
  /** Atom type - always 'contact' for Contact atoms */
  type: 'contact'
  
  /** Contact data payload */
  data: {
    /** Full name of the contact */
    name: string
    
    /** Email address */
    email: string
    
    /** Company or organization */
    company?: string
    
    /** Contact status */
    status: ContactStatus
    
    /** Optional avatar image URL */
    avatar?: string
  }
  
  /** ISO timestamp when atom was created */
  created_at?: string
  
  /** ISO timestamp when atom was last updated */
  updated_at?: string
}

/**
 * Props for the ContactCard component
 * Derived from ContactAtom.data structure
 */
export interface ContactCardProps {
  name: string
  email: string
  company?: string
  status: ContactStatus
  avatar?: string
}

// ============================================================================
// TASK SCHEMA
// ============================================================================

/**
 * Task priority enum - indicates urgency level
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

/**
 * Task Atom Schema
 * 
 * Represents a task/todo item from Scout Atoms API.
 * Maps directly to TaskItem component props.
 * 
 * SCHEMA-TO-CATALOG MAPPING:
 * ─────────────────────────────────────────────────────────────────────────
 * | Atom Property | Component Prop | Description                       |
 * ─────────────────────────────────────────────────────────────────────────
 * | title         | title          | Task title/description            |
 * | dueDate       | dueDate        | ISO date string for due date      |
 * | priority      | priority       | Task priority level               |
 * | completed     | completed      | Whether task is done              |
 * | assignee      | assignee       | Optional assigned person name     |
 * ─────────────────────────────────────────────────────────────────────────
 */
export interface TaskAtom {
  /** Unique atom identifier from Scout */
  id: string
  
  /** Atom type - always 'task' for Task atoms */
  type: 'task'
  
  /** Task data payload */
  data: {
    /** Task title/description */
    title: string
    
    /** ISO date string for due date */
    dueDate?: string
    
    /** Task priority level */
    priority: TaskPriority
    
    /** Whether task is completed */
    completed: boolean
    
    /** Optional assigned person name */
    assignee?: string
  }
  
  /** ISO timestamp when atom was created */
  created_at?: string
  
  /** ISO timestamp when atom was last updated */
  updated_at?: string
}

/**
 * Props for the TaskItem component
 * Derived from TaskAtom.data structure
 */
export interface TaskItemProps {
  title: string
  dueDate?: string
  priority: TaskPriority
  completed: boolean
  assignee?: string
}

// ============================================================================
// SCOUT API TYPES
// ============================================================================

/**
 * SSE event types from Scout Atoms API
 */
export type ScoutEventType = 'atom' | 'cache_complete' | 'done' | 'error'

/**
 * Base SSE event structure
 */
export interface ScoutEvent {
  /** Event type */
  event: ScoutEventType
  
  /** Event data (JSON string for atom events) */
  data: string
}

/**
 * Atom event payload - parsed from SSE data
 */
export interface AtomEventPayload {
  /** The atom object */
  atom: ContactAtom | TaskAtom
}

/**
 * Error event payload
 */
export interface ErrorEventPayload {
  /** Error message */
  message: string
  
  /** Error code if available */
  code?: string
}

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * All supported atom types
 */
export type SupportedAtom = ContactAtom | TaskAtom

/**
 * All supported component props types
 */
export type SupportedComponentProps = ContactCardProps | TaskItemProps

/**
 * Helper function to check if an atom is a Contact
 */
export function isContactAtom(atom: SupportedAtom): atom is ContactAtom {
  return atom.type === 'contact'
}

/**
 * Helper function to check if an atom is a Task
 */
export function isTaskAtom(atom: SupportedAtom): atom is TaskAtom {
  return atom.type === 'task'
}

/**
 * Transform ContactAtom to ContactCardProps
 * Maps atom data to component props
 */
export function toContactCardProps(atom: ContactAtom): ContactCardProps {
  return {
    name: atom.data.name,
    email: atom.data.email,
    company: atom.data.company,
    status: atom.data.status,
    avatar: atom.data.avatar,
  }
}

/**
 * Transform TaskAtom to TaskItemProps
 * Maps atom data to component props
 */
export function toTaskItemProps(atom: TaskAtom): TaskItemProps {
  return {
    title: atom.data.title,
    dueDate: atom.data.dueDate,
    priority: atom.data.priority,
    completed: atom.data.completed,
    assignee: atom.data.assignee,
  }
}