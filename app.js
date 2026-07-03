const selectors = {
  toggle: document.querySelector('#chat-toggle'),
  panel: document.querySelector('#chat-panel'),
  close: document.querySelector('#chat-close'),
  status: document.querySelector('#chat-status'),
  auth: document.querySelector('#chat-auth'),
  session: document.querySelector('#chat-session'),
  loginForm: document.querySelector('#login-form'),
  loginEmail: document.querySelector('#login-email'),
  loginPassword: document.querySelector('#login-password'),
  loginSubmit: document.querySelector('#login-submit'),
  form: document.querySelector('#chat-form'),
  input: document.querySelector('#chat-input'),
  submit: document.querySelector('#chat-submit'),
  messages: document.querySelector('#chat-messages'),
};

const chatEndpoint = document.body?.dataset.chatEndpoint?.trim() || '';
const historyEndpoint = document.body?.dataset.historyEndpoint?.trim() || '';
const socioId = document.body?.dataset.socioId?.trim() || '';
const maxInputHeight = 144;
const maxResponsePreviewLength = 800;
const maxSearchIterations = 500;
const requestTimeoutMs = 15000;

const state = {
  session: null,
};

const chatApi = createChatApiClient({
  endpoint: chatEndpoint,
  historyEndpoint,
  headers: {
    'Content-Type': 'application/json',
  },
});

selectors.toggle?.addEventListener('click', () => {
  const shouldOpen = !selectors.panel?.classList.contains('is-open');
  setPanelState(shouldOpen);
});

selectors.close?.addEventListener('click', () => setPanelState(false));
document.addEventListener('keydown', handleKeyDown);
selectors.loginForm?.addEventListener('submit', handleLoginSubmit);
document.querySelectorAll('.js-placeholder-link').forEach((link) => {
  link.addEventListener('click', (event) => event.preventDefault());
});
selectors.input?.addEventListener('input', autoResizeTextArea);
selectors.form?.addEventListener('submit', handleMessageSubmit);

function setPanelState(isOpen) {
  if (!selectors.panel || !selectors.toggle) {
    return;
  }

  selectors.panel.classList.toggle('is-open', isOpen);
  selectors.panel.setAttribute('aria-hidden', String(!isOpen));
  selectors.toggle.setAttribute('aria-expanded', String(isOpen));
  selectors.toggle.setAttribute('aria-label', isOpen ? 'Cerrar chat' : 'Abrir chat');

  if (!isOpen) {
    return;
  }

  if (state.session) {
    selectors.input?.focus();
    return;
  }

  selectors.loginEmail?.focus();
}

function handleKeyDown(event) {
  if (event.key === 'Escape' && selectors.panel?.classList.contains('is-open')) {
    setPanelState(false);
    selectors.toggle?.focus();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (!selectors.loginEmail || !selectors.loginPassword) {
    return;
  }

  const credentials = {
    email: selectors.loginEmail.value.trim(),
    contrasena: selectors.loginPassword.value,
  };

  if (!credentials.email || !credentials.contrasena) {
    return;
  }

  toggleLoginLoading(true);

  try {
    const response = await chatApi.login({
      op: 'logindeusuario',
      socioId,
      email: credentials.email,
      contrasena: credentials.contrasena,
    });

    state.session = createSessionFromLogin(response, credentials);

    if (selectors.status) {
      selectors.status.textContent = `En línea · ${state.session.nombre}`;
    }

    if (selectors.auth) {
      selectors.auth.hidden = true;
    }

    if (selectors.session) {
      selectors.session.hidden = false;
    }

    selectors.messages?.replaceChildren();
    selectors.input?.focus();

    await loadHistory(state.session.clienteId);
  } catch (error) {
    appendMessage({
      role: 'system',
      content: getErrorMessage(error),
    });
    if (selectors.auth) {
      selectors.auth.hidden = false;
    }
    if (selectors.session) {
      selectors.session.hidden = true;
    }
  } finally {
    toggleLoginLoading(false);
  }
}

async function loadHistory(clienteId) {
  try {
    const data = await chatApi.fetchHistory({ op: 'buscarhistorialid', socioId, clienteId });
    const mensajes = Array.isArray(data?.mensajes) ? data.mensajes : [];

    if (mensajes.length === 0) {
      appendMessage({ role: 'system', content: 'No hay mensajes anteriores.' });
      return;
    }

    const sorted = [...mensajes].sort((a, b) => (a.fecha || 0) - (b.fecha || 0));

    for (const msg of sorted) {
      const sender = typeof msg.sender === 'string' ? msg.sender : '';
      const role = sender === 'CLIENTE' ? 'user' : 'assistant';
      appendMessage({
        role,
        content: msg.mensaje || '',
        timestamp: msg.fecha,
      });
    }
  } catch (error) {
    appendMessage({ role: 'system', content: 'No se pudo cargar el historial.' });
  }
}

async function handleMessageSubmit(event) {
  event.preventDefault();

  if (!selectors.input || !selectors.submit || !state.session) {
    return;
  }

  const mensaje = selectors.input.value.trim();
  if (!mensaje) {
    return;
  }

  appendMessage({ role: 'user', content: mensaje });
  selectors.input.value = '';
  autoResizeTextArea();
  toggleMessageLoading(true);

  try {
    const response = await chatApi.sendMessage({
      socioId,
      clienteId: state.session.clienteId,
      nombre: state.session.nombre,
      mensaje,
      sender: 'CLIENTE',
    });

    const reply = findFirstStringByKeys(response, [
      'respuesta',
      'reply',
      'message',
      'mensaje',
      'detalle',
      'detail',
    ]);

    if (reply) {
      appendMessage({ role: 'assistant', content: reply });
    }
  } catch (error) {
    appendMessage({
      role: 'system',
      content: getErrorMessage(error),
    });
  } finally {
    toggleMessageLoading(false);
  }
}

function createSessionFromLogin(response, credentials) {
  const clienteId = findFirstStringByKeys(response, ['clienteId', 'cliente_id', 'clientId']);

  if (!clienteId) {
    throw new Error(
      `El login respondió sin clienteId. Respuesta recibida: ${createResponsePreview(response)}`,
    );
  }

  const nombre =
    findFirstStringByKeys(response, ['nombre', 'name', 'clienteNombre']) || credentials.email;

  return {
    clienteId,
    nombre,
    email: credentials.email,
  };
}

function formatTimestamp(unixSeconds) {
  if (typeof unixSeconds !== 'number' || unixSeconds <= 0 || !Number.isFinite(unixSeconds)) {
    return '';
  }

  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return time;
  }

  const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return `${dateStr} ${time}`;
}

