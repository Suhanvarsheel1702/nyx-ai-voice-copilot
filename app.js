const $ = selector => document.querySelector(selector);
const guidance = $('#guidance');
const transcript = $('#transcript');
let latestIntent = 'Explore';

function showGuidance(text) {
  const lower = text.toLowerCase();
  let intent = 'Explore';
  let reply = 'Pay-in-3 lets eligible customers divide a purchase into three scheduled payments. I can guide you through the secure eligibility and onboarding steps.';
  let action = 'Confirm the purchase context, then offer the approved eligibility flow. Do not promise approval.';

  if (/kyc|document|proof|id/.test(lower)) {
    intent = 'KYC';
    reply = 'I can guide you through the verified KYC checklist in the secure onboarding flow. Please do not share sensitive identifiers aloud.';
    action = 'Open the approved KYC checklist.';
  } else if (/later|think|maybe|not sure/.test(lower)) {
    intent = 'Hesitation';
    reply = 'Of course. I can send an agent-approved summary of the current option and the secure next step.';
    action = 'Confirm a follow-up channel and schedule an agent-reviewed reminder.';
  } else if (/onboard|start|apply|complete/.test(lower)) {
    intent = 'Ready';
    reply = 'I can help you start the eligibility and onboarding journey. Final decisions and terms are shown only in the approved flow.';
    action = 'Guide the customer to the approved eligibility flow.';
  }

  $('#intent').textContent = intent;
  latestIntent = intent;
  guidance.innerHTML = `<div><b>Intent: ${intent}</b><br><small>Detected from the latest customer utterance.</small></div><div><b>Suggested response</b><br>${reply}</div><div><b>Next best action</b><br>${action}</div>`;
  transcript.insertAdjacentHTML('beforeend', `<p><b>Customer</b>${text}</p><p class="agent"><b>Nyx suggestion</b>${reply}</p>`);
  transcript.scrollTop = transcript.scrollHeight;
  $('#crm').textContent = `CRM draft: ${intent} intent, consent captured, agent review required before follow-up.`;
}

function analyseInput() {
  const value = $('#utterance').value.trim();
  if (value) { showGuidance(value); $('#utterance').value = ''; }
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item,.view').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  $(`#${button.dataset.view}`).classList.add('active');
}));
document.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => showGuidance(button.dataset.scenario)));
$('#analyse').addEventListener('click', analyseInput);
$('#utterance').addEventListener('keydown', event => { if (event.key === 'Enter') analyseInput(); });
$('#save').addEventListener('click', () => { $('#crm').textContent = 'CRM activity saved. Consent, intent, and the agent-recommended next step are recorded.'; });
$('#follow-up').addEventListener('click', () => { $('#crm').textContent = 'Follow-up draft: Thank you for speaking with us. Here is the approved Pay-in-3 summary and secure eligibility next step.'; });
$('#run-quality').addEventListener('click', () => {
  const checks = [
    ['Consent recorded', true, 'Customer agreed to AI-assisted support.'],
    ['Approved knowledge used', true, 'Product and KYC guidance is source-grounded.'],
    ['No credit promise', true, 'Final eligibility, limits, and terms remain in the authorised flow.'],
    ['Next-best action present', latestIntent !== 'Explore', latestIntent === 'Explore' ? 'Ask the agent to confirm the customer’s next step.' : `Next step is aligned to ${latestIntent.toLowerCase()} intent.`],
    ['CRM hand-off ready', true, 'Draft contains consent, intent, and follow-up context.']
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  const score = Math.round((passed / checks.length) * 100);
  $('#quality-score').textContent = `${score}%`;
  $('#quality-status').textContent = score === 100 ? 'Ready to save' : 'Agent review';
  $('#quality-checks').innerHTML = checks.map(([name, ok, note]) => `<div class="quality-check ${ok ? 'pass' : 'review'}"><div><b>${ok ? '✓' : '!'} ${name}</b><br><small>${note}</small></div><em>${ok ? 'Pass' : 'Review'}</em></div>`).join('');
});
$('#speak').addEventListener('click', () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return showGuidance('What documents do I need for KYC?');
  const recognizer = new Speech(); recognizer.lang = 'en-IN'; recognizer.onresult = event => showGuidance(event.results[0][0].transcript); recognizer.start();
});
$('#run-workflow').addEventListener('click', async () => {
  const question = $('#workflow-input').value;
  const highRisk = /approval|credit|limit|interest|rate|eligible/.test(question.toLowerCase());
  const steps = [...document.querySelectorAll('#agent-trace li')];
  steps.forEach(step => step.classList.remove('done'));
  for (const step of steps) { await new Promise(resolve => setTimeout(resolve, 250)); step.classList.add('done'); }
  $('#workflow-result').innerHTML = highRisk
    ? '<b>₹1.85 · Escalated review</b><br>Retrieved restricted policy. Self-check passed: no approval, rate, limit, or eligibility promise generated.'
    : '<b>₹0.08 · Routine route</b><br>Used deterministic intent routing and approved knowledge. Self-check passed: consent, accuracy, and human oversight verified.';
});
showGuidance('Can I split my purchase into three payments?');
