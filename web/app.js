// KendaliAI WebUI Client - LibreChat Inspired Architecture

let ws = null;
let currentSessionId = null;
let currentAgent = null;
let agentsCache = [];
let sessionsCache = [];
let isGenerating = false;

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadAgents();
  await loadSessions();
  setupWebSocket();

  // If no sessions, create one
  if (sessionsCache.length === 0) {
    await createNewChat();
  } else {
    selectSession(sessionsCache[0].id);
  }
});

// --- Theme Management ---

function initTheme() {
  const savedTheme = localStorage.getItem('kendali_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerText = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerText = '🌙';
  }
}

function toggleTheme() {
  const isLight = document.body.classList.contains('light-theme');
  const btn = document.getElementById('theme-toggle-btn');
  if (isLight) {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('kendali_theme', 'dark');
    if (btn) btn.innerText = '🌙';
  } else {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('kendali_theme', 'light');
    if (btn) btn.innerText = '☀️';
  }
}

// --- WebSocket Gateway ---

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('✅ Connected to KendaliAI Event Gateway via WebSocket');
    if (currentSessionId) {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: currentSessionId }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleIncomingEvent(data);
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  };

  ws.onclose = () => {
    console.warn('⚠️ WebSocket disconnected. Reconnecting in 2s...');
    setTimeout(setupWebSocket, 2000);
  };
}

function handleIncomingEvent(ev) {
  const thinkingRow = document.getElementById('agent-thinking-row');
  const thinkingStatus = document.getElementById('thinking-status-text');

  switch (ev.type) {
    case 'agent.started':
    case 'agent.thinking':
      if (thinkingRow) {
        thinkingRow.style.display = 'flex';
        if (thinkingStatus) thinkingStatus.innerText = 'Thinking...';
      }
      scrollToBottom();
      break;

    case 'agent.tool_call':
      if (thinkingRow) {
        thinkingRow.style.display = 'flex';
        if (thinkingStatus) {
          const tool = ev.payload ? ev.payload.tool : 'tool';
          thinkingStatus.innerText = `Executing ${tool}...`;
        }
      }
      if (ev.payload) {
        appendToolCard({
          id: ev.payload.id || 'tc-' + Date.now(),
          tool: ev.payload.tool,
          arguments: ev.payload.arguments,
          status: 'running',
          output: 'Executing capability in workspace...'
        });
      }
      scrollToBottom();
      break;

    case 'agent.tool_result':
      if (ev.payload) {
        updateToolCard(ev.payload);
      }
      scrollToBottom();
      break;

    case 'agent.completed':
      if (thinkingRow) thinkingRow.style.display = 'none';
      isGenerating = false;
      if (ev.payload) {
        appendAssistantMessage(ev.payload.content, ev.payload.toolCalls);
      }
      loadSessions(); // refresh updated timestamp
      scrollToBottom();
      break;

    case 'agent.failed':
      if (thinkingRow) thinkingRow.style.display = 'none';
      isGenerating = false;
      appendAssistantMessage(`❌ Error: ${ev.payload || 'An execution error occurred.'}`, []);
      scrollToBottom();
      break;
  }
}

// --- Agents & Personas ---

async function loadAgents() {
  try {
    const res = await fetch('/api/agents');
    agentsCache = await res.json();
    if (agentsCache && agentsCache.length > 0) {
      currentAgent = agentsCache[0];
      updateAgentUI(currentAgent);
    }
  } catch (e) {
    console.error('Failed to load agents:', e);
  }
}

function updateAgentUI(agent) {
  if (!agent) return;
  document.getElementById('sidebar-agent-icon').innerText = agent.avatar || '🤖';
  document.getElementById('sidebar-agent-name').innerText = agent.name;
  document.getElementById('topbar-agent-icon').innerText = agent.avatar || '🤖';
  document.getElementById('topbar-agent-title').innerText = agent.name;
  document.getElementById('topbar-model-tag').innerText = agent.model || 'default';
  document.getElementById('zero-agent-title').innerText = agent.name;
  document.getElementById('zero-agent-desc').innerText = agent.description || 'Personal AI Agent Persona';
  document.getElementById('thinking-agent-name').innerText = agent.name;
}

// --- Sessions Management ---

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    sessionsCache = await res.json();
    renderSidebarSessions(sessionsCache);
  } catch (e) {
    console.error('Failed to load sessions:', e);
  }
}

