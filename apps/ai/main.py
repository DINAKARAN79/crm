from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
import httpx
import json
import re
from jose import JWTError, jwt
from config import JWT_SECRET, NODE_API_URL

app = FastAPI(title="DCT CRM AI Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    response_type: str = "text"
    data: Optional[Dict[str, Any]] = None


async def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def call_node_api(endpoint: str, method: str = "GET", data: Dict = None, token: str = None):
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        url = f"{NODE_API_URL}{endpoint}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, json=data, headers=headers)
        else:
            response = await client.request(method, url, json=data, headers=headers)
        if response.status_code != 200:
            return {"success": False, "error": f"API returned {response.status_code}", "data": {}}
        return response.json()


def parse_date_range(message: str):
    msg = message.lower()
    now = datetime.now(timezone.utc)
    today = now.date()

    if "yesterday" in msg:
        d = today - timedelta(days=1)
        return str(d), str(d)
    if "today" in msg:
        return str(today), str(today)
    if "last 7 days" in msg or "last seven" in msg:
        return str(today - timedelta(days=7)), str(today)
    if "last 30 days" in msg or "last thirty" in msg:
        return str(today - timedelta(days=30)), str(today)
    if "last 90 days" in msg:
        return str(today - timedelta(days=90)), str(today)
    if "last week" in msg:
        end = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
        return str(start), str(end)
    if "this week" in msg:
        start = today - timedelta(days=today.weekday())
        return str(start), str(today)
    if "last month" in msg:
        first_this = today.replace(day=1)
        end = first_this - timedelta(days=1)
        start = end.replace(day=1)
        return str(start), str(end)
    if "this month" in msg:
        return str(today.replace(day=1)), str(today)
    if "last quarter" in msg:
        q = (today.month - 1) // 3
        end = today.replace(month=q * 3 + 1, day=1) - timedelta(days=1)
        start = end.replace(month=((q - 1) * 3 + 1), day=1)
        return str(start), str(end)
    if "this quarter" in msg:
        q = (today.month - 1) // 3
        start = today.replace(month=q * 3 + 1, day=1)
        return str(start), str(today)
    if "last year" in msg:
        end = today.replace(month=1, day=1) - timedelta(days=1)
        start = end.replace(month=1, day=1)
        return str(start), str(end)
    if "this year" in msg:
        return str(today.replace(month=1, day=1)), str(today)
    return str(today.replace(day=1)), str(today)


def detect_intent(message: str):
    msg = message.lower().strip()

    greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "how are you", "what's up"]
    if any(msg.startswith(g) or msg == g for g in greetings):
        return "greeting", {}

    help_patterns = ["what can you do", "help", "what do you do", "capabilities", "features"]
    if any(p in msg for p in help_patterns):
        return "help", {}

    ambiguous_single = ["revenue", "sales", "performance", "data", "numbers", "status", "report"]
    if msg in ambiguous_single:
        return "ambiguous", {"topic": msg}

    entity = None
    action = "count"
    grouping = None
    date_range = None

    lead_words = ["lead", "leads"]
    visit_words = ["site visit", "site visits", "visits", "visit"]
    opp_words = ["opportunity", "opportunities"]
    pipeline_words = ["pipeline"]
    quot_words = ["quotation", "quotations", "quote", "quotes"]
    book_words = ["booking", "bookings"]
    pay_words = ["payment", "payments"]
    proj_words = ["project", "projects"]
    unit_words = ["unit", "units", "inventory"]
    task_words = ["task", "tasks"]
    follow_words = ["follow-up", "follow up", "followups"]
    user_words = ["user", "users", "salesperson", "salesperson", "team"]
    dash_words = ["dashboard"]
    report_words = ["report", "reports"]

    if any(w in msg for w in lead_words):
        entity = "lead"
    elif any(w in msg for w in visit_words):
        entity = "site_visit"
    elif any(w in msg for w in pipeline_words):
        entity = "opportunity"
        action = "pipeline"
    elif any(w in msg for w in opp_words):
        entity = "opportunity"
    elif any(w in msg for w in quot_words):
        entity = "quotation"
    elif any(w in msg for w in book_words):
        entity = "booking"
    elif any(w in msg for w in pay_words):
        entity = "payment"
    elif any(w in msg for w in unit_words):
        entity = "unit"
    elif any(w in msg for w in proj_words):
        entity = "project"
    elif any(w in msg for w in task_words):
        entity = "task"
    elif any(w in msg for w in follow_words):
        entity = "follow_up"
    elif any(w in msg for w in user_words) and any(w in msg for w in ["performance", "perform", "best", "top"]):
        entity = "user"
        action = "performance"
    elif any(w in msg for w in dash_words):
        entity = "dashboard"
        action = "view"
    elif any(w in msg for w in report_words):
        entity = "report"
        action = "view"

    if entity:
        if any(w in msg for w in ["status", "by status"]):
            action = "group_by_status"
            grouping = "status"
        elif any(w in msg for w in ["source", "by source"]):
            action = "group_by_source"
            grouping = "source"
        elif any(w in msg for w in ["owner", "by owner", "by salesperson", "by sales", "my "]):
            action = "group_by_owner"
            grouping = "owner"
        elif any(w in msg for w in ["by project", "project wise", "per project"]):
            action = "group_by_project"
            grouping = "project"
        elif any(w in msg for w in ["by stage", "stage wise"]):
            action = "group_by_stage"
            grouping = "stage"
        elif any(w in msg for w in ["by status", "status wise"]):
            action = "group_by_status"
            grouping = "status"
        elif any(w in msg for w in ["trend", "over time", "daily", "weekly", "monthly"]):
            action = "trend"
        elif any(w in msg for w in ["compare", "comparison", "vs", "versus"]):
            action = "compare"
        elif any(w in msg for w in ["value", "amount", "revenue", "total", "sum"]):
            action = "value"
        elif any(w in msg for w in ["pending", "unpaid"]):
            action = "pending"
        elif any(w in msg for w in ["verified", "completed", "paid", "confirmed"]):
            action = "completed"
        elif any(w in msg for w in ["available", "vacant", "empty"]):
            action = "available"
        elif any(w in msg for w in ["booked", "sold"]):
            action = "booked"
        elif any(w in msg for w in ["how many", "count", "total", "number"]):
            action = "count"
        elif any(w in msg for w in ["top", "best", "highest", "most", "max"]):
            action = "top"
        elif any(w in msg for w in ["list", "show", "display", "see"]):
            action = "list"
        elif "my " in msg:
            action = "group_by_owner"
            grouping = "owner"

    if not entity:
        if any(w in msg for w in ["revenue", "income", "earnings"]):
            entity = "payment"
            action = "value"
        elif any(w in msg for w in ["summary", "overview", "snapshot"]):
            entity = "summary"
            action = "view"
        elif any(w in msg for w in ["sales"]):
            entity = "booking"
            action = "value"

    date_from, date_to = parse_date_range(message)

    return entity, {
        "action": action,
        "grouping": grouping,
        "date_from": date_from,
        "date_to": date_to,
        "message": message,
    }


