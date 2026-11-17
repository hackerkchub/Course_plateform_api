import net from 'node:net';
import tls from 'node:tls';

/**
 * Clean built-in Node.js SMTP transport with mock fallback.
 * Zero npm package dependencies.
 */
export async function sendEmail({ to, subject, html, text }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@courseplatform.com';

  // Fallback to mock if SMTP credentials are not configured or in development/test
  if (!host || !user || process.env.NODE_ENV === 'test' || process.env.MOCK_NOTIFICATIONS === 'true') {
    const mockId = `mock-mail-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[SMTP MOCK] To: ${to} | Subject: "${subject}" | MockID: ${mockId}`);
    return { success: true, messageId: mockId, mock: true };
  }

  return new Promise((resolve, reject) => {
    let socket;
    let step = 0;
    let isTls = port === 465;

    function cleanup() {
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP connection timed out'));
    }, 15000);

    function sendCommand(cmd) {
      if (socket && socket.writable) {
        socket.write(cmd + '\r\n');
      }
    }

    function handleResponse(response) {
      const code = parseInt(response.substring(0, 3), 10);
      if (isNaN(code)) return;

      if (code >= 400) {
        clearTimeout(timeout);
        cleanup();
        return reject(new Error(`SMTP error ${code}: ${response.trim()}`));
      }

      switch (step) {
        case 0: // Greeting received
          step = 1;
          sendCommand(`EHLO ${host}`);
          break;
        case 1: // EHLO response received
          if (!isTls && port === 587) {
            step = 2;
            sendCommand('STARTTLS');
          } else {
            step = 3;
            sendCommand('AUTH LOGIN');
          }
          break;
        case 2: // STARTTLS response received
          // Upgrade to TLS
          socket.removeAllListeners('data');
          socket = tls.connect({
            socket,
            host,
            rejectUnauthorized: false,
          }, () => {
            socket.on('data', onData);
            step = 3;
            sendCommand(`EHLO ${host}`);
          });
          break;
        case 3: // Authenticate - Username prompt
          step = 4;
          sendCommand('AUTH LOGIN');
          break;
        case 4: // Send base64 username
          step = 5;
          sendCommand(Buffer.from(user).toString('base64'));
          break;
        case 5: // Send base64 password
          step = 6;
          sendCommand(Buffer.from(pass).toString('base64'));
          break;
        case 6: // Auth succeeded, send MAIL FROM
          step = 7;
          sendCommand(`MAIL FROM:<${from}>`);
          break;
        case 7: // Send RCPT TO
          step = 8;
          sendCommand(`RCPT TO:<${to}>`);
          break;
        case 8: // Send DATA command
          step = 9;
          sendCommand('DATA');
          break;
        case 9: // Send message body
          step = 10;
          const bodyText = text || html?.replace(/<[^>]+>/g, '') || '';
          const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${host}>`;
          const rawMessage = [
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `Message-ID: ${messageId}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            '',
            html || bodyText,
            '.',
          ].join('\r\n');
          sendCommand(rawMessage);
          break;
        case 10: // Data accepted
          step = 11;
          sendCommand('QUIT');
          clearTimeout(timeout);
          cleanup();
          resolve({ success: true, messageId });
          break;
      }
    }

    function onData(chunk) {
      const response = chunk.toString();
      handleResponse(response);
    }

    if (isTls) {
      socket = tls.connect(port, host, { rejectUnauthorized: false }, () => {
        socket.on('data', onData);
      });
    } else {
      socket = net.connect(port, host, () => {
        socket.on('data', onData);
      });
    }

    socket.on('error', (err) => {
      clearTimeout(timeout);
      cleanup();
      reject(err);
    });
  });
}

export default { sendEmail };