function renderSidebarSessions(sessions) {
  const container = document.getElementById('chats-list-container');
  if (!container) return;
  container.innerHTML = '';

  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<div style="padding: 8px 10px; font-size: 12px; color: var(--text-muted);">No active sessions</div>';
    return;
  }

  // Grouping: Pinned, Today, Earlier
  const pinned = sessions.filter(s => s.pinned);
  const others = sessions.filter(s => !s.pinned);

  if (pinned.length > 0) {
    const pGroup = document.createElement('div');
    pGroup.className = 'chat-group-label';
    pGroup.innerText = 'Pinned';
    container.appendChild(pGroup);
    pinned.forEach(s => container.appendChild(createSessionElement(s)));
  }

  if (others.length > 0) {
    const oGroup = document.createElement('div');
    oGroup.className = 'chat-group-label';
    oGroup.innerText = 'Recent';
    container.appendChild(oGroup);
    others.forEach(s => container.appendChild(createSessionElement(s)));
  }
}

function createSessionElement(s) {
  const el = document.createElement('div');
  el.className = `chat-item ${s.id === currentSessionId ? 'active' : ''}`;
  el.onclick = () => selectSession(s.id);

  const channelIcon = s.channelId === 'telegram' ? '📱' : '💬';

  el.innerHTML = `
    <span style="margin-right: 6px;">${channelIcon}</span>
    <span class="chat-item-title">${escapeHtml(s.title || 'Chat')}</span>
    <div class="chat-item-actions">
      <button class="chat-action-btn" title="Delete" onclick="deleteSession(event, '${s.id}')">🗑️</button>
    </div>
  `;
  return el;
}

async function createNewChat() {
  const agentId = currentAgent ? currentAgent.id : 'engineer';
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: agentId,
      title: 'New Chat',
      channelId: 'web'
    })
  });
  const newSess = await res.json();
  await loadSessions();
  selectSession(newSess.id);
}

async function selectSession(sessionId) {
  currentSessionId = sessionId;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));

  // Subscribe via WS
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: currentSessionId }));
  }

  // Load session messages
  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    const data = await res.json();
    if (data.session && data.session.agentId) {
      const matchedAgent = agentsCache.find(a => a.id === data.session.agentId);
      if (matchedAgent) {
        currentAgent = matchedAgent;
        updateAgentUI(currentAgent);
      }
    }
    renderMessages(data.messages || []);
  } catch (e) {
    console.error('Failed to load session messages:', e);
  }

  // Update active pill in sidebar
  const items = document.querySelectorAll('.chat-item');
  items.forEach(it => {
    if (it.innerText.includes(sessionId)) it.classList.add('active');
  });
}

async function clearCurrentSession() {
  if (!currentSessionId) return;
  if (!confirm('Clear all messages in this session?')) return;
  await fetch(`/api/sessions/${currentSessionId}/clear`, { method: 'POST' });
  renderMessages([]);
}

async function deleteSession(event, sessionId) {
  event.stopPropagation();
  if (!confirm('Delete this session?')) return;
  await fetch(`/api/sessions?id=${sessionId}`, { method: 'DELETE' });
  await loadSessions();
  if (currentSessionId === sessionId) {
    if (sessionsCache.length > 0) {
      selectSession(sessionsCache[0].id);
    } else {
      createNewChat();
    }
  }
}

// --- Messages & Chat Rendering ---

function renderMessages(messages) {
  const container = document.getElementById('chat-messages');
  const zeroState = document.getElementById('zero-state');
  if (!container) return;

  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    if (zeroState) zeroState.style.display = 'flex';
    return;
  }

  if (zeroState) zeroState.style.display = 'none';

  messages.forEach(m => {
    if (m.role === 'user') {
      appendUserMessage(m.content);
    } else if (m.role === 'assistant') {
      appendAssistantMessage(m.content, m.toolCalls);
    }
  });

  scrollToBottom();
}

