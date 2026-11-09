/** 创建 SceneRuntime 之前探测 WebGL。无上下文或探测抛错时返回 false。 */
export function hasWebGL(makeCanvas = () => document.createElement('canvas')) {
  try {
    const c = makeCanvas();
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
