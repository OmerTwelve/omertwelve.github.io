/**
 * Copy-email button in the contact section.
 * Confirms in the button itself and announces to screen readers.
 */

export function initCopyEmail() {
  const btn = document.getElementById("copy-email");
  if (!btn) return;

  if (!navigator.clipboard) {
    btn.hidden = true; // no clipboard API: the mailto link still works
    return;
  }

  const label = document.getElementById("copy-label");
  const status = document.getElementById("copy-status");
  let resetTimer;

  btn.addEventListener("click", () => {
    navigator.clipboard
      .writeText(btn.dataset.email)
      .then(() => {
        label.textContent = "Copied";
        status.textContent = "Email address copied to clipboard.";
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          label.textContent = "Copy email";
          status.textContent = "";
        }, 2500);
      })
      .catch(() => {
        status.textContent =
          "Copy failed — select the address to copy it manually.";
      });
  });
}
