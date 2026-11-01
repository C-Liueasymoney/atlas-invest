#!/bin/sh
set -eu
# AliDNS uses 100.64/10 addresses which Tailscale otherwise drops on eth0.
# Only established DNS replies from the two ECS resolvers are exempted.
for resolver in 100.100.2.136 100.100.2.138; do
  for protocol in udp tcp; do
    iptables -C INPUT -i eth0 -s "$resolver" -p "$protocol" --sport 53 \
      -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
    iptables -I INPUT 1 -i eth0 -s "$resolver" -p "$protocol" --sport 53 \
      -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  done
done
