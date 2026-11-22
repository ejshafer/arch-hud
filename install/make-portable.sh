#!/usr/bin/env bash
# Make an Arch install on a USB SSD boot on (almost) any x86_64 UEFI machine.
# Run once, as root, on the installed system:  sudo ./install/make-portable.sh
# Based on the ArchWiki page "Install Arch Linux on a removable medium".

set -euo pipefail

say()  { printf '\e[38;2;170;207;209m[portable]\e[0m %s\n' "$*"; }
warn() { printf '\e[38;2;209;91;91m[portable]\e[0m %s\n' "$*" >&2; }

[[ $EUID -eq 0 ]] || { warn "Run with sudo."; exit 1; }

# 1. Firmware, microcode for BOTH CPU vendors, and open GPU drivers for all three
#    vendors. No proprietary NVIDIA driver: it ties the install to one card.
say "Installing firmware, both microcodes and generic GPU drivers…"
pacman -S --needed --noconfirm linux-firmware sof-firmware amd-ucode intel-ucode \
  mesa vulkan-intel vulkan-radeon vulkan-nouveau networkmanager

# 2. Generic initramfs. The 'autodetect' hook trims the initramfs down to the
#    drivers THIS machine uses; on another machine it may not find its disk or
#    keyboard. Removing it keeps every storage/input driver in the image.
for f in /etc/mkinitcpio.conf /etc/mkinitcpio.conf.d/*.conf; do
  [[ -f "$f" ]] || continue
  if grep -qE '^HOOKS=.*\bautodetect\b' "$f"; then
    cp -n "$f" "$f.pre-portable"
    sed -i -E '/^HOOKS=/ s/[[:space:]]*\bautodetect\b//' "$f"
    say "Removed autodetect from $f (backup: $f.pre-portable)"
  fi
done
say "Rebuilding initramfs…"
mkinitcpio -P

# 3. Bootloader at the fallback path. Other machines have no boot entry for this
#    drive in their firmware; they look for \EFI\BOOT\BOOTX64.EFI on removable media.
esp="$(bootctl --print-esp-path 2>/dev/null || echo /boot)"
if [[ -d "$esp/loader" ]]; then
  say "systemd-boot detected; copying it to $esp/EFI/BOOT/BOOTX64.EFI"
  install -D -m 0644 /usr/lib/systemd/boot/efi/systemd-bootx64.efi "$esp/EFI/BOOT/BOOTX64.EFI"
  systemctl enable systemd-boot-update.service || true
elif [[ -d /boot/grub ]]; then
  say "GRUB detected; installing to the removable path"
  grub-install --target=x86_64-efi --efi-directory="$esp" --removable --recheck
  grub-mkconfig -o /boot/grub/grub.cfg
else
  warn "Couldn't tell which bootloader you use. Make sure $esp/EFI/BOOT/BOOTX64.EFI exists."
fi

# 4. Be gentle on USB storage: no atime writes, capped journal.
if grep -qE '[[:space:]]/[[:space:]].*relatime' /etc/fstab; then
  cp -n /etc/fstab /etc/fstab.pre-portable
  sed -i -E '/[[:space:]]\/[[:space:]]/ s/relatime/noatime/' /etc/fstab
  say "Root filesystem now mounts with noatime"
fi
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\n' > /etc/systemd/journald.conf.d/10-portable.conf

# 5. One network manager that adapts to whatever NIC/Wi-Fi each machine has.
systemctl enable NetworkManager.service

say "Done. Remember on every host: boot in UEFI mode and turn Secure Boot off."
