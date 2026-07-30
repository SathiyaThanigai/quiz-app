import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import {
  ArrowLeft, Play, Pause, Square, Users, Edit, Plus,
  Download, ExternalLink, Copy, Monitor
} from 'lucide-react'

interface SessionData {
  id: string
  title: string
  description: string | null
  session_code: string
  status: string
  question_count: number
  participant_count: number
  current_question_index: number
}

export default function SessionManager() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<SessionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadSession()
  }, [sessionId])

  const loadSession = async () => {
    try {
      const data = await api.getSession(sessionId!)
      setSession(data)
    } catch (error: any) {
      toast.error('Failed to load session')
      navigate('/admin')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenLobby = async () => {
    try {
      await api.openLobby(sessionId!)
      toast.success('Lobby opened! Participants can now join.')
      loadSession()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleStart = async () => {
    try {
      await api.startSession(sessionId!)
      toast.success('Quiz started!')
      navigate(`/admin/session/${sessionId}/live`)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handlePause = async () => {
    try {
      await api.pauseSession(sessionId!)
      toast.success('Session paused')
      loadSession()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleEnd = async () => {
    if (!confirm('Are you sure you want to end this session?')) return
    try {
      await api.endSession(sessionId!)
      toast.success('Session ended')
      loadSession()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(session?.session_code || '')
    toast.success('Session code copied!')
  }

  const copyDisplayLink = () => {
    const link = `${window.location.origin}/display/${sessionId}`
    navigator.clipboard.writeText(link)
    toast.success('Display link copied!')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{session.title}</h1>
              <p className="text-sm text-gray-500">{session.description}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Session info */}
          <div className="card lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4">Session Details</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{session.question_count}</p>
                <p className="text-xs text-gray-500">Questions</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{session.participant_count}</p>
                <p className="text-xs text-gray-500">Participants</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-2xl font-bold text-orange-600 capitalize">{session.status}</p>
                <p className="text-xs text-gray-500">Status</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-2xl font-bold font-mono">{session.session_code}</p>
                <p className="text-xs text-gray-500">Code</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {session.status === 'draft' && (
                <>
                  <button onClick={handleOpenLobby} className="btn-success flex items-center gap-2">
                    <Users size={16} /> Open Lobby
                  </button>
                </>
              )}

              {session.status === 'lobby' && (
                <button onClick={handleStart} className="btn-success flex items-center gap-2">
                  <Play size={16} /> Start Quiz
                </button>
              )}

              {session.status === 'active' && (
                <>
                  <Link to={`/admin/session/${sessionId}/live`} className="btn-success flex items-center gap-2">
                    <Play size={16} /> Live Control
                  </Link>
                  <button onClick={handlePause} className="btn-secondary flex items-center gap-2">
                    <Pause size={16} /> Pause
                  </button>
                  <button onClick={handleEnd} className="btn-danger flex items-center gap-2">
                    <Square size={16} /> End
                  </button>
                </>
              )}

              {session.status === 'paused' && (
                <>
                  <button onClick={async () => { await api.resumeSession(sessionId!); loadSession(); }} className="btn-success flex items-center gap-2">
                    <Play size={16} /> Resume
                  </button>
                  <button onClick={handleEnd} className="btn-danger flex items-center gap-2">
                    <Square size={16} /> End
                  </button>
                </>
              )}

              {(session.status === 'completed' || session.status === 'archived') && (
                <>
                  <button onClick={handleOpenLobby} className="btn-success flex items-center gap-2">
                    <Users size={16} /> Open Lobby (New Round)
                  </button>
                  <a
                    href={api.getExportCsvUrl(sessionId!)}
                    className="btn-secondary flex items-center gap-2"
                    target="_blank"
                  >
                    <Download size={16} /> Export CSV
                  </a>
                  <a
                    href={api.getExportExcelUrl(sessionId!)}
                    className="btn-secondary flex items-center gap-2"
                    target="_blank"
                  >
                    <Download size={16} /> Export Excel
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                to={`/admin/session/${sessionId}/questions`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Edit size={20} className="text-primary-500" />
                <span>Edit Questions</span>
              </Link>

              <button
                onClick={copyCode}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <Copy size={20} className="text-green-500" />
                <span>Copy Session Code</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    const updated = await api.regenerateCode(sessionId!)
                    toast.success(`New code: ${updated.session_code}`)
                    loadSession()
                  } catch (err: any) { toast.error(err.message) }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <Plus size={20} className="text-blue-500" />
                <span>Generate New Code</span>
              </button>

              <button
                onClick={copyDisplayLink}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <ExternalLink size={20} className="text-purple-500" />
                <span>Copy Display Link</span>
              </button>

              <Link
                to={`/display/${sessionId}`}
                target="_blank"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Monitor size={20} className="text-orange-500" />
                <span>Open Display Screen</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
