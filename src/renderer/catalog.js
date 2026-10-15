/**
 * Vaultly - Built-in Service Catalog & Icons
 * Contains 38+ recognizable service presets with crisp inline SVG brand icons,
 * standard URLs, category mappings, and general UI icons.
 */

'use strict';

const UI_ICONS = {
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  key: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 2-2 2m-1.5 1.5L14 9l-2-2-5.5 5.5a4 4 0 1 0 5.5 5.5L17.5 12.5 19 14l2-2-2-2 2-2z"/><circle cx="7.5" cy="16.5" r="1.5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starFilled: `<svg viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  dice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
};

// 38+ Brand SVG icons (optimized vector paths)
const BRAND_ICONS = {
  // Social Media
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.97-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  snapchat: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.003 2c-3.69 0-6.19 2.55-6.19 5.81 0 .73.18 1.47.45 2.17-.48.16-1.1.48-1.29.98-.19.49.03 1.06.49 1.34.61.37 1.36.27 1.98.08.31 1.25 1.07 2.37 2.12 3.11-.27.42-.76.71-1.24.96-.7.36-1.47.6-2.26.73-.39.06-.57.48-.35.8.53.77 1.54 1.03 2.45 1.11.23.44.29.97.23 1.47-.04.3.16.59.46.64.44.07.89.04 1.34-.05.5-.1 1.02-.27 1.55-.16.52.1 1 .42 1.54.55.76.18 1.56.12 2.32-.08.4-.11.81-.22 1.22-.16.48.07.9.27 1.35.34.29.05.57-.14.62-.43.08-.49.07-.99-.07-1.47.92-.08 1.93-.34 2.46-1.11.22-.32.04-.74-.35-.8-.79-.13-1.56-.37-2.26-.73-.48-.25-.97-.54-1.24-.96 1.05-.74 1.81-1.86 2.12-3.11.62.19 1.37.29 1.98-.08.46-.28.68-.85.49-1.34-.19-.5-.81-.82-1.29-.98.27-.7.45-1.44.45-2.17 0-3.26-2.5-5.81-6.19-5.81z"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.56 12 8 12.56 8 13.25c0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm5.5 0c-.69 0-1.25.56-1.25 1.25 0 .69.56 1.25 1.25 1.25.69 0 1.25-.56 1.25-1.25 0-.69-.56-1.25-1.25-1.25zm-5.465 4.39a.5.5 0 0 0-.07.7.5.5 0 0 0 .7.07 5.17 5.17 0 0 0 5.17 0 .5.5 0 0 0 .7-.07.5.5 0 0 0-.07-.7 6.17 6.17 0 0 1-6.43 0z"/></svg>`,
  pinterest: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>`,
  threads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.001 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12.001 12 6.626 0 11.999-5.373 11.999-12 0-6.627-5.373-12-11.999-12zm4.78 15.65c-.71 1.32-1.9 2.12-3.37 2.27-2.34.24-4.32-1.32-4.48-3.55-.17-2.28 1.63-4.22 3.99-4.28 1.58-.04 2.89.72 3.51 2.05l-1.39.81c-.37-.8-1.15-1.26-2.12-1.24-1.48.03-2.58 1.18-2.47 2.58.11 1.37 1.31 2.36 2.72 2.21.92-.09 1.64-.6 2.08-1.42l1.53.57z"/></svg>`,

  // Communication
  discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.979-.276-.1-.476-.15-.677.15-.2.302-.777.98-1.002 1.231-.226.25-.452.28-.752.13-.301-.15-1.272-.469-2.423-1.496-.895-.798-1.5-1.784-1.675-2.085-.176-.3-.019-.463.131-.613.136-.134.301-.35.452-.526.15-.175.2-.301.301-.501.101-.2.051-.376-.025-.526-.075-.15-.677-1.631-.927-2.233-.244-.587-.492-.507-.677-.517l-.577-.01c-.2 0-.526.075-.802.376s-1.053 1.028-1.053 2.508 1.078 2.909 1.228 3.11c.15.201 2.122 3.24 5.14 4.544.718.31 1.279.495 1.716.634.721.229 1.377.197 1.895.12.577-.087 1.78-.727 2.031-1.429.25-.701.25-1.303.175-1.428-.075-.125-.276-.201-.577-.351zM12.004 21.75c-1.748 0-3.411-.462-4.869-1.298l-.349-.207-3.627.951.968-3.536-.227-.361A9.72 9.72 0 0 1 2.25 12.004C2.25 6.627 6.627 2.25 12.004 2.25c2.607 0 5.058 1.016 6.902 2.86 1.844 1.844 2.86 4.295 2.86 6.902 0 5.377-4.377 9.738-9.762 9.738zM12.004 0C5.385 0 0 5.385 0 12.004c0 2.112.551 4.168 1.597 5.981L0 24l6.183-1.622c1.743.951 3.714 1.453 5.821 1.453 6.619 0 12.004-5.385 12.004-12.004C24.008 5.385 18.623 0 12.004 0z"/></svg>`,
  messenger: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.085.3 2.235.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.73 7.85l3.14 3.259 5.879-3.259-6.558 7.113z"/></svg>`,
  slack: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
  teams: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 7.5a2.25 2.25 0 1 0-2.25-2.25 2.25 2.25 0 0 0 2.25 2.25zm1.5 1.5h-3a1.5 1.5 0 0 0-1.5 1.5V13a3.5 3.5 0 0 0 6 0v-2.5a1.5 1.5 0 0 0-1.5-1.5zM12.75 6.75a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm2.25 2.25H10.5A2.25 2.25 0 0 0 8.25 11.25V17a4.5 4.5 0 0 0 9 0v-5.75A2.25 2.25 0 0 0 15 9zM6 9a2 2 0 1 0-2-2 2 2 0 0 0 2 2zm1.5 1.5h-3A1.5 1.5 0 0 0 3 12v2a3 3 0 0 0 5 0v-2a1.5 1.5 0 0 0-1.5-1.5z"/></svg>`,

  // Email and Google
  google: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/></svg>`,
  gmail: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.49l8.073-5.997c1.618-1.214 3.927-.059 3.927 1.964z"/></svg>`,
  outlook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 7.875v8.25A2.625 2.625 0 0 1 21.375 18.75H13.5V5.25h7.875A2.625 2.625 0 0 1 24 7.875zM12 5.25v13.5H2.625A2.625 2.625 0 0 1 0 16.125v-8.25A2.625 2.625 0 0 1 2.625 5.25H12zm-3.75 3.75H4.5v1.5h3.75V9zm0 3H4.5v1.5h3.75v-1.5z"/></svg>`,
  yahoomail: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.8 1.5l-8.4 12.2v8.8h-4.8v-8.8L1.2 1.5h5.4l5.4 8.6 5.4-8.6h5.4z"/></svg>`,
  protonmail: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.41 2.87 8.14 6.84 9.47.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.33.85 0 1.7.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/></svg>`,

  // Development
  github: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
  gitlab: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.918 1.263c-.136-.423-.731-.423-.867 0L1.387 9.452.045 13.587a.933.933 0 0 0 .339 1.043l11.616 8.438 11.616-8.438a.933.933 0 0 0 .339-1.043z"/></svg>`,
  bitbucket: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.517.868 1.024.868h15.422a.772.772 0 0 0 .766-.644l3.504-20.033a.77.77 0 0 0-.766-.893H.778zm13.65 14.24H9.572l-1.19-6.425h7.234l-1.188 6.425z"/></svg>`,
  stackoverflow: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.986 21.865v-6.404h2.134V24H2.88v-8.539h2.13v6.404h13.976zM7.18 15.932l9.643 2.016.422-2.091-9.643-2.016-.422 2.091zm1.758-5.351l8.766 4.605.992-1.89-8.766-4.605-.992 1.89zm3.435-4.887l7.14 6.848 1.472-1.536-7.14-6.848-1.472 1.536zm6.302-5.694l-1.856 1.056 5.248 9.216 1.856-1.056-5.248-9.216zM6.98 20.8h9.84v-2.13H6.98v2.13z"/></svg>`,
  npm: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0H1.763zM5.13 5.13h13.74v13.74h-3.435V8.565h-3.435v10.305H5.13V5.13z"/></svg>`,

  // Gaming
  steam: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0z"/></svg>`,
  epicgames: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 0h17l1.75 3.5L24 17.5 12 24 0 17.5 1.75 3.5 3.5 0zm8.5 4.5c-3.5 0-6 2.5-6 6v3h3v-3c0-1.7 1.3-3 3-3s3 1.3 3 3v4.5c0 1.7-1.3 3-3 3s-3-1.3-3-3H6c0 3.5 2.5 6 6 6s6-2.5 6-6V10.5c0-3.5-2.5-6-6-6z"/></svg>`,
  riotgames: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.44 2.88L0 9.12l3.84 9.6 4.32-.96v-5.28l5.28-1.2v7.2l9.6-2.16L24 6.72l-10.56-3.84z"/></svg>`,
  minecraft: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 4v4h4V6H6zm8 0v4h4V6h-4zm-4 4v4h4v-4h-4zm-4 4v4h4v-4H6zm8 0v4h4v-4h-4z"/></svg>`,
  playstation: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.28 17.065c-2.316.59-4.22.48-5.32-.303-1.077-.768-1.02-2.155.158-3.328 1.176-1.17 3.013-1.79 5.162-1.755v5.386zm3.435-15.065v19.467c1.378-.403 2.593-1.096 3.518-2.02 1.488-1.488 1.83-3.398 1.02-5.412-.81-2.015-2.73-3.663-4.538-4.254V1.999zm4.28 15.066c2.316.59 4.22.48 5.32-.303 1.077-.768 1.02-2.155-.158-3.328-1.176-1.17-3.013-1.79-5.162-1.755v5.386z"/></svg>`,

  // Work, Shopping & Entertainment
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
  amazon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.923 14.168c-1.92 0-3.48-1.1-3.48-2.748 0-1.788 1.58-2.678 3.52-2.678 1.2 0 2.14.33 2.7.75v1.2c-.52-.39-1.3-.65-2.26-.65-1.16 0-2.02.5-2.02 1.43 0 .97.86 1.48 2.06 1.48.96 0 1.86-.33 2.5-.78v1.27c-.82.52-1.94.708-3.02.708zm9.057 5.09c-7.38 4.67-17.76 2.37-22.98-2.06-.2-.17-.03-.4.21-.27 5.04 2.87 14.28 4.62 22.38-.4.36-.22.69.21.39.73zm1.02-1.35c-.24-.31-1.58-.15-2.18-.08-.18.02-.21-.13-.05-.24 1.05-.75 2.77-.54 2.97-.28.2.26-.53 1.94-1.53 2.76-.15.13-.3.06-.23-.11.23-.55.26-1.74 1.02-2.05z"/></svg>`,
  netflix: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.398 0v24c1.196-.27 2.42-.6 3.655-.98V0H5.398zm9.549 0v19.78c1.235-.4 2.459-.75 3.655-1.07V0h-3.655zM9.053 0l5.894 18.06V0h3.655v24l-5.894-18.06V24H9.053V0z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  adobe: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.244 5.398 13.525h-3.446zm-5.72-14.739L0 22.624V1.376h8.246zm7.508 0L24 22.624V1.376h-8.246z"/></svg>`,
  dropbox: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6.5l6 4.5L12 6.5 6 2zm12 0l-6 4.5 6 4.5 6-4.5-6-4.5zM0 15.5l6 4.5 6-4.5-6-4.5-6 4.5zm18-4.5l-6 4.5 6 4.5 6-4.5-6-4.5zM6 21.5l6-4.5 6 4.5-6 4.5-6-4.5z"/></svg>`,
  notion: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.093-.373L17.763 1.55c-.42-.326-.98-.7-2.054-.606L3.06 1.97c-.42.046-.514.326-.374.606l1.773 1.632zm-.7 2.846v14.46c0 .7.373 1.026 1.12 1.026h14.834c.746 0 1.026-.326 1.026-1.026V6.728c0-.7-.373-.98-1.026-.98H4.786c-.747 0-1.027.28-1.027 1.306zm13.438.933c.093.42.093.84-.28.84h-1.027c-.28 0-.467.093-.653.373l-4.573 6.906v-6.906c0-.42-.187-.653-.653-.653H8.939c-.373 0-.467.233-.467.513 0 .28.187.42.467.466l.84.094c.373.046.467.28.467.653v7.373c0 .42-.187.653-.653.653l-.84.047c-.28 0-.373.233-.373.466s.187.467.467.467h2.707c.373 0 .467-.234.467-.514 0-.28-.187-.42-.467-.466l-.747-.047c-.373-.047-.467-.28-.467-.653v-5.693l4.853 7.373c.373.56.7.653 1.213.606l1.307-.093c.373-.047.467-.28.467-.607V8.501c0-.42-.187-.654-.654-.654h-.746c-.374 0-.467.14-.374.56z"/></svg>`,
  cloudflare: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.16 10.74c-.58-3.08-3.26-5.4-6.49-5.4-2.88 0-5.32 1.84-6.22 4.45C2.85 10.3 0 13.2 0 16.8c0 3.98 3.22 7.2 7.2 7.2h11.96c2.67 0 4.84-2.17 4.84-4.84 0-2.51-1.91-4.57-4.38-4.81l-.46-.61z"/></svg>`,
  paypal: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.82.903 4.96-.069.37-.168.74-.298 1.11-.84 2.39-2.58 3.86-5.18 4.37-.4.08-.82.12-1.25.13h-2.1c-.524 0-.972.382-1.055.901l-1.092 6.945-.045.28a.64.64 0 0 1-.632.531h-1.323z"/></svg>`
};

