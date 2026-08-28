export function esc(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return "";
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] || c
  );
}
