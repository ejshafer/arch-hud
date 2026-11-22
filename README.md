# arch-hud

A portable Arch Linux desktop styled after eDEX-UI / the ENCOM Boardroom:
one full-screen HUD layer (system, CPU, memory, processes, network, globe, file browser,
live keyboard) with a see-through kitty terminal docked in the middle.

```
┌ PANEL ── SYSTEM ┬ TERMINAL ──── 01 02 03 04 ──── MAIN SHELL ┬ PANEL ── NETWORK ┐
│ 20:27:46        │ ▛MAIN SHELL◣ EMPTY ╲ EMPTY ╲ EMPTY ╲      │ NETWORK STATUS   │
│ UPTIME TYPE PWR │                                           │ WORLD VIEW       │
│ CPU USAGE ╱╲╱╲  │   kitty (transparent, Fira Mono, tabs)    │    (globe)       │
│ MEMORY ░░▓▓▓    │                                           │ NETWORK TRAFFIC  │
│ TOP PROCESSES   │                                           │ ╱╲__╱╲           │
├ FILESYSTEM ─────┴───────────┬ KEYBOARD ─────────────────────┴──────────────────┤
│ 📁 📁 📁 📄 📄 (follows the │ ESC ` 1 2 3 4 5 6 7 8 9 0 - = BACK  (keys light   │
│ shell; click to cd / open)  │ TAB Q W E R T Y U I O P [ ] \       up as you type)│
└─────────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 0. How "portable" works here

A Git repo can't hold a whole running OS (kernel, packages, binaries are GBs and
change constantly). What it *can* hold is the **recipe**: package lists, every config
file, and scripts. So there are two layers, and you want both:

| Layer | What moves between computers | What it's for |
|---|---|---|
| **The drive** | Arch installed on a USB SSD that boots on any x86_64 UEFI PC | Same OS, same files, same everything — plug in, pick it in the boot menu |
| **This repo** | Package lists + dotfiles + install scripts on GitHub | Rebuild the identical desktop on any machine's internal disk in ~20 min, back up the drive's setup, sync tweaks between machines |

`hud-sync` (or **right-click desktop → SYNC TO GITHUB**) pushes your current setup;
`bootstrap.sh` rebuilds it anywhere.

> **Apple Silicon Macs can't boot this.** It's an x86_64 install. Intel Macs can
> (hold **Option** at power-on), though Wi-Fi on some needs `broadcom-wl`.

---

## 1. What you need

- **USB stick, 2 GB+** — for the Arch installer ISO.
- **USB SSD, 128 GB+** — the system drive. Use a real SSD (Samsung T7, Crucial X9, a
  NVMe-in-enclosure). A cheap flash stick will be painfully slow and wear out.
- A computer to install from, set to **UEFI boot** with **Secure Boot off**.

---

## 2. Put this repo on GitHub (from your Mac, now)

```bash
cd arch-hud
git init -b main
git add -A
git commit -m "arch-hud: initial"
```

Then create the GitHub repo and push. With the GitHub CLI (`brew install gh`):

```bash
gh auth login
gh repo create arch-hud --public --source=. --push
```

Public is easiest (you can clone it on a fresh install with no login). It contains no
secrets — keep it that way: **never commit SSH keys, tokens, or `.env` files.** If you
want it private, use `--private` and run `gh auth login` on the Arch side before cloning.

---

## 3. Make the Arch installer stick (on the Mac)

1. Download the ISO from <https://archlinux.org/download/> (pick a mirror near you).
2. Find the stick's disk number — **be sure, this erases it**:
   ```bash
   diskutil list
   ```
3. Write it (replace `N`):
   ```bash
   diskutil unmountDisk /dev/diskN
   ```
   ```bash
   sudo dd if=archlinux-x86_64.iso of=/dev/rdiskN bs=4m status=progress
   ```
   (Or use balenaEtcher if you prefer a GUI.)

---

## 4. Boot the installer

1. Plug **both** the installer stick and the USB SSD into the target PC.
2. Open the one-time boot menu (Dell/Lenovo **F12**, HP **F9**, ASUS **F8/Esc**,
   Acer **F12**, Intel Mac hold **Option**) and pick the stick's **UEFI** entry.
3. You land at a root shell. Get online:
   - Ethernet: already works.
   - Wi-Fi:
     ```bash
     iwctl
     ```
     then inside it: `device list`, `station wlan0 scan`, `station wlan0 get-networks`,
     `station wlan0 connect "Your SSID"`, `exit`.
4. Check: `ping -c 3 archlinux.org`

---

## 5. Install Arch onto the USB SSD (archinstall)

First identify the SSD. `TRAN` = `usb` and the size/model tell you which is which:

```bash
lsblk -o NAME,SIZE,MODEL,TRAN
```

> ⚠️ **The single most important step:** pick the **USB SSD**, not the computer's
> internal drive, or you'll wipe the host's OS.

```bash
archinstall
```

Choose:

