import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const SKILL = fileURLToPath(new URL('../plugins/diagram-kit/skills/create-diagram/', import.meta.url));
const imp = (rel) => import(pathToFileURL(SKILL + rel).href);
const { loadSpec, normalizeSpec, parseEdge, SpecError } = await imp('scripts/lib/spec.mjs');
const { buildModel } = await imp('scripts/lib/build.mjs');
const { checkModel } = await imp('scripts/lib/check.mjs');
const { parseBrief } = await imp('scripts/lib/model.mjs');
const { htmlPage, bundleViewer, reactFiles, pageHtml } = await imp('scripts/lib/html.mjs');
const { staticSvg } = await imp('scripts/lib/png.mjs');
const { measure, wrap } = await imp('scripts/lib/metrics.mjs');
const { dep } = await imp('scripts/lib/deps.mjs');

const EXAMPLES = `${SKILL}examples/`;

test('edge shorthand maps arrows to kinds', () => {
  assert.deepEqual(parseEdge('a -> b: call'), { from: 'a', to: 'b', kind: 'sync', label: 'call' });
  assert.equal(parseEdge('a ~> b').kind, 'async');
  assert.equal(parseEdge('a ..> b: read').kind, 'data');
  assert.equal(parseEdge('a --> b').kind, 'return');
  assert.equal(parseEdge('a -- b').kind, 'weak');
  assert.throws(() => parseEdge('a b'), SpecError);
});

test('spec errors name the problem', () => {
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a' }], edges: ['a -> ghost'] }), /unknown node "ghost"/);
  assert.throws(() => normalizeSpec({ kind: 'nope' }), /Unknown kind/);
  assert.throws(() => normalizeSpec({ tiers: ['x'], nodes: [{ id: 'a', tier: 'y' }] }), /tier "y"/);
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a' }, { id: 'b' }], edges: ['a -> b'], flows: [{ steps: ['b -> a'] }] }), /matches no edge/);
});

test('duplicate wires get distinct ids and flows can address them', () => {
  const s = normalizeSpec({ nodes: ['a', 'b'], edges: ['a -> b: one', 'a -> b: two'], flows: [{ steps: [{ edge: 'a->b#2' }] }] });
  assert.deepEqual(s.edges.map((e) => e.id), ['a->b', 'a->b#2']);
  assert.equal(s.flows[0].steps[0].text, 'two');
});

test('measurement uses Geist widths', () => {
  assert.ok(measure('Order service', { face: 'sans', weight: 500, size: 13 }) > 70);
  assert.ok(measure('iiii', { face: 'mono', weight: 400, size: 11 }) === measure('mmmm', { face: 'mono', weight: 400, size: 11 }));
  assert.equal(wrap('one two three four five six', { face: 'sans', weight: 500, size: 13 }, 60, 2).length, 2);
});

for (const file of readdirSync(EXAMPLES)) {
  test(`example ${file} lays out cleanly and deterministically`, async () => {
    const a = await buildModel(loadSpec(EXAMPLES + file));
    const b = await buildModel(loadSpec(EXAMPLES + file));
    assert.deepEqual(a.model, b.model, 'same spec, same positions');
    const result = checkModel(a.model);
    const errors = result.issues.filter((i) => i.level === 'error');
    assert.deepEqual(errors, [], `no errors in ${file}`);
    for (const n of a.model.nodes) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && n.w > 0 && n.h > 0, `${n.id} has a box`);
      assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= a.model.width && n.y + n.h <= a.model.height, `${n.id} is on the canvas`);
    }
    for (const e of a.model.edges) assert.ok(e.points.length >= 2, `${e.id} is routed`);
  });
}

