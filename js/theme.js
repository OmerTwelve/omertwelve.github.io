/**
 * Light/dark theme toggle.
 *
 * Light is the default; the inline script in <head> already applied any saved
 * preference before first paint, so this module only handles switching.
 *
 * Anything that needs to react to a theme change (the hero canvas reads its
 * colours from CSS tokens) listens for the `themechange` event on `document`
 * rather than being called directly — that keeps this module unaware of its
 * consumers, and removes the declaration-order coupling the single-file
 * version needed.
 */

const root = document.documentElement;

export const THEME_EVENT = "themechange";

export function currentTheme() {
  return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme, toggle) {
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");

  toggle.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );

  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* private mode — the choice just won't persist */
  }

  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
}

export function initTheme() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  applyTheme(currentTheme(), toggle); // sync the button label with what loaded

  toggle.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark", toggle);
  });
}
