(() => {
  'use strict';
  const root = document.documentElement;
  const body = document.body;
  const bookElement = document.querySelector('#portfolio-book');
  const pagination = new PortfolioPagination([...bookElement.querySelectorAll('.leaf')]);
  let leaves = [...bookElement.querySelectorAll('.leaf')];
  const position = document.querySelector('.book-position');
  const previousButton = document.querySelector('.previous-page');
  const nextButton = document.querySelector('.next-page');
  const chapterMenu = document.querySelector('.chapter-menu');
  const themeButton = document.querySelector('.theme-toggle');
  const soundButton = document.querySelector('.sound-toggle');
  const readingButton = document.querySelector('.reading-mode-toggle');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastPage = leaves.length - 1;
  let rebuilding = false, pendingLayout = false, lastSize = null;
  let book, currentPage = 0, busy = false, readingMode = false;
  let soundPlayed = false, requestedPage = null, focusAfterTurn = false;

  function stored(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  function persist(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Preferences still work for this visit. */ }
  }
  const savedTheme = stored('portfolio-theme', '');
  root.dataset.theme = ['light', 'dark'].includes(savedTheme) ? savedTheme :
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function updateTheme() {
    const dark = root.dataset.theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
    themeButton.querySelector('i').className = `bx ${dark ? 'bx-sun' : 'bx-moon'}`;
    themeButton.querySelector('.tool-label').textContent = dark ? 'Light mode' : 'Dark mode';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#04111d' : '#071b2b';
  }
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    persist('portfolio-theme', root.dataset.theme);
    updateTheme();
  });
  updateTheme();

  // Short, locally synthesized paper and binding sounds: no downloads or autoplay.
  class BookAudio {
    constructor() {
      this.enabled = stored('portfolio-sound', 'on') === 'on';
      this.context = null;
    }
    async unlock() {
      if (!this.enabled) return false;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        if (!this.context) {
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.gain.value = 0.34;
          this.master.connect(this.context.destination);
          this.noise = this.context.createBuffer(1, this.context.sampleRate * 1.4, this.context.sampleRate);
          const data = this.noise.getChannelData(0);
          let last = 0;
          for (let i = 0; i < data.length; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.035 * white) / 1.035;
            data[i] = last * 3.5 + white * 0.12;
          }
        }
        if (this.context.state === 'suspended') await this.context.resume();
        return this.context.state === 'running' && this.enabled;
      } catch { return false; }
    }
    async play(hard = false) {
      if (!(await this.unlock())) return;
      const ctx = this.context;
      const start = ctx.currentTime;
      const duration = hard ? 0.82 : 0.62;
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      noise.playbackRate.value = hard ? 0.78 : 0.95 + Math.random() * 0.13;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(hard ? 340 : 1100, start);
      filter.frequency.exponentialRampToValueAtTime(hard ? 650 : 2300, start + duration * 0.4);
      filter.frequency.exponentialRampToValueAtTime(hard ? 180 : 700, start + duration);
      filter.Q.value = 0.65;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(hard ? 0.6 : 0.85, start + 0.1);
      gain.gain.linearRampToValueAtTime(0.22, start + duration * 0.45);
      gain.gain.linearRampToValueAtTime(0.5, start + duration * 0.62);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      noise.connect(filter).connect(gain).connect(this.master);
      noise.start(start);
      noise.stop(start + duration);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
      if (hard) {
        const binding = ctx.createOscillator();
        const bindingGain = ctx.createGain();
        binding.type = 'triangle';
        binding.frequency.setValueAtTime(105, start);
        binding.frequency.exponentialRampToValueAtTime(48, start + 0.22);
        bindingGain.gain.setValueAtTime(0, start);
        bindingGain.gain.linearRampToValueAtTime(0.09, start + 0.03);
        bindingGain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        binding.connect(bindingGain).connect(this.master);
        binding.start(start);
        binding.stop(start + 0.26);
        binding.onended = () => { binding.disconnect(); bindingGain.disconnect(); };
      }
    }
    toggle() {
      this.enabled = !this.enabled;
      persist('portfolio-sound', this.enabled ? 'on' : 'off');
      if (this.context) this.master.gain.setTargetAtTime(this.enabled ? 0.34 : 0, this.context.currentTime, 0.02);
      if (this.enabled) void this.unlock();
    }
  }
  const audio = new BookAudio();
  function updateSound() {
    soundButton.setAttribute('aria-pressed', String(audio.enabled));
    soundButton.setAttribute('aria-label', audio.enabled ? 'Mute book sounds' : 'Enable book sounds');
    soundButton.querySelector('i').className = `bx ${audio.enabled ? 'bx-volume-full' : 'bx-volume-mute'}`;
    soundButton.querySelector('.tool-label').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  }
  soundButton.addEventListener('click', () => { audio.toggle(); updateSound(); });
  updateSound();

  function visiblePages() {
    if (!book || book.getOrientation() === 'portrait' || currentPage === 0 || currentPage === lastPage) return [currentPage];
    return [currentPage, Math.min(currentPage + 1, lastPage)];
  }
  function updateAccessibility() {
    const visible = visiblePages();
    const activeLeaf = document.activeElement?.closest('.leaf');
    // Reveal the destination before moving focus away from the old sheet.
    visible.forEach(index => { leaves[index].inert = false; leaves[index].setAttribute('aria-hidden', 'false'); });
    if (!readingMode && activeLeaf && !visible.includes(leaves.indexOf(activeLeaf))) {
      leaves[visible[0]].querySelector('.page-content, button')?.focus({ preventScroll: true });
    }
    leaves.forEach((leaf, index) => {
      const hidden = !readingMode && !visible.includes(index);
      leaf.inert = hidden;
      leaf.setAttribute('aria-hidden', String(hidden));
    });
    if (focusAfterTurn && !busy) {
      leaves[requestedPage ?? currentPage]?.querySelector('.page-content, button')?.focus({ preventScroll: true });
      focusAfterTurn = false;
    }
  }
  function updateUI() {
    if (!book || rebuilding) return;
    currentPage = book.getCurrentPageIndex();
    bookElement.dataset.currentPage = String(currentPage);
    body.classList.toggle('is-portrait', book.getOrientation() === 'portrait');
    position.style.setProperty('--page-width', `${book.getBoundsRect().pageWidth}px`);
    position.dataset.position = currentPage === 0 ? 'front' : currentPage === lastPage ? 'back' : 'open';
    const visible = visiblePages();
    const title = [...new Set(visible.map(index => leaves[index].dataset.title))].join(' & ');
    document.querySelector('.current-chapter').textContent = title;
    const count = currentPage === 0 ? 'Amoni Kevin / Selected work' : currentPage === lastPage ? 'The end. Or a new beginning.' :
      `Page${visible.length > 1 ? 's' : ''} ${visible.join('–')} of ${lastPage - 1}`;
    document.querySelector('.page-count').textContent = count;
    document.querySelector('.progress-track > span').style.width = `${currentPage / lastPage * 100}%`;
    document.querySelector('#reading-announcement').textContent = `${title}. ${count}`;
    previousButton.disabled = currentPage === 0 || busy;
    nextButton.disabled = busy;
    const nextLabel = currentPage === 0 ? 'Open book' : currentPage === lastPage ? 'Start again' : 'Next';
    nextButton.querySelector('.nav-label').textContent = nextLabel;
    nextButton.setAttribute('aria-label', currentPage === lastPage ? 'Return to front cover' : currentPage === 0 ? 'Open book' : 'Next page');
    document.querySelectorAll('button[data-chapter]').forEach(button => {
      if (visible.some(index => leaves[index].dataset.chapter === button.dataset.chapter)) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    updateAccessibility();
  }
  function goTo(page, moveFocus = false) {
    page = Math.max(0, Math.min(page, lastPage));
    if (!book) { leaves[page].scrollIntoView({ block: 'start' }); return; }
    if (busy) return;
    if (readingMode) {
      leaves[page].scrollIntoView({ behavior: motionPreference.matches ? 'instant' : 'smooth', block: 'start' });
      return;
    }
    if (visiblePages().includes(page)) {
      if (moveFocus) leaves[page].querySelector('.page-content, button')?.focus({ preventScroll: true });
      return;
    }
    requestedPage = page;
    focusAfterTurn = moveFocus;
    void audio.unlock();
    if (motionPreference.matches) {
      void audio.play(page === 0 || page === lastPage || currentPage === 0 || currentPage === lastPage);
      book.turnToPage(page);
      updateUI();
      requestedPage = null;
    } else {
      // The engine's corner-only hit test also affects its programmatic API,
      // whose backward coordinates can fall outside a centered book.
      const settings = book.getSettings();
      settings.disableFlipByClick = false;
      try { book.flip(page, 'bottom'); } finally { settings.disableFlipByClick = true; }
    }
  }
  function next() { goTo(currentPage === lastPage ? 0 : Math.max(...visiblePages()) + 1); }
  function previous() { goTo(currentPage - 1); }
  previousButton.addEventListener('click', previous);
  nextButton.addEventListener('click', next);
  document.querySelectorAll('button[data-chapter]').forEach(button => button.addEventListener('click', () => {
    chapterMenu.open = false;
    goTo(leaves.findIndex(leaf => leaf.dataset.chapter === button.dataset.chapter), true);
  }));
  document.querySelectorAll('[data-book-action]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    goTo(button.dataset.bookAction === 'open' ? 1 : 0, true);
  }));
  document.querySelector('.contact-me')?.addEventListener('click', event => {
    event.preventDefault();
    goTo(leaves.findIndex(leaf => leaf.id === 'contact'), true);
  });
  document.addEventListener('click', event => { if (!chapterMenu.contains(event.target)) chapterMenu.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && chapterMenu.open) {
      chapterMenu.open = false;
      chapterMenu.querySelector('summary').focus();
      return;
    }
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || readingMode ||
      event.target.closest('input, textarea, select, [contenteditable="true"]') || chapterMenu.open) return;
    const action = { ArrowRight: next, ArrowLeft: previous, Home: () => goTo(0), End: () => goTo(lastPage) }[event.key];
    if (action) { event.preventDefault(); action(); }
  });
  // Keep form fields and links independent from the engine's mouse/touch handling.
  ['mousedown', 'touchstart'].forEach(type => bookElement.addEventListener(type, event => {
    if (readingMode || motionPreference.matches || event.target.closest('a, button, input, textarea, label, select')) event.stopPropagation();
  }, { capture: true, passive: true }));
  bookElement.addEventListener('pointerdown', () => { if (!readingMode) void audio.unlock(); }, { passive: true });
  let touchStart;
  bookElement.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY, time: performance.now() } : null;
  }, { capture: true, passive: true });
  bookElement.addEventListener('touchend', event => {
    const touch = event.changedTouches[0];
    if (book && touch && touchStart && !readingMode && !motionPreference.matches &&
      Math.abs(touch.clientX - touchStart.x) > 45 && Math.abs(touch.clientY - touchStart.y) < 90 &&
      performance.now() - touchStart.time < 250) {
      // Let the engine's swipe handler use the same API as the arrow controls.
      book.getSettings().disableFlipByClick = false;
      // Keep the override through the window-level touchend listener. A
      // microtask can run between native event listeners and reset it too soon.
      window.setTimeout(() => { book.getSettings().disableFlipByClick = true; }, 0);
    }
    touchStart = null;
  }, { capture: true, passive: true });

  function setReadingMode(enabled) {
    if (!book || busy) return;
    readingMode = enabled;
    body.classList.toggle('reading-mode', enabled);
    readingButton.setAttribute('aria-pressed', String(enabled));
    readingButton.textContent = enabled ? 'Return to the book' : 'Read as a page';
    updateAccessibility();
    if (!enabled) {
      reflowBook(true);
      book.update();
      updateUI();
      document.querySelector('.book-stage').scrollIntoView({ block: 'center', behavior: 'instant' });
    } else leaves[currentPage].scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  readingButton.addEventListener('click', () => setReadingMode(!readingMode));

  if (!window.St?.PageFlip) {
    // Static HTML remains readable if the local engine could not load.
    document.querySelector('.shelf-caption').textContent = 'The work & the story of Amoni Kevin';
    document.querySelectorAll('button[data-chapter]').forEach(button => button.addEventListener('click', () => leaves[Number(button.dataset.chapter)].scrollIntoView()));
    return;
  }
  body.classList.add('book-ready');
  const initialSize = measureBook();
  leaves = pagination.paginate(initialSize.width, initialSize.height);
  lastPage = leaves.length - 1;
  lastSize = initialSize;
  bookElement.replaceChildren(...leaves);
  book = new St.PageFlip(bookElement, {
    width: initialSize.width, height: initialSize.height, size: 'fixed',
    minWidth: 1, maxWidth: 1800, minHeight: 1, maxHeight: 1800,
    autoSize: false, showCover: true, usePortrait: true, drawShadow: true, maxShadowOpacity: 0.32,
    flippingTime: 1100, mobileScrollSupport: true, swipeDistance: 45,
    showPageCorners: !motionPreference.matches, disableFlipByClick: true, useMouseEvents: true,
  });
  book.on('init', () => {
    updateUI();
    requestAnimationFrame(() => body.classList.add('book-mounted'));
  });
  book.on('flip', updateUI);
  book.on('changeOrientation', updateUI);
  book.on('changeState', event => {
    busy = event.data === 'flipping' || event.data === 'user_fold';
    bookElement.dataset.state = event.data;
    previousButton.disabled = currentPage === 0 || busy;
    nextButton.disabled = busy;
    if (busy) {
      if (currentPage === 0 || currentPage === lastPage) position.dataset.position = 'open';
      if (!soundPlayed) {
        soundPlayed = true;
        void audio.play(currentPage === 0 || currentPage === lastPage || requestedPage === 0 || requestedPage === lastPage);
      }
    }
    if (event.data === 'read') {
      soundPlayed = false;
      updateUI();
      requestedPage = null;
      if (pendingLayout) requestAnimationFrame(() => reflowBook(true));
    }
  });
  book.loadFromHTML(leaves);
  // Hover previews are disabled for reduced motion and the continuous reading view.
  window.addEventListener('mousemove', event => {
    if (readingMode || motionPreference.matches) event.stopImmediatePropagation();
  }, true);
  function updateMotion() {
    book.getSettings().showPageCorners = !motionPreference.matches;
    document.querySelector('.gesture-hint').textContent = motionPreference.matches ? 'Use the arrows to read at your own pace' : 'Drag a corner or use the arrows to turn a page';
  }
  motionPreference.addEventListener('change', updateMotion);
  updateMotion();
  function measureBook() {
    const stage = document.querySelector('.book-stage');
    const height = Math.floor(stage.clientHeight);
    const portrait = window.innerWidth < 900 && !(window.innerWidth > 640 && window.innerWidth > window.innerHeight * 1.4);
    const width = Math.floor(Math.min(stage.clientWidth / (portrait ? 1 : 2), portrait ? 640 : 860));
    position.style.width = `${width * (portrait ? 1 : 2)}px`;
    return { width, height, portrait };
  }
  function reflowBook(force = false) {
    if (!book || readingMode) return;
    if (busy) { pendingLayout = true; return; }
    const size = measureBook();
    if (!force && lastSize && Object.keys(size).every(key => size[key] === lastSize[key])) return;
    pendingLayout = false;
    const current = leaves[currentPage];
    const key = current?.dataset.chapter;
    const part = Number(current?.dataset.part || 0);
    const wasBack = currentPage === lastPage;
    rebuilding = true;
    // Reset before replacing pages: the old index may exceed the new page count.
    book.turnToPage(0);
    leaves = pagination.paginate(size.width, size.height);
    lastPage = leaves.length - 1;
    Object.assign(book.getSettings(), { width: size.width, height: size.height });
    book.updateFromHtml(leaves);
    book.update();
    const candidates = leaves.map((leaf, index) => ({ leaf, index })).filter(item => item.leaf.dataset.chapter === key);
    const destination = wasBack ? lastPage : key && candidates.length ? candidates[Math.min(part, candidates.length - 1)].index : 0;
    book.turnToPage(destination);
    lastSize = size;
    rebuilding = false;
    updateUI();
  }
  let resizeFrame;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => reflowBook());
  }).observe(document.querySelector('.book-stage'));
  document.fonts?.ready.then(() => reflowBook(true));
})();
