/* @ds-bundle: {"format":4,"namespace":"LearningAppDesignSystem_e32a09","components":[{"name":"Card","sourcePath":"components/cards/Card.jsx"},{"name":"CourseCard","sourcePath":"components/cards/CourseCard.jsx"},{"name":"StatCard","sourcePath":"components/cards/StatCard.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"BarChart","sourcePath":"components/data/BarChart.jsx"},{"name":"ProgressBar","sourcePath":"components/data/ProgressBar.jsx"},{"name":"Greeting","sourcePath":"components/navigation/Greeting.jsx"},{"name":"SectionHeader","sourcePath":"components/navigation/SectionHeader.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"},{"name":"Avatar","sourcePath":"components/people/Avatar.jsx"},{"name":"AvatarStack","sourcePath":"components/people/AvatarStack.jsx"}],"sourceHashes":{"components/cards/Card.jsx":"15367efc9c78","components/cards/CourseCard.jsx":"c5df806b71d1","components/cards/StatCard.jsx":"0de519f62976","components/core/Badge.jsx":"fee515fa7cb9","components/core/Chip.jsx":"9362482af729","components/core/Icon.jsx":"612bec4b9c65","components/core/IconButton.jsx":"0149b85e2a62","components/data/BarChart.jsx":"12c94b7ba25f","components/data/ProgressBar.jsx":"5417f555c026","components/navigation/Greeting.jsx":"158957af3b0a","components/navigation/SectionHeader.jsx":"7910b749c0f0","components/navigation/TopBar.jsx":"69ce63380eb0","components/people/Avatar.jsx":"8c05147480d5","components/people/AvatarStack.jsx":"6b7cc11a9b27","ui_kits/mobile-app/Home.jsx":"4f22b651ce89","ui_kits/mobile-app/Onboarding.jsx":"c2b02f62ab33","ui_kits/mobile-app/Overview.jsx":"f8aad329665e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LearningAppDesignSystem_e32a09 = window.LearningAppDesignSystem_e32a09 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/cards/Card.jsx
try { (() => {
function Card({
  tone = 'lilac',
  stacked = false,
  padding = 'var(--card-pad)',
  radius = 'var(--radius-lg)',
  children,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: 'var(--surface-card-' + tone + ')',
      color: 'var(--text-on-light)',
      borderRadius: radius,
      padding,
      position: 'relative',
      fontFamily: 'var(--font-sans)',
      boxShadow: stacked ? '0 14px 0 -6px var(--ink-4)' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function Badge({
  tone = 'black',
  pointer = false,
  children,
  style
}) {
  const light = tone === 'light';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-pill)',
      font: light ? '400 16px/1 var(--font-sans)' : '400 11px/1 var(--font-sans)',
      padding: light ? '8px 14px' : '4px 9px',
      background: light ? 'var(--sage-300)' : 'var(--ink-0)',
      color: light ? 'var(--text-on-light)' : 'var(--white)',
      boxShadow: light ? 'var(--shadow-tooltip)' : 'none',
      ...style
    }
  }, children, pointer && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: -5,
      left: '50%',
      marginLeft: -6,
      width: 12,
      height: 12,
      background: 'inherit',
      transform: 'rotate(45deg)',
      borderRadius: 2
    }
  }));
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function Chip({
  active = false,
  children,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    style: {
      height: 'var(--size-chip)',
      padding: '0 26px',
      borderRadius: 'var(--radius-pill)',
      font: '400 15px/1 var(--font-sans)',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      flexShrink: 0,
      transition: 'all var(--dur-base) var(--ease-out)',
      background: 'var(--filter-pill-bg)',
      color: active ? 'var(--filter-pill-text-selected)' : 'var(--filter-pill-text-default)',
      border: active ? '1px solid var(--filter-pill-border-selected)' : '1px solid transparent'
    }
  }, children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function Icon({
  name,
  size = 22,
  strokeWidth = 1.6,
  color = 'currentColor',
  fill = 'none',
  style
}) {
  const lib = typeof window !== 'undefined' && window.lucide && window.lucide.icons;
  let node = lib && lib[name];
  if (node && node[0] === 'svg') node = node[2];
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: fill,
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      flexShrink: 0,
      ...style
    },
    "aria-hidden": "true"
  }, (node || []).map(([tag, attrs], i) => React.createElement(tag, {
    key: i,
    ...attrs
  })));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
const V = {
  dark: {
    background: 'var(--neutral-100)',
    color: 'var(--text-on-dark)',
    border: 'none'
  },
  outline: {
    background: 'transparent',
    color: 'var(--text-on-dark)',
    border: '1px solid var(--border-dark)'
  },
  black: {
    background: 'var(--action-primary)',
    color: 'var(--action-on-primary)',
    border: 'none'
  },
  light: {
    background: 'var(--surface-inset-light)',
    color: 'var(--text-on-light)',
    border: 'none'
  },
  white: {
    background: 'var(--white)',
    color: 'var(--text-on-light)',
    border: 'none'
  }
};
function IconButton({
  icon,
  variant = 'dark',
  size,
  iconSize,
  iconFill,
  ring = false,
  label,
  onClick,
  style
}) {
  const s = size || (variant === 'black' ? 50 : 56);
  const btn = /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label || icon,
    onClick: onClick,
    style: {
      ...V[variant],
      width: s,
      height: s,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      cursor: 'pointer',
      transition: 'transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast)',
      ...(ring ? {} : style)
    },
    onMouseDown: e => e.currentTarget.style.transform = 'scale(.94)',
    onMouseUp: e => e.currentTarget.style.transform = '',
    onMouseLeave: e => e.currentTarget.style.transform = ''
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize || Math.round(s * 0.42),
    fill: iconFill,
    strokeWidth: variant === 'black' ? 1.8 : 1.6
  }));
  if (!ring) return btn;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: s + 20,
      height: s + 20,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'conic-gradient(var(--sage-500) 0 78%, transparent 78% 100%)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: s + 12,
      height: s + 12,
      borderRadius: '50%',
      background: 'var(--bg-canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, btn));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/cards/StatCard.jsx
try { (() => {
function StatCard({
  tone = 'butter',
  icon,
  label,
  value,
  onClick
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    tone: tone,
    padding: "18px",
    style: {
      minHeight: 210,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 50,
      height: 50,
      borderRadius: '50%',
      background: 'var(--surface-inset-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 24
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      marginTop: 22
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 var(--fs-stat)/1 var(--font-sans)'
    }
  }, value), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "ArrowUpRight",
    variant: "black",
    onClick: onClick
  })));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data/BarChart.jsx
try { (() => {
function BarChart({
  data = [],
  highlight,
  height = 190,
  onSelect
}) {
  const hi = highlight ?? data.length - 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      fontFamily: 'var(--font-sans)'
    }
  }, data.map((d, i) => {
    const on = i === hi;
    return /*#__PURE__*/React.createElement("div", {
      key: d.label,
      onClick: () => onSelect && onSelect(i),
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        cursor: onSelect ? 'pointer' : 'default'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Badge, {
      tone: on ? 'light' : 'black',
      pointer: on,
      style: {
        marginBottom: on ? 10 : -12,
        zIndex: 1
      }
    }, d.value, "%"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 48,
        height: Math.max(48, d.value / 100 * (height - 40)),
        borderRadius: 'var(--radius-pill)',
        background: on ? 'var(--ink-2)' : 'var(--sage-100)',
        transition: 'height var(--dur-base) var(--ease-out), background var(--dur-base)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: 'var(--text-on-light-muted)'
      }
    }, d.label));
  }));
}
Object.assign(__ds_scope, { BarChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/data/ProgressBar.jsx
try { (() => {
function ProgressBar({
  value = 0,
  label = 'Progress',
  showValue = true
}) {
  const v = Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)'
    }
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingRight: 36,
      fontSize: 13,
      color: 'var(--text-on-light-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, label), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: 'var(--text-on-light)'
    }
  }, v, "%")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--progress-track)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: v + '%',
      height: '100%',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--gradient-progress)',
      transition: 'width var(--dur-base) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SectionHeader.jsx
