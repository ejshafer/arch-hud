#!/usr/bin/env bash
# Current Openbox desktop, 0-based.
xprop -root _NET_CURRENT_DESKTOP 2>/dev/null | awk '{print $3}'
