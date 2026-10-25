#!/usr/bin/env python3
"""Single source of truth for the in-app/website "About & Guide" text.
Edit GUIDE below, then run:  python3 scripts/gen-guide.py
It rewrites src/lib/guideContent.ts (website) and mobile/lib/core/guide_content.dart (Android app)."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

GUIDE = {
  "about": {
    "title": "About Diamond Solution",
    "tagline": "Committed to raising first-class professionals.",
    "body": [
      "Diamond Solution is a study platform for university students. You pick your department, practise exam-style questions course by course, and the platform tracks your accuracy, study time and progress so you always know where to focus.",
      "It works the same on the website and in the Android app — same account, same data. Start a session on your phone and carry on from the laptop; your progress follows you.",
    ],
  },
  "audiences": [
    {
      "id": "student",
      "title": "Students",
      "intro": "Everything you need to study well, track your progress and get the most out of your account.",
      "sections": [
        {"title": "Getting started", "items": [
          ["Create your account", "Register with your name, email, phone/WhatsApp number, university and department. A referral code from an existing partner is required to register. Your username and password are yours alone — don't share them."],
          ["English or French", "Choose your language when you sign in or register; you can change it later in Account settings."],
          ["First-visit tour", "The first time you open the dashboard a short tour points out the main areas. You can skip it and it won't return."],
          ["One device at a time", "Your account is allowed on one signed-in device at a time. Signing in on a second device signs the first one out. Signing in on a third different device locks the account for 24 hours; you can unlock it straight away for ₦1,000 from the lock screen, or wait out the 24 hours. If you really need a new phone, sign in on it — don't keep switching between many devices."],
        ]},
        {"title": "Your dashboard", "items": [
          ["Greeting and stats", "The top card shows your points, overall accuracy and total questions attempted. Points are 2 per question attempted plus 0.5 per correct answer, so steady practice beats occasional marathons."],
          ["Wisdom of the day", "A short motivational quote that rotates from the ones the team publishes."],
          ["Study analytics", "A 7-day chart of time spent and questions practised, with tiles for time spent, attempted, correct answers and average score. Tap a day to see its questions and score. Open the full activity log from here."],
          ["Resume where you stopped", "The resume card takes you straight back to the course and question you were on."],
          ["Search", "Use the search bar to find a course, topic or exam quickly."],
          ["Departments", "Your department and others appear below the stats. Open one to see its courses."],
        ]},
        {"title": "Departments, courses and access", "items": [
          ["Yearly access", "Each department is unlocked with a yearly fee, paid securely through Paystack (card, bank, transfer). Access lasts one year from payment — renew before it ends and the new year is added on top of the time you have left."],
          ["Paying", "Open a department, tap the payment button and finish on the Paystack page. Access unlocks automatically; if it ever doesn't, open Payments (in your profile) or message Support with your payment reference."],
          ["Pay in 3 instalments", "Don't want to pay the full fee at once? Choose 'Pay in 3 instalments': pay one third now and the whole department unlocks immediately. The 2nd third is due within 30 days and the 3rd within 30 days after that. The price is never higher — it's just split into three equal parts. Miss a due date and access locks until you pay that instalment; pay it late and access comes back straight away, with no penalty. Your Payment History shows which instalment each payment was."],
          ["Free access", "Occasionally the team may give you free access to a department. It shows as normal access with no payment attached. If it is ever removed you can pay to unlock the department as usual."],
          ["Levels and courses", "Inside a department, pick a level (for example 200L) to see its courses. Each course shows its questions, an outline of sections, and your progress."],
          ["Course outline", "Courses can be split into named sections. When you finish a section you get a checkpoint before moving on."],
        ]},
        {"title": "Studying questions", "items": [
          ["Objective questions", "Multiple choice with a 60-second timer per question. Pick an answer and submit — you see straight away whether you were right, plus the explanation when there is one. If time runs out an unanswered question counts as skipped."],
          ["Application questions", "Written-style questions with a 2-minute timer. Think through your answer, submit, then compare with the expected answer shown."],
          ["Read the explanations", "That's where the learning happens. The time you spend reading explanations is counted in your study time, so your dashboard reflects the real time you put in."],
          ["Jump and resume", "Jump to any question number, go back to review earlier questions, and pick up exactly where you stopped next time. You can restart a course's progress from the start if you want a fresh run."],
          ["Stay on the page", "Study time is counted while you are on the questions-and-answers page."],
        ]},
        {"title": "Revision, ranking and support", "items": [
          ["Revision Center", "Your activity log: every question you attempted with the result, so you can revisit what you got wrong. Questions are shown in full."],
          ["Leaderboard", "Ranks students by points. Climb it by attempting more questions and answering them correctly."],
          ["Chat with Support", "Message the team from the Chats tab. Replies arrive in the same thread, and the bell tells you when there's a new one. Include payment references or screenshots to get help faster."],
          ["Notifications", "The bell shows payment confirmations, commissions, broadcasts from the team and other alerts. Unread ones are marked."],
        ]},
        {"title": "Earn with the affiliate programme", "items": [
          ["Your referral code", "Open Affiliate to get your personal code and link. When someone registers with your code and pays for a department you earn a commission — the rate (25% by default) and the minimum withdrawal are shown on that page."],
          ["Balances and withdrawals", "Your earnings, what you've withdrawn and your balance are listed there. Add a payout method (a Nigerian bank account) and request a withdrawal once you reach the minimum. Requests are reviewed and paid by the team; you can follow their status."],
        ]},
        {"title": "Your account", "items": [
          ["Profile", "See your details and quick links to Activity Log, Payment History, Account and Affiliate."],
          ["Payment history", "Every payment with its status, the department and when your access ends."],
          ["Change password", "In Account settings. A code is emailed to you to confirm the change, so keep access to your email."],
          ["If your account is suspended", "You'll see a reactivation screen explaining why. Follow it (a reactivation fee may apply) or contact Support."],
        ]},
      ],
      "tips": [
        "Study a little every day — streaks and steady accuracy matter more than long gaps.",
        "Always read the explanation, even for questions you got right.",
        "Use the Revision Center to redo what you missed before an exam.",
        "Renew your department a few days early so you never lose a day of access.",
        "Keep your account to one device and never share your login.",
        "Message Support early with your payment reference if something looks wrong.",
      ],
    },
    {
      "id": "moderator",
      "title": "Moderators",
      "intro": "Moderators look after students day to day. You get the Moderator area (website: the Moderator link in the menu; app: the Moderator tab) in addition to everything students have. You also read every department for free.",
      "sections": [
        {"title": "What you can use", "items": [
          ["Dashboard", "Totals for students, suspensions, revenue, payouts, active affiliates and pending payouts, plus the latest payments and a revenue breakdown by department."],
          ["Analytics", "Revenue and affiliate-payout charts for the year, suspension rate and average enrolment value, visits over time and peak hours, and the most active scholars for the last 7, 30 or 90 days."],
          ["WhatsApp Numbers", "The contact numbers students registered, searchable, with one-tap copy and a WhatsApp chat shortcut. Use Copy All or CSV export for announcements."],
          ["Affiliates", "The Matrix lists every commission earned; the Partner Registry shows each partner's referral code, total earned, total paid and balance. Both can be exported."],
          ["Payments", "The full transaction ledger with search and status filters. Open a payment to see the payer, amount, gateway details and their other payments and withdrawals. A payment for 'Instalment 1, 2 or 3 of 3' means the student chose to pay a department in three parts; access locks automatically if a due date is missed and returns the moment they pay it."],
          ["Notifications", "Send a broadcast to every student, and review or remove past broadcasts."],
          ["Quotes", "Publish the quotes that rotate on the student dashboard, and delete old ones."],
          ["Support", "The live chat inbox. Reply to students, see unread counts, and unlock a student who is locked out for using too many devices."],
        ]},
        {"title": "Everyday tasks", "items": [
          ["A student says they paid but has no access", "Payments → Recheck a transaction: paste the Paystack reference (or open the payment and tap Recheck on Paystack). If Paystack confirms it, the payment is recorded and access is granted immediately. If it already worked nothing changes."],
          ["A student is locked out", "Open their thread in Support and press Device-locked — Unlock. They can sign in again without paying the ₦1,000."],
          ["Announcing something", "Notifications → write a title and message → Broadcast. It reaches every registered user immediately and can't be targeted or scheduled, so double-check the wording."],
          ["Reaching students", "WhatsApp Numbers → search by name, department or university, then copy numbers or open a chat."],
        ]},
        {"title": "Good practice", "items": [
          ["Reply quickly and kindly", "Support is the face of the platform; students are often stressed before exams."],
          ["Protect privacy", "Contact numbers, emails and payment details are for helping students only. Never share them elsewhere."],
          ["Escalate", "Anything that needs a role change, suspension, deletion, refund-style action or content change goes to an admin — those tools are admin-only."],
          ["Mind broadcasts", "They go to everyone at once. Keep them short and accurate."],
        ]},
      ],
      "tips": [
        "Start each day in Support, then check Payments for failed or pending items.",
        "Use Analytics to spot slow days and plan broadcasts around peak hours.",
        "Always recheck on Paystack before telling a student their payment didn't go through.",
      ],
    },
    {
      "id": "admin",
      "title": "Admins",
      "intro": "Admins run the whole platform. You have everything moderators have, plus the sections below. The Admin area asks for your personal security code each time you open it, and again before sensitive actions.",
      "sections": [
        {"title": "Your security code", "items": [
          ["Setting it up", "The first time you open the Admin area you choose a personal code of 4–10 digits. Only you know it; nobody else's code changes when you change yours."],
          ["When it's asked", "On entering the Admin area, and in a 'Security Clearance Required' prompt before destructive actions such as suspending or deleting users or changing roles."],
          ["Changing it", "Settings → Your admin security code. Keep it private and different from your password."],
        ]},
        {"title": "People and money", "items": [
          ["Users", "Search every account. Change a role (student, moderator, admin), approve a person as an affiliate partner, suspend or restore an account (with a reason shown to them), add a user, export the directory, or delete an account. You can't act on your own account. Each user card also has a Free Access section: grant any student free access to a department with no payment, or remove it again with the × on its chip (admins only). Granting never overwrites access a student really paid for, and removing refuses if they have since paid."],
          ["Withdrawals", "Review affiliate payout requests. Pay eligible Nigerian bank-transfer requests automatically through Paystack, mark one as paid manually with an external reference, reject it with a reason, or recheck a transfer's status with Paystack. A banner tells you when automatic payouts are switched off."],
          ["Payments and recheck", "Same ledger as moderators; use Recheck on Paystack to settle any dispute with the gateway's own record."],
        ]},
        {"title": "Content", "items": [
          ["Departments", "Create departments, set the yearly price in naira (and optionally dollars) and the access duration (365 = one year), edit their picture and status, manage their levels, or delete one. Changing a price creates a new price record — past prices stay on file and students who already paid keep their terms. Archive a department instead of deleting it if it has students or courses."],
          ["Courses", "From a department's 'Edit archives': add courses, choose their level and question type, write a description, and publish, draft or archive them."],
          ["Questions", "Pick a department and course to manage its questions: add or edit objective (options A–D, one correct) and application questions with explanations, search, archive and restore, or permanently delete. Bulk-archive a whole course, edit course details and picture, and build the course outline (named sections by question number). Import and export questions as CSV — download the template first."],
          ["Pictures & Media", "Upload or replace the picture shown on every department and course card (JPG, PNG or WebP, up to 5 MB)."],
        ]},
        {"title": "Platform settings and records", "items": [
          ["Settings", "Contact links shown across the platform (Telegram, WhatsApp, email, X, Facebook, Instagram), the affiliate commission rate, the minimum withdrawal, and whether automatic payouts are on. When they are off every withdrawal must be marked paid manually."],
          ["System Logs", "A record of admin actions: who did what, to which record, and why. Check it if something changed and you don't know who did it."],
          ["Danger warnings", "Deleting or archiving a department, level, course, question or user shows a red warning first. Read it — deletions can't be undone."],
        ]},
        {"title": "Running the platform well", "items": [
          ["Pricing changes", "Edit the department price; it applies to new payments only. Tell students before a price change takes effect."],
          ["Before deleting", "Prefer archive. Departments with courses, payment history or students can't be deleted anyway."],
          ["Moderator team", "Promote trusted people to moderator rather than admin — they can help without touching money settings or content."],
          ["Backups of content", "Export each course's questions as CSV from time to time."],
        ]},
      ],
      "tips": [
        "Review System Logs weekly.",
        "Keep automatic payouts on only while someone is available to monitor Paystack.",
        "Never share your security code; change it if you suspect anyone has seen it.",
        "Use archive instead of delete whenever you're unsure.",
      ],
    },
  ],
  "platforms": {
    "title": "Website and mobile app",
    "items": [
      ["Same account everywhere", "Sign in with the same email and password on the website and in the Android app. Everything — progress, payments, chats, access — is shared."],
      ["What each is best for", "The app is great for quick practice on the go, with notifications inside the app. The website is better for long admin work such as editing many questions, and for printing or exporting."],
      ["Installing the app", "Download the Android APK from the team's link (or Google Play when it is listed) and allow installs from that source once. Update by installing the newer version over the old one."],
      ["Exports on the phone", "CSV exports open your phone's share sheet so you can save to Drive/Files or send them on WhatsApp."],
      ["Need help?", "Open Chats and message Support from either platform."],
    ],
  },
}

def ts():
    return ("// GENERATED by scripts/gen-guide.py — edit the script, not this file.\n"
            "export interface GuideItem { heading: string; body: string }\n"
            "export interface GuideSection { title: string; items: GuideItem[] }\n"
            "export interface GuideAudience { id: \"student\" | \"moderator\" | \"admin\"; title: string; intro: string; sections: GuideSection[]; tips: string[] }\n"
            "export const GUIDE_ABOUT = " + json.dumps(GUIDE["about"], ensure_ascii=False, indent=2) + " as const;\n"
            "export const GUIDE_PLATFORMS: { title: string; items: GuideItem[] } = " +
            json.dumps({"title": GUIDE["platforms"]["title"], "items": [{"heading": h, "body": b} for h, b in GUIDE["platforms"]["items"]]}, ensure_ascii=False, indent=2) + ";\n"
            "export const GUIDE_AUDIENCES: GuideAudience[] = " +
            json.dumps([{**a, "sections": [{"title": s["title"], "items": [{"heading": h, "body": b} for h, b in s["items"]]} for s in a["sections"]]} for a in GUIDE["audiences"]], ensure_ascii=False, indent=2) + ";\n")

def dq(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("$", "\\$") + "'"

def dart():
    out = ["// GENERATED by scripts/gen-guide.py — edit the script, not this file.\n",
           "class GuideItem {\n  const GuideItem(this.heading, this.body);\n  final String heading;\n  final String body;\n}\n",
           "class GuideSection {\n  const GuideSection(this.title, this.items);\n  final String title;\n  final List<GuideItem> items;\n}\n",
           "class GuideAudience {\n  const GuideAudience(this.id, this.title, this.intro, this.sections, this.tips);\n  final String id;\n  final String title;\n  final String intro;\n  final List<GuideSection> sections;\n  final List<String> tips;\n}\n"]
    a = GUIDE["about"]
    out.append(f"const guideAboutTitle = {dq(a['title'])};\nconst guideAboutTagline = {dq(a['tagline'])};\nconst guideAboutBody = <String>[{', '.join(dq(x) for x in a['body'])}];\n")
    p = GUIDE["platforms"]
    out.append(f"const guidePlatformsTitle = {dq(p['title'])};\nconst guidePlatforms = <GuideItem>[\n" + "".join(f"  GuideItem({dq(h)}, {dq(b)}),\n" for h, b in p["items"]) + "];\n")
    out.append("const guideAudiences = <GuideAudience>[\n")
    for au in GUIDE["audiences"]:
        out.append(f"  GuideAudience({dq(au['id'])}, {dq(au['title'])}, {dq(au['intro'])}, [\n")
        for s in au["sections"]:
            out.append(f"    GuideSection({dq(s['title'])}, [\n" + "".join(f"      GuideItem({dq(h)}, {dq(b)}),\n" for h, b in s["items"]) + "    ]),\n")
        out.append("  ], [\n" + "".join(f"    {dq(t)},\n" for t in au["tips"]) + "  ]),\n")
    out.append("];\n")
    return "".join(out)

(ROOT / "src/lib/guideContent.ts").write_text(ts())
(ROOT / "mobile/lib/core/guide_content.dart").write_text(dart())
print("ok")
