function installServiceExit() {
  const settings = document.querySelector('.settings');
  const generalTab = [...document.querySelectorAll('.settings nav button')].find((button) => button.textContent.includes('常规') || button.textContent.includes('General'));
  const actions = settings?.querySelector('.settings-actions');
  if (!settings || !generalTab?.classList.contains('active') || !actions || actions.querySelector('.service-exit')) return;
  const exit = document.createElement('button');
  exit.type = 'button'; exit.className = 'service-exit'; exit.innerHTML = '<span>⏻</span> 退出并关闭服务';
  exit.title = '关闭本地服务';
  exit.addEventListener('click', async () => {
    if (!confirm('确定退出并关闭本地服务吗？')) return;
    exit.disabled = true; exit.textContent = '正在关闭服务…';
    try { await fetch('/api/close', { method: 'POST' }); } catch {}
    document.body.innerHTML = '<main class="service-closed"><h1>服务已关闭</h1><p>可关闭此浏览器标签；再次双击程序即可重新启动。</p></main>';
  });
  actions.prepend(exit);
}
new MutationObserver(installServiceExit).observe(document.documentElement, { childList: true, subtree: true });
installServiceExit();
