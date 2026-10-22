export function resolveCliHostTarget(loginOrigin, override) {
  const login = new URL(loginOrigin);
  if (!override?.trim()) return login.origin;

  let target;
  try {
    target = new URL(override);
  } catch {
    throw new Error('DEEPSEEKBOT_HOST must be an HTTP loopback origin.');
  }
  if (
    target.protocol !== 'http:' ||
    target.hostname !== '127.0.0.1' ||
    !target.port ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('DEEPSEEKBOT_HOST must be an HTTP loopback origin.');
  return target.origin;
}
