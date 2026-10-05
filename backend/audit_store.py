"""Read-only audit projection, server filtering, summaries and CSV snapshots."""
import csv
import io
import json
import sqlite3
from contextlib import closing

from backend.audit import audited, changed_values, request_export, safe_values
from backend.database import connect_database


FROM = '''FROM audit_log a
    LEFT JOIN app_user u ON u.user_id=a.user_id
    LEFT JOIN employee e ON e.employee_id=a.employee_id'''
COLUMNS = '''a.*,
    u.username AS actor_username, u.email AS actor_email,
    u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.role AS actor_role,
    e.employee_code, e.first_name AS employee_first_name, e.last_name AS employee_last_name'''


def _connect():
    connection = connect_database()
    connection.row_factory = sqlite3.Row
    connection.create_function('casefold', 1, lambda value: str(value or '').casefold(), deterministic=True)
    return connection


def _json(value):
    try:
        parsed = json.loads(value or '{}')
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _where(*, search=None, action=None, actor_id=None, entity_type=None, outcome=None,
           employee_id=None, from_date=None, to_date=None):
    clauses, parameters = [], []
    for column, value in (('action',action),('user_id',actor_id),('entity_type',entity_type),
                          ('outcome',outcome),('employee_id',employee_id)):
        if value is not None and value != '':
            clauses.append(f'a.{column}=?')
            parameters.append(value)
    if search and search.strip():
        escaped = search.strip().casefold().replace('\\','\\\\').replace('%','\\%').replace('_','\\_')
        clauses.append('''(casefold(e.first_name || ' ' || e.last_name) LIKE ? ESCAPE '\\'
            OR casefold(e.employee_code) LIKE ? ESCAPE '\\'
            OR casefold(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,''))) LIKE ? ESCAPE '\\'
            OR casefold(COALESCE(u.email,u.username,a.actor_name)) LIKE ? ESCAPE '\\'
            OR casefold(a.operation_id) LIKE ? ESCAPE '\\'
            OR CAST(a.audit_id AS TEXT)=?)''')
        parameters.extend([f'%{escaped}%']*5 + [search.strip()])
    if from_date:
        clauses.append('substr(a.created_at,1,10)>=?')
        parameters.append(str(from_date))
    if to_date:
        clauses.append('substr(a.created_at,1,10)<=?')
        parameters.append(str(to_date))
    return ('WHERE ' + ' AND '.join(clauses) if clauses else ''), parameters


def event_view(row):
    metadata = safe_values(_json(row['metadata']))
    legacy = bool(metadata.get('legacy')) or row['operation_id'] is None
    before, after = safe_values(_json(row['old_values'])), safe_values(_json(row['new_values']))
    if legacy and row['action'] == 'DATA_EXPORTED':
        metadata.update(after)
        metadata.setdefault('dataset', 'Employee directory' if row['entity_type']=='employee_directory' else 'Data export')
        before, after = {}, {}
    if legacy and row['entity_type'] == 'employee_compensation':
        new_package = after.get('package')
        if isinstance(new_package, dict):
            for side, package in (('before',before),('after',new_package)):
                if isinstance(package.get('currency'), dict):
                    metadata.setdefault(f'{side}_currency', package['currency'])
                metadata.setdefault(f'{side}_frequency',package.get('pay_frequency'))
            # Old legacy payloads can be partial. Project only what was recorded.
            def legacy_fields(package):
                fields = {key:package[key] for key in ('base_pay','variable_pay','pay_frequency','effective_from','effective_to') if key in package}
                if isinstance(package.get('currency'),dict):
                    fields['currency'] = package['currency'].get('code')
                for allowance in package.get('allowances',[]):
                    for key in ('amount','frequency'):
                        if key in allowance:
                            fields[f"allowances.{allowance['type_code']}.{key}"] = allowance[key]
                return fields
            before, after = legacy_fields(before), legacy_fields(new_package)
        else:
            before = {k:v for k,v in before.items() if k not in ('reason','change_reason','change_trigger','authorization_reference')}
            after = {k:v for k,v in after.items() if k not in ('reason','change_reason','change_trigger','authorization_reference')}
    old, new = changed_values(before, after) if row['outcome']=='SUCCESS' else ({},{})
    actor_name = ' '.join(filter(None, (row['actor_first_name'], row['actor_last_name']))).strip()
    actor_name = actor_name or row['actor_name'] or row['actor_username'] or 'Not recorded'
    return {
        'id':row['audit_id'], 'operation_id':row['operation_id'] or f"legacy-{row['audit_id']}",
        'timestamp':row['created_at'], 'action':row['action'],
        'entity_type':row['entity_type'], 'entity_id':row['entity_id'],
        'employee':{'id':row['employee_id'], 'code':row['employee_code'],
                    'name':f"{row['employee_first_name']} {row['employee_last_name']}"} if row['employee_code'] else None,
        'actor':{'id':row['user_id'], 'name':actor_name, 'email':row['actor_email'], 'role':row['actor_role']},
        'outcome':row['outcome'], 'reason':row['reason'] or (_json(row['new_values']).get('reason') if legacy else None),
        'metadata':metadata, 'changes':[{'field':key,'before':old[key],'after':new[key]} for key in old],
        'legacy':legacy,
    }


