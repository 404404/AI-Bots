import type { useRouter } from 'expo-router';

type Router = Pick<ReturnType<typeof useRouter>, 'canGoBack' | 'back' | 'replace'>;

export function leaveScreen(router: Router): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