try { (() => {
function SectionHeader({
  title,
  action = 'View all',
  onAction
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-section)',
      color: 'var(--text-on-dark)'
    }
  }, title), action && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onAction,
    style: {
      background: 'none',
      border: 0,
      padding: 0,
      cursor: 'pointer',
      font: '400 17px/1 var(--font-sans)',
      color: 'var(--text-on-dark-muted)'
    }
  }, action));
}
Object.assign(__ds_scope, { SectionHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SectionHeader.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
function TopBar({
  title,
  onBack,
  trailingIcon = 'Bell',
  onTrailing
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "ChevronLeft",
    onClick: onBack,
    label: "Back"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      color: 'var(--text-on-dark)'
    }
  }, title), trailingIcon ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: trailingIcon,
    onClick: onTrailing
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56
    }
  }));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/people/Avatar.jsx
try { (() => {
function Avatar({
  src,
  size = 58,
  alt = '',
  ring
}) {
  return /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: alt,
    width: size,
    height: size,
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      objectFit: 'cover',
      display: 'block',
      flexShrink: 0,
      background: 'var(--ink-3)',
      boxShadow: ring ? '0 0 0 2px ' + ring : 'none'
    }
  });
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/people/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Greeting.jsx
try { (() => {
function Greeting({
  avatar,
  greeting = 'Good Morning,',
  name,
  onBell
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: avatar
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-on-dark-muted)'
    }
  }, greeting), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 500,
      color: 'var(--text-on-dark)',
      marginTop: 2
    }
  }, name)), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "Bell",
    onClick: onBell
  }));
}
Object.assign(__ds_scope, { Greeting });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Greeting.jsx", error: String((e && e.message) || e) }); }

