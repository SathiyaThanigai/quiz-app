import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { QuizWebSocket, WebSocketMessage } from '../../services/websocket'
import { Clock, CheckCircle, Wifi, WifiOff } from 'lucide-react'
import ImageZoom from '../../components/ImageZoom'

interface QuestionData {
  question_id: string
  question_index: number
  question_text: string
  question_type: 'mcq' | 'text'
  image_urls: string[]
  options: { label: string; text: string }[]
  timer_seconds: number
  total_questions: number
}

export default function ParticipantQuiz() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const wsRef = useRef<QuizWebSocket | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [textAnswer, setTextAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [timer, setTimer] = useState(0)
  const [phase, setPhase] = useState<'waiting' | 'question' | 'revealed' | 'completed'>('waiting')
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const teamName = localStorage.getItem('participant_name') || 'Player'

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
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const handleMessage = (msg: WebSocketMessage) => {
    switch (msg.type) {
      case 'ws_connected':
        setIsConnected(true)
        break
      case 'ws_disconnected':
        setIsConnected(false)
        break
      case 'question_started':
        setQuestion(msg.data)
        setSelectedAnswer(null)
        setTextAnswer('')
        setSubmitted(false)
        setCorrectAnswer(null)
        setExplanation(null)
        setPhase('question')
        setQuestionStartTime(Date.now())
        startTimer(msg.data.timer_seconds, msg.data.server_time)
        break
      case 'already_answered':
        setSubmitted(true)
        // Stay on question phase - don't navigate away
        break
      case 'answer_submitted':
        setSubmitted(true)
        // Stay on question phase - don't navigate away
        break
      case 'question_ended':
        if (timerRef.current) clearInterval(timerRef.current)
        setTimer(0)
        setSubmitted(true)
        // Stay on question phase until answer is revealed
        break
      case 'answer_revealed':
        setCorrectAnswer(msg.data.correct_answer)
        setExplanation(msg.data.explanation)
        setPhase('revealed')
        break
      case 'leaderboard_update':
        // Leaderboard only shows on display screen, participants just wait
        break
      case 'next_question_ready':
        setPhase('waiting')
        break
      case 'quiz_completed':
        setPhase('completed')
        break
      case 'error':
        toast.error(msg.data?.message || 'An error occurred')
        break
    }
  }

  const startTimer = (seconds: number, serverTime?: string) => {
    // Adjust for network latency: calculate elapsed time since server sent the message
    let adjustedSeconds = seconds
    if (serverTime) {
      const serverMs = new Date(serverTime + 'Z').getTime()
      const elapsedSec = (Date.now() - serverMs) / 1000
      adjustedSeconds = Math.max(0, Math.round(seconds - elapsedSec))
    }
    setTimer(adjustedSeconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const submitAnswer = (answer: string) => {
    if (submitted || !question) return
    setSelectedAnswer(answer)
    setSubmitted(true)

    const responseTime = (Date.now() - questionStartTime) / 1000

    wsRef.current?.send({
      type: 'submit_answer',
      data: {
        question_id: question.question_id,
        selected_answer: answer,
        response_time: responseTime,
      },
    })
  }

  const submitTextAnswer = () => {
    if (submitted || !question || !textAnswer.trim()) return
    setSelectedAnswer(textAnswer.trim())
    setSubmitted(true)

    const responseTime = (Date.now() - questionStartTime) / 1000

    wsRef.current?.send({
      type: 'submit_answer',
      data: {
        question_id: question.question_id,
        selected_answer: textAnswer.trim(),
        response_time: responseTime,
      },
    })
  }

  const optionColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500']
  const optionHoverColors = ['hover:bg-red-600', 'hover:bg-blue-600', 'hover:bg-green-600', 'hover:bg-yellow-600']

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-white dark:bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <span className="font-medium text-sm">{teamName}</span>
        <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
          {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {phase === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900 mb-4"
              >
                <Clock size={32} className="text-primary-600" />
              </motion.div>
              <p className="text-lg text-gray-600 dark:text-gray-300">Waiting for next question...</p>
            </motion.div>
          )}

          {phase === 'question' && question && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg"
            >
              {/* Timer */}
              <div className="text-center mb-4">
                <span className={`inline-block text-3xl font-bold ${timer <= 5 ? 'text-red-600 animate-pulse-fast' : 'text-primary-600'}`}>
                  {timer}
                </span>
                <p className="text-xs text-gray-500">
                  Q{question.question_index + 1} / {question.total_questions}
                </p>
              </div>

              {/* Question */}
              <div className="card mb-4">
                <p className="text-lg font-medium text-center">{question.question_text}</p>
                {question.image_urls && question.image_urls.length > 0 && (
                  <div className="flex justify-center gap-2 mt-3 flex-wrap">
                    {question.image_urls.map((url, i) => (
                      <ImageZoom
                        key={i}
                        src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${url}`}
                        alt={`Question image ${i + 1}`}
                        className="rounded-lg max-h-48 object-contain"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Options / Text Input */}
              {(question.question_type || 'mcq') === 'mcq' ? (
                <div className="grid grid-cols-1 gap-3">
                  {question.options.map((opt, i) => (
                    <motion.button
                      key={opt.label}
                      whileTap={!submitted ? { scale: 0.95 } : undefined}
                      onClick={() => submitAnswer(opt.label)}
                      disabled={submitted}
                      className={`p-4 rounded-xl text-white font-medium text-left transition-all ${optionColors[i]} ${
                        submitted
                          ? selectedAnswer === opt.label
                            ? 'ring-4 ring-white/70 opacity-100 cursor-default'
                            : 'opacity-40 cursor-not-allowed'
                          : optionHoverColors[i]
                      }`}
                    >
                      <span className="text-xl font-bold mr-2">{opt.label}</span>
                      <span>{opt.text}</span>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    className={`w-full p-4 rounded-xl border-2 bg-white dark:bg-gray-800 text-lg outline-none transition-all ${
                      submitted
                        ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800 opacity-80 cursor-not-allowed'
                        : 'border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-800'
                    }`}
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitTextAnswer() }}
                    placeholder="Type your answer..."
                    disabled={submitted}
                    autoFocus
                  />
                  <motion.button
                    whileTap={!submitted ? { scale: 0.95 } : undefined}
                    onClick={submitTextAnswer}
                    disabled={submitted || !textAnswer.trim()}
                    className={`w-full p-4 rounded-xl text-white font-medium text-center transition-all bg-primary-600 ${
                      submitted || !textAnswer.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-700'
                    }`}
                  >
                    {submitted ? 'Answer Locked In' : 'Submit Answer'}
                  </motion.button>
                </div>
              )}

              {/* Submitted indicator */}
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-center"
                >
                  <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle size={16} /> Answer locked in
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}

          {phase === 'revealed' && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center card max-w-md mx-auto"
            >
              <h2 className="text-xl font-bold mb-4">Correct Answer</h2>
              <div className={`inline-flex items-center justify-center ${correctAnswer && correctAnswer.length > 1 ? 'px-6 py-3' : 'w-16 h-16'} rounded-full bg-green-100 dark:bg-green-900 mb-4`}>
                <span className={`font-bold text-green-600 ${correctAnswer && correctAnswer.length > 1 ? 'text-xl' : 'text-3xl'}`}>{correctAnswer}</span>
              </div>
              {selectedAnswer && selectedAnswer.toLowerCase() === correctAnswer?.toLowerCase() ? (
                <p className="text-green-600 font-medium">You got it right!</p>
              ) : selectedAnswer ? (
                <p className="text-red-600 font-medium">Your answer: {selectedAnswer}</p>
              ) : (
                <p className="text-gray-500">You didn't answer</p>
              )}
              {explanation && (
                <p className="text-sm text-gray-500 mt-3 italic">{explanation}</p>
              )}
            </motion.div>
          )}

          {phase === 'completed' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center card max-w-md mx-auto"
            >
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Quiz Complete!</h2>
              <p className="text-gray-500">Thank you for participating. Check the display screen for final standings.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
