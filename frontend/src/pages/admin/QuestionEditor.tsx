import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import {
  ArrowLeft, Plus, Trash2, Copy, Edit, Save, X,
  Upload, Clock, Tag, Image
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Question {
  id: string
  question_text: string
  question_type: 'mcq' | 'text'
  correct_answer: string
  difficulty: string | null
  category: string | null
  explanation: string | null
  timer_seconds: number
  order_index: number
  image_urls: string[]
  options: { id: string; option_label: string; option_text: string }[]
}

export default function QuestionEditor() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  // Form state
  const [formText, setFormText] = useState('')
  const [formType, setFormType] = useState<'mcq' | 'text'>('mcq')
  const [formCorrect, setFormCorrect] = useState('A')
  const [formTimer, setFormTimer] = useState(20)
  const [formDifficulty, setFormDifficulty] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formExplanation, setFormExplanation] = useState('')
  const [formOptions, setFormOptions] = useState(['', '', '', ''])
  const [formImages, setFormImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    loadQuestions()
  }, [sessionId])

  const loadQuestions = async () => {
    try {
      const data = await api.getQuestions(sessionId!)
      setQuestions(data)
    } catch (error: any) {
      toast.error('Failed to load questions')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormText('')
    setFormType('mcq')
    setFormCorrect('A')
    setFormTimer(20)
    setFormDifficulty('')
    setFormCategory('')
    setFormExplanation('')
    setFormOptions(['', '', '', ''])
    setFormImages([])
  }

  const startEdit = (q: Question) => {
    setEditingId(q.id)
    setShowAdd(false)
    setFormText(q.question_text)
    setFormType(q.question_type || 'mcq')
    setFormCorrect(q.correct_answer)
    setFormTimer(q.timer_seconds)
    setFormDifficulty(q.difficulty || '')
    setFormCategory(q.category || '')
    setFormExplanation(q.explanation || '')
    setFormImages(q.image_urls || [])
    if ((q.question_type || 'mcq') === 'mcq') {
      setFormOptions(
        ['A', 'B', 'C', 'D'].map(
          (label) => q.options.find((o) => o.option_label === label)?.option_text || ''
        )
      )
    } else {
      setFormOptions(['', '', '', ''])
    }
  }

  const handleSave = async () => {
    if (!formText) {
      toast.error('Please fill in the question text')
      return
    }

    if (formType === 'mcq' && formOptions.some((o) => !o)) {
      toast.error('Please fill in all option fields')
      return
    }

    if (formType === 'text' && !formCorrect.trim()) {
      toast.error('Please fill in the correct answer')
      return
    }

    const data: any = {
      question_text: formText,
      question_type: formType,
      correct_answer: formCorrect,
      timer_seconds: formTimer,
      difficulty: formDifficulty || null,
      category: formCategory || null,
      explanation: formExplanation || null,
      image_urls: formImages.length > 0 ? formImages : null,
    }

    if (formType === 'mcq') {
      data.options = ['A', 'B', 'C', 'D'].map((label, i) => ({
        option_label: label,
        option_text: formOptions[i],
      }))
    }

    try {
      if (editingId) {
        await api.updateQuestion(sessionId!, editingId, data)
        toast.success('Question updated')
      } else {
        await api.createQuestion(sessionId!, data)
        toast.success('Question added')
      }
      setEditingId(null)
      setShowAdd(false)
      resetForm()
      loadQuestions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    try {
      await api.deleteQuestion(sessionId!, id)
      toast.success('Question deleted')
      loadQuestions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await api.duplicateQuestion(sessionId!, id)
      toast.success('Question duplicated')
      loadQuestions()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await api.importQuestions(sessionId!, file)
      toast.success('Questions imported!')
      loadQuestions()
    } catch (error: any) {
      toast.error(error.message)
    }
    e.target.value = ''
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/uploads/images`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Upload failed' }))
        throw new Error(err.detail)
      }

      const result = await response.json()
      setFormImages((prev) => [...prev, ...result.urls])
      toast.success(`${result.urls.length} image(s) uploaded`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload images')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const removeImage = (index: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== index))
  }

  const updateOption = useCallback((index: number, value: string) => {
    setFormOptions((prev) => {
      const newOpts = [...prev]
      newOpts[index] = value
      return newOpts
    })
  }, [])

  const isFormOpen = showAdd || editingId !== null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/admin/session/${sessionId}`} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-xl font-bold">Question Editor</h1>
              <span className="text-sm text-gray-500">({questions.length} questions)</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="btn-secondary flex items-center gap-1 cursor-pointer text-sm">
                <Upload size={16} /> Import
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleImport}
                />
              </label>
              <button
                onClick={() => { setShowAdd(true); setEditingId(null); resetForm() }}
                className="btn-primary flex items-center gap-1 text-sm"
              >
                <Plus size={16} /> Add Question
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {/* Question Form - rendered at top level, NOT as inline component */}
        {isFormOpen && (
          <div className="card border-primary-200 dark:border-primary-700">
            <h3 className="font-semibold mb-4">
              {editingId ? 'Edit Question' : 'New Question'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Question Text *</label>
                <textarea
                  className="input-field"
                  rows={3}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Enter your question..."
                />
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-sm font-medium mb-1">Question Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setFormType('mcq'); setFormCorrect('A') }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${formType === 'mcq' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    Multiple Choice
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormType('text'); setFormCorrect('') }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${formType === 'text' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  >
                    Type the Answer
                  </button>
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-sm font-medium mb-1">Images (optional)</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {formImages.map((url, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={`${API_URL}${url}`}
                        alt={`Question image ${i + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        type="button"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <label className={`w-24 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 transition-colors ${isUploading ? 'opacity-50' : ''}`}>
                    {isUploading ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                    ) : (
                      <>
                        <Image size={20} className="text-gray-400" />
                        <span className="text-xs text-gray-400 mt-1">Add</span>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </div>

              {/* MCQ Options */}
              {formType === 'mcq' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B', 'C', 'D'].map((label, i) => (
                    <div key={label}>
                      <label className="block text-sm font-medium mb-1">
                        Option {label} *
                        {formCorrect === label && (
                          <span className="ml-2 text-green-600 text-xs">(Correct)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        className={`input-field ${formCorrect === label ? 'border-green-500 ring-1 ring-green-500' : ''}`}
                        value={formOptions[i]}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${label}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Text Answer Input */}
              {formType === 'text' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Correct Answer *</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formCorrect}
                    onChange={(e) => setFormCorrect(e.target.value)}
                    placeholder="Type the correct answer (case-insensitive matching)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Participants must type this answer exactly (case-insensitive).</p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {formType === 'mcq' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Correct Answer</label>
                    <select
                      className="input-field"
                      value={formCorrect}
                      onChange={(e) => setFormCorrect(e.target.value)}
                    >
                      {['A', 'B', 'C', 'D'].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Timer (sec)</label>
                  <input
                    type="number"
                    className="input-field"
                    min={5}
                    max={300}
                    value={formTimer}
                    onChange={(e) => setFormTimer(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Difficulty</label>
                  <select
                    className="input-field"
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value)}
                  >
                    <option value="">None</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input
                    type="text"
                    className="input-field"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Science"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Explanation</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Optional explanation shown after answer reveal"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setEditingId(null); setShowAdd(false); resetForm() }}
                  className="btn-secondary flex items-center gap-1"
                >
                  <X size={16} /> Cancel
                </button>
                <button onClick={handleSave} className="btn-primary flex items-center gap-1">
                  <Save size={16} /> Save
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
              >
                <div className="card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm font-bold">
                          {idx + 1}
                        </span>
                        <h3 className="font-medium">{q.question_text}</h3>
                      </div>

                      {/* Show images */}
                      {q.image_urls && q.image_urls.length > 0 && (
                        <div className="flex gap-2 mt-2 mb-3 flex-wrap">
                          {q.image_urls.map((url, i) => (
                            <img
                              key={i}
                              src={`${API_URL}${url}`}
                              alt={`Q${idx + 1} image ${i + 1}`}
                              className="w-20 h-20 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                            />
                          ))}
                        </div>
                      )}

                      {(q.question_type || 'mcq') === 'mcq' ? (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          {q.options.map((opt) => (
                            <div
                              key={opt.id}
                              className={`px-3 py-2 rounded-lg text-sm ${
                                opt.option_label === q.correct_answer
                                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                                  : 'bg-gray-50 dark:bg-gray-700'
                              }`}
                            >
                              <span className="font-semibold">{opt.option_label}.</span> {opt.option_text}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700 inline-block">
                          <span className="font-semibold">Answer:</span> {q.correct_answer}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${(q.question_type || 'mcq') === 'mcq' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'}`}>
                          {(q.question_type || 'mcq') === 'mcq' ? 'MCQ' : 'Text'}
                        </span>
                        <span className="flex items-center gap-1"><Clock size={12} /> {q.timer_seconds}s</span>
                        {q.difficulty && <span className="flex items-center gap-1"><Tag size={12} /> {q.difficulty}</span>}
                        {q.category && <span>{q.category}</span>}
                        {q.image_urls && q.image_urls.length > 0 && (
                          <span className="flex items-center gap-1"><Image size={12} /> {q.image_urls.length} image(s)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(q)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={() => handleDuplicate(q.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title="Duplicate">
                        <Copy size={16} />
                      </button>
                      <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!isLoading && questions.length === 0 && !isFormOpen && (
          <div className="text-center py-12">
            <p className="text-gray-500">No questions yet. Add your first question or import from a file.</p>
          </div>
        )}
      </main>
    </div>
  )
}
