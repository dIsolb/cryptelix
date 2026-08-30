export type AppGuideView = 'constructor' | 'database';

export interface AppGuideStep {
  id: string;
  target: string;
  title: string;
  description: string;
  view: AppGuideView;
  openWidgets?: boolean;
}

export const APP_GUIDE_STEPS: AppGuideStep[] = [
  {
    id: 'constructor',
    target: 'constructor',
    title: 'Constructor',
    description:
      'Your infinite canvas for post-trade analytics. Arrange widgets, notes, and drawings on a board that stays with this account.',
    view: 'constructor',
  },
  {
    id: 'dashboard',
    target: 'dashboard',
    title: 'Dashboard',
    description:
      'Each tab is a separate board. Add more with +, switch between them, and double-click a name to rename.',
    view: 'constructor',
  },
  {
    id: 'widgets',
    target: 'widgets',
    title: 'Widgets',
    description:
      'Drop charts and reports onto the canvas — Price Chart, WvL, cumulative P&L, Volume Mix, Stats, FTR, and more — all fed by your Deal Base.',
    view: 'constructor',
    openWidgets: true,
  },
  {
    id: 'draw',
    target: 'draw',
    title: 'Draw',
    description:
      'Sketch on the board with the brush or eraser. Use it to mark levels, circle setups, or annotate a widget.',
    view: 'constructor',
  },
  {
    id: 'text',
    target: 'text',
    title: 'Text',
    description:
      'Place a text field anywhere on the canvas for notes, checklists, or a thesis next to your charts.',
    view: 'constructor',
  },
  {
    id: 'go-to-widgets',
    target: 'go-to-widgets',
    title: 'Go To Widgets',
    description:
      'If you pan away from your widgets, this recenters the board on them so nothing gets lost on the canvas.',
    view: 'constructor',
  },
  {
    id: 'zoom-in',
    target: 'zoom-in',
    title: 'Zoom In',
    description:
      'Move closer to inspect a widget or drawing. Zoom with Ctrl (or Cmd) + mouse wheel.',
    view: 'constructor',
  },
  {
    id: 'zoom-out',
    target: 'zoom-out',
    title: 'Zoom Out',
    description:
      'Pull back to see the whole board. The percent in between resets zoom to 100%.',
    view: 'constructor',
  },
  {
    id: 'broker',
    target: 'broker',
    title: 'Broker Connection',
    description:
      'Link your exchange here to sync trades into Deal Base. The badge turns green and shows how many accounts are connected.',
    view: 'constructor',
  },
  {
    id: 'deal-base',
    target: 'deal-base',
    title: 'Deal Base',
    description:
      'Your trades journal. Switch here to review every fill — pair, side, prices, size, P&L, commissions, notes, and AI Insights.',
    view: 'constructor',
  },
  {
    id: 'ai-assistant',
    target: 'ai-assistant',
    title: 'AI Assistant',
    description:
      'Open the chat to ask about your stats, a specific trade, or what the numbers mean — it reads from your Deal Base.',
    view: 'constructor',
  },
  {
    id: 'profile',
    target: 'profile',
    title: 'Profile',
    description:
      'Account details, connected brokers, and sign out. This is also where you manage your Cryptelix session.',
    view: 'constructor',
  },
  {
    id: 'deal-base-table',
    target: 'deal-base-table',
    title: 'Deal Base',
    description:
      'One row per trade: date, pair with exchange and market (Spot / USDT-M / COIN-M), Long or Short, entry and exit, quantity, P&L, commission, notes, and AI Insights with Read more.',
    view: 'database',
  },
  {
    id: 'table-editor',
    target: 'table-editor',
    title: 'Table Editor',
    description:
      'Add a trade row by hand, or add a custom column when you need extra fields beyond the default journal.',
    view: 'database',
  },
  {
    id: 'import-export',
    target: 'import-export',
    title: 'Import/Export',
    description:
      'Bring trades in from a file, or export your Deal Base to keep a backup or work in a spreadsheet.',
    view: 'database',
  },
];
