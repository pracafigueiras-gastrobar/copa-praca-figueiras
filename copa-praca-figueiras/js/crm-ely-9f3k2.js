const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyX0ijYWuUofz6iWgYwbIc-UTXYBeRpCkffC-VQMOoLJgdeN2kfwe-cZrgVJDPApnnk/exec";

let allLeads = [];
let selectedGameKey = "";
let lastKnownLeadCount = 0;
let latestNewLead = null;
let autoRefreshInterval = null;
let toastTimeout = null;
let isFirstLoad = true;

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "callback_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    window[callbackName] = function(data) {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    const script = document.createElement("script");
    script.src = url + "&callback=" + callbackName;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

async function loadLeads(options = {}) {
  const silent = options.silent || false;

  const url = `${SCRIPT_URL}?action=list`;
  const response = await jsonp(url);

  const newLeads = response.leads || [];
  const previousCount = allLeads.length;

  allLeads = newLeads;

  document.getElementById("loading").style.display = "none";

  renderStats();
  renderGames();

  if (selectedGameKey) {
    const selectedGameStillExists = allLeads.some(lead => getGameKey(lead) === selectedGameKey);

    if (selectedGameStillExists) {
      populateResponsavelFilter(getSelectedGameLeads());
      applyFilters();

      if (document.getElementById("pipelineArea").style.display === "block") {
        renderPipeline(getFilteredLeads());
      }
    }
  }

  if (!isFirstLoad && !silent && newLeads.length > previousCount) {
    const newestLead = sortNewestLeadsFirst(newLeads)[0];

    latestNewLead = newestLead;
    showLeadToast(newestLead);
  }

  lastKnownLeadCount = newLeads.length;
  isFirstLoad = false;
}

function startAutoRefreshLeads() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    loadLeads({ silent: false });
  }, 20000); // 20 segundos
}

function showLeadToast(lead) {
  const toast = document.getElementById("leadToast");

  document.getElementById("leadToastName").innerText =
    lead["Nome"] || "Novo lead";

  document.getElementById("leadToastInfo").innerText =
    `${lead["Jogo"] || "Jogo"} • ${lead["Pessoas"] || "-"} pessoa(s)`;

  toast.classList.add("active");

  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastTimeout = setTimeout(() => {
    hideLeadToast();
  }, 8000);
}

function hideLeadToast() {
  const toast = document.getElementById("leadToast");
  toast.classList.remove("active");
}