def format_currency(value):
    if value is None:
        return "₹0"
    if value >= 10000000:
        return f"₹{value / 10000000:.2f} Cr"
    if value >= 100000:
        return f"₹{value / 100000:.2f} L"
    return f"₹{value:,.0f}"


def format_number(value):
    if value is None:
        return "0"
    return f"{value:,}"


def build_lead_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "group_by_status":
        by_status = data.get("byStatus", [])
        if not by_status:
            return "No lead status data found.", "text"
        lines = ["**Lead Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)}")
        return "\n".join(lines), "table"

    if action == "group_by_source":
        by_source = data.get("bySource", [])
        if not by_source:
            return "No lead source data found.", "text"
        lines = ["**Leads by Source**\n"]
        for s in by_source:
            source = s.get("source", "Unknown").replace("_", " ").title()
            lines.append(f"{source}: {s.get('count', 0)}")
        return "\n".join(lines), "table"

    if action == "group_by_owner":
        by_owner = data.get("byOwner", [])
        if not by_owner:
            return "No lead owner data found.", "text"
        lines = ["**Leads by Salesperson**\n"]
        for o in by_owner:
            owner = o.get("owner", {})
            name = f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or "Unassigned"
            lines.append(f"{name}: {o.get('count', 0)}")
        return "\n".join(lines), "table"

    total = data.get("total", 0)
    time_label = ""
    if "today" in msg:
        time_label = "Today"
    elif "this week" in msg or "weekly" in msg:
        time_label = "This Week"
    elif "this month" in msg or "monthly" in msg:
        time_label = "This Month"
    elif "last month" in msg:
        time_label = "Last Month"
    else:
        time_label = "Total"

    return f"**{time_label}'s Leads**\n\n{format_number(total)}", "kpi"