test('check finds overlaps and wires through parts', () => {
  const model = {
    engine: 'graph', kind: 'architecture', direction: 'right', width: 400, height: 200,
    nodes: [
      { id: 'a', x: 10, y: 10, w: 80, h: 40 },
      { id: 'b', x: 60, y: 20, w: 80, h: 40 },
      { id: 'c', x: 300, y: 10, w: 80, h: 40 },
      { id: 'mid', x: 180, y: 110, w: 60, h: 40 },
    ],
    edges: [{ id: 'a->c', from: 'a', to: 'c', points: [[90, 130], [300, 130]] }],
    groups: [], flows: [],
  };
  const codes = checkModel(model).issues.map((i) => i.code);
  assert.ok(codes.includes('overlap'));
  assert.ok(codes.includes('edge-through'));
});

test('brief facts parse with sources and status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-'));
  const p = join(dir, 'brief.md');
  writeFileSync(p, '---\nstatus: approved\n---\n# X\n## Facts\n- F1: Keys expire after 24 hours. (source: https://example.com/a, src/x.ts:4)\n- F2: Unsourced claim.\n');
  const b = parseBrief(p);
  assert.equal(b.status, 'approved');
  assert.deepEqual(b.facts.F1.sources, ['https://example.com/a', 'src/x.ts:4']);
  assert.deepEqual(b.facts.F2.sources, []);
});

test('html page is self-contained and the viewer bundle has no module syntax', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}architecture.yaml`));
  const html = htmlPage(model);
  assert.match(html, /<script type="application\/json" id="diagram-model">/);
  assert.match(html, /@font-face/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/, 'no external requests');
  const bundle = bundleViewer();
  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m);
  assert.match(bundleViewer({ esm: true }), /export \{ mountDiagram/);
});

test('static SVG resolves every colour (no CSS variables for the PNG renderer)', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}sequence.yaml`));
  const svg = staticSvg(model);
  assert.doesNotMatch(svg, /var\(--/);
  assert.match(svg, /font-weight="500"/);
});

// --- Regressions from the independent review (2026-11-17)
const { themeCss } = await imp('assets/viewer/theme.mjs');
const { renderSvg } = await imp('assets/viewer/render.mjs');

test('spec text cannot inject markup: shapes, tones, kinds and theme values are checked', () => {
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a', shape: 'box"><image onerror="x"/>' }] }), /shape/);
  assert.throws(() => normalizeSpec({ nodes: [{ id: 'a', tone: 'red" onmouseover="x' }] }), /tone/);
  assert.throws(() => normalizeSpec({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b', kind: 'evil"' }] }), /kind/);
  assert.throws(() => normalizeSpec({ theme: { light: { accent: '#fff; } </style><script>x</script>' } } }), /not allowed/);
  const css = themeCss({ light: { accent: 'red}</style><script>x</script>', 'bad-key': 'red' } });
  assert.doesNotMatch(css, /<script|bad-key/);
  const svg = renderSvg({ width: 10, height: 10, nodes: [{ id: 'a"b', label: '<b>', shape: 'box"x', x: 0, y: 0, w: 5, h: 5 }], edges: [], groups: [] }, { mode: 'vars' });
  assert.doesNotMatch(svg, /data-shape="box"x/);
  assert.doesNotMatch(svg, /<b>/);
});

test('malformed sequences fail with a spec error, not a crash', () => {
  const base = { kind: 'sequence', participants: ['a', 'b'] };
  assert.throws(() => normalizeSpec({ ...base, messages: [{ note: 'hi' }] }), /over/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'loop', steps: ['a -> b'] }] }), /no messages/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'alt', messages: ['a -> b'], else: { label: 'x' } }] }), /must be a list/);
  assert.throws(() => normalizeSpec({ ...base, messages: [null] }), /empty/);
  assert.throws(() => normalizeSpec({ ...base, messages: [{ block: 'when', messages: ['a -> b'] }] }), /Block/);
});

test('duplicate edge ids are rejected', () => {
  assert.throws(() => normalizeSpec({ nodes: ['a', 'b', 'c'], edges: [{ from: 'a', to: 'b', id: 'x' }, { from: 'b', to: 'c', id: 'x' }] }), /Duplicate edge id/);
});

test('a grouped part with a different tier is warned about', () => {
  const s = normalizeSpec({ tiers: ['one', 'two'], groups: [{ id: 'g', tier: 'one' }], nodes: [{ id: 'a', group: 'g', tier: 'two' }] });
  assert.ok(s.warnings.some((w) => w.code === 'tier'));
});

