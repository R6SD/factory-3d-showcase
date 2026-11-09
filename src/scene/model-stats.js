/**
 * 模型三角面统计。SceneRuntime.getModelInfo 与性能单测共用这一份，
 * 避免面板和测试各写一套算法。
 * 有 index 时按 index.count / 3，否则按 position 顶点。
 */
export function countTriangles(root) {
  let tris = 0;
  if (!root?.traverse) return 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry?.index) tris += object.geometry.index.count / 3;
    else if (object.geometry?.attributes?.position) tris += object.geometry.attributes.position.count / 3;
  });
  return Math.round(tris);
}
