// Sets data-privacy="on" on <html> before first paint, from localStorage, so
// dollar figures start blurred immediately if the viewer left privacy mode
// on last time (same pattern as ThemeScript — avoids a flash of visible
// numbers before React hydrates).
const PRIVACY_INIT = `
(function () {
  try {
    var saved = localStorage.getItem('backroom-privacy');
    if (saved === 'on') {
      document.documentElement.setAttribute('data-privacy', 'on');
    }
  } catch (e) {}
})();
`;

export function PrivacyScript() {
  return <script dangerouslySetInnerHTML={{ __html: PRIVACY_INIT }} />;
}
