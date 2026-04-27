const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const sessions = {}; // Active sessions store

// ─── Session ID Generator ───────────────────────────────────────────────────
function generateSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    return `nexty~${suffix}`;
}

// ─── Web UI ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nexty Bot — Connect</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #111118;
    --border: #1e1e2e;
    --accent: #00ff88;
    --accent2: #00ccff;
    --text: #e8e8f0;
    --muted: #555566;
    --danger: #ff4466;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Syne', sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    overflow-x: hidden;
  }

  body::before {
    content: '';
    position: fixed;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(ellipse at 30% 20%, rgba(0,255,136,0.04) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(0,204,255,0.04) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  .container {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 480px;
  }

  .logo {
    text-align: center;
    margin-bottom: 40px;
    animation: fadeDown 0.6s ease both;
  }

  .logo-icon {
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 16px;
    box-shadow: 0 0 40px rgba(0,255,136,0.2);
  }

  .logo h1 {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -1px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .logo p {
    color: var(--muted);
    font-size: 0.85rem;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 4px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 32px;
    animation: fadeUp 0.6s ease 0.1s both;
  }

  .step {
    display: none;
  }
  .step.active {
    display: block;
    animation: fadeIn 0.4s ease both;
  }

  label {
    display: block;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 10px;
  }

  input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 18px;
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(0,255,136,0.1);
  }

  input::placeholder { color: var(--muted); }

  .hint {
    font-size: 0.75rem;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    margin-top: 8px;
  }

  .btn {
    width: 100%;
    padding: 15px;
    border: none;
    border-radius: 12px;
    font-family: 'Syne', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 20px;
    letter-spacing: 0.5px;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #000;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0,255,136,0.3);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Session ID box */
  .session-box {
    background: var(--bg);
    border: 1px solid var(--accent);
    border-radius: 12px;
    padding: 16px 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 1.1rem;
    color: var(--accent);
    text-align: center;
    letter-spacing: 2px;
    margin: 16px 0;
    box-shadow: 0 0 20px rgba(0,255,136,0.1);
    word-break: break-all;
  }

  /* Pair code box */
  .pair-box {
    background: var(--bg);
    border: 1px solid var(--accent2);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    margin: 16px 0;
  }

  .pair-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 2.2rem;
    font-weight: 600;
    color: var(--accent2);
    letter-spacing: 8px;
    text-shadow: 0 0 20px rgba(0,204,255,0.4);
  }

  .pair-label {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .steps-guide {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px 20px;
    margin-top: 16px;
  }

  .steps-guide p {
    font-size: 0.8rem;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    line-height: 1.8;
  }

  .steps-guide p span {
    color: var(--accent);
  }

  /* Status */
  .status {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 16px;
  }

  .status.loading {
    background: rgba(0,204,255,0.08);
    border: 1px solid rgba(0,204,255,0.2);
    color: var(--accent2);
  }

  .status.success {
    background: rgba(0,255,136,0.08);
    border: 1px solid rgba(0,255,136,0.2);
    color: var(--accent);
  }

  .status.error {
    background: rgba(255,68,102,0.08);
    border: 1px solid rgba(255,68,102,0.2);
    color: var(--danger);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0,204,255,0.3);
    border-top-color: var(--accent2);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.5s ease infinite;
    flex-shrink: 0;
  }

  /* Connected screen */
  .connected-icon {
    text-align: center;
    font-size: 4rem;
    margin-bottom: 12px;
    animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .connected-title {
    text-align: center;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--accent);
    margin-bottom: 8px;
  }

  .connected-sub {
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 20px;
  }

  @keyframes fadeDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeUp   { from { opacity:0; transform:translateY(20px);  } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn   { from { opacity:0; } to { opacity:1; } }
  @keyframes spin     { to { transform: rotate(360deg); } }
  @keyframes pulse    { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }
  @keyframes pop      { from { opacity:0; transform:scale(0.5); } to { opacity:1; transform:scale(1); } }
</style>
</head>
<body>
<div class="container">
  <div class="logo">
    <div class="logo-icon">🤖</div>
    <h1>NEXTY BOT</h1>
    <p>WhatsApp Bot Manager</p>
  </div>

  <div class="card">

    <!-- Step 1: Phone number -->
    <div class="step active" id="step1">
      <label>WhatsApp Number</label>
      <input type="tel" id="phoneInput" placeholder="923001234567" maxlength="15">
      <p class="hint">👆 Country code ke saath daalo, without + or spaces</p>
      <button class="btn btn-primary" id="connectBtn" onclick="requestPairCode()">
        Generate Pair Code →
      </button>
    </div>

    <!-- Step 2: Pair code -->
    <div class="step" id="step2">
      <label>Tera Session ID</label>
      <div class="session-box" id="sessionIdBox">—</div>

      <label>Pair Code</label>
      <div class="pair-box">
        <div class="pair-label">WhatsApp mein yeh code daalo</div>
        <div class="pair-code" id="pairCodeBox">••••</div>
      </div>

      <div class="steps-guide">
        <p>
          <span>1.</span> WhatsApp kholo<br>
          <span>2.</span> Settings → Linked Devices<br>
          <span>3.</span> Link a Device<br>
          <span>4.</span> Link with phone number<br>
          <span>5.</span> Upar wala code daalo ✅
        </p>
      </div>

      <div class="status loading" id="waitStatus">
        <div class="spinner"></div>
        <span>WhatsApp connection ka wait kar raha hai...</span>
      </div>
    </div>

    <!-- Step 3: Connected -->
    <div class="step" id="step3">
      <div class="connected-icon">✅</div>
      <div class="connected-title">Connected!</div>
      <div class="connected-sub">Bot chal raha hai 🚀</div>

      <label>Tera Session ID</label>
      <div class="session-box" id="finalSessionId">—</div>

      <div class="status success">
        <div class="dot"></div>
        <span>Session ID tera WhatsApp inbox mein bhi bhej diya gaya!</span>
      </div>
    </div>

  </div>
</div>

<script>
  let currentSessionId = null;
  let pollInterval = null;

  async function requestPairCode() {
    const phone = document.getElementById('phoneInput').value.trim().replace(/[^0-9]/g, '');
    if (phone.length < 10) {
      alert('❌ Sahi number daalo (country code ke saath)');
      return;
    }

    const btn = document.getElementById('connectBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();

      if (data.error) {
        alert('❌ ' + data.error);
        btn.disabled = false;
        btn.textContent = 'Generate Pair Code →';
        return;
      }

      currentSessionId = data.sessionId;
      document.getElementById('sessionIdBox').textContent = data.sessionId;
      document.getElementById('pairCodeBox').textContent = data.pairCode;

      // Step 2 dikhao
      document.getElementById('step1').classList.remove('active');
      document.getElementById('step2').classList.add('active');

      // Poll karo connected hone tak
      pollInterval = setInterval(checkStatus, 3000);

    } catch (e) {
      alert('❌ Error: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Generate Pair Code →';
    }
  }

  async function checkStatus() {
    if (!currentSessionId) return;
    try {
      const res = await fetch('/api/status/' + currentSessionId);
      const data = await res.json();

      if (data.status === 'connected') {
        clearInterval(pollInterval);
        document.getElementById('finalSessionId').textContent = currentSessionId;
        document.getElementById('step2').classList.remove('active');
        document.getElementById('step3').classList.add('active');
      }
    } catch(e) {}
  }

  // Enter key support
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') requestPairCode();
  });
</script>
</body>
</html>`);
});

// ─── API: Pair Code Request ─────────────────────────────────────────────────
app.post('/api/pair', async (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length < 10) return res.json({ error: 'Invalid phone number' });

    const sessionId = generateSessionId();
    const sessionDir = path.join('./sessions', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Nexty Bot', 'Chrome', '1.0.0'],
        });

        // Session store karo
        sessions[sessionId] = { sock, status: 'pending', phone };

        await new Promise((r) => setTimeout(r, 2000));
        const code = await sock.requestPairingCode(phone);
        const formatted = code.match(/.{1,4}/g).join('-');

        // Creds save karo
        sock.ev.on('creds.update', saveCreds);

        // Connection events
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                sessions[sessionId].status = 'connected';
                console.log(`✅ Connected: ${sessionId}`);

                // Inbox mein session ID bhejo
                const myJid = sock.user.id;
                await sock.sendMessage(myJid, {
                    text:
                        `╔══════════════════════════════╗\n` +
                        `║   🤖 NEXTY BOT — Connected!  ║\n` +
                        `╠══════════════════════════════╣\n` +
                        `║ 🆔 Session ID:\n` +
                        `║ ${sessionId}\n` +
                        `╠══════════════════════════════╣\n` +
                        `║ 📱 Number: +${phone}\n` +
                        `║ 📅 ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n` +
                        `╚══════════════════════════════╝\n\n` +
                        `✅ Bot active hai!\n` +
                        `⚠️ Session ID safe rakho.`
                });
            }

            if (connection === 'close') {
                const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    sessions[sessionId].status = 'loggedOut';
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    delete sessions[sessionId];
                }
            }
        });

        res.json({ sessionId, pairCode: formatted });

    } catch (err) {
        console.error(err);
        fs.rmSync(sessionDir, { recursive: true, force: true });
        res.json({ error: 'Pair code generate nahi hua. Dobara try karo.' });
    }
});

// ─── API: Status Check ──────────────────────────────────────────────────────
app.get('/api/status/:sessionId', (req, res) => {
    const session = sessions[req.params.sessionId];
    if (!session) return res.json({ status: 'not_found' });
    res.json({ status: session.status });
});

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Nexty Bot Server chal raha hai: http://localhost:${PORT}\n`);
});
