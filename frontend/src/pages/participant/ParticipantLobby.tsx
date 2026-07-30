import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { QuizWebSocket, WebSocketMessage } from '../../services/websocket'
import { Clock, Users, Wifi, WifiOff } from 'lucide-react'

export default function ParticipantLobby() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const wsRef = useRef<QuizWebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [teamName] = useState(localStorage.getItem('participant_name') || 'Player')
  const [status, setStatus] = useState('Waiting for quiz to start...')

  useEffect(() => {
    const participantId = localStorage.getItem('participant_id')
    if (!participantId || !sessionId) {
      navigate('/join')
      return
    }

    const ws = new QuizWebSocket()
    wsRef.current = ws
    ws.subscribe(handleMessage)
    ws.connect(`/ws/participant/${sessionId}?participant_id=${participantId}`)

    return () => {
      ws.disconnect()
    }
  }, [])

  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case 'ws_connected':
        setIsConnected(true)
        break
      case 'ws_disconnected':
        setIsConnected(false)
        break
      case 'connection_established':
        if (message.data?.status === 'active') {
          navigate(`/quiz/${sessionId}`)
        }
        break
      case 'question_started':
        // Quiz has started, navigate to quiz view
        navigate(`/quiz/${sessionId}`)
        break
      case 'next_question_ready':
        navigate(`/quiz/${sessionId}`)
        break
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="card max-w-md mx-auto">
          <div className="mb-6">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              isConnected ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700'
            }`}>
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
          </div>

          <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">
            {teamName}
          </h1>

          <p className="text-gray-500 dark:text-gray-400 mb-8">
            You're in the lobby
          </p>

          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900 mb-6"
          >
            <Clock size={36} className="text-primary-600 dark:text-primary-400" />
          </motion.div>

          <p className="text-lg text-gray-600 dark:text-gray-300">{status}</p>
          <p className="text-sm text-gray-400 mt-4">
            The quiz will start automatically when the admin begins.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
