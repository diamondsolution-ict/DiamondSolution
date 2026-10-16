# Mobile app — progress tracker

Legend: ✅ done and matches the website · 🟡 works, but still has the old look (restyle to match the website) · ⬜ not started

"Checked" below means rendered and clicked through in a browser build against a fake backend.
Nothing here has been run on a real Android phone against the live Supabase project yet.

## Look & feel (website parity)
| | Item | Notes |
|---|---|---|
| ✅ | Company logo + app icon | Transparent logo; icon = logo on white |
| ✅ | Theme (colours, fonts, cards, buttons, badges, mesh background) | Fonts bundled in `google_fonts/` |
| ✅ | Splash, Sign in, Register, Forgot password (EN/FR) | Checked |
| ✅ | Header + floating bottom bar (Home / Departments / Chats / User) | Checked |
| ✅ | Dashboard | Hero, search, stats, quote, resume, analytics chart, departments, quick actions, referral, top ranker, channels. Checked |
| ✅ | Departments tab | Checked |
| ✅ | Department page (paywall, level filter, courses) | Checked (paywall view not yet screenshotted) |
| ✅ | Course detail | Checked |
| ✅ | Questions / study screen | Timer, score, MCQ + application, explanation, section-complete, results, re-sync. Checked |
| ✅ | Device-lock + reactivation screens | Styled like the website; flow needs a real-device test |
| ✅ | Leaderboard | Podium, department chips, formula line. Checked |
| ✅ | Revision center (activity log) | Filters, expandable attempts, load more. Checked |
| ✅ | Profile (User tab) | Checked |
| ✅ | Affiliate | Balance card, payout methods (bank lookup), referral link, stats, commission / redistribution / network lists, withdraw + add + remove dialogs. Checked |
| ✅ | Payment history | Status filters, search, detail dialog with live Paystack recheck. Checked |
| ✅ | Chats tab | Bubbles, SUPPORT label, 'x minutes ago', live replies, retry state. Checked (live delivery needs a real backend) |
| ✅ | Notifications | Bell with gold unread badge + dropdown panel, mark one / all read. Checked |
| ✅ | Account settings | Identity, language, payout link, password change with emailed code. Layout checked; password/code flow needs a real-device test |
| ✅ | Onboarding tour | Five auto-advancing cards; shown once per account on this phone (website: once per browser session). Checked |

## Behaviour
| | Item |
|---|---|
| ✅ | Sign in / register / one-device login / 24h device lock + ₦1000 unlock / reactivation |
| ✅ | Device identified by Android ID (survives reinstall) |
| ✅ | Paystack checkout (departments, device unlock, reactivation) via `init-payment` |
| ✅ | Yearly department access: expiry shown, expired grants no longer count as access (follows main's `accessDuration.ts`) |
| ✅ | Study sessions record attempts, resume, jump-to-question, outline sections |
| ✅ | Fixed: affiliate commission % was shown as 0.25% instead of 25% |
| ✅ | Fixed: lists were sorted backwards (Dart `order()` defaults to descending) |
| ⬜ | Real-device test of everything above (payments, device lock, study, leaderboard) |
| ✅ | Staff entry: Admin/Moderator tab in the bottom bar (staff only), white drawer like the web sidebar |
| ✅ | Moderator tools: Dashboard, Analytics, WhatsApp Numbers, Notifications, Quotes, Support (live chat + device unlock) |
| ⬜ | Moderator tools still to build: Payments, Affiliates |
| ⬜ | Admin-only tools: Users, Withdrawals, Departments/Courses, Media, System Logs, Settings, Questions editor (last) + admin key / step-up |

## Release
| | Item |
|---|---|
| ✅ | GitHub Actions builds a test APK (`Mobile (Flutter)` workflow) |
| ✅ | Batches 1 and 2 merged to `main` (PR #1, PR #2) |
| ⬜ | Release signing key + Play Store listing + final icon artwork |
| ⬜ | Optional: Play Integrity (stronger device checks) — only once the app is on Google Play |

## Suggested order
1. Real-device test round + fixes (everything now has the website's look)
2. Release (signing key, Play Store listing)
