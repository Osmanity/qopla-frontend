import { useState, useEffect, useRef } from 'react'
import './App.css'

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function App() {
  const [activeTab, setActiveTab] = useState('scrape')
  
  // === SCRAPE STATE ===
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(null)
  const [imageSize, setImageSize] = useState('original')
  const [showFilters, setShowFilters] = useState(false)
  const urlInputRef = useRef(null)

  // === COMPRESS STATE (unified) ===
  const [compressFiles, setCompressFiles] = useState([])
  const [compressSessionId, setCompressSessionId] = useState(null)
  const [compressProgress, setCompressProgress] = useState(null)
  const [compressSingleResult, setCompressSingleResult] = useState(null)
  const [compressLoading, setCompressLoading] = useState(false)
  const [compressError, setCompressError] = useState('')
  const [compressDragOver, setCompressDragOver] = useState(false)

  const compressFilesInputRef = useRef(null)
  const compressFolderInputRef = useRef(null)

  const selectedImage = selectedImageIndex !== null && progress?.images 
    ? progress.images[selectedImageIndex] 
    : null

  const goToNextImage = () => {
    if (progress?.images && selectedImageIndex !== null) {
      setSelectedImageIndex((prev) => 
        prev < progress.images.length - 1 ? prev + 1 : 0
      )
    }
  }

  const goToPrevImage = () => {
    if (progress?.images && selectedImageIndex !== null) {
      setSelectedImageIndex((prev) => 
        prev > 0 ? prev - 1 : progress.images.length - 1
      )
    }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedImageIndex === null) return
      
      if (e.key === 'ArrowRight') {
        goToNextImage()
      } else if (e.key === 'ArrowLeft') {
        goToPrevImage()
      } else if (e.key === 'Escape') {
        setSelectedImageIndex(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImageIndex, progress?.images])

  const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').trim()

  // === SCRAPE PROGRESS POLLING ===
  useEffect(() => {
    let interval
    let failCount = 0
    const maxFails = 5
    
    if (sessionId && progress?.status !== 'completed' && progress?.status !== 'error') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/progress/${sessionId}`)
          
          if (!res.ok) {
            failCount++
            console.error(`Progress check failed: ${res.status}`)
            if (failCount >= maxFails) {
              setError(`Servern svarar inte (${res.status}). Försök igen.`)
              setProgress(null)
              setSessionId(null)
              setIsLoading(false)
              clearInterval(interval)
            }
            return
          }
          
          failCount = 0
          const data = await res.json()
          setProgress(data)
          
          if (data.status === 'completed' || data.status === 'error') {
            setIsLoading(false)
            if (data.status === 'error' && data.error) {
              setError(data.error)
            }
          }
        } catch (err) {
          failCount++
          console.error('Progress check failed:', err)
          if (failCount >= maxFails) {
            setError('Tappade anslutningen till servern. Försök igen.')
            setProgress(null)
            setSessionId(null)
            setIsLoading(false)
            clearInterval(interval)
          }
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [sessionId, progress?.status])

  // === COMPRESS PROGRESS POLLING ===
  useEffect(() => {
    let interval
    
    if (compressSessionId && compressProgress?.status !== 'completed') {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/compress/batch-progress/${compressSessionId}`)
          if (res.ok) {
            const data = await res.json()
            setCompressProgress(data)
            if (data.status === 'completed') {
              setCompressLoading(false)
            }
          }
        } catch (err) {
          console.error('Compress progress check failed:', err)
        }
      }, 500)
    }
    return () => clearInterval(interval)
  }, [compressSessionId, compressProgress?.status])

  // === SCRAPE HANDLERS ===
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setProgress(null)
    
    const url = urlInputRef.current?.value || ''
    
    if (!url.includes('qopla.com')) {
      setError('Ange en giltig Qopla URL')
      return
    }

    setIsLoading(true)
    
    try {
      const endpoint = `${API_URL}/api/scrape-turbo`
      const body = { url, imageSize }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        setError(`Servern returnerade fel (${res.status}): ${errorText || 'Okänt fel'}`)
        setIsLoading(false)
        return
      }
      
      const data = await res.json()
      
      if (data.error) {
        setError(data.error)
        setIsLoading(false)
        return
      }
      
      if (!data.sessionId) {
        setError('Servern returnerade inget sessions-ID. Kontrollera backend.')
        setIsLoading(false)
        return
      }
      
      setSessionId(data.sessionId)
      setProgress({ status: 'starting' })
    } catch (err) {
      setError(`Kunde inte ansluta till servern: ${err.message}`)
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (sessionId) {
      window.open(`${API_URL}/api/download/${sessionId}`, '_blank')
    }
  }

  const getStatusText = (status) => {
    const statuses = {
      starting: 'Startar...',
      launching: 'Startar webbläsare...',
      navigating: 'Navigerar till sidan...',
      finding_products: 'Söker efter produkter...',
      scraping: 'Hämtar bilder...',
      extracting_urls: 'Extraherar bild-URLs...',
      downloading_turbo: 'Laddar ner bilder direkt...',
      completed: 'Klart!',
      error: 'Ett fel uppstod'
    }
    return statuses[status] || status
  }

  const resetForm = () => {
    if (urlInputRef.current) {
      urlInputRef.current.value = ''
    }
    setSessionId(null)
    setProgress(null)
    setError('')
    setIsLoading(false)
    setSelectedImageIndex(null)
    setImageSize('original')
    setShowFilters(false)
  }

  // === COMPRESS HANDLERS (unified) ===
  const handleCompressAddFiles = (files, append = true) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setCompressError('Inga giltiga bildfiler hittades')
      return
    }
    if (append && compressFiles.length > 0) {
      setCompressFiles(prev => {
        const existingKeys = new Set(prev.map(f => (f.webkitRelativePath || f.name) + f.size))
        const newFiles = imageFiles.filter(f => !existingKeys.has((f.webkitRelativePath || f.name) + f.size))
        return [...prev, ...newFiles]
      })
    } else {
      setCompressFiles(imageFiles)
    }
    setCompressProgress(null)
    setCompressSessionId(null)
    setCompressSingleResult(null)
    setCompressError('')
  }

  const handleCompressDrop = (e) => {
    e.preventDefault()
    setCompressDragOver(false)
    handleCompressAddFiles(e.dataTransfer.files, compressFiles.length > 0)
  }

  const handleCompressSubmit = async () => {
    if (compressFiles.length === 0) return
    setCompressLoading(true)
    setCompressError('')
    setCompressProgress(null)
    setCompressSingleResult(null)

    try {
      if (compressFiles.length === 1) {
        // Single file -- use single endpoint for instant result
        const formData = new FormData()
        formData.append('image', compressFiles[0])
        formData.append('targetMB', '5')

        const res = await fetch(`${API_URL}/api/compress`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Servern svarade med ${res.status}`)
        }

        const data = await res.json()
        setCompressSingleResult(data)
        setCompressLoading(false)
      } else {
        // Multiple files -- use batch endpoint
        const formData = new FormData()
        compressFiles.forEach(file => formData.append('images', file))
        formData.append('targetMB', '5')
        // Send relative paths to preserve folder structure in ZIP
        const relativePaths = compressFiles.map(f => f.webkitRelativePath || f.name)
        formData.append('relativePaths', JSON.stringify(relativePaths))

        const res = await fetch(`${API_URL}/api/compress-batch`, {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Servern svarade med ${res.status}`)
        }

        const data = await res.json()
        setCompressSessionId(data.sessionId)
        setCompressProgress({ status: 'processing', total: data.total, processed: 0, results: [] })
      }
    } catch (err) {
      setCompressError(err.message)
      setCompressLoading(false)
    }
  }

  const handleCompressDownload = () => {
    if (compressSingleResult?.sessionId) {
      window.open(`${API_URL}/api/compress/download/${compressSingleResult.sessionId}`, '_blank')
    } else if (compressSessionId) {
      window.open(`${API_URL}/api/compress/batch-download/${compressSessionId}`, '_blank')
    }
  }

  const resetCompress = () => {
    setCompressFiles([])
    setCompressSessionId(null)
    setCompressProgress(null)
    setCompressSingleResult(null)
    setCompressError('')
    setCompressLoading(false)
    if (compressFilesInputRef.current) compressFilesInputRef.current.value = ''
    if (compressFolderInputRef.current) compressFolderInputRef.current.value = ''
  }

  return (
    <div className="app">
      <div className="background-pattern"></div>
      <div className="floating-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>
      
      <main className="container">
        <header className="header">
          <div className="logo">
            <div className="logo-mark">Q</div>
            <h1>QoplaSnap</h1>
          </div>
          <p className="tagline">Hämta och komprimera produktbilder från Qopla</p>
        </header>

        {/* TAB NAVIGATION */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'scrape' ? 'active' : ''}`}
            onClick={() => setActiveTab('scrape')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Hämta från Qopla
          </button>
          <button
            className={`tab ${activeTab === 'compress' ? 'active' : ''}`}
            onClick={() => setActiveTab('compress')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"></polyline>
              <polyline points="20 10 14 10 14 4"></polyline>
              <line x1="14" y1="10" x2="21" y2="3"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            Komprimera bilder
          </button>
        </div>

        {/* ==================== SCRAPE TAB ==================== */}
        {activeTab === 'scrape' && (
          <div className="card">
            {!progress || progress.status === 'error' ? (
              <form onSubmit={handleSubmit} className="form">
                <div className="input-group">
                  <label htmlFor="url">Qopla URL</label>
                  <input
                    id="url"
                    type="url"
                    ref={urlInputRef}
                    placeholder="https://qopla.com/restaurant/namn/id/order"
                    disabled={isLoading}
                  />
                </div>

                {showFilters && (
                  <div className="size-selection">
                    <label className="size-label">Bildstorlek</label>
                    <div className="size-options">
                      {['small', 'medium', 'large', 'original'].map((size) => (
                        <label key={size} className={`size-option ${imageSize === size ? 'selected' : ''}`}>
                          <input 
                            type="radio" 
                            name="imageSize" 
                            value={size} 
                            checked={imageSize === size}
                            onChange={(e) => setImageSize(e.target.value)}
                            disabled={isLoading}
                          />
                          <span className="size-radio"></span>
                          <span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {error && <div className="error animate-shake">{error}</div>}
                
                <div className="button-group">
                  <button type="submit" disabled={isLoading} className="btn-primary">
                    {isLoading ? (
                      <>
                        <span className="spinner"></span>
                        Bearbetar...
                      </>
                    ) : (
                      'Hämta bilder'
                    )}
                  </button>
                  <button 
                    type="button" 
                    className={`btn-filter ${showFilters ? 'active' : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                    disabled={isLoading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                    </svg>
                  </button>
                </div>
              </form>
            ) : (
              <div className="progress-section">
                <div className="status-header">
                  <div className={`status-badge ${progress.status} animate-pulse-subtle`}>
                    {progress.status === 'completed' ? '✓' : progress.status === 'error' ? '✗' : ''}
                    {getStatusText(progress.status)}
                  </div>
                </div>

                {progress.total > 0 && (
                  <div className="progress-info">
                    <span className="progress-text">
                      {progress.images?.length || 0} / {progress.total}
                    </span>
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar" 
                        style={{ width: `${(progress.progress / progress.total) * 100}%` }}
                      ></div>
                      <div 
                        className="progress-bar-downloaded" 
                        style={{ width: `${((progress.images?.length || 0) / progress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {progress.images && progress.images.length > 0 && (
                  <div className="images-section">
                    <h3 className="images-title">
                      Hämtade bilder ({progress.images.length})
                    </h3>
                    
                    <div className="images-layout">
                      <div className="latest-image-container">
                        <div 
                          className="latest-image-card animate-scale-in"
                          key={progress.images[progress.images.length - 1]?.imagePath}
                          onClick={() => setSelectedImageIndex(progress.images.length - 1)}
                        >
                          <div className="latest-image-wrapper">
                            <img 
                              src={`${API_URL}${progress.images[progress.images.length - 1]?.imagePath}`} 
                              alt={progress.images[progress.images.length - 1]?.productName}
                            />
                          </div>
                          <div className="latest-image-info">
                            <span className="latest-image-name">
                              {progress.images[progress.images.length - 1]?.productName || progress.images[progress.images.length - 1]?.filename}
                            </span>
                            <span className="latest-image-number">#{progress.images.length}</span>
                          </div>
                        </div>
                      </div>

                      <div className="images-gallery-container">
                        <div className="images-gallery">
                          {progress.images.slice(0, -1).map((img, idx) => (
                            <div 
                              key={img.imagePath || idx} 
                              className="image-card"
                              style={{ animationDelay: `${Math.min(idx, 10) * 0.03}s` }}
                              onClick={() => setSelectedImageIndex(idx)}
                            >
                              <div className="image-wrapper">
                                <img 
                                  src={`${API_URL}${img.imagePath}`} 
                                  alt={img.productName || img.filename}
                                  loading="lazy"
                                  onError={(e) => {
                                    e.target.style.display = 'none'
                                    e.target.nextSibling.style.display = 'flex'
                                  }}
                                />
                                <div className="image-placeholder" style={{ display: 'none' }}>
                                  <span>?</span>
                                </div>
                              </div>
                              <span className="image-name">{img.productName || img.filename}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {progress.status === 'completed' && (
                  <div className="completed-section animate-fade-up">
                    <div className="success-message">
                      <span className="success-icon">✓</span>
                      <p>{progress.images?.length || 0} bilder hämtades!</p>
                    </div>
                    
                    <div className="action-buttons">
                      <button onClick={handleDownload} className="btn-primary btn-download">
                        Ladda ner ZIP
                      </button>
                      <button onClick={resetForm} className="btn-secondary">
                        Börja om
                      </button>
                    </div>
                    <p className="download-notice">Bilderna raderas efter nedladdning</p>
                  </div>
                )}

                {progress.status === 'error' && (
                  <div className="error-section animate-fade-up">
                    <p>{progress.error}</p>
                    <button onClick={resetForm} className="btn-secondary">
                      Försök igen
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ==================== COMPRESS TAB ==================== */}
        {activeTab === 'compress' && (
          <div className="card compress-card">
            <h2 className="compress-section-title">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Komprimera bilder
            </h2>
            <p className="compress-desc">
              Ladda upp en eller flera bilder och komprimera till max 5 MB per bild.
              Flera bilder laddas ner som ZIP.
            </p>

            {/* === FILE SELECTION VIEW === */}
            {!compressProgress && !compressSingleResult ? (
              <div className="compress-form">
                {/* Hidden inputs */}
                <input
                  ref={compressFilesInputRef}
                  type="file"
                  accept="image/*"
                  multiple={true}
                  style={{ display: 'none' }}
                  onChange={(e) => handleCompressAddFiles(e.target.files, compressFiles.length > 0)}
                />
                <input
                  ref={compressFolderInputRef}
                  type="file"
                  accept="image/*"
                  multiple={true}
                  webkitdirectory=""
                  style={{ display: 'none' }}
                  onChange={(e) => handleCompressAddFiles(e.target.files, compressFiles.length > 0)}
                />

                {/* Drop zone */}
                <div
                  className={`drop-zone ${compressDragOver ? 'drag-over' : ''} ${compressFiles.length > 0 ? 'has-file' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setCompressDragOver(true) }}
                  onDragLeave={() => setCompressDragOver(false)}
                  onDrop={handleCompressDrop}
                >
                  {compressFiles.length > 0 ? (
                    <div className="drop-zone-batch-info">
                      <div className="batch-file-count">
                        <span className="batch-count-number">{compressFiles.length}</span>
                        <span>{compressFiles.length === 1 ? 'bild vald' : 'bilder valda'}</span>
                      </div>
                      <span className="drop-zone-filesize">
                        Totalt: {formatSize(compressFiles.reduce((sum, f) => sum + f.size, 0))}
                      </span>
                      <span className="drop-zone-sub">Dra fler bilder hit eller använd knapparna nedan</span>
                    </div>
                  ) : (
                    <div className="drop-zone-placeholder">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                      <span>Dra och släpp bilder hit</span>
                      <span className="drop-zone-sub">eller använd knapparna nedan</span>
                    </div>
                  )}
                </div>

                {/* Two pick-buttons */}
                <div className="batch-pick-buttons">
                  <button
                    type="button"
                    className="btn-pick"
                    onClick={() => compressFilesInputRef.current?.click()}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                    Välj bilder
                  </button>
                  <button
                    type="button"
                    className="btn-pick"
                    onClick={() => compressFolderInputRef.current?.click()}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    Välj mapp
                  </button>
                </div>

                {compressError && <div className="error animate-shake">{compressError}</div>}

                {/* File list */}
                {compressFiles.length > 0 && (
                  <div className="batch-file-list">
                    {compressFiles.map((file, i) => (
                      <div key={(file.webkitRelativePath || file.name) + file.size + i} className="batch-file-item">
                        <span className="batch-file-item-name" title={file.webkitRelativePath || file.name}>
                          {file.webkitRelativePath || file.name}
                        </span>
                        <span className="batch-file-item-size">{formatSize(file.size)}</span>
                        <button
                          className="batch-file-item-remove"
                          onClick={() => setCompressFiles(prev => prev.filter((_, idx) => idx !== i))}
                          title="Ta bort"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="compress-actions">
                  <button
                    className="btn-primary"
                    onClick={handleCompressSubmit}
                    disabled={compressFiles.length === 0 || compressLoading}
                  >
                    {compressLoading ? (
                      <>
                        <span className="spinner"></span>
                        Komprimerar...
                      </>
                    ) : compressFiles.length <= 1 ? (
                      'Komprimera till 5 MB'
                    ) : (
                      `Komprimera ${compressFiles.length} bilder till 5 MB`
                    )}
                  </button>
                  {compressFiles.length > 0 && (
                    <button className="btn-secondary" onClick={resetCompress}>
                      Rensa
                    </button>
                  )}
                </div>
              </div>

            /* === SINGLE RESULT VIEW === */
            ) : compressSingleResult ? (
              <div className="compress-result animate-fade-up">
                <div className="compress-stats">
                  <div className="compress-stat">
                    <span className="compress-stat-label">Originell storlek</span>
                    <span className="compress-stat-value">{formatSize(compressSingleResult.originalSize)}</span>
                  </div>
                  <div className="compress-stat-arrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </div>
                  <div className="compress-stat">
                    <span className="compress-stat-label">Komprimerad</span>
                    <span className="compress-stat-value highlight">{formatSize(compressSingleResult.compressedSize)}</span>
                  </div>
                  <div className="compress-stat">
                    <span className="compress-stat-label">Minskning</span>
                    <span className="compress-stat-value savings">
                      {compressSingleResult.alreadySmall
                        ? 'Redan under 5 MB'
                        : `-${Math.round((1 - compressSingleResult.compressedSize / compressSingleResult.originalSize) * 100)}%`}
                    </span>
                  </div>
                </div>

                <div className="action-buttons">
                  <button onClick={handleCompressDownload} className="btn-primary btn-download">
                    Ladda ner komprimerad bild
                  </button>
                  <button onClick={resetCompress} className="btn-secondary">
                    Börja om
                  </button>
                </div>
              </div>

            /* === BATCH PROGRESS VIEW === */
            ) : compressProgress ? (
              <div className="batch-progress-section">
                <div className="progress-info">
                  <span className="progress-text">
                    {compressProgress.processed || 0} / {compressProgress.total}
                  </span>
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar-downloaded" 
                      style={{ width: `${((compressProgress.processed || 0) / compressProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {compressProgress.results && compressProgress.results.length > 0 && (
                  <div className="batch-results">
                    <div className="batch-results-header">
                      <span>Filnamn</span>
                      <span>Original</span>
                      <span>Komprimerad</span>
                      <span>Minskning</span>
                    </div>
                    <div className="batch-results-list">
                      {compressProgress.results.map((r, i) => (
                        <div key={i} className={`batch-result-row ${r.error ? 'error-row' : ''}`}>
                          <span className="batch-result-name">{r.originalName}</span>
                          <span>{formatSize(r.originalSize)}</span>
                          <span>{r.error ? 'Fel' : formatSize(r.compressedSize)}</span>
                          <span className={r.error ? '' : 'savings'}>
                            {r.error
                              ? r.error
                              : r.compressedSize >= r.originalSize
                                ? 'Redan OK'
                                : `-${Math.round((1 - r.compressedSize / r.originalSize) * 100)}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {compressProgress.status === 'completed' && (
                  <div className="completed-section animate-fade-up">
                    <div className="success-message">
                      <span className="success-icon">✓</span>
                      <p>{compressProgress.results?.filter(r => !r.error).length} bilder komprimerades!</p>
                    </div>
                    <div className="action-buttons">
                      <button onClick={handleCompressDownload} className="btn-primary btn-download">
                        Ladda ner alla som ZIP
                      </button>
                      <button onClick={resetCompress} className="btn-secondary">
                        Börja om
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        <footer className="footer">
          <p>
            {activeTab === 'scrape'
              ? 'Klistra in länken till en Qopla beställningssida för att komma igång'
              : 'Ladda upp bilder för att komprimera dem till max 5 MB'}
          </p>
        </footer>
      </main>

      {selectedImage && (
        <div className="lightbox" onClick={() => setSelectedImageIndex(null)}>
          {selectedImageIndex > 0 && (
            <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); goToPrevImage(); }}>
              ‹
            </button>
          )}
          
          <div className="lightbox-content animate-zoom-in" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setSelectedImageIndex(null)}>×</button>
            <img src={`${API_URL}${selectedImage.imagePath}`} alt={selectedImage.productName} />
            <div className="lightbox-info">
              <h3>{selectedImage.productName}</h3>
              <p className="lightbox-counter">{selectedImageIndex + 1} / {progress.images.length}</p>
            </div>
          </div>
          
          {selectedImageIndex < progress.images.length - 1 && (
            <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); goToNextImage(); }}>
              ›
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default App
