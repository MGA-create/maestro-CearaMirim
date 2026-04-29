// ========================================================================
// 0. CONFIGURAÇÕES DA API V9.2.6 (RBAC & MESA DE AUDITORIA)
// ========================================================================

// ⚠️ ATENÇÃO: COLE AQUI O LINK DO SEU DEPLOY DO GOOGLE APPS SCRIPT (/exec)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxC09eP0_NTtV2rHEDGA0apXTX4MYlU0NoYnU0_IBvyZM20I5V1KC1rCBx3n6ojAhXG/exec";

async function apiCall(action, payload = {}) {
  let tokenToUse = localStorage.getItem("MAESTRO_OP_TOKEN");
  if (!tokenToUse) {
     tokenToUse = localStorage.getItem("MAESTRO_EST_TOKEN"); 
  }
  
  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload, token: tokenToUse })
    });
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("text/html") !== -1) {
       const htmlErro = await response.text();
       console.error("A Google devolveu HTML em vez de JSON. Possível erro fatal no servidor:", htmlErro);
       throw new Error("Falha no servidor da Google. Verifique os logs do Apps Script.");
    }

    const data = await response.json();
    
    if (data.status === 401 || data.status === 403) {
      if (action === "invalidarTokenSessao") {
        return { sucesso: true };
      } else {
        if (data.status === 403) {
            showToast(data.erro || "Acesso negado para o seu nível de utilizador.", "error");
        } else {
            if (localStorage.getItem("MAESTRO_EST_TOKEN")) {
                sairCarteira(true);
                showToast("A sua sessão de estudante expirou.", "error");
            } else {
                encerrarSessaoOperador(true);
                showToast("Sessão expirada. A redirecionar...", "error");
            }
        }
        throw new Error(data.erro || "Sessão Expirada ou Acesso Negado");
      }
    }
    
    return data;
  } catch (err) {
    console.error("Falha na chamada da API Maestro:", err);
    throw err;
  }
}

// ========================================================================
// 1. MOTOR PWA & ARRANQUE DINÂMICO (BOOTSTRAP)
// ========================================================================

let deferredPrompt; 

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.remove('hidden');
});

async function bootSystem() {
  try {
    const res = await apiCall("getConfiguracoesPWA");
    
    if (res.sucesso) {
      window.PWA_NOME = res.pwa.NOME;
      window.PWA_ICONE = res.pwa.ICONE;
      window.THEME_COLOR = res.ui.COR_PRIMARIA;
      window.BG_COLOR = res.ui.COR_SECUNDARIA;
      
      document.title = window.PWA_NOME;
      
      document.documentElement.style.setProperty('--primary', res.ui.COR_PRIMARIA);
      document.documentElement.style.setProperty('--secondary', res.ui.COR_SECUNDARIA);
      document.documentElement.style.setProperty('--accent', res.ui.COR_DE_DESTAQUE);

      if (res.ui.LOGO && res.ui.LOGO !== "") {
        const logoEl = document.getElementById('ui-logo');
        const splashLogo = document.getElementById('splash-logo');
        if (logoEl) { logoEl.src = res.ui.LOGO; logoEl.classList.remove('hidden'); }
        if (splashLogo) { splashLogo.src = res.ui.LOGO; splashLogo.classList.remove('hidden'); }
      }
      
      const elNome = document.getElementById('ui-nome-sistema');
      if (elNome) elNome.innerText = window.PWA_NOME.toUpperCase();
      
      const elSetor = document.getElementById('ui-nome-setor');
      if (elSetor) elSetor.innerText = res.ui.NOME_SISTEMA;

      const elEnd = document.getElementById('ui-endereco');
      if (elEnd && res.contato.ENDERECO) { elEnd.innerText = res.contato.ENDERECO; elEnd.classList.remove('hidden'); }
      
      const elEmail = document.getElementById('ui-email');
      if (elEmail && res.contato.EMAIL) { elEmail.innerText = res.contato.EMAIL; elEmail.classList.remove('hidden'); }
      
      const elCnpj = document.getElementById('ui-cnpj');
      if (elCnpj && res.contato.CNPJ) { elCnpj.innerText = "CNPJ: " + res.contato.CNPJ; elCnpj.classList.remove('hidden'); }
      
      initPWA();
    }
  } catch(e) {
    console.warn("A arrancar em modo offline persistente.");
  }
  
  ocultarSplashScreen();
  carregarAvisosSMEB(); 
  verificarSessaoAtiva();
  restaurarSessaoEstudante();
}

function ocultarSplashScreen() {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }
}

function initPWA() {
  if(!window.PWA_NOME) return; 

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker Registado.'))
      .catch(err => console.log('Erro no SW:', err));
  }
}

function instalarPWA() {
  if (!deferredPrompt) {
    showToast("Não é possível instalar neste dispositivo ou já está instalado.", "info");
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      document.getElementById('pwa-install-banner').classList.add('hidden');
      showToast("App instalada! Procure o ícone no seu ecrã principal.", "success");
    }
    deferredPrompt = null; 
  });
}

function switchView(viewId) {
  const views = document.querySelectorAll('.view-section');
  views.forEach(v => {
    v.classList.remove('active-view');
    v.style.display = 'none';
  });
  
  const target = document.getElementById(viewId);
  if (target) {
    target.style.display = 'block';
    setTimeout(() => target.classList.add('active-view'), 10);
  }

  const muralAvisos = document.getElementById('mural-avisos');
  const muralHeader = document.getElementById('mural-avisos-header');
  
  if (muralAvisos && muralAvisos.innerHTML.trim() !== '') {
    if (viewId === 'view-hub' || viewId === 'view-admin-hub' || viewId === 'view-aluno-menu') {
      muralAvisos.classList.remove('hidden');
      if (muralHeader) muralHeader.classList.remove('hidden');
    } else {
      muralAvisos.classList.add('hidden');
      if (muralHeader) muralHeader.classList.add('hidden');
    }
  }
}

async function carregarAvisosSMEB() {
  try {
    const res = await apiCall("getAvisosAtivos");
    const container = document.getElementById('mural-avisos');
    const header = document.getElementById('mural-avisos-header');
    const avisos = res.avisos;
    
    if (!avisos || avisos.length === 0) {
      container.classList.add('hidden');
      if (header) header.classList.add('hidden');
      return;
    }

    let html = '';
    avisos.forEach(function(aviso) {
      let classeTipo = 'aviso-geral';
      const tipoNormalizado = aviso.tipo.toLowerCase().trim();
      if (tipoNormalizado === 'urgente') classeTipo = 'aviso-urgente';
      if (tipoNormalizado === 'transporte') classeTipo = 'aviso-transporte';

      html += `<div class="aviso-card ${classeTipo}">`;
      if (aviso.imagem) html += `<img src="${aviso.imagem}" class="aviso-imagem" alt="Aviso">`;
      html += `<span class="aviso-tag">${aviso.tipo}</span>`;
      html += `<h4 class="aviso-titulo">${aviso.titulo}</h4>`;
      if (aviso.assunto) html += `<p class="aviso-texto">${aviso.assunto}</p>`;
      if (aviso.anexo) html += `<a href="${aviso.anexo}" target="_blank" class="aviso-btn-anexo">📄 Baixar Documento</a>`;
      html += `</div>`;
    });

    container.innerHTML = html;
    container.classList.remove('hidden'); 
    if (header) header.classList.remove('hidden');
  } catch(e) {
     console.log("Avisos não carregados.");
  }
}

// ========================================================================
// 3. MÓDULO DE SEGURANÇA SAAS & RBAC (V9.2.6)
// ========================================================================
const TOKEN_KEY = "MAESTRO_OP_TOKEN";
const CACHE_LISTA_KEY = "MAESTRO_CACHE_FISCAL"; 
const CACHE_STATS_KEY = "MAESTRO_DASH_STATS_V9"; 
const NIVEL_KEY = "MAESTRO_OP_NIVEL";
let timeoutSessaoID = null;

function aplicarFiltrosRBAC() {
    const nivelAtual = localStorage.getItem(NIVEL_KEY) || "FISCAL";
    const nivelUpper = nivelAtual.toUpperCase().trim();
    
    const grupoSec = document.getElementById('menu-grupo-secretaria');
    const grupoMod = document.getElementById('menu-grupo-moderador');
    
    if (grupoSec) grupoSec.classList.add('hidden');
    if (grupoMod) grupoMod.classList.add('hidden');
    
    if (nivelUpper === "OPERADOR" || nivelUpper === "SUPERVISOR" || nivelUpper === "MODERADOR") {
        if (grupoSec) grupoSec.classList.remove('hidden');
    }
    if (nivelUpper === "MODERADOR") {
        if (grupoMod) grupoMod.classList.remove('hidden');
    }
}

async function fazerLoginOperador() {
  const email = document.getElementById('fiscal-email').value.trim();
  const senha = document.getElementById('fiscal-senha').value.trim();
  const btn = document.getElementById('btn-login-fiscal');
  const resBox = document.getElementById('res-login-fiscal');

  if (!email || !senha) {
    resBox.innerText = "Preencha o e-mail e a palavra-passe.";
    resBox.classList.remove('hidden');
    return;
  }

  btn.innerText = "A VALIDAR...";
  btn.disabled = true;
  resBox.classList.add('hidden');

  try {
    const resAuth = await apiCall("fazerLoginOperador", { email: email, senha: senha });
    
    if (!resAuth.sucesso) {
      btn.innerText = "AUTENTICAR";
      btn.disabled = false;
      resBox.innerText = resAuth.erro;
      resBox.classList.remove('hidden');
      return;
    }

    localStorage.setItem(TOKEN_KEY, resAuth.token);
    localStorage.setItem(NIVEL_KEY, resAuth.nivel); // V9.2.6: Salva a patente
    document.getElementById('nome-operador-logado').innerText = resAuth.nome;
    
    if (resAuth.stats) {
      localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(resAuth.stats));
    }
    
    btn.innerText = "A BAIXAR DADOS...";

    const resCache = await apiCall("sincronizarCacheFiscal");
    if (resCache.sucesso) {
       localStorage.setItem(CACHE_LISTA_KEY, JSON.stringify(resCache.dados));
       if (resCache.sementeDia) localStorage.setItem("MAESTRO_SEMENTE_FISCAL", resCache.sementeDia);
       
       btn.innerText = "AUTENTICAR";
       btn.disabled = false;
       document.getElementById('fiscal-email').value = "";
       document.getElementById('fiscal-senha').value = "";
       
       armarRelogioSessaoLocal();
       aplicarFiltrosRBAC(); // Aplica a visualização consoante a patente
       switchView('view-admin-hub');
       showToast("Sessão iniciada como: " + resAuth.nivel, "success");
    }

  } catch(err) {
    btn.innerText = "AUTENTICAR";
    btn.disabled = false;
    resBox.innerText = "Erro de conexão com a API.";
    resBox.classList.remove('hidden');
  }
}

async function verificarSessaoAtiva() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  try {
    const sessao = await apiCall("validarTokenSessao");
    if (sessao.sucesso && sessao.valido) {
      armarRelogioSessaoLocal();
      aplicarFiltrosRBAC(); 
      if(document.getElementById('id-fiscal') && document.getElementById('id-fiscal').value !== "") {
        switchView('view-fiscal'); 
        validarFiscal();
      } else {
        switchView('view-admin-hub'); 
      }
    }
  } catch(e) {}
}

function armarRelogioSessaoLocal() {
   if (timeoutSessaoID) clearTimeout(timeoutSessaoID);
   timeoutSessaoID = setTimeout(() => {
      encerrarSessaoOperador(true);
      showToast("Sessão encerrada (8h limite).", "info");
   }, 28800000);
}

async function encerrarSessaoOperador(silencioso = false) {
  try { await apiCall("invalidarTokenSessao"); } catch(e) {}
  
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CACHE_LISTA_KEY);
  localStorage.removeItem(CACHE_STATS_KEY);
  localStorage.removeItem(NIVEL_KEY); 
  localStorage.removeItem("MAESTRO_SEMENTE_FISCAL"); 
  if (timeoutSessaoID) clearTimeout(timeoutSessaoID);
  fecharScanner();
  
  document.getElementById('nome-operador-logado').innerText = "Operador";
  document.getElementById('res-fiscal').innerHTML = "";
  document.getElementById('id-fiscal').value = "";
  
  switchView('view-hub');
  if(!silencioso) showToast("Sessão encerrada.", "info");
}

