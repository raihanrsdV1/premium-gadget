/* Runs before first paint (loaded synchronously from <head>) so the page never
   flashes the wrong theme. Same-origin file, so it needs no CSP exception. */
(function () {
  try {
    var saved = localStorage.getItem("pg-theme");
    var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
