#!/usr/bin/env python3
# ============================================================
# 场景演练：按店里的真实流程把会员系统走一遍（轻量、可重复跑）
#
# 顾客侧走本地 dev server 的真实接口：/api/self-timer/start、/api/member/*
# 店员侧走后台页面调用的同一个数据库函数：settle_timer_session、unsettle_timer_session、
#        link_timer_session_to_member
# 时间等不起的场景（同一天两次、跨夜）直接造数据，因为时钟拨不动。
#
# 只动 walk.*@tangdouren.test 这几个演练身份，跑完清干净（KEEP=1 保留现场）。
# 前置：dev server 起在 3002（用 BASE 环境变量可改）。
#
# 本次改版口径：不存券，到店次数达标（3/5/7/10，满 10 循环）的那一单自动打折；
# 当天第二笔原价；会员折扣不能叠加优惠券。
# ============================================================

import json
import os
import pathlib
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

BASE = os.environ.get("BASE", "http://localhost:3002")
KEEP = os.environ.get("KEEP") == "1"
REPO = pathlib.Path(__file__).resolve().parent.parent   # 仓库根目录（docs/ 的上一级）

cfg = {}
for line in (REPO / ".env.local").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")
U, K = cfg["NEXT_PUBLIC_SUPABASE_URL"], cfg["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}

L = ZoneInfo("Europe/London")
TODAY = datetime.now(L).date()
NOW = datetime.now(timezone.utc)

MEI   = "walk.mei@tangdouren.test"      # 会员：小梅（主场景）
QIANG = "walk.qiang@tangdouren.test"    # 小梅的朋友：阿强（不是会员）
DONG  = "walk.dong@tangdouren.test"     # 用来试时间口径：小冬
WALK_EMAILS = [MEI, QIANG, DONG]
TAG = "演练-"                            # 演练单的顾客名统一以此开头，便于清理


# ── 两条通道：数据库（PostgREST + service key）与本地站点接口 ────────────────
def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer:
        h["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    if not path.isascii():                     # 中文过滤条件（比如顾客名 like 演练-*）要先转义
        head, _, query = path.partition("?")
        path = head + "?" + urllib.parse.quote(query, safe="=&,.*:-()")
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


def sel(t, q):    return req("GET", f"/rest/v1/{t}?{q}")
def dele(t, q):   return req("DELETE", f"/rest/v1/{t}?{q}")
def rpc(fn, **p): return req("POST", f"/rest/v1/rpc/{fn}", p)


def api(path, body):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            t = resp.read().decode()
            return resp.status, (json.loads(t) if t.strip() else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            j = json.loads(t)
        except Exception:
            j = {"error": t[:200]}
        return e.code, j


STEPS = []


def check(scene, expected, actual):
    ok = str(expected) == str(actual)
    STEPS.append((scene, str(expected), str(actual), ok))
    print(("  ✓ " if ok else "  ✗ ") + scene + ("" if ok else f"   期望 {expected} / 实际 {actual}"))
    return ok


def note(scene, text):
    STEPS.append((scene, "（记录）", text, None))
    print("  · " + scene + "：" + text)


def err(resp):
    st, b = resp
    return (b or {}).get("message", "") if isinstance(b, dict) else ""


# ── 造单与查数 ──────────────────────────────────────────────────────────────
_seq = {"i": 0}


def mk(member_id, days_ago, gbp=13.99, settled=False, eligible=True, start_iso=None, stop_iso=None):
    """造一张计时单。不给 start_iso 时用 12:00 UTC（伦敦下午），给的话用来试跨夜/时区口径。"""
    _seq["i"] += 1
    sid = f"WALK-{_seq['i']:03d}"
    d = TODAY - timedelta(days=days_ago)
    row = {"session_id": sid, "customer_name": TAG + "会员", "status": "completed",
           "started_at": start_iso or f"{d.isoformat()}T12:00:00+00:00",
           "stopped_at": stop_iso or f"{d.isoformat()}T13:00:00+00:00",
           "billing_minutes": 60, "elapsed_minutes": 60, "amount_gbp": gbp,
           "created_via": "self_service", "created_by": "walk_test"}
    if member_id:
        row["member_id"] = member_id
    if settled:
        row.update({"is_settled": True, "settled_at": NOW.isoformat(), "settled_by": "演练店员",
                    "actual_amount_gbp": gbp, "discount_amount_gbp": 0})
        if member_id:
            row["reward_eligible"] = eligible
    st, out = req("POST", "/rest/v1/timer_sessions", [row], prefer="return=representation")
    assert st in (200, 201), out
    return sid


def stop(sid, gbp=13.99, minutes=60):
    """店员点「结束计时」：真实流程里这步由页面做，这里直接写结果。"""
    return req("PATCH", f"/rest/v1/timer_sessions?session_id=eq.{sid}",
               {"status": "completed", "stopped_at": NOW.isoformat(),
                "billing_minutes": minutes, "elapsed_minutes": minutes, "amount_gbp": gbp})


def settle(sid, source, pence, member=None, reward=None, coupon=None):
    p = {"p_session_id": sid, "p_settled_by": "演练店员",
         "p_discount_source": source, "p_discount_amount_pence": pence}
    if member: p["p_member_id"] = member
    if reward: p["p_reward_type"] = reward
    if coupon: p["p_coupon_code"] = coupon
    return rpc("settle_timer_session", **p)


def sess(sid, fields="actual_amount_gbp,reward_eligible,member_id,is_settled,discount_amount_gbp,discount_source_snapshot"):
    st, rows = sel("timer_sessions", f"select={fields}&session_id=eq.{sid}")
    return (rows or [{}])[0]


def days_of(mid):
    st, rows = sel("member_visit_days",
                   f"select=visit_date,reward_eligible&member_id=eq.{mid}&order=visit_date")
    return rows or []


def member_id_of(email):
    st, rows = sel("members", f"select=member_id&email_key=eq.{email}")
    return (rows or [{}])[0].get("member_id")


# ── 清理（引用环：券 → 订单 → 会员，必须按序解）─────────────────────────────
def wipe_all(quiet=False):
    ids = [i for i in (member_id_of(e) for e in WALK_EMAILS) if i]
    errs = []

    def w(table, query, label):
        st, body = dele(table, query)
        if st not in (200, 204):
            errs.append(f"{label}: HTTP {st} {str(body)[:110]}")

    def n(table, query, patch, label):
        st, body = req("PATCH", f"/rest/v1/{table}?{query}", patch)
        if st not in (200, 204):
            errs.append(f"{label}: HTTP {st} {str(body)[:110]}")

    # 演练的单：自己造的 WALK-*，加上走接口建的（顾客名带「演练-」前缀）
    st, rows = sel("timer_sessions",
                   f"select=session_id&or=(session_id.like.WALK-*,customer_name.like.{TAG}*)")
    sids = [r["session_id"] for r in (rows or [])]

    # 演练的券：被演练单核销掉的（兜底，正常演练不产生券）
    own = []
    if sids:
        st, cs = sel("coupons", "select=coupon_id&redeemed_session_id=in.(" + ",".join(sids) + ")")
        own = [c["coupon_id"] for c in (cs or [])]
    own = sorted(set(own))

    if own:
        n("coupons", "coupon_id=in.(" + ",".join(own) + ")",
          {"redeemed_at": None, "redeemed_by": None, "redeemed_session_id": None}, "解券→单")
    if sids:
        w("timer_sessions", "session_id=in.(" + ",".join(sids) + ")", "清演练单")
    for mid in ids:
        w("members", f"member_id=eq.{mid}", f"清会员 {mid[:8]}")
    if own:
        w("coupons", "coupon_id=in.(" + ",".join(own) + ")", "清演练券")

    if errs and not quiet:
        print("清理时报错：")
        for e in errs:
            print("  ", e)
    for e in WALK_EMAILS:
        if member_id_of(e):
            raise SystemExit(f"清理没干净：{e} 还在库里，先停下")


# ── 开局：清场 + 建演练身份 ─────────────────────────────────────────────────
try:
    with urllib.request.urlopen(BASE + "/self-timer", timeout=10) as r:
        assert r.status == 200
except Exception as e:
    raise SystemExit(f"dev server 不在 {BASE}（{e}）——先 npm run dev -- -p 3002")

wipe_all()

st, rows = req("POST", "/rest/v1/members", [
    {"email": MEI, "email_key": MEI, "display_name": "小梅", "consent_source": "in_store"},
], prefer="return=representation")
MEI_ID = rows[0]["member_id"]
st, rows = req("POST", "/rest/v1/members", [
    {"email": QIANG, "email_key": QIANG, "display_name": "阿强", "consent_source": "booking"},
], prefer="return=representation")
QIANG_ID = rows[0]["member_id"]
st, rows = req("POST", "/rest/v1/members", [
    {"email": DONG, "email_key": DONG, "display_name": "小冬", "consent_source": "in_store"},
], prefer="return=representation")
DONG_ID = rows[0]["member_id"]

# 期望账本：小梅的到店日（lifetime）与计入进度的到店日（progress）
life, prog = set(), set()


def add_day(day, mode="both"):
    if mode == "both":
        life.add(day); prog.add(day)
    elif mode == "life":
        life.add(day)


def assert_book(p, label):
    st, rows = sel("member_visit_days", f"select=visit_date,reward_eligible&member_id=eq.{MEI_ID}")
    got_life = sorted(r["visit_date"] for r in (rows or []))
    got_prog = sorted(r["visit_date"] for r in (rows or []) if r["reward_eligible"])
    check(f"{label} · 累计到店 {len(life)} 次", sorted(str(d) for d in life), got_life)
    check(f"{label} · 奖励进度 {len(prog)} 次", sorted(str(d) for d in prog), got_prog)


D = TODAY
day = lambda n: str(D - timedelta(days=n))

print("=" * 100)
print("场景演练开始：" + datetime.now(L).strftime("%Y-%m-%d %H:%M") + "（伦敦）")
print("=" * 100)

# ═══ A. 顾客扫桌上的码，自己开始计时（走真实接口）═══════════════════════════
st1, a1 = api("/api/self-timer/start", {"tableNumber": "S1", "seatNumber": "S1-A",
                                        "customerName": TAG + "散客", "confirmNoMixedBeans": True})
check("A1 散客不填邮箱也能开始计时", 201, st1)
GUEST_SID = (a1 or {}).get("sessionId", "")
check("A1 这张单没有会员归属", None, sess(GUEST_SID).get("member_id"))

st2, a2 = api("/api/self-timer/start", {"tableNumber": "S2", "seatNumber": "S2-A",
                                        "customerName": TAG + "小梅",
                                        "memberEmail": "  Walk.Mei@Tangdouren.Test  ",
                                        "confirmNoMixedBeans": True})
check("A2 会员填邮箱（大小写与空格都不规范）照样认出来", 201, st2)
MEI_SID_1 = (a2 or {}).get("sessionId", "")
check("A2 这一单归到小梅名下", MEI_ID, sess(MEI_SID_1).get("member_id"))

st3, a3 = api("/api/self-timer/start", {"tableNumber": "S3", "seatNumber": "S3-A",
                                        "customerName": TAG + "陌生邮箱",
                                        "memberEmail": "nobody.here@tangdouren.test",
                                        "confirmNoMixedBeans": True})
check("A3 输了一个没注册过的邮箱，也照样能开始计时（不挡生意）", 201, st3)
check("A3 这张单按普通顾客处理", None, sess((a3 or {}).get("sessionId", "")).get("member_id"))

IDEM = f"walk-idem-{TODAY.isoformat()}"
st4a, b4a = api("/api/self-timer/start", {"tableNumber": "D1", "seatNumber": "D1-A",
                                          "customerName": TAG + "小梅", "memberEmail": MEI,
                                          "idempotencyKey": IDEM, "confirmNoMixedBeans": True})
st4b, b4b = api("/api/self-timer/start", {"tableNumber": "D1", "seatNumber": "D1-A",
                                          "customerName": TAG + "小梅", "memberEmail": MEI,
                                          "idempotencyKey": IDEM, "confirmNoMixedBeans": True})
MEI_SID_2 = (b4a or {}).get("sessionId", "")
check("A4 顾客手抖点两次不会开出两张单", (b4a or {}).get("sessionId"), (b4b or {}).get("sessionId"))
st, rows = sel("timer_sessions", f"select=session_id&idempotency_key=eq.{IDEM}")
check("A4 库里也只有一张", 1, len(rows or []))

# ═══ B. 结算：散客与会员，同日与跨夜 ═══════════════════════════════════════
stop(GUEST_SID)
st, out = settle(GUEST_SID, "none", 0)
check("B1 散客单结算成功", 200, st)
g = sess(GUEST_SID)
check("B1 散客单按原价收，金额 13.99", "13.99", g.get("actual_amount_gbp"))
check("B1 散客单不产生任何人的到店次数", None, g.get("reward_eligible"))

stop(MEI_SID_1)
check("B2 小梅今天第一单结算成功（第 1 次，还没落档）", 200, settle(MEI_SID_1, "none", 0)[0])
add_day(D)
assert_book("B2", "B2 小梅今天来了一次")
check("B2 这一单计入奖励进度", True, sess(MEI_SID_1).get("reward_eligible"))
check("B2 这一单原价", "13.99", sess(MEI_SID_1).get("actual_amount_gbp"))

stop(MEI_SID_2)
check("B3 同一天第二单结算成功（原价）", 200, settle(MEI_SID_2, "none", 0)[0])
assert_book("B3", "B3 同一天来两次只算一次")

# 跨夜：23:40 开始、次日 00:20 结束 → 算到开始那天
mk(DONG_ID, 0, settled=True, start_iso=f"{day(60)}T22:40:00+00:00",
   stop_iso=f"{day(60)}T23:20:00+00:00")
st, rows = sel("member_visit_days", f"select=visit_date&member_id=eq.{DONG_ID}")
check("B4 23:40 开始、00:20 结束的单算在开始那天", [day(60)], [r["visit_date"] for r in (rows or [])])

# 伦敦时间凌晨 00:30 开始的单（UTC 还停在前一天）→ 算在伦敦的那天
sid_night = "WALK-NIGHT"
req("POST", "/rest/v1/timer_sessions", [{
    "session_id": sid_night, "customer_name": TAG + "小冬", "member_id": DONG_ID,
    "status": "completed", "started_at": f"{day(63)}T23:30:00+00:00",
    "stopped_at": f"{day(63)}T23:59:00+00:00", "billing_minutes": 60, "elapsed_minutes": 60,
    "amount_gbp": 13.99, "is_settled": True, "settled_at": NOW.isoformat(), "settled_by": "演练店员",
    "actual_amount_gbp": 13.99, "discount_amount_gbp": 0, "reward_eligible": True,
    "created_via": "self_service", "created_by": "walk_test"}], prefer="return=representation")
st, rows = sel("member_visit_days", f"select=visit_date&member_id=eq.{DONG_ID}&order=visit_date")
check("B5 按伦敦日期归档，不是按 UTC", sorted([day(62), day(60)]),
      [r["visit_date"] for r in (rows or [])])

# ═══ C. 达标自动打折：3 / 5 / 7 / 10 次，满 10 循环 ═════════════════════════
# 小梅第 2 次到店（还不落档）
sid = mk(MEI_ID, 20, settled=False)
check("C1 第 2 次到店结算成功（原价）", 200, settle(sid, "none", 0)[0])
add_day(day(20)); assert_book("C1", "C1 小梅第 2 次到店")
check("C1 第 2 次还没落档，原价", "13.99", sess(sid).get("actual_amount_gbp"))

# 第 3 次到店：这一单自动 9 折
sid = mk(MEI_ID, 19, settled=False)
st, out = settle(sid, "member_reward", 140, member=MEI_ID, reward="P10_OFF")
check("C2 第 3 次到店自动 9 折结算成功", 200, st)
check("C2 金额 13.99 → 12.59", "12.59", sess(sid).get("actual_amount_gbp"))
check("C2 折扣来源快照 = member", "member", sess(sid).get("discount_source_snapshot"))
add_day(day(19)); assert_book("C2", "C2 小梅第 3 次到店")

# 同一天第二笔：原价（只打第一笔）
sid_same = mk(MEI_ID, 19, settled=False)
check("C2b 同一天第二笔结算成功（原价）", 200, settle(sid_same, "none", 0)[0])
check("C2b 同一天第二笔不享会员折扣", None, sess(sid_same).get("discount_source_snapshot"))
check("C2b 同一天第二笔金额原价", "13.99", sess(sid_same).get("actual_amount_gbp"))
assert_book("C2b", "C2b 同一天来两次只打第一笔")

# 第 4 次：原价
sid = mk(MEI_ID, 18, settled=False)
check("C3 第 4 次到店原价", 200, settle(sid, "none", 0)[0]); add_day(day(18))

# 第 5 次：自动 8 折
sid = mk(MEI_ID, 17, settled=False)
check("C4 第 5 次到店自动 8 折结算成功", 200, settle(sid, "member_reward", 280, member=MEI_ID, reward="P20_OFF")[0])
check("C4 金额 13.99 → 11.19", "11.19", sess(sid).get("actual_amount_gbp"))
add_day(day(17)); assert_book("C4", "C4 小梅第 5 次到店")

# 第 6 次：原价
sid = mk(MEI_ID, 16, settled=False)
settle(sid, "none", 0); add_day(day(16))

# 第 7 次：自动 7 折
sid = mk(MEI_ID, 15, settled=False)
check("C5 第 7 次到店自动 7 折结算成功", 200, settle(sid, "member_reward", 420, member=MEI_ID, reward="P30_OFF")[0])
check("C5 金额 13.99 → 9.79", "9.79", sess(sid).get("actual_amount_gbp"))
add_day(day(15)); assert_book("C5", "C5 小梅第 7 次到店")

# 第 8、9 次：原价
for n in (14, 13):
    sid = mk(MEI_ID, n, settled=False); settle(sid, "none", 0); add_day(day(n))

# 第 10 次：自动 5 折
sid = mk(MEI_ID, 12, settled=False)
check("C6 第 10 次到店自动 5 折结算成功", 200, settle(sid, "member_reward", 700, member=MEI_ID, reward="P50_OFF")[0])
check("C6 金额 13.99 → 6.99", "6.99", sess(sid).get("actual_amount_gbp"))
add_day(day(12)); assert_book("C6", "C6 小梅第 10 次到店")

# 第 11、12 次：原价（新的一轮）
for n in (11, 10):
    sid = mk(MEI_ID, n, settled=False); settle(sid, "none", 0); add_day(day(n))

# 第 13 次：第二轮第 3 次，又自动 9 折
sid = mk(MEI_ID, 9, settled=False)
check("C7 第 13 次到店（第二轮第 3 次）自动 9 折", 200, settle(sid, "member_reward", 140, member=MEI_ID, reward="P10_OFF")[0])
check("C7 金额 13.99 → 12.59", "12.59", sess(sid).get("actual_amount_gbp"))
add_day(day(9)); assert_book("C7", "C7 小梅第 13 次到店")

# 第 14 次：原价
sid = mk(MEI_ID, 8, settled=False); settle(sid, "none", 0); add_day(day(8))

# 第 15 次：达到档位 → 先输券码被拒，再按会员 8 折结算
sid = mk(MEI_ID, 7, settled=False)
st, out = settle(sid, "coupon", 280, coupon="TD000000")
check("C8 达到档位时券码被拒", "MEMBER_DISCOUNT_CONFLICTS_WITH_COUPON", err((st, out)))
st, out = settle(sid, "member_reward", 280, member=MEI_ID, reward="P20_OFF")
check("C8 第 15 次到店自动 8 折", 200, st)
check("C8 金额 13.99 → 11.19", "11.19", sess(sid).get("actual_amount_gbp"))
add_day(day(7)); assert_book("C8", "C8 小梅第 15 次到店")

# 会员折扣不能用在朋友那桌的单上
sid_qiang = mk(QIANG_ID, 25, settled=False)
st, out = settle(sid_qiang, "member_reward", 280, member=MEI_ID, reward="P20_OFF")
check("C9 会员折扣不能用在朋友那桌的单上", "MEMBER_SESSION_MISMATCH", err((st, out)))

# ═══ D. 补挂：顾客开始计时时忘了输邮箱 ═════════════════════════════════════
sid_forget = mk(None, 6, settled=False)
st, out = rpc("link_timer_session_to_member", p_session_id=sid_forget, p_member_id=MEI_ID)
check("D1 未结算的散客单可以当场补挂到会员", 200, st)
check("D1 挂上后还没结算时，进度资格留空等结算", None, sess(sid_forget).get("reward_eligible"))
st, out = settle(sid_forget, "none", 0)
check("D1 补挂后结算成功（第 16 次，原价）", 200, st)
add_day(day(6)); assert_book("D1", "D1 小梅第 16 次到店")

sid_past = mk(None, 30, settled=True)
st, out = rpc("link_timer_session_to_member", p_session_id=sid_past, p_member_id=MEI_ID)
check("D2 已经结算的散客单事后也能补挂", 200, st)
check("D2 补挂只加累计到店，不加奖励进度", False, sess(sid_past).get("reward_eligible"))
check("D2 补挂不动已收的金额", "13.99", sess(sid_past).get("actual_amount_gbp"))
add_day(day(30), "life"); assert_book("D2", "D2 补挂后累计 17 次 / 进度 16 次")
st, out = rpc("link_timer_session_to_member", p_session_id=sid_past, p_member_id=QIANG_ID)
check("D2 已经归属小梅的单不能再改挂给阿强", "SESSION_ALREADY_LINKED", err((st, out)))

# ═══ E. 顾客自己的手机上看到什么（走真实接口）══════════════════════════════
st, raw = api("/api/member/dashboard", {"email": MEI})
check("E1 会员页能打开", 200, st)
d = (raw or {}).get("dashboard") or {}
check("E1 会员页显示的累计到店 = 17", 17, d.get("lifetime_visits"))
check("E1 会员页显示的奖励进度 = 16", 16, d.get("reward_progress"))
check("E1 最近到店按日期倒序、最新一条是今天", str(D), (d.get("visit_history") or [{}])[0].get("visit_date"))

# 到店记录里，落档的那几单标着「本次享 X 折」
hist = d.get("visit_history") or []
discounted = [v for v in hist if v.get("used_reward")]
check("E1 到店记录里标注了 6 单享会员折扣（3/5/7/10/13/15 次）", 6, len(discounted))
got_types = sorted(set(v.get("used_reward") for v in discounted))
check("E1 享折扣的类型覆盖 9/8/7/5 四档", sorted(["P10_OFF", "P20_OFF", "P30_OFF", "P50_OFF"]), got_types)

st, raw = api("/api/member/dashboard", {"email": MEI, "visitLimit": 100})
d = (raw or {}).get("dashboard") or {}
st, settled_rows = sel("timer_sessions",
                       f"select=session_id&member_id=eq.{MEI_ID}&is_settled=is.true")
check("E1 「最近到店」列表条数 = 库里的会员单数（按次，不按天）",
      len(settled_rows or []), len(d.get("visit_history") or []))
note("E1 口径差别（已知，非缺陷要确认）",
     f"同一天两次：列表 {len(d.get('visit_history') or [])} 条（按次），"
     f"顶部「累计到店」{d.get('lifetime_visits')} 次（按天去重）")

st, out = api("/api/member/lookup", {"email": "nobody.here@tangdouren.test"})
check("E2 没注册过的邮箱登录 → 提示还不是会员", 404, st)
st, out = api("/api/member/lookup", {"email": MEI})
check("E2 小梅的邮箱登录 → 认得出来", 200, st)

req("PATCH", f"/rest/v1/members?member_id=eq.{MEI_ID}", {"is_active": False})
st, out = api("/api/member/lookup", {"email": MEI})
check("E3 退会之后不能再用邮箱登录", 403, st)
st, out = api("/api/member/dashboard", {"email": MEI})
note("E3 退会后会员页接口", f"HTTP {st}（{str(out)[:60]}）—— 与登录接口不一致，记录下来")
req("PATCH", f"/rest/v1/members?member_id=eq.{MEI_ID}", {"is_active": True})

# ── 汇总 ────────────────────────────────────────────────────────────────────
print()
print("-" * 100)
print(f"{'结果':<6}{'场景':<58}{'期望':<26}实际")
print("-" * 100)
for scene, exp, act, ok in STEPS:
    flag = "（记录）" if ok is None else ("通过" if ok else "不通过")
    print(f"{flag:<6}{scene:<58}{exp[:24]:<26}{act[:30]}")
print("-" * 100)
passed = sum(1 for s in STEPS if s[3])
failed = [s for s in STEPS if s[3] is False]
print(f"通过 {passed}/{sum(1 for s in STEPS if s[3] is not None)}")
if failed:
    print("\n没过的场景：")
    for scene, exp, act, _ in failed:
        print(f"  - {scene}：期望 {exp}，实际 {act}")

# ── 收尾：把演练数据清掉，不给后面的人留麻烦 ───────────────────────────────
if KEEP:
    print("\nKEEP=1：演练数据留在库里（小梅 member_id =", MEI_ID, "）")
else:
    wipe_all()
    print("\n演练数据已清理，测试库里不留痕迹。")
