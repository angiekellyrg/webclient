const selectors = {
  toggle: document.querySelector('#chat-toggle'),
  panel: document.querySelector('#chat-panel'),
  close: document.querySelector('#chat-close'),
  status: document.querySelector('#chat-status'),
  auth: document.querySelector('#chat-auth'),
  session: document.querySelector('#chat-session'),
  loginForm: document.querySelector('#login-form'),
  loginName: document.querySelector('#login-name'),
  loginEmail: document.querySelector('#login-email'),
  loginPassword: document.querySelector('#login-password'),
  loginSubmit: document.querySelector('#login-submit'),
  form: document.querySelector('#chat-form'),
  input: document.querySelector('#chat-input'),
  submit: document.querySelector('#chat-submit'),
  messages: document.querySelector('#chat-messages'),
};

const chatEndpoint = document.body?.dataset.chatEndpoint?.trim() || '';
const socioId = document.body?.dataset.socioId?.trim() || '1234567';
const maxInputHeight = 144;

const state = {
  session: null,
};

const chatApi = createChatApiClient({
  endpoint: chatEndpoint,
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

  if (!selectors.loginEmail || !selectors.loginPassword || !selectors.loginName) {
    return;
  }

  const credentials = {
    nombre: selectors.loginName.value.trim(),
    email: selectors.loginEmail.value.trim(),
    contrasena: selectors.loginPassword.value,
  };

  if (!credentials.nombre || !credentials.email || !credentials.contrasena) {
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

    appendMessage({
      role: 'system',
      content: `Sesión iniciada para ${state.session.nombre}. clienteId: ${state.session.clienteId}`,
    });

    appendApiResponse(response, 'Respuesta de login');
    selectors.input?.focus();
  } catch (error) {
    appendMessage({
      role: 'system',
      content: getErrorMessage(error),
    });
  } finally {
    toggleLoginLoading(false);
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

    appendApiResponse(response, 'Respuesta del chat');
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
    throw new Error('El login respondió sin `clienteId`. Revisa la respuesta del API.');
  }

  const nombre =
    findFirstStringByKeys(response, ['nombre', 'name', 'clienteNombre']) || credentials.nombre;

  return {
    clienteId,
    nombre,
    email: credentials.email,
  };
}

function appendApiResponse(response, title) {
  const reply = extractAssistantReply(response);
  const serializedResponse = JSON.stringify(response, null, 2);
  const content = reply ? `${title}: ${reply}\n\n${serializedResponse}` : `${title}:\n${serializedResponse}`;

  appendMessage({
    role: 'assistant',
    content,
  });
}

function extractAssistantReply(response) {
  const candidate = findFirstStringByKeys(response, [
    'respuesta',
    'reply',
    'message',
    'mensaje',
    'detalle',
    'detail',
    'descripcion',
  ]);

  return candidate && candidate.length < 400 ? candidate : '';
}

function findFirstStringByKeys(value, keys) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findFirstStringByKeys(item, keys);
      if (match) {
        return match;
      }
    }

    return '';
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (keys.includes(entryKey) && typeof entryValue === 'string' && entryValue.trim()) {
      return entryValue.trim();
    }

    const match = findFirstStringByKeys(entryValue, keys);
    if (match) {
      return match;
    }
  }

  return '';
}

function appendMessage({ role, content }) {
  if (!selectors.messages) {
    return;
  }

  const article = document.createElement('article');
  article.className = `message message--${role}`;

  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  article.append(paragraph);

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
  if (!selectors.loginSubmit || !selectors.loginEmail || !selectors.loginPassword || !selectors.loginName) {
    return;
  }

  selectors.loginSubmit.disabled = isLoading;
  selectors.loginSubmit.textContent = isLoading ? 'Ingresando...' : 'Entrar aquí';
  selectors.loginName.disabled = isLoading;
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

function createChatApiClient({ endpoint, headers = {} }) {
  return {
    login(payload) {
      return postJson(endpoint, payload, headers);
    },
    sendMessage(payload) {
      return postJson(endpoint, payload, headers);
    },
  };
}

async function postJson(endpoint, payload, headers) {
  if (!endpoint) {
    throw new Error('Falta configurar `data-chat-endpoint` para el chat.');
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(
      'No fue posible conectar con el API del chat. Verifica CORS, red y disponibilidad del endpoint.',
    );
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