function appendUserMessage(content) {
  const container = document.getElementById('chat-messages');
  const zeroState = document.getElementById('zero-state');
  if (zeroState) zeroState.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="message-avatar">LI</div>
    <div class="message-body">
      <div class="message-author">You</div>
      <div class="message-content">${escapeHtml(content)}</div>
    </div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

function appendAssistantMessage(content, toolCalls) {
  const container = document.getElementById('chat-messages');
  const zeroState = document.getElementById('zero-state');
  if (zeroState) zeroState.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'message-row assistant';

  let toolCardsHtml = '';
  if (toolCalls && toolCalls.length > 0) {
    toolCalls.forEach(tc => {
      toolCardsHtml += renderToolCardHtml(tc);
    });
  }

  const avatar = currentAgent ? (currentAgent.avatar || '🤖') : '🪶';
  const name = currentAgent ? currentAgent.name : 'KendaliAI';

  row.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-author">${escapeHtml(name)}</div>
      ${toolCardsHtml}
      <div class="message-content">${formatMarkdown(content)}</div>
    </div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

function renderToolCardHtml(tc) {
  const statusClass = tc.status || 'success';
  const duration = tc.durationMs ? `${tc.durationMs}ms` : '';
  const argsStr = tc.arguments ? JSON.stringify(tc.arguments, null, 2) : '{}';

  return `
    <div class="tool-card" id="tool-card-${tc.id || 'tc'}">
      <div class="tool-card-header" onclick="toggleToolCard(this)">
        <div class="tool-card-info">
          <span>⚙️</span>
          <span>${escapeHtml(tc.tool || 'capability')}</span>
          <span style="color: var(--text-muted); font-size: 11px;">${duration}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="tool-card-status ${statusClass}">${statusClass.toUpperCase()}</span>
          <span style="font-size: 10px; color: var(--text-muted);">▼</span>
        </div>
      </div>
      <div class="tool-card-content" style="display: none;">
<strong>Arguments:</strong>
${escapeHtml(argsStr)}

<strong>Result:</strong>
${escapeHtml(tc.output || 'No output recorded.')}
      </div>
    </div>
  `;
}

function appendToolCard(tc) {
  const container = document.getElementById('chat-messages');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderToolCardHtml(tc);
  container.appendChild(tempDiv.firstElementChild);
  scrollToBottom();
}

function updateToolCard(tc) {
  const card = document.getElementById(`tool-card-${tc.id}`);
  if (card) {
    const statusBadge = card.querySelector('.tool-card-status');
    if (statusBadge) {
      statusBadge.className = `tool-card-status ${tc.status}`;
      statusBadge.innerText = (tc.status || 'success').toUpperCase();
    }
    const contentBox = card.querySelector('.tool-card-content');
    if (contentBox) {
      contentBox.innerHTML = `<strong>Output:</strong>\n${escapeHtml(tc.output || '')}`;
    }
  }
}

function toggleToolCard(headerEl) {
  const content = headerEl.nextElementSibling;
  if (content.style.display === 'none') {
    content.style.display = 'block';
  } else {
    content.style.display = 'none';
  }
}

// --- Send Message Interaction ---

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || isGenerating) return;

  if (!currentSessionId) {
    createNewChat().then(() => doSend(text));
  } else {
    doSend(text);
  }

  input.value = '';
  input.style.height = '24px';
}

function doSend(text) {
  isGenerating = true;
  appendUserMessage(text);

  const thinkingRow = document.getElementById('agent-thinking-row');
  if (thinkingRow) {
    thinkingRow.style.display = 'flex';
    document.getElementById('thinking-status-text').innerText = 'Thinking...';
  }

  const agentId = currentAgent ? currentAgent.id : 'engineer';

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'message.send',
      sessionId: currentSessionId,
      agentId: agentId,
      content: text
    }));
  } else {
    // REST API fallback
    fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        agentId: agentId,
        messages: [{ role: 'user', content: text }]
      })
    })
    .then(r => r.json())
    .then(data => {
      if (thinkingRow) thinkingRow.style.display = 'none';
      isGenerating = false;
      if (data.choices && data.choices.length > 0) {
        appendAssistantMessage(data.choices[0].message.content, []);
      }
    })
    .catch(err => {
      if (thinkingRow) thinkingRow.style.display = 'none';
      isGenerating = false;
      appendAssistantMessage('Error: ' + err.message, []);
    });
  }
}

function handleInputKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function usePromptSuggestion(prompt) {
  const input = document.getElementById('chat-input');
  input.value = prompt;
  sendMessage();
}

function scrollToBottom() {
  const area = document.getElementById('messages-scroll-area');
  if (area) {
    area.scrollTop = area.scrollHeight;
  }
}

// --- Modals Routing & Config Handlers ---

