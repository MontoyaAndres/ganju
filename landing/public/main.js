(function () {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const header = document.getElementById('header');
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const navToggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');
  if (navToggle && nav) {
    const closeNav = () => {
      nav.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    };

    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      navToggle.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    });

    // Close the drawer when a link is tapped
    nav
      .querySelectorAll('a')
      .forEach(a => a.addEventListener('click', closeNav));

    // Close on resize back to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) closeNav();
    });
  }

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach(el => io.observe(el));
  } else {
    // No IO support — just show everything
    revealEls.forEach(el => el.classList.add('visible'));
  }

  const starEl = document.getElementById('starCount');
  if (starEl) {
    const REPO = 'MontoyaAndres/ganju';
    const fmt = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
    fetch('https://api.github.com/repos/' + REPO)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data && typeof data.stargazers_count === 'number') {
          starEl.textContent = fmt(data.stargazers_count);
        }
      })
      .catch(() => {
        /* leave the placeholder on network/API failure */
      });
  }
})();
