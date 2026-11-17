/** Decorative haze sits behind the menu's lit details and controls. */
export function menuFog(): string {
  return `<div class="menu-fog" aria-hidden="true">
    <div class="menu-fog-bank menu-fog-bank--left"><div class="menu-fog-veil menu-fog-veil--left menu-decoration"></div></div>
    <div class="menu-fog-bank menu-fog-bank--right"><div class="menu-fog-veil menu-fog-veil--right menu-decoration"></div></div>
  </div>`;
}
