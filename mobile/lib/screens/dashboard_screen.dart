import 'dart:math' as math;
import 'dart:ui' as ui;
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/logo.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'activity_log_screen.dart';
import 'affiliate_screen.dart';
import 'course_detail_screen.dart';
import 'courses_screen.dart';
import 'leaderboard_screen.dart';

// Mirrors src/pages/Dashboard.tsx section by section: hero + search + stats, quote of the day,
// resume card, study analytics (4 stat cards, chart, day picker), departments, quick actions,
// revenue-program card, top-this-week.

const _fallbackQuotes = [
  ('The secret of getting ahead is getting started. Master your clinical questions one day at a time.', 'Diamond Solution Academy'),
  ('Discipline beats motivation when exam day actually arrives.', 'Diamond Solution Academy'),
  ("Every question you attempt today is a patient you'll serve with more confidence tomorrow.", 'Diamond Solution Academy'),
  ('Consistency compounds — a little practice daily outperforms a single long session.', 'Diamond Solution Academy'),
  ("Review your misses as closely as your wins; that's where the real learning is.", 'Diamond Solution Academy'),
];

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// A raw email is never a presentable greeting: display name → username → title-cased email
// local part → "Scholar".
String _greetingName(Map<String, dynamic>? profile, String? email) {
  final dn = profile?['display_name'] as String?;
  if (dn != null && dn.isNotEmpty) return dn;
  final un = profile?['username'] as String?;
  if (un != null && un.isNotEmpty) return un;
  if (email != null && email.isNotEmpty) {
    final local = email.split('@').first.replaceAll(RegExp(r'[._-]+'), ' ');
    return local.replaceAllMapped(RegExp(r'\b\w'), (m) => m[0]!.toUpperCase());
  }
  return 'Scholar';
}

String _initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts[0].substring(0, math.min(2, parts[0].length)).toUpperCase();
  return (parts.first[0] + parts.last[0]).toUpperCase();
}

double _round1(num v) => (v * 10).round() / 10;
String _fmtNum(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();


/// Two-per-row grid whose cards share a row height (website `grid grid-cols-2 gap-3`).
Widget _pairs(List<Widget> items) => Column(children: [
      for (var i = 0; i < items.length; i += 2) ...[
        if (i > 0) const SizedBox(height: 12),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: items[i]),
            const SizedBox(width: 12),
            Expanded(child: i + 1 < items.length ? items[i + 1] : const SizedBox()),
          ]),
        ),
      ],
    ]);

class _Day {
  _Day(this.date, this.attempted, this.correct, this.seconds);
  final DateTime date;
  final int attempted, correct, seconds;
  int get mins => (seconds / 60).round();
  int get accuracy => attempted > 0 ? (correct / attempted * 100).round() : 0;
  String get label => DateFormat('EEE').format(date).toUpperCase();
  String get full => DateFormat('MMM d, yyyy').format(date);
}