def list_events(*, page=1, page_size=20, **filters):
    where, parameters = _where(**filters)
    with closing(_connect()) as connection:
        # One read snapshot keeps counts and page coherent during concurrent writes.
        connection.execute('BEGIN')
        counts = connection.execute(f'''SELECT COUNT(*) AS events,
            COUNT(DISTINCT CASE WHEN a.action='CREATE_COMPENSATION' AND a.outcome='SUCCESS'
                THEN COALESCE(a.operation_id, 'legacy-' || a.audit_id) END) AS compensation_changes,
            COUNT(DISTINCT CASE WHEN a.action='EXPORT_COMPLETED' AND a.outcome='SUCCESS'
                THEN a.operation_id END) AS completed_exports,
            COUNT(DISTINCT CASE WHEN a.outcome='FAILED'
                THEN COALESCE(a.operation_id, 'legacy-' || a.audit_id) END) AS failed_operations
            {FROM} {where}''', parameters).fetchone()
        rows = connection.execute(f'''SELECT {COLUMNS} {FROM} {where}
            ORDER BY a.created_at DESC,a.audit_id DESC LIMIT ? OFFSET ?''',
            [*parameters,page_size,(page-1)*page_size]).fetchall()
    total = counts['events']
    return {'items':[event_view(row) for row in rows], 'total':total, 'page':page, 'page_size':page_size,
            'total_pages':(total+page_size-1)//page_size, 'summary':dict(counts)}


def audit_options():
    with closing(_connect()) as connection:
        actors = connection.execute('''SELECT user_id AS id, email,
            TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS full_name,
            username, role FROM app_user ORDER BY first_name, last_name, username''').fetchall()
        actions = connection.execute('SELECT DISTINCT action FROM audit_log ORDER BY action').fetchall()
        targets = connection.execute('SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type').fetchall()
    return {'actors':[{'id':row['id'], 'name':row['full_name'] or row['username'],
                       'email':row['email'], 'role':row['role']} for row in actors],
            'actions':[row[0] for row in actions], 'entity_types':[row[0] for row in targets]}


def csv_safe(value):
    text = '' if value is None else str(value)
    return "'"+text if text.lstrip().startswith(('=','+','-','@')) else text


def readable_value(value, field, metadata, side):
    if value is None:
        return 'Not recorded'
    if isinstance(value,dict):
        return ', '.join(f'{key}: {item}' for key,item in value.items())
    currency = metadata.get(f'{side}_currency')
    if (field in ('base_pay','variable_pay') or field.endswith('.amount')) and isinstance(value,(int,float)) and isinstance(currency,dict):
        decimals = currency.get('decimal_places',2)
        frequency = metadata.get(f'{side}_frequency')
        if field.startswith('allowances.'):
            frequency = metadata.get(f'{side}_allowance_frequencies', {}).get(field.split('.')[1])
        suffix = {'ANNUAL':'year', 'MONTHLY':'month', 'HOURLY':'hour'}.get(frequency, frequency)
        return f"{currency['code']} {value/(10**decimals):,.{decimals}f}" + (f' / {suffix}' if suffix else '')
    return str(value)


@audited('EXPORT_FAILED','export')
def export_audit(**filters):
    where, parameters = _where(**filters)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(('event_id','timestamp_utc','action','entity_type','entity_id','employee_code',
                     'employee_name','actor','outcome','reason','operation_id','changes'))
    with closing(_connect()) as connection:
        connection.execute('BEGIN IMMEDIATE')
        try:
            rows = connection.execute(f'SELECT {COLUMNS} {FROM} {where} ORDER BY a.created_at DESC,a.audit_id DESC', parameters).fetchall()
            employee_ids = set()
            for row in rows:
                event = event_view(row)
                if event['employee']:
                    employee_ids.add(event['employee']['id'])
                changes = '; '.join(f"{c['field']}: {readable_value(c['before'],c['field'],event['metadata'],'before')} → {readable_value(c['after'],c['field'],event['metadata'],'after')}" for c in event['changes'])
                writer.writerow([csv_safe(value) for value in (
                    event['id'],event['timestamp'],event['action'],event['entity_type'],event['entity_id'],
                    event['employee']['code'] if event['employee'] else '', event['employee']['name'] if event['employee'] else '',
                    event['actor']['name'],event['outcome'],event['reason'],event['operation_id'],changes)])
            request_export(connection,dataset='Audit report',employee_ids=list(employee_ids),
                           metadata={'row_count':len(rows),'filters':{k:str(v) if v is not None else None for k,v in filters.items()}})
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    return output.getvalue()