// ========================================================================
// 4. MESA DE AUDITORIA & GESTÃO DOCUMENTAL (V9.2.6 - WEB)
// ========================================================================

let arrayAlunosAuditoria = [];

function abrirMesaAuditoria() {
    switchView('view-auditoria');
    carregarFilaAuditoria();
}

async function carregarFilaAuditoria(ehPesquisa = false) {
    const container = document.getElementById('auditoria-fila-container');
    const inputPesquisa = document.getElementById('auditoria-pesquisa').value.trim();
    const termo = ehPesquisa ? inputPesquisa : "";
    
    container.innerHTML = '<div class="text-center" style="padding: 30px;"><div class="loader" style="margin: 0 auto;"></div><p style="font-size: 11px; margin-top: 10px;">A puxar a fila de trabalho...</p></div>';
    
    try {
        const res = await apiCall("getListaAuditoria", { pesquisa: termo });
        if (res.sucesso) {
            arrayAlunosAuditoria = res.lista;
            renderizarListaAuditoria();
        } else {
            container.innerHTML = `<div class="error-box">Erro: ${res.erro}</div>`;
        }
    } catch(e) {
        container.innerHTML = `<div class="error-box">Falha ao ligar à base de dados.</div>`;
    }
}

function renderizarListaAuditoria() {
    const container = document.getElementById('auditoria-fila-container');
    
    if (!arrayAlunosAuditoria || arrayAlunosAuditoria.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; background: #fff; border: 1px dashed #ccc; border-radius: 8px;"><h3 style="color: var(--success); margin:0;">🎉 Fila Vazia!</h3><p style="font-size: 12px; color: #666;">Todos os pedidos foram atendidos.</p></div>`;
        return;
    }
    
    let html = '';
    arrayAlunosAuditoria.forEach(aluno => {
        let corBadge = '#333'; let bgBadge = '#f0f0f0';
        if (aluno.statusAuditoria === "ANALISE_HUMANA" || aluno.statusAuditoria === "PENDENCIA") { corBadge = '#d97706'; bgBadge = '#fef3c7'; }
        else if (aluno.statusAuditoria === "ALERTA_FRAUDE" || aluno.statusAtividade === "SUSPENSO") { corBadge = '#dc2626'; bgBadge = '#fee2e2'; }
        else if (aluno.statusAuditoria === "PENDENTE") { corBadge = '#4b5563'; bgBadge = '#f3f4f6'; }
        else if (aluno.statusAtividade === "ATIVO") { corBadge = '#059669'; bgBadge = '#d1fae5'; }
        
        let d = new Date(aluno.timestamp);
        let strData = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
        if (isNaN(d.getTime()) || aluno.timestamp === 0) strData = "Sem data registada";

        html += `
        <div class="auditoria-linha">
            <div class="auditoria-info">
                <h4 class="auditoria-nome">${aluno.nome}</h4>
                <span class="auditoria-data">Submetido: ${strData}</span>
                <span class="auditoria-badge" style="color: ${corBadge}; background: ${bgBadge}; margin-left: 0; display: inline-block; margin-top: 4px;">${aluno.statusAuditoria}</span>
            </div>
            <button class="btn-solid" style="width: auto; margin: 0; padding: 8px 12px; font-size: 11px;" onclick="abrirModalRaioX(${aluno.linhaBase})">Detalhar 🔍</button>
        </div>`;
    });
    
    container.innerHTML = html;
}

function abrirModalRaioX(linhaBase) {
    const aluno = arrayAlunosAuditoria.find(a => a.linhaBase === linhaBase);
    if (!aluno) return;
    
    document.getElementById('rx-nome').innerText = aluno.nome;
    document.getElementById('rx-cpf').innerText = aluno.cpf;
    document.getElementById('rx-matricula').innerText = aluno.matricula;
    document.getElementById('rx-email').innerText = aluno.email;
    document.getElementById('rx-logistica').innerText = `${aluno.instituicao} • ${aluno.turno}`;
    document.getElementById('rx-status-badge').innerText = aluno.statusAtividade;
    
    document.getElementById('rx-novo-status').value = aluno.statusAtividade;
    document.getElementById('rx-notas').value = aluno.observacoes;
    document.getElementById('rx-linha-base').value = linhaBase;
    
    // Gerar Botões de Anexo (Túnel Base64)
    let anexoHtml = '';
    ['FOTO', 'DOCUMENTO', 'VINCULO', 'RESIDENCIA', 'ESTAGIO', 'LAUDO'].forEach(tipo => {
        anexoHtml += `<button class="btn-secondary" style="width: calc(50% - 4px); margin: 0; font-size: 10px; padding: 6px;" onclick="abrirDocumentoSeguro(${linhaBase}, '${tipo}')">Ver ${tipo}</button>`;
    });
    document.getElementById('rx-documentos-grid').innerHTML = anexoHtml;
    
    document.getElementById('modal-raio-x-aluno').classList.remove('hidden');
}

function fecharModalRaioX() {
    document.getElementById('modal-raio-x-aluno').classList.add('hidden');
}