function goToNewestLead() {
  if (!latestNewLead) return;

  selectedGameKey = getGameKey(latestNewLead);

  openGame(selectedGameKey);

  setTimeout(() => {
    const tableArea = document.getElementById("tableArea");

    if (tableArea) {
      tableArea.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, 200);

  hideLeadToast();
}

function renderStats() {
  const total = allLeads.length;
  const respondidos = allLeads.filter(l => l["Respondido"] === "Sim").length;
  const reservas = allLeads.filter(l => l["Reserva Confirmada"] === "Sim").length;
  const pagos = allLeads.filter(l => l["Pagamento"] === "Pago").length;

  document.getElementById("totalLeads").innerText = total;
  document.getElementById("totalRespondidos").innerText = respondidos;
  document.getElementById("totalNaoRespondidos").innerText = total - respondidos;
  document.getElementById("totalReservas").innerText = reservas;
  document.getElementById("totalPagos").innerText = pagos;
}

function formatGameDate(value) {
  if (!value) return "";

  const text = String(value);

  if (text.includes("T")) {
    const date = new Date(text);
    return date.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo"
    });
  }

  return text;
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getGameDate(lead) {
  return formatGameDate(lead["Data do Jogo"] || lead["Data do jogo"]);
}

function getGameTime(lead) {
  return lead["Horário do Jogo"] || lead["Horário do jogo"] || "";
}

function getGameKey(lead) {
  return `${lead["Jogo"]} | ${getGameDate(lead)} | ${getGameTime(lead)}`;
}

function renderGames() {
  const grid = document.getElementById("gamesGrid");
  grid.innerHTML = "";

  const search = document.getElementById("gameSearch")
    ? document.getElementById("gameSearch").value.toLowerCase().trim()
    : "";

  const order = document.getElementById("gameOrder")
    ? document.getElementById("gameOrder").value
    : "data";

  const games = {};

  allLeads.forEach(lead => {
    const key = getGameKey(lead);

    if (!games[key]) {
      games[key] = [];
    }

    games[key].push(lead);
  });

  let gamesArray = Object.keys(games).map(key => {
    const leads = games[key];
    const first = leads[0];

    return {
      key,
      leads,
      first,
      respondidos: leads.filter(l => l["Respondido"] === "Sim").length,
      reservas: leads.filter(l => l["Reserva Confirmada"] === "Sim").length,
      pagos: leads.filter(l => l["Pagamento"] === "Pago").length,
      pessoasConfirmadas: getConfirmedPeopleCount(leads),
      capacidade: 200
    };
  });

  if (search) {
    gamesArray = gamesArray.filter(game => {
      const text = `
        ${game.first["Jogo"] || ""}
        ${getGameDate(game.first)}
        ${getGameTime(game.first)}
      `.toLowerCase();

      return text.includes(search);
    });
  }

  gamesArray.sort((a, b) => {
    if (order === "leads") return b.leads.length - a.leads.length;
    if (order === "pagos") return b.pagos - a.pagos;
    if (order === "reservas") return b.reservas - a.reservas;

    const dateA = new Date(getGameDate(a.first).split("/").reverse().join("-"));
    const dateB = new Date(getGameDate(b.first).split("/").reverse().join("-"));

    return dateA - dateB;
  });

  if (!gamesArray.length) {
    grid.innerHTML = `<p class="games-empty">Nenhum jogo encontrado com esse filtro.</p>`;
    return;
  }

  gamesArray.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-card";
    card.onclick = () => openGame(game.key);

    card.innerHTML = `
     <div class="game-card-top">
    <div>
      <h3>${game.first["Jogo"]}</h3>
      <p>${getGameDate(game.first)} às ${getGameTime(game.first)}</p>
    </div>

  <div class="capacity-badge">
    <strong>${game.pessoasConfirmadas}/${game.capacidade}</strong>
    <span>lugares</span>
  </div>
</div>

      <div class="game-metrics">
        <div class="metric"><span>Leads</span><strong>${game.leads.length}</strong></div>
        <div class="metric"><span>Respondidos</span><strong>${game.respondidos}</strong></div>
        <div class="metric"><span>Reservas</span><strong>${game.reservas}</strong></div>
        <div class="metric"><span>Pagos</span><strong>${game.pagos}</strong></div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function parseLeadDate(value) {
  if (!value) return 0;

  const text = String(value).trim();

  // Formato: 26/05/2026 14:10
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (match) {
    const [, day, month, year, hour, minute] = match;
    return new Date(year, month - 1, day, hour, minute).getTime();
  }

  const date = new Date(text);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function sortNewestLeadsFirst(leads) {
  return [...leads].sort((a, b) => {
    return parseLeadDate(b["Data do envio"]) - parseLeadDate(a["Data do envio"]);
  });
}

function clearGameFilters() {
  document.getElementById("gameSearch").value = "";
  document.getElementById("gameOrder").value = "data";
  renderGames();
}

function openGame(key) {
  selectedGameKey = key;

  const leads = allLeads.filter(lead => getGameKey(lead) === key);
  const first = leads[0];

  document.getElementById("selectedGameTitle").innerText =
    `${first["Jogo"]} - ${getGameDate(first)} às ${getGameTime(first)}`;

  populateResponsavelFilter(leads);
  clearFilters(false);
  renderTable(leads);

if (document.getElementById("pipelineArea").style.display === "block") {
  renderPipeline(leads);
}

  document.getElementById("tableArea").style.display = "block";
  document.getElementById("tableArea").scrollIntoView({ behavior: "smooth" });
}

function closeTable() {
  document.getElementById("tableArea").style.display = "none";
}

function getSelectedGameLeads() {
  return allLeads.filter(lead => getGameKey(lead) === selectedGameKey);
}

function populateResponsavelFilter(leads) {
  const select = document.getElementById("filterResponsavel");
  const responsaveis = [...new Set(
    leads
      .map(l => String(l["Responsável"] || "").trim())
      .filter(Boolean)
  )].sort();

  select.innerHTML = `<option value="">Todos</option>`;

  responsaveis.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

function applyFilters() {
  let leads = getSelectedGameLeads();

  const search = document.getElementById("filterSearch").value.toLowerCase().trim();
  const estagio = document.getElementById("filterEstagio").value;
  const respondido = document.getElementById("filterRespondido").value;
  const reserva = document.getElementById("filterReserva").value;
  const pagamento = document.getElementById("filterPagamento").value;
  const responsavel = document.getElementById("filterResponsavel").value;

  if (search) {
    leads = leads.filter(lead => {
      const text = `
        ${lead["Nome"] || ""}
        ${lead["Telefone"] || ""}
        ${lead["Email"] || ""}
      `.toLowerCase();

      return text.includes(search);
    });
  }

  if (estagio) {
    leads = leads.filter(lead => lead["Estágio"] === estagio);
  }

  if (respondido) {
    leads = leads.filter(lead => lead["Respondido"] === respondido);
  }

  if (reserva) {
    leads = leads.filter(lead => lead["Reserva Confirmada"] === reserva);
  }

  if (pagamento) {
    leads = leads.filter(lead => lead["Pagamento"] === pagamento);
  }

  if (responsavel) {
    leads = leads.filter(lead => lead["Responsável"] === responsavel);
  }

  renderTable(leads);
}

function getFilteredLeads() {
  const search = document.getElementById("filterSearch").value.toLowerCase();
  const estagio = document.getElementById("filterEstagio").value;
  const respondido = document.getElementById("filterRespondido").value;
  const reserva = document.getElementById("filterReserva").value;
  const pagamento = document.getElementById("filterPagamento").value;
  const responsavel = document.getElementById("filterResponsavel").value;

  return getSelectedGameLeads().filter(lead => {
    const matchesSearch =
      !search ||
      (lead["Nome"] || "").toLowerCase().includes(search) ||
      (lead["Telefone"] || "").toLowerCase().includes(search) ||
      (lead["Email"] || "").toLowerCase().includes(search);

    const matchesEstagio =
      !estagio || (lead["Estágio"] || "") === estagio;

    const matchesRespondido =
      !respondido || (lead["Respondido"] || "") === respondido;

    const matchesReserva =
      !reserva || (lead["Reserva Confirmada"] || "") === reserva;

    const matchesPagamento =
      !pagamento || (lead["Pagamento"] || "") === pagamento;

    const matchesResponsavel =
      !responsavel || (lead["Responsável"] || "") === responsavel;

    return (
      matchesSearch &&
      matchesEstagio &&
      matchesRespondido &&
      matchesReserva &&
      matchesPagamento &&
      matchesResponsavel
    );
  });
}

function clearFilters(shouldRender = true) {
  document.getElementById("filterSearch").value = "";
  document.getElementById("filterEstagio").value = "";
  document.getElementById("filterRespondido").value = "";
  document.getElementById("filterReserva").value = "";
  document.getElementById("filterPagamento").value = "";
  document.getElementById("filterResponsavel").value = "";

  if (shouldRender) {
    renderTable(getSelectedGameLeads());
  }
}

function renderTable(leads) {
  leads = sortNewestLeadsFirst(leads);  
  const tbody = document.getElementById("leadsTable");
  tbody.innerHTML = "";

  leads.forEach(lead => {
    const row = document.createElement("tr");
    const rowNumber = lead.rowNumber;

    row.innerHTML = `
    <td>
        <button class="lead-name-btn" onclick='openLeadModal(${JSON.stringify(lead)})'>
        ${lead["Nome"] || ""}
        </button><br>
        <small>${lead["Email"] || ""}</small>
    </td>

    <td>${lead["Telefone"] || ""}</td>
    <td>${lead["Pessoas"] || ""}</td>
    <td>${lead["Origem"] || ""}</td>

      <td>
        <select id="estagio-${rowNumber}">
          ${option("Novo Lead", lead["Estágio"])}
          ${option("Em Atendimento", lead["Estágio"])}
          ${option("Aguardando Retorno", lead["Estágio"])}
          ${option("Reserva Confirmada", lead["Estágio"])}
          ${option("Pagamento Pendente", lead["Estágio"])}
          ${option("Pago", lead["Estágio"])}
          ${option("Cancelado", lead["Estágio"])}
          ${option("Perdido", lead["Estágio"])}
        </select>
      </td>

      <td>
        <select id="respondido-${rowNumber}">
          ${option("Não", lead["Respondido"])}
          ${option("Sim", lead["Respondido"])}
        </select>
      </td>

      <td>
        <select id="reserva-${rowNumber}">
          ${option("Não", lead["Reserva Confirmada"])}
          ${option("Sim", lead["Reserva Confirmada"])}
        </select>
      </td>

      <td>
        <select id="pagamento-${rowNumber}">
          ${option("Pendente", lead["Pagamento"])}
          ${option("Pago", lead["Pagamento"])}
          ${option("Cancelado", lead["Pagamento"])}
          ${option("Não se aplica", lead["Pagamento"])}
        </select>
      </td>

      <td>
        <input id="valor-${rowNumber}" value="${lead["Valor Pago"] || ""}" placeholder="R$">
      </td>

      <td>
        <input id="responsavel-${rowNumber}" value="${lead["Responsável"] || ""}" placeholder="Nome">
      </td>

      <td>
        <textarea id="anotacoes-${rowNumber}" placeholder="Anotações internas">${lead["Anotações Internas"] || ""}</textarea>
      </td>

      <td>
        <div class="actions">
        <a class="whatsapp-btn" target="_blank" href="${whatsappLink(lead["Telefone"], lead["Nome"])}">WhatsApp</a>
        <button class="save-btn" onclick="saveLead(${rowNumber})">Salvar</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });
}

