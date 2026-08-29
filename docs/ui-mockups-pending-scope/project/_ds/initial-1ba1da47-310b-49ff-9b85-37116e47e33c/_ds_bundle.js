/* @ds-bundle: {"format":3,"namespace":"ShadcnUiDesignSystem_1ba1da","components":[],"sourceHashes":{"ui_kits/dashboard/ChartCard.jsx":"f145b4c556cb","ui_kits/dashboard/DashboardSidebar.jsx":"b7ebea4849b8","ui_kits/dashboard/DashboardTopbar.jsx":"bd33830e094a","ui_kits/dashboard/Icons.jsx":"97fedbc27e48","ui_kits/dashboard/KpiCard.jsx":"568be3791e7c","ui_kits/dashboard/RecentSales.jsx":"15335e303395","ui_kits/docs/ComponentPreview.jsx":"c7f4f6a2e104","ui_kits/docs/Hero.jsx":"0920c490ff1b","ui_kits/docs/Icons.jsx":"97fedbc27e48","ui_kits/docs/Sidebar.jsx":"596f9db3063d","ui_kits/docs/TopNav.jsx":"3e4b02812ed1"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ShadcnUiDesignSystem_1ba1da = window.ShadcnUiDesignSystem_1ba1da || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/dashboard/ChartCard.jsx
try { (() => {
// Area-chart card. Pure SVG, no Recharts dependency.

const chartStyles = {
  wrap: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
    minWidth: 0
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 18,
    lineHeight: '24px',
    color: 'var(--foreground)',
    margin: 0
  },
  desc: {
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--muted-foreground)',
    margin: 0
  },
  toggleGroup: {
    display: 'inline-flex',
    background: 'var(--muted)',
    borderRadius: 8,
    padding: 2
  },
  toggle: {
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    cursor: 'pointer'
  },
  toggleActive: {
    background: '#fff',
    color: 'var(--foreground)',
    boxShadow: 'var(--shadow-xs)'
  }
};

// pseudo-random but stable values
const dataA = [22, 28, 24, 33, 30, 38, 42, 35, 48, 52, 45, 60, 55, 62, 68, 72, 65, 78, 82, 75, 88, 92, 85, 98, 95, 108, 112, 105, 118, 122];
const dataB = [16, 20, 18, 24, 22, 28, 32, 26, 38, 42, 36, 48, 44, 52, 58, 62, 55, 68, 72, 65, 78, 82, 75, 88, 85, 92, 98, 94, 108, 112];
function buildPath(values, w, h, max) {
  const pts = values.map((v, i) => [i / (values.length - 1) * w, h - v / max * h]);
  const line = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return {
    line,
    area
  };
}
function ChartCard() {
  const [range, setRange] = React.useState('3m');
  const W = 760,
    H = 220;
  const max = 140;
  const A = buildPath(dataA, W, H, max);
  const B = buildPath(dataB, W, H, max);
  return /*#__PURE__*/React.createElement("div", {
    style: chartStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: chartStyles.header
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: chartStyles.title
  }, "Total Visitors"), /*#__PURE__*/React.createElement("p", {
    style: chartStyles.desc
  }, "Total for the last 3 months")), /*#__PURE__*/React.createElement("div", {
    style: chartStyles.toggleGroup
  }, ['Last 3 months', 'Last 30 days', 'Last 7 days'].map((label, i) => {
    const key = ['3m', '30d', '7d'][i];
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      onClick: () => setRange(key),
      style: {
        ...chartStyles.toggle,
        ...(range === key ? chartStyles.toggleActive : {})
      }
    }, label);
  }))), /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H + 30}`,
    style: {
      width: '100%',
      height: 250
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "g1",
    x1: "0",
    x2: "0",
    y1: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "rgb(0,144,255)",
    stopOpacity: "0.35"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgb(0,144,255)",
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "g2",
    x1: "0",
    x2: "0",
    y1: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: "rgb(94,177,239)",
    stopOpacity: "0.25"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: "rgb(94,177,239)",
    stopOpacity: "0"
  }))), [0, 0.25, 0.5, 0.75, 1].map(p => /*#__PURE__*/React.createElement("line", {
    key: p,
    x1: "0",
    x2: W,
    y1: p * H,
    y2: p * H,
    stroke: "rgb(229,229,229)",
    strokeDasharray: "3 3"
  })), /*#__PURE__*/React.createElement("path", {
    d: B.area,
    fill: "url(#g2)"
  }), /*#__PURE__*/React.createElement("path", {
    d: B.line,
    fill: "none",
    stroke: "rgb(94,177,239)",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: A.area,
    fill: "url(#g1)"
  }), /*#__PURE__*/React.createElement("path", {
    d: A.line,
    fill: "none",
    stroke: "rgb(0,144,255)",
    strokeWidth: "2"
  }), ['Apr 1', 'Apr 8', 'Apr 15', 'Apr 22', 'Apr 29', 'May 6', 'May 13', 'May 20'].map((label, i, arr) => /*#__PURE__*/React.createElement("text", {
    key: label,
    x: i / (arr.length - 1) * W,
    y: H + 20,
    textAnchor: i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle',
    fontFamily: "Geist, Inter, sans-serif",
    fontSize: "11",
    fill: "rgb(115,115,115)"
  }, label))));
}
window.ChartCard = ChartCard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/ChartCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/DashboardSidebar.jsx
try { (() => {
// Left sidebar for the dashboard. Workspace switcher at the top,
// then two grouped nav sections, then a user card at the bottom.

const dashSidebarStyles = {
  wrap: {
    width: 240,
    flex: '0 0 240px',
    background: 'rgb(250,250,250)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },
  header: {
    padding: 8,
    borderBottom: '1px solid var(--border)'
  },
  workspaceBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    textAlign: 'left'
  },
  workspaceMark: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'rgb(10,10,10)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 12
  },
  workspaceText: {
    flex: 1,
    minWidth: 0
  },
  workspaceTitle: {
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: 13,
    color: 'var(--foreground)'
  },
  workspacePlan: {
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    color: 'var(--muted-foreground)'
  },
  nav: {
    flex: 1,
    overflow: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  groupLabel: {
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    padding: '8px 8px 4px'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--foreground)'
  },
  itemActive: {
    background: 'rgb(229,229,229)'
  },
  itemCount: {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--muted-foreground)'
  },
  footer: {
    padding: 8,
    borderTop: '1px solid var(--border)'
  },
  userBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    textAlign: 'left'
  }
};
function DashboardSidebar({
  active,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: dashSidebarStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.header
  }, /*#__PURE__*/React.createElement("button", {
    style: dashSidebarStyles.workspaceBtn
  }, /*#__PURE__*/React.createElement("span", {
    style: dashSidebarStyles.workspaceMark
  }, "AC"), /*#__PURE__*/React.createElement("span", {
    style: dashSidebarStyles.workspaceText
  }, /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.workspaceTitle
  }, "Acme Inc"), /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.workspacePlan
  }, "Enterprise")), /*#__PURE__*/React.createElement(Icon, {
    name: "chevrons-up-down",
    size: 14,
    color: "var(--muted-foreground)"
  }))), /*#__PURE__*/React.createElement("nav", {
    style: dashSidebarStyles.nav
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.groupLabel
  }, "Platform"), [{
    id: 'dashboard',
    icon: 'layers',
    label: 'Dashboard'
  }, {
    id: 'lifecycle',
    icon: 'box',
    label: 'Lifecycle'
  }, {
    id: 'analytics',
    icon: 'bar-chart',
    label: 'Analytics'
  }, {
    id: 'projects',
    icon: 'palette',
    label: 'Projects',
    count: 12
  }, {
    id: 'team',
    icon: 'github',
    label: 'Team'
  }].map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    style: {
      ...dashSidebarStyles.item,
      ...(active === it.id ? dashSidebarStyles.itemActive : {})
    },
    onClick: () => onSelect && onSelect(it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 16,
    color: "var(--foreground)"
  }), /*#__PURE__*/React.createElement("span", null, it.label), it.count && /*#__PURE__*/React.createElement("span", {
    style: dashSidebarStyles.itemCount
  }, it.count)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.groupLabel
  }, "Documents"), [{
    id: 'data-library',
    icon: 'box',
    label: 'Data Library'
  }, {
    id: 'reports',
    icon: 'box',
    label: 'Reports'
  }, {
    id: 'word-assistant',
    icon: 'sparkles',
    label: 'Word Assistant'
  }].map(it => /*#__PURE__*/React.createElement("div", {
    key: it.id,
    style: {
      ...dashSidebarStyles.item,
      ...(active === it.id ? dashSidebarStyles.itemActive : {})
    },
    onClick: () => onSelect && onSelect(it.id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: it.icon,
    size: 16,
    color: "var(--foreground)"
  }), /*#__PURE__*/React.createElement("span", null, it.label))))), /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.footer
  }, /*#__PURE__*/React.createElement("button", {
    style: dashSidebarStyles.userBtn
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...dashSidebarStyles.workspaceMark,
      background: 'rgb(245,245,245)',
      color: 'var(--foreground)'
    }
  }, "SK"), /*#__PURE__*/React.createElement("span", {
    style: dashSidebarStyles.workspaceText
  }, /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.workspaceTitle
  }, "shadcn"), /*#__PURE__*/React.createElement("div", {
    style: dashSidebarStyles.workspacePlan
  }, "m@example.com")), /*#__PURE__*/React.createElement(Icon, {
    name: "chevrons-up-down",
    size: 14,
    color: "var(--muted-foreground)"
  }))));
}
window.DashboardSidebar = DashboardSidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/DashboardSidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/DashboardTopbar.jsx
try { (() => {
// Topbar inside the dashboard. Sticky.

const dashTopbarStyles = {
  wrap: {
    height: 56,
    borderBottom: '1px solid var(--border)',
    background: '#fff',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground)',
    cursor: 'pointer'
  },
  sep: {
    width: 1,
    height: 20,
    background: 'var(--border)'
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--muted-foreground)'
  },
  breadcrumbCurrent: {
    color: 'var(--foreground)',
    fontWeight: 500
  },
  spacer: {
    flex: 1
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    padding: '0 8px 0 10px',
    background: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--muted-foreground)',
    minWidth: 240,
    cursor: 'pointer'
  },
  kbd: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    padding: '0 4px',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--muted-foreground)'
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    position: 'relative'
  },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 9999,
    background: 'var(--destructive)',
    border: '2px solid #fff'
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    background: 'rgb(23,23,23)',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 500
  }
};
function DashboardTopbar({
  section = 'Dashboard'
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: dashTopbarStyles.wrap
  }, /*#__PURE__*/React.createElement("button", {
    style: dashTopbarStyles.toggle
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "panel-left",
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.sep
  }), /*#__PURE__*/React.createElement("div", {
    style: dashTopbarStyles.breadcrumb
  }, /*#__PURE__*/React.createElement("span", null, "Building Your Application"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.breadcrumbCurrent
  }, section)), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.spacer
  }), /*#__PURE__*/React.createElement("div", {
    style: dashTopbarStyles.search
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Search..."), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.kbd
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    style: dashTopbarStyles.iconBtn
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.dot
  })), /*#__PURE__*/React.createElement("span", {
    style: dashTopbarStyles.avatar
  }, "SK"));
}
window.DashboardTopbar = DashboardTopbar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/DashboardTopbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/Icons.jsx
try { (() => {
// Shared Lucide icon sprite. Use as <Icon name="search" size={16} />.
// Stroke 2, square caps — matches lucide-react defaults.

const ICONS = {
  'search': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  })),
  'menu': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "6",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "18",
    y2: "18"
  })),
  'github': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 18c-4.51 2-5-2-7-2"
  })),
  'sun': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 20v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m4.93 4.93 1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m17.66 17.66 1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 12h2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 12h2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6.34 17.66-1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m19.07 4.93-1.41 1.41"
  })),
  'moon': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
  })),
  'chevron-right': /*#__PURE__*/React.createElement("path", {
    d: "m9 18 6-6-6-6"
  }),
  'chevron-down': /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }),
  'chevron-up': /*#__PURE__*/React.createElement("path", {
    d: "m18 15-6-6-6 6"
  }),
  'chevrons-up-down': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m7 15 5 5 5-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m7 9 5-5 5 5"
  })),
  'check': /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }),
  'circle-check': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 12 2 2 4-4"
  })),
  'x': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  })),
  'plus': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14"
  })),
  'arrow-right': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m12 5 7 7-7 7"
  })),
  'arrow-up-right': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M7 7h10v10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 17 17 7"
  })),
  'external-link': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 3h6v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 14 21 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  })),
  'copy': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "14",
    height: "14",
    x: "8",
    y: "8",
    rx: "2",
    ry: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
  })),
  'mail': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "20",
    height: "16",
    x: "2",
    y: "4",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
  })),
  'loader': /*#__PURE__*/React.createElement("path", {
    d: "M21 12a9 9 0 1 1-6.219-8.56"
  }),
  'sparkles': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.9 5.7L19.5 10.5l-5.6 1.8L12 18l-1.9-5.7L4.5 10.5l5.6-1.8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 3v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 17v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 5h4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 19h4"
  })),
  'palette': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "13.5",
    cy: "6.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "10.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "7.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
  })),
  'box': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "3.3 7 12 12 20.7 7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "22",
    y2: "12"
  })),
  'layers': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"
  })),
  'command': /*#__PURE__*/React.createElement("path", {
    d: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"
  }),
  'bell': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 21a1.94 1.94 0 0 0 3.4 0"
  })),
  'panel-left': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "3",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 3v18"
  })),
  'bar-chart': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "20",
    y2: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18",
    x2: "18",
    y1: "20",
    y2: "4"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    x2: "6",
    y1: "20",
    y2: "16"
  })),
  'settings': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
  })),
  'users': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 21v-2a4 4 0 0 0-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 0 1 0 7.75"
  })),
  'home': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "9 22 9 12 15 12 15 22"
  })),
  'user': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  })),
  'log-out': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 17 21 12 16 7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    x2: "9",
    y1: "12",
    y2: "12"
  })),
  'credit-card': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "20",
    height: "14",
    x: "2",
    y: "5",
    rx: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "2",
    x2: "22",
    y1: "10",
    y2: "10"
  })),
  'trending-up': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "22 7 13.5 15.5 8.5 10.5 2 17"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 7 22 7 22 13"
  })),
  'trending-down': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "22 17 13.5 8.5 8.5 13.5 2 7"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 17 22 17 22 11"
  })),
  'dollar': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "2",
    y2: "22"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
  })),
  'ellipsis': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1"
  })),
  'ellipsis-v': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "19",
    r: "1"
  })),
  'filter': /*#__PURE__*/React.createElement("polygon", {
    points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
  })
};
function Icon({
  name,
  size = 16,
  color = 'currentColor',
  style = {},
  className = ''
}) {
  const path = ICONS[name];
  if (!path) return null;
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      flexShrink: 0,
      ...style
    }
  }, path);
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/KpiCard.jsx
try { (() => {
// KPI card — title, large value, delta indicator.
// Matches the shadcn Dashboard block's metric cards.

const kpiStyles = {
  wrap: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  title: {
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--muted-foreground)',
    fontWeight: 400
  },
  delta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 9999,
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--foreground)'
  },
  deltaDown: {
    color: 'var(--destructive)'
  },
  value: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 30,
    lineHeight: '36px',
    letterSpacing: '-0.02em',
    color: 'var(--foreground)'
  },
  trendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--foreground)',
    fontWeight: 500
  },
  trendDesc: {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--muted-foreground)'
  }
};
function KpiCard({
  title,
  value,
  delta,
  deltaPositive = true,
  trend,
  description
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: kpiStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: kpiStyles.topRow
  }, /*#__PURE__*/React.createElement("span", {
    style: kpiStyles.title
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      ...kpiStyles.delta,
      ...(deltaPositive ? {} : kpiStyles.deltaDown)
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: deltaPositive ? 'trending-up' : 'trending-down',
    size: 12
  }), delta)), /*#__PURE__*/React.createElement("div", {
    style: kpiStyles.value
  }, value), /*#__PURE__*/React.createElement("div", {
    style: kpiStyles.trendRow
  }, /*#__PURE__*/React.createElement("span", null, trend), /*#__PURE__*/React.createElement(Icon, {
    name: deltaPositive ? 'trending-up' : 'trending-down',
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    style: kpiStyles.trendDesc
  }, description));
}
window.KpiCard = KpiCard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/KpiCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/dashboard/RecentSales.jsx
try { (() => {
// Recent sales / activity list. Avatar + name/email + amount.

const recentStyles = {
  wrap: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: 360,
    flex: '0 0 360px'
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 18,
    lineHeight: '24px',
    margin: 0
  },
  desc: {
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    color: 'var(--muted-foreground)',
    margin: 0
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    background: 'var(--muted)',
    color: 'var(--muted-foreground)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    fontSize: 13
  },
  rowText: {
    flex: 1,
    minWidth: 0
  },
  rowName: {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    fontSize: 14,
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  rowEmail: {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--muted-foreground)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  amount: {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    fontSize: 14,
    color: 'var(--foreground)'
  }
};
const SALES = [{
  initials: 'OM',
  name: 'Olivia Martin',
  email: 'olivia.martin@email.com',
  amount: '+$1,999.00',
  bg: 'rgb(229,229,229)'
}, {
  initials: 'JL',
  name: 'Jackson Lee',
  email: 'jackson.lee@email.com',
  amount: '+$39.00',
  bg: 'rgb(220,38,38)',
  color: '#fff'
}, {
  initials: 'IN',
  name: 'Isabella Nguyen',
  email: 'isabella.nguyen@email.com',
  amount: '+$299.00',
  bg: 'rgb(23,23,23)',
  color: '#fff'
}, {
  initials: 'WK',
  name: 'William Kim',
  email: 'will@email.com',
  amount: '+$99.00',
  bg: 'rgb(0,144,255)',
  color: '#fff'
}, {
  initials: 'SD',
  name: 'Sofia Davis',
  email: 'sofia.davis@email.com',
  amount: '+$39.00',
  bg: 'rgb(173,250,29)'
}];
function RecentSales() {
  return /*#__PURE__*/React.createElement("aside", {
    style: recentStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: recentStyles.header
  }, /*#__PURE__*/React.createElement("h3", {
    style: recentStyles.title
  }, "Recent Sales"), /*#__PURE__*/React.createElement("p", {
    style: recentStyles.desc
  }, "You made 265 sales this month.")), SALES.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.name,
    style: recentStyles.row
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...recentStyles.avatar,
      background: s.bg,
      color: s.color || 'var(--muted-foreground)'
    }
  }, s.initials), /*#__PURE__*/React.createElement("div", {
    style: recentStyles.rowText
  }, /*#__PURE__*/React.createElement("div", {
    style: recentStyles.rowName
  }, s.name), /*#__PURE__*/React.createElement("div", {
    style: recentStyles.rowEmail
  }, s.email)), /*#__PURE__*/React.createElement("span", {
    style: recentStyles.amount
  }, s.amount))));
}
window.RecentSales = RecentSales;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/dashboard/RecentSales.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/ComponentPreview.jsx
try { (() => {
// The canonical preview-card with Preview/Code tabs that lives next to every
// shadcn component example.

const previewStyles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 32
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--border)',
    height: 36
  },
  tabsLeft: {
    display: 'flex',
    gap: 4
  },
  tab: {
    padding: '8px 12px',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    position: 'relative',
    background: 'transparent',
    border: 'none'
  },
  tabActive: {
    color: 'var(--foreground)'
  },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    background: 'rgb(10,10,10)',
    borderRadius: 1
  },
  tabsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--muted-foreground)'
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--muted-foreground)',
    cursor: 'pointer'
  },
  previewBody: {
    minHeight: 350,
    border: '1px solid var(--border)',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    background: '#fff',
    position: 'relative'
  },
  codeBody: {
    minHeight: 350,
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    background: 'rgb(10,10,10)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineHeight: '20px',
    color: 'rgb(245,245,245)',
    padding: 20
  }
};
function ComponentPreview({
  children,
  code = '',
  title,
  name = 'default'
}) {
  const [tab, setTab] = React.useState('preview');
  return /*#__PURE__*/React.createElement("div", {
    style: previewStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: previewStyles.tabs
  }, /*#__PURE__*/React.createElement("div", {
    style: previewStyles.tabsLeft
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...previewStyles.tab,
      ...(tab === 'preview' ? previewStyles.tabActive : {})
    },
    onClick: () => setTab('preview')
  }, "Preview", tab === 'preview' && /*#__PURE__*/React.createElement("span", {
    style: previewStyles.tabUnderline
  })), /*#__PURE__*/React.createElement("button", {
    style: {
      ...previewStyles.tab,
      ...(tab === 'code' ? previewStyles.tabActive : {})
    },
    onClick: () => setTab('code')
  }, "Code", tab === 'code' && /*#__PURE__*/React.createElement("span", {
    style: previewStyles.tabUnderline
  }))), /*#__PURE__*/React.createElement("div", {
    style: previewStyles.tabsRight
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      marginRight: 4
    }
  }, name), /*#__PURE__*/React.createElement("button", {
    style: previewStyles.copyBtn,
    title: "Copy"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 14
  })))), tab === 'preview' ? /*#__PURE__*/React.createElement("div", {
    style: previewStyles.previewBody
  }, children) : /*#__PURE__*/React.createElement("pre", {
    style: previewStyles.codeBody
  }, /*#__PURE__*/React.createElement("code", null, code)));
}
window.ComponentPreview = ComponentPreview;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/ComponentPreview.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/Hero.jsx
try { (() => {
// Hero block — the landing-screen content above the fold.

const heroStyles = {
  wrap: {
    maxWidth: 900,
    padding: '64px 0 48px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  newBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: '4px 10px',
    background: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 9999,
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--foreground)',
    cursor: 'pointer'
  },
  newDot: {
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 9999,
    background: 'rgb(10,10,10)',
    color: '#fff'
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 48,
    lineHeight: '52px',
    letterSpacing: '-0.025em',
    color: 'var(--foreground)',
    margin: 0
  },
  subtitle: {
    fontFamily: 'var(--font-sans)',
    fontSize: 18,
    lineHeight: '28px',
    color: 'var(--muted-foreground)',
    margin: 0,
    maxWidth: 640
  },
  ctaRow: {
    display: 'flex',
    gap: 12,
    marginTop: 8
  }
};
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: heroStyles.wrap
  }, /*#__PURE__*/React.createElement("span", {
    style: heroStyles.newBadge
  }, /*#__PURE__*/React.createElement("span", {
    style: heroStyles.newDot
  }, "New"), "Introducing Universal Registry Items ", /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-right",
    size: 12
  })), /*#__PURE__*/React.createElement("h1", {
    style: heroStyles.title
  }, "The Foundation for your", /*#__PURE__*/React.createElement("br", null), "Design System."), /*#__PURE__*/React.createElement("p", {
    style: heroStyles.subtitle
  }, "A set of beautifully-designed, accessible components and a code distribution platform. Works with your favorite frameworks. Open Source. Open Code."), /*#__PURE__*/React.createElement("div", {
    style: heroStyles.ctaRow
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary"
  }, "Get Started"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "github",
    size: 14
  }), " GitHub")));
}
window.Hero = Hero;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/Icons.jsx
try { (() => {
// Shared Lucide icon sprite. Use as <Icon name="search" size={16} />.
// Stroke 2, square caps — matches lucide-react defaults.

const ICONS = {
  'search': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  })),
  'menu': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "12",
    y2: "12"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "6",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "4",
    x2: "20",
    y1: "18",
    y2: "18"
  })),
  'github': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 18c-4.51 2-5-2-7-2"
  })),
  'sun': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 20v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m4.93 4.93 1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m17.66 17.66 1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 12h2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 12h2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6.34 17.66-1.41 1.41"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m19.07 4.93-1.41 1.41"
  })),
  'moon': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
  })),
  'chevron-right': /*#__PURE__*/React.createElement("path", {
    d: "m9 18 6-6-6-6"
  }),
  'chevron-down': /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }),
  'chevron-up': /*#__PURE__*/React.createElement("path", {
    d: "m18 15-6-6-6 6"
  }),
  'chevrons-up-down': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m7 15 5 5 5-5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m7 9 5-5 5 5"
  })),
  'check': /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }),
  'circle-check': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 12 2 2 4-4"
  })),
  'x': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  })),
  'plus': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14"
  })),
  'arrow-right': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m12 5 7 7-7 7"
  })),
  'arrow-up-right': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M7 7h10v10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 17 17 7"
  })),
  'external-link': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M15 3h6v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 14 21 3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
  })),
  'copy': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "14",
    height: "14",
    x: "8",
    y: "8",
    rx: "2",
    ry: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
  })),
  'mail': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "20",
    height: "16",
    x: "2",
    y: "4",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
  })),
  'loader': /*#__PURE__*/React.createElement("path", {
    d: "M21 12a9 9 0 1 1-6.219-8.56"
  }),
  'sparkles': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l1.9 5.7L19.5 10.5l-5.6 1.8L12 18l-1.9-5.7L4.5 10.5l5.6-1.8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 3v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 17v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 5h4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 19h4"
  })),
  'palette': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "13.5",
    cy: "6.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "17.5",
    cy: "10.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "7.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12.5",
    r: ".5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
  })),
  'box': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "3.3 7 12 12 20.7 7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "22",
    y2: "12"
  })),
  'layers': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"
  })),
  'command': /*#__PURE__*/React.createElement("path", {
    d: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"
  }),
  'bell': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 21a1.94 1.94 0 0 0 3.4 0"
  })),
  'panel-left': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "3",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 3v18"
  })),
  'bar-chart': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "20",
    y2: "10"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "18",
    x2: "18",
    y1: "20",
    y2: "4"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    x2: "6",
    y1: "20",
    y2: "16"
  })),
  'settings': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
  })),
  'users': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 21v-2a4 4 0 0 0-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 0 1 0 7.75"
  })),
  'home': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "9 22 9 12 15 12 15 22"
  })),
  'user': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "7",
    r: "4"
  })),
  'log-out': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 17 21 12 16 7"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    x2: "9",
    y1: "12",
    y2: "12"
  })),
  'credit-card': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    width: "20",
    height: "14",
    x: "2",
    y: "5",
    rx: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "2",
    x2: "22",
    y1: "10",
    y2: "10"
  })),
  'trending-up': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "22 7 13.5 15.5 8.5 10.5 2 17"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 7 22 7 22 13"
  })),
  'trending-down': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
    points: "22 17 13.5 8.5 8.5 13.5 2 7"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "16 17 22 17 22 11"
  })),
  'dollar': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
    x1: "12",
    x2: "12",
    y1: "2",
    y2: "22"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
  })),
  'ellipsis': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "12",
    r: "1"
  })),
  'ellipsis-v': /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "19",
    r: "1"
  })),
  'filter': /*#__PURE__*/React.createElement("polygon", {
    points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
  })
};
function Icon({
  name,
  size = 16,
  color = 'currentColor',
  style = {},
  className = ''
}) {
  const path = ICONS[name];
  if (!path) return null;
  return /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      flexShrink: 0,
      ...style
    }
  }, path);
}
window.Icon = Icon;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/Icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/Sidebar.jsx
try { (() => {
// Left sidebar with component navigation.
// Section labels are uppercase 11px muted; items are 14px sentence-case.

const SIDEBAR_GROUPS = [{
  label: 'Getting Started',
  items: ['Introduction', 'Installation', 'components.json', 'Theming', 'Dark mode', 'CLI', 'Monorepo', 'Tailwind v4', 'Next.js 15 + React 19', 'Typography', 'Open in v0', 'JavaScript', 'Figma', 'Changelog']
}, {
  label: 'Installation',
  items: ['Next.js', 'Vite', 'Laravel', 'React Router', 'Remix', 'Astro', 'TanStack Start', 'TanStack Router', 'Manual']
}, {
  label: 'Components',
  items: ['Accordion', 'Alert', 'Alert Dialog', 'Aspect Ratio', 'Avatar', 'Badge', 'Breadcrumb', 'Button', 'Button Group', 'Calendar', 'Card', 'Carousel', 'Chart', 'Checkbox', 'Collapsible', 'Combobox', 'Command', 'Context Menu', 'Data Table', 'Date Picker', 'Dialog', 'Drawer', 'Dropdown Menu', 'Empty', 'Field', 'Form', 'Hover Card', 'Input', 'Input Group', 'Input OTP', 'Item', 'Label', 'Menubar', 'Navigation Menu', 'Pagination', 'Popover', 'Progress', 'Radio Group', 'Resizable', 'Scroll Area', 'Select', 'Separator', 'Sheet', 'Sidebar', 'Skeleton', 'Slider', 'Sonner', 'Spinner', 'Switch', 'Table', 'Tabs', 'Textarea', 'Toast', 'Toggle', 'Toggle Group', 'Tooltip']
}, {
  label: 'Registry',
  items: ['Introduction', 'Getting Started', 'Examples', 'Open in v0', 'FAQ', 'registry.json']
}];
const sidebarStyles = {
  wrap: {
    width: 240,
    flex: '0 0 240px',
    paddingTop: 24,
    paddingRight: 16,
    paddingBottom: 32,
    fontFamily: 'var(--font-sans)'
  },
  group: {
    marginBottom: 24
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--foreground)',
    padding: '4px 8px',
    marginBottom: 4,
    fontFamily: 'var(--font-sans)'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 14,
    color: 'var(--muted-foreground)',
    padding: '6px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'color 120ms, background 120ms'
  },
  itemActive: {
    color: 'var(--foreground)',
    fontWeight: 500,
    background: 'var(--muted)'
  },
  badgeNew: {
    fontFamily: 'var(--font-sans)',
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
    background: 'rgb(10,10,10)',
    color: '#fff',
    lineHeight: '14px'
  }
};
function Sidebar({
  active = 'Button',
  onSelect
}) {
  return /*#__PURE__*/React.createElement("aside", {
    style: sidebarStyles.wrap
  }, SIDEBAR_GROUPS.map(group => /*#__PURE__*/React.createElement("div", {
    key: group.label,
    style: sidebarStyles.group
  }, /*#__PURE__*/React.createElement("div", {
    style: sidebarStyles.label
  }, group.label), group.items.map(item => {
    const isActive = item === active;
    const isNew = ['Button Group', 'Input Group', 'Empty', 'Spinner', 'Field', 'Item'].includes(item);
    return /*#__PURE__*/React.createElement("div", {
      key: item,
      style: {
        ...sidebarStyles.item,
        ...(isActive ? sidebarStyles.itemActive : {})
      },
      onClick: () => onSelect && onSelect(item)
    }, /*#__PURE__*/React.createElement("span", null, item), isNew && /*#__PURE__*/React.createElement("span", {
      style: sidebarStyles.badgeNew
    }, "New"));
  }))));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/docs/TopNav.jsx
try { (() => {
// Top nav for the shadcn docs page.
// Logo + main nav + search + github + theme toggle.

const topNavStyles = {
  wrap: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'saturate(180%) blur(8px)',
    WebkitBackdropFilter: 'saturate(180%) blur(8px)',
    borderBottom: '1px solid var(--border)'
  },
  inner: {
    maxWidth: 1400,
    margin: '0 auto',
    height: 56,
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 24
  },
  brandWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginRight: 8
  },
  brandMark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: 'rgb(10,10,10)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 12
  },
  brand: {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 15,
    color: 'var(--foreground)',
    letterSpacing: '-0.01em'
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    flex: 1
  },
  navLink: {
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    transition: 'color 120ms ease'
  },
  navLinkActive: {
    color: 'var(--foreground)'
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  search: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    height: 32,
    padding: '0 8px 0 10px',
    background: 'var(--muted)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--muted-foreground)',
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    minWidth: 200,
    cursor: 'pointer'
  },
  kbd: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    padding: '0 4px',
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--muted-foreground)'
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground)',
    cursor: 'pointer'
  }
};
function TopNav({
  activeTab = 'Docs',
  onThemeToggle,
  theme = 'light'
}) {
  const tabs = ['Docs', 'Components', 'Blocks', 'Charts', 'Themes', 'Colors'];
  return /*#__PURE__*/React.createElement("div", {
    style: topNavStyles.wrap
  }, /*#__PURE__*/React.createElement("div", {
    style: topNavStyles.inner
  }, /*#__PURE__*/React.createElement("div", {
    style: topNavStyles.brandWrap
  }, /*#__PURE__*/React.createElement("span", {
    style: topNavStyles.brandMark
  }, "SC"), /*#__PURE__*/React.createElement("span", {
    style: topNavStyles.brand
  }, "shadcn/ui")), /*#__PURE__*/React.createElement("nav", {
    style: topNavStyles.navLinks
  }, tabs.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      ...topNavStyles.navLink,
      ...(t === activeTab ? topNavStyles.navLinkActive : {})
    }
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: topNavStyles.right
  }, /*#__PURE__*/React.createElement("div", {
    style: topNavStyles.search
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, "Search documentation..."), /*#__PURE__*/React.createElement("span", {
    style: topNavStyles.kbd
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    style: topNavStyles.iconBtn,
    title: "GitHub"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "github",
    size: 16
  })), /*#__PURE__*/React.createElement("button", {
    style: topNavStyles.iconBtn,
    title: "Toggle theme",
    onClick: onThemeToggle
  }, /*#__PURE__*/React.createElement(Icon, {
    name: theme === 'dark' ? 'moon' : 'sun',
    size: 16
  })))));
}
window.TopNav = TopNav;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/docs/TopNav.jsx", error: String((e && e.message) || e) }); }

})();
