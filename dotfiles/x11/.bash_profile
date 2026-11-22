# ~/.bash_profile
[[ -f ~/.bashrc ]] && . ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"

# No display manager: logging in on tty1 starts the HUD automatically.
# Log in on tty2 (Ctrl+Alt+F2) to get a plain console instead.
if [[ -z $DISPLAY && $XDG_VTNR -eq 1 && -z $HUD_NO_X ]]; then
  exec startx
fi
