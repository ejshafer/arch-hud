#!/usr/bin/env bash
# One JSON object for the SYSTEM / FILESYSTEM sections. Polled every 20s.

host="$(cat /proc/sys/kernel/hostname)"
kernel="$(uname -r | cut -d- -f1)"

uptime="$(awk '{s=int($1); d=int(s/86400); h=int(s%86400/3600); m=int(s%3600/60);
  if (d>0) printf "%dd %02dh %02dm", d, h, m; else printf "%02dh %02dm", h, m}' /proc/uptime)"

model="$(cat /sys/class/dmi/id/product_name 2>/dev/null)"
[[ -z "$model" || "$model" == "To be filled by O.E.M." ]] && model="$(cat /sys/class/dmi/id/board_name 2>/dev/null)"
[[ -z "$model" ]] && model="UNKNOWN"

cpu="$(awk -F: '/model name/ {print $2; exit}' /proc/cpuinfo \
  | sed -E 's/\((R|TM)\)//g; s/ CPU//; s/ @.*//; s/[0-9]+-Core Processor//; s/^ +| +$//g')"
cpu="${cpu:0:22}"

bat="$(ls -d /sys/class/power_supply/BAT* 2>/dev/null | head -n1)"
if [[ -n "$bat" ]]; then
  power="$(cat "$bat/capacity")% $(tr '[:lower:]' '[:upper:]' < "$bat/status")"
else
  power="AC"
fi

read -r disk_pct disk_free < <(df -P / | awk 'NR==2 {gsub("%","",$5); printf "%s %.0fG", $5, $4/1048576}')

jq -nc \
  --arg host "$host" --arg kernel "$kernel" --arg uptime "$uptime" \
  --arg model "${model^^}" --arg cpu "${cpu^^}" --arg power "$power" \
  --argjson disk_pct "${disk_pct:-0}" --arg disk_free "${disk_free:-?}" \
  '{host:$host, kernel:$kernel, uptime:$uptime, model:$model, cpu:$cpu,
    power:$power, disk_pct:$disk_pct, disk_free:$disk_free}'
