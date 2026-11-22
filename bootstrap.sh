#!/usr/bin/env bash
# arch-hud bootstrap — installs packages and links dotfiles into $HOME.
# Run as your normal user (it calls sudo when it needs to). Safe to re-run.
#
#   ./bootstrap.sh              packages + fonts + dotfiles + services
#   ./bootstrap.sh --dotfiles   only (re)link dotfiles (after a git pull)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"

say()  { printf '\e[38;2;170;207;209m[hud]\e[0m %s\n' "$*"; }
warn() { printf '\e[38;2;209;91;91m[hud]\e[0m %s\n' "$*" >&2; }

if [[ $EUID -eq 0 ]]; then
  warn "Run this as your user, not root (it uses sudo itself)."
  exit 1
fi

install_packages() {
  say "Updating system and installing build tools…"
  sudo pacman -Syu --needed --noconfirm base-devel git

  if ! command -v yay >/dev/null 2>&1; then
    say "Installing yay (AUR helper)…"
    local tmp; tmp="$(mktemp -d)"
    git clone --depth 1 https://aur.archlinux.org/yay-bin.git "$tmp/yay-bin"
    (cd "$tmp/yay-bin" && makepkg -si --noconfirm)
    rm -rf "$tmp"
  fi

  # Every packages/*.txt, comments stripped, de-duplicated.
  local wanted repo_all repo_pkgs aur_pkgs
  wanted="$(cat "$REPO"/packages/*.txt | sed 's/#.*//; s/[[:space:]]//g' | grep -v '^$' | LC_ALL=C sort -u)"
  repo_all="$(pacman -Slq | LC_ALL=C sort -u)"
  repo_pkgs="$(LC_ALL=C comm -12 <(echo "$wanted") <(echo "$repo_all"))"
  aur_pkgs="$(LC_ALL=C comm -23 <(echo "$wanted") <(echo "$repo_all"))"

  say "Installing $(echo "$repo_pkgs" | grep -c .) repo packages…"
  # No --noconfirm here on purpose: if a package conflicts (e.g. pulseaudio vs
  # pipewire-pulse) pacman asks you instead of silently failing.
  # shellcheck disable=SC2086
  sudo pacman -S --needed $repo_pkgs

  if [[ -n "$aur_pkgs" ]]; then
    say "Installing AUR packages: $(echo $aur_pkgs)"
    # shellcheck disable=SC2086
    yay -S --needed $aur_pkgs || warn "Some AUR packages failed: $(echo $aur_pkgs). Fix and re-run."
  fi
}

install_fonts() {
  local dir="$HOME/.local/share/fonts/hud"
  mkdir -p "$dir"
  if [[ ! -f "$dir/ShareTechMono-Regular.ttf" ]]; then
    say "Fetching Share Tech Mono (HUD widget font)…"
    curl -fsSL -o "$dir/ShareTechMono-Regular.ttf" \
      https://github.com/google/fonts/raw/main/ofl/sharetechmono/ShareTechMono-Regular.ttf \
      || warn "Font download failed; widgets fall back to Fira Mono."
  fi
  fc-cache -f >/dev/null 2>&1 || true
}

link_dotfiles() {
  say "Linking dotfiles…"
  cd "$REPO/dotfiles"
  local pkg rel target
  for pkg in */; do
    pkg="${pkg%/}"
    # Move aside any real file that would block stow (e.g. the skel .bash_profile).
    while IFS= read -r -d '' rel; do
      rel="${rel#./}"
      target="$HOME/$rel"
      if [[ -e "$target" || -L "$target" ]]; then
        if [[ -L "$target" && "$(readlink -f "$target")" == "$REPO/dotfiles/$pkg/$rel" ]]; then
          continue
        fi
        mkdir -p "$BACKUP/$(dirname "$rel")"
        mv "$target" "$BACKUP/$rel"
        say "  backed up ~/$rel → $BACKUP/"
      fi
    done < <(cd "$pkg" && find . -type f -print0)
    # --no-folding: link files, never whole folders, so apps writing to
    # ~/.config or ~/.local don't end up writing into this repo.
    stow --no-folding --restow -t "$HOME" "$pkg"
  done
  chmod +x "$HOME"/.local/bin/hud-* "$HOME"/.config/eww/scripts/*.sh "$HOME"/.config/openbox/autostart 2>/dev/null || true
  # Remember where the repo lives for hud-sync.
  mkdir -p "$HOME/.config/hud"
  echo "HUD_REPO=\"$REPO\"" > "$HOME/.config/hud/repo.env"
}

enable_services() {
  say "Enabling NetworkManager, Bluetooth and time sync…"
  sudo systemctl enable --now NetworkManager.service || true
  sudo systemctl enable bluetooth.service || true
  sudo timedatectl set-ntp true || true
}

case "${1:-all}" in
  --dotfiles) link_dotfiles ;;
  all)
    install_packages
    install_fonts
    link_dotfiles
    enable_services
    say "Done. Log out and back in on tty1 (or run: startx) to start the HUD."
    ;;
  *) warn "Unknown option: $1"; exit 1 ;;
esac
