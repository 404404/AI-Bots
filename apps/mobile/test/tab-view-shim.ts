import { createElement, type ReactNode } from 'react';

type Route = { key: string };
export function TabView({
  navigationState,
  onIndexChange,
  renderTabBar,
  renderScene,
}: {
  navigationState: { index: number; routes: Route[] };
  onIndexChange(index: number): void;
  renderTabBar(props: object): ReactNode;
  renderScene(props: { route: Route }): ReactNode;
}) {
  const { routes, index } = navigationState;
  return createElement(
    'div',
    null,
    renderTabBar({
      position: { interpolate: () => 0 },
      jumpTo: (key: string) => onIndexChange(routes.findIndex((route) => route.key === key)),
    }),
    createElement('button', {
      'data-testid': 'pager-next',
      onClick: () => onIndexChange(Math.min(index + 1, routes.length - 1)),
    }),
    createElement('button', {
      'data-testid': 'pager-previous',
      onClick: () => onIndexChange(Math.max(index - 1, 0)),
    }),
    renderScene({ route: routes[index]! }),
  );
}
