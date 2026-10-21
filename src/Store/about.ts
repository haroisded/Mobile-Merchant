import { create } from 'zustand';

/** What a Features row is for: its name, what it is ("Screen", "Page of Setup"), its purpose and when to use it. */
export type AboutRequest = { title: string; kind: string; purpose: string; useCase: string };

/**
 * The open narrow About. On a phone it is the native sheet route src/app/(app)/sheets/about.tsx
 * (.claude/instruction_mds/frontend.md §4.4), and a route takes no object as a param, so the opener leaves it
 * here — as src/Store/confirm.ts does for the confirm. Client state, nothing fetched. Each open replaces the last.
 */
const useAboutStore = create<{ request: AboutRequest | null }>(() => ({ request: null }));

export const openAbout = (request: AboutRequest) => useAboutStore.setState({ request });

export const useAboutRequest = () => useAboutStore((state) => state.request);
