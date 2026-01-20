import { useState, useEffect } from 'react'
import './App.css'

const STORAGE_KEY = 'reachout-saved-templates'
const COOKIE_STORAGE_KEY = 'reachout-linkedin-cookie'

const SAMPLE_TEMPLATES = [
  {
    name: "Networking",
    template: `Hi {name},

I came across your profile and was impressed by your work at {company}. I'd love to connect and learn more about your journey in {industry}.

Would you be open to a brief chat sometime?

Best regards`
  },
  {
    name: "Job Opportunity",
    template: `Hi {name},

I noticed your experience in {field} and thought you might be interested in an exciting opportunity at our company.

We're looking for someone with your background, and I'd love to share more details if you're open to it.

Let me know if you'd like to connect!`
  },
  {
    name: "Collaboration",
    template: `Hello {name},

I've been following your work and find it really inspiring. I'm working on a project that aligns with your expertise, and I think there could be some great synergy.

Would you be interested in exploring a potential collaboration?

Looking forward to hearing from you!`
  }
];

function App() {
  const [profileUrl, setProfileUrl] = useState('')
  const [messageTemplate, setMessageTemplate] = useState('')
  const [manualProfile, setManualProfile] = useState({
    name: '',
    headline: '',
    company: '',
    location: '',
    about: ''
  })
  const [showManualInput, setShowManualInput] = useState(false)
  const [generatedMessage, setGeneratedMessage] = useState('')
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [nameError, setNameError] = useState('')
  const [linkedinCookie, setLinkedinCookie] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  // Load saved templates and LinkedIn cookie from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setSavedTemplates(JSON.parse(stored))
      } catch {
        setSavedTemplates([])
      }
    }
    
    const storedCookie = localStorage.getItem(COOKIE_STORAGE_KEY)
    if (storedCookie) {
      setLinkedinCookie(storedCookie)
    }
  }, [])

  // Save LinkedIn cookie when it changes
  const handleSaveCookie = () => {
    if (linkedinCookie.trim()) {
      localStorage.setItem(COOKIE_STORAGE_KEY, linkedinCookie.trim())
    } else {
      localStorage.removeItem(COOKIE_STORAGE_KEY)
    }
    setShowSettings(false)
  }

  const handleGenerate = async () => {
    setError('')
    setGeneratedMessage('')
    setLoading(true)

    try {
      const response = await fetch('/api/generate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileUrl,
          messageTemplate,
          manualProfileData: showManualInput ? manualProfile : null,
          linkedinCookie: linkedinCookie.trim() || undefined
        })
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.requireCookie) {
          setShowSettings(true)
          setError('LinkedIn cookie is required for scraping. Please add your li_at cookie in Settings.')
        } else if (data.requireManualInput) {
          setShowManualInput(true)
          setError('Could not fetch LinkedIn profile automatically. Please enter profile details manually below.')
        } else {
          setError(data.error || 'Failed to generate message')
        }
        return
      }

      setGeneratedMessage(data.personalizedMessage)
      setProfileData(data.profileData)
    } catch (err) {
      setError('Network error. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectTemplate = (template, id = null) => {
    setMessageTemplate(template)
    setSelectedTemplateId(id)
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !messageTemplate.trim()) return
    
    const trimmedName = templateName.trim()
    const nameExists = 
      SAMPLE_TEMPLATES.some(t => t.name.toLowerCase() === trimmedName.toLowerCase()) ||
      savedTemplates.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())
    
    if (nameExists) {
      setNameError('A template with this name already exists')
      return
    }
    
    const newTemplate = {
      id: Date.now(),
      name: trimmedName,
      template: messageTemplate
    }
    
    const updated = [...savedTemplates, newTemplate]
    setSavedTemplates(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    
    setTemplateName('')
    setNameError('')
    setShowSaveInput(false)
    setSelectedTemplateId(newTemplate.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleUpdateTemplate = () => {
    if (!selectedTemplateId || !messageTemplate.trim()) return
    
    const updated = savedTemplates.map(t => 
      t.id === selectedTemplateId ? { ...t, template: messageTemplate } : t
    )
    setSavedTemplates(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDeleteTemplate = (id) => {
    const updated = savedTemplates.filter(t => t.id !== id)
    setSavedTemplates(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    if (selectedTemplateId === id) {
      setSelectedTemplateId(null)
    }
  }

  // Check if current template content differs from selected saved template
  const selectedTemplate = savedTemplates.find(t => t.id === selectedTemplateId)
  const hasUnsavedChanges = selectedTemplate && messageTemplate !== selectedTemplate.template

  // Combine default and saved templates
  const allTemplates = [
    ...SAMPLE_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}`, isDefault: true })),
    ...savedTemplates.map(t => ({ ...t, isDefault: false }))
  ]

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">
              <svg viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="45" fill="url(#logoGrad)"/>
                <path d="M30 65 L50 35 L70 65" stroke="#1A1A2E" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="50" cy="28" r="5" fill="#1A1A2E"/>
                <defs>
                  <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FF6B35"/>
                    <stop offset="100%" stopColor="#F7C59F"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="logo-text">ReachOut</span>
          </div>
          <div className="header-right">
            <p className="tagline">AI-Powered LinkedIn Messages</p>
            <button 
              className={`settings-btn ${linkedinCookie ? 'configured' : ''}`}
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              {linkedinCookie ? 'Cookie Set' : 'Settings'}
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="modal-close" onClick={() => setShowSettings(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="setting-item">
                <label className="setting-label">
                  LinkedIn Session Cookie (li_at)
                  <span className="setting-hint">Required for profile scraping</span>
                </label>
                <textarea
                  className="textarea-field cookie-input"
                  placeholder="Paste your li_at cookie value here..."
                  value={linkedinCookie}
                  onChange={(e) => setLinkedinCookie(e.target.value)}
                  rows={3}
                />
                <div className="cookie-instructions">
                  <h4>How to get your LinkedIn cookie:</h4>
                  <ol>
                    <li>Open LinkedIn in Chrome and make sure you're logged in</li>
                    <li>Press <kbd>F12</kbd> to open Developer Tools</li>
                    <li>Go to the <strong>Application</strong> tab</li>
                    <li>In the left sidebar, expand <strong>Cookies</strong> &gt; <strong>https://www.linkedin.com</strong></li>
                    <li>Find the cookie named <strong>li_at</strong></li>
                    <li>Copy its <strong>Value</strong> (double-click to select all)</li>
                  </ol>
                  <p className="cookie-warning">
                    <strong>Note:</strong> This cookie is your LinkedIn session. Keep it private and never share it. 
                    It may expire and need to be updated periodically.
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowSettings(false)}>
                Cancel
              </button>
              <button className="save-btn" onClick={handleSaveCookie}>
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="main">
        <div className="container">
          {/* Hero Section */}
          <section className="hero">
            <h1 className="hero-title">
              Craft <span className="highlight">personalized</span> outreach
              <br />in seconds
            </h1>
            <p className="hero-subtitle">
              Turn generic templates into compelling, tailored messages using AI that understands your prospect's background.
            </p>
          </section>

          {/* Input Section */}
          <section className="input-section">
            <div className="input-grid">
              {/* LinkedIn URL Input */}
              <div className="input-card">
                <div className="card-header">
                  <div className="card-icon linkedin-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </div>
                  <h3>LinkedIn Profile</h3>
                </div>
                <input
                  type="url"
                  className="input-field"
                  placeholder="https://linkedin.com/in/username"
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                />
                <p className="input-hint">Paste the LinkedIn profile URL of your prospect</p>
              </div>

              {/* Message Template Input */}
              <div className="input-card template-card">
                <div className="card-header">
                  <div className="card-icon template-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14,2 14,8 20,8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10,9 9,9 8,9"/>
                    </svg>
                  </div>
                  <h3>Message Template</h3>
                </div>
                
                {/* Templates */}
                <div className="quick-templates">
                  {allTemplates.map((t) => (
                    t.isDefault ? (
                      <button 
                        key={t.id} 
                        className="template-btn"
                        onClick={() => selectTemplate(t.template)}
                      >
                        {t.name}
                      </button>
                    ) : (
                      <div key={t.id} className={`saved-template-item ${selectedTemplateId === t.id ? 'selected' : ''}`}>
                        <button 
                          className={`template-btn saved ${selectedTemplateId === t.id ? 'active' : ''}`}
                          onClick={() => selectTemplate(t.template, t.id)}
                        >
                          {t.name}
                        </button>
                        <button 
                          className="delete-template-btn"
                          onClick={() => handleDeleteTemplate(t.id)}
                          title="Delete template"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    )
                  ))}
                </div>

                <textarea
                  className="textarea-field"
                  placeholder="Write your message template here...

Use placeholders like {name}, {company}, {title} or just write naturally - AI will personalize it based on the profile."
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  rows={8}
                />

                {/* Save Template Actions */}
                <div className="template-actions">
                  {!showSaveInput ? (
                    <>
                      <button 
                        className={`save-template-btn ${saved ? 'saved' : ''}`}
                        onClick={() => setShowSaveInput(true)}
                        disabled={!messageTemplate.trim()}
                      >
                        {saved ? (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20,6 9,17 4,12"/>
                            </svg>
                            Saved!
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                              <polyline points="17 21 17 13 7 13 7 21"/>
                              <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Save as New
                          </>
                        )}
                      </button>
                      {hasUnsavedChanges && (
                        <button 
                          className="update-template-btn"
                          onClick={handleUpdateTemplate}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                          </svg>
                          Update "{selectedTemplate?.name}"
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="save-template-form">
                      <div className="template-name-wrapper">
                        <input
                          type="text"
                          className={`template-name-input ${nameError ? 'error' : ''}`}
                          placeholder="Template name..."
                          value={templateName}
                          onChange={(e) => { setTemplateName(e.target.value); setNameError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveTemplate()}
                          autoFocus
                        />
                        {nameError && <span className="name-error">{nameError}</span>}
                      </div>
                      <button 
                        className="save-template-btn confirm"
                        onClick={handleSaveTemplate}
                        disabled={!templateName.trim()}
                      >
                        Save
                      </button>
                      <button 
                        className="cancel-save-btn"
                        onClick={() => { setShowSaveInput(false); setTemplateName(''); setNameError(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Profile Input (shown when scraping fails) */}
            {showManualInput && (
              <div className="manual-input-section">
                <div className="manual-header">
                  <h3>📝 Profile Details</h3>
                  <p>LinkedIn restricts automated access. Please enter the profile details manually:</p>
                </div>
                <div className="manual-grid">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Full Name"
                    value={manualProfile.name}
                    onChange={(e) => setManualProfile({...manualProfile, name: e.target.value})}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Job Title / Headline"
                    value={manualProfile.headline}
                    onChange={(e) => setManualProfile({...manualProfile, headline: e.target.value})}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Company"
                    value={manualProfile.company}
                    onChange={(e) => setManualProfile({...manualProfile, company: e.target.value})}
                  />
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Location"
                    value={manualProfile.location}
                    onChange={(e) => setManualProfile({...manualProfile, location: e.target.value})}
                  />
                  <textarea
                    className="textarea-field about-field"
                    placeholder="About / Summary (optional - paste their bio or key experience)"
                    value={manualProfile.about}
                    onChange={(e) => setManualProfile({...manualProfile, about: e.target.value})}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className={`error-message ${showManualInput ? 'warning' : ''}`}>
                <span className="error-icon">{showManualInput ? '⚠️' : '❌'}</span>
                {error}
              </div>
            )}

            {/* Generate Button */}
            <button 
              className={`generate-btn ${loading ? 'loading' : ''}`}
              onClick={handleGenerate}
              disabled={loading || !messageTemplate.trim()}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Generating...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-icon">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  Generate Personalized Message
                </>
              )}
            </button>
          </section>

          {/* Output Section */}
          {generatedMessage && (
            <section className="output-section">
              <div className="output-card">
                <div className="output-header">
                  <div className="output-title">
                    <div className="success-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20,6 9,17 4,12"/>
                      </svg>
                      Generated
                    </div>
                    <h3>Your Personalized Message</h3>
                  </div>
                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                    {copied ? (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20,6 9,17 4,12"/>
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {profileData && (
                  <div className="profile-preview">
                    <div className="profile-avatar">
                      {profileData.name?.charAt(0) || '?'}
                    </div>
                    <div className="profile-info">
                      <span className="profile-name">{profileData.name}</span>
                      <span className="profile-headline">{profileData.headline || profileData.company}</span>
                    </div>
                  </div>
                )}

                <div className="message-output">
                  {generatedMessage}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

    </div>
  )
}

export default App
