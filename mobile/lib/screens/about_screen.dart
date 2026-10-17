import 'package:flutter/material.dart';
import '../core/guide_content.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

/// "About & Guide": same text as the website (generated from scripts/gen-guide.py).
/// Students see the student guide; moderators also see theirs; admins see all three.
class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});
  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String? active;

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final visible = guideAudiences.where((a) => a.id == 'student' || (a.id == 'moderator' && auth.isStaff) || (a.id == 'admin' && auth.isAdmin)).toList();
    final current = visible.firstWhere((a) => a.id == active, orElse: () => visible.last);
    return PageShell(
      title: 'About & Guide',
      child: ListView(padding: const EdgeInsets.all(20), children: [
        CardLuxury(
          gradient: true,
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(guideAboutTitle, style: heading(20, color: Colors.white)),
            const SizedBox(height: 4),
            Text(guideAboutTagline, style: body(14, weight: FontWeight.w600, color: AppColors.gold)),
            for (final p in guideAboutBody) Padding(padding: const EdgeInsets.only(top: 12), child: Text(p, style: body(14, color: Colors.white.withValues(alpha: 0.85)))),
          ]),
        ),
        if (visible.length > 1) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              for (final a in visible)
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => active = a.id),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: current.id == a.id ? AppColors.royal : Colors.transparent, borderRadius: BorderRadius.circular(8)),
                      child: Text(a.title, style: body(14, weight: FontWeight.w600, color: current.id == a.id ? Colors.white : AppColors.text3)),
                    ),
                  ),
                ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        Text(current.intro, style: body(14, color: AppColors.text2)),
        const SizedBox(height: 16),
        for (var i = 0; i < current.sections.length; i++) _section(current.id, i, current.sections[i]),
        const SizedBox(height: 4),
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [const Icon(Icons.lightbulb_outline, size: 16, color: AppColors.goldDark), const SizedBox(width: 8), Text('Tips to get the most out of it', style: heading(14))]),
            const SizedBox(height: 8),
            for (final t in current.tips) Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('•  ', style: body(14, color: AppColors.text2)), Expanded(child: Text(t, style: body(14, color: AppColors.text2)))])),
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [const Icon(Icons.smartphone, size: 16, color: AppColors.royal), const SizedBox(width: 8), Text(guidePlatformsTitle, style: heading(14))]),
            for (final it in guidePlatforms) _item(it),
          ]),
        ),
        const SizedBox(height: 40),
      ]),
    );
  }

  Widget _item(GuideItem it) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(it.heading, style: body(14, weight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(it.body, style: body(14, color: AppColors.text2)),
        ]),
      );

  Widget _section(String audience, int i, GuideSection s) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Container(
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(24)),
          clipBehavior: Clip.antiAlias,
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              key: PageStorageKey('$audience-${s.title}'),
              initiallyExpanded: i == 0,
              tilePadding: const EdgeInsets.symmetric(horizontal: 20),
              childrenPadding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              title: Text(s.title, style: heading(14)),
              children: [for (final it in s.items) _item(it)],
            ),
          ),
        ),
      );
}
