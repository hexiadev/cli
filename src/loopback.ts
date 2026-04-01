import { createServer, Server } from 'http';

export interface LoopbackResult {
  code: string;
  state: string;
}

function renderLoopbackPage(options: { success: boolean; title: string; description: string }): string {
  const accent = options.success ? '#5B7FFF' : '#FF5757';
  const icon = options.success ? '✓' : '!';
  const badge = options.success ? 'Authorized' : 'Authorization Error';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hexia CLI — ${options.title}</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #F8F9FB;
      --text-primary: #1A1D29;
      --text-secondary: #4E5566;
      --text-tertiary: #7D8494;
      --accent-blue: #5B7FFF;
      --accent-purple: #7C5CFF;
      --accent-pink: #FF6B9D;
      --glass-bg: rgba(255, 255, 255, 0.7);
      --glass-border: rgba(255, 255, 255, 0.9);
      --shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.06);
      --shadow-cta: 0 4px 16px rgba(91, 127, 255, 0.25);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      color: var(--text-primary);
      background-color: var(--canvas);
      background-image:
        radial-gradient(at 27% 37%, rgba(91, 127, 255, 0.12) 0px, transparent 50%),
        radial-gradient(at 87% 21%, rgba(124, 92, 255, 0.1) 0px, transparent 50%),
        radial-gradient(at 52% 90%, rgba(255, 107, 157, 0.08) 0px, transparent 50%);
    }
    .card {
      width: min(460px, 100%);
      border-radius: 16px;
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      box-shadow: var(--shadow-glass);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      padding: 28px 24px;
      text-align: center;
    }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      margin: 0 auto 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%);
      box-shadow: var(--shadow-cta);
    }
    .status {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      margin: 0 auto 12px;
      display: grid;
      place-items: center;
      font-size: 30px;
      font-weight: 700;
      color: #fff;
      background: ${options.success ? 'linear-gradient(135deg, #5B7FFF 0%, #7C5CFF 100%)' : accent};
      box-shadow: ${options.success ? '0 4px 16px rgba(91, 127, 255, 0.25)' : '0 8px 24px rgba(255, 87, 87, 0.28)'};
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 700;
      color: ${accent};
      margin-bottom: 6px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 27px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.5;
    }
    .hint {
      margin-top: 14px;
      font-size: 13px;
      color: var(--text-tertiary);
    }
    @supports not (backdrop-filter: blur(20px)) {
      .card { background: rgba(255, 255, 255, 0.95); }
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color:#fff">
        <path d="M12 2L20.66 7L20.66 17L12 22L3.34 17L3.34 7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </div>
    <div class="status">${icon}</div>
    <div class="badge">${badge}</div>
    <h1>${options.title}</h1>
    <p>${options.description}</p>
    <p class="hint">${options.success ? 'You can close this tab and return to your terminal.' : 'Return to the terminal and run the command again.'}</p>
  </main>
</body>
</html>`;
}

/**
 * Starts a local HTTP server on a random available port,
 * waits for a single request, and returns the query parameters.
 */
export function startLoopbackServer(): Promise<{ port: number; result: Promise<LoopbackResult>; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address !== 'object') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = address.port;

      const resultPromise = new Promise<LoopbackResult>((resolveResult, rejectResult) => {
        server.on('request', (req, res) => {
          if (!req.url) {
            res.writeHead(400);
            res.end('Missing URL');
            return;
          }

          const url = new URL(req.url, `http://127.0.0.1:${port}`);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');

          if (!code || !state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(renderLoopbackPage({
              success: false,
              title: 'Missing Parameters',
              description: 'This callback is missing code or state. The login flow cannot be completed.',
            }));
            rejectResult(new Error('Missing code or state'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(renderLoopbackPage({
            success: true,
            title: 'Connected',
            description: 'Hexia CLI has been authorized successfully.',
          }));

          resolveResult({ code, state });
        });
      });

      resolve({ port, result: resultPromise, server });
    });

    server.on('error', reject);
  });
}