class _Data {
  num points = 0;
  int accuracy = 0, attempted = 0;
  List<_Day> week = [];
  Map<String, dynamic>? resume;
  int resumeTotal = 0;
  List<Map<String, dynamic>> departments = [];
  Set<String> granted = {};
  String? referralCode;
  Map<String, dynamic>? topRanker;
  List<(String, String)> quotes = _fallbackQuotes;
  Map<String, dynamic>? channels;
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, this.onOpenDepartments});
  final VoidCallback? onOpenDepartments;
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<_Data> future;
  final search = TextEditingController();
  final searchFocus = FocusNode();
  Timer? debounce;
  List<Map<String, dynamic>> results = [];
  bool searching = false;
  int? selectedDay;

  @override
  void initState() {
    super.initState();
    future = _load();
    searchFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    debounce?.cancel();
    super.dispose();
  }

  String _ymd(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  Future<_Data> _load() async {
    final auth = AuthScope.of(context);
    final uid = db.auth.currentUser!.id;
    final now = DateTime.now();
    final weekStart = now.subtract(Duration(days: now.weekday - 1));
    final weekEnd = weekStart.add(const Duration(days: 6));
    final d = _Data();

    final r = await Future.wait<dynamic>([
      db.from('daily_practice_stats').select('practice_date, attempted, correct, study_duration_seconds').eq('user_id', uid),
      db.from('study_progress').select('course_id, current_order, updated_at, completed, courses(title, department_levels(label))').eq('user_id', uid).eq('completed', false).order('updated_at', ascending: false).limit(1),
      db.from('departments').select('id, name, image_path').eq('status', 'active').order('name', ascending: true),
      db.from('access_grants').select('department_id').eq('user_id', uid),
      db.from('affiliate_profiles').select('referral_code').eq('user_id', uid).maybeSingle(),
      db.rpc('leaderboard', params: {'p_from': _ymd(weekStart), 'p_to': _ymd(weekEnd), 'p_department_id': auth.profile?['department_id'], 'p_limit': 1}),
      db.from('quotes').select('text, author'),
      db.from('institutional_links').select('telegram, whatsapp, facebook, twitter, instagram, support_email').eq('id', 1).maybeSingle(),
    ]);

    final stats = List<Map<String, dynamic>>.from(r[0]);
    final quoteRows = List<Map<String, dynamic>>.from(r[6]);
    if (quoteRows.isNotEmpty) d.quotes = [for (final q in quoteRows) (q['text'] as String, (q['author'] ?? '') as String)];
    d.channels = r[7] as Map<String, dynamic>?;

    final totalAttempted = stats.fold<int>(0, (s, e) => s + (e['attempted'] as int));
    final totalCorrect = stats.fold<int>(0, (s, e) => s + (e['correct'] as int));
    d.attempted = totalAttempted;
    d.points = _round1(totalAttempted * 2 + totalCorrect * 0.5);
    d.accuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted * 100).round() : 0;

    final byDate = {for (final e in stats) e['practice_date'] as String: e};
    d.week = List.generate(7, (i) {
      final day = DateTime(now.year, now.month, now.day).subtract(Duration(days: 6 - i));
      final row = byDate[_ymd(day)];
      return _Day(day, (row?['attempted'] as int?) ?? 0, (row?['correct'] as int?) ?? 0, (row?['study_duration_seconds'] as int?) ?? 0);
    });

    final progress = (r[1] as List).isEmpty ? null : (r[1] as List).first as Map<String, dynamic>;
    if (progress != null) {
      final res = await db.from('questions').select('id').eq('course_id', progress['course_id']).eq('status', 'active').limit(1).count();
      d.resume = progress;
      d.resumeTotal = res.count;
    }

    d.departments = List<Map<String, dynamic>>.from(r[2]);
    d.granted = (r[3] as List).map((g) => g['department_id'] as String).toSet();
    d.referralCode = (r[4] as Map?)?['referral_code'] as String?;

    final standings = List<Map<String, dynamic>>.from(r[5]);
    if (standings.isNotEmpty) {
      final top = standings.first;
      final names = List<Map<String, dynamic>>.from(await db.rpc('public_profile_names', params: {'p_user_ids': [top['user_id']]}));
      final name = names.isEmpty ? null : names.first;
      final att = top['attempted'] as int, cor = top['correct'] as int;
      d.topRanker = {
        'user_id': top['user_id'],
        'name': name?['display_name'] ?? 'Scholar',
        'university': name?['university'],
        'points': _round1(att * 2 + cor * 0.5),
        'accuracy': att > 0 ? (cor / att * 100).round() : 0,
        'attempted': att,
      };
    }
    return d;
  }

  void _onSearch(String q) {
    debounce?.cancel();
    final query = q.trim();
    if (query.isEmpty) {
      setState(() {
        results = [];
        searching = false;
      });
      return;
    }
    setState(() => searching = true);
    debounce = Timer(const Duration(milliseconds: 300), () async {
      final rows = await db
          .from('courses')
          .select('id, title, departments(name), department_levels(label)')
          .ilike('title', '%$query%')
          .eq('status', 'published')
          .filter('deleted_at', 'is', null)
          .order('title', ascending: true)
          .limit(8);
      if (!mounted || search.text.trim() != query) return;
      setState(() {
        results = List<Map<String, dynamic>>.from(rows);
        searching = false;
      });
    });
  }

  void _push(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  Widget _pageWithBar(String title, Widget body) => Scaffold(appBar: AppBar(title: Text(title)), body: DiamondMesh(child: body));

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return RefreshIndicator(
      onRefresh: () async => setState(() => future = _load()),
      child: FutureBuilder<_Data>(
        future: future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('Something went wrong.\n${snap.error}', textAlign: TextAlign.center))]);
          }
          final d = snap.data!;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 112),
            children: [
              _hero(d, auth),
              const SizedBox(height: 16),
              _quote(d),
              if (d.resume != null) ...[const SizedBox(height: 16), _resume(d)],
              const SizedBox(height: 24),
              _analytics(d),
              const SizedBox(height: 24),
              _departments(d),
              const SizedBox(height: 24),
              _quickActions(d),
              const SizedBox(height: 16),
              _revenue(d),
              if (d.topRanker != null) ...[const SizedBox(height: 16), _topRanker(d, auth)],
            ],
          );
        },
      ),
    );
  }

  // ---- hero ----------------------------------------------------------------------------------
  Widget _hero(_Data d, dynamic auth) {
    final showResults = searchFocus.hasFocus && search.text.trim().isNotEmpty;
    return CardLuxury(
      gradient: true,
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const LogoMark(height: 25, white: true),
          const SizedBox(width: 8),
          Text('Diamond Solution', style: heading(14, color: Colors.white)),
        ]),
        const SizedBox(height: 12),
        Text('${_greeting()},', style: body(12, color: Colors.white.withValues(alpha: 0.7))),
        Text(_greetingName(auth.profile, auth.user?.email), style: heading(20, color: Colors.white)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            const Icon(Icons.search, size: 17, color: AppColors.text3),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: search,
                focusNode: searchFocus,
                onChanged: _onSearch,
                style: body(14),
                decoration: InputDecoration(
                  hintText: 'Search a course, topic or exam (e.g. Hematology)…',
                  hintStyle: body(14, color: AppColors.text3),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                ),
              ),
            ),
          ]),
        ),
        if (showResults)
          Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(maxHeight: 288),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.border)),
            child: searching
                ? Padding(padding: const EdgeInsets.all(12), child: Text('Searching…', style: body(14, color: AppColors.text3)))
                : results.isEmpty
                    ? Padding(padding: const EdgeInsets.all(12), child: Text('No courses match "${search.text.trim()}".', style: body(14, color: AppColors.text3)))
                    : ListView(shrinkWrap: true, children: [
                        for (final r in results)
                          InkWell(
                            borderRadius: BorderRadius.circular(8),
                            onTap: () {
                              search.clear();
                              searchFocus.unfocus();
                              setState(() => results = []);
                              _push(CourseDetailScreen(courseId: r['id'] as String));
                            },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              child: Row(children: [
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text(r['title'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
                                    if ((r['departments'] as Map?)?['name'] != null) Text(r['departments']['name'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
                                  ]),
                                ),
                                if ((r['department_levels'] as Map?)?['label'] != null) Badge2(r['department_levels']['label'] as String),
                              ]),
                            ),
                          ),
                      ]),
          ),
        const SizedBox(height: 16),
        Row(children: [
          _heroStat('Points', _fmtNum(d.points)),
          const SizedBox(width: 8),
          _heroStat('Accuracy', '${d.accuracy}%'),
          const SizedBox(width: 8),
          _heroStat('Attempted', '${d.attempted}'),
        ]),
      ]),
    );
  }

  Widget _heroStat(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
          child: Column(children: [
            Text(value, style: heading(16, color: Colors.white)),
            Text(label.toUpperCase(), style: body(10, color: Colors.white.withValues(alpha: 0.7), letterSpacing: 0.5)),
          ]),
        ),
      );

  // ---- quote ---------------------------------------------------------------------------------
  Widget _quote(_Data d) {
    final now = DateTime.now();
    final dayOfYear = now.difference(DateTime(now.year, 1, 0)).inDays;
    final q = d.quotes[dayOfYear % d.quotes.length];
    return CardLuxury(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.format_quote, size: 14, color: AppColors.gold),
          const SizedBox(width: 6),
          Text('WISDOM OF THE DAY', style: body(12, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 0.6)),
        ]),
        const SizedBox(height: 8),
        Text('"${q.$1}"', style: body(14, style: FontStyle.italic, color: AppColors.text2, height: 1.45)),
        const SizedBox(height: 4),
        Text('— ${q.$2}', style: body(12, color: AppColors.text3)),
      ]),
    );
  }

  // ---- resume --------------------------------------------------------------------------------
  Widget _resume(_Data d) {
    final p = d.resume!;
    final course = p['courses'] as Map?;
    final level = (course?['department_levels'] as Map?)?['label'] as String?;
    final order = p['current_order'] as int;
    final percent = d.resumeTotal > 0 ? (order / d.resumeTotal * 100).round() : 0;
    return CardLuxury(
      gradient: true,
      onTap: () => _push(CourseDetailScreen(courseId: p['course_id'] as String)),
      child: Row(children: [
        _ProgressRing(percent: percent),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text('RECENTLY PRACTICED', overflow: TextOverflow.ellipsis, style: body(12, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 0.6))),
              if (level != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(border: Border.all(color: Colors.white.withValues(alpha: 0.25)), borderRadius: BorderRadius.circular(99)),
                  child: Text(level, style: body(10, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9))),
                ),
              ],
            ]),
            const SizedBox(height: 4),
            Text(course?['title'] as String? ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(16, color: Colors.white)),
            const SizedBox(height: 4),
            Text('$order of ${d.resumeTotal} questions completed', style: body(12, color: Colors.white.withValues(alpha: 0.8))),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(99)),
              child: Text('Resume Quiz →', style: body(12, weight: FontWeight.w700, color: AppColors.navy)),
            ),
          ]),
        ),
      ]),
    );
  }

  // ---- analytics -----------------------------------------------------------------------------
  Widget _analytics(_Data d) {
    final week = d.week;
    final wAttempted = week.fold<int>(0, (s, e) => s + e.attempted);
    final wCorrect = week.fold<int>(0, (s, e) => s + e.correct);
    final wMins = (week.fold<int>(0, (s, e) => s + e.seconds) / 60).round();
    final wAccuracy = wAttempted > 0 ? (wCorrect / wAttempted * 100).round() : 0;
    final f = selectedDay == null ? null : week[selectedDay!];
    final dur = f != null ? '${f.mins}m' : '${wMins}m';
    final att = f?.attempted ?? wAttempted;
    final cor = f?.correct ?? wCorrect;
    final acc = f?.accuracy ?? wAccuracy;
    final label = f != null ? '${f.label} (${f.full})' : '7-Day Total';

    Widget stat(String title, IconData icon, Color iconColor, String value, String sub, {Color valueColor = AppColors.text1}) => CardLuxury(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Flexible(child: Text(title.toUpperCase(), overflow: TextOverflow.ellipsis, style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.8))),
              Icon(icon, size: 16, color: iconColor),
            ]),
            const SizedBox(height: 8),
            Text(value, style: heading(20, color: valueColor)),
            const SizedBox(height: 2),
            Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(10, weight: FontWeight.w500, color: AppColors.text3)),
          ]),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.trending_up, size: 16, color: AppColors.royal),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Study Analytics', style: heading(14)),
            Text('7-DAY PERFORMANCE & TIME SPENT', style: body(10, weight: FontWeight.w700, color: AppColors.text3)),
          ]),
        ),
        if (selectedDay != null)
          GestureDetector(
            onTap: () => setState(() => selectedDay = null),
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(8)),
              child: Text('Reset', style: body(11, weight: FontWeight.w700, color: AppColors.royal)),
            ),
          ),
      ]),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton.icon(
          onPressed: () => _push(const ActivityLogScreen()),
          icon: const Icon(Icons.checklist, size: 14),
          label: Text('Full activity log →', style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 4), minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
        ),
      ),
      const SizedBox(height: 4),
      _pairs([
          stat('Time Spent', Icons.schedule, AppColors.royal, dur, label),
          stat('Attempted', Icons.track_changes, AppColors.indigo600, '$att', '$label questions'),
          stat('Correct Answers', Icons.check_circle_outline, AppColors.emerald600, '$cor', att > 0 ? '${(cor / att * 100).round()}% correct' : 'No attempts', valueColor: AppColors.emerald700),
          stat('Average Score', Icons.bolt, AppColors.gold, '$acc%', 'Accuracy score'),
        ]),
      const SizedBox(height: 12),
      CardLuxury(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Daily Time Spent & Practice Volume', style: heading(14)),
          const SizedBox(height: 2),
          Text('Tap any day bar to inspect questions attempted and score percentage.', style: body(11, color: AppColors.text3)),
          const SizedBox(height: 12),
          Wrap(spacing: 16, runSpacing: 6, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 12, height: 12, decoration: BoxDecoration(borderRadius: BorderRadius.circular(6), gradient: const LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [AppColors.navy, AppColors.royal]))),
              const SizedBox(width: 6),
              Text('Time (Mins)', style: body(11, weight: FontWeight.w700, color: AppColors.text2)),
            ]),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 10, height: 10, decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.gold)),
              const SizedBox(width: 6),
              Text('Accuracy %', style: body(11, weight: FontWeight.w700, color: AppColors.text2)),
            ]),
          ]),
          const SizedBox(height: 16),
          _WeekChart(week: week, selected: selectedDay, onSelect: (i) => setState(() => selectedDay = selectedDay == i ? null : i)),
          const SizedBox(height: 8),
          const Divider(height: 1, color: AppColors.royalSoft),
          const SizedBox(height: 8),
          Row(children: [
            for (var i = 0; i < week.length; i++) ...[
              if (i > 0) const SizedBox(width: 4),
              Expanded(child: _dayButton(week[i], i)),
            ],
          ]),
        ]),
      ),
    ]);
  }

  Widget _dayButton(_Day day, int i) {
    final sel = selectedDay == i;
    return GestureDetector(
      onTap: () => setState(() => selectedDay = sel ? null : i),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        decoration: BoxDecoration(
          color: sel ? AppColors.royal : AppColors.canvasSoft,
          border: Border.all(color: sel ? AppColors.royal : AppColors.royalBorder),
          borderRadius: BorderRadius.circular(12),
          boxShadow: sel ? [BoxShadow(color: AppColors.royal.withValues(alpha: 0.2), blurRadius: 6, offset: const Offset(0, 4))] : null,
        ),
        child: Column(children: [
          Text(day.label, style: body(9, weight: FontWeight.w900, color: sel ? Colors.white.withValues(alpha: 0.8) : AppColors.text3, letterSpacing: 0.4)),
          const SizedBox(height: 2),
          Text('${day.mins}m', style: body(12, weight: FontWeight.w900, color: sel ? Colors.white : AppColors.text1)),
          const SizedBox(height: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: sel ? Colors.white.withValues(alpha: 0.2) : Colors.white,
              border: sel ? null : Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text('${day.attempted}q', style: body(8, weight: FontWeight.w700, color: sel ? AppColors.gold : AppColors.text2)),
          ),
        ]),
      ),
    );
  }

  // ---- departments ---------------------------------------------------------------------------
  Widget _departments(_Data d) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Departments', style: heading(14)),
          GestureDetector(onTap: widget.onOpenDepartments, child: Text('See all', style: body(12, weight: FontWeight.w600, color: AppColors.royal))),
        ]),
        const SizedBox(height: 8),
        for (final dep in d.departments)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _departmentCard(dep, d.granted.contains(dep['id'])),
          ),
      ]);

  Widget _departmentCard(Map<String, dynamic> dep, bool granted) {
    final path = dep['image_path'] as String?;
    final url = path == null ? null : db.storage.from('media').getPublicUrl(path);
    return CardLuxury(
      padding: EdgeInsets.zero,
      onTap: () => _push(DepartmentScreen(departmentId: dep['id'] as String, name: dep['name'] as String)),
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (granted) ...[const Badge2('Active'), const SizedBox(height: 4)],
                Text(dep['name'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(14)),
                const SizedBox(height: 4),
                Text('Explore →', style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
              ]),
            ),
          ),
          SizedBox(
            width: 96,
            child: url != null
                ? Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => _deptPlaceholder())
                : _deptPlaceholder(),
          ),
        ]),
      ),
    );
  }

  Widget _deptPlaceholder() => Container(
        decoration: const BoxDecoration(gradient: diamondGradient),
        alignment: Alignment.center,
        child: Icon(Icons.menu_book_outlined, size: 20, color: Colors.white.withValues(alpha: 0.7)),
      );

  // ---- quick actions -------------------------------------------------------------------------
  Widget _quickActions(_Data d) {
    Widget tile(IconData icon, Color bg, Color fg, String title, String sub, VoidCallback onTap) => CardLuxury(
          padding: const EdgeInsets.all(16),
          onTap: onTap,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 40, height: 40, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)), child: Icon(icon, size: 18, color: fg)),
            const SizedBox(height: 8),
            Text(title, style: heading(14)),
            Text(sub, style: body(12, color: AppColors.text3)),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Quick actions', style: heading(14)),
      const SizedBox(height: 8),
      _pairs([
          tile(Icons.description_outlined, AppColors.royalSoft, AppColors.royal, 'Start Quiz', 'Pick a topic and go', () => widget.onOpenDepartments?.call()),
          tile(Icons.emoji_events_outlined, AppColors.goldPale, AppColors.goldDark, 'Leaderboard', 'See department rank', () => _push(_pageWithBar('Leaderboard', const LeaderboardScreen()))),
          tile(Icons.group_outlined, AppColors.emerald50, AppColors.emerald600, 'Refer & Earn', '25% commission', () => _push(const AffiliateScreen())),
          tile(Icons.public, AppColors.violet50, AppColors.violet600, 'Channels', 'Social updates', () => _showChannels(d.channels)),
        ]),
    ]);
  }

  // ---- right rail ----------------------------------------------------------------------------
  Widget _revenue(_Data d) => CardLuxury(
        gradient: true,
        onTap: () => _push(const AffiliateScreen()),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('REVENUE PROGRAM', style: body(12, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 0.6)),
              const SizedBox(height: 4),
              Text('Refer & earn 25%', style: heading(20, color: Colors.white)),
              const SizedBox(height: 4),
              Text('Share your referral code and earn on every successful enrollment.', style: body(14, color: Colors.white.withValues(alpha: 0.8))),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), border: Border.all(color: Colors.white.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(99)),
                child: Text(d.referralCode ?? 'Become an affiliate →', style: const TextStyle(fontFamily: 'monospace', fontSize: 14, letterSpacing: 1.4, color: AppColors.gold)),
              ),
            ]),
          ),
          const SizedBox(width: 12),
          Container(width: 56, height: 56, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), shape: BoxShape.circle), child: const Icon(Icons.group_outlined, size: 22, color: AppColors.gold)),
        ]),
      );

  Widget _topRanker(_Data d, dynamic auth) {
    final t = d.topRanker!;
    final deptName = d.departments.where((x) => x['id'] == auth.profile?['department_id']).map((x) => x['name'] as String).firstOrNull ?? 'All departments';
    final isMe = t['user_id'] == db.auth.currentUser?.id;
    return CardLuxury(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [const Icon(Icons.emoji_events_outlined, size: 16, color: AppColors.gold), const SizedBox(width: 8), Text('Top this week', style: heading(14))]),
              const SizedBox(height: 2),
              Text.rich(TextSpan(style: body(11, color: AppColors.text3), children: [const TextSpan(text: 'Department Arena: '), TextSpan(text: deptName, style: body(11, weight: FontWeight.w600, color: AppColors.text2))])),
            ]),
          ),
          GestureDetector(
            onTap: () => _push(_pageWithBar('Leaderboard', const LeaderboardScreen())),
            child: Text('See full rankings →', style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
          ),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: AppColors.goldPale, border: Border.all(color: AppColors.goldBorder), shape: BoxShape.circle),
            child: Text('1', style: body(12, weight: FontWeight.w700, color: AppColors.goldDark)),
          ),
          const SizedBox(width: 12),
          Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: AppColors.navy, shape: BoxShape.circle), child: Text(_initials(t['name'] as String), style: body(12, weight: FontWeight.w700, color: Colors.white))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(
                TextSpan(style: body(14, weight: FontWeight.w600), children: [
                  TextSpan(text: isMe ? 'You' : t['name'] as String),
                  if (t['university'] != null) TextSpan(text: ' (${t['university']})', style: body(14, color: AppColors.text3)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text("${t['accuracy']}% accuracy · ${t['attempted']} q's", style: body(12, color: AppColors.text3)),
            ]),
          ),
          const SizedBox(width: 8),
          Text('${_fmtNum(t['points'] as num)} pts', style: heading(14, color: AppColors.royal)),
        ]),
      ]),
    );
  }

  // ---- channels ------------------------------------------------------------------------------
  List<(String, String, IconData)> _channelLinks(Map<String, dynamic>? c) {
    if (c == null) return [];
    String withScheme(String v) => RegExp(r'^https?://', caseSensitive: false).hasMatch(v) ? v : 'https://$v';
    // A full URL (Telegram invite, WhatsApp channel) is used exactly as given; a bare handle/number builds the usual link.
    String asLink(String v, String Function(String) build) => RegExp(r'^https?://', caseSensitive: false).hasMatch(v.trim()) ? v.trim() : build(v);
    final out = <(String, String, IconData)>[];
    if (c['telegram'] != null) out.add(('Telegram', asLink(c['telegram'] as String, (v) => 'https://t.me/${v.replaceFirst(RegExp(r'^@'), '')}'), Icons.send));
    if (c['whatsapp'] != null) out.add(('WhatsApp', asLink(c['whatsapp'] as String, (v) => 'https://wa.me/${v.replaceAll(RegExp(r'\D'), '')}'), Icons.chat_bubble_outline));
    if (c['facebook'] != null) out.add(('Facebook', withScheme(c['facebook'] as String), Icons.facebook));
    if (c['twitter'] != null) out.add(('Twitter (X)', asLink(c['twitter'] as String, (v) => 'https://twitter.com/${v.replaceFirst(RegExp(r'^@'), '')}'), Icons.alternate_email));
    if (c['instagram'] != null) out.add(('Instagram', asLink(c['instagram'] as String, (v) => 'https://instagram.com/${v.replaceFirst(RegExp(r'^@'), '')}'), Icons.camera_alt_outlined));
    if (c['support_email'] != null) out.add((c['support_email'] as String, 'mailto:${c['support_email']}', Icons.mail_outline));
    return out;
  }

  void _showChannels(Map<String, dynamic>? channels) {
    final links = _channelLinks(channels);
    showDialog<void>(
      context: context,
      barrierColor: AppColors.navy.withValues(alpha: 0.5),
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 384),
          child: CardLuxury(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.public, size: 18, color: AppColors.royal),
                const SizedBox(width: 8),
                Expanded(child: Text('Channels', style: heading(18))),
                GestureDetector(onTap: () => Navigator.pop(ctx), child: const Icon(Icons.close, size: 18, color: AppColors.text3)),
              ]),
              const SizedBox(height: 4),
              Text('Stay connected — follow our official channels for updates.', style: body(14, color: AppColors.text3)),
              const SizedBox(height: 16),
              if (links.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                  decoration: BoxDecoration(color: AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
                  child: Text('No channels have been set up yet.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
                )
              else
                for (final l in links)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => launchUrl(Uri.parse(l.$2), mode: LaunchMode.externalApplication),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                        child: Row(children: [
                          Container(width: 32, height: 32, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Icon(l.$3, size: 15, color: AppColors.royal)),
                          const SizedBox(width: 12),
                          Expanded(child: Text(l.$1, style: body(14, weight: FontWeight.w600))),
                        ]),
                      ),
                    ),
                  ),
            ]),
          ),
        ),
      ),
    );
  }
}

