import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  Plus, Copy, Trash2, Play, Archive, Edit, Sun, Moon,
  LogOut, Users, HelpCircle, Clock
} from 'lucide-react'

interface QuizSession {
  id: string
  title: string
  description: string | null
  session_code: string
  status: string
  question_count: number
  participant_count: number
  created_at: string
}

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<QuizSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    loadSessions()
  }, [filterStatus])

  const loadSessions = async () => {
    try {
      const data = await api.getSessions(filterStatus || undefined)
      setSessions(data.sessions)
    } catch (error: any) {
      toast.error('Failed to load sessions')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle) return

    try {
      await api.createSession(newTitle, newDescription || undefined)
      toast.success('Session created!')
      setShowCreate(false)
      setNewTitle('')
      setNewDescription('')
      loadSessions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await api.duplicateSession(id)
      toast.success('Session duplicated!')
      loadSessions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return
    try {
      await api.deleteSession(id)
      toast.success('Session deleted')
      loadSessions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleArchive = async (id: string) => {
    try {
      await api.archiveSession(id)
      toast.success('Session archived')
      loadSessions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    lobby: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    archived: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">Pulse</h1>
            <p className="text-sm text-gray-500">Welcome, {user?.full_name || user?.username}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500" aria-label="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-auto"
            >
              <option value="">All Sessions</option>
              <option value="draft">Draft</option>
              <option value="lobby">Lobby</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} /> New Session
          </button>
        </div>

        {/* Create session modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowCreate(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="card w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-bold mb-4">Create New Session</h2>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label htmlFor="title" className="block text-sm font-medium mb-1">Title *</label>
                    <input
                      id="title"
                      type="text"
                      className="input-field"
                      placeholder="Quiz session title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="desc" className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      id="desc"
                      className="input-field"
                      placeholder="Optional description"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" className="btn-primary">Create</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sessions grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <HelpCircle size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400">No sessions yet</h3>
            <p className="text-gray-500 mt-1">Create your first quiz session to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session, i) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{session.title}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${statusColors[session.status]}`}>
                      {session.status}
                    </span>
                  </div>
                  <span className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {session.session_code}
                  </span>
                </div>

                {session.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{session.description}</p>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <HelpCircle size={14} /> {session.question_count} questions
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={14} /> {session.participant_count} joined
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    to={`/admin/session/${session.id}`}
                    className="btn-primary text-sm py-1 px-3 flex items-center gap-1"
                  >
                    <Edit size={14} /> Manage
                  </Link>

                  {(session.status === 'active' || session.status === 'lobby') && (
                    <Link
                      to={`/admin/session/${session.id}/live`}
                      className="btn-success text-sm py-1 px-3 flex items-center gap-1"
                    >
                      <Play size={14} /> Live
                    </Link>
                  )}

                  <button
                    onClick={() => handleDuplicate(session.id)}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Duplicate"
                  >
                    <Copy size={16} />
                  </button>

                  {session.status === 'completed' && (
                    <button
                      onClick={() => handleArchive(session.id)}
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Archive"
                    >
                      <Archive size={16} />
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(session.id)}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
