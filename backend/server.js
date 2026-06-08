const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Sessões pendentes (aguardando seleção de curso)
const pendingSessions = new Map();
// Limpa sessões antigas após 2 minutos
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pendingSessions) {
    if (now - session.createdAt > 120000) {
      console.log(`[+] Limpando sessão expirada: ${id}`);
      try { session.browser.close(); } catch(e) {}
      pendingSessions.delete(id);
    }
  }
}, 30000);

// Rota de Teste Simples
app.get('/', (req, res) => {
  res.send('Nexus.edu Extraction Service is running.');
});

app.post('/api/scrape', async (req, res) => {
  const { ra, password, courseId, sessionId } = req.body;

  if (!ra || !password) {
    return res.status(400).json({ error: 'RA e Senha são obrigatórios' });
  }

  // ==========================================
  // REUTILIZAR SESSÃO EXISTENTE (seleção de curso)
  // ==========================================
  if (sessionId && courseId && pendingSessions.has(sessionId)) {
    console.log(`[+] Reutilizando sessão ${sessionId} para selecionar curso ${courseId}`);
    const session = pendingSessions.get(sessionId);
    pendingSessions.delete(sessionId);
    const { browser: sBrowser, page: sPage, courseSelectSelector: csSelector } = session;
    
    try {
      await sPage.select(csSelector, courseId.toString());
      console.log('[+] Curso selecionado na sessão existente. Aguardando AJAX...');
      await new Promise(r => setTimeout(r, 4000));
      
      const menuOk = await sPage.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, td'));
        return links.some(el => el.innerText && (el.innerText.includes('Boletim') || el.innerText.includes('Disciplinas Matriculadas')));
      });
      
      if (!menuOk) {
        console.log('[!] Menu não apareceu. Tentando fallback...');
        await sPage.evaluate((val) => { try { AjaxSelecionaCurso(val); } catch(e) {} }, courseId.toString());
        await new Promise(r => setTimeout(r, 4000));
      }
      
      try { await sPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }); } catch (e) {}
    } catch(err) {
      console.log(`[-] Erro ao reutilizar sessão: ${err.message}`);
      try { sBrowser.close(); } catch(e) {}
      return res.status(500).json({ success: false, error: 'Sessão expirou. Tente fazer login novamente.' });
    }
    
    // Agora continua a extração usando a sessão existente
    // Precisamos redefinir browser e page para o restante do código funcionar
    req._reusedBrowser = sBrowser;
    req._reusedPage = sPage;
  }

  let browser = req._reusedBrowser || null;
  let page = req._reusedPage || null;
  const isReusedSession = !!browser;

  try {
    if (!isReusedSession) {
      console.log(`[+] Iniciando extração para o RA: ${ra}`);
      browser = await puppeteer.launch({ 
        headless: 'new', 
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process'
        ] 
      });
      page = await browser.newPage();
    }
    
    // Tratamento de Alertas Nativos
    page.on('dialog', async dialog => {
      console.log(`[!] Alerta nativo detectado: "${dialog.message()}". Clicando em Cancelar...`);
      await dialog.dismiss();
    });
    
    await page.setViewport({ width: 1280, height: 800 });

    // Função auxiliar para fechar popups
    const fecharPopups = async () => {
      console.log('[+] Verificando e fechando pop-ups obstrutivos...');
      for (let attempts = 0; attempts < 5; attempts++) {
        try {
          await page.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], div, span'));
            const closeEls = allElements.filter(el => {
              const text = (el.innerText?.trim().toLowerCase() || el.value?.trim().toLowerCase() || '');
              return text === 'fechar' || text === 'cancelar' || text === 'não participar' 
                || text === 'ok' || text === 'close' || text === 'x';
            });
            const modalCloseEls = Array.from(document.querySelectorAll('.modal button, .aviso button, [class*="modal"] button, [class*="dialog"] button, [class*="popup"] button'));
            const xButtons = Array.from(document.querySelectorAll('[class*="close"], [class*="Close"], .btn-close'));
            [...closeEls, ...modalCloseEls, ...xButtons].forEach(b => { try { b.click(); } catch(e) {} });
          });
        } catch(e) {}
        
        for (const frame of page.frames()) {
          try {
            if (frame.isDetached()) continue;
            await frame.evaluate(() => {
              const els = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], div, span'));
              els.filter(el => {
                const text = (el.innerText?.trim().toLowerCase() || el.value?.trim().toLowerCase() || '');
                return text === 'fechar' || text === 'cancelar' || text === 'não participar' || text === 'ok';
              }).forEach(b => { try { b.click(); } catch(e) {} });
            });
          } catch(e) {}
        }
        await new Promise(r => setTimeout(r, 800));
      }
    };

    if (isReusedSession) {
      // Sessão reutilizada — fecha popups tardios (ex: Avaliação do Docente)
      console.log('[+] Sessão reutilizada. Fechando popups tardios...');
      await fecharPopups();
      await new Promise(r => setTimeout(r, 2000));
      await fecharPopups();
    } else {
      // Login completo
      console.log('[+] Acessando a página de login da UTFPR...');
      await page.goto('https://sistemas2.utfpr.edu.br/login?returnUrl=%2Fdpls%2Fsistema%2Faluno05%2Fmpmenu.inicio', {
        waitUntil: 'networkidle2'
      });

      console.log('[+] Preenchendo credenciais...');
      const loginInput = await page.$('input[type="text"]');
      if (loginInput) { await loginInput.focus(); await page.keyboard.type(ra); }
      const passInput = await page.$('input[type="password"]');
      if (passInput) { await passInput.focus(); await page.keyboard.type(password); }
      
      console.log('[+] Submetendo formulário...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
        const loginBtn = buttons.find(b => b.innerText?.toLowerCase().includes('login') || b.value?.toLowerCase().includes('login'));
        if (loginBtn) { loginBtn.click(); } else { document.querySelector('form')?.submit(); }
      });
      
      console.log('[+] Aguardando navegação pós-login...');
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.log('[-] Timeout de navegação. Prosseguindo...');
        await new Promise(r => setTimeout(r, 3000));
      }

      await fecharPopups();

      // ==========================================
      // 2.1 SELEÇÃO DE CURSO (MÚLTIPLOS CURSOS)
      // ==========================================
      console.log('[+] Verificando se há tela de seleção de curso...');
      await new Promise(r => setTimeout(r, 2000));
      
      let courseSelectSelector = null;
      const possibleSelectors = ['#p_CursLinha', 'select[name="p_CursLinha"]', 'select[name*="Curs"]'];
      for (const sel of possibleSelectors) {
        const found = await page.$(sel);
        if (found) { courseSelectSelector = sel; console.log(`[+] Select de curso encontrado: ${sel}`); break; }
      }
      
      let multipleCourses = null;
      if (courseSelectSelector) {
        multipleCourses = await page.evaluate((cssSelector) => {
          const courseSelect = document.querySelector(cssSelector);
          if (!courseSelect) return null;
          const options = Array.from(courseSelect.options)
            .filter(o => o.value && o.value.trim() !== '' && !o.innerText.includes('Selecione'))
            .map(o => ({ id: o.value, label: o.innerText.trim() }));
          return options.length > 0 ? { courses: options } : null;
        }, courseSelectSelector);
      }

      if (multipleCourses && multipleCourses.courses.length > 0) {
        if (courseId) {
          console.log(`[+] Selecionando curso ${courseId}...`);
          await page.select(courseSelectSelector, courseId.toString());
          await new Promise(r => setTimeout(r, 4000));
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }); } catch (e) {}
          await fecharPopups();
          await new Promise(r => setTimeout(r, 2000));
          await fecharPopups();
        } else {
          const sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          pendingSessions.set(sid, { browser, page, courseSelectSelector, createdAt: Date.now() });
          console.log(`[!] Sessão ${sid} criada aguardando seleção de curso.`);
          return res.status(200).json({ 
            success: false, requiresCourseSelection: true, 
            courses: multipleCourses.courses, sessionId: sid
          });
        }
      }
    }



    // ==========================================
    // 2.5 EXTRAIR PERFIL (NOME, CURSO, SITUAÇÃO)
    // ==========================================
    console.log('[+] Extraindo dados do perfil...');
    const perfilData = await page.evaluate(() => {
      let nome = '', curso = '', situacao = '';
      const bElements = Array.from(document.querySelectorAll('b, strong, span'));
      for (const el of bElements) {
        const text = el.parentElement ? el.parentElement.innerText : el.innerText;
        if (text.includes('Aluno:')) {
          const parts = text.split('Aluno:');
          if (parts[1]) {
            const rawNome = parts[1].split('\n')[0].trim();
            if (rawNome.includes(' - ')) {
              nome = rawNome.split(' - ')[1].trim(); // Extrai apenas o nome, ignorando o RA
            } else {
              nome = rawNome;
            }
          }
        }
        if (text.includes('Curso:')) {
          const parts = text.split('Curso:');
          if (parts[1]) curso = parts[1].split('-')[0].trim();
        }
        if (text.includes('Situação:')) {
          const parts = text.split('Situação:');
          if (parts[1]) situacao = parts[1].trim();
        }
      }
      return { nome, curso, situacao };
    });
    console.log(`[+] Perfil extraído: ${perfilData.nome} | ${perfilData.curso}`);

    // ==========================================
    // 3. EXTRAIR BOLETIM
    // ==========================================
    console.log('[+] Navegando para o Boletim...');
    const urlBoletim = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div, span'));
      for (const el of elements) {
        if (el.innerText && el.innerText.includes('Boletim') && el.innerText.length < 15) {
          const clickable = el.closest('a, button, [onclick]') || el;
          const onclickAttr = clickable.getAttribute('onclick') || '';
          
          // Captura a URL do iframe: src='mpboletim.inicioAluno...'
          const match = onclickAttr.match(/src='([^']+)'/);
          if (match && match[1]) {
            return match[1]; // Retorna a URL relativa
          }
        }
      }
      return null;
    });

    if (urlBoletim) {
      console.log(`[+] URL do Boletim encontrada: ${urlBoletim}`);
      await page.goto(`https://sistemas2.utfpr.edu.br/dpls/sistema/aluno05/${urlBoletim}`, { waitUntil: 'networkidle2' });
    } else {
      console.log('[-] Não foi possível achar a URL do Boletim.');
    }
    
    // Garante que não tem popup na frente do boletim
    await fecharPopups();

    // Lê a tabela do Boletim na página atual (agora que navegamos direto, não precisamos buscar em iframes!)
    let boletimData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      const targetTable = tables.find(t => t.innerText.includes('Frequência') && t.innerText.includes('Turma') && t.innerText.includes('Campus'));
      if (!targetTable) return [];

      const rows = Array.from(targetTable.querySelectorAll('tr')).filter(tr => tr.closest('table') === targetTable);
      const data = [];
      for (let i = 1; i < rows.length; i++) {
        const tds = Array.from(rows[i].children).filter(c => c.tagName === 'TD');
        const cols = tds.map(td => td.innerText.trim());
        if (cols.length >= 12 && cols[0] !== '') {
          if (cols[2] && !cols[2].toLowerCase().includes('avaliação')) {
            // Pegar links de forma mais robusta (href ou onclick)
            const getUrl = (td) => {
              const a = td?.querySelector('a');
              if (!a) return null;
              const text = (a.getAttribute('onclick') || '') + ' ' + (a.getAttribute('href') || '');
              const match = text.match(/(?:src='|window\.open\('|href=")([^'"]+)/) || text.match(/javascript:[a-zA-Z0-9_]+\('([^']+)'/);
              if (match && match[1]) return match[1];
              // Fallback se for um href normal (mas relativo)
              const href = a.getAttribute('href');
              if (href && !href.includes('javascript:')) return href;
              return null;
            };

            const linkCodigo = getUrl(tds[1]);
            const linkTurma = getUrl(tds[3]);

            data.push({
              rowIndex: i,
              campus: cols[0],
              codigo: cols[1],
              disciplina: cols[2],
              turma: cols[3],
              frequencia: cols[11] || '',
              mediaParcial: cols[12] ? cols[12].replace('\n', ' ') : '',
              mediaFinal: cols[13] || '',
              situacao: cols[14] || cols[13] || '',
              linkCodigo: linkCodigo,
              linkTurma: linkTurma,
              avaliacoes: [],
              professores: [],
              planejamento: [],
              planoEnsino: ''
            });
          }
        }
      }
      return data;
    });
    console.log(`[+] Boletim lido: ${boletimData.length} disciplinas encontradas.`);

    // EXTRAÇÃO PROFUNDA PARA CADA DISCIPLINA
    console.log('[+] Iniciando extração profunda (Notas, Plano de Ensino, Professores)...');
    for (let d of boletimData) {
      console.log(`  -> Extraindo detalhes de ${d.codigo} (${d.disciplina})...`);
      
      // 1. Extrair Notas expandindo a linha
      try {
        await page.evaluate((codigo) => {
          const tables = Array.from(document.querySelectorAll('table'));
          const targetTable = tables.find(t => t.innerText.includes('Frequência') && t.innerText.includes('Turma'));
          if (!targetTable) return;
          const targetRow = Array.from(targetTable.querySelectorAll('tr')).find(r => {
             if(r.closest('table') !== targetTable) return false;
             const tds = Array.from(r.children).filter(c => c.tagName === 'TD');
             return tds.length >= 12 && tds[1].innerText.trim() === codigo;
          });
          if (!targetRow) return;
          const tds = Array.from(targetRow.children).filter(c => c.tagName === 'TD');
          if (tds.length >= 12) {
            // "Média Parcial" is usually index 12, but let's safely check if it exists and has an 'a' tag.
            // Often "Média Parcial" is at index 12 for 15-column tables, or 11 for 14-column tables. We just look at the last few columns.
            const btn = (tds[12] && tds[12].querySelector('a')) || (tds[11] && tds[11].querySelector('a'));
            if (btn) btn.click();
          }
        }, d.codigo);
        
        // Aguarda 1 segundo para o AJAX carregar a linha abaixo (ou renderizar)
        await new Promise(r => setTimeout(r, 1000));
        
        // Extrai a sub-tabela que foi criada
        d.avaliacoes = await page.evaluate((codigo) => {
          const tables = Array.from(document.querySelectorAll('table'));
          const targetTable = tables.find(t => t.innerText.includes('Frequência') && t.innerText.includes('Turma'));
          if (!targetTable) return [];
          const targetRow = Array.from(targetTable.querySelectorAll('tr')).find(r => {
             if(r.closest('table') !== targetTable) return false;
             const tds = Array.from(r.children).filter(c => c.tagName === 'TD');
             return tds.length >= 12 && tds[1].innerText.trim() === codigo;
          });
          if (!targetRow) return [];
          
          // O próximo TR geralmente contém a subtabela
          const nextRow = targetRow.nextElementSibling;
          if (nextRow && nextRow.innerText.includes('Avaliação')) {
            const subTable = nextRow.querySelector('table');
            if (!subTable) return [];
            const subRows = Array.from(subTable.querySelectorAll('tr'));
            const notas = [];
            for (let k = 1; k < subRows.length; k++) {
              const subCols = Array.from(subRows[k].querySelectorAll('td, th')).map(c => c.innerText.trim());
              if (subCols.length >= 4 && subCols[0] && !subCols[0].toLowerCase().includes('data')) {
                if (subCols[1].toLowerCase() !== 'nota final') {
                  notas.push({
                    data: subCols[0],
                    avaliacao: subCols[1],
                    peso: subCols[2],
                    nota: subCols[3]
                  });
                }
              }
            }
            return notas;
          }
          return [];
        }, d.rowIndex);
        console.log(`    - ${d.avaliacoes.length} avaliações extraídas.`);
      } catch(e) {
        console.log(`    - Erro ao extrair avaliações: ${e.message}`);
      }

      // 2. Extrair Professores e Planejamento (Clicando no link Turma)
      try {
        const [novaPagina] = await Promise.all([
          new Promise(resolve => browser.once('targetcreated', async target => resolve(await target.page()))),
          page.evaluate((codigo) => {
            const tables = Array.from(document.querySelectorAll('table'));
            const targetTable = tables.find(t => t.innerText.includes('Frequência') && t.innerText.includes('Turma'));
            if (!targetTable) return;
            const targetRow = Array.from(targetTable.querySelectorAll('tr')).find(r => {
               if(r.closest('table') !== targetTable) return false;
               const tds = Array.from(r.children).filter(c => c.tagName === 'TD');
               return tds.length >= 12 && tds[1].innerText.trim() === codigo;
            });
            if (!targetRow) return;
            const tds = Array.from(targetRow.children).filter(c => c.tagName === 'TD');
            const btn = tds[3] ? tds[3].querySelector('a') : null;
            if (btn) btn.click();
          }, d.codigo)
        ]);

        if (novaPagina) {
          await novaPagina.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
          const info = await novaPagina.evaluate(() => {
            const result = { professores: [], planejamento: [] };
            const tables = Array.from(document.querySelectorAll('table'));
            
            // Planejamento e Professores
            const planTable = tables.find(t => t.innerText.includes('Conteúdo') && t.innerText.includes('Data'));
            if (planTable) {
              const pRows = Array.from(planTable.querySelectorAll('tr'));
              for (let i = 1; i < pRows.length; i++) {
                const cols = Array.from(pRows[i].querySelectorAll('td')).map(c => c.innerText.trim());
                if (cols.length >= 5 && cols[0] !== '') {
                  result.planejamento.push({
                    data: cols[0],
                    conteudo: cols[4] // 'Conteúdo previsto' é a 5ª coluna
                  });
                  
                  // Extrair Professor respeitando a regra: apenas os que tem '(lançar)', e não '(não lançar)'.
                  // O cabeçalho 'Professor' também é ignorado.
                  const rawProf = cols[3] || '';
                  if (rawProf.toLowerCase() !== 'professor' && rawProf.includes('(lançar)') && !rawProf.includes('(não lançar)')) {
                    const profName = rawProf.replace(/\(lançar\)/gi, '').trim();
                    if (profName && !result.professores.includes(profName)) {
                       result.professores.push(profName);
                    }
                  }
                }
              }
            }
            return result;
          });
          
          d.professores = info.professores;
          d.planejamento = info.planejamento;
          await novaPagina.close();
          console.log(`    - ${d.professores.length} professores e ${d.planejamento.length} aulas extraídas.`);
        } else {
           console.log(`    - Link de turma não abriu popup.`);
        }
      } catch(e) {
        console.log(`    - Erro ao extrair turma: ${e.message}`);
      }

      // 3. Extrair Plano de Ensino (Clicando no link Código)
      try {
        const [novaPagina] = await Promise.all([
          new Promise(resolve => browser.once('targetcreated', async target => resolve(await target.page()))),
          page.evaluate((codigo) => {
            const tables = Array.from(document.querySelectorAll('table'));
            const targetTable = tables.find(t => t.innerText.includes('Frequência') && t.innerText.includes('Turma'));
            if (!targetTable) return;
            const targetRow = Array.from(targetTable.querySelectorAll('tr')).find(r => {
               if(r.closest('table') !== targetTable) return false;
               const tds = Array.from(r.children).filter(c => c.tagName === 'TD');
               return tds.length >= 12 && tds[1].innerText.trim() === codigo;
            });
            if (!targetRow) return;
            const tds = Array.from(targetRow.children).filter(c => c.tagName === 'TD');
            const btn = tds[1] ? tds[1].querySelector('a') : null;
            if (btn) btn.click();
          }, d.codigo)
        ]);

        if (novaPagina) {
          await novaPagina.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
          let ementa = '';
          for (const frame of novaPagina.frames()) {
            try {
              const text = await frame.evaluate(() => {
                const tables = Array.from(document.querySelectorAll('table'));
                const targetTable = tables.find(t => t.innerText.includes('Ordem') && t.innerText.includes('Ementa') && t.innerText.includes('Conteúdo'));
                if (targetTable) {
                   const rows = Array.from(targetTable.querySelectorAll('tr'));
                   const items = [];
                   for (let i = 1; i < rows.length; i++) {
                       const cols = Array.from(rows[i].querySelectorAll('td')).map(c => c.innerText.trim());
                       // A coluna 'Ementa' geralmente é a segunda (índice 1)
                       if (cols.length >= 3 && cols[1] && cols[1].length > 2) {
                           items.push(cols[1]);
                       }
                   }
                   if (items.length > 0) return items.join('\\n- ');
                }
                return '';
              });
              
              if (text) {
                ementa = '- ' + text;
                break;
              }
            } catch(e) {
              // ignore frame access errors
            }
          }
          
          d.planoEnsino = ementa;
          await novaPagina.close();
          console.log(`    - Ementa extraída: ${ementa ? 'Sim' : 'Não'}`);
        } else {
           console.log(`    - Link de código não abriu popup.`);
        }
      } catch(e) {
        console.log(`    - Erro ao extrair plano de ensino: ${e.message}`);
      }

      // 4. Mesclar avaliações do planejamento com as notas oficiais
      if (d.planejamento && Array.isArray(d.planejamento)) {
        d.avaliacoes = d.avaliacoes || [];
        const initialEvalsCount = d.avaliacoes.length;
        
        d.planejamento.forEach(plan => {
          if (!plan.conteudo) return;
          const conteudoLower = plan.conteudo.toLowerCase();
          const hasKeyword = /(?:\b|^)(prova|exame|trabalho|seminário|seminario|avaliaç[ãa]o|avaliativ[oa]|\bp[1-9]\b|\bav\s*[1-9]\b)\b/i.test(conteudoLower);
          const hasExclude = /(?:\b|^)(revisão|revisao|correção|correcao|vista|resultado|critério|criterio|devolutiva|devolução|devolucao|entrega\s+d[ea]\s+(?:prova|exame|avaliaç[ãa]o)|discussão|discussao|metodologia|exercícios|exercicios|preparatório|preparatorio)\b/i.test(conteudoLower);
          const isAvaliacao = hasKeyword && !hasExclude;
                              
          if (isAvaliacao) {
            // Find the exact sentence that triggered it
            const sentences = plan.conteudo.split(/(?<=[.!?;\n])\s+/);
            let evalSentence = sentences.find(s => /(?:\b|^)(prova|exame|trabalho|seminário|seminario|avaliaç[ãa]o|avaliativ[oa]|\bp[1-9]\b|\bav\s*[1-9]\b)\b/i.test(s) && !/(?:\b|^)(revisão|revisao|correção|correcao|vista|resultado|critério|criterio|devolutiva|devolução|devolucao|entrega\s+d[ea]\s+(?:prova|exame|avaliaç[ãa]o)|discussão|discussao|metodologia|exercícios|exercicios|preparatório|preparatorio)\b/i.test(s)) || plan.conteudo;
            evalSentence = evalSentence.replace(/[.;]+$/, '').trim();
            if (evalSentence.length > 60) evalSentence = evalSentence.substring(0, 60) + '...';

            const existingEval = d.avaliacoes.find(a => a.data === plan.data);
            if (existingEval) {
              const nameLower = existingEval.avaliacao.toLowerCase().trim();
              if (nameLower.startsWith('avalia') || nameLower.startsWith('prova') || nameLower.startsWith('exame') || nameLower.startsWith('nota')) {
                 let cleanEval = evalSentence;
                 if (cleanEval.toLowerCase().startsWith('avaliação')) {
                     cleanEval = cleanEval.substring(9).replace(/^[\\s:-]+/, '').trim();
                 } else if (cleanEval.toLowerCase().startsWith('prova')) {
                     cleanEval = cleanEval.substring(5).replace(/^[\\s:-]+/, '').trim();
                 }
                 
                 if (cleanEval.length > 3 && !existingEval.avaliacao.toLowerCase().includes(cleanEval.toLowerCase())) {
                     existingEval.avaliacao = `${existingEval.avaliacao} - ${cleanEval.charAt(0).toUpperCase() + cleanEval.slice(1)}`;
                 }
              }
            } else if (initialEvalsCount <= 1) {
              d.avaliacoes.push({
                data: plan.data,
                avaliacao: evalSentence,
                peso: '--',
                nota: '--'
              });
            }
          }
        });
        
        // Ordena por data (dd/mm/aaaa)
        d.avaliacoes.sort((a, b) => {
          const [da, ma, ya] = (a.data || '').split('/');
          const [db, mb, yb] = (b.data || '').split('/');
          if (!ya || !yb) return 0;
          const dateA = new Date(`${ya}-${ma}-${da}`);
          const dateB = new Date(`${yb}-${mb}-${db}`);
          return dateA - dateB;
        });
      }
    }

    // ==========================================
    // 4. EXTRAIR HISTÓRICO COMPLETO
    // ==========================================
    console.log('[+] Navegando para o Histórico Completo...');
    let urlHistorico = null;
    
    // Constrói a URL do histórico baseada na do boletim (mantém o contexto do curso selecionado)
    if (urlBoletim && urlBoletim.includes('?')) {
      const queryString = urlBoletim.split('?')[1];
      urlHistorico = `mphistescol.pcprocessa?${queryString}`;
    } else {
      console.log('[+] Voltando ao menu para encontrar URL do Histórico...');
      await page.goto('https://sistemas2.utfpr.edu.br/dpls/sistema/aluno05/mpmenu.inicio', { waitUntil: 'networkidle2' });
      await fecharPopups();
      
      urlHistorico = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, div, span'));
        for (const el of elements) {
          if (el.innerText && el.innerText.includes('Histórico Completo') && el.innerText.length < 25) {
            const clickable = el.closest('a, button, [onclick]') || el;
            const onclickAttr = clickable.getAttribute('onclick') || '';
            const match = onclickAttr.match(/src='([^']+)'/);
            if (match && match[1]) return match[1];
          }
        }
        return null;
      });
    }

    if (urlHistorico) {
      console.log(`[+] URL do Histórico encontrada: ${urlHistorico}`);
      await page.goto(`https://sistemas2.utfpr.edu.br/dpls/sistema/aluno05/${urlHistorico}`, { waitUntil: 'networkidle2' });
    } else {
      console.log('[-] Não foi possível achar a URL do Histórico.');
    }
    
    await fecharPopups();

    // Encaminhar logs do console do browser para o Node
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));

    // Lê o Histórico na página atual
    console.log('[+] Iniciando extração do Histórico...');
    let historicoData = await page.evaluate(() => {
      const extracted = {
        perfil: {},
        matriculadas: [],
        atividadesExtensionistas: [],
        obrigatoriasCursadas: [],
        optativasCursadas: [],
        faltantes: [],
        resumoOptativas: { obrigatoria: 0, cursada: 0 },
        equivalencias: []
      };
      
      // ======================================================
      // HELPER: Encontra tabela por título de forma ROBUSTA
      // O portal UTFPR usa <H4>Título</H4> seguido de <TABLE>
      // Então a estratégia é: achar o H4, depois percorrer
      // os irmãos seguintes até encontrar um <TABLE>.
      // ======================================================
      const findTableByTitle = (title) => {
        const allEls = Array.from(document.querySelectorAll('b, strong, font, th, td, span, div, center, p, caption, a, h1, h2, h3, h4'));
        const candidates = allEls
          .filter(el => (el.innerText || '').includes(title))
          .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
        
        console.log(`[findTable] "${title}": ${candidates.length} candidatos`);
        if (candidates.length === 0) return null;
        
        const best = candidates[0];
        console.log(`[findTable] Melhor: <${best.tagName}> texto=${best.innerText.length} chars`);
        
        // ESTRATÉGIA 1: Se é um heading (H1-H4), percorre irmãos seguintes
        if (/^H[1-4]$/.test(best.tagName)) {
          let sibling = best.nextElementSibling;
          let maxSteps = 10;
          while (sibling && maxSteps-- > 0) {
            if (sibling.tagName === 'TABLE') {
              const rowCount = sibling.querySelectorAll('tr').length;
              console.log(`[findTable] Encontrado TABLE irmão do H4 com ${rowCount} rows`);
              return sibling;
            }
            // Se o irmão contém uma table dentro
            const innerTable = sibling.querySelector('table');
            if (innerTable) {
              console.log(`[findTable] Table dentro de irmão <${sibling.tagName}>`);
              return innerTable;
            }
            sibling = sibling.nextElementSibling;
          }
          console.log(`[findTable] Nenhum TABLE irmão encontrado, tentando closest...`);
        }
        
        // ESTRATÉGIA 2: closest('table') para elementos dentro de tabelas
        let table = best.closest('table');
        if (table) {
          // Verificar se é uma tabela de dados (não layout)
          const rows = table.querySelectorAll(':scope > tbody > tr, :scope > tr');
          console.log(`[findTable] closest table: ${rows.length} TRs diretos`);
          
          // Se tem sub-tabelas, procurar a mais específica
          const innerTables = Array.from(table.querySelectorAll('table'));
          for (const it of innerTables) {
            const firstRows = Array.from(it.querySelectorAll('tr')).slice(0, 3);
            if (firstRows.some(r => (r.innerText || '').includes(title))) {
              console.log(`[findTable] Sub-tabela encontrada`);
              return it;
            }
          }
          return table;
        }
        
        // ESTRATÉGIA 3: Subir no DOM e achar qualquer table descendente
        let parent = best.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const tables = parent.querySelectorAll(':scope > table');
          for (const t of tables) {
            const pos = best.compareDocumentPosition(t);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
              console.log(`[findTable] Table seguinte no parent (depth ${depth})`);
              return t;
            }
          }
          parent = parent.parentElement;
          depth++;
        }
        
        console.log(`[findTable] NENHUMA tabela encontrada para "${title}"`);
        return null;
      };

      // ======================================================
      // 1. Disciplinas Matriculadas
      // ======================================================
      const matTable = findTableByTitle('Disciplinas Matriculadas');
      if (matTable) {
        const rows = Array.from(matTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) { 
          const cols = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
          if (cols.length >= 4 && cols[0] !== '' && !cols[0].toLowerCase().includes('cód') && !cols[0].toLowerCase().includes('disciplina')) {
            if (cols[1] && !cols[1].toLowerCase().includes('avaliação')) {
              extracted.matriculadas.push({
                codigo: cols[0],
                disciplina: cols[1],
                turma: cols[2],
                situacao: cols[3]
              });
            }
          }
        }
        console.log(`[Historico] Matriculadas: ${extracted.matriculadas.length}`);
      }

      // ======================================================
      // 2. Quadro Resumo Atividades Extensionistas
      // ======================================================
      const extTable = findTableByTitle('Quadro Resumo Atividades Extensionistas');
      if (extTable) {
        const rows = Array.from(extTable.querySelectorAll('tr'));
        for (let i = 1; i < rows.length; i++) {
          const cols = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
          if (cols.length >= 5 && cols[0] !== '' && !cols[0].toLowerCase().includes('chext') && !cols[0].toLowerCase().includes('quadro')) {
            extracted.atividadesExtensionistas.push({
              tipo: cols[0] || 'Atividade Extensionista',
              chext: cols[1],
              cursado: cols[2],
              faltante: cols[3],
              situacao: cols[4]
            });
          }
        }
        console.log(`[Historico] Extensionistas: ${extracted.atividadesExtensionistas.length}`);
      }

      // ======================================================
      // 3 & 4. Disciplinas Cursadas (Obrigatórias e Optativas)
      // Extrai: código, disciplina, turma, média, freq, 
      // semestre, ano, situação, professor
      // ======================================================
      const extractCursadas = (title) => {
        const table = findTableByTitle(title);
        const data = [];
        if (!table) {
          console.log(`[extractCursadas] Tabela NÃO encontrada: "${title}"`);
          return data;
        }
        
        let allRows = Array.from(table.querySelectorAll('tr'));
        console.log(`[extractCursadas] "${title}": ${allRows.length} rows totais no wrapper`);
        
        // Encontrar a linha de cabeçalho por conteúdo das células
        let headerRow = null;
        for (const r of allRows) {
          const cells = Array.from(r.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
          if (cells.length < 5) continue;
          const cellTexts = cells.map(c => c.innerText.trim().toLowerCase());
          // Procurar linha onde CÉLULAS INDIVIDUAIS contêm 'cód' e 'disciplina'
          const hasCod = cellTexts.some(t => t.includes('cód') || t === 'cod.');
          const hasDisc = cellTexts.some(t => t.includes('disciplina'));
          if (hasCod && hasDisc) {
            headerRow = r;
            break;
          }
        }
        
        if (!headerRow) {
          console.log(`[extractCursadas] Header NÃO encontrado para "${title}"`);
          if (allRows.length > 2) headerRow = allRows[1];
          else return data;
        }
        
        // Limitar as linhas apenas à tabela interna real (evita pegar dados de tabelas subsequentes)
        const actualTable = headerRow.closest('table');
        const rows = Array.from(actualTable.querySelectorAll('tr'));
        console.log(`[extractCursadas] Tabela interna isolada: ${rows.length} rows`);
        
        const headerCells = Array.from(headerRow.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        const headers = headerCells.map(h => h.innerText.trim().toLowerCase());
        console.log(`[extractCursadas] Headers: [${headers.join(' | ')}]`);
        
        // Mapear colunas por nome
        const findCol = (...keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));
        const idxPerObr = findCol('per.disc', 'per_obr', 'per.');
        const idxCod = findCol('cód', 'cod.');
        const idxDisc = findCol('disciplina');
        const idxTurma = findCol('turma');
        const idxMedia = findCol('média', 'media');
        const idxFreq = findCol('freq');
        const idxSem = findCol('semestre');
        const idxAno = findCol('ano');
        const idxSit = findCol('situação', 'situacao', 'professor');
        
        console.log(`[extractCursadas] Cols -> Cod:${idxCod} Disc:${idxDisc} Turma:${idxTurma} Media:${idxMedia} Freq:${idxFreq} Sem:${idxSem} Ano:${idxAno} Sit:${idxSit}`);
        
        const headerIdx = rows.indexOf(headerRow);
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const cols = Array.from(rows[i].children).filter(c => c.tagName === 'TD' || c.tagName === 'TH').map(td => td.innerText.trim());
          if (cols.length < 5) continue;
          
          const codVal = cols[idxCod >= 0 ? idxCod : 1] || '';
          if (codVal === '' || codVal.toLowerCase().includes('cód') || codVal.includes('(') || codVal.toUpperCase().includes('ENAD')) continue;
          
          const nomeDisciplina = cols[idxDisc >= 0 ? idxDisc : 2] || '';
          if (nomeDisciplina.toUpperCase().includes('ENADE')) continue;
          
          // Pular linhas que são sub-headers
          if (codVal.toLowerCase().includes('versão') || codVal.toLowerCase().includes('disciplina')) continue;
          
          // Extrair situação e professor da última coluna
          const sitRaw = cols[idxSit >= 0 ? idxSit : cols.length - 1] || '';
          const sitLines = sitRaw.split('\n').map(l => l.trim()).filter(Boolean);
          let situacao = '';
          let professor = '';
          for (const line of sitLines) {
            if (line.startsWith('>>')) continue; // metadata
            if (line.startsWith('Crédito') || line.startsWith('Aprovado') || line.startsWith('Reprovado') || line.startsWith('Cancelado') || line.startsWith('Equivalência') || line.startsWith('Enade')) {
              situacao = line;
            } else if (line.includes(' - ') && !line.startsWith('>>')) {
              professor = line.split(' - ')[0].trim();
            }
          }
          if (!situacao && sitLines.length > 0) situacao = sitLines[0];
          
          // Verificar se semestre não é algo tipo "2023/1" -> neste caso o ano e semestre estão juntos
          let extractedAno = cols[idxAno >= 0 ? idxAno : 12] || '';
          let extractedSem = cols[idxSem >= 0 ? idxSem : 11] || '';
          
          // Fallback para caso Ano/Semestre estejam na mesma coluna separados por barra "2023/1"
          if (idxAno < 0 && idxSem < 0) {
              const possibleAnoSem = cols.find(c => c.match(/^\d{4}\/\d$/));
              if (possibleAnoSem) {
                  const parts = possibleAnoSem.split('/');
                  extractedAno = parts[0];
                  extractedSem = parts[1];
              }
          } else if (extractedAno.includes('/')) {
              const parts = extractedAno.split('/');
              extractedAno = parts[0];
              extractedSem = parts[1];
          } else if (extractedSem.includes('/')) {
              const parts = extractedSem.split('/');
              extractedAno = parts[0];
              extractedSem = parts[1];
          }

          data.push({
            codigo: codVal,
            disciplina: nomeDisciplina,
            turma: idxTurma >= 0 ? cols[idxTurma] : '',
            media: cols[idxMedia >= 0 ? idxMedia : 9] || '',
            frequencia: idxFreq >= 0 ? cols[idxFreq] : '',
            semestre: extractedSem,
            ano: extractedAno,
            situacao: situacao,
            professor: professor
          });
        }
        
        console.log(`[extractCursadas] "${title}": ${data.length} disciplinas extraídas`);
        return data;
      };

      extracted.obrigatoriasCursadas = extractCursadas('Disciplinas Obrigatórias Cursadas');
      extracted.optativasCursadas = extractCursadas('Disciplinas Optativas Cursadas');

      // ======================================================
      // 5. Disciplinas Obrigatórias Faltantes
      // ======================================================
      const faltantesTable = findTableByTitle('Disciplinas Obrigatórias Faltantes');
      if (faltantesTable) {
        const allRows = Array.from(faltantesTable.querySelectorAll('tr'));
        console.log(`[Faltantes] Tabela wrapper com ${allRows.length} rows`);
        
        // Encontrar header row
        let headerRow = null;
        for (const r of allRows) {
          const text = r.innerText.toLowerCase();
          if (text.includes('semestre') && text.includes('código')) {
            headerRow = r;
            break;
          }
        }
        
        if (headerRow) {
          const actualTable = headerRow.closest('table');
          const rows = Array.from(actualTable.querySelectorAll('tr'));
          const startIdx = rows.indexOf(headerRow) + 1;
          
          for (let i = startIdx; i < rows.length; i++) {
            const cols = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
            if (cols.length >= 3) {
              // Encontrar a coluna que parece código (alfanumérico curto)
              // E a que parece disciplina (texto longo)
              let semestre = '', codigo = '', disciplina = '';
              
              for (let c = 0; c < cols.length; c++) {
                const val = cols[c];
                if (!val) continue;
                if (/^\d{1,2}$/.test(val) && !semestre) {
                  semestre = val;
                } else if (/^[A-Z]{2,}\d+/.test(val) && !codigo) {
                  codigo = val;
                } else if (val.length > 3 && val !== codigo && !disciplina) {
                  disciplina = val;
                }
              }
              
              if (codigo && disciplina) {
                extracted.faltantes.push({ semestre, codigo, disciplina });
              }
            }
          }
        }
        console.log(`[Faltantes] ${extracted.faltantes.length} disciplinas faltantes`);
      }

      // ======================================================
      // 6. Resumo Optativas
      // ======================================================
      const resOptTable = findTableByTitle('Resumo Optativas');
      if (resOptTable) {
        const rows = Array.from(resOptTable.querySelectorAll('tr'));
        let headerRow = rows.find(r => r.innerText.includes('CH Obrigat'));
        if (headerRow) {
          const headers = Array.from(headerRow.querySelectorAll('td, th')).map(h => h.innerText.trim().toLowerCase());
          const idxObr = headers.findIndex(h => h.includes('obrigat'));
          const idxCur = headers.findIndex(h => h.includes('cursada') || h.includes('validada'));
          
          console.log(`[ResOpt] Headers: [${headers.join(' | ')}] Obr:${idxObr} Cur:${idxCur}`);
          
          for (let i = rows.indexOf(headerRow) + 1; i < rows.length; i++) {
            const cols = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
            if (cols.length > 3) {
              extracted.resumoOptativas.obrigatoria += parseInt(cols[idxObr >= 0 ? idxObr : 4]) || 0;
              extracted.resumoOptativas.cursada += parseInt(cols[idxCur >= 0 ? idxCur : 5]) || 0;
            }
          }
        }
        console.log(`[ResOpt] CH: ${extracted.resumoOptativas.cursada}/${extracted.resumoOptativas.obrigatoria}`);
      }
      
      // ======================================================
      // 8. Quadro Resumo disciplinas
      // ======================================================
      extracted.chtGeral = null;
      const resumoDiscTable = findTableByTitle('Quadro Resumo disciplinas');
      if (resumoDiscTable) {
        const rows = Array.from(resumoDiscTable.querySelectorAll('tr'));
        const targetRow = rows.find(r => r.innerText.includes('CHT Geral do curso'));
        if (targetRow) {
          const cols = Array.from(targetRow.querySelectorAll('td, th')).map(td => td.innerText.trim());
          const parseNum = (str) => parseInt((str || '').split('(')[0].replace(/\D/g, '')) || 0;
          if (cols.length >= 6) {
            extracted.chtGeral = {
              total: parseNum(cols[1]),
              cursada: parseNum(cols[2]),
              aprovada: parseNum(cols[3]),
              faltante: parseNum(cols[4]),
              totalCursadaAprovada: parseNum(cols[5])
            };
          }
        }
      }

      // ======================================================
      // 9. Quadro Resumo Atividades Extensionistas
      // ======================================================
      extracted.chtExtensionistaDetalhado = [];
      const resumoExtTable = findTableByTitle('Quadro Resumo Atividades Extensionistas');
      if (resumoExtTable) {
        const rows = Array.from(resumoExtTable.querySelectorAll('tr'));
        rows.forEach(r => {
          const text = r.innerText || '';
          if (text.toLowerCase().includes('chext') || text.toLowerCase().includes('curriculares')) {
            const cols = Array.from(r.querySelectorAll('td, th')).map(td => td.innerText.trim());
            const parseNum = (str) => parseInt((str || '').split('(')[0].replace(/\D/g, '')) || 0;
            if (cols.length >= 4 && !text.includes('CHEXT (F)')) {
              extracted.chtExtensionistaDetalhado.push({
                tipo: cols[0],
                total: parseNum(cols[1]),
                cursada: parseNum(cols[2]),
                faltante: parseNum(cols[3]),
                situacao: cols[4] || ''
              });
            }
          }
        });
      }

      // ======================================================
      // 7. Equivalências (Detalhes das Equivalentes Cursadas)
      // ======================================================
      extracted.equivalencias = [];
      const equivTable = findTableByTitle('Detalhes das Equivalentes Cursadas de Disciplinas Obrigatórias');
      if (equivTable) {
        let allRows = Array.from(equivTable.querySelectorAll('tr'));
        let headerRow = null;
        for (const r of allRows) {
          const cells = Array.from(r.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
          const cellTexts = cells.map(c => c.innerText.trim().toLowerCase());
          if (cellTexts.some(t => t.includes('disciplina equivalente'))) {
            headerRow = r;
            break;
          }
        }
        
        if (headerRow) {
          const actualTable = headerRow.closest('table');
          const rows = Array.from(actualTable.querySelectorAll('tr'));
          const startIdx = rows.indexOf(headerRow) + 2; // Pula a linha do "Disciplina Equivalente" e a do sub-header
          
          let currentEquiv = null;

          for (let i = startIdx; i < rows.length; i++) {
            const cols = Array.from(rows[i].children).filter(c => c.tagName === 'TD' || c.tagName === 'TH').map(td => td.innerText.trim());
            
            // Se for uma linha completa (nova disciplina equivalente)
            if (cols.length >= 15) {
                currentEquiv = {
                    codigoEquivalente: cols[0],
                    nomeEquivalente: cols[1],
                    turmaEquivalente: cols[2],
                    notaEquivalente: cols[6],
                    freqEquivalente: cols[7],
                    anoPeriodoEquivalente: cols[8],
                    situacaoEquivalente: cols[9]
                };
            }
            
            if (!currentEquiv) continue;

            // Encontrar as colunas do lado direito (Obrigatória)
            // Se for uma linha continuação (rowspan), ela terá por volta de 6 colunas.
            // Se for uma linha completa, as colunas da obrigatória estarão mais pro final (ex: cols[12], cols[13])
            let codObrig = '';
            let nomeObrig = '';

            if (cols.length <= 8) {
                // Linha continuação
                codObrig = cols[1] || '';
                nomeObrig = cols[2] || '';
            } else {
                // Linha completa
                // Procurar pela seta '=>' ou ir de trás pra frente
                const setaIdx = cols.findIndex(c => c.includes('=>'));
                if (setaIdx !== -1 && cols.length > setaIdx + 3) {
                    codObrig = cols[setaIdx + 2];
                    nomeObrig = cols[setaIdx + 3];
                } else {
                    // Fallback para posições fixas aproximadas
                    codObrig = cols[12] || '';
                    nomeObrig = cols[13] || '';
                }
            }

            if (codObrig && !codObrig.toLowerCase().includes('cód') && currentEquiv.codigoEquivalente !== '') {
                extracted.equivalencias.push({
                    codigoEquivalente: currentEquiv.codigoEquivalente,
                    nomeEquivalente: currentEquiv.nomeEquivalente,
                    turmaEquivalente: currentEquiv.turmaEquivalente,
                    notaEquivalente: currentEquiv.notaEquivalente,
                    freqEquivalente: currentEquiv.freqEquivalente,
                    anoPeriodoEquivalente: currentEquiv.anoPeriodoEquivalente,
                    situacaoEquivalente: currentEquiv.situacaoEquivalente,
                    codigoObrigatoria: codObrig,
                    nomeObrigatoria: nomeObrig
                });
            }
          }
        }
        console.log(`[Equivalencias] ${extracted.equivalencias.length} validações extraídas`);
      }
      
      console.log(`[RESULTADO FINAL] Obrigatorias: ${extracted.obrigatoriasCursadas.length}, Optativas: ${extracted.optativasCursadas.length}, Faltantes: ${extracted.faltantes.length}, Extensionistas: ${extracted.atividadesExtensionistas.length}`);
      
      return extracted;
    });
    
    console.log(`[+] Historico extraído -> Obrig: ${historicoData.obrigatoriasCursadas.length}, Opt: ${historicoData.optativasCursadas.length}, Falt: ${historicoData.faltantes.length}, Ext: ${historicoData.atividadesExtensionistas.length}`);

    await browser.close();
    console.log('[+] Extração finalizada com sucesso!');

    return res.json({
      success: true,
      message: 'Dados extraídos com sucesso.',
      data: {
        perfil: perfilData,
        boletim: boletimData,
        historico: historicoData
      }
    });

  } catch (error) {
    console.error('Erro durante o scraping:', error);
    if (browser) await browser.close();
    return res.status(500).json({ success: false, error: 'Falha na automação', details: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Extraction Service rodando na porta ${PORT}`);
});
