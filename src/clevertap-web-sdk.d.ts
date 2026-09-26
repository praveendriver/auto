/**
 * The CleverTap Web SDK ships no types. Declare the surface we actually use,
 * from its README, rather than pulling in `any` for the whole module — a
 * typo in a method name should still be a compile error.
 */
declare module 'clevertap-web-sdk' {
  type Props = Record<string, unknown>;

  interface CleverTap {
    init(accountId: string, region?: string, targetDomain?: string): void;
    spa: boolean;
    setLogLevel(level: 0 | 1 | 2 | 3): void;
    setOffline(offline: boolean): void;
    event: { push(name: string, props?: Props): void };
    profile: { push(profile: { Site: Props }): void };
    onUserLogin: { push(profile: { Site: Props }): void };
    privacy: { push(setting: { optOut?: boolean; useIP?: boolean }): void };
    notifications: { push(config: Props): void };
  }

  const clevertap: CleverTap;
  export default clevertap;
}