const PIPELINE_STAGES = [
  "Novo Lead",
  "Em Atendimento",
  "Aguardando Retorno",
  "Reserva Confirmada",
  "Pagamento Pendente",
  "Pago",
  "Cancelado",
  "Perdido"
];

function showTableView() {
  document.querySelector(".table-wrap").style.display = "block";
  document.getElementById("pipelineArea").style.display = "none";

  document.getElementById("tableViewBtn").classList.add("active");
  document.getElementById("pipelineViewBtn").classList.remove("active");
}

function showPipelineView() {
  document.querySelector(".table-wrap").style.display = "none";
  document.getElementById("pipelineArea").style.display = "block";

  document.getElementById("tableViewBtn").classList.remove("active");
  document.getElementById("pipelineViewBtn").classList.add("active");

  renderPipeline(getSelectedGameLeads());
}

function renderPipeline(leads) {
  leads = sortNewestLeadsFirst(leads);  
  const area = document.getElementById("pipelineArea");
  area.innerHTML = "";

  const board = document.createElement("div");
  board.className = "pipeline-board";

  PIPELINE_STAGES.forEach(stage => {
    const stageLeads = leads.filter(lead => {
      const leadStage = lead["Estágio"] || "Novo Lead";
      return leadStage === stage;
    });

    const column = document.createElement("div");
    column.className = "pipeline-column";

    column.innerHTML = `
      <div class="pipeline-column-header">
        <h3>${stage}</h3>
        <span>${stageLeads.length} lead(s)</span>
      </div>

      <div 
        class="pipeline-column-body"
        data-stage="${stage}"
        ondragover="handleDragOver(event)"
        ondragleave="handleDragLeave(event)"
        ondrop="handleDrop(event)"
      >
        ${
          stageLeads.length
            ? stageLeads.map(lead => pipelineCardTemplate(lead)).join("")
            : `<p class="games-empty">Nenhum lead neste estágio.</p>`
        }
      </div>
    `;

    board.appendChild(column);
  });

  area.appendChild(board);
}

