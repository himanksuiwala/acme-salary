"""As-of compensation analytics from stored commitments; local development only."""
import csv
import io
import sqlite3
from collections import defaultdict
from contextlib import closing
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN

from backend.audit import audited, request_export
from backend.audit_store import csv_safe
from backend.database import connect_database
from backend.fx_reference import FX_REFERENCE_DATE, FX_REFERENCE_SOURCE


def _number(value):
    return int(Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))


def _annual(amount, frequency):
    if amount is None:
        return None
    if frequency == "ANNUAL":
        return amount
    if frequency == "MONTHLY":
        return amount * 12
    return None


def _stat(values):
    if not values:
        return {"sum": None, "average": None, "median": None}
    ordered = sorted(values)
    middle = len(ordered) // 2
    midpoint = (Decimal(ordered[middle]) if len(ordered) % 2 else
                (Decimal(ordered[middle - 1]) + Decimal(ordered[middle])) / 2)
    return {"sum": sum(values), "average": _number(Decimal(sum(values)) / len(values)),
            "median": _number(midpoint)}


def _rate(connection, source_id, target_id):
    return connection.execute("""SELECT rate,rate_date,source FROM fx_rate
        WHERE source_currency_id=? AND target_currency_id=? AND approved=1
          AND rate_date=? AND source=?
        LIMIT 1""", (source_id, target_id, FX_REFERENCE_DATE, FX_REFERENCE_SOURCE)).fetchone()


