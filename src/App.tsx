import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area as RechartsArea
} from 'recharts';
import { 
  LayoutDashboard, ClipboardList, Settings, Users, LogOut, 
  Plus, Search, Filter, Save, Trash2, Edit2, AlertCircle, 
  CheckCircle2, Clock, MapPin, Building2, User, Key, Lock, Shield, Eye, EyeOff,
  Sun, Moon, ChevronRight, ChevronDown, Menu, X, Bell, Truck, Wrench, WifiOff, TrendingUp, Calendar,
  MessageSquare, Send, RefreshCw, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays } from 'date-fns';

import { 
  collection, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  setDoc,
  getDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError, testConnection } from './lib/firebase';

// --- Local UI Components ---
const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }>(
  ({ className, variant, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";

const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className}`} {...props} />
);
const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
);
const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`} {...props} />
);
const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-muted-foreground ${className}`} {...props} />
);
const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`p-6 pt-0 ${className}`} {...props} />
);
const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex items-center p-6 pt-0 ${className}`} {...props} />
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

// --- Types ---
type UserRole = 'Gerente' | 'Encarregado' | 'Supervisor' | 'Analista Logístico' | 'ADM';

interface UserData {
  id: string;
  name: string;
  login: string;
  password?: string;
  role: UserRole;
  area: string;
  permissionLevel: 'Intermediário' | 'Master' | 'Básico';
}

interface RecordComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface AppNotification {
  id: string;
  recipientId: string;
  recipientLogin: string;
  senderId: string;
  senderName: string;
  commentId: string;
  recordId: string;
  text: string;
  isRead: boolean;
  timestamp: number;
}

interface ShiftRecord {
  id: string;
  date: string;
  userId: string;
  userName: string;
  area: string;      // Represents Operation (e.g., Óleo, Etanol)
  regional: string;  // Represents Regional (e.g., MT, MS)
  tsId: string;      // Represents TS (Terminal/Sistema) ID (e.g., T1, T2)
  unidade?: string;
  shift: string;
  status: 'normal' | 'alert' | 'critical';
  executionStatus: 'Em andamento' | 'Finalizado';
  description: string;
  timestamp: number;
  comments?: RecordComment[];
}

interface AreaConfig {
  id: string;
  name: string;
}

// --- Constants & Data ---
const AREAS = [
  { id: 'oleo', name: 'Óleo' },
  { id: 'etanol', name: 'Etanol' },
  { id: 'ddgs', name: 'DDGS' },
  { id: 'biomassa', name: 'Biomassa' },
  { id: 'linha-amarela', name: 'Linha Amarela' }
];

const getCurrentShiftName = () => {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 14) return 'Manhã (A)';
  if (hour >= 14 && hour < 22) return 'Tarde (B)';
  return 'Noite (C)';
};

const SUB_AREAS = [
  'MT',
  'MS',
  'MA',
  'BA',
  'Depósito Externo',
  'Comercializadora Rodobras'
];

const CARGOS: UserRole[] = ['Analista Logístico', 'Encarregado', 'Supervisor', 'Gerente', 'ADM'];

const ALL_AREAS = [...AREAS.map(a => a.name), 'Todas'];

const LOGISTICS_SHIFTS = [
  { id: 'T1', name: 'T1: Sinal', color: 'bg-[#5B7AB1]', borderColor: 'border-[#5B7AB1]', textColor: 'text-[#5B7AB1]' },
  { id: 'T2', name: 'T2: Carregamento', color: 'bg-[#5B7AB1]', borderColor: 'border-[#5B7AB1]', textColor: 'text-[#5B7AB1]' },
  { id: 'T3', name: 'T3: Transito', color: 'bg-[#8A96AC]', borderColor: 'border-[#8A96AC]', textColor: 'text-[#8A96AC]' },
  { id: 'T4', name: 'T4: Descarga & Backoffice', color: 'bg-[#EBA83A]', borderColor: 'border-[#EBA83A]', textColor: 'text-[#EBA83A]' }
];

const SHIFTS = [
  { id: 'A', name: 'Turno A' },
  { id: 'B', name: 'Turno B' },
  { id: 'C', name: 'Turno C' }
];

const MOCK_USERS: UserData[] = [
  { id: '1', name: 'Jonathan Felix', login: 'Jonathan.Felix', password: '123', role: 'ADM', area: 'Todas', permissionLevel: 'Master' },
  { id: '2', name: 'Gabriel Amaral', login: 'Gabriel.Amaral', password: '123', role: 'ADM', area: 'Todas', permissionLevel: 'Master' },
  { id: '3', name: 'Carlos Forcina', login: 'Carlos.Forcina', password: '123456', role: 'Gerente', area: 'Todas', permissionLevel: 'Master' },
  { id: '4', name: 'Julio Santos', login: 'Julio.Santos', password: '123456', role: 'Encarregado', area: 'Todas', permissionLevel: 'Master' },
  { id: '5', name: 'Jonathan Pereira', login: 'Jonathan.Pereira', password: '123456', role: 'ADM', area: 'Todas', permissionLevel: 'Master' },
  { id: '6', name: 'Polyana Mota', login: 'Polyana.Mota', password: '123456', role: 'Analista Logístico', area: 'DDGS', permissionLevel: 'Intermediário' },
  { id: '7', name: 'Jacqueline Marques', login: 'Jacqueline.Marques', password: '123456', role: 'Analista Logístico', area: 'DDGS', permissionLevel: 'Intermediário' },
  { id: '8', name: 'Emanuela Veras', login: 'Emanuela.Veras', password: '123456', role: 'Analista Logístico', area: 'DDGS', permissionLevel: 'Intermediário' },
  { id: '9', name: 'Robson Aguiar', login: 'Robson.Aguiar', password: '123456', role: 'Analista Logístico', area: 'DDGS/Etanol', permissionLevel: 'Intermediário' },
  { id: '10', name: 'Ivan Lopes', login: 'Ivan.Lopes', password: '123456', role: 'Analista Logístico', area: 'DDGS', permissionLevel: 'Intermediário' },
  { id: '11', name: 'Celio Rodrigues', login: 'Celio.Rodrigues', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '12', name: 'Allan Brandão', login: 'Allan.Brandão', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '13', name: 'Laura Lys', login: 'Laura.Lys', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '14', name: 'Edjane Vieira', login: 'Edjane.Vieira', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '15', name: 'João Otavio', login: 'João.Otavio', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '16', name: 'Gabriel Magalhães', login: 'Gabriel.Magalhães', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '17', name: 'Rafael Matos', login: 'Rafael.Matos', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '18', name: 'Gabriel Amaral', login: 'Gabriel.Amaral', password: '123456', role: 'Analista Logístico', area: 'Todas', permissionLevel: 'Intermediário' },
  { id: '19', name: 'Tiarles Augusto', login: 'Tiarles.Augusto', password: '123456', role: 'Analista Logístico', area: 'Todas', permissionLevel: 'Intermediário' },
  { id: '20', name: 'Thayane Maira', login: 'Thayane.Maira', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '21', name: 'Junior Quadros', login: 'Junior.Quadros', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '22', name: 'Lucilda Costa', login: 'Lucilda.Costa', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '23', name: 'Dherlin Rocha', login: 'Dherlin.Rocha', password: '123456', role: 'Analista Logístico', area: 'Etanol', permissionLevel: 'Intermediário' },
  { id: '24', name: 'Matheus Sousa', login: 'Matheus.Sousa', password: '123456', role: 'Analista Logístico', area: 'Todas', permissionLevel: 'Intermediário' },
  { id: '25', name: 'Patricio Seganfredo', login: 'Patricio.Seganfredo', password: '123456', role: 'Analista Logístico', area: 'Todas', permissionLevel: 'Intermediário' },
  { id: '26', name: 'Samara Ferreira', login: 'Samara.Ferreira', password: '123456', role: 'Analista Logístico', area: 'Óleo', permissionLevel: 'Intermediário' },
  { id: '27', name: 'Francimaria Sá', login: 'Francimaria.Sá', password: '123456', role: 'Analista Logístico', area: 'Óleo', permissionLevel: 'Intermediário' }
];

// --- Components ---