// ---- progress ring (52px, gold arc on 25% white track, % centred) ------------------------------
class _ProgressRing extends StatelessWidget {
  const _ProgressRing({required this.percent});
  final int percent;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: 52,
        height: 52,
        child: CustomPaint(
          painter: _RingPainter(percent / 100),
          child: Center(child: Text('$percent%', style: body(11, weight: FontWeight.w700, color: Colors.white))),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.fraction);
  final double fraction;
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    const r = 20.0;
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..color = Colors.white.withValues(alpha: 0.25);
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..color = AppColors.gold;
    canvas.drawCircle(c, r, track);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, 2 * math.pi * fraction.clamp(0, 1), false, arc);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.fraction != fraction;
}

// ---- 7-day bar chart (minutes per day), tap a bar to select — the website's recharts BarChart ---
class _WeekChart extends StatelessWidget {
  const _WeekChart({required this.week, required this.selected, required this.onSelect});
  final List<_Day> week;
  final int? selected;
  final void Function(int) onSelect;

  static const double h = 224;
  static const double leftPad = 34;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final w = box.maxWidth;
        final slot = (w - leftPad - 8) / week.length;
        final sel = selected;
        return SizedBox(
          height: h,
          child: Stack(children: [
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (t) {
                  final i = ((t.localPosition.dx - leftPad) / slot).floor();
                  if (i >= 0 && i < week.length) onSelect(i);
                },
                child: CustomPaint(painter: _ChartPainter(week, sel)),
              ),
            ),
            if (sel != null) Positioned(top: 0, left: (leftPad + slot * (sel + 0.5) - 105).clamp(0, math.max(0, w - 210)), child: _tip(week[sel])),
          ]),
        );
      });

  Widget _tip(_Day d) {
    Widget row(String l, String v, {Color vc = Colors.white, bool top = false}) => Container(
          padding: EdgeInsets.only(top: top ? 4 : 0),
          decoration: top ? BoxDecoration(border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.1)))) : null,
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text(l, style: body(12, color: Colors.white.withValues(alpha: 0.9))),
            const SizedBox(width: 16),
            Text(v, style: body(12, weight: FontWeight.w700, color: vc)),
          ]),
        );
    return IgnorePointer(
      child: Container(
        width: 210,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withValues(alpha: 0.1)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 16, offset: const Offset(0, 8))]),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('${d.label} • ${d.full}'.toUpperCase(), style: body(10, weight: FontWeight.w900, color: AppColors.gold, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          row('⏱️ Time Spent:', '${d.mins} mins'),
          const SizedBox(height: 6),
          row('🎯 Attempted:', '${d.attempted} questions'),
          const SizedBox(height: 6),
          row('✅ Correct:', '${d.correct} correct', vc: AppColors.emerald400),
          const SizedBox(height: 6),
          row('⚡ Avg Score:', '${d.accuracy}%', vc: AppColors.gold, top: true),
        ]),
      ),
    );
  }
}