def build_visit_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "group_by_status":
        by_status = data.get("byStatus", [])
        if not by_status:
            return "No site visit data found.", "text"
        lines = ["**Site Visit Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)}")
        return "\n".join(lines), "table"

    if action == "group_by_owner":
        by_owner = data.get("byOwner", [])
        if not by_owner:
            return "No site visit owner data found.", "text"
        lines = ["**Site Visits by Salesperson**\n"]
        for o in by_owner:
            owner = o.get("owner", {})
            name = f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or "Unassigned"
            lines.append(f"{name}: {o.get('count', 0)}")
        return "\n".join(lines), "table"

    total = data.get("total", 0)
    time_label = "Total"
    if "today" in msg:
        time_label = "Today"
    elif "this week" in msg:
        time_label = "This Week"
    elif "this month" in msg:
        time_label = "This Month"

    return f"**{time_label}'s Site Visits**\n\n{format_number(total)}", "kpi"


def build_opportunity_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "pipeline":
        stages = data.get("stages", [])
        total_pipeline = data.get("totalPipeline", 0)
        weighted = data.get("weightedPipeline", 0)
        lines = ["**Pipeline Overview**\n"]
        lines.append(f"Total Pipeline: {format_currency(total_pipeline)}")
        lines.append(f"Weighted Pipeline: {format_currency(weighted)}\n")
        for s in stages:
            stage = s.get("stage", "").replace("_", " ").title()
            lines.append(f"{stage}: {s.get('count', 0)} ({format_currency(s.get('amount', 0))})")
        return "\n".join(lines), "table"

    if action == "group_by_stage":
        by_stage = data.get("byStage", [])
        if not by_stage:
            return "No opportunity stage data found.", "text"
        lines = ["**Opportunities by Stage**\n"]
        for s in by_stage:
            stage = s.get("stage", "").replace("_", " ").title()
            lines.append(f"{stage}: {s.get('count', 0)} ({format_currency(s.get('amount', 0))})")
        return "\n".join(lines), "table"

    if action == "group_by_owner":
        by_owner = data.get("byOwner", [])
        if not by_owner:
            return "No opportunity owner data found.", "text"
        lines = ["**Opportunities by Salesperson**\n"]
        for o in by_owner:
            owner = o.get("owner", {})
            name = f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or "Unassigned"
            lines.append(f"{name}: {o.get('count', 0)} ({format_currency(o.get('amount', 0))})")
        return "\n".join(lines), "table"

    total = data.get("total", 0)
    total_amount = data.get("totalAmount", 0)
    return f"**Opportunities**\n\nTotal: {format_number(total)}\nTotal Value: {format_currency(total_amount)}", "kpi"


def build_quotation_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "group_by_status":
        by_status = data.get("byStatus", [])
        if not by_status:
            return "No quotation data found.", "text"
        lines = ["**Quotation Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)} ({format_currency(s.get('amount', 0))})")
        return "\n".join(lines), "table"

    total = data.get("total", 0)
    total_amount = data.get("totalAmount", 0)
    return f"**Quotations**\n\nTotal: {format_number(total)}\nTotal Value: {format_currency(total_amount)}", "kpi"


def build_booking_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "group_by_status":
        by_status = data.get("byStatus", [])
        if not by_status:
            return "No booking data found.", "text"
        lines = ["**Booking Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)} ({format_currency(s.get('amount', 0))})")
        return "\n".join(lines), "table"

    if action == "group_by_project":
        by_project = data.get("byProject", [])
        if not by_project:
            return "No booking project data found.", "text"
        lines = ["**Bookings by Project**\n"]
        for p in by_project:
            proj = p.get("project", {})
            name = proj.get("name", "Unknown") if proj else "Unknown"
            lines.append(f"{name}: {p.get('count', 0)} ({format_currency(p.get('amount', 0))})")
        return "\n".join(lines), "table"

    if action == "pending":
        by_status = data.get("byStatus", [])
        pending = [s for s in by_status if s.get("status") in ["PENDING", "INITIATED"]]
        count = sum(s.get("count", 0) for s in pending)
        amount = sum(s.get("amount", 0) for s in pending)
        return f"**Pending Bookings**\n\nCount: {format_number(count)}\nValue: {format_currency(amount)}", "kpi"

    total = data.get("total", 0)
    total_amount = data.get("totalAmount", 0)
    time_label = "Total"
    if "today" in msg:
        time_label = "Today"
    elif "this week" in msg:
        time_label = "This Week"
    elif "this month" in msg:
        time_label = "This Month"

    return f"**{time_label}'s Bookings**\n\nCount: {format_number(total)}\nValue: {format_currency(total_amount)}", "kpi"


