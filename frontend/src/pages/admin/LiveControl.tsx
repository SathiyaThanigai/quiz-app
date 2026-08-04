import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { api, resolveImageUrl } from '../../services/api'
import { QuizWebSocket, WebSocketMessage } from '../../services/websocket'
import { useAuth } from '../../contexts/AuthContext'
import {
  Play, SkipForward, Trophy, Users, Clock,
  CheckCircle, XCircle, Wifi, WifiOff, ArrowLeft, Monitor,
  ChevronLeft, ChevronRight
} from 'lucide-react'


interface Question {
  id: string
  question_text: string
  question_type: 'mcq' | 'text'
  correct_answer: string
  explanation: string | null
  timer_seconds: number
  image_urls: string[]
  options: { option_label: string; option_text: string }[]
}

interface LeaderboardEntry {
  rank: number
  team_name: string
  total_score: number
  correct_answers: number
  average_response_time: number
}

export default function LiveControl() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { token } = useAuth()
  const wsRef = useRef<QuizWebSocket | null>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [submissions, setSubmissions] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [correctCount, setCorrectCount] = useState(0)
  const [timer, setTimer] = useState(0)

  // Phase: idle → active → revealed → (next or complete)
  const [phase, setPhase] = useState<'idle' | 'active' | 'revealed' | 'complete'>('idle')

  // Refs for keyboard handler (avoids stale closures)
  const goToPrevRef = useRef(() => {})
  const goToNextRef = useRef(() => {})
  const startQuestionRef = useRef(() => {})

  useEffect(() => {
    loadQuestions()
    connectWebSocket()
    return () => {
      wsRef.current?.disconnect()
    }
  }, [])

  // Keyboard navigation: Left/Right arrows to navigate questions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevRef.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToNextRef.current()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        startQuestionRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const loadQuestions = async () => {
    try {
      const data = await api.getQuestions(sessionId!)
      setQuestions(data)
      const session = await api.getSession(sessionId!)
      const idx = session.current_question_index
      setCurrentIndex(idx >= 0 ? idx : 0)
      setTotalParticipants(session.participant_count)
    } catch (error: any) {
      toast.error('Failed to load session data')
    }
  }

  const connectWebSocket = () => {
    const ws = new QuizWebSocket()
    wsRef.current = ws
    ws.subscribe(handleWsMessage)
    ws.connect(`/ws/admin/${sessionId}?token=${token}`)
  }

  const handleWsMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'ws_connected':
        setIsConnected(true)
        break
      case 'ws_disconnected':
        setIsConnected(false)
        break
      case 'connection_established':
        setParticipantCount(message.data?.connected_participants || 0)
        break
      case 'participant_connected':
        setParticipantCount(message.data?.connected_count || 0)
        setTotalParticipants((p) => Math.max(p, message.data?.connected_count || 0))
        toast.success(`${message.data?.team_name} joined!`, { duration: 2000 })
        break
      case 'participant_disconnected':
        setParticipantCount(message.data?.connected_count || 0)
        break
      case 'submission_update':
        setSubmissions(message.data?.submissions || 0)
        setTotalParticipants(message.data?.total_participants || 0)
        break
      case 'question_started':
        // Server will broadcast timer_tick messages, just set initial value
        setTimer(message.data?.timer_seconds || 0)
        break
      case 'timer_tick':
        // Server-authoritative timer tick
        setTimer(message.data?.remaining || 0)
        break
      case 'timer_expired':
        // Server auto-ends the question — just update local timer display
        setTimer(0)
        break
      case 'question_ended':
        break
      case 'answer_revealed':
        setPhase('revealed')
        setCorrectCount(message.data?.correct_responses || 0)
        break
      case 'leaderboard_update':
        setLeaderboard(message.data?.entries || [])
        break
      case 'quiz_completed':
        toast.success('Quiz completed!')
        setLeaderboard(message.data?.leaderboard?.entries || [])
        setPhase('complete')
        break
    }
  }, [])

  const startQuestion = () => {
    if (!wsRef.current) return
    setPhase('active')
    setSubmissions(0)
    setCorrectCount(0)

    wsRef.current.send({ type: 'start_question', data: { index: currentIndex } })
    // Timer will be started when we receive the question_started echo from the server
    // This ensures admin timer is in sync with display/participant timers
  }

  const endQuestion = () => {
    setTimer(0)
    wsRef.current?.send({ type: 'end_question' })
  }

  const showLeaderboardAction = () => {
    wsRef.current?.send({ type: 'show_leaderboard' })
  }

  const finishQuiz = () => {
    wsRef.current?.send({ type: 'finish_quiz' })
  }

  // Navigate to previous question
  const goToPrev = () => {
    if (currentIndex <= 0 || phase === 'active') return
    const prev = currentIndex - 1
    setCurrentIndex(prev)
    setPhase('idle')
    setSubmissions(0)
    setCorrectCount(0)
    wsRef.current?.send({ type: 'go_to_question', data: { index: prev } })
  }

  // Navigate to next question
  const goToNext = () => {
    if (currentIndex >= questions.length - 1 || phase === 'active') return
    const next = currentIndex + 1
    setCurrentIndex(next)
    setPhase('idle')
    setSubmissions(0)
    setCorrectCount(0)
    wsRef.current?.send({ type: 'next_question' })
  }

  // Keep refs in sync for keyboard handler
  goToPrevRef.current = goToPrev
  goToNextRef.current = goToNext
  startQuestionRef.current = () => {
    if (phase === 'idle' || phase === 'revealed') startQuestion()
  }

  const currentQuestion = questions[currentIndex]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Status bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 sm:py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to={`/admin/session/${sessionId}`} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg shrink-0">
              <ArrowLeft size={18} />
            </Link>
            <h1 className="font-bold text-base sm:text-lg truncate">Live Control</h1>
            <span className={`hidden sm:flex items-center gap-1 text-sm ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
              {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <span className={`sm:hidden ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
              {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 text-sm shrink-0">
            <span className="flex items-center gap-1 text-xs sm:text-sm"><Users size={14} /> {participantCount}</span>
            <a
              href={`/display/${sessionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex items-center gap-1 text-xs py-1 sm:py-1.5 px-2 sm:px-3 no-underline"
            >
              <Monitor size={14} /> <span className="hidden sm:inline">Open Display</span>
            </a>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Main control panel */}
          <div className="lg:col-span-2 space-y-4">

            {/* Question navigation arrows */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={goToPrev}
                disabled={currentIndex <= 0 || phase === 'active'}
                className="flex items-center gap-1 px-2 sm:px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
              >
                <ChevronLeft size={16} /> <span className="hidden sm:inline">Prev</span>
              </button>
              <div className="text-center min-w-0">
                <span className="font-bold text-base sm:text-lg block">
                  Q {currentIndex + 1} / {questions.length}
                </span>
                <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:block">← → arrow keys | Space to start</span>
              </div>
              <button
                onClick={goToNext}
                disabled={currentIndex >= questions.length - 1 || phase === 'active'}
                className="flex items-center gap-1 px-2 sm:px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
              >
                <span className="hidden sm:inline">Next</span> <ChevronRight size={16} />
              </button>
            </div>

            {/* Current question display */}
            {currentQuestion && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    {currentQuestion.timer_seconds}s timer
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock size={12} /> {currentQuestion.timer_seconds}s
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-semibold mb-4">{currentQuestion.question_text}</h2>
                {currentQuestion.image_urls && currentQuestion.image_urls.length > 0 && (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {currentQuestion.image_urls.map((url, i) => (
                      <img
                        key={i}
                        src={resolveImageUrl(url)}
                        alt={`Question image ${i + 1}`}
                        className="max-h-40 rounded-lg object-contain border border-gray-200 dark:border-gray-600"
                      />
                    ))}
                  </div>
                )}
                {(currentQuestion.question_type || 'mcq') === 'mcq' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {currentQuestion.options.map((opt) => (
                      <div
                        key={opt.option_label}
                        className={`p-3 rounded-lg text-sm font-medium ${
                          phase === 'revealed' && opt.option_label === currentQuestion.correct_answer
                            ? 'bg-green-100 dark:bg-green-900/40 border-2 border-green-500 text-green-800 dark:text-green-200'
                            : 'bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <span className="font-bold">{opt.option_label}.</span> {opt.option_text}
                        {phase === 'revealed' && opt.option_label === currentQuestion.correct_answer && (
                          <CheckCircle size={14} className="inline ml-2 text-green-500" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`p-3 rounded-lg text-sm font-medium ${
                    phase === 'revealed'
                      ? 'bg-green-100 dark:bg-green-900/40 border-2 border-green-500 text-green-800 dark:text-green-200'
                      : 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-200'
                  }`}>
                    {phase === 'revealed' ? (
                      <>
                        <span className="font-bold">Correct Answer:</span> {currentQuestion.correct_answer}
                        <CheckCircle size={14} className="inline ml-2 text-green-500" />
                      </>
                    ) : (
                      <span className="italic">Type the answer question — participants will type their response</span>
                    )}
                  </div>
                )}
                {phase === 'revealed' && currentQuestion.explanation && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>Explanation:</strong> {currentQuestion.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Timer display when active */}
            {phase === 'active' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className={`text-4xl font-bold tabular-nums ${timer <= 5 ? 'text-red-600 animate-pulse-fast' : 'text-primary-600'}`}>
                        {timer}
                      </p>
                      <p className="text-xs text-gray-500">seconds</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{submissions}</p>
                      <p className="text-xs text-gray-500">/{totalParticipants} submitted</p>
                    </div>
                  </div>
                  <button onClick={endQuestion} className="btn-danger">
                    End Timer
                  </button>
                </div>
              </motion.div>
            )}

            {/* Stats after answer revealed */}
            {phase === 'revealed' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card"
              >
                <div className="flex items-center justify-around">
                  <div className="text-center">
                    <CheckCircle className="mx-auto text-green-500 mb-1" size={24} />
                    <p className="text-2xl font-bold text-green-600">{correctCount}</p>
                    <p className="text-xs text-gray-500">Correct</p>
                  </div>
                  <div className="text-center">
                    <XCircle className="mx-auto text-red-500 mb-1" size={24} />
                    <p className="text-2xl font-bold text-red-600">{submissions - correctCount}</p>
                    <p className="text-xs text-gray-500">Incorrect</p>
                  </div>
                  <div className="text-center">
                    <Users className="mx-auto text-gray-400 mb-1" size={24} />
                    <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">{totalParticipants - submissions}</p>
                    <p className="text-xs text-gray-500">No answer</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Control buttons */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {(phase === 'idle' || phase === 'revealed') && currentQuestion && (
                <button onClick={startQuestion} className="btn-success flex items-center gap-2 text-base sm:text-lg py-2.5 sm:py-3 px-4 sm:px-6 w-full sm:w-auto justify-center">
                  <Play size={18} /> {phase === 'revealed' ? 'Restart Question' : `Start Q${currentIndex + 1}`}
                </button>
              )}

              {phase === 'revealed' && (
                <>
                  {/* Show "Next Question" for all questions except the last */}
                  {currentIndex < questions.length - 1 ? (
                    <button onClick={goToNext} className="btn-primary flex items-center gap-2">
                      <SkipForward size={18} /> Next Question
                    </button>
                  ) : (
                    /* Show "Finish Quiz" only on the last question */
                    <button onClick={finishQuiz} className="btn-danger flex items-center gap-2 text-base py-2.5 px-5">
                      <Trophy size={18} /> Finish Quiz
                    </button>
                  )}
                  <button onClick={showLeaderboardAction} className="btn-secondary flex items-center gap-2">
                    <Trophy size={18} /> Leaderboard
                  </button>
                </>
              )}

              {phase === 'complete' && (
                <div className="text-center w-full py-4 space-y-3">
                  <Trophy size={32} className="mx-auto text-yellow-500 mb-2" />
                  <p className="text-lg font-semibold">Quiz Complete!</p>
                  <button onClick={showLeaderboardAction} className="btn-primary flex items-center gap-2 mx-auto">
                    <Trophy size={18} /> Show Final Leaderboard on Display
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard sidebar */}
          <div className="card h-fit">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Trophy size={18} className="text-yellow-500" /> Leaderboard
            </h3>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                Leaderboard will appear after the first question
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.slice(0, 10).map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center gap-3 p-2 rounded-lg ${
                      entry.rank <= 3 ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                    }`}
                  >
                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-700' :
                      entry.rank === 3 ? 'bg-orange-300 text-orange-800' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {entry.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{entry.team_name}</p>
                      <p className="text-xs text-gray-500">
                        {entry.correct_answers} correct, avg {entry.average_response_time}s
                      </p>
                    </div>
                    <span className="text-lg font-bold text-primary-600">{entry.total_score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
