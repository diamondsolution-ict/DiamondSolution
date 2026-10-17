import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

// Mirrors src/pages/About.tsx — same content, same three role tabs (Students / Moderators /
// Admins), same accordion-of-sections layout. Keep this hand-ported copy in sync with the
// website's when a real feature changes; there's no shared content file between the two apps,
// same as every other screen here.

class _Section {
  const _Section(this.heading, {this.intro, this.bullets});
  final String heading;
  final String? intro;
  final List<String>? bullets;
}

const _studentSections = [
  _Section(
    'What Diamond Solution is',
    intro:
        "An exam-prep platform built around your department (e.g. BMLS, MBBS, Nursing) and level (e.g. 200L, 300L). Each department holds courses, each course holds timed objective and application questions with explanations — built to help you revise fast and track real progress, not just scroll through notes.",
  ),
  _Section(
    'Creating your account',
    bullets: [
      "Every signup needs a referral code — there are no exceptions, even for the very first account on the platform. Ask a friend who's already on the platform for theirs, or use a code an affiliate shared with you.",
      "You'll set a username, full name, and password. Your WhatsApp/phone number and university are optional but help Support reach you.",
      "Only one browser/device is treated as \"active\" per account at a time — see \"One device at a time\" below before you share your login.",
    ],
  ),
  _Section(
    'Finding your department and courses',
    bullets: [
      "From Departments, pick your department, then a level (200L, 300L, …) to see that level's courses.",
      "Each course shows how many questions it has and whether you already have access.",
      "Opening a course you haven't paid for shows a \"Restricted\" screen with the price — tap Authorize payment to pay via Paystack.",
    ],
  ),
  _Section(
    'Paying for access',
    bullets: [
      "You pay once per department, not per course — it unlocks every course, in every level, inside that department.",
      "Access currently runs for one year from the date you pay, shown on the course page and in Payment History. It is not lifetime access (that policy ended — see your receipt for the exact expiry date).",
      "Payments are processed by Paystack in NGN. If your profile currency is set to USD, you'll still be charged in NGN — that's just a display preference.",
    ],
  ),
  _Section(
    'Studying a course',
    bullets: [
      "Objective (multiple-choice) questions give you 60 seconds; Application questions give you 120 seconds. Running out of time auto-submits what you've picked (or marks it skipped if you picked nothing).",
      "After you submit, the correct answer (or expected response for an Application question) and the explanation appear right there — read them before tapping Next.",
      "Use Jump to Qn to skip straight to a specific question number, or Resume session to continue exactly where you left off.",
      "Courses are broken into sections (an outline, e.g. \"Chapter 3: Q21–40\") — finishing one shows your score for that section before you continue.",
      "Previous lets you step back and review an already-answered question without losing your place; it never lets you re-answer it differently.",
    ],
  ),
  _Section(
    'Tracking your progress',
    bullets: [
      "Dashboard shows your streak, correct-answer count, average score, and a 7-day chart of daily time spent and questions attempted (tap any bar to see that day's breakdown).",
      "Revision Center (Activity Log) lists every question you've ever attempted, with your answer, the correct one, and the explanation — the real way to revise your weak spots.",
      "Leaderboard ranks students by practice volume so you can see how you compare.",
    ],
  ),
  _Section(
    'Earning through the Affiliate program',
    bullets: [
      "Your account has its own referral code (shown on the Affiliate page) — share it, and anyone who signs up with it and later pays for department access earns you a commission automatically.",
      "The Affiliate page shows your running balance and full commission history.",
      "Once your balance clears the minimum, request a withdrawal with your bank details — an admin reviews and processes it from their side.",
    ],
  ),
  _Section(
    'Getting help',
    bullets: [
      "Chat connects you directly with the support/admin team inside the app — use it for payment issues, account problems, or a blocked device.",
      "Notifications (the bell icon) shows broadcast announcements from the team plus account alerts (like a reactivation confirmation).",
    ],
  ),
  _Section(
    'Your account settings',
    bullets: [
      "Profile/Account lets you update your display name, username, WhatsApp/phone, university, interface language (English or French), and currency display preference.",
      "Changing your password requires a one-time code sent to confirm it's really you — this protects your account even if someone else gets your session.",
      "Payment History lists every payment you've made with full receipts and each department's current access status.",
    ],
  ),
  _Section(
    'One device at a time',
    bullets: [
      "Your account recognizes the device/app install you sign in from. Signing in on a 2nd device is fine — it also automatically signs you out of the first one.",
      "Signing in on a 3rd distinct device blocks the whole account. The only way back in is paying a small unlock fee, and only after the block has been active for 24 hours — waiting alone doesn't unlock it.",
      "If this happens, you'll land on a dedicated \"Device locked\" screen explaining exactly what to do — or you can reach Support/Chat, and an admin or moderator can unlock you for free.",
      "Reinstalling the app or signing in from a different device counts as a \"new\" device to this check — keep that in mind.",
    ],
  ),
];

