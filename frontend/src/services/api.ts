// Determine API URL: use env var if set, otherwise derive from current browser location
// This ensures that when accessed from another device on the network, API calls go to the correct host
const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`

class ApiService {
  private token: string | null = null

  setToken(token: string | null) {
    this.token = token
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${API_URL}/api${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    if (response.status === 204) return null
    return response.json()
  }

  // Auth
  async login(username: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  }

  async register(username: string, email: string, password: string, full_name?: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, full_name }),
    })
  }

  async getMe() {
    return this.request('/auth/me')
  }

  // Sessions
  async getSessions(status?: string) {
    const params = status ? `?status=${status}` : ''
    return this.request(`/sessions/${params}`)
  }

  async getSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`)
  }

  async createSession(title: string, description?: string) {
    return this.request('/sessions/', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    })
  }

  async updateSession(sessionId: string, data: { title?: string; description?: string }) {
    return this.request(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`, { method: 'DELETE' })
  }

  async duplicateSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/duplicate`, { method: 'POST' })
  }

  async openLobby(sessionId: string) {
    return this.request(`/sessions/${sessionId}/open-lobby`, { method: 'POST' })
  }

  async startSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/start`, { method: 'POST' })
  }

  async pauseSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/pause`, { method: 'POST' })
  }

  async resumeSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/resume`, { method: 'POST' })
  }

  async endSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/end`, { method: 'POST' })
  }

  async archiveSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}/archive`, { method: 'POST' })
  }

  async joinSession(sessionCode: string, teamName: string) {
    return this.request('/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ session_code: sessionCode, team_name: teamName }),
    })
  }

  async regenerateCode(sessionId: string) {
    return this.request(`/sessions/${sessionId}/regenerate-code`, { method: 'POST' })
  }

  // Questions
  async getQuestions(sessionId: string) {
    return this.request(`/sessions/${sessionId}/questions/`)
  }

  async createQuestion(sessionId: string, data: any) {
    return this.request(`/sessions/${sessionId}/questions/`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateQuestion(sessionId: string, questionId: string, data: any) {
    return this.request(`/sessions/${sessionId}/questions/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteQuestion(sessionId: string, questionId: string) {
    return this.request(`/sessions/${sessionId}/questions/${questionId}`, {
      method: 'DELETE',
    })
  }

  async duplicateQuestion(sessionId: string, questionId: string) {
    return this.request(`/sessions/${sessionId}/questions/${questionId}/duplicate`, {
      method: 'POST',
    })
  }

  async importQuestions(sessionId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/questions/import`, {
      method: 'POST',
      headers,
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // Participants & Leaderboard
  async getParticipants(sessionId: string) {
    return this.request(`/sessions/${sessionId}/participants`)
  }

  async getLeaderboard(sessionId: string) {
    return this.request(`/sessions/${sessionId}/leaderboard`)
  }

  async adjustScore(sessionId: string, participantId: string, adjustment: number, reason?: string) {
    return this.request(`/sessions/${sessionId}/adjust-score`, {
      method: 'POST',
      body: JSON.stringify({
        participant_id: participantId,
        score_adjustment: adjustment,
        reason,
      }),
    })
  }

  // Export
  getExportCsvUrl(sessionId: string) {
    return `${API_URL}/api/sessions/${sessionId}/export/csv`
  }

  getExportExcelUrl(sessionId: string) {
    return `${API_URL}/api/sessions/${sessionId}/export/excel`
  }
}

export const api = new ApiService()

/**
 * Resolve an image URL returned by the backend into a fully-qualified URL.
 * Images are now uploaded to Cloudinary and stored as full https:// URLs,
 * so they should be used as-is. Older/local-relative URLs (starting with
 * "/") are still prefixed with API_URL for backward compatibility.
 */
export function resolveImageUrl(url: string): string {
  if (!url) return url
  return url.startsWith('http') ? url : `${API_URL}${url}`
}
