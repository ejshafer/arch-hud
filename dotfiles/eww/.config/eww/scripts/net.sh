#!/usr/bin/env bash
# Network status + traffic rate for whichever interface holds the default route,
# so it works on any machine (eth0, enp3s0, wlan0, wlp2s0…). Polled every 2s.

state_file="${XDG_RUNTIME_DIR:-/tmp}/eww-net.state"

human() {
  awk -v b="$1" 'BEGIN { split("B/s KB/s MB/s GB/s", u, " "); i = 1;
    while (b >= 1024 && i < 4) { b /= 1024; i++ }
    printf (i == 1 ? "%d %s" : "%.1f %s"), b, u[i] }'
}

iface="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="dev") {print $(i+1); exit}}')"

if [[ -z "$iface" ]]; then
  jq -nc '{iface:"-", conn:"-", state:"OFFLINE", ip:"-", down:0, up:0, down_h:"0 B/s", up_h:"0 B/s"}'
  exit 0
fi

ip4="$(ip -4 -o addr show dev "$iface" | awk '{print $4; exit}')"
conn="$(nmcli -t -g GENERAL.CONNECTION device show "$iface" 2>/dev/null)"
[[ -d "/sys/class/net/$iface/wireless" ]] && kind="WIFI" || kind="WIRED"

rx="$(cat "/sys/class/net/$iface/statistics/rx_bytes")"
tx="$(cat "/sys/class/net/$iface/statistics/tx_bytes")"
now="$(date +%s%N)"

down=0; up=0
if [[ -f "$state_file" ]]; then
  read -r p_iface p_rx p_tx p_now < "$state_file"
  if [[ "$p_iface" == "$iface" ]]; then
    dt=$(( (now - p_now) / 1000000 ))   # ms
    if (( dt > 0 )); then
      down=$(( (rx - p_rx) * 1000 / dt ))
      up=$(( (tx - p_tx) * 1000 / dt ))
      (( down < 0 )) && down=0
      (( up < 0 )) && up=0
    fi
  fi
fi
echo "$iface $rx $tx $now" > "$state_file"

jq -nc \
  --arg iface "$iface" --arg conn "${conn:--}" --arg state "ONLINE · $kind" --arg ip "${ip4:--}" \
  --argjson down "$down" --argjson up "$up" \
  --arg down_h "$(human "$down")" --arg up_h "$(human "$up")" \
  '{iface:$iface, conn:$conn, state:$state, ip:$ip, down:$down, up:$up, down_h:$down_h, up_h:$up_h}'
