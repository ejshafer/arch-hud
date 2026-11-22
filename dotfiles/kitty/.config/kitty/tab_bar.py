# eDEX-style tab strip for kitty (tab_bar_style custom):
#   [ MAIN SHELL ◣ SHELL 2 ╲ EMPTY ╲ EMPTY ╲ EMPTY ╲ ]
# Five fixed-width slots like eDEX-UI; the active tab is filled cyan with a slanted edge,
# unused slots read EMPTY. If this file errors, kitty falls back to its default tab bar.
from kitty.fast_data_types import Screen, get_boss
from kitty.tab_bar import DrawData, ExtraData, TabBarData, as_rgb

CYAN = as_rgb(0xAACFD1)
INK = as_rgb(0x05080D)
DIM = as_rgb(0x4F6566)
SLOTS = 5


def _tab_count() -> int:
    try:
        tm = get_boss().active_tab_manager
        return len(tm.tabs) if tm else 1
    except Exception:
        return 1


def _slot(screen: Screen, label: str, width: int, kind: str) -> None:
    width = min(width, screen.columns - screen.cursor.x)
    if width < 3:
        return
    body = width - 1
    label = label[:body - 2] if len(label) > body - 2 else label
    left = (body - len(label)) // 2
    text = ' ' * left + label + ' ' * (body - len(label) - left)
    if kind == 'active':
        screen.cursor.fg, screen.cursor.bg, screen.cursor.bold = INK, CYAN, True
        screen.draw(text)
        screen.cursor.fg, screen.cursor.bg, screen.cursor.bold = CYAN, INK, False
        screen.draw('')  # solid lower-left triangle: slanted right edge
    else:
        screen.cursor.fg = CYAN if kind == 'tab' else DIM
        screen.cursor.bg, screen.cursor.bold = INK, False
        screen.draw(text)
        screen.cursor.fg = DIM
        screen.draw('')  # thin slanted divider


def draw_tab(draw_data: DrawData, screen: Screen, tab: TabBarData, before: int, max_tab_length: int,
             index: int, is_last: bool, extra_data: ExtraData) -> int:
    width = max(8, screen.columns // max(SLOTS, _tab_count()))
    label = 'MAIN SHELL' if index == 1 else (tab.title or f'SHELL {index}').upper()
    _slot(screen, label, width, 'active' if tab.is_active else 'tab')
    end = screen.cursor.x
    if is_last:
        for _ in range(index, SLOTS):
            if screen.cursor.x + 3 > screen.columns:
                break
            _slot(screen, 'EMPTY', width, 'empty')
    return end
