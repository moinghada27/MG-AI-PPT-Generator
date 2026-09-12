const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const rootEnv = require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const backendEnv = require('dotenv').config({ path: path.resolve(__dirname, '.env') });

if (rootEnv.parsed?.GEMINI_API_KEY && backendEnv.parsed?.GEMINI_API_KEY && rootEnv.parsed.GEMINI_API_KEY !== backendEnv.parsed.GEMINI_API_KEY) {
  process.env.GEMINI_API_KEY = rootEnv.parsed.GEMINI_API_KEY;
}

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');
const { generatePresentationFromGemini } = require('./services/geminiService');
const { buildPptxBuffer, normalizePresentationFormulas } = require('./utils/pptGenerator');
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 5000;
const usersFile = path.resolve(__dirname, 'data/users.json');
const presentationStore = new Map();
const presentationExpiryMs = 15 * 60 * 1000;
const whatsappClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.' },
});

const profileLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many profile submissions. Please try again later.' },
});

app.use('/api', limiter);

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function sanitizeMobile(value) {
  return String(value || '').replace(/\D/g, '');
}

function readUsers() {
  if (!fs.existsSync(usersFile)) return [];
  return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersFile), { recursive: true });
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function passwordsMatch(password, salt, expectedHash) {
  const actualHash = crypto.scryptSync(password, salt, 64);
  const storedHash = Buffer.from(expectedHash, 'hex');
  return actualHash.length === storedHash.length && crypto.timingSafeEqual(actualHash, storedHash);
}

function parsePresentationRequest(body) {
  const professorName = sanitizeText(body?.professorName);
  const chapterName = sanitizeText(body?.chapterName);
  const topicDetails = sanitizeText(body?.topicDetails);
  const slideCount = Number(body?.slideCount || 10);
  const style = sanitizeText(body?.style || 'Professional');

  if (!professorName) return { error: 'Please enter professor name.' };
  if (!chapterName) return { error: 'Please enter chapter name.' };
  if (!topicDetails) return { error: 'Please enter topic details.' };
  if (!Number.isFinite(slideCount) || slideCount < 5 || slideCount > 20) {
    return { error: 'Please select a valid number of slides.' };
  }

  return { values: { professorName, chapterName, topicDetails, slideCount, style } };
}

function removeExpiredPresentations() {
  const now = Date.now();
  for (const [id, entry] of presentationStore) {
    if (entry.expiresAt <= now) presentationStore.delete(id);
  }
}

function findOfficeConverter() {
  const candidates = [
    process.env.SOFFICE_PATH,
    'soffice',
    path.join(process.env.ProgramFiles || '', 'LibreOffice', 'program', 'soffice.exe'),
    path.join(process.env.ProgramFiles || '', 'LibreOffice', 'program', 'soffice.com'),
  ].filter(Boolean);

  return candidates.find((candidate) => candidate === 'soffice' || fs.existsSync(candidate));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'MG AI PPT Generator backend is running.' });
});

app.post('/api/auth/register', profileLimiter, async (req, res) => {
  try {
    const name = sanitizeText(req.body?.name);
    const mobile = sanitizeMobile(req.body?.mobile);
    const role = sanitizeText(req.body?.role);
    const password = String(req.body?.password || '');

    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'Please enter a valid name.' });
    }

    if (mobile.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    }

    if (!['Student', 'Teacher'].includes(role)) {
      return res.status(400).json({ error: 'Please select Student or Teacher.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = readUsers();
    if (users.some((user) => user.mobile === mobile)) {
      return res.status(409).json({ error: 'An account with this mobile number already exists.' });
    }

    const { salt, hash } = hashPassword(password);
    users.push({ id: crypto.randomUUID(), name, mobile, role, passwordSalt: salt, passwordHash: hash, createdAt: new Date().toISOString() });
    writeUsers(users);

    if (whatsappClient && process.env.WHATSAPP_FROM && process.env.WHATSAPP_TO) {
      await whatsappClient.messages.create({
        from: process.env.WHATSAPP_FROM,
        to: process.env.WHATSAPP_TO,
        body: [`New MG AI PPT Generator user`, `Name: ${name}`, `Mobile: +91 ${mobile}`, `Role: ${role}`, `Registered: ${new Date().toISOString()}`].join('\n'),
      });
    }

    res.status(201).json({ success: true, user: { name, mobile, role } });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Unable to create your account right now. Please try again.' });
  }
});

