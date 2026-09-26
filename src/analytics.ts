import type { PostHog } from 'posthog-js';

/**
 * Product analytics, kept deliberately thin so it's one file to swap.
 *
 * What's sent: game events (below) plus what PostHog derives on its own —
 * device, OS, browser, screen, city/region/country from the request IP, and
 * session start/end. What's *not* kept: the IP itself (turn on "Discard client
 * IP data" in the PostHog project settings so geo is derived then dropped),
 * precise location, session recordings, or anything typed.
 *
 * Identity is an anonymous install id in localStorage. That's enough to
 * answer "who came back" without knowing who anyone is.
 *
 * With no VITE_POSTHOG_KEY set, every call is a no-op (logged in dev), so the
 * game runs identically without an account.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';
const INSTALL_KEY = 'auto_install_id';

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

/**
 * PostHog is ~90KB gzipped, so it's loaded after first paint rather than in
 * the main bundle. Events fired before it arrives are queued and flushed.
 */
let client: PostHog | null = null;
let enabled = false;
const queue: { event: EventName; props: Record<string, unknown> }[] = [];
const superProps: Record<string, unknown> = {};

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

export function initAnalytics() {
  installId(); // exists regardless, so a WhatsApp stats message can be matched to a PostHog person
  if (!KEY) {
    if (import.meta.env.DEV) console.info('[analytics] no VITE_POSTHOG_KEY — events will only be logged');
    return;
  }
  enabled = true;
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST,
      person_profiles: 'identified_only',
      autocapture: false, // no DOM click capture — a canvas game has nothing useful to autocapture
      capture_pageview: false, // we send app_open ourselves
      capture_pageleave: true,
      disable_session_recording: true,
      persistence: 'localStorage',
    });
    posthog.identify(installId());
    posthog.register(superProps);
    client = posthog;
    for (const q of queue) posthog.capture(q.event, q.props);
    queue.length = 0;
  });
}



export function track(event: EventName, props: Record<string, unknown> = {}) {
  if (!enabled) {
    if (import.meta.env.DEV) console.debug('[analytics]', event, props);
    return;
  }
  if (client) client.capture(event, props);
  else queue.push({ event, props });
}

/** Properties attached to every subsequent event — run count, first seen, etc. */
export function setSuper(props: Record<string, unknown>) {
  Object.assign(superProps, props);
  client?.register(props);
}
