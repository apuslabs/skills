import { z } from 'zod'
import { schema } from '@json-render/react/schema'

// ============================================================================
// ORIGINAL COMPONENT PROP SCHEMAS
// ============================================================================

const CardPropsSchema = z.object({
  title: z.string().optional().describe('Card title displayed at the top'),
})

const MetricPropsSchema = z.object({
  label: z.string().describe('Label for the metric'),
  value: z.union([z.string(), z.number()]).describe('Value to display'),
  format: z.enum(['raw', 'number', 'currency', 'percent']).optional().default('raw').describe('Format for the value display'),
})

const ButtonPropsSchema = z.object({
  label: z.string().describe('Button text'),
  action: z.string().optional().describe('Action identifier when clicked'),
})

// ============================================================================
// SCOUT ATOM COMPONENT PROP SCHEMAS
// ============================================================================

/**
 * Contact status schema - matches ContactAtom.status type
 */
const ContactStatusSchema = z.enum(['active', 'inactive', 'pending', 'archived'])

/**
 * ContactCard Props Schema
 * 
 * Maps directly from ContactAtom.data structure:
 * ───────────────────────────────────────────────────────────────────
 * | Atom Property | Schema Field | Description                  |
 * ───────────────────────────────────────────────────────────────────
 * | name          | name         | Contact's full name          |
 * | email         | email        | Contact's email address      |
 * | company       | company      | Contact's company            |
 * | status        | status       | Contact status enum          |
 * | avatar        | avatar       | URL to avatar image          |
 * ───────────────────────────────────────────────────────────────────
 */
const ContactCardPropsSchema = z.object({
  name: z.string().describe('Contact full name'),
  email: z.string().email().describe('Contact email address'),
  company: z.string().optional().describe('Company or organization'),
  status: ContactStatusSchema.describe('Contact status'),
  avatar: z.string().url().optional().describe('Avatar image URL'),
})

/**
 * Task priority schema - matches TaskAtom.priority type
 */
const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

/**
 * TaskItem Props Schema
 * 
 * Maps directly from TaskAtom.data structure:
 * ───────────────────────────────────────────────────────────────────
 * | Atom Property | Schema Field | Description                  |
 * ───────────────────────────────────────────────────────────────────
 * | title         | title        | Task title/description       |
 * | dueDate       | dueDate      | ISO date string              |
 * | priority      | priority     | Task priority enum           |
 * | completed     | completed    | Task completion status       |
 * | assignee      | assignee     | Assigned person name         |
 * ───────────────────────────────────────────────────────────────────
 */
const TaskItemPropsSchema = z.object({
  title: z.string().describe('Task title or description'),
  dueDate: z.string().optional().describe('Due date (ISO format)'),
  priority: TaskPrioritySchema.describe('Task priority level'),
  completed: z.boolean().describe('Whether task is completed'),
  assignee: z.string().optional().describe('Assigned person name'),
})

// ============================================================================
// CATALOG DEFINITION
// ============================================================================

/**
 * JSON-Render Component Catalog
 * 
 * Contains all component schemas for the JSON rendering system.
 * Components are mapped to implementations in App.tsx via defineRegistry.
 * 
 * SCHEMA-TO-COMPONENT MAPPING:
 * Each component entry maps to a React component implementation.
 * The props schema defines the expected properties for each component.
 * 
 * Scout Atom Integration:
 * - ContactCard: receives props from ContactAtom via toContactCardProps()
 * - TaskItem: receives props from TaskAtom via toTaskItemProps()
 */
export const catalog = schema.createCatalog({
  components: {
    // Original components
    Card: {
      props: CardPropsSchema,
      slots: ['default'],
      description: 'A card container with an optional title that wraps child content',
    },
    Metric: {
      props: MetricPropsSchema,
      slots: [],
      description: 'A metric display showing a label and formatted value',
    },
    Button: {
      props: ButtonPropsSchema,
      slots: [],
      description: 'A clickable button with a label and optional action',
    },
    
    // Scout Atom components
    /**
     * ContactCard Component
     * Renders contact information from Scout Contact atoms.
     * Schema maps directly from ContactAtom.data structure.
     */
    ContactCard: {
      props: ContactCardPropsSchema,
      slots: [],
      description: 'Displays contact information with status indicator, email, and company details. Maps from ContactAtom schema.',
    },
    
    /**
     * TaskItem Component
     * Renders task information from Scout Task atoms.
     * Schema maps directly from TaskAtom.data structure.
     */
    TaskItem: {
      props: TaskItemPropsSchema,
      slots: [],
      description: 'Displays a task with checkbox, priority, due date, and assignee. Maps from TaskAtom schema.',
    },
  },
  actions: {}, // No actions defined yet
})

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Infer types from the catalog
export type AppCatalog = typeof catalog
export type CardProps = z.infer<typeof CardPropsSchema>
export type MetricProps = z.infer<typeof MetricPropsSchema>
export type ButtonProps = z.infer<typeof ButtonPropsSchema>
export type ContactCardProps = z.infer<typeof ContactCardPropsSchema>
export type TaskItemProps = z.infer<typeof TaskItemPropsSchema>