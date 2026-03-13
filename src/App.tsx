/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Briefcase, 
  Clock, 
  Bookmark, 
  AlertCircle, 
  Settings, 
  Search, 
  User,
  ChevronRight,
  ExternalLink,
  Plus,
  Filter,
  MoreHorizontal,
  MessageSquare,
  Mail,
  Linkedin,
  Sparkles,
  Loader2,
  ArrowRight,
  BrainCircuit,
  X,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import {
  fetchOpportunities,
  addOpportunity,
  extractOpportunity as apiExtract,
  updateStatus,
  deleteOpportunity,
  type DBOpportunity,
  registerUser,
  loginUser,
  type AuthUser,
} from './services/api';

// Types
interface Opportunity {
  id: string;
  title: string;        // maps to 'role' in the DB
  company: string;
  type: 'Internship' | 'Hackathon' | 'Scholarship' | 'Job';
  deadline: string;
  deadlineRaw: string | null;
  source: 'WhatsApp' | 'Email' | 'LinkedIn' | 'Other';
  description: string;
  // Extended fields from DB
  role?: string;
  link?: string;
  status?: 'Not Applied' | 'Applied' | 'Rejected' | 'Accepted';
  category?: 'Internship' | 'Hackathon' | 'Scholarship' | 'Job';
  created_at?: string;
}

const CATEGORY_OPTIONS: Array<Opportunity['type']> = ['Internship', 'Hackathon', 'Scholarship', 'Job'];
const STATUS_OPTIONS: Array<NonNullable<Opportunity['status']>> = ['Not Applied', 'Applied', 'Rejected', 'Accepted'];
const SOURCE_OPTIONS: Array<Opportunity['source']> = ['LinkedIn', 'WhatsApp', 'Email', 'Other'];
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_FAST_MODEL = 'gemini-2.5-flash-lite';

function getGeminiClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to .env.local and restart the Vite server.');
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

function normalizeSource(value: unknown): Opportunity['source'] {
  const source = String(value ?? '').trim().toLowerCase();
  if (source.includes('whatsapp')) return 'WhatsApp';
  if (source.includes('email') || source.includes('mail')) return 'Email';
  if (source.includes('linkedin')) return 'LinkedIn';
  return 'Other';
}

function normalizeCategory(value: unknown): Opportunity['type'] {
  const category = String(value ?? '').trim().toLowerCase();
  if (category.includes('hack')) return 'Hackathon';
  if (category.includes('scholar')) return 'Scholarship';
  if (category.includes('job') || category.includes('full')) return 'Job';
  return 'Internship';
}

function normalizeStatus(value: unknown): NonNullable<Opportunity['status']> {
  const status = String(value ?? '').trim().toLowerCase();
  if (status.includes('accept')) return 'Accepted';
  if (status.includes('reject')) return 'Rejected';
  if (status.includes('applied')) return 'Applied';
  return 'Not Applied';
}

