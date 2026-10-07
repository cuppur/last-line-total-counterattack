// Run with: node tests/survival-regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, fs.readdirSync(root).find(f => f.endsWith('.html'))), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Exercise the actual game model without DOM, audio, or animation-frame timing.
const context = vm.createContext({});
vm.runInContext(script.slice(script.indexOf('const W='), script.indexOf('class Renderer')) + '\nglobalThis.model={Battle,WEAPONS};', context);
const { Battle, WEAPONS } = context.model;
const ids = WEAPONS.map(w => w.id);
const create = (variant = 'normal', difficulty = 'normal') => new Battle(['rifle', 'laser', 'tesla'], { mode: 'survival', survivalVariant: variant, difficulty }, () => .5);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

const normal = create(), all = create('allWeapons');
assert.equal(normal.loadout.length, 3);
assert.equal(all.loadout.length, 12);
assert.deepEqual(Array.from(all.loadout), Array.from(ids));
assert.equal(all.slotLevels.length, 12);
assert.equal(all.enemyLimit, normal.enemyLimit * 10);
assert.equal(new Battle(ids, { mode: 'campaign', survivalVariant: 'allWeapons' }).loadout.length, 3);
assert.equal(new Battle(ids, { mode: 'endless', survivalVariant: 'allWeapons' }).enemyLimit, 260);

// The same elapsed minute reaches the normal curve's 1.5-minute point.
for (const t of [0, 30, 60, 180, 600, 1800]) {
  all.time = t; normal.time = t * 1.5;
  for (const stat of ['hp', 'attack', 'speed']) close(all.survivalScale()[stat], normal.survivalScale()[stat]);
  normal.time = t;
  close(all.survivalDensity(), normal.survivalDensity() * 10);
}
for (const difficulty of ['normal', 'hard', 'nightmare']) {
  const n = create('normal', difficulty), a = create('allWeapons', difficulty);
  const ne = n.spawn('walker'), ae = a.spawn('walker');
  close(ne.hp, ae.hp); close(ne.speed, ae.speed); close(ne.damageScale, ae.damageScale);
}

// Compare actual continuous spawn batches across early and late stages.
for (const t of [0, 100, 300, 1000, 2000]) {
  const n = create(), a = create('allWeapons');
  for (const b of [n, a]) {
    b.time = t; b.spawnClock = 0; b.survivalBossAt = Infinity; b.survivalTitanAt = Infinity;
    b.fire = () => {}; b.update(.04);
  }
  assert.equal(a.spawned, n.spawned * 10);
  assert.equal(a.enemies.length, n.enemies.length * 10);
}
// A 30-second continuous run also retains the requested spawn ratio.
const n = create(), a = create('allWeapons');
for (const b of [n, a]) { b.fire = () => {}; b.hitBase = () => {}; }
for (let frame = 0; frame < 750; frame++) { n.update(.04); a.update(.04); }
assert.equal(a.spawned, n.spawned * 10);

// The former 260-enemy limit must not silently cap the challenge.
const crowded = create('allWeapons');
for (let i = 0; i < 2700; i++) crowded.spawn('walker');
assert.equal(crowded.enemies.length, 2600);
assert.equal(crowded.spawn('walker'), undefined);

const firing = create('allWeapons');
firing.spawn('bossCrusher');
firing.update(.04);
assert.deepEqual(new Set(firing.events.filter(e => e.type === 'shot').map(e => e.id)), new Set(ids));
assert.ok(ids.every(id => firing.skillCharge[id] > 0));

