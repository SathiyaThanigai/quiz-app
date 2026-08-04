import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { QuizWebSocket, WebSocketMessage } from '../../services/websocket'
import { resolveImageUrl } from '../../services/api'
import { Clock, Users, Trophy, Maximize, Wifi, WifiOff, CheckCircle, Award } from 'lucide-react'
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

interface PerQuestionEntry {
  rank: number
  team_name: string
  response_time: number
  points: number
}

interface FinalLeaderboardEntry {
  rank: number
  team_name: string
  total_score: number
  correct_answers: number
  wrong_answers: number
  accuracy: number
}

export default function DisplayScreen() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const wsRef = useRef<QuizWebSocket | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [sessionTitle, setSessionTitle] = useState('')
  const [participantCount, setParticipantCount] = useState(0)
  const [submissions, setSubmissions] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [question, setQuestion] = useState<QuestionData | null>(null)
  const [timer, setTimer] = useState(0)
  const [phase, setPhase] = useState<'lobby' | 'question' | 'revealed' | 'leaderboard' | 'completed'>('lobby')
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [perQuestionLeaderboard, setPerQuestionLeaderboard] = useState<PerQuestionEntry[]>([])
  const [finalLeaderboard, setFinalLeaderboard] = useState<FinalLeaderboardEntry[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleMessage = useCallback((msg: WebSocketMessage) => {
    switch (msg.type) {
      case 'ws_connected':
        setIsConnected(true)
        break
      case 'ws_disconnected':
        setIsConnected(false)
        break
      case 'connection_established':
        setSessionTitle(msg.data?.session_title || 'Pulse')
        setParticipantCount(msg.data?.participant_count || 0)
        setTotalParticipants(msg.data?.participant_count || 0)
        break
      case 'participant_count_update':
      case 'participant_connected':
        setParticipantCount(msg.data?.connected_count || msg.data?.count || 0)
        setTotalParticipants(msg.data?.connected_count || msg.data?.count || 0)
        break
      case 'question_started':
        setQuestion(msg.data)
        setPhase('question')
        setCorrectAnswer(null)
        setExplanation(null)
        setPerQuestionLeaderboard([])
        setSubmissions(0)
        setTimer(msg.data.timer_seconds)
        break
      case 'timer_tick':
        setTimer(msg.data.remaining)
        break
      case 'timer_expired':
        setTimer(0)
        break
      case 'submission_update':
        setSubmissions(msg.data?.submissions || 0)
        if (msg.data?.total_participants) setTotalParticipants(msg.data.total_participants)
        break
      case 'question_ended':
        setTimer(0)
        break
      case 'answer_revealed':
        setCorrectAnswer(msg.data.correct_answer)
        setExplanation(msg.data.explanation || null)
        setPerQuestionLeaderboard(msg.data.per_question_leaderboard || [])
        setPhase('revealed')
        break
      case 'leaderboard_update':
        setFinalLeaderboard(msg.data?.entries || [])
        setPhase('leaderboard')
        break
      case 'next_question_ready':
        setPhase('lobby')
        break
      case 'quiz_completed':
        setFinalLeaderboard(msg.data?.leaderboard?.entries || [])
        setPhase('completed')
        break
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    const ws = new QuizWebSocket()
    wsRef.current = ws
    ws.subscribe(handleMessage)
    ws.connect(`/ws/display/${sessionId}`)
    return () => {
      ws.disconnect()
    }
  }, [sessionId, handleMessage])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const optionBgColors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500']

  return (
    <div className="mobile-full-height bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold">{sessionTitle || 'Pulse'}</h1>
          <span className={`text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-sm"><Users size={16} /> {participantCount}</span>
          <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-700 rounded-lg"><Maximize size={16} /></button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6 overflow-auto">
        <AnimatePresence mode="wait">

          {/* LOBBY */}
          {phase === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <h2 className="text-3xl sm:text-5xl font-bold mb-4">{sessionTitle || 'Pulse'}</h2>
              <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="text-xl sm:text-2xl text-gray-300 mb-6">
                Waiting for the quiz to start...
              </motion.p>
              <div className="flex items-center justify-center gap-3 text-xl text-green-400">
                <Users size={24} /> {participantCount} participants
              </div>
            </motion.div>
          )}

          {/* QUESTION */}
          {phase === 'question' && question && (
            <motion.div key={`q-${question.question_index}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full max-w-6xl">
              {/* Timer + stats */}
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <span className="text-sm sm:text-lg text-gray-400">Q {question.question_index + 1}/{question.total_questions}</span>
                <div className="flex items-center gap-2">
                  <Clock size={28} className={timer <= 5 ? 'text-red-500' : 'text-white'} />
                  <span className={`text-6xl sm:text-8xl font-bold tabular-nums ${timer <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                    {timer}
                  </span>
                </div>
                <span className="text-sm sm:text-lg text-gray-400">{submissions}/{totalParticipants} answered</span>
              </div>

              {/* Question */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-8 mb-4 sm:mb-6">
                <p className="text-xl sm:text-3xl font-semibold text-center">{question.question_text}</p>
                {question.image_urls && question.image_urls.length > 0 && (
                  <div className="flex justify-center gap-4 mt-4 flex-wrap">
                    {question.image_urls.map((url, i) => (
                      <ImageZoom key={i} src={resolveImageUrl(url)} alt="" className="rounded-xl max-h-40 sm:max-h-56 object-contain" />
                    ))}
                  </div>
                )}
              </div>

              {/* Options or Text Indicator */}
              {(question.question_type || 'mcq') === 'mcq' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {question.options.map((opt, i) => (
                    <motion.div key={opt.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
                      className={`${optionBgColors[i]} rounded-lg sm:rounded-xl p-3 sm:p-5 flex items-center gap-3`}>
                      <span className="text-xl sm:text-3xl font-bold opacity-80">{opt.label}</span>
                      <span className="text-base sm:text-xl font-medium">{opt.text}</span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="bg-gray-800 rounded-xl p-6 sm:p-8 text-center border-2 border-dashed border-gray-600">
                  <p className="text-xl sm:text-2xl text-gray-300 font-medium">Type your answer on your device</p>
                  <p className="text-sm sm:text-base text-gray-500 mt-2">Participants are typing their answers...</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* REVEALED - Per-Question Leaderboard */}
          {phase === 'revealed' && question && (
            <motion.div key="revealed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-4xl">
              {/* Correct answer */}
              <div className="text-center mb-4 sm:mb-6">
                <p className="text-sm sm:text-base text-gray-400 mb-2">Q{question.question_index + 1}: {question.question_text}</p>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <span className="text-base sm:text-xl text-gray-300">Answer:</span>
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}
                    className={`inline-flex items-center justify-center rounded-full bg-green-500 font-bold ${
                      correctAnswer && correctAnswer.length > 1
                        ? 'px-5 py-2 sm:px-8 sm:py-3 text-lg sm:text-2xl'
                        : 'w-12 h-12 sm:w-16 sm:h-16 text-2xl sm:text-3xl'
                    }`}>
                    {correctAnswer}
                  </motion.span>
                </div>
                {explanation && <p className="text-sm text-blue-300 max-w-2xl mx-auto">{explanation}</p>}
              </div>

              {/* Per-question leaderboard: only correct answers */}
              <div className="bg-gray-800 rounded-xl p-3 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
                  <Trophy size={18} className="text-yellow-400" /> Question Leaderboard (Fastest Correct)
                </h3>
                {perQuestionLeaderboard.length === 0 ? (
                  <p className="text-gray-500 text-center py-6 text-lg">No correct answers this round</p>
                ) : (
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                    {perQuestionLeaderboard.map((entry, i) => (
                      <motion.div key={entry.rank} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                        className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg ${
                          entry.rank === 1 ? 'bg-yellow-500/15 border border-yellow-500/40' :
                          entry.rank === 2 ? 'bg-gray-400/10 border border-gray-400/30' :
                          entry.rank === 3 ? 'bg-orange-500/10 border border-orange-500/30' :
                          'bg-gray-700/50 border border-gray-700'
                        }`}>
                        <span className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-sm sm:text-base font-bold shrink-0 ${
                          entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                          entry.rank === 2 ? 'bg-gray-300 text-gray-800' :
                          entry.rank === 3 ? 'bg-orange-400 text-orange-900' :
                          'bg-gray-600 text-gray-200'
                        }`}>
                          {entry.rank}
                        </span>
                        <span className="flex-1 font-medium text-sm sm:text-lg truncate">{entry.team_name}</span>
                        <span className="text-xs sm:text-sm text-gray-400 tabular-nums">{entry.response_time}s</span>
                        <span className="text-sm sm:text-base font-bold text-yellow-400">+{entry.points}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* FINAL LEADERBOARD / COMPLETED - with podium */}
          {(phase === 'leaderboard' || phase === 'completed') && (
            <motion.div key="final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full max-w-5xl">

              {/* Podium for top 3 */}
              {finalLeaderboard.length >= 3 && (
                <div className="flex items-end justify-center gap-3 sm:gap-6 mb-6 sm:mb-10 h-48 sm:h-64">
                  {/* 2nd place */}
                  <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, type: 'spring' }}
                    className="flex flex-col items-center">
                    <Award size={24} className="text-gray-300 mb-1" />
                    <p className="text-sm sm:text-base font-semibold truncate max-w-[100px] sm:max-w-[140px] text-center">{finalLeaderboard[1]?.team_name}</p>
                    <p className="text-xs text-gray-400">{finalLeaderboard[1]?.total_score} pts</p>
                    <div className="w-20 sm:w-28 h-24 sm:h-32 bg-gradient-to-t from-gray-400/40 to-gray-400/10 rounded-t-lg mt-2 flex items-center justify-center">
                      <span className="text-3xl sm:text-4xl font-bold text-gray-300">2</span>
                    </div>
                  </motion.div>

                  {/* 1st place */}
                  <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                    className="flex flex-col items-center">
                    <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ delay: 1, duration: 0.5 }}>
                      <Trophy size={32} className="text-yellow-400 mb-1" />
                    </motion.div>
                    <p className="text-sm sm:text-lg font-bold truncate max-w-[110px] sm:max-w-[160px] text-center">{finalLeaderboard[0]?.team_name}</p>
                    <p className="text-xs sm:text-sm text-yellow-400">{finalLeaderboard[0]?.total_score} pts</p>
                    <div className="w-24 sm:w-32 h-32 sm:h-44 bg-gradient-to-t from-yellow-500/40 to-yellow-500/10 rounded-t-lg mt-2 flex items-center justify-center border-t-4 border-yellow-400">
                      <span className="text-4xl sm:text-5xl font-bold text-yellow-400">1</span>
                    </div>
                  </motion.div>

                  {/* 3rd place */}
                  <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, type: 'spring' }}
                    className="flex flex-col items-center">
                    <Award size={24} className="text-orange-400 mb-1" />
                    <p className="text-sm sm:text-base font-semibold truncate max-w-[100px] sm:max-w-[140px] text-center">{finalLeaderboard[2]?.team_name}</p>
                    <p className="text-xs text-gray-400">{finalLeaderboard[2]?.total_score} pts</p>
                    <div className="w-20 sm:w-28 h-20 sm:h-24 bg-gradient-to-t from-orange-500/40 to-orange-500/10 rounded-t-lg mt-2 flex items-center justify-center">
                      <span className="text-3xl sm:text-4xl font-bold text-orange-400">3</span>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Title */}
              <div className="text-center mb-4">
                <h2 className="text-xl sm:text-3xl font-bold">
                  {phase === 'completed' ? 'Final Standings' : 'Leaderboard'}
                </h2>
              </div>

              {/* Full leaderboard table */}
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {finalLeaderboard.map((entry, i) => (
                  <motion.div key={entry.rank + '-' + entry.team_name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.05 }}
                    className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-lg ${
                      entry.rank === 1 ? 'bg-yellow-500/10 border border-yellow-500/30' :
                      entry.rank === 2 ? 'bg-gray-400/10 border border-gray-500/20' :
                      entry.rank === 3 ? 'bg-orange-500/10 border border-orange-500/20' :
                      'bg-gray-800/60 border border-gray-700'
                    }`}>
                    {/* Rank */}
                    <span className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full text-sm font-bold shrink-0 ${
                      entry.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                      entry.rank === 2 ? 'bg-gray-300 text-gray-800' :
                      entry.rank === 3 ? 'bg-orange-400 text-orange-900' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {entry.rank}
                    </span>

                    {/* Team */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm sm:text-base font-semibold truncate">{entry.team_name}</p>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400 shrink-0">
                      <span className="text-green-400">{entry.correct_answers}<CheckCircle size={12} className="inline ml-0.5" /></span>
                      <span className="hidden sm:inline">{entry.wrong_answers} wrong</span>
                      <span className="hidden sm:inline">{entry.accuracy}%</span>
                    </div>

                    {/* Score */}
                    <span className="text-lg sm:text-2xl font-bold text-blue-400 shrink-0">{entry.total_score}</span>
                  </motion.div>
                ))}
              </div>

              {phase === 'completed' && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="text-center text-gray-400 mt-6 text-sm sm:text-base">
                  Quiz Complete! Congratulations to all participants.
                </motion.p>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
