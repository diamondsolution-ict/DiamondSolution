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
| 🟡 | Leaderboard | Works, old look |
| 🟡 | Revision center (activity log) | Works, old look |
| 🟡 | Profile (User tab) | Works, old look |
| 🟡 | Affiliate | Works, old look |
| 🟡 | Payment history | Works, old look |
| 🟡 | Chats tab | Works, old look |
| 🟡 | Notifications | A page, not the website's dropdown |
| ⬜ | Account settings (change password etc.) | Website has `/account`; not in the app yet |
| ⬜ | Onboarding tour | Website shows it on first dashboard visit |

## Behaviour
| | Item |
|---|---|
| ✅ | Sign in / register / one-device login / 24h device lock + ₦1000 unlock / reactivation |
| ✅ | Device identified by Android ID (survives reinstall) |
| ✅ | Paystack checkout (departments, device unlock, reactivation) via `init-payment` |
| ✅ | Yearly department access: expiry shown, expired grants no longer count as access (follows main's `accessDuration.ts`) |
| ✅ | Study sessions record attempts, resume, jump-to-question, outline sections |
| ✅ | Fixed: lists were sorted backwards (Dart `order()` defaults to descending) |
| ⬜ | Real-device test of everything above (payments, device lock, study, leaderboard) |
| ⬜ | Admin / moderator back office (stays on the website) |

## Release
| | Item |
|---|---|
| ✅ | GitHub Actions builds a test APK (`Mobile (Flutter)` workflow) |
| ⬜ | Merge to `main` (open a pull request) |
| ⬜ | Release signing key + Play Store listing + final icon artwork |
| ⬜ | Optional: Play Integrity (stronger device checks) — only once the app is on Google Play |

## Suggested order
1. Leaderboard, Revision center, Profile + Account settings
2. Affiliate, Payment history, Chats, Notifications
3. Real-device test round + fixes
4. Pull request / release
