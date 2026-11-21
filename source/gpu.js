// WebGPU's descriptors are long and mostly alike. These say only what differs, and every
// part of the island that talks to the GPU says it through them.

// What a binding is, by one letter: u uniform, r storage read, w storage written,
// t texture read texel by texel, f filtered texture, d depth texture, s sampler,
// c comparison sampler, o texture written by a compute pass.
const BINDING = {
  u: { buffer: { type: 'uniform' } }, r: { buffer: { type: 'read-only-storage' } }, w: { buffer: { type: 'storage' } },
  t: { texture: { sampleType: 'unfilterable-float' } }, f: { texture: { sampleType: 'float' } }, d: { texture: { sampleType: 'depth' } },
  s: { sampler: { type: 'filtering' } }, c: { sampler: { type: 'comparison' } },
  o: { storageTexture: { access: 'write-only', format: 'rgba16float' } }
};
// A bind group layout from a word, one letter a binding, numbered from `first`.
function layoutOf(device, stages, word, first) {
  return device.createBindGroupLayout({ entries: [...word].map((k, i) => ({ binding: (first || 0) + i, visibility: stages, ...BINDING[k] })) });
}
// A bind group from its resources in binding order. A buffer is wrapped on the way.
function groupOf(device, layout, list, first) {
  return device.createBindGroup({
    layout: layout,
    entries: list.map((r, i) => ({ binding: (first || 0) + i, resource: r instanceof GPUBuffer ? { buffer: r } : r }))
  });
}
// A texture to draw into. It can be read afterwards unless `usage` says otherwise.
function targetOf(device, w, h, format, usage) {
  return device.createTexture({ size: [w, h], format: format, usage: GPUTextureUsage.RENDER_ATTACHMENT | (usage == null ? GPUTextureUsage.TEXTURE_BINDING : usage) });
}
// A render pass: a colour view cleared to `clear` (kept when there is none), a depth view
// cleared to far. Either may be left out, or null to be filled in later.
function passOf(color, clear, depth) {
  return {
    colorAttachments: color === undefined ? [] : [{ view: color, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: clear }],
    depthStencilAttachment: depth === undefined ? undefined : { view: depth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
  };
}
