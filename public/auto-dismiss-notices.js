const NOTICE_TIMEOUT = 4200;
const scheduled = new WeakSet();
function scheduleNotice(node) {
  if (!(node instanceof HTMLElement) || !node.matches('.notice') || scheduled.has(node)) return;
  scheduled.add(node);
  window.setTimeout(() => { if (node.isConnected) node.querySelector('button')?.click(); }, NOTICE_TIMEOUT);
}
new MutationObserver((changes) => changes.forEach((change) => change.addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) { scheduleNotice(node); node.querySelectorAll?.('.notice').forEach(scheduleNotice); }
}))).observe(document.documentElement, { childList: true, subtree: true });
document.querySelectorAll('.notice').forEach(scheduleNotice);
