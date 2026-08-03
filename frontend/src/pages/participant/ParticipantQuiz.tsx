import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { QuizWebSocket, WebSocketMessage } from '../../services/websocket'
import { Clock, CheckCircle, Wifi, WifiOff, Trophy } from 'lucide-react'
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

interface LeaderboardEntry {
  rank: number
  team_name: string
  total_score: number
  correct_answers: number
  wrong_answers: number
  accuracy: number
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
  const [phase, setPhase] = useState<'waiting' | 'question' | 'revealed' | 'leaderboard' | 'completed'>('waiting')
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [questionStartTime, setQuestionStartTime] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
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
        setTimer(msg.data.timer_seconds)
        break
      case 'timer_tick':
        // Server-authoritative timer tick — use directly
        setTimer(msg.data.remaining)
        break
      case 'timer_expired':
        // Server handles end_question automatically; this is just a fallback
        setTimer(0)
        setSubmitted(true)
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
        setLeaderboard(msg.data?.entries || [])
        setPhase('leaderboard')
        break
      case 'next_question_ready':
        setPhase('waiting')
        break
      case 'quiz_completed':
        setLeaderboard(msg.data?.leaderboard?.entries || [])
        setPhase('completed')
        break
      case 'error':
        toast.error(msg.data?.message || 'An error occurred')
        break
    }
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
    <div className="mobile-full-height bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Top bar - compact on mobile */}
      <div className="bg-white dark:bg-gray-800 px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0">
        <span className="font-medium text-sm truncate max-w-[60%]">{teamName}</span>
        <span className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
          {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {isConnected ? '' : 'Reconnecting...'}
        </span>
      </div>

      {/* Main content - flex-1 fills remaining screen height */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-4 overflow-auto">
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
                        src={`${import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`}${url}`}
                        alt={`Question image ${i + 1}`}
                        className="rounded-lg max-h-48 object-contain"
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Options / Text Input */}
              {(question.question_type || 'mcq') === 'mcq' ? (
                <div className="grid grid-cols-1 gap-2 sm:gap-3">
                  {question.options.map((opt, i) => (
                    <motion.button
                      key={opt.label}
                      whileTap={!submitted ? { scale: 0.97 } : undefined}
                      onClick={() => submitAnswer(opt.label)}
                      disabled={submitted}
                      className={`quiz-option ${optionColors[i]} ${
                        submitted
                          ? selectedAnswer === opt.label
                            ? 'ring-4 ring-white/70 opacity-100 cursor-default'
                            : 'opacity-40 cursor-not-allowed'
                          : optionHoverColors[i]
                      }`}
                    >
                      <span className="text-lg sm:text-xl font-bold shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/20">{opt.label}</span>
                      <span className="text-sm sm:text-base leading-tight">{opt.text}</span>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="text"
                    className="input-field text-base sm:text-lg"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitTextAnswer() }}
                    placeholder="Type your answer..."
                    disabled={submitted}
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <motion.button
                    whileTap={!submitted ? { scale: 0.97 } : undefined}
                    onClick={submitTextAnswer}
                    disabled={submitted || !textAnswer.trim()}
                    className={`w-full btn-primary text-base sm:text-lg py-4 ${
                      submitted || !textAnswer.trim() ? 'opacity-50 cursor-not-allowed' : ''
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

          {/* Leaderboard (shown between questions when admin shows it) */}
          {phase === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md mx-auto"
            >
              <div className="text-center mb-4">
                <Trophy size={32} className="mx-auto text-yellow-500 mb-2" />
                <h2 className="text-xl font-bold">Leaderboard</h2>
              </div>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {leaderboard.map((entry, i) => (
                  <motion.div
                    key={entry.rank + '-' + entry.team_name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      entry.team_name === teamName
                        ? 'bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-400'
                        : entry.rank <= 3
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-800' :
                      entry.rank === 3 ? 'bg-orange-400 text-orange-900' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${entry.team_name === teamName ? 'text-primary-700 dark:text-primary-300' : ''}`}>
                        {entry.team_name} {entry.team_name === teamName && '(You)'}
                      </p>
                      <p className="text-xs text-gray-500">{entry.correct_answers} correct</p>
                    </div>
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{entry.total_score}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Final standings after quiz is completed */}
          {phase === 'completed' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-md mx-auto"
            >
              {/* Podium for top 3 */}
              {leaderboard.length >= 3 && (
                <div className="flex items-end justify-center gap-3 mb-6 h-40">
                  {/* 2nd place */}
                  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                    className="flex flex-col items-center">
                    <p className="text-xs font-semibold truncate max-w-[80px] text-center">{leaderboard[1]?.team_name}</p>
                    <p className="text-[10px] text-gray-500">{leaderboard[1]?.total_score} pts</p>
                    <div className="w-16 h-20 bg-gray-300 dark:bg-gray-600 rounded-t-lg mt-1 flex items-center justify-center">
                      <span className="text-2xl">🥈</span>
                    </div>
                  </motion.div>
                  {/* 1st place */}
                  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                    className="flex flex-col items-center">
                    <p className="text-xs font-bold truncate max-w-[80px] text-center">{leaderboard[0]?.team_name}</p>
                    <p className="text-[10px] text-yellow-600">{leaderboard[0]?.total_score} pts</p>
                    <div className="w-16 h-28 bg-yellow-400 dark:bg-yellow-600 rounded-t-lg mt-1 flex items-center justify-center border-t-4 border-yellow-500">
                      <span className="text-3xl">🥇</span>
                    </div>
                  </motion.div>
                  {/* 3rd place */}
                  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
                    className="flex flex-col items-center">
                    <p className="text-xs font-semibold truncate max-w-[80px] text-center">{leaderboard[2]?.team_name}</p>
                    <p className="text-[10px] text-gray-500">{leaderboard[2]?.total_score} pts</p>
                    <div className="w-16 h-16 bg-orange-400 dark:bg-orange-600 rounded-t-lg mt-1 flex items-center justify-center">
                      <span className="text-2xl">🥉</span>
                    </div>
                  </motion.div>
                </div>
              )}

              <div className="text-center mb-4">
                <Trophy size={28} className="mx-auto text-yellow-500 mb-1" />
                <h2 className="text-xl font-bold">Final Standings</h2>
              </div>

              {/* Full leaderboard */}
              <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                {leaderboard.map((entry, i) => (
                  <motion.div
                    key={entry.rank + '-' + entry.team_name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.04 }}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      entry.team_name === teamName
                        ? 'bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-400'
                        : entry.rank <= 3
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-800' :
                      entry.rank === 3 ? 'bg-orange-400 text-orange-900' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${entry.team_name === teamName ? 'text-primary-700 dark:text-primary-300' : ''}`}>
                        {entry.team_name} {entry.team_name === teamName && '(You)'}
                      </p>
                      <p className="text-xs text-gray-500">{entry.correct_answers} correct · {entry.accuracy}%</p>
                    </div>
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{entry.total_score}</span>
                  </motion.div>
                ))}
              </div>

              {leaderboard.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Quiz Complete!</h2>
                  <p className="text-gray-500">Thank you for participating!</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
