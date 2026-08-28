const ACTIVE_MODEL_KEY = 'factory-active-model';
const DEFAULT_MODEL = '__factory_default__';

function currentModel() { return localStorage.getItem(ACTIVE_MODEL_KEY) || DEFAULT_MODEL; }
function setCurrentModel(name) {
  if (!name || name === DEFAULT_MODEL) localStorage.removeItem(ACTIVE_MODEL_KEY);
  else localStorage.setItem(ACTIVE_MODEL_KEY, name);
  window.dispatchEvent(new CustomEvent('factory-active-model-change', { detail: currentModel() }));
}

// Record the choice before Three.js asynchronously parses the model.
window.addEventListener('factory-import', (event) => { const file = event.detail?.file || event.detail; if (file?.name) setCurrentModel(file.name); });
window.addEventListener('factory-show-default', () => setCurrentModel(DEFAULT_MODEL));
window.addEventListener('factory-scene-ready', async () => {
  const name = currentModel();
  if (name === DEFAULT_MODEL) return;
  await window.factoryModelStorage?.waitForSave(name);
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('factory-show-model', { detail: { name, silent: true } })), 0);
});