def build_payment_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "group_by_status":
        by_status = data.get("byStatus", [])
        if not by_status:
            return "No payment data found.", "text"
        lines = ["**Payment Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)} ({format_currency(s.get('amount', 0))})")
        return "\n".join(lines), "table"

    if action == "pending":
        pending = data.get("pendingAmount", 0)
        pending_count = 0
        for s in data.get("byStatus", []):
            if s.get("status") == "PENDING":
                pending_count = s.get("count", 0)
        return f"**Pending Payments**\n\nCount: {format_number(pending_count)}\nAmount: {format_currency(pending)}", "kpi"

    if action == "completed" or action == "value":
        verified = data.get("verifiedAmount", 0)
        pending = data.get("pendingAmount", 0)
        total = data.get("totalAmount", 0)
        time_label = "Total"
        if "today" in msg:
            time_label = "Today"
        elif "this week" in msg:
            time_label = "This Week"
        elif "this month" in msg:
            time_label = "This Month"
        return f"**{time_label}'s Revenue**\n\nCollected: {format_currency(verified)}\nPending: {format_currency(pending)}\nTotal: {format_currency(total)}", "kpi"

    total = data.get("total", 0)
    total_amount = data.get("totalAmount", 0)
    return f"**Payments**\n\nTotal Transactions: {format_number(total)}\nTotal Amount: {format_currency(total_amount)}", "kpi"


def build_project_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if isinstance(data, list):
        projects = data
        total_projects = len(projects)
    else:
        projects = data.get("projects", data.get("data", []))
        total_projects = data.get("totalProjects", len(projects) if isinstance(projects, list) else 0)

    if not projects:
        return "No project data found.", "text"

    if action == "available" or "available" in msg or "vacant" in msg:
        lines = ["**Unit Availability by Project**\n"]
        for p in projects:
            name = p.get("name", "Unknown")
            unit_stats = p.get("unitStats", [])
            available = sum(s.get("count", 0) for s in unit_stats if s.get("status") in ["AVAILABLE", "HOLD"])
            lines.append(f"{name}: {available} available")
        return "\n".join(lines), "table"

    if action == "booked" or "booked" in msg or "sold" in msg:
        lines = ["**Booked/Sold Units by Project**\n"]
        for p in projects:
            name = p.get("name", "Unknown")
            unit_stats = p.get("unitStats", [])
            booked = sum(s.get("count", 0) for s in unit_stats if s.get("status") in ["BOOKED", "SOLD", "RESERVED"])
            lines.append(f"{name}: {booked} booked/sold")
        return "\n".join(lines), "table"

    if action == "count" or "total" in msg or "how many" in msg:
        total_units = data.get("totalUnits", 0)
        total_revenue = data.get("totalRevenue", 0)
        total_leads = data.get("totalLeads", 0)
        total_bookings = data.get("totalBookings", 0)
        lines = [f"**Total Projects: {total_projects}**\n"]
        lines.append(f"Total Units: {total_units}")
        lines.append(f"Total Leads: {total_leads}")
        lines.append(f"Total Bookings: {total_bookings}")
        lines.append(f"Total Revenue: {format_currency(total_revenue)}")
        return "\n".join(lines), "kpi"

    lines = [f"**Projects ({total_projects})**\n"]
    for p in projects:
        name = p.get("name", "Unknown")
        unit_stats = p.get("unitStats", [])
        total_units = sum(s.get("count", 0) for s in unit_stats)
        revenue = p.get("revenue", 0)
        leads = p.get("leadCount", 0)
        lines.append(f"**{name}**: {total_units} units, {format_currency(revenue)} revenue, {leads} leads")
    return "\n".join(lines), "table"


