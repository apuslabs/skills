import React from 'react'
import type { ContactStatus, TaskPriority } from '../schemas'

// ============================================================================
// ORIGINAL COMPONENT PROPS TYPES
// ============================================================================

export interface CardProps {
  title?: string
  children?: React.ReactNode
}

export interface MetricProps {
  label: string
  value: string | number
  format?: 'number' | 'currency' | 'percent' | 'raw'
}

export interface ButtonProps {
  label: string
  action?: string
  onClick?: () => void
}

// ============================================================================
// SCOUT ATOM COMPONENT PROPS TYPES
// ============================================================================

/**
 * Props for ContactCard component
 * Maps from ContactAtom.schema data structure
 */
export interface ContactCardProps {
  name: string
  email: string
  company?: string
  status: ContactStatus
  avatar?: string
  onStatusChange?: (status: ContactStatus) => void
}

/**
 * Props for TaskItem component
 * Maps from TaskAtom.schema data structure
 */
export interface TaskItemProps {
  title: string
  dueDate?: string
  priority: TaskPriority
  completed: boolean
  assignee?: string
  onToggle?: () => void
}

// Helper for formatting values
function formatValue(value: string | number, format?: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  
  if (isNaN(num)) {
    return String(value)
  }
  
  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD' 
      }).format(num)
    case 'percent':
      return new Intl.NumberFormat('en-US', { 
        style: 'percent', 
        minimumFractionDigits: 1 
      }).format(num / 100)
    case 'number':
      return new Intl.NumberFormat('en-US').format(num)
    case 'raw':
    default:
      return String(value)
  }
}

// Card Component - wraps children in a styled container
export function Card({ title, children }: CardProps) {
  return (
    <div className="jr-card">
      {title && <h3 className="jr-card-title">{title}</h3>}
      <div className="jr-card-content">
        {children}
      </div>
    </div>
  )
}

// Metric Component - displays a label/value pair
export function Metric({ label, value, format = 'raw' }: MetricProps) {
  return (
    <div className="jr-metric">
      <div className="jr-metric-label">{label}</div>
      <div className="jr-metric-value">{formatValue(value, format)}</div>
    </div>
  )
}

// Button Component - clickable button with optional action
export function Button({ label, action, onClick }: ButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick()
    } else if (action) {
      console.log('Button action:', action)
      // In a real app, this could dispatch events or call handlers
    }
  }

  return (
    <button className="jr-button" onClick={handleClick}>
      {label}
    </button>
  )
}

// ============================================================================
// STATUS/PRIORITY HELPERS
// ============================================================================

function getStatusColor(status: ContactStatus): string {
  const colors: Record<ContactStatus, string> = {
    active: '#22c55e',
    inactive: '#6b7280',
    pending: '#f59e0b',
    archived: '#9ca3af',
  }
  return colors[status] || '#6b7280'
}

function getStatusLabel(status: ContactStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getPriorityColor(priority: TaskPriority): string {
  const colors: Record<TaskPriority, string> = {
    low: '#6b7280',
    medium: '#3b82f6',
    high: '#f59e0b',
    urgent: '#ef4444',
  }
  return colors[priority] || '#6b7280'
}

function getPriorityLabel(priority: TaskPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function formatDueDate(dueDate?: string): string {
  if (!dueDate) return 'No due date'
  
  try {
    const date = new Date(dueDate)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return `Overdue by ${Math.abs(diffDays)} days`
    } else if (diffDays === 0) {
      return 'Due today'
    } else if (diffDays === 1) {
      return 'Due tomorrow'
    } else if (diffDays <= 7) {
      return `Due in ${diffDays} days`
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      })
    }
  } catch {
    return dueDate
  }
}

// ============================================================================
// SCOUT ATOM COMPONENTS
// ============================================================================

/**
 * ContactCard Component
 * Displays contact information from Scout Contact atoms.
 * 
 * PROPS MAPPING (from ContactAtom.data):
 * ───────────────────────────────────────────────────────────
 * | Atom Property | Component Prop | Display               |
 * ───────────────────────────────────────────────────────────
 * | name          | name           | Full name             |
 * | email         | email          | Email link            |
 * | company       | company        | Company badge         |
 * | status        | status         | Status indicator dot  |
 * | avatar        | avatar         | Avatar image/initials |
 * ───────────────────────────────────────────────────────────
 */
export function ContactCard({ 
  name, 
  email, 
  company, 
  status,
  avatar,
  onStatusChange 
}: ContactCardProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="jr-contact-card">
      <div className="jr-contact-header">
        <div className="jr-contact-avatar">
          {avatar ? (
            <img src={avatar} alt={name} />
          ) : (
            <span className="jr-contact-initials">{initials}</span>
          )}
          <span 
            className="jr-contact-status" 
            style={{ backgroundColor: getStatusColor(status) }}
            title={getStatusLabel(status)}
          />
        </div>
        <div className="jr-contact-info">
          <h4 className="jr-contact-name">{name}</h4>
          <a href={`mailto:${email}`} className="jr-contact-email">
            {email}
          </a>
        </div>
      </div>
      
      <div className="jr-contact-details">
        {company && (
          <div className="jr-contact-company">
            <span className="jr-detail-label">Company</span>
            <span className="jr-detail-value">{company}</span>
          </div>
        )}
        
        <div className="jr-contact-status-row">
          <span className="jr-detail-label">Status</span>
          <select 
            className="jr-status-select"
            value={status}
            onChange={(e) => onStatusChange?.(e.target.value as ContactStatus)}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
    </div>
  )
}

/**
 * TaskItem Component
 * Displays task information from Scout Task atoms.
 * 
 * PROPS MAPPING (from TaskAtom.data):
 * ───────────────────────────────────────────────────────────
 * | Atom Property | Component Prop | Display               |
 * ───────────────────────────────────────────────────────────
 * | title         | title          | Task title            |
 * | dueDate       | dueDate        | Formatted due date    |
 * | priority      | priority       | Priority badge        |
 * | completed     | completed      | Checkbox state        |
 * | assignee      | assignee       | Assignee name         |
 * ───────────────────────────────────────────────────────────
 */
export function TaskItem({ 
  title, 
  dueDate, 
  priority, 
  completed,
  assignee,
  onToggle 
}: TaskItemProps) {
  return (
    <div className={`jr-task-item ${completed ? 'jr-task-completed' : ''}`}>
      <div className="jr-task-checkbox">
        <input 
          type="checkbox" 
          checked={completed}
          onChange={onToggle}
        />
      </div>
      
      <div className="jr-task-content">
        <div className="jr-task-title">{title}</div>
        
        <div className="jr-task-meta">
          <span 
            className="jr-task-priority"
            style={{ backgroundColor: getPriorityColor(priority) }}
          >
            {getPriorityLabel(priority)}
          </span>
          
          <span className="jr-task-due">{formatDueDate(dueDate)}</span>
          
          {assignee && (
            <span className="jr-task-assignee">
              <span className="jr-assignee-icon">👤</span>
              {assignee}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENT CATALOG (updated with Scout components)
// ============================================================================

export const componentCatalog = {
  Card,
  Metric,
  Button,
  // Scout Atom components
  ContactCard,
  TaskItem,
}