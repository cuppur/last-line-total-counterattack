// Run with: node tests/survival-regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, '最后防线_全面反击_v2-8.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Exercise the actual game model without DOM, audio, or animation-frame timing.
const context = vm.createContext({});
vm.runInContext(script.slice(script.indexOf('const W='), script.indexOf('class Renderer')) + '\nglobalThis.model={Battle,WEAPONS,weaponStats};', context);
const { Battle, WEAPONS, weaponStats } = context.model;
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
assert.equal(saved.evolutionStage(ids[11]), 1);
saved.rewardPoints = 2; saved.time = 125; saved.rewardOffer = saved.upgrades();
const restored = Battle.restore(JSON.parse(JSON.stringify(saved.snapshot())));
assert.equal(restored.allWeapons, true);
assert.equal(restored.loadout.length, 12);
assert.equal(restored.level(ids[11]), 5);
assert.equal(restored.evolutionStage(ids[11]), 1);
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
// Automatic stages retain both existing effects; querying stats never compounds bonuses.
const damageMultipliers = { laser:1.3, tesla:1.35, ice:1.4, rocket:1.5, flame:1.2, blackhole:1.2, acid:1.4, drone:1.4, scatter:1.45, mortar:1.3, mine:1.25 };
for (const level of [4, 5, 19, 20, 21]) {
  const b = create('allWeapons');
  const stage = level >= 20 ? 2 : level >= 5 ? 1 : 0;
  for (const id of ids) {
    b.levels[id] = level;
    assert.equal(b.evolutionStage(id), stage);
    const expected = weaponStats(id, level);
    if (stage >= 1) {
      if (['ice','blackhole'].includes(id)) expected.radius *= 1.35;
      if (['acid','mine'].includes(id)) expected.radius *= 1.4;
      if (id === 'tesla') expected.chain += 3;
      if (id === 'ice') expected.slow += 1;
      if (id === 'rifle') expected.damage *= 1.2;
    }
    if (stage >= 2) {
      expected.damage *= damageMultipliers[id] || 1;
      if (id === 'laser') expected.width *= 1.5;
      if (id === 'rocket') expected.radius *= .85;
      if (id === 'flame') expected.range += 100;
      if (id === 'blackhole') expected.duration += 2;
      if (id === 'acid') expected.duration += 1;
      if (id === 'mortar') expected.radius *= 1.3;
      if (id === 'drone') expected.interval /= 1.15;
    }
    for (const actual of [b.statsFor(id), b.statsFor(id)]) {
      for (const key of Object.keys(expected)) close(actual[key], expected[key]);
    }
  }
  b.spawn('bossCrusher', 210, 390).hp = 1e12;
  for (const id of ids) {
    b.shots = []; b.pools = []; b.effects = [];
    b.fire(id);
    if (id === 'rifle') assert.equal(b.shots.length, stage === 2 ? 5 : stage === 1 ? 3 : 1);
    if (id === 'laser') {
      assert.equal(b.effects.filter(e => e.kind === 'beam').length, stage ? 4 : 1);
      b.effects.forEach(e => close(e.width, b.statsFor(id).width));
    }
    if (id === 'rocket') {
      assert.equal(b.shots.length, stage ? 2 : 1);
      b.shots.forEach(s => { close(s.damage, b.statsFor(id).damage * (stage ? .75 : 1)); close(s.blastRadius, b.statsFor(id).radius); });
    }
    if (['drone','scatter'].includes(id)) assert.ok(b.shots.every(s => s.homing === (stage >= 1)));
    if (id === 'scatter') assert.equal(b.shots.length, stage ? 7 : 5);
    if (['mortar','mine'].includes(id)) assert.equal(b.pools.length, stage ? 2 : 1);
  }
}
// Stage two keeps the wide flame cone and doubled black-hole pull from stage one.
for (const level of [4,5,20]) {
  const flame = create('allWeapons'); flame.levels.flame = level;
  flame.aim = {x:210,y:380}; flame.spawn('walker',210,380).hp = 1e6;
  const side = flame.spawn('walker',403,450); const before = side.hp;
  flame.fire('flame'); assert.equal(side.hp < before, level >= 5);
  const gravity = create('allWeapons'); gravity.levels.blackhole = level;
  gravity.spawnClock = Infinity; gravity.fire = () => {};
  const e = gravity.spawn('walker',250,300); e.speed = 0;
  gravity.pools.push({id:'blackhole',x:210,y:300,r:100,life:10,tick:100,damage:0});
  gravity.update(.04); close(250-e.x, 32*.04*(level >= 5 ? 2 : 1));
}
// Ordinary upgrades and effective slot/wave levels trigger stages without selection.
for (const threshold of [5, 20]) {
  const b = create('allWeapons'); b.levels.mine = threshold - 1;
  assert.equal(b.evolutionStage('mine'), threshold === 5 ? 0 : 1);
  b.improve('mine'); assert.equal(b.evolutionStage('mine'), threshold === 5 ? 1 : 2);
  const slot = create(); slot.slotLevels[0] = threshold;
  assert.equal(slot.evolutionStage('rifle'), threshold === 5 ? 1 : 2);
  const wave = new Battle(['rifle','laser','tesla'], {mode:'endless'});
  wave.wave = (threshold - 1) * 5; wave.startWave();
  assert.equal(wave.evolutionStage('rifle'), threshold === 5 ? 1 : 2);
}
// Old mutually exclusive choices become level-based stages, keeping levels and resources.
for (const level of [4,5,19,20,25]) for (const oldPath of [undefined,0,1]) {
  const b = create('allWeapons'); ids.forEach(id => b.levels[id] = level);
  const snapshot = JSON.parse(JSON.stringify(b.snapshot()));
  snapshot.saveVersion = 11; snapshot.evolutions = Object.fromEntries(ids.map(id => [id,oldPath]));
  snapshot.rewardXp = 80; snapshot.coins = 1200;
  const migrated = Battle.restore(snapshot);
  ids.forEach(id => {
    assert.equal(migrated.level(id), level);
    assert.equal(migrated.evolutionStage(id), level >= 20 ? 2 : level >= 5 ? 1 : 0);
    close(migrated.statsFor(id).damage, b.statsFor(id).damage);
  });
  assert.equal(migrated.coins, 1200); assert.equal(migrated.rewardXp, 80);
  assert.equal(migrated.saveVersion, 12);
  assert.equal('evolutions' in migrated.snapshot(), false);
}
assert.equal(html.includes('data-evolve='), false);
console.log('PASS: 12 weapons, 10x spawning, 1.5x growth, bulk skills, 40% XP, automatic stacked Lv.5/Lv.20 evolutions, checkpoints, legacy modes.');