const _moderatorSections = [
  _Section(
    'What a moderator is',
    intro:
        "Staff who help run the platform day-to-day without full administrative control. You get free, unconditional access to every department's content (no payment, no device limit — those only apply to students), plus a focused set of admin tools.",
  ),
  _Section(
    'What you can reach',
    bullets: [
      "Dashboard — platform-wide stats: signups, revenue, active students, recent activity.",
      "Analytics — deeper usage numbers across departments and courses.",
      "WhatsApp Numbers — every student's WhatsApp/phone number in one searchable directory, with copy-to-clipboard and CSV export, for reaching students outside the app.",
      "Affiliates — view the affiliate program's referrals and commission activity.",
      "Payments — every payment made on the platform, who made it, and its status.",
      "Notifications — send a broadcast announcement to all students at once.",
      "Quotes — curate the pool of \"quote of the day\" messages shown on the student Dashboard.",
      "Support — the student support inbox: read and reply to student chats, and unlock a student whose account is device-blocked, for free, right from there.",
    ],
  ),
  _Section(
    "What you can't reach",
    bullets: [
      "Users, Departments, Courses, Questions, Media, Withdrawals, System Logs, and Settings are admin-only — the menu hides them for you, and even opening one of those screens directly redirects you back to the dashboard.",
      "In short: you help run the platform and support students, but you don't edit the question bank, change pricing, manage staff roles, or touch site-wide settings. That's deliberate — talk to an admin if one of those needs changing.",
    ],
  ),
  _Section(
    'Supporting students',
    bullets: [
      "Open Support to see every student chat thread. Replying there reaches the student's in-app Chat screen directly.",
      "If a student is locked out after a 3rd device sign-in, you can unlock their account for free from the same screen — no payment needed, this is a staff privilege.",
    ],
  ),
];

const _adminSections = [
  _Section(
    'What an admin is',
    intro:
        "Full control over the platform: everything a moderator can do, plus staff management, the entire content catalog (departments, courses, questions), pricing, payouts, and site settings. Admin accounts also pass through an extra personal-key gate when entering the admin area, on top of the normal login.",
  ),
  _Section(
    'Managing users and staff',
    bullets: [
      "Admin → Users lists every account. You can suspend or unsuspend a student (with a reason), delete an account outright, or change someone's role between student, moderator, and admin.",
      "Sensitive actions here ask you to re-enter a short step-up code first — this exists so a hijacked session alone can't suspend accounts or hand out admin access.",
    ],
  ),
  _Section(
    'Managing departments and levels',
    bullets: [
      "Admin → Departments → Add department creates a new one (name, slug, image). Edit changes its name/status; Status can be set to archived to hide it from students without deleting anything.",
      "Deleting a department only works if it has zero courses, pricing history, and students attached — otherwise you'll be told to archive it instead (Edit Details → Status). This protects real student data from being silently destroyed by a delete tap.",
      "Each department has its own levels (200L, 300L, …), managed from the same screen — add one with a label and order, or delete one (blocked the same way if any course still uses that level).",
      "Pricing lives here too: set the NGN amount and access duration (now defaults to a full year) for each department — every price change is kept as history, so past receipts still show what a student actually paid for.",
    ],
  ),
  _Section(
    'Managing courses',
    bullets: [
      "Admin → Departments → pick a department → Courses. Add course picks a level, a question type (Objective or Application), and an optional description.",
      "Edit lets you change the title, level, question type, description, and Status (draft / published / archived). Only published courses show up for students.",
      "There is no raw \"delete\" for a course that students have already studied — instead, set Status to archived, which hides it immediately while keeping every student's progress and attempt history intact.",
      "A course nobody has ever studied yet (no recorded attempts) can be permanently deleted with the Delete button — this also removes its uploaded image from storage. Once even one student has answered a question in it, Delete is blocked and tells you to archive instead.",
    ],
  ),
  _Section(
    'Managing questions',
    bullets: [
      "Open a course's Manage questions to add, edit, and reorder its questions. Objective questions get multiple-choice options with one marked correct; Application questions get an expected-answer text and an explanation.",
      "Archive (the trash icon on the Active tab) soft-removes a question — hidden from students immediately, fully recoverable from the Archived tab.",
      "From the Archived tab, Restore brings a question back, or Delete permanently removes it for good — that one truly can't be undone, so it's a second, separate tap from Archive on purpose.",
      "Bulk \"Archive all\" clears every active question in a course at once, when you're replacing a whole bank rather than editing it question by question.",
      "Outline sections let you chapter a course (e.g. \"Section 2: Q21–40\") so students see section-complete milestones as they study.",
      "Admin → Questions (the top-level browser) searches across every course's questions at once, useful for finding and fixing a specific question without knowing which course it's in.",
    ],
  ),
  _Section(
    'Media, payouts, and oversight',
    bullets: [
      "Admin → Pictures & Media uploads and manages the images used for department and course cards, stored in Supabase Storage.",
      "Admin → Withdrawals is where affiliate payout requests land — review a student's bank details and balance, then approve or decline the payout.",
      "Admin → System Logs records sensitive staff actions (so far: withdrawal-affecting actions and device unlocks) with who did it and when, for accountability.",
      "Admin → Settings holds the platform's public contact links (Telegram, WhatsApp, support email, Twitter, Facebook, Instagram) shown to students around the app.",
    ],
  ),
  _Section(
    'The golden rule: archive vs. delete',
    intro: "Every content type on this platform follows the same discipline, by design — it's worth internalizing once rather than guessing per screen:",
    bullets: [
      "If real student data is attached to something (a payment, an attempt, a grant), the system will not let you hard-delete it — you'll always get a clear message telling you to archive/deactivate it instead.",
      "Archiving is reversible and hides something from students immediately. Hard-deleting is permanent and is only ever offered once nothing real depends on it anymore.",
      "This is true for departments, levels, courses, and questions alike — if a Delete action ever refuses with an error, that's the system protecting a real student's history, not a bug.",
    ],
  ),
];

