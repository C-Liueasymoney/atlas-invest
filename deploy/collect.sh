#!/bin/sh
set -u
cd /opt/atlas-invest
exec 9>/var/lib/atlas-invest/collect.lock
flock -n 9 || exit 0
failed=0
for series in SGE_AU9999_D1 XAUUSD_QUOTE FX_USDCNY_D1 CFTC_GOLD_NET_SPEC_W CN_CPI_YOY_M; do
  timeout 240 services/collector/.venv/bin/python -m atlas_collector sync --series "$series" || failed=1
done
# Each run reads the live database vault. Missing optional keys never reach upstream.
for series in FRED_DFII10 FRED_DGS10 FRED_DFF FRED_CPIAUCSL US_CPI_YOY_M FRED_CPILFESL FRED_DTWEXBGS FRED_NASDAQ100 FRED_SP500; do
  timeout 120 services/collector/.venv/bin/python -m atlas_collector sync --series "$series" --skip-unconfigured || failed=1
  # Respect the default shared FRED budget of five requests per minute.
  sleep 13
done
exit "$failed"
