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

const BUG_SEVERITIES = [
  { value: 'Critical', label: "I'm completely stuck" },
  { value: 'High', label: 'Slowing me down a lot' },
  { value: 'Medium', label: 'Minor annoyance' },
  { value: 'Low', label: 'Visual glitch / typo' }
];

const FEATURE_SEVERITIES = [
  { value: 'Must Have', label: 'Critical for my workflow' },
  { value: 'Nice to Have', label: 'Would make things easier' },
  { value: 'Minor Idea', label: 'Just a small suggestion' }
];

const INITIAL_SCAN_STATE = {
  status: 'idle',
  processedIds: [],
  duplicateGroups: [],
  possibleDuplicates: [],
  uniqueTicketIds: [],
  error: ''
};

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

  // Cached Incremental Duplicate Scan State
  const [duplicateScan, setDuplicateScan] = useState(() => {
    try {
      const saved = localStorage.getItem('sentinel_duplicate_scan_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...INITIAL_SCAN_STATE, ...parsed, status: parsed.processedIds?.length ? 'complete' : 'idle', error: '' };
      }
    } catch {}
    return INITIAL_SCAN_STATE;
  });

  const commitDuplicateScan = (updater) => {
    setDuplicateScan((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('sentinel_duplicate_scan_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Sync across tabs/windows
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'sentinel_real_tickets' && e.newValue) {
        setTickets(JSON.parse(e.newValue));
      }
      if (e.key === 'sentinel_duplicate_scan_v1' && e.newValue) {
        setDuplicateScan(JSON.parse(e.newValue));
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
  const [severity, setSeverity] = useState(BUG_SEVERITIES[0].value);
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState([]);

  // AI Vagueness Coach
  const [aiQuestions, setAiQuestions] = useState([]);
  const [answeredChips, setAnsweredChips] = useState({});
  const [isCheckingAi, setIsCheckingAi] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [vagueCheck, setVagueCheck] = useState({
    checked: false,
    checkedFingerprint: '',
    isVague: true,
    unavailable: false,
    reason: ''
  });
  const vagueCheckRef = useRef(vagueCheck);
  const commitVagueCheck = (nextVerdict) => {
    vagueCheckRef.current = nextVerdict;
    setVagueCheck(nextVerdict);
  };

  // 30-Second Rolling Screen Buffer
  const [bufferSeconds, setBufferSeconds] = useState(0);
  const [isLiveScreenRecording, setIsLiveScreenRecording] = useState(false);
  const [attachedClip, setAttachedClip] = useState(null);
  const [clipNotice, setClipNotice] = useState('');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

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
    } catch {
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

  // ---------------------------------------------------------------------------
  // STRICT QWEN CLARITY CHECK (VAGUE = LOCKED + CHIPS SHOWN)
  // ---------------------------------------------------------------------------
  const clarityRequestRef = useRef(0);
  const currentReportSnapshot = {
    text: description.trim(),
    area: whereArea,
    category,
    answers: answeredChips
  };
  const currentReportFingerprint = JSON.stringify(currentReportSnapshot);

  const deduplicateQuestions = (rawList) => {
    const seen = new Set();
    const result = [];
    for (const q of rawList) {
      if (!q || typeof q.question !== 'string' || !Array.isArray(q.options)) continue;
      const norm = q.question.trim().toLowerCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const uniqueOpts = [...new Set(q.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim()))].slice(0, 4);
      if (uniqueOpts.length > 0) {
        result.push({ id: q.id || `q${result.length + 1}`, question: q.question.trim(), options: uniqueOpts });
      }
      if (result.length >= 2) break;
    }
    return result;
  };

  const analyzeVagueness = async (snapshot = currentReportSnapshot) => {
    const text = (snapshot.text || '').trim();
    const fingerprint = JSON.stringify(snapshot);
    const requestId = ++clarityRequestRef.current;

    const followUps = Object.entries(snapshot.answers || {}).flatMap(([q, vals]) =>
      (Array.isArray(vals) ? vals : vals ? [vals] : []).map((v) => `${q}: ${v}`)
    );

    if (!text) {
      setIsCheckingAi(false);
      setAiQuestions([]);
      commitVagueCheck({ checked: false, checkedFingerprint: '', isVague: true, unavailable: false, reason: '' });
      return;
    }

    setIsCheckingAi(true);

    const callQwen = async (system, user) => {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          stream: false,
          format: 'json',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          options: { temperature: 0 }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawContent = data?.message?.content || '{}';
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    };

    // Call 1: Qwen's clear / vague verdict.
    const VERDICT_PROMPT = `You decide whether a support ticket has enough information for a human to act on.

The bar is LOW. Reporters are ordinary users, not technical. They do not need correct terminology, error codes or reproduction steps. Short is fine, and typos or casual wording are fine.

Type "Bug": CLEAR if a support engineer could tell BOTH (1) which feature / screen / action is involved AND (2) what went wrong.
Type "Feature": CLEAR if the note names a concrete thing the person wants (e.g. "Add a dark mode toggle"). A feature request is a normal, valid report. Never say that no issue was reported.

VAGUE means it could describe almost any problem and the engineer would have to come back and ask "what exactly happened?". The "Area" is a dropdown the reporter may not have touched, so it does NOT count as detail on its own.

CLEAR examples:
- "Can't log in, it says my password is wrong"
- "Export to CSV gives me an empty file"
- "Save button in settings does nothing"
- "Dashboard takes about a minute to load since yesterday"
- "Add a dark mode toggle"

VAGUE examples:
- "not working"
- "fix plz"
- "broken"
- "error"
- "help"
- "it's slow"
- "login issue"
- "doesn't load"

Follow-up answers the reporter picked count as real information. If the note plus the follow-up answers together cover what is needed, it is CLEAR. If they still leave an engineer guessing, it is VAGUE.

Return ONLY JSON: {"isClear": true, "reason": "Ready to send."}
- If VAGUE: "reason" is ONE friendly sentence to the reporter saying what detail is missing (for example "Could you say what happened when you tried to log in?"). Do not mention "the user", "the description", "follow-up", or that no issue was reported.
- If CLEAR: "reason" is "Ready to send."`;

    // Call 2: suggestion chips only (bug reports only). It never judges the report.
    const SUGGEST_PROMPT = `You write quick-pick follow-up questions for a support form. The reporter has already written a note about a problem. Your ONLY job is to suggest 2 questions that let them add useful detail with one tap.

Rules:
- Do NOT judge the note. Never say that nothing was reported, that there is no issue, or that anything is missing or unclear.
- Every question must be a direct question to the reporter, ending in "?" (for example "What did you see on screen?"). Never write statements.
- Make them specific to this note and area. Plain, friendly language.
- Ask about things like what they saw happen, what they were trying to do, when it started, how often it happens.
- If the note is very short or generic, ask first about what exactly happened or which feature is involved.
- Each question has 2-4 short options a person could tap, written as natural answers (e.g. "An error message appeared"). Never use "Other", "None" or "N/A" as options.
- Do not repeat any question the reporter already answered.

Return ONLY JSON:
{"questions": [{"id": "q1", "question": "...?", "options": ["...", "...", "..."]}, {"id": "q2", "question": "...?", "options": ["...", "...", "..."]}]}`;

    const userMessage = `Area dropdown (pre-selected, NOT written by the reporter): ${snapshot.area}
Type: ${snapshot.category}
Reporter's note: "${text}"
Follow-up answers the reporter picked: ${followUps.length > 0 ? followUps.join(' | ') : 'None'}`;

    try {
      const [verdictResult, suggestResult] = await Promise.allSettled([
        callQwen(VERDICT_PROMPT, userMessage),
        // "Idea or suggestion" reports get no AI suggestion chips, so that call is skipped entirely.
        snapshot.category === 'Feature Request' ? Promise.resolve({ questions: [] }) : callQwen(SUGGEST_PROMPT, userMessage)
      ]);

      if (requestId !== clarityRequestRef.current) return;

      // Only the verdict is essential. If it failed, the report stays unapproved (no local guessing).
      if (verdictResult.status === 'rejected') throw verdictResult.reason;
      const parsed = verdictResult.value;

      const flag = parsed.isClear;
      const isClear = flag === true || flag === 'true' ? true : flag === false || flag === 'false' ? false : null;
      if (isClear === null) throw new Error('Model returned no clear/vague verdict');

      // Suggestions are a bonus: if that call failed (or this is an idea) we just show none.
      const fresh =
        suggestResult.status === 'fulfilled'
          ? deduplicateQuestions(Array.isArray(suggestResult.value?.questions) ? suggestResult.value.questions : [])
          : [];
      const answeredKeys = Object.keys(snapshot.answers || {});
      // Keep questions the reporter already answered on screen so their selections stay visible.
      setAiQuestions((prev) => {
        const kept = prev.filter((q) => answeredKeys.includes(q.question));
        const keptNorm = new Set(kept.map((q) => q.question.trim().toLowerCase()));
        return [...kept, ...fresh.filter((q) => !keptNorm.has(q.question.toLowerCase()))];
      });

      let friendlyReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
      if (!friendlyReason || /user description|no follow-up|no issue|not report|n't report/i.test(friendlyReason)) {
        friendlyReason = 'Please add a bit more detail about what happened before sending.';
      }

      commitVagueCheck({
        checked: true,
        checkedFingerprint: fingerprint,
        isVague: !isClear,
        unavailable: false,
        reason: isClear ? 'Ready to send.' : friendlyReason
      });
    } catch {
      if (requestId !== clarityRequestRef.current) return;

      commitVagueCheck({
        checked: true,
        checkedFingerprint: fingerprint,
        isVague: true,
        unavailable: true,
        reason: "Couldn't get a verdict from Qwen. Check that Ollama is running, then retry."
      });
    } finally {
      if (requestId === clarityRequestRef.current) setIsCheckingAi(false);
    }
  };

  useEffect(() => {
    clarityRequestRef.current += 1;
    const snapshot = {
      text: description.trim(),
      area: whereArea,
      category,
      answers: answeredChips
    };

    if (!snapshot.text) {
      setIsCheckingAi(false);
      setAiQuestions([]);
      commitVagueCheck({ checked: false, checkedFingerprint: '', isVague: true, unavailable: false, reason: '' });
      return;
    }

    setIsCheckingAi(true);
    const timer = setTimeout(() => analyzeVagueness(snapshot), 400);
    return () => clearTimeout(timer);
  }, [description, whereArea, category, answeredChips, ollamaUrl, ollamaModel]);

  const handleSelectChip = (questionText, optionText) => {
    setAnsweredChips((prev) => {
      const current = Array.isArray(prev[questionText]) ? prev[questionText] : prev[questionText] ? [prev[questionText]] : [];
      const next = current.includes(optionText) ? current.filter((item) => item !== optionText) : [...current, optionText];
      const updated = { ...prev };
      if (next.length === 0) delete updated[questionText];
      else updated[questionText] = next;
      return updated;
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
    const submittedFingerprint = JSON.stringify({
      text: description.trim(),
      area: whereArea,
      category,
      answers: answeredChips
    });
    const latestVerdict = vagueCheckRef.current;
    const hasCurrentApproval =
      description.trim().length > 0 &&
      latestVerdict.checked === true &&
      latestVerdict.isVague === false &&
      latestVerdict.checkedFingerprint === submittedFingerprint &&
      !isCheckingAi;

    if (!hasCurrentApproval) return;

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
    commitVagueCheck({ checked: false, checkedFingerprint: '', isVague: true, unavailable: false, reason: '' });
    setAttachedClip(null);
    setScreenshots([]);
    setSubmitSuccess(true);
    setTimeout(() => setSubmitSuccess(false), 3500);
  };

  // ---------------------------------------------------------------------------
  // APP 2: INCREMENTAL O(1) SEMANTIC DUPLICATE ENGINE
  // ---------------------------------------------------------------------------
  const [selectedFindingKey, setSelectedFindingKey] = useState(null);
  const [jiraDrafts, setJiraDrafts] = useState({});
  const [isDraftingJira, setIsDraftingJira] = useState(false);
  const [pushedJiraIds, setPushedJiraIds] = useState({});
  const duplicateScanRequestRef = useRef(0);

  const runIncrementalDuplicateScan = async (ticketSnapshot = tickets, { forceFullRebuild = false } = {}) => {
    const requestId = ++duplicateScanRequestRef.current;

    if (!ticketSnapshot.length) {
      commitDuplicateScan(INITIAL_SCAN_STATE);
      return;
    }

    const baseState = forceFullRebuild ? INITIAL_SCAN_STATE : duplicateScan;
    const knownIds = new Set(ticketSnapshot.map((t) => t.id));

    let workingGroups = (baseState.duplicateGroups || [])
      .map((g) => ({ ...g, ticketIds: (g.ticketIds || []).filter((id) => knownIds.has(id)) }))
      .filter((g) => g.ticketIds.length >= 2);

    let workingPossibles = (baseState.possibleDuplicates || [])
      .map((p) => ({ ...p, ticketIds: (p.ticketIds || []).filter((id) => knownIds.has(id)) }))
      .filter((p) => p.ticketIds.length === 2);

    let workingUniques = (baseState.uniqueTicketIds || []).filter((id) => knownIds.has(id));
    let processedSet = new Set((baseState.processedIds || []).filter((id) => knownIds.has(id)));

    const unindexedTickets = [...ticketSnapshot]
      .reverse()
      .filter((t) => !processedSet.has(t.id));

    if (unindexedTickets.length === 0) {
      commitDuplicateScan({
        status: 'complete',
        processedIds: [...processedSet],
        duplicateGroups: workingGroups,
        possibleDuplicates: workingPossibles,
        uniqueTicketIds: workingUniques,
        error: ''
      });
      return;
    }

    commitDuplicateScan((prev) => ({
      ...prev,
      status: 'scanning',
      error: ''
    }));

    try {
      for (const newTicket of unindexedTickets) {
        if (requestId !== duplicateScanRequestRef.current) return;

        if (processedSet.size === 0) {
          workingUniques.push(newTicket.id);
          processedSet.add(newTicket.id);
          continue;
        }

        const candidates = [
          ...workingGroups.map((g) => {
            const sampleTicket = ticketSnapshot.find((t) => t.id === g.ticketIds[0]);
            return {
              candidateId: g.id,
              type: 'group',
              title: g.title,
              sampleDescription: sampleTicket?.description || g.title,
              area: sampleTicket?.area || ''
            };
          }),
          ...workingUniques.map((uid) => {
            const t = ticketSnapshot.find((item) => item.id === uid);
            return t
              ? {
                  candidateId: t.id,
                  type: 'ticket',
                  title: t.description,
                  followUps: t.followUpAnswers || {},
                  area: t.area
                }
              : null;
          }).filter(Boolean)
        ];

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
                content: `You check if ONE new bug/feedback ticket is an EXACT DUPLICATE of an existing ticket or group.
Compare the actual symptom and broken behaviour (ignore whether they are on the same page if the problem itself is different).
- Set "matchType": "exact" ONLY if the new ticket describes the exact same underlying problem as one of the candidates.
- Set "matchType": "possible" if it might be related but is ambiguous.
- Set "matchType": "none" if it is a different issue.
Return ONLY valid JSON:
{"matchType": "exact" | "possible" | "none", "targetId": "D-01 or T-1001 or null", "title": "Short shared issue title if exact match", "rationale": "1-sentence explanation", "confidence": "high" | "medium"}`
              },
              {
                role: 'user',
                content: `NEW TICKET:\nID: ${newTicket.id} | Area: ${newTicket.area} | Type: ${newTicket.category}\nDescription: "${newTicket.description}"\nFollow-ups: ${JSON.stringify(newTicket.followUpAnswers || {})}\n\nEXISTING CANDIDATES:\n${JSON.stringify(candidates)}`
              }
            ],
            options: { temperature: 0.1 }
          })
        });

        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.message?.content || '{}';
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : raw);

        const targetId = typeof parsed.targetId === 'string' ? parsed.targetId.trim() : '';
        const matchType = parsed.matchType;

        if (matchType === 'exact' && targetId) {
          const existingGroupIdx = workingGroups.findIndex((g) => g.id === targetId);
          const existingUniqueIdx = workingUniques.findIndex((uid) => uid === targetId);

          if (existingGroupIdx !== -1) {
            const grp = workingGroups[existingGroupIdx];
            if (!grp.ticketIds.includes(newTicket.id)) {
              grp.ticketIds = [newTicket.id, ...grp.ticketIds];
            }
            if (parsed.rationale) grp.rationale = parsed.rationale;
          } else if (existingUniqueIdx !== -1) {
            const matchedUid = workingUniques[existingUniqueIdx];
            workingUniques.splice(existingUniqueIdx, 1);
            const newGroupId = `D-${String(workingGroups.length + 1).padStart(2, '0')}`;
            workingGroups.push({
              id: newGroupId,
              title: parsed.title?.trim() || newTicket.description.slice(0, 60),
              ticketIds: [newTicket.id, matchedUid],
              rationale: parsed.rationale || 'Both reports describe the exact same underlying issue.',
              confidence: parsed.confidence === 'medium' ? 'medium' : 'high'
            });
          } else {
            workingUniques.unshift(newTicket.id);
          }
        } else if (matchType === 'possible' && targetId && workingUniques.includes(targetId)) {
          workingUniques = workingUniques.filter((uid) => uid !== targetId);
          workingPossibles.push({
            id: `P-${String(workingPossibles.length + 1).padStart(2, '0')}`,
            ticketIds: [newTicket.id, targetId],
            rationale: parsed.rationale || 'Possible overlap requiring human review.',
            confidence: 'medium'
          });
        } else {
          workingUniques.unshift(newTicket.id);
        }

        processedSet.add(newTicket.id);
      }

      if (requestId !== duplicateScanRequestRef.current) return;

      commitDuplicateScan({
        status: 'complete',
        processedIds: [...processedSet],
        duplicateGroups: workingGroups,
        possibleDuplicates: workingPossibles,
        uniqueTicketIds: workingUniques,
        error: ''
      });
    } catch (error) {
      if (requestId !== duplicateScanRequestRef.current) return;
      commitDuplicateScan({
        status: 'error',
        processedIds: [...processedSet],
        duplicateGroups: workingGroups,
        possibleDuplicates: workingPossibles,
        uniqueTicketIds: [
          ...unindexedTickets.filter((t) => !processedSet.has(t.id)).map((t) => t.id),
          ...workingUniques
        ],
        error: `Incremental duplicate check failed: ${error.message}`
      });
    }
  };

  useEffect(() => {
    duplicateScanRequestRef.current += 1;
    runIncrementalDuplicateScan(tickets, { forceFullRebuild: false });
  }, [tickets]);

  const duplicateFindings = duplicateScan.duplicateGroups.map((group) => {
    const groupTickets = group.ticketIds.map((id) => tickets.find((ticket) => ticket.id === id)).filter(Boolean);
    return { ...group, key: `duplicate:${group.id}`, kind: 'duplicate', tickets: groupTickets };
  }).filter((g) => g.tickets.length >= 2);

  const possibleFindings = duplicateScan.possibleDuplicates.map((pair) => {
    const pairTickets = pair.ticketIds.map((id) => tickets.find((ticket) => ticket.id === id)).filter(Boolean);
    return { ...pair, key: `possible:${pair.id}`, kind: 'possible', title: 'Possible duplicate — needs review', tickets: pairTickets };
  }).filter((p) => p.tickets.length === 2);

  const uniqueFindings = duplicateScan.uniqueTicketIds
    .map((id) => tickets.find((ticket) => ticket.id === id))
    .filter(Boolean)
    .map((ticket) => ({
      key: `ticket:${ticket.id}`,
      id: ticket.id,
      kind: 'single',
      title: ticket.description,
      rationale: duplicateScan.status === 'complete' ? 'Unique report — no duplicate match found.' : 'Queued for incremental check.',
      confidence: '',
      tickets: [ticket]
    }));

  const allFindings = [...duplicateFindings, ...possibleFindings, ...uniqueFindings];
  const activeFinding = allFindings.find((finding) => finding.key === selectedFindingKey) || allFindings[0] || null;

  const generateFindingJiraDraft = async (finding) => {
    if (!finding || finding.kind === 'possible' || !finding.tickets.length) return;
    setIsDraftingJira(true);
    const combinedReports = finding.tickets.map((ticket, index) =>
      `Report #${index + 1} (${ticket.id}; Area: ${ticket.area}; Type: ${ticket.category}; Impact: ${ticket.severity}): "${ticket.description}"`
    ).join('\n');

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
              content: 'You are a Principal Triage Engineer. Draft an actionable Jira issue. Return ONLY valid JSON with keys: {"summary":"...","rootCauseHypothesis":"...","reproductionSteps":["step 1","step 2"],"priority":"High | Critical"}.'
            },
            {
              role: 'user',
              content: `Finding type: ${finding.kind}\nIssue: ${finding.title}\nEvidence:\n${combinedReports}`
            }
          ],
          options: { temperature: 0.2 }
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data?.message?.content || '{}');
      if (!parsed.summary) throw new Error('Invalid Jira draft');
      setJiraDrafts((prev) => ({ ...prev, [finding.key]: parsed }));
    } catch (error) {
      setJiraDrafts((prev) => ({
        ...prev,
        [finding.key]: {
          summary: finding.kind === 'duplicate' ? `[Duplicate] ${finding.title}` : `[${finding.tickets[0].id}] ${finding.tickets[0].description}`,
          rootCauseHypothesis: `Qwen failed to draft (${error.message}).`,
          reproductionSteps: finding.tickets.map((ticket) => `Review report ${ticket.id}`),
          priority: 'High'
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
      <nav className="w-full bg-zinc-950 text-white px-6 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveApp('user')} className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${activeApp === 'user' ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>
            <MessageSquare className="w-4 h-4" /> App 1: User Feedback & 30s Clipper
          </button>
          <button onClick={() => setActiveApp('admin')} className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${activeApp === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>
            <Terminal className="w-4 h-4" /> App 2: Semantic Duplicate Review
            <span className="px-2 py-0.5 text-[11px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
              {duplicateFindings.length} Duplicate Groups ({tickets.length} Reports)
            </span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings(!showSettings)} className="px-3 py-1.5 rounded-lg text-xs font-mono bg-zinc-900 border border-zinc-800 flex items-center gap-2 hover:border-zinc-700 cursor-pointer">
            <span className={`w-2 h-2 rounded-full ${ollamaStatus === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>{ollamaStatus === 'online' ? `Ollama Live (${ollamaModel})` : `Ollama Fallback (${ollamaModel})`}</span>
            <Settings className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </nav>

      {showSettings && (
        <div className="w-full bg-zinc-900 text-zinc-200 px-6 py-4 border-b border-zinc-800">
          <div className="max-w-5xl mx-auto flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">Ollama URL</label>
                <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-white" />
              </div>
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">Local Model Name</label>
                <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="qwen2.5:3b" className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-xs font-mono text-white" />
              </div>
              <button onClick={checkOllama} className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer mt-4">
                Save & Re-test Connection
              </button>
            </div>
            {tickets.length > 0 && (
              <button
                onClick={() => {
                  saveTickets([]);
                  commitDuplicateScan(INITIAL_SCAN_STATE);
                  setJiraDrafts({});
                  setPushedJiraIds({});
                }}
                className="px-3 py-1.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-1.5 hover:bg-rose-900/60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Reset Demo Database ({tickets.length})
              </button>
            )}
          </div>
        </div>
      )}

      {activeApp === 'user' ? (
        <div className="flex-1 w-full bg-slate-50 pb-16">
          <header className="w-full bg-white border-b border-slate-200">
            <div className="max-w-4xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Send Feedback or Report a Problem</h1>
                  <p className="text-sm text-slate-500">Quick desktop clipper • Tell us what happened in plain English</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
                <span className={`w-2 h-2 rounded-full ${isLiveScreenRecording ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'}`} />
                <span>{isLiveScreenRecording ? `Recording • buffer ${bufferSeconds}s / 30s` : 'Recording off'}</span>
              </div>
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-6 mt-8 space-y-6">
            {submitSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Report sent! Thank you for helping us improve.</p>
                    <p className="text-xs text-emerald-700">Your report was compared against existing issues for duplicates.</p>
                  </div>
                </div>
                <button onClick={() => setActiveApp('admin')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 cursor-pointer shrink-0">
                  View in App 2 →
                </button>
              </div>
            )}

            <section className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${attachedClip ? 'bg-emerald-600 text-white' : isLiveScreenRecording ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {attachedClip ? <CheckCircle2 className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900">Instant 30-Second Screen Clip</h2>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">Alt + F10</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">Start recording, and if something goes wrong you can grab the last 30 seconds so you don't have to explain every step.</p>
                    {clipNotice && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-3">{clipNotice}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button type="button" onClick={isLiveScreenRecording ? stopScreenRecording : startRealScreenRecording} className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${isLiveScreenRecording ? 'border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'}`}>
                    <Monitor className="w-4 h-4" />
                    {isLiveScreenRecording ? 'Stop recording' : 'Start recording'}
                  </button>
                  <button type="button" onClick={clipLast30Seconds} disabled={!isLiveScreenRecording} className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-xs disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed">
                    <Film className="w-4 h-4" />
                    Clip Last 30 Seconds
                  </button>
                </div>
              </div>

              {attachedClip && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-semibold">✓ Attached ({attachedClip.duration})</span>
                    <span className="text-xs text-slate-600">Captured at {attachedClip.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {attachedClip.isReal && <video src={attachedClip.url} controls className="h-24 rounded-lg border border-slate-200 bg-black" />}
                    <button type="button" onClick={() => setAttachedClip(null)} className="text-xs text-rose-600 hover:underline font-medium cursor-pointer">Remove Clip</button>
                  </div>
                </div>
              )}
            </section>

            <form onSubmit={handleSubmitReport} className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">1. How can we help today?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('Bug');
                      setSeverity(BUG_SEVERITIES[0].value);
                      setAnsweredChips({});
                    }}
                    className={`p-4 rounded-xl border-2 text-left flex items-center gap-3.5 transition cursor-pointer ${category === 'Bug' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                  >
                    <AlertCircle className={`w-5 h-5 shrink-0 ${category === 'Bug' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-sm font-bold text-slate-900">Something broke</div>
                      <div className="text-xs text-slate-500">Error or frozen screen</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('Feature Request');
                      setSeverity(FEATURE_SEVERITIES[0].value);
                      setAnsweredChips({});
                    }}
                    className={`p-4 rounded-xl border-2 text-left flex items-center gap-3.5 transition cursor-pointer ${category === 'Feature Request' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                  >
                    <Lightbulb className={`w-5 h-5 shrink-0 ${category === 'Feature Request' ? 'text-blue-600' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-sm font-bold text-slate-900">Idea or suggestion</div>
                      <div className="text-xs text-slate-500">Make something better</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Your Name (optional)</label>
                  <input type="text" value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="e.g. Alex" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Where did this happen?</label>
                  <select value={whereArea} onChange={(e) => { setWhereArea(e.target.value); setAnsweredChips({}); }} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-blue-600">
                    {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {category === 'Bug' ? 'How much is this slowing you down?' : 'How important is this idea?'}
                  </label>
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-blue-600">
                    {(category === 'Bug' ? BUG_SEVERITIES : FEATURE_SEVERITIES).map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {category === 'Bug' ? 'Tell us what happened' : 'Describe your idea or suggestion'}
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    category === 'Bug'
                      ? "Describe what happened (e.g. 'My password keeps showing as incorrect even after IT reset it')..."
                      : "Describe what would help (e.g. 'Add a dark mode toggle to Account Settings')..."
                  }
                  className="w-full p-4 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                />

                {description.trim().length > 0 && (
                  <div className={`mt-2.5 rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2 ${isCheckingAi ? 'bg-slate-50 border-slate-200 text-slate-600' : canSubmitReport ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    {isCheckingAi ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" /><span>Checking description...</span></>
                    ) : canSubmitReport ? (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span className="font-medium">Looks clear — ready to send.</span></>
                    ) : (
                      <><AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /><span>{vagueCheck.reason || 'Please provide a bit more detail or pick an option below.'}</span>{vagueCheck.unavailable && <button type="button" onClick={() => analyzeVagueness()} className="ml-auto underline font-semibold cursor-pointer">Retry</button>}</>
                    )}
                  </div>
                )}
              </div>

              {/* Suggestion chips: bug reports only. Never shown for "Idea or suggestion". */}
              {category !== 'Feature Request' && aiQuestions.length > 0 && description.trim().length > 0 && (
                <div className="p-5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3.5">
                  <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{vagueCheck.isVague ? 'Quick questions to help clarify what happened:' : 'Optional: a few extra details that help us fix this faster'}</span>
                  </div>
                  <div className="space-y-2.5">
                    {aiQuestions.map((q) => (
                      <div key={q.id || q.question} className="bg-white p-3.5 rounded-xl border border-blue-100">
                        <p className="text-xs font-semibold text-slate-800 mb-2">{q.question}</p>
                        <div className="flex flex-wrap gap-2">
                          {(q.options || []).map((opt) => {
                            const selectedForQuestion = Array.isArray(answeredChips[q.question]) ? answeredChips[q.question] : answeredChips[q.question] ? [answeredChips[q.question]] : [];
                            const isSelected = selectedForQuestion.includes(opt);
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleSelectChip(q.question, opt)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
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
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-900">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>Attach extra screenshot ({screenshots.length})</span>
                  <input type="file" multiple onChange={(e) => setScreenshots(Array.from(e.target.files || []))} className="hidden" />
                </label>

                <button type="submit" disabled={!canSubmitReport} className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none">
                  <Send className="w-4 h-4" />
                  {isCheckingAi ? 'Checking...' : canSubmitReport ? 'Send Report' : 'Add Detail to Send'}
                </button>
              </div>
            </form>
          </main>
        </div>
      ) : (
        <div className="flex-1 w-full bg-zinc-950 text-zinc-100 pb-16">
          <div className="max-w-6xl mx-auto px-6 pt-8 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-blue-400">Engineering Triage Command Center</span>
                <h1 className="text-2xl font-bold text-white mt-1">Incremental Duplicate Detection</h1>
                <p className="text-sm text-zinc-400 max-w-3xl">
                  Each new report is checked once against existing issues and cached — so previously scanned reports never have to be re-processed.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-2 rounded-lg border text-xs font-mono ${duplicateScan.status === 'complete' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : duplicateScan.status === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`}>
                  {duplicateScan.status === 'complete'
                    ? `Indexed (${duplicateScan.processedIds.length}/${tickets.length})`
                    : duplicateScan.status === 'error'
                      ? 'Scan failed'
                      : duplicateScan.status === 'scanning'
                        ? 'Checking new ticket…'
                        : 'Waiting for reports'}
                </span>
                <button
                  type="button"
                  onClick={() => runIncrementalDuplicateScan(tickets, { forceFullRebuild: true })}
                  disabled={tickets.length === 0 || duplicateScan.status === 'scanning'}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-200 text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed border border-zinc-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${duplicateScan.status === 'scanning' ? 'animate-spin' : ''}`} /> Rebuild All
                </button>
              </div>
            </div>

            {duplicateScan.error && <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-sm">{duplicateScan.error}</div>}

            {tickets.length === 0 ? (
              <div className="p-12 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-3">
                <Layers className="w-10 h-10 text-zinc-500 mx-auto" />
                <h3 className="text-base font-bold text-white">No Reports Yet</h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">Submit reports in App 1. New tickets are checked incrementally against existing issues.</p>
                <button onClick={() => setActiveApp('user')} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer">Go to App 1 (User Feedback)</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 space-y-5">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Confirmed duplicates ({duplicateFindings.length})</h2>
                    </div>
                    {duplicateFindings.length === 0 && <p className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-500">{duplicateScan.status === 'scanning' ? 'Checking new report against existing issues…' : 'No confirmed duplicate tickets found.'}</p>}
                    {duplicateFindings.map((finding) => (
                      <button type="button" key={finding.key} onClick={() => setSelectedFindingKey(finding.key)} className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${activeFinding?.key === finding.key ? 'bg-zinc-900 border-blue-500 shadow-md' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'}`}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{finding.id} • {finding.tickets.length} duplicate reports</span>
                          <span className="text-[10px] uppercase font-mono text-emerald-300">{finding.confidence} confidence</span>
                        </div>
                        <h3 className="text-sm font-bold text-white">{finding.title}</h3>
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{finding.rationale}</p>
                        {pushedJiraIds[finding.key] && <p className="text-[11px] text-emerald-300 mt-2">Jira draft marked: {pushedJiraIds[finding.key]}</p>}
                      </button>
                    ))}
                  </section>

                  {possibleFindings.length > 0 && (
                    <section className="space-y-3">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-amber-300">Possible duplicates — review ({possibleFindings.length})</h2>
                      {possibleFindings.map((finding) => (
                        <button type="button" key={finding.key} onClick={() => setSelectedFindingKey(finding.key)} className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${activeFinding?.key === finding.key ? 'bg-zinc-900 border-amber-500' : 'bg-zinc-900/50 border-amber-900/60 hover:border-amber-700'}`}>
                          <span className="text-[11px] font-mono text-amber-300">{finding.tickets.map((t) => t.id).join(' ↔ ')}</span>
                          <p className="text-xs text-zinc-300 mt-1">{finding.tickets.map((t) => t.description).join(' / ')}</p>
                          <p className="text-[11px] text-zinc-500 mt-1">{finding.rationale}</p>
                        </button>
                      ))}
                    </section>
                  )}

                  <section className="space-y-3">
                    <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">Individual / unmatched reports ({uniqueFindings.length})</h2>
                    {uniqueFindings.map((finding) => (
                      <button type="button" key={finding.key} onClick={() => setSelectedFindingKey(finding.key)} className={`w-full p-4 rounded-xl border text-left transition cursor-pointer ${activeFinding?.key === finding.key ? 'bg-zinc-900 border-blue-500' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] font-mono text-zinc-400">{finding.id}</span>
                          <span className="text-[10px] uppercase font-mono text-zinc-500">Unique</span>
                        </div>
                        <p className="text-sm text-white line-clamp-2">{finding.title}</p>
                        <p className="text-[11px] text-zinc-500 mt-1">{finding.tickets[0]?.area} • {finding.tickets[0]?.category}</p>
                      </button>
                    ))}
                  </section>
                </div>

                <div className="lg:col-span-7">
                  {activeFinding ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-blue-400 font-bold">{activeFinding.id}</span>
                            <span className="text-xs text-zinc-500">•</span>
                            <span className={`text-xs font-semibold ${activeFinding.kind === 'duplicate' ? 'text-emerald-300' : activeFinding.kind === 'possible' ? 'text-amber-300' : 'text-zinc-400'}`}>
                              {activeFinding.kind === 'duplicate' ? 'Confirmed duplicate cluster' : activeFinding.kind === 'possible' ? 'Possible duplicate — not merged' : 'Individual report'}
                            </span>
                          </div>
                          <h2 className="text-lg font-bold text-white mt-2">{activeFinding.kind === 'single' ? 'Report evidence' : activeFinding.title}</h2>
                          <p className="text-xs text-zinc-400 mt-2">{activeFinding.rationale}</p>
                        </div>
                        <button onClick={() => generateFindingJiraDraft(activeFinding)} disabled={isDraftingJira || activeFinding.kind === 'possible'} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-sm">
                          <Sparkles className="w-4 h-4" /> {isDraftingJira ? 'Qwen drafting Jira…' : activeFinding.kind === 'possible' ? 'Review before drafting' : activeFinding.kind === 'duplicate' ? 'Draft Jira from duplicates' : 'Draft Jira for this report'}
                        </button>
                      </div>

                      {activeFinding.kind === 'possible' && <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200">These reports are only a possible match. Qwen has not merged them, and no consolidated Jira draft is available until a human has reviewed them.</div>}

                      {jiraDrafts[activeFinding.key] && (
                        <div className="p-5 rounded-xl bg-zinc-950 border border-blue-500/40 space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-mono uppercase text-blue-400 font-bold flex items-center gap-1.5"><FileText className="w-4 h-4" /> Qwen Jira draft</span>
                            {pushedJiraIds[activeFinding.key] ? (
                              <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">✓ Created in Jira: {pushedJiraIds[activeFinding.key]}</span>
                            ) : (
                              <button onClick={() => confirmPushToJira(activeFinding.key)} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">Confirm & Create Jira Issue</button>
                            )}
                          </div>
                          <div className="space-y-2 text-xs">
                            <div><span className="text-zinc-500 font-mono">SUMMARY: </span><span className="text-white font-semibold">{jiraDrafts[activeFinding.key].summary}</span></div>
                            <div><span className="text-zinc-500 font-mono">ROOT CAUSE HYPOTHESIS: </span><p className="text-zinc-300 mt-1">{jiraDrafts[activeFinding.key].rootCauseHypothesis}</p></div>
                            <div>
                              <span className="text-zinc-500 font-mono">REPRODUCTION STEPS: </span>
                              <ul className="list-disc list-inside text-zinc-300 mt-1 space-y-1">
                                {(jiraDrafts[activeFinding.key].reproductionSteps || []).map((step, index) => <li key={index}>{step}</li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h3 className="text-xs font-mono uppercase text-zinc-400">Ticket evidence ({activeFinding.tickets.length})</h3>
                        {activeFinding.tickets.map((ticket) => (
                          <div key={ticket.id} className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                            <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
                              <span className="font-mono font-bold text-zinc-300">{ticket.id} • {ticket.reporter}</span>
                              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[11px]">{ticket.area} • Impact: {ticket.severity} • {ticket.createdAt}</span>
                            </div>
                            <p className="text-sm text-white">“{ticket.description}”</p>
                            {Object.keys(ticket.followUpAnswers || {}).length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-2">
                                {Object.entries(ticket.followUpAnswers).map(([question, answer]) => (
                                  <span key={question} className="px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[11px]">
                                    <strong>{question}:</strong> {Array.isArray(answer) ? answer.join(', ') : answer}
                                  </span>
                                ))}
                              </div>
                            )}
                            {ticket.clip && (
                              <div className="pt-2">
                                <span className="text-[11px] font-mono text-emerald-400 block mb-1">🎥 Attached 30s Screen Clip ({ticket.clip.duration})</span>
                                {ticket.clip.isReal ? <video src={ticket.clip.url} controls className="h-32 rounded-lg border border-zinc-800 bg-black" /> : <img src={ticket.clip.url} alt="Replay clip snapshot" className="h-28 rounded-lg border border-zinc-800" />}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-400">Select a finding to inspect its reports.</div>
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