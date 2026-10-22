import { CONFIG } from './config.js?v=groq4';
import { AppError, askAssistant, activeChatModel, isAbort } from './api.js?v=groq4';
import { el } from './ui.js?v=groq4';

const SUGGESTIONS = [
  'Should I carry an umbrella?',
  'What should I wear today?',
  'Is it a good time for outdoor activities?',
];

const GREETING = 'Hi! Ask me anything about the weather: what to wear, whether to bring an umbrella, or how good the day is for outdoor plans. Search for a place first so I can use its live conditions.';

const SYSTEM_PROMPT = [
  'You are the assistant inside WeatherMap, a weather web app.',
  'Answer weather-related questions (clothing, travel, health tips, outdoor activities, general meteorology) in at most four short sentences.',
  'When live conditions are provided, base your answer on them and mention the place.',
  'If no location is selected, answer in general terms and suggest searching for a place.',
  'If a question is unrelated to weather, politely steer the user back to weather topics.',
  'Reply in the same language the user writes in.',
].join(' ');

export function initChatbot({ getContext, getApiKey, openAiSettings }) {
  const dom = {
    toggle: document.querySelector('#chatToggle'),
    panel: document.querySelector('#chatPanel'),
    log: document.querySelector('#chatLog'),
    suggestions: document.querySelector('#chatSuggestions'),
    form: document.querySelector('#chatForm'),
    input: document.querySelector('#chatInput'),
    send: document.querySelector('#chatSend'),
    close: document.querySelector('#chatClose'),
    clear: document.querySelector('#chatClear'),
    meta: document.querySelector('#chatMeta'),
  };

  const showMeta = () => {
    dom.meta.textContent = `${new URL(CONFIG.endpoints.chat).hostname} · ${activeChatModel()}`;
  };
  showMeta();

  let history = [];
  let controller = null;
  let typingNode = null;

  const scrollToEnd = () => { dom.log.scrollTop = dom.log.scrollHeight; };

  function addMessage(role, text) {
    dom.log.append(el('div', { className: `chat-msg chat-msg--${role}`, dir: 'auto', text }));
    scrollToEnd();
  }

  function addNotice({ level = 'error', title, message, action }) {
    dom.log.append(el('div', { className: `chat-notice chat-notice--${level}`, role: 'alert' }, [
      el('strong', { text: title }),
      el('span', { text: message }),
      action && el('button', {
        type: 'button',
        className: 'btn btn-primary btn-sm',
        text: action.label,
        onClick: action.onClick,
      }),
    ]));
    scrollToEnd();
  }

  function showTyping() {
    typingNode = el('div', { className: 'chat-msg chat-msg--assistant chat-typing', 'aria-label': 'Assistant is typing' }, [
      el('span'), el('span'), el('span'),
    ]);
    dom.log.append(typingNode);
    scrollToEnd();
  }

  function hideTyping() {
    typingNode?.remove();
    typingNode = null;
  }

  function setPending(isPending) {
    dom.send.disabled = isPending;
    dom.input.disabled = isPending;
    dom.panel.setAttribute('aria-busy', String(isPending));
  }

  function renderSuggestions() {
    dom.suggestions.replaceChildren(...SUGGESTIONS.map((text) => el('button', {
      type: 'button',
      className: 'chat-chip',
      text,
      onClick: () => ask(text),
    })));
  }

  function resetConversation() {
    controller?.abort();
    history = [];
    hideTyping();
    dom.log.replaceChildren();
    addMessage('assistant', GREETING);
    renderSuggestions();
  }

  function buildMessages() {
    const context = getContext();
    const contextLine = context
      ? `Live conditions currently shown on the map:\n${context}`
      : 'No location has been selected yet, so there are no live conditions.';
    return [{ role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextLine}` }, ...history];
  }

  function noticeFor(err) {
    if (!(err instanceof AppError)) {
      console.error(err);
      return { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.' };
    }
    const needsKey = err.code === 'no-ai-key' || err.code === 'ai-auth';
    return {
      level: err.level,
      title: err.title,
      message: err.message,
      action: needsKey ? { label: 'Add AI key', onClick: openAiSettings } : undefined,
    };
  }

  async function ask(text) {
    const question = text.trim();
    if (!question || controller) return;

    addMessage('user', question);
    history.push({ role: 'user', content: question });
    history = history.slice(-CONFIG.chatHistoryLimit);
    dom.input.value = '';
    dom.suggestions.replaceChildren();

    controller = new AbortController();
    const { signal } = controller;
    setPending(true);
    showTyping();

    try {
      const answer = await askAssistant(
        buildMessages(),
        getApiKey(),
        { signal },
      );
      if (signal.aborted) return;
      history.push({ role: 'assistant', content: answer });
      history = history.slice(-CONFIG.chatHistoryLimit);
      showMeta();
      hideTyping();
      addMessage('assistant', answer);
    } catch (err) {
      if (isAbort(err)) return;
      history.pop();
      hideTyping();
      console.warn(`[WeatherMap] assistant: ${err.message}`);
      addNotice(noticeFor(err));
    } finally {
      hideTyping();
      controller = null;
      setPending(false);
      if (!dom.panel.hidden) dom.input.focus();
    }
  }

  function setOpen(isOpen) {
    dom.panel.hidden = !isOpen;
    dom.toggle.hidden = isOpen;
    dom.toggle.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      if (!dom.log.children.length) resetConversation();
      dom.input.focus();
    } else {
      dom.toggle.focus();
    }
  }

  dom.toggle.addEventListener('click', () => setOpen(true));
  dom.close.addEventListener('click', () => setOpen(false));
  dom.clear.addEventListener('click', resetConversation);
  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(dom.input.value);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dom.panel.hidden && !document.querySelector('dialog[open]')) setOpen(false);
  });

  return { open: () => setOpen(true) };
}
