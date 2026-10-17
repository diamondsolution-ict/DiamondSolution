import 'dart:async';
import 'package:flutter/material.dart';
import '../core/access.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../core/widgets.dart';
import '../main.dart';

// Mirrors src/pages/StudyPage.tsx: dark header with score/timer/progress, question card,
// navy footer bar, section-complete and final-results cards.

class _Option {
  _Option(this.id, this.label, this.body, this.isCorrect);
  final String id, label, body;
  final bool isCorrect;
}

class _Question {
  _Question(this.id, this.type, this.prompt, this.expected, this.explanation, this.options);
  final String id, type, prompt;
  final String? expected, explanation;
  final List<_Option> options;
  bool get isApplication => type == 'application';
}

class _Section {
  _Section(this.title, this.start, this.end);
  final String title;
  final int start, end;
}

class StudyScreen extends StatefulWidget {
  const StudyScreen({super.key, required this.courseId, this.start});
  final String courseId;
  final int? start;
  @override
  State<StudyScreen> createState() => _StudyScreenState();
}

class _StudyScreenState extends State<StudyScreen> {
  static const objectiveSeconds = 60;
  static const applicationSeconds = 120;

  bool loading = true;
  String? loadError;
  bool accessDenied = false;
  String courseTitle = '';
  List<_Question> questions = [];
  List<_Section> outline = [];

  int index = 0;
  String? selected;
  bool submitted = false;
  bool showResults = false;
  _Section? sectionComplete;
  // Insertion-ordered, like the website's sessionResults object.
  final results = <String, String>{};
  final pickedByQuestion = <String, String?>{};
  int secondsLeft = objectiveSeconds;
  Timer? timer;
  DateTime questionStart = DateTime.now();
  // Set when an answer is submitted; the time from then until the student leaves the question
  // (reading the explanation) is reported separately, like the website's flushReadingTime().
  DateTime? submittedAt;