def build_unit_response(data: dict, params: dict):
    action = params.get("action", "count")
    msg = params.get("message", "").lower()

    if action == "available" or "available" in msg or "vacant" in msg:
        available = data.get("availableUnits", data.get("available", 0))
        total = data.get("totalUnits", data.get("total", 0))
        return f"**Unit Availability**\n\nAvailable: {format_number(available)}\nTotal: {format_number(total)}", "kpi"

    if action == "booked" or "booked" in msg:
        booked = data.get("bookedUnits", data.get("booked", 0))
        sold = data.get("soldUnits", data.get("sold", 0))
        return f"**Booked/Sold Units**\n\nBooked: {format_number(booked)}\nSold: {format_number(sold)}", "kpi"

    by_status = data.get("byStatus", [])
    if by_status:
        lines = ["**Unit Status**\n"]
        for s in by_status:
            status = s.get("status", "Unknown").replace("_", " ").title()
            lines.append(f"{status}: {s.get('count', 0)}")
        return "\n".join(lines), "table"

    total = data.get("totalUnits", data.get("total", 0))
    available = data.get("availableUnits", data.get("available", 0))
    return f"**Units**\n\nTotal: {format_number(total)}\nAvailable: {format_number(available)}", "kpi"


def build_task_response(data: dict, params: dict):
    action = params.get("action", "count")
    total = data.get("total", 0)
    pending = data.get("pending", 0)
    completed = data.get("completed", 0)
    return f"**Tasks**\n\nTotal: {format_number(total)}\nPending: {format_number(pending)}\nCompleted: {format_number(completed)}", "kpi"


def build_followup_response(data: dict, params: dict):
    total = data.get("total", 0)
    pending = data.get("pending", 0)
    return f"**Follow-ups**\n\nTotal: {format_number(total)}\nPending: {format_number(pending)}", "kpi"


def build_user_response(data: dict, params: dict):
    action = params.get("action", "count")

    if action == "performance":
        by_owner = data.get("byOwner", data.get("performance", []))
        if by_owner:
            lines = ["**Salesperson Performance**\n"]
            for o in by_owner[:10]:
                owner = o.get("owner", o)
                name = f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() if isinstance(owner, dict) else str(owner)
                if not name:
                    name = "Unknown"
                count = o.get("count", 0)
                value = o.get("amount", o.get("value", 0))
                lines.append(f"{name}: {count} ({format_currency(value)})")
            return "\n".join(lines), "table"

    total = data.get("total", 0)
    return f"**Users**\n\nTotal: {format_number(total)}", "kpi"


def build_summary_response(data: dict, params: dict):
    lines = ["**CRM Summary**\n"]
    if "leads" in data:
        lines.append(f"Leads: {format_number(data['leads'])}")
    if "opportunities" in data:
        lines.append(f"Opportunities: {format_number(data['opportunities'])}")
    if "bookings" in data:
        lines.append(f"Bookings: {format_number(data['bookings'])}")
    if "payments" in data:
        lines.append(f"Payments: {format_number(data['payments'])}")
    if "revenue" in data:
        lines.append(f"Revenue: {format_currency(data['revenue'])}")
    return "\n".join(lines), "text"


ENTITY_TO_API = {
    "lead": "/api/analytics/leads",
    "site_visit": "/api/analytics/site-visits",
    "opportunity": "/api/analytics/opportunities",
    "quotation": "/api/analytics/quotations",
    "booking": "/api/analytics/bookings",
    "payment": "/api/analytics/payments",
    "project": "/api/analytics/projects",
    "unit": "/api/units",
    "task": "/api/tasks",
    "follow_up": "/api/follow-ups",
    "user": "/api/analytics/leads",
    "summary": None,
}