function normalizeDeadline(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeLink(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

async function extractOpportunityWithGemini(text: string): Promise<Partial<DBOpportunity>> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_FAST_MODEL,
    contents: `Extract opportunity details from the input below and return only valid JSON with these keys: company, role, deadline, link, source, category, status.\n\nRules:\n- deadline must be YYYY-MM-DD or null\n- source must be one of WhatsApp, Email, LinkedIn, Other\n- category must be one of Internship, Hackathon, Scholarship, Job\n- status must be one of Not Applied, Applied, Rejected, Accepted\n- if a field is missing, return null except status which should default to Not Applied\n- infer category from wording when possible\n- infer source from context or link domain when possible\n\nInput:\n${text}`,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const parsed = JSON.parse(response.text || '{}') as Record<string, unknown>;

  return {
    company: String(parsed.company ?? '').trim() || null,
    role: String(parsed.role ?? '').trim() || null,
    deadline: normalizeDeadline(parsed.deadline),
    link: normalizeLink(parsed.link),
    source: normalizeSource(parsed.source),
    category: normalizeCategory(parsed.category),
    status: normalizeStatus(parsed.status),
  };
}

function formatDeadline(raw: string | null): string {
  if (!raw) return 'No deadline';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysRemaining(raw: string | null): number | null {
  if (!raw) return null;
  const target = new Date(raw + 'T23:59:59');
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function daysRemainingLabel(raw: string | null): string {
  const days = getDaysRemaining(raw);
  if (days === null) return 'No deadline';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

function daysRemainingVerbose(raw: string | null): string {
  const days = getDaysRemaining(raw);
  if (days === null) return 'No deadline';
  if (days < 0) {
    const overdue = Math.abs(days);
    return overdue === 1 ? 'Overdue by 1 day' : `Overdue by ${overdue} days`;
  }
  if (days === 0) return 'Due today';
  return days === 1 ? '1 day left' : `${days} days left`;
}

/** Map a raw DB row to the local Opportunity shape the UI expects. */
function dbToOpportunity(row: DBOpportunity): Opportunity {
  return {
    id: row.id,
    title: row.role || 'Unknown Role',
    company: row.company || 'Unknown Company',
    type: row.category || 'Internship',
    deadline: formatDeadline(row.deadline),
    deadlineRaw: row.deadline,
    source: (row.source as Opportunity['source']) || 'Other',
    description: row.link ? `Apply here: ${row.link}` : '',
    role: row.role,
    link: row.link ?? undefined,
    status: row.status,
    category: row.category,
    created_at: row.created_at,
  };
}

// Opportunities are now loaded from the MySQL database via the PHP API.
// The hardcoded seed data has been replaced by dynamic data below.

type Page = 'dashboard' | 'opportunities' | 'deadlines' | 'saved' | 'notifications' | 'settings';

const SidebarItem = ({
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  icon: any;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 ${
      active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </div>
);

const StatCard = ({ label, value, colorClass }: { label: string, value: string, colorClass: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
  >
    <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
    <h3 className={`text-3xl font-bold ${colorClass}`}>{value}</h3>
  </motion.div>
);

const DeadlineRow = ({
  opp,
  onStatusChange,
  onDelete,
}: {
  opp: Opportunity;
  onStatusChange: (id: string, status: NonNullable<Opportunity['status']>) => void;
  onDelete: (id: string) => void;
}) => (
  <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
        opp.type === 'Internship' ? 'bg-blue-100 text-blue-600' :
        opp.type === 'Hackathon' ? 'bg-yellow-100 text-yellow-700' :
        'bg-blue-100 text-blue-600'
      }`}>
        {opp.type === 'Internship' ? <Briefcase size={18} /> : 
         opp.type === 'Hackathon' ? <Plus size={18} /> : <Bookmark size={18} />}
      </div>
      <div>
        <h4 className="font-semibold text-slate-900">{opp.company} {opp.title}</h4>
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{opp.type}</p>
      </div>
    </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{opp.deadline}</p>
          <p className="text-xs text-slate-400">{daysRemainingLabel(opp.deadlineRaw)}</p>
        </div>
        {opp.link && (
          <a
            href={opp.link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            title="Apply Directly"
            aria-label={`Apply directly for ${opp.title} at ${opp.company}`}
          >
            <ExternalLink size={16} />
          </a>
        )}
        <select
          value={opp.status ?? 'Not Applied'}
          onChange={(e) => onStatusChange(opp.id, e.target.value as NonNullable<Opportunity['status']>)}
          className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700"
        >
          {STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <button
          onClick={() => onDelete(opp.id)}
          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <X size={16} />
        </button>
      </div>
  </div>
);

const OpportunityCard = ({
  opp,
  onDeepDive,
  onStatusChange,
  onDelete,
}: {
  opp: Opportunity;
  onDeepDive: (opp: Opportunity) => void;
  onStatusChange: (id: string, status: NonNullable<Opportunity['status']>) => void;
  onDelete: (id: string) => void;
}) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4"
  >
    <div className="flex justify-between items-start">
      <div className="flex items-center gap-2">
        {opp.source === 'WhatsApp' && <MessageSquare size={14} className="text-green-500" />}
        {opp.source === 'Email' && <Mail size={14} className="text-blue-500" />}
        {opp.source === 'LinkedIn' && <Linkedin size={14} className="text-blue-700" />}
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-tight">{opp.source}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{opp.type}</span>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onDeepDive(opp)}
          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
          title="AI Deep Dive"
        >
          <BrainCircuit size={18} />
        </button>
        <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
          <Bookmark size={18} />
        </button>
      </div>
    </div>
    
    <div>
      <h4 className="font-bold text-slate-900 leading-tight mb-1">{opp.title}</h4>
      <p className="text-sm text-blue-600 font-medium">{opp.company}</p>
    </div>
    
    <p className="text-sm text-slate-500 line-clamp-2">
      {opp.description}
    </p>
    <p className="text-xs font-semibold text-yellow-700">{daysRemainingLabel(opp.deadlineRaw)}</p>
    
    <div className="mt-auto pt-4 flex gap-2">
      {opp.link && (
        <a
          href={opp.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 text-center bg-blue-100 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-200 transition-colors border border-blue-200"
        >
          Open Link
        </a>
      )}
      <select
        value={opp.status ?? 'Not Applied'}
        onChange={(e) => onStatusChange(opp.id, e.target.value as NonNullable<Opportunity['status']>)}
        className="flex-1 py-2 px-2 text-xs font-bold rounded-lg border border-yellow-300 bg-yellow-100 text-yellow-800"
      >
        {STATUS_OPTIONS.map(status => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <button
        onClick={() => onDelete(opp.id)}
        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        title="Delete"
      >
        <X size={14} />
      </button>
    </div>
  </motion.div>
);

export default function App() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem('nevermiss_user');
      return raw ? JSON.parse(raw) as AuthUser : null;
    } catch {
      return null;
    }
  });
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [showLanding, setShowLanding] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const [heroTilt, setHeroTilt] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | Opportunity['type']>('All');
  const [deadlineBeforeFilter, setDeadlineBeforeFilter] = useState('');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoadingOpps, setIsLoadingOpps] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [isDeepDiving, setIsDeepDiving] = useState(false);
  const [deepDiveResult, setDeepDiveResult] = useState<string | null>(null);
  // Smart Capture state
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState<'extract' | 'manual'>('extract');
  const [captureText, setCaptureText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<Partial<DBOpportunity> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const emptyManual = {
    company: '',
    role: '',
    deadline: '',
    link: '',
    source: 'Other' as Opportunity['source'],
    category: 'Internship' as Opportunity['type'],
    status: 'Not Applied' as NonNullable<Opportunity['status']>,
  };
  const [manualForm, setManualForm] = useState(emptyManual);
  // Navigation
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [showTopNotifications, setShowTopNotifications] = useState(false);

  // ── Load opportunities from the PHP/MySQL backend ──────────────────────────
  const loadOpportunities = async () => {
    setIsLoadingOpps(true);
    setApiError(null);
    try {
      const rows = await fetchOpportunities();
      setOpportunities(rows.map(dbToOpportunity));
    } catch (err: any) {
      console.error('Failed to load opportunities:', err);
      setApiError(
        'Could not reach the PHP API. Make sure XAMPP Apache is running and the database is set up. ' +
        `(${err.message})`
      );
    } finally {
      setIsLoadingOpps(false);
    }
  };

  // Fetch on mount
  useEffect(() => { loadOpportunities(); }, []);

  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch =
      !searchQuery.trim() ||
      opp.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.source.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'All' || opp.type === categoryFilter;

    const matchesDeadline = !deadlineBeforeFilter || (opp.deadlineRaw !== null && opp.deadlineRaw <= deadlineBeforeFilter);

    return matchesSearch && matchesCategory && matchesDeadline;
  });

  const topDeadlineNotifications = opportunities
    .filter(opp => opp.deadlineRaw && getDaysRemaining(opp.deadlineRaw) !== null)
    .filter(opp => (getDaysRemaining(opp.deadlineRaw) ?? 9999) >= 0)
    .sort((a, b) => (getDaysRemaining(a.deadlineRaw) ?? 9999) - (getDaysRemaining(b.deadlineRaw) ?? 9999))
    .slice(0, 3);

  const handleAuthSubmit = async () => {
    if (!authForm.email.trim() || !authForm.password.trim()) {
      setAuthError('Email and password are required.');
      return;
    }
    if (authMode === 'register' && !authForm.name.trim()) {
      setAuthError('Name is required for registration.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const user = authMode === 'register'
        ? await registerUser({
            name: authForm.name.trim(),
            email: authForm.email.trim(),
            password: authForm.password,
          })
        : await loginUser({
            email: authForm.email.trim(),
            password: authForm.password,
          });

      setAuthUser(user);
      localStorage.setItem('nevermiss_user', JSON.stringify(user));
      setAuthForm({ name: '', email: '', password: '' });
      setShowLanding(false);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    localStorage.removeItem('nevermiss_user');
    setAuthForm({ name: '', email: '', password: '' });
    setAuthMode('login');
  };

  useEffect(() => {
    if (!showLanding) return;
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showLanding]);

  // ── Status update ─────────────────────────────────────────────────────────
  const handleStatusChange = async (
    id: string,
    newStatus: NonNullable<Opportunity['status']>
  ) => {
    const previous = opportunities.find(o => o.id === id)?.status;
    // Optimistic update
    setOpportunities(prev =>
      prev.map(o => o.id === id ? { ...o, status: newStatus } : o)
    );
    try {
      await updateStatus(id, newStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
      // Revert on error
      setOpportunities(prev =>
        prev.map(o => o.id === id ? { ...o, status: previous } : o)
      );
    }
  };

  // ── Delete opportunity ──────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm('Remove this opportunity?')) return;
    // Optimistic remove
    setOpportunities(prev => prev.filter(o => o.id !== id));
    try {
      await deleteOpportunity(id);
    } catch (err) {
      console.error('Failed to delete:', err);
      // Reload to restore correct state
      loadOpportunities();
    }
  };

  // ── Smart Capture ────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!captureText.trim()) return;
    setIsExtracting(true);
    setCaptureError(null);
    setExtractedData(null);
    try {
      const data = await extractOpportunityWithGemini(captureText);
      setExtractedData(data);
    } catch (err: any) {
      try {
        const fallback = await apiExtract(captureText);
        setExtractedData({
          company: fallback.company ?? null,
          role: fallback.role ?? null,
          deadline: normalizeDeadline(fallback.deadline),
          link: normalizeLink(fallback.link),
          source: normalizeSource(fallback.source),
          category: normalizeCategory(fallback.category),
          status: normalizeStatus(fallback.status),
        });
      } catch {
        setCaptureError('Extraction failed: ' + err.message);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveExtracted = async () => {
    if (!extractedData) return;
    setIsSaving(true);
    setCaptureError(null);
    try {
      await addOpportunity({
        company: extractedData.company ?? 'Unknown',
        role:    extractedData.role    ?? 'Unknown Role',
        deadline: extractedData.deadline ?? null,
        link:    extractedData.link    ?? null,
        source:  extractedData.source  ?? 'Other',
        category: extractedData.category ?? 'Internship',
        status:  extractedData.status ?? 'Not Applied',
      });
      // Refresh dashboard
      await loadOpportunities();
      // Close modal
      setShowCapture(false);
      setCaptureText('');
      setExtractedData(null);
    } catch (err: any) {
      setCaptureError('Save failed: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManual = async () => {
    if (!manualForm.company.trim() || !manualForm.role.trim()) {
      setCaptureError('Company and Role are required.');
      return;
    }
    setIsSaving(true);
    setCaptureError(null);
    try {
      await addOpportunity({
        company:  manualForm.company.trim(),
        role:     manualForm.role.trim(),
        deadline: manualForm.deadline.trim() || null,
        link:     manualForm.link.trim() || null,
        source:   manualForm.source || 'Other',
        category: manualForm.category || 'Internship',
        status:   manualForm.status || 'Not Applied',
      });
      await loadOpportunities();
      setShowCapture(false);
      setManualForm(emptyManual);
      setCaptureError(null);
    } catch (err: any) {
      setCaptureError('Save failed: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeepDive = async (opp: Opportunity) => {
    setSelectedOpp(opp);
    setIsDeepDiving(true);
    setDeepDiveResult(null);
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_FAST_MODEL,
        contents: `Give a simple, student-friendly markdown response for this opportunity.\n\nOpportunity:\nCompany: ${opp.company}\nRole: ${opp.title}\nSource: ${opp.source}\nDeadline: ${opp.deadline}\nDescription: ${opp.description || 'No extra description available.'}\n\nReturn only markdown with these sections:\n### Quick Description\nWrite 1-2 simple sentences about what this opportunity is.\n\n### Suggestions\nGive 3 short bullet points with practical suggestions for applying.\n\n### Best Next Step\nGive 1 short action sentence.\n\nKeep the total response concise and easy to understand.`,
      });
      setDeepDiveResult(response.text);
    } catch (error: any) {
      console.error("Deep dive error:", error);
      const message = String(error?.message || error || 'Unknown error');
      if (message.includes('429') || message.toLowerCase().includes('quota')) {
        setDeepDiveResult('AI suggestions are temporarily unavailable because the Gemini API quota for this key has been reached. Please wait a bit and try again, or use a key with available quota.');
      } else {
        setDeepDiveResult(`AI suggestions could not be generated right now. ${message}`);
      }
    } finally {
      setIsDeepDiving(false);
    }
  };

  const handleAiSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find 4 real, current ${searchQuery} for students. Return them as a JSON array of objects matching this interface: { id: string, title: string, company: string, type: 'Internship' | 'Hackathon' | 'Scholarship' | 'Job', deadline: string, source: 'WhatsApp' | 'Email' | 'LinkedIn' | 'Other', description: string }. Only return the JSON.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const newOps = JSON.parse(response.text);
      setOpportunities(newOps);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeepThink = async () => {
    setIsThinking(true);
    setAiResponse(null);
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: "Provide a detailed career roadmap for a computer science student interested in AI and Web Development. Think step by step and provide specific actionable advice.",
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
      setAiResponse(response.text);
    } catch (error) {
      console.error("Thinking error:", error);
    } finally {
      setIsThinking(false);
    }
  };

  if (!authUser && !showLanding) {
    return (
      <div className="min-h-screen bg-yellow-50/40 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 bg-white border border-yellow-100 rounded-3xl shadow-xl overflow-hidden">
          <div className="p-10 bg-gradient-to-br from-yellow-300 via-yellow-200 to-blue-200 text-slate-900 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <img src="/logo.png" alt="NeverMiss" className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 border border-blue-100 shadow-lg shadow-blue-200/60" />
                <p className="text-2xl font-black">NeverMiss</p>
              </div>
              <h1 className="text-4xl font-black leading-tight">
                {authMode === 'login'
                  ? 'Your opportunities are waiting. Sign back in.'
                  : 'One dashboard for every opportunity you find.'}
              </h1>
              <p className="mt-4 text-slate-700 font-medium">
                {authMode === 'login'
                  ? 'Pick up exactly where you left off — deadlines, statuses, and saved links all in one place.'
                  : 'Capture from WhatsApp, LinkedIn or email. Organize by category. Track every deadline.'}
              </p>
            </div>
            <p className="text-sm text-blue-800 font-semibold">
              {authMode === 'login'
                ? 'Resume where you left off • Check deadlines • Update status'
                : 'Capture fast • Plan better • Never miss a deadline'}
            </p>
          </div>

          <div className="p-10">
            <div className="flex bg-yellow-100 p-1 rounded-xl w-fit mb-6 border border-yellow-200">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(null); }}
                className={`px-5 py-2 rounded-lg text-sm font-bold ${authMode === 'login' ? 'bg-blue-600 text-white shadow-sm' : 'text-yellow-800/80'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(null); }}
                className={`px-5 py-2 rounded-lg text-sm font-bold ${authMode === 'register' ? 'bg-blue-600 text-white shadow-sm' : 'text-yellow-800/80'}`}
              >
                Join Now
              </button>
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-2">
              {authMode === 'login' ? 'Good to see you again' : 'Get started for free'}
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              {authMode === 'login'
                ? 'Enter your credentials to access your dashboard and see your upcoming deadlines.'
                : 'Create your NeverMiss account in seconds and start capturing opportunities right away.'}
            </p>
            <button
              onClick={() => setShowLanding(true)}
              className="mb-6 text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors"
            >
              ← Back to Landing
            </button>

            <div className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Name</label>
                  <input
                    value={authForm.name}
                    onChange={(e) => setAuthForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/25 focus:border-blue-500"
                    placeholder="Your full name"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/25 focus:border-blue-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Password</label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/25 focus:border-blue-500"
                  placeholder="At least 6 characters"
                  onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
                />
              </div>

              {authError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{authError}</p>
              )}

              <button
                onClick={handleAuthSubmit}
                disabled={isAuthLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-blue-500 text-white font-bold hover:from-yellow-300 hover:to-blue-600 transition-colors disabled:opacity-60 shadow-lg shadow-yellow-100"
              >
                {isAuthLoading ? 'Please wait...' : authMode === 'login' ? 'Sign In to Dashboard' : 'Create My Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showLanding) {
    return (
      <div className="min-h-screen bg-yellow-50/40 text-slate-900 overflow-x-hidden">
        <div
          className="fixed -top-32 -right-20 w-[26rem] h-[26rem] rounded-full bg-yellow-300/35 blur-3xl pointer-events-none"
          style={{ transform: `translateY(${scrollY * 0.22}px)` }}
        />
        <div
          className="fixed top-72 -left-20 w-80 h-80 rounded-full bg-yellow-200/35 blur-3xl pointer-events-none"
          style={{ transform: `translateY(${scrollY * -0.15}px)` }}
        />

        <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-yellow-200">
          <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="NeverMiss" className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 border border-yellow-200 shadow-lg shadow-yellow-200/60" />
              <div>
                <p className="text-xl font-black tracking-tight">NeverMiss</p>
                <p className="text-xs text-yellow-700 font-medium">Opportunity Tracker</p>
              </div>
            </div>
            <div className="flex items-center gap-6 lg:gap-8">
              <div className="hidden md:flex items-center gap-6">
                <button
                  onClick={() => window.scrollTo({ top: 890, behavior: 'smooth' })}
                  className="text-sm font-semibold text-slate-700 hover:text-yellow-700 transition-colors"
                >
                  Features
                </button>
                <button
                  onClick={() => window.scrollTo({ top: 1050, behavior: 'smooth' })}
                  className="text-sm font-semibold text-slate-700 hover:text-yellow-700 transition-colors"
                >
                  How It Works
                </button>
                <button
                  onClick={() => setShowLanding(false)}
                  className="text-sm font-semibold text-slate-700 hover:text-yellow-700 transition-colors"
                >
                  Sign In
                </button>
              </div>
              <button
                onClick={() => setShowLanding(false)}
                className="px-5 py-2.5 rounded-xl bg-yellow-500 text-slate-900 font-black hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-200"
              >
                Enter App
              </button>
            </div>
          </nav>
        </header>

        <main>
          <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold mb-6 border border-yellow-200">
                Never miss a deadline again
              </p>
              <h1 className="text-5xl md:text-6xl font-black leading-tight tracking-tight">
                Capture.
                <span className="text-yellow-700"> Organize.</span>
                <br />
                Apply on time.
              </h1>
              <p className="mt-6 text-lg text-slate-600 max-w-xl">
                NeverMiss turns scattered WhatsApp, LinkedIn, and email opportunities into one clean dashboard with categories,
                status tracking, filters, duplicate prevention, and countdown-based reminders.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><Clock size={14} className="text-yellow-700" /> Top 3 nearest deadlines with day-wise alerts</li>
                <li className="flex items-center gap-2"><Filter size={14} className="text-yellow-700" /> Filter by category, search, and deadline date</li>
                <li className="flex items-center gap-2"><Bookmark size={14} className="text-yellow-700" /> Save links, track statuses, and avoid duplicate entries</li>
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => setShowLanding(false)}
                  className="px-6 py-3 rounded-xl bg-yellow-500 text-slate-900 font-black hover:bg-yellow-400 transition-colors shadow-lg shadow-yellow-200"
                >
                  Start Tracking
                </button>
                <button
                  onClick={() => window.scrollTo({ top: 980, behavior: 'smooth' })}
                  className="px-6 py-3 rounded-xl border border-yellow-300 bg-white text-yellow-800 font-bold hover:bg-yellow-50"
                >
                  Explore Features
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-br from-yellow-300/40 to-blue-200/30 blur-2xl rounded-[2rem]" />
              <div className="relative bg-white border border-slate-100 rounded-[2rem] shadow-2xl p-8 overflow-hidden">
                {/* Animated background elements */}
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute top-10 right-10 w-20 h-20 bg-blue-100 rounded-full opacity-30 blur-xl"
                />
                <motion.div
                  animate={{ y: [0, 10, 0], rotate: [0, -5, 0] }}
                  transition={{ duration: 5, repeat: Infinity, delay: 0.5 }}
                  className="absolute bottom-10 left-10 w-24 h-24 bg-yellow-100 rounded-full opacity-30 blur-xl"
                />

                <h3 className="text-2xl font-black text-slate-900 mb-8 text-center relative z-10">Why Choose NeverMiss?</h3>
                
                <div className="space-y-5 relative z-10">
                  {/* Benefit 1 */}
                  <div className="flex items-start gap-4 p-5 rounded-xl bg-gradient-to-br from-blue-50 to-transparent border border-blue-100 hover:shadow-lg transition-all">
                    <motion.div
                      animate={{ scale: [1, 1.15, 1], rotate: [0, 10, 0] }}
                      transition={{ duration: 3, repeat: Infinity }}
                      className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center"
                    >
                      <Mail size={24} />
                    </motion.div>
                    <div>
                      <p className="font-bold text-slate-900">Centralized Hub</p>
                      <p className="text-sm text-slate-600 mt-1">Collect all opportunities from WhatsApp, LinkedIn, and email in one place</p>
                    </div>
                  </div>

                  {/* Benefit 2 */}
                  <div className="flex items-start gap-4 p-5 rounded-xl bg-gradient-to-br from-yellow-50 to-transparent border border-yellow-100 hover:shadow-lg transition-all">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                      className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500 to-yellow-600 text-white flex items-center justify-center"
                    >
                      <Clock size={24} />
                    </motion.div>
                    <div>
                      <p className="font-bold text-slate-900">Never Miss a Deadline</p>
                      <p className="text-sm text-slate-600 mt-1">Smart countdown alerts and deadline tracking to stay on top of every opportunity</p>
                    </div>
                  </div>

                  {/* Benefit 3 */}
                  <div className="flex items-start gap-4 p-5 rounded-xl bg-gradient-to-br from-green-50 to-transparent border border-green-100 hover:shadow-lg transition-all">
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                      className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center"
                    >
                      <Sparkles size={24} />
                    </motion.div>
                    <div>
                      <p className="font-bold text-slate-900">Smart Organization</p>
                      <p className="text-sm text-slate-600 mt-1">Auto-extract details and filter by category, status, and date instantly</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-6 py-8">
            <h2 className="text-3xl font-black tracking-tight mb-6">Core Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                { icon: Sparkles, title: 'Smart Capture', desc: 'Paste text or URL and auto-extract company, role, deadline, source.' },
                { icon: Briefcase, title: 'Category Tracking', desc: 'Classify opportunities as Internship, Hackathon, Scholarship, or Job.' },
                { icon: CheckCircle, title: 'Status Workflow', desc: 'Track Not Applied, Applied, Rejected, and Accepted with quick updates.' },
                { icon: Clock, title: 'Deadline Countdown', desc: 'See exactly how many days are left and prioritize high-urgency tasks.' },
                { icon: Filter, title: 'Filters & Search', desc: 'Find opportunities by category, keywords, and date in seconds.' },
                { icon: Bookmark, title: 'Duplicate Prevention', desc: 'Avoid repeated entries from forwarded or duplicated alerts.' },
              ].map(card => (
                <div key={card.title} className="bg-white border border-yellow-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center mb-4">
                    <card.icon size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{card.title}</h3>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-6 py-6">
            <h2 className="text-3xl font-black tracking-tight mb-6">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { step: '01', title: 'Capture', detail: 'Paste a message or link from WhatsApp, email, LinkedIn, or anywhere.' },
                { step: '02', title: 'Organize', detail: 'Auto-fill details, choose category, and set status in one dashboard.' },
                { step: '03', title: 'Act', detail: 'Use day-left reminders and top notifications to apply before deadlines.' },
              ].map(item => (
                <div key={item.step} className="bg-white border border-yellow-100 rounded-2xl p-5">
                  <p className="text-xs font-black text-yellow-700">STEP {item.step}</p>
                  <h3 className="text-xl font-black text-slate-900 mt-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 mt-2">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-6 py-6">
            <div className="bg-white border border-yellow-100 rounded-3xl p-8">
              <h3 className="text-2xl font-black text-slate-900">Why students use NeverMiss</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 text-sm text-slate-700">
                <p>• One place for all opportunities from multiple channels.</p>
                <p>• Clear categories and status workflow reduce confusion.</p>
                <p>• Fast filters make finding specific opportunities easy.</p>
                <p>• Deadline countdowns help avoid late applications.</p>
              </div>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-6 py-16">
            <div
              className="rounded-3xl bg-gradient-to-r from-yellow-400 to-yellow-300 text-slate-900 p-10 shadow-2xl shadow-yellow-200"
              style={{ transform: `translateY(${scrollY * 0.04}px)` }}
            >
              <h3 className="text-3xl font-black">Built for students who get opportunities from everywhere</h3>
              <p className="mt-3 text-yellow-900/80 max-w-3xl font-medium">
                No more scrolling through endless chats and emails to find one link. Keep everything in one place and stay ahead of deadlines.
              </p>
              <button
                onClick={() => setShowLanding(false)}
                className="mt-6 px-6 py-3 rounded-xl bg-white text-yellow-700 font-black hover:bg-yellow-50"
              >
                Open NeverMiss Dashboard
              </button>
            </div>
          </section>
        </main>

        <footer className="bg-black text-white mt-12">
          <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="NeverMiss" className="w-14 h-14 rounded-xl object-contain bg-white p-1.5 border border-slate-200 shadow-lg shadow-black/20" />
              <p className="font-bold">NeverMiss</p>
            </div>
            <div className="flex gap-6 text-sm">
              <a href="#" className="text-white hover:text-slate-300">Home</a>
              <a href="#" className="text-white hover:text-slate-300">Features</a>
              <a href="#" className="text-white hover:text-slate-300">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-yellow-50/40 text-slate-900 overflow-x-hidden">
      <div className="fixed -top-24 -right-20 w-[24rem] h-[24rem] rounded-full bg-yellow-300/25 blur-3xl pointer-events-none" />
      <div className="fixed top-80 -left-24 w-80 h-80 rounded-full bg-blue-200/20 blur-3xl pointer-events-none" />
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col p-6 gap-8 fixed h-full z-10">
        <div className="flex items-center gap-3 px-2">
          <img src="/logo.png" alt="NeverMiss" className="w-16 h-16 rounded-2xl object-contain bg-white p-1.5 border border-blue-100 shadow-xl shadow-blue-200/60" />
          <span className="text-2xl font-black tracking-tighter text-slate-900">NeverMiss</span>
        </div>

        <nav className="flex flex-col gap-1">
          <SidebarItem icon={LayoutDashboard} label="Dashboard"      active={activePage === 'dashboard'}      onClick={() => setActivePage('dashboard')} />
          <SidebarItem icon={Briefcase}       label="Opportunities"  active={activePage === 'opportunities'}  onClick={() => setActivePage('opportunities')} />
          <SidebarItem icon={Clock}           label="Deadlines"      active={activePage === 'deadlines'}      onClick={() => setActivePage('deadlines')} />
          <SidebarItem icon={Bookmark}        label="Saved Links"    active={activePage === 'saved'}          onClick={() => setActivePage('saved')} />
          <SidebarItem icon={AlertCircle}  label="Notifications"  active={activePage === 'notifications'}  onClick={() => setActivePage('notifications')} />
          <SidebarItem icon={Settings}        label="Profile & Preferences"       active={activePage === 'settings'}       onClick={() => setActivePage('settings')} />
        </nav>

        <div className="mt-auto">
          <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 p-4 rounded-2xl text-slate-900 shadow-xl shadow-yellow-100">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Pro Plan</p>
            <p className="text-sm font-bold mb-3">Get 2x more opportunities</p>
            <button className="w-full py-2 bg-white text-yellow-700 text-xs font-black rounded-lg hover:bg-yellow-50 transition-colors">
              UPGRADE
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 relative z-10">
        {/* Top Nav */}
        <header className="flex items-center justify-between mb-10">
          <div className="relative w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by company or role..." 
              className="w-full pl-12 pr-12 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={(e) => setSearchQuery(e.target.value.trim())}
            />
            {isSearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="animate-spin text-blue-500" size={18} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCapture(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              <Plus size={16} />
              Capture Opportunity
            </button>

            <div className="flex items-center gap-6 ml-2">
              <div className="relative">
                <button
                  onClick={() => setShowTopNotifications(prev => !prev)}
                  className="relative p-2 text-slate-500 hover:bg-white hover:text-slate-900 rounded-xl transition-all border border-transparent hover:border-slate-100"
                  title="Top deadline notifications"
                >
                  <img src="/notification-bell.png" alt="Notifications" className="w-6 h-6" />
                  {topDeadlineNotifications.length > 0 && (
                    <span className="absolute -top-1 right-1 min-w-4 h-4 px-1 bg-yellow-500 text-slate-900 text-[10px] rounded-full border-2 border-white flex items-center justify-center">
                      {topDeadlineNotifications.length}
                    </span>
                  )}
                </button>

                {showTopNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">Top Deadline Alerts</p>
                      <button
                        onClick={() => {
                          setActivePage('notifications');
                          setShowTopNotifications(false);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        View all
                      </button>
                    </div>

                    {topDeadlineNotifications.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">No upcoming deadlines.</div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto">
                        {topDeadlineNotifications.map((opp) => (
                          <button
                            key={opp.id}
                            onClick={() => {
                              setActivePage('deadlines');
                              setShowTopNotifications(false);
                            }}
                            className="w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
                          >
                            <p className="text-sm font-semibold text-slate-900 truncate">{opp.company} — {opp.title}</p>
                            <div className="mt-1 flex items-center justify-between text-xs">
                              <span className="text-slate-500">{opp.deadline}</span>
                              <span className="font-bold text-yellow-700">{daysRemainingVerbose(opp.deadlineRaw)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-slate-900">{authUser.name}</p>
                  <p className="text-xs text-slate-500 font-medium">{authUser.email}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-white shadow-sm overflow-hidden">
                  <img 
                    src="https://picsum.photos/seed/student/100/100" 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <button
                  onClick={handleLogout}
                  className="text-xs font-bold text-slate-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* ── Page Router ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >

          {/* ══════════════ DASHBOARD ══════════════ */}
          {activePage === 'dashboard' && (<>

            {/* API error banner */}
            {apiError && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl text-sm flex items-start gap-3">
                <span className="font-bold shrink-0">⚠ Backend Error:</span>
                <span>{apiError}</span>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <StatCard label="Total Opportunities" value={isLoadingOpps ? '…' : String(opportunities.length)} colorClass="text-blue-600" />
              <StatCard label="Applied" value={isLoadingOpps ? '…' : String(opportunities.filter(o => o.status === 'Applied').length)} colorClass="text-blue-600" />
              <StatCard label="Not Applied" value={isLoadingOpps ? '…' : String(opportunities.filter(o => o.status === 'Not Applied').length).padStart(2,'0')} colorClass="text-yellow-700" />
              <StatCard label="Captured" value={isLoadingOpps ? '…' : String(opportunities.length)} colorClass="text-yellow-700" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Upcoming Deadlines */}
              <section className="xl:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-slate-900">Upcoming Deadlines</h2>
                  <button onClick={() => setActivePage('deadlines')} className="text-blue-600 text-sm font-bold hover:underline">View all</button>
                </div>
                <div className="flex flex-col">
                  {isLoadingOpps ? (
                    <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
                  ) : filteredOpportunities.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <p className="font-medium">No opportunities yet.</p>
                      <button onClick={() => setShowCapture(true)} className="mt-3 text-blue-600 font-bold hover:underline text-sm">+ Capture your first one</button>
                    </div>
                  ) : (
                    filteredOpportunities.slice(0, 4).map(opp => (
                      <DeadlineRow key={opp.id} opp={opp} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                    ))
                  )}
                </div>
              </section>

              {/* Quick Filters + Status Overview */}
              <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Quick Filters</h2>
                  <Filter size={18} className="text-slate-400" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Opportunities', page: 'opportunities' as Page },
                    { label: 'Deadlines',     page: 'deadlines'     as Page },
                    { label: 'Saved Links',   page: 'saved'         as Page },
                    { label: 'Notifications', page: 'notifications' as Page },
                  ].map(f => (
                    <button key={f.label} onClick={() => setActivePage(f.page)}
                      className="px-4 py-2 bg-slate-50 text-slate-600 text-xs font-bold rounded-full border border-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100 transition-all">
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="mt-8">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Status Overview</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Applied</span>
                      <span className="font-bold text-blue-600">{opportunities.filter(o => o.status === 'Applied').length}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: opportunities.length ? `${(opportunities.filter(o=>o.status==='Applied').length/opportunities.length)*100}%` : '0%' }} />
                    </div>
                    <div className="flex justify-between items-center text-sm mt-2">
                      <span className="text-slate-600">Not Applied</span>
                      <span className="font-bold text-yellow-700">{opportunities.filter(o => o.status === 'Not Applied').length}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-yellow-400 h-2 rounded-full transition-all" style={{ width: opportunities.length ? `${(opportunities.filter(o=>o.status==='Not Applied').length/opportunities.length)*100}%` : '0%' }} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Opportunity Cards Feed */}
              <section className="xl:col-span-3">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">All Opportunities</h2>
                  <button onClick={() => setActivePage('opportunities')} className="text-blue-600 text-sm font-bold hover:underline">View table →</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {isLoadingOpps ? (
                    <div className="col-span-4 flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
                  ) : filteredOpportunities.length === 0 ? (
                    <div className="col-span-4 text-center py-12 text-slate-400">
                      <p className="text-lg font-medium mb-2">Nothing captured yet</p>
                      <button onClick={() => setShowCapture(true)} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100">+ Capture Opportunity</button>
                    </div>
                  ) : (
                    filteredOpportunities.map(opp => (
                      <OpportunityCard key={opp.id} opp={opp} onDeepDive={handleDeepDive} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                    ))
                  )}
                </div>
              </section>
            </div>
          </>)}

          {/* ══════════════ OPPORTUNITIES TABLE ══════════════ */}
          {activePage === 'opportunities' && (
            <div>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-black text-slate-900">Opportunities</h1>
                  <p className="text-slate-500 mt-1">All captured opportunities — {filteredOpportunities.length} shown</p>
                </div>
                <button onClick={() => setShowCapture(true)} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100">
                  <Plus size={16} /> Add New
                </button>
              </div>
              <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as 'All' | Opportunity['type'])}
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700"
                >
                  <option value="All">All Categories</option>
                  {CATEGORY_OPTIONS.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={deadlineBeforeFilter}
                  onChange={(e) => setDeadlineBeforeFilter(e.target.value)}
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700"
                />
                <button
                  onClick={() => { setCategoryFilter('All'); setDeadlineBeforeFilter(''); setSearchQuery(''); }}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200"
                >
                  Clear Filters
                </button>
              </div>
              {apiError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl text-sm">{apiError}</div>}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Company</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Role</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Category</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Deadline</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Remaining</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Source</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Status</th>
                      <th className="text-left px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingOpps ? (
                      <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="animate-spin text-blue-500 mx-auto" size={36} /></td></tr>
                    ) : filteredOpportunities.length === 0 ? (
                      <tr><td colSpan={8} className="py-16 text-center text-slate-400">No opportunities for this filter. <button onClick={() => setShowCapture(true)} className="text-blue-600 font-bold hover:underline">Capture one</button></td></tr>
                    ) : (
                      filteredOpportunities.map((opp, i) => (
                        <tr key={opp.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-6 py-4 font-semibold text-slate-900">{opp.company}</td>
                          <td className="px-6 py-4 text-slate-700">{opp.title}</td>
                          <td className="px-6 py-4 text-slate-600 text-xs font-bold">{opp.type}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
                              <Clock size={13} className="text-yellow-500" />{opp.deadline}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-yellow-700">{daysRemainingLabel(opp.deadlineRaw)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              opp.source === 'LinkedIn' ? 'bg-blue-50 text-blue-700' :
                              opp.source === 'WhatsApp' ? 'bg-green-50 text-green-700' :
                              opp.source === 'Email'    ? 'bg-yellow-50 text-yellow-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>{opp.source}</span>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={opp.status ?? 'Not Applied'}
                              onChange={(e) => handleStatusChange(opp.id, e.target.value as NonNullable<Opportunity['status']>)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700"
                            >
                              {STATUS_OPTIONS.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {opp.link && (
                                <a href={opp.link} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Open link">
                                  <ExternalLink size={15} />
                                </a>
                              )}
                              <button onClick={() => handleDeepDive(opp)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="AI Deep Dive">
                                <BrainCircuit size={15} />
                              </button>
                              <button onClick={() => handleDelete(opp.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                <X size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════ DEADLINES ══════════════ */}
          {activePage === 'deadlines' && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Deadlines</h1>
                <p className="text-slate-500 mt-1">Stay ahead — all deadlines at a glance</p>
              </div>
              {apiError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl text-sm">{apiError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-red-600">{opportunities.filter(o => o.status === 'Not Applied').length}</p>
                  <p className="text-sm font-semibold text-red-500 mt-1">Still Pending</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-yellow-700">{opportunities.length}</p>
                  <p className="text-sm font-semibold text-yellow-700 mt-1">Total Captured</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-blue-600">{opportunities.filter(o => o.status === 'Applied').length}</p>
                  <p className="text-sm font-semibold text-blue-500 mt-1">Applied ✓</p>
                </div>
              </div>
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-50">
                  <h2 className="font-bold text-slate-900">All Opportunities — Sorted by Deadline</h2>
                </div>
                <div className="flex flex-col">
                  {isLoadingOpps ? (
                    <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-blue-500" size={36} /></div>
                  ) : opportunities.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">No opportunities yet.</div>
                  ) : (
                    [...filteredOpportunities]
                      .sort((a, b) => (a.deadlineRaw ?? '9999-99-99').localeCompare(b.deadlineRaw ?? '9999-99-99'))
                      .map(opp => (
                        <DeadlineRow key={opp.id} opp={opp} onStatusChange={handleStatusChange} onDelete={handleDelete} />
                      ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ SAVED LINKS ══════════════ */}
          {activePage === 'saved' && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Saved Links</h1>
                <p className="text-slate-500 mt-1">Opportunities with application links — {opportunities.filter(o => o.link).length} saved</p>
              </div>
              {apiError && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl text-sm">{apiError}</div>}
              {isLoadingOpps ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {opportunities.filter(o => o.link).length === 0 ? (
                    <div className="col-span-3 text-center py-20 text-slate-400">
                      <Bookmark size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">No saved links yet</p>
                      <button onClick={() => setShowCapture(true)} className="mt-4 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">+ Capture with a Link</button>
                    </div>
                  ) : (
                    opportunities.filter(o => o.link).map(opp => (
                      <motion.div key={opp.id} whileHover={{ y: -3 }}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            opp.source === 'LinkedIn' ? 'bg-blue-50 text-blue-700' :
                            opp.source === 'WhatsApp' ? 'bg-green-50 text-green-700' :
                            'bg-yellow-50 text-yellow-700'
                          }`}>{opp.source}</span>
                          <button onClick={() => handleDelete(opp.id)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={15} /></button>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{opp.title}</h4>
                          <p className="text-sm text-blue-600 font-medium">{opp.company}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock size={12} />{opp.deadline}
                        </div>
                        <div className="mt-auto pt-3 flex gap-2">
                          <a href={opp.link!} target="_blank" rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors">
                            <ExternalLink size={13} /> Open Link
                          </a>
                          <select
                            value={opp.status ?? 'Not Applied'}
                            onChange={(e) => handleStatusChange(opp.id, e.target.value as NonNullable<Opportunity['status']>)}
                            className="flex-1 py-2.5 px-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700"
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════════ NOTIFICATIONS ══════════════ */}
          {activePage === 'notifications' && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Notifications</h1>
                <p className="text-slate-500 mt-1">Deadline alerts and application reminders</p>
              </div>
              <div className="flex flex-col gap-4">
                {isLoadingOpps ? (
                  <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
                ) : opportunities.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">No notifications yet</p>
                  </div>
                ) : (
                  opportunities.map((opp, i) => {
                    const isApplied = opp.status === 'Applied';
                    const bg   = isApplied ? 'bg-blue-50 border-blue-100' : i < 3 ? 'bg-yellow-50 border-yellow-100' : 'bg-white border-slate-100';
                    const tag  = isApplied ? 'Applied' : i < 3 ? 'Action Needed' : 'Upcoming';
                    const tagColor = isApplied ? 'text-blue-600 bg-blue-100' : i < 3 ? 'text-yellow-700 bg-yellow-100' : 'text-slate-500 bg-slate-100';
                    return (
                      <motion.div key={opp.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        className={`flex items-center justify-between p-5 rounded-2xl border ${bg}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: isApplied ? '#dbeafe' : '#fef3c7' }}>
                            {isApplied ? (
                              <CheckCircle size={24} className="text-green-600 stroke-[1.5]" />
                            ) : (
                              <img src="/notification-bell.png" alt="Pending" className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{opp.company} — {opp.title}</p>
                            <p className="text-sm text-slate-500">Deadline: <span className="font-medium">{opp.deadline}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-3 py-1 rounded-full ${tagColor}`}>{tag}</span>
                          {!isApplied && (
                            <button onClick={() => handleStatusChange(opp.id, 'Applied')}
                              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors">
                              Mark Applied
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ══════════════ SETTINGS ══════════════ */}
          {activePage === 'settings' && (
            <div>
              <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-900">Profile Info & Preferences</h1>
                <p className="text-slate-500 mt-1">Manage your account details and personal dashboard preferences</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-7">
                  <h2 className="text-lg font-bold text-slate-900 mb-5">👤 Profile Information</h2>
                  <div className="space-y-4 text-sm">
                    {[
                      { label: 'Name', value: authUser?.name || 'NeverMiss User' },
                      { label: 'Email', value: authUser?.email || 'Not available' },
                      { label: 'Role', value: 'Student' },
                      { label: 'Workspace', value: 'Opportunity Tracker' },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center py-2 border-b border-slate-50">
                        <span className="text-slate-500 font-medium">{row.label}</span>
                        <span className="text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg text-xs font-semibold">{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-xs text-slate-400">Profile information is linked to your NeverMiss account.</p>
                </div>
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-7">
                  <h2 className="text-lg font-bold text-slate-900 mb-5">⚙ Preferences</h2>
                  <div className="space-y-3 text-sm">
                    {[
                      { label: 'Deadline alerts', value: 'Enabled' },
                      { label: 'Top notifications', value: 'Show nearest 3' },
                      { label: 'Default status', value: 'Not Applied' },
                      { label: 'Preferred view', value: 'Dashboard' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-50">
                        <span className="text-slate-600">{item.label}</span>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2 bg-gradient-to-r from-yellow-100 to-blue-100 border border-yellow-200 rounded-3xl p-7">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">🎯 Opportunity Preferences</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">Priority Category</p>
                      <p className="text-slate-900 font-bold">Internships & Hackathons</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">Reminder Style</p>
                      <p className="text-slate-900 font-bold">Days-left countdown</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 border border-slate-100">
                      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">Current Total</p>
                      <p className="text-slate-900 font-bold">{opportunities.length} opportunities tracked</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={() => setActivePage('dashboard')}
                      className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      Go to Dashboard
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-5 py-2.5 bg-white text-slate-700 text-sm font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          </motion.div>
        </AnimatePresence>
      </main>

      {/* Deep Dive Modal */}
      <AnimatePresence>
        {selectedOpp && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <BrainCircuit size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">AI Deep Dive</h2>
                    <p className="text-sm text-slate-500">{selectedOpp.company} • {selectedOpp.title}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedOpp(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto">
                {isDeepDiving ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 size={48} className="animate-spin text-blue-600" />
                    <p className="text-slate-500 font-medium animate-pulse">Thinking deeply with Gemini Pro...</p>
                  </div>
                ) : (
                  <div className="prose prose-slate max-w-none">
                    <ReactMarkdown>{deepDiveResult || ''}</ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Smart Capture Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showCapture && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Sparkles size={22} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Capture Opportunity</h2>
                  </div>
                  <button
                    onClick={() => {
                      setShowCapture(false);
                      setCaptureText('');
                      setExtractedData(null);
                      setCaptureError(null);
                      setManualForm(emptyManual);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <X size={22} />
                  </button>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => { setCaptureMode('extract'); setExtractedData(null); setCaptureError(null); }}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      captureMode === 'extract'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Smart Extract
                  </button>
                  <button
                    onClick={() => { setCaptureMode('manual'); setCaptureError(null); }}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                      captureMode === 'manual'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Fill Manually
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex flex-col gap-5">

                {captureMode === 'extract' && (<>
                  <p className="text-sm text-slate-500">Paste a job posting, WhatsApp message, email, or just a URL — details will be extracted automatically.</p>
                  <textarea
                    rows={6}
                    placeholder="e.g. 🚀 Google is hiring Software Engineer Interns! Apply by March 31. Link: https://careers.google.com/..."
                    className="w-full p-4 border border-slate-200 rounded-2xl text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={captureText}
                    onChange={e => setCaptureText(e.target.value)}
                  />

                  {captureError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{captureError}</p>
                  )}

                  {extractedData && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Extracted — edit if needed</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {[
                          { label: 'Company',  key: 'company'  },
                          { label: 'Role',     key: 'role'     },
                          { label: 'Deadline (YYYY-MM-DD)', key: 'deadline' },
                          { label: 'Source',   key: 'source'   },
                        ].map(({ label, key }) => (
                          <div key={key}>
                            <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
                            <input
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 bg-white"
                              value={(extractedData as any)[key] ?? ''}
                              onChange={e => setExtractedData(prev => ({ ...prev, [key]: e.target.value }))}
                            />
                          </div>
                        ))}
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-1">Category</p>
                          <select
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 bg-white"
                            value={(extractedData.category as Opportunity['type']) ?? 'Internship'}
                            onChange={e => setExtractedData(prev => ({ ...prev, category: e.target.value as Opportunity['type'] }))}
                          >
                            {CATEGORY_OPTIONS.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 mb-1">Status</p>
                          <select
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 bg-white"
                            value={(extractedData.status as NonNullable<Opportunity['status']>) ?? 'Not Applied'}
                            onChange={e => setExtractedData(prev => ({ ...prev, status: e.target.value as NonNullable<Opportunity['status']> }))}
                          >
                            {STATUS_OPTIONS.map(status => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs font-semibold text-slate-400 mb-1">Application Link</p>
                          <input
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 bg-white"
                            value={extractedData.link ?? ''}
                            onChange={e => setExtractedData(prev => ({ ...prev, link: e.target.value }))}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>)}

                {captureMode === 'manual' && (
                  <div className="flex flex-col gap-5">
                    <p className="text-sm text-slate-500">Fill in the details directly — all fields except Company and Role are optional.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Company <span className="text-red-400">*</span></label>
                        <input
                          placeholder="e.g. Google"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 transition-all"
                          value={manualForm.company}
                          onChange={e => setManualForm(p => ({ ...p, company: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Role / Position <span className="text-red-400">*</span></label>
                        <input
                          placeholder="e.g. Software Engineer Intern"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 transition-all"
                          value={manualForm.role}
                          onChange={e => setManualForm(p => ({ ...p, role: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Deadline</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 transition-all"
                          value={manualForm.deadline}
                          onChange={e => setManualForm(p => ({ ...p, deadline: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Source</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 bg-white transition-all"
                          value={manualForm.source}
                          onChange={e => setManualForm(p => ({ ...p, source: e.target.value as Opportunity['source'] }))}
                        >
                          {SOURCE_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Category</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 bg-white transition-all"
                          value={manualForm.category}
                          onChange={e => setManualForm(p => ({ ...p, category: e.target.value as Opportunity['type'] }))}
                        >
                          {CATEGORY_OPTIONS.map(category => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Status</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 bg-white transition-all"
                          value={manualForm.status}
                          onChange={e => setManualForm(p => ({ ...p, status: e.target.value as NonNullable<Opportunity['status']> }))}
                        >
                          {STATUS_OPTIONS.map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-slate-400 mb-1 block">Application Link</label>
                        <input
                          type="url"
                          placeholder="https://"
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm text-slate-800 transition-all"
                          value={manualForm.link}
                          onChange={e => setManualForm(p => ({ ...p, link: e.target.value }))}
                        />
                      </div>
                    </div>
                    {captureError && (
                      <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{captureError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCapture(false);
                    setCaptureText('');
                    setExtractedData(null);
                    setCaptureError(null);
                    setManualForm(emptyManual);
                  }}
                  className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>

                {captureMode === 'extract' ? (
                  !extractedData ? (
                    <button
                      onClick={handleExtract}
                      disabled={isExtracting || !captureText.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 disabled:opacity-50"
                    >
                      {isExtracting ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                      Extract Details
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveExtracted}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                      Save to Dashboard
                    </button>
                  )
                ) : (
                  <button
                    onClick={handleSaveManual}
                    disabled={isSaving || !manualForm.company.trim() || !manualForm.role.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                    Save Opportunity
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
