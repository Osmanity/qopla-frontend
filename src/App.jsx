import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [sessionId, setSessionId] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(null)
  const urlInputRef = useRef(null)

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
      console.log('Sending request to:', `${API_URL}/api/scrape`)
      const res = await fetch(`${API_URL}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        setError(`Servern returnerade fel (${res.status}): ${errorText || 'Okänt fel'}`)
        setIsLoading(false)
        return
      }
      
      const data = await res.json()
      console.log('Response:', data)
      
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
      console.error('Request failed:', err)
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
            <h1>QoplaSnap</h1>
          </div>
          <p className="tagline">Ladda ner bilder från valfri Qopla-restaurang</p>
        </header>

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
              
              {error && <div className="error animate-shake">{error}</div>}
              
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
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${(progress.progress / progress.total) * 100}%` }}
                    ></div>
                    <div 
                      className="progress-bar-downloaded" 
                      style={{ width: `${((progress.images?.length || 0) / progress.total) * 100}%` }}
                    ></div>
                    <span className="progress-text">
                      {progress.images?.length || 0} / {progress.total}
                    </span>
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

        <footer className="footer">
          <p>Klistra in länken till en Qopla beställningssida för att komma igång</p>
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