function pipelineCardTemplate(lead) {
  const leadJson = JSON.stringify(lead).replace(/"/g, "&quot;");
  const isNewLead = (lead["Estágio"] || "Novo Lead") === "Novo Lead";

  return `
    <div 
      class="pipeline-card" 
      draggable="true"
      data-row="${lead.rowNumber}"
      onclick="openLeadModal(${leadJson})"
      ondragstart="handleDragStart(event)"
      ondragend="handleDragEnd(event)"
    >
      ${isNewLead ? `<span class="new-lead-badge">Novo Lead</span>` : ""}

      <h4>${lead["Nome"] || "Lead sem nome"}</h4>

      <p><strong>Contato:</strong> ${lead["Telefone"] || "-"}</p>
      <p><strong>Pessoas:</strong> ${lead["Pessoas"] || "-"}</p>
      <p><strong>Origem:</strong> ${lead["Origem"] || "-"}</p>
      <p><strong>Valor:</strong> ${lead["Valor Pago"] || "R$ 0,00"}</p>

      <div class="pipeline-tags">
        <span class="pipeline-tag">Respondido: ${lead["Respondido"] || "Não"}</span>
        <span class="pipeline-tag">Reserva: ${lead["Reserva Confirmada"] || "Não"}</span>
        <span class="pipeline-tag">Pagamento: ${lead["Pagamento"] || "Pendente"}</span>
      </div>
    </div>
  `;
}

function showPipelineLoading() {
  document.getElementById("pipelineLoading").classList.add("active");
  document.body.classList.add("is-saving-pipeline");
}

function hidePipelineLoading() {
  document.getElementById("pipelineLoading").classList.remove("active");
  document.body.classList.remove("is-saving-pipeline");
}

function handleDragStart(event) {
  event.stopPropagation();

  const card = event.currentTarget;
  const rowNumber = card.dataset.row;

  event.dataTransfer.setData("text/plain", rowNumber);
  card.classList.add("dragging");
}

function handleDragEnd(event) {
  event.currentTarget.classList.remove("dragging");

  document.querySelectorAll(".pipeline-column-body").forEach(column => {
    column.classList.remove("drag-over");
  });
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

async function handleDrop(event) {
  event.preventDefault();

  const column = event.currentTarget;
  column.classList.remove("drag-over");

  const rowNumber = event.dataTransfer.getData("text/plain");
  const newStage = column.dataset.stage;

  await updateLeadStageFromPipeline(rowNumber, newStage);
}

async function updateLeadStageFromPipeline(rowNumber, newStage) {
  const lead = allLeads.find(l => String(l.rowNumber) === String(rowNumber));

  if (!lead) {
    alert("Lead não encontrado.");
    return;
  }

  if ((lead["Estágio"] || "Novo Lead") === newStage) {
    return;
  }

  showPipelineLoading();

  try {
    const currentGameKey = selectedGameKey;

    const params = new URLSearchParams({
      action: "update",
      rowNumber: rowNumber,
      estagio: newStage,
      respondido: lead["Respondido"] || "Não",
      reservaConfirmada: lead["Reserva Confirmada"] || "Não",
      pagamento: lead["Pagamento"] || "Pendente",
      valorPago: lead["Valor Pago"] || "",
      responsavel: lead["Responsável"] || "",
      anotacoesInternas: lead["Anotações Internas"] || ""
    });

    const url = `${SCRIPT_URL}?${params.toString()}`;

    await jsonp(url);

    await loadLeads();

    selectedGameKey = currentGameKey;

    if (selectedGameKey) {
      populateResponsavelFilter(getSelectedGameLeads());
      applyFilters();
      showPipelineView();
    }
  } catch (error) {
    console.error(error);
    alert("Não foi possível atualizar o estágio do lead. Tente novamente.");
  } finally {
    hidePipelineLoading();
  }
}

function option(value, selected) {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
}

function whatsappLink(phone, nome) {
  const clean = String(phone || "").replace(/\D/g, "");
  const numero = clean.startsWith("55") ? clean : "55" + clean;

  const mensagem = encodeURIComponent(
    `Olá, ${nome || ""}! Tudo bem? Recebemos sua solicitação de reserva para assistir ao jogo no Estação Praça.`
  );

  return `https://wa.me/${numero}?text=${mensagem}`;
}

let currentModalLead = null;

function openLeadModal(lead) {
  currentModalLead = lead;

  document.getElementById("modalLeadName").innerText = lead["Nome"] || "Lead sem nome";
document.getElementById("modalLeadGame").innerText =
  `${lead["Jogo"] || ""} - ${getGameDate(lead)} às ${getGameTime(lead)}`;

document.getElementById("modalDataEnvio").innerText =
  formatDateTime(lead["Data do envio"]);
  document.getElementById("modalTelefone").innerText = lead["Telefone"] || "";
  document.getElementById("modalEmail").innerText = lead["Email"] || "";
  document.getElementById("modalPessoas").innerText = lead["Pessoas"] || "";
  document.getElementById("modalOrigem").innerText = lead["Origem"] || "";
  document.getElementById("modalObs").innerText = lead["Observações"] || "";
  document.getElementById("modalUltimaAtualizacao").innerText =
  formatDateTime(lead["Última Atualização"]);

  document.getElementById("modalEstagio").value = lead["Estágio"] || "Novo Lead";
  document.getElementById("modalRespondido").value = lead["Respondido"] || "Não";
  document.getElementById("modalReserva").value = lead["Reserva Confirmada"] || "Não";
  document.getElementById("modalPagamento").value = lead["Pagamento"] || "Pendente";
  document.getElementById("modalValor").value = lead["Valor Pago"] || "";
  document.getElementById("modalResponsavel").value = lead["Responsável"] || "";
  document.getElementById("modalAnotacoes").value = lead["Anotações Internas"] || "";

  document.getElementById("modalWhatsapp").href =
    whatsappLink(lead["Telefone"], lead["Nome"]);

  document.getElementById("leadModal").style.display = "block";
}

function closeLeadModal() {
  document.getElementById("leadModal").style.display = "none";
  currentModalLead = null;
}

async function saveLeadFromModal() {
  if (!currentModalLead) return;

  const rowNumber = currentModalLead.rowNumber;
  const currentGameKey = selectedGameKey;

  const params = new URLSearchParams({
    action: "update",
    rowNumber: rowNumber,
    estagio: document.getElementById("modalEstagio").value,
    respondido: document.getElementById("modalRespondido").value,
    reservaConfirmada: document.getElementById("modalReserva").value,
    pagamento: document.getElementById("modalPagamento").value,
    valorPago: document.getElementById("modalValor").value,
    responsavel: document.getElementById("modalResponsavel").value,
    anotacoesInternas: document.getElementById("modalAnotacoes").value
  });

  const url = `${SCRIPT_URL}?${params.toString()}`;

  await jsonp(url);

  alert("Lead atualizado com sucesso.");

  closeLeadModal();

  await loadLeads();

  selectedGameKey = currentGameKey;

  if (selectedGameKey) {
    populateResponsavelFilter(getSelectedGameLeads());
    applyFilters();
  }
}

async function saveLead(rowNumber) {
  const currentGameKey = selectedGameKey;

  const params = new URLSearchParams({
    action: "update",
    rowNumber: rowNumber,
    estagio: document.getElementById(`estagio-${rowNumber}`).value,
    respondido: document.getElementById(`respondido-${rowNumber}`).value,
    reservaConfirmada: document.getElementById(`reserva-${rowNumber}`).value,
    pagamento: document.getElementById(`pagamento-${rowNumber}`).value,
    valorPago: document.getElementById(`valor-${rowNumber}`).value,
    responsavel: document.getElementById(`responsavel-${rowNumber}`).value,
    anotacoesInternas: document.getElementById(`anotacoes-${rowNumber}`).value
  });

  const url = `${SCRIPT_URL}?${params.toString()}`;

  await jsonp(url);

  alert("Lead atualizado com sucesso.");

  await loadLeads();

  selectedGameKey = currentGameKey;

  if (selectedGameKey) {
    populateResponsavelFilter(getSelectedGameLeads());
    applyFilters();
  }
}

const ADMIN_PASSWORD = "EstacaoCopa2026";

function checkPassword() {
  const password = document.getElementById("adminPassword").value;

  if (password === ADMIN_PASSWORD) {
  localStorage.setItem("adminAccess", "true");
  document.getElementById("loginOverlay").style.display = "none";

  loadLeads();
  startAutoRefreshLeads();
}
}

document.getElementById("adminPassword").addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    checkPassword();
  }
});