async function abrirDocumentoSeguro(linhaBase, tipoDoc) {
    const docViewer = document.getElementById('modal-doc-viewer');
    const contentBox = document.getElementById('doc-viewer-content');
    
    document.getElementById('doc-viewer-title').innerText = "A descarregar: " + tipoDoc;
    contentBox.innerHTML = '<div class="loader"></div>';
    docViewer.classList.remove('hidden');
    
    try {
        const res = await apiCall("verFicheiroBase64", { linhaEstudante: linhaBase, tipoDocumento: tipoDoc });
        
        if (res.sucesso && res.base64) {
            document.getElementById('doc-viewer-title').innerText = tipoDoc;
            const fullBase64 = `data:${res.mimeType};base64,${res.base64}`;
            
            if (res.mimeType.includes("image")) {
                contentBox.innerHTML = `<img src="${fullBase64}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
            } else if (res.mimeType.includes("pdf")) {
                contentBox.innerHTML = `<embed src="${fullBase64}" width="100%" height="100%" type="application/pdf">`;
            } else {
                contentBox.innerHTML = `<div class="error-box">Formato não suportado: ${res.mimeType}</div>`;
            }
        } else {
            contentBox.innerHTML = `<div class="error-box">Erro: ${res.erro}</div>`;
        }
    } catch(e) {
        contentBox.innerHTML = `<div class="error-box">Falha de rede. Tente novamente.</div>`;
    }
}

function fecharModalDocViewer() {
    document.getElementById('modal-doc-viewer').classList.add('hidden');
    document.getElementById('doc-viewer-content').innerHTML = ''; // Limpa memória Base64
}

async function gravarDecisaoAuditoria() {
    const linhaBase = document.getElementById('rx-linha-base').value;
    const novoStatus = document.getElementById('rx-novo-status').value;
    const notas = document.getElementById('rx-notas').value;
    
    showToast("A gravar e a notificar o estudante...", "loading");
    
    try {
        const res = await apiCall("atualizarStatusAluno", { linhaEstudante: parseInt(linhaBase), novoStatus: novoStatus, notasOperador: notas });
        if (res.sucesso) {
            showToast("Alteração guardada com sucesso!", "success");
            fecharModalRaioX();
            // Atualiza a fila local visualmente sem fazer novo pedido à API
            const alunoIndex = arrayAlunosAuditoria.findIndex(a => a.linhaBase === parseInt(linhaBase));
            if (alunoIndex !== -1) {
                arrayAlunosAuditoria[alunoIndex].statusAtividade = novoStatus;
                if (novoStatus === "ATIVO") arrayAlunosAuditoria[alunoIndex].statusAuditoria = "OK";
                renderizarListaAuditoria();
            }
        } else {
            showToast(res.erro || "Falha ao gravar.", "error");
        }
    } catch (e) {
        showToast("Erro na ligação ao servidor.", "error");
    }
}

function acionarIAParaEmail() {
    const notasTexto = document.getElementById('rx-notas').value.trim();
    if (!notasTexto) {
        showToast("Escreva o motivo da retenção nas notas primeiro.", "error");
        return;
    }
    
    const linhaBase = parseInt(document.getElementById('rx-linha-base').value);
    const btnIa = document.querySelector("button[onclick='acionarIAParaEmail()']");
    btnIa.innerText = "A Redigir... ⏳";
    btnIa.disabled = true;
    
    // Como a IA pesada reside no serviceAI.gs, passamos isto para a API
    apiCall("enviarParecerOperador", { linhaEstudante: linhaBase, textoRevisado: notasTexto })
        .then(res => {
            if (res.sucesso) {
                showToast("E-mail disparado para o estudante!", "success");
            } else {
                showToast(res.erro, "error");
            }
            btnIa.innerText = "✨ Gerar E-mail IA";
            btnIa.disabled = false;
        }).catch(e => {
            showToast("Falha ao comunicar com motor de E-mails.", "error");
            btnIa.innerText = "✨ Gerar E-mail IA";
            btnIa.disabled = false;
        });
}

// ========================================================================
// 5. MÓDULO DO MODERADOR (SALA DAS MÁQUINAS V9.2.6)
// ========================================================================

function abrirPainelModerador() {
    switchView('view-moderador');
}

async function forcarMotor(motorId) {
    showToast(`A enviar sinal para o motor ${motorId}...`, "info");
    try {
        const res = await apiCall("forcarExecucaoMotor", { motorId: motorId });
        if (res.sucesso) showToast(res.msg, "success");
        else showToast(res.erro, "error");
    } catch(e) {
        showToast("Ocorreu um erro ao acionar o motor.", "error");
    }
}

async function alterarMotor(motorId, isLigado) {
    showToast(`A alterar configurações de ${motorId}...`, "info");
    try {
        const res = await apiCall("alterarEstadoMotor", { motorId: motorId, ligado: isLigado });
        if (res.sucesso) showToast(res.msg, "success");
        else showToast(res.erro, "error");
    } catch(e) {
        showToast("Ocorreu um erro ao alterar o motor.", "error");
    }
}


// ========================================================================
// 6. FLUXO DE CONSULTA DO ESTUDANTE
// ========================================================================
async function consultarEstudante() {
  const alvo = document.getElementById('id-estudante').value.trim();
  if (!alvo) { showToast("Informe o CPF.", "error"); return; }

  const btn = document.getElementById('btn-estudante');
  const resBox = document.getElementById('res-estudante');
  const checkboxPush = document.getElementById('chk-notificacoes-cpf');
  
  btn.innerText = "A CONSULTAR...";
  btn.disabled = true;
  resBox.classList.add('hidden');

  try {
    const res = await apiCall("consultarStatusCPF", { cpf: alvo });
    btn.innerText = "CONSULTAR STATUS";
    btn.disabled = false;
    
    if (!res.encontrado) {
      mostrarErroEstudante("Não Encontrado", "Verifique o CPF ou submissão.");
      return;
    }
    
    if (checkboxPush && checkboxPush.checked) {
       solicitarConsentimentoPushAnonimo(alvo);
    }
    
    renderizarTimelineEstudante(res, resBox);
  } catch(err) {
    btn.innerText = "CONSULTAR STATUS";
    btn.disabled = false;
    mostrarErroEstudante("Erro na API", "Tente novamente mais tarde.");
  }
}

async function solicitarConsentimentoPushAnonimo(cpf) {
  try {
    if (typeof firebase === 'undefined' || !firebase.messaging.isSupported()) return;
    const messaging = firebase.messaging();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await messaging.getToken({ vapidKey: window.FIREBASE_VAPID_KEY });
      if (token) {
        await apiCall("registrarPushToken", { idEstudante: cpf, pushToken: token });
      }
    }
  } catch (error) {
    console.log("Push anónimo falhou ou foi bloqueado.", error);
  }
}

function irParaCofreComId(idAcesso) {
    if (currentWalletId && localStorage.getItem("MAESTRO_EST_TOKEN") && currentWalletId.toUpperCase() === idAcesso.toUpperCase()) {
        switchView('view-wallet');
        return;
    }
    
    switchView('view-login');
    const inputId = document.getElementById('login-id');
    const inputSenha = document.getElementById('login-senha');
    
    if (inputId && idAcesso) inputId.value = idAcesso;
    if (inputSenha) setTimeout(() => { inputSenha.focus(); }, 100); 
}

function renderizarTimelineEstudante(dados, container) {
  const nomeLimpo = formatarNome(dados.nome).split(' ')[0];
  let html = `<h3 style="margin:0 0 15px 0; color:var(--primary);">Olá, ${nomeLimpo}!</h3>`;
  html += `<div class="timeline">`;
  
  html += `<div class="timeline-item active-blue">
             <strong style="color: var(--primary);">1. Formulário Recebido</strong><br>
             <span style="color:var(--text-sub); font-size:11px;">Os seus dados deram entrada no sistema.</span>
           </div>`;

  const sOCR = String(dados.statusOCR || "").trim().toUpperCase();
  const sDocs = String(dados.statusDocs || "").trim().toUpperCase();
  const sAtiv = String(dados.statusAtividade || "").trim().toUpperCase();

  const buildObsBox = (obs, colorBorder, colorBg, colorText) => {
    if (!obs || obs.trim() === "") return "";
    return `
      <div style="margin-top: 12px; padding: 12px; background: ${colorBg}; border-left: 4px solid ${colorBorder}; border-radius: 4px; color: ${colorText}; font-size: 12px; line-height: 1.5; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <strong style="display:block; margin-bottom:4px; font-size:11px; text-transform:uppercase; opacity:0.8; letter-spacing: 0.5px;">Mensagem do Setor:</strong>
        ${obs.replace(/\n/g, '<br>')}
      </div>
    `;
  };

  if (sAtiv === "CANCELADO") {
    html += `<div class="timeline-item active-red"><strong style="color:var(--danger);">2. Emissão Interrompida</strong></div>`;
    html += `<div class="timeline-item active-red">
               <strong style="color:var(--danger);">3. Inscrição Cancelada</strong><br>
               <span style="color:var(--danger); font-size:11px; font-weight:600;">O acesso ao transporte foi cancelado.</span>
               ${buildObsBox(dados.obs, "var(--danger)", "#FEF2F2", "#991B1B")}
             </div>`;
             
  } else if (sAtiv === "SUSPENSO") {
    html += `<div class="timeline-item active-orange"><strong style="color:#F97316;">2. Emissão Interrompida</strong></div>`;
    html += `<div class="timeline-item active-orange">
               <strong style="color:#F97316;">3. Inscrição Suspensa</strong><br>
               <span style="color:#F97316; font-size:11px; font-weight:600;">O acesso foi desativado temporariamente.</span>
               ${buildObsBox(dados.obs, "#F97316", "#FFF7ED", "#9A3412")}
               
               <button class="btn-solid" style="margin-top:15px; background: #9A3412; font-size:12px;" onclick="abrirPortalResgate()">CORRIGIR DOCUMENTAÇÃO</button>
             </div>`;
             
  } else {
    if (sOCR === "PENDENTE" || sOCR === "") {
      html += `<div class="timeline-item"><strong>2. Em Auditoria</strong><br><span style="color:var(--text-sub); font-size:11px;">A aguardar análise documental.</span></div>`;
      html += `<div class="timeline-item"><strong>3. Resultado</strong></div>`;
      
    } else if (sOCR === "ANALISE_HUMANA" || sOCR === "PENDENCIA") {
      html += `<div class="timeline-item active-yellow">
                 <strong style="color:#FBBF24;">2. Pendência Documental</strong><br>
                 <span style="color:#D97706; font-size:11px; font-weight:600;">Ação necessária para prosseguir.</span>
                 ${buildObsBox(dados.obs, "#F59E0B", "#FFFBEB", "#92400E")}
                 
                 <button class="btn-solid" style="margin-top:15px; background: var(--accent); font-size:12px;" onclick="abrirPortalResgate()">CORRIGIR DOCUMENTAÇÃO</button>
               </div>`;
      html += `<div class="timeline-item"><strong>3. Resultado</strong></div>`;
      
    } else {
      html += `<div class="timeline-item active-green"><strong style="color:var(--success);">2. Documentos Validados</strong></div>`;
      
      if (sDocs === "EMITIDO" || sDocs === "EMITIDO_NOTIFICADO" || sDocs === "GERADO") {
        html += `<div class="timeline-item active-green"><strong style="color:var(--success);">3. Carteira Ativa!</strong><br><span style="color:var(--text-sub); font-size:11px;">A sua identidade estudantil já pode ser utilizada.</span></div>`;
        
        if (dados.idAcesso) {
           html += `
           <div style="margin-top: 20px; padding: 15px; background: #f0fdf4; border: 1px solid var(--success); border-radius: 8px; text-align: center;">
             <span style="font-size: 11px; color: var(--success); display:block; margin-bottom:5px; text-transform: uppercase; font-weight:700;">O seu ID de Acesso é:</span>
             <strong style="font-size: 22px; color: #065F46; letter-spacing: 2px; font-family: monospace;">${dados.idAcesso}</strong>
             <p style="font-size: 11px; color: #065F46; margin: 8px 0 0 0;">Use este ID e os 4 últimos dígitos do seu CPF para abrir o cofre digital.</p>
             <button class="btn-solid" style="margin-top:15px;" onclick="irParaCofreComId('${dados.idAcesso}')">IR PARA O COFRE</button>
           </div>`;
        }
      } else {
        html += `<div class="timeline-item active-blue"><strong style="color: var(--primary);">3. A Aguardar Emissão</strong><br><span style="color:var(--text-sub); font-size:11px;">A sua carteira digital está em processamento.</span></div>`;
      }
    }
  }

  html += `</div>`; 
  container.innerHTML = html;
  container.classList.remove('hidden');
}

function mostrarErroEstudante(titulo, mensagem) {
  const resBox = document.getElementById('res-estudante');
  resBox.innerHTML = `<div class="error-box"><strong>${titulo}</strong><br>${mensagem}</div>`;
  resBox.classList.remove('hidden');
}

// ========================================================================
// 7. MÓDULO DE RESGATE DOCUMENTAL (V9.2)
// ========================================================================

let arquivosParaResgate = {};

function abrirPortalResgate() {
    switchView('view-resgate');
    arquivosParaResgate = {};
    document.querySelectorAll("input[type='checkbox'][id^='chk-resgate-']").forEach(chk => chk.checked = false);
    document.querySelectorAll("div[id^='box-resgate-']").forEach(box => box.classList.add('hidden'));
    document.querySelectorAll("input[type='file'][id^='file-resgate-']").forEach(f => f.value = "");
    document.querySelectorAll("span[id^='status-resgate-']").forEach(st => {
        st.innerText = "A aguardar seleção...";
        st.style.color = "var(--text-sub)";
    });
    verificarBotaoResgate();
}

function cancelarResgate() {
    switchView('view-consult');
}

function toggleBoxResgate(tipoDoc) {
    const isChecked = document.getElementById(`chk-resgate-${tipoDoc.toLowerCase()}`).checked;
    const box = document.getElementById(`box-resgate-${tipoDoc}`);
    const fileInput = document.getElementById(`file-resgate-${tipoDoc}`);
    const statusSpan = document.getElementById(`status-resgate-${tipoDoc}`);
    
    if (isChecked) {
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
        fileInput.value = "";
        statusSpan.innerText = "A aguardar seleção...";
        statusSpan.style.color = "var(--text-sub)";
        delete arquivosParaResgate[tipoDoc];
        verificarBotaoResgate();
    }
}

function processarArquivoResgate(inputElement, tipoDoc) {
    const file = inputElement.files[0];
    const statusSpan = document.getElementById(`status-resgate-${tipoDoc}`);
    
    if (!file) {
        delete arquivosParaResgate[tipoDoc];
        statusSpan.innerText = "A aguardar seleção...";
        statusSpan.style.color = "var(--text-sub)";
        verificarBotaoResgate();
        return;
    }

    if (file.size > 5 * 1024 * 1024) { 
        showToast("O arquivo é muito grande (Máximo 5MB).", "error");
        inputElement.value = "";
        delete arquivosParaResgate[tipoDoc];
        statusSpan.innerText = "Erro: Arquivo demasiado pesado.";
        statusSpan.style.color = "var(--danger)";
        verificarBotaoResgate();
        return;
    }

    statusSpan.innerText = "A processar... ⏳";
    statusSpan.style.color = "var(--accent)";

    const reader = new FileReader();
    reader.onload = function(e) {
        arquivosParaResgate[tipoDoc] = {
            tipo: tipoDoc,
            nome: file.name,
            base64: e.target.result
        };
        statusSpan.innerText = "✅ Anexado e pronto a enviar!";
        statusSpan.style.color = "var(--success)";
        verificarBotaoResgate();
    };
    reader.onerror = function() {
        showToast("Falha na leitura do arquivo.", "error");
        inputElement.value = "";
        delete arquivosParaResgate[tipoDoc];
        statusSpan.innerText = "Erro na leitura.";
        statusSpan.style.color = "var(--danger)";
        verificarBotaoResgate();
    };
    reader.readAsDataURL(file);
}

function verificarBotaoResgate() {
    const btn = document.getElementById('btn-enviar-resgate');
    if (Object.keys(arquivosParaResgate).length > 0) {
        btn.disabled = false;
        btn.style.opacity = "1";
    } else {
        btn.disabled = true;
        btn.style.opacity = "0.5";
    }
}

async function enviarArquivosResgate() {
    const cpf = document.getElementById('id-estudante').value.trim();
    if (!cpf) {
        showToast("Falha interna: CPF não localizado.", "error");
        return;
    }

    const payloadArquivos = Object.values(arquivosParaResgate);
    if (payloadArquivos.length === 0) {
        showToast("Nenhum arquivo anexado para envio.", "error");
        return;
    }

    const btn = document.getElementById('btn-enviar-resgate');
    btn.innerHTML = "A ENVIAR PARA A SECRETARIA... ⏳";
    btn.disabled = true;

    try {
        const res = await apiCall("submeterResgateDocumental", {
            cpf: cpf,
            arquivos: payloadArquivos
        });

        if (res.sucesso) {
            showToast(res.msg || "Documentos enviados com sucesso!", "success");
            switchView('view-consult');
            consultarEstudante(); 
        } else {
            showToast(res.erro || "Falha ao enviar os documentos.", "error");
            btn.innerHTML = "TENTAR NOVAMENTE";
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro de ligação com a Secretaria.", "error");
        btn.innerHTML = "TENTAR NOVAMENTE";
        btn.disabled = false;
    }
}

// ========================================================================
// 8. FLUXO DA CARTEIRA DIGITAL (COFRE OFFLINE-FIRST)
// ========================================================================
let currentWalletId = "";
let currentWalletSenha = "";
let currentStudentName = "";
let clockInterval = null; 
let timeoutSessaoEstudanteID = null; 

function restaurarSessaoEstudante() {
    const token = localStorage.getItem("MAESTRO_EST_TOKEN");
    const cachedDataRaw = localStorage.getItem("MAESTRO_WALLET_CACHE");
    const credsRaw = localStorage.getItem("MAESTRO_WALLET_CREDS");

    if (token && cachedDataRaw && credsRaw) {
        try {
            const dados = JSON.parse(cachedDataRaw);
            const creds = JSON.parse(credsRaw);
            currentWalletId = dados.idCarteira;
            currentWalletSenha = creds.senha;
            currentStudentName = dados.nome;
            armarRelogioSessaoEstudante();
            abrirTelaCofreOuEntrarDireto();
        } catch(e) {
            console.log("Erro ao restaurar sessão de estudante na RAM.");
        }
    }
}

function abrirTelaCofreOuEntrarDireto() {
    if (currentWalletId && localStorage.getItem("MAESTRO_EST_TOKEN")) {
        const cachedDataRaw = localStorage.getItem("MAESTRO_WALLET_CACHE");
        if (cachedDataRaw) {
            renderizarCarteira(JSON.parse(cachedDataRaw));
            switchView('view-wallet');
            return;
        }
    }
    switchView('view-login');
}

document.addEventListener("DOMContentLoaded", () => {
    const btnCarteira = document.querySelector("button.menu-card.primary-card[onclick*='view-login']");
    if (btnCarteira) btnCarteira.onclick = abrirTelaCofreOuEntrarDireto;
});

async function loginCarteira() {
  const id = document.getElementById('login-id').value.trim();
  const senha = document.getElementById('login-senha').value.trim();
  const btn = document.getElementById('btn-login');
  const resBox = document.getElementById('res-login');

  if (!id || !senha) {
    resBox.innerText = "Preencha o ID e a Senha.";
    resBox.classList.remove('hidden');
    return;
  }

  btn.innerText = "A AUTENTICAR...";
  btn.disabled = true;
  resBox.classList.add('hidden');

  try {
    const res = await apiCall("autenticarCarteiraDigital", { id: id, senha: senha });
    btn.innerText = "ENTRAR NO COFRE";
    btn.disabled = false;

    if (res.erro) {
      resBox.innerText = res.erro;
      resBox.classList.remove('hidden');
    } else if (res.sucesso) {
      currentWalletId = id;
      currentWalletSenha = senha;
      currentStudentName = res.nome;
      
      if (res.token) localStorage.setItem("MAESTRO_EST_TOKEN", res.token);
      localStorage.setItem("MAESTRO_WALLET_CACHE", JSON.stringify(res));
      localStorage.setItem("MAESTRO_WALLET_CREDS", JSON.stringify({id: id, senha: senha}));

      renderizarCarteira(res);
      switchView('view-wallet');
      document.getElementById('login-id').value = '';
      document.getElementById('login-senha').value = '';
      
      armarRelogioSessaoEstudante(); 
      setTimeout(inicializarPushNotifications, 2000); 
    }
  } catch(err) {
    btn.innerText = "ENTRAR NO COFRE";
    btn.disabled = false;
    
    const cachedData = localStorage.getItem("MAESTRO_WALLET_CACHE");
    const cachedCreds = localStorage.getItem("MAESTRO_WALLET_CREDS");
    
    if (cachedData && cachedCreds) {
       const creds = JSON.parse(cachedCreds);
       if (creds.id.toUpperCase() === id.toUpperCase() && creds.senha === senha) {
          currentWalletId = id;
          currentWalletSenha = senha;
          const resCached = JSON.parse(cachedData);
          currentStudentName = resCached.nome;
          
          showToast("Modo Offline Ativado. Funções limitadas.", "warning");
          renderizarCarteira(resCached);
          switchView('view-wallet');
          armarRelogioSessaoEstudante();
          return;
       }
    }
    resBox.innerText = "Falha de ligação. Necessita de internet.";
    resBox.classList.remove('hidden');
  }
}

function armarRelogioSessaoEstudante() {
    if (timeoutSessaoEstudanteID) clearTimeout(timeoutSessaoEstudanteID);
    timeoutSessaoEstudanteID = setTimeout(() => {
        sairCarteira(true); 
        showToast("Sessão expirada. Por favor, aceda novamente.", "info");
    }, 10800000);
}

function renderizarCarteira(dados) {
  const container = document.getElementById('wallet-container');
  const actions = document.getElementById('wallet-actions');
  const nomeTratado = formatarNome(dados.nome);
  const fotoHTML = dados.fotoUrl ? `<img src="${dados.fotoUrl}" class="wallet-photo">` : `<div class="wallet-photo" style="display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px;text-align:center;">Sem Foto</div>`;
  
  let html = `
  <div class="wallet-card">
    <div class="wallet-header">IDENTIDADE UNIVERSITÁRIA</div>
    <div class="wallet-body">
      ${fotoHTML}
      <div class="wallet-info">
        <div class="w-group"><span>Estudante</span><span class="highlight">${nomeTratado}</span></div>
        <div class="w-group"><span>CPF</span><span>${dados.cpfMascarado}</span></div>
        <div class="w-group"><span>ID da Carteira</span><span style="font-family:monospace; font-size:12px;">${dados.idCarteira}</span></div>
      </div>
    </div>
    
    <div class="text-center" style="margin: 15px 0; padding: 15px 0; border-top: 1px dashed var(--border); border-bottom: 1px dashed var(--border);">
      <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
         <div id="wallet-qrcode"></div>
      </div>
      <div style="font-size: 11px; color: var(--primary); margin-top: 8px; font-weight: 700; letter-spacing: 1px;">VÁLIDO PARA EMBARQUE HOJE</div>
    </div>

    <div class="wallet-footer">
      <div class="w-row">
        <div class="w-group"><span>Instituição</span><span style="font-weight:700;">${dados.instituicao}</span></div>
        <div class="w-group" style="text-align:right;"><span>Turno</span><span>${dados.turno}</span></div>
      </div>
      <div class="w-row"><div class="w-group"><span>Rota de Transporte</span><span>${dados.rota}</span></div></div>
      <div class="text-center" style="margin-top:10px; border-top:1px dashed var(--border); padding-top:10px;">
         <span style="font-size:10px; color:var(--text-sub);">Válido em ${dados.cidade} até <strong>${dados.validade}</strong></span>
      </div>
      <div class="anti-print-bar" id="wallet-clock">Relógio Seguro...</div>
    </div>
  </div>
  
  <div style="display:flex; gap:10px; margin-top:20px;">
      <button id="btn-dw-carteira" class="btn-solid" style="flex:1; margin:0;" onclick="baixarDocumento('CARTEIRA')">🪪 Baixar ID</button>
      <button id="btn-dw-declaracao" class="btn-solid dark-bg" style="flex:1; margin:0;" onclick="baixarDocumento('DECLARACAO')">📄 Declaração</button>
  </div>`;
  
  container.innerHTML = html;
  
  if (actions) {
      actions.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom: 15px;">
           <button class="btn-solid" style="flex:1; margin:0; background: var(--primary);" onclick="verificarJanelasEmbarque()">🚐 Abrir Radar de Viagens</button>
           <button class="btn-solid dark-bg" style="flex:1; margin:0;" onclick="abrirMuralDaSemana()">🗣️ Sugestões / Fórum</button>
        </div>
        <div style="text-align:center;">
           <button class="btn-text text-danger" style="font-weight: 700; font-size: 14px;" onclick="sairCarteira()">❌ Fechar Cofre Digital</button>
        </div>
      `;
      actions.classList.remove('hidden');
  }
  
  iniciarRelogioAntiPrint('wallet-clock');

  const qrContainer = document.getElementById('wallet-qrcode');
  if (qrContainer) {
      qrContainer.innerHTML = ""; 
      const semente = dados.sementeDia || new Date().toISOString().split('T')[0];
      new QRCode(qrContainer, { text: `${dados.idCarteira}|${semente}`, width: 160, height: 160, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
  }
}

function iniciarRelogioAntiPrint(elementId) {
  if (clockInterval) clearInterval(clockInterval);
  const clockDiv = document.getElementById(elementId);
  if (!clockDiv) return;
  const update = () => clockDiv.innerText = `⏳ Autenticado: ${new Date().toLocaleTimeString('pt-BR')}`;
  update();
  clockInterval = setInterval(update, 1000);
}

async function baixarDocumento(tipo, tentativa = 1) {
  const MAX_TENTATIVAS = 3;
  const btnId = tipo === 'CARTEIRA' ? 'btn-dw-carteira' : 'btn-dw-declaracao';
  const btn = document.getElementById(btnId);
  
  const textoOriginal = btn.getAttribute('data-original-text') || btn.innerHTML;
  if (tentativa === 1) btn.setAttribute('data-original-text', textoOriginal);

  btn.innerHTML = tentativa === 1 ? `⏳ A transferir...` : `🔄 Tentativa ${tentativa}/${MAX_TENTATIVAS}...`;
  btn.disabled = true;

  try {
    const res = await apiCall("baixarDocumentoSeguro", { id: currentWalletId, tipo: tipo });
    
    if (res.erro) {
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
      showToast(res.erro, "error");
    } else if (res.sucesso && res.arquivoBase64) {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${res.arquivoBase64}`;
      link.download = res.arquivoNome || `Documento_${tipo}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Download de ${tipo} concluído!`, "success");
      btn.innerHTML = `⏳ Aguarde...`;
      setTimeout(() => { btn.innerHTML = textoOriginal; btn.disabled = false; }, 10000); 
    }
  } catch(err) {
    if (tentativa < MAX_TENTATIVAS) {
      showToast(`Servidor ocupado. A tentar...`, "info");
      setTimeout(() => { baixarDocumento(tipo, tentativa + 1); }, tentativa * 2000);
    } else {
      btn.innerHTML = textoOriginal;
      btn.disabled = false;
      showToast("Falha de conexão com a API.", "error");
    }
  }
}

async function sairCarteira(expiracaoSilenciosa = false) {
  try { await apiCall("invalidarTokenSessao"); } catch(e) {}
  
  localStorage.removeItem("MAESTRO_EST_TOKEN");

  if (clockInterval) clearInterval(clockInterval);
  if (timeoutSessaoEstudanteID) clearInterval(timeoutSessaoEstudanteID);
  
  pararTransmissaoGpsE_Radar();
  
  document.getElementById('wallet-container').innerHTML = ''; 
  const actions = document.getElementById('wallet-actions');
  if (actions) actions.classList.add('hidden');
  
  currentWalletId = "";
  currentWalletSenha = "";
  currentStudentName = "";
  
  const painelMob = document.getElementById('view-mobilidade');
  if (painelMob) painelMob.style.display = 'none';
  
  switchView('view-aluno-menu'); 
  if (!expiracaoSilenciosa) showToast("Cofre bloqueado com segurança.", "info");
}

// ========================================================================
// 8.1. MOTOR DE MOBILIDADE: RADAR E ETA 
// ========================================================================

let onibusSelecionadoGPS = null;
let idIntervaloGPS = null;      
let idIntervaloRadar = null;    
let wakeLockAtivo = null;

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

function calcularETA(distanciaKm) {
    const velMediaKmH = 25; 
    const tempoHoras = distanciaKm / velMediaKmH;
    const tempoMinutos = Math.round(tempoHoras * 60);
    if (tempoMinutos <= 2) return "A chegar!";
    return `~ ${tempoMinutos} min`;
}

async function verificarJanelasEmbarque() {
   if (!currentWalletId) {
      showToast("Sessão inválida para aceder às viagens.", "error");
      return;
   }
   
   const painelMob = document.getElementById('view-mobilidade');
   const containerLista = document.getElementById('lista-viagens-container');
   const painelSucesso = document.getElementById('painel-viagem-ativa');
   
   if (painelMob) painelMob.style.display = 'block';
   if (painelSucesso) painelSucesso.innerHTML = ''; 
   
   if (containerLista) {
       containerLista.innerHTML = `<div class="loader" style="margin: 0 auto 10px auto; width: 25px; height: 25px; border-width: 3px;"></div><p style="font-size: 11px; color: var(--text-sub);">A procurar autocarros...</p>`;
       containerLista.classList.remove('hidden');
   }

   try {
       if (painelMob) painelMob.scrollIntoView({ behavior: 'smooth', block: 'start' });

       const res = await apiCall("getViagensDisponiveisPortal", { idEstudante: currentWalletId });
       
       if (!res.sucesso) {
           if (containerLista) containerLista.innerHTML = `<p style="font-size: 11px; color: var(--danger);">Erro: ${res.erro}</p>`;
           return;
       }

       if (res.emViagem) {
           if (containerLista) containerLista.classList.add('hidden');
           onibusSelecionadoGPS = res.dadosViagem.idOnibus;
           abrirPainelViagem(); 
           return;
       }

       if (!res.viagens || res.viagens.length === 0) {
           let msgEmpty = "Nenhum embarque previsto para agora.";
           if (res.statusOperacao === "FORA_DE_HORARIO") {
               msgEmpty = "<b>Fora do Horário de Embarque.</b><br>Os autocarros só aparecem aqui minutos antes da hora de partida da sua rota.";
           } else if (res.statusOperacao === "SEM_FROTA") {
               msgEmpty = "Não há autocarros ativos associados à sua rota neste momento.";
           }
           if (containerLista) containerLista.innerHTML = `<div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; color: #92400e; font-size: 12px; line-height: 1.4; text-align:left;">${msgEmpty}</div>`;
           return;
       }

       let html = `<p style="font-size: 11px; color: var(--text-sub); margin-bottom: 10px;">Selecione o seu autocarro para garantir lugar:</p>`;
       res.viagens.forEach(v => {
           const labelLota = v.vagasRestantes > 0 ? `<span style="color:var(--success); font-weight:bold;">${v.vagasRestantes} vagas</span>` : `<span style="color:var(--danger); font-weight:bold;">LOTADO</span>`;
           const btnDisable = v.vagasRestantes <= 0 ? "disabled" : "";
           const btnBg = v.vagasRestantes <= 0 ? "#ccc" : "var(--primary)";
           
           html += `
           <div style="background: var(--secondary); padding: 12px; border-radius: 8px; margin-bottom: 10px; text-align: left; border: 1px solid var(--border);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                 <strong style="font-size: 13px;">🚌 ${v.rota}</strong>
                 <span style="font-size: 11px; background: #e0e7ff; padding: 2px 6px; border-radius: 4px; color: #3730a3;">${v.horario}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                 <span style="font-size: 11px;">Status: ${labelLota}</span>
                 <button ${btnDisable} onclick="confirmarEmbarque('${v.id}')" style="background: ${btnBg}; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">FAZER CHECK-IN</button>
              </div>
           </div>`;
       });
       
       if (containerLista) containerLista.innerHTML = html;

   } catch (e) {
       if (containerLista) containerLista.innerHTML = `<p style="font-size: 11px; color: var(--danger);">Não foi possível atualizar a logística.</p>`;
   }
}

async function confirmarEmbarque(idOnibus) {
    showToast("A processar lugar...", "loading");
    try {
        const res = await apiCall("realizarCheckInOnibus", { idOnibus: idOnibus, idEstudante: currentWalletId });
        
        if (res.sucesso) {
            showToast("Lugar Confirmado!", "success");
            onibusSelecionadoGPS = idOnibus; 
            document.getElementById('lista-viagens-container').classList.add('hidden');
            abrirPainelViagem(); 
        } else {
            showToast(res.erro || "Lotação atingida no momento do clique.", "error");
            verificarJanelasEmbarque(); 
        }
    } catch (e) {
        showToast("Erro ao processar reserva.", "error");
    }
}

function abrirPainelViagem() {
    const painelSucesso = document.getElementById('painel-viagem-ativa');
    if (!painelSucesso) return;
    
    painelSucesso.innerHTML = `
      <div style="background: var(--secondary); padding: 20px; border-radius: 8px; border: 1px solid var(--border);">
         <h3 style="color: var(--success); margin: 0 0 10px 0; font-size: 18px;">✅ Check-in Confirmado</h3>
         <p style="font-size: 12px; color: var(--text-sub); margin-bottom: 20px;">O seu lugar está garantido. Acompanhe a viagem no radar abaixo.</p>
         <div id="radar-dinamico-conteudo" style="background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
            <div class="loader" style="margin: 0 auto; width: 20px; height: 20px; border-width: 2px;"></div>
            <p style="font-size: 11px; text-align: center; margin-top: 10px; color: #666;">A sincronizar radar...</p>
         </div>
      </div>
    `;
    painelSucesso.classList.remove('hidden');
    
    atualizarRadarDinamico(); 
    if (idIntervaloRadar) clearInterval(idIntervaloRadar);
    idIntervaloRadar = setInterval(atualizarRadarDinamico, 30000);
}

async function atualizarRadarDinamico() {
    if (!onibusSelecionadoGPS) return;
    const boxRadar = document.getElementById('radar-dinamico-conteudo');
    if (!boxRadar) return;

    try {
        const res = await apiCall("statusRadarOnibus", { idOnibus: onibusSelecionadoGPS, idEstudante: currentWalletId });
        
        if (res.isGuia) {
            boxRadar.innerHTML = `
                <div style="text-align:center;">
                   <div style="font-size: 40px; margin-bottom: 10px; animation: pulse 2s infinite;">📡</div>
                   <h4 style="color: var(--success); margin: 0 0 5px 0;">Transmissão Ativa</h4>
                   <p style="font-size: 11px; color: #666; margin-bottom: 15px;">O seu GPS está a guiar os seus colegas.</p>
                   <button onclick="abdicarSerGuia()" class="btn-solid" style="background: #ef4444; margin: 0; padding: 8px; font-size: 12px;">Parar Transmissão (Abdicar)</button>
                </div>
            `;
            if (!document.getElementById('radar-pulse-css')) {
               const style = document.createElement('style');
               style.id = 'radar-pulse-css';
               style.innerHTML = `@keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1); opacity: 1; } }`;
               document.head.appendChild(style);
            }
        } 
        else if (res.guiaAtivo && res.coordenadas) {
            boxRadar.innerHTML = `<div class="loader" style="margin: 0 auto; width: 15px; height: 15px; border-width: 2px;"></div><p style="font-size: 10px; text-align: center; margin-top: 5px;">A calcular ETA...</p>`;
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    function(posPassageiro) {
                        const distKm = calcularDistanciaHaversine(posPassageiro.coords.latitude, posPassageiro.coords.longitude, res.coordenadas.lat, res.coordenadas.lng);
                        const tempoAtras = calcularTempoRelativo(res.coordenadas.ts);
                        
                        boxRadar.innerHTML = `
                            <div style="text-align: left;">
                               <div style="display:flex; justify-content: space-between; align-items:center; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 8px;">
                                  <strong style="color: var(--primary);"><span style="font-size: 14px;">📍</span> Radar ao Vivo</strong>
                                  <span style="font-size: 10px; background: #ecfdf5; color: #065f46; padding: 3px 6px; border-radius: 4px;">Sinal Forte</span>
                               </div>
                               <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                                  <span style="font-size: 12px; color: #666;">Distância:</span>
                                  <strong style="font-size: 12px;">${distKm.toFixed(1)} km</strong>
                               </div>
                               <div style="display:flex; justify-content: space-between; margin-bottom: 10px;">
                                  <span style="font-size: 12px; color: #666;">Chega em:</span>
                                  <strong style="font-size: 14px; color: var(--accent);">${calcularETA(distKm)}</strong>
                               </div>
                               <div style="text-align: right;">
                                  <span style="font-size: 10px; color: #999;">Última atualização: ${tempoAtras}</span>
                               </div>
                               <button onclick="atualizarRadarDinamico()" class="btn-text" style="width: 100%; text-align: center; padding: 8px 0 0 0; margin-top: 5px; font-size: 11px;">🔄 Atualizar Agora</button>
                            </div>
                        `;
                    },
                    function(err) {
                        const tempoAtras = calcularTempoRelativo(res.coordenadas.ts);
                        boxRadar.innerHTML = `
                            <div style="text-align: center;">
                               <h4 style="color: var(--primary); margin: 0 0 5px 0;">📍 Autocarro em Movimento</h4>
                               <p style="font-size: 11px; color: #666; margin-bottom: 10px;">Ative a localização do seu dispositivo para ver a distância e o tempo estimado de chegada (ETA).</p>
                               <span style="font-size: 10px; color: #999;">Último sinal do autocarro: ${tempoAtras}</span>
                            </div>
                        `;
                    },
                    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
                );
            }
        } 
        else {
            boxRadar.innerHTML = `
                <div style="text-align: center;">
                   <div style="font-size: 30px; margin-bottom: 10px; filter: grayscale(100%); opacity: 0.5;">📡</div>
                   <h4 style="color: #666; margin: 0 0 5px 0;">Radar Inativo</h4>
                   <p style="font-size: 11px; color: #999; margin-bottom: 15px;">Nenhum colega está a partilhar o GPS. Quer assumir o rastreamento?</p>
                   <button onclick="solicitarSerGuia()" class="btn-solid" style="background: var(--primary); margin: 0; padding: 8px; font-size: 12px;">Seja o Guia (Ligar GPS)</button>
                </div>
            `;
        }
    } catch(e) {
        console.warn("Falha silenciosa ao ler radar.");
    }
}

async function solicitarSerGuia() {
    showToast("A solicitar permissão ao servidor...", "loading");
    const boxRadar = document.getElementById('radar-dinamico-conteudo');
    if (boxRadar) boxRadar.innerHTML = `<div class="loader" style="margin: 0 auto;"></div>`;

    try {
        const res = await apiCall("solicitarCargoGuia", { idOnibus: onibusSelecionadoGPS, idEstudante: currentWalletId });
        if (res.sucesso) {
            iniciarTransmissaoGpsComoGuia(); 
        } else {
            showToast(res.erro, "warning");
            atualizarRadarDinamico(); 
        }
    } catch(e) {
        showToast("Erro ao contactar o servidor.", "error");
        atualizarRadarDinamico();
    }
}

async function iniciarTransmissaoGpsComoGuia() {
    if (!navigator.geolocation) {
        showToast("O seu telemóvel não suporta GPS.", "error");
        abdicarSerGuia();
        return;
    }

    try {
        if ('wakeLock' in navigator) {
            wakeLockAtivo = await navigator.wakeLock.request('screen');
        }
        
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                enviarCoordenadaSegura(pos.coords.latitude, pos.coords.longitude);
                
                if (idIntervaloGPS) clearInterval(idIntervaloGPS);
                idIntervaloGPS = setInterval(() => {
                    navigator.geolocation.getCurrentPosition(
                        p => enviarCoordenadaSegura(p.coords.latitude, p.coords.longitude),
                        e => console.warn("GPS falhou a leitura.")
                    );
                }, 120000);
                
                showToast("Transmissão iniciada! Você é o Guia.", "success");
                atualizarRadarDinamico(); 
            },
            function(err) {
                showToast("Permissão de GPS negada. Abdicando...", "error");
                abdicarSerGuia();
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
    } catch (err) {
        showToast("Não foi possível aceder aos sensores do ecrã.", "error");
        abdicarSerGuia();
    }
}

function enviarCoordenadaSegura(lat, lng) {
    if (!onibusSelecionadoGPS || !currentWalletId) return;
    
    apiCall("atualizarGPSOnibus", { 
        idOnibus: onibusSelecionadoGPS, 
        idEstudante: currentWalletId, 
        lat: lat, 
        lng: lng 
    }).then(res => {
        if (res && !res.sucesso) {
            console.log("Servidor rejeitou o GPS (Timeout ou Roubo): " + res.erro);
            pararTransmissaoGpsE_Radar();
            atualizarRadarDinamico(); 
        }
    }).catch(e => console.log("Falha silenciosa no ping GPS."));
}

async function abdicarSerGuia() {
    pararTransmissaoGpsE_Radar(false); 
    showToast("A libertar GPS...", "loading");
    try {
        await apiCall("abdicarCargoGuia", { idOnibus: onibusSelecionadoGPS, idEstudante: currentWalletId });
        showToast("Transmissão encerrada com segurança.", "info");
        atualizarRadarDinamico(); 
    } catch(e) {
        atualizarRadarDinamico();
    }
}

function pararTransmissaoGpsE_Radar(matarRadarTambem = true) {
    if (idIntervaloGPS) { clearInterval(idIntervaloGPS); idIntervaloGPS = null; }
    if (matarRadarTambem && idIntervaloRadar) { clearInterval(idIntervaloRadar); idIntervaloRadar = null; }
    if (wakeLockAtivo) { wakeLockAtivo.release().then(() => wakeLockAtivo = null); }
}

// ========================================================================
// 9. MODO FISCAL E ADMINISTRAÇÃO AVANÇADA (V9.2.4)
// ========================================================================
let html5QrcodeScanner = null;

function iniciarScanner() {
  document.getElementById('leitor-qr-container').classList.remove('hidden');
  document.getElementById('btn-scanner').classList.add('hidden');
  document.getElementById('btn-scanner-nativo').classList.add('hidden'); 
  
  if (html5QrcodeScanner) html5QrcodeScanner.clear();

  html5QrcodeScanner = new Html5QrcodeScanner("leitor-qr", { fps: 10, qrbox: {width: 250, height: 250} }, false);
  html5QrcodeScanner.render(aoLerQRCode, (e) => {});
}

function fecharScanner() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear();
    html5QrcodeScanner = null;
  }
  document.getElementById('leitor-qr-container').classList.add('hidden');
  document.getElementById('btn-scanner').classList.remove('hidden');
  document.getElementById('btn-scanner-nativo').classList.remove('hidden'); 
}

