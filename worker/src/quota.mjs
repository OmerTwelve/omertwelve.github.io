// Rolling windows, bounded by the global daily quota. Pure for local testing.
export function consume(events, ip, now, limits) {
  events = events.filter(event => now - event.time < 86400000);
  const own = events.filter(event => event.ip === ip);
  const minute = own.filter(event => now - event.time < 60000);
  for (const [hits, cap, window, scope] of [
    [minute, limits.minute, 60000, 'minute'],
    [own, limits.day, 86400000, 'day'],
    [events, limits.global, 86400000, 'global'],
  ]) {
    if (hits.length >= cap) return { events, allowed: false, scope,
      retry: Math.max(1, Math.ceil((hits[0].time + window - now) / 1000)) };
  }
  events.push({ ip, time: now });
  return { events, allowed: true };
}