function findFirstStringByKeys(value, keys) {
  const queue = [value];
  let iterations = 0;
  let currentIndex = 0;

  while (currentIndex < Math.min(queue.length, maxSearchIterations)) {
    iterations += 1;
    const current = queue[currentIndex];
    currentIndex += 1;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [entryKey, entryValue] of Object.entries(current)) {
      if (keys.includes(entryKey) && typeof entryValue === 'string' && entryValue.trim()) {
        return entryValue.trim();
      }

      if (entryValue && typeof entryValue === 'object') {
        queue.push(entryValue);
      }
    }
  }

  return '';
}

function createResponsePreview(response) {
  const preview = JSON.stringify(response);

  if (!preview) {
    return 'sin contenido';
  }

  return preview.length <= maxResponsePreviewLength
    ? preview
    : `${preview.slice(0, maxResponsePreviewLength)}…`;
}

function appendMessage({ role, content, timestamp }) {
  if (!selectors.messages) {
    return;
  }

  const article = document.createElement('article');
  article.className = `message message--${role}`;

  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  article.append(paragraph);

  if (timestamp) {
    const time = document.createElement('time');
    time.className = 'message__time';
    time.textContent = formatTimestamp(timestamp);
    article.append(time);
  }

  selectors.messages.append(article);
  selectors.messages.scrollTop = selectors.messages.scrollHeight;
}

function autoResizeTextArea() {
  if (!selectors.input) {
    return;
  }

  selectors.input.style.height = 'auto';
  selectors.input.style.height = `${Math.min(selectors.input.scrollHeight, maxInputHeight)}px`;
}

function toggleLoginLoading(isLoading) {
  if (!selectors.loginSubmit || !selectors.loginEmail || !selectors.loginPassword) {
    return;
  }

  selectors.loginSubmit.disabled = isLoading;
  selectors.loginSubmit.textContent = isLoading ? 'Ingresando...' : 'Entra aquí';
  selectors.loginEmail.disabled = isLoading;
  selectors.loginPassword.disabled = isLoading;
}

function toggleMessageLoading(isLoading) {
  if (!selectors.submit || !selectors.input) {
    return;
  }

  selectors.submit.disabled = isLoading;
  selectors.submit.textContent = isLoading ? 'Enviando...' : 'Enviar';
  selectors.input.disabled = isLoading;
}

function createChatApiClient({ endpoint, historyEndpoint: historyEndpointUrl, headers = {} }) {
  const parsedEndpoint = validateChatEndpoint(endpoint);
  let parsedHistoryEndpoint = null;

  if (historyEndpointUrl) {
    try {
      parsedHistoryEndpoint = new URL(historyEndpointUrl);
    } catch (error) {
      // history endpoint is optional; silently ignore bad URL
      void error;
    }
  }

  return {
    async login(payload) {
      const response = await postJson(parsedEndpoint, payload, headers);

      if (response && Object.keys(response).length > 0) {
        return response;
      }

      throw new Error('El login devolvió una respuesta vacía.');
    },
    fetchHistory(payload) {
      if (!parsedHistoryEndpoint) {
        return Promise.resolve({ mensajes: [] });
      }

      return postJson(parsedHistoryEndpoint, payload, headers);
    },
    sendMessage(payload) {
      return postJson(parsedEndpoint, payload, headers);
    },
  };
}

function validateChatEndpoint(endpoint) {
  if (!endpoint) {
    throw new Error('Falta configurar data-chat-endpoint para el chat.');
  }

  if (!socioId) {
    throw new Error('Falta configurar data-socio-id para el chat.');
  }

  let parsedEndpoint;

  try {
    parsedEndpoint = new URL(endpoint);
  } catch (error) {
    throw new Error('El endpoint del chat no tiene un formato de URL válido.');
  }

  if (parsedEndpoint.protocol !== 'https:') {
    throw new Error('El endpoint del chat debe usar HTTPS.');
  }

  return parsedEndpoint;
}

async function postJson(endpoint, payload, headers) {
  let response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      credentials: 'omit',
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('El API del chat tardó demasiado en responder.');
    }

    throw new Error(
      'No fue posible conectar con el API del chat. Verifica CORS, red y disponibilidad del endpoint.',
    );
  } finally {
    window.clearTimeout(timeoutId);
  }

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(rawText || 'El API devolvió un error al procesar la solicitud.');
  }

  if (!rawText.trim()) {
    return { ok: true };
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    return {
      ok: true,
      raw: rawText,
    };
  }
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
