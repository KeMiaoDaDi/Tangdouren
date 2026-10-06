#!/usr/bin/env python3
# ============================================================
# 会员系统真实数据验证（走 PostgREST + service key，不需要额外 token）
#
# 覆盖：视图计数与同日去重、解锁档位与幂等、四档折扣阶梯（9/8/7/5 折）、
#       每 10 次一轮（第二轮 13 次再给 9 折）、同类奖励用光后再用被拒、
#       折扣只能用在本人订单上、刚解锁的奖励不能当次用、撤销结算的守卫条件、
#       后台补挂已结算订单的规矩。
#
# 会先清掉上次的测试数据（幂等可重跑），跑完保留数据供在界面上查看。
# ============================================================

import json
import urllib.error
import urllib.request
import pathlib
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ENV = pathlib.Path.home() / "Desktop/Projects/Tangdouren/.env.local"
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


# ── 0. 清理（引用是个环：订单↔券↔奖励，必须按这个顺序解）───────────────────
EMAILS = ["demo.a@tangdouren.test", "demo.b@tangdouren.test"]
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

# 1) 奖励（解掉 奖励→订单 的引用）
for mid in ids:
    wipe("member_rewards", f"member_id=eq.{mid}", f"清奖励 {mid[:8]}")
# 2) 订单不再指向券
nullout("timer_sessions", "session_id=like.DEMO-*",
        {"coupon_id": None, "coupon_code_snapshot": None}, "解订单→券")
# 3) 券不再指向订单（核销字段要么全空要么成组，所以三个一起清）
nullout("coupons", "code=eq.TDTEST0001",
        {"redeemed_at": None, "redeemed_by": None, "redeemed_session_id": None}, "解券→订单")
# 4) 券 → 5) 订单 → 6) 会员
wipe("coupons", "code=eq.TDTEST0001", "清测试券")
for mid in ids:
    wipe("timer_sessions", f"member_id=eq.{mid}", f"清订单 {mid[:8]}")
    wipe("members", f"member_id=eq.{mid}", f"清会员 {mid[:8]}")
wipe("timer_sessions", "session_id=like.DEMO-*", "清剩余演示订单")

if errors:
    print("清理时报错：")
    for e in errors:
        print("  ", e)
# 复核：测试会员必须已经清干净，否则下面的检查会不准
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
    "display_name": "乙", "consent_source": "booking"}], prefer="return=representation")
B = rows[0]["member_id"]


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


for i in range(1, 14):
    st, out = add_session(f"DEMO-A-{i:03d}", A, 13.99, 200 - i)
    assert st in (200, 201), out
add_session("DEMO-A-DUP", A, 13.99, 199)   # 与第 2 条同一天

# ── 2. 视图计数 / 同日去重 ───────────────────────────────────────────────────
st, rows = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{A}")
check("A 累计到店 13 次（同一天多条只算 1）", 13, len(rows))
check("A 计入进度 13 次", 13, sum(1 for r in rows if r["reward_eligible"]))

# ── 3. 解锁与幂等 ───────────────────────────────────────────────────────────
st, out = rpc("ensure_member_rewards", p_member_id=A, p_session_id=None)
check("解锁调用成功", 200, st)
st, rows = sel("member_rewards",
               f"select=reward_type,cycle_index&member_id=eq.{A}&order=cycle_index,reward_type")
check("解锁 5 张（第一轮 4 + 第二轮 9 折）", 5, len(rows))
check("档位与轮次都对",
      str(sorted([(1, "P10_OFF"), (1, "P20_OFF"), (1, "P30_OFF"),
                  (1, "P50_OFF"), (2, "P10_OFF")])),
      str(sorted((r["cycle_index"], r["reward_type"]) for r in rows)))
st, out = rpc("ensure_member_rewards", p_member_id=A, p_session_id=None)
st, rows2 = sel("member_rewards", f"select=reward_id&member_id=eq.{A}")
check("重复调用不会多发（幂等）", 5, len(rows2))

# ── 4. 四档折扣阶梯：结算金额逐一核对 ────────────────────────────────────────
def settle_discount(sid, pence, rtype, member):
    st, out = rpc("settle_timer_session", p_session_id=sid, p_settled_by="hermes_test",
                  p_discount_amount_pence=pence, p_discount_source="member_reward",
                  p_member_id=member, p_reward_type=rtype)
    return st, out

