// =====================================================
// Ledger — AI interface behavior
// =====================================================

const manuscript   = document.getElementById('manuscript');
const emptyState   = document.getElementById('emptyState');
const form         = document.getElementById('composerForm');
const input        = document.getElementById('messageInput');
const sendBtn      = document.getElementById('sendBtn');
const clearBtn     = document.getElementById('clearBtn');

let history = []; // { role: 'user' | 'assistant', content: string }

// ---------- Utilities ----------

function scrollToBottom() {
  manuscript.scrollTop = manuscript.scrollHeight;
}

function hideEmptyState() {
  if (emptyState && emptyState.parentNode) {
    emptyState.style.display = 'none';
  }
}

function timeLabel() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Rendering ----------

function renderUserTurn(text) {
  hideEmptyState();
  const turn = document.createElement('div');
  turn.className = 'turn turn--user';
  turn.innerHTML = `
    <div class="turn__label">You · ${timeLabel()}</div>
    <div class="turn__body"></div>
  `;
  turn.querySelector('.turn__body').textContent = text;
  manuscript.appendChild(turn);
  scrollToBottom();
}

function renderThinkingTurn() {
  const turn = document.createElement('div');
  turn.className = 'turn turn--assistant turn--thinking';
  turn.id = 'thinkingTurn';
  turn.innerHTML = `
    <div class="turn__label">Ledger</div>
    <div class="turn__body">
      <svg class="pulse" viewBox="0 0 90 14" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 7 L20 7 L26 2 L34 12 L40 7 L90 7" />
      </svg>
    </div>
  `;
  manuscript.appendChild(turn);
  scrollToBottom();
  return turn;
}

function renderAssistantTurn(text) {
  const turn = document.createElement('div');
  turn.className = 'turn turn--assistant';
  turn.innerHTML = `
    <div class="turn__label">Ledger · ${timeLabel()}</div>
    <div class="turn__body"></div>
  `;
  turn.querySelector('.turn__body').textContent = text;
  manuscript.appendChild(turn);
  scrollToBottom();
}

// ---------- Response logic ----------
// Calls the Anthropic API directly. No API key needed here — see the
// setup notes at the bottom of this file for how this is authenticated
// depending on where you deploy this file.

const SYSTEM_PROMPT =
  "You are Ledger, a calm, precise thinking partner inside a minimal " +
  "writing-style interface. Keep replies focused and conversational — " +
  "a few sentences unless the person asks for more.";

async function getReply(userText) {
  // Build the full message history in Anthropic API format
  const messages = history.map(turn => ({
    role: turn.role,
    content: turn.content
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: messages
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Concatenate any text blocks in the response
  const reply = data.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n');

  return reply || "I didn't get a usable reply back — try rephrasing that.";
}

// ---------- Textarea auto-resize ----------

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

input.addEventListener('input', autoResize);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// ---------- Submit flow ----------

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  history.push({ role: 'user', content: text });
  renderUserTurn(text);

  input.value = '';
  autoResize();
  sendBtn.disabled = true;

  const thinkingEl = renderThinkingTurn();

  try {
    const reply = await getReply(text);
    thinkingEl.remove();
    history.push({ role: 'assistant', content: reply });
    renderAssistantTurn(reply);
  } catch (err) {
    thinkingEl.remove();
    renderAssistantTurn('Something interrupted that thought. Try sending it again.');
    console.error('Reply error:', err);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

// ---------- Clear conversation ----------

clearBtn.addEventListener('click', () => {
  history = [];
  manuscript.innerHTML = '';
  const fresh = document.createElement('div');
  fresh.className = 'empty-state';
  fresh.id = 'emptyState';
  fresh.innerHTML = `
    <p class="empty-state__line">A blank page thinks better than a busy one.</p>
    <p class="empty-state__sub">Write the first line below.</p>
  `;
  manuscript.appendChild(fresh);
  input.focus();
});

// ---------- Init ----------

autoResize();
input.focus();

// =====================================================
// Setup notes
// =====================================================
//
// This file calls https://api.anthropic.com/v1/messages directly from
// the browser with no API key attached. That works ONLY inside
// environments (like Claude.ai artifacts) that proxy and authenticate
// the request on your behalf.
//
// If you deploy this index.html/style.css/script.js as a normal static
// site, that endpoint will reject the request — and even if it didn't,
// you should never put a real Anthropic API key in client-side JS,
// since anyone can view it in the page source or network tab.
//
// To run this for real outside that sandbox, add a tiny backend that
// holds the key server-side, and point this file at your own backend
// instead of api.anthropic.com directly. Minimal Node/Express example:
//
//   // server.js
//   import express from 'express';
//   import Anthropic from '@anthropic-ai/sdk';
//   const app = express();
//   app.use(express.json());
//   const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//
//   app.post('/api/chat', async (req, res) => {
//     const { messages } = req.body;
//     const msg = await anthropic.messages.create({
//       model: 'claude-sonnet-4-6',
//       max_tokens: 1000,
//       system: 'You are Ledger, a calm, precise thinking partner...',
//       messages
//     });
//     res.json({ reply: msg.content.map(b => b.text || '').join('\n') });
//   });
//   app.listen(3000);
//
// Then in getReply(), swap the fetch URL to '/api/chat' and read
// data.reply instead of data.content.