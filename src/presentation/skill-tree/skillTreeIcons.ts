/** Small, crisp engravings share the menu's brass and blue-stone palette. */
export function skillIcon(name: string): string {
  const shapes: Record<string, string> = {
    beam: '<path d="M15 6v20M8 11l7-5 7 5M8 21l7 5 7-5M3 16h5m14 0h7"/><path d="m15 11 4 5-4 5-4-5z"/>',
    optics: '<circle cx="16" cy="16" r="7"/><path d="M2 9h6m-6 7h6m-6 7h6m16-14h6m-6 7h6m-6 7h6"/>',
    hull: '<path d="m12 12-3 16h14l-3-16M10 12h12M11 6h10v6H11zM16 2v4m-8 22h16M14 20h4v8"/>',
    shield: '<path d="m16 3 11 4v9c0 6-11 13-11 13S5 22 5 16V7zM16 8v15M10 12h12"/>',
    engineering: '<path d="m5 25 14-14m1-8a7 7 0 0 0-7 9l-9 9a4 4 0 0 0 6 6l9-9a7 7 0 0 0 9-7l-5 4-5-5z"/>',
    cannon: '<path d="m7 16 17-8 4 8-18 6zM5 16l5 6M10 24h16M17 21v3"/><circle cx="9" cy="26" r="3"/><circle cx="24" cy="26" r="3"/>',
    barrier: '<path d="M5 28V8l5-4 5 4v20m2 0V8l5-4 5 4v20M3 13h26M3 23h26"/>',
    generator: '<path d="m10 3 12 0 6 9-4 15H8L4 12zM10 12h12M18 6l-6 11h7l-5 8"/>',
    trap: '<path d="m16 4 4 8 8 4-8 4-4 8-4-8-8-4 8-4zM4 4l4 4m16 16 4 4M28 4l-4 4M8 24l-4 4"/>',
    harpoon: '<path d="M5 27 25 7M15 6l11-2 2 11M14 13l5 5M4 24l4 4"/>',
    mortar: '<path d="m9 11 8-5 9 14-8 5zM7 13l13 13M3 29h26M12 22l-6 7m17-7 5 7"/>',
    bell: '<path d="M5 24h22l-4-5v-7a7 7 0 0 0-14 0v7zM13 28h6M16 2v3"/>',
    repair: '<path d="M11 6h10l3 20H8zM12 3h8M13 10h6v10h-6zM4 15h4m16 0h4M16 13v4m-2-2h4"/>',
    flash: '<path d="m19 2-13 17h9l-2 11 13-18h-9z"/>',
    lens: '<path d="m16 3 10 6v14l-10 6-10-6V9zM16 7v18M10 11l12 10m0-10L10 21"/>',
    search: '<circle cx="13" cy="13" r="8"/><path d="m19 19 9 9"/>',
    lock: '<path d="M10 14V9a6 6 0 0 1 12 0v5M7 14h18v14H7zM16 19v4"/>',
  };
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${shapes[name] ?? shapes.beam}</svg>`;
}
