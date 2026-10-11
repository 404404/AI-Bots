import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize')
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'ordinary-linux-demo', version: '1.0.0' },
    };
  else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/list')
    result = {
      tools: [
        {
          name: 'workspace_probe',
          description:
            'Read nonsecret demo proof.txt from the authorized Linux workspace and report execution identity. No credentials are required.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
    };
  else if (request.method === 'tools/call' && request.params.name === 'workspace_probe') {
    let proof = 'proof-not-created';
    try {
      proof = readFileSync('proof.txt', 'utf8').slice(0, 100);
    } catch {}
    result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            proof,
            cwd: process.cwd(),
            uid: userInfo().uid,
            hostCredentialEnvironment: Object.keys(process.env).some((name) =>
              /^(DEEPSEEK_API_KEY|BOTHARNESS_PRIVATE_WIRE_EVIDENCE|DSH_HOME)$/.test(name),
            ),
          }),
        },
      ],
    };
  } else {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method unavailable' },
      }) + '\n',
    );
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
});
