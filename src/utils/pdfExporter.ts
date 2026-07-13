import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
  language: string;
}

/**
 * Utility to format dates consistently
 */
const formatDateString = (dateStr?: string) => {
  if (!dateStr) return new Date().toLocaleDateString();
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

/**
 * Escapes HTML characters to prevent rendering/parsing errors
 */
const escapeHTML = (text: string) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Main PDF Generation function
 */
export const generateStudyKitPDF = async (
  material: Material,
  onProgress: (status: string) => void
): Promise<void> => {
  try {
    onProgress('Preparing content templates...');
    
    // Create off-screen container for rendering
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px'; // Exactly A4 width
    container.style.zIndex = '-9999';
    document.body.appendChild(container);

    const title = material.notes.title || material.name || 'Study Notes';
    const dateStr = formatDateString(material.date);
    const language = material.language || 'Hinglish';
    const overview = material.notes.overview || material.notes.summary || 'Study notes overview.';
    
    // Build Pages HTML list
    const pagesHTML: string[] = [];

    // ==========================================
    // PAGE 1: OVERVIEW & SUMMARY
    // ==========================================
    const summaryPoints = material.notes.summaryPoints || [];
    const summaryPointsHTML = summaryPoints.length > 0
      ? summaryPoints.map(pt => `
          <div class="flex items-start gap-2.5 py-1">
            <span class="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1.5 shrink-0"></span>
            <span class="text-[12px] text-slate-700 leading-relaxed font-semibold">${escapeHTML(pt)}</span>
          </div>
        `).join('')
      : `
          <div class="flex items-start gap-2.5 py-1">
            <span class="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1.5 shrink-0"></span>
            <span class="text-[12px] text-slate-700 leading-relaxed font-semibold">${escapeHTML(overview)}</span>
          </div>
        `;

    const page1HTML = `
      <div class="pdf-page">
        <!-- Header -->
        <div class="flex justify-between items-center border-b border-slate-200 pb-3.5 mb-6">
          <div class="flex items-center gap-2">
            <span class="text-indigo-600 font-extrabold text-sm tracking-wider">StudyBridge AI</span>
            <span class="text-slate-300">|</span>
            <span class="text-slate-500 text-xs font-semibold">Personalized Study Guide</span>
          </div>
          <span class="text-slate-400 text-xs font-medium">${dateStr}</span>
        </div>

        <!-- Title block -->
        <div class="mb-6">
          <h1 class="text-3xl font-black text-slate-900 leading-tight mb-2">${escapeHTML(title)}</h1>
          <div class="flex items-center gap-3">
            <span class="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">${language} Mode</span>
            <span class="text-xs text-slate-400 font-medium">Study Kit Overview</span>
          </div>
        </div>

        <!-- Overview Panel -->
        <div class="mb-6 bg-slate-50 border-l-4 border-indigo-600 p-5 rounded-r-2xl">
          <h2 class="text-xs font-black text-indigo-950 uppercase tracking-widest mb-2">I. Overview</h2>
          <p class="text-[12px] text-slate-600 leading-relaxed font-semibold">${escapeHTML(overview)}</p>
        </div>

        <!-- Executive Summary Panel -->
        <div class="flex-1 flex flex-col min-h-0">
          <h2 class="text-xs font-black text-indigo-950 uppercase tracking-widest mb-3">II. Executive Summary</h2>
          <div class="bg-indigo-50/20 border border-indigo-50/50 p-5 rounded-2xl space-y-2 flex-1">
            ${summaryPointsHTML}
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t border-slate-100 pt-3 flex justify-between items-center mt-6">
          <span class="text-[10px] text-slate-400 font-extrabold tracking-wide">STUDYBRIDGE AI STUDY KIT • PAGE 1</span>
          <span class="text-[10px] text-slate-400 font-semibold">Personal Study Material</span>
        </div>
      </div>
    `;
    pagesHTML.push(page1HTML);

    // ==========================================
    // PAGE 2: CORE LESSONS & EXAM INSIGHTS (Only if available)
    // ==========================================
    const bulletPoints = material.notes.bulletPoints || [];
    const highlights = material.notes.highlights || [];

    if (bulletPoints.length > 0 || highlights.length > 0) {
      const coreLessonsHTML = bulletPoints.length > 0
        ? bulletPoints.map(pt => `
            <li class="flex items-start gap-2">
              <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0"></span>
              <span class="text-[11px] text-slate-600 leading-relaxed font-semibold">${escapeHTML(pt)}</span>
            </li>
          `).join('')
        : `<li class="text-[11px] text-slate-400 font-medium italic">No detailed lessons compiled.</li>`;

      const highlightsHTML = highlights.length > 0
        ? highlights.map(pt => `
            <div class="p-3 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-2.5">
              <span class="text-amber-500 text-xs shrink-0 mt-0.5">✦</span>
              <span class="text-[11px] text-amber-900 font-semibold leading-relaxed">${escapeHTML(pt)}</span>
            </div>
          `).join('')
        : `<div class="text-[11px] text-slate-400 font-medium italic">No critical insights compiled.</div>`;

      const page2HTML = `
        <div class="pdf-page">
          <!-- Header -->
          <div class="flex justify-between items-center border-b border-slate-200 pb-3.5 mb-6">
            <div class="flex items-center gap-2">
              <span class="text-indigo-600 font-extrabold text-sm tracking-wider">StudyBridge AI</span>
              <span class="text-slate-300">|</span>
              <span class="text-slate-500 text-xs font-semibold">Personalized Study Guide</span>
            </div>
            <span class="text-slate-400 text-xs font-medium">${dateStr}</span>
          </div>

          <!-- Title block -->
          <div class="mb-6">
            <h1 class="text-2xl font-black text-slate-900 leading-tight mb-1">${escapeHTML(title)}</h1>
            <span class="text-xs text-slate-400 font-semibold">Core Lessons & Critical Insights</span>
          </div>

          <!-- Grid Panels -->
          <div class="grid grid-cols-2 gap-6 flex-1 items-stretch">
            <!-- Left Panel: Core Lessons -->
            <div class="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
              <h2 class="text-xs font-black text-slate-900 mb-4 uppercase tracking-widest flex items-center gap-1.5">
                <span class="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
                Core Lessons & Notes
              </h2>
              <ul class="space-y-3.5 flex-1">
                ${coreLessonsHTML}
              </ul>
            </div>

            <!-- Right Panel: Critical Highlights -->
            <div class="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
              <h2 class="text-xs font-black text-slate-900 mb-4 uppercase tracking-widest flex items-center gap-1.5">
                <span class="w-1.5 h-4 bg-amber-500 rounded-full"></span>
                Exam Tips & Highlights
              </h2>
              <div class="space-y-3 flex-1">
                ${highlightsHTML}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-slate-100 pt-3 flex justify-between items-center mt-6">
            <span class="text-[10px] text-slate-400 font-extrabold tracking-wide">STUDYBRIDGE AI STUDY KIT • PAGE 2</span>
            <span class="text-[10px] text-slate-400 font-semibold">Personal Study Material</span>
          </div>
        </div>
      `;
      pagesHTML.push(page2HTML);
    }

    // ==========================================
    // PAGE 3: PRACTICE QUIZ (Only if quiz exists)
    // ==========================================
    const quizQuestions = material.quiz || [];
    const hasQuiz = quizQuestions.length > 0;

    if (hasQuiz) {
      // Chunk quiz into pages if there are many questions.
      // Usually there are 5 MCQs and 1 Short Answer. This easily fits on 1 page!
      // However, if the user requested more (e.g. 10 or 15), we should chunk them so it stays clean.
      const questionsPerPage = 6;
      const totalQuizPages = Math.ceil(quizQuestions.length / questionsPerPage);

      for (let pIdx = 0; pIdx < totalQuizPages; pIdx++) {
        const startQ = pIdx * questionsPerPage;
        const endQ = Math.min(startQ + questionsPerPage, quizQuestions.length);
        const pageQuestions = quizQuestions.slice(startQ, endQ);

        const quizListHTML = pageQuestions.map((q, qLocalIdx) => {
          const qNum = startQ + qLocalIdx + 1;
          if (q.type === 'mcq') {
            const optionsList = q.options || [];
            const optionsHTML = optionsList.map((opt, oIdx) => {
              const prefix = String.fromCharCode(65 + oIdx); // A, B, C, D
              return `
                <div class="flex items-center gap-2 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                  <span class="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-500 font-bold shrink-0 bg-white">${prefix}</span>
                  <span class="text-[11px] text-slate-600 font-semibold leading-tight">${escapeHTML(opt)}</span>
                </div>
              `;
            }).join('');

            return `
              <div class="border-b border-slate-100 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                <h3 class="text-[12px] font-black text-slate-900 leading-snug mb-2.5">
                  <span class="text-indigo-600 font-extrabold">Q${qNum}.</span> ${escapeHTML(q.question)}
                </h3>
                <div class="grid grid-cols-2 gap-2.5 pl-2">
                  ${optionsHTML}
                </div>
              </div>
            `;
          } else {
            // Short Answer Question
            return `
              <div class="border-b border-slate-100 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                <h3 class="text-[12px] font-black text-slate-900 leading-snug mb-2">
                  <span class="text-indigo-600 font-extrabold">Q${qNum}.</span> ${escapeHTML(q.question)} <span class="text-[9px] text-indigo-500 font-extrabold uppercase bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 ml-1">Short Answer</span>
                </h3>
                <div class="mt-2.5 h-16 border border-dashed border-slate-300 rounded-xl bg-slate-50/40 flex items-center justify-center">
                  <span class="text-[10px] text-slate-400 font-semibold">Write your analytical thoughts here...</span>
                </div>
              </div>
            `;
          }
        }).join('');

        const pageNum = pagesHTML.length + 1;
        const quizPageHTML = `
          <div class="pdf-page">
            <!-- Header -->
            <div class="flex justify-between items-center border-b border-slate-200 pb-3.5 mb-6">
              <div class="flex items-center gap-2">
                <span class="text-indigo-600 font-extrabold text-sm tracking-wider">StudyBridge AI</span>
                <span class="text-slate-300">|</span>
                <span class="text-slate-500 text-xs font-semibold">Practice Assessment</span>
              </div>
              <span class="text-slate-400 text-xs font-medium">${dateStr}</span>
            </div>

            <!-- Title block -->
            <div class="mb-5">
              <h1 class="text-2xl font-black text-slate-900 leading-tight mb-1">${escapeHTML(title)}</h1>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400 font-semibold">Conceptual Worksheet ${totalQuizPages > 1 ? `(Part ${pIdx + 1} of ${totalQuizPages})` : ''}</span>
                <span class="text-[10px] font-bold text-slate-400 italic">Score: ______ / ${quizQuestions.length}</span>
              </div>
            </div>

            <!-- Questions list -->
            <div class="flex-1 flex flex-col justify-start space-y-4">
              ${quizListHTML}
            </div>

            <!-- Footer -->
            <div class="border-t border-slate-100 pt-3 flex justify-between items-center mt-6">
              <span class="text-[10px] text-slate-400 font-extrabold tracking-wide">STUDYBRIDGE AI STUDY KIT • PAGE ${pageNum}</span>
              <span class="text-[10px] text-slate-400 font-semibold">Classroom Practice Sheet (No Answers)</span>
            </div>
          </div>
        `;
        pagesHTML.push(quizPageHTML);
      }

      // ==========================================
      // PAGE 4: SOLUTIONS & DETAILED EXPLANATIONS
      // ==========================================
      const solutionsPerPage = 4;
      const totalSolutionPages = Math.ceil(quizQuestions.length / solutionsPerPage);

      for (let sIdx = 0; sIdx < totalSolutionPages; sIdx++) {
        const startQ = sIdx * solutionsPerPage;
        const endQ = Math.min(startQ + solutionsPerPage, quizQuestions.length);
        const pageQuestions = quizQuestions.slice(startQ, endQ);

        const solutionsListHTML = pageQuestions.map((q, qLocalIdx) => {
          const qNum = startQ + qLocalIdx + 1;
          if (q.type === 'mcq') {
            return `
              <div class="bg-slate-50/50 border border-slate-150 p-4.5 rounded-2xl flex flex-col space-y-2">
                <div class="flex justify-between items-start gap-4">
                  <h3 class="text-[11.5px] font-black text-slate-900 leading-snug flex-1">
                    <span class="text-indigo-600 font-extrabold">Q${qNum}.</span> ${escapeHTML(q.question)}
                  </h3>
                  <span class="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-black px-2.5 py-1 rounded-md shrink-0">Correct Option: ${escapeHTML(q.correctAnswer)}</span>
                </div>
                <div class="text-[10.5px] text-slate-600 leading-relaxed font-semibold pt-1.5 border-t border-slate-100">
                  <strong class="text-slate-900 block mb-0.5 uppercase tracking-wide text-[9px]">AI Explanation:</strong>
                  ${escapeHTML(q.explanation)}
                </div>
              </div>
            `;
          } else {
            return `
              <div class="bg-indigo-50/15 border border-indigo-100/60 p-4.5 rounded-2xl flex flex-col space-y-2">
                <div class="flex flex-col space-y-1">
                  <h3 class="text-[11.5px] font-black text-slate-900 leading-snug">
                    <span class="text-indigo-600 font-extrabold">Q${qNum}.</span> ${escapeHTML(q.question)} <span class="text-[8px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-black px-1.5 py-0.5 rounded-md ml-1 uppercase">Short Answer</span>
                  </h3>
                  <div class="text-[11px] text-indigo-950 font-extrabold bg-white border border-indigo-50 px-3 py-2 rounded-xl mt-1 leading-relaxed">
                    <strong class="text-indigo-900 text-[9px] block uppercase tracking-wide mb-0.5">Model Answer Reference:</strong>
                    ${escapeHTML(q.correctAnswer)}
                  </div>
                </div>
                <div class="text-[10.5px] text-slate-600 leading-relaxed font-semibold pt-1.5 border-t border-indigo-50/50">
                  <strong class="text-slate-900 block mb-0.5 uppercase tracking-wide text-[9px]">AI Evaluation Criteria:</strong>
                  ${escapeHTML(q.explanation)}
                </div>
              </div>
            `;
          }
        }).join('');

        const pageNum = pagesHTML.length + 1;
        const solutionsPageHTML = `
          <div class="pdf-page">
            <!-- Header -->
            <div class="flex justify-between items-center border-b border-slate-200 pb-3.5 mb-6">
              <div class="flex items-center gap-2">
                <span class="text-indigo-600 font-extrabold text-sm tracking-wider">StudyBridge AI</span>
                <span class="text-slate-300">|</span>
                <span class="text-slate-500 text-xs font-semibold">Answer Key & Solutions</span>
              </div>
              <span class="text-slate-400 text-xs font-medium">${dateStr}</span>
            </div>

            <!-- Title block -->
            <div class="mb-5">
              <h1 class="text-2xl font-black text-slate-900 leading-tight mb-1">${escapeHTML(title)}</h1>
              <span class="text-xs text-slate-400 font-semibold">Official Answer Key ${totalSolutionPages > 1 ? `(Part ${sIdx + 1} of ${totalSolutionPages})` : ''}</span>
            </div>

            <!-- Solutions list -->
            <div class="flex-1 flex flex-col justify-start space-y-4">
              ${solutionsListHTML}
            </div>

            <!-- Footer -->
            <div class="border-t border-slate-100 pt-3 flex justify-between items-center mt-6">
              <span class="text-[10px] text-slate-400 font-extrabold tracking-wide">STUDYBRIDGE AI STUDY KIT • PAGE ${pageNum}</span>
              <span class="text-[10px] text-slate-400 font-semibold">Official Answer Sheet (Protected View)</span>
            </div>
          </div>
        `;
        pagesHTML.push(solutionsPageHTML);
      }
    }

    // ==========================================
    // RENDER THE PAGES DYNAMICALLY
    // ==========================================
    // Inject custom Google Fonts link and styles so they are applied in html2canvas
    const styleBlock = document.createElement('style');
    styleBlock.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+Devanagari:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
      
      .pdf-page {
        font-family: 'Inter', 'Noto Sans Devanagari', sans-serif;
        width: 794px;
        height: 1123px;
        box-sizing: border-box;
        padding: 50px 60px;
        background-color: #ffffff;
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        margin-bottom: 20px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      }
      .font-mono {
        font-family: 'JetBrains Mono', monospace;
      }
    `;
    container.appendChild(styleBlock);

    // Create container elements for each page and append to our off-screen container
    const pageDivs: HTMLDivElement[] = [];
    pagesHTML.forEach((html, idx) => {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.id = `pdf-page-element-${idx}`;
      pageDiv.innerHTML = html;
      container.appendChild(pageDiv);
      pageDivs.push(pageDiv);
    });

    // Wait a short moment to allow the browser to resolve imports and paint fonts
    onProgress('Rendering crisp typography and layouts...');
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Initialize jsPDF document (portrait, millimeters, A4 size)
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Generate canvases page by page
    for (let i = 0; i < pageDivs.length; i++) {
      onProgress(`Assembling PDF pages (${i + 1} of ${pageDivs.length})...`);
      
      const pageDiv = pageDivs[i];
      const canvas = await html2canvas(pageDiv, {
        scale: 2, // 2x resolution for retina/HD text sharpness
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      if (i > 0) {
        pdf.addPage();
      }
      
      // A4 dimensions are 210mm x 297mm
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    // Clean up temporary DOM nodes
    onProgress('Cleaning up resources...');
    document.body.removeChild(container);

    // Download the PDF dynamically named
    onProgress('Downloading your Study Kit...');
    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F\s-]/g, '') // Keep letters, numbers, spaces, and Devanagari characters
      .trim()
      .replace(/\s+/g, '_');
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `StudyBridge_Notes_${safeTitle || timestamp}.pdf`;
    
    pdf.save(filename);
    
  } catch (error) {
    console.error('Error during PDF generation:', error);
    throw error;
  }
};
