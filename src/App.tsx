import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Award, 
  MessageSquare, 
  Calendar, 
  Upload, 
  Volume2, 
  VolumeX, 
  Check, 
  X, 
  Send, 
  ChevronRight, 
  Clock, 
  Sparkles, 
  Coffee, 
  HelpCircle, 
  FileText, 
  FileImage, 
  AlertCircle,
  Plus,
  RefreshCw,
  BookOpenCheck,
  FileDown,
  Sun,
  Moon
} from 'lucide-react';
import { generateStudyKitPDF } from './utils/pdfExporter';

// Formatter for break timer
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface KeyConcept {
  concept: string;
  definition: string;
}

interface Notes {
  title: string;
  summary: string;
  overview?: string;
  summaryPoints?: string[];
  keyConcepts: KeyConcept[];
  bulletPoints: string[];
  highlights: string[];
  markdownText?: string; // Optional raw markdown for streaming
}

interface QuizQuestion {
  id: string;
  type: 'mcq' | 'short_answer';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

interface Material {
  name: string;
  date: string;
  notes: Notes;
  quiz: QuizQuestion[];
  fileData: string;
  mimeType: string;
  language: string;
  isStreamingNotes?: boolean;
  isGeneratingQuiz?: boolean;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  content: string;
}

interface StudyPlanItem {
  day: string;
  topic: string;
  tasks: string[];
  estimatedTime: string;
  priority: string;
}

interface StudyPlan {
  title: string;
  totalDays: number;
  plan: StudyPlanItem[];
}

export default function App() {
  // Application State
  const [materials, setMaterials] = useState<Material[]>([]);
  const [currentMaterialIndex, setCurrentMaterialIndex] = useState<number | null>(null);
  const [currentTab, setCurrentTab] = useState<'notes' | 'quiz' | 'chat' | 'plan'>('notes');
  const [language, setLanguage] = useState<'Hinglish' | 'English' | 'Hindi'>('Hinglish');
  const [numMCQs, setNumMCQs] = useState<number>(5);
  
  // File upload state (temporary)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingSeconds, setProcessingSeconds] = useState<number>(0);
  const [showRetryOption, setShowRetryOption] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Chat State (keyed by material index)
  const [chatHistories, setChatHistories] = useState<Record<number, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatSending, setIsChatSending] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Quiz Interaction State (keyed by material index and question ID)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, Record<string, string>>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<Record<number, boolean>>({});
  const [quizScore, setQuizScore] = useState<Record<number, number>>({});
  const [activeQuizQuestionIndex, setActiveQuizQuestionIndex] = useState<number>(0);

  // Study Plan State
  const [studyPlan, setStudyPlan] = useState<StudyPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  const [planExamDate, setPlanExamDate] = useState<string>('');
  const [planTopics, setPlanTopics] = useState<string>('');
  const [planError, setPlanError] = useState<string | null>(null);

  // Speech TTS State
  const [speechState, setSpeechState] = useState<{ isPlaying: boolean; currentText: string | null }>({
    isPlaying: false,
    currentText: null
  });

  // Focus Timer & Break Reminder State
  const [focusSeconds, setFocusSeconds] = useState<number>(0);
  const [showBreakPopup, setShowBreakPopup] = useState<boolean>(false);
  const [motivationalQuote, setMotivationalQuote] = useState<string>('');

  // PDF Export State
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [pdfExportStatus, setPdfExportStatus] = useState<string>('');