const LoginForm = ({ onLogin, usersList }: { onLogin: (u: UserData) => void, usersList: UserData[] }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const foundUser = usersList.find(u => u.login === login);
    if (foundUser && foundUser.password === password) { 
      onLogin(foundUser);
    } else {
      setError('Credenciais inválidas');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F4F9] p-4 font-sans">
      <Card className="w-full max-w-md border-none shadow-2xl bg-white/80 backdrop-blur-md overflow-hidden">
        <div className="h-2 bg-[#EBA83A]" />
        <CardHeader className="space-y-1 text-center py-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-[#2B4C7E] rounded-full flex items-center justify-center">
              <Truck className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-black text-[#2B4C7E] uppercase italic tracking-tighter leading-none">
            TROCA TURNO
          </CardTitle>
          <CardDescription className="text-[#2B4C7E] font-bold opacity-60 uppercase tracking-[0.2em] text-[10px]">
            Torre de Controle
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8 space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Usuário / Login</label>
              <Input 
                value={login} 
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Ex: Ademilson.Almeida"
                className="h-12 bg-[#F1F4F9] border-none rounded-xl px-4 text-xs font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Senha</label>
              <Input 
                type="password"
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 bg-[#F1F4F9] border-none rounded-xl px-4 text-xs font-bold"
              />
            </div>
            {error && <p className="text-[10px] text-red-500 font-bold uppercase text-center">{error}</p>}
            <Button type="submit" className="w-full h-14 bg-[#2B4C7E] hover:bg-[#1A3154] text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]">
              Acessar Painel
            </Button>
          </form>
        </CardContent>
        <CardFooter className="bg-[#2B4C7E]/5 py-4 border-t border-[#2B4C7E]/5">
          <p className="text-[10px] text-center w-full text-slate-400 font-bold uppercase italic tracking-widest">
            Logística & Torre de Controle
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};


const REGIONAL_UNITS_MAP: Record<string, string[]> = {
  'MT': ['Nova Mutum - MT', 'Sinop - MT'],
  'MS': ['Dourados - MS', 'Sidrolândia - MS'],
  'MA': ['Balsas - MA'],
  'BA': ['Luís Eduardo Magalhães - BA']
};

const UNIDADES_REGISTRO = [
  'Nova Mutum - MT',
  'Sinop - MT',
  'Dourados - MS',
  'Sidrolândia - MS',
  'Balsas - MA',
  'Luís Eduardo Magalhães - BA'
];

interface AuditLog {
  id: string;
  targetUserId: string;
  targetUserName?: string;
  type: string;
  oldValue: string;
  newValue: string;
  description?: string;
  changedById: string;
  changedByName: string;
  timestamp: number;
}

// --- Helper Functions ---
async function createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>) {
  try {
    const id = `LOG-${Date.now().toString(36).toUpperCase()}`;
    await setDoc(doc(db, 'auditLogs', id), {
      ...log,
      id,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

// --- Quill Configuration ---
const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['clean']
  ],
};

const QUILL_FORMATS = [
  'bold', 'italic', 'underline', 'list', 'bullet'
];

export default function App() {
  const [usersList, setUsersList] = useState<UserData[]>([]);
  const [user, setUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('logistica_active_tab') || 'dashboard');
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<{ recordId: string, commentId: string } | null>(null);

  const [selectedArea, setSelectedArea] = useState<string | null>(() => localStorage.getItem('logistica_selected_area'));
  const [selectedRegionals, setSelectedRegionals] = useState<string[]>(() => {
    const saved = localStorage.getItem('logistica_selected_regionals');
    return saved ? JSON.parse(saved) : [];
  });
  const selectedRegional = selectedRegionals.length === 1 ? selectedRegionals[0] : null;
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(() => localStorage.getItem('logistica_selected_shift'));
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  // --- Form State ---
  const [selectedFormUnit, setSelectedFormUnit] = useState('');

  const filteredUnits = useMemo(() => {
    if (selectedRegionals.length === 0) return [];
    
    const units: string[] = [];
    selectedRegionals.forEach(reg => {
      const regUnits = REGIONAL_UNITS_MAP[reg] || [];
      regUnits.forEach(u => {
        if (!units.includes(u)) units.push(u);
      });
    });
    return units.sort();
  }, [selectedRegionals]);

  useEffect(() => {
    if (selectedFormUnit && !filteredUnits.includes(selectedFormUnit)) {
      setSelectedFormUnit('');
    }
  }, [filteredUnits, selectedFormUnit]);

  const isUnitHidden = selectedArea === 'Etanol' && 
    selectedRegionals.length > 0 &&
    selectedRegionals.every(reg => ['Comercializadora Rodobras', 'Depósito Externo'].includes(reg));

  // --- History Filter State ---
  const [historyFilterType, setHistoryFilterType] = useState<'7days' | '30days' | 'custom'>('7days');
  const [customDateRange, setCustomDateRange] = useState({ 
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), 
    end: format(new Date(), 'yyyy-MM-dd') 
  });
  const [appliedFilter, setAppliedFilter] = useState<'today' | '7days' | '30days' | 'custom'>('7days');

  const [operationalKpis, setOperationalKpis] = useState<Record<string, Record<string, number>>>({});
  const [isSyncingKpi, setIsSyncingKpi] = useState(false);

  // --- KPI Update Helper ---
  const handleUpdateOperationalKpi = async (area: string, regional: string, ts: string, label: string, newValue: number) => {
    if (!user) return;
    
    const kpiId = `${area}_${regional}_${ts}`.replace(/\s+/g, '_');
    const docRef = doc(db, 'operationalKpis', kpiId);
    
    const currentValues = operationalKpis[kpiId] || { 'Em Rota': 0, 'Toco': 0, 'Manutenção': 0, 'Sem Sinal': 0 };
    const oldValue = currentValues[label] || 0;
    
    if (oldValue === newValue) return;

    // Optimistic Update
    const newValues = { ...currentValues, [label]: newValue };
    setOperationalKpis(prev => ({ ...prev, [kpiId]: newValues }));
    setIsSyncingKpi(true);
    
    try {
      await setDoc(docRef, {
        id: kpiId,
        area,
        regional,
        tsId: ts,
        values: newValues,
        updatedAt: Date.now(),
        updatedBy: user.name
      });

      // Audit Log
      await createAuditLog({
        targetUserId: 'SYSTEM',
        targetUserName: `Quadro Operacional: ${area}`,
        type: 'KPI_UPDATE',
        oldValue: `${label}: ${oldValue}`,
        newValue: `${label}: ${newValue}`,
        description: `Alteração no quadro operacional - Regional: ${regional} | TS: ${ts} | Campo: ${label}`,
        changedById: user.id,
        changedByName: user.name
      });
      
      showToast('Alteração salva com sucesso!', 'success');
    } catch (error) {
      // Revert optimistic update on error
      setOperationalKpis(prev => ({ ...prev, [kpiId]: currentValues }));
      handleFirestoreError(error, OperationType.UPDATE, `operationalKpis/${kpiId}`);
    } finally {
      setIsSyncingKpi(false);
    }
  };

  // --- Firebase Sync Logic ---
  useEffect(() => {
    let unsubscribeUsers: (() => void) | null = null;
    let unsubscribeRecords: (() => void) | null = null;
    let unsubscribeOperationalKpis: (() => void) | null = null;

    const setupSync = () => {
      // Listen to users
      const qUsers = query(collection(db, 'users'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserData);
        setUsersList(users);
        
        // Seed users if empty (First run)
        if (users.length === 0) {
          MOCK_USERS.forEach(async (u) => {
            await setDoc(doc(db, 'users', u.id), u);
          });
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });

      // Listen to occurrences
      const qRecords = query(collection(db, 'occurrences'), orderBy('timestamp', 'desc'));
      unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
        const recordsData = snapshot.docs.map(doc => doc.data() as ShiftRecord);
        setRecords(recordsData);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'occurrences');
      });

      // Listen to Operational KPIs (Granular)
      const qKpis = query(collection(db, 'operationalKpis'));
      unsubscribeOperationalKpis = onSnapshot(qKpis, (snapshot) => {
        const kpis: Record<string, Record<string, number>> = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          kpis[doc.id] = data.values;
        });
        setOperationalKpis(kpis);

        // Seed initial KPIs if empty
        if (snapshot.docs.length === 0) {
          const initialKpis: Record<string, Record<string, number>> = {
            'Óleo': { 'Em Rota': 12, 'Toco': 8, 'Manutenção': 3, 'Sem Sinal': 2 },
            'Etanol': { 'Em Rota': 15, 'Toco': 6, 'Manutenção': 2, 'Sem Sinal': 1 },
            'DDGS': { 'Em Rota': 22, 'Toco': 10, 'Manutenção': 4, 'Sem Sinal': 5 },
            'Biomassa': { 'Em Rota': 8, 'Toco': 4, 'Manutenção': 1, 'Sem Sinal': 0 },
            'Linha Amarela': { 'Em Rota': 30, 'Toco': 15, 'Manutenção': 8, 'Sem Sinal': 3 }
          };

          Object.entries(initialKpis).forEach(([area, values]) => {
            // Seed for MT and T1 as a starting point
            const kpiId = `${area}_MT_T1`.replace(/\s+/g, '_');
            setDoc(doc(db, 'operationalKpis', kpiId), {
              id: kpiId,
              area,
              regional: 'MT',
              tsId: 'T1',
              values,
              updatedAt: Date.now(),
              updatedBy: 'Sistema'
            });
          });
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, 'operationalKpis'));
    };

    // Start sync immediately regardless of Firebase Auth state
    // This allows the app to work with the internal login system
    setupSync();

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log('Firebase Auth user detected');
      } else {
        // Only try to sign in if enabled. If it fails, the app still works due to public rules
        signInAnonymously(auth).catch(err => {
          if (err.code !== 'auth/admin-restricted-operation') {
            console.error('Auth error:', err);
          } else {
            console.warn('Anonymous Auth is disabled in Firebase Console. Using public rules fallback.');
          }
        });
      }
    });

    // Handle session persistence using Firestore (independent of Firebase Auth)
    const savedUserId = localStorage.getItem('logistica_user_id_v1');
    if (savedUserId && !user) {
      getDoc(doc(db, 'users', savedUserId)).then(snap => {
        if (snap.exists()) setUser(snap.data() as UserData);
      }).catch(err => console.warn('Persistence restore error:', err));
    }

    testConnection();
 
     return () => {
       unsubscribeAuth();
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribeRecords) unsubscribeRecords();
      if (unsubscribeOperationalKpis) unsubscribeOperationalKpis();
    };
  }, []);

  // Separate useEffect for notifications to handle login state changes
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    console.log('Setting up notifications listener for user:', user.login);
    const qNotifs = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(qNotifs, (snapshot) => {
      const allNotifs = snapshot.docs.map(doc => doc.data() as AppNotification);
      const myNotifs = allNotifs.filter(n => n.recipientId === user.id);
      console.log(`Received ${allNotifs.length} total notifications, ${myNotifs.length} for user`);
      setNotifications(myNotifs);
    }, (err) => {
      console.error('Notification listener error:', err);
      handleFirestoreError(err, OperationType.GET, 'notifications');
    });

    return () => unsubscribe();
  }, [user?.id]);


  // --- Data Consistency & Remanagement Migration ---
  useEffect(() => {
    // 1. Cleanup selectedRegionals if it contains obsolete 'LEM'
    if (selectedRegionals.includes('LEM')) {
      setSelectedRegionals(prev => prev.filter(r => r !== 'LEM'));
    }

    // 2. Data Consistency Remanagement (Master users only)
    if (!user || user.permissionLevel !== 'Master' || records.length === 0) return;
    
    const recordsToCorrect = records.filter(r => {
      // Skip if it doesn't have a unit (e.g. some Etanol regionals)
      if (!r.unidade) {
        // Special case: old LEM records must be migrated even if they had no unit (unlikely but safe)
        return r.regional === 'LEM';
      }

      // Check legacy LEM regional
      if (r.regional === 'LEM') return true;

      // Check legacy unit name
      if (r.unidade.includes('Eduardo Magalhães') && !r.unidade.startsWith('Luís')) return true;

      // Find correct regional for the unit
      let correctRegional: string | null = null;
      for (const [reg, units] of Object.entries(REGIONAL_UNITS_MAP)) {
        if (units.includes(r.unidade!)) {
          correctRegional = reg;
          break;
        }
      }

      // If mapped to a specific regional but current is different
      if (correctRegional && r.regional !== correctRegional) return true;

      // Check state code suffixes as secondary validation
      const upperUnid = r.unidade.toUpperCase();
      if (upperUnid.endsWith(' - BA') && r.regional !== 'BA') return true;
      if (upperUnid.endsWith(' - MA') && r.regional !== 'MA') return true;
      if (upperUnid.endsWith(' - MT') && r.regional !== 'MT') return true;
      if (upperUnid.endsWith(' - MS') && r.regional !== 'MS') return true;

      return false;
    });

    if (recordsToCorrect.length > 0) {
      recordsToCorrect.forEach(async (r) => {
        try {
          let targetRegional = r.regional;
          let targetUnidade = r.unidade || '';

          // Fix unit name if it's the old version
          if (targetUnidade.includes('Eduardo Magalhães') && !targetUnidade.startsWith('Luís')) {
            targetUnidade = 'Luís Eduardo Magalhães - BA';
          }

          // Determine correct regional
          if (r.regional === 'LEM') {
            targetRegional = 'BA';
            if (!targetUnidade) targetUnidade = 'Luís Eduardo Magalhães - BA';
          } else if (targetUnidade) {
            // Priority 1: Map check
            let foundReg = false;
            for (const [reg, units] of Object.entries(REGIONAL_UNITS_MAP)) {
              if (units.includes(targetUnidade)) {
                targetRegional = reg;
                foundReg = true;
                break;
              }
            }
            // Priority 2: Suffix check if not found in map
            if (!foundReg) {
              const upperUnid = targetUnidade.toUpperCase();
              if (upperUnid.endsWith(' - BA')) targetRegional = 'BA';
              else if (upperUnid.endsWith(' - MA')) targetRegional = 'MA';
              else if (upperUnid.endsWith(' - MT')) targetRegional = 'MT';
              else if (upperUnid.endsWith(' - MS')) targetRegional = 'MS';
            }
          }

          // Avoid infinite loops if nothing changed
          if (r.regional === targetRegional && r.unidade === targetUnidade) return;

          await updateDoc(doc(db, 'occurrences', r.id), {
            regional: targetRegional,
            unidade: targetUnidade,
            updatedAt: Date.now()
          });
          
          await createAuditLog({
            type: 'REMANEJAMENTO_CONSISTENCIA',
            targetUserId: r.id,
            targetUserName: `${r.tsId} - ${r.unidade || 'N/A'}`,
            oldValue: `Reg: ${r.regional} | Unid: ${r.unidade || 'N/A'}`,
            newValue: `Reg: ${targetRegional} | Unid: ${targetUnidade} (Ajuste Automático)`,
            changedById: 'SYSTEM',
            changedByName: 'Migration Service'
          });
        } catch (err) {
          console.error(`Migration failed for record ${r.id}:`, err);
        }
      });
    }
  }, [records, user, selectedRegionals]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('logistica_user_id_v1', user.id);
    } else {
      localStorage.removeItem('logistica_user_id_v1');
    }
  }, [user]);

  const [editingKpi, setEditingKpi] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<Omit<UserData, 'id'>>({
    name: '',
    login: '',
    password: '',
    role: 'Analista Logístico',
    area: '',
    permissionLevel: 'Intermediário'
  });
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserData | null>(null);
  const [changingPermissionUser, setChangingPermissionUser] = useState<UserData | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // --- Persistence & Feedback ---
  const [toast, setToast] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast({ type: null, message: '' }), 4000);
  };

  const handleUpdateUsersList = async (updatedUser: UserData) => {
    try {
      const oldUser = usersList.find(u => u.id === updatedUser.id);
      await setDoc(doc(db, 'users', updatedUser.id), updatedUser);
      
      // Log Audit with detailed changes
      if (oldUser) {
        const changes: string[] = [];
        const fieldsToCompare: (keyof UserData)[] = ['name', 'login', 'role', 'area', 'permissionLevel'];
        
        fieldsToCompare.forEach(field => {
          if (oldUser[field] !== updatedUser[field]) {
            changes.push(`${field}: "${oldUser[field]}" -> "${updatedUser[field]}"`);
          }
        });

        if (changes.length > 0) {
          await createAuditLog({
            targetUserId: updatedUser.id,
            targetUserName: updatedUser.name,
            type: 'UPDATE_DATA',
            oldValue: JSON.stringify(oldUser),
            newValue: JSON.stringify(updatedUser),
            description: `Campos alterados: ${changes.join(' | ')}`,
            changedById: user!.id,
            changedByName: user!.name
          });
        }
      }

      if (user?.id === updatedUser.id) {
        setUser(updatedUser);
      }
      showToast(`Alterações em ${updatedUser.name} salvas com sucesso!`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${updatedUser.id}`);
    }
  };

  const currentUsersList = useMemo(() => {
    return [...usersList].filter(u => 
      u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      u.login.toLowerCase().includes(userSearchQuery.toLowerCase())
    );
  }, [usersList, userSearchQuery]);

  // --- Password Change State ---
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus({ type: null, message: '' });

    if (!user) return;

    if (passwordForm.current !== user.password) {
      setPasswordStatus({ type: 'error', message: 'A senha atual está incorreta.' });
      return;
    }

    if (passwordForm.new.length < 6) {
      setPasswordStatus({ type: 'error', message: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordStatus({ type: 'error', message: 'A confirmação da senha não confere.' });
      return;
    }

    try {
      const updatedUser = { ...user, password: passwordForm.new };
      await setDoc(doc(db, 'users', user.id), updatedUser);
      
      await createAuditLog({
        targetUserId: user.id,
        targetUserName: user.name,
        type: 'PASSWORD_CHANGE',
        oldValue: 'HIDDEN',
        newValue: 'HIDDEN',
        changedById: user.id,
        changedByName: user.name
      });

      setUser(updatedUser as UserData);
      showToast('Senha atualizada com sucesso!');
      setPasswordStatus({ type: 'success', message: 'Senha alterada com sucesso!' });
      setPasswordForm({ current: '', new: '', confirm: '' });
      setTimeout(() => {
        setIsChangingPassword(false);
        setPasswordStatus({ type: null, message: '' });
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.id}`);
    }
  };

  const currentRegionals = useMemo(() => {
    if (!selectedArea) return [];
    const base = ['MT', 'MS', 'MA', 'BA', 'Depósito Externo'];
    let result = [...base];
    if (selectedArea === 'Biomassa' || selectedArea === 'Linha Amarela') {
      result = result.filter(r => r !== 'Depósito Externo');
    }
    if (selectedArea === 'Etanol' || selectedArea === 'Todas') {
      result.push('Comercializadora Rodobras');
    }
    return result;
  }, [selectedArea]);

  useEffect(() => {
    setShiftInputs({
      'T1': { status: 'normal', description: '' },
      'T2': { status: 'normal', description: '' },
      'T3': { status: 'normal', description: '' },
      'T4': { status: 'normal', description: '' },
    });
    setSelectedFormUnit('');
  }, [selectedArea]);

  useEffect(() => {
    if (!selectedArea) {
      setSelectedRegionals([]);
      setSelectedShiftId(null);
    }
  }, [selectedArea]);

  useEffect(() => {
    if (selectedRegionals.length === 0) {
      setSelectedShiftId(null);
    }
  }, [selectedRegionals]);
  
  const [shiftInputs, setShiftInputs] = useState<{ [key: string]: { status: 'normal' | 'alert' | 'critical', description: string } }>({
    'T1': { status: 'normal', description: '' },
    'T2': { status: 'normal', description: '' },
    'T3': { status: 'normal', description: '' },
    'T4': { status: 'normal', description: '' },
  });

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [tempEditDescription, setTempEditDescription] = useState<string>('');
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  // --- Persistence Logic ---
  useEffect(() => {
    localStorage.setItem('logistica_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedArea) localStorage.setItem('logistica_selected_area', selectedArea);
    else localStorage.removeItem('logistica_selected_area');
  }, [selectedArea]);

  useEffect(() => {
    localStorage.setItem('logistica_selected_regionals', JSON.stringify(selectedRegionals));
  }, [selectedRegionals]);

  useEffect(() => {
    localStorage.setItem('logistica_selected_shift', selectedShiftId || '');
  }, [selectedShiftId]);

  const handleSaveShiftRecord = async (shiftId: string) => {
    try {
      const input = shiftInputs[shiftId];
      
      // Validation: Only require unit if there are units available for selection
      const hasAvailableUnits = filteredUnits.length > 0;
      
      if (hasAvailableUnits && !selectedFormUnit && !isUnitHidden) {
         showToast('Por favor, selecione uma unidade.', 'error');
         return;
       }

      if (!input.description.replace(/<[^>]*>/g, '').trim()) {
        showToast('Por favor, descreva o relato operacional.', 'error');
        return;
      }

      if (!user) {
        showToast('Sessão expirada. Por favor, faça login novamente.', 'error');
        return;
      }

      if (!selectedArea) {
        showToast('Por favor, selecione uma área antes de salvar.', 'error');
        return;
      }

      // Determine the regional based on the selected unit
      let unitRegional = selectedRegionals.length > 0 ? selectedRegionals[0] : '';
      if (selectedFormUnit) {
        for (const [reg, units] of Object.entries(REGIONAL_UNITS_MAP)) {
          if (units.includes(selectedFormUnit)) {
            unitRegional = reg;
            break;
          }
        }
      }

      const docRef = doc(collection(db, 'occurrences'));
      const id = docRef.id;
      
      const newRecord: ShiftRecord = {
        id,
        date: format(new Date(), 'yyyy-MM-dd'),
        userId: user.id,
        userName: user.name,
        area: selectedArea,
        regional: unitRegional || '',
        tsId: shiftId,
        unidade: selectedFormUnit || '',
        shift: LOGISTICS_SHIFTS.find(s => s.id === shiftId)?.name || 'N/A',
        status: input.status,
        executionStatus: 'Em andamento',
        description: input.description,
        timestamp: Date.now()
      };

      await setDoc(docRef, newRecord);
      
      setLastSavedId(newRecord.id);
      setAppliedFilter('7days');
      setHistoryFilterType('7days');
      
      if (unitRegional && !selectedRegionals.includes(unitRegional)) {
        setSelectedRegionals([unitRegional]);
      }

      setShiftInputs(prev => ({
        ...prev,
        [shiftId]: { status: 'normal', description: '' }
      }));
      setSelectedFormUnit('');
      showToast('Ocorrência registrada com sucesso!', 'success');
      
      setTimeout(() => {
        const historyElement = document.getElementById('history-list-container');
        if (historyElement) {
          historyElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        setTimeout(() => setLastSavedId(null), 8000);
      }, 100);
    } catch (err) {
      console.error('Error saving shift record:', err);
      try {
        handleFirestoreError(err, OperationType.WRITE, 'occurrences');
      } catch (richError) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        showToast(`Erro ao salvar: ${errorMessage.substring(0, 50)}...`, 'error');
      }
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleUpdateRecordExecution = async (recordId: string, status: 'Em andamento' | 'Finalizado') => {
    try {
      await updateDoc(doc(db, 'occurrences', recordId), { executionStatus: status });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `occurrences/${recordId}`);
    }
  };

  const handleAddComment = async (recordId: string) => {
    const text = commentInputs[recordId];
    if (!text?.trim() || !user) return;

    const commentId = Date.now().toString(36);
    const newComment: RecordComment = {
      id: commentId,
      userId: user.id,
      userName: user.name,
      text: text.trim(),
      timestamp: Date.now()
    };

    const record = records.find(r => r.id === recordId);
    if (!record) return;

    try {
      await updateDoc(doc(db, 'occurrences', recordId), {
        comments: [...(record.comments || []), newComment]
      });

      // Mention Logic
      const mentionRegex = /@([a-zA-Z0-9._\-\u00C0-\u00FF]+)/g;
      const mentions = [...text.matchAll(mentionRegex)];
      
      const uniqueLogins = [...new Set(mentions.map(m => m[1].toLowerCase()))];
      
      for (const login of uniqueLogins) {
        const mentionedUser = usersList.find(u => u.login.toLowerCase() === login);
        
        if (mentionedUser) {
          const notifId = `NOTIF-${Date.now()}-${mentionedUser.id}-${Math.random().toString(36).slice(2, 7)}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            recipientId: mentionedUser.id,
            recipientLogin: mentionedUser.login,
            senderId: user.id,
            senderName: user.name,
            commentId,
            recordId,
            text: text.trim().substring(0, 50) + (text.length > 50 ? '...' : ''),
            isRead: false,
            timestamp: Date.now()
          } as AppNotification);
        }
      }

      setCommentInputs({ ...commentInputs, [recordId]: '' });
      showToast('Comentário adicionado!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `occurrences/${recordId}`);
    }
  };

  const handleDeleteComment = async (recordId: string, commentId: string) => {
    console.log(`Starting deletion of comment ${commentId} in record ${recordId}`);
    try {
      const record = records.find(r => r.id === recordId);
      if (!record || !user) return;

      const comment = record.comments?.find(c => c.id === commentId);
      if (!comment) return;

      // Permissions check
      const isOwner = comment.userId === user.id;
      const isMasterUser = user.permissionLevel === 'Master';
      
      if (!isMasterUser && !isOwner) {
        showToast('Sem permissão para excluir este comentário.', 'error');
        return;
      }

      const updatedComments = (record.comments || []).filter(c => c.id !== commentId);
      
      // Update occurrence
      await updateDoc(doc(db, 'occurrences', recordId), {
        comments: updatedComments
      });

      setConfirmDeleteComment(null);
      showToast('Comentário removido!', 'success');

      // Background tasks
      (async () => {
        try {
          const qNotifs = query(collection(db, 'notifications'), where('commentId', '==', commentId));
          const notifsSnap = await getDocs(qNotifs);
          await Promise.all(notifsSnap.docs.map(doc => deleteDoc(doc.ref)));
          
          await createAuditLog({
            targetUserId: recordId,
            targetUserName: `Comentário em ${recordId}`,
            type: 'DELETE_COMMENT',
            oldValue: comment.text,
            newValue: 'EXCLUÍDO',
            description: `Comentário de ${comment.userName} removido por ${user.name}`,
            changedById: user.id,
            changedByName: user.name
          });
        } catch (error) {
          console.error('Audit/Notification background tasks failed:', error);
        }
      })();

    } catch (err) {
      console.error('Delete Comment Error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `occurrences/${recordId}`);
    }
  };

  const handleMarkNotificationRead = async (notif: AppNotification) => {
    try {
      await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
      setShowNotifications(false);
      
      const record = records.find(r => r.id === notif.recordId);
      if (record) {
        setSelectedArea(record.area);
        setSelectedRegionals([record.regional]);
        setSelectedShiftId(record.tsId);
        setActiveCommentId(record.id);

        // Scroll to record after state updates
        setTimeout(() => {
          const element = document.getElementById(`record-${notif.recordId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-[#EBA83A]', 'ring-offset-2');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-[#EBA83A]', 'ring-offset-2');
            }, 3000);
          }
        }, 300);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notif.id}`);
    }
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'occurrences', id));
      setDeletingRecordId(null);
      showToast('Ocorrência excluída com sucesso!');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `occurrences/${id}`);
    }
  };

  const handleStartEdit = (record: ShiftRecord) => {
    setEditingRecordId(record.id);
    setTempEditDescription(record.description);
  };

  const handleSaveEdit = async (recordId: string) => {
    if (!tempEditDescription.replace(/<[^>]*>/g, '').trim()) return;
    try {
      await updateDoc(doc(db, 'occurrences', recordId), { description: tempEditDescription });
      setEditingRecordId(null);
      showToast('Ocorrência atualizada!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `occurrences/${recordId}`);
    }
  };

  const handleClearFilters = () => {
    setHistoryFilterType('7days');
    setAppliedFilter('7days');
    setSelectedArea(null);
    setSelectedRegionals([]);
    setSelectedShiftId(null);
  };

  const filteredRecords = useMemo(() => {
    if (!user || !selectedArea || selectedRegionals.length === 0 || !selectedShiftId) return [];
    
    let baseRecords = [...records].sort((a, b) => b.timestamp - a.timestamp);
    
    // Date Filtering
    const now = new Date();
    let startDate: Date;
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (appliedFilter === 'today' as any) {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (appliedFilter === '7days') {
      startDate = subDays(now, 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (appliedFilter === '30days') {
      startDate = subDays(now, 30);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(customDateRange.start);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customDateRange.end);
      endDate.setHours(23, 59, 59, 999);
    }

    return baseRecords.filter(r => {
      const recordDate = new Date(r.timestamp);
      
      // Strict Combined Filter: Must match EXACTLY the context
      // At this point, we know all filters are present thanks to the check at top of useMemo
      
      const matchesArea = selectedArea === 'Todas' || r.area === selectedArea;
      
      const matchesRegional = selectedRegionals.includes(r.regional);

      const matchesTS = r.tsId === selectedShiftId;
      
      const matchesDate = recordDate >= startDate && recordDate <= endDate;
      
      return matchesArea && matchesRegional && matchesTS && matchesDate;
    });
  }, [records, user, selectedArea, selectedRegionals, selectedShiftId, appliedFilter, customDateRange]);

  useEffect(() => {
    if (user?.mustChangePassword) {
      setIsChangingPassword(true);
      showToast('Ação Requerida: Por favor, altere sua senha temporária.', 'error');
    }
  }, [user?.mustChangePassword]);

  const onLogin = (u: UserData) => {
    setUser(u);
    if (u.area && u.area !== 'Todas') {
      const areaName = u.area.includes('/') ? u.area.split('/')[0] : u.area;
      setSelectedArea(areaName);
    }
  };

  if (!user) {
    return <LoginForm onLogin={onLogin} usersList={usersList} />;
  }

  return (
    <div className="min-h-screen bg-[#F1F4F9] font-sans flex flex-col text-[#2B4C7E]">
      {/* NOVO HEADER DARK BLUE - CONFORME PRINT */}
      <header className="bg-[#2B4C7E] text-white px-6 py-4 flex items-center justify-between shadow-lg z-40">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight leading-none mb-1">
            Sistema Troca Turno - Torre de Controle (Teste)
          </h1>
          <div className="flex items-center gap-1 text-[11px] font-medium opacity-80">
            <span>{user.name}</span>
            <span className="opacity-40">•</span>
            <span className="text-[#EBA83A] font-bold uppercase">{getCurrentShiftName()}</span>
            <span className="opacity-40">•</span>
            <span className="uppercase">{user.role}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`p-2 rounded-lg border transition-all relative ${
                showNotifications ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/20'
              }`}
            >
              <Bell className="w-4 h-4" />
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#2B4C7E]">
                  {notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowNotifications(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-[calc(100%+8px)] right-0 w-80 bg-white text-[#2B4C7E] rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden"
                  >
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notificações</span>
                      {notifications.some(n => !n.isRead) && (
                        <button 
                          onClick={async () => {
                            for (const n of notifications.filter(notif => !notif.isRead)) {
                              await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
                            }
                          }}
                          className="text-[9px] font-black uppercase text-[#2B4C7E] hover:underline"
                        >
                          Limpar Tudo
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto no-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-10 h-10 text-slate-100 mx-auto mb-2" />
                          <p className="text-[10px] font-bold text-slate-300 uppercase italic">Nenhuma notificação</p>
                        </div>
                      ) : (
                        notifications.map(n => (
                          <button
                            key={n.id}
                            onClick={() => handleMarkNotificationRead(n)}
                            className={`w-full text-left p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 relative ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                          >
                            {!n.isRead && <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full" />}
                            <div className="w-8 h-8 rounded-full bg-[#2B4C7E]/10 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-[#2B4C7E]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black leading-tight mb-0.5">
                                <span className="text-[#EBA83A]">{n.senderName}</span> mencionou você
                              </p>
                              <p className="text-[10px] text-slate-500 truncate mb-1 italic">"{n.text}"</p>
                              <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">{format(n.timestamp, 'dd/MM/yy HH:mm')}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {(user.role === 'Gerente' || user.role === 'ADM') && (
            <button 
              onClick={() => setActiveTab(activeTab === 'users' ? 'dashboard' : 'users')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${
                activeTab === 'users' 
                  ? 'bg-white text-[#2B4C7E] border-white' 
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
            >
              <Users className="w-4 h-4" />
              Usuários
            </button>
          )}
          
          <div className="relative">
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                isProfileMenuOpen ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/20'
              }`}
            >
              <User className="w-4 h-4" />
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {/* CARD DE PERFIL */}
            <AnimatePresence>
              {isProfileMenuOpen && (
                <>
                  {/* Backdrop invisível para fechar ao clicar fora */}
                  <div 
                    className="fixed inset-0 z-[60]" 
                    onClick={() => setIsProfileMenuOpen(false)}
                  />
                  
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute top-[calc(100%+8px)] right-0 w-64 bg-white text-[#2B4C7E] rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] border border-slate-100 z-[70] transform origin-top-right overflow-hidden"
                  >
                    {/* HEADER DO CARD */}
                    <div className="p-5 bg-slate-50/50 rounded-t-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#EBA83A] flex items-center justify-center text-white font-black text-sm shadow-inner">
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[12px] font-black tracking-tight truncate">{user.name}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{user.role} / {selectedArea || 'Logística'}</span>
                        </div>
                        <button 
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="px-2 py-1 text-[9px] font-black uppercase text-slate-300 border border-slate-100 rounded-md hover:bg-slate-50 transition-all shrink-0"
                        >
                          VOLTAR
                        </button>
                      </div>
                    </div>

                    {/* OPÇÕES */}
                    <div className="p-2 space-y-1">
                      <button 
                        onClick={() => { setActiveTab('profile'); setIsProfileMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-[.15em] hover:bg-slate-50 text-slate-600 hover:text-[#2B4C7E] rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <User className="w-3.5 h-3.5 opacity-60" />
                        Meu Perfil
                      </button>
                      
                      <button 
                        onClick={() => { setActiveTab('profile'); setIsChangingPassword(true); setIsProfileMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-[.15em] hover:bg-slate-50 text-slate-600 hover:text-[#2B4C7E] rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <Lock className="w-3.5 h-3.5 opacity-60" />
                        Alterar Senha
                      </button>

                      {(user.role === 'Gerente' || user.role === 'ADM') && (
                        <button 
                          onClick={() => { setActiveTab('users'); setIsProfileMenuOpen(false); }}
                          className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-[.15em] hover:bg-slate-50 text-slate-600 hover:text-[#2B4C7E] rounded-xl flex items-center gap-3 transition-colors"
                        >
                          <Users className="w-3.5 h-3.5 opacity-60" />
                          Gerenciar Usuários
                        </button>
                      )}

                      <div className="h-px bg-slate-100 my-2 mx-2" />
                      
                      <button 
                        onClick={() => { setUser(null); setIsProfileMenuOpen(false); }}
                        className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-[.15em] hover:bg-red-50 text-red-500 rounded-xl flex items-center gap-3 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sair do Sistema
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* BREADCRUMBS & NAVEGAÇÃO SUPERIOR */}
      <nav className="bg-white/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => { setSelectedArea(null); setActiveTab('dashboard'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!selectedArea ? 'bg-[#2B4C7E] text-white' : 'text-slate-400 hover:text-[#2B4C7E]'}`}
          >
            <LayoutDashboard className="w-3 h-3" /> Home
          </button>

          {selectedArea && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <button 
                onClick={() => setSelectedRegionals([])}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedArea && selectedRegionals.length === 0 ? 'bg-[#2B4C7E] text-white' : 'text-slate-400 hover:text-[#2B4C7E]'}`}
              >
                {selectedArea}
              </button>
            </>
          )}

            {selectedArea && selectedRegionals.length > 0 && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <button 
                onClick={() => setSelectedShiftId(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedRegionals.length > 0 && !selectedShiftId ? 'bg-[#2B4C7E] text-white' : 'text-slate-400 hover:text-[#2B4C7E]'}`}
              >
                {selectedRegionals.length === 1 ? selectedRegionals[0] : `Múltiplas (${selectedRegionals.length})`}
              </button>
            </>
          )}

          {selectedShiftId && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[#2B4C7E] text-white">
                {selectedShiftId}
              </span>
            </>
          )}
        </div>

        {selectedArea && (
          <Button 
            onClick={() => {
              if (selectedShiftId) setSelectedShiftId(null);
              else if (selectedRegionals.length > 0) setSelectedRegionals([]);
              else setSelectedArea(null);
            }}
            className="h-8 px-4 bg-white border border-slate-200 text-[#2B4C7E] font-black uppercase tracking-widest text-[9px] hover:bg-slate-50 transition-all rounded-full shadow-sm"
          >
            Voltar
          </Button>
        )}
      </nav>

      {/* TOAST SYSTEM */}
      <AnimatePresence>
        {toast.type && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={`fixed top-24 right-6 z-[120] p-4 rounded-2xl shadow-2xl border flex items-center gap-3 ${
              toast.type === 'success' 
                ? 'bg-green-500 text-white border-green-600' 
                : 'bg-red-500 text-white border-red-600'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-[11px] font-black uppercase tracking-widest">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-8 space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {!selectedArea && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-[40vh] space-y-12 py-8"
              >
                <div className="text-center space-y-4">
                  <h2 className="text-4xl md:text-5xl font-black text-[#2B4C7E] uppercase tracking-tighter italic">OPERAÇÕES</h2>
                  <div className="w-24 h-1.5 bg-[#EBA83A] mx-auto rounded-full" />
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Torre de Controle Logística</p>
                </div>

                <div className="flex flex-wrap justify-center gap-4 md:gap-8 max-w-4xl px-4">
                  {AREAS.map((area) => {
                    const hasAccess = user.role === 'Gerente' || user.role === 'ADM' || user.area === 'Todas' || user.area.split('/').includes(area.name);
                    return (
                      <button
                        key={area.id}
                        disabled={!hasAccess}
                        onClick={() => hasAccess && setSelectedArea(area.name)}
                        className={`group relative flex flex-col items-center justify-center w-36 h-36 md:w-44 md:h-44 bg-white rounded-[2.5rem] shadow-xl hover:shadow-2xl transition-all border-4 border-transparent hover:border-[#EBA83A] active:scale-95 ${!hasAccess ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        <div className="w-16 h-16 bg-[#2B4C7E]/5 rounded-3xl flex items-center justify-center mb-4 group-hover:bg-[#EBA83A]/10 transition-colors">
                           <Truck className="w-8 h-8 text-[#2B4C7E] group-hover:text-[#EBA83A] transition-colors" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#2B4C7E]">{area.name}</span>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {selectedArea && (selectedRegionals.length === 0 || !selectedShiftId) && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col items-center justify-center min-h-[40vh] space-y-8 py-8"
              >
                <div className="text-center space-y-4">
                  <h2 className="text-4xl md:text-5xl font-black text-[#2B4C7E] uppercase tracking-tighter italic">{selectedArea}</h2>
                  <div className="w-24 h-1.5 bg-[#EBA83A] mx-auto rounded-full" />
                  <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 font-bold">Selecione uma ou mais Regionais</p>
                </div>

                <div className="flex flex-wrap justify-center gap-3 max-w-5xl">
                   <button
                    onClick={() => {
                      if (selectedRegionals.length === currentRegionals.length) setSelectedRegionals([]);
                      else setSelectedRegionals([...currentRegionals]);
                    }}
                    className={`px-6 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${selectedRegionals.length === currentRegionals.length ? 'bg-[#EBA83A] border-[#EBA83A] text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                  >
                    {selectedRegionals.length === currentRegionals.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}
                  </button>

                  {currentRegionals.map(reg => {
                    const isSelected = selectedRegionals.includes(reg);
                    return (
                      <button
                        key={reg}
                        onClick={() => {
                          if (isSelected) setSelectedRegionals(prev => prev.filter(r => r !== reg));
                          else setSelectedRegionals(prev => [...prev, reg]);
                        }}
                        className={`px-8 py-4 rounded-2xl shadow-md border-2 transition-all active:scale-95 flex items-center gap-3 ${isSelected ? 'bg-[#2B4C7E] border-[#2B4C7E] text-white shadow-xl translate-y-[-2px]' : 'bg-white border-slate-100/50 text-[#2B4C7E] hover:border-[#2B4C7E]/30'}`}
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isSelected ? 'bg-[#EBA83A] border-[#EBA83A]' : 'bg-slate-50 border-slate-200'}`}>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-[12px] font-black uppercase tracking-widest">{reg}</span>
                      </button>
                    )
                  })}
                </div>

                {selectedRegionals.length > 0 && (
                   <div className="flex flex-col items-center gap-6 pt-8 w-full">
                      <div className="h-px bg-slate-200 w-full max-w-lg" />
                      <div className="text-center space-y-4">
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 font-bold">Selecione o T Logístico para Filtrar ou Visualizar Historico</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl px-4">
                          {LOGISTICS_SHIFTS.map(s => (
                            <button
                              key={s.id}
                              onClick={() => setSelectedShiftId(s.id)}
                              className={`flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-lg border-2 transition-all hover:shadow-xl active:scale-95 group relative ${selectedShiftId === s.id ? 'border-[#2B4C7E] bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                            >
                              <span className={`text-2xl font-black mb-1 ${s.textColor}`}>{s.id}</span>
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 text-center leading-tight">{s.name.split(': ')[1]}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                   </div>
                )}
              </motion.div>
            )}

            {selectedArea && selectedRegionals.length > 0 && selectedShiftId && (
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 bg-[#2B4C7E] rounded-xl flex items-center justify-center text-white font-black text-xl">
                       {selectedShiftId}
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-black text-[#2B4C7E] uppercase tracking-tighter italic leading-tight">
                            {selectedArea} • {selectedRegionals.length > 1 ? 'Análise Consolidada' : (selectedRegional || 'Múltiplas')} • {LOGISTICS_SHIFTS.find(s => s.id === selectedShiftId)?.name}
                          </h2>
                          {isSyncingKpi && (
                            <motion.div
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-100"
                            >
                              <RefreshCw className="w-2.5 h-2.5 text-emerald-500 animate-spin" />
                              <span className="text-[8px] font-black uppercase text-emerald-600">Sincronizando</span>
                            </motion.div>
                          )}
                        </div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-[#EBA83A]">Monitoramento em Tempo Real</p>
                     </div>
                   </div>

                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {['Em Rota', 'Toco', 'Manutenção', 'Sem Sinal'].map((label, idx) => {
                    let count = 0;
                    if (selectedRegional) {
                      const kpiId = `${selectedArea}_${selectedRegional}_${selectedShiftId}`.replace(/\s+/g, '_');
                      count = operationalKpis[kpiId]?.[label] || 0;
                    } else {
                      selectedRegionals.forEach(reg => {
                        const kpiId = `${selectedArea}_${reg}_${selectedShiftId}`.replace(/\s+/g, '_');
                        count += (operationalKpis[kpiId]?.[label] || 0);
                      });
                    }

                    const Icon = [Truck, Building2, Wrench, WifiOff][idx];
                    const styles = {
                      'Em Rota': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-500', icon: 'text-emerald-500' },
                      'Toco': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-500', icon: 'text-amber-500' },
                      'Manutenção': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-500', icon: 'text-rose-500' },
                      'Sem Sinal': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-400', icon: 'text-slate-500' }
                    }[label] || { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-400', icon: 'text-slate-400' };

                    const canEdit = !!selectedRegional;

                    return (
                      <Card 
                        key={label} 
                        className={`border-none shadow-sm ${styles.bg} border-b-4 ${styles.border} transition-all hover:shadow-md ${canEdit ? 'cursor-pointer group' : ''} relative overflow-hidden`} 
                        onClick={() => {
                          if (canEdit) {
                            setEditingKpi(label);
                          } else {
                            showToast('Selecione uma única Regional para editar os números.', 'error');
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <Icon className={`w-4 h-4 ${styles.icon}`} />
                               {isSyncingKpi && editingKpi === label && (
                                 <motion.div
                                   animate={{ rotate: 360 }}
                                   transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                 >
                                   <RefreshCw className="w-2.5 h-2.5 text-slate-400" />
                                 </motion.div>
                               )}
                             </div>
                             <span className="text-[8px] font-black uppercase tracking-[.2em] text-slate-400">Total</span>
                          </div>
                          <div>
                            {editingKpi === label && canEdit ? (
                              <input
                                autoFocus
                                type="number"
                                defaultValue={count}
                                onBlur={async (e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (selectedArea && selectedRegional && selectedShiftId) {
                                    await handleUpdateOperationalKpi(selectedArea, selectedRegional, selectedShiftId, label, val);
                                  }
                                  setEditingKpi(null);
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseInt((e.target as HTMLInputElement).value) || 0;
                                    if (selectedArea && selectedRegional && selectedShiftId) {
                                      await handleUpdateOperationalKpi(selectedArea, selectedRegional, selectedShiftId, label, val);
                                    }
                                    setEditingKpi(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingKpi(null);
                                  }
                                }}
                                className={`text-2xl font-black font-mono w-full bg-white/50 border-none p-0 outline-none ${styles.text}`}
                              />
                            ) : (
                              <p className={`text-2xl font-black font-mono tracking-tighter ${styles.text}`}>{count}</p>
                            )}
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#2B4C7E] truncate mt-1">{label}</p>
                          </div>
                          {!canEdit && (
                            <div className="absolute top-1 right-1 opacity-20">
                              <Lock className="w-3 h-3" />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                <div className="flex justify-center mt-6">
                  <div className="w-full max-w-2xl space-y-6">
                     <Card className="border-none shadow-lg rounded-2xl overflow-hidden bg-white border-t-4 border-t-[#EBA83A]">
                        <div className="p-6 space-y-5">
                           <h3 className="text-sm font-black uppercase tracking-[.2em] text-[#2B4C7E] text-center">REGISTRO DE OCORRÊNCIA</h3>
                           <div className="space-y-4">
                            {!isUnitHidden && (
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Unidade</label>
                                <select 
                                  value={selectedFormUnit}
                                  onChange={(e) => setSelectedFormUnit(e.target.value)}
                                  className="w-full text-[11px] font-bold bg-[#F1F4F9] border-none rounded-xl px-4 py-3 focus:ring-2 ring-[#2B4C7E]"
                                >
                                  <option value="">Selecione a Unidade</option>
                                  {filteredUnits.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Status (Criticidade)</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {(['normal', 'alert', 'critical'] as const).map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => setShiftInputs({
                                        ...shiftInputs,
                                        [selectedShiftId]: { ...shiftInputs[selectedShiftId], status: s }
                                      })}
                                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border-2 flex items-center justify-center gap-1.5 ${
                                        shiftInputs[selectedShiftId].status === s
                                          ? s === 'normal' ? 'bg-green-500 border-green-500 text-white' :
                                            s === 'alert' ? 'bg-orange-500 border-orange-500 text-white' :
                                            'bg-red-500 border-red-500 text-white'
                                          : 'bg-[#F1F4F9] border-transparent text-slate-400'
                                      }`}
                                    >
                                      {s === 'normal' ? '🟢 Normal' : s === 'alert' ? '🟡 Alerta' : '🔴 Crítico'}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Relato Operacional</label>
                                <div className="quill-wrapper bg-[#F1F4F9] rounded-xl overflow-hidden">
                                  {shiftInputs[selectedShiftId] && (
                                    <ReactQuill 
                                      theme="snow"
                                      placeholder="Descreva a ocorrência..."
                                      value={shiftInputs[selectedShiftId].description}
                                      onChange={(content) => setShiftInputs({
                                        ...shiftInputs,
                                        [selectedShiftId]: { ...shiftInputs[selectedShiftId], description: content }
                                      })}
                                      modules={QUILL_MODULES}
                                      formats={QUILL_FORMATS}
                                      className="border-none text-[11px]"
                                    />
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-3 pt-2">
                                <Button 
                                  onClick={() => handleSaveShiftRecord(selectedShiftId)}
                                  className="flex-1 bg-[#2B4C7E] hover:bg-[#1e3559] text-white h-12 rounded-xl uppercase text-[10px] font-black tracking-widest shadow-lg active:scale-95 transition-all"
                                >
                                  Salvar ✅
                                </Button>
                                <button 
                                  onClick={() => {
                                    setShiftInputs({
                                      ...shiftInputs,
                                      [selectedShiftId]: { status: 'normal', description: '' }
                                    });
                                    setSelectedFormUnit('');
                                  }}
                                  className="px-6 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                                >
                                  Cancelar ❌
                                </button>
                              </div>
                           </div>
                        </div>
                     </Card>
                  </div>
                </div>
              </div>
            )}

            {/* SEÇÃO DE HISTÓRICO - EXIBIDA APENAS COM SELEÇÃO SIMULTÂNEA DE OPERAÇÃO, REGIONAL E TS */}
            {selectedArea && selectedRegionals.length > 0 && selectedShiftId && (
              <div id="history-list-container" className="pt-10 space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-8 bg-[#2B4C7E] rounded-full mr-1" />
                    <h3 className="text-xl font-bold text-[#2B4C7E]">
                      Histórico Exclusivo - {selectedArea} | {selectedRegional || `Múltiplas (${selectedRegionals.length})`} | {selectedShiftId}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline"
                      onClick={handleClearFilters}
                      className="h-9 px-4 text-[10px] font-bold uppercase tracking-wider bg-white border-slate-200 text-slate-500 hover:text-[#2B4C7E] rounded-lg transition-all"
                    >
                      Limpar Filtros 🗙
                    </Button>
                  </div>
                </div>

                <Card className="border-none shadow-sm bg-white overflow-hidden rounded-xl">
                  <CardContent className="p-4 md:p-6 space-y-6">
                    {/* Regional Toggle - Quick Filter */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Filter className="w-4 h-4" />
                        <label className="text-[11px] font-bold uppercase tracking-wider">Regionais (Filtro Rápido)</label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {currentRegionals.map(reg => {
                          const isSelected = selectedRegionals.includes(reg);
                          return (
                            <button
                              key={reg}
                              onClick={() => {
                                if (isSelected) setSelectedRegionals(prev => prev.filter(r => r !== reg));
                                else setSelectedRegionals(prev => [...prev, reg]);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                                isSelected 
                                  ? 'bg-[#2B4C7E] text-white border-[#2B4C7E]' 
                                  : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              {reg}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="h-px bg-slate-100" />

                    <div className="flex flex-col lg:flex-row lg:items-end gap-6">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Calendar className="w-4 h-4" />
                            <label className="text-[11px] font-bold uppercase tracking-wider">Data Inicial</label>
                          </div>
                          <Input 
                            type="date" 
                            value={customDateRange.start} 
                            onChange={(e) => {
                              setCustomDateRange({...customDateRange, start: e.target.value});
                              setHistoryFilterType('custom');
                            }} 
                            className="h-10 bg-slate-50 border-slate-200 text-slate-600" 
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Calendar className="w-4 h-4" />
                            <label className="text-[11px] font-bold uppercase tracking-wider">Data Final</label>
                          </div>
                          <Input 
                            type="date" 
                            value={customDateRange.end} 
                            onChange={(e) => {
                              setCustomDateRange({...customDateRange, end: e.target.value});
                              setHistoryFilterType('custom');
                            }} 
                            className="h-10 bg-slate-50 border-slate-200 text-slate-600" 
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setHistoryFilterType('today' as any);
                            setAppliedFilter('today' as any);
                          }}
                          className={`px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${historyFilterType === 'today' ? 'bg-[#2B4C7E] text-white border-[#2B4C7E]' : 'bg-white text-[#2B4C7E] border-[#2B4C7E]/20 hover:bg-slate-50'}`}
                        >
                          Hoje
                        </button>
                        <button 
                          onClick={() => {
                            setHistoryFilterType('7days');
                            setAppliedFilter('7days');
                          }}
                          className={`px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${historyFilterType === '7days' ? 'bg-[#2B4C7E] text-white border-[#2B4C7E]' : 'bg-white text-[#2B4C7E] border-[#2B4C7E]/20 hover:bg-slate-50'}`}
                        >
                          Últimos 7 dias
                        </button>
                        <button 
                          onClick={() => {
                            setHistoryFilterType('30days');
                            setAppliedFilter('30days');
                          }}
                          className={`px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase transition-all border ${historyFilterType === '30days' ? 'bg-[#2B4C7E] text-white border-[#2B4C7E]' : 'bg-white text-[#2B4C7E] border-[#2B4C7E]/20 hover:bg-slate-50'}`}
                        >
                          Últimos 30 dias
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  {filteredRecords.length === 0 ? (
                    <Card className="border-none shadow-sm bg-white py-20 text-center opacity-40">
                      <ClipboardList className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                      <h4 className="text-base font-bold text-slate-500 uppercase tracking-widest">Sem registros para este TS no período</h4>
                    </Card>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {filteredRecords.map((r) => (
                        <Card key={r.id} id={`record-${r.id}`} className={`border-none shadow-sm overflow-hidden border-l-4 ${
                          r.status === 'critical' ? 'border-l-red-500 shadow-red-50/20' : 
                          r.status === 'alert' ? 'border-l-orange-500 shadow-orange-50/20' : 
                          'border-l-green-500 shadow-green-50/20'
                        }`}>
                          <CardContent className="p-0">
                            <div className="p-4 md:p-6 space-y-4">
                              {/* Badges and Actions */}
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase text-white shadow-sm ${
                                    r.status === 'critical' ? 'bg-red-500' : r.status === 'alert' ? 'bg-orange-500' : 'bg-green-500'
                                  }`}>
                                    {r.status === 'critical' ? 'Crítico' : r.status === 'alert' ? 'Alerta' : 'Regular'}
                                  </span>
                                  <span className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase text-white shadow-sm ${
                                    r.executionStatus === 'Finalizado' ? 'bg-emerald-500' : 'bg-[#EBA83A]'
                                  }`}>
                                    {r.executionStatus || 'Em andamento'}
                                  </span>
                                  <span className="bg-[#4870AF] text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase shadow-sm">
                                    {r.regional}
                                  </span>
                                  <span className="bg-[#D9A65D] text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase shadow-sm">
                                    {r.tsId}
                                  </span>
                                  {r.unidade && (
                                    <div className="flex items-center gap-1.5 bg-emerald-500 text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase shadow-sm">
                                      <Building2 className="w-3 h-3" />
                                      {r.unidade}
                                    </div>
                                  )}
                                  <span className="bg-[#D1E1F8] text-[#2B4C7E] px-3 py-1 rounded-md text-[10px] font-bold uppercase">
                                    {r.userName}
                                  </span>
                                  <span className="text-slate-400 text-[10px] font-bold uppercase ml-2 flex items-center gap-2">
                                    <Clock className="w-3 h-3" />
                                    {format(new Date(r.timestamp), 'dd/MM/yyyy, HH:mm:ss')}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => handleStartEdit(r)} className="p-2 text-slate-400 hover:text-[#2B4C7E] transition-all"><Edit2 className="w-4 h-4" /></button>
                                  <button onClick={() => setDeletingRecordId(r.id)} className="p-2 text-slate-400 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              </div>

                              {/* Description */}
                              <div className="py-2">
                                {editingRecordId === r.id ? (
                                  <div className="space-y-3">
                                    <div className="quill-wrapper bg-slate-50 rounded-lg border-2 border-[#2B4C7E]/20 overflow-hidden">
                                      <ReactQuill 
                                        theme="snow"
                                        value={tempEditDescription} 
                                        onChange={(content) => setTempEditDescription(content)} 
                                        modules={QUILL_MODULES}
                                        formats={QUILL_FORMATS}
                                        className="text-sm text-slate-600 border-none" 
                                      />
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <button onClick={() => setEditingRecordId(null)} className="px-4 py-2 text-[11px] font-bold uppercase text-slate-400">Cancelar</button>
                                      <Button onClick={() => handleSaveEdit(r.id)} className="bg-[#2B4C7E] text-white px-6 py-2 rounded-lg text-[11px] font-bold uppercase">Salvar Edição</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div 
                                    className="text-sm text-[#2B4C7E] leading-relaxed tracking-tight formatted-content ql-editor !p-0"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.description) }}
                                  />
                                )}
                              </div>

                              {/* Situation Control */}
                              <div className="bg-slate-50/50 p-4 rounded-lg flex flex-col md:flex-row md:items-center gap-6">
                                <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Situação:</span>
                                <div className="flex items-center gap-6">
                                  <button 
                                    onClick={() => handleUpdateRecordExecution(r.id, 'Em andamento')} 
                                    className="flex items-center gap-2 group"
                                  >
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${r.executionStatus === 'Em andamento' ? 'border-[#EBA83A] bg-[#EBA83A]' : 'border-slate-300 bg-white group-hover:border-slate-400'}`}>
                                      {r.executionStatus === 'Em andamento' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <span className={`text-[11px] font-bold uppercase ${r.executionStatus === 'Em andamento' ? 'text-[#EBA83A]' : 'text-slate-400 group-hover:text-slate-500'}`}>Em andamento</span>
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateRecordExecution(r.id, 'Finalizado')} 
                                    className="flex items-center gap-2 group"
                                  >
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${r.executionStatus === 'Finalizado' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white group-hover:border-slate-400'}`}>
                                      {r.executionStatus === 'Finalizado' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                    <span className={`text-[11px] font-bold uppercase ${r.executionStatus === 'Finalizado' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-500'}`}>Finalizado</span>
                                  </button>
                                </div>
                              </div>

                              {/* Comments Section */}
                              <div className="pt-2">
                                <button 
                                  onClick={() => setActiveCommentId(activeCommentId === r.id ? null : r.id)} 
                                  className="text-[11px] font-bold text-[#2B4C7E] flex items-center gap-2 hover:underline transition-all"
                                >
                                  <MessageSquare className="w-4 h-4" /> Comentários ({r.comments?.length || 0})
                                </button>
                                
                                <AnimatePresence>
                                  {activeCommentId === r.id && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                      <div className="space-y-3 pt-4 pl-4 border-l-2 border-slate-100 mt-2">
                                        {r.comments?.map(c => (
                                          <div key={c.id} className="bg-slate-50 p-3 rounded-lg relative group/comment border border-slate-100">
                                            <div className="flex justify-between items-start mb-1">
                                              <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-[#2B4C7E] uppercase">{c.userName}</span>
                                                <span className="text-[8px] text-slate-400 font-medium">{format(new Date(c.timestamp), 'dd/MM HH:mm')}</span>
                                              </div>
                                              {(user?.permissionLevel === 'Master' || c.userId === user?.id) && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                  {confirmDeleteComment?.commentId === c.id ? (
                                                    <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 shadow-sm animate-in fade-in zoom-in duration-200">
                                                      <button 
                                                        onClick={() => handleDeleteComment(r.id, c.id)}
                                                        className="text-[10px] font-black text-red-600 hover:text-red-700 uppercase tracking-tight flex items-center gap-1"
                                                      >
                                                        <Check className="w-3 h-3" /> Excluir
                                                      </button>
                                                      <div className="w-[1px] h-3 bg-red-200" />
                                                      <button 
                                                        onClick={() => setConfirmDeleteComment(null)}
                                                        className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-tight"
                                                      >
                                                        Sair
                                                      </button>
                                                    </div>
                                                  ) : (
                                                    <button 
                                                      onClick={() => setConfirmDeleteComment({ recordId: r.id, commentId: c.id })}
                                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all shrink-0 opacity-0 group-hover/comment:opacity-100"
                                                      title="Excluir este comentário"
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </button>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                            <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
                                          </div>
                                        ))}
                                        <div className="flex gap-2">
                                          <input 
                                            type="text" 
                                            placeholder="Adicionar comentário..." 
                                            value={commentInputs[r.id] || ''} 
                                            onChange={(e) => setCommentInputs({ ...commentInputs, [r.id]: e.target.value })} 
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment(r.id)} 
                                            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs outline-none focus:border-[#2B4C7E] transition-all" 
                                          />
                                          <Button onClick={() => handleAddComment(r.id)} className="bg-[#2B4C7E] text-white px-4 py-2 h-auto text-[10px] font-bold uppercase rounded-lg">Enviar</Button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>

                            {/* Delete Modal for this card */}
                            <AnimatePresence>
                              {deletingRecordId === r.id && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 bg-white/95 flex flex-col items-center justify-center gap-4 text-center backdrop-blur-sm">
                                  <Trash2 className="w-10 h-10 text-red-500 bg-red-100 p-2 rounded-full" />
                                  <h4 className="text-sm font-bold text-[#2B4C7E] uppercase">Deseja excluir este registro?</h4>
                                  <div className="flex gap-3">
                                    <button onClick={() => setDeletingRecordId(null)} className="px-6 py-2 text-[11px] font-bold uppercase text-slate-400">Não</button>
                                    <button onClick={() => confirmDelete(r.id)} className="px-8 py-2 bg-red-500 text-white text-[11px] font-bold uppercase rounded-lg shadow-lg">Sim, Excluir</button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <motion.div 
            key="users"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-[#2B4C7E]">PERFIL MASTER – USUÁRIOS</CardTitle>
                  <CardDescription className="text-[10px]">Controle total de acessos e permissões da base</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <Input 
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      placeholder="Buscar usuário..."
                      className="h-9 w-64 pl-9 text-[10px] font-bold border-slate-200 focus:border-[#2B4C7E] rounded-lg"
                    />
                  </div>
                  {user.permissionLevel === 'Master' && (
                    <Button 
                      onClick={() => {
                        setNewUserForm({
                          name: '',
                          login: '',
                          password: '123456',
                          role: 'Analista Logístico',
                          area: AREAS[0].name,
                          permissionLevel: 'Intermediário'
                        });
                        setIsCreatingUser(true);
                      }}
                      className="bg-[#2B4C7E] h-9 px-4 uppercase text-[9px] font-black tracking-widest text-white rounded-lg shadow-lg active:scale-95 transition-all"
                    >
                      <Plus className="w-3 h-3 mr-2" /> Novo Cadastro
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30">
                        <th className="py-4 px-6 text-[9px] uppercase font-black text-slate-400 tracking-widest">Informações Pessoais</th>
                        <th className="py-4 px-6 text-[9px] uppercase font-black text-slate-400 tracking-widest">Acesso e Localização</th>
                        <th className="py-4 px-6 text-[9px] uppercase font-black text-slate-400 tracking-widest">Privilégios</th>
                        <th className="py-4 px-6 text-[9px] uppercase font-black text-slate-400 tracking-widest text-right">Manutenção Administrativa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {currentUsersList.map(u => (
                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-[#2B4C7E]/5 rounded-xl border border-[#2B4C7E]/10 flex items-center justify-center text-[#2B4C7E]">
                                <User className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#2B4C7E]">{u.name}</p>
                                <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{u.role} | Cadastrado em {format(new Date(), 'dd/MM/yy')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono font-bold text-slate-600 flex items-center gap-1.5">
                                <Key className="w-3 h-3 opacity-40" /> {u.login}
                              </p>
                              <p className="text-[10px] font-bold text-[#2B4C7E] flex items-center gap-1.5 opacity-80">
                                <Shield className="w-3 h-3 opacity-40" /> {u.area}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                              u.permissionLevel === 'Master' 
                                ? 'bg-[#EBA83A]/10 text-[#EBA83A] border border-[#EBA83A]/20' 
                                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            }`}>
                              {u.permissionLevel}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex justify-end items-center gap-2">
                              <button 
                                onClick={() => setEditingUser({...u})}
                                title="Editar Usuário"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#2B4C7E] hover:bg-slate-50 hover:border-[#2B4C7E]/30 transition-all shadow-sm"
                              >
                                <Edit2 className="w-3 h-3" /> Editar
                              </button>
                              
                              <button 
                                onClick={() => setResettingPasswordUser({...u})}
                                title="Resetar Senha para 123456"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#2B4C7E] hover:bg-slate-50 hover:border-[#2B4C7E]/30 transition-all shadow-sm"
                              >
                                <Lock className="w-3 h-3 text-orange-500" /> Resetar
                              </button>

                              <button 
                                onClick={() => setChangingPermissionUser({...u})}
                                title="Alterar Nível de Permissão"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2B4C7E]/5 border border-[#2B4C7E]/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#2B4C7E] hover:bg-[#2B4C7E]/10 transition-all"
                              >
                                <Settings className="w-3 h-3" /> Nível
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* MODAIS DE MANUTENÇÃO */}
            <AnimatePresence>
              {isCreatingUser && (
                <div className="fixed inset-0 bg-[#2B4C7E]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
                  >
                    <div className="bg-[#2B4C7E] p-6 text-white text-center">
                      <Users className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <h3 className="text-sm font-black uppercase tracking-widest">Novo Cadastro de Usuário</h3>
                    </div>
                    <div className="p-8 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Nome Completo</label>
                        <Input 
                          placeholder="Nome Completo"
                          value={newUserForm.name}
                          onChange={(e) => setNewUserForm({...newUserForm, name: e.target.value})}
                          className="h-12 text-xs font-bold border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Usuário (Login)</label>
                        <Input 
                          placeholder="Ex: joao.silva"
                          value={newUserForm.login}
                          onChange={(e) => setNewUserForm({...newUserForm, login: e.target.value.trim()})}
                          className="h-12 text-xs font-mono font-bold border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Cargo / Função</label>
                        <select 
                          className="w-full h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold appearance-none outline-none"
                          value={newUserForm.role}
                          onChange={(e) => setNewUserForm({...newUserForm, role: e.target.value as UserRole})}
                        >
                          <option value="">Selecione o Cargo</option>
                          {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Senha (Padrão: 123456)</label>
                        <Input 
                          type="text"
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm({...newUserForm, password: e.target.value})}
                          className="h-12 text-xs font-mono font-bold border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1 tracking-widest">Nível de Permissão</label>
                        <div className="flex gap-2">
                          {(['Master', 'Intermediário'] as const).map(nivel => (
                            <button
                              key={nivel}
                              onClick={() => setNewUserForm({...newUserForm, permissionLevel: nivel})}
                              className={`flex-1 py-3 rounded-xl border-2 text-[10px] font-bold uppercase transition-all ${
                                newUserForm.permissionLevel === nivel 
                                  ? 'bg-[#2B4C7E]/5 border-[#2B4C7E] text-[#2B4C7E] shadow-sm' 
                                  : 'bg-white border-slate-50 text-slate-300 hover:border-slate-100'
                              }`}
                            >
                              {nivel}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Área de Atuação</label>
                        <select 
                          className="w-full h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold appearance-none outline-none"
                          value={newUserForm.area}
                          onChange={(e) => setNewUserForm({...newUserForm, area: e.target.value})}
                        >
                          <option value="">Selecione a Área</option>
                          {AREAS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                          <option value="Todas">Todas</option>
                        </select>
                      </div>
                      
                      <div className="flex gap-3 pt-4">
                        <Button 
                          onClick={async () => {
                            if (!newUserForm.name || !newUserForm.login || !newUserForm.password || !newUserForm.area || !newUserForm.role) {
                              showToast('Todos os campos são obrigatórios!', 'error');
                              return;
                            }
                            
                            const exists = usersList.some(u => u.login === newUserForm.login);
                            if (exists) {
                              showToast('Este login já está em uso!', 'error');
                              return;
                            }

                            const uid = `USER-${Date.now().toString(36).toUpperCase()}`;
                            try {
                              const newUser = { ...newUserForm, id: uid } as UserData;
                              await setDoc(doc(db, 'users', uid), newUser);
                              
                              await createAuditLog({
                                targetUserId: uid,
                                targetUserName: newUser.name,
                                type: 'CREATE_USER',
                                oldValue: 'NONE',
                                newValue: JSON.stringify(newUser),
                                changedById: user!.id,
                                changedByName: user!.name
                              });

                              showToast(`Usuário ${newUser.name} cadastrado com sucesso!`);
                              setIsCreatingUser(false);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
                            }
                          }}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
                        >
                          Salvar ✅
                        </Button>
                        <button 
                          onClick={() => setIsCreatingUser(false)}
                          className="px-6 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Cancelar ❌
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              {editingUser && (
                <div className="fixed inset-0 bg-[#2B4C7E]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
                  >
                    <div className="bg-[#2B4C7E] p-6 text-white text-center">
                      <Edit2 className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <h3 className="text-sm font-black uppercase tracking-widest">Editar Dados do Usuário</h3>
                    </div>
                    <div className="p-8 space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Nome Completo</label>
                        <Input 
                          value={editingUser.name}
                          onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                          className="h-12 text-xs font-bold border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Login / Usuário</label>
                        <Input 
                          value={editingUser.login}
                          onChange={(e) => setEditingUser({...editingUser, login: e.target.value.trim()})}
                          className="h-12 text-xs font-mono font-bold border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Cargo / Função</label>
                        <select 
                          className="w-full h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold appearance-none outline-none"
                          value={editingUser.role}
                          onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                        >
                          {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400 pl-1">Área Atuação</label>
                        <select 
                          className="w-full h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold appearance-none outline-none"
                          value={editingUser.area}
                          onChange={(e) => setEditingUser({...editingUser, area: e.target.value})}
                        >
                          {AREAS.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                          <option value="Todas">Todas</option>
                        </select>
                      </div>
                      
                      <div className="flex gap-3 pt-4">
                        <Button 
                          onClick={() => {
                            handleUpdateUsersList(editingUser);
                            setEditingUser(null);
                          }}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
                        >
                          Salvar ✅
                        </Button>
                        <button 
                          onClick={() => setEditingUser(null)}
                          className="px-6 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Cancelar ❌
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              {resettingPasswordUser && (
                <div className="fixed inset-0 bg-[#2B4C7E]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden text-center"
                  >
                    <div className="p-8 space-y-6">
                      <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
                        <Lock className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-[#2B4C7E] mb-2">Resetar Senha</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
                          Deseja redefinir a senha do usuário <span className="text-[#2B4C7E]">{resettingPasswordUser.name}</span>?
                        </p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[9px] uppercase font-black text-slate-400 mb-1">Nova senha padrão</p>
                        <p className="text-xl font-black text-[#2B4C7E] tracking-[0.3em]">123456</p>
                      </div>
                      <div className="flex gap-3">
                        <Button 
                          onClick={() => {
                            handleUpdateUsersList({...resettingPasswordUser, password: '123456', mustChangePassword: true});
                            setResettingPasswordUser(null);
                          }}
                          className="flex-1 bg-[#2B4C7E] hover:bg-[#1A3154] text-white h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
                        >
                          Confirmar ✅
                        </Button>
                        <button 
                          onClick={() => setResettingPasswordUser(null)}
                          className="flex-1 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Cancelar ❌
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}

              {changingPermissionUser && (
                <div className="fixed inset-0 bg-[#2B4C7E]/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
                  >
                    <div className="bg-[#2B4C7E] p-6 text-white text-center">
                      <Shield className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <h3 className="text-sm font-black uppercase tracking-widest">Alterar Nível de Permissão</h3>
                    </div>
                    <div className="p-8 space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-1">Selecionar nível de acesso</label>
                        <div className="grid grid-cols-1 gap-2">
                          {['Master', 'Intermediário'].map(( nivel: any ) => (
                            <button 
                              key={nivel}
                              onClick={() => setChangingPermissionUser({...changingPermissionUser, permissionLevel: nivel})}
                              className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                                changingPermissionUser.permissionLevel === nivel 
                                  ? 'bg-[#2B4C7E]/5 border-[#2B4C7E] text-[#2B4C7E]' 
                                  : 'bg-white border-slate-100 text-slate-400'
                              }`}
                            >
                              <span className="text-xs font-black uppercase tracking-widest">{nivel}</span>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                changingPermissionUser.permissionLevel === nivel ? 'border-[#2B4C7E]' : 'border-slate-200'
                              }`}>
                                {changingPermissionUser.permissionLevel === nivel && <div className="w-2.5 h-2.5 bg-[#2B4C7E] rounded-full" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <Button 
                          disabled={user?.id === changingPermissionUser.id}
                          onClick={() => {
                            handleUpdateUsersList(changingPermissionUser);
                            setChangingPermissionUser(null);
                          }}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50"
                        >
                          Salvar ✅
                        </Button>
                        <button 
                          onClick={() => setChangingPermissionUser(null)}
                          className="px-6 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Cancelar ❌
                        </button>
                      </div>
                      {user?.id === changingPermissionUser.id && (
                        <p className="text-[9px] text-red-500 font-bold uppercase text-center mt-2 italic">
                          ⚠️ Você não pode alterar sua própria permissão
                        </p>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {activeTab === 'profile' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto pt-8"
          >
            <Card className="border-none shadow-xl bg-white overflow-hidden">
              <div className="bg-[#2B4C7E] h-24 relative">
                <div className="absolute -bottom-12 left-8">
                  <div className="w-24 h-24 bg-white rounded-2xl shadow-lg flex items-center justify-center border-4 border-white">
                    <div className="w-20 h-20 bg-[#F1F4F9] rounded-xl flex items-center justify-center text-[#2B4C7E]">
                      <User className="w-10 h-10" />
                    </div>
                  </div>
                </div>
              </div>
              
              <CardContent className="pt-16 pb-8 px-8">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-[#2B4C7E] uppercase">{user.name}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">@{user.login}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="bg-[#EBA83A]/10 text-[#EBA83A] text-[10px] font-black uppercase px-3 py-1 rounded-full border border-[#EBA83A]/20">
                      {user.role}
                    </span>
                    <span className="bg-[#2B4C7E]/10 text-[#2B4C7E] text-[10px] font-black uppercase px-3 py-1 rounded-full border border-[#2B4C7E]/20">
                      Nível: {user.permissionLevel}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                  <div className="p-4 bg-[#F1F4F9] rounded-2xl border border-slate-100 italic">
                    <p className="text-[9px] uppercase font-black text-slate-400 mb-1">Área de Atuação</p>
                    <p className="text-sm font-bold text-[#2B4C7E] flex items-center gap-2">
                       <Shield className="w-4 h-4" /> {user.area}
                    </p>
                  </div>
                  <div className="p-4 bg-[#F1F4F9] rounded-2xl border border-slate-100 italic">
                    <p className="text-[9px] uppercase font-black text-slate-400 mb-1">Status da Conta</p>
                    <p className="text-sm font-bold text-green-600 flex items-center gap-2">
                       <CheckCircle2 className="w-4 h-4" /> Ativo
                    </p>
                  </div>
                </div>

                {!isChangingPassword ? (
                  <div className="flex justify-center pt-4">
                    <Button 
                      onClick={() => setIsChangingPassword(true)}
                      className="bg-white hover:bg-slate-50 text-[#2B4C7E] border-2 border-[#2B4C7E] h-12 px-8 rounded-xl font-black uppercase text-[11px] tracking-widest shadow-lg flex items-center gap-3 transition-all active:scale-95"
                    >
                      <Lock className="w-4 h-4" />
                      Alterar Senha 🔒
                    </Button>
                  </div>
                ) : (
                  <motion.form 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    onSubmit={handlePasswordChange}
                    className="bg-slate-50 p-8 rounded-3xl border border-slate-200 mt-4 space-y-6"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-black uppercase tracking-widest text-[#2B4C7E] flex items-center gap-2">
                        <Key className="w-4 h-4" /> Alteração de Senha
                      </h3>
                      <button 
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="text-slate-400 hover:text-[#2B4C7E] transition-colors"
                      >
                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 italic">Senha Atual</label>
                        <Input 
                          type={showPasswords ? "text" : "password"}
                          required
                          value={passwordForm.current}
                          onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
                          placeholder="Digite sua senha atual"
                          className="h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 italic">Nova Senha (min. 6 carac.)</label>
                        <Input 
                          type={showPasswords ? "text" : "password"}
                          required
                          value={passwordForm.new}
                          onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
                          placeholder="Digite a nova senha"
                          className="h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 pl-1 italic">Confirmar Nova Senha</label>
                        <Input 
                          type={showPasswords ? "text" : "password"}
                          required
                          value={passwordForm.confirm}
                          onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
                          placeholder="Repita a nova senha"
                          className="h-12 bg-white border-2 border-slate-100 focus:border-[#2B4C7E] rounded-xl px-4 text-xs font-bold"
                        />
                      </div>
                    </div>

                    {passwordStatus.message && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`text-[10px] font-bold uppercase p-3 rounded-xl text-center border ${
                          passwordStatus.type === 'success' 
                            ? 'bg-green-50 text-green-600 border-green-200' 
                            : 'bg-red-50 text-red-600 border-red-200'
                        }`}
                      >
                        {passwordStatus.type === 'success' ? '✅ ' : '❌ '}{passwordStatus.message}
                      </motion.div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="submit"
                        className="flex-1 h-12 bg-[#2B4C7E] hover:bg-[#1A3154] text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg transition-all active:scale-95"
                      >
                        Salvar ✅
                      </Button>
                      <Button 
                        type="button"
                        onClick={() => {
                          setIsChangingPassword(false);
                          setPasswordStatus({ type: null, message: '' });
                          setPasswordForm({ current: '', new: '', confirm: '' });
                        }}
                        className="px-6 h-12 bg-white hover:bg-slate-100 text-slate-400 border border-slate-200 font-bold uppercase tracking-widest text-[10px] rounded-xl transition-all"
                      >
                        Cancelar ❌
                      </Button>
                    </div>
                  </motion.form>
                )}
              </CardContent>
            </Card>

            <button 
              onClick={() => setActiveTab('dashboard')}
              className="mt-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#2B4C7E] transition-colors mx-auto"
            >
               <ChevronRight className="w-3 h-3 rotate-180" /> Voltar ao Painel
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
