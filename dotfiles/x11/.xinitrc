#!/bin/sh
# startx → Openbox with the HUD.
# Set HUD_SESSION=edex before startx to boot straight into eDEX-UI instead.

[ -f "$HOME/.Xresources" ] && xrdb -merge "$HOME/.Xresources"
export PATH="$HOME/.local/bin:$PATH"

if [ -d /etc/X11/xinit/xinitrc.d ]; then
  for f in /etc/X11/xinit/xinitrc.d/?*.sh; do [ -x "$f" ] && . "$f"; done
  unset f
fi

if [ "$HUD_SESSION" = "edex" ]; then
  openbox &
  exec hud-edex --wait
fi

exec openbox-session