function aoLerQRCode(textoLido) {
  fecharScanner();
  
  let idLimpo = textoLido;
  let sementeLida = null;
  
  if (textoLido.indexOf('|') !== -1) {
     const partes = textoLido.split('|');
     idLimpo = partes[0];
     sementeLida = partes[1];
  } else {
     let matchId = textoLido.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
     if (matchId) idLimpo = matchId[1];
  }
  
  const sementeFiscal = localStorage.getItem("MAESTRO_SEMENTE_FISCAL");
  
  if (sementeFiscal && sementeLida !== sementeFiscal) {
     document.getElementById('res-fiscal').innerHTML = `
        <div class="wallet-card dark" style="border-color: var(--danger);">
           <div class="wallet-header" style="background: var(--danger);">❌ ALERTA DE SEGURANÇA</div>
           <div class="wallet-body text-center" style="display:block; padding: 30px 20px;">
              <span style="font-size: 40px; display:block; margin-bottom: 10px;">⚠️</span>
              <strong style="color: var(--danger); font-size: 16px; display:block;">QR CODE EXPIRADO/INVÁLIDO</strong>
              <p style="font-size: 12px; color: #ccc; margin-top: 10px;">O código lido não corresponde ao dia de hoje. Peça ao estudante para fechar a App, ligar a internet e abrir novamente a Carteira Digital.</p>
           </div>
        </div>`;
     return;
  }
  
  document.getElementById('id-fiscal').value = idLimpo;
  validarFiscal();
}

function lerQRCodePorFoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast("A processar imagem...", "info");
  document.getElementById('btn-scanner-nativo').innerHTML = `⏳ A LER...`;

  const html5QrCode = new Html5Qrcode("leitor-qr"); 

  html5QrCode.scanFile(file, true)
    .then(textoLido => {
      document.getElementById('btn-scanner-nativo').innerHTML = `<span style="font-size: 20px;">📱</span> USAR CÂMARA NATIVA`;
      aoLerQRCode(textoLido); 
    })
    .catch(err => {
      showToast("QR Code não detetado.", "error");
      document.getElementById('btn-scanner-nativo').innerHTML = `<span style="font-size: 20px;">📱</span> USAR CÂMARA NATIVA`;
    });
    
  event.target.value = '';
}

function fecharModoFiscalizacao() {
  fecharScanner();
  switchView('view-admin-hub');
}

async function validarFiscal() {
  const idCarteira = document.getElementById('id-fiscal').value.trim().toUpperCase();
  if (!idCarteira) return;

  const btn = document.getElementById('btn-fiscal');
  const resBox = document.getElementById('res-fiscal');
  
  btn.innerText = "A VERIFICAR...";
  resBox.innerHTML = "";

  let alunoBase = null;
  const cacheListRaw = localStorage.getItem(CACHE_LISTA_KEY);
  if (cacheListRaw) {
    const cacheList = JSON.parse(cacheListRaw);
    alunoBase = cacheList.find(a => a.id === idCarteira);
  }

  if (alunoBase) {
     resBox.innerHTML = gerarHtmlFiscal(alunoBase.nome, "A carregar...", "...", "...", `<div class="wallet-photo skeleton-box"></div>`, alunoBase.status, "");
  } else {
     resBox.innerHTML = `<div class="text-center text-light" style="margin-top: 20px;">A pesquisar na base de dados online... ⏳</div>`;
  }

  try {
    const res = await apiCall("consultarEstudantePorId", { idEstudante: idCarteira });
    btn.innerText = "VERIFICAR ESTUDANTE";
    
    if (!res.encontrado) {
       resBox.innerHTML = `<div class="error-box">❌ ID INVÁLIDO OU NÃO ENCONTRADO</div>`;
       return; 
    }
    
    resBox.innerHTML = gerarHtmlFiscal(res.nome, res.instituicao, res.rota, res.turno, `<div class="wallet-photo skeleton-box"></div>`, res.statusAtividade, res.obsCompleta);
    
    apiCall("getFotoEstudanteBase64", { idEstudante: idCarteira }).then(resFoto => {
       const imgHtml = resFoto.fotoBase64 ? `<img src="${resFoto.fotoBase64}" class="wallet-photo">` : `<div class="wallet-photo" style="display:flex;align-items:center;justify-content:center;color:#666; background:#222; border-color:#333;">Sem Foto</div>`;
       resBox.innerHTML = gerarHtmlFiscal(res.nome, res.instituicao, res.rota, res.turno, imgHtml, res.statusAtividade, res.obsCompleta);
       if (res.statusAtividade === "ATIVO") iniciarRelogioAntiPrint('fiscal-clock');
    }).catch(err => console.log("Erro foto da API."));

  } catch(err) {
    btn.innerText = "VERIFICAR ESTUDANTE";
    showToast("Erro de conexão com o servidor.", "error");
  }
}

