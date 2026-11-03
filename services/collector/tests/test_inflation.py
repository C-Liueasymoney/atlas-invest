from datetime import date
from decimal import Decimal
import pytest
from atlas_collector.inflation import normalize_china_cpi
from atlas_collector.adapters import fetch
from atlas_collector.errors import CollectorError

def test_china_nationwide_percent_missing_zero_and_negative():
    rows = normalize_china_cpi({'success': True, 'result': {'pages': 1, 'data': [
        {'REPORT_DATE': '2024-01-01 00:00:00', 'NATIONAL_SAME': '-0.8', 'NATIONAL_BASE': 99.2},
        {'REPORT_DATE': '2024-02-01', 'NATIONAL_SAME': 0},
        {'REPORT_DATE': '2024-03-01', 'NATIONAL_SAME': None},
    ]}}, date(2024,1,1), date(2024,3,31))
    assert [r.value for r in rows] == [Decimal('-0.8'), Decimal(0), None]
    assert all(r.published_at is None for r in rows)

def test_china_rejects_conflicting_or_incomplete_response():
    with pytest.raises(CollectorError):
        normalize_china_cpi({'success': True, 'result': {'pages': 2, 'data': []}}, date(2024,1,1), date(2024,3,1))
    with pytest.raises(CollectorError):
        normalize_china_cpi({'success': True, 'result': {'data': [{'REPORT_DATE': '2024-01-01', 'NATIONAL_SAME': ''}]}}, date(2024,1,1), date(2024,3,1))

def test_fred_cpi_requests_official_yoy_units_not_raw_index(monkeypatch):
    monkeypatch.setattr('atlas_collector.adapters.credential', lambda *args: 'test')
    class Client:
        def get(self, url, params):
            assert params['series_id'] == 'CPIAUCNS'
            assert params['units'] == 'pc1'
            return {'count': 1, 'observations': [{'date': '2024-01-01', 'value': '3.1'}]}
    rows = fetch({'providerId': 'fred', 'providerSymbol': 'CPIAUCNS:pc1'}, date(2024,1,1), date(2024,2,1), Client())
    assert rows[0].value == Decimal('3.1')


def test_china_monthly_changes_are_not_yearly_changes():
    rows = normalize_china_cpi({'success': True, 'result': {'data': [
        {'REPORT_DATE': '2024-01-01', 'NATIONAL_SAME': '3.0', 'NATIONAL_SEQUENTIAL': '-0.2'},
    ]}}, date(2024,1,1), date(2024,2,1), 'NATIONAL_SEQUENTIAL')
    assert rows[0].value == Decimal('-0.2')
    assert 'nationwide_cpi_mom_rounded' in rows[0].quality_flags