  // Dark/Light Mode Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return systemPrefersDark ? 'dark' : 'light';
    }
    return 'light';
  });

  // Apply theme to document element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const motivationalQuotes = [
    "Padhai ke sath break lena bhi bohot zaroori hai! Do a quick physical stretch.",
    "Outstanding progress! Take 5 deep breaths and grab a glass of water.",
    "Aapka focus bohot badhiya hai! Relax your eyes by looking at something far away for 20 seconds.",
    "Great session so far! Let's take a 5-minute breather to charge your brain cells.",
    "Dheere dheere hi sahi, par progress solid hai. Recharge your mind now!"
  ];

  // Load and run the focus timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentMaterialIndex !== null) {
        setFocusSeconds(prev => {
          const next = prev + 1;
          // Trigger break suggestion after 30 minutes of continuous use (1800 seconds)
          if (next > 0 && next === 1800) {
            const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
            setMotivationalQuote(randomQuote);
            setShowBreakPopup(true);
          }
          return next;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentMaterialIndex]);

  // Scroll chat to bottom when messages update
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistories, currentMaterialIndex, currentTab]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Convert File to Base64 Utility
  const convertToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const commaIndex = result.indexOf(',');
        const base64 = result.substring(commaIndex + 1);
        resolve({ base64, mimeType: file.type });
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Helper to convert **text** to <strong>text</strong> in React
  const parseBoldText = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="font-extrabold text-indigo-950">{part}</strong>;
      }
      return part;
    });
  };

  // Simple Markdown parser for real-time streaming view
  const renderMarkdownText = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      let content = line.trim();
      if (!content) return <div key={idx} className="h-2"></div>;

      if (content.startsWith('# Title:')) {
        return <h1 key={idx} className="text-xl font-black text-indigo-950 mt-4 mb-2">{content.replace('# Title:', '').trim()}</h1>;
      }
      if (content.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-black text-indigo-950 mt-4 mb-2">{content.replace('# ', '').trim()}</h1>;
      }
      if (content.startsWith('## ')) {
        return (
          <h2 key={idx} className="text-xs font-black text-slate-800 mt-5 mb-2.5 flex items-center gap-2 border-b border-slate-100 pb-1">
            <span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span>
            {content.replace('## ', '')}
          </h2>
        );
      }
      if (content.startsWith('### ')) {
        return <h3 key={idx} className="text-xs font-bold text-slate-700 mt-4 mb-1.5">{content.replace('### ', '')}</h3>;
      }

      if (content.startsWith('- ') || content.startsWith('* ')) {
        const bulletContent = content.replace(/^[-*]\s+/, '');
        return (
          <div key={idx} className="flex items-start gap-2.5 my-1.5 pl-1.5">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2 shrink-0"></span>
            <span className="text-xs text-slate-600 leading-relaxed font-semibold">{parseBoldText(bulletContent)}</span>
          </div>
        );
      }

      return <p key={idx} className="text-xs text-slate-600 leading-relaxed font-medium my-1.5">{parseBoldText(content)}</p>;
    });
  };

  const parseMarkdownToNotes = (markdown: string): Notes => {
    let title = "Study Notes";
    let overview = "";
    const summaryPoints: string[] = [];
    const bulletPoints: string[] = [];
    const highlights: string[] = [];

    const lines = markdown.split('\n');
    let currentSection = "";

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.toLowerCase().startsWith('# title:')) {
        title = line.substring(8).replace(/^[:\s]+/, '').trim();
      } else if (line.startsWith('# ')) {
        title = line.substring(2).trim();
      } else if (line.startsWith('## Overview')) {
        currentSection = "overview";
      } else if (line.startsWith('## Summary')) {
        currentSection = "summary";
      } else if (line.startsWith('## Core Lessons') || line.startsWith('## Lessons')) {
        currentSection = "lessons";
      } else if (line.startsWith('## Exam Tips') || line.startsWith('## Exam Highlights') || line.startsWith('## Critical Highlights') || line.startsWith('## Exam Advice')) {
        currentSection = "tips";
      } else if (line.startsWith('## ')) {
        currentSection = "";
      } else {
        if (currentSection === "overview") {
          overview += (overview ? " " : "") + line;
        } else if (currentSection === "summary") {
          if (line.startsWith('-') || line.startsWith('*')) {
            const content = line.replace(/^[-*]\s+/, '').trim();
            if (content) summaryPoints.push(content);
          } else {
            summaryPoints.push(line);
          }
        } else if (currentSection === "lessons") {
          if (line.startsWith('-') || line.startsWith('*')) {
            const content = line.replace(/^[-*]\s+/, '').trim();
            if (content) bulletPoints.push(content);
          } else {
            bulletPoints.push(line);
          }
        } else if (currentSection === "tips") {
          if (line.startsWith('-') || line.startsWith('*')) {
            const content = line.replace(/^[-*]\s+/, '').trim();
            if (content) highlights.push(content);
          } else {
            highlights.push(line);
          }
        }
      }
    }

    if (!overview) overview = "Overview synthesis completed successfully. Please review the detailed summary below.";
    if (summaryPoints.length === 0) {
      summaryPoints.push("Key summary details processed successfully.");
    }
    if (bulletPoints.length === 0) {
      bulletPoints.push("Comprehensive lessons and key notes analyzed successfully.");
    }
    if (highlights.length === 0) {
      highlights.push("Stay focused and follow regular interactive assessments.");
    }

    return {
      title,
      summary: overview,
      overview,
      summaryPoints,
      keyConcepts: [],
      bulletPoints,
      highlights,
      markdownText: markdown
    };
  };

  // Trigger main study document process (Notes + Quiz generation)
  const processDocument = async () => {
    if (uploadType === 'file' && !selectedFile) {
      setProcessingError("Please upload a PDF or image file first.");
      return;
    }
    if (uploadType === 'paste') {
      const trimmed = pastedText.trim();
      if (!trimmed) {
        setProcessingError("Please paste some text first in the input box.");
        return;
      }
      if (trimmed.length < 15) {
        setProcessingError("Please paste some text first (at least 15 characters) so that StudyBridge AI can analyze it and generate quality notes.");
        return;
      }
    }

    setIsProcessing(true);
    setProcessingError(null);
    setProcessingSeconds(0);
    setShowRetryOption(false);
    setProcessingStep(uploadType === 'file' ? "Reading your files... this may take a few seconds." : "Reading your pasted notes... this may take a few seconds.");

    let stepInterval: any = null;
    let timerInterval: any = null;

    try {
      let base64 = "";
      let mimeType = "";
      let fileName = "";

      if (uploadType === 'file') {
        if (!selectedFile) return;
        const converted = await convertToBase64(selectedFile);
        base64 = converted.base64;
        mimeType = converted.mimeType;
        fileName = selectedFile.name;
      } else {
        // Safe Unicode base64 encoding using modern TextEncoder API (fully safe)
        const textToEncode = pastedText.trim();
        const encoder = new TextEncoder();
        const bytes = encoder.encode(textToEncode);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
        mimeType = "text/plain";
        
        // Create a friendly name from the first few words of the pasted text
        const words = textToEncode.split(/\s+/).slice(0, 5).join(' ');
        fileName = words.length > 30 ? words.substring(0, 30) + '...' : words || "Pasted Text Notes";
        if (!fileName) fileName = "Pasted Text Notes";
      }
      
      // Simulate incremental steps for uploader UI while connecting
      const progressSteps = [
        "Analyzing text and complex conceptual structures...",
        "Connecting to StudyBridge Streaming API...",
        "Structuring interactive study cards..."
      ];

      let stepIdx = 0;
      stepInterval = setInterval(() => {
        if (stepIdx < progressSteps.length) {
          setProcessingStep(progressSteps[stepIdx]);
          stepIdx++;
        }
      }, 1500);

      // elapsed second tracker
      let elapsed = 0;
      timerInterval = setInterval(() => {
        elapsed += 1;
        setProcessingSeconds(elapsed);
        if (elapsed >= 15) {
          setShowRetryOption(true);
        }
      }, 1000);

      // Create a temporary placeholder material and add it immediately to switch the screen
      const tempMaterial: Material = {
        name: fileName,
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + " • Today",
        notes: {
          title: "Analyzing & Synthesizing...",
          summary: "StudyBridge AI is analyzing your study material. Watch the notes stream live below...",
          keyConcepts: [],
          bulletPoints: [],
          highlights: [],
          markdownText: ""
        },
        quiz: [],
        fileData: base64,
        mimeType: mimeType,
        language: language,
        isStreamingNotes: true,
        isGeneratingQuiz: true
      };

      const newIndex = materials.length;
      setMaterials(prev => [...prev, tempMaterial]);
      setCurrentMaterialIndex(newIndex);
      setCurrentTab('notes');
      setSelectedFile(null);
      setPastedText(''); // Clear pasted text after success
      setActiveQuizQuestionIndex(0);

      // Fire Parallel Quiz Generation
      const fetchQuizParallel = async () => {
        try {
          const quizResponse = await fetch('/api/study/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileData: base64, mimeType, language, numMCQs })
          });
          if (!quizResponse.ok) throw new Error("Quiz generation failed");
          const quizData = await quizResponse.json();
          setMaterials(prev => {
            const updated = [...prev];
            if (updated[newIndex]) {
              updated[newIndex] = {
                ...updated[newIndex],
                quiz: quizData.quiz,
                isGeneratingQuiz: false
              };
            }
            return updated;
          });
        } catch (err) {
          console.error("Quiz parallel fetch failed", err);
          // Set a friendly fallback quiz so it is never blank
          setMaterials(prev => {
            const updated = [...prev];
            if (updated[newIndex]) {
              updated[newIndex] = {
                ...updated[newIndex],
                quiz: [
                  {
                    id: "fallback-q1",
                    type: "mcq",
                    question: `What is the key takeaway from "${fileName}"?`,
                    options: ["It holds important educational insights.", "It is standard course syllabus content.", "It requires structured notes and study guides.", "All of the above."],
                    correctAnswer: "All of the above.",
                    explanation: "Our parallel quiz generation encountered a temporary network delay, but you can study using the generated notes or ask questions in the chat!"
                  }
                ],
                isGeneratingQuiz: false
              };
            }
            return updated;
          });
        }
      };

      // Run quiz task in parallel background
      fetchQuizParallel();

      // Trigger Notes Stream
      const notesResponse = await fetch('/api/study/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, mimeType, language })
      });

      if (!notesResponse.ok) {
        throw new Error("Failed to connect to the study notes streaming service.");
      }

      const reader = notesResponse.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedMarkdown = "";

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          accumulatedMarkdown += chunk;

          // Progressively update the streaming markdown text in real-time
          setMaterials(prev => {
            const updated = [...prev];
            if (updated[newIndex]) {
              updated[newIndex] = {
                ...updated[newIndex],
                notes: {
                  ...updated[newIndex].notes,
                  title: "Generating Live Notes...",
                  summary: "Watch study notes stream in real-time below.",
                  markdownText: accumulatedMarkdown
                }
              };
            }
            return updated;
          });
        }
      }

      // Notes stream finished! Parse markdown into structured object
      const parsedNotes = parseMarkdownToNotes(accumulatedMarkdown);
      setMaterials(prev => {
        const updated = [...prev];
        if (updated[newIndex]) {
          updated[newIndex] = {
            ...updated[newIndex],
            notes: parsedNotes,
            isStreamingNotes: false
          };
        }
        return updated;
      });

      // Populate initial helper assistant welcome message based on language mode
      let welcomeMsg = "";
      if (language === 'Hindi') {
        welcomeMsg = `नमस्ते! मैंने "${parsedNotes.title}" के लिए सुंदर नोट्स और एक मजेदार क्विज तैयार कर लिया है। यदि आपके पास कोई सवाल या संदेह (doubt) है, तो मुझसे बेझिझक पूछें!`;
      } else if (language === 'Hinglish') {
        welcomeMsg = `Hey there! Main aapki file "${parsedNotes.title}" padh chuka hoon aur iske awesome study notes aur quiz ready hain. Koi bhi doubt ho, toh yahin puch lijiye!`;
      } else {
        welcomeMsg = `Hello! I have successfully generated study notes and an interactive quiz for "${parsedNotes.title}". Feel free to ask any doubts you have right here!`;
      }

      setChatHistories(prev => ({
        ...prev,
        [newIndex]: [{ sender: 'assistant', content: welcomeMsg }]
      }));

    } catch (err: any) {
      console.error(err);
      setProcessingError(err.message || "Something went wrong while connecting with the StudyBridge AI servers. Please try again.");
    } finally {
      if (stepInterval) clearInterval(stepInterval);
      if (timerInterval) clearInterval(timerInterval);
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // Export Study Material to PDF
  const handleExportPDF = async () => {
    const activeMaterial = currentMaterialIndex !== null ? materials[currentMaterialIndex] : null;
    if (!activeMaterial) return;

    try {
      setIsExportingPDF(true);
      setPdfExportStatus('Preparing templates...');
      await generateStudyKitPDF(activeMaterial, (status) => {
        setPdfExportStatus(status);
      });
    } catch (err: any) {
      console.error("PDF export failed:", err);
    } finally {
      setIsExportingPDF(false);
      setPdfExportStatus('');
    }
  };

  // Submit Doubt Query in Chat
  const handleSendQuery = async (customMessage?: string) => {
    const query = customMessage || chatInput;
    if (!query.trim() || currentMaterialIndex === null) return;

    const currentMaterial = materials[currentMaterialIndex];
    const userMessage: ChatMessage = { sender: 'user', content: query };
    
    // Append user message immediately to chat UI
    setChatHistories(prev => ({
      ...prev,
      [currentMaterialIndex]: [...(prev[currentMaterialIndex] || []), userMessage]
    }));

    if (!customMessage) setChatInput('');
    setIsChatSending(true);

    try {
      const history = chatHistories[currentMaterialIndex] || [];
      const apiHistory = history.map(h => ({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.content
      }));

      const response = await fetch('/api/study/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          chatHistory: apiHistory,
          fileData: currentMaterial.fileData,
          mimeType: currentMaterial.mimeType,
          language: language
        })
      });

      if (!response.ok) {
        throw new Error("Doubt solving assistant experienced an error");
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = { sender: 'assistant', content: data.text };

      setChatHistories(prev => ({
        ...prev,
        [currentMaterialIndex]: [...(prev[currentMaterialIndex] || []), assistantMessage]
      }));

    } catch (err: any) {
      console.error(err);
      const errorMessage: ChatMessage = { 
        sender: 'assistant', 
        content: "Sorry, I ran into an issue connecting to Gemini. Please try again in a moment." 
      };
      setChatHistories(prev => ({
        ...prev,
        [currentMaterialIndex]: [...(prev[currentMaterialIndex] || []), errorMessage]
      }));
    } finally {
      setIsChatSending(false);
    }
  };

  // Generate Study Plan
  const handleGenerateStudyPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planExamDate) return;

    setIsGeneratingPlan(true);
    setPlanError(null);

    try {
      // Use active document file if any exists for context alignment
      const activeDoc = currentMaterialIndex !== null ? materials[currentMaterialIndex] : null;

      const response = await fetch('/api/study/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examDate: planExamDate,
          topicsText: planTopics,
          fileData: activeDoc?.fileData || null,
          mimeType: activeDoc?.mimeType || null,
          language: language
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate custom study schedule");
      }

      const data = await response.json();
      setStudyPlan(data);
    } catch (err: any) {
      console.error(err);
      setPlanError(err.message || "Failed to organize schedule. Please check server connections.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Web Speech API Synthesis for notes and chat
  const handleToggleVoice = (text: string) => {
    if ('speechSynthesis' in window) {
      if (speechState.isPlaying && speechState.currentText === text) {
        window.speechSynthesis.cancel();
        setSpeechState({ isPlaying: false, currentText: null });
        return;
      }

      window.speechSynthesis.cancel();
      // Remove basic markdown symbols (*, _, #, `) before feeding to speaker
      const cleanText = text.replace(/[*#_`•-]/g, '').trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      if (language === 'Hindi') {
        utterance.lang = 'hi-IN';
      } else if (language === 'Hinglish') {
        // Indian English accent reads Hinglish Latin text nicely
        utterance.lang = 'en-IN';
      } else {
        utterance.lang = 'en-US';
      }

      utterance.onend = () => {
        setSpeechState({ isPlaying: false, currentText: null });
      };
      utterance.onerror = () => {
        setSpeechState({ isPlaying: false, currentText: null });
      };

      setSpeechState({ isPlaying: true, currentText: text });
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech option is not available in your web browser.");
    }
  };

  // Quiz evaluation
  const handleSelectQuizOption = (qId: string, option: string) => {
    if (currentMaterialIndex === null || quizSubmitted[currentMaterialIndex]) return;
    setQuizAnswers(prev => ({
      ...prev,
      [currentMaterialIndex]: {
        ...(prev[currentMaterialIndex] || {}),
        [qId]: option
      }
    }));
  };

  const handleTypeShortAnswer = (qId: string, text: string) => {
    if (currentMaterialIndex === null || quizSubmitted[currentMaterialIndex]) return;
    setQuizAnswers(prev => ({
      ...prev,
      [currentMaterialIndex]: {
        ...(prev[currentMaterialIndex] || {}),
        [qId]: text
      }
    }));
  };

  const handleSubmitQuiz = () => {
    if (currentMaterialIndex === null) return;
    const material = materials[currentMaterialIndex];
    const answers = quizAnswers[currentMaterialIndex] || {};

    let score = 0;
    material.quiz.forEach(q => {
      if (q.type === 'mcq') {
        const studentAns = answers[q.id] || '';
        // Exact match or contains checking to be safe with AI string variations
        if (studentAns.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim()) {
          score += 1;
        }
      }
    });

    setQuizScore(prev => ({ ...prev, [currentMaterialIndex]: score }));
    setQuizSubmitted(prev => ({ ...prev, [currentMaterialIndex]: true }));
  };

  const handleResetQuiz = () => {
    if (currentMaterialIndex === null) return;
    setQuizAnswers(prev => ({ ...prev, [currentMaterialIndex]: {} }));
    setQuizSubmitted(prev => ({ ...prev, [currentMaterialIndex]: false }));
    setQuizScore(prev => ({ ...prev, [currentMaterialIndex]: 0 }));
    setActiveQuizQuestionIndex(0);
  };

  // Helper variables for current material
  const activeMaterial = currentMaterialIndex !== null ? materials[currentMaterialIndex] : null;

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden font-sans text-slate-800 dark:text-slate-100 transition-colors duration-300">
      
      {/* Sidebar Navigation */}
      <aside className="w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 transition-colors duration-300">
        
        {/* Branding */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md shadow-indigo-200 dark:shadow-none">
            SB
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              StudyBridge
              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-semibold tracking-normal">AI</span>
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">India's Study Companion</p>
          </div>
        </div>

        {/* Upload Trigger / Action Panel */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <button 
            id="btn-upload-trigger"
            onClick={() => setCurrentMaterialIndex(null)}
            className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-200 shadow-sm border ${
              currentMaterialIndex === null 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300' 
                : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700 hover:border-indigo-700 hover:shadow'
            }`}
          >
            <Plus className="w-4.5 h-4.5" />
            New Study Material
          </button>
        </div>

        {/* Recent Materials / Navigation Sidebar List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5">Uploaded Documents</p>
            {materials.length === 0 ? (
              <div className="p-4 text-center rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">No uploads yet. Upload textbook pages, notes, or PDFs to get started!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {materials.map((mat, idx) => (
                  <button
                    key={idx}
                    id={`sidebar-mat-${idx}`}
                    onClick={() => {
                      setCurrentMaterialIndex(idx);
                      // Fallback if tab is not set or valid
                      if (!currentTab) setCurrentTab('notes');
                    }}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 border ${
                      currentMaterialIndex === idx
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900 text-indigo-800 dark:text-indigo-300 font-medium'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                    }`}
                  >
                    {mat.mimeType.includes('pdf') ? (
                      <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${currentMaterialIndex === idx ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    ) : (
                      <FileImage className={`w-5 h-5 shrink-0 mt-0.5 ${currentMaterialIndex === idx ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                    )}
                    <div className="truncate flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">{mat.notes.title || mat.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{mat.date}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick-links if helpful */}
          {materials.length > 0 && (
            <div>
              <p className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Shortcut Tool Tabs</p>
              <nav className="space-y-1">
                <button 
                  onClick={() => setCurrentTab('notes')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-colors text-left ${currentTab === 'notes' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <BookOpen className="w-4 h-4 text-slate-400" /> Smart Study Notes
                </button>
                <button 
                  onClick={() => setCurrentTab('quiz')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-colors text-left ${currentTab === 'quiz' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <Award className="w-4 h-4 text-slate-400" /> Interactive Practice Quiz
                </button>
                <button 
                  onClick={() => setCurrentTab('chat')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-colors text-left ${currentTab === 'chat' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <MessageSquare className="w-4 h-4 text-slate-400" /> Doubt Chat Assistant
                </button>
                <button 
                  onClick={() => setCurrentTab('plan')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs rounded-lg transition-colors text-left ${currentTab === 'plan' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                >
                  <Calendar className="w-4 h-4 text-slate-400" /> Study Planner
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Break Reminder Widget */}
        <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
          <div className={`rounded-2xl p-4 shadow-sm transition-all duration-300 ${focusSeconds >= 1800 ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 animate-pulse' : 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${focusSeconds >= 1800 ? 'text-red-800 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400'}`}>
                <Coffee className="w-3.5 h-3.5" />
                Break Reminder
              </span>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full animate-pulse ${focusSeconds >= 1800 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                <span className={`text-[10px] font-bold ${focusSeconds >= 1800 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatTime(focusSeconds)}</span>
              </div>
            </div>
            <p className={`text-xs leading-relaxed font-semibold ${focusSeconds >= 1800 ? 'text-red-700 dark:text-red-300 font-extrabold' : 'text-emerald-700 dark:text-emerald-300'}`}>
              {focusSeconds >= 1800
                ? "Take a 5 minute break! You've been studying hard for 30+ minutes."
                : `You have been studying active for ${Math.floor(focusSeconds / 60)} mins. Take a short 5 min walk soon!`}
            </p>
            <button
              onClick={() => {
                if (focusSeconds >= 1800) {
                  setFocusSeconds(0);
                  setShowBreakPopup(false);
                } else {
                  setMotivationalQuote(motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)]);
                  setShowBreakPopup(true);
                }
              }}
              className={`mt-3 w-full border py-1.5 px-3 rounded-lg text-[11px] font-bold transition-all ${
                focusSeconds >= 1800
                  ? 'bg-red-600 hover:bg-red-700 text-white border-red-700'
                  : 'bg-white hover:bg-emerald-100 border-emerald-200 text-emerald-700'
              }`}
            >
              {focusSeconds >= 1800 ? "I'm taking a break!" : "Take a Break Now"}
            </button>
          </div>
        </div>

      </aside>

      {/* Main Study Arena */}
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
        
        {/* Header bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 flex items-center justify-between shrink-0 transition-colors duration-300">
          
          <div className="flex items-center gap-4">
            {activeMaterial ? (
              <div className="flex items-center gap-3">
                <nav id="header-tabs" className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl transition-colors">
                  <button
                    id="tab-notes"
                    onClick={() => setCurrentTab('notes')}
                    className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      currentTab === 'notes' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Notes
                  </button>
                  <button
                    id="tab-quiz"
                    onClick={() => setCurrentTab('quiz')}
                    className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      currentTab === 'quiz' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Quiz
                  </button>
                  <button
                    id="tab-chat"
                    onClick={() => setCurrentTab('chat')}
                    className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      currentTab === 'chat' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Doubt Chat
                  </button>
                  <button
                    id="tab-plan"
                    onClick={() => setCurrentTab('plan')}
                    className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all ${
                      currentTab === 'plan' 
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Study Plan
                  </button>
                </nav>
                <button
                  id="btn-header-export-pdf"
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 transition-all border border-indigo-100 dark:border-indigo-900 shadow-sm disabled:opacity-60 disabled:cursor-wait"
                >
                  <FileDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Export PDF</span>
                </button>
              </div>
            ) : (
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-pulse" />
                Upload Center
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Bilingual/Language selection switch */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 transition-colors">
              <button
                id="lang-english"
                onClick={() => setLanguage('English')}
                className={`px-3.5 py-1 text-[11px] font-extrabold rounded-full transition-all ${
                  language === 'English' 
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                English
              </button>
              <button
                id="lang-hinglish"
                onClick={() => setLanguage('Hinglish')}
                className={`px-3.5 py-1 text-[11px] font-extrabold rounded-full transition-all ${
                  language === 'Hinglish' 
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Hinglish
              </button>
              <button
                id="lang-hindi"
                onClick={() => setLanguage('Hindi')}
                className={`px-3.5 py-1 text-[11px] font-extrabold rounded-full transition-all ${
                  language === 'Hindi' 
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                हिंदी
              </button>
            </div>

            {/* Theme Toggle Button */}
            <button
              id="btn-theme-toggle"
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all duration-300 shadow-sm relative overflow-hidden group active:scale-95 cursor-pointer"
              aria-label="Toggle theme"
            >
              <div className="relative w-5 h-5 flex items-center justify-center pointer-events-none">
                {/* Sun icon with neat transition */}
                <span className="absolute transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform dark:translate-y-8 dark:opacity-0 dark:rotate-45">
                  <Sun className="w-5 h-5 text-amber-500 fill-amber-50" />
                </span>
                {/* Moon icon with neat transition */}
                <span className="absolute transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform translate-y-8 opacity-0 rotate-45 dark:translate-y-0 dark:opacity-100 dark:rotate-0">
                  <Moon className="w-5 h-5 text-indigo-400 fill-indigo-950/20" />
                </span>
              </div>
            </button>

            {/* Profile Avatar */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-950 border-2 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-extrabold text-xs flex items-center justify-center shadow-inner transition-colors">
                RJ
              </div>
            </div>
          </div>

        </header>

        {/* Primary Content Container */}
        <div className="flex-1 p-8 overflow-y-auto min-h-0 transition-colors">
          
          {/* UPLOAD SCREEN: Shown when currentMaterialIndex is null */}
          {currentMaterialIndex === null && (
            <div className="max-w-3xl mx-auto space-y-8 py-4">
              <div className="text-center space-y-3">
                <div className="inline-flex p-3.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-2xl shadow-inner mb-2 animate-bounce">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Welcome to StudyBridge AI</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto">
                  Upload textbook images, scan worksheets, or drop your PDF lecture notes. Our Indian-aligned Gemini engine compiles study guides, interactive quizzes, and answers doubts.
                </p>
              </div>

              {/* Mode Toggle / Tabs */}
              <div className="flex justify-center">
                <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                  <button
                    id="upload-mode-file"
                    onClick={() => setUploadType('file')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      uploadType === 'file'
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload File
                  </button>
                  <button
                    id="upload-mode-paste"
                    onClick={() => setUploadType('paste')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      uploadType === 'paste'
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Paste Text
                  </button>
                </div>
              </div>

              {uploadType === 'file' ? (
                /* Upload Drop Zone card */
                <div 
                  id="dropzone-container"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`bg-white dark:bg-slate-900 border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-200 cursor-pointer shadow-sm flex flex-col items-center justify-center min-h-[300px] ${
                    isDragOver 
                      ? 'border-indigo-500 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[1.01]' 
                      : 'border-slate-300 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'
                  }`}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <input 
                    type="file" 
                    id="file-upload-input" 
                    className="hidden" 
                    accept="application/pdf,image/*" 
                    onChange={handleFileChange}
                  />
                  
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 mb-5 border border-slate-100 dark:border-slate-700 shadow-sm">
                    <Upload className="w-7 h-7" />
                  </div>

                  {selectedFile ? (
                    <div className="space-y-4">
                      <p className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">Selected Material Loaded!</p>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-xl max-w-md truncate shadow-sm">
                        <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{selectedFile.name}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Click to change file, or drop a different one here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Drag & drop textbook pages, notes, or PDFs</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Supports PDF files and PNG, JPG images up to 15MB</p>
                      <button className="mt-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold py-2 px-5 rounded-xl text-xs transition-all border border-transparent dark:border-slate-700">
                        Browse Files
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Paste Text card */
                <div 
                  id="paste-text-container"
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col space-y-4"
                >
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <FileText className="w-5 h-5 animate-pulse" />
                    <span className="text-sm font-bold">Paste Study Material</span>
                  </div>
                  <textarea
                    id="pasted-text-input"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your notes, textbook content, or any study material here..."
                    className="w-full min-h-[220px] p-4 text-sm text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y scrollbar-none font-medium leading-relaxed bg-slate-50/50 dark:bg-slate-950"
                  />
                  <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 font-medium pb-2">
                    <span>{pastedText.length} characters</span>
                    <span>Supports multilingual texts and math formulas</span>
                  </div>
                  <button
                    id="btn-process-paste"
                    onClick={processDocument}
                    disabled={!pastedText.trim() || isProcessing}
                    className={`w-full py-4 px-6 rounded-2xl font-extrabold text-sm tracking-wide transition-all duration-150 shadow-md flex items-center justify-center gap-3 cursor-pointer ${
                      !pastedText.trim()
                        ? 'bg-slate-200 dark:bg-slate-850 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                        : isProcessing
                          ? 'bg-indigo-400 text-white cursor-wait'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 dark:shadow-none transform hover:-translate-y-0.5'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        StudyBridge AI Working...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Notes
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Language selection card for uploader */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    Select Your Preferred Language Mode
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">We'll synthesize study materials and answer chats in this exact format.</p>
                </div>
                <div className="flex gap-2">
                  {[
                    { key: 'Hinglish', desc: 'Conversational Hinglish' },
                    { key: 'English', desc: 'Pure English' },
                    { key: 'Hindi', desc: 'हिंदी' }
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setLanguage(item.key as any)}
                      className={`px-4 py-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                        language === item.key
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100 dark:shadow-none'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750'
                      }`}
                    >
                      {item.desc}
                    </button>
                  ))}
                </div>
              </div>

              {/* MCQ count selection card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Award className="w-4.5 h-4.5 text-indigo-600" />
                    Number of Practice MCQs
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Choose how many multiple choice questions to generate in your quiz.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 transition-colors">
                    {[5, 10, 15].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setNumMCQs(val)}
                        className={`px-4 py-1.5 text-[11px] font-extrabold rounded-full transition-all cursor-pointer ${
                          numMCQs === val 
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {val} Qs
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Custom:</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={numMCQs || ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v > 0) {
                          setNumMCQs(v);
                        } else if (e.target.value === '') {
                          setNumMCQs(0);
                        }
                      }}
                      onBlur={() => {
                        if (numMCQs < 1) setNumMCQs(5);
                      }}
                      className="w-12 text-center bg-transparent text-xs font-black text-indigo-700 dark:text-indigo-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit & Processing indicators */}
              <div className="flex flex-col items-center gap-3">
                {uploadType === 'file' && (
                  <button
                    id="btn-process-document"
                    onClick={processDocument}
                    disabled={!selectedFile || isProcessing}
                    className={`w-full max-w-sm py-4 px-6 rounded-2xl font-extrabold text-sm tracking-wide transition-all duration-150 shadow-md flex items-center justify-center gap-3 cursor-pointer ${
                      !selectedFile
                        ? 'bg-slate-200 dark:bg-slate-850 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                        : isProcessing
                          ? 'bg-indigo-400 text-white cursor-wait'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 dark:shadow-none transform hover:-translate-y-0.5'
                    }`}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        StudyBridge AI Working...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Create My Study Kit
                      </>
                    )}
                  </button>
                )}

                {isProcessing && (
                  <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-center space-y-3 shadow-md animate-scale-up">
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-indigo-600 h-1.5 rounded-full animate-[shimmer_1.5s_infinite_linear]" style={{ width: '80%' }}></div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-bold animate-pulse">{processingStep}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {uploadType === 'file' 
                        ? "Gemini-2.5-Flash is processing file data and generating structured study kits." 
                        : "Reading your pasted notes and generating study aids... this may take up to 20 seconds."}
                    </p>
                    
                    {/* Slow response / Timeout Retry Indicator */}
                    {showRetryOption && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 mt-2 flex flex-col items-center gap-2 animate-fade-in">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 justify-center">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          This is taking longer than usual... ({processingSeconds}s elapsed)
                        </p>
                        <button
                          id="btn-retry-process"
                          type="button"
                          onClick={() => processDocument()}
                          className="px-3.5 py-1.5 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold rounded-xl text-[11px] transition-all border border-amber-200 dark:border-amber-900 shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          Try Again (Retry)
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {processingError && (
                  <div className="w-full max-w-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-800 dark:text-red-300">Processing Failed</p>
                      <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">{processingError}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACTIVE WORKSPACE AREA: Shown when a material is processed */}
          {activeMaterial && (
            <div className="grid grid-cols-12 gap-8 h-full items-start">
              
              {/* Left Column: Core Workstations (Notes, Quiz, Chat, StudyPlan) */}
              <div className="col-span-12 xl:col-span-8 space-y-6">
                
                {/* 1. NOTES TAB */}
                {currentTab === 'notes' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Notes Header metadata */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{activeMaterial.notes.title}</h2>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                          Synthesized by StudyBridge AI • Language: <span className="text-indigo-600 font-bold">{activeMaterial.language}</span>
                        </p>
                      </div>
                      
                      <div className="flex flex-wrap gap-2.5 items-center">
                        <button
                          onClick={() => handleToggleVoice(
                            `${activeMaterial.notes.title}. ${activeMaterial.notes.overview || activeMaterial.notes.summary}. ` + 
                            (activeMaterial.notes.summaryPoints || []).join('. ')
                          )}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            speechState.isPlaying
                              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100'
                          }`}
                        >
                          {speechState.isPlaying ? (
                            <>
                              <VolumeX className="w-4 h-4 text-red-500" />
                              Stop Audio
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-4 h-4 text-indigo-500" />
                              Listen (TTS Audio)
                            </>
                          )}
                        </button>

                        <button
                          id="btn-notes-export-pdf"
                          onClick={handleExportPDF}
                          disabled={isExportingPDF}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                        >
                          <FileDown className="w-4 h-4 text-indigo-500" />
                          <span>Export as PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Conditional streaming view or standard tabs layout */}
                    {activeMaterial.isStreamingNotes ? (
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-600"></span>
                            </span>
                            <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">Streaming Live Notes from Gemini</span>
                          </div>
                          <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold px-2.5 py-1 rounded-full animate-pulse">
                            {activeMaterial.notes.markdownText?.length || 0} chars generated
                          </span>
                        </div>
                        <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 min-h-[300px] overflow-y-auto font-sans leading-relaxed">
                          {renderMarkdownText(activeMaterial.notes.markdownText || "")}
                          <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold mt-4 animate-pulse">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Synthesizing and formatting study concepts...</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Overview Block */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <span className="w-1.5 h-5 bg-indigo-600 rounded-full"></span>
                            Overview
                          </h3>
                          <p className="text-sm text-slate-600 leading-relaxed font-semibold bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            {activeMaterial.notes.overview || activeMaterial.notes.summary}
                          </p>
                        </div>

                        {/* Summary Block */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <span className="w-1.5 h-5 bg-indigo-600 rounded-full"></span>
                            Summary
                          </h3>
                          <div className="bg-indigo-50/20 border border-indigo-50/50 p-5 rounded-2xl space-y-3">
                            {(activeMaterial.notes.summaryPoints && activeMaterial.notes.summaryPoints.length > 0) ? (
                              activeMaterial.notes.summaryPoints.map((point, idx) => (
                                <div key={idx} className="flex items-start gap-2.5">
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 shrink-0 animate-pulse"></span>
                                  <span className="text-xs text-slate-700 leading-relaxed font-semibold">{point}</span>
                                </div>
                              ))
                            ) : (
                              <div className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 shrink-0"></span>
                                <span className="text-xs text-slate-700 leading-relaxed font-semibold">{activeMaterial.notes.summary}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Detailed Highlights & Exam Insights */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Points Panel */}
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                              <span className="w-1.5 h-5 bg-emerald-500 rounded-full"></span>
                              Core Lessons & Notes
                            </h3>
                            <ul className="space-y-3.5">
                              {activeMaterial.notes.bulletPoints.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-2.5">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 shrink-0"></span>
                                  <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Exam Highlights Panel */}
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                              <span className="w-1.5 h-5 bg-amber-500 rounded-full"></span>
                              Critical Highlights & Exam Tips
                            </h3>
                            <div className="space-y-3.5">
                              {activeMaterial.notes.highlights.map((item, idx) => (
                                <div key={idx} className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded-xl flex items-start gap-2.5">
                                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <span className="text-xs text-amber-900 dark:text-amber-300 font-semibold leading-relaxed">{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>
                      </>
                    )}

                  </div>
                )}

                {/* 2. PRACTICE QUIZ TAB */}
                {currentTab === 'quiz' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    {activeMaterial.isGeneratingQuiz ? (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 shadow-sm text-center space-y-5">
                        <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner animate-bounce">
                          <Award className="w-7 h-7" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-base font-black text-slate-900 dark:text-white">Formulating Interactive Quiz...</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                            StudyBridge AI is crafting {numMCQs} custom multiple-choice and 1 conceptual short-answer question in parallel for your active study material.
                          </p>
                        </div>
                        <div className="w-full max-w-xs bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden mx-auto">
                          <div className="bg-indigo-600 h-1.5 rounded-full animate-[shimmer_1.5s_infinite_linear]" style={{ width: '70%' }}></div>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Parallel Processing Enabled</p>
                      </div>
                    ) : (
                      <>
                        {/* Score Bar / Banner */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">Interactive Chapter Assessment</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-400 mt-1 font-semibold">
                              Test your understanding with {activeMaterial.quiz.filter(q => q.type === 'mcq').length} MCQs and {activeMaterial.quiz.filter(q => q.type === 'short_answer').length} conceptual Short Answer.
                            </p>
                          </div>

                          <div className="flex gap-2">
                            {quizSubmitted[currentMaterialIndex] && (
                              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-xl text-xs font-black">
                                Score: {quizScore[currentMaterialIndex]} / 5 (MCQs)
                              </div>
                            )}
                            <button
                              onClick={handleResetQuiz}
                              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Restart Quiz
                            </button>
                          </div>
                        </div>

                        {/* Quiz Navigator Grid */}
                        <div className="flex gap-2.5 overflow-x-auto pb-1">
                          {activeMaterial.quiz.map((q, idx) => {
                            const answers = quizAnswers[currentMaterialIndex] || {};
                            const answered = answers[q.id] !== undefined;
                            const isCurrent = activeQuizQuestionIndex === idx;

                            return (
                              <button
                                key={idx}
                                onClick={() => setActiveQuizQuestionIndex(idx)}
                                className={`px-4 py-2.5 rounded-xl border text-xs font-black transition-all shrink-0 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100 dark:shadow-none'
                                    : answered
                                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850'
                                }`}
                              >
                                Q{idx + 1} ({q.type === 'mcq' ? 'MCQ' : 'Short'})
                              </button>
                            );
                          })}
                        </div>

                        {/* Active Question card layout */}
                        {activeMaterial.quiz.map((q, qIdx) => {
                          if (qIdx !== activeQuizQuestionIndex) return null;

                          const answers = quizAnswers[currentMaterialIndex] || {};
                          const studentAnswer = answers[q.id] || '';
                          const isSubmitted = quizSubmitted[currentMaterialIndex];

                          return (
                            <div key={q.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                              
                              <div className="flex items-center justify-between">
                                <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest">
                                  Question {qIdx + 1} of {activeMaterial.quiz.length}
                                </span>
                                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
                                  {q.type === 'mcq' ? 'Multiple Choice (MCQ)' : 'Conceptual Short Answer'}
                                </span>
                              </div>

                              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-snug">{q.question}</h3>

                              {/* Options if MCQ */}
                              {q.type === 'mcq' && q.options && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {q.options.map((option, optIdx) => {
                                    const isSelected = studentAnswer === option;
                                    const isCorrect = option === q.correctAnswer;
                                    
                                    let optClass = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800';
                                    if (isSelected) {
                                      optClass = 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-300 font-semibold';
                                    }
                                    if (isSubmitted) {
                                      if (isCorrect) {
                                        optClass = 'border-emerald-500 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300 font-semibold';
                                      } else if (isSelected) {
                                        optClass = 'border-red-400 dark:border-red-900 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-300 font-semibold';
                                      } else {
                                        optClass = 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed';
                                      }
                                    }

                                    return (
                                      <button
                                        key={optIdx}
                                        onClick={() => handleSelectQuizOption(q.id, option)}
                                        disabled={isSubmitted}
                                        className={`p-4 rounded-2xl border text-left text-xs transition-all flex items-start gap-3 leading-relaxed cursor-pointer ${optClass}`}
                                      >
                                        <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0 uppercase">
                                          {String.fromCharCode(65 + optIdx)}
                                        </span>
                                        <span className="flex-1">{option}</span>
                                        {isSubmitted && isCorrect && <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />}
                                        {isSubmitted && isSelected && !isCorrect && <X className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Input if Short Answer */}
                              {q.type === 'short_answer' && (
                                <div className="space-y-3">
                                  <textarea
                                    placeholder="Type your answers here based on what you have understood from the text..."
                                    value={studentAnswer}
                                    onChange={(e) => handleTypeShortAnswer(q.id, e.target.value)}
                                    disabled={isSubmitted}
                                    className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-2xl p-4 text-xs dark:text-white outline-none min-h-[140px] transition-all"
                                  />
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Think conceptually and write down your explanation.</p>
                                </div>
                              )}

                              {/* Submit & Question Navigation buttons */}
                              <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex gap-2">
                                  {qIdx > 0 && (
                                    <button
                                      onClick={() => setActiveQuizQuestionIndex(qIdx - 1)}
                                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                      Previous
                                    </button>
                                  )}
                                  {qIdx < activeMaterial.quiz.length - 1 && (
                                    <button
                                      onClick={() => setActiveQuizQuestionIndex(qIdx + 1)}
                                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                      Next
                                    </button>
                                  )}
                                </div>

                                {!isSubmitted && (
                                  <button
                                    onClick={handleSubmitQuiz}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm cursor-pointer"
                                  >
                                    Submit Full Quiz
                                  </button>
                                )}
                              </div>

                               {/* Solution & Explanation Block shown after submission */}
                              {isSubmitted && (() => {
                                if (q.type === 'mcq') {
                                  const isCorrect = studentAnswer.toLowerCase().trim() === q.correctAnswer.toLowerCase().trim();
                                  if (isCorrect) {
                                    return (
                                      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-4 mt-4 animate-fade-in text-xs leading-relaxed flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 font-semibold">
                                        <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                                        <span>Correct! Great job! You nailed this question.</span>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className="bg-red-50/55 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-2xl p-5 mt-4 animate-fade-in text-xs leading-relaxed space-y-3">
                                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-extrabold uppercase tracking-wider text-[10px]">
                                          <X className="w-4 h-4 text-red-500 shrink-0" />
                                          Incorrect Answer Explanation
                                        </div>
                                        <p className="text-slate-800 dark:text-slate-300">
                                          <strong className="text-slate-900 dark:text-white block mb-1">Your Answer:</strong>
                                          <span className="bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg py-1 px-2.5 text-red-900 dark:text-red-300 inline-block text-xs font-semibold">{studentAnswer || "(No Answer)"}</span>
                                        </p>
                                        <p className="text-slate-800 dark:text-slate-300">
                                          <strong className="text-slate-900 dark:text-white block mb-1">Correct Answer:</strong>
                                          <span className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-lg py-1 px-2.5 text-emerald-900 dark:text-emerald-300 inline-block text-xs font-semibold">{q.correctAnswer}</span>
                                        </p>
                                        <div className="text-slate-600 dark:text-slate-400 font-semibold mt-2 pt-2 border-t border-red-100 dark:border-red-900">
                                          <strong className="text-slate-900 dark:text-white block mb-1">Why? (Explanation):</strong>
                                          {q.explanation}
                                        </div>
                                      </div>
                                    );
                                  }
                                } else {
                                  return (
                                    <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-2xl p-5 mt-4 animate-fade-in text-xs leading-relaxed space-y-3">
                                      <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-extrabold uppercase tracking-wider text-[10px]">
                                        <Sparkles className="w-4 h-4 text-indigo-500" />
                                        Review Model Answer
                                      </div>
                                      <p className="text-slate-800 dark:text-slate-300 font-semibold">
                                        <strong className="text-slate-900 dark:text-white block mb-1">Model Answer:</strong>
                                        <span className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 rounded-lg py-1.5 px-3 text-indigo-900 dark:text-indigo-300 block mt-0.5 font-semibold leading-relaxed">{q.correctAnswer}</span>
                                      </p>
                                      <div className="text-slate-600 dark:text-slate-400 font-semibold mt-2 pt-2 border-t border-slate-150 dark:border-slate-800">
                                        <strong className="text-slate-900 dark:text-white block mb-1">AI Explanation & Key Concepts:</strong>
                                        {q.explanation}
                                      </div>
                                    </div>
                                  );
                                }
                              })()}

                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}

                {/* 3. DOUBT SOLVING CHAT TAB */}
                {currentTab === 'chat' && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm h-[560px] flex flex-col overflow-hidden animate-fade-in">
                    
                    {/* Chat Header */}
                    <div className="px-6 py-4 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <MessageSquare className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                          Interactive Doubt Solving Room
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Grounded strictly on your uploaded document context</p>
                      </div>
                      <button
                        onClick={() => {
                          setChatHistories(prev => ({
                            ...prev,
                            [currentMaterialIndex]: [
                              { sender: 'assistant', content: `Doubt room reset! Ask me anything regarding "${activeMaterial.notes.title}".` }
                            ]
                          }));
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-slate-200 dark:border-slate-850 cursor-pointer"
                      >
                        Clear Room
                      </button>
                    </div>

                    {/* Messages Scroll viewport */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {(chatHistories[currentMaterialIndex] || []).map((msg, idx) => {
                        const isUser = msg.sender === 'user';
                        return (
                          <div 
                            key={idx} 
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
                          >
                            <div className={`max-w-[85%] rounded-2xl p-4 text-xs font-medium leading-relaxed shadow-sm ${
                              isUser 
                                ? 'bg-indigo-600 text-white rounded-tr-none' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
                            }`}>
                              {msg.content.split('\n').map((paragraph, pIdx) => (
                                <p key={pIdx} className={pIdx > 0 ? 'mt-2' : ''}>{paragraph}</p>
                              ))}

                              {/* TTS Listen Button next to assistant response */}
                              {!isUser && (
                                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                                  <button
                                    onClick={() => handleToggleVoice(msg.content)}
                                    className={`p-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                      speechState.isPlaying && speechState.currentText === msg.content
                                        ? 'text-red-500 bg-red-100/50'
                                        : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-750 bg-white dark:bg-slate-900 border border-indigo-100/30 dark:border-slate-800'
                                    }`}
                                  >
                                    <Volume2 className="w-3 h-3" />
                                    Speak Out
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {isChatSending && (
                        <div className="flex justify-start">
                          <div className="bg-slate-100 dark:bg-slate-850 rounded-2xl rounded-tl-none p-4 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                            Analyzing document & formulating explanation...
                          </div>
                        </div>
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    {/* Study Recommendation suggestions */}
                    <div className="px-6 py-2 bg-slate-50 dark:bg-slate-950/20 border-t border-slate-100 dark:border-slate-800 flex gap-2 overflow-x-auto">
                      {[
                        { en: "Give a 1-sentence summary", hi: "1-sentence summary do", hing: "Short summary do" },
                        { en: "Explain like I'm 10", hi: "Simple shabdo me samjhao", hing: "Easy words me samjhao" },
                        { en: "Identify the most critical exam point", hi: "Sabse important topic kya hai", hing: "Main exam point batao" }
                      ].map((item, idx) => {
                        const label = language === 'English' ? item.en : language === 'Hindi' ? item.hi : item.hing;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSendQuery(label)}
                            disabled={isChatSending}
                            className="bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-white py-1 px-3 rounded-lg text-[10px] font-bold transition-all shrink-0 shadow-xs cursor-pointer"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Chat Input form footer */}
                    <div className="p-4 border-t border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Type any doubt, question, or custom explanation query here..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
                        disabled={isChatSending}
                        className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-2xl py-3 px-4 text-xs dark:text-white outline-none transition-all"
                      />
                      <button
                        onClick={() => handleSendQuery()}
                        disabled={!chatInput.trim() || isChatSending}
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-all cursor-pointer ${
                          !chatInput.trim() || isChatSending
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 hover:scale-105'
                        }`}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                )}

                {/* 4. STUDY PLANNER TAB */}
                {currentTab === 'plan' && (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Setup form */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          Customized Exam Strategy Plan Generator
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Let StudyBridge organize your days and prioritize high-yield concepts leading up to your deadline.</p>
                      </div>

                      <form onSubmit={handleGenerateStudyPlan} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Target Exam Date</label>
                          <input
                            type="date"
                            value={planExamDate}
                            onChange={(e) => setPlanExamDate(e.target.value)}
                            required
                            className="w-full bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-xl p-3 text-xs dark:text-white outline-none transition-all"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Custom Topics/Syllabus (Optional)</label>
                          <input
                            type="text"
                            placeholder="e.g. Chapter 1 Biology, Unit 2 Physics, Calculus basics..."
                            value={planTopics}
                            onChange={(e) => setPlanTopics(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 dark:focus:border-indigo-500 rounded-xl p-3 text-xs dark:text-white outline-none transition-all"
                          />
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={isGeneratingPlan}
                            className={`px-5 py-3 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                              isGeneratingPlan
                                ? 'bg-indigo-400 text-white cursor-wait'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                            }`}
                          >
                            {isGeneratingPlan ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Analyzing Schedule Timeline...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Generate Exam Study Schedule
                              </>
                            )}
                          </button>
                        </div>
                      </form>

                      {planError && (
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3.5 flex items-start gap-2.5">
                          <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0" />
                          <span className="text-xs font-semibold text-red-800 dark:text-red-300">{planError}</span>
                        </div>
                      )}
                    </div>

                    {/* Active generated schedule display */}
                    {studyPlan ? (
                      <div className="space-y-4">
                        <div className="bg-slate-900 dark:bg-slate-950 border dark:border-slate-800 rounded-3xl p-6 text-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h4 className="text-base font-extrabold text-indigo-400 uppercase tracking-wider">{studyPlan.title}</h4>
                            <p className="text-xs text-slate-400 mt-0.5">Custom timeline containing {studyPlan.totalDays} targeted study intervals</p>
                          </div>
                          <span className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md">
                            Status: Active
                          </span>
                        </div>

                        {/* Calendar Day-by-Day view */}
                        <div className="space-y-3">
                          {studyPlan.plan.map((item, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-3xl p-5 shadow-xs transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-2xl flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-extrabold text-xs shrink-0 flex-col">
                                  <span>Day</span>
                                  <span className="text-sm leading-tight">{idx + 1}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 truncate">{item.topic}</h5>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest ${
                                      item.priority === 'High' 
                                        ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400' 
                                        : item.priority === 'Medium' 
                                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400' 
                                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                                    }`}>
                                      {item.priority} Priority
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-col gap-1">
                                    {item.tasks.map((task, tIdx) => (
                                      <div key={tIdx} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
                                        <span className="text-xs font-semibold">{task}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto shrink-0 pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                  Time: {item.estimatedTime}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-100 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 border-dashed rounded-3xl p-10 text-center text-slate-500 space-y-2">
                        <Calendar className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Study Plan generated yet</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Input your exam date and core targets above to generate your customized calendar.</p>
                      </div>
                    )}

                  </div>
                )}

              </div>

              {/* Right Column: Mini Interactive Side Widgets */}
              <div className="col-span-12 xl:col-span-4 space-y-6">
                
                {/* 1. STUDY CHAT SIDEBAR WIDGET */}
                <div className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col h-[320px] shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none"></div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Quick Solver
                    </h3>
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 py-0.5 px-2 rounded-full font-bold">
                      Grounded Mode
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-semibold mb-4">
                    Quickly ask any doubt from the study material. Chat stays active during study periods.
                  </p>

                  <div className="flex-1 overflow-y-auto mb-4 space-y-3 bg-slate-800/40 p-3 rounded-2xl border border-slate-800 scrollbar-none flex flex-col justify-end">
                    <div className="bg-slate-800 p-2.5 rounded-2xl rounded-tl-none text-[11px] font-medium leading-relaxed">
                      Koi concept clear nahi hai? Just write it below, main detailed Hinglish explanation dunga!
                    </div>
                  </div>

                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Ask study companion..." 
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-4 pr-10 text-xs placeholder-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (setCurrentTab('chat'), handleSendQuery())}
                    />
                    <button 
                      onClick={() => {
                        setCurrentTab('chat');
                        handleSendQuery();
                      }}
                      className="absolute right-2 top-2 text-indigo-400 hover:text-indigo-300 p-1 rounded-lg"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. COMPACT ASSIGNMENT PREVIEW */}
                <div className="bg-indigo-600 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none"></div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-4 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    Quiz Highlight
                  </h3>
                  
                  <div className="bg-white/10 rounded-2xl p-4 mb-4">
                    <p className="text-[11px] text-indigo-100 font-bold mb-1">Conceptual Challenge</p>
                    <p className="text-sm font-black leading-snug">
                      {activeMaterial.quiz[0]?.question || "Ready to challenge your memory limits?"}
                    </p>
                  </div>

                  <p className="text-[11px] text-indigo-100 leading-relaxed font-semibold mb-4">
                    Take the diagnostic practice session designed by Gemini specifically for this textbook chapter.
                  </p>

                  <button 
                    onClick={() => {
                      setCurrentTab('quiz');
                      setActiveQuizQuestionIndex(0);
                    }}
                    className="w-full bg-white hover:bg-slate-50 text-indigo-700 py-3 rounded-xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    Start Full Practice ({activeMaterial.quiz.length} Qs)
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Footer info strip */}
        <footer className="h-10 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-8 flex items-center justify-between text-[10px] text-slate-400 font-medium shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Gemini-3.5-Flash Integrated
            </span>
            <span>•</span>
            <span>Study session focus tracking active</span>
          </div>
          <div>© 2026 StudyBridge AI • Empowering Students in India</div>
        </footer>

      </main>

      {/* MODAL / BREAK NOTIFICATION DIALOG POPUP */}
      {showBreakPopup && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-center space-y-5 animate-scale-up">
            
            <button 
              onClick={() => {
                setShowBreakPopup(false);
                setFocusSeconds(0);
              }}
              className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-sm animate-bounce ${focusSeconds >= 1800 ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900'}`}>
              <Coffee className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {focusSeconds >= 1800 ? "Take a 5 minute break! ☕" : "Time for a Quick Break! ☕"}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                {focusSeconds >= 1800 ? "Excellent work studying hard for 30+ minutes" : `You've been focused for ${Math.floor(focusSeconds / 60)} minutes`}
              </p>
            </div>

            <div className={`${focusSeconds >= 1800 ? 'bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-red-900 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'} p-4 rounded-2xl`}>
              <p className="text-sm leading-relaxed font-semibold">
                {focusSeconds >= 1800 
                  ? "Great job focusing today! But giving your brain a 5-minute break now will help you retain what you've learned much better."
                  : `"${motivationalQuote}"`}
              </p>
            </div>

            <div className="flex gap-3">
              {focusSeconds < 1800 && (
                <button
                  onClick={() => {
                    setShowBreakPopup(false);
                    // Snooze focus tracker for another 10 minutes
                    setFocusSeconds(prev => prev - 600); 
                  }}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-3 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Snooze (10 min)
                </button>
              )}
              <button
                onClick={() => {
                  setShowBreakPopup(false);
                  setFocusSeconds(0);
                }}
                className={`flex-1 py-3 rounded-xl font-bold text-xs transition-colors shadow-sm cursor-pointer ${
                  focusSeconds >= 1800 
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-100 dark:shadow-none' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100 dark:shadow-none'
                }`}
              >
                Okay, taking a Break!
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PDF EXPORT PROGRESS MODAL OVERLAY */}
      {isExportingPDF && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-6 animate-scale-up">
            
            <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-900 mx-auto shadow-inner relative">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              <div className="absolute -top-1 -right-1 bg-indigo-600 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Preparing Your Study Kit PDF</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                StudyBridge AI is rendering textbook-quality sheets. Your download will start automatically once compiling completes.
              </p>
            </div>

            {/* Dynamic Status message */}
            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-50/80 dark:border-indigo-900/40 px-4 py-3.5 rounded-2xl">
              <p className="text-xs text-indigo-800 dark:text-indigo-300 font-extrabold flex items-center justify-center gap-2 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{pdfExportStatus || "Preparing your PDF..."}</span>
              </p>
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-indigo-600 h-1.5 rounded-full animate-[shimmer_1.5s_infinite_linear]" style={{ width: '100%' }}></div>
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Supports English & multilingual Hindi scripts</p>
          </div>
        </div>
      )}

    </div>
  );
}