function extrairTextoDaTag(textoBruto, tag) {
    if (!textoBruto) return "";
    const regex = new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i");
    const match = textoBruto.match(regex);
    return match ? match[1].trim() : "";
}

function gerarHtmlFiscal(nome, inst, rota, turno, fotoComponente, statusReal, obsCompleta) {
    let statusBadge = "";
    let relogioAntiPrint = "";
    let caixaMotivo = "";
    const nomeTratado = formatarNome(nome);
    
    if (statusReal !== "ATIVO" && obsCompleta) {
        let motivoFiscal = extrairTextoDaTag(obsCompleta, "textofiscal");
        
        if (!motivoFiscal) {
            let linhas = obsCompleta.trim().split('\n');
            motivoFiscal = linhas.length > 0 ? linhas[linhas.length - 1] : "Motivo não especificado. Consulte o sistema central.";
        }
        
        let corFundo = statusReal === "SUSPENSO" || statusReal === "CANCELADO" ? "#451a1a" : "#452a0a";
        let corBorda = statusReal === "SUSPENSO" || statusReal === "CANCELADO" ? "#ef4444" : "#f59e0b";
        
        caixaMotivo = `
        <div style="background: ${corFundo}; border-left: 4px solid ${corBorda}; padding: 12px; margin-top: 15px; border-radius: 4px;">
            <strong style="color: ${corBorda}; font-size: 11px; display: block; margin-bottom: 5px; text-transform: uppercase;">ℹ️ Nota para o Fiscal:</strong>
            <p style="color: #eee; font-size: 12px; line-height: 1.4; margin: 0;">${motivoFiscal.replace(/\n/g, '<br>')}</p>
        </div>`;
    }
    
    if (statusReal === "ATIVO") {
      statusBadge = `<div style="background:var(--success); color:white; padding:10px; border-radius:6px; text-align:center; font-weight:700; letter-spacing:1px; margin-bottom:10px;">✅ LIBERADO</div>`;
      relogioAntiPrint = `<div class="anti-print-bar" id="fiscal-clock" style="margin-top:0;"></div>`;
    } else if (statusReal === "CANCELADO") {
      statusBadge = `<div style="background:var(--danger); color:white; padding:10px; border-radius:6px; text-align:center; font-weight:700; letter-spacing:1px;">❌ CANCELADO</div>`;
    } else if (statusReal === "SUSPENSO") {
      statusBadge = `<div style="background:#F97316; color:white; padding:10px; border-radius:6px; text-align:center; font-weight:700; letter-spacing:1px;">⚠️ SUSPENSO</div>`;
    } else {
      statusBadge = `<div style="background:#FBBF24; color:#333; padding:10px; border-radius:6px; text-align:center; font-weight:700; letter-spacing:1px;">⏳ PENDENTE</div>`;
    }

    return `
    <div class="wallet-card dark">
      <div class="wallet-header">FISCALIZAÇÃO DE IDENTIDADE</div>
      <div class="wallet-body">
        ${fotoComponente}
        <div class="wallet-info">
          <div class="w-group"><span>Estudante</span><span class="highlight">${nomeTratado}</span></div>
          <div class="w-group"><span>Instituição</span><span>${inst}</span></div>
          <div class="w-group"><span>Rota / Turno</span><span style="color:var(--accent); font-weight:700;">${rota} • ${turno}</span></div>
        </div>
      </div>
      ${caixaMotivo}
      <div class="wallet-footer" style="margin-top: 15px;">${statusBadge}${relogioAntiPrint}</div>
    </div>`;
}

// ------------------------------------------------------------------------
// NOVO: Funções de Encerramento Manual de Rota (V9.2.2)
// ------------------------------------------------------------------------
function abrirModalEncerrarRota() {
    document.getElementById('modal-encerrar-rota').classList.remove('hidden');
    document.getElementById('input-encerrar-onibus').value = '';
}

function fecharModalEncerrarRota() {
    document.getElementById('modal-encerrar-rota').classList.add('hidden');
    const btn = document.getElementById('btn-enviar-encerramento');
    btn.innerHTML = 'CONFIRMAR FIM DE ROTA';
    btn.disabled = false;
}

