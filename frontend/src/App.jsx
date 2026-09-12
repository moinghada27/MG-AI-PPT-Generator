import { useEffect, useMemo, useState } from 'react';

const slideOptions = [5, 8, 10, 12, 15, 20];
const styleOptions = ['Academic', 'Modern', 'Minimal', 'Professional', 'Colorful', 'Engineering / Technical'];

const initialForm = {
  professorName: 'Prof. Moin Ghada',
  chapterName: 'Wave Physics and Classical Optics',
  topicDetails: 'Wave equations, plane and spherical wave propagation, Fermat\'s principle, interference of light, Young\'s double slit experiment, Newton\'s rings, diffraction of light through slits and gratings, polarization of light.',
  slideCount: 10,
  style: 'Academic',
};

const initialAuthForm = {
  name: '',
  mobile: '',
  role: '',
  password: '',
};

const steps = [
  'Analyzing your topic...',
  'Creating slide structure...',
  'Generating educational content...',
  'Designing PowerPoint slides...',
  'Finalizing presentation...',
  'Your PPT is ready!',
];

async function readApiResponse(response) {
  const responseText = await response.text();
  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(response.ok
      ? 'The server returned an invalid response.'
      : `The API request failed (${response.status}). Please check the deployment API route.`);
  }
}

function App() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [authErrors, setAuthErrors] = useState({});
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [presentationHistory, setPresentationHistory] = useState([]);
  const [editingSlideIndex, setEditingSlideIndex] = useState(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [sharedPresentation, setSharedPresentation] = useState(null);
  const [shareError, setShareError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const isSharePage = window.location.pathname.startsWith('/share/');
  const [theme, setTheme] = useState(() => window.localStorage.getItem('ai-ppt-theme') || 'dark');

  const progressLabel = useMemo(() => steps[Math.min(progressIndex, steps.length - 1)], [progressIndex]);

  useEffect(() => {
    if (!user) {
      setPresentationHistory([]);
      return;
    }

    try {
      const savedHistory = JSON.parse(window.localStorage.getItem(`ai-ppt-history-${user.mobile}`) || '[]');
      setPresentationHistory(Array.isArray(savedHistory) ? savedHistory : []);
    } catch (error) {
      setPresentationHistory([]);
    }
  }, [user]);

  useEffect(() => {
    if (!isSharePage) return;

    const presentationId = window.location.pathname.split('/').filter(Boolean).pop();
    fetch(`/api/share/${presentationId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'This shared presentation is unavailable.');
        setSharedPresentation(data.presentation);
      })
      .catch((error) => setShareError(error.message));
  }, [isSharePage]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem('ai-ppt-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark');
  };

  const triggerDownload = (url, fileName) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const updateAuthField = (field, value) => {
    setAuthForm((prev) => ({ ...prev, [field]: value }));
    setAuthErrors((prev) => ({ ...prev, [field]: '' }));
    setAuthMessage('');
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    const mobileDigits = authForm.mobile.replace(/\D/g, '');
    const nextErrors = {};

    if (authMode === 'register' && !authForm.name.trim()) nextErrors.name = 'Please enter your name.';
    if (mobileDigits.length !== 10) nextErrors.mobile = 'Please enter a valid 10-digit mobile number.';
    if (authMode === 'register' && !authForm.role) nextErrors.role = 'Please select Student or Teacher.';
    if (authForm.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';

    setAuthErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmittingAuth(true);
    setAuthMessage(authMode === 'register' ? 'Creating your account...' : 'Signing you in...');

    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authForm.name.trim(),
          mobile: mobileDigits,
          role: authForm.role,
          password: authForm.password,
        }),
      });
      const data = await readApiResponse(response);

      if (!response.ok) throw new Error(data.error || 'Unable to authenticate.');

      setUser(data.user);
      setAuthForm(initialAuthForm);
    } catch (error) {
      setAuthMessage(error.message || 'Unable to authenticate right now.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setResult(null);
    setEditingSlideIndex(null);
    setPreviewSlideIndex(0);
    setAuthMode('login');
    setAuthErrors({});
    setAuthMessage('');
  };

  const handleDeleteAccount = async () => {
    const password = window.prompt('Enter your password to permanently delete your account.');
    if (password === null) return;

    if (password.length < 8) {
      window.alert('Please enter your current password.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      const response = await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: user.mobile, password }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Unable to delete your account.');

      handleLogout();
      window.alert('Your account has been deleted.');
    } catch (error) {
      window.alert(error.message || 'Unable to delete your account right now.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!form.professorName.trim()) {
      newErrors.professorName = 'Please enter professor name.';
    }

    if (!form.chapterName.trim()) {
      newErrors.chapterName = 'Please enter chapter name.';
    }

    if (!form.topicDetails.trim()) {
      newErrors.topicDetails = 'Please enter topic details.';
    }

    return newErrors;
  };

  const handleGenerate = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsLoading(true);
    setProgressIndex(0);
    setResult(null);
    setEditingSlideIndex(null);

    const progressTimer = setInterval(() => {
      setProgressIndex((prev) => {
        const next = prev + 1;
        return next >= steps.length ? steps.length - 1 : next;
      });
    }, 1200);

    try {
      const response = await fetch('/api/preview-ppt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          professorName: form.professorName,
          chapterName: form.chapterName,
          topicDetails: form.topicDetails,
          slideCount: Number(form.slideCount),
          style: form.style,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong while generating your presentation. Please try again.');
      }

      const { presentation, presentationId } = data;
      const fileName = `${(presentation.presentationTitle || 'AI_Presentation').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.pptx`;
      const historyEntry = {
        id: crypto.randomUUID(),
        title: presentation.presentationTitle,
        professorName: form.professorName,
        chapterName: form.chapterName,
        topicDetails: form.topicDetails,
        slideCount: Number(form.slideCount),
        style: form.style,
        fileName,
        createdAt: new Date().toISOString(),
      };
      const nextHistory = [historyEntry, ...presentationHistory].slice(0, 10);
      setPresentationHistory(nextHistory);
      window.localStorage.setItem(`ai-ppt-history-${user.mobile}`, JSON.stringify(nextHistory));

      setResult({
        title: presentation.presentationTitle,
        professorName: presentation.professorName,
        chapterName: presentation.chapterName,
        slideCount: presentation.slides.length,
        fileName,
        presentationId,
        slides: presentation.slides,
      });
      setPreviewSlideIndex(0);

      setProgressIndex(steps.length - 1);
    } catch (error) {
      alert(error.message || 'Something went wrong while generating your presentation. Please try again.');
      setProgressIndex(0);
    } finally {
      clearInterval(progressTimer);
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result?.presentationId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/download-ppt/${result.presentationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: result.slides }),
      });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.includes('presentationml')) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The preview has expired. Please generate a new presentation.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      triggerDownload(url, result.fileName || 'presentation.pptx');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(error.message || 'Unable to download the presentation right now.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!result?.presentationId) return;

    setIsDownloadingPdf(true);
    try {
      const response = await fetch(`/api/download-pdf/${result.presentationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides: result.slides }),
      });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.includes('application/pdf')) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to create the PDF right now.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      triggerDownload(url, `${result.fileName.replace(/\.pptx$/i, '')}.pdf`);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(error.message || 'Unable to download the PDF right now.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleShare = async () => {
    if (!result?.presentationId) return;

    const shareUrl = `${window.location.origin}/share/${result.presentationId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2200);
    } catch (error) {
      window.prompt('Copy this presentation link:', shareUrl);
    }
  };

  const updatePreviewSlide = (slideIndex, field, value) => {
    setResult((currentResult) => ({
      ...currentResult,
      slides: currentResult.slides.map((slide, index) => index === slideIndex
        ? { ...slide, [field]: field === 'content' ? value.split('\n').filter((line) => line.trim()) : value }
        : slide),
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setErrors({});
    setResult(null);
    setEditingSlideIndex(null);
    setPreviewSlideIndex(0);
    setProgressIndex(0);
  };

  const reuseHistoryEntry = (entry) => {
    setForm({
      professorName: entry.professorName,
      chapterName: entry.chapterName,
      topicDetails: entry.topicDetails,
      slideCount: entry.slideCount,
      style: entry.style,
    });
    setErrors({});
    setResult(null);
    setEditingSlideIndex(null);
    setPreviewSlideIndex(0);
    setProgressIndex(0);
  };

  const clearPresentationHistory = () => {
    setPresentationHistory([]);
    window.localStorage.removeItem(`ai-ppt-history-${user.mobile}`);
  };

  const removeHistoryEntry = (entryId, entryIndex) => {
    const entry = presentationHistory[entryIndex];
    if (!window.confirm(`Remove "${entry?.title || 'this presentation'}" from history?`)) return;

    const nextHistory = presentationHistory.filter((historyEntry, index) => (
      index !== entryIndex && (entryId == null || historyEntry.id !== entryId)
    ));
    setPresentationHistory(nextHistory);
    window.localStorage.setItem(`ai-ppt-history-${user.mobile}`, JSON.stringify(nextHistory));
  };

  if (isSharePage) {
    return (
      <div className="page-shell share-page">
        <section className="share-shell card">
          <div className="share-brand">MG AI PPT Generator</div>
          {shareError ? (
            <div className="share-empty">
              <h1>Shared presentation unavailable</h1>
              <p>{shareError}</p>
            </div>
          ) : !sharedPresentation ? (
            <div className="share-empty"><h1>Loading presentation...</h1></div>
          ) : (
            <>
              <p className="kicker share-kicker">Shared presentation</p>
              <h1>{sharedPresentation.presentationTitle}</h1>
              <p className="share-meta">{sharedPresentation.chapterName} · Presented by {sharedPresentation.professorName}</p>
              <div className="share-slide-list">
                {sharedPresentation.slides.map((slide, index) => (
                  <article className="share-slide" key={slide.slideNumber || index}>
                    <span className="slide-number">{String(slide.slideNumber || index + 1).padStart(2, '0')}</span>
                    <h2>{slide.title}</h2>
                    <ul>{slide.content.slice(0, 6).map((point, pointIndex) => <li key={`${point}-${pointIndex}`}>{point}</li>)}</ul>
                    {slide.formula && <div className="slide-formula">{slide.formula}</div>}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`page-shell login-page ${theme}-mode`}>
        <button className="theme-toggle login-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀ Light' : '◐ Dark'}
        </button>
        <div className="auth-atmosphere" aria-hidden="true">
          <span className="atmosphere-orb atmosphere-orb-one" />
          <span className="atmosphere-orb atmosphere-orb-two" />
          <div className="auth-tilt-stack">
            <div className="tilt-sheet tilt-sheet-back" />
            <div className="tilt-sheet tilt-sheet-middle" />
            <div className="tilt-sheet tilt-sheet-front">
              <span>AI</span>
              <strong>PPT</strong>
              <small>CREATE</small>
            </div>
          </div>
        </div>
        <section className="login-card card">
          <div className="brand-wrap login-brand">
            <div className="brand-mark" aria-label="MG logo - MOIN GHADA" role="img">
              <span className="brand-face brand-face-back" />
              <span className="brand-face brand-face-side" />
              <span className="brand-face brand-face-front"><span className="brand-monogram"><b className="brand-letter-m">M</b><b className="brand-letter-g">G</b></span></span>
              <span className="brand-orbit" aria-hidden="true" />
              <span className="brand-spark" aria-hidden="true">✦</span>
            </div>
            <div>
              <p className="brand-founder">MOIN GHADA</p>
              <p className="eyebrow">Welcome</p>
              <h1>MG AI PPT Generator</h1>
            </div>
          </div>

          <div className="auth-tabs">
            <button type="button" className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthMode('login'); setAuthErrors({}); setAuthMessage(''); }}>
              Login
            </button>
            <button type="button" className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthMode('register'); setAuthErrors({}); setAuthMessage(''); }}>
              Register
            </button>
          </div>

          <p className="auth-switch-hint">
            {authMode === 'login' ? 'New user? Choose Register to create an account.' : 'Already have an account? Choose Login.'}
          </p>

          <p className="login-intro">
            {authMode === 'login' ? 'Log in to create your presentation.' : 'Create an account to get started.'}
          </p>

          <form onSubmit={handleAuthSubmit}>
            {authMode === 'register' && <div className="field-group">
              <label htmlFor="authName">Your Name</label>
              <input
                id="authName"
                type="text"
                placeholder="Enter your name"
                value={authForm.name}
                onChange={(event) => updateAuthField('name', event.target.value)}
              />
              {authErrors.name && <span className="error-text">{authErrors.name}</span>}
            </div>}

            <div className="field-group">
              <label htmlFor="authMobile">Mobile Number</label>
              <input
                id="authMobile"
                type="tel"
                inputMode="numeric"
                placeholder="Enter 10-digit mobile number"
                value={authForm.mobile}
                onChange={(event) => updateAuthField('mobile', event.target.value)}
              />
              {authErrors.mobile && <span className="error-text">{authErrors.mobile}</span>}
            </div>

            {authMode === 'register' && <fieldset className="role-group">
              <legend>I am a</legend>
              <div className="role-options">
                {['Student', 'Teacher'].map((role) => (
                  <label className="role-option" key={role}>
                    <input
                      type="radio"
                      name="authRole"
                      value={role}
                      checked={authForm.role === role}
                      onChange={(event) => updateAuthField('role', event.target.value)}
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>
              {authErrors.role && <span className="error-text">{authErrors.role}</span>}
            </fieldset>}

            <div className="field-group">
              <label htmlFor="authPassword">Password</label>
              <input
                id="authPassword"
                type="password"
                placeholder="At least 8 characters"
                value={authForm.password}
                onChange={(event) => updateAuthField('password', event.target.value)}
              />
              {authErrors.password && <span className="error-text">{authErrors.password}</span>}
            </div>

            <button className="primary-btn" type="submit" disabled={isSubmittingAuth}>
              {isSubmittingAuth ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </form>

          {authMessage && <p className="profile-message">{authMessage}</p>}
        </section>
        <p className="developer-credit">Designed &amp; developed by MOIN GHADA</p>
        <a className="customer-care" href="tel:9213513011">Customer care: 9213513011</a>
      </div>
    );
  }

  return (
    <div className={`page-shell ${theme}-mode`}>
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark" aria-label="MG logo - MOIN GHADA" role="img">
            <span className="brand-face brand-face-back" />
            <span className="brand-face brand-face-side" />
            <span className="brand-face brand-face-front"><span className="brand-monogram"><b className="brand-letter-m">M</b><b className="brand-letter-g">G</b></span></span>
            <span className="brand-orbit" aria-hidden="true" />
            <span className="brand-spark" aria-hidden="true">✦</span>
          </div>
          <div>
            <span className="premium-badge">Premium Studio</span>
            <p className="brand-founder">MOIN GHADA</p>
            <p className="eyebrow">Powered by Gemini</p>
            <h1>MG AI PPT Generator</h1>
          </div>
        </div>
        <div className="account-controls">
          <span className="account-name">{user.name}</span>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀ Light' : '◐ Dark'}
          </button>
          <button className="secondary-btn account-btn" type="button" onClick={handleLogout}>
            Log out
          </button>
          <button className="danger-btn account-btn" type="button" onClick={handleDeleteAccount} disabled={isDeletingAccount}>
            {isDeletingAccount ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
      </header>

      <main className="app-shell">
        <section className="dashboard-panel card">
          <div>
            <p className="kicker dashboard-kicker">{user.role} workspace</p>
            <h2>Welcome back, {user.name}</h2>
            <p className="dashboard-subtitle">Create, review, and share your educational presentations.</p>
          </div>
          <div className="dashboard-stats">
            <div><strong>{presentationHistory.length}</strong><span>Saved presentations</span></div>
            <div><strong>{presentationHistory.reduce((total, entry) => total + Number(entry.slideCount || 0), 0)}</strong><span>Slides created</span></div>
            <div><strong>{user.role === 'Teacher' ? 'Classroom' : 'Study'}</strong><span>Workspace mode</span></div>
          </div>
        </section>

        <section className="hero-card">
          <div className="hero-copy">
            <p className="kicker">Create professional educational presentations</p>
            <h2>Create professional educational presentations with Gemini AI</h2>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-image-panel" />
            <div className="floating-slide floating-slide-back">
              <span>01</span>
              <i />
              <i />
              <i />
            </div>
            <div className="floating-slide floating-slide-front">
              <span>GEMINI</span>
              <strong>IDEAS<br />INTO<br />SLIDES</strong>
              <em>AI / 2026</em>
            </div>
          </div>
        </section>

        {presentationHistory.length > 0 && (
          <section className="history-panel card">
            <div className="history-header">
              <div>
                <p className="kicker">Your recent work</p>
                <h3>Presentation history</h3>
              </div>
              <button className="secondary-btn history-clear-btn" type="button" onClick={clearPresentationHistory}>
                Clear history
              </button>
            </div>
            <div className="history-list">
              {presentationHistory.map((entry, entryIndex) => (
                <article className="history-item" key={entry.id}>
                  <div>
                    <h4>{entry.title}</h4>
                    <p>{entry.slideCount} slides · {entry.style} · {new Date(entry.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="history-item-actions">
                    <button className="secondary-btn history-reuse-btn" type="button" onClick={() => reuseHistoryEntry(entry)}>
                      Reuse details
                    </button>
                    <button className="history-remove-btn" type="button" aria-label={`Remove ${entry.title} from history`} onClick={() => removeHistoryEntry(entry.id, entryIndex)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!isLoading && !result && (
          <section className="form-panel card">
            <div className="field-group">
              <label htmlFor="professorName">Professor Name</label>
              <input
                id="professorName"
                type="text"
                placeholder="Enter professor name"
                value={form.professorName}
                onChange={(e) => updateField('professorName', e.target.value)}
              />
              {errors.professorName && <span className="error-text">{errors.professorName}</span>}
            </div>

            <div className="field-group">
              <label htmlFor="chapterName">Chapter Name</label>
              <input
                id="chapterName"
                type="text"
                placeholder="Enter chapter name"
                value={form.chapterName}
                onChange={(e) => updateField('chapterName', e.target.value)}
              />
              {errors.chapterName && <span className="error-text">{errors.chapterName}</span>}
            </div>

            <div className="field-group">
              <label htmlFor="topicDetails">Topic Details</label>
              <textarea
                id="topicDetails"
                placeholder="Enter complete topic details, syllabus points, concepts, formulas, important definitions, examples, etc."
                value={form.topicDetails}
                onChange={(e) => updateField('topicDetails', e.target.value)}
                rows={8}
              />
              {errors.topicDetails && <span className="error-text">{errors.topicDetails}</span>}
            </div>

            <div className="two-col">
              <div className="field-group">
                <label htmlFor="slideCount">Number of Slides</label>
                <select
                  id="slideCount"
                  value={form.slideCount}
                  onChange={(e) => updateField('slideCount', Number(e.target.value))}
                >
                  {slideOptions.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="style">Presentation Style</label>
                <div className="template-picker" role="radiogroup" aria-label="Presentation style">
                  {styleOptions.map((option, index) => (
                    <button
                      className={form.style === option ? 'template-option active' : 'template-option'}
                      type="button"
                      role="radio"
                      aria-checked={form.style === option}
                      key={option}
                      onClick={() => updateField('style', option)}
                    >
                      <span className={`template-art template-art-${index}`} aria-hidden="true">
                        <i /><i /><i />
                      </span>
                      <strong>{option}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="primary-btn" onClick={handleGenerate} disabled={isLoading}>
              ✨ Generate PPT
            </button>
          </section>
        )}

        {isLoading && (
          <section className="loading-panel card">
            <div className="spinner" aria-label="Loading" />
            <h3>✨ Creating your presentation...</h3>
            <p>{progressLabel}</p>
            <div className="progress-bar">
              <span style={{ width: `${((progressIndex + 1) / steps.length) * 100}%` }} />
            </div>
          </section>
        )}

        {result && !isLoading && (
          <section className="result-panel card">
            <div className="result-header">
              <span className="success-badge">🎉</span>
              <h3>Preview your PPT</h3>
            </div>

            <div className="result-meta">
              <div>
                <label>Presentation title</label>
                <p>{result.title}</p>
              </div>
              <div>
                <label>Professor name</label>
                <p>{result.professorName}</p>
              </div>
              <div>
                <label>Chapter name</label>
                <p>{result.chapterName}</p>
              </div>
              <div>
                <label>Number of slides</label>
                <p>{result.slideCount}</p>
              </div>
            </div>

            <div className="slide-navigation" aria-label="Slide preview navigation">
              <button className="slide-nav-btn slide-nav-prev" type="button" aria-label="Go to previous slide" disabled={previewSlideIndex === 0} onClick={() => { setEditingSlideIndex(null); setPreviewSlideIndex((index) => Math.max(0, index - 1)); }}>
                <span aria-hidden="true">←</span> Previous
              </button>
              <span>Slide {previewSlideIndex + 1} of {result.slides.length}</span>
              <button className="slide-nav-btn slide-nav-next" type="button" aria-label="Go to next slide" disabled={previewSlideIndex === result.slides.length - 1} onClick={() => { setEditingSlideIndex(null); setPreviewSlideIndex((index) => Math.min(result.slides.length - 1, index + 1)); }}>
                Next slide <span aria-hidden="true">→</span>
              </button>
            </div>

            <div className="slide-preview-grid">
              {result.slides.map((slide, index) => (
                index !== previewSlideIndex ? null : (
                <article className="slide-preview" key={slide.slideNumber || index}>
                  <span className="slide-number">{String(slide.slideNumber || index + 1).padStart(2, '0')}</span>
                  {editingSlideIndex === index ? (
                    <div className="slide-edit-fields">
                      <input
                        aria-label={`Edit slide ${index + 1} title`}
                        value={slide.title}
                        onChange={(event) => updatePreviewSlide(index, 'title', event.target.value)}
                      />
                      <textarea
                        aria-label={`Edit slide ${index + 1} content`}
                        value={slide.content.join('\n')}
                        onChange={(event) => updatePreviewSlide(index, 'content', event.target.value)}
                        rows={5}
                      />
                      <button className="secondary-btn slide-edit-btn" type="button" onClick={() => setEditingSlideIndex(null)}>
                        Done editing
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4>{slide.title}</h4>
                      {slide.subtitle && <p className="slide-subtitle">{slide.subtitle}</p>}
                      <ul>
                        {slide.content.slice(0, 4).map((point, pointIndex) => <li key={`${point}-${pointIndex}`}>{point}</li>)}
                      </ul>
                      <button className="secondary-btn slide-edit-btn" type="button" onClick={() => setEditingSlideIndex(index)}>
                        Edit slide
                      </button>
                    </>
                  )}
                  {slide.formula && <div className="slide-formula">{slide.formula}</div>}
                  {slide.visualSuggestion && <p className="slide-visual">Visual: {slide.visualSuggestion}</p>}
                </article>
                )
              ))}
            </div>

            <div className="result-actions">
              <button
                className="primary-btn"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? 'Preparing download...' : '⬇ Download PPT'}
              </button>

              <button className="secondary-btn" type="button" onClick={handleDownloadPdf} disabled={isDownloadingPdf}>
                {isDownloadingPdf ? 'Preparing PDF...' : '▣ Download PDF'}
              </button>

              <button className="secondary-btn" type="button" onClick={handleShare}>
                {shareCopied ? '✓ Link copied' : '🔗 Share link'}
              </button>

              <button className="secondary-btn" onClick={() => setResult(null)}>
                🔄 Generate Again
              </button>

              <button className="secondary-btn" onClick={resetForm}>
                ✏️ Edit Details
              </button>
            </div>
          </section>
        )}

        <p className="developer-credit">Designed &amp; developed by MOIN GHADA</p>
        <a className="customer-care" href="tel:9213513011">Customer care: 9213513011</a>
      </main>
    </div>
  );
}

export default App;
