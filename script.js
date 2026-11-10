(function () {
  'use strict';
  const config = window.PRACA_GRUPO_CONFIG || {};
  const form = document.getElementById('leadForm');
  const submitButton = document.getElementById('submitButton');
  const feedback = document.getElementById('formFeedback');
  const dayInput = document.getElementById('dia');
  const monthInput = document.getElementById('mes');
  const phoneInput = document.getElementById('telefone');
  const successPanel = document.getElementById('successPanel');
  const groupLink = document.getElementById('groupLink');
  let requestId = null;
  let timer = null;

  function updateDays() {
    const priorDay = dayInput.value;
    const m = Number(monthInput.value);
    const lastDay = m === 2 ? 29 : [4,6,9,11].includes(m) ? 30 : 31;
    dayInput.innerHTML = '<option value="">Dia</option>';
    for (let d = 1; d <= lastDay; d++) dayInput.add(new Option(String(d).padStart(2,'0'), String(d)));
    if (priorDay && Number(priorDay) <= lastDay) dayInput.value = priorDay;
  }
  monthInput.addEventListener('change', updateDays);
  updateDays();

  function phoneMask(value) {
    const digits = value.replace(/\D/g,'').slice(0,11);
    if (digits.length <= 2) return digits ? '(' + digits : '';
    if (digits.length <= 6) return '(' + digits.slice(0,2) + ') ' + digits.slice(2);
    if (digits.length <= 10) return '(' + digits.slice(0,2) + ') ' + digits.slice(2,-4) + '-' + digits.slice(-4);
    return '(' + digits.slice(0,2) + ') ' + digits.slice(2,7) + '-' + digits.slice(7);
  }
  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneMask(phoneInput.value);
    phoneInput.setCustomValidity('');
  });
  const defaultSubmitLabel = submitButton.innerHTML;
  function setFeedback(text, pending) {
    feedback.textContent = text;
    feedback.classList.toggle('pending', Boolean(pending));
  }
  function fail(text) {
    clearTimeout(timer);
    requestId = null;
    submitButton.disabled = false;
    submitButton.innerHTML = defaultSubmitLabel;
    setFeedback(text || 'Não foi possível concluir o cadastro. Tente novamente.', false);
  }
  function randomRequestId() {
    const bytes = new Uint8Array(20);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, x => x.toString(16).padStart(2,'0')).join('');
  }
  function safeGroupUrl(link) {
    try {
      const u = new URL(link);
      return u.protocol === 'https:' && u.hostname === 'chat.whatsapp.com' && /^\/[a-zA-Z0-9_-]{8,}$/.test(u.pathname) && !u.search && !u.hash;
    } catch (_) { return false; }
  }
  function trustedOrigin(origin) {
    try {
      const u = new URL(origin);
      return u.protocol === 'https:' && (u.hostname === 'script.google.com' || u.hostname === 'script.googleusercontent.com' || u.hostname.endsWith('.script.googleusercontent.com'));
    } catch (_) { return false; }
  }
  window.addEventListener('message', event => {
    if (!trustedOrigin(event.origin)) return;
    const response = event.data || {};
    if (!requestId || response.type !== 'PRACA_GRUPO_RESULT' || response.request_id !== requestId) return;
    if (response.status !== 'success' || !safeGroupUrl(response.group_url)) {
      fail(response.message || 'Não foi possível liberar o convite. Tente novamente.');
      return;
    }
    clearTimeout(timer);
    requestId = null;
    groupLink.href = response.group_url;
    form.hidden = true;
    successPanel.hidden = false;
    if (config.autoRedirect !== false) {
      setTimeout(() => { window.location.assign(response.group_url); }, 700);
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (requestId) return;
    const phone = phoneInput.value.replace(/\D/g,'');
    phoneInput.setCustomValidity(phone.length === 10 || phone.length === 11 ? '' : 'Preencha seu WhatsApp com DDD.');
    if (!form.reportValidity()) return;
    if (document.getElementById('website').value.trim()) return;
    const endpoint = String(config.appsScriptUrl || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(?:\?.*)?$/.test(endpoint)) {
      setFeedback('A conexão com o cadastro ainda não está configurada. Avise a equipe do Praça Figueiras.', false);
      return;
    }
    requestId = randomRequestId();
    document.getElementById('requestId').value = requestId;
    form.action = endpoint;
    submitButton.disabled = true;
    submitButton.textContent = 'Confirmando cadastro...';
    setFeedback('Salvando seus dados para abrir o grupo...', true);
    timer = setTimeout(() => fail('A confirmação demorou mais que o esperado. Verifique sua conexão e tente novamente.'), Math.max(10000, Number(config.timeoutMs) || 30000));
    HTMLFormElement.prototype.submit.call(form);
  });
})();
