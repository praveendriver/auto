/**
 * Product analytics via CleverTap, on its India region so the data stays in
 * the country. Kept deliberately thin: one file, four exports, so the vendor
 * can be swapped again without touching a single call site in the game.
 *
 * Identity is an anonymous install id in localStorage — enough to answer
 * "who came back" without knowing who anyone is. No names, no emails, and
 * nothing the player types is ever sent.
 *
 * With no VITE_CLEVERTAP_ID set, every call is a no-op (logged in dev), so
 * the game builds and runs identically before the account exists.
 */

const ACCOUNT_ID = import.meta.env.VITE_CLEVERTAP_ID as string | undefined;
/** in1 = India. Others: us1, eu1, sg1, aps3, mec1. Must match the dashboard. */
const REGION = (import.meta.env.VITE_CLEVERTAP_REGION as string | undefined) ?? 'in1';
const INSTALL_KEY = 'auto_install_id';

/**
 * Whether CleverTap may use the request IP.
 *
 * `false` (default) is the privacy-preserving choice and means no IP-derived
 * location. Set `VITE_CLEVERTAP_USE_IP=true` if you want city/country in the
 * dashboard — on the in1 region that inference happens on Indian
 * infrastructure, which is most of why we're here. Device, OS, browser and
 * screen size come through either way.
 */
const USE_IP = (import.meta.env.VITE_CLEVERTAP_USE_IP as string | undefined) === 'true';

export type EventName =
  | 'app_open'
  | 'run_start'
  | 'run_end'
  | 'pickup'
  | 'drop'
  | 'missed_stop'
  | 'rider_fell'
  | 'mission_done'
  | 'route_done'
  | 'share_click'
  | 'stats_send'
  | 'sound_toggle'
  | 'music_toggle';

/** Readable names in the dashboard; the code keeps its snake_case. */
const LABELS: Record<EventName, string> = {
  app_open: 'App Open',
  run_start: 'Run Start',
  run_end: 'Run End',
  pickup: 'Pickup',
  drop: 'Drop',
  missed_stop: 'Missed Stop',
  rider_fell: 'Rider Fell',
  mission_done: 'Mission Done',
  route_done: 'Route Done',
  share_click: 'Share Click',
  stats_send: 'Stats Send',
  sound_toggle: 'Sound Toggle',
  music_toggle: 'Music Toggle',
};

type Props = Record<string, unknown>;
type CleverTap = typeof import('clevertap-web-sdk').default;

let client: CleverTap | null = null;
let enabled = false;
/** Events fired before the SDK finishes loading. Flushed on arrival. */
const queue: { name: string; props: Props }[] = [];
/** Attached to every event, the way PostHog's super properties worked. */
const superProps: Props = {};

export function installId(): string {
  try {
    let id = localStorage.getItem(INSTALL_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

/**
 * CleverTap accepts strings, numbers, booleans and Dates as property values —
 * not arrays or nested objects. Flatten anything else rather than let the
 * whole event be rejected.
 */
function clean(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries({ ...superProps, ...props })) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export function initAnalytics() {
  // The id exists regardless, so a WhatsApp stats message can be matched to
  // a CleverTap profile even before analytics is switched on.
  const id = installId();

  if (!ACCOUNT_ID) {
    if (import.meta.env.DEV) console.info('[analytics] no VITE_CLEVERTAP_ID — events will only be logged');
    return;
  }
  enabled = true;

  // ~40KB, and nothing depends on it for the first frame, so it loads after
  // the game is on screen rather than in the main bundle.
  void import('clevertap-web-sdk').then(({ default: clevertap }) => {
    clevertap.privacy.push({ optOut: false });
    clevertap.privacy.push({ useIP: USE_IP });
    clevertap.init(ACCOUNT_ID, REGION);
    clevertap.spa = true;
    clevertap.setLogLevel(import.meta.env.DEV ? 3 : 1);

    // Anonymous but stable, so returning players are recognised as the same
    // profile and retention cohorts are real.
    clevertap.onUserLogin.push({ Site: { Identity: id } });

    client = clevertap;
    for (const q of queue) clevertap.event.push(q.name, q.props);
    queue.length = 0;
  }).catch((err) => {
    // An ad blocker or a flaky network shouldn't take the game with it.
    if (import.meta.env.DEV) console.warn('[analytics] SDK failed to load', err);
    enabled = false;
  });
}

export function track(event: EventName, props: Props = {}) {
  const name = LABELS[event];
  if (!enabled) {
    if (import.meta.env.DEV) console.debug('[analytics]', event, props);
    return;
  }
  const payload = clean(props);
  if (client) client.event.push(name, payload);
  else queue.push({ name, props: payload });
}

/** Properties attached to every subsequent event — run count, best fare, etc. */
export function setSuper(props: Props) {
  Object.assign(superProps, props);
  // Also on the profile, so the dashboard can segment people (not just
  // events) by how much they've played.
  if (client) client.profile.push({ Site: clean(props) });
}