async function dispararEncerramentoRota() {
    const idBus = document.getElementById('input-encerrar-onibus').value.trim().toUpperCase();
    const btn = document.getElementById('btn-enviar-encerramento');
    
    if (!idBus) {
        showToast("Digite o identificador do autocarro.", "error");
        return;
    }
    
    btn.innerHTML = 'A PROCESSAR DESEMBARQUE... ⏳';
    btn.disabled = true;
    
    try {
        const res = await apiCall("encerrarRotaManual", { idOnibus: idBus });
        if (res.sucesso) {
            showToast(res.msg, "success");
            fecharModalEncerrarRota();
        } else {
            showToast(res.erro || "Falha ao encerrar a rota.", "error");
            btn.innerHTML = 'TENTAR NOVAMENTE';
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro de ligação com a base de dados.", "error");
        btn.innerHTML = 'TENTAR NOVAMENTE';
        btn.disabled = false;
    }
}

// ========================================================================
// 10. MOTOR DE CRISES E AVISOS PUSH (V9.2.5)
// ========================================================================
function abrirModalSOS() {
    document.getElementById('modal-sos-fiscal').classList.remove('hidden');
    document.getElementById('sos-id-onibus').value = '';
    document.getElementById('sos-motivo').value = '';
}

function fecharModalSOS() {
    document.getElementById('modal-sos-fiscal').classList.add('hidden');
    const btn = document.getElementById('btn-enviar-sos');
    btn.innerHTML = 'ENVIAR ALARME E MEU GPS';
    btn.disabled = false;
}

function confirmarEmergenciaGPS() {
    const idBus = document.getElementById('sos-id-onibus').value.trim().toUpperCase();
    const motivo = document.getElementById('sos-motivo').value;
    const btn = document.getElementById('btn-enviar-sos');
    
    if (!idBus || !motivo) {
        showToast("Preencha a Placa/Rota e selecione o motivo.", "error");
        return;
    }
    
    btn.innerHTML = 'A OBTER GPS E NOTIFICAR ALUNOS... ⏳';
    btn.disabled = true;
    
    if (!navigator.geolocation) {
        enviarAlarmeCriseAPI(idBus, motivo, "GPS Indisponível no Dispositivo");
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const coord = `${pos.coords.latitude}, ${pos.coords.longitude}`;
            enviarAlarmeCriseAPI(idBus, motivo, coord);
        },
        function(err) {
            enviarAlarmeCriseAPI(idBus, motivo, "GPS Recusado ou Falhou");
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
}

async function enviarAlarmeCriseAPI(idBus, motivo, coords) {
    const btn = document.getElementById('btn-enviar-sos');
    
    try {
        const res = await apiCall("declararEmergenciaOnibus", { idRotaPlaca: idBus, tipoAvaria: motivo, coordenadasGps: coords });
        if (res.sucesso) {
            showToast("Emergência reportada! Alunos da rota avisados via Push.", "success");
            fecharModalSOS();
        } else {
            showToast(res.erro || "Falha ao gravar emergência.", "error");
            btn.innerHTML = 'TENTAR NOVAMENTE';
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro de ligação com o servidor Maestro.", "error");
        btn.innerHTML = 'TENTAR NOVAMENTE';
        btn.disabled = false;
    }
}

function abrirModalMural() {
    document.getElementById('modal-nova-mensagem').classList.remove('hidden');
    document.getElementById('mural-mensagem').value = '';
}

function fecharModalMural() {
    document.getElementById('modal-nova-mensagem').classList.add('hidden');
    const btn = document.getElementById('btn-enviar-mural');
    btn.innerHTML = 'PUBLICAR NO MURAL';
    btn.disabled = false;
}

async function enviarMensagemParaMural() {
    const categoria = document.getElementById('mural-categoria').value;
    const mensagem = document.getElementById('mural-mensagem').value.trim();
    const btn = document.getElementById('btn-enviar-mural');
    
    if (mensagem.length < 10) { showToast("A mensagem é muito curta.", "error"); return; }
    
    btn.innerHTML = 'A VALIDAR QUOTA... ⏳';
    btn.disabled = true;

    try {
        setTimeout(() => { 
            if (btn.disabled) btn.innerHTML = 'A AUDITAR CONTEÚDO... 🤖'; 
        }, 1500);

        const res = await apiCall("publicarMensagemMural", { idEstudante: currentWalletId, nomeEstudante: currentStudentName, categoria: categoria, mensagem: mensagem });
        
        if (res.sucesso) {
            showToast(res.msg || "Mensagem aprovada e partilhada!", "success");
            fecharModalMural();
            abrirMuralDaSemana(); 
        } else {
            showToast(res.erro || "Falha ao submeter.", "error");
            btn.innerHTML = 'TENTAR NOVAMENTE';
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro de comunicação com o servidor.", "error");
        btn.innerHTML = 'TENTAR NOVAMENTE';
        btn.disabled = false;
    }
}

// ------------------------------------------------------------------------
// V9.2.5: NOVO MOTOR DE AVISOS PUSH DO FISCAL
// ------------------------------------------------------------------------
function abrirModalAvisosFiscal() {
    document.getElementById('modal-novo-aviso-fiscal').classList.remove('hidden');
    
    // Reseta os campos
    document.getElementById('aviso-titulo-mural').value = '';
    document.getElementById('aviso-msg-mural').value = '';
    document.getElementById('aviso-titulo-direto').value = '';
    document.getElementById('aviso-msg-direto').value = '';
    
    alternarTipoAviso('mural');
    carregarFiltrosParaPush();
}

function fecharModalAvisosFiscal() {
    document.getElementById('modal-novo-aviso-fiscal').classList.add('hidden');
}

function alternarTipoAviso(tipo) {
    const tabMural = document.getElementById('tab-aviso-mural');
    const tabDireto = document.getElementById('tab-aviso-direto');
    const areaMural = document.getElementById('area-aviso-mural');
    const areaDireto = document.getElementById('area-aviso-direto');
    
    if (tipo === 'mural') {
        tabMural.classList.add('active');
        tabDireto.classList.remove('active');
        areaMural.classList.remove('hidden');
        areaDireto.classList.add('hidden');
    } else {
        tabMural.classList.remove('active');
        tabDireto.classList.add('active');
        areaMural.classList.add('hidden');
        areaDireto.classList.remove('hidden');
    }
}

async function carregarFiltrosParaPush() {
    const selectRota = document.getElementById('filtro-rota-push');
    const selectTurno = document.getElementById('filtro-turno-push');
    const selectInst = document.getElementById('filtro-inst-push');
    
    try {
        const res = await apiCall("getFiltrosPush");
        if (res.sucesso && res.filtros) {
            let htmlRota = '<option value="TODAS">Qualquer Rota</option>';
            res.filtros.rotas.forEach(r => htmlRota += `<option value="${r}">${r}</option>`);
            selectRota.innerHTML = htmlRota;
            
            let htmlTurno = '<option value="TODOS">Qualquer Turno</option>';
            res.filtros.turnos.forEach(t => htmlTurno += `<option value="${t}">${t}</option>`);
            selectTurno.innerHTML = htmlTurno;
            
            let htmlInst = '<option value="TODAS">Qualquer Instituição</option>';
            res.filtros.instituicoes.forEach(i => htmlInst += `<option value="${i}">${i}</option>`);
            selectInst.innerHTML = htmlInst;
        }
    } catch(e) {
        console.warn("Filtros falharam ao carregar.");
    }
}

async function dispararAvisoPublico() {
    const tipo = document.getElementById('aviso-tipo-mural').value;
    const titulo = document.getElementById('aviso-titulo-mural').value.trim();
    const mensagem = document.getElementById('aviso-msg-mural').value.trim();
    const btn = document.getElementById('btn-publicar-aviso');
    
    if (!titulo || !mensagem) {
        showToast("Preencha o título e a mensagem.", "error");
        return;
    }
    
    btn.innerHTML = 'A COMUNICAR COM FIREBASE... ⏳';
    btn.disabled = true;
    
    try {
        const res = await apiCall("publicarAvisoNotificacao", {
            tipoAviso: tipo,
            titulo: titulo,
            mensagem: mensagem
        });
        
        if (res.sucesso) {
            showToast("Aviso afixado e alunos notificados!", "success");
            fecharModalAvisosFiscal();
        } else {
            showToast(res.erro || "Falha ao publicar.", "error");
            btn.innerHTML = 'TENTAR NOVAMENTE';
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro na comunicação.", "error");
        btn.innerHTML = 'TENTAR NOVAMENTE';
        btn.disabled = false;
    }
}

async function dispararPushSegmentado() {
    const rota = document.getElementById('filtro-rota-push').value;
    const turno = document.getElementById('filtro-turno-push').value;
    const inst = document.getElementById('filtro-inst-push').value;
    const titulo = document.getElementById('aviso-titulo-direto').value.trim();
    const mensagem = document.getElementById('aviso-msg-direto').value.trim();
    const btn = document.getElementById('btn-disparar-direto');
    
    if (!titulo || !mensagem) {
        showToast("Preencha o título e a mensagem.", "error");
        return;
    }
    
    btn.innerHTML = 'A DISPARAR LOTE... ⏳';
    btn.disabled = true;
    
    try {
        const res = await apiCall("dispararPushLoteManual", {
            titulo: titulo,
            mensagem: mensagem,
            rota: rota,
            turno: turno,
            instituicao: inst
        });
        
        if (res.sucesso) {
            showToast(`Lote enviado para ${res.enviados} dispositivos.`, "success");
            fecharModalAvisosFiscal();
        } else {
            showToast(res.erro || "Nenhum aluno encontrado neste filtro.", "error");
            btn.innerHTML = 'TENTAR NOVAMENTE';
            btn.disabled = false;
        }
    } catch(e) {
        showToast("Erro no disparo em lote.", "error");
        btn.innerHTML = 'TENTAR NOVAMENTE';
        btn.disabled = false;
    }
}

function calcularTempoRelativo(tsServidor) {
    const agoraLocal = new Date().getTime();
    const diffEmMinutos = Math.floor((agoraLocal - tsServidor) / 60000);
    if (diffEmMinutos <= 0) return "Agora mesmo";
    if (diffEmMinutos < 60) return diffEmMinutos + (diffEmMinutos === 1 ? " min atrás" : " mins atrás");
    const horas = Math.floor(diffEmMinutos / 60);
    if (horas < 24) return horas + (horas === 1 ? " hora atrás" : " horas atrás");
    const dias = Math.floor(horas / 24);
    return dias + (dias === 1 ? " dia atrás" : " dias atrás");
}

async function abrirMuralDaSemana() {
    switchView('view-mural');
    const container = document.getElementById('mural-feed');
    
    let btnNovoPostHTML = '';
    if (currentWalletId && localStorage.getItem("MAESTRO_EST_TOKEN")) {
        btnNovoPostHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
           <button class="btn-solid" style="background: var(--primary); display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: auto; padding: 10px 20px;" onclick="abrirModalMural()">
              <span style="font-size: 16px;">📝</span> Criar Nova Publicação
           </button>
        </div>`;
    } else {
        btnNovoPostHTML = `<div style="text-align: center; margin-bottom: 20px; font-size: 11px; color: var(--text-sub);">Apenas estudantes logados na Carteira Digital podem publicar ou votar.</div>`;
    }
    
    container.innerHTML = `${btnNovoPostHTML}<div class="loader" style="margin: 0 auto;"></div><p style="text-align: center; font-size: 12px; margin-top: 10px;">A carregar a voz da comunidade...</p>`;
    
    try {
        const res = await apiCall("getMuralDaSemana");
        if (!res.sucesso) { container.innerHTML = `${btnNovoPostHTML}<div class="error-box">${res.erro}</div>`; return; }
        if (!res.mensagens || res.mensagens.length === 0) {
            container.innerHTML = `${btnNovoPostHTML}<div class="text-center" style="padding: 30px 10px; color: var(--text-sub); border: 1px dashed var(--border); border-radius: 8px;">Ainda não há contribuições nos últimos 7 dias.<br><br><b>Seja o primeiro a partilhar uma ideia!</b></div>`;
            return;
        }
        
        let html = btnNovoPostHTML;
        res.mensagens.forEach((msg, index) => {
            const upAtivo = currentWalletId && msg.arrayUpsInfo.includes(currentWalletId) ? 'color: var(--primary); font-weight: bold;' : 'color: #999;';
            const downAtivo = currentWalletId && msg.arrayDownsInfo.includes(currentWalletId) ? 'color: var(--danger); font-weight: bold;' : 'color: #999;';
            const coroa = index === 0 && msg.pontuacao > 0 ? '👑 Top Semanal' : '';
            const tempoCorrigido = calcularTempoRelativo(msg.tsMensagem);
            
            let iconCat = '🗣️';
            if (msg.categoria.indexOf('Sugestão') !== -1) iconCat = '💡';
            if (msg.categoria.indexOf('Reclamação') !== -1) iconCat = '⚠️';
            if (msg.categoria.indexOf('Achados') !== -1) iconCat = '🎒';
            
            html += `
            <div class="form-card" style="padding: 15px; margin-bottom: 15px; border-left: 4px solid var(--primary); border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-align: left;">
               <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                  <div>
                     <span style="font-size: 10px; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: var(--text-sub);">${iconCat} ${msg.categoria}</span>
                     ${coroa ? `<span style="font-size: 10px; background: #fef08a; padding: 2px 6px; border-radius: 4px; color: #854d0e; font-weight: bold; margin-left: 5px;">${coroa}</span>` : ''}
                  </div>
                  <span style="font-size: 10px; color: var(--text-sub);">${tempoCorrigido}</span>
               </div>
               <p style="font-size: 13px; color: #333; line-height: 1.5; margin-bottom: 12px; word-wrap: break-word;">"${msg.mensagem}"</p>
               <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px;">
                  <span style="font-size: 11px; color: var(--text-sub); font-weight: 500;">👤 Por: ${msg.autor}</span>
                  <div style="display: flex; gap: 15px; align-items: center;">
                     <button onclick="votarNoMural('${msg.id}', 'UP')" style="background: none; border: none; font-size: 16px; cursor: pointer; ${upAtivo} transition: transform 0.1s;">👍 <span id="count-up-${msg.id}" style="font-size: 12px;">${msg.votosUp}</span></button>
                     <button onclick="votarNoMural('${msg.id}', 'DOWN')" style="background: none; border: none; font-size: 16px; cursor: pointer; ${downAtivo} transition: transform 0.1s;">👎 <span id="count-down-${msg.id}" style="font-size: 12px;">${msg.votosDown}</span></button>
                  </div>
               </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = `<div class="error-box">Erro ao comunicar com o servidor do Mural.</div>`;
    }
}

function votarNoMural(idMensagem, tipoVoto) {
    if (!currentWalletId || !localStorage.getItem("MAESTRO_EST_TOKEN")) {
        showToast("É necessário aceder ao Cofre Digital para votar.", "warning");
        return;
    }
    
    const btnUp = document.getElementById(`count-up-${idMensagem}`).parentNode;
    const btnDown = document.getElementById(`count-down-${idMensagem}`).parentNode;
    
    if (btnUp) { btnUp.style.pointerEvents = 'none'; btnUp.style.opacity = '0.5'; }
    if (btnDown) { btnDown.style.pointerEvents = 'none'; btnDown.style.opacity = '0.5'; }
    
    apiCall("votarMensagemMural", { idEstudante: currentWalletId, idMensagem: idMensagem, tipoVoto: tipoVoto }).then(res => {
        if (res.sucesso) {
            setTimeout(abrirMuralDaSemana, 1000);
        } else {
            showToast(res.erro || "O seu voto não pôde ser contabilizado.", "error");
            if (btnUp) { btnUp.style.pointerEvents = 'auto'; btnUp.style.opacity = '1'; }
            if (btnDown) { btnDown.style.pointerEvents = 'auto'; btnDown.style.opacity = '1'; }
        }
    }).catch(e => {
        if (btnUp) { btnUp.style.pointerEvents = 'auto'; btnUp.style.opacity = '1'; }
        if (btnDown) { btnDown.style.pointerEvents = 'auto'; btnDown.style.opacity = '1'; }
    });
}

// ========================================================================
// 11. MOTOR DO DASHBOARD ANALÍTICO E BI
// ========================================================================
let myCharts = {}; 

function mudarAbaDashboard(aba) {
  ['logistica', 'noturno', 'inclusao', 'analise'].forEach(t => {
    document.getElementById('tab-' + t).classList.remove('active');
    document.getElementById('dash-area-' + t).classList.add('hidden');
  });
  document.getElementById('tab-' + aba).classList.add('active');
  document.getElementById('dash-area-' + aba).classList.remove('hidden');
  
  if (aba === 'analise') {
     renderizarDashboardBI(); 
  }
}

async function carregarDashboard() {
  const cachedStatsRaw = localStorage.getItem(CACHE_STATS_KEY);
  
  if (cachedStatsRaw) {
    const st = JSON.parse(cachedStatsRaw);
    window.dadosBI = st.dataMart || []; 
    renderizarDashboardUI(st);
    switchView('view-dashboard');
    gerarChipsDinamicos(); 
    
    apiCall("getDashboardStats").then(res => {
        if (res.sucesso) {
            localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(res.stats));
            window.dadosBI = res.stats.dataMart || [];
            renderizarDashboardUI(res.stats); 
            gerarChipsDinamicos(); 
            if (document.getElementById('tab-analise').classList.contains('active')) renderizarDashboardBI();
        }
    }).catch(e => console.log("Atualização falhou."));
  } else {
    showToast("A extrair dados para o Dashboard...", "info");
    try {
      const res = await apiCall("getDashboardStats");
      if (!res.sucesso) return;
      localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(res.stats));
      window.dadosBI = res.stats.dataMart || [];
      renderizarDashboardUI(res.stats);
      switchView('view-dashboard');
      gerarChipsDinamicos();
    } catch(err) {
      showToast("Falha de conexão com os dados analíticos.", "error");
    }
  }
}

function renderizarDashboardUI(stats) {
  document.getElementById('kpi-ativos').innerText = stats.kpis.ativos;
  document.getElementById('kpi-pendentes').innerText = stats.kpis.pendentes;
  document.getElementById('kpi-retidos').innerText = stats.kpis.retidos;
  document.getElementById('kpi-suspensos').innerText = stats.kpis.suspensos;

  const ocrUsado = stats.consumo?.ocr?.usado || 0;
  const ocrLimite = stats.consumo?.ocr?.limite || 100;
  const pctIA = Math.round((ocrUsado / ocrLimite) * 100);
  
  const barraIA = document.getElementById('bar-ia-usage');
  if (document.getElementById('kpi-ia-text')) {
      document.getElementById('kpi-ia-text').innerText = `${ocrUsado} / ${ocrLimite}`;
      barraIA.style.width = Math.min(pctIA, 100) + "%";
      barraIA.style.background = pctIA > 80 ? "var(--danger)" : "var(--accent)";
  }

  desenharGraficos(stats.graficos);
}

const mapaDias = {
    "segunda": "Seg", "seg": "Seg",
    "terça": "Ter", "terca": "Ter", "ter": "Ter",
    "quarta": "Qua", "qua": "Qua",
    "quinta": "Qui", "qui": "Qui",
    "sexta": "Sex", "sex": "Sex",
    "sábado": "Sáb", "sabado": "Sáb", "sab": "Sáb", "sáb": "Sáb"
};

function normalizarDia(texto) {
    let t = texto.toLowerCase().trim();
    for (let chave in mapaDias) {
        if (t.includes(chave)) return mapaDias[chave];
    }
    return texto.trim(); 
}

function gerarChipsDinamicos() {
    if (!window.dadosBI || window.dadosBI.length === 0) return;

    let instituicoes = new Set();
    let turnos = new Set();
    let dias = new Set();

    window.dadosBI.forEach(aluno => {
        if(aluno.i) aluno.i.split(',').forEach(v => { if(v.trim()) instituicoes.add(v.trim()); });
        if(aluno.t) aluno.t.split(',').forEach(v => { if(v.trim()) turnos.add(v.trim()); });
        if(aluno.d) {
            aluno.d.split(',').forEach(v => {
                let diaLimpo = normalizarDia(v);
                if(diaLimpo) dias.add(diaLimpo);
            });
        }
    });

    const criarHTMLChips = (setValores, grupoNome) => {
        let html = '';
        Array.from(setValores).sort().forEach(val => {
            const chipAntigo = document.querySelector(`span.chip-filter[data-value="${val}"][data-group="${grupoNome}"]`);
            const classeAtiva = (chipAntigo && chipAntigo.classList.contains('chip-active')) ? 'chip-active' : '';
            html += `<span class="chip-filter ${classeAtiva}" data-group="${grupoNome}" data-value="${val}" onclick="toggleChip(this)">${val}</span>`;
        });
        return html;
    };

    const contInst = document.getElementById('container-chips-inst');
    if(contInst) contInst.innerHTML = criarHTMLChips(instituicoes, "bi_inst");

    const contTurno = document.getElementById('container-chips-turno');
    if(contTurno) contTurno.innerHTML = criarHTMLChips(turnos, "bi_turno");

    const contDia = document.getElementById('container-chips-dia');
    if(contDia) contDia.innerHTML = criarHTMLChips(dias, "bi_dia");
}

function toggleChip(element) {
    element.classList.toggle('chip-active');
    renderizarDashboardBI();
}

function renderizarDashboardBI() {
    if (!window.dadosBI || window.dadosBI.length === 0) return;
    
    const getActiveChips = (name) => Array.from(document.querySelectorAll(`span.chip-filter[data-group="${name}"].chip-active`)).map(el => el.getAttribute('data-value'));
    
    const fInst = getActiveChips("bi_inst");
    const fTurno = getActiveChips("bi_turno");
    const fDia = getActiveChips("bi_dia");
    const eixoX = document.getElementById("bi_eixo_x") ? document.getElementById("bi_eixo_x").value : "i";
    
    let dadosFiltrados = window.dadosBI.filter(aluno => {
        let passaInst = fInst.length === 0 || fInst.some(i => (aluno.i || "").includes(i));
        let passaTurno = fTurno.length === 0 || fTurno.some(t => (aluno.t || "").includes(t));
        
        let passaDia = fDia.length === 0;
        if (!passaDia && aluno.d) {
             let diasDoAlunoNormalizados = aluno.d.split(',').map(d => normalizarDia(d));
             passaDia = fDia.some(diaEscolhido => diasDoAlunoNormalizados.includes(diaEscolhido));
        }
        
        return passaInst && passaTurno && passaDia;
    });
    
    document.getElementById("bi_total").innerText = dadosFiltrados.length;
    
    let contagemGrafico = {};
    dadosFiltrados.forEach(aluno => {
        let stringBruta = aluno[eixoX] || "Sem Registo";
        let partes = stringBruta.split(',').map(p => p.trim()).filter(p => p !== "");
        
        if (partes.length === 0) {
             contagemGrafico["Sem Registo"] = (contagemGrafico["Sem Registo"] || 0) + 1;
        } else {
             partes.forEach(parte => {
                 let chaveFinal = (eixoX === 'd') ? normalizarDia(parte) : parte;
                 contagemGrafico[chaveFinal] = (contagemGrafico[chaveFinal] || 0) + 1;
             });
        }
    });
    
    const dadosOrdenados = extrairEOrdenar(contagemGrafico);
    renderChart('chart-bi', 'bar', dadosOrdenados.labels, dadosOrdenados.data, '#F59E0B', { indexAxis: 'x' });
}

function renderChart(canvasId, type, labels, data, colors, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (myCharts[canvasId]) myCharts[canvasId].destroy();
  
  Chart.defaults.color = '#aaaaaa';
  Chart.defaults.borderColor = '#333333';

  const defaultOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  myCharts[canvasId] = new Chart(ctx, { type: type, data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: (type === 'bar' ? 4 : 0), borderWidth: 0 }] }, options: Object.assign(defaultOptions, options) });
}