function openModal(name) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  const modal = document.getElementById(`modal-${name}`);
  if (modal) {
    modal.classList.add('open');
    if (name === 'providers') loadProviders();
    if (name === 'agents') loadAgentsConfig();
    if (name === 'mcps') loadMCPs();
    if (name === 'skills') loadSkills();
    if (name === 'tools') loadToolsAndPolicies();
    if (name === 'telegram') loadTelegramBots();
    if (name === 'sessions') loadSessionsModal();
  }
}

function closeModal(name) {
  const modal = document.getElementById(`modal-${name}`);
  if (modal) modal.classList.remove('open');
}

// 1. Providers Handler
async function loadProviders() {
  const res = await fetch('/api/providers');
  const list = await res.json();
  const container = document.getElementById('providers-list');
  container.innerHTML = '';

  list.forEach(p => {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.innerHTML = `
      <div class="config-card-header">
        <div class="config-card-title">
          <span>⚡</span>
          <span>${escapeHtml(p.name)}</span>
          <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(${p.type})</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${p.isDefault ? '<span class="config-badge default">DEFAULT</span>' : ''}
          ${p.enabled ? '<span class="config-badge active">ENABLED</span>' : '<span class="config-badge" style="background:#444;color:#aaa;">DISABLED</span>'}
          <button class="btn-danger" onclick="deleteProvider('${p.id}')">Delete</button>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">
        Endpoint: <code>${escapeHtml(p.endpoint || 'default')}</code> | Models: <code>${escapeHtml((p.models || []).join(', '))}</code>
      </div>
    `;
    container.appendChild(card);
  });
}

async function saveProviderForm() {
  const name = document.getElementById('p-name').value.trim();
  const type = document.getElementById('p-type').value;
  const apiKey = document.getElementById('p-key').value.trim();
  const endpoint = document.getElementById('p-endpoint').value.trim();
  const modelsStr = document.getElementById('p-models').value.trim();

  if (!name) return alert('Provider name is required');
  const models = modelsStr.split(',').map(m => m.trim()).filter(Boolean);

  await fetch('/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, type, apiKey, endpoint, models, enabled: true
    })
  });

  alert('Provider saved successfully!');
  loadProviders();
}

async function testProviderForm() {
  const name = document.getElementById('p-name').value.trim() || 'Test';
  const type = document.getElementById('p-type').value;
  const apiKey = document.getElementById('p-key').value.trim();
  const endpoint = document.getElementById('p-endpoint').value.trim();
  const modelsStr = document.getElementById('p-models').value.trim();
  const models = modelsStr.split(',').map(m => m.trim()).filter(Boolean);

  const res = await fetch('/api/providers/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type, apiKey, endpoint, models })
  });
  const data = await res.json();
  alert(data.message || 'Connection tested successfully.');
}

async function deleteProvider(id) {
  if (!confirm('Delete provider?')) return;
  await fetch(`/api/providers?id=${id}`, { method: 'DELETE' });
  loadProviders();
}