  _Question get q => questions[index];
  int get totalCorrect => results.values.where((r) => r == 'correct' || r == 'applied').length;
  _Section? get activeSection => outline.where((s) => index + 1 >= s.start && index + 1 <= s.end).firstOrNull;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    timer?.cancel();
    _flushReadingTime();
    super.dispose();
  }

  Future<void> _load({bool fresh = false}) async {
    timer?.cancel();
    setState(() {
      loading = true;
      loadError = null;
      if (fresh) {
        results.clear();
        pickedByQuestion.clear();
        index = 0;
        selected = null;
        submitted = false;
        showResults = false;
        sectionComplete = null;
      }
    });
    try {
      final uid = db.auth.currentUser!.id;
      final isAdmin = AuthScope.of(context).isStaff;
      final course = await db.from('courses').select('id, title, department_id').eq('id', widget.courseId).single();
      courseTitle = course['title'] as String;

      // RLS enforces access too; checking here gives a clean message instead of an empty list.
      if (!isAdmin) {
        final grant = await db.from('access_grants').select('department_id, expires_at').eq('user_id', uid).eq('department_id', course['department_id']).maybeSingle();
        if (!isGrantActive(grant)) {
          accessDenied = true;
          setState(() => loading = false);
          return;
        }
      }

      // Keyset-paginated: a plain select silently caps at 1000 rows.
      final rows = <Map<String, dynamic>>[];
      String? after;
      while (true) {
        var query = db
            .from('questions')
            .select('id, type, prompt, expected_answer, explanation, sort_order, question_options(id, label, body, is_correct, sort_order)')
            .eq('course_id', widget.courseId)
            .eq('status', 'active');
        if (after != null) query = query.gt('id', after);
        final page = List<Map<String, dynamic>>.from(await query.order('id', ascending: true).limit(1000));
        rows.addAll(page);
        if (page.length < 1000) break;
        after = page.last['id'] as String;
      }
      rows.sort((a, b) => (a['sort_order'] as int).compareTo(b['sort_order'] as int));
      questions = rows.map((r) {
        final opts = List<Map<String, dynamic>>.from(r['question_options'] as List)..sort((a, b) => (a['sort_order'] as int).compareTo(b['sort_order'] as int));
        return _Question(
          r['id'] as String,
          r['type'] as String,
          r['prompt'] as String,
          r['expected_answer'] as String?,
          r['explanation'] as String?,
          [for (final o in opts) _Option(o['id'] as String, o['label'] as String, o['body'] as String, o['is_correct'] as bool)],
        );
      }).toList();

      final outlineRows = await db.from('course_outline_sections').select('title, start_question_order, end_question_order').eq('course_id', widget.courseId).order('sort_order', ascending: true);
      outline = [for (final s in outlineRows) _Section(s['title'] as String, s['start_question_order'] as int, s['end_question_order'] as int)];
      final progress = await db.from('study_progress').select('current_order, completed').eq('user_id', uid).eq('course_id', widget.courseId).maybeSingle();

      // An explicit start (jump / resume / outline section) wins, even past a completed run.
      final total = questions.length;
      if (!fresh && widget.start != null && widget.start! >= 1 && total > 0) {
        index = (widget.start! - 1).clamp(0, total - 1);
      } else if (!fresh && progress?['completed'] == true) {
        showResults = true;
      } else if (!fresh && progress != null) {
        index = (progress['current_order'] as int).clamp(0, total > 0 ? total - 1 : 0);
      }
    } catch (e) {
      loadError = '$e';
    }
    if (!mounted) return;
    setState(() => loading = false);
    if (loadError == null && !showResults && questions.isNotEmpty) _startTimer();
  }

  void _startTimer() {
    timer?.cancel();
    secondsLeft = q.isApplication ? applicationSeconds : objectiveSeconds;
    questionStart = DateTime.now();
    timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (secondsLeft <= 1) {
        t.cancel();
        setState(() => secondsLeft = 0);
        _submit(timedOut: true);
      } else {
        setState(() => secondsLeft--);
      }
    });
  }

  Future<void> _submit({bool timedOut = false}) async {
    if (submitted) return;
    timer?.cancel();
    final question = q;
    final taken = DateTime.now().difference(questionStart).inSeconds;

    String result;
    if (question.isApplication) {
      result = timedOut && selected == null ? 'skipped' : 'applied';
    } else if (timedOut && selected == null) {
      result = 'skipped';
    } else {
      final chosen = question.options.where((o) => o.id == selected).firstOrNull;
      result = (chosen?.isCorrect ?? false) ? 'correct' : 'incorrect';
    }

    setState(() {
      submitted = true;
      submittedAt = DateTime.now();
      results[question.id] = result;
      pickedByQuestion[question.id] = selected;
    });

    final isLast = index == questions.length - 1;
    try {
      await db.rpc('record_question_attempt', params: {
        'p_course_id': widget.courseId,
        'p_question_id': question.id,
        'p_selected_option_id': question.isApplication ? null : selected,
        'p_result': result,
        'p_time_taken_seconds': taken,
        'p_current_order': index + 1,
        'p_completed': isLast,
        // Local calendar date, not UTC — same rule as the website.
        'p_practice_date': isoDate(DateTime.now()),
      });
    } catch (e) {
      // Never block the quiz on this; the answer is already shown locally.
      debugPrint('record_question_attempt failed: $e');
    }
  }

  /// Adds the time spent on a question AFTER submitting (reading the explanation / expected answer)
  /// to today's study time. Without this only the seconds up to the Submit tap were counted, so a
  /// 30-minute session showed as a few minutes. Fire-and-forget; capped so a phone left open on an
  /// explanation doesn't record hours.
  void _flushReadingTime() {
    final start = submittedAt;
    if (start == null) return;
    submittedAt = null;
    final elapsed = DateTime.now().difference(start).inSeconds.clamp(0, 900);
    if (elapsed <= 0) return;
    db.rpc('add_study_duration', params: {'p_seconds': elapsed, 'p_practice_date': isoDate(DateTime.now())}).then((_) {}, onError: (Object e) => debugPrint('add_study_duration failed: $e'));
  }

  void _goTo(int i) {
    _flushReadingTime();
    final target = questions[i];
    final answered = results.containsKey(target.id);
    setState(() {
      index = i;
      selected = answered ? pickedByQuestion[target.id] : null;
      submitted = answered;
      sectionComplete = null;
    });
    if (answered) {
      timer?.cancel();
    } else {
      _startTimer();
    }
  }

  void _next() {
    _flushReadingTime();
    final isLast = index == questions.length - 1;
    final section = activeSection;
    final reachedSectionEnd = section != null && index + 1 == section.end;
    if (isLast) {
      timer?.cancel();
      setState(() => showResults = true);
    } else if (reachedSectionEnd) {
      timer?.cancel();
      setState(() => sectionComplete = section);
    } else {
      _goTo(index + 1);
    }
  }

  Future<void> _resync() async {
    await db.rpc('reset_study_progress', params: {'p_course_id': widget.courseId});
    if (mounted) await _load(fresh: true);
  }

  // ---- build ---------------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    if (loading) return const PageShell(title: 'Studying', child: Center(child: CircularProgressIndicator()));
    if (loadError != null) {
      return PageShell(
        title: 'Studying',
        child: _centerCard(Icons.warning_amber_rounded, AppColors.rose500, AppColors.rose50, "Couldn't load this course", loadError!, action: BtnPrimary(label: 'Retry', onPressed: () => _load())),
      );
    }
    if (accessDenied) return PageShell(title: 'Restricted', child: _centerCard(Icons.lock_outline, AppColors.rose500, AppColors.rose50, null, "You don't have access to this course."));
    if (questions.isEmpty) return PageShell(title: courseTitle, child: _centerCard(Icons.menu_book_outlined, AppColors.text3, AppColors.canvasSoft, null, 'No study content available for this course yet.'));
    if (showResults) return _resultsView();
    if (sectionComplete != null) return _sectionView(sectionComplete!);
    return _questionView();
  }

  Widget _centerCard(IconData icon, Color iconColor, Color bg, String? title, String message, {Widget? action}) => ListView(padding: const EdgeInsets.all(16), children: [
        CardLuxury(
          padding: const EdgeInsets.all(40),
          child: Column(children: [
            Container(width: 48, height: 48, decoration: BoxDecoration(color: bg, shape: BoxShape.circle), child: Icon(icon, size: 22, color: iconColor)),
            const SizedBox(height: 8),
            if (title != null) Text(title, style: body(14, weight: FontWeight.w600)),
            Text(message, textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
            if (action != null) ...[const SizedBox(height: 12), action],
          ]),
        ),
      ]);

  Widget _resultsView() {
    final submittedCount = results.length;
    final pct = submittedCount > 0 ? (totalCorrect / submittedCount * 100).round() : 0;
    return PageShell(
      title: courseTitle,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        CardLuxury(
          padding: const EdgeInsets.all(32),
          child: Column(children: [
            Container(width: 56, height: 56, decoration: const BoxDecoration(gradient: diamondGradient, shape: BoxShape.circle), child: const Icon(Icons.emoji_events_outlined, size: 26, color: Colors.white)),
            const SizedBox(height: 16),
            Text('$totalCorrect / ${submittedCount == 0 ? questions.length : submittedCount}', style: heading(24)),
            const SizedBox(height: 4),
            Text('$pct% compliance', style: body(14, color: AppColors.text3)),
            const SizedBox(height: 16),
            ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: pct / 100, minHeight: 8, backgroundColor: AppColors.canvasSoft, color: AppColors.royal)),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: BtnOutline(label: 'Re-sync', onPressed: _resync)),
              const SizedBox(width: 12),
              Expanded(child: BtnPrimary(label: 'Exit', onPressed: () => Navigator.of(context).maybePop())),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _sectionView(_Section s) {
    final n = s.end - s.start + 1;
    final entries = results.values.toList();
    final recent = entries.length > n ? entries.sublist(entries.length - n) : entries;
    final correct = recent.where((r) => r == 'correct' || r == 'applied').length;
    final pct = recent.isNotEmpty ? (correct / recent.length * 100).round() : 0;
    final message = pct >= 90 ? 'Outstanding mastery.' : pct >= 70 ? 'Solid progress.' : 'Keep going.';
    final isLastSection = outline.isNotEmpty && outline.last.title == s.title;
    return PageShell(
      title: courseTitle,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        CardLuxury(
          padding: const EdgeInsets.all(32),
          child: Column(children: [
            Container(width: 56, height: 56, decoration: const BoxDecoration(color: AppColors.emerald50, shape: BoxShape.circle), child: const Icon(Icons.celebration_outlined, size: 24, color: AppColors.emerald600)),
            const SizedBox(height: 16),
            Text('Section complete', style: heading(18)),
            const SizedBox(height: 4),
            Text(s.title, textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
            const SizedBox(height: 16),
            Text('$pct%', style: heading(30, color: AppColors.royal)),
            const SizedBox(height: 4),
            Text(message, style: body(14, color: AppColors.text3)),
            const SizedBox(height: 24),
            Row(children: [
              Expanded(child: BtnOutline(label: 'Outline', onPressed: () => Navigator.of(context).maybePop())),
              const SizedBox(width: 12),
              Expanded(
                child: BtnPrimary(
                  label: isLastSection ? 'Final results' : 'Next section',
                  onPressed: () => isLastSection ? setState(() => showResults = true) : _goTo(index + 1),
                ),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _questionView() {
    final question = q;
    final progress = (index + 1) / questions.length;
    final low = secondsLeft <= 10;
    return Scaffold(
      backgroundColor: AppColors.canvasSoft,
      body: Column(children: [
        // header (navy)
        Container(
          color: AppColors.navy,
          child: SafeArea(
            bottom: false,
            child: Column(children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  GestureDetector(onTap: () => Navigator.of(context).maybePop(), child: const Padding(padding: EdgeInsets.all(6), child: Icon(Icons.chevron_left, size: 20, color: AppColors.slate300))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(activeSection?.title ?? courseTitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w700, color: Colors.white)),
                      Text('QUESTION ${index + 1} OF ${questions.length}', style: body(11, weight: FontWeight.w600, color: AppColors.slate400, letterSpacing: 0.5)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: low ? AppColors.rose500.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.timer_outlined, size: 12, color: low ? const Color(0xFFFDA4AF) : AppColors.slate300),
                      const SizedBox(width: 4),
                      Text('${secondsLeft}s', style: body(12, weight: FontWeight.w700, color: low ? const Color(0xFFFDA4AF) : AppColors.slate300)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99)),
                    child: Text('Score: $totalCorrect', style: body(12, weight: FontWeight.w700, color: AppColors.gold)),
                  ),
                ]),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Container(height: 4, width: double.infinity, color: Colors.white.withValues(alpha: 0.1), alignment: Alignment.centerLeft, child: FractionallySizedBox(widthFactor: progress, child: Container(color: AppColors.gold))),
              ),
            ]),
          ),
        ),
        // body
        Expanded(
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 24), children: [
            CardLuxury(
              padding: const EdgeInsets.all(24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('ARCHIVE QUERY · ${question.isApplication ? 'APPLICATION' : 'MCQ'}', style: body(11, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.6)),
                const SizedBox(height: 8),
                Text(question.prompt, style: body(16, weight: FontWeight.w500, height: 1.5)),
                if (!question.isApplication) ...[
                  const SizedBox(height: 16),
                  for (final o in question.options) Padding(padding: const EdgeInsets.only(bottom: 8), child: _optionTile(o)),
                ] else if (submitted) ...[
                  const SizedBox(height: 16),
                  _navyBox(Icons.check_circle_outline, 'Expected response', question.expected?.isNotEmpty == true ? question.expected! : 'No expected answer recorded.', white: true),
                ],
                if (submitted && question.explanation?.isNotEmpty == true) ...[
                  const SizedBox(height: 16),
                  _navyBox(Icons.lightbulb_outline, 'EXPLANATION', question.explanation!),
                ],
              ]),
            ),
            const SizedBox(height: 16),
            Center(child: GestureDetector(onTap: () => Navigator.of(context).maybePop(), child: Text('Exit quiz', style: body(12, weight: FontWeight.w600, color: AppColors.text3)))),
          ]),
        ),
        // footer (navy)
        Container(
          color: AppColors.navy,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Expanded(
                  child: Row(children: [
                    GestureDetector(
                      onTap: index == 0 ? null : () => _goTo(index - 1),
                      child: Padding(padding: const EdgeInsets.all(6), child: Icon(Icons.chevron_left, size: 18, color: index == 0 ? AppColors.slate300.withValues(alpha: 0.3) : AppColors.slate300)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('PROTOCOL STATUS', style: body(10, weight: FontWeight.w700, color: AppColors.slate400, letterSpacing: 0.5)),
                        Text(submitted ? 'Synthesis complete' : 'Awaiting response', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, weight: FontWeight.w700, color: AppColors.gold)),
                      ]),
                    ),
                  ]),
                ),
                const SizedBox(width: 12),
                if (!submitted)
                  _goldAction(question.isApplication ? 'Check answer' : 'Submit', null, !question.isApplication && selected == null ? null : () => _submit())
                else
                  _goldAction(index == questions.length - 1 ? 'Finish' : 'Next', Icons.chevron_right, _next),
              ]),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _goldAction(String label, IconData? trailing, VoidCallback? onTap) => Opacity(
        opacity: onTap == null ? 0.4 : 1,
        child: Material(
          color: AppColors.gold,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(label, style: body(14, weight: FontWeight.w700, color: AppColors.navy)),
                if (trailing != null) ...[const SizedBox(width: 6), Icon(trailing, size: 15, color: AppColors.navy)],
              ]),
            ),
          ),
        ),
      );

  Widget _navyBox(IconData icon, String title, String text, {bool white = false}) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, size: 15, color: white ? Colors.white : AppColors.gold),
            const SizedBox(width: 8),
            Text(white ? title : title.toUpperCase(), style: white ? body(14, weight: FontWeight.w600, color: Colors.white) : body(12, weight: FontWeight.w700, color: AppColors.gold, letterSpacing: 0.6)),
          ]),
          const SizedBox(height: 6),
          Text(text, style: body(14, color: Colors.white.withValues(alpha: 0.9), height: 1.45)),
        ]),
      );

  Widget _optionTile(_Option o) {
    final isSelected = selected == o.id;
    final showCorrect = submitted && o.isCorrect;
    final showWrong = submitted && isSelected && !o.isCorrect;
    Color border = AppColors.border, bg = Colors.white, fg = AppColors.text1;
    Color badgeBg = AppColors.canvasSoft, badgeFg = AppColors.text2;
    if (showCorrect || (isSelected && !showWrong)) {
      border = AppColors.royal;
      bg = AppColors.royalSoft;
      fg = AppColors.royal;
      badgeBg = AppColors.royal;
      badgeFg = Colors.white;
    } else if (showWrong) {
      border = const Color(0xFFFB7185);
      bg = AppColors.rose50;
      fg = const Color(0xFF9F1239);
      badgeBg = AppColors.rose500;
      badgeFg = Colors.white;
    }
    return Opacity(
      opacity: submitted && !showCorrect && !showWrong ? 0.5 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: submitted ? null : () => setState(() => selected = o.id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(12)),
          child: Row(children: [
            Container(width: 24, height: 24, alignment: Alignment.center, decoration: BoxDecoration(color: badgeBg, borderRadius: BorderRadius.circular(8)), child: Text(o.label, style: body(12, weight: FontWeight.w700, color: badgeFg))),
            const SizedBox(width: 12),
            Expanded(child: Text(o.body, style: body(14, color: fg))),
            if (showCorrect) const Icon(Icons.check_circle_outline, size: 16, color: AppColors.royal),
            if (showWrong) const Icon(Icons.cancel_outlined, size: 16, color: Color(0xFFE11D48)),
          ]),
        ),
      ),
    );
  }
}