test('brief status comes from the front matter only, and checked dates are not sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-'));
  const p = join(dir, 'b.md');
  writeFileSync(p, '---\nstatus: "approved"\n---\n- F1: x. (source: https://en.wikipedia.org/wiki/Saga_(pattern), checked 2026-11-17)\n');
  const b = parseBrief(p);
  assert.equal(b.status, 'approved');
  assert.deepEqual(b.facts.F1.sources, ['https://en.wikipedia.org/wiki/Saga_(pattern)']);
  assert.equal(b.facts.F1.checked, '2026-11-17');
  writeFileSync(p, '# Title\n\n---\nstatus: approved\n');
  assert.equal(parseBrief(p).status, 'draft');
});

test('in a cycle the first declared transition runs forward', async () => {
  const { model } = await buildModel(normalizeSpec({ kind: 'state', nodes: ['idle', 'busy'], edges: ['idle -> busy: start', 'busy -> idle: done'] }));
  const x = Object.fromEntries(model.nodes.map((n) => [n.id, n.x]));
  assert.ok(x.idle < x.busy);
});

test('a wire to a table without a field attaches at the header, not a corner', async () => {
  const { model } = await buildModel(normalizeSpec({ kind: 'datamodel', nodes: [{ id: 't', fields: ['id uuid pk'] }, 'audit'], edges: ['t -> audit'] }));
  const t = model.nodes.find((n) => n.id === 't');
  const [x, y] = model.edges[0].points[0];
  assert.ok(Math.abs(y - (t.y + 18)) < 2 && (Math.abs(x - t.x) < 1 || Math.abs(x - (t.x + t.w)) < 1));
});

test('crossings between wires that share a part are counted away from that part', () => {
  const model = {
    engine: 'graph', kind: 'graph', direction: 'right', width: 400, height: 400, groups: [], flows: [],
    nodes: [{ id: 'a', x: 0, y: 0, w: 40, h: 40 }, { id: 'b', x: 300, y: 300, w: 40, h: 40 }, { id: 'c', x: 300, y: 0, w: 40, h: 40 }],
    edges: [
      { id: 'a->b', from: 'a', to: 'b', points: [[40, 20], [200, 20], [200, 320], [300, 320]] },
      { id: 'a->c', from: 'a', to: 'c', points: [[20, 40], [20, 150], [320, 150], [320, 40]] },
    ],
  };
  assert.equal(checkModel(model).stats.crossings, 1);
});

test('the CLI keeps the spec path after boolean flags and contains --name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-cli-'));
  const cli = SKILL + 'scripts/diagram.mjs';
  execFileSync('node', [cli, 'build', '--dark', SKILL + 'examples/tree.yaml', '--out', dir, '--name', '../escape', '--no-html'], { encoding: 'utf8' });
  assert.deepEqual(readdirSync(dir).sort(), ['escape.dark.png', 'escape.layout.json', 'escape.png']);
});

test('React output is a client component with scoped tokens and bundled fonts', async () => {
  const { model } = await buildModel(loadSpec(`${EXAMPLES}tree.yaml`));
  const files = reactFiles(model, { name: 'tree' });
  assert.match(files['Diagram.tsx'], /^'use client';/);
  assert.match(files['diagram.css'], /\.dk-root \{ --dk-bg/);
  assert.doesNotMatch(files['diagram.css'], /:root \{/);
  assert.ok(files['fonts/Geist-Medium.woff2'].length > 1000);
});

test('a copy without node_modules points at setup instead of crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-nodeps-'));
  execFileSync('cp', ['-R', join(SKILL, 'scripts', 'lib'), join(SKILL, 'scripts', 'diagram.mjs'), join(SKILL, 'scripts', 'package.json'), join(SKILL, 'scripts', 'package-lock.json'), dir]);
  let out = '';
  try {
    execFileSync('node', [join(dir, 'diagram.mjs'), 'check', 'x.yaml'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, DIAGRAM_KIT_DEPS: join(dir, 'none') } });
  } catch (err) {
    out = err.stderr;
    assert.equal(err.status, 2);
  }
  assert.match(out, /diagram\.mjs" setup/);
});

