import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { 
  LayoutDashboard, 
  BookOpen, 
  Target, 
  Bell, 
  GraduationCap,
  Clock,
  CheckCircle,
  Activity,
  MoreVertical,
  Sun,
  Moon,
  AlertTriangle,
  ListChecks,
  BarChart3,
  FileText,
  LogOut,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  Award,
  Repeat,
  User,
  Info,
  X,
  Users,
  MessageSquare,
  Paperclip,
  Send,
  Download,
  ThumbsUp,
  ThumbsDown,
  UserPlus,
  UserMinus,
  Ban,
  ShieldAlert,
  Star,
  MessageCircle,
  MoreHorizontal,
  Image,
  Code
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import Login from './Login';

/* ============ CUSTOM TOOLTIP ============ */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const mainPayloads = payload.filter((p: any) => !p.dataKey.includes('Ref'));
    const refObj = payload.find((p: any) => p.dataKey.includes('Ref'));

    // Pega a cor do último payload (o que fica por cima) ou do primeiro para a borda
    const borderColor = mainPayloads.length > 0 ? (mainPayloads[mainPayloads.length - 1].stroke || mainPayloads[mainPayloads.length - 1].fill) : 'var(--border-color)';

    return (
      <div className="glass-panel" style={{ padding: '1rem', border: `1px solid ${borderColor}`, minWidth: '150px' }}>
        <p className="text-secondary" style={{ marginBottom: '0.5rem' }}>Semestre {label?.replace('.', '/')}</p>
        
        {mainPayloads.map((p: any, idx: number) => {
          let title = p.name || p.dataKey;
          if (p.dataKey === 'passedCount') title = "Matérias Aprovadas";
          else if (p.dataKey === 'totalCount') title = "Matérias Cursadas";
          else if (p.dataKey === 'mediaApprov') title = "Média (Aprovadas)";
          else if (p.dataKey === 'freqMedia') title = "Frequência Média (%)";
          
          return (
            <p key={idx} style={{ color: p.stroke || p.fill, fontWeight: 'bold' }}>
              {title}: {p.value !== null ? p.value : '—'}
            </p>
          );
        })}

        {refObj && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
            Mínimo Recomendado: {refObj.value}
          </p>
        )}
        <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', textAlign: 'center' }}>
          Clique esquerdo para listar disciplinas
        </div>
      </div>
    );
  }
  return null;
};

/* ============ HELPER: Deduplicação ============ */
// Agrupa disciplinas pelo código. Para cada código, retorna a MELHOR tentativa
// (aprovado > reprovado, depois maior nota) e marca quantas tentativas houve.
function deduplicarDisciplinas(disciplinas: any[]) {
  const groups: Record<string, any[]> = {};
  disciplinas.forEach(d => {
    const key = d.codigo;
    if (!groups[key]) groups[key] = [];
    groups[key].push(d);
  });

  const resultado: any[] = [];
  Object.entries(groups).forEach(([codigo, tentativas]) => {
    // Ordenar: aprovados primeiro, depois por nota descrescente, depois por ano/semestre desc
    const sorted = [...tentativas].sort((a, b) => {
      const aAprov = (a.situacao || '').toLowerCase().includes('aprovado') || (a.situacao || '').toLowerCase().includes('crédito') ? 1 : 0;
      const bAprov = (b.situacao || '').toLowerCase().includes('aprovado') || (b.situacao || '').toLowerCase().includes('crédito') ? 1 : 0;
      if (aAprov !== bAprov) return bAprov - aAprov;
      const aNota = parseFloat((a.media || '').replace(',', '.')) || 0;
      const bNota = parseFloat((b.media || '').replace(',', '.')) || 0;
      if (aNota !== bNota) return bNota - aNota;
      return (b.ano || '').localeCompare(a.ano || '');
    });

    const melhor = { ...sorted[0] };
    melhor._tentativas = tentativas.length;
    melhor._historico = tentativas; // todas as tentativas
    resultado.push(melhor);
  });

  return resultado;
}