// Upgrades, evolution, and restore include the last weapon as well as the first.
const saved = create('allWeapons');
saved.state = 'reward'; saved.coins = 1000;
assert.ok(saved.boost(11));
assert.equal(saved.level(ids[11]), 2);
saved.levels[ids[11]] = 5;
assert.ok(saved.evolve(ids[11], 1));
saved.rewardPoints = 2; saved.time = 125; saved.rewardOffer = saved.upgrades();
const restored = Battle.restore(JSON.parse(JSON.stringify(saved.snapshot())));
assert.equal(restored.allWeapons, true);
assert.equal(restored.loadout.length, 12);
assert.equal(restored.level(ids[11]), 5);
assert.equal(restored.evolutions[ids[11]], 1);
assert.equal(restored.rewardPoints, 2);
assert.equal(restored.state, 'reward');
assert.equal(restored.strengthGrowthRate, 1.5);
for (const mode of ['campaign', 'endless', 'survival']) {
  const b = new Battle(['rifle', 'laser', 'tesla'], { mode });
  const snapshot = JSON.parse(JSON.stringify(b.snapshot()));
  delete snapshot.survivalVariant; snapshot.saveVersion = 9;
  const old = Battle.restore(snapshot);
  assert.equal(old.loadout.length, 3); assert.equal(old.allWeapons, false);
  assert.equal(old.mode, mode);
}
const invalid = JSON.parse(JSON.stringify(saved.snapshot()));
invalid.loadout[11] = invalid.loadout[0];
assert.throws(() => Battle.restore(invalid));

// XP awards retain exactly 40% over all reward sources, without fractional loss.
const xpNormal = create(), xpAll = create('allWeapons');
for (let i = 0; i < 10; i++) {
  xpNormal.grantSurvivalReward(['kills', 'time', 'titan'][i % 3]);
  xpAll.grantSurvivalReward(['kills', 'time', 'titan'][i % 3]);
}
assert.equal(xpNormal.rewardEarned, 10);
assert.equal(xpAll.rewardEarned, 4);
assert.equal(xpAll.rewardXp, 0);
xpAll.grantSurvivalReward('kills');
assert.equal(xpAll.rewardPoints, 4); assert.equal(xpAll.rewardXp, 40);
const xpRestored = Battle.restore(JSON.parse(JSON.stringify(xpAll.snapshot())));
assert.equal(xpRestored.rewardXp, 40);
xpRestored.grantSurvivalReward('time'); xpRestored.grantSurvivalReward('titan');
assert.equal(xpRestored.rewardEarned, 5); assert.equal(xpRestored.rewardXp, 20);
const oldFullSave = JSON.parse(JSON.stringify(xpAll.snapshot()));
oldFullSave.saveVersion = 10; delete oldFullSave.rewardXp;
const oldFull = Battle.restore(oldFullSave);
assert.equal(oldFull.rewardXp, 0); assert.equal(oldFull.rewardPoints, 4);
const milestones = create('allWeapons');
milestones.kills = 50; milestones.time = 90; milestones.spawnClock = 100;
milestones.update(.04);
assert.equal(milestones.rewardEarned, 0); assert.equal(milestones.rewardXp, 80);

// Bulk release includes all four pages, skips uncharged/active skills, and
// preserves energy when paused, when no enemy remains, or in ordinary mode.
const bulk = create('allWeapons');
ids.forEach(id => { bulk.skillCharge[id] = 100; });
assert.equal(bulk.skillAll(), 0);
assert.ok(ids.every(id => bulk.skillCharge[id] === 100));
const target = bulk.spawn('bossTitan'); target.hp = target.maxHp = 1e12;
bulk.state = 'reward'; assert.equal(bulk.skillAll(), 0);
bulk.state = 'playing';
assert.equal(bulk.skillAll(), 12);
assert.ok(ids.every(id => bulk.skillUses[id] === 1 && bulk.skillCharge[id] === 0));
assert.equal(bulk.skillAll(), 0);
const partial = create('allWeapons');
const partialTarget = partial.spawn('bossTitan'); partialTarget.hp = partialTarget.maxHp = 1e12;
partial.skillCharge.rifle = 100; partial.skillCharge.mine = 100;
partial.skillCharge.ice = 99; partial.skillCharge.laser = 100;
partial.skillCasts.push({ id: 'laser', remaining: 1 });
assert.equal(partial.skillAll(), 2);
assert.equal(partial.skillUses.mine, 1);
assert.equal(partial.skillCharge.ice, 99); assert.equal(partial.skillCharge.laser, 100);
xpNormal.spawn('bossCrusher'); xpNormal.skillCharge.rifle = 100;
assert.equal(xpNormal.skillAll(), 0); assert.equal(xpNormal.skillCharge.rifle, 100);
console.log('PASS: 12 weapons, 10x spawning, 1.5x growth, bulk skills, 40% XP, upgrades/evolution, checkpoints, legacy modes.');
