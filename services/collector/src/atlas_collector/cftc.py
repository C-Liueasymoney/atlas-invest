"""Official annual Legacy futures-only COT, contract 088691 (COMEX Gold)."""
import csv
from datetime import datetime
from io import BytesIO, TextIOWrapper
from pathlib import PurePosixPath
from zipfile import ZipFile, BadZipFile
from .adapters import number, day
from .errors import CollectorError
from .models import Observation


def normalize_cftc_zip(payload, start, end):
    records = {}
    try:
        with ZipFile(BytesIO(payload)) as archive:
            entries = archive.infolist()
            if not entries or len(entries) > 10 or sum(info.file_size for info in entries) > 128*1024*1024:
                raise CollectorError('invalid_response', 'CFTC archive exceeds safe size limits.')
            for info in entries:
                if info.filename.startswith('/') or '\\' in info.filename or '..' in PurePosixPath(info.filename).parts or info.flag_bits & 1:
                    raise CollectorError('invalid_response', 'CFTC archive contains unsafe paths or encryption.')
                if not info.filename.lower().endswith(('.txt','.csv')):
                    continue
                with archive.open(info) as source:
                    reader = csv.reader(TextIOWrapper(source, encoding='utf-8-sig'))
                    header = next(reader, [])
                    if len(header) < 10 or 'market' not in header[0].lower() or 'date' not in header[2].lower() or 'long' not in header[8].lower() or 'short' not in header[9].lower():
                        raise CollectorError('invalid_response', 'CFTC Legacy report header changed; refusing another report scope.')
                    for row in reader:
                        if not row:
                            continue
                        if len(row) < 10:
                            raise CollectorError('invalid_response', 'CFTC Legacy record is incomplete.')
                        if row[3].strip().zfill(6) != '088691':
                            continue
                        if 'GOLD' not in row[0].upper() or 'COMMODITY EXCHANGE' not in row[0].upper():
                            raise CollectorError('instrument_mismatch', 'CFTC contract code does not identify COMEX Gold.')
                        try:
                            report_date = day(row[2].strip())
                        except CollectorError:
                            try:
                                report_date = datetime.strptime(row[2].strip(), '%m/%d/%Y').date()
                            except ValueError:
                                raise CollectorError('invalid_date', 'CFTC report date is invalid.') from None
                        if row[1].strip() != report_date.strftime('%y%m%d'):
                            raise CollectorError('invalid_date', 'CFTC report date fields disagree.')
                        if not start <= report_date <= end:
                            continue
                        long, short = number(row[8].strip()), number(row[9].strip())
                        if any(value < 0 or value != value.to_integral_value() for value in (long,short)):
                            raise CollectorError('invalid_value', 'CFTC position counts must be nonnegative integers.')
                        record = Observation(report_date,long-short,quality_flags=['legacy_futures_only','noncommercial_long_minus_short','contract_088691','release_date_unknown'])
                        if report_date in records and records[report_date] != record:
                            raise CollectorError('conflicting_duplicates', 'Conflicting CFTC report dates.')
                        records[report_date] = record
    except (BadZipFile, UnicodeError, OSError, csv.Error):
        raise CollectorError('invalid_response', 'CFTC did not return a valid annual Legacy ZIP archive.') from None
    return [records[key] for key in sorted(records)]


def fetch_cftc(client, start, end):
    records = {}
    if end.year-start.year > 20:
        raise CollectorError('invalid_range', 'CFTC backfill is limited to 21 annual archives per job.')
    for year in range(start.year,end.year+1):
        payload = client.get_bytes(f'https://www.cftc.gov/files/dea/history/deacot{year}.zip')
        for record in normalize_cftc_zip(payload,start,end):
            if record.period_date in records and records[record.period_date] != record:
                raise CollectorError('conflicting_duplicates', 'Annual CFTC files contain conflicting records.')
            records[record.period_date] = record
    return [records[key] for key in sorted(records)]
