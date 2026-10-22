function classifyRole(value) {
  const role = typeof value === 'string' ? value.toLowerCase() : '';
  if (/(?:text|entry|input)/u.test(role)) return 'input';
  if (/button/u.test(role)) return 'button';
  if (/window/u.test(role)) return 'window';
  if (/(?:document|web area)/u.test(role)) return 'document';
  return role.length > 0 ? 'other' : 'empty';
}

function classifyLabel(element) {
  const label = [element.label, element.name, element.value]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (label.includes('input')) return 'input';
  if (label.includes('submit')) return 'submit';
  return label.length > 0 ? 'other' : 'empty';
}

export function summarizeComputerWindowState(state) {
  const elements = Array.isArray(state?.elements) ? state.elements : [];
  return {
    windowStateElementCount: elements.length,
    windowStateElementsComplete:
      typeof state?.elements_complete === 'boolean' ? state.elements_complete : null,
    windowStateTruncated: typeof state?.truncated === 'boolean' ? state.truncated : null,
    windowStateNodesVisited: Number.isSafeInteger(state?.nodes_visited)
      ? state.nodes_visited
      : null,
    windowStateNodesPending: Number.isSafeInteger(state?.nodes_pending)
      ? state.nodes_pending
      : null,
    windowStateElementSummaries: elements.slice(0, 8).map((element) => ({
      roleClass: classifyRole(element.role),
      labelClass: classifyLabel(element),
      hasElementToken: typeof element.element_token === 'string',
      hasFrame: Boolean(element.frame && typeof element.frame === 'object'),
      actionCount: Array.isArray(element.actions) ? element.actions.length : null,
    })),
  };
}
