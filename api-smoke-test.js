const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

const port = 3101;
const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: { 'Content-Type': 'application/json' } }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

(async () => {
  await new Promise(resolve => setTimeout(resolve, 250));
  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);
  const analysis = await request('POST', '/api/copilot/analyze', { utterance: 'What documents do I need for KYC?', consent: true });
  assert.equal(analysis.body.intent, 'KYC');
  const quality = await request('POST', '/api/quality-check', { consent: true, sources: analysis.body.sources, nextBestAction: analysis.body.nextBestAction, crmDraft: analysis.body.crmDraft });
  assert.equal(quality.body.score, 100);
  console.log('API smoke tests passed');
  child.kill();
})().catch(error => { child.kill(); console.error(error); process.exitCode = 1; });