class _ChartPainter extends CustomPainter {
  _ChartPainter(this.week, this.selected);
  final List<_Day> week;
  final int? selected;

  @override
  void paint(Canvas canvas, Size size) {
    const left = _WeekChart.leftPad, bottom = 26.0, top = 10.0, right = 8.0;
    final plotW = size.width - left - right;
    final plotH = size.height - bottom - top;
    final maxMins = week.map((d) => d.mins).fold<int>(0, math.max);

    // "nice" step so there are at most ~5 ticks, like the chart's auto axis
    var step = 1;
    for (final s in [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      step = s;
      if (maxMins / s <= 4) break;
    }
    final top2 = math.max(step * (maxMins / step).ceil(), step);

    void label(String text, Offset at, {double size = 10, FontWeight w = FontWeight.w400, Color color = AppColors.slate400, bool centerX = false, bool rightAlign = false}) {
      final tp = TextPainter(text: TextSpan(text: text, style: body(size, weight: w, color: color)), textDirection: ui.TextDirection.ltr)..layout();
      final dx = centerX ? at.dx - tp.width / 2 : (rightAlign ? at.dx - tp.width : at.dx);
      tp.paint(canvas, Offset(dx, at.dy - tp.height / 2));
    }

    final grid = Paint()
      ..color = AppColors.royalSoft
      ..strokeWidth = 1;
    for (var v = 0; v <= top2; v += step) {
      final y = top + plotH * (1 - v / top2);
      // dashed 3 3 grid
      for (double x = left; x < left + plotW; x += 6) {
        canvas.drawLine(Offset(x, y), Offset(math.min(x + 3, left + plotW), y), grid);
      }
      label('${v}m', Offset(left - 6, y), rightAlign: true);
    }
    canvas.drawLine(Offset(left, top + plotH), Offset(left + plotW, top + plotH), Paint()..color = AppColors.royalBorder);

    final slot = plotW / week.length;
    final barW = math.min(42.0, slot * 0.5);
    for (var i = 0; i < week.length; i++) {
      final cx = left + slot * (i + 0.5);
      final hgt = plotH * week[i].mins / top2;
      if (selected == i) {
        canvas.drawRect(Rect.fromLTWH(cx - slot / 2, top, slot, plotH), Paint()..color = AppColors.royalSoft.withValues(alpha: 0.7));
      }
      if (hgt > 0) {
        final rect = RRect.fromRectAndCorners(Rect.fromLTWH(cx - barW / 2, top + plotH - hgt, barW, hgt), topLeft: const Radius.circular(8), topRight: const Radius.circular(8));
        canvas.drawRRect(rect, Paint()..color = AppColors.royal);
      }
      label(week[i].label, Offset(cx, size.height - 8), size: 11, w: FontWeight.w700, color: AppColors.text3, centerX: true);
    }
  }

  @override
  bool shouldRepaint(_ChartPainter old) => old.week != week || old.selected != selected;
}
