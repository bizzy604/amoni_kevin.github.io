const pageTurnButtons = document.querySelectorAll('.nextprev-btn');
const pages = [...document.querySelectorAll('.book-page.page-right')];
const coverScreen = document.querySelector('.cover-screen');
const openCoverButton = document.querySelector('.cover-open');
const closeBookButton = document.querySelector('.back-profile');
const contactButton = document.querySelector('.contact-me');
const themeToggle = document.querySelector('.theme-toggle');
const themeRoot = document.documentElement;
const themeStorageKey = 'portfolio-theme';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let isClosingBook = false;

function readStoredTheme() {
  try {
    return window.localStorage.getItem(themeStorageKey);
  } catch {
    return null;
  }
}

const storedTheme = readStoredTheme();
if (storedTheme === 'dark' || storedTheme === 'light') {
  themeRoot.dataset.theme = storedTheme;
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  themeRoot.dataset.theme = 'dark';
}

function updateThemeToggle() {
  const isDark = themeRoot.dataset.theme === 'dark';
  const icon = themeToggle?.querySelector('i');
  const label = themeToggle?.querySelector('span');

  themeToggle?.setAttribute('aria-pressed', String(isDark));
  themeToggle?.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  if (icon) icon.className = `bx ${isDark ? 'bx-sun' : 'bx-moon'}`;
  if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#04111d' : '#071b2b');
}

if (themeToggle) {
  updateThemeToggle();
  themeToggle.addEventListener('click', () => {
    const nextTheme = themeRoot.dataset.theme === 'dark' ? 'light' : 'dark';
    themeRoot.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem(themeStorageKey, nextTheme);
    } catch {
      // Theme still works for the current visit when storage is unavailable.
    }
    updateThemeToggle();
  });
}

function setPageState(page, turned, index = pages.indexOf(page)) {
  page.classList.toggle('turn', turned);
  // The active sheet must sit above the profile while the remaining sheets
  // stay stacked behind it in reading order.
  page.style.zIndex = turned ? 200 + index : 100 - index;
}

function turnPage(pageId, direction) {
  const page = document.getElementById(pageId);
  if (!page) return;

  const index = pages.indexOf(page);
  if (index < 0) return;

  if (direction === 'next') {
    // A sheet can only move forward after every earlier sheet has turned.
    const earlierSheetStillOpen = pages
      .slice(0, index)
      .some((earlierPage) => !earlierPage.classList.contains('turn'));

    if (!page.classList.contains('turn') && !earlierSheetStillOpen) {
      setPageState(page, true, index);
    }
    return;
  }

  // A sheet can only move back when no later sheet is already turned.
  const laterSheetAlreadyTurned = pages
    .slice(index + 1)
    .some((laterPage) => laterPage.classList.contains('turn'));

  if (page.classList.contains('turn') && !laterSheetAlreadyTurned) {
    setPageState(page, false, index);
  }
}

pageTurnButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const pageId = button.getAttribute('data-page');
    const direction = button.getAttribute('data-direction') || (button.classList.contains('back') ? 'previous' : 'next');
    if (pageId) turnPage(pageId, direction);
  });
});

if (contactButton) {
  contactButton.addEventListener('click', (event) => {
    event.preventDefault();

    pages.forEach((page, index) => {
      window.setTimeout(() => setPageState(page, true, index), reducedMotion ? 0 : index * 140);
    });

    window.setTimeout(() => {
      document.querySelector('#contact')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }, reducedMotion ? 0 : pages.length * 140 + 150);
  });
}

// Stage the sheets in reading order, then present the profile and first page.
pages.forEach((page, index) => setPageState(page, false, index));

function openPortfolio() {
  if (!coverScreen) return;

  coverScreen.classList.add('is-open');
  coverScreen.setAttribute('aria-hidden', 'true');
  setPageState(pages[0], false, 0);
}

function returnToCover() {
  if (isClosingBook) return;
  isClosingBook = true;

  // Close the latest sheet first, just as a physical book would.
  [...pages].reverse().forEach((page, order) => {
    window.setTimeout(() => {
      const index = pages.indexOf(page);
      page.classList.remove('turn');
      page.style.zIndex = 200 + index;

      window.setTimeout(() => {
        page.style.zIndex = 100 - index;
      }, reducedMotion ? 0 : 900);
    }, reducedMotion ? 0 : order * 280);
  });

  window.setTimeout(() => {
    if (coverScreen) {
      coverScreen.classList.remove('is-open');
      coverScreen.setAttribute('aria-hidden', 'false');
    }

    isClosingBook = false;
    window.setTimeout(() => openCoverButton?.focus(), reducedMotion ? 0 : 800);
  }, reducedMotion ? 0 : (pages.length - 1) * 280 + 1000);
}

if (openCoverButton) {
  openCoverButton.addEventListener('click', openPortfolio);
}

if (closeBookButton) {
  closeBookButton.addEventListener('click', returnToCover);
}

const mediaQuery = window.matchMedia('(max-width: 820px)');
const mobileRevealTargets = [...document.querySelectorAll('.book-page, .back-cover-page')];
let mobileRevealObserver;

function setupMobileReveal() {
  mobileRevealTargets.forEach((target) => target.classList.add('mobile-reveal-target'));

  if (!mediaQuery.matches) {
    mobileRevealObserver?.disconnect();
    mobileRevealTargets.forEach((target) => target.classList.remove('mobile-reveal-target', 'is-visible'));
    return;
  }

  if (reducedMotion || typeof window.IntersectionObserver !== 'function') {
    mobileRevealTargets.forEach((target) => target.classList.add('is-visible'));
    return;
  }

  mobileRevealObserver?.disconnect();
  mobileRevealObserver = new window.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px'
  });

  mobileRevealTargets.forEach((target) => {
    target.classList.remove('is-visible');
    mobileRevealObserver.observe(target);
  });
}

function applyMobileLayout() {
  if (mediaQuery.matches) {
    pages.forEach((page) => {
      page.classList.remove('turn');
      page.style.zIndex = 'auto';
    });
  }

  setupMobileReveal();
}

applyMobileLayout();

if (typeof mediaQuery.addEventListener === 'function') {
  mediaQuery.addEventListener('change', applyMobileLayout);
} else if (typeof mediaQuery.addListener === 'function') {
  mediaQuery.addListener(applyMobileLayout);
}
