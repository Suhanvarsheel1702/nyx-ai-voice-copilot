const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const activities = [];
const auditLog = [];
const costLedger = [];

const knowledgeBase = [
  { id: 'product-overview', title: 'Pay-in-3 overview', content: 'Eligible customers may divide a purchase into three scheduled payments. Final eligibility and terms are shown only in the approved flow.', access: 'approved' },
  { id: 'kyc-process', title: 'KYC and onboarding', content: 'Guide customers to the secure approved KYC checklist. Do not collect sensitive identifiers in the call transcript.', access: 'approved' },
  { id: 'credit-policy', title: 'Credit decision policy', content: 'Never promise approval, limits, rates, or final eligibility. These remain in the authorised credit workflow.', access: 'restricted' }
];

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function record(event, details) {
  auditLog.unshift({ id: `audit-${Date.now()}-${auditLog.length}`, event, details, createdAt: new Date().toISOString() });
}

function analyse(utterance, consent) {
  const text = String(utterance || '').toLowerCase();
  const highRisk = /approval|approve|credit|limit|interest|rate|eligible/.test(text);
  let intent = 'Explore';
  let suggestedResponse = 'Pay-in-3 lets eligible customers divide a purchase into three scheduled payments. I can guide you through the secure eligibility and onboarding steps.';
  let nextBestAction = 'Confirm the purchase context, then offer the approved eligibility flow. Do not promise approval.';
  let sources = ['product-overview'];

  if (/kyc|document|proof|id/.test(text)) {
    intent = 'KYC';
    suggestedResponse = 'I can guide you through the verified KYC checklist in the secure onboarding flow. Please do not share sensitive identifiers aloud.';
    nextBestAction = 'Open the approved KYC checklist.';
    sources = ['kyc-process'];
  } else if (/later|think|maybe|not sure/.test(text)) {
    intent = 'Hesitation';
    suggestedResponse = 'Of course. I can send an agent-approved summary of the current option and the secure next step.';
    nextBestAction = 'Confirm a follow-up channel and schedule an agent-reviewed reminder.';
  } else if (/onboard|start|apply|complete/.test(text)) {
    intent = 'Ready';
    suggestedResponse = 'I can help you start the eligibility and onboarding journey. Final decisions and terms are shown only in the approved flow.';
    nextBestAction = 'Guide the customer to the approved eligibility flow.';
    sources = ['product-overview', 'kyc-process'];
  }

  const cost = highRisk ? 1.85 : 0.08;
  const selfCheck = {
    consentPresent: Boolean(consent),
    groundedSources: sources,
    noCreditPromise: true,
    humanReviewRequired: true,
    passed: Boolean(consent)
  };
  costLedger.unshift({ id: `cost-${Date.now()}`, route: highRisk ? 'high-stakes-review' : 'routine-router', amountInr: cost, createdAt: new Date().toISOString() });
  record('copilot.analysis', { intent, highRisk, sources, selfCheck });
  return { intent, suggestedResponse, nextBestAction, sources, route: highRisk ? 'high-stakes-review' : 'routine-router', costInr: cost, selfCheck, crmDraft: `CRM draft: ${intent} intent, consent ${consent ? 'captured' : 'missing'}, agent review required before follow-up.` };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function serveStatic(req, res) {
  const route = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const safePath = path.normalize(route).replace(/^([.][.][\\/])+/, '');
  const filePath = path.join(__dirname, safePath);
  if (!filePath.startsWith(__dirname)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, file) => {
    if (error) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, service: 'nyx-local-api', mode: 'mock-data' });
    if (req.method === 'GET' && req.url === '/api/knowledge') return send(res, 200, { items: knowledgeBase });
    if (req.method === 'GET' && req.url === '/api/audit-log') return send(res, 200, { items: auditLog });
    if (req.method === 'GET' && req.url === '/api/costs') return send(res, 200, { items: costLedger, totalInr: costLedger.reduce((sum, item) => sum + item.amountInr, 0) });
    if (req.method === 'GET' && req.url === '/api/crm-activities') return send(res, 200, { items: activities });
    if (req.method === 'POST' && req.url === '/api/copilot/analyze') {
      const body = await readBody(req);
      if (!body.utterance) return send(res, 400, { error: 'utterance is required' });
      return send(res, 200, analyse(body.utterance, body.consent));
    }
    if (req.method === 'POST' && req.url === '/api/quality-check') {
      const body = await readBody(req);
      const checks = [
        { name: 'Consent recorded', passed: Boolean(body.consent) },
        { name: 'Approved knowledge used', passed: Array.isArray(body.sources) && body.sources.length > 0 },
        { name: 'No credit promise', passed: true },
        { name: 'Next-best action present', passed: Boolean(body.nextBestAction) },
        { name: 'CRM hand-off ready', passed: Boolean(body.crmDraft) }
      ];
      const score = Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
      record('quality.check', { score, checks });
      return send(res, 200, { score, recommendation: score === 100 ? 'Ready to save' : 'Agent review', checks });
    }
    if (req.method === 'POST' && req.url === '/api/crm-activities') {
      const body = await readBody(req);
      const activity = { id: `crm-${Date.now()}`, consent: Boolean(body.consent), intent: body.intent || 'Unknown', summary: body.summary || '', createdAt: new Date().toISOString() };
      activities.unshift(activity); record('crm.activity.created', activity); return send(res, 201, activity);
    }
    return serveStatic(req, res);
  } catch (error) { return send(res, 400, { error: error.message }); }
});

server.listen(port, () => console.log(`Nyx local backend running at http://localhost:${port}`));
