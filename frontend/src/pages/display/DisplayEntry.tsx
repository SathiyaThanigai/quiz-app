import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Monitor } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function DisplayEntry() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 6) return

    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/sessions/by-code/${code.toUpperCase()}`)
      if (!res.ok) throw new Error('Session not found')
      const data = await res.json()
      navigate(`/display/${data.id}`)
    } catch {
      setError('Session not found. Check the code.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <Monitor size={48} className="mx-auto text-primary-400 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Display Screen</h1>
        <p className="text-gray-400 mb-6 text-sm">Enter session code to launch display</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="SESSION CODE"
            className="w-full px-4 py-3 text-center text-2xl tracking-widest font-mono rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            maxLength={6}
            autoComplete="off"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={code.length < 6 || isLoading}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Loading...' : 'Open Display'}
          </button>
        </form>
      </div>
    </div>
  )
}