// Pushed from the student Profile screen, wrapped in its own PageShell (header + back button).
class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});
  @override
  Widget build(BuildContext context) => const PageShell(title: 'About Diamond Solution', child: AboutBody());
}

// The actual content — also embedded directly (no PageShell/AppBar of its own) as a section
// inside AdminShell, which already provides the header and drawer navigation around it.
class AboutBody extends StatefulWidget {
  const AboutBody({super.key});
  @override
  State<AboutBody> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutBody> {
  String? _role;
  bool _roleDefaulted = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Only sets the initial tab from the viewer's real role, once — a moderator or admin
    // tapping over to read the Students tab shouldn't get snapped back on the next rebuild.
    if (_roleDefaulted) return;
    _roleDefaulted = true;
    final auth = AuthScope.of(context);
    _role = auth.isAdmin ? 'admin' : (auth.isModerator ? 'moderator' : 'student');
  }

  List<_Section> get _sections => switch (_role) {
        'admin' => _adminSections,
        'moderator' => _moderatorSections,
        _ => _studentSections,
      };

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 40),
      children: [
          CardLuxury(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(gradient: diamondGradient, borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.menu_book_outlined, size: 20, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  "Everything the platform does, written for the way you actually use it — on the website or the mobile app, the features work the same way. Pick a tab below for your role.",
                  style: body(13, color: AppColors.text2),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          Row(children: [
            _roleTab('student', 'Students', Icons.school_outlined),
            const SizedBox(width: 8),
            _roleTab('moderator', 'Moderators', Icons.shield_outlined),
            const SizedBox(width: 8),
            _roleTab('admin', 'Admins', Icons.workspace_premium_outlined),
          ]),
        const SizedBox(height: 16),
        for (final s in _sections) _sectionTile(s),
      ],
    );
  }

  Widget _roleTab(String key, String label, IconData icon) {
    final active = _role == key;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => _role = key),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            color: active ? AppColors.royal : AppColors.canvasSoft,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 16, color: active ? Colors.white : AppColors.text2),
            const SizedBox(height: 3),
            Text(label, style: body(12, weight: FontWeight.w700, color: active ? Colors.white : AppColors.text2)),
          ]),
        ),
      ),
    );
  }

  Widget _sectionTile(_Section s) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: CardLuxury(
          padding: EdgeInsets.zero,
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: const EdgeInsets.symmetric(horizontal: 16),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              title: Text(s.heading, style: heading(14)),
              children: [
                if (s.intro != null) Text(s.intro!, style: body(13, color: AppColors.text2, height: 1.4)),
                if (s.intro != null && s.bullets != null) const SizedBox(height: 10),
                if (s.bullets != null)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final b in s.bullets!)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 7),
                                child: Container(width: 4, height: 4, decoration: const BoxDecoration(color: AppColors.royal, shape: BoxShape.circle)),
                              ),
                              const SizedBox(width: 8),
                              Expanded(child: Text(b, style: body(13, color: AppColors.text2, height: 1.4))),
                            ],
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      );
}
