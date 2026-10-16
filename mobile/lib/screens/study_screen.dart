import 'dart:async';
import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

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
  String title = '';
  List<_Question> questions = [];
  int index = 0;
  String? selected;
  bool submitted = false;
  bool showResults = false;
  final results = <String, String>{};
  final pickedByQuestion = <String, String?>{};
  int secondsLeft = objectiveSeconds;
  Timer? timer;
  DateTime questionStart = DateTime.now();

  _Question get q => questions[index];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final uid = db.auth.currentUser!.id;
      final course = await db.from('courses').select('title, department_id').eq('id', widget.courseId).single();
      title = course['title'] as String;

      // RLS enforces access too; checking here gives a clean message instead of an empty list.
      final isAdmin = (await db.from('user_roles').select('role').eq('user_id', uid))
          .any((r) => r['role'] == 'admin');
      if (!isAdmin) {
        final grant = await db
            .from('access_grants')
            .select('department_id')
            .eq('user_id', uid)
            .eq('department_id', course['department_id'])
            .maybeSingle();
        if (grant == null) throw "You don't have access to this course.";
      }

      // Keyset-paginated: a plain select silently caps at 1000 rows.
      final rows = <Map<String, dynamic>>[];
      String? after;
      while (true) {
        var query = db
            .from('questions')
            .select('id, type, prompt, expected_answer, explanation, sort_order, '
                'question_options(id, label, body, is_correct, sort_order)')
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
        final opts = List<Map<String, dynamic>>.from(r['question_options'] as List)
          ..sort((a, b) => (a['sort_order'] as int).compareTo(b['sort_order'] as int));
        return _Question(
          r['id'] as String,
          r['type'] as String,
          r['prompt'] as String,
          r['expected_answer'] as String?,
          r['explanation'] as String?,
          [for (final o in opts) _Option(o['id'] as String, o['label'] as String, o['body'] as String, o['is_correct'] as bool)],
        );
      }).toList();

      final progress = await db
          .from('study_progress')
          .select('current_order, completed')
          .eq('user_id', uid)
          .eq('course_id', widget.courseId)
          .maybeSingle();
      final total = questions.length;
      if (widget.start != null && widget.start! >= 1 && total > 0) {
        index = (widget.start! - 1).clamp(0, total - 1);
      } else if (progress?['completed'] == true) {
        showResults = true;
      } else if (progress != null) {
        index = (progress['current_order'] as int).clamp(0, total > 0 ? total - 1 : 0);
      }
    } catch (e) {
      loadError = '$e';
    }
    if (!mounted) return;
    setState(() => loading = false);
    if (!showResults && questions.isNotEmpty) _startTimer();
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
      debugPrint('record_question_attempt failed: $e');
    }
  }

  void _goTo(int i) {
    final target = questions[i];
    final answered = results.containsKey(target.id);
    setState(() {
      index = i;
      selected = answered ? pickedByQuestion[target.id] : null;
      submitted = answered;
    });
    if (answered) {
      timer?.cancel();
    } else {
      _startTimer();
    }
  }

  void _next() {
    if (index == questions.length - 1) {
      timer?.cancel();
      setState(() => showResults = true);
    } else {
      _goTo(index + 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Scaffold(appBar: AppBar(title: const Text('Studying')), body: const Center(child: CircularProgressIndicator()));
    }
    if (loadError != null) {
      return Scaffold(appBar: AppBar(title: const Text('Studying')), body: Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(loadError!, textAlign: TextAlign.center))));
    }
    if (questions.isEmpty) {
      return Scaffold(appBar: AppBar(title: Text(title)), body: const Center(child: Text('No study content available yet.')));
    }
    if (showResults) return _resultsView();
    return Scaffold(
      appBar: AppBar(title: Text(title, overflow: TextOverflow.ellipsis)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          Text('Question ${index + 1} of ${questions.length}', style: const TextStyle(color: AppColors.text3)),
          const Spacer(),
          Icon(Icons.timer_outlined, size: 16, color: secondsLeft <= 10 ? AppColors.danger : AppColors.text3),
          const SizedBox(width: 4),
          Text('${secondsLeft}s', style: TextStyle(fontWeight: FontWeight.bold, color: secondsLeft <= 10 ? AppColors.danger : AppColors.navy)),
        ]),
        const SizedBox(height: 12),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(q.prompt, style: const TextStyle(fontSize: 16)))),
        const SizedBox(height: 12),
        if (q.isApplication) ..._applicationBody() else ..._objectiveBody(),
        if (submitted && (q.explanation?.isNotEmpty ?? false)) ...[
          const SizedBox(height: 12),
          Card(
            color: AppColors.royalSoft,
            child: Padding(padding: const EdgeInsets.all(16), child: Text(q.explanation!)),
          ),
        ],
        const SizedBox(height: 16),
        Row(children: [
          if (index > 0)
            Expanded(child: OutlinedButton(onPressed: () => _goTo(index - 1), child: const Text('Previous'))),
          if (index > 0) const SizedBox(width: 8),
          Expanded(
            child: submitted
                ? FilledButton(onPressed: _next, child: Text(index == questions.length - 1 ? 'Finish' : 'Next'))
                : FilledButton(onPressed: () => _submit(), child: const Text('Submit')),
          ),
        ]),
      ]),
    );
  }

  List<Widget> _objectiveBody() => [
        for (final o in q.options)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              color: _optionColor(o),
              child: ListTile(
                leading: CircleAvatar(radius: 14, child: Text(o.label, style: const TextStyle(fontSize: 12))),
                title: Text(o.body),
                selected: selected == o.id,
                onTap: submitted ? null : () => setState(() => selected = o.id),
              ),
            ),
          ),
      ];

  Color? _optionColor(_Option o) {
    if (!submitted) return selected == o.id ? AppColors.royalSoft : null;
    if (o.isCorrect) return const Color(0xFFD1FAE5);
    if (selected == o.id) return const Color(0xFFFFE4E6);
    return null;
  }

  List<Widget> _applicationBody() => [
        if (!submitted)
          const Text('Think through your answer, then submit to reveal the model answer.', style: TextStyle(color: AppColors.text3))
        else if (q.expected != null)
          Card(
            color: const Color(0xFFD1FAE5),
            child: Padding(padding: const EdgeInsets.all(16), child: Text(q.expected!)),
          ),
      ];

  Widget _resultsView() {
    final total = results.length;
    final correct = results.values.where((r) => r == 'correct' || r == 'applied').length;
    final pct = total == 0 ? 0 : (correct / total * 100).round();
    return Scaffold(
      appBar: AppBar(title: Text(title, overflow: TextOverflow.ellipsis)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.emoji_events, size: 56, color: AppColors.gold),
            const SizedBox(height: 12),
            Text('$correct / ${total == 0 ? questions.length : total}',
                style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: AppColors.navy)),
            Text('$pct%', style: const TextStyle(color: AppColors.text3)),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () async {
                await db.rpc('reset_study_progress', params: {'p_course_id': widget.courseId});
                if (!mounted) return;
                setState(() {
                  results.clear();
                  pickedByQuestion.clear();
                  showResults = false;
                  submitted = false;
                  selected = null;
                  index = 0;
                });
                _startTimer();
              },
              child: const Text('Study again'),
            ),
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back to course')),
          ]),
        ),
      ),
    );
  }
}