// 38+ Built-in Services with Metadata
const BUILT_IN_SERVICES = [
  // Social Media (1-8)
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com', category: 'social', icon: 'instagram', color: '#e1306c' },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com', category: 'social', icon: 'facebook', color: '#1877f2' },
  { id: 'x', name: 'X (Twitter)', url: 'https://x.com', category: 'social', icon: 'x', color: '#ffffff' },
  { id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com', category: 'social', icon: 'tiktok', color: '#fe2c55' },
  { id: 'snapchat', name: 'Snapchat', url: 'https://www.snapchat.com', category: 'social', icon: 'snapchat', color: '#fffc00' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com', category: 'social', icon: 'reddit', color: '#ff4500' },
  { id: 'pinterest', name: 'Pinterest', url: 'https://www.pinterest.com', category: 'social', icon: 'pinterest', color: '#e60023' },
  { id: 'threads', name: 'Threads', url: 'https://www.threads.net', category: 'social', icon: 'threads', color: '#ffffff' },

  // Communication (9-14)
  { id: 'discord', name: 'Discord', url: 'https://discord.com', category: 'communication', icon: 'discord', color: '#5865f2' },
  { id: 'telegram', name: 'Telegram', url: 'https://web.telegram.org', category: 'communication', icon: 'telegram', color: '#24a1de' },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com', category: 'communication', icon: 'whatsapp', color: '#25d366' },
  { id: 'messenger', name: 'Messenger', url: 'https://www.messenger.com', category: 'communication', icon: 'messenger', color: '#00b2ff' },
  { id: 'slack', name: 'Slack', url: 'https://slack.com', category: 'communication', icon: 'slack', color: '#4a154b' },
  { id: 'teams', name: 'Microsoft Teams', url: 'https://teams.microsoft.com', category: 'communication', icon: 'teams', color: '#6264a7' },

  // Email and Google (15-19)
  { id: 'google', name: 'Google', url: 'https://myaccount.google.com', category: 'email', icon: 'google', color: '#4285f4' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com', category: 'email', icon: 'gmail', color: '#ea4335' },
  { id: 'outlook', name: 'Microsoft Outlook', url: 'https://outlook.live.com', category: 'email', icon: 'outlook', color: '#0078d4' },
  { id: 'yahoomail', name: 'Yahoo Mail', url: 'https://mail.yahoo.com', category: 'email', icon: 'yahoomail', color: '#6001d2' },
  { id: 'protonmail', name: 'Proton Mail', url: 'https://mail.proton.me', category: 'email', icon: 'protonmail', color: '#6d4aff' },

  // Development (20-24)
  { id: 'github', name: 'GitHub', url: 'https://github.com', category: 'development', icon: 'github', color: '#f0f6fc' },
  { id: 'gitlab', name: 'GitLab', url: 'https://gitlab.com', category: 'development', icon: 'gitlab', color: '#fc6d26' },
  { id: 'bitbucket', name: 'Bitbucket', url: 'https://bitbucket.org', category: 'development', icon: 'bitbucket', color: '#0052cc' },
  { id: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com', category: 'development', icon: 'stackoverflow', color: '#f48024' },
  { id: 'npm', name: 'npm', url: 'https://www.npmjs.com', category: 'development', icon: 'npm', color: '#cb3837' },

  // Gaming (25-29)
  { id: 'steam', name: 'Steam', url: 'https://store.steampowered.com', category: 'gaming', icon: 'steam', color: '#171a21' },
  { id: 'epicgames', name: 'Epic Games', url: 'https://store.epicgames.com', category: 'gaming', icon: 'epicgames', color: '#ffffff' },
  { id: 'riotgames', name: 'Riot Games', url: 'https://account.riotgames.com', category: 'gaming', icon: 'riotgames', color: '#d32936' },
  { id: 'minecraft', name: 'Minecraft', url: 'https://www.minecraft.net', category: 'gaming', icon: 'minecraft', color: '#5b8c32' },
  { id: 'playstation', name: 'PlayStation Network', url: 'https://www.playstation.com', category: 'gaming', icon: 'playstation', color: '#003791' },

  // Work, Shopping & Entertainment (30-38)
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com', category: 'work', icon: 'linkedin', color: '#0a66c2' },
  { id: 'amazon', name: 'Amazon', url: 'https://www.amazon.com', category: 'shopping', icon: 'amazon', color: '#ff9900' },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com', category: 'other', icon: 'netflix', color: '#e50914' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', category: 'other', icon: 'spotify', color: '#1db954' },
  { id: 'adobe', name: 'Adobe', url: 'https://account.adobe.com', category: 'work', icon: 'adobe', color: '#fa0f00' },
  { id: 'dropbox', name: 'Dropbox', url: 'https://www.dropbox.com', category: 'work', icon: 'dropbox', color: '#0061ff' },
  { id: 'notion', name: 'Notion', url: 'https://www.notion.so', category: 'work', icon: 'notion', color: '#ffffff' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://dash.cloudflare.com', category: 'development', icon: 'cloudflare', color: '#f38020' },
  { id: 'paypal', name: 'PayPal', url: 'https://www.paypal.com', category: 'finance', icon: 'paypal', color: '#003087' }
];

const CATEGORIES = [
  { id: 'all', name: 'All Passwords', icon: UI_ICONS.key },
  { id: 'favorites', name: 'Favorites', icon: UI_ICONS.star },
  { id: 'recent', name: 'Recently Added', icon: UI_ICONS.clock },
  { id: 'social', name: 'Social Media', icon: BRAND_ICONS.instagram },
  { id: 'communication', name: 'Communication', icon: BRAND_ICONS.discord },
  { id: 'email', name: 'Email & Google', icon: BRAND_ICONS.gmail },
  { id: 'development', name: 'Development', icon: BRAND_ICONS.github },
  { id: 'gaming', name: 'Gaming', icon: BRAND_ICONS.steam },
  { id: 'shopping', name: 'Shopping', icon: BRAND_ICONS.amazon },
  { id: 'finance', name: 'Finance', icon: BRAND_ICONS.paypal },
  { id: 'work', name: 'Work & Productivity', icon: BRAND_ICONS.notion },
  { id: 'other', name: 'Other', icon: UI_ICONS.folder }
];

/**
 * Returns SVG markup for a given icon identifier or service name.
 * @param {string} iconKeyOrService
 * @returns {string} SVG HTML
 */
function getIconSvg(iconKeyOrService) {
  if (!iconKeyOrService) return UI_ICONS.globe;
  const key = iconKeyOrService.toLowerCase().trim().replace(/[\s-_]+/g, '');

  if (BRAND_ICONS[key]) return BRAND_ICONS[key];
  if (UI_ICONS[key]) return UI_ICONS[key];

  // Try matching against built-in services list
  const match = BUILT_IN_SERVICES.find(s =>
    s.id === key || s.name.toLowerCase().replace(/[\s-_()]+/g, '') === key
  );
  if (match && BRAND_ICONS[match.icon]) {
    return BRAND_ICONS[match.icon];
  }

  return UI_ICONS.globe;
}

/**
 * Suggests built-in service details matching user input.
 * @param {string} query
 * @returns {object|null}
 */
function findMatchingService(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();
  return BUILT_IN_SERVICES.find(s =>
    s.name.toLowerCase() === q ||
    s.id === q ||
    (s.url && s.url.toLowerCase().includes(q))
  ) || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UI_ICONS,
    BRAND_ICONS,
    BUILT_IN_SERVICES,
    CATEGORIES,
    getIconSvg,
    findMatchingService
  };
}
