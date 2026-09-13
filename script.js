(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        selectTab(tabs[next], true);
      }
    });
  });

  const copyButton = document.querySelector('[data-copy-command]');
  const command = document.getElementById('brew-command');
  const copyLabel = copyButton.querySelector('.copy-label');
  const copyIcon = copyButton.querySelector('use');
  const copyStatus = document.getElementById('copy-status');
  let copyReset;
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    clearTimeout(copyReset);
    copyButton.disabled = true;
    try {
      await navigator.clipboard.writeText(command.textContent.trim());
      copyLabel.textContent = 'Copied';
      copyIcon.setAttribute('href', '#icon-check');
      copyButton.setAttribute('aria-label', 'Homebrew command copied');
      copyStatus.textContent = 'Homebrew command copied to clipboard.';
      copyStatus.classList.add('sr-only');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyStatus.classList.remove('sr-only');
      copyStatus.textContent = 'Press ⌘C (Mac) or Ctrl+C to copy the selected command.';
    } finally {
      copyButton.disabled = false;
      copyReset = setTimeout(() => {
        copyLabel.textContent = 'Copy';
        copyIcon.setAttribute('href', '#icon-copy');
        copyButton.setAttribute('aria-label', 'Copy Homebrew install command');
      }, 2500);
    }
  });

  const navLinks = [...document.querySelectorAll('[data-section-link]')];
  const sections = navLinks.map(link => document.querySelector(link.hash));
  function updateNavigation() {
    const mobile = window.matchMedia('(max-width: 800px)').matches;
    const threshold = mobile
      ? document.querySelector('.sidebar').getBoundingClientRect().height + 48
      : Math.max(80, Math.min(400, window.innerHeight * 0.4));
    let current = sections[0];
    sections.forEach(section => {
      if (window.scrollY > 16 && section.getBoundingClientRect().top <= threshold) current = section;
    });
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1];
    }
    navLinks.forEach(link => {
      if (link.hash === '#' + current.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      updateNavigation();
      scrollPending = false;
    });
  }, { passive: true });
  window.addEventListener('resize', updateNavigation);
  window.addEventListener('load', updateNavigation);
  function revealQuestions() {
    if (window.location.hash === '#questions') document.getElementById('questions').open = true;
  }
  window.addEventListener('hashchange', revealQuestions);
  revealQuestions();
  updateNavigation();
})();
