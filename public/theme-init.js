(function () {
  try {
    var stored = localStorage.getItem('theme')
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var isDark = stored === 'dark' || (!stored && prefersDark)
    document.documentElement.classList.toggle('dark', isDark)
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
})()