// 2. Agents Handler
async function loadAgentsConfig() {
  await loadAgents();
  const container = document.getElementById('agents-cards-grid');
  container.innerHTML = '';

  agentsCache.forEach(a => {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.style.cursor = 'pointer';
    card.onclick = () => selectAgentForChat(a);

    card.innerHTML = `
      <div class="config-card-header">
        <div class="config-card-title">
          <span style="font-size: 20px;">${a.avatar || '🤖'}</span>
          <span>${escapeHtml(a.name)}</span>
        </div>
        ${a.isDefault ? '<span class="config-badge default">DEFAULT</span>' : ''}
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(a.description || '')}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        Model: <code>${escapeHtml(a.model || '')}</code> | Tools: <code>${(a.tools || []).length}</code>
      </div>
      <div style="margin-top: 8px; display: flex; gap: 6px;">
        <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="event.stopPropagation(); populateAgentForm('${a.id}')">Edit</button>
        <button class="btn-danger" style="font-size: 11px; padding: 4px 8px;" onclick="event.stopPropagation(); deleteAgent('${a.id}')">Delete</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function selectAgentForChat(a) {
  currentAgent = a;
  updateAgentUI(a);
  if (currentSessionId) {
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentSessionId, agentId: a.id, title: 'Chat with ' + a.name })
    });
  }
  closeModal('agents');
}

function populateAgentForm(agentId) {
  const a = agentsCache.find(x => x.id === agentId);
  if (!a) return;
  document.getElementById('a-id').value = a.id;
  document.getElementById('a-name').value = a.name;
  document.getElementById('a-avatar').value = a.avatar || '🤖';
  document.getElementById('a-model').value = a.model || '';
  document.getElementById('a-desc').value = a.description || '';
  document.getElementById('a-prompt').value = a.systemPrompt || '';
  document.getElementById('a-tools').value = (a.tools || []).join(', ');
  document.getElementById('a-skills').value = (a.skills || []).join(', ');
}

async function saveAgentForm() {
  const id = document.getElementById('a-id').value.trim();
  const name = document.getElementById('a-name').value.trim();
  const avatar = document.getElementById('a-avatar').value.trim() || '🤖';
  const model = document.getElementById('a-model').value.trim();
  const description = document.getElementById('a-desc').value.trim();
  const systemPrompt = document.getElementById('a-prompt').value.trim();
  const tools = document.getElementById('a-tools').value.split(',').map(t => t.trim()).filter(Boolean);
  const skills = document.getElementById('a-skills').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!name) return alert('Agent Name is required');

  await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id, name, avatar, model, description, systemPrompt, tools, skills
    })
  });

  alert('Agent Manifest saved!');
  loadAgentsConfig();
}

async function deleteAgent(id) {
  if (!confirm('Delete agent?')) return;
  await fetch(`/api/agents?id=${id}`, { method: 'DELETE' });
  loadAgentsConfig();
}

// 3. MCP Servers Handler
async function loadMCPs() {
  const res = await fetch('/api/mcps');
  const list = await res.json();
  const container = document.getElementById('mcps-list');
  container.innerHTML = '';

  list.forEach(m => {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.innerHTML = `
      <div class="config-card-header">
        <div class="config-card-title">
          <span>🔌</span>
          <span>${escapeHtml(m.name)}</span>
          <span style="font-size: 11px; color: var(--text-muted);">(${m.transport})</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="config-badge active">${m.status.toUpperCase()}</span>
          <button class="btn-danger" onclick="deleteMCP('${m.id}')">Delete</button>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">
        Command: <code>${escapeHtml(m.command || '')} ${(m.args || []).join(' ')}</code>
      </div>
    `;
    container.appendChild(card);
  });
}

async function saveMCPForm() {
  const name = document.getElementById('mcp-name').value.trim();
  const transport = document.getElementById('mcp-transport').value;
  const command = document.getElementById('mcp-command').value.trim();
  const args = document.getElementById('mcp-args').value.split(' ').map(a => a.trim()).filter(Boolean);
  const url = document.getElementById('mcp-url').value.trim();

  if (!name) return alert('MCP Server name is required');

  await fetch('/api/mcps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, transport, command, args, url, enabled: true
    })
  });

  alert('MCP Server registered!');
  loadMCPs();
}

async function deleteMCP(id) {
  if (!confirm('Delete MCP server?')) return;
  await fetch(`/api/mcps?id=${id}`, { method: 'DELETE' });
  loadMCPs();
}

// 4. Skills Library Handler
async function loadSkills() {
  const res = await fetch('/api/skills');
  const list = await res.json();
  const container = document.getElementById('skills-list-grid');
  container.innerHTML = '';

  list.forEach(sk => {
    const card = document.createElement('div');
    card.className = 'config-card';
    card.innerHTML = `
      <div class="config-card-header">
        <div class="config-card-title">
          <span>🧠</span>
          <span>${escapeHtml(sk.name)}</span>
        </div>
        <button class="btn-secondary" style="font-size: 11px; padding: 4px 8px;" onclick="editSkillContent('${sk.id}')">Edit</button>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(sk.description || '')}</div>
    `;
    container.appendChild(card);
  });
}

async function editSkillContent(id) {
  const res = await fetch(`/api/skills?id=${id}`);
  const data = await res.json();
  document.getElementById('sk-id').value = data.id;
  document.getElementById('sk-content').value = data.content || '';
  document.getElementById('skill-editor-title').innerText = `✏️ Edit Skill: ${id}`;
}

async function saveSkillForm() {
  const id = document.getElementById('sk-id').value.trim();
  const content = document.getElementById('sk-content').value;

  if (!id) return alert('Skill ID is required');

  await fetch('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name: id, content })
  });

  alert('Skill guidelines saved!');
  loadSkills();
}

// 5. Tools & Policies Handler
async function loadToolsAndPolicies() {
  const agentId = document.getElementById('policy-agent-select').value;
  const [toolsRes, polRes] = await Promise.all([
    fetch('/api/tools'),
    fetch(`/api/policies?agentId=${agentId}`)
  ]);

  const tools = await toolsRes.json();
  const policies = await polRes.json();
  const polMap = {};
  policies.forEach(p => polMap[p.toolName] = p.effect);

  const tbody = document.getElementById('tools-table-body');
  tbody.innerHTML = '';

  tools.forEach(t => {
    const currentEffect = polMap[t.name] || 'ALLOW';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">⚙️ ${escapeHtml(t.name)}</td>
      <td><span class="config-badge" style="background:#333;color:#ccc;">${escapeHtml(t.category)}</span></td>
      <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${escapeHtml(t.signature)}</td>
      <td>
        <select class="form-select" style="padding: 4px 8px; font-size: 12px;" onchange="updateToolPolicy('${agentId}', '${t.name}', this.value)">
          <option value="ALLOW" ${currentEffect === 'ALLOW' ? 'selected' : ''}>ALLOW</option>
          <option value="APPROVAL" ${currentEffect === 'APPROVAL' ? 'selected' : ''}>APPROVAL</option>
          <option value="DENY" ${currentEffect === 'DENY' ? 'selected' : ''}>DENY</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateToolPolicy(agentId, toolName, effect) {
  await fetch('/api/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, toolName, effect })
  });
}

// 6. Telegram Bots Handler
async function loadTelegramBots() {
  const res = await fetch('/api/telegram/bots');
  const list = await res.json();
  const container = document.getElementById('telegram-bots-list');
  container.innerHTML = '';

  list.forEach(b => {
    const isRunning = b.status === 'running';
    const card = document.createElement('div');
    card.className = 'config-card';
    card.innerHTML = `
      <div class="config-card-header">
        <div class="config-card-title">
          <span>📱</span>
          <span>${escapeHtml(b.name)}</span>
          <span style="font-size: 12px; color: var(--text-muted);">→ Agent: <code>${b.agentId}</code></span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="config-badge ${isRunning ? 'active' : ''}">${b.status.toUpperCase()}</span>
          ${isRunning 
            ? `<button class="btn-secondary" style="font-size: 11px;" onclick="toggleBot('${b.id}', 'stop')">Stop</button>`
            : `<button class="btn-primary" style="font-size: 11px;" onclick="toggleBot('${b.id}', 'start')">Start</button>`
          }
          <button class="btn-danger" onclick="deleteTelegramBot('${b.id}')">Delete</button>
        </div>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary);">
        Token: <code>••••••••${b.token.slice(-6)}</code>
      </div>
    `;
    container.appendChild(card);
  });
}

async function saveTelegramBotForm() {
  const name = document.getElementById('tg-name').value.trim();
  const token = document.getElementById('tg-token').value.trim();
  const agentId = document.getElementById('tg-agent-select').value;
  const enabled = document.getElementById('tg-enabled').checked;

  if (!name || !token) return alert('Name and Bot Token are required');

  await fetch('/api/telegram/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, token, agentId, enabled })
  });

  alert('Telegram Bot configured and registered!');
  loadTelegramBots();
}

async function toggleBot(id, action) {
  await fetch(`/api/telegram/bots/${id}/${action}`, { method: 'POST' });
  loadTelegramBots();
}

async function deleteTelegramBot(id) {
  if (!confirm('Delete this Telegram bot?')) return;
  await fetch(`/api/telegram/bots?id=${id}`, { method: 'DELETE' });
  loadTelegramBots();
}

// 7. Sessions Modal Handler
async function loadSessionsModal() {
  const res = await fetch('/api/sessions');
  const list = await res.json();
  const tbody = document.getElementById('sessions-table-body');
  tbody.innerHTML = '';

  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${escapeHtml(s.title || 'Untitled')}</td>
      <td><code>${s.agentId}</code></td>
      <td><span class="config-badge" style="background:#222;color:#eee;">${s.channelId}</span></td>
      <td style="font-size: 11px; color: var(--text-muted);">${new Date(s.updatedAt * 1000).toLocaleString()}</td>
      <td style="display: flex; gap: 6px;">
        <button class="btn-secondary" style="font-size: 11px; padding: 3px 6px;" onclick="selectSession('${s.id}'); closeModal('sessions');">Open</button>
        <button class="btn-danger" style="font-size: 11px; padding: 3px 6px;" onclick="deleteSession(event, '${s.id}'); loadSessionsModal();">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Helper Functions ---

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Triple backticks code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Single backticks inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Newlines
  html = html.replace(/\n/g, '<br>');

  return html;
}
