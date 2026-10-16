import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'study_screen.dart';

// Mirrors src/pages/CourseDetail.tsx.
class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen({super.key, required this.courseId});
  final String courseId;
  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  late Future<Map<String, dynamic>?> future = _load();
  final jump = TextEditingController();
  String jumpError = '';

  Future<Map<String, dynamic>?> _load() async {
    final uid = db.auth.currentUser!.id;
    final isAdmin = AuthScope.of(context).isAdmin;
    final course = await db
        .from('courses')
        .select('id, title, description, department_id, level_id, image_path')
        .eq('id', widget.courseId)
        .filter('deleted_at', 'is', null)
        .maybeSingle();
    if (course == null) return null;
    final r = await Future.wait<dynamic>([
      db.from('departments').select('name').eq('id', course['department_id']).single(),
      db.from('department_levels').select('label').eq('id', course['level_id']).single(),
      db.from('questions').select('id').eq('course_id', widget.courseId).eq('status', 'active').limit(1).count(),
      db.from('course_outline_sections').select('id, title, start_question_order, end_question_order').eq('course_id', widget.courseId).order('sort_order', ascending: true),
      db.from('access_grants').select('department_id').eq('user_id', uid).eq('department_id', course['department_id']).maybeSingle(),
      db.from('study_progress').select('current_order, completed').eq('user_id', uid).eq('course_id', widget.courseId).maybeSingle(),
    ]);
    return {
      'course': course,
      'dept': (r[0] as Map)['name'],
      'level': (r[1] as Map)['label'],
      'count': (r[2] as dynamic).count as int,
      'outline': List<Map<String, dynamic>>.from(r[3]),
      // Admins read everything for free, same as has_department_access() server-side.
      'access': isAdmin || r[4] != null,
      'progress': r[5],
    };
  }

  void _study({int? start}) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => StudyScreen(courseId: widget.courseId, start: start)))
      .then((_) {
    if (mounted) setState(() => future = _load());
  });

  void _jump(int total) {
    final n = int.tryParse(jump.text);
    if (n == null || n < 1 || n > total) {
      setState(() => jumpError = 'Enter a number between 1 and $total.');
      return;
    }
    setState(() => jumpError = '');
    _study(start: n);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>?>(
        future: future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const PageShell(title: 'Course', child: Center(child: CircularProgressIndicator()));
          if (snap.hasError) return PageShell(title: 'Course', child: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('Something went wrong.\n${snap.error}', textAlign: TextAlign.center))));
          final d = snap.data;
          if (d == null) {
            return PageShell(title: 'Not found', child: Padding(padding: const EdgeInsets.all(16), child: Text("This course doesn't exist or has been removed.", style: body(14, color: AppColors.text3))));
          }
          final course = d['course'] as Map<String, dynamic>;
          final total = d['count'] as int;
          final access = d['access'] as bool;
          final progress = d['progress'] as Map<String, dynamic>?;
          final outline = d['outline'] as List<Map<String, dynamic>>;
          final path = course['image_path'] as String?;
          final imageUrl = path == null ? null : db.storage.from('media').getPublicUrl(path);
          final resumable = progress != null && progress['completed'] != true && (progress['current_order'] as int) > 0;

          return PageShell(
            title: course['title'] as String,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 40), children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: imageUrl != null
                    ? SizedBox(height: 144, child: Image.network(imageUrl, fit: BoxFit.cover, width: double.infinity, errorBuilder: (_, __, ___) => _bannerFallback()))
                    : _bannerFallback(),
              ),
              const SizedBox(height: 16),
              Wrap(spacing: 8, runSpacing: 8, children: [
                Badge2(d['dept'] as String, gold: true),
                if (d['level'] != null) Badge2('${d['level']} Level'),
              ]),
              const SizedBox(height: 12),
              Text(course['title'] as String, style: heading(24)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.only(left: 16),
                decoration: const BoxDecoration(border: Border(left: BorderSide(color: AppColors.gold, width: 2))),
                child: Text(
                  (course['description'] as String?)?.isNotEmpty == true ? course['description'] as String : 'Practice questions for this course, reviewed by the academic team.',
                  style: body(14, style: FontStyle.italic, color: AppColors.text2, height: 1.45),
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: const BoxDecoration(border: Border.symmetric(horizontal: BorderSide(color: AppColors.border))),
                child: IntrinsicHeight(
                  child: Row(children: [
                    for (final (i, e) in [(Icons.workspace_premium_outlined, 'Status', 'Institutional'), (Icons.verified_user_outlined, 'Security', 'Encrypted'), (Icons.share_outlined, 'Endowment', '25% Yield')].indexed) ...[
                      if (i > 0) const VerticalDivider(width: 1, color: AppColors.border),
                      Expanded(
                        child: Column(children: [
                          Container(width: 36, height: 36, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Icon(e.$1, size: 16, color: AppColors.royal)),
                          const SizedBox(height: 6),
                          Text(e.$2.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1)),
                          const SizedBox(height: 6),
                          Text(e.$3, style: body(14, weight: FontWeight.w700)),
                        ]),
                      ),
                    ],
                  ]),
                ),
              ),
              const SizedBox(height: 24),
              if (!access) _noAccess(d) else _launchCard(total, progress, resumable, course),
              if (access && total > 0) ...[
                const SizedBox(height: 8),
                Text('LIFETIME ACCESS · ONE-TIME PAYMENT · SECURED TRANSACTION', textAlign: TextAlign.center, style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.2)),
              ],
              const SizedBox(height: 32),
              Row(children: [
                const Icon(Icons.menu_book_outlined, size: 16, color: AppColors.royal),
                const SizedBox(width: 8),
                Text('ACADEMIC OBJECTIVES', style: heading(16, color: AppColors.text1, letterSpacing: 1.6)),
              ]),
              const SizedBox(height: 12),
              if (outline.isEmpty)
                Text('No outline published for this course yet.', style: body(14, color: AppColors.text3))
              else
                for (final s in outline)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Opacity(
                      opacity: access ? 1 : 0.6,
                      child: Container(
                        decoration: BoxDecoration(gradient: diamondGradient, borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 6, offset: const Offset(0, 4))]),
                        child: Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(16),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: access ? () => _study(start: s['start_question_order'] as int) : null,
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(children: [
                                Container(width: 32, height: 32, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), shape: BoxShape.circle), child: const Icon(Icons.play_circle_outline, size: 16, color: Colors.white)),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Text('${s['title']}: Q${s['start_question_order']}–${s['end_question_order']}', style: body(12, weight: FontWeight.w700, color: Colors.white, height: 1.3)),
                                    const SizedBox(height: 4),
                                    Text((access ? 'Click to launch section' : 'Requires access').toUpperCase(), style: body(9, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 1.4)),
                                  ]),
                                ),
                              ]),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
            ]),
          );
        },
      );

  Widget _bannerFallback() => Container(
        height: 96,
        width: double.infinity,
        decoration: const BoxDecoration(gradient: diamondGradient),
        child: Icon(Icons.menu_book_outlined, size: 32, color: Colors.white.withValues(alpha: 0.4)),
      );

  Widget _noAccess(Map<String, dynamic> d) => CardLuxury(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          const Icon(Icons.lock_outline, size: 24, color: AppColors.text3),
          const SizedBox(height: 8),
          Text('You need access to ${d['dept']} to study this course.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
          const SizedBox(height: 12),
          BtnPrimary(label: 'Go to department', onPressed: () => Navigator.of(context).maybePop()),
        ]),
      );

  Widget _launchCard(int total, Map<String, dynamic>? progress, bool resumable, Map<String, dynamic> course) {
    final done = progress?['current_order'] as int? ?? 0;
    return CardLuxury(
      gradient: true,
      padding: const EdgeInsets.all(24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(Icons.help_outline, size: 15, color: Colors.white.withValues(alpha: 0.8)),
          const SizedBox(width: 6),
          Text('$total question(s) available', style: body(14, color: Colors.white.withValues(alpha: 0.8))),
        ]),
        if (total > 0) ...[
          const SizedBox(height: 20),
          Text('PROTOCOL LAUNCH CONFIGURATIONS', style: body(11, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 1.6)),
          if (resumable) ...[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => _study(start: done + 1),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                child: Row(children: [
                  Container(width: 36, height: 36, decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle), child: const Icon(Icons.play_circle_outline, size: 18, color: AppColors.navy)),
                  const SizedBox(width: 12),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Resume session', style: body(14, weight: FontWeight.w700, color: Colors.white)),
                    Text('Continue from question ${done + 1}', style: body(12, color: Colors.white.withValues(alpha: 0.7))),
                  ]),
                ]),
              ),
            ),
          ],
          const SizedBox(height: 16),
          Text('CUSTOM START QUESTION NUMBER (1 – $total)', style: body(10, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.7), letterSpacing: 1.4)),
          const SizedBox(height: 6),
          TextField(
            controller: jump,
            keyboardType: TextInputType.number,
            onChanged: (_) => setState(() => jumpError = ''),
            style: body(14, color: Colors.white),
            decoration: InputDecoration(
              hintText: 'e.g. ${total < 5 ? total : 5}',
              hintStyle: body(14, color: Colors.white.withValues(alpha: 0.4)),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.1),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.gold)),
            ),
          ),
          if (jumpError.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(jumpError, style: body(12, color: const Color(0xFFFECDD3)))),
          const SizedBox(height: 12),
          BtnGold(label: 'Jump to Qn', icon: Icons.track_changes, onPressed: () => _jump(total)),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => _study(start: done > 0 ? 1 : null),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Text((done > 0 ? 'Or start over from question 1' : 'Start studying →').toUpperCase(), textAlign: TextAlign.center, style: body(12, weight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.6), letterSpacing: 1.4)),
            ),
          ),
        ] else ...[
          const SizedBox(height: 16),
          const BtnGold(label: 'No questions yet', icon: Icons.play_circle_outline),
        ],
      ]),
    );
  }
}