add_session("DEMO-A-D1", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D1", 140, "P10_OFF", A)
check("9 折结算成功", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp&session_id=eq.DEMO-A-D1")
check("9 折结算金额（13.99 → 12.59）", "12.59", rows[0]["actual_amount_gbp"])

add_session("DEMO-A-D2", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D2", 280, "P20_OFF", A)
check("8 折结算成功", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp&session_id=eq.DEMO-A-D2")
check("8 折结算金额（13.99 → 11.19）", "11.19", rows[0]["actual_amount_gbp"])

add_session("DEMO-A-D3", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D3", 420, "P30_OFF", A)
check("7 折结算成功", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp&session_id=eq.DEMO-A-D3")
check("7 折结算金额（13.99 → 9.79）", "9.79", rows[0]["actual_amount_gbp"])

add_session("DEMO-A-D4", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D4", 700, "P50_OFF", A)
check("5 折结算成功", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp,discount_type_snapshot,discount_value_snapshot&session_id=eq.DEMO-A-D4")
check("5 折结算金额（13.99 → 6.99）", "6.99", rows[0]["actual_amount_gbp"])
check("折扣类型快照 = percentage_off", "percentage_off", rows[0]["discount_type_snapshot"])
check("5 折折扣值快照 = 50", "50.00", rows[0]["discount_value_snapshot"])

# 第一轮的 9 折已经用掉，第二轮那张应当还能用
add_session("DEMO-A-D5", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D5", 140, "P10_OFF", A)
check("第二轮 9 折还能用", 200, st)
st, rows = sel("timer_sessions", "select=actual_amount_gbp&session_id=eq.DEMO-A-D5")
check("第二轮 9 折金额（13.99 → 12.59）", "12.59", rows[0]["actual_amount_gbp"])

# 两张 9 折都用掉了，再要就没有了
add_session("DEMO-A-D6", A, 13.99, 0, settled=False)
st, out = settle_discount("DEMO-A-D6", 140, "P10_OFF", A)
check("同类奖励用光后再用被拒", "MEMBER_REWARD_UNAVAILABLE", err_of((st, out)))

# ── 5. 折扣只能用在本人订单上 ────────────────────────────────────────────────
add_session("DEMO-GUEST-1", None, 13.99, 1, settled=False)
st, out = settle_discount("DEMO-GUEST-1", 280, "P20_OFF", A)
check("会员折扣不能用在他人订单上", "MEMBER_SESSION_MISMATCH", err_of((st, out)))
st, rows = sel("timer_sessions", "select=reward_eligible&session_id=eq.DEMO-GUEST-1")
check("非会员订单不产生任何人进度", None, rows[0]["reward_eligible"])

# ── 6. B：刚解锁的奖励不能用于产生它的那笔消费 ──────────────────────────────
add_session("DEMO-B-001", B, 13.99, 30)
add_session("DEMO-B-002", B, 13.99, 29)
add_session("DEMO-B-003", B, 13.99, 28, settled=False)
st, out = settle_discount("DEMO-B-003", 140, "P10_OFF", B)
check("刚解锁的奖励不能用于产生它的那笔消费", "MEMBER_REWARD_UNAVAILABLE", err_of((st, out)))

st, out = rpc("settle_timer_session", p_session_id="DEMO-B-003", p_settled_by="hermes_test",
              p_discount_amount_pence=0, p_discount_source="none")
check("同一笔改成不使用优惠后结算成功", 200, st)
st, rows = sel("member_rewards",
               f"select=unlocked_by_session_id,used_at&member_id=eq.{B}&reward_type=eq.P10_OFF&cycle_index=eq.1")
check("第 3 次到店解锁了 9 折", "DEMO-B-003", rows[0]["unlocked_by_session_id"])
check("刚解锁的奖励 used_at 为空", None, rows[0]["used_at"])

# ── 7. 撤销守卫：奖励已被后续用掉则不许撤销来源结算 ─────────────────────────
add_session("DEMO-B-004", B, 13.99, 27, settled=False)
st, out = settle_discount("DEMO-B-004", 140, "P10_OFF", B)
check("第二笔用掉那张刚解锁的 9 折", 200, st)
st, out = rpc("unsettle_timer_session", p_session_id="DEMO-B-003")
check("奖励已被后续使用则拒绝撤销来源结算", "REWARD_ALREADY_USED", err_of((st, out)))

# ── 8. Link to Member：未结算可挂；已结算的补挂只记到店次数 ─────────────────
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
check("补挂只记到店：reward_eligible = false", False, rows[0]["reward_eligible"])
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

# ── 9. 结果 ────────────────────────────────────────────────────────────────
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
for label, mid in [("甲 demo.a@tangdouren.test", A), ("乙 demo.b@tangdouren.test", B)]:
    st, v = sel("member_visit_days", f"select=reward_eligible&member_id=eq.{mid}")
    st, rw = sel("member_rewards", f"select=reward_type,cycle_index,used_at&member_id=eq.{mid}")
    print(f"  {label}: 到店 {len(v or [])} 次 / 计入进度 {sum(1 for x in (v or []) if x['reward_eligible'])} 次"
          f" / 奖励 {len(rw or [])} 张")
print(f"  会员 ID: 甲={A}  乙={B}")
