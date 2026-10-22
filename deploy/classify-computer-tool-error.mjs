export function classifyComputerToolError(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const structured = result?.structuredContent;
  const details = [
    structured?.error?.code,
    structured?.code,
    structured?.refusal?.code,
    structured?.refusal?.message,
    structured?.error?.refusal?.code,
    structured?.error?.refusal?.message,
    structured?.message,
    structured?.detail,
    result?.error?.code,
    result?.code,
    result?.name,
    result?.message,
    ...content.map((item) => (item.type === 'text' ? item.text : '')),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/snapshot[_ -]?id[_ -]?required/u.test(details)) return 'snapshot-required';
  if (/stale[_ -]?(?:element|snapshot)|stale_element_token/u.test(details)) return 'stale-element';
  if (
    /window[_ -]?(?:id[_ -]?)?not[_ -]?found|window_owner_pid_mismatch|no windows? found/u.test(
      details,
    )
  )
    return 'window-not-found';
  if (/at[_ -]?spi|accessibility|ax[_ -]window[_ -]unresolved/u.test(details))
    return 'accessibility-unavailable';
  if (/point[_ -]outside[_ -]window|invalid[_ -]coordinate/u.test(details))
    return 'invalid-coordinate';
  if (/background[_ -]unavailable/u.test(details)) return 'background-unavailable';
  if (/permission[_ -]denied|not permitted/u.test(details)) return 'permission-denied';
  if (/timed? ?out|timeout/u.test(details)) return 'timeout';
  return 'tool-error';
}
