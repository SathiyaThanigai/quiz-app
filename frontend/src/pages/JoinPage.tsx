import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon, Users } from 'lucide-react'

export default function JoinPage() {
  const [sessionCode, setSessionCode] = useState('')
  const [teamName, setTeamName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionCode || !teamName) {
      toast.error('Please fill in all fields')
      return
    }

    setIsLoading(true)
    try {
      const participant = await api.joinSession(sessionCode.toUpperCase(), teamName)
      // Store participant info for the session
      localStorage.setItem('participant_id', participant.id)
      localStorage.setItem('participant_name', participant.team_name)
      localStorage.setItem('session_id', participant.session_id)
      toast.success('Joined successfully!')
      navigate(`/lobby/${participant.session_id}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to join session')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Top-right corner: theme toggle + hidden admin link */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Link
          to="/login"
          className="text-[10px] text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        >
          Admin
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="card">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
              <Users size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Pulse
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              Enter the session code to join
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="sessionCode" className="block text-sm font-medium mb-1">
                Session Code
              </label>
              <input
                id="sessionCode"
                type="text"
                className="input-field text-center text-2xl tracking-widest uppercase font-mono"
                placeholder="ABCD12"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="teamName" className="block text-sm font-medium mb-1">
                Team / Player Name
              </label>
              <input
                id="teamName"
                type="text"
                className="input-field"
                placeholder="Enter your team name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={100}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || sessionCode.length < 6}
              className="btn-success w-full text-lg py-3 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                'Join Session'
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