def _bins(values):
    if not values:
        return []
    low, high = min(values), max(values)
    if low == high:
        return [{"lower": low, "upper": high, "count": len(values)}]
    width = (high - low) // 8 + 1
    bins = [{"lower": low + i * width, "upper": min(high, low + (i + 1) * width - 1), "count": 0}
            for i in range((high - low) // width + 1)]
    for value in values:
        bins[(value - low) // width]["count"] += 1
    return bins


def snapshot(*, as_of: date, country=None, department=None, role=None, status=None,
             location_id=None, reporting_currency=None, metric="base",
             period_from=None, period_to=None, include_ids=False, include_all_changes=False):
    if reporting_currency and reporting_currency.upper() != "USD":
        raise ValueError("Analytics reporting currency is fixed to USD")
    selected = as_of.isoformat()
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    filters = {"country": country, "department": department, "role": role, "status": status,
               "location_id": location_id, "metric": metric,
               "period_from": (period_from or as_of.replace(day=1)).isoformat(),
               "period_to": (period_to or as_of).isoformat()}
    conditions = ["e.joining_date<=?", "(e.termination_date IS NULL OR e.termination_date>=?)"]
    params = [selected, selected, selected, selected]
    for column, value in (("c.country_code", country), ("d.department_code", department),
                          ("e.job_title", role), ("e.status", status), ("l.location_id", location_id)):
        if value is not None:
            conditions.append(f"{column}=?")
            params.append(value)
    with closing(connect_database()) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("BEGIN")
        rows = connection.execute(f"""SELECT e.employee_id,e.employee_code,e.first_name,e.last_name,
            e.job_title,e.status,d.department_code,d.department_name,l.location_id,l.location_name,
            c.country_code,c.country_name,p.id AS package_id,p.base_pay,p.variable_pay,p.pay_frequency,
            cu.currency_id,cu.currency_code,cu.currency_name,cu.symbol,cu.decimal_places
            FROM employee e JOIN department d ON d.department_id=e.department_id
            JOIN location l ON l.location_id=e.location_id
            JOIN country c ON c.country_id=l.country_id
            LEFT JOIN employee_compensation p ON p.id=(
              SELECT ec.id FROM employee_compensation ec WHERE ec.employee_id=e.employee_id
                AND ec.effective_from<=? AND (ec.effective_to IS NULL OR ec.effective_to>=?)
              ORDER BY ec.effective_from DESC,ec.id DESC LIMIT 1)
            LEFT JOIN currency cu ON cu.currency_id=p.currency_id
            WHERE {" AND ".join(conditions)} ORDER BY e.employee_id""", params).fetchall()
        target = connection.execute("""SELECT currency_id,currency_code,currency_name,symbol,decimal_places
            FROM currency WHERE currency_code='USD'""").fetchone()
        if target is None and rows:
            raise ValueError("USD reference currency is not configured")
        allowances = defaultdict(list)
        package_ids = [row["package_id"] for row in rows if row["package_id"]]
        for start in range(0, len(package_ids), 500):
            batch = package_ids[start:start + 500]
            placeholders = ",".join("?" for _ in batch)
            for allowance in connection.execute(
                f"SELECT compensation_id,amount,frequency FROM employee_allowance WHERE compensation_id IN ({placeholders})",
                batch):
                allowances[allowance["compensation_id"]].append(allowance)
        rate_cache = {}
        rates_used = {}
        missing_fx_currencies = set()
        values = {key: [] for key in ("base", "variable", "allowances", "target")}
        exclusions = {key: defaultdict(int) for key in values}
        decorated = []
        for row in rows:
            package_id = row["package_id"]
            annual_base = _annual(row["base_pay"], row["pay_frequency"]) if package_id else None
            annual_variable = _annual(row["variable_pay"], row["pay_frequency"]) if package_id else None
            allowance_parts = [_annual(item["amount"], item["frequency"]) for item in allowances[package_id]] if package_id else []
            annual_allowances = sum(allowance_parts) if all(part is not None for part in allowance_parts) else None
            source_id = row["currency_id"]
            fx = None
            if package_id and target and source_id != target["currency_id"]:
                if source_id not in rate_cache:
                    rate_cache[source_id] = _rate(connection, source_id, target["currency_id"])
                fx = rate_cache[source_id]
                if fx:
                    rates_used[row["currency_code"]] = {
                        "source_currency": row["currency_code"], "target_currency": target["currency_code"],
                        "rate": fx["rate"], "rate_date": fx["rate_date"], "source_name": fx["source"]}
                elif any(value is not None for value in (annual_base, annual_variable, annual_allowances)):
                    missing_fx_currencies.add(row["currency_code"])
            def converted(amount):
                if amount is None or target is None:
                    return None
                if source_id == target["currency_id"]:
                    return amount
                if fx is None:
                    return None
                major = Decimal(amount) / (10 ** row["decimal_places"])
                return _number(major * Decimal(fx["rate"]) * (10 ** target["decimal_places"]))
            source_values = {"base": annual_base, "variable": annual_variable,
                             "allowances": annual_allowances,
                             "target": (annual_base + annual_variable + annual_allowances
                                        if all(v is not None for v in (annual_base, annual_variable, annual_allowances))
                                        else None)}
            record_values = {}
            record_reasons = {}
            for key, amount in source_values.items():
                result = converted(amount)
                record_values[key] = result
                if result is not None:
                    values[key].append(result)
                    record_reasons[key] = None
                elif not package_id:
                    exclusions[key]["no_package"] += 1
                    record_reasons[key] = "no_package"
                elif amount is None:
                    reason = ("hourly" if row["pay_frequency"] == "HOURLY" or
                              (key in ("allowances", "target") and any(part is None for part in allowance_parts))
                              else "not_specified")
                    exclusions[key][reason] += 1
                    record_reasons[key] = reason
                elif target and source_id != target["currency_id"] and fx is None:
                    exclusions[key]["missing_fx"] += 1
                    record_reasons[key] = "missing_fx"
            decorated.append((row, record_values, record_reasons))
        metrics = {}
        for key, observed in values.items():
            stats = _stat(observed)
            metrics[key] = {**stats, "included": len(observed), "excluded": len(rows) - len(observed),
                            "exclusion_reasons": dict(exclusions[key]),
                            "partial": bool(exclusions[key]["missing_fx"] or exclusions[key]["hourly"] or
                                            exclusions[key]["no_package"] or exclusions[key]["not_specified"])}
        breakdowns = {}
        for kind, code_col, name_col in (
            ("country", "country_code", "country_name"),
            ("department", "department_code", "department_name"),
            ("role", "job_title", "job_title")):
            groups = defaultdict(list)
            for row, record_values, record_reasons in decorated:
                groups[(row[code_col] or "UNSPECIFIED", row[name_col] or "Not specified")].append(
                    (record_values[metric], record_reasons[metric]))
            breakdowns[kind] = []
            for (key, label), group_values in sorted(groups.items(), key=lambda item: item[0][1]):
                present = [value for value, _reason in group_values if value is not None]
                group_reasons = defaultdict(int)
                for _value, reason in group_values:
                    if reason:
                        group_reasons[reason] += 1
                breakdowns[kind].append({"key": key, "label": label, "employee_count": len(group_values),
                    "included": len(present), "excluded": len(group_values) - len(present),
                    "exclusion_reasons": dict(group_reasons),
                    **_stat(present), "partial": len(present) < len(group_values)})
        allowed_ids = {row["employee_id"] for row in rows}
        changes_rows = connection.execute("""SELECT p.employee_id,p.base_pay,p.pay_frequency,p.effective_from,
            cu.currency_code,cu.decimal_places,prev.base_pay AS previous_base,
            prev.pay_frequency AS previous_frequency,pc.currency_code AS previous_currency,
            pc.decimal_places AS previous_decimal_places
            FROM employee_compensation p JOIN currency cu ON cu.currency_id=p.currency_id
            LEFT JOIN employee_compensation prev ON prev.id=(
              SELECT x.id FROM employee_compensation x WHERE x.employee_id=p.employee_id
                AND x.effective_from<p.effective_from ORDER BY x.effective_from DESC,x.id DESC LIMIT 1)
            LEFT JOIN currency pc ON pc.currency_id=prev.currency_id
            WHERE p.effective_from BETWEEN ? AND ? ORDER BY p.effective_from DESC,p.id DESC""",
            (filters["period_from"], filters["period_to"])).fetchall()
        employee_by_id = {row["employee_id"]: row for row in rows}
        changes = []
        for change in changes_rows:
            if change["employee_id"] not in allowed_ids:
                continue
            employee = employee_by_id[change["employee_id"]]
            comparable = (change["previous_base"] is not None and
                          change["previous_currency"] == change["currency_code"] and
                          change["previous_frequency"] == change["pay_frequency"])
            percentage = (float((Decimal(change["base_pay"] - change["previous_base"]) /
                                 Decimal(change["previous_base"]) * 100).quantize(Decimal("0.1")))
                          if comparable and change["previous_base"] else None)
            changes.append({"employee_id": change["employee_id"], "employee_code": employee["employee_code"],
                "employee_name": employee["first_name"] + " " + employee["last_name"],
                "effective_from": change["effective_from"], "base_pay": change["base_pay"],
                "currency_code": change["currency_code"], "decimal_places": change["decimal_places"],
                "pay_frequency": change["pay_frequency"], "previous_base": change["previous_base"],
                "previous_currency": change["previous_currency"],
                "previous_decimal_places": change["previous_decimal_places"],
                "previous_frequency": change["previous_frequency"],
                "percentage": percentage})
        selected_values = values[metric]
        result = {
            "context": {"as_of": selected, "generated_at": generated, "filters": filters,
                "population": "employed_as_of", "fx_reference_date": FX_REFERENCE_DATE,
                "fx_reference_source": FX_REFERENCE_SOURCE,
                "reporting_currency": ({"code": target["currency_code"], "name": target["currency_name"],
                    "symbol": target["symbol"], "decimal_places": target["decimal_places"]}
                    if target else {"code": "USD", "name": "US Dollar", "symbol": "$", "decimal_places": 2})},
            "coverage": {"employee_count": len(rows), "base_included": len(values["base"]),
                "no_package": exclusions["base"]["no_package"], "hourly_base": exclusions["base"]["hourly"],
                "missing_fx": exclusions["base"]["missing_fx"],
                "missing_fx_currencies": sorted(missing_fx_currencies),
                "rates": sorted(rates_used.values(), key=lambda rate: rate["source_currency"])},
            "metrics": metrics, "distribution": _bins(selected_values),
            "breakdowns": breakdowns,
            "changes": {"count": len(changes), "items": changes if include_all_changes else changes[:50]},
        }
        if include_ids:
            result["_employee_ids"] = list(allowed_ids)
    return result


@audited("EXPORT_FAILED", "export")
def export_snapshot(**query):
    data = snapshot(**query, include_ids=True, include_all_changes=True)
    employee_ids = data.pop("_employee_ids")
    output = io.StringIO()
    writer = csv.writer(output)
    def row(*values):
        writer.writerow([csv_safe(value) for value in values])
    context, coverage = data["context"], data["coverage"]
    row("Compensation analytics snapshot")
    row("Generated at UTC", context["generated_at"])
    row("As of UTC", context["as_of"])
    row("Population", "Employed as of selected date; current stored organizational attributes")
    row("Reporting currency", "USD")
    row("FX reference date", context["fx_reference_date"])
    row("FX reference source", context["fx_reference_source"])
    for key, value in context["filters"].items():
        row("Filter " + key, value)
    for key in ("employee_count", "base_included", "no_package", "hourly_base", "missing_fx"):
        row(key, coverage[key])
    for rate in coverage["rates"]:
        row("FX rate", rate["source_currency"], rate["target_currency"], rate["rate"],
            rate["rate_date"], rate["source_name"])
    row("Definition", "Annualized base = annual base or monthly base × 12; hourly excluded")
    row("Definition", "Target variable is a commitment target; not actual cash paid")
    row("Definition", "One fixed FX reference set applies across compensation as-of dates; missing FX excludes affected records")
    row("Definition", "Group attributes are stored now, not historical membership")
    row()
    row("Metric", "sum_minor_units", "average_minor_units", "median_minor_units", "included", "excluded", "partial")
    for key, value in data["metrics"].items():
        row(key, value["sum"], value["average"], value["median"],
            value["included"], value["excluded"], value["partial"])
    row()
    row("Distribution lower_minor_units", "upper_minor_units", "count")
    for bin in data["distribution"]:
        row(bin["lower"], bin["upper"], bin["count"])
    for kind, groups in data["breakdowns"].items():
        row()
        row(kind, "employee_count", "included", "excluded", "exclusion_reasons", "sum_minor_units", "average_minor_units", "median_minor_units", "partial")
        for group in groups:
            row(group["label"], group["employee_count"], group["included"], group["excluded"],
                group["exclusion_reasons"], group["sum"], group["average"], group["median"], group["partial"])
    row()
    row("Changes", "employee_code", "effective_from", "previous_base_minor_units", "base_minor_units",
        "previous_currency", "currency", "previous_frequency", "frequency", "percentage")
    for change in data["changes"]["items"]:
        row(change["employee_name"], change["employee_code"], change["effective_from"],
            change["previous_base"], change["base_pay"], change["previous_currency"],
            change["currency_code"], change["previous_frequency"], change["pay_frequency"], change["percentage"])
    with closing(connect_database()) as connection:
        with connection:
            request_export(connection, dataset="Compensation analytics",
                           employee_ids=employee_ids,
                           metadata={"filters": context["filters"], "as_of": context["as_of"],
                                     "reporting_currency": context["reporting_currency"]["code"]
                                     if context["reporting_currency"] else None,
                                     "row_count": coverage["employee_count"]})
    return output.getvalue()