app.post('/api/auth/login', profileLimiter, (req, res) => {
  try {
    const mobile = sanitizeMobile(req.body?.mobile);
    const password = String(req.body?.password || '');
    const user = readUsers().find((entry) => entry.mobile === mobile);

    if (!user || !passwordsMatch(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid mobile number or password.' });
    }

    res.json({ success: true, user: { name: user.name, mobile: user.mobile, role: user.role } });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Unable to log in right now. Please try again.' });
  }
});

app.delete('/api/auth/account', profileLimiter, (req, res) => {
  try {
    const mobile = sanitizeMobile(req.body?.mobile);
    const password = String(req.body?.password || '');
    const users = readUsers();
    const user = users.find((entry) => entry.mobile === mobile);

    if (!user || !passwordsMatch(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    writeUsers(users.filter((entry) => entry.mobile !== mobile));
    res.json({ success: true });
  } catch (error) {
    console.error('Account deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete your account right now. Please try again.' });
  }
});

app.post('/api/preview-ppt', async (req, res) => {
  try {
    const request = parsePresentationRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });

    const presentation = normalizePresentationFormulas(await generatePresentationFromGemini(request.values));
    const presentationId = crypto.randomUUID();
    removeExpiredPresentations();
    presentationStore.set(presentationId, {
      presentation,
      values: request.values,
      expiresAt: Date.now() + presentationExpiryMs,
    });

    res.json({ presentationId, presentation, expiresInMinutes: 15 });
  } catch (error) {
    console.error('PPT preview generation failed:', error);
    if (error.message?.includes('API key')) {
      return res.status(500).json({ error: 'Gemini API configuration is missing on the server.' });
    }
    res.status(500).json({ error: 'Unable to create the presentation preview right now. Please try again.' });
  }
});

app.get('/api/download-ppt/:presentationId', async (req, res) => {
  try {
    removeExpiredPresentations();
    const entry = presentationStore.get(req.params.presentationId);
    if (!entry) return res.status(404).json({ error: 'This preview has expired. Please generate a new presentation.' });

    const pptBuffer = await buildPptxBuffer(entry.presentation, entry.values);
    const fileName = `${(entry.presentation.presentationTitle || 'AI_Presentation').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pptBuffer);
  } catch (error) {
    console.error('PPT download failed:', error);
    res.status(500).json({ error: 'Unable to prepare the PowerPoint file right now. Please try again.' });
  }
});

app.post('/api/download-ppt/:presentationId', async (req, res) => {
  try {
    removeExpiredPresentations();
    const entry = presentationStore.get(req.params.presentationId);
    if (!entry) return res.status(404).json({ error: 'This preview has expired. Please generate a new presentation.' });

    const editedSlides = req.body?.slides;
    const presentation = Array.isArray(editedSlides)
      ? { ...entry.presentation, slides: editedSlides }
      : entry.presentation;
    const pptBuffer = await buildPptxBuffer(presentation, entry.values);
    const fileName = `${(presentation.presentationTitle || 'AI_Presentation').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.pptx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pptBuffer);
  } catch (error) {
    console.error('Edited PPT download failed:', error);
    res.status(500).json({ error: 'Unable to prepare the edited PowerPoint file right now. Please try again.' });
  }
});

app.get('/api/share/:presentationId', (req, res) => {
  removeExpiredPresentations();
  const entry = presentationStore.get(req.params.presentationId);
  if (!entry) return res.status(404).json({ error: 'This shared presentation has expired.' });

  res.json({
    presentation: entry.presentation,
    expiresAt: entry.expiresAt,
  });
});

app.post('/api/download-pdf/:presentationId', async (req, res) => {
  let tempDir;
  try {
    removeExpiredPresentations();
    const entry = presentationStore.get(req.params.presentationId);
    if (!entry) return res.status(404).json({ error: 'This preview has expired. Please generate a new presentation.' });

    const converter = findOfficeConverter();
    if (!converter) {
      return res.status(503).json({ error: 'PDF conversion requires LibreOffice. Install LibreOffice and restart the backend.' });
    }

    const editedSlides = req.body?.slides;
    const presentation = Array.isArray(editedSlides)
      ? { ...entry.presentation, slides: editedSlides }
      : entry.presentation;
    const pptBuffer = await buildPptxBuffer(presentation, entry.values);
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ai-ppt-'));
    const pptPath = path.join(tempDir, 'presentation.pptx');
    const pdfPath = path.join(tempDir, 'presentation.pdf');
    await fs.promises.writeFile(pptPath, pptBuffer);
    await execFileAsync(converter, ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, pptPath], { timeout: 120000 });
    const pdfBuffer = await fs.promises.readFile(pdfPath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(presentation.presentationTitle || 'AI_Presentation').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF download failed:', error);
    res.status(500).json({ error: 'Unable to convert the presentation to PDF right now.' });
  } finally {
    if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post('/api/generate-ppt', async (req, res) => {
  try {
    const request = parsePresentationRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    const { professorName, chapterName, topicDetails, slideCount, style } = request.values;

    const presentation = await generatePresentationFromGemini({
      professorName,
      chapterName,
      topicDetails,
      slideCount,
      style,
    });

    const pptBuffer = await buildPptxBuffer(presentation, {
      professorName,
      chapterName,
      topicDetails,
      slideCount,
      style,
    });

    const fileName = `${(presentation.presentationTitle || 'AI_Presentation').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()}.pptx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pptBuffer);
  } catch (error) {
    console.error('PPT generation failed:', error);

    if (error.message?.includes('API key')) {
      return res.status(500).json({ error: 'Gemini API configuration is missing on the server.' });
    }

    if (error.message?.includes('malformed JSON') || error.message?.includes('returned an empty response') || error.message?.includes('Invalid presentation structure')) {
      return res.status(502).json({ error: 'Something went wrong while generating your presentation. Please try again.' });
    }

    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      return res.status(503).json({ error: 'The AI service is temporarily unavailable. Please try again.' });
    }

    return res.status(500).json({ error: 'Something went wrong while generating your presentation. Please try again.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