| Menu | Pick |
|---|---|
| Mirrors | Your region |
| Disk configuration | Use a best-effort default partition layout → **the USB SSD** → `ext4` (or `btrfs` if you want snapshots) |
| Disk encryption | **Yes, LUKS** — a drive you carry around can get lost |
| Bootloader | **systemd-boot** |
| Hostname | whatever you like |
| Root password | set one |
| User account | create your user, **make it a superuser (sudo)** |
| Profile | **Minimal** (bootstrap.sh installs the desktop) |
| Audio | **pipewire** |
| Kernels | `linux` (add `linux-lts` as a backup kernel if you like) |
| Network configuration | **NetworkManager** |
| Additional packages | `git` |
| Timezone | yours |

Install. When it asks to chroot into the new system, say **no**. Then:

```bash
reboot
```

Pull the installer stick out as it restarts so it boots the SSD.

---

## 6. First boot: make it portable + build the desktop

Log in on the text console as your user. Connect Wi-Fi if needed (`nmtui` is a
friendly menu). Then:

```bash
git clone https://github.com/YOUR-USERNAME/arch-hud.git ~/arch-hud
```

**a) Portability fixes** (generic initramfs, both CPU microcodes, open GPU drivers,
fallback bootloader path, fewer disk writes):

```bash
sudo ~/arch-hud/install/make-portable.sh
```

**b) Desktop** (installs yay, all packages, fonts, links every config into `~`):

```bash
~/arch-hud/bootstrap.sh
```

`eww` compiles from source via the AUR, so give it 5–10 minutes. Answer pacman's
prompts if it asks about a conflict.

**c) Start it:**

```bash
startx
```

From now on, logging in on tty1 starts the HUD automatically (see `~/.bash_profile`).
Log in on tty2 (**Ctrl+Alt+F2**) for a plain console.

---

## 7. Using it

| Keys | Action |
|---|---|
| **Super+Enter** | Terminal |
| **Super+D** | App launcher (rofi) |
| **Super+Tab** | Window switcher |
| **Super+B** | btop system monitor |
| **Super+H** | Show/hide the HUD |
| **Super+G** | Pause/resume the globe |
| **Super+K** | Turn the keyboard's key display off/on (do this before typing a password where people can see) |
| **Super+E** | Launch the real eDEX-UI (if installed) |
| **Super+Q** | Close window |
| **Super+F / M** | Fullscreen / maximise |
| **Super+←/→** | Snap left/right half |
| **Super+1–4** | Switch desktop (**Super+Shift+1–4** sends window) |
| **Super+Drag** | Move window (right-drag resizes) |
| **Right-click the HUD** | Menu (sync, reload, power) |
| **Ctrl+Shift+T** | New terminal tab (fills the next EMPTY slot) |
| **Click a folder** in FILESYSTEM | `cd` there in the shell (only when the shell is idle at a prompt) |
| **Click a file** | Open it with its default app |
| **Super+Shift+R / E** | Reload Openbox / log out |

---

## 8. Moving between computers

**Carrying the drive:** shut down, unplug, plug into the next PC, open its boot menu
(table in step 4), pick the SSD. On each new PC you may need to turn off Secure Boot
once. Networking, GPU and audio are detected fresh every boot.

**Rebuilding on a new machine's internal disk:** do steps 4–6 there (skip
`make-portable.sh` if it's staying put). You get the same desktop and packages.

**Keeping machines in sync:** after you change anything, run `hud-sync`. It snapshots
your installed package lists into `packages/`, commits, pulls other machines' changes,
pushes, and re-links dotfiles. Because every config in `~` is a symlink into
`~/arch-hud`, editing `~/.config/kitty/kitty.conf` *is* editing the repo.

---

## 9. Want the actual eDEX-UI?

Openbox alone can't produce that look — eDEX-UI is one fullscreen Electron app that
draws its own terminal, monitors, keyboard and globe. This repo rebuilds the look
natively (faster, maintained, real windows). If you also want the original:

```bash
yay -S edex-ui-bin
```

Then **Super+E** opens it, or boot straight into it as your whole session:

```bash
HUD_SESSION=edex startx
```

Caveat: upstream archived eDEX-UI in **October 2021**, and it bundles an old,
unpatched Electron. Fine as eye candy; don't run it as your everyday shell.

---

## 10. The HUD and customising it

**How it works.** `hud-shell` (Python) opens one WebKit page,
`~/.local/share/hud-shell/index.html`, on a desktop-type window under every other window,
and reserves the side columns and bottom row as screen edges. So when Openbox maximises
the terminal it lands exactly inside the TERMINAL frame. Once a second it feeds the page
real numbers from `/proc` and `/sys`. It asks kitty (over a local socket) which folder
your shell is in, so FILESYSTEM follows your `cd`s. It reads key presses from X only to
light up the drawn keyboard: nothing is logged or saved. **Super+K** switches that off.

