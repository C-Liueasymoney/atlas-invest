"""Isolated AKShare transport. Never forwards raw tracebacks or response bodies."""
import contextlib
import io
import json
import sys
import time

def main():
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            import akshare as ak
            result = None
            for attempt in range(3):
                try:
                    result = (ak.spot_quotations_sge if sys.argv[1] == 'quote' else ak.spot_hist_sge)(symbol='Au99.99')
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(2 ** attempt)
        # pandas emits JSON null for NaN; preserve dates as ISO strings.
        if 'date' in result.columns:
            result['date'] = result['date'].astype(str)
        print(result.to_json(orient='records', date_format='iso', double_precision=15))
        return 0
    except Exception:
        return 1

if __name__ == '__main__':
    sys.exit(main())
