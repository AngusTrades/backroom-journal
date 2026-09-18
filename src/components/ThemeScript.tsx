// Sets data-theme on <html> before first paint, from localStorage, to avoid
// a flash of the wrong theme. Runs as an inline script (no external file, no
// hydration mismatch risk since it only touches an attribute the server
// doesn't render either way).
const THEME_INIT = `
(function () {
  try {
    var saved = localStorage.getItem('backroom-theme');
    var theme = saved === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />;
}
