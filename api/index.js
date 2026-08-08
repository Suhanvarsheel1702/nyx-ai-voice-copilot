const knowledgeBase = [
  { id: 'product-overview', title: 'Pay-in-3 overview', access: 'approved' },
  { id: 'kyc-process', title: 'KYC and onboarding', access: 'approved' },
  { id: 'credit-policy', title: 'Credit decision policy', access: 'restricted' }
];
const auditLog = [];
const crmActivities = [];
const costLedger = [];

function analyse(utterance, consent) {
  const text = String(utterance || '').toLowerCase();
  const highRisk = /approval|approve|credit|limit|interest|rate|eligible/.test(text);
  let intent = 'Explore';
  let suggestedResponse = 'Pay-in-3 lets eligible customers divide a purchase into three scheduled payments. I can guide you through the secure eligibility and onboarding steps.';
  let nextBestAction = 'Confirm the purchase context, then offer the approved eligibility flow. Do not promise approval.';
  let sources = ['product-overview'];
  if (/kyc|document|proof|id/.test(text)) { intent = 'KYC'; suggestedResponse = 'I can guide you through the verified KYC checklist in the secure onboarding flow. Please do not share sensitive identifiers aloud.'; nextBestAction = 'Open the approved KYC checklist.'; sources = ['kyc-process']; }
  else if (/later|think|maybe|not sure/.test(text)) { intent = 'Hesitation'; suggestedResponse = 'Of course. I can send an agent-approved summary of the current option and secure next step.'; nextBestAction = 'Confirm a follow-up channel and schedule an agent-reviewed reminder.'; }
  else if (/onboard|start|apply|complete/.test(text)) { intent = 'Ready'; suggestedResponse = 'I can help you start the eligibility and onboarding journey. Final decisions and terms are shown only in the approved flow.'; nextBestAction = 'Guide the customer to the approved eligibility flow.'; sources = ['product-overview', 'kyc-process']; }
  return { intent, suggestedResponse, nextBestAction, sources, route: highRisk ? 'high-stakes-review' : 'routine-router', costInr: highRisk ? 1.85 : 0.08, selfCheck: { consentPresent: Boolean(consent), groundedSources: sources, noCreditPromise: true, humanReviewRequired: true, passed: Boolean(consent) }, crmDraft: `CRM draft: ${intent} intent, consent ${consent ? 'captured' : 'missing'}, agent review required.` };
}

module.exports = function handler(req, res) {
  const path = req.url.split('?')[0];
  if (req.method === 'GET' && path.endsWith('/health')) return res.status(200).json({ ok: true, service: 'nyx-vercel-api', mode: 'mock-data' });
  if (req.method === 'GET' && path.endsWith('/knowledge')) return res.status(200).json({ items: knowledgeBase });
  if (req.method === 'GET' && path.endsWith('/audit-log')) return res.status(200).json({ items: auditLog });
  if (req.method === 'GET' && path.endsWith('/crm-activities')) return res.status(200).json({ items: crmActivities });
  if (req.method === 'GET' && path.endsWith('/costs')) return res.status(200).json({ items: costLedger, totalInr: costLedger.reduce((total, item) => total + item.costInr, 0) });
  if (req.method === 'POST' && path.endsWith('/copilot/analyze')) {
    const result = analyse(req.body?.utterance, req.body?.consent);
    auditLog.unshift({ id: `audit-${Date.now()}`, action: 'Copilot guidance generated', outcome: result.selfCheck.passed ? 'Passed self-check' : 'Consent required', createdAt: new Date().toISOString() });
    costLedger.unshift({ id: `cost-${Date.now()}`, route: result.route, costInr: result.costInr, createdAt: new Date().toISOString() });
    return res.status(200).json(result);
  }
  if (req.method === 'POST' && path.endsWith('/quality-check')) {
    const checks = [{ name: 'Consent recorded', passed: Boolean(req.body?.consent) }, { name: 'Approved knowledge used', passed: Boolean(req.body?.sources?.length) }, { name: 'No credit promise', passed: true }, { name: 'Next-best action present', passed: Boolean(req.body?.nextBestAction) }, { name: 'CRM hand-off ready', passed: Boolean(req.body?.crmDraft) }];
    const score = Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
    return res.status(200).json({ score, recommendation: score === 100 ? 'Ready to save' : 'Agent review', checks });
  }
  if (req.method === 'POST' && path.endsWith('/crm-activities')) {
    const activity = { id: `crm-${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
    crmActivities.unshift(activity);
    auditLog.unshift({ id: `audit-${Date.now()}`, action: 'CRM activity saved', outcome: 'Agent-reviewed hand-off', createdAt: activity.createdAt });
    return res.status(201).json(activity);
  }
  return res.status(404).json({ error: 'Not found' });
}
