from datetime import date
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile
import pytest
from atlas_collector.cftc import normalize_cftc_zip
from atlas_collector.errors import CollectorError

def archive(text,name='annual.txt'):
    out=BytesIO()
    with ZipFile(out,'w') as z:z.writestr(name,text)
    return out.getvalue()

HEADER='Market and Exchange Names,As of Date in Form YYMMDD,As of Date in Form YYYY-MM-DD,CFTC Contract Market Code,CFTC Market Code in Initials,CFTC Region Code,CFTC Commodity Code,Open Interest (All),Noncommercial Positions-Long (All),Noncommercial Positions-Short (All)\n'

def test_cftc_legacy_futures_only_uses_contract_code_and_report_date():
    text=HEADER+'GOLD - COMMODITY EXCHANGE INC.,261013,2026-10-13,088691,CMX,0,088,1000,350,125\nSILVER - COMMODITY EXCHANGE INC.,261013,2026-10-13,084691,CMX,0,084,1000,999,1\n'
    result=normalize_cftc_zip(archive(text),date(2026,10,1),date(2026,10,16))
    assert len(result)==1
    assert result[0].period_date==date(2026,10,13)
    assert result[0].value==Decimal(225)
    assert result[0].published_at is None
    assert 'legacy_futures_only' in result[0].quality_flags


def test_cftc_refuses_bad_dates_negative_positions_or_conflicting_contract():
    for row in ['GOLD - COMMODITY EXCHANGE INC.,261013,2026-02-30,088691,CMX,0,088,1000,350,125', 'GOLD - COMMODITY EXCHANGE INC.,261013,2026-10-13,088691,CMX,0,088,1000,-1,125','SILVER - COMMODITY EXCHANGE INC.,261013,2026-10-13,088691,CMX,0,088,1000,350,125']:
        with pytest.raises(CollectorError):normalize_cftc_zip(archive(HEADER+row),date(2026,1,1),date(2026,12,31))


def test_cftc_rejects_zip_paths_instead_of_extracting():
    with pytest.raises(CollectorError):normalize_cftc_zip(archive(HEADER,'../annual.txt'),date(2026,1,1),date(2026,12,31))
