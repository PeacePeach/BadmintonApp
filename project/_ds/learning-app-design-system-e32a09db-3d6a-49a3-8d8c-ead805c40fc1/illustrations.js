/* Rallywise illustrations
   Simple flat graphics for empty, error, success and connection states.
   Style: soft circular backdrop, 2px outlines, object bodies in the app
   background colour, one small filled area in brand blue. All colours come
   from the --illustration-* tokens in tokens/colors.css.

   Exposes on window.LearningAppDesignSystem_e32a09:
     Illustration({ name, size, title })
     EmptyState({ illustration, title, body, actionLabel, onAction, style })
     illustrationNames            list of available names
     illustrationMarkup(name)     raw SVG string, for plain HTML pages
*/
(() => {
  const ns = (window.LearningAppDesignSystem_e32a09 = window.LearningAppDesignSystem_e32a09 || {});

  const LINE = 'var(--illustration-line, #6c9fef)';
  const FILL = 'var(--illustration-fill, #2d75e8)';
  const BODY = 'var(--illustration-surface, #1b1a1d)';
  const DETAIL = 'var(--illustration-detail, #e6eefc)';
  const TINT = 'var(--illustration-backdrop, #6c9fef)';

  const o = `fill="${BODY}" stroke="${LINE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const f = `fill="${FILL}" stroke="${LINE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const l = `fill="none" stroke="${LINE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const d = `fill="none" stroke="${DETAIL}" stroke-width="2" stroke-linecap="round"`;

  // Each drawing sits on a 160 x 160 canvas around the backdrop circle (r 60).
  const drawings = {
    // Racket and shuttlecock at rest
    'no-matches': (id) => `
      <g transform="translate(-12 2) rotate(32 80 80)">
        <clipPath id="${id}-head"><ellipse cx="80" cy="52" rx="18" ry="23"/></clipPath>
        <ellipse cx="80" cy="52" rx="18" ry="23" ${o}/>
        <g clip-path="url(#${id}-head)" stroke="${LINE}" stroke-width="1.5" opacity=".5">
          <path d="M73 26v52M80 26v52M87 26v52M60 45h40M60 52h40M60 59h40"/>
        </g>
        <path d="M75 74l3 8h4l3-8" ${l}/>
        <path d="M78 82h4v16h-4z" ${o}/>
        <rect x="75" y="98" width="10" height="22" rx="4" ${f}/>
      </g>
      <g transform="translate(114 116) rotate(-38)">
        <path d="M-7 0L-12 -24H12L7 0Z" ${o}/>
        <path d="M-2.5 -1L-4 -23M2.5 -1L4 -23M-9.5 -11H9.5" fill="none" stroke="${LINE}" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M-7 0a7 7 0 0 0 14 0Z" ${f}/>
      </g>`,

    // Two players, the front one filled
    'no-players': () => `
      <circle cx="99" cy="62" r="11" ${o}/>
      <path d="M80 106c0-11 8.5-20 19-20s19 9 19 20Z" ${o}/>
      <circle cx="70" cy="70" r="14" ${o}/>
      <path d="M46 120c0-14 10.7-25 24-25s24 11 24 25Z" ${f}/>`,

    // Chart card with bars still to grow
    'no-insights': () => `
      <rect x="46" y="40" width="68" height="82" rx="10" ${o}/>
      <path d="M57 54h22M57 62h14" ${l} opacity=".55"/>
      <rect x="57" y="92" width="10" height="18" rx="3" ${o}/>
      <rect x="75" y="82" width="10" height="28" rx="3" ${o}/>
      <rect x="93" y="68" width="10" height="42" rx="3" ${f}/>
      <path d="M98 76v26" ${d} opacity=".7"/>`,

    // Magnifier over an empty result
    'no-results': () => `
      <path d="M93 90l18 18" fill="none" stroke="${LINE}" stroke-width="12" stroke-linecap="round"/>
      <path d="M93 90l18 18" fill="none" stroke="${FILL}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="74" cy="72" r="26" ${o}/>
      <path d="M60 64a16 16 0 0 1 12-9" ${l}/>
      <path d="M64 78h20M68 86h12" ${l} opacity=".55"/>`,

    // Note card with an alert badge
    'error': () => `
      <rect x="40" y="52" width="62" height="70" rx="10" ${o}/>
      <rect x="49" y="62" width="44" height="14" rx="5" ${f}/>
      <path d="M55 69h20" ${d}/>
      <path d="M50 90h38M50 100h26" ${l} opacity=".55"/>
      <circle cx="104" cy="56" r="17" ${o}/>
      <path d="M104 47v11" fill="none" stroke="${FILL}" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="104" cy="65" r="2.2" fill="${FILL}"/>
      <path d="M122 40l4-4M126 54h5M113 33l1-5" ${l}/>`,

    // Trophy with a check
    'success': () => `
      <path d="M58 56h-6a9 9 0 0 0 9 15M102 56h6a9 9 0 0 1-9 15" ${l}/>
      <path d="M58 46h44v22a22 22 0 0 1-44 0Z" ${o}/>
      <path d="M70 66l7 7 13-14" fill="none" stroke="${FILL}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M76 90h8v12h-8z" ${o}/>
      <rect x="62" y="102" width="36" height="14" rx="5" ${f}/>
      <path d="M72 109h16" ${d}/>`,

    // Target with a shuttlecock in the centre
    'no-focus': () => `
      <circle cx="76" cy="84" r="34" ${o}/>
      <circle cx="76" cy="84" r="22" ${o}/>
      <circle cx="76" cy="84" r="10" ${f}/>
      <g transform="translate(80 80) rotate(45)">
        <path d="M-7 0L-12 -24H12L7 0Z" ${o}/>
        <path d="M-2.5 -1L-4 -23M2.5 -1L4 -23M-9.5 -11H9.5" fill="none" stroke="${LINE}" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M-7 0a7 7 0 0 0 14 0Z" ${f}/>
      </g>
      <path d="M118 44l4-4M122 58h5M109 37l1-5" ${l}/>`,

    // Signal arcs with a break through them
    'connection-lost': (id) => `
      <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160">
        <rect width="160" height="160" fill="#fff"/>
        <path d="M52 46l58 64" stroke="#000" stroke-width="10" stroke-linecap="round"/>
      </mask>
      <g mask="url(#${id}-cut)">
        <path d="M66 94a20 20 0 0 1 28 0M54 82a37 37 0 0 1 52 0M42 70a54 54 0 0 1 76 0" ${l}/>
      </g>
      <circle cx="80" cy="108" r="7" ${f}/>
      <path d="M54 48l54 60" fill="none" stroke="${FILL}" stroke-width="3.5" stroke-linecap="round"/>`,
  };

  let seq = 0;
  function illustrationMarkup(name, uid) {
    const draw = drawings[name];
    if (!draw) return '';
    const id = uid || 'rwi' + (++seq);
    return `<svg viewBox="0 0 160 160" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${TINT}" stop-opacity=".09"/>
          <stop offset="1" stop-color="${TINT}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r="60" fill="url(#${id}-bg)"/>
      ${draw(id)}
    </svg>`;
  }

  function Illustration({ name, size = 160, title, style }) {
    const ref = React.useRef(null);
    if (!ref.current) ref.current = 'rwi' + (++seq);
    return React.createElement('div', {
      role: title ? 'img' : undefined,
      'aria-label': title,
      'aria-hidden': title ? undefined : true,
      style: { width: size, height: size, flexShrink: 0, ...style },
      dangerouslySetInnerHTML: { __html: illustrationMarkup(name, ref.current) },
    });
  }

  function EmptyState({ illustration, title, body, actionLabel, onAction, size = 160, style }) {
    const h = React.createElement;
    return h('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 16px', ...style },
    },
      illustration ? h(Illustration, { name: illustration, size }) : null,
      title ? h('div', { style: { font: '500 19px/1.35 var(--font-sans)', color: 'var(--text-primary)', marginTop: 20 } }, title) : null,
      body ? h('div', { style: { font: 'var(--empty-body-weight, 400) 15px/1.45 var(--font-sans)', color: 'var(--text-secondary)', marginTop: 8, maxWidth: 280 } }, body) : null,
      actionLabel ? h('button', {
        onClick: onAction,
        style: { marginTop: 24, height: 52, padding: '0 28px', border: '1px solid var(--ghost-button-outline)', borderRadius: 999, background: 'transparent', color: 'var(--text-primary)', font: '500 15px/1 var(--font-sans)', cursor: 'pointer' },
      }, actionLabel) : null
    );
  }

  ns.Illustration = Illustration;
  ns.EmptyState = EmptyState;
  ns.illustrationNames = Object.keys(drawings);
  ns.illustrationMarkup = (name) => illustrationMarkup(name);
})();
