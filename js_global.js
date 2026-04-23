/**
 * ============================================================================
 * UTILITÁRIOS GERAIS DO SISTEMA (V9.1)
 * ============================================================================
 */

/**
 * Sistema de Notificações Visual (Toast)
 * @param {string} msg - Mensagem a exibir
 * @param {string} type - 'success', 'error', 'loading' ou 'info'
 */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.innerText = msg;
  toast.style.display = 'block';
  
  // Cores dinâmicas baseadas no tipo
  const colors = {
    'success': '#188038',
    'error': '#D93025',
    'loading': '#0A3D6B',
    'info': '#333'
  };
  
  toast.style.background = colors[type] || colors.info;

  if (type !== 'loading') {
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }
}

/**
 * Máscara de Nome (Title Case Inteligente)
 * Formata nomes mal escritos para o padrão institucional.
 */
function formatarNome(nome) {
  if (!nome) return "";
  const excepcoes = ["da", "de", "do", "das", "dos", "e"];
  
  return nome.toLowerCase().split(' ').map((palavra, i) => {
    // Se for uma exceção E não for a primeira palavra, mantém minúscula
    if (excepcoes.includes(palavra) && i !== 0) return palavra;
    // Caso contrário, capitaliza a primeira letra
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}

/**
 * Manipulador de Erros Global
 */
function handleError(err) {
  console.error("Erro no Sistema:", err);
  showToast("Erro: " + (err.message || err), "error");
}
