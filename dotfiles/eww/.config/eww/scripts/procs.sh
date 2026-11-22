#!/usr/bin/env bash
# Top processes by CPU, fixed-width so the columns line up in the panel.
printf '%-18s %5s %5s\n' "PROCESS" "CPU%" "MEM%"
ps -eo comm,%cpu,%mem --sort=-%cpu --no-headers \
  | head -n 7 \
  | awk '{printf "%-18.18s %5s %5s\n", $1, $2, $3}'
