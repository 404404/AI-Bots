export function classifyComputerToolError(result) {
  const details = [
    result?.structuredContent?.error?.code,
    result?.structuredContent?.code,
    result?.error?.code,
    result?.code,
    result?.name,
    result?.message,
    ...(result?.content ?? []).map((item) => (item.type === 'text' ? item.text : '')),
  ]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
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
  if (/background[_ -]unavailable|permission[_ -]denied|not permitted/u.test(details))
    return 'input-unavailable';
  if (/timed? ?out|timeout/u.test(details)) return 'timeout';
  return 'tool-error';
}