test('unknown fields are reported (a comma in a YAML flow value splits it)', () => {
  const s = normalizeSpec({ nodes: [{ id: 'a', sub: 'measures', previews: null }] });
  assert.ok(s.warnings.some((w) => w.code === 'field' && /previews/.test(w.message)));
});

test('a page holds several diagrams with distinct ids and only safe links', async () => {
  const a = await buildModel(loadSpec(`${EXAMPLES}tree.yaml`));
  const b = await buildModel(loadSpec(`${EXAMPLES}sequence.yaml`));
  const html = pageHtml(
    { title: 'Demo <b>', repo: 'javascript:alert(1)', sections: [{ spec: 'a', hero: true }, { spec: 'b', label: 'Sequence', showSpec: true }] },
    [{ section: { hero: true }, model: a.model }, { section: { label: 'Sequence', showSpec: true }, model: b.model, specText: 'kind: sequence # <script>' }],
  );
  assert.equal((html.match(/class="pg-frame"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /javascript:alert/);
  assert.doesNotMatch(html, /<b>|# <script>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/);
  assert.match(html, /embedded: true/);
  // Headings and embedded pages take no diagram slot: frame i shows the i-th diagram.
  const mixed = pageHtml({ title: 'x', sections: [] }, [
    { section: { heading: 'How it works' } },
    { section: { label: 'A' }, model: a.model },
    { section: { iframe: '3d/index.html', title: '3D' } },
    { section: { label: 'B' }, model: b.model },
  ]);
  const models = JSON.parse(mixed.match(/id="diagram-models">([^<]*)</)[1].replace(/\\u003c/g, '<'));
  assert.deepEqual(models.map((m) => m.kind), ['tree', 'sequence']);
  assert.deepEqual([...mixed.matchAll(/data-i="(\d+)"/g)].map((m) => m[1]), ['0', '1']);
  assert.throws(() => pageHtml({ sections: [] }, [{ section: { iframe: 'javascript:alert(1)' } }]), /iframe/);
  // Link previews need absolute https addresses: a relative image resolves against url, anything else is dropped.
  const og = pageHtml({ title: 'x', tagline: 'long', description: 'short', url: 'https://a.dev/kit/', image: 'og.png', sections: [] }, []);
  assert.match(og, /name="description" content="short"/);
  assert.match(og, /property="og:site_name" content="x"/);
  assert.match(og, /property="og:image" content="https:\/\/a\.dev\/kit\/og\.png"/);
  assert.match(og, /name="twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(pageHtml({ title: 'x', url: 'javascript:alert(1)', image: 'og.png', sections: [] }, []), /og:|javascript/);
});

test('--spacing widens gaps but keeps every part its size', async () => {
  const { spacingOptions } = await imp('scripts/lib/layout-graph.mjs');
  const spec = loadSpec(`${EXAMPLES}architecture.yaml`);
  const a = (await buildModel(spec)).model;
  const b = (await buildModel(loadSpec(`${EXAMPLES}architecture.yaml`), { options: spacingOptions(4) })).model;
  assert.ok(b.width > a.width * 1.5);
  for (const n of a.nodes) {
    const m = b.nodes.find((x) => x.id === n.id);
    assert.equal(m.w, n.w);
    assert.equal(m.h, n.h);
  }
  assert.equal(checkModel(b).ok, true);
  // Spacing reaches inside groups too (ELK reads it per group).
  const gap = (m) => { const p = m.nodes.find((n) => n.id === 'api'); const q = m.nodes.find((n) => n.id === 'writer'); return Math.abs(q.y - p.y) - p.h; };
  assert.ok(gap(b) > gap(a) * 2, `inside-group gap grew: ${gap(a)} -> ${gap(b)}`);
  // Groups use the same spacing as the root by default (ELK's own default would be 20).
  assert.ok(gap(a) >= 26, `inside-group gap matches the root: ${gap(a)}`);
  assert.throws(() => spacingOptions(0), /positive/);
});

test('layout: { spacing } in the spec equals --spacing', async () => {
  const { spacingOptions } = await imp('scripts/lib/layout-graph.mjs');
  const viaFlag = (await buildModel(loadSpec(`${EXAMPLES}architecture.yaml`), { options: spacingOptions(2) })).model;
  const spec = loadSpec(`${EXAMPLES}architecture.yaml`);
  const viaSpec = (await buildModel({ ...spec, layout: { ...spec.layout, spacing: 2 } })).model;
  assert.deepEqual(viaSpec.nodes.map((n) => [n.id, n.x, n.y]), viaFlag.nodes.map((n) => [n.id, n.x, n.y]));
});

test('variants differ visibly, show both directions, and the printed settings rebuild them exactly', async () => {
  const { layoutVariants, contactSheet, settingsYaml } = await imp('scripts/lib/variants.mjs');
  const spec = loadSpec(`${EXAMPLES}architecture.yaml`);
  const { variants } = await layoutVariants(spec, { count: 6 });
  assert.ok(variants.length >= 2);
  assert.deepEqual([...new Set(variants.map((v) => v.settings.direction))].sort(), ['down', 'right']);
  for (let i = 1; i < variants.length; i++) assert.ok(variants[i].stats.score >= variants[i - 1].stats.score || variants[i].settings.direction !== spec.direction);
  for (const v of variants) {
    const yaml = dep('yaml').parse(settingsYaml(v.settings));
    const again = (await buildModel({ ...spec, direction: yaml.direction, layout: { ...spec.layout, ...(yaml.layout ?? {}) } })).model;
    assert.deepEqual(again.nodes.map((n) => [n.id, n.x, n.y]), v.model.nodes.map((n) => [n.id, n.x, n.y]), `${v.name} rebuilds from its settings`);
  }
  const sheet = contactSheet(variants, (m, idPrefix) => staticSvg(m, { title: false, background: false, idPrefix }));
  for (const v of variants) assert.equal(sheet.split(`id="${v.name}-shadow"`).length - 1, 1, `${v.name} has its own ids`);
  await assert.rejects(layoutVariants(loadSpec(`${EXAMPLES}sequence.yaml`)), /one layout/);
});

test('the variants command writes a contact sheet, one preview per variant and their settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dk-var-'));
  const out = execFileSync('node', [SKILL + 'scripts/diagram.mjs', 'variants', SKILL + 'examples/flowchart.yaml', '--out', dir, '--count', '3'], { encoding: 'utf8' });
  assert.match(out, /v1 {2}/);
  const files = readdirSync(dir);
  assert.ok(files.includes('sheet.png') && files.includes('variants.json') && files.includes('v1.png') && files.includes('v1.layout.json'));
});

test('a group with its own direction runs across the picture, and wires reach its parts or the group', async () => {
  const raw = {
    kind: 'architecture', direction: 'down',
    groups: [{ id: 'kit', label: 'Kit', direction: 'right' }],
    nodes: [{ id: 'you', label: 'You' }, { id: 'a', label: 'A', group: 'kit' }, { id: 'b', label: 'B', group: 'kit' }, { id: 'c', label: 'C', group: 'kit' }, { id: 'out', label: 'Out' }],
    edges: ['you -> kit: ask', 'a -> b', 'b -> c', 'you -> a', 'c -> out'],
  };
  const { model } = await buildModel(normalizeSpec(raw));
  const at = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  const kit = model.groups.find((g) => g.id === 'kit');
  assert.equal(kit.direction, 'right');
  // One row, left to right, inside the group, which sits between You and Out.
  assert.ok(at.a.y === at.b.y && at.b.y === at.c.y && at.a.x < at.b.x && at.b.x < at.c.x);
  for (const n of [at.a, at.b, at.c]) assert.ok(n.x >= kit.x && n.x + n.w <= kit.x + kit.w && n.y >= kit.y && n.y + n.h <= kit.y + kit.h);
  assert.ok(at.you.y + at.you.h < kit.y && kit.y + kit.h < at.out.y);
  const wire = Object.fromEntries(model.edges.map((e) => [e.id, e.points]));
  // A wire to the group ends on its border; a wire to a part inside runs on to that part.
  assert.equal(wire['you->kit'].at(-1)[1], kit.y);
  assert.equal(wire['you->a'].at(-1)[1], at.a.y);
  assert.equal(wire['c->out'][0][1], at.c.y + at.c.h);
  assert.equal(wire['a->b'][0][1], wire['a->b'].at(-1)[1]);
  const c = checkModel(model);
  assert.equal(c.issues.filter((i) => i.level !== 'info').length, 0, JSON.stringify(c.issues));
  // A plain group (same direction as the picture) takes wires too.
  const plain = await buildModel(normalizeSpec({ ...raw, direction: 'right' }));
  assert.ok(plain.model.edges.every((e) => e.points.length >= 2));
  assert.throws(() => normalizeSpec({ kind: 'architecture', groups: [{ id: 'g' }], nodes: [{ id: 'a', group: 'g' }], edges: ['a -> g'] }), /group it sits in/);
  assert.throws(() => normalizeSpec({ kind: 'architecture', direction: 'down', groups: [{ id: 'g', direction: 'right' }, { id: 'h', parent: 'g' }], nodes: [] }), /holds parts only/);
  assert.throws(() => normalizeSpec({ kind: 'architecture', groups: [{ id: 'g', direction: 'sideways' }], nodes: [] }), /direction must be/);
});

test('back wires inside a group loop along the side, keep the main line straight and share one return line', async () => {
  const raw = {
    kind: 'flowchart', direction: 'down',
    groups: [{ id: 'kit', label: 'Kit' }],
    nodes: [{ id: 'go', label: 'Go' }, { id: 'a', label: 'Shape it', group: 'kit' }, { id: 'b', label: 'Lay it out', group: 'kit' }, { id: 'c', label: 'Check by code', group: 'kit' }, { id: 'd', label: 'Check by eye', group: 'kit' }, { id: 'out', label: 'Ship' }],
    edges: [
      { from: 'go', to: 'a', main: true }, { from: 'a', to: 'b', main: true }, { from: 'b', to: 'c', main: true }, { from: 'c', to: 'd', main: true }, { from: 'd', to: 'out', main: true },
      { from: 'd', to: 'a', label: 'wrong', kind: 'return', back: true }, { from: 'c', to: 'a', kind: 'return', back: true },
    ],
  };
  const { model } = await buildModel(normalizeSpec(raw));
  const at = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  // The main line is one straight column, in order.
  const centres = model.nodes.map((n) => Math.round(n.x + n.w / 2));
  assert.ok(centres.every((x) => x === centres[0]), centres.join(','));
  for (const [p, q] of [['go', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'out']]) assert.ok(at[p].y < at[q].y);
  // Both back wires leave their part's right side and meet on one line into the right side of A.
  // The shared stretch is drawn once: D's wire runs the whole line with the arrow; C's stops where
  // it joins, without an arrowhead.
  const wire = Object.fromEntries(model.edges.map((e) => [e.id, e.points]));
  for (const [id, from] of [['d->a', at.d], ['c->a', at.c]]) assert.equal(wire[id][0][0], from.x + from.w);
  assert.equal(wire['d->a'].at(-1)[0], at.a.x + at.a.w);
  assert.equal(wire['d->a'][1][0], wire['c->a'][1][0]);
  assert.deepEqual(wire['c->a'].at(-1), [wire['d->a'][1][0], wire['c->a'][0][1]]);
  assert.equal(model.edges.find((e) => e.id === 'c->a').arrow, false);
  assert.notEqual(model.edges.find((e) => e.id === 'd->a').arrow, false);
  // The return line runs outside the group, which keeps to its parts.
  const kit = model.groups.find((g) => g.id === 'kit');
  const right = Math.max(...['a', 'b', 'c', 'd'].map((id) => at[id].x + at[id].w));
  assert.equal(kit.x + kit.w, right + 18);
  assert.ok(wire['d->a'][1][0] > kit.x + kit.w);
  const label = model.edges.find((e) => e.id === 'd->a').labelBox;
  assert.ok(label.x > kit.x + kit.w);
  const c = checkModel(model);
  assert.equal(c.stats.crossings, 0);
  assert.equal(c.issues.filter((i) => i.level !== 'info').length, 0, JSON.stringify(c.issues));
});

test('a group with an icon is a part holding smaller parts, and sameSize evens out boxes', async () => {
  const raw = {
    kind: 'architecture', direction: 'down',
    layout: { sameSize: ['a', 'c'] },
    groups: [{ id: 'eng', label: 'Engines', icon: 'sigma', tone: 'blue' }],
    nodes: [{ id: 'a', label: 'Start here please' }, { id: 'x', label: 'X', group: 'eng' }, { id: 'y', label: 'Y two', group: 'eng' }, { id: 'z', label: 'Zed', group: 'eng' }, { id: 'c', label: 'C' }],
    edges: [{ from: 'a', to: 'eng', main: true }, { from: 'eng', to: 'c', main: true }],
  };
  const { model } = await buildModel(normalizeSpec(raw));
  const at = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
  const eng = model.groups.find((g) => g.id === 'eng');
  assert.equal(eng.icon, 'sigma');
  assert.ok(model.icons.sigma);
  // Its parts sit in one row, in order, under its name row, and it stays snug around them.
  assert.ok(at.x.y === at.y.y && at.y.y === at.z.y && at.x.x < at.y.x && at.y.x < at.z.x);
  assert.ok(at.x.y >= eng.y + 40 && at.x.x >= eng.x && at.z.x + at.z.w <= eng.x + eng.w);
  assert.ok(eng.h <= 40 + at.x.h + 24, `container height ${eng.h}`);
  // Wires stop at its border.
  const wire = Object.fromEntries(model.edges.map((e) => [e.id, e.points]));
  assert.equal(wire['a->eng'].at(-1)[1], eng.y);
  assert.equal(wire['eng->c'][0][1], eng.y + eng.h);
  // A list evens out just those parts; a list of lists makes sets; true evens out every box.
  assert.equal(at.a.w, at.c.w);
  assert.notEqual(at.x.w, at.a.w);
  const all = await buildModel(normalizeSpec({ ...raw, layout: { sameSize: true } }));
  assert.equal(new Set(all.model.nodes.map((n) => `${n.w}x${n.h}`)).size, 1);
  const sets = await buildModel(normalizeSpec({ ...raw, nodes: raw.nodes.map((n) => (n.id === 'y' ? { ...n, sub: 'a second line' } : n)), layout: { sameSize: [['a', 'c'], ['x', 'y', 'z']] } }));
  const s = Object.fromEntries(sets.model.nodes.map((n) => [n.id, n]));
  assert.ok(s.x.w === s.y.w && s.y.w === s.z.w && s.x.h === s.y.h && s.y.h === s.z.h && s.x.h > s.a.h);
  assert.ok(s.a.w === s.c.w && s.a.w !== s.x.w);
  // It is drawn as a part: its name in the label font, not an uppercase zone label.
  const svg = staticSvg(model);
  assert.ok(svg.includes('Engines') && !svg.includes('ENGINES'));
  assert.throws(() => normalizeSpec({ kind: 'architecture', groups: [{ id: 'g', icon: 'sigma' }, { id: 'h', parent: 'g' }], nodes: [] }), /drawn as a part/);
  const c = checkModel(model);
  assert.equal(c.issues.filter((i) => i.level !== 'info').length, 0, JSON.stringify(c.issues));
});

test('OpenCode command invokes the shared create-diagram skill with its request', () => {
  const command = readFileSync(join(SKILL, '../../../../.opencode/commands/create-diagram.md'), 'utf8');
  assert.match(command, /create-diagram/);
  assert.match(command, /\$ARGUMENTS/);
  assert.match(command, /skill/i);
});
