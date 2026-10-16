// Both players share the browser's single speech queue.
const owners = new WeakMap<object, { owner: object; stop: () => void }>();
export function claimSpeech(owner: object, stop: () => void, engine: object) {
  const active = owners.get(engine);
  if (active && active.owner !== owner) active.stop();
  owners.set(engine, { owner, stop });
}
export function canCancelSpeech(owner: object, engine: object) {
  const active = owners.get(engine);
  return !active || active.owner === owner;
}
export function releaseSpeech(owner: object, engine: object) {
  if (owners.get(engine)?.owner === owner) owners.delete(engine);
}
