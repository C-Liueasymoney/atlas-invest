#!/bin/sh
set -eu
# Tailscale may move its INPUT hook ahead of an earlier one-shot DNS exception.
# Keep established replies from ECS services and Workbench SSH ahead of that hook.
chain=atlas-aliyun
iptables -w 5 -N "$chain" 2>/dev/null || iptables -w 5 -S "$chain" >/dev/null
for underlay in 100.100.0.0/16 100.118.0.0/16; do
  iptables -w 5 -C "$chain" -i eth0 -s "$underlay" \
    -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -w 5 -A "$chain" -i eth0 -s "$underlay" \
    -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
done
iptables -w 5 -C "$chain" -i eth0 -s 100.104.0.0/16 -p tcp --dport 22 \
  -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT 2>/dev/null || \
iptables -w 5 -A "$chain" -i eth0 -s 100.104.0.0/16 -p tcp --dport 22 \
  -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT
first_rule=$(iptables -w 5 -S INPUT | sed -n '/^-A INPUT /{p;q;}')
if [ "$first_rule" != "-A INPUT -j $chain" ]; then
  while iptables -w 5 -C INPUT -j "$chain" 2>/dev/null; do
    iptables -w 5 -D INPUT -j "$chain"
  done
  iptables -w 5 -I INPUT 1 -j "$chain"
fi
