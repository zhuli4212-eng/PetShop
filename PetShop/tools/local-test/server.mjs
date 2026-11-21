import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GameStore, shopRules } from '../../server/game-store.mjs';
import { createPetShopServer } from '../../server/main.mjs';
import { BREEDS, careAction, makePet, SPECIES } from '../../server/care.mjs';
import { purchasePrice } from '../../server/business.mjs';
import { occupiedPetNames } from '../../server/pet-names.mjs';
import { initShow } from '../../server/show.mjs';

const rules = {
  ...shopRules,
  featureLevels: Object.fromEntries(Object.keys(shopRules.featureLevels).map(key => [key, 1])),
  raceOpensDay: { private: 1, public: 1 },
};
const day = 86400000;

class TestStore extends GameStore {
  initialize(restored, options) {
    super.initialize(restored, options);
    const state = this.state;
    state.show.scoringVersion = 2;
    if (state.localTestSeeded) return;
    state.visitBook.opening = false;
    const now = state.clock;
    const balance = state.coins;
    for (const species of ['cat', 'dog']) {
      if (state.rooms[species]) continue;
      const price = purchasePrice(state, SPECIES[species].roomCost);
      state.coins += price;
      careAction(state, 'care.unlock', { species, price }, now);
    }
    state.coins = balance;
    for (const pet of state.pets) pet.bornAt = now - day;

    const usedNames = occupiedPetNames(state);
    for (const [species, config] of Object.entries(SPECIES)) {
      state.pets.push(makePet(usedNames, species, config.breeds.at(-1), '母', now, '本地测试样本'));
      const contestant=makePet(usedNames,species,config.breeds[0],'公',now-day,'赛事测试样本');
      contestant.traits.forEach(t=>{t.grade='S+';});
      state.pets.push(contestant);
    }
    state.pets.push(makePet(usedNames, 'rabbit', 'domestic', '公', now - 10 * day, '本地测试样本'));
    const guestPet = state.pets[0];
    guestPet.traits[1].grade = 'A';
    state.visitors.active = {
      id: randomUUID(), endsAt: now + 30 * 60000,
      requirement: { species: 'rabbit', breed: guestPet.breedKey, stage: '成年',
        coat: BREEDS[guestPet.breedKey].coats[guestPet.coatIndex - 1] },
    };
    state.businessDay.arrived++;
    // Use an isolated calendar with both races in registration at first launch.
    state.show.epoch = now;
    state.show.activePrivate = null;
    state.show.weeks = {};
    state.show.v2FirstWeek = 0;
    delete state.show.calendar;
    initShow(state, now);
    state.localTestSeeded = true;
    this.save(state);
  }
}

export function createLocalTestServer(webRoot, saveDirectory) {
  return createPetShopServer(webRoot, { store: new TestStore(saveDirectory, { rules, onboarding: false }) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const manifest = JSON.parse(await readFile(path.join(root, '版本.json'), 'utf8'));
  if (manifest.mode !== 'local-test' || manifest.port !== 17940) throw Error('需要完整的本地测试包。');
  const server = createLocalTestServer(path.join(root, 'PetShop/build/web-mobile'), path.join(root, 'save-test'));
  server.listen(manifest.port, '127.0.0.1');
  for (const signal of ['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])]) {
    process.once(signal, () => server.close());
  }
}
