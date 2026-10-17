export function fixtureExpression(
  mode: string,
  state: {
    config: { environment: string };
    userId: string;
    accessToken?: string;
    refreshToken?: string;
  },
): string;
export function targetSocket(
  target:
    | {
        deviceName: string;
        appId: string;
        webSocketDebuggerUrl: string;
      }
    | undefined,
  port: number,
  simulatorName: string,
): URL;
