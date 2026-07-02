const selectors = {
  toggle: document.querySelector('#chat-toggle'),
  panel: document.querySelector('#chat-panel'),
  close: document.querySelector('#chat-close'),
  form: document.querySelector('#chat-form'),
  input: document.querySelector('#chat-input'),
  submit: document.querySelector('#chat-submit'),
  messages: document.querySelector('#chat-messages'),
};

const defaultChatEndpoint = '/api/chat';
const configuredChatEndpoint = document.body?.dataset.chatEndpoint?.trim();

const chatApi = createChatApiClient({
  endpoint: configuredChatEndpoint || defaultChatEndpoint,
  headers: {
    'Content-Type': 'application/json',
  },
});

selectors.toggle?.addEventListener('click', () => {
  const shouldOpen = !selectors.panel?.classList.contains('is-open');
  setPanelState(shouldOpen);
});

selectors.close?.addEventListener('click', () => setPanelState(false));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectors.panel?.classList.contains('is-open')) {
    setPanelState(false);
    selectors.toggle?.focus();
  }
});

selectors.input?.addEventListener('input', autoResizeTextArea);
selectors.form?.addEventListener('submit', handleSubmit);

function setPanelState(isOpen) {
  if (!selectors.panel || !selectors.toggle) {
    return;
  }

  selectors.panel.classList.toggle('is-open', isOpen);
  selectors.panel.setAttribute('aria-hidden', String(!isOpen));
  selectors.toggle.setAttribute('aria-expanded', String(isOpen));
  selectors.toggle.setAttribute('aria-label', isOpen ? 'Cerrar chat' : 'Abrir chat');

  if (isOpen) {
    selectors.input?.focus();
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!selectors.input || !selectors.submit) {
    return;
  }

  const message = selectors.input.value.trim();
  if (!message) {
    return;
  }

  appendMessage({ role: 'user', content: message });
  selectors.input.value = '';
  autoResizeTextArea();

  toggleLoadingState(true);

  try {
    const response = await chatApi.sendMessage({
      message,
      metadata: {
        source: 'webclient-widget',
        sentAt: new Date().toISOString(),
      },
    });

    appendMessage({
      role: 'assistant',
      content:
        response.reply ??
        'Mensaje enviado. Conecta `createChatApiClient` con tu API para mostrar respuestas reales.',
    });
  } catch (error) {
    appendMessage({
      role: 'assistant',
      content: getErrorMessage(error),
    });
  } finally {
    toggleLoadingState(false);
  }
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
  selectors.input.style.height = `${Math.min(selectors.input.scrollHeight, 144)}px`;
}

function toggleLoadingState(isLoading) {
  if (!selectors.submit || !selectors.input) {
    return;
  }

  selectors.submit.disabled = isLoading;
  selectors.submit.textContent = isLoading ? 'Enviando...' : 'Enviar';
  selectors.input.disabled = isLoading;
}

function createChatApiClient({ endpoint, headers = {} }) {
  return {
    async sendMessage(payload) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('No fue posible enviar tu mensaje en este momento.');
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          return {
            reply: 'Mensaje enviado correctamente.'
          };
        }

        return response.json();
      } catch (error) {
        if (endpoint === defaultChatEndpoint) {
          return {
            reply:
              'El widget ya apunta a `/api/chat`. Cuando tu API esté disponible, este mensaje se reemplazará por respuestas reales.',
          };
        }

        throw error;
      }
    },
  };
}

function getErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ocurrió un error inesperado. Intenta nuevamente.';
}