/* ============ MAIN APP ============ */
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('subjects');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [studentData, setStudentData] = useState<any>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [expandedCodigo, setExpandedCodigo] = useState<string | null>(null);
  const [equivalenciaModalOpen, setEquivalenciaModalOpen] = useState(false);
  const [selectedEquivData, setSelectedEquivData] = useState<any[]>([]);
  const [hoveredSemester, setHoveredSemester] = useState<string | null>(null);

  // Estados para o Mock do Fórum & Comunidade
  const [communityTab, setCommunityTab] = useState<'forum' | 'friends'>('forum');
  const [selectedForumSubject, setSelectedForumSubject] = useState<string>('');
  const [forumMessage, setForumMessage] = useState<string>('');
  
  // Modais de ação na comunidade
  const [actionModal, setActionModal] = useState<{type: 'upvote' | 'downvote' | 'report' | null, commentId?: number, author?: string}>({type: null});
  const [actionReason, setActionReason] = useState('');

  // Tracking de votos do usuário: { commentId: 'upvote' | 'downvote' | null }
  const [userVotes, setUserVotes] = useState<Record<number, 'upvote' | 'downvote' | null>>({});
  // Tracking de denúncias: { commentId: true }
  const [userReports, setUserReports] = useState<Record<number, boolean>>({});

  // Toast notification system
  const [toastMessage, setToastMessage] = useState<{text: string, type: 'success' | 'warning' | 'danger' | 'info'} | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const showToast = (text: string, type: 'success' | 'warning' | 'danger' | 'info' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  // Anexos pendentes na composição
  const [pendingAttachments, setPendingAttachments] = useState<{name: string, size: string}[]>([]);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileAccept, setFileAccept] = useState<string>('*/*');
  const [isDragActive, setIsDragActive] = useState(false);

  // Animação de botão votado (efeito "pop")
  const [animatingVote, setAnimatingVote] = useState<{commentId: number, type: string} | null>(null);

  const [mockComments, setMockComments] = useState<Record<string, any[]>>({
    'DEFAULT': [
      { id: 1, author: 'Maria Oliveira', date: 'Ontem, 14:30', text: 'Alguém conseguiu resolver a lista 4? Estou travada na questão 7, aquela de integral dupla.', attachments: [], upvotes: 3, downvotes: 0, reports: 0 },
      { id: 2, author: 'João Silva', date: 'Ontem, 15:05', text: 'Sim! Deu um pouco de trabalho, mas cheguei nas respostas finais. Segue o meu PDF de rascunho.', attachments: [{ name: 'Resolucao_Lista4.pdf', size: '2.4 MB' }], upvotes: 7, downvotes: 0, reports: 0 },
      { id: 3, author: 'Ana Costa', date: 'Ontem, 16:22', text: 'Obrigada João! A questão 7 era mais simples do que eu imaginava, bastava trocar a ordem de integração. Segue minha resolução também, fiz com um método alternativo.', attachments: [{ name: 'Q7_metodo_alternativo.pdf', size: '1.1 MB' }], upvotes: 5, downvotes: 0, reports: 0 },
      { id: 4, author: 'Pedro Santos', date: 'Ontem, 18:45', text: 'Galera, alguém sabe se o professor vai cobrar a demonstração do Teorema de Green na prova? Ele passou bem rápido por isso na última aula.', attachments: [], upvotes: 2, downvotes: 0, reports: 0 },
      { id: 5, author: 'Maria Oliveira', date: 'Ontem, 19:10', text: 'Pedro, ele falou que não vai cobrar demonstração, só aplicação. Mas a mudança de variável em coordenadas polares cai com certeza!', attachments: [], upvotes: 8, downvotes: 0, reports: 0 },
      { id: 6, author: 'Lucas Mendes', date: 'Hoje, 08:30', text: 'Achei um vídeo muito bom explicando coordenadas polares: youtu.be/xyz123. Vale a pena assistir antes da P2!', attachments: [], upvotes: 4, downvotes: 1, reports: 0 },
      { id: 7, author: 'Beatriz Lima', date: 'Hoje, 10:15', text: 'Montei um resumo com todas as fórmulas que o professor disse que caem na prova. Acho que vai ser útil pra todo mundo. 📝', attachments: [{ name: 'Resumo_P2_formulas.pdf', size: '890 KB' }, { name: 'Tabela_integrais.png', size: '340 KB' }], upvotes: 12, downvotes: 0, reports: 0 },
      { id: 8, author: 'Rafael Souza', date: 'Hoje, 11:42', text: 'Alguém quer formar grupo de estudos pra P2? Podemos marcar na biblioteca amanhã às 14h. Quem topar responde aqui! 🤝', attachments: [], upvotes: 6, downvotes: 0, reports: 0 }
    ]
  });

  // Mock de notas dos usuários (começam com 6.0)
  const [userRatings, setUserRatings] = useState<Record<string, number>>({
    'Maria Oliveira': 6.2,
    'João Silva': 6.9,
    'Lucas Mendes': 4.5,
    'Ana Costa': 7.8,
    'Pedro Santos': 5.9,
    'Beatriz Lima': 8.4,
    'Rafael Souza': 7.1
  });

  const [mockFriends, setMockFriends] = useState([
    { id: 1, name: 'Maria Oliveira', status: 'online', blocked: false },
    { id: 2, name: 'João Silva', status: 'offline', blocked: false },
    { id: 3, name: 'Lucas Mendes', status: 'online', blocked: true },
    { id: 4, name: 'Ana Costa', status: 'online', blocked: false },
    { id: 5, name: 'Beatriz Lima', status: 'offline', blocked: false }
  ]);
  const [activeChatFriend, setActiveChatFriend] = useState<any>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [mockPrivateMessages, setMockPrivateMessages] = useState<Record<number, any[]>>({
    1: [
      { sender: 'Maria Oliveira', text: 'Oi, tudo bem? Você vai na aula amanhã?', date: '14:20' },
      { sender: 'Maria Oliveira', text: 'O professor disse que vai ter revisão pra prova', date: '14:21' }
    ],
    4: [
      { sender: 'Ana Costa', text: 'Vi seu comentário no fórum, muito bom! 👏', date: '16:30' },
      { sender: 'Ana Costa', text: 'Quer estudar junto pra P2?', date: '16:31' }
    ]
  });
  const [semesterModalOpen, setSemesterModalOpen] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [modalContext, setModalContext] = useState<'aprovadas' | 'todas'>('todas');
  const [obrigOpen, setObrigOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [faltantesOpen, setFaltantesOpen] = useState<Record<string, boolean>>({});

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${e.clientX - 200}px, ${e.clientY - 200}px, 0)`;
      }
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  if (!isAuthenticated || !studentData) {
    return <Login onLogin={(data) => { 
      setStudentData(data);
      setIsAuthenticated(true); 
    }} />;
  }

  /* ---------- DATA MAPPING ---------- */
  const perfil = studentData.perfil || { nome: 'Aluno', curso: 'Curso', situacao: 'Regular' };
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const parseDateStr = (dStr: string) => {
    if (!dStr || dStr === '--' || dStr.toLowerCase() === 'data') return 0;
    const parts = dStr.trim().split('/');
    if (parts.length === 3) {
       return new Date(`${parts[2].trim()}-${parts[1].trim()}-${parts[0].trim()}T00:00:00`).getTime();
    }
    return 0;
  };

  const getConteudoForAvaliacao = (subject: any, currAv: any) => {
    if (!subject.planejamento || subject.planejamento.length === 0) return ['Conteúdo não disponibilizado.'];
    
    const sortedEvals = [...subject.avaliacoes]
      .filter(a => a.data && a.data.toLowerCase() !== 'data' && a.peso?.toLowerCase() !== 'peso')
      .filter(a => parseDateStr(a.data) > 0)
      .sort((a, b) => parseDateStr(a.data) - parseDateStr(b.data));
      
    const sortedIndex = sortedEvals.findIndex(x => x.avaliacao === currAv.avaliacao && x.data === currAv.data);
    
    const currDate = parseDateStr(currAv.data);
    const prevDate = sortedIndex > 0 ? parseDateStr(sortedEvals[sortedIndex - 1].data) : 0;
    
    if (currDate === 0) return ['Data da avaliação não definida no planejamento.'];
    
    const contents = subject.planejamento.filter((p: any) => {
       const pDate = parseDateStr(p.data);
       if (pDate === 0) return false;
       const txt = p.conteudo ? p.conteudo.toLowerCase().trim() : '';
       
       return pDate > prevDate && pDate <= currDate && p.conteudo.trim() !== '' && txt !== 'conteúdo previsto';
    }).map((p: any) => {
       let cleanCont = p.conteudo;
       cleanCont = cleanCont.replace(/Apresentação da disciplina\.?\s*/gi, '');
       cleanCont = cleanCont.replace(/Revisão para a( \w+)? avaliação\.?\s*/gi, '');
       return cleanCont.trim();
    }).filter((c: string) => c !== '');
    
    if (contents.length === 0) {
      return ['Nenhum conteúdo específico encontrado para este período.'];
    }
    return contents;
  };

  // Disciplinas atuais (boletim ou matriculadas)
  let subjectsData = (studentData.boletim || []).map((d: any) => {
    let patchedAvaliacoes = d.avaliacoes || [];
    if (d.planejamento && patchedAvaliacoes.length > 0) {
       patchedAvaliacoes = patchedAvaliacoes.map((av: any) => {
          const avName = av.avaliacao.toLowerCase().trim();
          
          // Muitos professores lançam a data na aba de "Avaliações e Notas" apenas quando vão postar a nota.
          // A data real da prova costuma estar no Planejamento de Aula.
          // Vamos procurar o nome da avaliação no planejamento para usar a data real!
          const planMatch = d.planejamento.find((p: any) => {
             if (!p.conteudo) return false;
             const pCont = p.conteudo.toLowerCase().trim();
             
             if (pCont === avName) return true;
             
             // Se começar com o nome e for curto (ex: "Avaliação 1 - Teórica")
             if (pCont.startsWith(avName) && pCont.length < avName.length + 15) return true;
             
             // Se contiver o nome, mas não for revisão/entrega e for curto
             if (pCont.includes(avName) && !pCont.includes('revisão') && !pCont.includes('revisao') && !pCont.includes('entrega') && pCont.length < avName.length + 20) return true;
             
             return false;
          });

          if (planMatch && planMatch.data) {
             return { ...av, data: planMatch.data };
          }
          
          return av;
       });
    }

    return {
      name: d.disciplina,
      code: d.codigo,
      progress: parseInt(d.frequencia) || 0,
      media: parseFloat(d.mediaParcial?.replace(',', '.')) || 0,
      rawMedia: d.mediaParcial || '',
      freq: parseInt(d.frequencia) || 0,
      situacao: d.situacao,
      avaliacoes: patchedAvaliacoes,
      professores: d.professores || [],
      planejamento: d.planejamento || [],
      planoEnsino: d.planoEnsino || ''
    };
  });

  if (subjectsData.length === 0 && studentData.historico?.matriculadas) {
    subjectsData = studentData.historico.matriculadas.map((m: any) => ({
      name: m.disciplina,
      code: m.codigo,
      progress: 0,
      media: 0,
      freq: 0,
      situacao: m.situacao,
      avaliacoes: [],
      professores: [],
      planejamento: [],
      planoEnsino: ''
    }));
  }

  const atividadesExtensionistas = studentData.historico?.atividadesExtensionistas || [];

  /* ---------- HISTÓRICO DATA (com dedup) ---------- */
  const obrigatoriasRaw: any[] = studentData.historico?.obrigatoriasCursadas || [];
  const optativasRaw = studentData.historico?.optativasCursadas || [];
  const faltantes = studentData.historico?.faltantes || [];
  const equivalenciasRaw = studentData.historico?.equivalencias || [];
  const resumoOptativas = studentData.historico?.resumoOptativas || { obrigatoria: 0, cursada: 0 };
  const chtGeral = studentData.historico?.chtGeral;
  const chtExtensionista = studentData.historico?.chtExtensionista;
  const chtExtensionistaDetalhado = studentData.historico?.chtExtensionistaDetalhado;
  // Deduplicar: só conta a MELHOR tentativa por disciplina
  const obrigatorias = deduplicarDisciplinas(obrigatoriasRaw);
  const optativas = deduplicarDisciplinas(optativasRaw);

  // Somente as aprovadas para cálculos
  const obrigatoriasAprovadas = obrigatorias.filter(d => {
    const sit = (d.situacao || '').toLowerCase();
    return sit.includes('aprovado') || sit.includes('crédito') || sit.includes('equivalência');
  });
  const optativasAprovadas = optativas.filter(d => {
    const sit = (d.situacao || '').toLowerCase();
    return sit.includes('aprovado') || sit.includes('crédito') || sit.includes('equivalência');
  });

  const todasAprovadas = [...obrigatoriasAprovadas, ...optativasAprovadas];

  /* ---------- CRA (Média Geral) - só aprovadas ---------- */
  let craSoma = 0;
  let totalMateriasValidas = 0;
  todasAprovadas.forEach((d: any) => {
    const nota = parseFloat(d.media?.replace(',', '.'));
    if (!isNaN(nota) && nota > 0) {
      craSoma += nota;
      totalMateriasValidas++;
    }
  });
  const cra = totalMateriasValidas > 0 ? craSoma / totalMateriasValidas : 0;

  // Modal handlers
  const handleOpenEquivalencia = (codigoObrigatoria: string) => {
    // A disciplina cursada que tem equivalência vai ter um ou mais registros correspondentes na tabela de equivalências
    const directMatches = equivalenciasRaw.filter((e: any) => e.codigoObrigatoria === codigoObrigatoria);
    if (directMatches.length > 0) {
      // Pegar todas as matérias equivalentes relacionadas e puxar TODO o pacote que elas convalidam
      const codigosEquiv = Array.from(new Set(directMatches.map((e: any) => e.codigoEquivalente)));
      const fullPackage = equivalenciasRaw.filter((e: any) => codigosEquiv.includes(e.codigoEquivalente));
      setSelectedEquivData(fullPackage);
      setEquivalenciaModalOpen(true);
    }
  };

  /* ---------- RENDERERS ---------- */
  const totalObrigatorias = obrigatoriasAprovadas.length + faltantes.length;
  const progressoObrigatorias = totalObrigatorias > 0 ? (obrigatoriasAprovadas.length / totalObrigatorias) * 100 : 0;

  /* ---------- FREQUÊNCIA MÉDIA ---------- */
  let freqTotal = 0;
  let freqCount = 0;
  subjectsData.forEach((s: any) => {
    if (s.freq > 0 && !(s.situacao || '').toLowerCase().includes('cancelado')) { 
      freqTotal += s.freq; 
      freqCount++; 
    }
  });
  const freqMedia = freqCount > 0 ? Math.round(freqTotal / freqCount) : 0;

  /* ---------- DISCIPLINAS COM REPETÊNCIA ---------- */
  const disciplinasRepetidas = [...obrigatorias, ...optativas].filter(d => d._tentativas > 1);

  /* ---------- GRÁFICO EVOLUÇÃO (Estatísticas por Semestre) ---------- */
  const semestresMap: Record<string, {
    totalCount: number, passedCount: number,
    totalNotasApprov: number, countApprov: number,
    totalFreq: number, countFreq: number
  }> = {};

  const processSub = (sub: any, isEquiv = false) => {
    let sem = null;
    let nota = NaN;
    let sit = (isEquiv ? sub.situacaoEquivalente : sub.situacao) || '';
    
    let freq = NaN;
    if (isEquiv) {
      if (sub.anoPeriodoEquivalente) sem = sub.anoPeriodoEquivalente.replace('/', '.');
      nota = parseFloat(sub.notaEquivalente?.replace(',', '.'));
      const fStr = (sub.freqEquivalente || '').toString().trim();
      if (fStr !== '' && fStr !== '—' && fStr !== '-') freq = parseFloat(fStr.replace(',', '.'));
    } else {
      if (!sub.ano || !sub.semestre) return;
      sem = `${sub.ano}.${sub.semestre}`;
      nota = parseFloat(sub.media?.replace(',', '.'));
      const fStr = (sub.freq || sub.frequencia || '').toString().trim();
      if (fStr !== '' && fStr !== '—' && fStr !== '-') freq = parseFloat(fStr.replace(',', '.'));
      
      const isValidationAdminEntry = sit.toLowerCase().includes('crédito') || sit.toLowerCase().includes('equivalência') || sit.toLowerCase().includes('matriz');
      if (isValidationAdminEntry) return; // Skip administrative rows in native tables; their true trajectory is in equivalenciasRaw!
    }

    if (sit.toLowerCase().includes('cancelado')) return;

    if (!sem) return;

    // Se for matéria de férias (ex: 2024.0), mescla no primeiro semestre do mesmo ano
    if (sem.endsWith('.0')) {
      sem = sem.replace('.0', '.1');
    }

    if (!semestresMap[sem]) semestresMap[sem] = { totalCount: 0, passedCount: 0, totalNotasApprov: 0, countApprov: 0, totalFreq: 0, countFreq: 0 };
    
    semestresMap[sem].totalCount += 1;

    if (isNaN(nota) && sit.toLowerCase().includes('reprovado')) nota = 0.0;
    const isApproved = sit.toLowerCase().includes('aprovado') || sit.toLowerCase().includes('crédito') || sit.toLowerCase().includes('equivalência');

    if (isApproved) {
      semestresMap[sem].passedCount += 1;
      if (!isNaN(nota) && nota >= 0) {
        semestresMap[sem].totalNotasApprov += nota;
        semestresMap[sem].countApprov += 1;
      }
    }

    if (!isNaN(freq)) {
      semestresMap[sem].totalFreq += freq;
      semestresMap[sem].countFreq += 1;
    }
  };

  [...obrigatoriasRaw, ...optativasRaw].forEach(s => processSub(s, false));

  const processedEquivs = new Set();
  equivalenciasRaw.forEach((e: any) => {
    const key = `${e.codigoEquivalente}-${e.anoPeriodoEquivalente}`;
    if (!processedEquivs.has(key)) {
      processedEquivs.add(key);
      processSub(e, true);
    }
  });

  const evolutionData = Object.keys(semestresMap).sort().map(key => {
    const s = semestresMap[key];
    return {
      semester: key.replace('.', '/'),
      totalCount: s.totalCount,
      passedCount: s.passedCount,
      mediaApprov: s.countApprov > 0 ? parseFloat((s.totalNotasApprov / s.countApprov).toFixed(1)) : 0,
      freqMedia: s.countFreq > 0 ? Math.round(s.totalFreq / s.countFreq) : 0,
      mediaRef: 6.0,
      freqRef: 75
    };
  });

  /* ---------- SIDEBAR NAV ---------- */
  const navItems = [
    { id: 'subjects', label: 'Matérias', icon: BookOpen },
    { id: 'historico', label: 'Histórico', icon: BarChart3 },
    { id: 'faltantes', label: 'Pendências', icon: AlertTriangle },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'goals', label: 'Comunidade', icon: Users },
  ];

  /* ---------- STATUS HELPER ---------- */
  const getStatusClass = (situacao: string) => {
    const s = (situacao || '').toLowerCase();
    if (s.includes('aprovado') || s.includes('crédito') || s.includes('equivalência')) return 'aprovado';
    if (s.includes('reprovado')) return 'reprovado';
    if (s.includes('cancelado')) return 'pendente';
    return 'pendente';
  };

  const formatSituacao = (situacao: string) => {
    const s = (situacao || '');
    if (s.includes('Aprovado Por Nota/Frequência') || s.includes('Aprovado por Nota/Frequência')) return 'Aprovado';
    if (s.includes('Crédito Consignado')) return 'Crédito';
    if (s.includes('Reprovado Por Nota')) return 'Reprov. Nota';
    if (s.includes('Reprovado por Nota/Frequência') || s.includes('Reprovado Por Nota/Frequência')) return 'Reprov. Nota/Freq';
    if (s.includes('Cancelado')) return 'Cancelado';
    if (s.includes('Equivalência')) return 'Equivalência';
    return s.length > 20 ? s.substring(0, 18) + '…' : s;
  };

  /* ============ RENDER: Linha expandível com histórico ============ */
  const renderDisciplinaRow = (d: any, idx: number, showProfessor: boolean = true) => {
    let nota = parseFloat(d.media?.replace(',', '.'));
    if (isNaN(nota) && (d.situacao || '').toLowerCase().includes('reprovado')) {
      nota = 0.0;
    }
    const isExpanded = expandedCodigo === d.codigo;
    const hasMultiple = d._tentativas > 1;

    const sitLower = (d.situacao || '').toLowerCase();
    const isEquivalencia = sitLower.includes('equivalente') || sitLower.includes('matriz') || sitLower.includes('crédito consignado');
    const isClickable = hasMultiple || isEquivalencia;
    
    return (
      <React.Fragment key={`${d.codigo}-${idx}`}>
        <tr 
          style={{ 
            cursor: isClickable ? 'pointer' : 'default',
            borderLeft: isEquivalencia ? '3px solid var(--accent-info)' : (hasMultiple ? '3px solid var(--accent-warning)' : 'none'),
            background: 'transparent'
          }}
          onClick={() => {
            if (isEquivalencia) {
              handleOpenEquivalencia(d.codigo);
            } else if (hasMultiple) {
              setExpandedCodigo(isExpanded ? null : d.codigo);
            }
          }}
        >
          <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {d.codigo}
            {hasMultiple && !isEquivalencia && (
              <span className="faltante-badge" style={{ marginLeft: '0.5rem', background: 'rgba(255, 204, 0, 0.15)', color: 'var(--accent-warning)' }}>
                <Repeat size={10} />
                {d._tentativas}x
              </span>
            )}
            {isEquivalencia && (
              <span className="faltante-badge" style={{ marginLeft: '0.5rem', background: 'rgba(0, 195, 255, 0.15)', color: 'var(--accent-info)' }}>
                <Info size={10} />
                Equiv
              </span>
            )}
          </td>
          <td style={{ fontWeight: 500 }}>{d.disciplina}</td>
          <td>
            <span style={{ fontWeight: 700, color: nota >= 6 ? 'var(--accent-success)' : nota >= 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
              {(!isNaN(nota) && nota >= 0) ? nota.toFixed(1) : '—'}
            </span>
          </td>
          <td>{d.ano && d.semestre ? `${d.ano}.${d.semestre}` : '—'}</td>
          {showProfessor && (
            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {d.professor || '—'}
            </td>
          )}
          <td>
            {!isEquivalencia ? (
              <span className={`status-badge ${getStatusClass(d.situacao)}`}>
                {formatSituacao(d.situacao)}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
            )}
          </td>
          {hasMultiple && (
            <td style={{ width: '30px' }}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </td>
          )}
        </tr>
        {/* Tentativas expandidas */}
        {isExpanded && hasMultiple && d._historico?.map((t: any, tIdx: number) => {
          let tNotaVal = parseFloat(t.media?.replace(',', '.'));
          if (isNaN(tNotaVal) && (t.situacao || '').toLowerCase().includes('reprovado')) {
            tNotaVal = 0.0;
          }
          return (
            <tr key={`${d.codigo}-t${tIdx}`} style={{ background: 'var(--bg-secondary)', opacity: 0.75, fontSize: '0.85rem' }}>
              <td style={{ paddingLeft: '2rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>↳ tentativa {tIdx + 1}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{t.disciplina}</td>
              <td>
                <span style={{ fontWeight: 700, color: tNotaVal >= 6 ? 'var(--accent-success)' : tNotaVal >= 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
                  {(!isNaN(tNotaVal) && tNotaVal >= 0) ? t.media : '—'}
                </span>
              </td>
              <td>{t.ano && t.semestre ? `${t.ano}.${t.semestre}` : '—'}</td>
              {showProfessor && <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t.professor || '—'}</td>}
              <td><span className={`status-badge ${getStatusClass(t.situacao)}`}>{formatSituacao(t.situacao)}</span></td>
              {hasMultiple && <td></td>}
            </tr>
          );
        })}
      </React.Fragment>
    );
  };

  const renderDisciplinaCard = (d: any, idx: number) => {
    let nota = parseFloat(d.media?.replace(',', '.'));
    if (isNaN(nota) && (d.situacao || '').toLowerCase().includes('reprovado')) {
      nota = 0.0;
    }
    const isExpanded = expandedCodigo === d.codigo;
    const hasMultiple = d._tentativas > 1;

    const sitLower = (d.situacao || '').toLowerCase();
    const isEquivalencia = sitLower.includes('equivalente') || sitLower.includes('matriz') || sitLower.includes('crédito consignado');
    const isClickable = hasMultiple || isEquivalencia;

    return (
      <div 
        key={`${d.codigo}-${idx}`} 
        className="glass-panel" 
        style={{ 
          padding: '1.5rem', 
          cursor: isClickable ? 'pointer' : 'default',
          borderTop: isEquivalencia ? '4px solid var(--accent-info)' : (hasMultiple ? '4px solid var(--accent-warning)' : '4px solid transparent'),
          gridColumn: isExpanded ? '1 / -1' : 'auto',
          transition: 'all 0.3s ease',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={() => {
          if (isEquivalencia) {
            handleOpenEquivalencia(d.codigo);
          } else if (hasMultiple) {
            setExpandedCodigo(isExpanded ? null : d.codigo);
          }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {d.codigo}
            {hasMultiple && !isEquivalencia && (
              <span className="faltante-badge" style={{ marginLeft: '0.5rem', background: 'rgba(255, 204, 0, 0.15)', color: 'var(--accent-warning)' }}>
                <Repeat size={10} style={{ verticalAlign: 'middle' }} /> {d._tentativas}x
              </span>
            )}
            {isEquivalencia && (
              <span className="faltante-badge" style={{ marginLeft: '0.5rem', background: 'rgba(0, 195, 255, 0.15)', color: 'var(--accent-info)' }}>
                <Info size={10} style={{ verticalAlign: 'middle' }} /> Equiv
              </span>
            )}
          </span>
          {!isEquivalencia ? (
            <span className={`status-badge ${getStatusClass(d.situacao)}`}>
              {formatSituacao(d.situacao)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Equivalência</span>
          )}
        </div>
        
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', lineHeight: 1.3 }}>{d.disciplina}</h3>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média Final</p>
            <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: nota >= 6 ? 'var(--accent-success)' : nota >= 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
              {(!isNaN(nota) && nota >= 0) ? nota.toFixed(1) : '—'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{d.ano && d.semestre ? `${d.ano}.${d.semestre}` : '—'}</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.professor ? (d.professor.length > 20 ? d.professor.substring(0,18)+'…' : d.professor) : '—'}</p>
          </div>
        </div>

        {isExpanded && hasMultiple && (
          <div className="animate-fade-in" style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
            <h4 style={{ marginBottom: '0.8rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Histórico de Tentativas</h4>
            {d._historico?.map((t: any, tIdx: number) => {
              let tNotaVal = parseFloat(t.media?.replace(',', '.'));
              if (isNaN(tNotaVal) && (t.situacao || '').toLowerCase().includes('reprovado')) {
                tNotaVal = 0.0;
              }
              return (
                <div key={`${d.codigo}-t${tIdx}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formatSituacao(t.situacao)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t.ano && t.semestre ? `${t.ano}.${t.semestre}` : '—'} • {t.professor || 'Sem prof.'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1.1rem', color: tNotaVal >= 6 ? 'var(--accent-success)' : tNotaVal >= 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
                      {(!isNaN(tNotaVal) && tNotaVal >= 0) ? t.media : '—'}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderDashboard = () => {
    let chartTicks = undefined;
    if (evolutionData && evolutionData.length > 0) {
      const first = evolutionData[0].semester;
      const last = evolutionData[evolutionData.length - 1].semester;
      chartTicks = Array.from(new Set([first, last]));
    }

    return (
    <>
      {/* KPIs */}
      {/* Charts */}
      <section className="charts-grid animate-fade-in" style={{ animationDelay: '0.2s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* CHART 1: APROVAÇÕES (AMARELO) */}
          <div className="glass-panel chart-container">
            <div className="chart-header">
              <h2 className="chart-title">Evolução Acadêmica (Aprovações)</h2>
              <MoreVertical size={20} className="text-secondary" style={{ cursor: 'pointer' }} />
            </div>
            <div 
              className="chart-body"
              onClick={(e) => {
                if (hoveredSemester) {
                  setSelectedSemester(hoveredSemester);
                  setModalContext('todas');
                  setSemesterModalOpen(true);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={evolutionData.length > 0 ? evolutionData : ([] as any[])} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onMouseMove={(e: any) => {
                    if (e && e.activeLabel) setHoveredSemester(e.activeLabel);
                  }}
                  onMouseLeave={() => setHoveredSemester(null)}
                >
                  <defs>
                    <linearGradient id="colorYellow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBlueMuted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-info)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--accent-info)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="semester" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val?.replace('.', '/')} ticks={chartTicks} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="totalCount" name="Matérias Cursadas" stroke="var(--accent-info)" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorBlueMuted)" connectNulls animationDuration={2500} />
                  <Area type="monotone" dataKey="passedCount" name="Matérias Aprovadas" stroke="var(--accent-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorYellow)" connectNulls animationDuration={2500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* CHART 2: MÉDIA DAS APROVADAS (VERDE) */}
          <div className="glass-panel chart-container theme-green">
            <div className="chart-header">
              <h2 className="chart-title">Média (Apenas Aprovadas)</h2>
            </div>
            <div 
              className="chart-body"
              onClick={(e) => {
                if (hoveredSemester) {
                  setSelectedSemester(hoveredSemester);
                  setModalContext('aprovadas');
                  setSemesterModalOpen(true);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={evolutionData.length > 0 ? evolutionData : ([] as any[])} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onMouseMove={(e: any) => {
                    if (e && e.activeLabel) setHoveredSemester(e.activeLabel);
                  }}
                  onMouseLeave={() => setHoveredSemester(null)}
                >
                  <defs>
                    <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-success)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--accent-success)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="semester" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val?.replace('.', '/')} ticks={chartTicks} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 10]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="mediaRef" stroke="var(--text-muted)" strokeDasharray="5 5" fill="none" strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="mediaApprov" stroke="var(--accent-success)" strokeWidth={3} fillOpacity={1} fill="url(#colorGreen)" animationDuration={2500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CHART 3: FREQUÊNCIA MÉDIA (AZUL) */}
          <div className="glass-panel chart-container theme-blue">
            <div className="chart-header">
              <h2 className="chart-title">Frequência Média (%)</h2>
            </div>
            <div 
              className="chart-body"
              onClick={(e) => {
                if (hoveredSemester) {
                  setSelectedSemester(hoveredSemester);
                  setModalContext('todas');
                  setSemesterModalOpen(true);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={evolutionData.length > 0 ? evolutionData : ([] as any[])} 
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onMouseMove={(e: any) => {
                    if (e && e.activeLabel) setHoveredSemester(e.activeLabel);
                  }}
                  onMouseLeave={() => setHoveredSemester(null)}
                >
                  <defs>
                    <linearGradient id="colorBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-info)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--accent-info)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="semester" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val?.replace('.', '/')} ticks={chartTicks} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="freqRef" stroke="var(--text-muted)" strokeDasharray="5 5" fill="none" strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="freqMedia" stroke="var(--accent-info)" strokeWidth={3} fillOpacity={1} fill="url(#colorBlue)" animationDuration={2500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          </div>
          
          {/* Quadro Resumo Atividades Extensionistas */}
          {chtExtensionistaDetalhado && chtExtensionistaDetalhado.length > 0 && (
            <div className="glass-panel" style={{ padding: '1.5rem', margin: 0 }}>
              <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Quadro Resumo Atividades Extensionistas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {chtExtensionistaDetalhado.map((a: any, idx: number) => {
                  let percentage = 0;
                  const total = parseInt(a.total) || 0;
                  const cursada = parseInt(a.cursada) || 0;
                  const faltante = parseInt(a.faltante) || 0;
                  const isOk = (a.situacao || '').toLowerCase() === 'ok' || (a.situacao || '').toLowerCase().includes('cumprido');
                  
                  if (isOk) {
                    percentage = 100;
                  } else if (total > 0) {
                    percentage = Math.min(100, Math.round((cursada / total) * 100));
                  }

                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.9rem', maxWidth: '80%', lineHeight: '1.3' }}>{a.tipo}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isOk ? 'var(--accent-success)' : 'inherit' }}>
                          {isOk ? 'OK' : `${percentage}%`}
                        </span>
                      </div>
                      <div className="progress-bar-container" style={{ height: '8px', marginBottom: '0.4rem' }}>
                        <div className="progress-bar-fill" style={{ width: `${percentage}%`, background: isOk ? 'var(--accent-success)' : 'var(--accent-warning)' }}></div>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {cursada}h concluídas / {total}h total
                        {faltante > 0 && ` • Falta ${faltante}h`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel chart-container" style={{ margin: 0 }}>
            <div className="chart-header">
              <h2 className="chart-title">Resumo Rápido</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GraduationCap size={18} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Média Geral (CRA)</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{cra.toFixed(1)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={18} style={{ color: 'var(--accent-info)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Frequência Média</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-info)' }}>{freqMedia > 0 ? `${freqMedia}%` : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Award size={18} style={{ color: 'var(--text-primary)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Obrigatórias Aprovadas</span>
                </div>
                <span style={{ fontWeight: 700 }}>{obrigatoriasAprovadas.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ListChecks size={18} style={{ color: 'var(--text-primary)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Optativas Aprovadas</span>
                </div>
                <span style={{ fontWeight: 700 }}>{optativasAprovadas.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--accent-danger)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Obrigatórias Faltantes</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-danger)' }}>{faltantes.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Repeat size={18} style={{ color: 'var(--accent-warning)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Disciplinas Repetidas</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-warning)' }}>{disciplinasRepetidas.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BookOpen size={18} style={{ color: 'var(--accent-success)' }} />
                  <span style={{ fontSize: '0.9rem' }}>Cursando Agora</span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-success)' }}>{subjectsData.length}</span>
              </div>
            </div>
          </div>

          {/* Progresso visual geral */}
          <div className="glass-panel" style={{ padding: '1.5rem', margin: 0 }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Progresso Geral da Graduação</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem' }}>Obrigatórias</span>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{Math.round(progressoObrigatorias)}%</span>
              </div>
              <div className="progress-bar-container" style={{ height: '8px', marginBottom: '0.4rem' }}>
                <div className="progress-bar-fill" style={{ width: `${Math.round(progressoObrigatorias)}%` }}></div>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{obrigatoriasAprovadas.length} concluídas / {totalObrigatorias} total</div>
            </div>

            {resumoOptativas.obrigatoria > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>Optativas (CH)</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{Math.min(100, Math.round((resumoOptativas.cursada / resumoOptativas.obrigatoria) * 100))}%</span>
                </div>
                <div className="progress-bar-container" style={{ height: '8px', marginBottom: '0.4rem' }}>
                  <div className="progress-bar-fill" style={{ width: `${Math.min(100, (resumoOptativas.cursada / resumoOptativas.obrigatoria) * 100)}%` }}></div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{resumoOptativas.cursada}h concluídas / {resumoOptativas.obrigatoria}h total</div>
              </div>
            )}
            
            {chtGeral && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>CHT Geral do curso</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{Math.min(100, Math.round((chtGeral.cursada / chtGeral.total) * 100)) || 0}%</span>
                </div>
                <div className="progress-bar-container" style={{ height: '8px', marginBottom: '0.4rem' }}>
                  <div className="progress-bar-fill" style={{ width: `${Math.min(100, (chtGeral.cursada / chtGeral.total) * 100) || 0}%`, background: 'var(--accent-primary)' }}></div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{chtGeral.cursada}h concluídas / {chtGeral.total}h total</div>
              </div>
            )}
          </div>

        </div>
      </section>
    </>
    );
  };

  const renderSubjects = () => (
    <section className="animate-fade-in">
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>
        <BookOpen size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Disciplinas em Andamento ({subjectsData.length})
      </h2>
      {subjectsData.length === 0 ? (
        <div className="empty-state glass-panel" style={{ padding: '4rem' }}>
          <BookOpen size={48} />
          <p>Nenhuma disciplina encontrada no boletim atual.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {subjectsData.map((s: any, idx: number) => {
            const isExpanded = expandedSubject === s.code;
            return (
              <div 
                key={idx} 
                className="glass-panel" 
                style={{ 
                  padding: '1.5rem', 
                  cursor: 'pointer',
                  borderTop: isExpanded ? '4px solid var(--accent-primary)' : '4px solid transparent',
                  gridColumn: isExpanded ? '1 / -1' : 'auto',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div onClick={() => setExpandedSubject(isExpanded ? null : s.code)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.code}</span>
                    <span className={`status-badge ${getStatusClass(s.situacao)}`}>
                      {s.situacao || 'Cursando'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.2rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{s.name}</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média Parcial</p>
                      {s.rawMedia && (s.rawMedia.includes('[0/') || (!s.rawMedia.includes('[') && s.media === 0)) ? (
                        <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.25rem' }}>-/-</span>
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: '1.25rem', color: s.media >= 6 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                          {!isNaN(s.media) ? s.media.toFixed(1) : '—'}
                        </span>
                      )}
                    </div>
                    <div style={{ width: '1px', height: '30px', background: 'var(--border-color)' }}></div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Frequência</p>
                      <span style={{ 
                        fontWeight: 700, fontSize: '1.25rem',
                        color: s.freq > 80 ? 'var(--accent-success)' : 
                               (s.freq >= 75 && s.freq <= 80) ? 'var(--accent-warning)' : 
                               (s.freq > 0 && s.freq < 75) ? 'var(--accent-danger)' : 
                               'var(--text-primary)' 
                      }}>
                        {s.freq > 0 ? `${s.freq}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="animate-fade-in" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                      
                      {/* Notas */}
                      <div className="glass-panel" style={{ padding: '1.2rem', background: 'var(--bg-color)' }}>
                        <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          <Target size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                          Avaliações e Notas <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.7 }}>(Clique para conteúdo)</span>
                        </h4>
                        {s.avaliacoes && s.avaliacoes.length > 0 ? (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.85rem' }}>
                              <thead>
                                <tr style={{ color: 'var(--text-muted)' }}>
                                  <th style={{ textAlign: 'left', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>Data</th>
                                  <th style={{ textAlign: 'left', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>Avaliação</th>
                                  <th style={{ textAlign: 'right', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>Peso</th>
                                  <th style={{ textAlign: 'right', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>Nota</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.avaliacoes.filter((a: any) => a.data && a.data.toLowerCase() !== 'data' && a.peso?.toLowerCase() !== 'peso').map((av: any, avIdx: number) => (
                                  <React.Fragment key={avIdx}>
                                    <tr 
                                      style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                                      onClick={() => setExpandedEval(expandedEval === `${s.code}-${av.avaliacao}` ? null : `${s.code}-${av.avaliacao}`)}
                                      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                      <td style={{ paddingTop: '0.8rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--border-light)' }}>{av.data}</td>
                                      <td style={{ paddingTop: '0.8rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--border-light)', color: 'var(--accent-info)', fontWeight: 500 }}>{av.avaliacao}</td>
                                      <td style={{ textAlign: 'right', paddingTop: '0.8rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--border-light)' }}>{av.peso}</td>
                                      <td style={{ textAlign: 'right', paddingTop: '0.8rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--border-light)', fontWeight: 'bold' }}>{av.nota}</td>
                                    </tr>
                                    {expandedEval === `${s.code}-${av.avaliacao}` && (
                                      <tr style={{ background: 'var(--bg-secondary)' }}>
                                        <td colSpan={4} style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                          <strong style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'block' }}>Conteúdo Abordado:</strong>
                                          {getConteudoForAvaliacao(s, av).map((c: string, idx: number) => (
                                            <div key={idx} style={{ marginBottom: '0.4rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--accent-info)', lineHeight: 1.4 }}>{c}</div>
                                          ))}
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhuma avaliação encontrada.</p>
                        )}
                      </div>

                      {/* Professores & Conteúdo */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div className="glass-panel" style={{ padding: '1.2rem', background: 'var(--bg-color)' }}>
                          <h4 style={{ marginBottom: '0.8rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <User size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                            Professores
                          </h4>
                          {s.professores && s.professores.length > 0 ? (
                            <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem', margin: 0, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                              {s.professores.map((prof: string, pIdx: number) => (
                                <li key={pIdx}>{prof}</li>
                              ))}
                            </ul>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Dados não disponíveis.</p>
                          )}
                        </div>

                        <div className="glass-panel" style={{ padding: '1.2rem', background: 'var(--bg-color)', flex: 1 }}>
                          <h4 style={{ marginBottom: '0.8rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                            Ementa / Conteúdo
                          </h4>
                          {s.planoEnsino ? (
                            <ul style={{ fontSize: '0.85rem', paddingLeft: '1.2rem', margin: 0, maxHeight: '200px', overflowY: 'auto', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                              {s.planoEnsino.split('\n').map((linha: string, idx: number) => {
                                if (linha.trim().startsWith('- ')) {
                                  return <li key={idx} style={{ marginBottom: '0.3rem' }}>{linha.substring(2)}</li>;
                                }
                                return <div key={idx} style={{ marginBottom: '0.3rem' }}>{linha}</div>;
                              })}
                            </ul>
                          ) : (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Ementa não extraída.</p>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderHistorico = () => (
    <section className="animate-fade-in">
      <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>
        <BarChart3 size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
        Histórico Acadêmico Completo
      </h2>
      <p className="text-secondary" style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Disciplinas com borda <span style={{ color: 'var(--accent-warning)' }}>amarela</span> foram cursadas mais de uma vez. Clique para expandir.
      </p>
      
      {/* Obrigatórias */}
      <div 
        className="glass-panel theme-green"
        style={{ marginBottom: '1rem', padding: '1.2rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.3s ease' }}
        onClick={() => setObrigOpen(!obrigOpen)}
      >
        <CheckCircle size={20} style={{ marginRight: '0.8rem', color: 'var(--accent-success)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          Obrigatórias Cursadas ({obrigatorias.length} disciplinas únicas)
        </h3>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{obrigOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
      </div>

      {obrigOpen && (
        obrigatorias.length > 0 ? (
          <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Disciplina</th>
                  <th>Média</th>
                  <th>Período</th>
                  <th>Professor</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {obrigatorias.map((d: any, idx: number) => renderDisciplinaRow(d, idx, true))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="glass-panel empty-state" style={{ marginBottom: '2rem' }}>
            <FileText size={32} />
            <p>Nenhuma obrigatória cursada encontrada.</p>
          </div>
        )
      )}

      {/* Optativas */}
      <div 
        className="glass-panel theme-blue"
        style={{ marginBottom: '1rem', padding: '1.2rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.3s ease' }}
        onClick={() => setOptOpen(!optOpen)}
      >
        <ListChecks size={20} style={{ marginRight: '0.8rem', color: 'var(--accent-info)' }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          Optativas Cursadas ({optativas.length} disciplinas únicas)
        </h3>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{optOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
      </div>

      {optOpen && (
        optativas.length > 0 ? (
          <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto', marginBottom: '2rem', background: 'rgba(255,255,255,0.02)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Disciplina</th>
                  <th>Média</th>
                  <th>Período</th>
                  <th>Professor</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {optativas.map((d: any, idx: number) => renderDisciplinaRow(d, idx, true))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="glass-panel empty-state">
            <FileText size={32} />
            <p>Nenhuma optativa cursada encontrada.</p>
          </div>
        )
      )}
    </section>
  );

  const renderFaltantes = () => {
    // Group faltantes by semestre
    const faltantesPorSemestre: Record<string, any[]> = {};
    faltantes.forEach((f: any) => {
      const sem = f.semestre || 'Sem Período';
      if (!faltantesPorSemestre[sem]) faltantesPorSemestre[sem] = [];
      faltantesPorSemestre[sem].push(f);
    });

    const semestres = Object.keys(faltantesPorSemestre).sort((a, b) => {
      if (a === 'Sem Período') return 1;
      if (b === 'Sem Período') return -1;
      return parseInt(a) - parseInt(b);
    });

    return (
      <section className="animate-fade-in">
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>
          <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: 'var(--accent-warning)' }} />
          Disciplinas Obrigatórias Pendentes
        </h2>
        <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
          {faltantes.length > 0 ? `Você ainda tem ${faltantes.length} disciplinas obrigatórias para concluir.` : 'Parabéns! Todas as obrigatórias foram concluídas.'}
        </p>

        {faltantes.length > 0 ? (
          semestres.map((sem) => {
            const materias = faltantesPorSemestre[sem];
            const isOpen = faltantesOpen[sem] === true;

            return (
              <div key={sem} style={{ marginBottom: '1rem' }}>
                <div 
                  className="glass-panel"
                  style={{ padding: '1.2rem 1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.3s ease' }}
                  onClick={() => setFaltantesOpen(prev => ({ ...prev, [sem]: !prev[sem] }))}
                >
                  <Calendar size={20} style={{ marginRight: '0.8rem', color: 'var(--accent-warning)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    {sem === 'Sem Período' ? 'Sem Período Definido' : `${sem}º Semestre`} ({materias.length} disciplinas)
                  </h3>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
                </div>
                
                {isOpen && (
                  <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto', marginTop: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Disciplina</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materias.map((f: any, idx: number) => {
                          const normalizeStr = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
                          const isCursando = subjectsData.some((s: any) => {
                            if (s.code === f.codigo) return true;
                            if (normalizeStr(s.name) === normalizeStr(f.disciplina)) return true;
                            // Check explicit equivalence table
                            const isEquiv = (studentData.historico?.equivalencias || []).some((e: any) => 
                              e.codigoObrigatoria === f.codigo && e.codigoEquivalente === s.code
                            );
                            return isEquiv;
                          });
                          return (
                            <tr key={idx} style={{ borderLeft: isCursando ? '3px solid var(--accent-info)' : 'none', background: isCursando ? 'rgba(56, 189, 248, 0.03)' : 'transparent' }}>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{f.codigo}</td>
                              <td style={{ fontWeight: 500, color: isCursando ? 'var(--accent-info)' : 'inherit' }}>
                                {f.disciplina}
                                {isCursando && <span style={{ fontSize: '0.75rem', color: 'var(--accent-info)', marginLeft: '0.5rem' }}>(Cursando Atualmente)</span>}
                              </td>
                              <td>
                                {isCursando ? (
                                  <span className="status-badge" style={{ background: 'rgba(56, 189, 248, 0.2)', color: 'var(--accent-info)' }}>
                                    Em Andamento
                                  </span>
                                ) : (
                                  <span className="status-badge" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                                    Pendente
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="glass-panel empty-state">
            <CheckCircle size={48} style={{ color: 'var(--accent-success)' }} />
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-success)' }}>Todas as obrigatórias concluídas!</p>
          </div>
        )}

      {/* Extensionistas */}
      {atividadesExtensionistas.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Atividades Extensionistas</h3>
          <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>CHEXT (h)</th>
                  <th>Cursado</th>
                  <th>Faltante</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {atividadesExtensionistas.map((a: any, idx: number) => (
                  <tr key={idx}>
                    <td>{a.tipo}</td>
                    <td>{a.chext}</td>
                    <td>{a.cursado}</td>
                    <td>{a.faltante}</td>
                    <td>
                      <span className={`status-badge ${a.situacao?.toLowerCase().includes('falta') ? 'reprovado' : 'aprovado'}`}>
                        {a.situacao}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

  const renderGoals = () => {
    // Collect all subjects to populate the forum select
    const allMatriculadas = studentData.historico?.disciplinasMatriculadas || [];
    const allCursadas = [
      ...(studentData.historico?.obrigatoriasCursadas || []),
      ...(studentData.historico?.optativasCursadas || [])
    ];
    
    // Deduplicate subjects by code
    const uniqueSubjectsMap = new Map();
    allMatriculadas.forEach((m: any) => uniqueSubjectsMap.set(m.codigo, m.disciplina));
    allCursadas.forEach((c: any) => uniqueSubjectsMap.set(c.codigo, c.disciplina || c.nome));
    
    const forumSubjects = Array.from(uniqueSubjectsMap.entries()).map(([codigo, nome]) => ({ codigo, nome }));
    
    const activeSubject = selectedForumSubject || (forumSubjects.length > 0 ? forumSubjects[0].codigo : '');
    const activeComments = mockComments[activeSubject] || mockComments['DEFAULT'];

    // Handler para votar (toggle: clica de novo desfaz)
    const handleVote = (commentId: number, voteType: 'upvote' | 'downvote', author: string) => {
      const currentVote = userVotes[commentId] || null;
      
      // Trigger animation
      setAnimatingVote({ commentId, type: voteType });
      setTimeout(() => setAnimatingVote(null), 400);
      
      setMockComments(prev => {
        const updatedComments: Record<string, any[]> = {};
        for (const key of Object.keys(prev)) {
          updatedComments[key] = prev[key].map(c => {
            if (c.id !== commentId) return c;
            const updated = { ...c };
            
            if (currentVote === voteType) {
              // Desfazer o voto
              if (voteType === 'upvote') updated.upvotes = Math.max(0, (updated.upvotes || 0) - 1);
              else updated.downvotes = Math.max(0, (updated.downvotes || 0) - 1);
            } else {
              // Se tinha voto oposto, remove primeiro
              if (currentVote === 'upvote') updated.upvotes = Math.max(0, (updated.upvotes || 0) - 1);
              if (currentVote === 'downvote') updated.downvotes = Math.max(0, (updated.downvotes || 0) - 1);
              // Aplica o novo voto
              if (voteType === 'upvote') updated.upvotes = (updated.upvotes || 0) + 1;
              else updated.downvotes = (updated.downvotes || 0) + 1;
            }
            return updated;
          });
        }
        return updatedComments;
      });
      
      setUserVotes(prev => ({
        ...prev,
        [commentId]: currentVote === voteType ? null : voteType
      }));

      // Atualiza rating do autor
      if (currentVote !== voteType) {
        if (voteType === 'upvote') {
          setUserRatings(prev => ({ ...prev, [author]: Math.min(10, (prev[author] || 6.0) + 0.1) }));
          showToast(`👍 Você curtiu o comentário de ${author.split(' ')[0]}`, 'success');
        } else {
          setUserRatings(prev => ({ ...prev, [author]: Math.max(0, (prev[author] || 6.0) - 0.1) }));
          showToast(`👎 Você descurtiu o comentário de ${author.split(' ')[0]}`, 'warning');
        }
      } else {
        showToast('Voto removido', 'info');
      }
    };

    // Handler para report
    const handleReport = (commentId: number, author: string) => {
      if (userReports[commentId]) {
        showToast('Você já denunciou este comentário', 'warning');
        return;
      }
      setActionModal({ type: 'report', commentId, author });
    };

    const handleSendMessage = () => {
      if (!forumMessage.trim() && pendingAttachments.length === 0) return;
      const newComment = {
        id: Date.now(),
        author: studentData.perfil?.nome || 'Você',
        date: 'Agora',
        text: forumMessage || (pendingAttachments.length > 0 ? 'Compartilhei um arquivo:' : ''),
        attachments: [...pendingAttachments],
        upvotes: 0,
        downvotes: 0,
        reports: 0
      };
      setMockComments(prev => ({
        ...prev,
        [activeSubject]: [...(prev[activeSubject] || prev['DEFAULT']), newComment]
      }));
      setForumMessage('');
      setPendingAttachments([]);
      showToast('Mensagem enviada!', 'success');
    };

    // File Input Change
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files).map(file => ({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }));
        
        const filtered = newFiles.filter(f => !pendingAttachments.find(a => a.name === f.name));
        if (filtered.length > 0) {
          setPendingAttachments(prev => [...prev, ...filtered]);
          showToast(`${filtered.length} arquivo(s) anexado(s)`, 'success');
        } else {
          showToast('Arquivos já anexados', 'warning');
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Trigger File Input
    const triggerFileInput = (acceptType: string) => {
      setFileAccept(acceptType);
      setIsAttachmentMenuOpen(false);
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 0);
    };

    // Drag and Drop
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const newFiles = Array.from(e.dataTransfer.files).map(file => ({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
        }));
        
        const filtered = newFiles.filter(f => !pendingAttachments.find(a => a.name === f.name));
        if (filtered.length > 0) {
          setPendingAttachments(prev => [...prev, ...filtered]);
          showToast(`${filtered.length} arquivo(s) anexado(s)`, 'success');
        } else {
          showToast('Arquivos já anexados', 'warning');
        }
      }
    };

    // Cores dos avatares baseado no nome
    const getAvatarColor = (name: string) => {
      const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
      return colors[Math.abs(hash) % colors.length];
    };

    // Rating badge color based on score
    const getRatingColor = (rating: number) => {
      if (rating >= 8) return { bg: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71' };
      if (rating >= 6) return { bg: 'rgba(255, 204, 0, 0.15)', color: 'var(--accent-warning)' };
      if (rating >= 4) return { bg: 'rgba(243, 156, 18, 0.15)', color: '#f39c12' };
      return { bg: 'rgba(231, 76, 60, 0.15)', color: '#e74c3c' };
    };

    return (
      <section className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>
          <Users size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Fórum e Comunidade
        </h2>
        <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
          Interaja com outros alunos, tire dúvidas e faça amizades.
        </p>

        {/* Tabs Locais da Comunidade */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => setCommunityTab('forum')}
            style={{ 
              background: 'none', border: 'none', padding: '0.8rem 1rem', cursor: 'pointer',
              color: communityTab === 'forum' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: communityTab === 'forum' ? 700 : 500,
              borderBottom: communityTab === 'forum' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            <MessageSquare size={18} /> Fórum de Disciplinas
          </button>
          <button 
            onClick={() => setCommunityTab('friends')}
            style={{ 
              background: 'none', border: 'none', padding: '0.8rem 1rem', cursor: 'pointer',
              color: communityTab === 'friends' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: communityTab === 'friends' ? 700 : 500,
              borderBottom: communityTab === 'friends' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            <Users size={18} /> Amigos & Mensagens
          </button>
        </div>

        {communityTab === 'forum' ? (
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Selecione a Disciplina:</label>
              <select 
                value={activeSubject}
                onChange={(e) => setSelectedForumSubject(e.target.value)}
                style={{
                  padding: '0.8rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '1rem',
                  outline: 'none',
                  width: '100%',
                  maxWidth: '500px',
                  cursor: 'pointer'
                }}
              >
                {forumSubjects.map((sub, idx) => (
                  <option key={idx} value={sub.codigo}>{sub.codigo} - {sub.nome}</option>
                ))}
              </select>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '550px' }}>
              {/* Mensagens */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {activeComments.map((comment: any, idx: number) => {
                  const isMe = comment.author === (studentData.perfil?.nome || 'Você');
                  const currentVote = userVotes[comment.id] || null;
                  const isUpvoted = currentVote === 'upvote';
                  const isDownvoted = currentVote === 'downvote';
                  const isReported = userReports[comment.id] || false;
                  const isAnimatingUp = animatingVote?.commentId === comment.id && animatingVote?.type === 'upvote';
                  const isAnimatingDown = animatingVote?.commentId === comment.id && animatingVote?.type === 'downvote';
                  const rating = userRatings[comment.author] || 6.0;
                  const ratingStyle = getRatingColor(rating);

                  return (
                  <div key={comment.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                    {/* Author info row */}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                      {/* Avatar */}
                      {!isMe && (
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: getAvatarColor(comment.author),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0
                        }}>
                          {comment.author.charAt(0)}
                        </div>
                      )}
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{comment.author}</span>
                      {!isMe && (
                        <span style={{ 
                          background: ratingStyle.bg, 
                          color: ratingStyle.color, 
                          padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, 
                          display: 'flex', alignItems: 'center', gap: '0.2rem',
                          transition: 'all 0.3s ease'
                        }} title="Nota do Usuário">
                          <Star size={10} /> {rating.toFixed(1)}
                        </span>
                      )}
                      <span>•</span>
                      <span>{comment.date}</span>
                    </div>
                    
                    <div style={{ 
                      background: isMe ? 'var(--accent-primary)' : 'var(--bg-tertiary)', 
                      color: isMe ? '#000' : 'var(--text-primary)',
                      padding: '1rem', 
                      borderRadius: '12px',
                      borderBottomRightRadius: isMe ? '2px' : '12px',
                      borderBottomLeftRadius: !isMe ? '2px' : '12px',
                      border: !isMe ? '1px solid var(--border-color)' : 'none',
                      lineHeight: '1.5',
                      position: 'relative'
                    }}>
                      {comment.text}
                      
                      {/* Anexos */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {comment.attachments.map((att: any, aIdx: number) => (
                            <div key={aIdx} style={{ 
                              display: 'flex', alignItems: 'center', gap: '0.8rem', 
                              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
                              padding: '0.6rem 0.8rem', borderRadius: '6px', cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.18)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                            onClick={() => showToast(`📥 Download de "${att.name}" iniciado`, 'info')}
                            >
                              <FileText size={18} />
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{att.name}</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{att.size}</span>
                              </div>
                              <Download size={16} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Botões de Ação para comentários de outros */}
                      {!isMe && (
                        <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                          {/* UPVOTE */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleVote(comment.id, 'upvote', comment.author); }} 
                            style={{ 
                              background: isUpvoted ? 'rgba(46, 204, 113, 0.15)' : 'none', 
                              border: isUpvoted ? '1px solid rgba(46, 204, 113, 0.3)' : '1px solid transparent', 
                              color: isUpvoted ? '#2ecc71' : 'var(--text-muted)', 
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', 
                              fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: '6px',
                              transition: 'all 0.2s ease',
                              transform: isAnimatingUp ? 'scale(1.3)' : 'scale(1)',
                              fontWeight: isUpvoted ? 700 : 400
                            }} 
                            title={isUpvoted ? "Remover curtida" : "Curtir"}
                            onMouseEnter={(e) => { if (!isUpvoted) (e.currentTarget as HTMLElement).style.color = '#2ecc71'; }}
                            onMouseLeave={(e) => { if (!isUpvoted) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                          >
                            <ThumbsUp size={14} fill={isUpvoted ? '#2ecc71' : 'none'} /> {comment.upvotes || 0}
                          </button>
                          {/* DOWNVOTE */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleVote(comment.id, 'downvote', comment.author); }} 
                            style={{ 
                              background: isDownvoted ? 'rgba(231, 76, 60, 0.15)' : 'none', 
                              border: isDownvoted ? '1px solid rgba(231, 76, 60, 0.3)' : '1px solid transparent', 
                              color: isDownvoted ? '#e74c3c' : 'var(--text-muted)', 
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', 
                              fontSize: '0.8rem', padding: '0.3rem 0.6rem', borderRadius: '6px',
                              transition: 'all 0.2s ease',
                              transform: isAnimatingDown ? 'scale(1.3)' : 'scale(1)',
                              fontWeight: isDownvoted ? 700 : 400
                            }} 
                            title={isDownvoted ? "Remover descurtida" : "Descurtir"}
                            onMouseEnter={(e) => { if (!isDownvoted) (e.currentTarget as HTMLElement).style.color = '#e74c3c'; }}
                            onMouseLeave={(e) => { if (!isDownvoted) (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                          >
                            <ThumbsDown size={14} fill={isDownvoted ? '#e74c3c' : 'none'} /> {comment.downvotes || 0}
                          </button>
                          <span style={{ color: 'var(--border-color)' }}>|</span>
                          {/* ADD FRIEND */}
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation();
                              const exists = mockFriends.find(f => f.name === comment.author);
                              if (exists) {
                                showToast(`${comment.author.split(' ')[0]} já está na sua lista de amigos`, 'warning');
                              } else {
                                setMockFriends(prev => [...prev, { id: Date.now(), name: comment.author, status: 'online', blocked: false }]);
                                showToast(`✅ ${comment.author.split(' ')[0]} adicionado como amigo!`, 'success');
                              }
                            }}
                            style={{ 
                              background: 'none', border: '1px solid transparent', 
                              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', 
                              alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem',
                              padding: '0.3rem 0.6rem', borderRadius: '6px',
                              transition: 'all 0.2s ease'
                            }} 
                            title="Adicionar Amigo"
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-info)'; (e.currentTarget as HTMLElement).style.background = 'rgba(0, 195, 255, 0.1)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                          >
                            <UserPlus size={14} />
                          </button>
                          {/* BLOCK */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setMockFriends(prev => prev.map(f => f.name === comment.author ? {...f, blocked: true} : f));
                              showToast(`🚫 ${comment.author.split(' ')[0]} bloqueado`, 'warning');
                            }} 
                            style={{ 
                              background: 'none', border: '1px solid transparent', 
                              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', 
                              alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem',
                              padding: '0.3rem 0.6rem', borderRadius: '6px',
                              transition: 'all 0.2s ease'
                            }} 
                            title="Bloquear Usuário"
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#e74c3c'; (e.currentTarget as HTMLElement).style.background = 'rgba(231, 76, 60, 0.1)'; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                          >
                            <Ban size={14} />
                          </button>
                          {/* REPORT */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleReport(comment.id, comment.author); }} 
                            style={{ 
                              background: isReported ? 'rgba(231, 76, 60, 0.15)' : 'none', 
                              border: isReported ? '1px solid rgba(231, 76, 60, 0.3)' : '1px solid transparent', 
                              color: isReported ? '#e74c3c' : 'var(--accent-danger)', 
                              opacity: isReported ? 1 : 0.7, 
                              cursor: isReported ? 'default' : 'pointer', 
                              display: 'flex', alignItems: 'center', gap: '0.3rem', 
                              fontSize: '0.8rem', marginLeft: 'auto',
                              padding: '0.3rem 0.6rem', borderRadius: '6px',
                              transition: 'all 0.2s ease',
                              fontWeight: isReported ? 700 : 400
                            }} 
                            title={isReported ? "Você já denunciou" : "Denunciar Publicação"}
                            onMouseEnter={(e) => { if (!isReported) { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.background = 'rgba(231, 76, 60, 0.1)'; } }}
                            onMouseLeave={(e) => { if (!isReported) { (e.currentTarget as HTMLElement).style.opacity = '0.7'; (e.currentTarget as HTMLElement).style.background = 'none'; } }}
                          >
                            <ShieldAlert size={14} /> {isReported ? 'Denunciado' : 'Denunciar'} {(comment.reports || 0) > 0 && <span style={{ fontWeight: 700 }}>({comment.reports})</span>}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )})}
              </div>

              {/* Input Form */}
              <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                {/* Pending Attachments Preview */}
                {pendingAttachments.length > 0 && (
                  <div style={{ padding: '0.8rem 1rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {pendingAttachments.map((att, aIdx) => (
                      <div key={aIdx} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.2)',
                        padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem',
                        color: 'var(--accent-primary)', animation: 'fadeIn 0.3s ease'
                      }}>
                        <FileText size={14} />
                        <span style={{ fontWeight: 600 }}>{att.name}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({att.size})</span>
                        <button 
                          onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== aIdx))}
                          style={{ 
                            background: 'none', border: 'none', color: 'var(--accent-danger)', 
                            cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center',
                            marginLeft: '0.2rem'
                          }}
                          title="Remover anexo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div 
                  style={{ 
                    padding: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'flex-end', position: 'relative',
                    background: isDragActive ? 'rgba(255, 204, 0, 0.05)' : 'none',
                    borderTop: isDragActive ? '2px dashed var(--accent-primary)' : '1px solid var(--border-color)',
                    transition: 'all 0.2s'
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileInputChange} 
                    style={{ display: 'none' }} 
                    multiple 
                    accept={fileAccept}
                  />
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setIsAttachmentMenuOpen(!isAttachmentMenuOpen)}
                      style={{ 
                        background: pendingAttachments.length > 0 || isAttachmentMenuOpen ? 'rgba(255, 204, 0, 0.15)' : 'none', 
                        border: pendingAttachments.length > 0 || isAttachmentMenuOpen ? '1px solid rgba(255, 204, 0, 0.3)' : '1px solid transparent', 
                        color: pendingAttachments.length > 0 || isAttachmentMenuOpen ? 'var(--accent-primary)' : 'var(--text-secondary)', 
                        cursor: 'pointer', padding: '0.5rem', display: 'flex', 
                        alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                        transition: 'all 0.2s ease', position: 'relative'
                      }}
                      title="Anexar arquivo"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-primary)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = pendingAttachments.length > 0 || isAttachmentMenuOpen ? 'var(--accent-primary)' : 'var(--text-secondary)'; }}
                    >
                      <Paperclip size={20} />
                      {pendingAttachments.length > 0 && (
                        <span style={{
                          position: 'absolute', top: '-4px', right: '-4px',
                          background: 'var(--accent-primary)', color: '#000',
                          borderRadius: '50%', width: '16px', height: '16px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 700
                        }}>
                          {pendingAttachments.length}
                        </span>
                      )}
                    </button>

                    {isAttachmentMenuOpen && (
                      <div style={{
                        position: 'absolute', bottom: 'calc(100% + 10px)', left: 0,
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: '8px', padding: '0.5rem', display: 'flex', flexDirection: 'column',
                        gap: '0.2rem', minWidth: '150px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        animation: 'fadeIn 0.2s ease', zIndex: 10
                      }}>
                        <button onClick={() => triggerFileInput('image/*')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }} onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                          <Image size={16} color="var(--accent-primary)" /> Imagens / Fotos
                        </button>
                        <button onClick={() => triggerFileInput('.pdf,.doc,.docx,.xls,.xlsx,.txt')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }} onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                          <FileText size={16} color="var(--accent-info)" /> Documentos / PDF
                        </button>
                        <button onClick={() => triggerFileInput('.zip,.rar,.cpp,.py,.js,.html,.css')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', textAlign: 'left', fontSize: '0.85rem' }} onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'} onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'none'}>
                          <Code size={16} color="var(--accent-success)" /> Código Fonte / Zip
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={forumMessage}
                    onChange={e => setForumMessage(e.target.value)}
                    placeholder={isDragActive ? "Solte seus arquivos aqui..." : "Escreva um comentário ou tire uma dúvida... (Arraste arquivos aqui para anexar)"}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.8rem', borderRadius: '8px', resize: 'none', outline: 'none', minHeight: '44px', fontFamily: 'inherit', fontSize: '0.9rem' }}
                    rows={1}
                  />
                  <button 
                    onClick={handleSendMessage}
                    style={{ background: (forumMessage.trim() || pendingAttachments.length > 0) ? 'var(--accent-primary)' : 'var(--bg-primary)', color: (forumMessage.trim() || pendingAttachments.length > 0) ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '8px', padding: '0.8rem', cursor: (forumMessage.trim() || pendingAttachments.length > 0) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
              
            </div>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: 0, display: 'flex', height: '600px', overflow: 'hidden' }}>
            {/* Lista de Amigos */}
            <div style={{ width: '250px', borderRight: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '1.2rem', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={16} /> Meus Amigos
                </h3>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {mockFriends.map((friend, idx) => {
                  const friendRating = userRatings[friend.name] || 6.0;
                  const fRatingStyle = getRatingColor(friendRating);
                  return (
                  <div 
                    key={idx} 
                    onClick={() => !friend.blocked && setActiveChatFriend(friend)}
                    style={{ 
                      padding: '1rem', 
                      borderBottom: '1px solid var(--border-color)', 
                      cursor: friend.blocked ? 'not-allowed' : 'pointer',
                      background: activeChatFriend?.id === friend.id ? 'var(--bg-secondary)' : 'transparent',
                      opacity: friend.blocked ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => { if (!friend.blocked && activeChatFriend?.id !== friend.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { if (activeChatFriend?.id !== friend.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: getAvatarColor(friend.name),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0
                        }}>
                          {friend.name.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: friend.blocked ? 'var(--text-muted)' : 'var(--text-primary)' }}>{friend.name.split(' ')[0]}</span>
                      </div>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: friend.status === 'online' ? 'var(--accent-success)' : 'var(--text-muted)', boxShadow: friend.status === 'online' ? '0 0 6px var(--accent-success)' : 'none' }} title={friend.status} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '2.1rem' }}>
                      <Star size={12} color={fRatingStyle.color} /> <span style={{ color: fRatingStyle.color, fontWeight: 600 }}>{friendRating.toFixed(1)}</span>
                    </div>
                    {friend.blocked && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-danger)', marginTop: '0.3rem', display: 'block', marginLeft: '2.1rem' }}>Bloqueado</span>
                    )}
                  </div>
                )})}
              </div>
            </div>

            {/* Chat Privado */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-color)' }}>
              {activeChatFriend ? (
                <>
                  <div style={{ padding: '1.2rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <div style={{ 
                        width: '36px', height: '36px', borderRadius: '50%', 
                        background: getAvatarColor(activeChatFriend.name), 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        color: '#fff', fontWeight: 'bold' 
                      }}>
                        {activeChatFriend.name.charAt(0)}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem' }}>{activeChatFriend.name}</h4>
                        <span style={{ fontSize: '0.75rem', color: activeChatFriend.status === 'online' ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                          {activeChatFriend.status === 'online' ? '● Online' : '○ Offline'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button 
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }} 
                        title="Desfazer Amizade"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-warning)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                        onClick={() => {
                          setMockFriends(prev => prev.filter(f => f.id !== activeChatFriend.id));
                          setActiveChatFriend(null);
                          showToast('Amizade desfeita', 'warning');
                        }}
                      >
                        <UserMinus size={18} />
                      </button>
                      <button 
                        onClick={() => {
                           setMockFriends(prev => prev.map(f => f.id === activeChatFriend.id ? {...f, blocked: true} : f));
                           setActiveChatFriend(null);
                           showToast('Usuário bloqueado', 'warning');
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }} 
                        title="Bloquear"
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#e74c3c'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                      >
                        <Ban size={18} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Messages */}
                  <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {(mockPrivateMessages[activeChatFriend.id] || []).map((msg: any, idx: number) => {
                      const isMe = msg.sender === 'Você';
                      return (
                        <div key={idx} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                          <div style={{ 
                            background: isMe ? 'var(--accent-primary)' : 'var(--bg-tertiary)', 
                            color: isMe ? '#000' : 'var(--text-primary)',
                            padding: '0.8rem 1rem', 
                            borderRadius: '12px',
                            borderBottomRightRadius: isMe ? '2px' : '12px',
                            borderBottomLeftRadius: !isMe ? '2px' : '12px',
                            border: !isMe ? '1px solid var(--border-color)' : 'none'
                          }}>
                            {msg.text}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem', textAlign: isMe ? 'right' : 'left' }}>
                            {msg.date}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Input form */}
                  <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', gap: '0.8rem' }}>
                    <textarea 
                      value={chatMessage}
                      onChange={e => setChatMessage(e.target.value)}
                      placeholder="Envie uma mensagem..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (chatMessage.trim()) {
                            setMockPrivateMessages(prev => ({
                              ...prev,
                              [activeChatFriend.id]: [...(prev[activeChatFriend.id] || []), { sender: 'Você', text: chatMessage, date: 'Agora' }]
                            }));
                            setChatMessage('');
                          }
                        }
                      }}
                      style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.8rem', borderRadius: '8px', resize: 'none', outline: 'none', minHeight: '44px', fontFamily: 'inherit' }}
                      rows={1}
                    />
                    <button 
                      onClick={() => {
                        if (chatMessage.trim()) {
                          setMockPrivateMessages(prev => ({
                            ...prev,
                            [activeChatFriend.id]: [...(prev[activeChatFriend.id] || []), { sender: 'Você', text: chatMessage, date: 'Agora' }]
                          }));
                          setChatMessage('');
                        }
                      }}
                      style={{ background: chatMessage.trim() ? 'var(--accent-primary)' : 'var(--bg-primary)', color: chatMessage.trim() ? '#000' : 'var(--text-muted)', border: 'none', borderRadius: '8px', padding: '0.8rem 1.2rem', cursor: chatMessage.trim() ? 'pointer' : 'default', transition: 'all 0.2s' }}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <MessageCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>Selecione um amigo para iniciar o chat</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Ação (Justificativa / Denúncia) */}
        {actionModal.type && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)',
              width: '90%', maxWidth: '500px', padding: '2rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              animation: 'fadeIn 0.2s ease'
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {actionModal.type === 'report' ? <><ShieldAlert color="var(--accent-danger)" size={20} /> Denunciar Publicação</> : 
                 actionModal.type === 'upvote' ? <><ThumbsUp color="var(--accent-success)" size={20} /> Avaliar Positivamente</> : 
                 <><ThumbsDown color="var(--accent-danger)" size={20} /> Avaliar Negativamente</>}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                {actionModal.type === 'report' 
                  ? `Por favor, explique por que você está denunciando o comentário de ${actionModal.author}.` 
                  : `Você deve justificar sua avaliação sobre o comentário de ${actionModal.author} para manter a comunidade saudável.`}
              </p>
              
              {actionModal.type === 'report' && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  {['Conteúdo inapropriado', 'Spam', 'Informação errada', 'Assédio'].map(reason => (
                    <button 
                      key={reason}
                      onClick={() => setActionReason(reason)}
                      style={{
                        background: actionReason === reason ? 'rgba(231, 76, 60, 0.15)' : 'var(--bg-primary)',
                        border: actionReason === reason ? '1px solid rgba(231, 76, 60, 0.3)' : '1px solid var(--border-color)',
                        color: actionReason === reason ? '#e74c3c' : 'var(--text-secondary)',
                        padding: '0.4rem 0.8rem', borderRadius: '20px', cursor: 'pointer',
                        fontSize: '0.82rem', transition: 'all 0.2s ease',
                        fontWeight: actionReason === reason ? 600 : 400
                      }}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              )}

              <textarea 
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder={actionModal.type === 'report' ? "Detalhes adicionais (opcional se selecionou acima)..." : "Escreva sua justificativa aqui..."}
                style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '1rem', borderRadius: '8px', resize: 'vertical', minHeight: '100px', outline: 'none', marginBottom: '1.5rem', fontFamily: 'inherit' }}
              />
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  onClick={() => { setActionModal({type: null}); setActionReason(''); }} 
                  style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.8rem 1.5rem', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (!actionReason.trim()) return;
                    
                    if (actionModal.type === 'report' && actionModal.commentId) {
                      // Incrementa report count
                      setMockComments(prev => {
                        const updated: Record<string, any[]> = {};
                        for (const key of Object.keys(prev)) {
                          updated[key] = prev[key].map(c => 
                            c.id === actionModal.commentId ? { ...c, reports: (c.reports || 0) + 1 } : c
                          );
                        }
                        return updated;
                      });
                      setUserReports(prev => ({ ...prev, [actionModal.commentId!]: true }));
                      showToast('⚠️ Denúncia enviada. Obrigado por ajudar a comunidade!', 'danger');
                    } else if (actionModal.type === 'upvote' && actionModal.author) {
                      setUserRatings(prev => ({ ...prev, [actionModal.author!]: Math.min(10, (prev[actionModal.author!] || 6.0) + 0.1) }));
                      showToast(`👍 Avaliação positiva enviada para ${actionModal.author?.split(' ')[0]}`, 'success');
                    } else if (actionModal.type === 'downvote' && actionModal.author) {
                      setUserRatings(prev => ({ ...prev, [actionModal.author!]: Math.max(0, (prev[actionModal.author!] || 6.0) - 0.2) }));
                      showToast(`👎 Avaliação negativa enviada para ${actionModal.author?.split(' ')[0]}`, 'warning');
                    }
                    
                    setActionModal({type: null});
                    setActionReason('');
                  }} 
                  style={{ 
                    background: actionModal.type === 'report' ? 'var(--accent-danger)' : 'var(--accent-primary)', 
                    color: actionModal.type === 'report' ? '#fff' : '#000', 
                    border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', 
                    cursor: actionReason.trim() ? 'pointer' : 'not-allowed', 
                    fontWeight: 600, opacity: actionReason.trim() ? 1 : 0.5,
                    transition: 'all 0.2s ease'
                  }}
                  disabled={!actionReason.trim()}
                >
                  Confirmar Ação
                </button>
              </div>
            </div>
          </div>
        )}

      </section>
    );
  };
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'subjects': return renderSubjects();
      case 'historico': return renderHistorico();
      case 'faltantes': return renderFaltantes();
      case 'goals': return renderGoals();
      default: return renderDashboard();
    }
  };

  return (
    <div className="app-container">
      <div ref={cursorRef} className="cursor-glow" />
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--text-primary)' }}>UT</span>
            <span style={{ color: '#FFCC00' }}>F</span>
            <span style={{ color: 'var(--text-primary)' }}>PR</span>
            <span style={{ color: '#FFCC00', margin: '0 0.4rem' }}>-</span>
            <span style={{ color: 'var(--text-primary)' }}>A</span>
            <span style={{ color: '#FFCC00', marginLeft: '0.1rem' }}>z</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div 
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`} 
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-nav" style={{ flex: 'none', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <div className="nav-item" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </div>
          <div className="nav-item" onClick={() => { setIsAuthenticated(false); setStudentData(null); }}>
            <LogOut size={20} />
            <span>Sair</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header animate-fade-in">
          <div>
            <h1 style={{ fontSize: '1.5rem' }}>Bem-vindo, {perfil.nome.split(' ')[0]}.</h1>
            <p className="text-secondary">
              {activeTab === 'dashboard' && 'Resumo de inteligência acadêmica.'}
              {activeTab === 'subjects' && 'Suas disciplinas do semestre atual.'}
              {activeTab === 'historico' && 'Todas as disciplinas cursadas.'}
              {activeTab === 'faltantes' && 'Disciplinas que faltam para concluir.'}
              {activeTab === 'goals' && 'Fórum de discussão e compartilhamento de materiais.'}
            </p>
          </div>
          
          <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <Bell size={20} className="text-secondary" />
              {faltantes.length > 0 && (
                <div style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: 'var(--accent-danger)', borderRadius: '50%' }}></div>
              )}
            </div>
            <div className="avatar">
              <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '0.85rem' }}>{getInitials(perfil.nome)}</span>
            </div>
            <div className="user-info">
              <span className="user-name" style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.nome}</span>
              <span className="user-course" style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perfil.curso}</span>
            </div>
          </div>
        </header>

        {renderContent()}

        {/* MODAL DE EQUIVALÊNCIAS */}
        {equivalenciaModalOpen && (() => {
          // Agrupar selectedEquivData por codigoEquivalente
          const agrupado = selectedEquivData.reduce((acc: any, curr: any) => {
            if (!acc[curr.codigoEquivalente]) {
              acc[curr.codigoEquivalente] = {
                codigo: curr.codigoEquivalente,
                nome: curr.nomeEquivalente,
                turma: curr.turmaEquivalente || '—',
                media: curr.notaEquivalente,
                freq: curr.freqEquivalente || '—',
                periodo: curr.anoPeriodoEquivalente || '—',
                situacao: curr.situacaoEquivalente,
                convalida: []
              };
            }
            // Adicionar a matéria validada
            if (!acc[curr.codigoEquivalente].convalida.find((c: any) => c.codigo === curr.codigoObrigatoria)) {
              acc[curr.codigoEquivalente].convalida.push({
                codigo: curr.codigoObrigatoria,
                nome: curr.nomeObrigatoria
              });
            }
            return acc;
          }, {});

          const cards = Object.values(agrupado);

          return (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
            }}>
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)',
                width: '90%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', padding: '2rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Info size={24} color="var(--accent-info)" />
                      Detalhes da Equivalência
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Consulte abaixo os detalhes exatos de como essa matéria foi validada em seu histórico.
                    </p>
                  </div>
                  <button onClick={() => setEquivalenciaModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <X size={24} />
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {cards.map((card: any, idx: number) => {
                    const eqNota = parseFloat(card.media?.replace(',', '.'));
                    const isSuccess = !isNaN(eqNota) && eqNota >= 6;
                    const isDanger = !isNaN(eqNota) && eqNota < 6 && eqNota >= 0;

                    return (
                      <div key={idx} style={{ background: 'var(--bg-tertiary)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
                        <div style={{ marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--accent-info)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Disciplina Cursada</span>
                          <h4 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700, marginTop: '0.25rem' }}>
                            <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', marginRight: '0.5rem' }}>{card.codigo}</span>
                            {card.nome}
                          </h4>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Turma</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{card.turma}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Período</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{card.periodo}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Média</div>
                            <div style={{ fontWeight: 700, color: isSuccess ? 'var(--accent-success)' : isDanger ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                              {(!isNaN(eqNota) && eqNota >= 0) ? eqNota.toFixed(1) : card.media || '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Frequência</div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{card.freq}</div>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Situação</div>
                            <span className={`status-badge ${getStatusClass(card.situacao)}`} style={{ display: 'inline-block', marginTop: '0.25rem' }}>
                              {formatSituacao(card.situacao)}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--accent-warning)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Convalida as seguintes disciplinas:</span>
                          <ul style={{ listStyleType: 'none', padding: 0, marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {card.convalida.map((conv: any, cIdx: number) => (
                              <li key={cIdx} style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: '6px', borderLeft: '3px solid var(--accent-warning)' }}>
                                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.85rem', minWidth: '70px' }}>{conv.codigo}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{conv.nome}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                  <button onClick={() => setEquivalenciaModalOpen(false)} className="action-button" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                    Fechar Detalhes
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
        {/* MODAL DO SEMESTRE */}
        {semesterModalOpen && selectedSemester && (() => {
          const allDocs = [...(studentData.historico?.obrigatoriasCursadas || []), ...(studentData.historico?.optativasCursadas || []), ...(studentData.historico?.equivalencias || [])];
          
          let filteredDocs: any[] = [];
          const processedEqs = new Set();
          
          allDocs.forEach((d: any) => {
             const isEquivData = !!d.codigoEquivalente;
             const sit = (d.situacaoEquivalente || d.situacao || '').toLowerCase();
             
             // Ignore administrative validations in native tables
             if (!isEquivData && (sit.includes('crédito') || sit.includes('equivalência') || sit.includes('matriz'))) return;
             
             // Deduplicate equivalences
             if (isEquivData) {
                 const eqKey = `${d.codigoEquivalente}-${d.anoPeriodoEquivalente}`;
                 if (processedEqs.has(eqKey)) return;
                 processedEqs.add(eqKey);
             }

             const sem1 = d.ano && d.semestre ? `${d.ano}/${d.semestre}` : null;
             const sem2 = d.anoPeriodoEquivalente ? d.anoPeriodoEquivalente : null;
             
             if ((sem1 === selectedSemester) || (sem2 === selectedSemester)) {
                if (modalContext === 'aprovadas') {
                   if (sit.includes('aprovado') || sit.includes('crédito') || sit.includes('equivalência')) {
                      filteredDocs.push(d);
                   }
                } else {
                   if (!sit.includes('cancelado')) {
                      filteredDocs.push(d);
                   }
                }
             }
          });

          const semDisciplinas = filteredDocs;

          return (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
            }} onContextMenu={e => e.preventDefault()}>
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)',
                width: '90%', maxWidth: '750px', maxHeight: '85vh', overflowY: 'auto', padding: '2rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={24} color="var(--accent-info)" />
                      Disciplinas do Semestre {selectedSemester.replace('.', '/')} {modalContext === 'aprovadas' && <span style={{ color: 'var(--accent-success)', fontSize: '1rem' }}>(Aprovadas)</span>}
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      {modalContext === 'aprovadas' ? 'Listagem de disciplinas concluídas com sucesso neste período.' : 'Histórico das matérias que você cursou neste período.'}
                    </p>
                  </div>
                  <button onClick={() => setSemesterModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <X size={24} />
                  </button>
                </div>
                
                <div className="table-container" style={{ borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <table className="data-table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Código</th>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Disciplina</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>Média</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>Freq.</th>
                        <th style={{ padding: '1rem', textAlign: 'center' }}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semDisciplinas.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Nenhuma disciplina encontrada.</td></tr>
                      ) : semDisciplinas.map((d: any, idx: number) => {
                        const isEquiv = !!d.codigoEquivalente;
                        const code = isEquiv ? d.codigoEquivalente : d.codigo;
                        const name = isEquiv ? d.nomeEquivalente : (d.disciplina || d.nome);
                        const media = isEquiv ? d.notaEquivalente : d.media;
                        const freq = isEquiv ? d.freqEquivalente : (d.freq || d.frequencia);
                        const situacao = isEquiv ? d.situacaoEquivalente : d.situacao;
                        const notaNum = parseFloat(media?.replace(',', '.'));
                        
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{code}</td>
                            <td style={{ padding: '1rem', fontWeight: 500 }}>
                              {name} {isEquiv && <span style={{ fontSize: '0.75rem', color: 'var(--accent-warning)', marginLeft: '0.5rem' }}>(Equivalência)</span>}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, color: notaNum >= 6 ? 'var(--accent-success)' : notaNum >= 0 ? 'var(--accent-danger)' : 'var(--text-muted)' }}>
                                {(!isNaN(notaNum) && notaNum >= 0) ? notaNum.toFixed(1) : media || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {freq ? `${freq}%` : '—'}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                              <span className={`status-badge ${getStatusClass(situacao)}`}>
                                {formatSituacao(situacao)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                  <button onClick={() => setSemesterModalOpen(false)} className="action-button" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </main>
      
      {/* Bottom Navigation Mobile */}
      <nav className="bottom-nav">
        {[
          { id: 'subjects', icon: BookOpen, label: 'Matérias' },
          { id: 'historico', icon: BarChart3, label: 'Histórico' },
          { id: 'faltantes', icon: AlertTriangle, label: 'Pendências' },
          { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { id: 'goals', icon: Users, label: 'Comunidade' }
        ].map(item => (
          <div 
            key={item.id}
            className={`bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <item.icon size={22} />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}

export default App;