if (localStorage.getItem("adminAccess") === "true") {
  document.getElementById("loginOverlay").style.display = "none";

  loadLeads();
  startAutoRefreshLeads();
}

function exportLeadsCSV() {
  const leads = getFilteredLeads();

  if (!leads.length) {
    alert("Nenhum lead encontrado para exportação.");
    return;
  }

  const headers = [
    "Data do envio",
    "Jogo",
    "Data do Jogo",
    "Horário do Jogo",
    "Nome",
    "Telefone",
    "Email",
    "Pessoas",
    "Origem",
    "Observações",
    "Estágio",
    "Respondido",
    "Reserva Confirmada",
    "Pagamento",
    "Valor Pago",
    "Responsável",
    "Anotações Internas",
    "Última Atualização"
  ];

  const rows = leads.map(lead => [
    lead["Data do envio"] || "",
    lead["Jogo"] || "",
    lead["Data do Jogo"] || "",
    lead["Horário do Jogo"] || "",
    lead["Nome"] || "",
    lead["Telefone"] || "",
    lead["Email"] || "",
    lead["Pessoas"] || "",
    lead["Origem"] || "",
    lead["Observações"] || "",
    lead["Estágio"] || "",
    lead["Respondido"] || "",
    lead["Reserva Confirmada"] || "",
    lead["Pagamento"] || "",
    lead["Valor Pago"] || "",
    lead["Responsável"] || "",
    lead["Anotações Internas"] || "",
    lead["Última Atualização"] || ""
  ]);

  const csvContent = [
    headers,
    ...rows
  ]
    .map(row =>
      row
        .map(field => `"${String(field).replace(/"/g, '""')}"`)
        .join(";")
    )
    .join("\n");

  const blob = new Blob(
    ["\uFEFF" + csvContent],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  const gameName =
    selectedGameKey
      .replace(/[^\w\s]/gi, "")
      .replace(/\s+/g, "_");

  link.href = url;
  link.download = `leads_${gameName}.csv`;

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function getConfirmedPeopleCount(leads) {
  return leads
    .filter(lead => lead["Reserva Confirmada"] === "Sim")
    .reduce((total, lead) => {
      return total + Number(lead["Pessoas"] || 0);
    }, 0);
}