**Fonts.** eDEX-UI uses *United Sans* (a paid font) for its UI and *Fira Mono* for the
terminal. This repo uses **Saira Semi Condensed** (free, very close) for the UI and Fira
Mono for the terminal. If you own United Sans, put its font files in
`~/.local/share/fonts/` and run `fc-cache -f`: the HUD picks it up automatically.

**Lite mode.** On a very slow machine, or if WebKit gives you a blank screen, use the
older eww side panels instead:

```bash
mkdir -p ~/.config/hud && echo 'HUD_MODE=lite' >> ~/.config/hud/local.env
```

Log out and back in. (`local.env` is per-machine and never synced.)

**Changing things**
- **Colours** (from eDEX's "tron" theme) are repeated in each config. Search and replace
  across `dotfiles/`: `#aacfd1` cyan, `#05080d` ink, `#262828` line, `#4f6566` dim.
- **HUD layout and look:** `dotfiles/hud/.local/share/hud-shell/` (`hud.css`, `hud.js`).
  Reload it with **Super+H** twice. Open `index.html` in any browser to preview it with
  demo data.
- **Column sizes:** `layout_for()` in `dotfiles/hud/.local/bin/hud-shell` (also mirrored
  in `defaultLayout()` in `hud.js` for the browser preview).
- **Terminal tabs:** `dotfiles/kitty/.config/kitty/tab_bar.py`.
- **Globe cities / home marker:** `CITIES` and `TZ` in `hud.js`. The home marker comes
  from your timezone, so no IP lookup is sent anywhere. The PING value pings `1.1.1.1`;
  set `HUD_PING_HOST=…` in `~/.config/hud/local.env` to change it.
- **Keybinds:** `dotfiles/openbox/.config/openbox/rc.xml`, then **Super+Shift+R**.
- **Add a package:** put its name in `packages/base.txt` (repo or AUR, either works)
  and re-run `bootstrap.sh`.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| HUD blank or black, terminal fine | Run `HUD_DEBUG=1 hud-shell --quick` in a terminal (after **Super+H** to stop the running one) and read the errors. A WebKit GPU problem is fixed by adding the line `WEBKIT_DISABLE_DMABUF_RENDERER=1` to `~/.config/hud/local.env` and logging out and back in. Or switch to lite mode (section 10). |
| Keyboard doesn't light up | `sudo pacman -S python-xlib`, then **Super+H** twice. |
| FILESYSTEM doesn't follow `cd` | kitty needs the remote-control lines from this repo's `kitty.conf`: close all kitty windows and open a new one. |
| Terminal covers the HUD columns | The HUD sets screen-edge reservations with `xprop` (package `xorg-xprop`). Check it's installed, then **Super+H** twice. |
| Black screen / no transparency | picom's GPU backend failed. Autostart already retries with `--backend xrender`; check `picom --backend xrender` by hand. |
| kitty won't open (old GPU or VM) | kitty needs OpenGL 3.3. Use `xterm` (installed, themed) or switch the Super+Enter bind. |
| `eww: command not found` after bootstrap | The eww compile failed (usually out of memory on 4 GB laptops) and bootstrap only warned. Add swap and build with fewer jobs: `sudo mkswap -U clear --size 4G --file /swapfile`, `sudo swapon /swapfile`, `CARGO_BUILD_JOBS=2 yay -S eww`. Still failing: `yay -S eww-git`. |
| archinstall hangs on "Time synchronization" or "keyring sync" | Network blocks NTP. Ctrl+C, then `archinstall --skip-ntp --skip-wkd`. If pacstrap then says the keyring is missing, on tty2 (Alt+F2) run `pacman-key --init` and `pacman-key --populate archlinux`, and retry. |
| Lite panels missing | `eww logs` shows the error; `eww open-many left right dockbar`. |
| Lite globe missing | Run `hud-globe-view 100 100 320 ~/.local/share/hud-globe/index.html` in a terminal to see the error (needs `webkit2gtk-4.1`, `python-gobject`). |
| NVIDIA card, glitches | Stays on the open `nouveau` driver for portability. On a machine that keeps the drive, install `nvidia-open` — but that ties it to NVIDIA hosts. |
| Wi-Fi not detected (Broadcom) | `sudo pacman -S broadcom-wl` |
| Drive won't show in a PC's boot menu | Secure Boot off, UEFI mode on, and check `/boot/EFI/BOOT/BOOTX64.EFI` exists (`make-portable.sh` creates it). |
| Want a graphical login screen | `sudo pacman -S ly`, `sudo systemctl enable ly@tty2.service`, `sudo systemctl disable getty@tty2.service` (see the ArchWiki "Ly" page). |

---

## Layout of this repo

```
bootstrap.sh              packages + fonts + dotfiles + services (re-runnable)
install/make-portable.sh  one-time fixes so the SSD boots on any PC
packages/*.txt            what to install (repo and AUR mixed; hud-sync adds snapshots)
dotfiles/<app>/...        mirrors $HOME, linked with GNU stow
  openbox/  themes/  picom/  kitty/  rofi/  dunst/  eww/  x11/
  hud/                    hud-shell (full HUD), lite helpers, globe, sync
```