ENTITY_TO_RESPONSE_BUILDER = {
    "lead": build_lead_response,
    "site_visit": build_visit_response,
    "opportunity": build_opportunity_response,
    "quotation": build_quotation_response,
    "booking": build_booking_response,
    "payment": build_payment_response,
    "project": build_project_response,
    "unit": build_unit_response,
    "task": build_task_response,
    "follow_up": build_followup_response,
    "user": build_user_response,
    "summary": build_summary_response,
}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user=Depends(verify_token)):
    token_val = None
    try:
        token_val = user.get("token", "")
    except Exception:
        pass

    if not token_val:
        from jose import jwt as jose_jwt
        token_val = jose_jwt.encode(
            {"id": user.get("id"), "email": user.get("email"), "tenantId": user.get("tenantId")},
            JWT_SECRET,
            algorithm="HS256",
        )

    message = request.message.strip()
    if not message:
        return ChatResponse(
            response="Please type a question about your CRM data.",
            conversation_id=request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}",
        )

    entity, params = detect_intent(message)

    if entity == "greeting":
        return ChatResponse(
            response="Hello! I'm your DCT AI Assistant. You can ask me about leads, site visits, opportunities, bookings, payments, projects, units, reports and dashboards.",
            conversation_id=request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}",
        )

    if entity == "help":
        return ChatResponse(
            response=(
                "I can help you with DCT CRM data:\n\n"
                "**Leads**: \"today leads\", \"lead status\", \"leads by source\"\n"
                "**Site Visits**: \"today site visits\", \"visits by status\"\n"
                "**Opportunities**: \"open opportunities\", \"pipeline value\"\n"
                "**Bookings**: \"today bookings\", \"bookings by project\"\n"
                "**Payments**: \"pending payments\", \"this month revenue\"\n"
                "**Projects**: \"project overview\", \"unit availability\"\n"
                "**Units**: \"available units\", \"unit status\"\n"
                "**Tasks**: \"pending tasks\", \"tasks by status\"\n\n"
                "Try: \"today leads\", \"this month revenue\", \"lead status\", \"show pipeline\""
            ),
            conversation_id=request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}",
        )

    if entity == "ambiguous":
        topic = params.get("topic", "data")
        return ChatResponse(
            response=f"Which time period do you want for {topic}?\n\nTry: \"today {topic}\", \"this week {topic}\", \"this month {topic}\", or \"this year {topic}\"",
            conversation_id=request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}",
        )

    if not entity:
        return ChatResponse(
            response=(
                "I can help with DCT CRM data such as leads, site visits, opportunities, "
                "quotations, bookings, payments, projects, units, tasks, and dashboards.\n\n"
                "Try: \"today leads\", \"this month revenue\", \"lead status\", \"show pipeline\""
            ),
            conversation_id=request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}",
        )

    conversation_id = request.conversation_id or f"conv_{user.get('id')}_{datetime.now().timestamp()}"

    api_endpoint = ENTITY_TO_API.get(entity)

    if entity == "summary":
        try:
            lead_data = await call_node_api("/api/analytics/leads", "GET", None, token_val)
            opp_data = await call_node_api("/api/analytics/opportunities", "GET", None, token_val)
            book_data = await call_node_api("/api/analytics/bookings", "GET", None, token_val)
            pay_data = await call_node_api("/api/analytics/payments", "GET", None, token_val)
            combined = {
                "leads": lead_data.get("data", {}).get("total", 0),
                "opportunities": opp_data.get("data", {}).get("total", 0),
                "bookings": book_data.get("data", {}).get("total", 0),
                "payments": pay_data.get("data", {}).get("total", 0),
                "revenue": pay_data.get("data", {}).get("verifiedAmount", 0),
            }
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder(combined, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data=combined,
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve the CRM summary right now. Please try again.",
                conversation_id=conversation_id,
            )

    if entity == "unit":
        try:
            result = await call_node_api("/api/units", "GET", None, token_val)
            data = result.get("data", {})
            units = data if isinstance(data, list) else data.get("data", [])
            by_status = {}
            for u in units:
                s = u.get("status", "UNKNOWN")
                by_status[s] = by_status.get(s, 0) + 1
            total = len(units)
            available = sum(1 for u in units if u.get("status") in ["AVAILABLE", "HOLD"])
            booked = sum(1 for u in units if u.get("status") in ["BOOKED", "SOLD", "RESERVED"])
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder({
                "totalUnits": total,
                "availableUnits": available,
                "bookedUnits": booked,
                "byStatus": [{"status": k, "count": v} for k, v in by_status.items()],
            }, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data={"total": total, "available": available, "booked": booked, "byStatus": by_status},
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve unit data right now. Please try again.",
                conversation_id=conversation_id,
            )

    if entity == "task":
        try:
            result = await call_node_api("/api/tasks", "GET", None, token_val)
            data = result.get("data", {})
            tasks = data if isinstance(data, list) else data.get("data", [])
            total = len(tasks)
            pending = sum(1 for t in tasks if t.get("status") in ["PENDING", "IN_PROGRESS", "TODO"])
            completed = sum(1 for t in tasks if t.get("status") in ["COMPLETED", "DONE"])
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder({"total": total, "pending": pending, "completed": completed}, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data={"total": total, "pending": pending, "completed": completed},
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve task data right now. Please try again.",
                conversation_id=conversation_id,
            )

    if entity == "follow_up":
        try:
            result = await call_node_api("/api/follow-ups", "GET", None, token_val)
            data = result.get("data", {})
            items = data if isinstance(data, list) else data.get("data", [])
            total = len(items)
            pending = sum(1 for f in items if f.get("status") in ["PENDING", "SCHEDULED", "OPEN"])
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder({"total": total, "pending": pending}, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data={"total": total, "pending": pending},
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve follow-up data right now. Please try again.",
                conversation_id=conversation_id,
            )

    if entity == "project":
        try:
            result = await call_node_api("/api/analytics/projects", "GET", None, token_val)
            raw_data = result.get("data", [])
            projects = raw_data if isinstance(raw_data, list) else raw_data.get("data", []) if isinstance(raw_data, dict) else []
            total_projects = len(projects)
            total_units = sum(p.get("totalUnits", 0) or 0 for p in projects)
            total_revenue = sum(p.get("revenue", 0) or 0 for p in projects)
            total_leads = sum(p.get("leadCount", 0) or 0 for p in projects)
            total_bookings = sum(p.get("_count", {}).get("bookings", 0) for p in projects)
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder({
                "projects": projects,
                "totalProjects": total_projects,
                "totalUnits": total_units,
                "totalRevenue": total_revenue,
                "totalLeads": total_leads,
                "totalBookings": total_bookings,
            }, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data={"total": total_projects, "projects": [{"name": p.get("name"), "units": p.get("totalUnits", 0)} for p in projects]},
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve project data right now. Please try again.",
                conversation_id=conversation_id,
            )

    if entity == "user":
        try:
            lead_result = await call_node_api("/api/analytics/leads", "GET", None, token_val)
            data = lead_result.get("data", {})
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            response_text, resp_type = builder(data, params)
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data=data,
            )
        except Exception as e:
            return ChatResponse(
                response="I couldn't retrieve user performance data right now. Please try again.",
                conversation_id=conversation_id,
            )

    if api_endpoint:
        query_params = []
        current_action = params.get("action", "count")
        has_time_qualifier = any(w in message.lower() for w in [
            "today", "yesterday", "this week", "last week", "this month", "last month",
            "this quarter", "last quarter", "this year", "last year",
            "last 7 days", "last 30 days", "last 90 days",
            "daily", "weekly", "monthly",
        ])
        if has_time_qualifier and current_action not in ("group_by_status", "group_by_source", "group_by_owner", "group_by_stage", "group_by_project", "pipeline", "list"):
            if params.get("date_from"):
                query_params.append(f"startDate={params['date_from']}")
            if params.get("date_to"):
                query_params.append(f"endDate={params['date_to']}")
        full_url = api_endpoint + ("?" + "&".join(query_params) if query_params else "")

        try:
            result = await call_node_api(full_url, "GET", None, token_val)
            data = result.get("data", {})
            builder = ENTITY_TO_RESPONSE_BUILDER.get(entity)
            if builder:
                response_text, resp_type = builder(data, params)
            else:
                response_text = f"Data retrieved for {entity}."
                resp_type = "text"
            return ChatResponse(
                response=response_text,
                conversation_id=conversation_id,
                response_type=resp_type,
                data=data,
            )
        except Exception as e:
            return ChatResponse(
                response=f"I couldn't retrieve {entity} data right now. Please try again.",
                conversation_id=conversation_id,
            )

    return ChatResponse(
        response="I can help with DCT CRM data. Try: \"today leads\", \"this month revenue\", \"lead status\"",
        conversation_id=conversation_id,
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "dct-crm-ai", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
