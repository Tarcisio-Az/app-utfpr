import React, { useState } from 'react';
import './Login.css';
import { Activity, User, Lock, ArrowRight, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (data: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [ra, setRa] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent, isCourseSelection = false) => {
    e.preventDefault();
    if (!ra || !password) return;
    if (isCourseSelection && !selectedCourse) return;

    setIsLoading(true);
    
    try {
      const payload: any = { ra, password };
      if (isCourseSelection) {
        payload.courseId = selectedCourse;
      }
      
      const response = await fetch('https://a-z-w3co.onrender.com/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.requiresCourseSelection) {
        setAvailableCourses(data.courses);
        if (data.courses.length > 0) {
          setSelectedCourse(data.courses[0].id);
        }
      } else if (data.success) {
        console.log("Dados extraídos:", data.data);
        onLogin(data.data);
      } else {
        alert("Erro no login: " + data.error);
      }
    } catch (error) {
      console.error("Erro na comunicação com o backend:", error);
      alert("Não foi possível conectar ao servidor de extração.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>
      
      <div className="glass-panel login-glass-card">
        <div className="login-header">
          <div className="login-logo-container animate-fade-in-up">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', fontSize: '2.2rem', fontWeight: 900, letterSpacing: '-1px' }}>
              <span style={{ color: 'var(--text-primary)' }}>UT</span>
              <span style={{ color: '#FFCC00' }}>F</span>
              <span style={{ color: 'var(--text-primary)' }}>PR</span>
              <span style={{ color: '#FFCC00', margin: '0 0.5rem' }}>-</span>
              <span style={{ color: 'var(--text-primary)' }}>A</span>
              <span style={{ color: '#FFCC00', marginLeft: '0.2rem' }}>z</span>
            </div>
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Autenticação</h1>
          <p className="login-subtitle">
            Conecte-se com suas credenciais do portal para acessar o dashboard de inteligência.
          </p>
        </div>

        {availableCourses.length > 0 ? (
          <form className="login-form" onSubmit={(e) => handleSubmit(e, true)}>
            <div className="input-group">
              <label className="input-label" htmlFor="course">Selecione o Curso</label>
              <div className="input-wrapper" style={{ padding: '0 1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <select 
                  id="course"
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem 0', background: 'transparent', color: 'var(--text-primary)', border: 'none', outline: 'none', cursor: 'pointer', appearance: 'auto' }}
                >
                  {availableCourses.map(c => (
                    <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <button 
              type="submit" 
              className="login-btn"
              disabled={isLoading || !selectedCourse}
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="spinner" />
                  <span>Sincronizando dados...</span>
                </>
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
               <a href="#" onClick={(e) => { e.preventDefault(); setAvailableCourses([]); }} style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => (e.currentTarget as any).style.color = 'var(--text-primary)'} onMouseLeave={(e) => (e.currentTarget as any).style.color = 'var(--text-muted)'}>Voltar para o Login</a>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={(e) => handleSubmit(e, false)}>
            <div className="input-group">
              <label className="input-label" htmlFor="ra">Registro Acadêmico (RA)</label>
              <div className="input-wrapper">
                <input
                  id="ra"
                  type="text"
                  className="login-input"
                  placeholder="a1234567"
                  value={ra}
                  onChange={(e) => setRa(e.target.value)}
                  autoComplete="username"
                />
                <User size={18} className="input-icon" />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="password">Senha</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type="password"
                  className="login-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <Lock size={18} className="input-icon" />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-btn"
              disabled={!ra || !password || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={20} className="spinner" />
                  <span>Sincronizando dados...</span>
                </>
              ) : (
                <>
                  <span>Acessar Dashboard</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        )}

        <div className="login-footer">
          Esqueceu a senha? <a href="#" onClick={(e) => e.preventDefault()}>Recupere aqui.</a>
        </div>
      </div>
    </div>
  );
};

export default Login;