// components/people/AvatarStack.jsx
try { (() => {
function AvatarStack({
  srcs = [],
  extra,
  size = 50
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, srcs.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      marginLeft: i ? -size * 0.4 : 0,
      zIndex: i
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    src: s,
    size: size,
    ring: "var(--sage-500)"
  }))), extra && /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: -size * 0.4,
      zIndex: srcs.length,
      width: size + 4,
      height: size,
      borderRadius: '50%',
      background: 'var(--sage-300)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      font: '400 14px/1 var(--font-sans)',
      color: 'var(--text-on-light-muted)'
    }
  }, extra));
}
Object.assign(__ds_scope, { AvatarStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/people/AvatarStack.jsx", error: String((e && e.message) || e) }); }

// components/cards/CourseCard.jsx
try { (() => {
function CourseCard({
  tone = 'lilac',
  title,
  subtitle,
  progress,
  meta,
  avatars,
  extra,
  action = 'arrow',
  stacked = false,
  onAction
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    tone: tone,
    stacked: stacked
  }, meta && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      background: 'var(--surface-inset-light)',
      borderRadius: 'var(--radius-pill)',
      padding: '11px 24px',
      fontSize: 13,
      color: 'var(--text-on-light-muted)',
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("span", null, meta.label), /*#__PURE__*/React.createElement("span", null, meta.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: meta ? '500 19px/1.4 var(--font-sans)' : 'var(--type-card-title)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: 'var(--text-on-light-muted)',
      marginTop: 8
    }
  }, subtitle)), action === 'arrow' && !meta && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "ArrowUpRight",
    variant: "black",
    onClick: onAction
  })), typeof progress === 'number' && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.ProgressBar, {
    value: progress
  })), (avatars || action === 'play') && meta && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 34
    }
  }, avatars ? /*#__PURE__*/React.createElement(__ds_scope.AvatarStack, {
    srcs: avatars,
    extra: extra
  }) : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: action === 'play' ? 'Play' : 'ArrowUpRight',
    iconFill: action === 'play' ? 'currentColor' : undefined,
    variant: "black",
    onClick: onAction
  })));
}
Object.assign(__ds_scope, { CourseCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/cards/CourseCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/Home.jsx
try { (() => {
function Home({
  onOpenCourse,
  onOpenOverview
}) {
  const {
    Greeting,
    IconButton,
    CourseCard,
    Chip
  } = window.LearningAppDesignSystem_e32a09;
  const [cat, setCat] = React.useState('All');
  const av = '../../assets/avatar-john.png';
  const courses = {
    All: 'Professional Video Editing From Noob - Pro',
    Trending: 'Motion Design Essentials',
    Newest: 'Brand Identity Systems',
    Advance: 'Design Leadership Masterclass'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '58px 20px 30px',
      display: 'flex',
      flexDirection: 'column',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement(Greeting, {
    avatar: av,
    name: "John Smith Bruno"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      font: 'var(--type-title)',
      color: 'var(--text-on-dark)'
    }
  }, "Your Progress Today"), /*#__PURE__*/React.createElement(IconButton, {
    icon: "Search",
    variant: "outline",
    size: 56,
    style: {
      height: 80,
      borderRadius: 28
    }
  })), /*#__PURE__*/React.createElement(CourseCard, {
    title: "Design Management from Scratch",
    subtitle: "Design Management from Scratch",
    progress: 88,
    onAction: onOpenOverview
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      margin: '0 -20px',
      padding: '0 20px',
      overflowX: 'auto',
      scrollbarWidth: 'none'
    }
  }, Object.keys(courses).map(c => /*#__PURE__*/React.createElement(Chip, {
    key: c,
    active: cat === c,
    onClick: () => setCat(c)
  }, c))), /*#__PURE__*/React.createElement(CourseCard, {
    tone: "sage",
    stacked: true,
    meta: {
      label: 'Full Course',
      time: '12h : 39m : 50s'
    },
    title: courses[cat],
    subtitle: "Design Management from Scratch",
    avatars: [av, av, av],
    extra: "10+",
    action: "play",
    onAction: onOpenOverview
  }));
}
window.Home = Home;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/Onboarding.jsx
try { (() => {
function Onboarding({
  onStart
}) {
  const {
    IconButton
  } = window.LearningAppDesignSystem_e32a09;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--sage-500)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/illustration-books.png",
    style: {
      height: '100%',
      maxWidth: '100%',
      objectFit: 'cover',
      objectPosition: 'bottom'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-canvas)',
      borderRadius: '34px 34px 0 0',
      padding: '30px 30px 44px',
      textAlign: 'center',
      marginTop: -2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-display)',
      letterSpacing: 'var(--ls-display)',
      color: 'var(--text-on-dark)'
    }
  }, "Start Learning", /*#__PURE__*/React.createElement("br", null), "Today"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      lineHeight: 1.45,
      color: 'var(--text-on-dark-muted)',
      marginTop: 14,
      textWrap: 'pretty'
    }
  }, "Design Management from Scratch Design Management from Scratch Design"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      marginTop: 26
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "ArrowRight",
    variant: "white",
    ring: true,
    onClick: onStart,
    label: "Get started"
  }))));
}
window.Onboarding = Onboarding;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/Onboarding.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile-app/Overview.jsx
try { (() => {
function Overview({
  onBack
}) {
  const {
    TopBar,
    BarChart,
    SectionHeader,
    StatCard,
    Icon
  } = window.LearningAppDesignSystem_e32a09;
  const weeks = {
    'This Week': {
      date: '07 November',
      data: [18, 56, 90, 82, 100]
    },
    'Last Week': {
      date: '31 October',
      data: [40, 72, 34, 66, 58]
    }
  };
  const [wk, setWk] = React.useState('This Week');
  const [hi, setHi] = React.useState(4);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  const w = weeks[wk];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '58px 20px 30px',
      display: 'flex',
      flexDirection: 'column',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    title: "Absence",
    onBack: onBack
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-title)',
      color: 'var(--text-on-dark)'
    }
  }, "Learning Time", /*#__PURE__*/React.createElement("br", null), "Overview"), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--sage-500)',
      borderRadius: 'var(--radius-xl)',
      padding: '16px 16px 14px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => {
      setWk(wk === 'This Week' ? 'Last Week' : 'This Week');
      setHi(4);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: 'none',
      border: 0,
      padding: 0,
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      textAlign: 'left',
      color: 'var(--text-on-light)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 52,
      height: 52,
      borderRadius: '50%',
      background: 'var(--surface-inset-light)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "CalendarDays",
    size: 24
  })), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 16
    }
  }, wk, /*#__PURE__*/React.createElement(Icon, {
    name: "ChevronDown",
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: 'var(--text-on-light-muted)'
    }
  }, w.date))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(BarChart, {
    data: days.map((d, i) => ({
      label: d,
      value: w.data[i]
    })),
    highlight: hi,
    onSelect: setHi,
    height: 210
  }))), /*#__PURE__*/React.createElement(SectionHeader, {
    title: "Lessons & Time"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    tone: "butter",
    icon: "Tablet",
    label: "Lessons",
    value: 36
  }), /*#__PURE__*/React.createElement(StatCard, {
    tone: "lilac",
    icon: "Timer",
    label: "Hours",
    value: 26
  })));
}
window.Overview = Overview;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile-app/Overview.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CourseCard = __ds_scope.CourseCard;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Greeting = __ds_scope.Greeting;

__ds_ns.SectionHeader = __ds_scope.SectionHeader;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarStack = __ds_scope.AvatarStack;

})();