function extrairEOrdenar(obj) {
  const arr = Object.keys(obj).map(key => ({ label: key, value: obj[key] }));
  arr.sort((a, b) => b.value - a.value);
  return { labels: arr.map(item => item.label), data: arr.map(item => item.value) };
}

function desenharGraficos(graficos) {
  const baseColor = '#3B82F6'; 
  const st = graficos.status;
  renderChart('chart-status', 'doughnut', ["Ativos", "Pendentes", "Retidos (Humana)", "Cancelados/Suspensos"], [st["Ativos"]||0, st["Pendentes"]||0, st["Retidos (Humana)"]||0, st["Cancelados/Suspensos"]||0], ['#10B981', '#FBBF24', '#F97316', '#EF4444'], { plugins: { legend: { display: true, position: 'right', labels: {color: '#ddd', boxWidth: 12} } } });
  const inst = extrairEOrdenar(graficos.instituicoes); renderChart('chart-instituicoes', 'bar', inst.labels, inst.data, baseColor, { indexAxis: 'y' });
  const dias = extrairEOrdenar(graficos.dias); renderChart('chart-dias', 'bar', dias.labels, dias.data, baseColor, { indexAxis: 'y' });
  const rotas = extrairEOrdenar(graficos.rotas); renderChart('chart-rotas', 'bar', rotas.labels, rotas.data, baseColor, { indexAxis: 'y' });
  const turnos = extrairEOrdenar(graficos.turnos); renderChart('chart-turnos', 'bar', turnos.labels, turnos.data, baseColor); 

  if(graficos.noturno) {
    const adesao = extrairEOrdenar(graficos.noturno.adesao); renderChart('chart-adesao-23h', 'doughnut', adesao.labels, adesao.data, ['#FBBF24', '#333333'], { plugins: { legend: { display: true, position: 'bottom', labels: {color: '#ddd', boxWidth: 12} } } });
    const bairros = extrairEOrdenar(graficos.noturno.bairros); renderChart('chart-bairros-23h', 'bar', bairros.labels, bairros.data, '#F97316', { indexAxis: 'y' }); 
  }

  const renderInclusao = (canvas, objData) => renderChart(canvas, 'bar', ['Sim', 'Não'], [objData['Sim'] || 0, objData['Não'] || 0], ['#10B981', '#333']);
  renderInclusao('chart-pcd', graficos.inclusao.pcd); renderInclusao('chart-menor', graficos.inclusao.menor);
  renderInclusao('chart-acompanhado', graficos.inclusao.acompanhado); renderInclusao('chart-estagio', graficos.inclusao.estagio);
}

// ========================================================================
// 12. UTILITÁRIOS GLOBAIS
// ========================================================================

function formatarNome(nomeCompleto) {
  if (!nomeCompleto) return "Estudante";
  const partes = nomeCompleto.trim().split(" ");
  if (partes.length === 1) return partes[0];
  return partes[0] + " " + partes[partes.length - 1];
}

let toastTimeout;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.background = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : type === 'warning' ? '#f59e0b' : '#333';
  toast.style.display = 'block';
  
  if(toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}

async function inicializarPushNotifications() {
  const firebaseConfig = {
    apiKey: "COLE_SUA_API_KEY",
    authDomain: "COLE_SEU_PROJECT_ID.firebaseapp.com",
    projectId: "COLE_SEU_PROJECT_ID",
    storageBucket: "COLE_SEU_PROJECT_ID.appspot.com",
    messagingSenderId: "COLE_SEU_SENDER_ID",
    appId: "COLE_SEU_APP_ID"
  };

  try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch(e) { console.warn("Firebase Init falhou:", e); return; }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof firebase === 'undefined') {
     console.log("Push não suportado ou Firebase não carregado.");
     return;
  }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!isStandalone) return; 

  try {
    const messaging = firebase.messaging();
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      const token = await messaging.getToken({ vapidKey: window.FIREBASE_VAPID_KEY });
      if (token) {
         const tokenSalvoLocal = localStorage.getItem("MAESTRO_FCM_TOKEN");
         if (token !== tokenSalvoLocal || !localStorage.getItem("FCM_SYNCED_ID")) {
            await registrarTokenPush(token);
         }
      }
    }
  } catch (error) {
    console.warn("Permissão de Push negada ou falhou:", error);
  }
}

async function registrarTokenPush(token) {
  if (!currentWalletId) return;
  try {
     const res = await apiCall("registrarPushToken", { idEstudante: currentWalletId, pushToken: token });
     if (res.sucesso) {
        localStorage.setItem("MAESTRO_FCM_TOKEN", token);
        localStorage.setItem("FCM_SYNCED_ID", currentWalletId);
     }
  } catch (err) {}
}

window.onload = function() {
  bootSystem(); 
};
