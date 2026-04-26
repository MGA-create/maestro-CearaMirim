// ========================================================================
// 0. CONFIGURAÇÕES DA API V8.5/V8.8 (HEADLESS REST)
// ========================================================================

// ⚠️ ATENÇÃO: COLE AQUI O LINK DO SEU DEPLOY DO GOOGLE APPS SCRIPT (/exec)
const GAS_URL = "https://script.google.com/macros/s/AKfycbxr9_2GkOtGTJw5DrF0HMKVGNj7dAn_LGESr1iGIP4rXdtoRMFiJlnV0dEQ8cjuDDp2/exec";

async function apiCall(action, payload = {}) {
  // V8.8: O interceptor agora tenta enviar o Token do Estudante se não houver o de Fiscal
  let tokenToUse = localStorage.getItem("MAESTRO_OP_TOKEN");
  if (!tokenToUse) {
     tokenToUse = localStorage.getItem("MAESTRO_EST_TOKEN"); // <-- ESTA É A CHAVE!
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
    
    if (data.status === 401) {
      if (action === "invalidarTokenSessao") {
        return { sucesso: true };
      } else {
        if (localStorage.getItem("MAESTRO_EST_TOKEN")) {
            sairCarteira(true);
            showToast("A sua sessão de estudante expirou. Por favor, aceda novamente.", "error");
        } else {
            encerrarSessaoOperador(true);
            showToast(data.erro || "Sessão expirada. A redirecionar...", "error");
        }
        throw new Error("Sessão Expirada");
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

  const manifestJSON = {
    "name": window.PWA_NOME,
    "short_name": window.PWA_NOME.split(' ')[1] || window.PWA_NOME,
    "description": "Portal Oficial de Mobilidade e Identidade Estudantil",
    "start_url": window.location.href, 
    "display": "standalone", 
    "orientation": "portrait",
    "background_color": window.BG_COLOR || "#F8F9FA",
    "theme_color": window.THEME_COLOR || "#0A3D6B",
    "icons": [{ "src": window.PWA_ICONE, "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }]
  };

  const blob = new Blob([JSON.stringify(manifestJSON)], { type: 'application/json' });
  document.getElementById('dynamic-manifest').setAttribute('href', URL.createObjectURL(blob));

  // V8.8: Usa ficheiro SW real em vez do Blob
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker V8.8 Registado'))
      .catch(err => console.log('Erro no SW:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.classList.remove('hidden');
  });
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

// ========================================================================
// 2. MOTOR DE NAVEGAÇÃO SPA E AVISOS
// ========================================================================
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
// 3. MÓDULO DE SEGURANÇA SAAS E AUTO-CURA
// ========================================================================
const TOKEN_KEY = "MAESTRO_OP_TOKEN";
const CACHE_LISTA_KEY = "MAESTRO_CACHE_FISCAL"; 
const CACHE_STATS_KEY = "MAESTRO_DASH_STATS";
let timeoutSessaoID = null;

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
    document.getElementById('nome-operador-logado').innerText = resAuth.nome;
    
    if (resAuth.stats) {
      localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(resAuth.stats));
    }
    
    btn.innerText = "A BAIXAR DADOS...";

    const resCache = await apiCall("sincronizarCacheFiscal");
    if (resCache.sucesso) {
       localStorage.setItem(CACHE_LISTA_KEY, JSON.stringify(resCache.dados));
       
       if (resCache.sementeDia) {
           localStorage.setItem("MAESTRO_SEMENTE_FISCAL", resCache.sementeDia);
       }
       
       btn.innerText = "AUTENTICAR";
       btn.disabled = false;
       document.getElementById('fiscal-email').value = "";
       document.getElementById('fiscal-senha').value = "";
       
       armarRelogioSessaoLocal();
       switchView('view-admin-hub');
       showToast("Sessão iniciada.", "success");
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
// 4. FLUXO DE CONSULTA DO ESTUDANTE (TIMELINE & TRANSPARÊNCIA)
// ========================================================================
async function consultarEstudante() {
  const alvo = document.getElementById('id-estudante').value.trim();
  if (!alvo) { showToast("Informe o CPF.", "error"); return; }

  const btn = document.getElementById('btn-estudante');
  const resBox = document.getElementById('res-estudante');
  
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
    renderizarTimelineEstudante(res, resBox);
  } catch(err) {
    btn.innerText = "CONSULTAR STATUS";
    btn.disabled = false;
    mostrarErroEstudante("Erro na API", "Tente novamente mais tarde.");
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
    
    if (inputId && idAcesso) {
        inputId.value = idAcesso;
    }
    
    if (inputSenha) {
        setTimeout(() => { inputSenha.focus(); }, 100); 
    }
}

function abrirTelaCofreOuEntrarDireto() {
    if (currentWalletId && localStorage.getItem("MAESTRO_EST_TOKEN")) {
        switchView('view-wallet');
    } else {
        switchView('view-login');
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const btnCarteira = document.querySelector("button.menu-card.primary-card[onclick*='view-login']");
    if (btnCarteira) {
        btnCarteira.onclick = abrirTelaCofreOuEntrarDireto;
    }
});


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
// 5. FLUXO DA CARTEIRA DIGITAL (O COFRE OFFLINE-FIRST V8.8)
// ========================================================================
let currentWalletId = "";
let currentWalletSenha = "";
let currentStudentName = "";
let clockInterval = null; 
let timeoutSessaoEstudanteID = null; 

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
      
      // V8.8: Guarda o token real devolvido pelo backend
      if (res.token) {
          localStorage.setItem("MAESTRO_EST_TOKEN", res.token);
      }
      
      localStorage.setItem("MAESTRO_WALLET_CACHE", JSON.stringify(res));
      localStorage.setItem("MAESTRO_WALLET_CREDS", JSON.stringify({id: id, senha: senha}));

      renderizarCarteira(res);
      switchView('view-wallet');
      document.getElementById('login-id').value = '';
      document.getElementById('login-senha').value = '';
      
      armarRelogioSessaoEstudante(); 
      verificarJanelasEmbarque(); 
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
          
          showToast("Modo Offline Ativado. A usar dados guardados.", "warning");
          
          renderizarCarteira(resCached);
          switchView('view-wallet');
          document.getElementById('login-id').value = '';
          document.getElementById('login-senha').value = '';
          
          armarRelogioSessaoEstudante();
          return;
       }
    }

    resBox.innerText = "Falha de ligação. Necessita de internet para o primeiro acesso.";
    resBox.classList.remove('hidden');
    console.error("Falha no Cofre:", err);
  }
}

function armarRelogioSessaoEstudante() {
    if (timeoutSessaoEstudanteID) clearTimeout(timeoutSessaoEstudanteID);
    timeoutSessaoEstudanteID = setTimeout(() => {
        sairCarteira(true); 
        showToast("Sessão de segurança da Carteira expirada. Por favor, aceda novamente.", "info");
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
      <div style="font-size: 11px; color: var(--primary); margin-top: 8px; font-weight: 700; letter-spacing: 1px;">
        VÁLIDO PARA EMBARQUE HOJE
      </div>
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
  if (actions) actions.classList.remove('hidden');
  iniciarRelogioAntiPrint('wallet-clock');

  const qrContainer = document.getElementById('wallet-qrcode');
  if (qrContainer) {
      qrContainer.innerHTML = ""; 
      const semente = dados.sementeDia || new Date().toISOString().split('T')[0];
      const payloadQR = `${dados.idCarteira}|${semente}`;

      new QRCode(qrContainer, {
          text: payloadQR,
          width: 160,
          height: 160,
          colorDark : "#000000",
          colorLight : "#ffffff", 
          correctLevel : QRCode.CorrectLevel.H 
      });
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
  
  pararTransmissaoGps(); 
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
// 5.1. MOTOR DE MOBILIDADE E CHECK-IN (V8.8)
// ========================================================================

let onibusSelecionadoGPS = null;
let idIntervaloGPS = null;
let wakeLockAtivo = null;

async function verificarJanelasEmbarque() {
   if (!currentWalletId) return;
   const painelMob = document.getElementById('view-mobilidade');
   const containerLista = document.getElementById('lista-viagens-container');
   const painelSucesso = document.getElementById('painel-viagem-ativa');
   
   if (painelMob) painelMob.style.display = 'block';
   if (painelSucesso) painelSucesso.classList.add('hidden');
   if (containerLista) {
       containerLista.innerHTML = `<div class="loader" style="margin: 0 auto 10px auto; width: 25px; height: 25px; border-width: 3px;"></div><p style="font-size: 11px; color: var(--text-sub);">A procurar autocarros...</p>`;
       containerLista.classList.remove('hidden');
   }

   try {
       const res = await apiCall("getViagensDisponiveisPortal", { idEstudante: currentWalletId });
       
       if (!res.sucesso) {
           if (containerLista) containerLista.innerHTML = `<p style="font-size: 11px; color: var(--danger);">Falha ao carregar frota.</p>`;
           return;
       }

       if (res.emViagem) {
           if (containerLista) containerLista.classList.add('hidden');
           if (painelSucesso) painelSucesso.classList.remove('hidden');
           return;
       }

       if (!res.viagens || res.viagens.length === 0) {
           if (containerLista) containerLista.innerHTML = `<p style="font-size: 12px; color: var(--text-sub); font-weight: 500; margin:0;">Nenhum embarque previsto para agora.</p>`;
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
        const res = await apiCall("realizarCheckInOnibus", { idOnibus: idOnibus, idEstudante: currentWalletId, querSerGuia: false });
        
        if (res.sucesso) {
            showToast("Lugar Confirmado!", "success");
            onibusSelecionadoGPS = idOnibus; 
            
            document.getElementById('lista-viagens-container').classList.add('hidden');
            const painelSucesso = document.getElementById('painel-viagem-ativa');
            if (painelSucesso) painelSucesso.classList.remove('hidden');
            
            const toggle = document.getElementById('toggle-guia');
            if (toggle) { toggle.checked = false; toggle.disabled = false; }
            document.getElementById('status-guia-texto').innerText = "Desligado";
            document.getElementById('status-guia-texto').style.color = "var(--text-sub)";
            
        } else {
            showToast(res.erro || "Lotação atingida no momento do clique.", "error");
            verificarJanelasEmbarque(); 
        }
    } catch (e) {
        showToast("Erro ao processar reserva.", "error");
    }
}

async function toggleGuiaGps(checkbox) {
    const textoStatus = document.getElementById('status-guia-texto');
    
    if (checkbox.checked) {
        textoStatus.innerText = "A Iniciar Radar...";
        textoStatus.style.color = "#F59E0B";
        checkbox.disabled = true; 
        
        if (!navigator.geolocation) {
            showToast("O seu telemóvel não suporta GPS nativo.", "error");
            checkbox.checked = false; checkbox.disabled = false;
            textoStatus.innerText = "Falha no GPS";
            return;
        }

        try {
            if ('wakeLock' in navigator) {
                wakeLockAtivo = await navigator.wakeLock.request('screen');
            }
            
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    enviarCoordenadaSegura(pos.coords.latitude, pos.coords.longitude);
                    
                    idIntervaloGPS = setInterval(() => {
                        navigator.geolocation.getCurrentPosition(
                            p => enviarCoordenadaSegura(p.coords.latitude, p.coords.longitude),
                            e => console.warn("GPS perdeu sinal momentâneo")
                        );
                    }, 120000);
                    
                    textoStatus.innerText = "Transmissão Ativa 📡";
                    textoStatus.style.color = "var(--success)";
                    checkbox.disabled = false;
                    showToast("Obrigado por ser o Guia desta viagem!", "success");
                },
                function(err) {
                    showToast("Permissão de GPS negada.", "error");
                    pararTransmissaoGps(checkbox);
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
            );
        } catch (err) {
            showToast("O ecrã não suporta modo vigilância.", "error");
            pararTransmissaoGps(checkbox);
        }
    } else {
        pararTransmissaoGps(checkbox);
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
            console.log("Servidor rejeitou o GPS: " + res.erro);
            const toggle = document.getElementById('toggle-guia');
            pararTransmissaoGps(toggle);
        }
    }).catch(e => console.log("Falha silenciosa no ping GPS."));
}

function pararTransmissaoGps(checkboxRef) {
    if (idIntervaloGPS) { clearInterval(idIntervaloGPS); idIntervaloGPS = null; }
    if (wakeLockAtivo) { wakeLockAtivo.release().then(() => wakeLockAtivo = null); }
    
    if (checkboxRef) { 
        checkboxRef.checked = false; 
        checkboxRef.disabled = false; 
    }
    
    const textoStatus = document.getElementById('status-guia-texto');
    if (textoStatus) {
        textoStatus.innerText = "Desligado";
        textoStatus.style.color = "var(--text-sub)";
    }
}

// ========================================================================
// 6. MODO FISCAL - OMNI-SCANNER & BUSCA INTELIGENTE (V8.8 ANTI-FRAUDE)
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
     resBox.innerHTML = gerarHtmlFiscal(alunoBase.nome, "A carregar...", "...", "...", `<div class="wallet-photo skeleton-box"></div>`, alunoBase.status);
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
    
    resBox.innerHTML = gerarHtmlFiscal(res.nome, res.instituicao, res.rota, res.turno, `<div class="wallet-photo skeleton-box"></div>`, res.statusAtividade);
    
    apiCall("getFotoEstudanteBase64", { idEstudante: idCarteira }).then(resFoto => {
       const imgHtml = resFoto.fotoBase64 ? `<img src="${resFoto.fotoBase64}" class="wallet-photo">` : `<div class="wallet-photo" style="display:flex;align-items:center;justify-content:center;color:#666; background:#222; border-color:#333;">Sem Foto</div>`;
       resBox.innerHTML = gerarHtmlFiscal(res.nome, res.instituicao, res.rota, res.turno, imgHtml, res.statusAtividade);
       if (res.statusAtividade === "ATIVO") iniciarRelogioAntiPrint('fiscal-clock');
    }).catch(err => console.log("Erro foto da API."));

  } catch(err) {
    btn.innerText = "VERIFICAR ESTUDANTE";
    showToast("Erro de conexão com o servidor.", "error");
  }
}

function gerarHtmlFiscal(nome, inst, rota, turno, fotoComponente, statusReal) {
    let statusBadge = "";
    let relogioAntiPrint = "";
    const nomeTratado = formatarNome(nome);
    
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
      <div class="wallet-footer">${statusBadge}${relogioAntiPrint}</div>
    </div>`;
}

// ========================================================================
// 6.1. MOTOR DE CRISES (SOS MAESTRO)
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
    
    btn.innerHTML = 'A OBTER GPS... ⏳';
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
    btn.innerHTML = 'A COMUNICAR SECRETARIA...';
    
    try {
        const res = await apiCall("declararEmergenciaOnibus", {
            idRotaPlaca: idBus,
            tipoAvaria: motivo,
            coordenadasGps: coords
        });
        
        if (res.sucesso) {
            showToast("Emergência reportada! Alunos avisados.", "success");
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

// ========================================================================
// 6.2 MOTOR DA COMUNIDADE (IDEIA 08: MURAL E SUGESTÕES)
// ========================================================================
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
    
    if (mensagem.length < 10) {
        showToast("A mensagem é muito curta. Explique melhor a sua contribuição.", "error");
        return;
    }
    
    btn.innerHTML = 'A VALIDAR QUOTA... ⏳';
    btn.disabled = true;

    try {
        const res = await apiCall("publicarMensagemMural", {
            idEstudante: currentWalletId,
            nomeEstudante: currentStudentName,
            categoria: categoria,
            mensagem: mensagem
        });
        
        if (res.sucesso) {
            showToast(res.msg || "Mensagem partilhada com sucesso!", "success");
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

async function abrirMuralDaSemana() {
    switchView('view-mural');
    const container = document.getElementById('mural-feed');
    
    container.innerHTML = `<div class="loader" style="margin: 0 auto;"></div><p style="text-align: center; font-size: 12px; margin-top: 10px;">A carregar a voz da comunidade...</p>`;
    
    try {
        const res = await apiCall("getMuralDaSemana");
        
        if (!res.sucesso) {
            container.innerHTML = `<div class="error-box">Não foi possível carregar o mural no momento.</div>`;
            return;
        }
        
        if (!res.mensagens || res.mensagens.length === 0) {
            container.innerHTML = `<div class="text-center" style="padding: 30px 10px; color: var(--text-sub); border: 1px dashed var(--border); border-radius: 8px;">Ainda não há contribuições nos últimos 7 dias.<br><br><b>Abra o seu Cofre Digital para ser o primeiro!</b></div>`;
            return;
        }
        
        let html = '';
        res.mensagens.forEach((msg, index) => {
            const upAtivo = currentWalletId && msg.arrayUpsInfo.includes(currentWalletId) ? 'color: var(--primary); font-weight: bold;' : 'color: #999;';
            const downAtivo = currentWalletId && msg.arrayDownsInfo.includes(currentWalletId) ? 'color: var(--danger); font-weight: bold;' : 'color: #999;';
            const coroa = index === 0 && msg.pontuacao > 0 ? '👑 Top Semanal' : '';
            
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
                  <span style="font-size: 10px; color: var(--text-sub);">${msg.data}</span>
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
        showToast("É necessário aceder ao Cofre Digital para votar nas mensagens.", "warning");
        irParaCofreComId("");
        return;
    }
    
    const btnUpCount = document.getElementById(`count-up-${idMensagem}`);
    const btnDownCount = document.getElementById(`count-down-${idMensagem}`);
    
    apiCall("votarMensagemMural", {
        idEstudante: currentWalletId,
        idMensagem: idMensagem,
        tipoVoto: tipoVoto
    }).then(res => {
        if (res.sucesso) {
            if (btnUpCount) btnUpCount.innerText = res.ups;
            if (btnDownCount) btnDownCount.innerText = res.downs;
            setTimeout(abrirMuralDaSemana, 1000);
        } else {
            showToast(res.erro || "O seu voto não pôde ser contabilizado.", "error");
        }
    }).catch(e => console.log("Falha silenciosa ao votar no mural."));
}

// ========================================================================
// 7. MOTOR DO DASHBOARD ANALÍTICO
// ========================================================================
let myCharts = {}; 

function mudarAbaDashboard(aba) {
  ['logistica', 'noturno', 'inclusao'].forEach(t => {
    document.getElementById('tab-' + t).classList.remove('active');
    document.getElementById('dash-area-' + t).classList.add('hidden');
  });
  document.getElementById('tab-' + aba).classList.add('active');
  document.getElementById('dash-area-' + aba).classList.remove('hidden');
}

async function carregarDashboard() {
  const cachedStatsRaw = localStorage.getItem(CACHE_STATS_KEY);
  
  if (cachedStatsRaw) {
    renderizarDashboardUI(JSON.parse(cachedStatsRaw));
    switchView('view-dashboard');
    
    apiCall("getDashboardStats").then(res => {
        if (res.sucesso) {
            localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(res.stats));
            renderizarDashboardUI(res.stats); 
        }
    }).catch(e => console.log("Atualização de dashboard em background falhou."));
    
  } else {
    showToast("A extrair dados do servidor...", "info");
    try {
      const res = await apiCall("getDashboardStats");
      if (!res.sucesso) { showToast(res.erro || "Falha ao compilar Dashboard.", "error"); return; }
      localStorage.setItem(CACHE_STATS_KEY, JSON.stringify(res.stats));
      renderizarDashboardUI(res.stats);
      switchView('view-dashboard');
    } catch(err) {
      showToast("Falha de conexão com a base de dados.", "error");
    }
  }
}

function renderizarDashboardUI(stats) {
  document.getElementById('kpi-ativos').innerText = stats.kpis.ativos;
  document.getElementById('kpi-pendentes').innerText = stats.kpis.pendentes;
  document.getElementById('kpi-retidos').innerText = stats.kpis.retidos;
  document.getElementById('kpi-suspensos').innerText = stats.kpis.suspensos;

  const pctIA = Math.round((stats.consumo.iaUsado / stats.consumo.iaLimite) * 100);
  const barraIA = document.getElementById('bar-ia-usage');
  document.getElementById('kpi-ia-text').innerText = `${stats.consumo.iaUsado} / ${stats.consumo.iaLimite}`;
  barraIA.style.width = Math.min(pctIA, 100) + "%";
  barraIA.style.background = pctIA > 80 ? "var(--danger)" : "var(--accent)";

  desenharGraficos(stats.graficos);
}

function renderChart(canvasId, type, labels, data, colors, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (myCharts[canvasId]) myCharts[canvasId].destroy();
  
  Chart.defaults.color = '#aaaaaa';
  Chart.defaults.borderColor = '#333333';

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 } 
      }
    }
  };

  myCharts[canvasId] = new Chart(ctx, {
    type: type,
    data: { 
      labels: labels, 
      datasets: [{ 
        data: data, 
        backgroundColor: colors, 
        borderRadius: (type === 'bar' ? 4 : 0), 
        borderWidth: 0 
      }] 
    },
    options: Object.assign(defaultOptions, options)
  });
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
// 8. MOTOR DE NOTIFICAÇÕES PUSH (FIREBASE V8.7)
// ========================================================================

async function inicializarPushNotifications() {
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
     const res = await apiCall("registrarPushToken", { 
         idEstudante: currentWalletId, 
         pushToken: token 
     });
     
     if (res.sucesso) {
        localStorage.setItem("MAESTRO_FCM_TOKEN", token);
        localStorage.setItem("FCM_SYNCED_ID", currentWalletId);
        console.log("📱 Push Token registado com sucesso para a base de dados.");
     }
  } catch (err) {
     console.error("Falha ao registar o Push Token no Backend.");
  }
}

window.onload = function() {
  bootSystem(); 
};
