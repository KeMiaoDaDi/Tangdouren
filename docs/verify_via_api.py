#!/usr/bin/env python3
# ============================================================
# 会员系统真实数据验证（走 PostgREST + service key，不需要额外 token）
#
# 覆盖：视图计数与同日去重、达标自动打折（第 3/5/7/10 次那单自动折扣）、
#       同一天第二笔原价（只打第一笔）、撤销结算回退后可重打、券码冲突被拒、
#       门槛未达被拒、折扣只能用在本人订单上、后台补挂已结算订单的规矩。
#
# 会先清掉上次的测试数据（幂等可重跑），跑完保留数据供在界面上查看。
# ============================================================

import json
import urllib.error
import urllib.request
import pathlib
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

REPO = pathlib.Path(__file__).resolve().parent.parent   # 仓库根目录（docs/ 的上一级）
ENV = REPO / ".env.local"
cfg = {}
for line in ENV.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")
U, K = cfg["NEXT_PUBLIC_SUPABASE_URL"], cfg["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}

L = ZoneInfo("Europe/London")
TODAY = datetime.now(L).date()
NOW = datetime.now(timezone.utc)


def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{U}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t.strip() else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            j = json.loads(t)
        except Exception:
            j = {"message": t[:200]}
        return e.code, j


def sel(t, q):   return req("GET", f"/rest/v1/{t}?{q}")
def dele(t, q):  return req("DELETE", f"/rest/v1/{t}?{q}")
def rpc(fn, **p): return req("POST", f"/rest/v1/rpc/{fn}", p)


CHECKS = []


def check(name, expected, actual):
    ok = str(expected) == str(actual)
    CHECKS.append((name, str(expected), str(actual), "PASS" if ok else "FAIL"))


def err_of(resp):
    st, body = resp
    return body.get("message", "") if isinstance(body, dict) else ""


# ── 0. 清理（引用是个环：订单↔券，必须按这个顺序解）─────────────────────────
EMAILS = ["demo.a@tangdouren.test", "demo.b@tangdouren.test", "demo.c@tangdouren.test"]
ids = []
for e in EMAILS:
    st, rows = sel("members", f"select=member_id&email_key=eq.{e}")
    if isinstance(rows, list):
        ids += [r["member_id"] for r in rows]

errors = []
def wipe(table, query, label):
    st, body = dele(table, query)
    if st not in (200, 204):
        errors.append(f"{label}: HTTP {st} {str(body)[:110]}")

def nullout(table, query, patch, label):
    st, body = req("PATCH", f"/rest/v1/{table}?{query}", patch)
    if st not in (200, 204):
        errors.append(f"{label}: HTTP {st} {str(body)[:110]}")

# 1) 订单不再指向券
nullout("timer_sessions", "session_id=like.DEMO-*",
        {"coupon_id": None, "coupon_code_snapshot": None, "discount_source_snapshot": None,
         "discount_type_snapshot": None, "discount_value_snapshot": None}, "解订单→券")
# 2) 券不再指向订单
nullout("coupons", "code=eq.TDTEST0001",
        {"redeemed_at": None, "redeemed_by": None, "redeemed_session_id": None}, "解券→订单")
# 3) 券 → 4) 订单 → 5) 会员
wipe("coupons", "code=eq.TDTEST0001", "清测试券")
for mid in ids:
    wipe("timer_sessions", f"member_id=eq.{mid}", f"清订单 {mid[:8]}")
    wipe("members", f"member_id=eq.{mid}", f"清会员 {mid[:8]}")
wipe("timer_sessions", "session_id=like.DEMO-*", "清剩余演示订单")

if errors:
    print("清理时报错：")
    for e in errors:
        print("  ", e)
for e in EMAILS:
    st, rows = sel("members", f"select=member_id&email_key=eq.{e}")
    if isinstance(rows, list) and rows:
        raise SystemExit(f"清理没成功：{e} 还在库里，先停下")

# ── 1. 会员 ─────────────────────────────────────────────────────────────────
st, rows = req("POST", "/rest/v1/members", [{
    "email": "demo.a@tangdouren.test", "email_key": "demo.a@tangdouren.test",
    "display_name": "甲", "consent_source": "in_store"}], prefer="return=representation")
A = rows[0]["member_id"]
st, rows = req("POST", "/rest/v1/members", [{
    "email": "demo.b@tangdouren.test", "email_key": "demo.b@tangdouren.test",
    "display_name": "乙", "consent_source": "in_store"}], prefer="return=representation")
B = rows[0]["member_id"]
st, rows = req("POST", "/rest/v1/members", [{
    "email": "demo.c@tangdouren.test", "email_key": "demo.c@tangdouren.test",
    "display_name": "丙", "consent_source": "in_store"}], prefer="return=representation")
C = rows[0]["member_id"]


def add_session(sid, member_id, gbp, days_ago, settled=True, eligible=True):
    d = TODAY - timedelta(days=days_ago)
    row = {"session_id": sid, "customer_name": "测试", "status": "completed",
           "started_at": f"{d.isoformat()}T12:00:00+00:00",
           "stopped_at": f"{d.isoformat()}T13:00:00+00:00",
           "billing_minutes": 60, "elapsed_minutes": 60, "amount_gbp": gbp,
           "created_via": "self_service", "created_by": "hermes_test"}
    if member_id:
        row["member_id"] = member_id
    if settled:
        row.update({"is_settled": True, "settled_at": NOW.isoformat(), "settled_by": "hermes_test",
                    "actual_amount_gbp": gbp, "discount_amount_gbp": 0})
        if member_id:
            row["reward_eligible"] = eligible
    return req("POST", "/rest/v1/timer_sessions", [row], prefer="return=representation")


# 甲：2 次历史进度；乙：2 次历史进度；丙：1 次历史进度
add_session("DEMO-A-001", A, 13.99, 2)
add_session("DEMO-A-002", A, 13.99, 1)
add_session("DEMO-B-001", B, 13.99, 2)
add_session("DEMO-B-002", B, 13.99, 1)
add_session("DEMO-C-001", C, 13.99, 1)

# ── 2. 视图计数 ─────────────────────────────────────────────────────────────
st, rows = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{A}")
check("甲累计到店 2 次", 2, len(rows))
check("甲计入进度 2 次", 2, sum(1 for r in rows if r["reward_eligible"]))

# ── 3. 达标自动打折：第 3 次到店那单自动 9 折 ────────────────────────────────
def settle_member(sid, pence, rtype, member):
    return rpc("settle_timer_session", p_session_id=sid, p_settled_by="hermes_test",
               p_discount_amount_pence=pence, p_discount_source="member_reward",
               p_member_id=member, p_reward_type=rtype)

add_session("DEMO-A-T", A, 13.99, 0, settled=False)
st, out = settle_member("DEMO-A-T", 140, "P10_OFF", A)
check("第 3 次到店自动 9 折结算成功", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp,discount_source_snapshot,discount_value_snapshot&session_id=eq.DEMO-A-T")
check("第 3 次到店金额（13.99 → 12.59）", "12.59", rows[0]["actual_amount_gbp"])
check("折扣来源快照 = member", "member", rows[0]["discount_source_snapshot"])
check("折扣值快照 = 10", "10.00", rows[0]["discount_value_snapshot"])

# ── 4. 撤销结算回退进度，重结算仍自动 9 折 ──────────────────────────────────
st, out = rpc("unsettle_timer_session", p_session_id="DEMO-A-T")
check("撤销结算成功", 200, st)
st, rows = sel("timer_sessions", "select=is_settled,discount_source_snapshot&session_id=eq.DEMO-A-T")
check("撤销后回到未结算", "false", rows[0]["is_settled"])
check("撤销后清空折扣来源快照", None, rows[0]["discount_source_snapshot"])
st, out = settle_member("DEMO-A-T", 140, "P10_OFF", A)
check("重结算仍自动 9 折", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp&session_id=eq.DEMO-A-T")
check("重结算金额（13.99 → 12.59）", "12.59", rows[0]["actual_amount_gbp"])

# ── 5. 同一天第二笔原价（只打第一笔）────────────────────────────────────────
add_session("DEMO-A-T2", A, 13.99, 0, settled=False)
st, out = rpc("settle_timer_session", p_session_id="DEMO-A-T2", p_settled_by="hermes_test",
              p_discount_amount_pence=0, p_discount_source="none")
check("同一天第二笔结算成功（原价）", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp,discount_source_snapshot&session_id=eq.DEMO-A-T2")
check("同一天第二笔金额原价", "13.99", rows[0]["actual_amount_gbp"])
check("同一天第二笔无折扣快照", None, rows[0]["discount_source_snapshot"])

# ── 6. 券码冲突：达到档位的那单不能叠加优惠券 ────────────────────────────────
add_session("DEMO-B-T", B, 13.99, 0, settled=False)
st, out = rpc("settle_timer_session", p_session_id="DEMO-B-T", p_settled_by="hermes_test",
              p_coupon_code="TD000000", p_discount_amount_pence=140, p_discount_source="coupon")
check("达到档位时券码被拒", "MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON", err_of((st, out)))

# ── 7. 门槛未达：非档位次数按会员折扣结算被拒 ────────────────────────────────
add_session("DEMO-C-T", C, 13.99, 0, settled=False)
st, out = settle_member("DEMO-C-T", 140, "P10_OFF", C)
check("不落档的到店按会员折扣结算被拒", "MEMBER_THRESHOLD_NOT_MET", err_of((st, out)))

# ── 8. 折扣只能用在本人订单上 ────────────────────────────────────────────────
add_session("DEMO-GUEST-1", None, 13.99, 1, settled=False)
st, out = settle_member("DEMO-GUEST-1", 280, "P20_OFF", A)
check("会员折扣不能用在他人订单上", "MEMBER_SESSION_MISMATCH", err_of((st, out)))
st, out = rpc("settle_timer_session", p_session_id="DEMO-GUEST-1", p_settled_by="hermes_test",
              p_discount_amount_pence=0, p_discount_source="none")
st, rows = sel("timer_sessions", "select=reward_eligible&session_id=eq.DEMO-GUEST-1")
check("非会员订单不产生任何人进度", None, rows[0]["reward_eligible"])

# ── 9. 后台补挂已结算订单的规矩 ──────────────────────────────────────────────
add_session("DEMO-LINK-1", None, 13.99, 5, settled=False)
st, out = rpc("link_timer_session_to_member", p_session_id="DEMO-LINK-1", p_member_id=B)
check("未结算的订单可以挂到会员", 200, st)
st, rows = sel("timer_sessions", "select=member_id,reward_eligible&session_id=eq.DEMO-LINK-1")
check("挂上去之后归属正确", B, rows[0]["member_id"])
check("未结算的单挂上后进度资格仍是 NULL（等结算时判定）", None, rows[0]["reward_eligible"])

st, vbefore = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{B}")
add_session("DEMO-LINK-2", None, 13.99, 6)
st, out = rpc("link_timer_session_to_member", p_session_id="DEMO-LINK-2", p_member_id=B)
check("已结算的散客单允许补挂", 200, st)
st, rows = sel("timer_sessions", "select=member_id,reward_eligible,actual_amount_gbp&session_id=eq.DEMO-LINK-2")
check("补挂后归属正确", B, rows[0]["member_id"])
check("补挂只记到店：reward_eligible = false", "false", rows[0]["reward_eligible"])
check("补挂不动已收金额", "13.99", rows[0]["actual_amount_gbp"])
st, vafter = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{B}")
check("补挂让 Lifetime 加 1", len(vbefore or []) + 1, len(vafter or []))
check("补挂不让进度加",
      sum(1 for x in (vbefore or []) if x["reward_eligible"]),
      sum(1 for x in (vafter or []) if x["reward_eligible"]))

st, out = rpc("link_timer_session_to_member", p_session_id="DEMO-LINK-2", p_member_id=A)
check("已结算且已归属的单不能再改到别的会员", "SESSION_ALREADY_LINKED", err_of((st, out)))

st, out = rpc("link_timer_session_to_member", p_session_id="DEMO-LINK-1", p_member_id="00000000-0000-0000-0000-000000000000")
check("挂到不存在的会员会被拒", "MEMBER_NOT_FOUND", err_of((st, out)))

# ── 10. 结果 ────────────────────────────────────────────────────────────────
print("=" * 96)
print(f"{'结果':<5} {'检查项':<52} {'期望':<26} 实际")
print("-" * 96)
for name, exp, act, res in CHECKS:
    print(f"{res:<5} {name:<52} {exp[:25]:<26} {act[:28]}")
print("-" * 96)
npass = sum(1 for c in CHECKS if c[3] == "PASS")
print(f"通过 {npass}/{len(CHECKS)}")
if npass != len(CHECKS):
    print("\n未通过：")
    for name, exp, act, res in CHECKS:
        if res == "FAIL":
            print(f"  - {name}: 期望 {exp}，实际 {act}")

print("\n" + "=" * 96)
print("留下的可查看数据（测试项目）")
for label, mid in [("甲 demo.a@tangdouren.test", A), ("乙 demo.b@tangdouren.test", B),
                   ("丙 demo.c@tangdouren.test", C)]:
    st, v = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{mid}")
    print(f"  {label}: 到店 {len(v or [])} 次 / 计入进度 {sum(1 for x in (v or []) if x['reward_eligible'])} 次")
print(f"  会员 ID: 甲={A}  乙={B}  丙={C}")
