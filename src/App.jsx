import { useState, useEffect, useRef } from 'react';
import {
  Video,
  AlertCircle,
  Lightbulb,
  Sparkles,
  CheckCircle2,
  Send,
  Layers,
  RefreshCw,
  Monitor,
  Film,
  Upload,
  Settings,
  Trash2,
  FileText,
  MessageSquare,
  Terminal,
  Check
} from 'lucide-react';

const AREAS = [
  'Login / Sign-in Page',
  'Dashboard & Analytics',
  'Billing & Checkout',
  'Account Settings',
  'Data Export / Reports',
  'Other / General'
];

const SEVERITIES = [
  { value: 'Critical', label: "I'm completely stuck" },
  { value: 'High', label: 'Slowing me down a lot' },
  { value: 'Medium', label: 'Minor annoyance' },
  { value: 'Low', label: 'Just a small suggestion' }
];

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get('app') === 'admin' ? 'admin' : 'user';
  const [activeApp, setActiveApp] = useState(initialMode);

  // Ollama State
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:3b');
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const [showSettings, setShowSettings] = useState(false);

  // Shared Tickets State
  const [tickets, setTickets] = useState(() => {
    try {
      const saved = localStorage.getItem('sentinel_real_tickets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync across tabs/windows
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'sentinel_real_tickets' && e.newValue) {
        setTickets(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const saveTickets = (updated) => {
    setTickets(updated);
    localStorage.setItem('sentinel_real_tickets', JSON.stringify(updated));
  };

  // Check Ollama Connection
  const checkOllama = async () => {
    setOllamaStatus('checking');
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        if (models.length > 0 && !models.some((m) => m.name.includes(ollamaModel))) {
          setOllamaModel(models[0].name);
        }
        setOllamaStatus('online');
      } else {
        setOllamaStatus('offline');
      }
    } catch {
      setOllamaStatus('offline');
    }
  };

  useEffect(() => {
    checkOllama();
  }, [ollamaUrl]);

  // ---------------------------------------------------------------------------
  // APP 1: USER FEEDBACK & 30S CLIPPER STATE
  // ---------------------------------------------------------------------------
  const [category, setCategory] = useState('Bug');
  const [reporterName, setReporterName] = useState('');
  const [whereArea, setWhereArea] = useState(AREAS[0]);
  const [severity, setSeverity] = useState('Critical');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);

  // AI Vagueness Coach
  const [aiQuestions, setAiQuestions] = useState([]);
  const [answeredChips, setAnsweredChips] = useState({});
  const [isCheckingAi, setIsCheckingAi] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  // Verdict from the last vagueness check: whether THIS description can be sent
  const [vagueCheck, setVagueCheck] = useState({
    checked: false,
    checkedFingerprint: '',
    isVague: false,
    reason: ''
  });

  // 30-Second Rolling Screen Buffer
  const [bufferSeconds, setBufferSeconds] = useState(0);
  const [isLiveScreenRecording, setIsLiveScreenRecording] = useState(false);
  const [attachedClip, setAttachedClip] = useState(null);
  const [clipNotice, setClipNotice] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // Rolling timer
  useEffect(() => {
    if (!isLiveScreenRecording) return;
    const timer = setInterval(() => {
      setBufferSeconds((prev) => (prev < 30 ? prev + 1 : 30));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveScreenRecording]);

  const startRealScreenRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false
      });
      streamRef.current = stream;
      chunksRef.current = [];
      setBufferSeconds(0);

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          const isFirst = chunksRef.current.length === 0;
          chunksRef.current.push({ data: e.data, ts: Date.now(), isHeader: isFirst });
          const cutoff = Date.now() - 30000;
          // Keep the first chunk (it holds the WebM header) so trimmed clips still play
          chunksRef.current = chunksRef.current.filter((c) => c.isHeader || c.ts >= cutoff);
        }
      };
      recorder.onstop = () => {
        setIsLiveScreenRecording(false);
        setBufferSeconds(0);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsLiveScreenRecording(true);
      setClipNotice('');
    } catch (err) {
      alert('Screen recording permission was cancelled or denied by macOS.');
    }
  };

  const stopScreenRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const clipLast30Seconds = () => {
    if (!isLiveScreenRecording || chunksRef.current.length === 0) {
      setClipNotice(
        'Recording is off, so there is nothing to clip yet. Click "Start recording" first, then clip after the problem happens.'
      );
      return;
    }
    setClipNotice('');
    const blob = new Blob(
      chunksRef.current.map((c) => c.data),
      { type: 'video/webm' }
    );
    setAttachedClip({
      url: URL.createObjectURL(blob),
      duration: `${Math.min(bufferSeconds, 30)}s`,
      isReal: true,
      timestamp: new Date().toLocaleTimeString()
    });
  };

  // Keyboard shortcut Alt + F10
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key === 'F10') {
        e.preventDefault();
        clipLast30Seconds();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Qwen checks the report, while optional follow-up suggestions are generated
  // once for the draft and are not regenerated after edits or chip selections.
  const clarityRequestRef = useRef(0);
  const suggestionsGeneratedRef = useRef(false);
  const currentReportSnapshot = {
    text: description.trim(),
    area: whereArea,
    category,
    answers: answeredChips
  };
  const currentReportFingerprint = JSON.stringify(currentReportSnapshot);
  const selectedFollowUpCount = Object.values(answeredChips).reduce(
    (count, selected) => count + (Array.isArray(selected) ? selected.length : selected ? 1 : 0),
    0
  );

  const fallbackQuestions = [
    {
      id: 'q1',
      question: 'When did you first notice this?',
      options: ['Just now', 'Since the latest update', 'It has happened before']
    },
    {
      id: 'q2',
      question: 'What best describes what happened?',
      options: ['An error appeared', 'Nothing happened', 'The page froze or kept loading']
    }
  ];

  const analyzeVagueness = async (snapshot = currentReportSnapshot, { generateSuggestions = false } = {}) => {
    const text = (snapshot.text || '').trim();
    const fingerprint = JSON.stringify(snapshot);
    const requestId = ++clarityRequestRef.current;
    const shouldGenerateSuggestions = generateSuggestions && !suggestionsGeneratedRef.current;

    if (!text) {
      setIsCheckingAi(false);
      setVagueCheck({
        checked: false,
        checkedFingerprint: '',
        isVague: true,
        reason: 'Add a short description so Qwen can check that the report makes sense.'
      });
      if (shouldGenerateSuggestions) setAiQuestions([]);
      return;
    }

    if (shouldGenerateSuggestions) suggestionsGeneratedRef.current = true;

    setIsCheckingAi(true);
    setVagueCheck({
      checked: false,
      checkedFingerprint: '',
      isVague: false,
      reason: 'Qwen is checking that this report describes a recognisable issue.'
    });

    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: shouldGenerateSuggestions
                ? `You are a sensible, helpful software-feedback assistant. Decide whether the user has described a recognisable problem or request. Be lenient: do not demand a long explanation, reproduction steps, an exact error message, device details, or technical language. Short reports can be perfectly clear. Examples that MUST pass include: "I can't log in with Okta", "The login button does nothing", "Exporting invoices crashes", "My password reset email never arrives", and "Please add dark mode". Reject only reports that are genuinely meaningless or give no clue what the issue/request is, such as "help", "fix this", or random/irrelevant text. Do not mark a report unclear merely because more detail would be useful. Follow-up answers are extra context, not a requirement. Return isClear=true whenever the issue/request is understandable at a basic level. Generate up to 2 useful OPTIONAL follow-up questions with 2-4 short answer options each, all in this one batch, even if the report is already clear. The user can select several options; answers are never mandatory. Do not ask another round of questions. Return ONLY valid JSON in this exact shape: {"isClear": true, "reason": "A short explanation", "questions": [{"id": "q1", "question": "...", "options": ["...", "..."]}]}.`
                : `You are doing a final, lenient clarity check of a software feedback report. Consider the description and any selected optional follow-up answers together. Approve any report that identifies a recognisable problem or request. Do not require reproduction steps, technical details, exact error wording, or perfect phrasing. Reject only if it is still meaningless or gives no clue what the issue is. Do not generate follow-up questions; return an empty questions array. Return ONLY valid JSON in this exact shape: {"isClear": true, "reason": "A short explanation", "questions": []}.`
            },
            {
              role: 'user',
              content: `Area (context only): ${snapshot.area}\nReport type: ${snapshot.category}\nDescription: ${text}\nOptional selected details: ${JSON.stringify(snapshot.answers || {})}`
            }
          ],
          options: { temperature: 0.2 }
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (typeof parsed.isClear !== 'boolean') {
        throw new Error('Qwen returned an invalid clarity result');
      }

      // The optional suggestion batch belongs to the draft, even if the user
      // edits while Qwen is responding. Only the clarity verdict is discarded
      // when this response is stale.
      if (shouldGenerateSuggestions) {
        const questions = Array.isArray(parsed.questions)
          ? parsed.questions
              .filter((q) => q && typeof q.question === 'string' && Array.isArray(q.options))
              .slice(0, 2)
              .map((q, index) => ({
                id: q.id || `q${index + 1}`,
                question: q.question,
                options: q.options.filter((option) => typeof option === 'string').slice(0, 4)
              }))
              .filter((q) => q.options.length > 0)
          : [];
        setAiQuestions(questions.length > 0 ? questions : fallbackQuestions);
      }

      if (requestId !== clarityRequestRef.current) return;

      setVagueCheck({
        checked: true,
        checkedFingerprint: fingerprint,
        isVague: !parsed.isClear,
        reason: typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : parsed.isClear
            ? 'Qwen understands this report. You can send it.'
            : 'Qwen cannot tell what the issue is yet. Add a little context and try again.'
      });
    } catch (error) {
      if (shouldGenerateSuggestions) setAiQuestions(fallbackQuestions);
      if (requestId !== clarityRequestRef.current) return;
      setVagueCheck({
        checked: false,
        checkedFingerprint: '',
        isVague: true,
        reason: `Qwen could not verify this report (${error.message}). Sending stays locked until Qwen completes a successful check. Check the Ollama connection and retry.`
      });
    } finally {
      if (requestId === clarityRequestRef.current) {
        setIsCheckingAi(false);
      }
    }
  };

  // Run a clarity review after the user pauses. The first successful review also
  // supplies one batch of optional suggestions; later reviews never ask new questions.
  useEffect(() => {
    clarityRequestRef.current += 1;
    setIsCheckingAi(false);

    const snapshot = {
      text: description.trim(),
      area: whereArea,
      category,
      answers: answeredChips
    };

    if (!snapshot.text) {
      suggestionsGeneratedRef.current = false;
      setAiQuestions([]);
      setVagueCheck({
        checked: false,
        checkedFingerprint: '',
        isVague: true,
        reason: 'Add a short description. Qwen will only block reports it cannot understand.'
      });
      return;
    }

    // One suggestion batch per draft. Only clearing the description (after sending
    // or starting over) resets this flag; edits never create another question round.
    const generateSuggestions = !suggestionsGeneratedRef.current;

    setVagueCheck({
      checked: false,
      checkedFingerprint: '',
      isVague: false,
      reason: 'The report has changed. Qwen is checking the latest version.'
    });
    const timer = setTimeout(
      () => analyzeVagueness(snapshot, { generateSuggestions }),
      900
    );
    return () => clearTimeout(timer);
  }, [description, whereArea, category, ollamaUrl, ollamaModel]);

  const handleSelectChip = (questionText, optionText) => {
    setAnsweredChips((prev) => {
      const current = Array.isArray(prev[questionText])
        ? prev[questionText]
        : prev[questionText]
          ? [prev[questionText]]
          : [];
      const isRemoving = current.includes(optionText);
      const totalSelected = Object.values(prev).reduce(
        (count, selected) => count + (Array.isArray(selected) ? selected.length : selected ? 1 : 0),
        0
      );
      if (!isRemoving && totalSelected >= 3) return prev;
      const next = isRemoving
        ? current.filter((item) => item !== optionText)
        : [...current, optionText];
      return { ...prev, [questionText]: next };
    });
  };

  const canSubmitReport =
    description.trim().length > 0 &&
    vagueCheck.checked &&
    !vagueCheck.isVague &&
    vagueCheck.checkedFingerprint === currentReportFingerprint &&
    !isCheckingAi;

  const handleSubmitReport = (e) => {
    e.preventDefault();
    // The gate is checked again here; a stale/failed Qwen verdict can never submit.
    if (!canSubmitReport) return;

    const newTicket = {
      id: `T-${1001 + tickets.length}`,
      category,
      reporter: reporterName.trim() || 'Anonymous Mac User',
      area: whereArea,
      severity,
      description: description.trim(),
      followUpAnswers: answeredChips,
      clip: attachedClip,
      screenshots: screenshots.map((f) => f.name),
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    saveTickets([newTicket, ...tickets]);
    clarityRequestRef.current += 1;
    setDescription('');
    setAnsweredChips({});
    setAiQuestions([]);
    setVagueCheck({ checked: false, checkedFingerprint: '', isVague: true, reason: '' });
    setAttachedClip(null);
    setScreenshots([]);
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3500);
  };

  // ---------------------------------------------------------------------------
  // APP 2: SEMANTIC DUPLICATE REVIEW CONSOLE STATE
  // ---------------------------------------------------------------------------
  const [selectedFindingKey, setSelectedFindingKey] = useState(null);
  const [jiraDrafts, setJiraDrafts] = useState({});
  const [isDraftingJira, setIsDraftingJira] = useState(false);
  const [pushedJiraIds, setPushedJiraIds] = useState({});
  const [duplicateScan, setDuplicateScan] = useState({
    status: 'idle',
    duplicateGroups: [],
    possibleDuplicates: [],
    uniqueTicketIds: [],
    error: ''
  });
  const duplicateScanRequestRef = useRef(0);

  // Qwen compares ticket meaning, symptoms and behaviour. Area/category are context only;
  // they are never used as grouping keys.
  const scanSemanticDuplicates = async (ticketSnapshot = tickets) => {
    const requestId = ++duplicateScanRequestRef.current;
    if (!ticketSnapshot.length) {
      setDuplicateScan({
        status: 'idle',
        duplicateGroups: [],
        possibleDuplicates: [],
        uniqueTicketIds: [],
        error: ''
      });
      return;
    }

    setDuplicateScan({
      status: 'scanning',
      duplicateGroups: [],
      possibleDuplicates: [],
      uniqueTicketIds: ticketSnapshot.map((ticket) => ticket.id),
      error: ''
    });

    const ticketData = ticketSnapshot.map((ticket) => ({
      id: ticket.id,
      area: ticket.area,
      category: ticket.category,
      description: ticket.description,
      followUpAnswers: ticket.followUpAnswers || {},
      severity: ticket.severity
    }));
    const knownIds = new Set(ticketData.map((ticket) => ticket.id));

    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: `You are a careful software-ticket deduplication analyst. Compare reports by their semantic meaning: the underlying user problem, action/workflow, observed failure, and likely failure mode. The area/page and category are context only and MUST NOT be used as the grouping rule. Reports on the same page can be completely different bugs. For example, a password/authentication problem on a login page MUST remain separate from a login form that fails to submit; do not group them merely because both mention login. Group reports only when they describe the same or very nearly the same underlying issue, even if they come from different pages or categories. Do not force a match when evidence is weak. Return confirmed duplicate groups only when at least two reports clearly describe the same issue. Put uncertain but plausible matches in possibleDuplicates for human review. Put every remaining ticket in uniqueTicketIds. A ticket must appear in at most one confirmed duplicate group. Use only the supplied ticket IDs. Return ONLY valid JSON with this shape: {"duplicateGroups":[{"title":"Short semantic issue title","ticketIds":["T-1001","T-1002"],"rationale":"Why these reports are duplicates based on symptoms and behaviour","confidence":"high"}],"possibleDuplicates":[{"ticketIds":["T-1003","T-1004"],"rationale":"Why these might be duplicates and what is still uncertain","confidence":"medium"}],"uniqueTicketIds":["T-1005"]}. Confidence must be high, medium, or low. Do not infer a common root cause unless the reports support it.`
            },
            {
              role: 'user',
              content: `Compare these tickets semantically. Do not group by area or category.\n${JSON.stringify(ticketData)}`
            }
          ],
          options: { temperature: 0.1 }
        })
      });

      if (!res.ok) {
        throw new Error(`Ollama returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (!Array.isArray(parsed.duplicateGroups) || !Array.isArray(parsed.possibleDuplicates)) {
        throw new Error('Qwen returned an invalid duplicate scan');
      }
      if (requestId !== duplicateScanRequestRef.current) return;

      const usedIds = new Set();
      const confirmedGroups = parsed.duplicateGroups
        .map((group, index) => {
          const ids = [...new Set((Array.isArray(group.ticketIds) ? group.ticketIds : [])
            .filter((id) => knownIds.has(id) && !usedIds.has(id)))];
          if (ids.length < 2) return null;
          ids.forEach((id) => usedIds.add(id));
          return {
            id: `D-${String(index + 1).padStart(2, '0')}`,
            title: typeof group.title === 'string' && group.title.trim()
              ? group.title.trim()
              : 'Semantically matching reports',
            ticketIds: ids,
            rationale: typeof group.rationale === 'string' ? group.rationale : 'Qwen identified the same underlying user-visible failure.',
            confidence: ['high', 'medium', 'low'].includes(group.confidence) ? group.confidence : 'medium'
          };
        })
        .filter(Boolean);

      const possiblePairs = parsed.possibleDuplicates
        .map((pair, index) => {
          const ids = [...new Set((Array.isArray(pair.ticketIds) ? pair.ticketIds : [])
            .filter((id) => knownIds.has(id)))];
          if (ids.length !== 2 || ids.some((id) => usedIds.has(id))) return null;
          return {
            id: `P-${String(index + 1).padStart(2, '0')}`,
            ticketIds: ids,
            rationale: typeof pair.rationale === 'string' ? pair.rationale : 'Qwen found a possible similarity that needs human review.',
            confidence: ['high', 'medium', 'low'].includes(pair.confidence) ? pair.confidence : 'low'
          };
        })
        .filter(Boolean);

      const possibleIds = new Set(possiblePairs.flatMap((pair) => pair.ticketIds));
      const uniqueTicketIds = ticketSnapshot
        .map((ticket) => ticket.id)
        .filter((id) => !usedIds.has(id) && !possibleIds.has(id));

      setDuplicateScan({
        status: 'complete',
        duplicateGroups: confirmedGroups,
        possibleDuplicates: possiblePairs,
        uniqueTicketIds,
        error: ''
      });
    } catch (error) {
      if (requestId !== duplicateScanRequestRef.current) return;
      setDuplicateScan({
        status: 'error',
        duplicateGroups: [],
        possibleDuplicates: [],
        uniqueTicketIds: ticketSnapshot.map((ticket) => ticket.id),
        error: `Qwen could not scan for semantic duplicates: ${error.message}`
      });
    }
  };

  // Re-scan whenever the saved ticket set or the configured local Qwen model changes.
  useEffect(() => {
    // Invalidate an older in-flight scan immediately when the ticket set/model changes.
    duplicateScanRequestRef.current += 1;
    scanSemanticDuplicates(tickets);
  }, [tickets, ollamaUrl, ollamaModel]);

  const duplicateFindings = duplicateScan.duplicateGroups.map((group) => {
    const groupTickets = group.ticketIds
      .map((id) => tickets.find((ticket) => ticket.id === id))
      .filter(Boolean);
    return {
      ...group,
      key: `duplicate:${group.ticketIds.slice().sort().join('|')}`,
      kind: 'duplicate',
      tickets: groupTickets
    };
  });

  const possibleFindings = duplicateScan.possibleDuplicates.map((pair) => {
    const pairTickets = pair.ticketIds
      .map((id) => tickets.find((ticket) => ticket.id === id))
      .filter(Boolean);
    return {
      ...pair,
      key: `possible:${pair.ticketIds.slice().sort().join('|')}`,
      kind: 'possible',
      title: 'Possible duplicate — needs review',
      tickets: pairTickets
    };
  });

  const uniqueFindings = duplicateScan.uniqueTicketIds
    .map((id) => tickets.find((ticket) => ticket.id === id))
    .filter(Boolean)
    .map((ticket) => ({
      key: `ticket:${ticket.id}`,
      id: ticket.id,
      kind: 'single',
      title: ticket.description,
      rationale: duplicateScan.status === 'complete'
        ? 'Qwen did not find a sufficiently strong semantic duplicate match for this report.'
        : 'This report is awaiting a successful Qwen duplicate scan.',
      confidence: '',
      tickets: [ticket]
    }));

  const allFindings = [...duplicateFindings, ...possibleFindings, ...uniqueFindings];
  const activeFinding =
    allFindings.find((finding) => finding.key === selectedFindingKey) || allFindings[0] || null;

  const generateFindingJiraDraft = async (finding) => {
    if (!finding || finding.kind === 'possible' || !finding.tickets.length) return;
    setIsDraftingJira(true);

    const combinedReports = finding.tickets
      .map((ticket, index) =>
        `Report #${index + 1} (${ticket.id}; ${ticket.reporter}; Area context: ${ticket.area}; Type: ${ticket.category}; Severity: ${ticket.severity}): "${ticket.description}" | Follow-up answers: ${JSON.stringify(ticket.followUpAnswers || {})}`
      )
      .join('\n');

    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          format: 'json',
          messages: [
            {
              role: 'system',
              content: 'You are a Principal Triage Engineer. Draft one actionable Jira issue from the supplied report evidence. If there are multiple reports, they have already been identified as semantic duplicates: synthesize only their shared underlying behaviour, not merely a shared page or feature. If there is one report, create a standalone issue. Do not invent a root cause; label it as a hypothesis. Return ONLY valid JSON with keys: {"summary":"...","rootCauseHypothesis":"...","reproductionSteps":["step 1","step 2"],"priority":"High | Critical"}.'
            },
            {
              role: 'user',
              content: `Finding type: ${finding.kind}\nSemantic issue: ${finding.title}\nDuplicate rationale: ${finding.rationale || 'Single report; no duplicate asserted.'}\nReport count: ${finding.tickets.length}\n\nEvidence:\n${combinedReports}`
            }
          ],
          options: { temperature: 0.2 }
        })
      });

      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (!parsed.summary || !parsed.rootCauseHypothesis || !Array.isArray(parsed.reproductionSteps)) {
        throw new Error('Qwen returned an incomplete Jira draft');
      }
      setJiraDrafts((prev) => ({ ...prev, [finding.key]: parsed }));
    } catch (error) {
      setJiraDrafts((prev) => ({
        ...prev,
        [finding.key]: {
          summary: finding.kind === 'duplicate'
            ? `[Duplicate reports] ${finding.title}`
            : `[${finding.tickets[0].id}] ${finding.tickets[0].description}`,
          rootCauseHypothesis: `Qwen could not complete the draft (${error.message}). Review the supplied report evidence; no root cause has been established.`,
          reproductionSteps: finding.tickets.map((ticket) => `Review report ${ticket.id}: ${ticket.description}`),
          priority: finding.tickets.some((ticket) => ticket.severity === 'Critical') ? 'Critical' : 'High'
        }
      }));
    } finally {
      setIsDraftingJira(false);
    }
  };

  const confirmPushToJira = (findingKey) => {
    const randomJira = `ENG-${Math.floor(200 + Math.random() * 799)}`;
    setPushedJiraIds((prev) => ({ ...prev, [findingKey]: randomJira }));
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Demo Navigation Bar */}
      <nav className="w-full bg-zinc-950 text-white px-6 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveApp('user')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeApp === 'user'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            App 1: User Feedback & 30s Clipper
          </button>

          <button
            onClick={() => setActiveApp('admin')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeApp === 'admin'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            App 2: Semantic Duplicate Review
            <span className="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
              {duplicateFindings.length} Duplicate Groups ({tickets.length} Reports)
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono bg-zinc-900 border border-zinc-800 flex items-center gap-2 hover:border-zinc-700 cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                ollamaStatus === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>
              {ollamaStatus === 'online'
                ? `Ollama Live (${ollamaModel})`
                : `Ollama Fallback (${ollamaModel})`}
            </span>
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </nav>

      {/* Ollama Settings Drawer */}
      {showSettings && (
        <div className="w-full bg-zinc-900 text-zinc-200 px-6 py-4 border-b border-zinc-800">
          <div className="max-w-5xl mx-auto flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                  Ollama URL
                </label>
                <input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                  Local Model Name
                </label>
                <input
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="qwen2.5:3b"
                  className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-white"
                />
              </div>
              <button
                onClick={checkOllama}
                className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer mt-4"
              >
                Save & Re-test Connection
              </button>
            </div>

            {tickets.length > 0 && (
              <button
                onClick={() => {
                  saveTickets([]);
                  setJiraDrafts({});
                  setPushedJiraIds({});
                }}
                className="px-3 py-1.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-1.5 hover:bg-rose-900/60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset Demo Database ({tickets.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          APP 1: USER FEEDBACK & 30-SECOND CLIPPER
      ===================================================================== */}
      {activeApp === 'user' ? (
        <div className="flex-1 w-full bg-slate-50 pb-16">
          {/* Header */}
          <header className="w-full bg-white border-b border-slate-200">
            <div className="max-w-4xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    Send Feedback or Report a Problem
                  </h1>
                  <p className="text-sm text-slate-500">
                    Quick desktop clipper • Tell us what happened in plain English
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLiveScreenRecording ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>
                  {isLiveScreenRecording
                    ? `Recording • buffer ${bufferSeconds}s / 30s`
                    : 'Recording off • clipping unavailable'}
                </span>
              </div>
            </div>
          </header>

          {/* Main Form Container */}
          <main className="max-w-4xl mx-auto px-6 mt-8 space-y-6">
            {submitSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      Report sent! Thank you for helping us improve.
                    </p>
                    <p className="text-xs text-emerald-700">
                      Your report passed Qwen’s clarity check and has been queued for semantic duplicate scanning.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveApp('admin')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer shrink-0"
                >
                  View in App 2 →
                </button>
              </div>
            )}

            {/* 1. 30-Second Screen Clipper Card */}
            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      attachedClip
                        ? 'bg-emerald-600 text-white'
                        : isLiveScreenRecording
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {attachedClip ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <Video className="w-6 h-6" />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900">
                        Instant 30-Second Screen Clip
                      </h2>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Alt + F10
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      Start recording, and if something goes wrong you can grab the last 30 seconds
                      so you don't have to explain every step.
                    </p>
                    {!isLiveScreenRecording && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        <strong>Step 1:</strong> click "Start recording" and pick a screen or window.
                        Clipping only works while recording is on, and only captures what happened after you started.
                      </p>
                    )}
                    {clipNotice && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-3">
                        {clipNotice}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={isLiveScreenRecording ? stopScreenRecording : startRealScreenRecording}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                      isLiveScreenRecording
                        ? 'border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    {isLiveScreenRecording ? 'Stop recording' : 'Start recording'}
                  </button>

                  <button
                    type="button"
                    onClick={clipLast30Seconds}
                    disabled={!isLiveScreenRecording}
                    title={isLiveScreenRecording ? 'Clip the last 30 seconds' : 'Start recording first'}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    <Film className="w-4 h-4" />
                    Clip Last 30 Seconds
                  </button>
                </div>
              </div>

              {attachedClip && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-semibold">
                      ✓ Attached ({attachedClip.duration})
                    </span>
                    <span className="text-xs text-slate-600">
                      Captured at {attachedClip.timestamp}{' '}
                      {attachedClip.isReal ? '(Live macOS WebM)' : '(Instant Snapshot)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {attachedClip.isReal && (
                      <video
                        src={attachedClip.url}
                        controls
                        className="h-20 rounded-lg border border-slate-200 bg-black"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setAttachedClip(null)}
                      className="text-xs text-rose-600 hover:underline font-medium cursor-pointer"
                    >
                      Remove Clip
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* 2. Main Feedback Form */}
            <form
              onSubmit={handleSubmitReport}
              className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6"
            >
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  1. How can we help today?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => { setCategory('Bug'); setAnsweredChips({}); }}
                    className={`p-4 rounded-xl border-2 text-left flex items-center gap-3.5 transition cursor-pointer ${
                      category === 'Bug'
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <AlertCircle
                      className={`w-5 h-5 shrink-0 ${
                        category === 'Bug' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900">Something broke</div>
                      <div className="text-xs text-slate-500">Error or frozen screen</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setCategory('Feature Request'); setAnsweredChips({}); }}
                    className={`p-4 rounded-xl border-2 text-left flex items-center gap-3.5 transition cursor-pointer ${
                      category === 'Feature Request'
                        ? 'border-blue-600 bg-blue-50/50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Lightbulb
                      className={`w-5 h-5 shrink-0 ${
                        category === 'Feature Request' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-bold text-slate-900">Idea or suggestion</div>
                      <div className="text-xs text-slate-500">Make something better</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Context Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your Name (optional)
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="e.g. Alex (Design)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Where did this happen?
                  </label>
                  <select
                    value={whereArea}
                    onChange={(e) => { setWhereArea(e.target.value); setAnsweredChips({}); }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-blue-600"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    How much is this slowing you down?
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-blue-600"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Tell us what happened
                  </label>
                  <button
                    type="button"
                    onClick={() => analyzeVagueness(currentReportSnapshot, { generateSuggestions: !suggestionsGeneratedRef.current })}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isCheckingAi ? 'Qwen checking...' : 'Re-check with Qwen'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setAnsweredChips({}); }}
                  placeholder="Type a quick note (e.g. 'I can't log in with Okta' or 'Exporting invoices crashes the page')..."
                  className="w-full p-4 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                />
                <div className={`mt-3 rounded-xl border px-4 py-3 text-xs ${
                  isCheckingAi
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : vagueCheck.checked && !vagueCheck.isVague && vagueCheck.checkedFingerprint === currentReportFingerprint
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {isCheckingAi ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                      vagueCheck.checked && !vagueCheck.isVague && vagueCheck.checkedFingerprint === currentReportFingerprint
                        ? <CheckCircle2 className="w-4 h-4" />
                        : <AlertCircle className="w-4 h-4" />}
                    {isCheckingAi
                      ? 'Qwen is reviewing this report'
                      : vagueCheck.checked && !vagueCheck.isVague && vagueCheck.checkedFingerprint === currentReportFingerprint
                        ? 'Qwen approved this report for sending'
                        : 'Qwen approval required before sending'}
                  </div>
                  <p className="mt-1">{vagueCheck.reason || 'Write your report and Qwen will check whether it is specific enough to send.'}</p>
                  {!isCheckingAi && vagueCheck.checked && vagueCheck.checkedFingerprint !== currentReportFingerprint && (
                    <p className="mt-1 font-semibold">The report has changed since the last check. Qwen must review it again.</p>
                  )}
                </div>
              </div>

              {/* AI Follow-Up Suggestions Box */}
              {aiQuestions.length > 0 && (
                <div className="p-5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-900 font-bold text-xs uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      Optional quick details — choose up to 3 (shown once)
                    </div>
                    <span className="text-[11px] font-mono text-blue-600">
                      Powered by {ollamaModel}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {aiQuestions.map((q) => (
                      <div
                        key={q.id || q.question}
                        className="bg-white p-3.5 rounded-xl border border-blue-100"
                      >
                        <p className="text-xs font-semibold text-slate-800 mb-2">
                          {q.question}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(q.options || []).map((opt) => {
                            const selectedForQuestion = Array.isArray(answeredChips[q.question])
                              ? answeredChips[q.question]
                              : answeredChips[q.question]
                                ? [answeredChips[q.question]]
                                : [];
                            const isSelected = selectedForQuestion.includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleSelectChip(q.question, opt)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {isSelected && <Check className="w-3.5 h-3.5" />}
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Choose up to 3 options that fit. They are optional. Qwen will not generate another question round.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[11px] text-blue-800">{selectedFollowUpCount} of 3 selected</span>
                    <button
                      type="button"
                      onClick={() => analyzeVagueness(currentReportSnapshot)}
                      disabled={selectedFollowUpCount === 0 || isCheckingAi}
                      className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isCheckingAi ? 'Checking selected details...' : 'Include selections & check once'}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Footer */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-900">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Attach extra screenshot ({screenshots.length})</span>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setScreenshots(Array.from(e.target.files || []))}
                    className="hidden"
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmitReport}
                  title={canSubmitReport ? 'Send the Qwen-approved report' : 'Qwen must approve the current report before it can be sent'}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Send className="w-4 h-4" />
                  {canSubmitReport ? 'Send Report' : isCheckingAi ? 'Waiting for Qwen check' : 'Send locked — Qwen approval needed'}
                </button>
              </div>
            </form>
          </main>
        </div>
      ) : (
        /* =====================================================================
            APP 2: SEMANTIC DUPLICATE REVIEW CONSOLE
        ===================================================================== */
        <div className="flex-1 w-full bg-zinc-950 text-zinc-100 pb-16">
          <div className="max-w-6xl mx-auto px-6 pt-8 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-blue-400">
                  Engineering Triage Command Center
                </span>
                <h1 className="text-2xl font-bold text-white mt-1">
                  Semantic Duplicate Review
                </h1>
                <p className="text-sm text-zinc-400 max-w-3xl">
                  Qwen compares what actually happened in each report — the symptom, action and failure behaviour. Page or feature labels are context only, so different problems on the same screen stay separate.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-2 rounded-lg border text-xs font-mono ${
                  duplicateScan.status === 'complete'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : duplicateScan.status === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                }`}>
                  {duplicateScan.status === 'complete'
                    ? 'Qwen scan complete'
                    : duplicateScan.status === 'error'
                    ? 'Scan failed'
                    : duplicateScan.status === 'scanning'
                    ? 'Qwen scanning tickets…'
                    : 'Waiting for reports'}
                </span>
                <button
                  type="button"
                  onClick={() => scanSemanticDuplicates(tickets)}
                  disabled={tickets.length === 0 || duplicateScan.status === 'scanning'}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${duplicateScan.status === 'scanning' ? 'animate-spin' : ''}`} />
                  Scan for duplicates
                </button>
              </div>
            </div>

            {duplicateScan.error && (
              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-sm">
                {duplicateScan.error} Check the Ollama URL and model in Settings, then run the scan again. Reports remain saved; they are not automatically grouped while the scan is unavailable.
              </div>
            )}

            {tickets.length === 0 ? (
              <div className="p-12 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-3">
                <Layers className="w-10 h-10 text-zinc-500 mx-auto" />
                <h3 className="text-base font-bold text-white">No Reports Yet</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Submit reports in App 1. Qwen will compare their meaning and separate confirmed duplicates, possible matches and distinct problems.
                </p>
                <button
                  onClick={() => setActiveApp('user')}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Go to App 1 (User Feedback)
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left column: semantic matches and individual reports */}
                <div className="lg:col-span-5 space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                        Confirmed duplicates ({duplicateFindings.length})
                      </h2>
                    </div>
                    {duplicateFindings.length === 0 && (
                      <p className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-500">
                        {duplicateScan.status === 'scanning'
                          ? 'Qwen is comparing ticket meaning…'
                          : 'No confirmed semantic duplicates found.'}
                      </p>
                    )}
                    {duplicateFindings.map((finding) => {
                      const isSelected = activeFinding?.key === finding.key;
                      const jiraId = pushedJiraIds[finding.key];
                      return (
                        <button
                          type="button"
                          key={finding.key}
                          onClick={() => setSelectedFindingKey(finding.key)}
                          className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${
                            isSelected ? 'bg-zinc-900 border-blue-500 shadow-md' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              {finding.id} • {finding.tickets.length} duplicate reports
                            </span>
                            <span className="text-[10px] uppercase font-mono text-emerald-300">{finding.confidence} confidence</span>
                          </div>
                          <h3 className="text-sm font-bold text-white">{finding.title}</h3>
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{finding.rationale}</p>
                          {jiraId && <p className="text-[11px] text-emerald-300 mt-2">Jira draft marked: {jiraId}</p>}
                        </button>
                      );
                    })}
                  </section>

                  {possibleFindings.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-amber-300">
                        Possible duplicates — review ({possibleFindings.length})
                      </h2>
                      {possibleFindings.map((finding) => (
                        <button
                          type="button"
                          key={finding.key}
                          onClick={() => setSelectedFindingKey(finding.key)}
                          className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${
                            activeFinding?.key === finding.key ? 'bg-zinc-900 border-amber-500' : 'bg-zinc-900/50 border-amber-900/60 hover:border-amber-700'
                          }`}
                        >
                          <span className="text-[11px] font-mono text-amber-300">{finding.tickets.map((ticket) => ticket.id).join(' ↔ ')}</span>
                          <p className="text-xs text-zinc-300 mt-1">{finding.tickets.map((ticket) => ticket.description).join(' / ')}</p>
                          <p className="text-[11px] text-zinc-500 mt-1">{finding.rationale}</p>
                        </button>
                      ))}
                    </section>
                  )}

                  <section className="space-y-3">
                    <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                      {duplicateScan.status === 'complete' ? 'Individual / unmatched reports' : 'Reports awaiting classification'} ({uniqueFindings.length})
                    </h2>
                    {uniqueFindings.map((finding) => (
                      <button
                        type="button"
                        key={finding.key}
                        onClick={() => setSelectedFindingKey(finding.key)}
                        className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${
                          activeFinding?.key === finding.key ? 'bg-zinc-900 border-blue-500' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono text-zinc-400">{finding.id}</span>
                          <span className="text-[10px] uppercase font-mono text-zinc-500">{duplicateScan.status === 'complete' ? 'No strong match' : 'Awaiting scan'}</span>
                        </div>
                        <p className="text-sm text-white line-clamp-2">{finding.title}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{finding.tickets[0]?.area} • {finding.tickets[0]?.category}</p>
                      </button>
                    ))}
                  </section>
                </div>

                {/* Right column: finding evidence and Jira drafting */}
                <div className="lg:col-span-7">
                  {activeFinding ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-blue-400 font-bold">{activeFinding.id}</span>
                            <span className="text-xs text-zinc-500">•</span>
                            <span className={`text-xs font-semibold ${activeFinding.kind === 'duplicate' ? 'text-emerald-300' : activeFinding.kind === 'possible' ? 'text-amber-300' : 'text-zinc-400'}`}>
                              {activeFinding.kind === 'duplicate' ? 'Confirmed semantic duplicate' : activeFinding.kind === 'possible' ? 'Possible duplicate — not merged' : 'Individual report'}
                            </span>
                          </div>
                          <h2 className="text-lg font-bold text-white mt-2">
                            {activeFinding.kind === 'single' ? 'Report evidence' : activeFinding.title}
                          </h2>
                          <p className="text-xs text-zinc-400 mt-2">{activeFinding.rationale}</p>
                          <p className="text-[11px] text-zinc-500 mt-2">
                            Areas mentioned: {[...new Set(activeFinding.tickets.map((ticket) => ticket.area))].join(', ')}
                          </p>
                        </div>

                        <button
                          onClick={() => generateFindingJiraDraft(activeFinding)}
                          disabled={isDraftingJira || activeFinding.kind === 'possible'}
                          title={activeFinding.kind === 'possible' ? 'Possible matches must be reviewed before creating a consolidated Jira draft' : 'Draft an issue from this semantic finding with Qwen'}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-sm"
                        >
                          <Sparkles className="w-4 h-4" />
                          {isDraftingJira
                            ? 'Qwen drafting Jira…'
                            : activeFinding.kind === 'possible'
                            ? 'Review before drafting'
                            : activeFinding.kind === 'duplicate'
                            ? 'Draft Jira from duplicates'
                            : 'Draft Jira for this report'}
                        </button>
                      </div>

                      {activeFinding.kind === 'possible' && (
                        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200">
                          These reports are only a possible match. Qwen has not merged them, and no consolidated Jira draft is available until a human has reviewed whether they describe the same underlying failure.
                        </div>
                      )}

                      {jiraDrafts[activeFinding.key] && (
                        <div className="p-5 rounded-xl bg-zinc-950 border border-blue-500/40 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-mono uppercase text-blue-400 font-bold flex items-center gap-1.5">
                              <FileText className="w-4 h-4" />
                              Qwen Jira draft
                            </span>
                            {pushedJiraIds[activeFinding.key] ? (
                              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">
                                ✓ Created in Jira: {pushedJiraIds[activeFinding.key]}
                              </span>
                            ) : (
                              <button
                                onClick={() => confirmPushToJira(activeFinding.key)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                              >
                                Confirm & Create Jira Issue
                              </button>
                            )}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-zinc-500 font-mono">SUMMARY: </span>
                              <span className="text-white font-semibold">{jiraDrafts[activeFinding.key].summary}</span>
                            </div>
                            <div>
                              <span className="text-zinc-500 font-mono">ROOT CAUSE HYPOTHESIS: </span>
                              <p className="text-zinc-300 mt-1">{jiraDrafts[activeFinding.key].rootCauseHypothesis}</p>
                            </div>
                            <div>
                              <span className="text-zinc-500 font-mono">REPRODUCTION STEPS: </span>
                              <ul className="list-disc list-inside text-zinc-300 mt-1 space-y-1">
                                {(jiraDrafts[activeFinding.key].reproductionSteps || []).map((step, index) => (
                                  <li key={index}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h3 className="text-xs font-mono uppercase text-zinc-400">
                          Ticket evidence ({activeFinding.tickets.length})
                        </h3>
                        {activeFinding.tickets.map((ticket) => (
                          <div key={ticket.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                            <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
                              <span className="font-mono font-bold text-zinc-300">{ticket.id} • {ticket.reporter}</span>
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">
                                {ticket.area} • Severity: {ticket.severity} • {ticket.createdAt}
                              </span>
                            </div>
                            <p className="text-sm text-white">“{ticket.description}”</p>
                            {Object.keys(ticket.followUpAnswers || {}).length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-2">
                                {Object.entries(ticket.followUpAnswers).map(([question, answer]) => (
                                  <span key={question} className="px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[11px]">
                                    <strong>{question}:</strong> {answer}
                                  </span>
                                ))}
                              </div>
                            )}
                            {ticket.clip && (
                              <div className="pt-2">
                                <span className="text-[11px] font-mono text-emerald-400 block mb-1">
                                  🎥 Attached 30s Screen Clip ({ticket.clip.duration})
                                </span>
                                {ticket.clip.isReal ? (
                                  <video src={ticket.clip.url} controls className="h-32 rounded-lg border border-zinc-800 bg-black" />
                                ) : (
                                  <img src={ticket.clip.url} alt="Replay clip snapshot" className="h-28 rounded-lg border border-zinc-800" />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">
                      Select a finding to inspect its reports.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}